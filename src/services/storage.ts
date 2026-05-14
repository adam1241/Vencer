import AsyncStorage from '@react-native-async-storage/async-storage';
import { DailyLog, DailyLogEntry, StrategyPlan } from '../types/goal';
import { getProfile } from './profile';
import { supabase } from './supabase';

const STORAGE_KEYS = {
  STRATEGIES: 'ziel_strategies',
  ACTIVE_STRATEGY_ID: 'ziel_active_strategy_id',
  DAILY_LOG: 'ziel_daily_log',
  DAY_TASKS_PREFIX: 'ziel_day_tasks_',
  START_DATE: 'ziel_start_date',
};

export const getStartDate = async (): Promise<string> => {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.START_DATE);
    if (value) return value;
    const today = new Date().toISOString().slice(0, 10);
    await AsyncStorage.setItem(STORAGE_KEYS.START_DATE, today);
    return today;
  } catch (e) {
    console.error('Failed to get start date', e);
    return new Date().toISOString().slice(0, 10);
  }
};

export const saveStrategy = async (strategy: StrategyPlan) => {
  try {
    const user = await supabase.auth.getUser();
    if (user.data.user) {
      const { error } = await supabase.from('goals').upsert({
        id: strategy.id,
        user_id: user.data.user.id,
        goal: strategy.goal,
        phases: strategy.phases,
        daily_routine: strategy.dailyRoutine,
        daily_plan: strategy.dailyPlan || [],
        points_per_day: strategy.pointsPerDay,
        month_plan: strategy.monthPlan || [],
        week_plan: strategy.weekPlan || [],
        last_adjustment_at: strategy.lastAdjustmentAt,
        adjustment_note: strategy.adjustmentNote,
        created_at: strategy.createdAt,
        // New fields for 4-layer strategy
        north_star: strategy.northStar,
        milestones: strategy.milestones,
        weekly_focus: strategy.weeklyFocus,
        day_routines: strategy.dayRoutines,
      });
      if (error) {
        if (error.code === 'PGRST204' && error.message?.includes('daily_plan')) {
          const retry = await supabase.from('goals').upsert({
            id: strategy.id,
            user_id: user.data.user.id,
            goal: strategy.goal,
            phases: strategy.phases,
            daily_routine: strategy.dailyRoutine,
            points_per_day: strategy.pointsPerDay,
            month_plan: strategy.monthPlan || [],
            week_plan: strategy.weekPlan || [],
            last_adjustment_at: strategy.lastAdjustmentAt,
            adjustment_note: strategy.adjustmentNote,
            created_at: strategy.createdAt,
            north_star: strategy.northStar,
            milestones: strategy.milestones,
            weekly_focus: strategy.weeklyFocus,
            day_routines: strategy.dayRoutines,
          });
          if (retry.error) throw retry.error;
        } else {
          throw error;
        }
      }
      await setActiveStrategyId(strategy.id);
      return;
    }

    const list = await getStrategies();
    const existingIndex = list.findIndex((item) => item.id === strategy.id);
    if (existingIndex >= 0) {
      list[existingIndex] = strategy;
    } else {
      list.unshift(strategy);
    }
    await AsyncStorage.setItem(STORAGE_KEYS.STRATEGIES, JSON.stringify(list));
    await setActiveStrategyId(strategy.id);
  } catch (e) {
    console.error('Failed to save strategy', e);
  }
};

export const deleteStrategy = async (id: string) => {
  try {
    const user = await supabase.auth.getUser();
    if (user.data.user) {
      const { error } = await supabase.from('goals').delete().eq('id', id);
      if (error) throw error;
      return;
    }

    const list = await getStrategies();
    const filtered = list.filter((s) => s.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.STRATEGIES, JSON.stringify(filtered));
  } catch (e) {
    console.error('Failed to delete strategy', e);
  }
};

