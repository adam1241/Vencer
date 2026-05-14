import AsyncStorage from '@react-native-async-storage/async-storage';
import { StrategyPlan, PlanningSnapshot, WeeklyReviewResult, MilestoneItem, WeeklyFocusItem } from '../types/goal';
import { DayTask } from '../types/task';
import { getDayTasks, saveDayTasks, getDailyLog } from './storage';
import { buildWeeklyReview } from './goalBuilder';
import { getCoinsForTask } from './coins';
import { getOnboardingProfile } from './onboarding';
import { getSettings } from './settings';
import { getTimelineDetailIndex, getTimelineMilestoneIndex, getTimelineUnitLabel } from './planningTimeline';

const WEEKLY_REVIEW_PREFIX = 'ziel_weekly_review_';
const ENGINE_FLAG_PREFIX = 'ziel_engine_generated_';
const DAILY_PLAN_CONTEXT_PREFIX = 'ziel_daily_plan_context_';

const buildMilestoneFallbackWeeklyFocus = (
  goalTitle: string,
  weekNumber: number,
  milestone: MilestoneItem | null,
  timelineUnit: StrategyPlan['goal']['aiTimelineUnit'] = 'month',
): WeeklyFocusItem => {
  const focus = milestone?.focus || `Progress ${goalTitle}`;
  const detailLabel = getTimelineUnitLabel(timelineUnit === 'day' ? 'day' : 'week', 1).toLowerCase();
  return {
    week: weekNumber,
    focus: `${focus} (generated as needed)`,
    objective: `Use this ${detailLabel} to make visible progress on ${focus}.`,
    successSignal: `You completed the planned sessions for ${detailLabel} ${weekNumber}.`,
    lightTasks: [`Review one small part of ${focus.toLowerCase()} for 10 minutes.`],
    standardTasks: [
      `Complete one focused practice session related to ${focus.toLowerCase()}.`,
      `Write down one clear takeaway from this week's work on ${goalTitle}.`,
    ],
    intenseTasks: [
      `Do one deeper 30-minute session on ${focus.toLowerCase()}.`,
      `Complete one concrete exercise or mini-project step for ${goalTitle}.`,
      `Review mistakes and adjust the next session for ${goalTitle}.`,
    ],
  };
};

