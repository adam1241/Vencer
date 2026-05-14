import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, SIZES } from '../src/constants/theme';
import { saveStrategy } from '../src/services/storage';
import { StrategyPlan, GoalDetails, MilestoneItem, WeeklyFocusItem, DayRoutine, DailyHabit, TrackingMode } from '../src/types/goal';
import { ArrowLeft, Plus, Trash2, ChevronRight } from 'lucide-react-native';
import { useAppearance } from '../src/context/appearance';
import { ThemedText as Text } from '../src/components/ThemedText';
import DateTimePicker from '@react-native-community/datetimepicker';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  if (!('fabric' in global)) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

const TOTAL_STEPS = 12;

export default function ManualGoalScreen() {
  const router = useRouter();
  const { appearance, colors } = useAppearance();
  const highlightColor = appearance.highlightColor || (appearance.darkMode ? COLORS.white : COLORS.black);
  const textOnHighlight = (highlightColor === '#FFFFFF' || highlightColor === '#ffffff') ? COLORS.black : colors.white;

  const [step, setStep] = useState(0);

  // Step 1: Title + Emoji
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('🎯');

  // Step 2: Why
  const [why, setWhy] = useState('');

  // Step 3: Current / Target
  const [currentLevel, setCurrentLevel] = useState('');
  const [targetLevel, setTargetLevel] = useState('');

  // Step 4: Timeframe
  const [deadlineBased, setDeadlineBased] = useState(false);
  const [deadlineDate, setDeadlineDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Step 5: Time budget
  const [timeBudget, setTimeBudget] = useState(60);

  // Step 6: Tracking mode
  const [trackingMode, setTrackingMode] = useState<TrackingMode>('points');

  // Step 7: Difficulty
  const [difficulty, setDifficulty] = useState<'Easy' | 'Balanced' | 'Intense'>('Balanced');

  // Step 8: Preferred days
  const [preferredDays, setPreferredDays] = useState<'Every day' | 'Weekdays' | 'Custom'>('Every day');

  // Step 9: Constraints
  const [constraints, setConstraints] = useState('');

  // Step 10: Milestones
  const [milestones, setMilestones] = useState<MilestoneItem[]>([
    { month: 1, title: 'Month 1', focus: '' },
  ]);

  // Step 11: Weekly focus
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocusItem[]>([
    { week: 1, focus: '' },
  ]);

  // Step 12: Day Routines
  const [dayRoutines, setDayRoutines] = useState<DayRoutine[]>([
    {
      id: 'standard',
      title: 'Standard Day',
      habits: [{ id: 'h_s_1', title: '', duration: 30, type: 'habit' }],
    },
    {
      id: 'light',
      title: 'Light Day',
      habits: [{ id: 'h_l_1', title: '', duration: 15, type: 'habit' }],
    },
    {
      id: 'intense',
      title: 'Intense Day',
      habits: [{ id: 'h_i_1', title: '', duration: 60, type: 'habit' }],
    },
  ]);

  const goNext = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  };
  const goBack = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStep((s) => Math.max(s - 1, 0));
  };

  const canProceed = (): boolean => {
    switch (step) {
      case 0: return title.trim().length > 0;
      case 1: return true; // why is optional
      case 2: return true;
      case 3: return true;
      case 4: return true;
      case 5: return true;
      case 6: return true;
      case 7: return true;
      case 8: return true;
      case 9: return milestones.some(m => m.focus.trim().length > 0);
      case 10: return weeklyFocus.some(w => w.focus.trim().length > 0);
      case 11: return dayRoutines.some(r => r.habits.some(h => h.title.trim().length > 0));
      default: return true;
    }
  };

  // Milestones helpers
  const addMilestone = () => {
    const nextMonth = milestones.length > 0 ? milestones[milestones.length - 1].month + 1 : 1;
    setMilestones([...milestones, { month: nextMonth, title: `Month ${nextMonth}`, focus: '' }]);
  };
  const removeMilestone = (index: number) => {
    if (milestones.length <= 1) return;
    setMilestones(milestones.filter((_, i) => i !== index));
  };
  const updateMilestone = (index: number, focus: string) => {
    const updated = [...milestones];
    updated[index] = { ...updated[index], focus, title: `Month ${updated[index].month}: ${focus.slice(0, 30)}` };
    setMilestones(updated);
  };

  // Weekly focus helpers
  const addWeeklyFocus = () => {
    const nextWeek = weeklyFocus.length > 0 ? weeklyFocus[weeklyFocus.length - 1].week + 1 : 1;
    setWeeklyFocus([...weeklyFocus, { week: nextWeek, focus: '' }]);
  };
  const removeWeeklyFocus = (index: number) => {
    if (weeklyFocus.length <= 1) return;
    setWeeklyFocus(weeklyFocus.filter((_, i) => i !== index));
  };
  const updateWeeklyFocus = (index: number, focus: string) => {
    const updated = [...weeklyFocus];
    updated[index] = { ...updated[index], focus };
    setWeeklyFocus(updated);
  };

  // Routine helpers
  const addHabit = (routineIndex: number) => {
    const updated = [...dayRoutines];
    const r = updated[routineIndex];
    const newId = `h_${r.id}_${r.habits.length + 1}_${Date.now()}`;
    r.habits.push({ id: newId, title: '', duration: 20, type: 'habit' });
    setDayRoutines(updated);
  };
  const removeHabit = (routineIndex: number, habitIndex: number) => {
    const updated = [...dayRoutines];
    if (updated[routineIndex].habits.length <= 1) return;
    updated[routineIndex].habits = updated[routineIndex].habits.filter((_, i) => i !== habitIndex);
    setDayRoutines(updated);
  };
  const updateHabitTitle = (routineIndex: number, habitIndex: number, text: string) => {
    const updated = [...dayRoutines];
    updated[routineIndex].habits[habitIndex] = { ...updated[routineIndex].habits[habitIndex], title: text };
    setDayRoutines(updated);
  };
  const updateHabitDuration = (routineIndex: number, habitIndex: number, text: string) => {
    const updated = [...dayRoutines];
    updated[routineIndex].habits[habitIndex] = {
      ...updated[routineIndex].habits[habitIndex],
      duration: parseInt(text) || 0,
    };
    setDayRoutines(updated);
  };

  const handleSave = async () => {
    if (!title.trim()) return;

    // Filter out empty entries
    const filteredMilestones = milestones.filter(m => m.focus.trim().length > 0);
    const filteredWeekly = weeklyFocus.filter(w => w.focus.trim().length > 0);
    const filteredRoutines = dayRoutines.map(r => ({
      ...r,
      habits: r.habits.filter(h => h.title.trim().length > 0),
    })).filter(r => r.habits.length > 0);

    const goalDetails: GoalDetails = {
      title: title.trim(),
      timeframe: deadlineBased ? `By ${deadlineDate.toISOString().split('T')[0]}` : 'Flexible',
      customTimeframe: deadlineBased ? deadlineDate.toISOString().split('T')[0] : undefined,
      deadlineBased,
      deadlineDate: deadlineBased ? deadlineDate.toISOString() : undefined,
      why: why.trim() || undefined,
      currentLevel: currentLevel.trim() || undefined,
      targetLevel: targetLevel.trim() || undefined,
      sticker: icon,
      trackingMode,
      difficulty,
      preferredDays,
      constraints: constraints.trim() || undefined,
    };

    const strategy: StrategyPlan = {
      id: `goal_${Date.now()}`,
      goal: goalDetails,
      northStar: why.trim() ? `${title.trim()} — ${why.trim()}` : title.trim(),
      milestones: filteredMilestones,
      weeklyFocus: filteredWeekly,
      dayRoutines: filteredRoutines.length > 0 ? filteredRoutines : [{
        id: 'default',
        title: 'Standard Day',
        habits: [{ id: 'h_default_1', title: title.trim(), duration: timeBudget, type: 'habit' }],
      }],
      pointsPerDay: 60,
      createdAt: new Date().toISOString(),
    };

    await saveStrategy(strategy);
    router.replace('/(main)/home');
  };

  const Chip = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
    <TouchableOpacity
      style={[
        styles.chip,
        { borderColor: colors.border },
        selected && { backgroundColor: highlightColor, borderColor: highlightColor },
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.chipText,
          { color: colors.text },
          selected && { color: textOnHighlight },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <View>
            <Text style={[styles.stepTitle, { color: colors.text }]}>What's your goal?</Text>
            <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>Give it a clear name and an emoji.</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
              placeholder="e.g. Learn Japanese"
              placeholderTextColor={colors.mediumGrey}
              value={title}
              onChangeText={setTitle}
              autoFocus
            />
            <TextInput
              style={[styles.input, styles.smallInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
              placeholder="Emoji (e.g. 🎯)"
              placeholderTextColor={colors.mediumGrey}
              value={icon}
              onChangeText={setIcon}
            />
          </View>
        );

      case 1:
        return (
          <View>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Why does this matter?</Text>
            <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>Understanding your motivation helps you stay consistent.</Text>
            <TextInput
              style={[styles.input, styles.multilineInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
              placeholder="What will change if you succeed?"
              placeholderTextColor={colors.mediumGrey}
              value={why}
              onChangeText={setWhy}
              multiline
              autoFocus
            />
          </View>
        );

      case 2:
        return (
          <View>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Where are you now?</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
              placeholder="Current level (e.g. Beginner, doing nothing)"
              placeholderTextColor={colors.mediumGrey}
              value={currentLevel}
              onChangeText={setCurrentLevel}
              autoFocus
            />
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
              placeholder="Target level (e.g. Conversational, 10kg lost)"
              placeholderTextColor={colors.mediumGrey}
              value={targetLevel}
              onChangeText={setTargetLevel}
            />
          </View>
        );

      case 3:
        return (
          <View>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Do you have a deadline?</Text>
            <View style={styles.chipRow}>
              <Chip label="Yes, specific date" selected={deadlineBased} onPress={() => { setDeadlineBased(true); setShowDatePicker(true); }} />
              <Chip label="No / Flexible" selected={!deadlineBased} onPress={() => setDeadlineBased(false)} />
            </View>
            {deadlineBased && (
              <Text style={[styles.dateDisplay, { color: colors.text }]}>
                Deadline: {deadlineDate.toISOString().split('T')[0]}
              </Text>
            )}
            {showDatePicker && (
              <DateTimePicker
                value={deadlineDate}
                mode="date"
                display="default"
                onChange={(_e, date) => {
                  setShowDatePicker(false);
                  if (date) setDeadlineDate(date);
                }}
              />
            )}
          </View>
        );

      case 4:
        return (
          <View>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Daily time budget?</Text>
            <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>How much time can you realistically dedicate?</Text>
            <View style={styles.chipRow}>
              {[
                { label: '15 min', value: 15 },
                { label: '30 min', value: 30 },
                { label: '1 hour', value: 60 },
                { label: '2+ hours', value: 120 },
              ].map((opt) => (
                <Chip key={opt.label} label={opt.label} selected={timeBudget === opt.value} onPress={() => setTimeBudget(opt.value)} />
              ))}
            </View>
          </View>
        );

      case 5:
        return (
          <View>
            <Text style={[styles.stepTitle, { color: colors.text }]}>How to track progress?</Text>
            <View style={styles.chipRow}>
              <Chip label="Points / score" selected={trackingMode === 'points'} onPress={() => setTrackingMode('points')} />
              <Chip label="Minutes per day" selected={trackingMode === 'time'} onPress={() => setTrackingMode('time')} />
              <Chip label="Tasks completed" selected={trackingMode === 'tasks'} onPress={() => setTrackingMode('tasks')} />
            </View>
          </View>
        );

      case 6:
        return (
          <View>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Difficulty level?</Text>
            <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>How challenging should the plan be?</Text>
            <View style={styles.chipRow}>
              {(['Easy', 'Balanced', 'Intense'] as const).map((d) => (
                <Chip key={d} label={d} selected={difficulty === d} onPress={() => setDifficulty(d)} />
              ))}
            </View>
          </View>
        );

      case 7:
        return (
          <View>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Which days?</Text>
            <View style={styles.chipRow}>
              {(['Every day', 'Weekdays', 'Custom'] as const).map((d) => (
                <Chip key={d} label={d} selected={preferredDays === d} onPress={() => setPreferredDays(d)} />
              ))}
            </View>
          </View>
        );

      case 8:
        return (
          <View>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Any constraints?</Text>
            <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>Injuries, schedule limits, stress factors...</Text>
            <TextInput
              style={[styles.input, styles.multilineInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
              placeholder="Leave empty if none"
              placeholderTextColor={colors.mediumGrey}
              value={constraints}
              onChangeText={setConstraints}
              multiline
              autoFocus
            />
          </View>
        );

      case 9:
        return (
          <View>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Monthly Milestones</Text>
            <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>What should each month focus on?</Text>
            {milestones.map((m, i) => (
              <View key={i} style={styles.listItemRow}>
                <Text style={[styles.listItemLabel, { color: colors.textSecondary }]}>M{m.month}</Text>
                <TextInput
                  style={[styles.input, styles.flexInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                  placeholder={`Month ${m.month} focus...`}
                  placeholderTextColor={colors.mediumGrey}
                  value={m.focus}
                  onChangeText={(text) => updateMilestone(i, text)}
                />
                {milestones.length > 1 && (
                  <TouchableOpacity onPress={() => removeMilestone(i)} style={styles.removeBtn}>
                    <Trash2 size={18} color="#ff4444" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity style={[styles.addItemBtn, { borderColor: colors.border }]} onPress={addMilestone}>
              <Plus size={18} color={highlightColor} />
              <Text style={[styles.addItemText, { color: highlightColor }]}>Add Month</Text>
            </TouchableOpacity>
          </View>
        );

      case 10:
        return (
          <View>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Weekly Focus</Text>
            <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>What should each week concentrate on?</Text>
            {weeklyFocus.map((w, i) => (
              <View key={i} style={styles.listItemRow}>
                <Text style={[styles.listItemLabel, { color: colors.textSecondary }]}>W{w.week}</Text>
                <TextInput
                  style={[styles.input, styles.flexInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                  placeholder={`Week ${w.week} focus...`}
                  placeholderTextColor={colors.mediumGrey}
                  value={w.focus}
                  onChangeText={(text) => updateWeeklyFocus(i, text)}
                />
                {weeklyFocus.length > 1 && (
                  <TouchableOpacity onPress={() => removeWeeklyFocus(i)} style={styles.removeBtn}>
                    <Trash2 size={18} color="#ff4444" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity style={[styles.addItemBtn, { borderColor: colors.border }]} onPress={addWeeklyFocus}>
              <Plus size={18} color={highlightColor} />
              <Text style={[styles.addItemText, { color: highlightColor }]}>Add Week</Text>
            </TouchableOpacity>
          </View>
        );

      case 11:
        return (
          <View>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Daily Routines</Text>
            <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>Define habits for each day type.</Text>
            {dayRoutines.map((routine, ri) => (
              <View key={routine.id} style={[styles.routineCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[styles.routineCardTitle, { color: highlightColor }]}>{routine.title}</Text>
                {routine.habits.map((habit, hi) => (
                  <View key={habit.id} style={styles.habitRow}>
                    <TextInput
                      style={[styles.input, styles.habitInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                      placeholder="Habit name"
                      placeholderTextColor={colors.mediumGrey}
                      value={habit.title}
                      onChangeText={(text) => updateHabitTitle(ri, hi, text)}
                    />
                    <TextInput
                      style={[styles.input, styles.durationInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                      placeholder="min"
                      placeholderTextColor={colors.mediumGrey}
                      value={habit.duration > 0 ? String(habit.duration) : ''}
                      onChangeText={(text) => updateHabitDuration(ri, hi, text)}
                      keyboardType="numeric"
                    />
                    {routine.habits.length > 1 && (
                      <TouchableOpacity onPress={() => removeHabit(ri, hi)} style={styles.removeBtn}>
                        <Trash2 size={16} color="#ff4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <TouchableOpacity style={[styles.addHabitBtn, { borderColor: colors.border }]} onPress={() => addHabit(ri)}>
                  <Plus size={16} color={highlightColor} />
                  <Text style={[styles.addHabitText, { color: highlightColor }]}>Add Habit</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        );

      default:
        return null;
    }
  };

  const isLastStep = step === TOTAL_STEPS - 1;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={step === 0 ? () => router.back() : goBack} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.header, { color: highlightColor }]}>Manual Goal.</Text>
        </View>

        {/* Progress indicator */}
        <View style={styles.progressRow}>
          <View style={[styles.progressTrack, { backgroundColor: colors.lightGrey }]}>
            <View style={[styles.progressFill, { width: `${((step + 1) / TOTAL_STEPS) * 100}%`, backgroundColor: highlightColor }]} />
          </View>
          <Text style={[styles.stepIndicator, { color: colors.textSecondary }]}>{step + 1}/{TOTAL_STEPS}</Text>
        </View>

        {/* Content */}
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {renderStep()}
        </ScrollView>

        {/* Footer buttons */}
        <View style={[styles.footer, { borderTopColor: colors.lightGrey }]}>
          {isLastStep ? (
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: highlightColor }, !canProceed() && styles.disabledBtn]}
              onPress={handleSave}
              disabled={!canProceed()}
            >
              <Text style={[styles.primaryButtonText, { color: textOnHighlight }]}>Save Goal</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: highlightColor }, !canProceed() && styles.disabledBtn]}
              onPress={goNext}
              disabled={!canProceed()}
            >
              <View style={styles.nextRow}>
                <Text style={[styles.primaryButtonText, { color: textOnHighlight }]}>Next</Text>
                <ChevronRight size={20} color={textOnHighlight} />
              </View>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.padding,
    paddingTop: 16,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  header: {
    fontSize: 28,
    fontWeight: '800',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.padding,
    paddingVertical: 12,
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  stepIndicator: {
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    padding: SIZES.padding,
    paddingBottom: 40,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },
  stepDesc: {
    fontSize: 14,
    marginBottom: 20,
  },
  input: {
    borderWidth: 3,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  smallInput: {
    width: 120,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  flexInput: {
    flex: 1,
    marginBottom: 0,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  chip: {
    borderWidth: 3,
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  chipText: {
    fontSize: 15,
    fontWeight: '600',
  },
  dateDisplay: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  listItemLabel: {
    fontSize: 14,
    fontWeight: '700',
    width: 30,
    textAlign: 'center',
  },
  removeBtn: {
    padding: 6,
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderWidth: 2,
    borderRadius: 14,
    borderStyle: 'dashed',
    marginTop: 4,
  },
  addItemText: {
    fontSize: 14,
    fontWeight: '700',
  },
  routineCard: {
    borderWidth: 3,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  routineCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  habitInput: {
    flex: 1,
    marginBottom: 0,
  },
  durationInput: {
    width: 70,
    textAlign: 'center',
    marginBottom: 0,
  },
  addHabitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderWidth: 2,
    borderRadius: 12,
    borderStyle: 'dashed',
    marginTop: 4,
  },
  addHabitText: {
    fontSize: 13,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: SIZES.padding,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  primaryButton: {
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: 16,
  },
  disabledBtn: {
    opacity: 0.4,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