export const getStrategies = async (): Promise<StrategyPlan[]> => {
  try {
    const user = await supabase.auth.getUser();
    if (user.data.user) {
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.data.user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((row) => ({
        id: row.id,
        goal: row.goal,
        phases: row.phases || [],
        dailyRoutine: row.daily_routine || [],
        dailyPlan: row.daily_plan || [],
        pointsPerDay: row.points_per_day || 60,
        monthPlan: row.month_plan || [],
        weekPlan: row.week_plan || [],
        lastAdjustmentAt: row.last_adjustment_at || undefined,
        adjustmentNote: row.adjustment_note || undefined,
        createdAt: row.created_at,
        // New 4-layer strategy fields
        northStar: row.north_star || '',
        milestones: row.milestones || [],
        weeklyFocus: row.weekly_focus || [],
        dayRoutines: row.day_routines || [],
      }));
    }

    const jsonValue = await AsyncStorage.getItem(STORAGE_KEYS.STRATEGIES);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Failed to fetch strategies', e);
    return [];
  }
};

export const setActiveStrategyId = async (id: string) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_STRATEGY_ID, id);
  } catch (e) {
    console.error('Failed to set active strategy', e);
  }
};

export const getActiveStrategyId = async () => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_STRATEGY_ID);
  } catch (e) {
    console.error('Failed to get active strategy id', e);
    return null;
  }
};

export const getStrategy = async (): Promise<StrategyPlan | null> => {
  const list = await getStrategies();
  if (list.length === 0) return null;
  const activeId = await getActiveStrategyId();
  if (!activeId) return list[0];
  return list.find((item) => item.id === activeId) || list[0];
};

export const getDailyLog = async (): Promise<DailyLog> => {
  try {
    const user = await supabase.auth.getUser();
    if (user.data.user) {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('user_id', user.data.user.id);
      if (error) throw error;
      const log: DailyLog = {};
      (data || []).forEach((row) => {
        log[row.date] = {
          date: row.date,
          completedTaskIds: row.completed_task_ids || [],
          points: row.points || 0,
        };
      });
      return log;
    }

    const jsonValue = await AsyncStorage.getItem(STORAGE_KEYS.DAILY_LOG);
    return jsonValue != null ? JSON.parse(jsonValue) : {};
  } catch (e) {
    console.error('Failed to fetch daily log', e);
    return {};
  }
};

export const saveDailyLog = async (dailyLog: DailyLog) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.DAILY_LOG, JSON.stringify(dailyLog));
  } catch (e) {
    console.error('Failed to save daily log', e);
  }
};

export const updateDailyEntry = async (entry: DailyLogEntry) => {
  try {
    const user = await supabase.auth.getUser();
    if (user.data.user) {
      const { error } = await supabase.from('daily_logs').upsert({
        user_id: user.data.user.id,
        date: entry.date,
        completed_task_ids: entry.completedTaskIds,
        points: entry.points,
      });
      if (error) throw error;
      return await getDailyLog();
    }

    const dailyLog = await getDailyLog();
    dailyLog[entry.date] = entry;
    await saveDailyLog(dailyLog);
    return dailyLog;
  } catch (e) {
    console.error('Failed to update daily entry', e);
    return await getDailyLog();
  }
};

export const getDayTasks = async (dateKey: string) => {
  try {
    const jsonValue = await AsyncStorage.getItem(`${STORAGE_KEYS.DAY_TASKS_PREFIX}${dateKey}`);
    return jsonValue != null ? JSON.parse(jsonValue) : null;
  } catch (e) {
    console.error('Failed to fetch day tasks', e);
    return null;
  }
};

export const saveDayTasks = async (dateKey: string, tasks: unknown) => {
  try {
    await AsyncStorage.setItem(
      `${STORAGE_KEYS.DAY_TASKS_PREFIX}${dateKey}`,
      JSON.stringify(tasks)
    );
  } catch (e) {
    console.error('Failed to save day tasks', e);
  }
};
