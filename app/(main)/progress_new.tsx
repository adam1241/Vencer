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
import { DailyLog, StrategyPlan, OnboardingProfile } from '../../src/types/goal';
import { buildPlanningSnapshot } from '../../src/services/planningEngine';
import { useAppearance } from '../../src/context/appearance';
import { TrendingUp, TrendingDown, Minus, Brain, ChevronLeft, ChevronRight } from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemedText as Text } from '../../src/components/ThemedText';
import { getCoinsForTask } from '../../src/services/coins';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const SCREEN_WIDTH = Dimensions.get('window').width;
const getTaskCoins = (task: { points?: number; durationMinutes: number; text: string }) =>
  task.points || getCoinsForTask(task.durationMinutes, task.text);

const formatDateKey = (date: Date) => date.toISOString().slice(0, 10);

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

export default function ProgressScreen() {
  const { appearance, colors } = useAppearance();
  const highlightColor = appearance.highlightColor || (appearance.darkMode ? COLORS.white : COLORS.black);
  const [dailyLog, setDailyLog] = useState<DailyLog>({});
  const [strategy, setStrategy] = useState<StrategyPlan | null>(null);
  const [onboardingProfile, setOnboardingProfile] = useState<OnboardingProfile | null>(null);
  const [startDateStr, setStartDateStr] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [strategies, setStrategies] = useState<StrategyPlan[]>([]);
  const [todayTasks, setTodayTasks] = useState<any[]>([]);

  // Navigation State for Calendar (independent of selectedDate for viewing)
  const [viewDate, setViewDate] = useState(new Date());

  // AI Insights
  const [insights, setInsights] = useState<{ habitEffectiveness: string; weeklyFeedback: string } | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  // Sync Data on Focus - Load fresh data every time page comes into view
  useFocusEffect(
    useCallback(() => {
        const load = async () => {
            const [log, strat, start, prof, strats] = await Promise.all([
                getDailyLog(),
                getStrategy(),
                getStartDate(),
                getOnboardingProfile(),
                getStrategies(),
            ]);
            setDailyLog(log);
            setStrategy(strat);
            setStartDateStr(start);
            setOnboardingProfile(prof);
            setStrategies(strats || []);

            // Load today's tasks for real-time sync with homepage
            const todayKey = formatDateKey(new Date());
            const tasks = await getDayTasks(todayKey);
            setTodayTasks(Array.isArray(tasks) ? tasks : []);

            checkAndLoadInsights(log, strats || []);
        };
        load();

        // Also refresh periodically to catch updates from focus mode
        const refreshInterval = setInterval(async () => {
            const log = await getDailyLog();
            setDailyLog(log);
            const todayKey = formatDateKey(new Date());
            const tasks = await getDayTasks(todayKey);
            setTodayTasks(Array.isArray(tasks) ? tasks : []);
        }, 3000); // Refresh every 3 seconds

        return () => {
            clearInterval(refreshInterval);
        };
    }, [])
  );

  // Calculate if the app has enough data to show AI feedback
  const hasEnoughDataForFeedback = useMemo(() => {
    const entries = Object.values(dailyLog);
    const activeDays = entries.filter(e => e.points > 0).length;
    return activeDays >= 3;
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
              const todayKey = formatDateKey(new Date());
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

  const stats = useMemo(() => {
    const entries = Object.values(dailyLog);
    const now = new Date();
    const start = startDateStr ? new Date(startDateStr) : new Date();
    const mode = onboardingProfile?.trackingMode || 'points';
    const avgDailyTarget = onboardingProfile?.trackingTarget || 60;
    // 1. Consistency Index (Last 30 Days Logic)
    const daysSinceStart = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const totalDays = Math.max(1, daysSinceStart);

    // Calculate Active Days within the relevant window
    const windowSize = Math.min(totalDays, 30);

    // Filter entries to only count those in the last `windowSize` days
    const relevantEntries = entries.filter(e => {
        const entryDate = new Date(e.date);
        const diffTime = Math.abs(now.getTime() - entryDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= windowSize;
    });

    const activeDays = relevantEntries.filter(e => e.points > 0).length;
    const consistencyIndex = Math.round((activeDays / windowSize) * 100);

    // 2. Effort Fulfillment Ratio (Last 30 Days window as well for consistency)
    // This is based on what was actually planned vs done each day
    const totalActualPoints = relevantEntries.reduce((acc, curr) => acc + curr.points, 0);
    const effortRatio = windowSize > 0 ? Math.round((totalActualPoints / (windowSize * avgDailyTarget)) * 100) : 0;

    // 3. Momentum
    let last7Points = 0;
    let prev7Points = 0;
    for (let i = 0; i < 7; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        last7Points += dailyLog[formatDateKey(d)]?.points || 0;
    }
    for (let i = 7; i < 14; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        prev7Points += dailyLog[formatDateKey(d)]?.points || 0;
    }

    const hasEnoughData = totalDays >= 7;
    const momentumDelta = hasEnoughData ? Math.round(((last7Points - prev7Points) / (avgDailyTarget * 7)) * 100) : 0;

    // Today's Stats (Real-time from actual tasks, not stored log)
    const todayKey = formatDateKey(now);
    const todayEntry = dailyLog[todayKey];
    const todayLogPoints = todayEntry?.points || 0;

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

    // Use the maximum of actual calculation and stored log
    todayActual = Math.max(todayActual, todayLogPoints);

    const todayProgress = todayPlanned > 0 ? Math.min(Math.round((todayActual / todayPlanned) * 100), 120) : 0;

    let statusLabel = "Below target";
    if (todayProgress >= 100) statusLabel = "Exceeded";
    else if (todayProgress >= 80) statusLabel = "On track";

    // Selected Day Stats
    const selectedEntry = dailyLog[selectedDateKey];
    let selectedPoints = selectedEntry?.points || 0;
    let selectedPlanned = avgDailyTarget;
    let selectedProgress = 0;

    if (selectedDateKey === todayKey) {
        selectedPoints = todayActual;
        selectedPlanned = todayPlanned;
        selectedProgress = todayProgress;
    } else {
        selectedProgress = selectedPlanned > 0 ? Math.min(Math.round((selectedPoints / selectedPlanned) * 100), 120) : 0;
    }

    const isSelectedToday = selectedDateKey === todayKey;

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
        displayStatus: isSelectedToday ? statusLabel : (selectedProgress >= 100 ? "Exceeded" : selectedProgress >= 80 ? "On track" : "Below target")
    };
  }, [dailyLog, onboardingProfile, startDateStr, selectedDateKey, todayTasks, strategies]);

  const calendarData = useMemo(() => {
    // Use viewDate for the calendar grid generation
    const now = new Date();
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDay = new Date(year, month, 1).getDay();
    const todayKey = formatDateKey(now);
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
      let actual = entry?.points || 0;
      let planned = avgDailyTarget;

      // For today, use actual and planned from tasks (to sync with homepage)
      if (key === todayKey) {
          actual = Math.max(todayActual, actual);
          planned = todayPlanned;
      }

      const percentage = planned > 0 ? Math.min((actual / planned) * 100, 120) : 0;

      // Calculate opacity similar to dashboard
      let opacity = 0;
      if (key === todayKey) {
        // For today, use current progress from actual tasks
        opacity = Math.min(percentage / 100, 1);
        if (opacity === 0 && actual > 0) opacity = 0.2;
      } else if (entry) {
        opacity = Math.min(percentage / 100, 1);
        if (opacity === 0 && entry.completedTaskIds && entry.completedTaskIds.length > 0) opacity = 0.2;
      }

      let status: 'active' | 'future' | 'nonexistant' = 'future';
      if (startDateStr && key < startDateStr) status = 'nonexistant';
      else if (date <= now) status = 'active';

      return { day, date, status, percentage, opacity };
    });

    return [
      ...Array.from({ length: startDay }, () => ({ day: null, date: null, status: 'future' as const, percentage: 0, opacity: 0 })),
      ...days,
    ];
  }, [dailyLog, onboardingProfile, startDateStr, viewDate, todayTasks, strategies]);

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
        <Text style={[styles.header, { color: highlightColor }]}>Analytics.</Text>

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
                              item.date?.toISOString().slice(0, 10) === selectedDateKey && {
                                  borderWidth: 3,
                                  borderColor: colors.border,
                                  transform: [{scale: 1.1}]
                              }
                          ]}>
                              <Text style={[
                                  styles.dayText,
                                  { color: colors.text },
                                  item.status === 'active' && item.opacity > 0.6 && { color: colors.white },
                                  item.status === 'nonexistant' && { color: colors.lightGrey }
                              ]}>{item.day}</Text>
                          </View>
                        ) : (
                          <View style={styles.dayBoxEmpty} />
                        )}
                    </Pressable>
                ))}
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
  header: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 20,
    marginTop: 20,
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
});
