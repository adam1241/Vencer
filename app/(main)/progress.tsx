import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { COLORS, SIZES } from '../../src/constants/theme';
import { getDailyLog, getStrategy, getStartDate, getDayTasks, getStrategies } from '../../src/services/storage';
import { getOnboardingProfile } from '../../src/services/onboarding';

import { DailyLog, StrategyPlan, OnboardingProfile, PlanningSnapshot } from '../../src/types/goal';
import { buildPlanningSnapshot } from '../../src/services/planningEngine';
import { useAppearance } from '../../src/context/appearance';
import { TrendingUp, TrendingDown, Minus, Brain, ChevronLeft, ChevronRight, Award, Flame, Clock, CheckCircle } from 'lucide-react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemedText as Text } from '../../src/components/ThemedText';
import { getSettings } from '../../src/services/settings';
import { getCoinsForTask, getTotalCoinsCollected } from '../../src/services/coins';
import { getAvailableCoins, getBreakDates, getShopState, isBreakDate, ShopState } from '../../src/services/shop';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const SCREEN_WIDTH = Dimensions.get('window').width;
const getTaskCoins = (task: { points?: number; durationMinutes: number; text: string }) =>
  task.points || getCoinsForTask(task.durationMinutes, task.text);

const formatDateKey = (date: Date) => date.toISOString().slice(0, 10);

// Helper to get effective date based on dayStartHour setting
const getEffectiveDate = (dayStartHour: number): Date => {
  const now = new Date();
  const currentHour = now.getHours();
  
  // If current hour is before dayStartHour, we're still in "yesterday"
  if (dayStartHour > 0 && currentHour < dayStartHour) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  }
  return now;
};

// Streak Challenge milestones
const STREAK_MILESTONES = [1, 7, 15, 30, 60];

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
};

const getColorForProgress = (percentage: number, color: string) => {
  const rgb = hexToRgb(color);
  let opacity = 0.1;

  if (percentage >= 90) opacity = 1.0;
  else if (percentage >= 60) opacity = 0.8;
  else if (percentage >= 30) opacity = 0.6;
  else if (percentage >= 10) opacity = 0.3;
  else if (percentage > 0) opacity = 0.15;
  else opacity = 0.05;

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
};

const FEEDBACK_STORAGE_KEY = 'ziel_ai_feedback';

