import { DailyHabit, DailyLog } from '../types/goal';

const COMPLEX_TASK_PATTERN = /(deep|extended|project|build|review|practice test|long|hard|complex)/i;
export const TEST_STARTER_COINS = 10000;

export const getCoinsForTask = (durationMinutes: number, title = ''): number => {
  const safeDuration = Math.max(5, Number(durationMinutes) || 0);
  if (safeDuration >= 40 || COMPLEX_TASK_PATTERN.test(title)) {
    return 10;
  }
  if (safeDuration <= 15 && !COMPLEX_TASK_PATTERN.test(title)) {
    return 2;
  }
  return 5;
};

export const buildCoinReward = (coins: number, durationMinutes: number): string =>
  `Earn ${coins} coins after this ${durationMinutes}-minute session.`;

export const getRoutineTargetCoins = (habits: DailyHabit[] = []): number =>
  habits.reduce((sum, habit) => sum + (habit.coins || getCoinsForTask(habit.duration, habit.title)), 0);

export const getTotalCoinsCollected = (dailyLog: DailyLog = {}) =>
  TEST_STARTER_COINS + Object.values(dailyLog).reduce((sum, entry) => sum + (Number(entry?.points) || 0), 0);
