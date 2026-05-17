import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
  UIManager,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS, SIZES } from '../src/constants/theme';
import { saveOnboardingProfile } from '../src/services/onboarding';
import { OnboardingProfile, TrackingMode } from '../src/types/goal';
import { buildStrategyFromAnswers, GoalAnswers, inferGoalSticker } from '../src/services/goalBuilder';
import { DEFAULT_ASSUMED_TIME_BUDGET_MINUTES, describeLocalAIAttribution, describeLocalAIFallbackReason, describeLocalAIProgress, generateAIPlan, getLastLocalAIDebugSnapshot, getLocalAIStatus, LocalAIProgress, recordLocalAIAttempt } from '../src/services/aiService';
import { getRoutineTargetCoins } from '../src/services/coins';
import { Target, Sparkles, CheckCircle2, Palette, ArrowLeft, Plus, X } from 'lucide-react-native';

const { width } = Dimensions.get('window');

const INTRO_SLIDES = [
  {
    icon: Target,
    title: 'Architect your day.',
    body: 'Vencer turns ambition into a clean, daily stream.',
  },
  {
    icon: Sparkles,
    title: 'Design the plan.',
    body: 'Answer questions—get a clear, structured plan.',
  },
  {
    icon: CheckCircle2,
    title: 'Stay consistent.',
    body: 'Track progress with a minimalist, high-contrast system.',
  },
  {
    icon: Palette,
    title: 'Make it yours.',
    body: 'Customize with stickers, palettes, and icons.',
  },
];