// -----------------------------------------------------------------------
// buildPlanningSnapshot – gathers ALL context into one object
// -----------------------------------------------------------------------
export const buildPlanningSnapshot = async (
  strategy: StrategyPlan,
  dateKey: string,
): Promise<PlanningSnapshot> => {
  const today = new Date(dateKey + 'T12:00:00');
  const created = new Date(strategy.createdAt);
  const daysElapsed = Math.max(0, Math.floor((today.getTime() - created.getTime()) / 86400000));

  // Deadline
  let daysRemaining: number | null = null;
  if (strategy.goal.deadlineBased && strategy.goal.deadlineDate) {
    const deadline = new Date(strategy.goal.deadlineDate);
    daysRemaining = Math.max(0, Math.floor((deadline.getTime() - today.getTime()) / 86400000));
  }

  // Current milestone / weekly focus based on elapsed time
  const timelineUnit = strategy.goal.aiTimelineUnit || 'month';
  const currentMonthIndex = getTimelineMilestoneIndex(timelineUnit, daysElapsed);
  const currentWeekIndex = getTimelineDetailIndex(timelineUnit, daysElapsed);

  let currentMilestone: MilestoneItem | null = null;
  if (strategy.milestones && strategy.milestones.length > 0) {
    currentMilestone =
      strategy.milestones.find((m) => m.month === currentMonthIndex + 1) ||
      strategy.milestones[Math.min(currentMonthIndex, strategy.milestones.length - 1)] ||
      null;
  }

  let currentWeeklyFocus: WeeklyFocusItem | null = null;
  if (strategy.weeklyFocus && strategy.weeklyFocus.length > 0) {
    currentWeeklyFocus =
      strategy.weeklyFocus.find((w) => w.week === currentWeekIndex + 1) ||
      buildMilestoneFallbackWeeklyFocus(strategy.goal.title, currentWeekIndex + 1, currentMilestone, timelineUnit) ||
      strategy.weeklyFocus[Math.min(currentWeekIndex, strategy.weeklyFocus.length - 1)] ||
      null;
  }

  // --- Build recent history (last 7 days) ---
  const dailyLog = await getDailyLog();
  const recentHistory: PlanningSnapshot['recentHistory'] = [];
  const missedCounter: Record<string, number> = {};

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);

    const dayTasks = await getDayTasks(key);
    const tasks: DayTask[] = Array.isArray(dayTasks) ? dayTasks : [];
    const strategyTasks = tasks.filter((t) => t.strategyId === strategy.id);

    const completed = strategyTasks.filter((t) => t.completed);
    const missed = strategyTasks.filter((t) => !t.completed);

    const logEntry = dailyLog[key];

    recentHistory.push({
      date: key,
      tasksTotal: strategyTasks.length,
      tasksCompleted: completed.length,
      points: logEntry?.points || 0,
      completedTaskNames: completed.map((t) => t.text),
      missedTaskNames: missed.map((t) => t.text),
    });

    // Track missed patterns
    missed.forEach((t) => {
      missedCounter[t.text] = (missedCounter[t.text] || 0) + 1;
    });
  }

  // Derived stats
  const totalTasksDays = recentHistory.filter((h) => h.tasksTotal > 0);
  const completionRate7d =
    totalTasksDays.length > 0
      ? totalTasksDays.reduce((sum, h) => sum + (h.tasksTotal > 0 ? h.tasksCompleted / h.tasksTotal : 0), 0) / totalTasksDays.length
      : 0;

  const averagePointsPerDay =
    recentHistory.length > 0
      ? recentHistory.reduce((sum, h) => sum + h.points, 0) / recentHistory.length
      : 0;

  // Current streak
  let currentStreak = 0;
  for (let i = recentHistory.length - 1; i >= 0; i--) {
    const h = recentHistory[i];
    if (h.date === dateKey) continue;
    if (h.tasksCompleted > 0) {
      currentStreak++;
    } else if (h.tasksTotal > 0) {
      break;
    }
  }

  // Missed task patterns: tasks missed 3+ times in last 7 days
  const missedTaskPatterns = Object.entries(missedCounter)
    .filter(([_, count]) => count >= 3)
    .map(([name]) => name);

  // Load cached weekly review
  let lastWeeklyReview: WeeklyReviewResult | null = null;
  try {
    const raw = await AsyncStorage.getItem(`${WEEKLY_REVIEW_PREFIX}${strategy.id}`);
    if (raw) lastWeeklyReview = JSON.parse(raw);
  } catch {
    // ignore
  }

  // Load onboarding profile for accurate tracking target and time budget
  let trackingTarget = strategy.goal.trackingTarget || 60;
  let timeBudgetMinutes = strategy.goal.timeBudgetMinutes || 60;
  try {
    const profile = await getOnboardingProfile();
    if (profile) {
      if (!strategy.goal.trackingTarget) {
        trackingTarget = profile.trackingTarget || trackingTarget;
      }
      if (!strategy.goal.timeBudgetMinutes) {
        timeBudgetMinutes = profile.timeBudgetMinutes || 60;
      }
    }
  } catch {
    // ignore
  }

  return {
    date: dateKey,
    goalCreatedAt: strategy.createdAt,
    daysElapsed,
    daysRemaining,
    northStar: strategy.northStar || '',
    currentMilestone,
    currentWeeklyFocus,
    dayRoutines: strategy.dayRoutines || [],
    recentHistory,
    currentStreak,
    completionRate7d,
    averagePointsPerDay,
    missedTaskPatterns,
    goalTitle: strategy.goal.title,
    goalSticker: strategy.goal.sticker || '🎯',
    difficulty: strategy.goal.difficulty || 'Balanced',
    preferredDays: strategy.goal.preferredDays || 'Every day',
    constraints: strategy.goal.constraints || '',
    trackingMode: strategy.goal.trackingMode || 'points',
    trackingTarget,
    timeBudgetMinutes,
    lastWeeklyReview,
  };
};

const savePlanningSnapshotCache = async (
  strategyId: string,
  dateKey: string,
  snapshot: PlanningSnapshot,
) => {
  try {
    await AsyncStorage.setItem(
      `${DAILY_PLAN_CONTEXT_PREFIX}${strategyId}_${dateKey}`,
      JSON.stringify(snapshot),
    );
  } catch {
    // ignore cache write failures
  }
};

// -----------------------------------------------------------------------
// getOrComputeDailyPlan – returns tasks for today using static routines
// -----------------------------------------------------------------------
const inferBlock = (text: string): DayTask['block'] => {
  const v = text.toLowerCase();
  if (v.includes('morning')) return 'Morning';
  if (v.includes('deep') || v.includes('work') || v.includes('study')) return 'Deep Work';
  return 'Anytime';
};

