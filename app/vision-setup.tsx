import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
  UIManager,
  Alert,
  ActivityIndicator
} from 'react-native';
import { ThemedText as Text } from '../src/components/ThemedText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS, SIZES } from '../src/constants/theme';
import { buildStrategyFromAnswers, GoalAnswers, inferGoalSticker } from '../src/services/goalBuilder';
import { DEFAULT_ASSUMED_TIME_BUDGET_MINUTES, describeLocalAIAttribution, describeLocalAIFallbackReason, describeLocalAIProgress, generateAIPlan, getLastLocalAIDebugSnapshot, getLocalAIStatus, LocalAIProgress, recordLocalAIAttempt } from '../src/services/aiService';
import { getRoutineTargetCoins } from '../src/services/coins';
import { getUserConstraints } from '../src/services/userConstraints';
import { GoalDetails, TrackingMode, UserConstraints, OnboardingProfile } from '../src/types/goal';
import { useAppearance } from '../src/context/appearance';
import { ArrowLeft, Plus, X } from 'lucide-react-native';

const trackingLabel: Record<string, string> = {
  points: 'Points / score',
  time: 'Minutes per day',
  tasks: 'Tasks completed',
};

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function VisionSetupScreen() {
  const router = useRouter();
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
      : colors.white;
  const highlightTitleStyle = !appearance.darkMode && isLightTone(highlightColor)
    ? {
        textShadowColor: 'rgba(0,0,0,0.35)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 1.2,
      }
    : null;
  const scrollRef = useRef<ScrollView | null>(null);
  const messageIdRef = useRef(1);

  const [currentStep, setCurrentStep] = useState(0);
  const [messages, setMessages] = useState([
    { id: 'q1', role: 'assistant', text: 'What do you want to achieve?' },
  ]);
  const [customInput, setCustomInput] = useState('');
  
  // Data State (matches onboarding exactly)
  const [goalTitle, setGoalTitle] = useState('');
  const [motivation, setMotivation] = useState('');
  const [currentSituation, setCurrentSituation] = useState('');
  const [currentActivities, setCurrentActivities] = useState('');
  const [trackingMode, setTrackingMode] = useState<TrackingMode>('points');
  const [trackingTarget, setTrackingTarget] = useState('10');
  const [deadlineBased, setDeadlineBased] = useState(false);
  const [deadlineDate, setDeadlineDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [notificationPref, setNotificationPref] = useState<OnboardingProfile['notificationPreference'] | ''>('');
  const [difficulty, setDifficulty] = useState<OnboardingProfile['difficulty'] | ''>('');
  const [preferredDays, setPreferredDays] = useState<OnboardingProfile['preferredDays'] | ''>('');
  const [constraints, setConstraintsStr] = useState('');
  
  // Custom input states
  const [specificTimes, setSpecificTimes] = useState<string[]>([]);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempTime, setTempTime] = useState(new Date());
  const [customDays, setCustomDays] = useState<string[]>([]);

  const [userConstraints, setUserConstraints] = useState<UserConstraints | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [localAIProgress, setLocalAIProgress] = useState<LocalAIProgress | null>(null);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
        if (!('fabric' in global)) {
            UIManager.setLayoutAnimationEnabledExperimental(true);
        }
    }
    const loadConstraints = async () => {
        const saved = await getUserConstraints();
        setUserConstraints(saved);
    };
    loadConstraints();
  }, []);

  useEffect(() => {
    setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  const nextMessageId = (prefix: 'a' | 'u') => `${prefix}-${Date.now()}-${messageIdRef.current++}`;

  const pushAssistant = (text: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMessages((prev) => [...prev, { id: nextMessageId('a'), role: 'assistant', text }]);
  };

  const pushUser = (text: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMessages((prev) => [...prev, { id: nextMessageId('u'), role: 'user', text }]);
  };

  const goToNextStep = (nextQuestion?: string) => {
    if (nextQuestion) {
      pushAssistant(nextQuestion);
    }
    setCurrentStep((prev) => prev + 1);
  };

  const handleBack = () => {
    if (currentStep > 0) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setMessages((prev) => {
            const newMsgs = [...prev];
            if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].role === 'assistant') {
                newMsgs.pop();
            }
            if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].role === 'user') {
                newMsgs.pop();
            }
            return newMsgs;
        });
        setCurrentStep((prev) => prev - 1);
    } else {
        router.back();
    }
  };

  // ── Step handlers (identical to onboarding flow) ──

  // 1. Goal
  const handleGoalSubmit = () => {
    const value = customInput.trim();
    if (!value) return;
    setGoalTitle(value);
    pushUser(value);
    setCustomInput('');
    goToNextStep('Why is this goal important to you?');
  };

  // 2. Motivation
  const handleMotivationSubmit = () => {
    const value = customInput.trim();
    if (!value) return;
    setMotivation(value);
    pushUser(value);
    setCustomInput('');
    goToNextStep('What is your current level?');
  };

  // 3. Current Situation
  const handleCurrentSituationSubmit = () => {
    const value = customInput.trim();
    if (!value) return;
    setCurrentSituation(value);
    pushUser(value);
    setCustomInput('');
    goToNextStep('What are you currently doing or working on for this goal? (tasks, tools, routines \u2014 anything you already do)');
  };

  // 4. Current Activities
  const handleCurrentActivitiesSubmit = () => {
    const value = customInput.trim();
    const displayValue = value || 'Nothing yet';
    setCurrentActivities(value);
    pushUser(displayValue);
    setCustomInput('');
    setTrackingMode('points');
    setTrackingTarget('10');
    goToNextStep('Do you have a target date to achieve this goal?');
  };

  // 5. Tracking Preference (3 options only: points, time, tasks)
  const handleTrackingSelect = (value: TrackingMode) => {
    setTrackingMode(value);
    pushUser(trackingLabel[value]);

    let unit = 'points';
    if (value === 'time') unit = 'minutes';
    if (value === 'tasks') unit = 'tasks';

    goToNextStep(`What's the minimum daily target (${unit}) you want to commit to?`);
  };

  // 6. Daily Target
  const handleTrackingTargetSubmit = () => {
    const value = Number(trackingTarget);
    if (!value || Number.isNaN(value)) return;
    pushUser(`${value}`);
    goToNextStep('Do you have a target date to achieve this goal?');
  };

  // 7. Deadline
  const handleDueSelect = (value: boolean) => {
    setDeadlineBased(value);
    pushUser(value ? 'Yes' : 'No / Flexible');
    if (value) {
      setShowDatePicker(true);
    } else {
      goToNextStep('How would you like reminders?');
    }
  };

  const handleDateChange = (_event: unknown, selected?: Date) => {
    const nextDate = selected || deadlineDate;
    if (selected) {
      setDeadlineDate(selected);
    }
    setShowDatePicker(false);
    pushUser(nextDate.toISOString().split('T')[0]);
    goToNextStep('How would you like reminders?');
  };

  // 8. Notifications
  const handleNotificationSelect = (value: OnboardingProfile['notificationPreference']) => {
    setNotificationPref(value);
    if (value !== 'Specific times') {
        pushUser(value);
        goToNextStep('How challenging should the plan be?');
    }
  };

  const handleTimePickerChange = (_event: unknown, selected?: Date) => {
    const time = selected || tempTime;
    setShowTimePicker(false);
    if (selected) {
        const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (!specificTimes.includes(timeStr)) {
            setSpecificTimes([...specificTimes, timeStr]);
        }
    }
  };

  const handleSpecificTimesSubmit = () => {
    const label = specificTimes.length > 0 ? specificTimes.join(', ') : 'No specific times';
    pushUser(label);
    goToNextStep('How challenging should the plan be?');
  };

  // 9. Difficulty
  const handleDifficultySelect = (value: OnboardingProfile['difficulty']) => {
    setDifficulty(value);
    pushUser(value);
    goToNextStep('Which days do you want to work on this?');
  };

  // 10. Preferred Days
  const handlePreferredDaysSelect = (value: OnboardingProfile['preferredDays']) => {
    setPreferredDays(value);
    if (value !== 'Custom') {
        pushUser(value);
        goToNextStep('Anything that might limit you?');
    }
  };

  const toggleCustomDay = (day: string) => {
    if (customDays.includes(day)) {
        setCustomDays(customDays.filter(d => d !== day));
    } else {
        setCustomDays([...customDays, day]);
    }
  };

  const handleCustomDaysSubmit = () => {
    const label = customDays.length > 0 ? customDays.join(', ') : 'No specific days';
    pushUser(label);
    goToNextStep('Anything that might limit you?');
  };

  // 11. Constraints (final step — tries AI first, falls back to deterministic)
  const handleConstraintsSubmit = async () => {
    const value = customInput.trim();
    const displayValue = value || "No specific limits.";
    setConstraintsStr(value);
    pushUser(displayValue);
    setCustomInput('');

    const inferredTimeBudget = DEFAULT_ASSUMED_TIME_BUDGET_MINUTES;
    const defaultCoinTarget = Number(trackingTarget) || 10;
    const today = new Date().toISOString().slice(0, 10);
    const deadlineStr = deadlineBased ? deadlineDate.toISOString().split('T')[0] : null;

    // Show loading screen
    setIsLoading(true);
    setLocalAIProgress(null);

    // Deterministic answers (used for both AI fallback and base strategy)
    const answers: GoalAnswers = {
      goalName: goalTitle,
      identityStatement: motivation || `I am becoming someone who ${goalTitle}`,
      goalType: 'habit',
      coreAction: goalTitle,
      frequency: preferredDays === 'Every day' ? 'daily' : preferredDays === 'Weekdays' ? '5x' : '3x',
      startDate: today,
      deadline: deadlineStr,
      successMetric: 'points',
      successTarget: defaultCoinTarget,
      minimumViableSession: `${Math.round(inferredTimeBudget * 0.3)} min minimum`,
      mvsDurationMinutes: Math.round(inferredTimeBudget * 0.3),
      sticker: inferGoalSticker(goalTitle),
    };

    // Start with deterministic base
    let strategy = buildStrategyFromAnswers(answers);
    let aiDebugSummary: string | null = null;

    // Try AI enhancement
    try {
      const aiPlan = await generateAIPlan({
        goalName: goalTitle,
        motivation,
        currentSituation,
        currentActivities,
        timeBudgetMinutes: inferredTimeBudget,
        trackingMode: 'points',
        trackingTarget: defaultCoinTarget,
        deadline: deadlineStr,
        difficulty: difficulty || 'Balanced',
        preferredDays: preferredDays || undefined,
        customDays: preferredDays === 'Custom' ? customDays : undefined,
        notificationPreference: notificationPref || 'No reminders',
        specificTimes: notificationPref === 'Specific times' ? specificTimes : undefined,
        constraints: value,
        stylePreference: 'Flexible & adaptive',
        onLocalAIProgress: setLocalAIProgress,
      });
      const status = await getLocalAIStatus();
      const snapshot = getLastLocalAIDebugSnapshot();

      if (aiPlan && aiPlan.milestones && aiPlan.dayRoutines) {
        const aiLabel = describeLocalAIAttribution(status);
        aiDebugSummary = [`Source: ${aiLabel}`, snapshot?.contextSummary].filter(Boolean).join(' | ');
        // Merge AI plan into the deterministic base (cast habit types for TS compatibility)
        const typedRoutines = aiPlan.dayRoutines.map(r => ({
          ...r,
          habits: r.habits.map(h => ({ ...h, type: (h.type === 'task' ? 'task' : 'habit') as 'habit' | 'task' })),
        }));
        const standardRoutine = typedRoutines.find(r => r.id === 'standard') || typedRoutines[0];
        const standardCoins = getRoutineTargetCoins(standardRoutine?.habits || []) || defaultCoinTarget;
        strategy = {
          ...strategy,
          goal: {
            ...strategy.goal,
            title: aiPlan.planTitle || strategy.goal.title,
            sticker: aiPlan.goalEmoji || strategy.goal.sticker,
            aiLabel,
            aiDebugSummary,
            aiContinuationNote: aiPlan.continuationNote || strategy.goal.aiContinuationNote,
            aiDetailedWeeksThrough: aiPlan.detailedWeeksThrough || strategy.goal.aiDetailedWeeksThrough,
            aiTimelineUnit: aiPlan.timelineUnit || strategy.goal.aiTimelineUnit,
            aiTimelineCount: aiPlan.timelineCount || strategy.goal.aiTimelineCount,
            currentLevel: currentSituation || strategy.goal.currentLevel,
            currentActivities,
            trackingMode: 'points',
            trackingTarget: standardCoins,
            difficulty: difficulty || strategy.goal.difficulty,
            preferredDays: preferredDays || strategy.goal.preferredDays,
            customDays: preferredDays === 'Custom' ? customDays : undefined,
            constraints: value,
            timeBudgetMinutes: inferredTimeBudget,
            notificationTimes: notificationPref === 'Specific times' ? specificTimes : undefined,
          },
          northStar: aiPlan.northStar || strategy.northStar,
          milestones: aiPlan.milestones,
          weeklyFocus: aiPlan.weeklyFocus || strategy.weeklyFocus,
          dayRoutines: typedRoutines,
          ifThenRules: aiPlan.ifThenRules || strategy.ifThenRules,
          recommendedTools: aiPlan.recommendedTools || strategy.recommendedTools,
          pointsPerDay: standardCoins,
        };
        await recordLocalAIAttempt({
          id: `plan_${Date.now()}`,
          timestamp: new Date().toISOString(),
          surface: 'vision_setup',
          mode: 'plan',
          outcome: 'ai',
          reason: 'AI plan applied successfully.',
          backend: status?.backend || 'none',
          state: status?.state || 'unknown',
          lastError: status?.lastError || null,
          parsed: snapshot?.parsed ?? true,
          contextSummary: snapshot?.contextSummary,
        });
      } else {
        aiDebugSummary = describeLocalAIFallbackReason({ status, snapshot });
        await recordLocalAIAttempt({
          id: `plan_${Date.now()}`,
          timestamp: new Date().toISOString(),
          surface: 'vision_setup',
          mode: 'plan',
          outcome: 'deterministic',
          reason: aiDebugSummary,
          backend: status?.backend || 'none',
          state: status?.state || 'unknown',
          lastError: status?.lastError || null,
          parsed: snapshot?.parsed ?? false,
          contextSummary: snapshot?.contextSummary,
        });
      }
    } catch (e) {
      const status = await getLocalAIStatus();
      const snapshot = getLastLocalAIDebugSnapshot();
      aiDebugSummary = describeLocalAIFallbackReason({ status, snapshot, error: e });
      await recordLocalAIAttempt({
        id: `plan_${Date.now()}`,
        timestamp: new Date().toISOString(),
        surface: 'vision_setup',
        mode: 'plan',
        outcome: 'deterministic',
        reason: aiDebugSummary,
        backend: status?.backend || 'none',
        state: status?.state || 'unknown',
        lastError: status?.lastError || null,
        parsed: snapshot?.parsed ?? false,
        contextSummary: snapshot?.contextSummary,
      });
      console.log('AI plan generation failed, using deterministic plan:', e);
    }

    if (!strategy.goal.aiLabel) {
      const standardCoins = getRoutineTargetCoins(strategy.dayRoutines?.[0]?.habits || []) || defaultCoinTarget;
      strategy = {
        ...strategy,
        goal: {
          ...strategy.goal,
          aiLabel: 'Deterministic plan',
          aiDebugSummary: aiDebugSummary || 'The app kept the deterministic fallback because it did not receive a usable AI plan.',
          trackingMode: 'points',
          trackingTarget: standardCoins,
        },
        pointsPerDay: standardCoins,
      };
    }

    setIsLoading(false);
    router.push({
      pathname: '/strategy-review',
      params: { strategy: JSON.stringify(strategy) },
    });
  };



  if (isLoading) {
    const loadingCopy = describeLocalAIProgress(localAIProgress || {
      state: 'generating',
      ready: false,
      backend: 'none',
      modelPath: '',
      downloaded: false,
      downloadedBytes: 0,
      totalBytes: 0,
      progress: null,
      lastError: null,
    }, 'your plan');

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={highlightColor} />
          <Text style={[styles.loadingText, { color: colors.text }]}>{loadingCopy.title}</Text>
          <Text style={[styles.loadingSubtext, { color: colors.textSecondary }]}>{loadingCopy.subtitle}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.headerBackBtn} 
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <View>
            <Text style={[styles.headerTitle, { color: highlightColor }, highlightTitleStyle]}>New Goal.</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Let's build your next achievement.</Text>
          </View>
        </View>

        <ScrollView 
            ref={scrollRef} 
            contentContainerStyle={styles.chatContainer}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
        >
          {messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.messageBubble,
                message.role === 'user' 
                  ? [styles.userBubble, { backgroundColor: highlightColor }]
                  : [styles.assistantBubble, { backgroundColor: colors.card, borderColor: colors.border }],
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  message.role === 'user' 
                    ? [styles.userText, { color: activeTextColor }]
                    : [styles.assistantText, { color: colors.text }],
                ]}
              >
                {message.text}
              </Text>
            </View>
          ))}
        </ScrollView>

        <View style={[styles.responseArea, { backgroundColor: colors.background, borderTopColor: colors.lightGrey }]}>
          {currentStep > 0 && (
            <TouchableOpacity style={[styles.backButton, { backgroundColor: colors.card }]} onPress={handleBack}>
                <ArrowLeft size={20} color={colors.mediumGrey} />
                <Text style={[styles.backButtonText, { color: colors.text }]}>Back</Text>
            </TouchableOpacity>
          )}

          {/* Step 0: Goal */}
          {currentStep === 0 ? (
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.textInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                placeholder="E.g. Learn Japanese, Lose 5kg..."
                placeholderTextColor={colors.mediumGrey}
                value={customInput}
                onChangeText={setCustomInput}
              />
              <TouchableOpacity style={[styles.outlineButton, { borderColor: colors.border }]} onPress={handleGoalSubmit}>
                <Text style={[styles.outlineButtonText, { color: colors.text }]}>Send</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Step 1: Motivation */}
          {currentStep === 1 ? (
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.textInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                placeholder="What will change if you succeed?"
                placeholderTextColor={colors.mediumGrey}
                value={customInput}
                onChangeText={setCustomInput}
              />
              <TouchableOpacity style={[styles.outlineButton, { borderColor: colors.border }]} onPress={handleMotivationSubmit}>
                <Text style={[styles.outlineButtonText, { color: colors.text }]}>Send</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Step 2: Current Situation */}
          {currentStep === 2 ? (
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.textInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                placeholder="Beginner, intermediate, doing nothing..."
                placeholderTextColor={colors.mediumGrey}
                value={customInput}
                onChangeText={setCustomInput}
              />
              <TouchableOpacity style={[styles.outlineButton, { borderColor: colors.border }]} onPress={handleCurrentSituationSubmit}>
                <Text style={[styles.outlineButtonText, { color: colors.text }]}>Send</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Step 3: Current Activities */}
          {currentStep === 3 ? (
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.textInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                placeholder="E.g. Using Duolingo daily, running 3x/week..."
                placeholderTextColor={colors.mediumGrey}
                value={customInput}
                onChangeText={setCustomInput}
              />
              <TouchableOpacity style={[styles.outlineButton, { borderColor: colors.border }]} onPress={handleCurrentActivitiesSubmit}>
                <Text style={[styles.outlineButtonText, { color: colors.text }]}>{customInput.trim() ? 'Send' : 'None'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Step 4: Deadline */}
          {currentStep === 4 ? (
            <View style={styles.chipRow}>
              {[true, false].map((item) => (
                <TouchableOpacity
                  key={String(item)}
                  style={[styles.chip, { borderColor: colors.border }]}
                  onPress={() => handleDueSelect(item)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, { color: colors.text }]}>{item ? 'Yes' : 'No / Flexible'}</Text>
                </TouchableOpacity>
              ))}
              {deadlineBased && showDatePicker ? (
                <DateTimePicker
                  value={deadlineDate}
                  mode="date"
                  display="default"
                  onChange={handleDateChange}
                />
              ) : null}
            </View>
          ) : null}

          {/* Step 5: Notifications */}
          {currentStep === 5 ? (
            <View>
                {notificationPref !== 'Specific times' ? (
                    <View style={styles.chipRow}>
                    {(['Daily', 'Specific times', 'Per task', 'No reminders'] as const).map(
                        (item) => (
                        <TouchableOpacity
                            key={item}
                            style={[styles.chip, { borderColor: colors.border }]}
                            onPress={() => handleNotificationSelect(item)}
                            activeOpacity={0.8}
                        >
                            <Text style={[styles.chipText, { color: colors.text }]}>{item}</Text>
                        </TouchableOpacity>
                        )
                    )}
                    </View>
                ) : (
                    <View>
                        <Text style={[styles.sectionLabel, { color: colors.text }]}>Select Times:</Text>
                        <View style={styles.chipRow}>
                            {specificTimes.map((time) => (
                                <View key={time} style={[styles.chipSelected, { backgroundColor: highlightColor }]}>
                                    <Text style={[styles.chipTextSelected, { color: colors.white }]}>{time}</Text>
                                    <TouchableOpacity onPress={() => setSpecificTimes(prev => prev.filter(t => t !== time))}>
                                        <X size={14} color={colors.white} />
                                    </TouchableOpacity>
                                </View>
                            ))}
                            <TouchableOpacity style={[styles.chip, { borderColor: colors.border }]} onPress={() => setShowTimePicker(true)}>
                                <Plus size={20} color={colors.text} />
                            </TouchableOpacity>
                        </View>
                        {showTimePicker && (
                            <DateTimePicker
                                value={tempTime}
                                mode="time"
                                display="default"
                                onChange={handleTimePickerChange}
                            />
                        )}
                        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: highlightColor }]} onPress={handleSpecificTimesSubmit}>
                            <Text style={[styles.primaryButtonText, { color: colors.white }]}>Done</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
          ) : null}

          {/* Step 6: Difficulty */}
          {currentStep === 6 ? (
            <View style={styles.chipRow}>
              {(['Easy', 'Balanced', 'Intense'] as const).map(
                (item) => (
                  <TouchableOpacity
                    key={item}
                    style={[styles.chip, { borderColor: colors.border }]}
                    onPress={() => handleDifficultySelect(item)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, { color: colors.text }]}>{item}</Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          ) : null}

          {/* Step 7: Preferred Days */}
          {currentStep === 7 ? (
            <View>
                {preferredDays !== 'Custom' ? (
                    <View style={styles.chipRow}>
                    {(['Every day', 'Weekdays', 'Custom'] as const).map(
                        (item) => (
                        <TouchableOpacity
                            key={item}
                            style={[styles.chip, { borderColor: colors.border }]}
                            onPress={() => handlePreferredDaysSelect(item)}
                            activeOpacity={0.8}
                        >
                            <Text style={[styles.chipText, { color: colors.text }]}>{item}</Text>
                        </TouchableOpacity>
                        )
                    )}
                    </View>
                ) : (
                    <View>
                        <Text style={[styles.sectionLabel, { color: colors.text }]}>Select Days:</Text>
                        <View style={styles.dayRow}>
                            {DAYS_OF_WEEK.map((day) => {
                                const isSelected = customDays.includes(day);
                                return (
                                    <TouchableOpacity 
                                        key={day} 
                                        style={[styles.dayBubble, { borderColor: colors.border }, isSelected && [styles.dayBubbleActive, { backgroundColor: highlightColor }]]}
                                        onPress={() => toggleCustomDay(day)}
                                    >
                                        <Text style={[styles.dayBubbleText, { color: colors.text }, isSelected && [styles.dayBubbleTextActive, { color: colors.white }]]}>
                                            {day.charAt(0)}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: highlightColor }]} onPress={handleCustomDaysSubmit}>
                            <Text style={[styles.primaryButtonText, { color: colors.white }]}>Done</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
          ) : null}

          {/* Step 8: Constraints (final step) */}
          {currentStep === 8 ? (
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.textInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card }]}
                placeholder="Injuries, schedule, stress..."
                placeholderTextColor={colors.mediumGrey}
                value={customInput}
                onChangeText={setCustomInput}
              />
              <TouchableOpacity style={[styles.outlineButton, { borderColor: colors.border }]} onPress={handleConstraintsSubmit}>
                <Text style={[styles.outlineButtonText, { color: colors.text }]}>{customInput.trim() ? 'Send' : 'None'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SIZES.padding * 1.5,
    paddingTop: SIZES.padding * 1.2,
    paddingBottom: SIZES.padding * 0.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerBackBtn: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: COLORS.black,
  },
  headerSubtitle: {
    marginTop: 6,
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  chatContainer: {
    paddingHorizontal: SIZES.padding * 1.5,
    paddingVertical: SIZES.padding,
    gap: 14,
    flexGrow: 1,
  },
  messageBubble: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 3,
    maxWidth: '85%',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
  },
  userBubble: {
    alignSelf: 'flex-end',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  assistantText: {},
  userText: {},
  responseArea: {
    paddingHorizontal: SIZES.padding * 1.5,
    paddingBottom: SIZES.padding * 1.5,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  backButton: {
    position: 'absolute',
    top: -40,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 12,
  },
  backButtonText: {
    fontSize: 14,
    color: COLORS.mediumGrey,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  chip: {
    borderWidth: 3,
    borderColor: COLORS.black,
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  chipText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.black,
  },
  chipSelected: {
    backgroundColor: COLORS.black,
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipTextSelected: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    color: COLORS.textSecondary,
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  dayBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: COLORS.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBubbleActive: {
    backgroundColor: COLORS.black,
  },
  dayBubbleText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.black,
  },
  dayBubbleTextActive: {
    color: COLORS.white,
  },
  inputRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    borderWidth: 3,
    borderColor: COLORS.black,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: COLORS.black,
    backgroundColor: COLORS.white,
  },
  outlineButton: {
    borderWidth: 3,
    borderColor: COLORS.black,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  outlineButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.black,
  },
  primaryButton: {
    borderWidth: 3,
    borderColor: COLORS.black,
    borderRadius: 22,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
  keyboardView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 16,
  },
  loadingText: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  loadingSubtext: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