const trackingLabel: Record<string, string> = {
  points: 'Points / score',
  time: 'Minutes per day',
  tasks: 'Tasks completed',
};

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function OnboardingScreen() {
  const router = useRouter();
  const [showSplash, setShowSplash] = useState(true);
  const [showIntro, setShowIntro] = useState(true);
  const underlineAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView | null>(null);

  const [introIndex, setIntroIndex] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [messages, setMessages] = useState([
    { id: 'q1', role: 'assistant', text: 'What do you want to achieve?' },
  ]);
  const [customInput, setCustomInput] = useState('');
  
  // Data State
  const [goal, setGoal] = useState('');
  const [motivation, setMotivation] = useState('');
  const [currentSituation, setCurrentSituation] = useState('');
  const [currentActivities, setCurrentActivities] = useState('');
  const [timeBudgetMinutes, setTimeBudgetMinutes] = useState(DEFAULT_ASSUMED_TIME_BUDGET_MINUTES);
  const [trackingMode, setTrackingMode] = useState<TrackingMode>('points');
  const [trackingTarget, setTrackingTarget] = useState('10');
  const [deadlineBased, setDeadlineBased] = useState(false);
  const [deadlineDate, setDeadlineDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [notificationPref, setNotificationPref] = useState<OnboardingProfile['notificationPreference'] | ''>('');
  const [difficulty, setDifficulty] = useState<OnboardingProfile['difficulty'] | ''>('');
  const [preferredDays, setPreferredDays] = useState<OnboardingProfile['preferredDays'] | ''>('');
  const [constraints, setConstraints] = useState('');
  const [stylePreference, setStylePreference] = useState<OnboardingProfile['stylePreference'] | ''>('');

  // New States for Custom Input
  const [specificTimes, setSpecificTimes] = useState<string[]>([]);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempTime, setTempTime] = useState(new Date());
  const [customDays, setCustomDays] = useState<string[]>([]);

  const [introAnim] = useState(new Animated.Value(1));
  const [isLoading, setIsLoading] = useState(false);
  const [localAIProgress, setLocalAIProgress] = useState<LocalAIProgress | null>(null);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      if (!('fabric' in global)) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
      }
    }
    Animated.timing(underlineAnim, {
      toValue: 1,
      duration: 1100,
      useNativeDriver: false,
    }).start();

    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1300);

    return () => clearTimeout(timer);
  }, [underlineAnim]);

  useEffect(() => {
    setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  const pushAssistant = (text: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text }]);
  };

  const pushUser = (text: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text }]);
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
            // Remove last assistant message (current question)
            if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].role === 'assistant') {
                newMsgs.pop();
            }
            // Remove last user answer
            if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].role === 'user') {
                newMsgs.pop();
            }
            return newMsgs;
        });
        setCurrentStep((prev) => prev - 1);
    }
  };

  // 1. Goal
  const handleGoalSubmit = () => {
    const value = customInput.trim();
    if (!value) return;
    setGoal(value);
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
    goToNextStep('What are you currently doing or working on for this goal? (tasks, tools, routines — anything you already do)');
  };

  // 4. Current Activities (what they already do — helps AI understand and build on it)
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

  // 5. Tracking Preference
  const handleTrackingSelect = (value: TrackingMode) => {
    setTrackingMode(value);
    pushUser(trackingLabel[value]);
    
    let unit = 'points';
    if (value === 'time') unit = 'minutes';
    if (value === 'tasks') unit = 'tasks';

    goToNextStep(`What’s the minimum daily target (${unit}) you want to commit to?`);
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
    setConstraints(value);
    pushUser(displayValue);
    setCustomInput('');

    const inferredTimeBudget = timeBudgetMinutes || DEFAULT_ASSUMED_TIME_BUDGET_MINUTES;
    const defaultCoinTarget = Number(trackingTarget) || 10;
    const normalizedPreferredDays = preferredDays || 'Custom';

    const profile: OnboardingProfile = {
      goal,
      motivation,
      currentSituation,
      currentActivities,
      timeBudgetMinutes: inferredTimeBudget,
      trackingMode: 'points',
      trackingTarget: defaultCoinTarget,
      deadlineDate: deadlineBased ? deadlineDate.toISOString() : undefined,
      notificationPreference: notificationPref || 'No reminders',
      difficulty: difficulty || 'Balanced',
      preferredDays: normalizedPreferredDays,
      customDays: preferredDays === 'Custom' ? customDays : undefined,
      specificTimes: notificationPref === 'Specific times' ? specificTimes : undefined,
      constraints: value,
      stylePreference: stylePreference || 'Flexible & adaptive',
    };
    
    await saveOnboardingProfile(profile);

    // Show loading screen
    setIsLoading(true);
    setLocalAIProgress(null);

    // Build deterministic base
    const today = new Date().toISOString().slice(0, 10);
    const deadlineStr = deadlineBased ? deadlineDate.toISOString().split('T')[0] : null;
    const answers: GoalAnswers = {
      goalName: goal,
      identityStatement: motivation || `I am becoming someone who ${goal}`,
      goalType: 'habit',
      coreAction: goal,
      frequency: preferredDays === 'Every day' ? 'daily' : preferredDays === 'Weekdays' ? '5x' : '3x',
      startDate: today,
      deadline: deadlineStr,
      successMetric: 'points',
      successTarget: defaultCoinTarget,
      minimumViableSession: `${Math.round(inferredTimeBudget * 0.3)} min minimum`,
      mvsDurationMinutes: Math.round(inferredTimeBudget * 0.3),
      sticker: inferGoalSticker(goal),
    };

    let strategy = buildStrategyFromAnswers(answers);
    let aiDebugSummary: string | null = null;

    // Try AI enhancement
    try {
      const aiPlan = await generateAIPlan({
        goalName: goal,
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
        stylePreference: stylePreference || 'Flexible & adaptive',
        requireLocalAI: true,
        onLocalAIProgress: setLocalAIProgress,
      });
      const status = await getLocalAIStatus();
      const snapshot = getLastLocalAIDebugSnapshot();

      if (aiPlan && aiPlan.milestones && aiPlan.dayRoutines) {
        const aiLabel = describeLocalAIAttribution(status);
        aiDebugSummary = [`Source: ${aiLabel}`, snapshot?.contextSummary].filter(Boolean).join(' | ');
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
            stylePreference: stylePreference || strategy.goal.stylePreference,
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
          surface: 'onboarding',
          mode: 'plan',
          outcome: 'ai',
          reason: 'AI plan applied successfully.',
          backend: status?.backend || 'none',
          state: status?.state || 'unknown',
          lastError: status?.lastError || null,
          parsed: snapshot?.parsed ?? true,
          contextSummary: snapshot?.contextSummary,
        });
        await saveOnboardingProfile({ ...profile, trackingMode: 'points', trackingTarget: standardCoins });
      } else {
        aiDebugSummary = describeLocalAIFallbackReason({ status, snapshot });
        await recordLocalAIAttempt({
          id: `plan_${Date.now()}`,
          timestamp: new Date().toISOString(),
          surface: 'onboarding',
          mode: 'plan',
          outcome: 'deterministic',
          reason: aiDebugSummary,
          backend: status?.backend || 'none',
          state: status?.state || 'unknown',
          lastError: status?.lastError || null,
          parsed: snapshot?.parsed ?? false,
          contextSummary: snapshot?.contextSummary,
        });
        setIsLoading(false);
        Alert.alert(
          'Gemma did not finish the plan',
          `${aiDebugSummary}\n\nKeep internet on, leave the app open while Gemma downloads/prepares, and try again.`,
        );
        return;
      }
    } catch (e) {
      const status = await getLocalAIStatus();
      const snapshot = getLastLocalAIDebugSnapshot();
      aiDebugSummary = describeLocalAIFallbackReason({ status, snapshot, error: e });
      await recordLocalAIAttempt({
        id: `plan_${Date.now()}`,
        timestamp: new Date().toISOString(),
        surface: 'onboarding',
        mode: 'plan',
        outcome: 'deterministic',
        reason: aiDebugSummary,
        backend: status?.backend || 'none',
        state: status?.state || 'unknown',
        lastError: status?.lastError || null,
        parsed: snapshot?.parsed ?? false,
        contextSummary: snapshot?.contextSummary,
      });
      console.log('AI plan generation failed:', e);
      setIsLoading(false);
      Alert.alert(
        'Gemma did not finish the plan',
        `${aiDebugSummary}\n\nKeep internet on, leave the app open while Gemma downloads/prepares, and try again.`,
      );
      return;
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
      await saveOnboardingProfile({ ...profile, trackingMode: 'points', trackingTarget: standardCoins });
    }

    router.replace({
      pathname: '/strategy-review',
      params: { strategy: JSON.stringify(strategy) },
    });
  };

  if (showSplash) {
    const underlineWidth = underlineAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 180],
    });

  return (
    <SafeAreaView style={styles.container}>
        <View style={styles.splashContainer}>
          <Text style={styles.splashTitle}>Vencer</Text>
          <Animated.View style={[styles.splashUnderline, { width: underlineWidth }]} />
        </View>
      </SafeAreaView>
    );
  }

  if (showIntro) {
    const SlideIcon = INTRO_SLIDES[introIndex].icon;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.introContainer}>
          <View style={styles.introContentWrapper}>
            <Animated.View style={{ opacity: introAnim }}>
                <View style={styles.introIcon}>
                <SlideIcon size={84} color={COLORS.black} strokeWidth={2.2} />
          </View>
                <Text style={styles.introTitle}>{INTRO_SLIDES[introIndex].title}</Text>
                <Text style={styles.introBody}>{INTRO_SLIDES[introIndex].body}</Text>
            </Animated.View>
        </View>

          <View style={styles.introFooter}>
          <View style={styles.indicators}>
              {INTRO_SLIDES.map((_, index) => (
              <View
                key={index}
                  style={[styles.dot, index === introIndex && styles.activeDot]}
              />
            ))}
          </View>
          <TouchableOpacity 
              style={[
                styles.primaryButton,
                introIndex === INTRO_SLIDES.length - 1 && styles.primaryButtonFilled,
              ]}
              onPress={() => {
                if (introIndex < INTRO_SLIDES.length - 1) {
                  Animated.sequence([
                    Animated.timing(introAnim, {
                      toValue: 0,
                      duration: 150,
                      useNativeDriver: true,
                    }),
                    Animated.timing(introAnim, {
                      toValue: 1,
                      duration: 200,
                      useNativeDriver: true,
                    }),
                  ]).start();
                  setIntroIndex((prev) => prev + 1);
                } else {
                  setShowIntro(false);
                }
              }}
          >
              <Text
                style={[
                  styles.primaryButtonText,
                  introIndex === INTRO_SLIDES.length - 1 && styles.primaryButtonTextFilled,
                ]}
              >
                {introIndex === INTRO_SLIDES.length - 1 ? 'Start' : 'Next'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      </SafeAreaView>
    );
  }

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
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.black} />
          <Text style={styles.loadingTitle}>{loadingCopy.title}</Text>
          <Text style={styles.loadingSubtitle}>{loadingCopy.subtitle}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>The Blueprint.</Text>
          <Text style={styles.headerSubtitle}>Let’s set your plan with precision.</Text>
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
                message.role === 'user' ? styles.userBubble : styles.assistantBubble,
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  message.role === 'user' ? styles.userText : styles.assistantText,
                ]}
              >
                {message.text}
              </Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.responseArea}>
          {currentStep > 0 && (
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                <ArrowLeft size={20} color={COLORS.mediumGrey} />
                <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
          )}

          {currentStep === 0 ? (
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                placeholder="E.g. Learn Japanese, Lose 5kg..."
                placeholderTextColor={COLORS.mediumGrey}
                value={customInput}
                onChangeText={setCustomInput}
              />
              <TouchableOpacity style={styles.outlineButton} onPress={handleGoalSubmit}>
                <Text style={styles.outlineButtonText}>Send</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {currentStep === 1 ? (
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                placeholder="What will change if you succeed?"
                placeholderTextColor={COLORS.mediumGrey}
                value={customInput}
                onChangeText={setCustomInput}
              />
              <TouchableOpacity style={styles.outlineButton} onPress={handleMotivationSubmit}>
                <Text style={styles.outlineButtonText}>Send</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {currentStep === 2 ? (
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                placeholder="Beginner, intermediate, doing nothing..."
                placeholderTextColor={COLORS.mediumGrey}
                value={customInput}
                onChangeText={setCustomInput}
              />
              <TouchableOpacity style={styles.outlineButton} onPress={handleCurrentSituationSubmit}>
                <Text style={styles.outlineButtonText}>Send</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {currentStep === 3 ? (
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                placeholder="E.g. Using Duolingo daily, running 3x/week..."
                placeholderTextColor={COLORS.mediumGrey}
                value={customInput}
                onChangeText={setCustomInput}
              />
              <TouchableOpacity style={styles.outlineButton} onPress={handleCurrentActivitiesSubmit}>
                <Text style={styles.outlineButtonText}>{customInput.trim() ? 'Send' : 'None'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {currentStep === 4 ? (
            <View style={styles.chipRow}>
              {[true, false].map((item) => (
                <TouchableOpacity
                  key={String(item)}
                  style={styles.chip}
                  onPress={() => handleDueSelect(item)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.chipText}>{item ? 'Yes' : 'No / Flexible'}</Text>
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

          {currentStep === 5 ? (
            <View>
                {notificationPref !== 'Specific times' ? (
                    <View style={styles.chipRow}>
                    {(['Daily', 'Specific times', 'Per task', 'No reminders'] as const).map(
                        (item) => (
                        <TouchableOpacity
                            key={item}
                            style={styles.chip}
                            onPress={() => handleNotificationSelect(item)}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.chipText}>{item}</Text>
                        </TouchableOpacity>
                        )
                    )}
                    </View>
                ) : (
                    <View>
                        <Text style={styles.sectionLabel}>Select Times:</Text>
                        <View style={styles.chipRow}>
                            {specificTimes.map((time) => (
                                <View key={time} style={styles.chipSelected}>
                                    <Text style={styles.chipTextSelected}>{time}</Text>
                                    <TouchableOpacity onPress={() => setSpecificTimes(prev => prev.filter(t => t !== time))}>
                                        <X size={14} color={COLORS.white} />
                                    </TouchableOpacity>
                                </View>
                            ))}
                            <TouchableOpacity style={styles.chip} onPress={() => setShowTimePicker(true)}>
                                <Plus size={20} color={COLORS.black} />
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
                        <TouchableOpacity style={styles.primaryButton} onPress={handleSpecificTimesSubmit}>
                            <Text style={styles.primaryButtonText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
          ) : null}

          {currentStep === 6 ? (
            <View style={styles.chipRow}>
              {(['Easy', 'Balanced', 'Intense'] as const).map(
                (item) => (
                  <TouchableOpacity
                    key={item}
                    style={styles.chip}
                    onPress={() => handleDifficultySelect(item)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.chipText}>{item}</Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          ) : null}

          {currentStep === 7 ? (
            <View>
                {preferredDays !== 'Custom' ? (
                    <View style={styles.chipRow}>
                    {(['Every day', 'Weekdays', 'Custom'] as const).map(
                        (item) => (
                        <TouchableOpacity
                            key={item}
                            style={styles.chip}
                            onPress={() => handlePreferredDaysSelect(item)}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.chipText}>{item}</Text>
                        </TouchableOpacity>
                        )
                    )}
                    </View>
                ) : (
                    <View>
                        <Text style={styles.sectionLabel}>Select Days:</Text>
                        <View style={styles.dayRow}>
                            {DAYS_OF_WEEK.map((day) => {
                                const isSelected = customDays.includes(day);
                                return (
                                    <TouchableOpacity 
                                        key={day} 
                                        style={[styles.dayBubble, isSelected && styles.dayBubbleActive]}
                                        onPress={() => toggleCustomDay(day)}
                                    >
                                        <Text style={[styles.dayBubbleText, isSelected && styles.dayBubbleTextActive]}>
                                            {day.charAt(0)}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <TouchableOpacity style={styles.primaryButton} onPress={handleCustomDaysSubmit}>
                            <Text style={styles.primaryButtonText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
          ) : null}

          {currentStep === 8 ? (
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                placeholder="Injuries, schedule, stress..."
                placeholderTextColor={COLORS.mediumGrey}
                value={customInput}
                onChangeText={setCustomInput}
              />
              <TouchableOpacity style={styles.outlineButton} onPress={handleConstraintsSubmit}>
                <Text style={styles.outlineButtonText}>{customInput.trim() ? 'Done' : 'None'}</Text>
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
  splashContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashTitle: {
    fontSize: 48,
    fontWeight: '800',
    color: COLORS.black,
    letterSpacing: -1,
  },
  splashUnderline: {
    marginTop: 12,
    height: 6,
    backgroundColor: COLORS.black,
  },
  introContainer: {
    flex: 1,
    padding: SIZES.padding * 1.8,
  },
  introContentWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  introTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: COLORS.black,
    marginTop: 40,
    textAlign: 'center',
  },
  introBody: {
    fontSize: 18,
    color: COLORS.textSecondary,
    marginTop: 16,
    textAlign: 'center',
  },
  introIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 24,
  },
  introFooter: {
    gap: 16,
    paddingBottom: 20,
  },
  indicators: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.lightGrey,
  },
  activeDot: {
    backgroundColor: COLORS.black,
    width: 24,
  },
  header: {
    paddingHorizontal: SIZES.padding * 1.5,
    paddingTop: SIZES.padding * 1.2,
    paddingBottom: SIZES.padding * 0.5,
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
    borderColor: COLORS.black,
    alignSelf: 'flex-start',
  },
  userBubble: {
    borderColor: COLORS.black,
    backgroundColor: COLORS.black,
    alignSelf: 'flex-end',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  assistantText: {
    color: COLORS.black,
  },
  userText: {
    color: COLORS.white,
  },
  responseArea: {
    paddingHorizontal: SIZES.padding * 1.5,
    paddingBottom: SIZES.padding * 1.5,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGrey,
    backgroundColor: COLORS.background,
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
  sliderHeader: {
    marginBottom: 16,
    alignItems: 'center',
  },
  sliderValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.black,
  },
  sliderTrack: {
    height: 32,
    justifyContent: 'center',
    position: 'relative',
  },
  sliderTrackBase: {
    height: 6,
    backgroundColor: COLORS.lightGrey,
    borderRadius: 999,
  },
  sliderTrackFill: {
    position: 'absolute',
    height: 6,
    backgroundColor: COLORS.black,
    borderRadius: 999,
    left: 0,
  },
  sliderThumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    borderWidth: 3,
    borderColor: COLORS.black,
    top: 4,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 18,
  },
  sliderLabelText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  primaryButton: {
    borderWidth: 3,
    borderColor: COLORS.black,
    borderRadius: 22,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonFilled: {
    backgroundColor: COLORS.black,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.black,
  },
  primaryButtonTextFilled: {
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
  loadingTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.black,
    textAlign: 'center',
  },
  loadingSubtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
