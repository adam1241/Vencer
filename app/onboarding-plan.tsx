import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, SIZES } from '../src/constants/theme';
import { buildStrategyFromAnswers, GoalAnswers, inferGoalSticker } from '../src/services/goalBuilder';
import { getOnboardingProfile } from '../src/services/onboarding';
import { describeLocalAIAttribution, describeLocalAIFallbackReason, generateAIPlan, getLastLocalAIDebugSnapshot, getLocalAIStatus, recordLocalAIAttempt } from '../src/services/aiService';
import { getRoutineTargetCoins } from '../src/services/coins';

const LOADING_PHRASES = [
  "Analyzing your goal profile...",
  "Consulting the frameworks...",
  "Applying the 2-minute rule...",
  "Designing if-then fail-safes...",
  "Sequencing milestones...",
  "Finalizing your strategy..."
];

export default function OnboardingPlanScreen() {
  const router = useRouter();
  const [loadingText, setLoadingText] = useState(LOADING_PHRASES[0]);

  useEffect(() => {
    let phraseIndex = 0;
    const interval = setInterval(() => {
      phraseIndex = (phraseIndex + 1) % LOADING_PHRASES.length;
      setLoadingText(LOADING_PHRASES[phraseIndex]);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const run = async () => {
      const profile = await getOnboardingProfile();
      if (!profile) {
        // No profile — go back to onboarding
        router.replace('/onboarding');
        return;
      }

      // Build strategy deterministically from profile data
      const today = new Date().toISOString().slice(0, 10);
      const answers: GoalAnswers = {
        goalName: profile.goal,
        identityStatement: profile.motivation || `I am becoming someone who ${profile.goal}`,
        goalType: 'habit',
        coreAction: profile.goal,
        frequency: 'daily',
        startDate: today,
        deadline: profile.deadlineDate ? profile.deadlineDate.split('T')[0] : null,
        successMetric: profile.trackingMode === 'time' ? 'duration' : profile.trackingMode === 'tasks' ? 'binary' : 'points',
        successTarget: profile.trackingTarget || 30,
        minimumViableSession: `${Math.round((profile.trackingTarget || 30) * 0.3)} min minimum`,
        mvsDurationMinutes: Math.round((profile.timeBudgetMinutes || 30) * 0.3),
        sticker: inferGoalSticker(profile.goal),
      };

      const strategy = buildStrategyFromAnswers(answers);
      let aiDebugSummary: string | null = null;

      try {
        const aiResult = await generateAIPlan({
          goalName: profile.goal,
          motivation: profile.motivation,
          currentSituation: profile.currentSituation,
          currentActivities: profile.currentActivities,
          timeBudgetMinutes: profile.timeBudgetMinutes,
          trackingMode: profile.trackingMode,
          trackingTarget: profile.trackingTarget,
          deadline: profile.deadlineDate,
          difficulty: profile.difficulty,
          preferredDays: profile.preferredDays,
          customDays: profile.customDays,
          notificationPreference: profile.notificationPreference,
          specificTimes: profile.specificTimes,
          constraints: profile.constraints,
          stylePreference: profile.stylePreference,
        });
        const status = await getLocalAIStatus();
        const snapshot = getLastLocalAIDebugSnapshot();

        if (aiResult) {
          const aiLabel = describeLocalAIAttribution(status);
          aiDebugSummary = [`Source: ${aiLabel}`, snapshot?.contextSummary].filter(Boolean).join(' | ');
          const standardRoutine = aiResult.dayRoutines?.find((routine) => routine.id === 'standard') || aiResult.dayRoutines?.[0];
          const standardCoins = getRoutineTargetCoins(standardRoutine?.habits || []) || strategy.goal.trackingTarget || 10;
          strategy.goal.title = aiResult.planTitle || strategy.goal.title;
          strategy.goal.sticker = aiResult.goalEmoji || strategy.goal.sticker;
          strategy.goal.aiLabel = aiLabel;
          strategy.goal.aiDebugSummary = aiDebugSummary;
          strategy.goal.aiContinuationNote = aiResult.continuationNote || strategy.goal.aiContinuationNote;
          strategy.goal.aiDetailedWeeksThrough = aiResult.detailedWeeksThrough || strategy.goal.aiDetailedWeeksThrough;
          strategy.goal.aiTimelineUnit = aiResult.timelineUnit || strategy.goal.aiTimelineUnit;
          strategy.goal.aiTimelineCount = aiResult.timelineCount || strategy.goal.aiTimelineCount;
          strategy.goal.trackingMode = 'points';
          strategy.goal.trackingTarget = standardCoins;
          strategy.goal.currentLevel = profile.currentSituation || strategy.goal.currentLevel;
          strategy.goal.currentActivities = profile.currentActivities || strategy.goal.currentActivities;
          strategy.goal.difficulty = profile.difficulty || strategy.goal.difficulty;
          strategy.goal.preferredDays = profile.preferredDays || strategy.goal.preferredDays;
          strategy.goal.customDays = profile.customDays || strategy.goal.customDays;
          strategy.goal.constraints = profile.constraints || strategy.goal.constraints;
          strategy.goal.timeBudgetMinutes = profile.timeBudgetMinutes || strategy.goal.timeBudgetMinutes;
          strategy.goal.notificationTimes = profile.specificTimes || strategy.goal.notificationTimes;
          strategy.goal.stylePreference = profile.stylePreference || strategy.goal.stylePreference;
          strategy.northStar = aiResult.northStar || strategy.northStar;
          strategy.milestones = aiResult.milestones || strategy.milestones;
          strategy.weeklyFocus = aiResult.weeklyFocus || strategy.weeklyFocus;
          strategy.dayRoutines = aiResult.dayRoutines || strategy.dayRoutines;
          strategy.dailyHabits = strategy.dayRoutines[0]?.habits || [];
          strategy.ifThenRules = aiResult.ifThenRules || strategy.ifThenRules;
          strategy.recommendedTools = aiResult.recommendedTools || strategy.recommendedTools;
          strategy.pointsPerDay = standardCoins;
          await recordLocalAIAttempt({
            id: `plan_${Date.now()}`,
            timestamp: new Date().toISOString(),
            surface: 'onboarding_plan',
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
          strategy.goal.aiLabel = 'Deterministic plan';
          strategy.goal.aiDebugSummary = aiDebugSummary;
          await recordLocalAIAttempt({
            id: `plan_${Date.now()}`,
            timestamp: new Date().toISOString(),
            surface: 'onboarding_plan',
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
        strategy.goal.aiLabel = 'Deterministic plan';
        strategy.goal.aiDebugSummary = aiDebugSummary;
        await recordLocalAIAttempt({
          id: `plan_${Date.now()}`,
          timestamp: new Date().toISOString(),
          surface: 'onboarding_plan',
          mode: 'plan',
          outcome: 'deterministic',
          reason: aiDebugSummary,
          backend: status?.backend || 'none',
          state: status?.state || 'unknown',
          lastError: status?.lastError || null,
          parsed: snapshot?.parsed ?? false,
          contextSummary: snapshot?.contextSummary,
        });
        console.warn('AI plan generation failed, using deterministic fallback', e);
      }

      // Navigate to review screen (after AI wait)
      router.replace({
        pathname: '/strategy-review',
        params: { strategy: JSON.stringify(strategy) },
      });
    };

    run();
  }, [router]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.loadingContent}>
        <ActivityIndicator size="large" color={COLORS.black} />
        <Text style={styles.title}>Building Your Plan</Text>
      </View>
      <Text style={styles.loadingText}>{loadingText}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SIZES.padding * 1.5,
  },
  loadingContent: {
    alignItems: 'center',
    gap: 16,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.black,
  },
  loadingText: {
    position: 'absolute',
    bottom: 48,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: SIZES.padding,
  },
});
