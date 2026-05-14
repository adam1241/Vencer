import React, { useMemo, useState } from 'react';
import { View, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS, SIZES } from '../src/constants/theme';
import { StrategyPlan, GoalDetails } from '../src/types/goal';
import { useAppearance } from '../src/context/appearance';
import { ChevronLeft, Edit2, Check, X, Sparkles, Trash2 } from 'lucide-react-native';
import { saveStrategy, deleteStrategy } from '../src/services/storage';
import { ThemedText as Text } from '../src/components/ThemedText';
import { getTimelineStageLabel, getTimelineUnitLabel } from '../src/services/planningTimeline';

export default function GoalDetailsScreen() {
  const router = useRouter();
  const { goal } = useLocalSearchParams();
  const { appearance, colors } = useAppearance();
  const highlightColor = appearance.highlightColor || (appearance.darkMode ? COLORS.white : COLORS.black);
  
  const initialParsed: StrategyPlan | null = goal ? JSON.parse(goal as string) : null;
  const [strategy, setStrategy] = useState<StrategyPlan | null>(initialParsed);
  
  // Editing State
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editedGoal, setEditedGoal] = useState<GoalDetails | null>(strategy?.goal || null);
  const [expandedMilestoneIndex, setExpandedMilestoneIndex] = useState<number | null>(0);
  const [expandedWeeklyIndex, setExpandedWeeklyIndex] = useState<number | null>(0);

  const milestones = useMemo(() => {
    if (!strategy) return [];
    if (strategy.milestones?.length) return strategy.milestones;
    if (strategy.goal.milestones?.length) return strategy.goal.milestones;
    return strategy.phases?.flatMap((phase) => phase.milestones || []) || [];
  }, [strategy]);

  const weeklyFocus = useMemo(() => {
      if (!strategy) return [];
      return strategy.weeklyFocus || [];
  }, [strategy]);

  const routines = useMemo(() => {
      if (!strategy) return [];
      return strategy.dayRoutines || [];
  }, [strategy]);

  if (!strategy || !editedGoal) return null;

  const timelineUnit = editedGoal.aiTimelineUnit || 'month';
  const detailUnit = timelineUnit === 'day' ? 'day' : 'week';

  const handleSaveDetails = async () => {
      if (!editedGoal) return;
      Keyboard.dismiss();
      const updatedStrategy: StrategyPlan = {
          ...strategy,
          goal: editedGoal,
          // Ensure all required fields are preserved
          northStar: strategy.northStar || '',
          milestones: strategy.milestones || [],
          weeklyFocus: strategy.weeklyFocus || [],
          dayRoutines: strategy.dayRoutines || [],
          pointsPerDay: strategy.pointsPerDay || 60,
          createdAt: strategy.createdAt,
          id: strategy.id,
      };
      await saveStrategy(updatedStrategy);
      setStrategy(updatedStrategy);
      setIsEditingDetails(false);
      Alert.alert("Success", "Goal details updated.");
  };

  const handlePolishWithAI = () => {
      router.push({
          pathname: '/strategy-review',
          params: { strategy: JSON.stringify(strategy) }
      });
  };

  const handleDeleteGoal = () => {
      Alert.alert(
          "Delete Goal?",
          "Consistency is key! Don't give up now. Are you sure you want to delete this goal?",
          [
              { text: "Keep Going", style: "cancel" },
              { 
                  text: "Delete", 
                  style: "destructive", 
                  onPress: async () => {
                      if (strategy?.id) {
                          await deleteStrategy(strategy.id);
                          router.replace('/(main)/goals');
                      }
                  }
              },
              {
                  text: "Polish",
                  onPress: handlePolishWithAI
              }
          ]
      );
  };

  const DetailItem = ({ label, value, field, isLast = false }: { label: string, value?: string, field: keyof GoalDetails, isLast?: boolean }) => {
      if (!value && !isEditingDetails) return null;
      
      return (
          <View style={[styles.detailRow, { borderBottomColor: colors.lightGrey }]}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{label}</Text>
              {isEditingDetails ? (
                  <TextInput
                      style={[styles.detailInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                      value={String(editedGoal?.[field] || '')}
                      onChangeText={(text) => setEditedGoal(prev => prev ? ({ ...prev, [field]: text }) : null)}
                      multiline
                      returnKeyType={isLast ? "done" : "next"}
                      blurOnSubmit={isLast}
                      onSubmitEditing={isLast ? handleSaveDetails : undefined}
                      autoCapitalize="sentences"
                  />
              ) : (
                  <Text style={[styles.detailValue, { color: colors.text }]}>{value || '-'}</Text>
              )}
          </View>
      );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
      <View style={[styles.navHeader, { backgroundColor: colors.background }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Goal Details</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity 
                onPress={() => {
                    if (isEditingDetails) {
                        handleSaveDetails();
                    } else {
                        setIsEditingDetails(true);
                    }
                }} 
                style={styles.iconBtn}
            >
                {isEditingDetails ? <Check size={24} color={highlightColor} /> : <Edit2 size={20} color={colors.text} />}
            </TouchableOpacity>
            {isEditingDetails && (
                <TouchableOpacity onPress={handleDeleteGoal} style={styles.iconBtn}>
                    <Trash2 size={20} color="#ff4444" />
                </TouchableOpacity>
            )}
          </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.titleBlock}>
            <Text style={styles.emoji}>{strategy.goal.sticker || '🎯'}</Text>
            <Text style={[styles.title, { color: colors.text }]}>{strategy.goal.title}</Text>
        </View>

        {/* 4-Layer Strategy Display */}
        
        {/* Layer 1: North Star */}
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>NORTH STAR (WHY)</Text>
            <Text style={[styles.northStarText, { color: colors.text }]}>{strategy.northStar || "No North Star defined."}</Text>
        </View>

        {/* Layer 2: Milestones */}
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>MILESTONES</Text>
            {milestones.length > 0 ? (
                milestones.map((item, index) => (
                    <TouchableOpacity key={index} style={[styles.itemRow, { borderBottomColor: colors.lightGrey }]} onPress={() => setExpandedMilestoneIndex((prev) => (prev === index ? null : index))}>
                        <Text style={[styles.itemMonth, { color: colors.text }]}>
                            {typeof item === 'string' ? `Phase ${index + 1}` : getTimelineStageLabel(timelineUnit, item.month)}
                        </Text>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.itemText, { color: colors.text }]}>
                                {typeof item === 'string' ? item : item.title}
                            </Text>
                            {typeof item !== 'string' && expandedMilestoneIndex === index ? (
                                <Text style={[styles.detailHint, { color: colors.textSecondary }]}>{item.focus}</Text>
                            ) : null}
                        </View>
                    </TouchableOpacity>
                ))
            ) : (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No milestones defined.</Text>
            )}
        </View>

        {/* Layer 3: Weekly Focus */}
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>{`DETAILED ${getTimelineUnitLabel(detailUnit, weeklyFocus.length).toUpperCase()}`}</Text>
            {editedGoal.aiContinuationNote ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary, marginBottom: 12 }]}>
                    {editedGoal.aiContinuationNote}
                </Text>
            ) : null}
            {weeklyFocus.length > 0 ? (
                weeklyFocus.map((item, index) => (
                    <TouchableOpacity key={index} style={[styles.itemRow, { borderBottomColor: colors.lightGrey }]} onPress={() => setExpandedWeeklyIndex((prev) => (prev === index ? null : index))}>
                        <Text style={[styles.itemMonth, { color: colors.text }]}>{getTimelineStageLabel(detailUnit, item.week)}</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.itemText, { color: colors.text }]}>{item.focus}</Text>
                            {expandedWeeklyIndex === index ? (
                                <View>
                                    {item.objective ? <Text style={[styles.detailHint, { color: colors.textSecondary }]}>Objective: {item.objective}</Text> : null}
                                    {item.successSignal ? <Text style={[styles.detailHint, { color: colors.textSecondary }]}>Done when: {item.successSignal}</Text> : null}
                                </View>
                            ) : null}
                        </View>
                    </TouchableOpacity>
                ))
            ) : (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No weekly focus defined.</Text>
            )}
        </View>

        {/* Layer 4: Daily Habits */}
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>DAILY ROUTINES</Text>
            {routines.length > 0 ? (
                routines.map((routine, i) => (
                    <View key={i} style={styles.routineBlock}>
                        <Text style={[styles.routineTitle, { color: highlightColor }]}>{routine.title}</Text>
                        {routine.habits.map((h, j) => (
                            <Text key={j} style={[styles.habitText, { color: colors.text }]}>• {h.title} ({h.duration}m)</Text>
                        ))}
                    </View>
                ))
            ) : (
                // Fallback for old strategies
                strategy.dailyRoutine ? (
                    strategy.dailyRoutine.map((item, index) => (
                        <Text key={index} style={styles.habitText}>• {item}</Text>
                    ))
                ) : (
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No daily habits defined.</Text>
                )
            )}
        </View>

        {/* Editable Goal Details (Onboarding Answers) */}
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={styles.cardHeader}>
                <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>GOAL CONTEXT</Text>
                {isEditingDetails && (
                    <TouchableOpacity onPress={() => setIsEditingDetails(false)}>
                        <X size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                )}
            </View>
            
            <DetailItem label="Why is this important?" value={strategy.goal.why} field="why" />
            <DetailItem label="Current Situation" value={strategy.goal.currentLevel} field="currentLevel" />
            <DetailItem label="Target Level" value={strategy.goal.targetLevel} field="targetLevel" />
            <DetailItem label="Deadline" value={strategy.goal.deadlineBased && strategy.goal.deadlineDate ? strategy.goal.deadlineDate : 'No Deadline'} field="deadlineDate" />
            <DetailItem label="Time Commitment" value={strategy.goal.constraints} field="constraints" />
            <DetailItem label="Preferred Days" value={strategy.goal.preferredDays} field="preferredDays" />
            <DetailItem label="Difficulty" value={strategy.goal.difficulty} field="difficulty" />
            <DetailItem label="Tracking Mode" value={strategy.goal.trackingMode} field="trackingMode" isLast={true} />
        </View>

        {/* Polish Button */}
        <TouchableOpacity 
            style={[styles.polishBtn, { borderColor: highlightColor, backgroundColor: colors.card }]} 
            onPress={handlePolishWithAI}
        >
            <Sparkles size={20} color={highlightColor} />
            <Text style={[styles.polishBtnText, { color: highlightColor }]}>Polish</Text>
        </TouchableOpacity>

      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  navHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SIZES.padding,
      paddingVertical: 16,
      backgroundColor: COLORS.background,
  },
  backBtn: {
      padding: 8,
  },
  headerTitle: {
      fontSize: 18,
      fontWeight: '700',
  },
  headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
  },
  iconBtn: {
      padding: 8,
  },
  editBtn: {
      padding: 8,
  },
  content: {
    padding: SIZES.padding,
    paddingBottom: 40,
  },
  titleBlock: {
      alignItems: 'center',
      marginBottom: 24,
  },
  emoji: {
      fontSize: 48,
      marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.black,
    textAlign: 'center',
  },
  card: {
    backgroundColor: COLORS.white,
    borderWidth: 3,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  northStarText: {
      fontSize: 18,
      fontWeight: '600',
      color: COLORS.black,
      lineHeight: 26,
  },
  itemRow: {
    flexDirection: 'row',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGrey,
  },
  itemMonth: {
      width: 80,
      fontWeight: '700',
      fontSize: 14,
  },
  itemText: {
      flex: 1,
      fontSize: 15,
      color: COLORS.black,
  },
  detailHint: {
      fontSize: 13,
      lineHeight: 18,
      marginTop: 6,
  },
  emptyText: {
      fontStyle: 'italic',
      color: COLORS.textSecondary,
  },
  routineBlock: {
      marginBottom: 16,
  },
  routineTitle: {
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 6,
  },
  habitText: {
      fontSize: 15,
      marginBottom: 4,
      marginLeft: 8,
  },
  detailRow: {
      marginBottom: 16,
  },
  detailLabel: {
      fontSize: 12,
      color: COLORS.textSecondary,
      marginBottom: 4,
      fontWeight: '600',
  },
  detailValue: {
      fontSize: 16,
      color: COLORS.black,
      fontWeight: '500',
  },
  detailInput: {
      fontSize: 16,
      color: COLORS.black,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.black,
      paddingVertical: 4,
  },
  polishBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      borderWidth: 2,
      borderRadius: 16,
      gap: 8,
      marginBottom: 20,
  },
  polishBtnText: {
      fontSize: 16,
      fontWeight: '700',
  },
});