// Habit Score Gauge Component
const HabitScoreGauge = ({ score, highlightColor, colors }: { score: number, highlightColor: string, colors: any }) => {
    const radius = 60;
    const strokeWidth = 12;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (score / 100) * circumference;
    const bgCircleColor = colors.lightGrey;
    const textColor = colors.text;

    return (
        <View style={{ width: 140, height: 140, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width="140" height="140" viewBox="0 0 140 140">
                <Circle
                    cx="70"
                    cy="70"
                    r={radius}
                    stroke={bgCircleColor}
                    strokeWidth={strokeWidth}
                    fill="transparent"
                />
                <Circle
                    cx="70"
                    cy="70"
                    r={radius}
                    stroke={highlightColor}
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    rotation="-90"
                    origin="70, 70"
                />
            </Svg>
            <View style={{ position: 'absolute', alignItems: 'center' }}>
                <Text style={{ fontSize: 32, fontWeight: '800', color: textColor }}>{score}</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>/ 100</Text>
            </View>
        </View>
    );
};

// Success/Fail Donut Chart Component
const SuccessFailDonut = ({ success, fail, pending, highlightColor, colors }: { success: number, fail: number, pending: number, highlightColor: string, colors: any }) => {
    const total = success + fail + pending;
    if (total === 0) {
        return (
            <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.textSecondary }}>No data</Text>
            </View>
        );
    }
    
    const radius = 50;
    const strokeWidth = 20;
    const circumference = 2 * Math.PI * radius;
    
    const successAngle = (success / total) * 360;
    const failAngle = (fail / total) * 360;
    
    const successDash = (success / total) * circumference;
    const failDash = (fail / total) * circumference;
    const pendingDash = (pending / total) * circumference;

    return (
        <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width="120" height="120" viewBox="0 0 120 120">
                {/* Pending (yellow) */}
                <Circle
                    cx="60"
                    cy="60"
                    r={radius}
                    stroke="#FFB800"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={`${pendingDash} ${circumference}`}
                    rotation={-90 + successAngle + failAngle}
                    origin="60, 60"
                />
                {/* Fail (red) */}
                <Circle
                    cx="60"
                    cy="60"
                    r={radius}
                    stroke="#FF6B6B"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={`${failDash} ${circumference}`}
                    rotation={-90 + successAngle}
                    origin="60, 60"
                />
                {/* Success (green) */}
                <Circle
                    cx="60"
                    cy="60"
                    r={radius}
                    stroke="#00C48C"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={`${successDash} ${circumference}`}
                    rotation={-90}
                    origin="60, 60"
                />
            </Svg>
            <View style={{ position: 'absolute', alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{total > 0 ? Math.round((success / total) * 100) : 0}%</Text>
            </View>
        </View>
    );
};

export default function ProgressScreen() {
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
  const highlightTitleStyle = !appearance.darkMode && isLightTone(highlightColor)
    ? {
        textShadowColor: 'rgba(0,0,0,0.35)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 1.2,
      }
    : null;
  const [dailyLog, setDailyLog] = useState<DailyLog>({});
  const [shopState, setShopState] = useState<ShopState | null>(null);
  const [breakDates, setBreakDates] = useState<string[]>([]);
  const [strategy, setStrategy] = useState<StrategyPlan | null>(null);
  const [onboardingProfile, setOnboardingProfile] = useState<OnboardingProfile | null>(null);
  const [startDateStr, setStartDateStr] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [strategies, setStrategies] = useState<StrategyPlan[]>([]);
  const [todayTasks, setTodayTasks] = useState<any[]>([]);
  const [dayStartHour, setDayStartHour] = useState(0);

  // Navigation State for Calendar (independent of selectedDate for viewing)
  const [viewDate, setViewDate] = useState(new Date());

  // AI Insights
  const [insights, setInsights] = useState<{ habitEffectiveness: string; weeklyFeedback: string } | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  
  // Calculated effective today based on dayStartHour
  const effectiveToday = getEffectiveDate(dayStartHour);

  // Sync Data on Focus - Load fresh data every time page comes into view
  useFocusEffect(
    useCallback(() => {
        const load = async () => {
            const [log, strat, start, prof, strats, settings, nextShopState, nextBreakDates] = await Promise.all([
                getDailyLog(),
                getStrategy(),
                getStartDate(),
                getOnboardingProfile(),
                getStrategies(),
                getSettings(),
                getShopState(),
                getBreakDates(),
            ]);
            setDailyLog(log);
            setStrategy(strat);
            setStartDateStr(start);
            setOnboardingProfile(prof);
            setStrategies(strats || []);
            setDayStartHour(settings.dayStartHour);
            setShopState(nextShopState);
            setBreakDates(nextBreakDates);

            // Load today's tasks for real-time sync with homepage using effective date
            const effectiveNow = getEffectiveDate(settings.dayStartHour);
            const todayKey = formatDateKey(effectiveNow);
            const tasks = await getDayTasks(todayKey);
            setTodayTasks(Array.isArray(tasks) ? tasks : []);

            checkAndLoadInsights(log, strats || []);
        };
        load();

        // Also refresh periodically to catch updates from focus mode
        const refreshInterval = setInterval(async () => {
            const log = await getDailyLog();
            setDailyLog(log);
            const effectiveNow = getEffectiveDate(dayStartHour);
            const todayKey = formatDateKey(effectiveNow);
            const tasks = await getDayTasks(todayKey);
            setTodayTasks(Array.isArray(tasks) ? tasks : []);
        }, 3000); // Refresh every 3 seconds

        return () => {
            clearInterval(refreshInterval);
        };
    }, [dayStartHour])
  );

  // Calculate if the app has enough data to show AI feedback
  const hasEnoughDataForFeedback = useMemo(() => {
    const entries = Object.values(dailyLog);
    const activeDays = entries.filter(e => e.points > 0).length;
    return activeDays >= 3; // Need at least 3 active days
  }, [dailyLog]);

  const checkAndLoadInsights = async (log: DailyLog, strats: StrategyPlan[]) => {
      const activeDays = Object.values(log).filter(e => e.points > 0).length;
      if (activeDays < 3) {
          setInsights(null);
          return;
      }

      // Build deterministic insights from planning snapshot
      if (strats && strats.length > 0) {
          try {
              const todayKey = formatDateKey(getEffectiveDate(dayStartHour));
              const snapshot = await buildPlanningSnapshot(strats[0], todayKey);
              const rate = Math.round(snapshot.completionRate7d * 100);
              const streak = snapshot.currentStreak;
              const missed = snapshot.missedTaskPatterns;

              let weeklyFeedback = '';
              let habitEffectiveness = '';

              if (rate >= 80) {
                  weeklyFeedback = `Strong week — ${rate}% completion rate. ${streak > 3 ? `A ${streak}-day streak shows real momentum.` : 'Keep building consistency.'}`;
                  habitEffectiveness = 'Your routine is working well. Consider increasing intensity.';
              } else if (rate >= 50) {
                  weeklyFeedback = `Decent effort at ${rate}% completion. ${missed.length > 0 ? `You tend to skip: ${missed.slice(0, 2).join(', ')}.` : 'Look for patterns in what you miss.'}`;
                  habitEffectiveness = 'Focus on never missing two days in a row. Consistency > perfection.';
              } else {
                  weeklyFeedback = `${rate}% completion this week. ${streak > 0 ? `Your ${streak}-day streak is something to build on.` : 'Try lowering the bar — show up at minimum effort.'}`;
                  habitEffectiveness = 'Switch to the Light routine. Make it so easy you can\'t say no.';
              }

              setInsights({ weeklyFeedback, habitEffectiveness });
          } catch {
              setInsights(null);
          }
      } else {
          setInsights(null);
      }
  };

  const selectedDateKey = formatDateKey(selectedDate);
  const todayKey = formatDateKey(effectiveToday);

  const stats = useMemo(() => {
    const entries = Object.values(dailyLog);
    const now = effectiveToday;
    const start = startDateStr ? new Date(startDateStr) : new Date();
    const mode = onboardingProfile?.trackingMode || 'points';
    const avgDailyTarget = onboardingProfile?.trackingTarget || 60;
    const breakSet = new Set(breakDates);
    const isCompletedDay = (key: string) => isBreakDate(key, breakSet) || (dailyLog[key]?.points || 0) > 0;
    const pointsForDate = (key: string) => (isBreakDate(key, breakSet) ? avgDailyTarget : (dailyLog[key]?.points || 0));
    // 1. Consistency Index (Last 30 Days Logic)
    const daysSinceStart = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const totalDays = Math.max(1, daysSinceStart);

    // Calculate Active Days within the relevant window
    const windowSize = Math.min(totalDays, 30);
    let activeDays = 0;
    let totalActualPoints = 0;
    for (let i = 0; i < windowSize; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = formatDateKey(d);
        if (isCompletedDay(key)) activeDays++;
        totalActualPoints += pointsForDate(key);
    }
    const consistencyIndex = Math.round((activeDays / windowSize) * 100);

    // 2. Effort Fulfillment Ratio (Last 30 Days window as well for consistency)
    // This is based on what was actually planned vs done each day
    const effortRatio = windowSize > 0 ? Math.round((totalActualPoints / (windowSize * avgDailyTarget)) * 100) : 0;

    // 3. Momentum
    let last7Points = 0;
    let prev7Points = 0;
    for (let i = 0; i < 7; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        last7Points += pointsForDate(formatDateKey(d));
    }
    for (let i = 7; i < 14; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        prev7Points += pointsForDate(formatDateKey(d));
    }

    const hasEnoughData = totalDays >= 7;
    const momentumDelta = hasEnoughData ? Math.round(((last7Points - prev7Points) / (avgDailyTarget * 7)) * 100) : 0;

    // Today's Stats (Real-time from actual tasks, not stored log)
    const currentTodayKey = formatDateKey(now);
    const todayEntry = dailyLog[currentTodayKey];
    const todayLogPoints = todayEntry?.points || 0;

    // Calculate today's actual and planned from tasks (same as homepage)
    let todayActual = 0;
    let todayPlanned = avgDailyTarget;

    if (todayTasks.length > 0) {
        const activeStrategyIds = new Set(strategies.map(s => s.id));
        const activeTasks = todayTasks.filter(t => t.strategyId && activeStrategyIds.has(t.strategyId));
        const completedTasks = activeTasks.filter(t => t.completed);

        if (mode === 'time') {
            todayActual = completedTasks.reduce((acc, t) => acc + t.durationMinutes, 0);
            todayPlanned = Math.max(activeTasks.reduce((acc, t) => acc + t.durationMinutes, 0), avgDailyTarget);
        } else if (mode === 'tasks') {
            todayActual = completedTasks.length;
            todayPlanned = Math.max(activeTasks.length, avgDailyTarget);
        } else { // points
            todayActual = completedTasks.reduce((acc, t) => acc + getTaskCoins(t), 0);
            todayPlanned = avgDailyTarget; // Use user's target
        }
    }

    // Use the maximum of actual calculation and stored log
    todayActual = Math.max(todayActual, todayLogPoints);
    const todayIsBreak = isBreakDate(currentTodayKey, breakSet);
    if (todayIsBreak) {
        todayPlanned = Math.max(todayPlanned, avgDailyTarget);
        todayActual = todayPlanned;
    }

    const todayProgress = todayPlanned > 0 ? Math.min(Math.round((todayActual / todayPlanned) * 100), 120) : 0;

    let statusLabel = "Below target";
    if (todayIsBreak) statusLabel = 'Break Day';
    else if (todayProgress >= 100) statusLabel = "Exceeded";
    else if (todayProgress >= 80) statusLabel = "On track";

    // Selected Day Stats
    const selectedEntry = dailyLog[selectedDateKey];
    let selectedPoints = selectedEntry?.points || 0;
    let selectedPlanned = avgDailyTarget;
    let selectedProgress = 0;

    if (selectedDateKey === currentTodayKey) {
        selectedPoints = todayActual;
        selectedPlanned = todayPlanned;
        selectedProgress = todayProgress;
    } else {
        if (isBreakDate(selectedDateKey, breakSet)) {
            selectedPlanned = avgDailyTarget;
            selectedPoints = avgDailyTarget;
        }
        selectedProgress = selectedPlanned > 0 ? Math.min(Math.round((selectedPoints / selectedPlanned) * 100), 120) : 0;
    }

    const isSelectedToday = selectedDateKey === currentTodayKey;
    
    // Calculate current streak
    let currentStreak = 0;
    let bestStreak = 0;
    let tempStreak = 0;
    const sortedDates = Object.keys(dailyLog).sort();
    
    // Calculate from start date to now
    for (let i = 0; i < totalDays; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = formatDateKey(d);
        const completedDay = isCompletedDay(key);
        
        if (completedDay) {
            if (i === 0 || currentStreak > 0) {
                currentStreak++;
            }
            tempStreak++;
            bestStreak = Math.max(bestStreak, tempStreak);
        } else if (i > 0) {
            if (currentStreak > 0) {
                // Streak broken
                currentStreak = tempStreak;
            }
            tempStreak = 0;
        }
    }
    
    // Calculate total times completed and total time
    let totalTimesCompleted = { week: 0, month: 0, year: 0, all: 0 };
    let totalTimeSpent = { week: 0, month: 0, year: 0, all: 0 };
    
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    entries.forEach(entry => {
        const entryDate = new Date(entry.date);
        const tasksCount = entry.completedTaskIds?.length || 0;
        const points = entry.points || 0;
        
        totalTimesCompleted.all += tasksCount;
        totalTimeSpent.all += points;
        
        if (entryDate >= oneYearAgo) {
            totalTimesCompleted.year += tasksCount;
            totalTimeSpent.year += points;
        }
        if (entryDate >= oneMonthAgo) {
            totalTimesCompleted.month += tasksCount;
            totalTimeSpent.month += points;
        }
        if (entryDate >= oneWeekAgo) {
            totalTimesCompleted.week += tasksCount;
            totalTimeSpent.week += points;
        }
    });
    
    // Calculate success/fail ratio
    let successCount = 0;
    let failCount = 0;
    let pendingCount = 0;
    
    for (let i = 0; i < totalDays; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = formatDateKey(d);
        const entry = dailyLog[key];
        
        if (isBreakDate(key, breakSet)) {
            successCount++;
        } else if (entry) {
            if (entry.points >= avgDailyTarget * 0.8) {
                successCount++;
            } else if (entry.points > 0) {
                failCount++;
            } else {
                pendingCount++;
            }
        } else {
            pendingCount++;
        }
    }
    
    // Habit Score (0-100 based on consistency and streaks)
    const habitScore = Math.min(100, Math.round(
        (consistencyIndex * 0.4) + 
        (Math.min(currentStreak / 30, 1) * 30) + 
        (effortRatio * 0.3)
    ));

    return {
        consistencyIndex,
        effortRatio,
        momentumDelta,
        hasEnoughData,
        trackingMode: mode,
        todayProgress,
        todayActual,
        todayPlanned,
        statusLabel,
        selectedPoints,
        selectedPlanned,
        selectedProgress,
        isSelectedToday,
        displayProgress: isSelectedToday ? todayProgress : selectedProgress,
        displayPoints: isSelectedToday ? todayActual : selectedPoints,
        displayPlanned: isSelectedToday ? todayPlanned : selectedPlanned,
        displayUnit: mode === 'time' ? 'min' : (mode === 'tasks' ? 'tasks' : 'coins'),
        displayStatus: isSelectedToday ? statusLabel : (isBreakDate(selectedDateKey, breakSet) ? 'Break Day' : selectedProgress >= 100 ? "Exceeded" : selectedProgress >= 80 ? "On track" : "Below target"),
        // New stats
        currentStreak,
        bestStreak,
        habitScore,
        totalTimesCompleted,
        totalTimeSpent,
        successCount,
        failCount,
        pendingCount,
        totalDays,
    };
  }, [breakDates, dailyLog, onboardingProfile, startDateStr, selectedDateKey, todayTasks, strategies, effectiveToday]);

  const totalCoinsCollected = useMemo(() => {
    return getTotalCoinsCollected(dailyLog);
  }, [dailyLog]);

  const availableCoins = useMemo(() => {
    return getAvailableCoins(
      totalCoinsCollected,
      shopState || { purchasedPackIds: [], archivedPackIds: [], activePackIds: {}, spentCoins: 0 },
    );
  }, [shopState, totalCoinsCollected]);

  const calendarData = useMemo(() => {
    // Use viewDate for the calendar grid generation
    const now = effectiveToday;
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDay = new Date(year, month, 1).getDay();
    const currentTodayKey = formatDateKey(now);
    const mode = onboardingProfile?.trackingMode || 'points';
    const avgDailyTarget = onboardingProfile?.trackingTarget || 60;
    // Calculate today's actual and planned from tasks (same as homepage)
    let todayActual = 0;
    let todayPlanned = 0;
    if (todayTasks.length > 0) {
        const activeStrategyIds = new Set(strategies.map(s => s.id));
        const activeTasks = todayTasks.filter(t => t.strategyId && activeStrategyIds.has(t.strategyId));
        const completedTasks = activeTasks.filter(t => t.completed);

        if (mode === 'time') {
            todayActual = completedTasks.reduce((acc, t) => acc + t.durationMinutes, 0);
            todayPlanned = activeTasks.reduce((acc, t) => acc + t.durationMinutes, 0);
        } else if (mode === 'tasks') {
            todayActual = completedTasks.length;
            todayPlanned = activeTasks.length;
        } else { // points
            todayActual = completedTasks.reduce((acc, t) => acc + getTaskCoins(t), 0);
            todayPlanned = activeTasks.reduce((acc, t) => acc + getTaskCoins(t), 0);
        }
    }

    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const date = new Date(year, month, day);
      const key = formatDateKey(date);
      const entry = dailyLog[key];
      const onBreak = isBreakDate(key, breakDates);
      let actual = entry?.points || 0;
      let planned = avgDailyTarget;

      // For today, use actual and planned from tasks (to sync with homepage)
      if (key === currentTodayKey) {
          actual = Math.max(todayActual, actual);
          planned = todayPlanned;
      }

      if (onBreak) {
          planned = Math.max(planned, avgDailyTarget, 1);
          actual = planned;
      }

      const percentage = planned > 0 ? Math.min((actual / planned) * 100, 120) : 0;

      // Calculate opacity similar to dashboard
      let opacity = 0;
      if (key === currentTodayKey) {
        // For today, use current progress from actual tasks
        opacity = Math.min(percentage / 100, 1);
        if (opacity === 0 && actual > 0) opacity = 0.2;
      } else if (onBreak) {
        opacity = 1;
      } else if (entry) {
        opacity = Math.min(percentage / 100, 1);
        if (opacity === 0 && entry.completedTaskIds && entry.completedTaskIds.length > 0) opacity = 0.2;
      }

      let status: 'active' | 'future' | 'nonexistant' = 'future';
      const isToday = key === currentTodayKey;
      if (startDateStr && key < startDateStr) status = 'nonexistant';
      else if (date <= now || isToday || onBreak) status = 'active';

      return { day, date, status, percentage, opacity, isToday, onBreak };
    });

    return [
      ...Array.from({ length: startDay }, () => ({ day: null, date: null, status: 'future' as const, percentage: 0, opacity: 0, isToday: false, onBreak: false })),
      ...days,
    ];
  }, [breakDates, dailyLog, onboardingProfile, startDateStr, viewDate, todayTasks, strategies, effectiveToday]);

  // Calendar Navigation Handlers
  const canGoBack = useMemo(() => {
      const prevMonthDate = new Date(viewDate);
      prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);

      // Limit to 1 month back from current real date
      const today = new Date();
      const oneMonthAgo = new Date(today.getFullYear(), today.getMonth() - 1, 1);

      // Also respect startDate
      const start = startDateStr ? new Date(startDateStr) : new Date();

      return prevMonthDate >= oneMonthAgo && (prevMonthDate >= new Date(start.getFullYear(), start.getMonth(), 1));
  }, [viewDate, startDateStr]);

  const canGoForward = useMemo(() => {
      const nextMonthDate = new Date(viewDate);
      nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
      const today = new Date();
      return nextMonthDate <= new Date(today.getFullYear(), today.getMonth() + 1, 0); // Limit to current month
  }, [viewDate]);

  const handleMonthChange = (direction: -1 | 1) => {
      if (direction === -1 && !canGoBack) return;
      if (direction === 1 && !canGoForward) return;

      const newDate = new Date(viewDate);
      newDate.setMonth(newDate.getMonth() + direction);
      setViewDate(newDate);
  };

  // Ring Component
  const ProgressRing = ({ percentage }: { percentage: number }) => {
      const radius = 36;
      const strokeWidth = 8;
      const circumference = 2 * Math.PI * radius;
      const strokeDashoffset = circumference - (percentage / 100) * circumference;
      // Use darker background circle in dark mode
      const bgCircleColor = appearance.darkMode ? colors.lightGrey : COLORS.lightGrey;
      // Text color: when highlightColor is white in dark mode, use white text for visibility on dark background
      // Otherwise, use colors.text which adapts to theme
      const textColor = (highlightColor === '#FFFFFF' || highlightColor === '#ffffff') && appearance.darkMode
        ? COLORS.white
        : (highlightColor === '#FFFFFF' || highlightColor === '#ffffff')
          ? COLORS.black
          : colors.text;

      return (
          <View style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}>
              <Svg width="80" height="80" viewBox="0 0 80 80">
                  <Circle
                      cx="40"
                      cy="40"
                      r={radius}
                      stroke={bgCircleColor}
                      strokeWidth={strokeWidth}
                      fill="transparent"
                  />
                  <Circle
                      cx="40"
                      cy="40"
                      r={radius}
                      stroke={highlightColor}
                      strokeWidth={strokeWidth}
                      fill="transparent"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      rotation="-90"
                      origin="40, 40"
                  />
              </Svg>
              <Text style={[styles.ringText, { color: textColor }]}>{percentage}%</Text>
          </View>
      );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={[styles.header, { color: highlightColor }, highlightTitleStyle]}>Analytics.</Text>
          <View style={styles.headerCoinsInline}>
            <Text style={styles.headerCoinsEmoji}>🪙</Text>
            <Text style={[styles.headerCoinsValue, { color: colors.text }]}>{availableCoins}</Text>
          </View>
        </View>

        {/* Today / Selected Performance Card */}
        <View style={[styles.todayCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={styles.todayHeader}>
                <View style={styles.titleColumn}>
                    <Text style={[styles.todayTitle, { color: colors.text }]}>
                        {stats.isSelectedToday ? "Today's" : selectedDate.toLocaleDateString()}
                    </Text>
                    <Text style={[styles.todaySubtitle, { color: colors.textSecondary }]}>
                        {stats.isSelectedToday ? "Performance" : "Performance"}
                    </Text>
                </View>
          <View style={[styles.statusBadge, { backgroundColor: highlightColor, minWidth: 100, alignItems: 'center' }]}>
              <Text style={[styles.statusText, { color: (highlightColor === '#FFFFFF' || highlightColor === '#ffffff') ? COLORS.black : colors.white }]} numberOfLines={1} adjustsFontSizeToFit>{stats.displayStatus}</Text>
          </View>
            </View>
            <View style={styles.todayBody}>
                <ProgressRing percentage={stats.displayProgress} />
                <View style={styles.todayStats}>
                    <View style={{ flex: 1, alignItems: 'center', minWidth: 0, paddingHorizontal: 4 }}>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>PLANNED</Text>
                        <Text style={[styles.statNum, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{stats.displayPlanned} {stats.displayUnit}</Text>
                    </View>
                    <View style={[styles.statDivider, { backgroundColor: colors.lightGrey }]} />
                    <View style={{ flex: 1, alignItems: 'center', minWidth: 0, paddingHorizontal: 4 }}>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>ACTUAL</Text>
                        <Text style={[styles.statNum, { color: highlightColor }]} numberOfLines={1} adjustsFontSizeToFit>{stats.displayPoints} {stats.displayUnit}</Text>
                    </View>
                </View>
            </View>
        </View>

        {/* Calendar Heatmap */}
        <View style={[styles.calendarHeaderRow]}>
            <Text style={styles.sectionTitle}>
                {viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </Text>
            <View style={styles.calendarControls}>
                <TouchableOpacity onPress={() => handleMonthChange(-1)} disabled={!canGoBack} style={{opacity: canGoBack ? 1 : 0.2}}>
                    <ChevronLeft size={24} color={colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleMonthChange(1)} disabled={!canGoForward} style={{opacity: canGoForward ? 1 : 0.2}}>
                    <ChevronRight size={24} color={colors.text} />
                </TouchableOpacity>
            </View>
        </View>

        <View style={[styles.calendarContainer, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={styles.weekHeader}>
                {DAYS.map((d, i) => (
                    <Text key={i} style={[styles.dayLabel, { color: colors.mediumGrey }]}>{d}</Text>
                ))}
            </View>
            <View style={styles.calendarGrid}>
                {calendarData.map((item, index) => (
                    <Pressable
                        key={index}
                        style={styles.dayCell}
                        onPress={() => {
                            if (item.date && item.status !== 'future' && item.status !== 'nonexistant') {
                                setSelectedDate(item.date);
                            }
                        }}
                    >
                        {item.day ? (
                          <View style={[
                              styles.dayBox,
                              { borderColor: colors.border },
                              item.status === 'active' && {
                                  backgroundColor: getColorForProgress(item.percentage, highlightColor),
                                  opacity: Math.max(0.1, item.opacity), // Always show at least faint
                                  borderColor: item.opacity >= 1 ? highlightColor : colors.border
                              },
                              item.status === 'nonexistant' && [styles.nonexistantDay, { borderColor: colors.lightGrey, backgroundColor: colors.background }],
                              // Highlight selected date
                              item.date?.toISOString().slice(0, 10) === selectedDateKey && {
                                  borderWidth: 3,
                                  borderColor: colors.text,
                                  transform: [{scale: 1.1}]
                              },
                              // Special highlight for TODAY with a ring
                              item.isToday && {
                                  borderWidth: 3,
                                  borderColor: highlightColor,
                                  shadowColor: highlightColor,
                                  shadowOffset: { width: 0, height: 0 },
                                  shadowOpacity: 0.5,
                                  shadowRadius: 4,
                                  elevation: 4,
                              }
                          ]}>
                              <Text style={[
                                  styles.dayText,
                                  { color: colors.text },
                                  item.status === 'active' && item.opacity > 0.6 && { color: colors.white },
                                  item.status === 'nonexistant' && { color: colors.lightGrey },
                                  item.isToday && { fontWeight: '800' }
                              ]}>{item.day}</Text>
                          </View>
                        ) : (
                          <View style={styles.dayBoxEmpty} />
                        )}
                    </Pressable>
                ))}
            </View>
        </View>

        {/* Habit Score - Large Circular Gauge */}
        <View style={[styles.sectionCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Habit Score</Text>
            <View style={styles.habitScoreContainer}>
                <HabitScoreGauge score={stats.habitScore} highlightColor={highlightColor} colors={colors} />
                <Text style={[styles.habitScoreLabel, { color: colors.textSecondary }]}>
                    {stats.habitScore >= 80 ? 'Excellent!' : stats.habitScore >= 60 ? 'Good progress' : stats.habitScore >= 40 ? 'Building momentum' : 'Keep going!'}
                </Text>
            </View>
        </View>

        {/* Streak Display */}
        <View style={[styles.streakContainer]}>
            <View style={[styles.streakCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Flame size={24} color={highlightColor} />
                <Text style={[styles.streakValue, { color: highlightColor }]}>{stats.currentStreak}</Text>
                <Text style={[styles.streakLabel, { color: colors.textSecondary }]}>Current Streak</Text>
            </View>
            <View style={[styles.streakCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Award size={24} color={colors.text} />
                <Text style={[styles.streakValue, { color: colors.text }]}>{stats.bestStreak}</Text>
                <Text style={[styles.streakLabel, { color: colors.textSecondary }]}>Best Streak</Text>
            </View>
        </View>

        {/* Total Time / Times Completed */}
        <View style={styles.statsGridRow}>
            <View style={[styles.statsGridCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <View style={styles.statsGridHeader}>
                    <Clock size={18} color={highlightColor} />
                    <Text style={[styles.statsGridTitle, { color: colors.text }]}>Total {stats.trackingMode === 'time' ? 'Time' : 'Points'}</Text>
                </View>
                <View style={styles.statsGridList}>
                    <View style={styles.statsGridItem}>
                        <Text style={[styles.statsGridItemLabel, { color: colors.textSecondary }]}>This week</Text>
                        <Text style={[styles.statsGridItemValue, { color: colors.text }]}>{stats.totalTimeSpent.week} {stats.displayUnit}</Text>
                    </View>
                    <View style={styles.statsGridItem}>
                        <Text style={[styles.statsGridItemLabel, { color: colors.textSecondary }]}>This month</Text>
                        <Text style={[styles.statsGridItemValue, { color: colors.text }]}>{stats.totalTimeSpent.month} {stats.displayUnit}</Text>
                    </View>
                    <View style={styles.statsGridItem}>
                        <Text style={[styles.statsGridItemLabel, { color: colors.textSecondary }]}>This year</Text>
                        <Text style={[styles.statsGridItemValue, { color: colors.text }]}>{stats.totalTimeSpent.year} {stats.displayUnit}</Text>
                    </View>
                    <View style={styles.statsGridItem}>
                        <Text style={[styles.statsGridItemLabel, { color: colors.textSecondary }]}>All time</Text>
                        <Text style={[styles.statsGridItemValue, { color: highlightColor }]}>{stats.totalTimeSpent.all} {stats.displayUnit}</Text>
                    </View>
                </View>
            </View>
            <View style={[styles.statsGridCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <View style={styles.statsGridHeader}>
                    <CheckCircle size={18} color={highlightColor} />
                    <Text style={[styles.statsGridTitle, { color: colors.text }]}>Times Completed</Text>
                </View>
                <View style={styles.statsGridList}>
                    <View style={styles.statsGridItem}>
                        <Text style={[styles.statsGridItemLabel, { color: colors.textSecondary }]}>This week</Text>
                        <Text style={[styles.statsGridItemValue, { color: colors.text }]}>{stats.totalTimesCompleted.week}</Text>
                    </View>
                    <View style={styles.statsGridItem}>
                        <Text style={[styles.statsGridItemLabel, { color: colors.textSecondary }]}>This month</Text>
                        <Text style={[styles.statsGridItemValue, { color: colors.text }]}>{stats.totalTimesCompleted.month}</Text>
                    </View>
                    <View style={styles.statsGridItem}>
                        <Text style={[styles.statsGridItemLabel, { color: colors.textSecondary }]}>This year</Text>
                        <Text style={[styles.statsGridItemValue, { color: colors.text }]}>{stats.totalTimesCompleted.year}</Text>
                    </View>
                    <View style={styles.statsGridItem}>
                        <Text style={[styles.statsGridItemLabel, { color: colors.textSecondary }]}>All time</Text>
                        <Text style={[styles.statsGridItemValue, { color: highlightColor }]}>{stats.totalTimesCompleted.all}</Text>
                    </View>
                </View>
            </View>
        </View>

        {/* Success / Fail Donut Chart */}
        <View style={[styles.sectionCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Completion Rate</Text>
            <View style={styles.donutContainer}>
                <SuccessFailDonut 
                    success={stats.successCount} 
                    fail={stats.failCount} 
                    pending={stats.pendingCount}
                    highlightColor={highlightColor}
                    colors={colors}
                />
                <View style={styles.donutLegend}>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#00C48C' }]} />
                        <Text style={[styles.legendText, { color: colors.text }]}>Success ({stats.successCount})</Text>
                    </View>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#FF6B6B' }]} />
                        <Text style={[styles.legendText, { color: colors.text }]}>Fail ({stats.failCount})</Text>
                    </View>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#FFB800' }]} />
                        <Text style={[styles.legendText, { color: colors.text }]}>Pending ({stats.pendingCount})</Text>
                    </View>
                </View>
            </View>
        </View>

        {/* Streak Challenge Badges */}
        <View style={[styles.sectionCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Streak Challenge</Text>
            <View style={styles.badgesRow}>
                {STREAK_MILESTONES.map((milestone) => {
                    const unlocked = stats.bestStreak >= milestone;
                    return (
                        <View key={milestone} style={[styles.badge, unlocked ? { backgroundColor: highlightColor } : { backgroundColor: colors.lightGrey }]}>
                            <Award size={20} color={unlocked ? (highlightColor === '#FFFFFF' || highlightColor === '#ffffff' ? COLORS.black : '#FFFFFF') : colors.mediumGrey} />
                            <Text style={[styles.badgeText, { color: unlocked ? (highlightColor === '#FFFFFF' || highlightColor === '#ffffff' ? COLORS.black : '#FFFFFF') : colors.mediumGrey }]}>{milestone}d</Text>
                        </View>
                    );
                })}
            </View>
        </View>

        {/* Overall Performance Metrics */}
        <View style={styles.metricsGrid}>
            {/* Consistency Index */}
            <View style={[styles.metricCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Consistency</Text>
                <Text style={[styles.metricValue, { color: highlightColor }]}>{stats.consistencyIndex}%</Text>
                <View style={[styles.barContainer, { backgroundColor: colors.lightGrey }]}>
                    <View style={[styles.barFill, { width: `${stats.consistencyIndex}%`, backgroundColor: highlightColor }]} />
                </View>
                <Text style={[styles.metricSub, { color: colors.textSecondary }]}>{stats.consistencyIndex}% of days you logged activity (last 30 days)</Text>
            </View>

            {/* Effort Ratio */}
            <View style={[styles.metricCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Fulfillment</Text>
                <Text style={[styles.metricValue, { color: highlightColor }]}>{stats.effortRatio}%</Text>
                <View style={[styles.barContainer, { backgroundColor: colors.lightGrey }]}>
                    <View style={[styles.barFill, { width: `${Math.min(stats.effortRatio, 100)}%`, backgroundColor: highlightColor }]} />
                </View>
                <Text style={[styles.metricSub, { color: colors.textSecondary }]}>Actual ÷ Daily Target (last 30 days)</Text>
            </View>

            {/* Momentum */}
            <View style={[styles.metricCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Momentum</Text>
                <Text style={[styles.metricValue, { color: stats.hasEnoughData ? highlightColor : colors.mediumGrey }]}>
                    {stats.hasEnoughData
                        ? `${stats.momentumDelta > 0 ? '+' : ''}${stats.momentumDelta}%`
                        : '--'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                    {stats.hasEnoughData ? (
                        stats.momentumDelta >= 0 ?
                            <TrendingUp size={16} color={highlightColor} /> :
                            <TrendingDown size={16} color={colors.textSecondary} />
                    ) : (
                        <Minus size={16} color={colors.mediumGrey} />
                    )}
                    <Text style={[styles.metricSub, { color: colors.textSecondary }]}>
                        {stats.hasEnoughData ? "(last 7 days) ÷ (previous 7 days)" : "Need 7+ days data"}
                    </Text>
                </View>
            </View>
        </View>

        {/* Goal Progress (Milestone Confidence) */}
        {strategy?.milestones && strategy.milestones.length > 0 && (
            <View style={[styles.sectionCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Milestone Confidence</Text>
                {strategy.milestones.map((m, i) => {
                    const milestoneMonthOffset = i;
                    const start = startDateStr ? new Date(startDateStr) : new Date();
                    const now = new Date();

                    const monthsSinceStart = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());

                    let confidence = 0;

                    if (monthsSinceStart > milestoneMonthOffset) {
                        confidence = stats.consistencyIndex;
                    } else if (monthsSinceStart === milestoneMonthOffset) {
                        const currentMonthEntries = Object.values(dailyLog).filter(e => {
                            const d = new Date(e.date);
                            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                        });
                        const activeDaysThisMonth = currentMonthEntries.filter(e => e.points > 0).length;
                        confidence = Math.min(Math.round((activeDaysThisMonth / 30) * 100), 100);
                    } else {
                        confidence = 0;
                    }

                    const barColor = getColorForProgress(confidence, highlightColor);

                    return (
                        <View key={i} style={[styles.milestoneRow, { borderBottomColor: colors.lightGrey }]}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.milestoneTitle, { color: colors.text }]}>{m.title}</Text>
                                <Text style={[styles.milestoneFocus, { color: colors.textSecondary }]}>{m.focus}</Text>
                            </View>
                            <View style={styles.confidenceBadge}>
                                <View style={[styles.confidenceDot, { backgroundColor: barColor }]} />
                                <Text style={[styles.confidenceText, { color: colors.textSecondary }]}>{confidence}%</Text>
                            </View>
                        </View>
                    );
                })}
            </View>
        )}

        {/* AI Weekly Feedback — only shown when enough data exists */}
        {hasEnoughDataForFeedback && (
          <View style={[styles.sectionCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={styles.cardHeaderRow}>
                  <Brain size={20} color={highlightColor} />
                  <Text style={[styles.cardTitle, { marginBottom: 0, color: colors.text }]}>Weekly Feedback</Text>
              </View>
              {loadingInsights ? (
                  <ActivityIndicator color={highlightColor} style={{ marginTop: 10 }} />
              ) : insights ? (
                  <View>
                      <Text style={[styles.feedbackText, { color: colors.text }]}>
                          "{insights.weeklyFeedback}"
                      </Text>
                      <Text style={[styles.feedbackSub, { marginTop: 8, color: colors.textSecondary }]}>
                          Insight: {insights.habitEffectiveness}
                      </Text>
                  </View>
              ) : (
                  <Text style={[styles.feedbackSub, { color: colors.textSecondary }]}>
                      Analyzing your data...
                  </Text>
              )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: SIZES.padding,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 20,
  },
  header: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 0,
    marginTop: 0,
  },
  headerCoinsInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerCoinsEmoji: {
    fontSize: 18,
  },
  headerCoinsValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  todayCard: {
      borderRadius: 16,
      borderWidth: 3,
      padding: 20,
      marginBottom: 24,
      minHeight: 180,
  },
  todayHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
  },
  titleColumn: {
      flex: 1,
  },
  todayTitle: {
      fontSize: 20,
      fontWeight: '800',
  },
  todaySubtitle: {
      fontSize: 16,
      fontWeight: '500',
  },
  statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
  },
  statusText: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
  },
  todayBody: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
  },
  ringText: {
      position: 'absolute',
      fontSize: 16,
      fontWeight: '800',
  },
  todayStats: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      flex: 1,
      paddingHorizontal: 4,
  },
  statLabel: {
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 2,
      textAlign: 'center',
      flexWrap: 'wrap',
      flexShrink: 1,
  },
  statNum: {
      fontSize: 24,
      fontWeight: '800',
      textAlign: 'center',
  },
  statDivider: {
      width: 2,
      height: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  calendarHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
  },
  calendarControls: {
      flexDirection: 'row',
      gap: 16,
  },
  calendarContainer: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 3,
    marginBottom: 16,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dayLabel: {
    width: 32,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 12,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  dayCell: {
    width: '14.28%',
    alignItems: 'center',
  },
  dayBox: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1, // Default border width
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  dayBoxEmpty: {
    width: 32,
    height: 32,
  },
  nonexistantDay: {
    borderColor: COLORS.lightGrey,
    backgroundColor: COLORS.background,
    borderWidth: 0,
  },
  nonexistantText: {
    color: COLORS.lightGrey,
  },
  dayText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.black,
  },
  detailsCard: {
      backgroundColor: COLORS.white,
      borderRadius: 16,
      borderWidth: 3,
      padding: 16,
      marginBottom: 24,
  },
  detailsTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: COLORS.black,
  },
  detailsSub: {
      fontSize: 14,
      color: COLORS.textSecondary,
      marginTop: 4,
      marginBottom: 12,
  },
  aiSnippet: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: COLORS.background,
      padding: 12,
      borderRadius: 12,
  },
  aiText: {
      fontSize: 14,
      color: COLORS.black,
      flex: 1,
      lineHeight: 20,
  },
  metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 24,
  },
  metricCard: {
      width: (SCREEN_WIDTH - SIZES.padding * 2 - 12) / 2, // 2 columns
      backgroundColor: COLORS.white,
      borderRadius: 16,
      borderWidth: 3,
      padding: 16,
  },
  metricLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: COLORS.textSecondary,
      textTransform: 'uppercase',
      marginBottom: 8,
  },
  metricValue: {
      fontSize: 24,
      fontWeight: '800',
  },
  metricSub: {
      fontSize: 12,
      color: COLORS.textSecondary,
      marginTop: 8,
  },
  barContainer: {
      height: 6,
      backgroundColor: COLORS.lightGrey,
      borderRadius: 3,
      marginTop: 8,
      overflow: 'hidden',
  },
  barFill: {
      height: '100%',
      borderRadius: 3,
  },
  sectionCard: {
      backgroundColor: COLORS.white,
      borderRadius: 16,
      borderWidth: 3,
      padding: 20,
      marginBottom: 20,
  },
  cardTitle: {
      fontSize: 18,
      fontWeight: '800',
      marginBottom: 16,
  },
  milestoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.lightGrey,
  },
  milestoneTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: COLORS.black,
  },
  milestoneFocus: {
      fontSize: 12,
      color: COLORS.textSecondary,
      marginTop: 2,
  },
  confidenceBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
  },
  confidenceDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
  },
  confidenceText: {
      fontSize: 12,
      fontWeight: '700',
      color: COLORS.textSecondary,
  },
  cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
  },
  feedbackText: {
      fontSize: 16,
      fontStyle: 'italic',
      color: COLORS.black,
      lineHeight: 24,
  },
  feedbackSub: {
      fontSize: 14,
      color: COLORS.textSecondary,
  },
  // New Analytics Styles
  habitScoreContainer: {
      alignItems: 'center',
      paddingVertical: 16,
  },
  habitScoreLabel: {
      marginTop: 12,
      fontSize: 14,
      fontWeight: '600',
  },
  streakContainer: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 20,
  },
  streakCard: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 3,
      padding: 16,
      alignItems: 'center',
      gap: 8,
  },
  streakValue: {
      fontSize: 28,
      fontWeight: '800',
  },
  streakLabel: {
      fontSize: 12,
      fontWeight: '600',
  },
  statsGridRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 20,
  },
  statsGridCard: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 3,
      padding: 14,
  },
  statsGridHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
  },
  statsGridTitle: {
      fontSize: 14,
      fontWeight: '700',
  },
  statsGridList: {
      gap: 8,
  },
  statsGridItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
  },
  statsGridItemLabel: {
      fontSize: 12,
  },
  statsGridItemValue: {
      fontSize: 14,
      fontWeight: '700',
  },
  donutContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
  },
  donutLegend: {
      flex: 1,
      paddingLeft: 20,
      gap: 12,
  },
  legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
  },
  legendDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
  },
  legendText: {
      fontSize: 14,
  },
  badgesRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8,
  },
  badge: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: 12,
      gap: 4,
  },
  badgeText: {
      fontSize: 12,
      fontWeight: '700',
  },
});
