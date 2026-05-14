import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS, SIZES } from '../src/constants/theme';
import { Check, ChevronDown, ChevronUp, Send } from 'lucide-react-native';
import { saveStrategy, getStrategies } from '../src/services/storage';
import { StrategyPlan, DailyHabit, MilestoneItem, WeeklyFocusItem, DayRoutine } from '../src/types/goal';
import { useAppearance } from '../src/context/appearance';
import { describeLocalAIProgress, getLastLocalAIDebugSnapshot, LocalAIDebugSnapshot, LocalAIProgress, refineAIPlan } from '../src/services/aiService';
import { buildCoinReward, getCoinsForTask } from '../src/services/coins';
import { getTimelineStageLabel, getTimelineUnitLabel } from '../src/services/planningTimeline';

import { ThemedText as Text } from '../src/components/ThemedText';

type EditableType = 'milestone' | 'habit' | 'weeklyFocus';

export default function StrategyReviewScreen() {
  const router = useRouter();
  const { strategy } = useLocalSearchParams();
  const { appearance, colors } = useAppearance();
  const highlightColor = appearance.highlightColor || (appearance.darkMode ? COLORS.white : COLORS.black);
  const isLightTone = (color: string) => {
    const value = color.replace('#', '');
    if (value.length !== 6) return false;
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return ((r * 299) + (g * 587) + (b * 114)) / 1000 >= 170;
  };
  const activeTextColor = appearance.darkMode
    ? colors.white
    : isLightTone(highlightColor)
      ? COLORS.black
      : COLORS.white;
  
  const parsedStrategy: StrategyPlan | null = strategy
    ? JSON.parse(strategy as string)
    : null;

  const [hasExistingStrategies, setHasExistingStrategies] = useState(false);

  useEffect(() => {
    const checkExisting = async () => {
      const list = await getStrategies();
      if (list && list.length > 0) {
        setHasExistingStrategies(true);
      }
    };
    checkExisting();
  }, []);

  // State initialization
  const [goal, setGoal] = useState(parsedStrategy?.goal || null);
  const [northStar, setNorthStar] = useState(parsedStrategy?.northStar || '');
  const [milestones, setMilestones] = useState<MilestoneItem[]>(parsedStrategy?.milestones || []);
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocusItem[]>(parsedStrategy?.weeklyFocus || []);
  const [dayRoutines, setDayRoutines] = useState<DayRoutine[]>(parsedStrategy?.dayRoutines || []);
  const [ifThenRules, setIfThenRules] = useState(parsedStrategy?.ifThenRules || []);
  const [recommendedTools, setRecommendedTools] = useState(parsedStrategy?.recommendedTools || []);
  
  // UI State
  const [showMilestones, setShowMilestones] = useState(true);
  const [showWeekly, setShowWeekly] = useState(false);
  const [showRules, setShowRules] = useState(true);
  const [showTools, setShowTools] = useState(true);
  const [selectedRoutineIndex, setSelectedRoutineIndex] = useState(0);
  const [expandedMilestoneIndex, setExpandedMilestoneIndex] = useState<number | null>(0);
  const [expandedWeeklyIndex, setExpandedWeeklyIndex] = useState<number | null>(0);
  
  // Refinement State
  const [showRefineModal, setShowRefineModal] = useState(false);
  const [refinementText, setRefinementText] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [refineProgress, setRefineProgress] = useState<LocalAIProgress | null>(null);
  const [refineDebug, setRefineDebug] = useState<LocalAIDebugSnapshot | null>(null);
  const refineRequestIdRef = useRef(0);
  
  const [editing, setEditing] = useState<{ type: EditableType; index: number; subIndex?: number } | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingDuration, setEditingDuration] = useState('');

  if (!parsedStrategy || !goal) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Plan unavailable.</Text>
          <Text style={styles.emptyText}>Please try generating your plan again.</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => router.replace('/vision-setup')}
          >
            <Text style={styles.retryButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const timelineUnit = goal.aiTimelineUnit || 'month';
  const timelineCount = goal.aiTimelineCount || milestones.length || 1;
  const detailUnit = timelineUnit === 'day' ? 'day' : 'week';

  const handleConfirm = async () => {
    // Construct final plan
    const finalPlan: StrategyPlan = {
      ...parsedStrategy,
      id: parsedStrategy.id || `goal_${Date.now()}`,
      goal: { ...goal, title: goal.title },
      northStar,
      milestones,
      weeklyFocus,
      dayRoutines,
      ifThenRules,
      recommendedTools,
      dailyHabits: dayRoutines[0]?.habits || [], // Fallback for old code
      createdAt: parsedStrategy.createdAt || new Date().toISOString(),
    };

    await saveStrategy(finalPlan);
    router.replace('/plan-complete');
  };

  const stopRefinement = (closeModal = false) => {
    refineRequestIdRef.current += 1;
    setIsRefining(false);
    setRefineProgress(null);
    if (closeModal) {
      setShowRefineModal(false);
    }
  };

  const handleRefine = async () => {
    const prompt = refinementText.trim();
    if (!prompt || isRefining) return;

    const requestId = refineRequestIdRef.current + 1;
    refineRequestIdRef.current = requestId;
    setIsRefining(true);
    setRefineProgress(null);
    setRefineDebug(null);

    // Construct current plan state to send to AI
    const currentPlan: Partial<StrategyPlan> = {
      ...parsedStrategy,
      northStar,
      milestones,
      weeklyFocus,
      dayRoutines,
      ifThenRules,
      recommendedTools
    };

    try {
      const updatedPlan = await refineAIPlan({
        plan: currentPlan,
        userPrompt: prompt,
        goalName: goal?.title,
        currentSituation: goal?.currentLevel,
        currentActivities: goal?.currentActivities,
        trackingMode: goal?.trackingMode,
        trackingTarget: goal?.trackingTarget,
        deadline: goal?.deadlineDate,
        difficulty: goal?.difficulty,
        preferredDays: goal?.preferredDays,
        timeBudgetMinutes: goal?.timeBudgetMinutes,
        constraints: goal?.constraints,
        stylePreference: goal?.stylePreference,
        onLocalAIProgress: (progress) => {
          if (refineRequestIdRef.current === requestId) {
            setRefineProgress(progress);
          }
        },
      });

      if (refineRequestIdRef.current !== requestId) return;

      setRefineDebug(getLastLocalAIDebugSnapshot());

      if (updatedPlan) {
        if (updatedPlan.planTitle || updatedPlan.goalEmoji || updatedPlan.continuationNote || updatedPlan.detailedWeeksThrough) {
          setGoal((prev) =>
            prev
              ? {
                  ...prev,
                  title: updatedPlan.planTitle || prev.title,
                  sticker: updatedPlan.goalEmoji || prev.sticker,
                  aiContinuationNote: updatedPlan.continuationNote || prev.aiContinuationNote,
                  aiDetailedWeeksThrough: updatedPlan.detailedWeeksThrough || prev.aiDetailedWeeksThrough,
                  aiTimelineUnit: updatedPlan.timelineUnit || prev.aiTimelineUnit,
                  aiTimelineCount: updatedPlan.timelineCount || prev.aiTimelineCount,
                }
              : prev,
          );
        }
        if (updatedPlan.northStar) setNorthStar(updatedPlan.northStar);
        if (updatedPlan.milestones) setMilestones(updatedPlan.milestones);
        if (updatedPlan.weeklyFocus) setWeeklyFocus(updatedPlan.weeklyFocus);
        if (updatedPlan.dayRoutines) setDayRoutines(updatedPlan.dayRoutines);
        if (updatedPlan.ifThenRules) setIfThenRules(updatedPlan.ifThenRules);
        if (updatedPlan.recommendedTools) setRecommendedTools(updatedPlan.recommendedTools);
        setRefinementText('');
        setShowRefineModal(false);
        setRefineProgress(null);
      } else {
        const snapshot = getLastLocalAIDebugSnapshot();
        const detail = snapshot?.possibleTruncation
          ? 'The reply looked cut off before it became valid JSON. Please try a smaller refinement, or press Stop and reword it.'
          : 'The model answered, but the app could not turn that reply into a valid plan. You can press Stop and try a clearer or narrower refinement.';
        Alert.alert('Refinement Failed', detail);
      }
    } finally {
      if (refineRequestIdRef.current === requestId) {
        setIsRefining(false);
      }
    }
  };

  const activeColor = hasExistingStrategies ? highlightColor : (appearance.darkMode ? COLORS.white : COLORS.black);
  const squareBorderColor = COLORS.black;
  const refineCopy = refineProgress
    ? describeLocalAIProgress(refineProgress, 'your refinement')
    : null;

  // Editing Handlers
  const handleEdit = (type: EditableType, index: number, subIndex?: number) => {
    setEditing({ type, index, subIndex });
    if (type === 'milestone') setEditingText(milestones[index].title);
    if (type === 'weeklyFocus') setEditingText(weeklyFocus[index].focus);
    if (type === 'habit' && typeof subIndex === 'number') {
        const habit = dayRoutines[selectedRoutineIndex].habits[subIndex];
        setEditingText(habit.title);
        setEditingDuration(String(habit.duration));
    }
  };

  const saveEdit = () => {
    if (!editing) return;
    
    if (editing.type === 'milestone') {
        const newMilestones = [...milestones];
        newMilestones[editing.index].title = editingText;
        setMilestones(newMilestones);
    } else if (editing.type === 'weeklyFocus') {
        const newWeekly = [...weeklyFocus];
        newWeekly[editing.index].focus = editingText;
        setWeeklyFocus(newWeekly);
    } else if (editing.type === 'habit' && typeof editing.subIndex === 'number') {
        const newRoutines = [...dayRoutines];
        const newHabits = [...newRoutines[selectedRoutineIndex].habits];
        const duration = Number(editingDuration) || 15;
        const coins = getCoinsForTask(duration, editingText);
        newHabits[editing.subIndex] = {
            ...newHabits[editing.subIndex],
            title: editingText,
            duration,
            coins,
            reward: buildCoinReward(coins, duration),
        };
        newRoutines[selectedRoutineIndex].habits = newHabits;
        setDayRoutines(newRoutines);
    }
    setEditing(null);
  };

  const deleteItem = (type: EditableType, index: number, subIndex?: number) => {
    if (type === 'milestone') setMilestones(prev => prev.filter((_, i) => i !== index));
    if (type === 'weeklyFocus') setWeeklyFocus(prev => prev.filter((_, i) => i !== index));
    if (type === 'habit' && typeof subIndex === 'number') {
        const newRoutines = [...dayRoutines];
        newRoutines[selectedRoutineIndex].habits = newRoutines[selectedRoutineIndex].habits.filter((_, i) => i !== subIndex);
        setDayRoutines(newRoutines);
    }
  };

  const addHabit = () => {
      const newRoutines = [...dayRoutines];
      newRoutines[selectedRoutineIndex].habits.push({
          id: `new_${Date.now()}`,
          title: 'New Habit',
          duration: 15,
          coins: 2,
          reward: buildCoinReward(2, 15),
          type: 'habit'
      });
      setDayRoutines(newRoutines);
  };

  const addMilestone = () => {
    const newMilestones = [...milestones];
    const newMonthNum = newMilestones.length + 1;
    newMilestones.push({ month: newMonthNum, title: `${getTimelineStageLabel(timelineUnit, newMonthNum)}: New Phase`, focus: 'Focus Description' });
    setMilestones(newMilestones);
  };

  const addWeeklyFocus = () => {
    const newWeekly = [...weeklyFocus];
    newWeekly.push({ week: newWeekly.length + 1, focus: 'New Weekly Focus' });
    setWeeklyFocus(newWeekly);
  };


  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.headerBlock}>
            <Text style={styles.label}>GOAL</Text>
            <TextInput
                style={[styles.mainGoalTitle, { color: activeColor }]}
                value={goal.title}
                onChangeText={(t) => setGoal({ ...goal, title: t })}
            />
            {goal.aiLabel ? (
              <Text style={[styles.cardLabel, { color: colors.textSecondary, marginTop: 6 }]}>{goal.aiLabel}</Text>
            ) : null}
        </View>

        {/* Layer 1: North Star */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: squareBorderColor }]}>
            <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>GOAL STATEMENT</Text>
            <TextInput
                style={[styles.northStarInput, { borderColor: squareBorderColor, color: colors.text }]}
                multiline
                value={northStar}
                onChangeText={setNorthStar}
            />
        </View>

        {/* Layer 2: Milestones */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: squareBorderColor }]}>
            <TouchableOpacity 
                style={styles.cardHeader} 
                onPress={() => setShowMilestones(!showMilestones)}
            >
                <Text style={[styles.cardTitle, { color: colors.text }]}>Milestones ({timelineCount} {getTimelineUnitLabel(timelineUnit, timelineCount)})</Text>
                {showMilestones ? <ChevronUp size={20} color={colors.text} /> : <ChevronDown size={20} color={colors.text} />}
            </TouchableOpacity>
            
            {showMilestones && (
                <View style={styles.cardBody}>
                    {milestones.map((item, index) => (
                        <View key={index} style={styles.itemRow}>
                            {editing?.type === 'milestone' && editing.index === index ? (
                                <View style={styles.editRow}>
                                    <TextInput 
                                        style={styles.editInput} 
                                        value={editingText} 
                                        onChangeText={setEditingText} 
                                    />
                                    <TouchableOpacity onPress={saveEdit}><Check size={20} color={colors.text} /></TouchableOpacity>
                                </View>
                            ) : (
                                <TouchableOpacity 
                                    style={styles.itemContent}
                                    onPress={() => setExpandedMilestoneIndex((prev) => (prev === index ? null : index))}
                                    onLongPress={() => Alert.alert('Options', 'Edit or Delete?', [
                                        { text: 'Cancel', style: 'cancel' },
                                        { text: 'Delete', style: 'destructive', onPress: () => deleteItem('milestone', index) },
                                        { text: 'Edit', onPress: () => handleEdit('milestone', index) }
                                    ])}
                                >
                                    <View style={{ flex: 1 }}>
                                      <Text style={[styles.itemMonth, { color: colors.text }]}>{getTimelineStageLabel(timelineUnit, item.month)}</Text>
                                      <Text style={[styles.itemText, { color: colors.text }]}>{item.title}</Text>
                                      {expandedMilestoneIndex === index ? (
                                        <Text style={[styles.itemDetailText, { color: colors.textSecondary }]}>{item.focus}</Text>
                                      ) : null}
                                    </View>
                                </TouchableOpacity>
                            )}
                        </View>
                    ))}
                    
                    <TouchableOpacity 
                        style={[styles.addHabitButton, { backgroundColor: colors.card, borderColor: squareBorderColor, marginTop: 12 }]}
                        onPress={addMilestone}
                    >
                        <Text style={[styles.addHabitText, { color: colors.text }]}>+ Add Milestone</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>

        {/* Layer 3: Weekly Focus */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: squareBorderColor }]}>
            <TouchableOpacity 
                style={styles.cardHeader} 
                onPress={() => setShowWeekly(!showWeekly)}
            >
                <Text style={[styles.cardTitle, { color: colors.text }]}>Detailed {getTimelineUnitLabel(detailUnit, weeklyFocus.length)} ({weeklyFocus.length})</Text>
                {showWeekly ? <ChevronUp size={20} color={colors.text} /> : <ChevronDown size={20} color={colors.text} />}
            </TouchableOpacity>
            
            {showWeekly && (
                <View style={styles.cardBody}>
                    <Text style={[styles.cardLabel, { color: colors.textSecondary, marginBottom: 0, textTransform: 'none' }]}>
                      {goal.aiContinuationNote ||
                        `${getTimelineUnitLabel(detailUnit, goal.aiDetailedWeeksThrough || weeklyFocus.length || 1)} 1-${goal.aiDetailedWeeksThrough || weeklyFocus.length || 1} are detailed now. You can ask AI to generate later stages as you progress.`}
                    </Text>
                    {weeklyFocus.map((item, index) => (
                        <View key={index} style={styles.itemRow}>
                            {editing?.type === 'weeklyFocus' && editing.index === index ? (
                                <View style={styles.editRow}>
                                    <TextInput 
                                        style={styles.editInput} 
                                        value={editingText} 
                                        onChangeText={setEditingText} 
                                    />
                                    <TouchableOpacity onPress={saveEdit}><Check size={20} color={colors.text} /></TouchableOpacity>
                                </View>
                            ) : (
                                <TouchableOpacity 
                                    style={styles.itemContent}
                                    onPress={() => setExpandedWeeklyIndex((prev) => (prev === index ? null : index))}
                                    onLongPress={() => Alert.alert('Options', 'Edit or Delete?', [
                                        { text: 'Cancel', style: 'cancel' },
                                        { text: 'Delete', style: 'destructive', onPress: () => deleteItem('weeklyFocus', index) },
                                        { text: 'Edit', onPress: () => handleEdit('weeklyFocus', index) }
                                    ])}
                                >
                                    <View style={{ flex: 1 }}>
                                      <Text style={[styles.itemMonth, { color: colors.text }]}>{getTimelineStageLabel(detailUnit, item.week)}</Text>
                                      <Text style={[styles.itemText, { color: colors.text }]}>{item.focus}</Text>
                                      {expandedWeeklyIndex === index ? (
                                        <View style={styles.weekDetailBlock}>
                                          {item.objective ? <Text style={[styles.itemDetailText, { color: colors.textSecondary }]}>Objective: {item.objective}</Text> : null}
                                          {item.successSignal ? <Text style={[styles.itemDetailText, { color: colors.textSecondary }]}>Done when: {item.successSignal}</Text> : null}
                                          {item.standardTasks?.length ? <Text style={[styles.itemDetailText, { color: colors.textSecondary }]}>Standard: {item.standardTasks.join(' • ')}</Text> : null}
                                        </View>
                                      ) : null}
                                    </View>
                                </TouchableOpacity>
                            )}
                        </View>
                    ))}
                    
                    <TouchableOpacity 
                        style={[styles.addHabitButton, { backgroundColor: colors.card, borderColor: squareBorderColor, marginTop: 12 }]}
                        onPress={addWeeklyFocus}
                    >
                        <Text style={[styles.addHabitText, { color: colors.text }]}>+ Add Weekly Focus</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>

        {/* Layer 4: Daily Habits (Routines) */}
        <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: activeColor }]}>Daily Habits (HOW)</Text>
        </View>

        {/* Routine Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContainer}>
            {dayRoutines.map((routine, index) => (
                <TouchableOpacity
                    key={routine.id}
                    style={[
                        styles.tab, 
                        selectedRoutineIndex === index && { backgroundColor: activeColor, borderColor: activeColor }
                    ]}
                    onPress={() => setSelectedRoutineIndex(index)}
                >
                    <Text style={[
                        styles.tabText,
                        selectedRoutineIndex === index && { color: activeTextColor }
                    ]}>
                        {routine.title}
                    </Text>
                </TouchableOpacity>
            ))}
        </ScrollView>
        
        {dayRoutines[selectedRoutineIndex]?.habits.map((habit, index) => (
            <View key={habit.id || index} style={[styles.habitCard, { backgroundColor: colors.card, borderColor: squareBorderColor }]}>
                {editing?.type === 'habit' && editing.subIndex === index ? (
                    <View style={styles.editColumn}>
                        <TextInput 
                            style={[styles.editInput, { borderBottomColor: colors.border, color: colors.text }]} 
                            value={editingText} 
                            onChangeText={setEditingText} 
                            placeholder="Habit name"
                            placeholderTextColor={colors.textSecondary}
                        />
                        <View style={styles.editRow}>
                            <TextInput 
                                style={[styles.editInput, { width: 80, borderBottomColor: colors.border, color: colors.text }]} 
                                value={editingDuration} 
                                onChangeText={setEditingDuration} 
                                placeholder="Min"
                                placeholderTextColor={colors.textSecondary}
                                keyboardType="numeric"
                            />
                            <Text style={{ color: colors.text }}>min</Text>
                            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: highlightColor }]} onPress={saveEdit}>
                                <Text style={[styles.saveBtnText, { color: activeTextColor }]}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <TouchableOpacity 
                        style={styles.habitContent}
                        onPress={() => Alert.alert('Options', 'Edit or Delete?', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: () => deleteItem('habit', selectedRoutineIndex, index) },
                            { text: 'Edit', onPress: () => handleEdit('habit', selectedRoutineIndex, index) }
                        ])}
                    >
                        <View style={{ flex: 1, marginRight: 12 }}>
                            <Text style={[styles.habitTitle, { color: colors.text }]}>{habit.title}</Text>
                            <Text style={[styles.habitDuration, { color: colors.textSecondary }]}>{habit.duration} min • {habit.type}</Text>
                            {(habit.tool || habit.cue) && <Text style={[styles.habitCue, { color: colors.textSecondary, marginTop: 4 }]}><Text style={{fontWeight: 'bold'}}>Tool:</Text> {habit.tool || habit.cue}</Text>}
                            {habit.reward && <Text style={[styles.habitCue, { color: colors.textSecondary }]}><Text style={{fontWeight: 'bold'}}>Reward:</Text> {habit.reward}</Text>}
                        </View>
                    </TouchableOpacity>
                )}
            </View>
        ))}

        <TouchableOpacity 
            style={[styles.addHabitButton, { backgroundColor: colors.card, borderColor: squareBorderColor, marginBottom: 24 }]}
            onPress={addHabit}
        >
            <Text style={[styles.addHabitText, { color: colors.text }]}>+ Add to {dayRoutines[selectedRoutineIndex]?.title}</Text>
        </TouchableOpacity>

        {/* Layer 5: If-Then Rules */}
        {ifThenRules && ifThenRules.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: squareBorderColor }]}>
                <TouchableOpacity 
                    style={styles.cardHeader} 
                    onPress={() => setShowRules(!showRules)}
                >
                    <Text style={[styles.cardTitle, { color: colors.text }]}>Pre-Planned Responses</Text>
                    {showRules ? <ChevronUp size={20} color={colors.text} /> : <ChevronDown size={20} color={colors.text} />}
                </TouchableOpacity>
                {showRules && (
                    <View style={styles.cardBody}>
                        {ifThenRules.map((rule, idx) => (
                            <View key={idx} style={[styles.itemRow, { borderBottomWidth: idx === ifThenRules.length - 1 ? 0 : 1 }]}>
                                <View style={styles.itemContent}>
                                    <Text style={[styles.itemMonth, { color: colors.text, marginBottom: 4 }]}>{rule.trigger}</Text>
                                    <Text style={[styles.itemText, { color: colors.textSecondary }]}>→ {rule.response}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}
            </View>
        )}

        {/* Layer 6: Recommended Tools */}
        {recommendedTools && recommendedTools.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: squareBorderColor, marginBottom: 120 }]}>
                <TouchableOpacity 
                    style={styles.cardHeader} 
                    onPress={() => setShowTools(!showTools)}
                >
                    <Text style={[styles.cardTitle, { color: colors.text }]}>Recommended Tools</Text>
                    {showTools ? <ChevronUp size={20} color={colors.text} /> : <ChevronDown size={20} color={colors.text} />}
                </TouchableOpacity>
                {showTools && (
                    <View style={styles.cardBody}>
                        {recommendedTools.map((tool, idx) => (
                            <View key={idx} style={[styles.itemRow, { borderBottomWidth: idx === recommendedTools.length - 1 ? 0 : 1 }]}>
                                <View style={styles.itemContent}>
                                    <Text style={[styles.itemMonth, { color: colors.text, marginBottom: 4 }]}>
                                        {tool.name} {tool.isFree ? '(Free)' : '(Paid)'}
                                    </Text>
                                    <Text style={[styles.itemText, { color: colors.textSecondary }]}>{tool.description}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}
            </View>
        )}

      </ScrollView>

      {/* Floating Action / Refinement Bar */}
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={styles.floatingContainer}
      >
        {refineCopy ? (
          <Text style={[styles.refineStatusText, { color: colors.textSecondary }]}>
            {refineCopy.subtitle}
          </Text>
        ) : null}

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.secondaryActionButton, { backgroundColor: colors.card, borderColor: squareBorderColor }]}
            onPress={() => setShowRefineModal(true)}
          >
            <Text style={[styles.secondaryActionText, { color: colors.text }]}>Revise Plan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.primaryActionButton, { backgroundColor: activeColor }]} onPress={handleConfirm}>
            <Check color={activeTextColor} size={20} />
            <Text style={[styles.primaryActionText, { color: activeTextColor }]}>Use Plan</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={showRefineModal}
        animationType="slide"
        transparent
        onRequestClose={() => (isRefining ? stopRefinement(true) : setShowRefineModal(false))}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Revise With AI</Text>
              <TouchableOpacity onPress={() => (isRefining ? stopRefinement(true) : setShowRefineModal(false))}>
                <Text style={[styles.closeText, { color: colors.textSecondary }]}>{isRefining ? 'Stop' : 'Close'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              Tell Vencer what to change. It can patch only the part you mention, like milestones, month 2 weeks, or just the routines.
            </Text>
            <TextInput
              style={[styles.modalInput, { borderColor: squareBorderColor, color: colors.text }]}
              placeholder="Example: generate month 2 weeks, or only fix the standard and light day routines"
              placeholderTextColor={colors.textSecondary}
              value={refinementText}
              onChangeText={setRefinementText}
              multiline
              maxLength={240}
            />
            {refineCopy ? (
              <Text style={[styles.modalStatusText, { color: colors.textSecondary }]}>
                {refineCopy.subtitle}
              </Text>
            ) : null}
            {isRefining ? (
              <Text style={[styles.modalStatusText, { color: colors.textSecondary }]}>
                You can edit the prompt now. Tap Stop to ignore this result and send a new refinement.
              </Text>
            ) : null}
            {refineDebug?.contextSummary ? (
              <Text style={[styles.modalStatusText, { color: colors.textSecondary }]}>
                {refineDebug.contextSummary}
              </Text>
            ) : null}
            {refineDebug?.rawOutput ? (
              <View style={[styles.debugBox, { borderColor: squareBorderColor, backgroundColor: colors.background }]}>
                <Text style={[styles.debugTitle, { color: colors.text }]}>Gemma Raw Output</Text>
                <ScrollView style={styles.debugScroll} nestedScrollEnabled>
                  <Text style={[styles.debugText, { color: colors.textSecondary }]}>{refineDebug.rawOutput}</Text>
                </ScrollView>
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalCancelButton, { borderColor: squareBorderColor }]}
                onPress={() => (isRefining ? stopRefinement(false) : setShowRefineModal(false))}
              >
                <Text style={[styles.modalCancelText, { color: colors.text }]}>{isRefining ? 'Stop' : 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSendButton, { backgroundColor: refinementText.trim() ? activeColor : colors.border }]}
                onPress={handleRefine}
                disabled={!refinementText.trim() || isRefining}
              >
                {isRefining ? (
                  <ActivityIndicator size="small" color={activeTextColor} />
                ) : (
                  <>
                    <Send color={activeTextColor} size={18} />
                    <Text style={[styles.modalSendText, { color: activeTextColor }]}>Send To AI</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>


    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SIZES.padding,
    paddingBottom: 120,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginBottom: 20,
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: COLORS.black,
    borderRadius: 8,
  },
  retryButtonText: {
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.black,
  },
  loadingSubText: {
    marginTop: 8,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  headerBlock: {
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  mainGoalTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.black,
  },
  card: {
    marginBottom: 20,
    borderWidth: 3,
    borderColor: COLORS.black,
    borderRadius: 16,
    padding: 16,
    backgroundColor: COLORS.white,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  northStarInput: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.black,
    lineHeight: 24,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.black,
  },
  cardBody: {
    marginTop: 16,
    gap: 12,
  },
  itemRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGrey,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemMonth: {
    fontWeight: '700',
    width: 80,
    fontSize: 14,
  },
  itemText: {
    flex: 1,
    fontSize: 15,
  },
  itemDetailText: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  weekDetailBlock: {
    marginTop: 6,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  editColumn: {
    gap: 10,
    width: '100%',
  },
  editInput: {
    flex: 1,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.black,
    fontSize: 16,
    paddingVertical: 4,
  },
  sectionHeader: {
    marginTop: 10,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  habitCard: {
    backgroundColor: COLORS.white,
    borderWidth: 3,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  habitContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  habitTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: 4,
  },
  habitDuration: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  saveBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  saveBtnText: {
    fontWeight: '700',
    fontSize: 12,
  },
  habitCue: {
    fontSize: 13,
    marginTop: 4,
  },
  addHabitButton: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  addHabitText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  floatingContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: SIZES.padding,
    backgroundColor: 'transparent',
  },
  actionRow: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    marginBottom: Platform.OS === 'ios' ? 20 : 0,
  },
  refineStatusText: {
    fontSize: 13,
    marginBottom: 8,
    paddingHorizontal: 6,
  },
  secondaryActionButton: {
    minHeight: 54,
    borderWidth: 2,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    width: '90%',
    alignSelf: 'center',
  },
  secondaryActionText: {
    fontSize: 16,
    fontWeight: '700',
  },
  primaryActionButton: {
    minHeight: 54,
    borderRadius: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    width: '90%',
    alignSelf: 'center',
  },
  primaryActionText: {
    fontSize: 15,
    fontWeight: '800',
  },
  tabsContainer: {
      flexDirection: 'row',
      marginBottom: 16,
      gap: 12,
  },
  tab: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: COLORS.lightGrey,
      marginRight: 8,
  },
  tabText: {
      fontWeight: '700',
      color: COLORS.black,
  },
  customizeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      borderWidth: 2,
      borderRadius: 16,
      marginTop: 24,
      gap: 8,
      borderStyle: 'solid',
  },
  customizeText: {
      fontSize: 16,
      fontWeight: '700',
  },
  modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
      padding: 24,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      minHeight: 320,
  },
  modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
  },
  modalTitle: {
      fontSize: 20,
      fontWeight: '800',
  },
  closeText: {
      fontSize: 16,
      color: COLORS.textSecondary,
      fontWeight: '600',
  },
  modalSubtitle: {
      fontSize: 14,
      marginBottom: 16,
  },
  modalInput: {
      minHeight: 120,
      borderWidth: 2,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      textAlignVertical: 'top',
  },
  modalStatusText: {
      fontSize: 13,
      marginTop: 12,
  },
  debugBox: {
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginTop: 12,
  },
  debugTitle: {
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 8,
  },
  debugScroll: {
      maxHeight: 180,
  },
  debugText: {
      fontSize: 12,
      lineHeight: 18,
  },
  modalActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 20,
  },
  modalCancelButton: {
      flex: 1,
      minHeight: 52,
      borderWidth: 2,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
  },
  modalCancelText: {
      fontSize: 15,
      fontWeight: '700',
  },
  modalSendButton: {
      flex: 1.2,
      minHeight: 52,
      borderRadius: 18,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
  },
  modalSendText: {
      fontSize: 15,
      fontWeight: '800',
  },
});