const getRecommendedRoutineId = (strategy: StrategyPlan, snapshot?: PlanningSnapshot): 'standard' | 'light' | 'intense' => {
  if (snapshot?.lastWeeklyReview?.recommendedRoutineType) {
    return snapshot.lastWeeklyReview.recommendedRoutineType;
  }

  const difficulty = (strategy.goal.difficulty || 'Balanced').toLowerCase();
  if (difficulty === 'easy') return 'light';
  if (difficulty === 'intense') return 'intense';
  return 'standard';
};

const getWeeklyFocusTasks = (weeklyFocus: WeeklyFocusItem | null, routineId: string): string[] => {
  if (!weeklyFocus) return [];

  const source =
    routineId === 'light'
      ? weeklyFocus.lightTasks
      : routineId === 'intense'
        ? weeklyFocus.intenseTasks
        : weeklyFocus.standardTasks;

  return Array.isArray(source) ? source.filter(Boolean) : [];
};

const distributeDurations = (count: number, totalMinutes: number, minimum = 10): number[] => {
  if (count <= 0) return [];

  const safeTotal = Math.max(totalMinutes, minimum * count);
  const base = Math.floor(safeTotal / count);
  const remainder = safeTotal - base * count;

  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
};

export const getOrComputeDailyPlan = async (
  strategy: StrategyPlan,
  dateKey: string,
): Promise<DayTask[]> => {
  // 1. Check if tasks already exist for this strategy on this day
  const stored = await getDayTasks(dateKey);
  const existingTasks: DayTask[] = Array.isArray(stored) ? stored : [];
  const stratTasks = existingTasks.filter((t) => t.strategyId === strategy.id);

  if (stratTasks.length > 0) {
    const flagKey = `${ENGINE_FLAG_PREFIX}${strategy.id}_${dateKey}`;
    const flag = await AsyncStorage.getItem(flagKey);
    if (flag === 'true') {
      return existingTasks;
    }
    return existingTasks;
  }

  // 2. No tasks for this strategy yet — generate from static day routines
  const baseId = Date.now();
  let counter = 0;
  let habitsToAdd: { title: string; duration: number; points?: number }[] = [];
  const snapshot = await buildPlanningSnapshot(strategy, dateKey);
  await savePlanningSnapshotCache(strategy.id, dateKey, snapshot);
  const selectedRoutineId = getRecommendedRoutineId(strategy, snapshot);
  const selectedRoutine =
    strategy.dayRoutines?.find((routine) => routine.id === selectedRoutineId) ||
    strategy.dayRoutines?.[0] ||
    null;
  const weeklyTasks = getWeeklyFocusTasks(snapshot.currentWeeklyFocus, selectedRoutineId);

  try {
    const settings = await getSettings();
    if (settings.aiDataUsage) {
      const { getAIDailyPlan } = await import('./aiService');
      const aiPlan = await getAIDailyPlan({
        dateKey,
        goalTitle: snapshot.goalTitle,
        goalEmoji: snapshot.goalSticker,
        northStar: snapshot.northStar,
        currentMilestone: snapshot.currentMilestone,
        currentWeeklyFocus: snapshot.currentWeeklyFocus,
        selectedRoutineId,
        routineHabits: selectedRoutine?.habits?.map((habit) => ({
          title: habit.title,
          duration: habit.duration,
          tool: habit.tool || habit.cue,
        })),
        difficulty: snapshot.difficulty,
        timeBudgetMinutes: snapshot.timeBudgetMinutes,
        currentStreak: snapshot.currentStreak,
        completionRate7d: snapshot.completionRate7d,
        missedTaskPatterns: snapshot.missedTaskPatterns,
        recentHistory: snapshot.recentHistory,
        constraints: snapshot.constraints,
      });

      if (aiPlan?.tasks?.length) {
        habitsToAdd = aiPlan.tasks.map((task) => ({
          title: task.title,
          duration: task.durationMinutes,
          points: getCoinsForTask(task.durationMinutes, task.title),
        }));
      }
    }
  } catch (e) {
    console.log('Daily AI planning failed, using deterministic fallback:', e);
  }

  if (weeklyTasks.length > 0) {
    const totalMinutes = Math.max(
      15,
      Math.round(
        (snapshot.timeBudgetMinutes ||
          selectedRoutine?.habits?.reduce((sum, habit) => sum + habit.duration, 0) ||
          30) *
          (selectedRoutineId === 'light' ? 0.5 : selectedRoutineId === 'intense' ? 1.25 : 1),
      ),
    );
    const durations = distributeDurations(
      weeklyTasks.length,
      totalMinutes,
      selectedRoutineId === 'light' ? 8 : 12,
    );

    if (habitsToAdd.length === 0) {
      habitsToAdd = weeklyTasks.map((title, index) => ({
        title,
        duration: durations[index] || 15,
        points: getCoinsForTask(durations[index] || 15, title),
      }));
    }
  }

  if (habitsToAdd.length === 0 && strategy.dayRoutines && strategy.dayRoutines.length > 0) {
    const routine = selectedRoutine || strategy.dayRoutines[0];
    habitsToAdd = routine.habits.map((h) => ({
      title: h.title,
      duration: h.duration,
      points: h.coins || getCoinsForTask(h.duration, h.title),
    }));
  } else if (strategy.dailyRoutine && strategy.dailyRoutine.length > 0) {
    habitsToAdd = strategy.dailyRoutine.map((text) => ({
      title: text,
      duration: 20,
      points: getCoinsForTask(20, text),
    }));
  }

  const newTasks: DayTask[] = habitsToAdd.map((habit) => ({
    id: baseId + counter++,
    text: habit.title,
    completed: false,
    block: inferBlock(habit.title),
    durationMinutes: habit.duration || 15,
    points: habit.points || getCoinsForTask(habit.duration || 15, habit.title),
    strategyId: strategy.id,
  }));

  // 3. Merge with existing tasks (from other strategies) and save
  const otherTasks = existingTasks.filter((t) => t.strategyId !== strategy.id);
  const allTasks = [...otherTasks, ...newTasks];
  await saveDayTasks(dateKey, allTasks);

  // Mark as engine-generated
  const flagKey = `${ENGINE_FLAG_PREFIX}${strategy.id}_${dateKey}`;
  await AsyncStorage.setItem(flagKey, 'true');

  return allTasks;
};

// -----------------------------------------------------------------------
// runWeeklyReviewIfNeeded – deterministic weekly review
// -----------------------------------------------------------------------
export const runWeeklyReviewIfNeeded = async (strategy: StrategyPlan, dateKey: string): Promise<void> => {
  try {
    const reviewKey = `${WEEKLY_REVIEW_PREFIX}${strategy.id}`;
    const existing = await AsyncStorage.getItem(reviewKey);

    if (existing) {
      const parsed: WeeklyReviewResult = JSON.parse(existing);
      const lastReviewDate = new Date(parsed.weekOf);
      const today = new Date(dateKey + 'T12:00:00');
      const daysSinceReview = Math.floor((today.getTime() - lastReviewDate.getTime()) / 86400000);
      if (daysSinceReview < 7) return;
    }

    const created = new Date(strategy.createdAt);
    const today = new Date(dateKey + 'T12:00:00');
    const daysElapsed = Math.floor((today.getTime() - created.getTime()) / 86400000);
    if (daysElapsed < 7) return;

    const snapshot = await buildPlanningSnapshot(strategy, dateKey);

    // Try AI-powered weekly review first
    let review: WeeklyReviewResult | null = null;
    try {
      const { getAIWeeklyReview } = await import('./aiService');
      const aiReview = await getAIWeeklyReview({
        goalTitle: snapshot.goalTitle,
        completionRate: snapshot.completionRate7d,
        currentStreak: snapshot.currentStreak,
        missedTaskPatterns: snapshot.missedTaskPatterns,
        weekOf: dateKey,
        northStar: snapshot.northStar,
        currentMilestone: snapshot.currentMilestone,
        recentHistory: snapshot.recentHistory.map(d => ({
          date: d.date,
          tasksCompleted: d.tasksCompleted,
          tasksTotal: d.tasksTotal,
        })),
      });

      if (aiReview && aiReview.whatWorked && aiReview.recommendedRoutineType) {
        review = aiReview;
      }
    } catch (e) {
      console.log('AI weekly review failed, using deterministic:', e);
    }

    // Fallback to deterministic review
    if (!review) {
      review = buildWeeklyReview({
        completionRate: snapshot.completionRate7d,
        streak: snapshot.currentStreak,
        missedPatterns: snapshot.missedTaskPatterns,
        goalTitle: snapshot.goalTitle,
        weekOf: dateKey,
      });
    }

    await AsyncStorage.setItem(reviewKey, JSON.stringify(review));
  } catch (e) {
    console.log('Weekly review failed silently:', e);
  }
};
