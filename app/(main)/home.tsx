import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Vibration,
  Modal,
  Image,
  TextInput,
  LayoutAnimation,
  Platform,
  UIManager,
  Animated,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SIZES } from '../../src/constants/theme';
import {
  getDailyLog,
  getStrategies,
  getStartDate,
  updateDailyEntry,
  getDayTasks,
  saveDayTasks,
} from '../../src/services/storage';
import { Check, ChevronDown, ChevronUp, Plus, ChevronLeft, ChevronRight, MoreVertical, Timer, ArrowDown, RefreshCw, Trash2 } from 'lucide-react-native';
import { DailyLog, StrategyPlan, OnboardingProfile, DayRoutine } from '../../src/types/goal';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAppearance } from '../../src/context/appearance';
// DraggableFlatList removed to fix scroll conflicts — tasks rendered via .map()
import { DayTask, TaskBlock } from '../../src/types/task';
import { getOnboardingProfile } from '../../src/services/onboarding';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ThemedText as Text } from '../../src/components/ThemedText';
import { getSettings } from '../../src/services/settings';
import { getOrComputeDailyPlan, runWeeklyReviewIfNeeded } from '../../src/services/planningEngine';
import { getAIDailyFeedback, AIDailyFeedbackResult } from '../../src/services/aiService';
import { getCoinsForTask, getTotalCoinsCollected } from '../../src/services/coins';
import { CompletionEffectOverlay } from '../../src/components/CompletionEffectOverlay';
import { getActiveEffectPack, getAvailableCoins, getBreakDates, getCoinMultiplier, getShopState, isBreakDate, ShopState } from '../../src/services/shop';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  if (!('fabric' in global)) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const { width, height } = Dimensions.get('window');

const getTaskCoins = (task: DayTask, multiplier = 1): number =>
  Math.round((task.points || getCoinsForTask(task.durationMinutes, task.text)) * multiplier);

// Helper to get task display value based on tracking mode
const getTaskDisplayValue = (task: DayTask, trackingMode?: string, multiplier = 1): string => {
  if (trackingMode === 'points') {
    return `${getTaskCoins(task, multiplier)} coins`;
  } else if (trackingMode === 'time') {
    return `${task.durationMinutes} min`;
  } else if (trackingMode === 'tasks') {
    return '1 task';
  }
  // Default to minutes if no mode set
  return `${task.durationMinutes} min`;
};

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

const parseDurationMinutes = (text: string) => {
  const match = text.match(/(\d+)\s*(min|mins|minutes|h|hr|hours)/i);
  if (!match) return 20;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('h')) return value * 60;
  return value;
};

const inferBlock = (text: string): TaskBlock => {
  const value = text.toLowerCase();
  if (value.includes('morning')) return 'Morning';
  if (value.includes('deep') || value.includes('work') || value.includes('study')) {
    return 'Deep Work';
  }
  return 'Anytime';
};

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

export default function HomeScreen() {
  const router = useRouter();
  const { appearance, colors } = useAppearance();
  const isLightTone = (color: string) => {
    const value = color.replace('#', '');
    if (value.length !== 6) return false;
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return ((r * 299) + (g * 587) + (b * 114)) / 1000 >= 170;
  };
  
  // State
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [strategies, setStrategies] = useState<StrategyPlan[]>([]);
  const [tasks, setTasks] = useState<DayTask[]>([]);
  const [expandedStrategyId, setExpandedStrategyId] = useState<string | null>(null);
  const [onboardingProfile, setOnboardingProfile] = useState<OnboardingProfile | null>(null);
  const [startDateStr, setStartDateStr] = useState<string | null>(null);
  const [dailyLog, setDailyLog] = useState<DailyLog>({});
  const [shopState, setShopState] = useState<ShopState | null>(null);
  const [breakDates, setBreakDates] = useState<string[]>([]);
  const [dayStartHour, setDayStartHour] = useState(0);
  
  // Modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTask, setEditingTask] = useState<DayTask | null>(null);
  const [editingText, setEditingText] = useState('');
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailTask, setDetailTask] = useState<DayTask | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showMenuTask, setShowMenuTask] = useState<DayTask | null>(null);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarViewDate, setCalendarViewDate] = useState(new Date());
  const [showRoutineSelector, setShowRoutineSelector] = useState<{ strategyId: string, routines: DayRoutine[] } | null>(null);
  
  // Animation State
  const [confettiOrigin, setConfettiOrigin] = useState<{x: number, y: number} | null>(null);
  
  // Daily AI Insight
  const [dailyInsight, setDailyInsight] = useState<AIDailyFeedbackResult | null>(null);
  const effectiveTodayKeyRef = useRef('');

  // Derived - use effective date based on dayStartHour
  const effectiveToday = getEffectiveDate(dayStartHour);
  const dateKey = selectedDate.toISOString().slice(0, 10);
  const todayKey = effectiveToday.toISOString().slice(0, 10);
  const isToday = dateKey === todayKey;
  const isPast = dateKey < todayKey;
  const isFuture = dateKey > todayKey;
  const displayDate = selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const highlightColor = appearance.highlightColor || (appearance.darkMode ? COLORS.white : COLORS.black);
  const activeTextColor = appearance.darkMode
    ? colors.white
    : isLightTone(highlightColor)
      ? COLORS.black
      : colors.white;
  const coinMultiplier = useMemo(() => getCoinMultiplier(shopState), [shopState]);
  const activeEffectId = useMemo(() => getActiveEffectPack(shopState)?.id || null, [shopState]);

  // Load Data
  useFocusEffect(
    useCallback(() => {
        loadData();
    }, [dateKey])
  );

  useEffect(() => {
    effectiveTodayKeyRef.current = todayKey;
  }, [todayKey]);

  useEffect(() => {
    const interval = setInterval(() => {
      const nextEffectiveDate = getEffectiveDate(dayStartHour);
      const nextEffectiveKey = nextEffectiveDate.toISOString().slice(0, 10);
      const previousEffectiveKey = effectiveTodayKeyRef.current;
      if (nextEffectiveKey !== previousEffectiveKey) {
        effectiveTodayKeyRef.current = nextEffectiveKey;
        setDailyInsight(null);
        setSelectedDate((current) => {
          const currentKey = current.toISOString().slice(0, 10);
          return currentKey === previousEffectiveKey ? nextEffectiveDate : current;
        });
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [dayStartHour]);

  const loadData = async () => {
    const [prof, strats, start, log, settings, nextShopState, nextBreakDates] = await Promise.all([
      getOnboardingProfile(),
      getStrategies(),
      getStartDate(),
      getDailyLog(),
      getSettings(),
      getShopState(),
      getBreakDates(),
    ]);
    
    if (prof) setOnboardingProfile(prof);
    setStartDateStr(start);
    setDailyLog(log);
    setDayStartHour(settings.dayStartHour);
    setShopState(nextShopState);
    setBreakDates(nextBreakDates);
    
    // Sort strategies to keep consistent order
    const sortedStrats = (strats || []).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setStrategies(sortedStrats);

    // Initialize tasks for the day using the adaptive planning engine
    await initDayTasks(dateKey, sortedStrats);
    
    try {
      const { initializeNotifications } = await import('../../src/services/notifications');
      initializeNotifications();
    } catch (e) {
      console.log('Notifications not available');
    }
  };

  const initDayTasks = async (key: string, strats: StrategyPlan[]) => {
    let allTasks: DayTask[] = [];
    const isCurrentEffectiveDay = key === todayKey;

    if (!isCurrentEffectiveDay) {
      const stored = await getDayTasks(key);
      allTasks = Array.isArray(stored) ? stored : [];
      setTasks(allTasks);
      setExpandedStrategyId((current) => {
        if (current && strats.some((strategy) => strategy.id === current)) {
          return current;
        }
        const firstWithTasks = strats.find((strategy) =>
          allTasks.some((task) => task.strategyId === strategy.id),
        );
        return firstWithTasks?.id || strats[0]?.id || null;
      });
      return;
    }

    // Use the planning engine for each strategy – it handles AI computation,
    // caching, and fallback to static routines if AI is unavailable.
    for (const s of strats) {
      try {
        const tasksAfterCompute = await getOrComputeDailyPlan(s, key);
        allTasks = tasksAfterCompute;
      } catch (e) {
        console.log('Planning engine error for', s.goal.title, e);
        // Fallback: load whatever exists
        const stored = await getDayTasks(key);
        allTasks = Array.isArray(stored) ? stored : [];
      }
    }

    // If no strategies, load raw stored tasks (could be quick-add tasks)
    if (strats.length === 0) {
      const stored = await getDayTasks(key);
      allTasks = Array.isArray(stored) ? stored : [];
    }

    setTasks(allTasks);
    setExpandedStrategyId((current) => {
      if (current && strats.some((strategy) => strategy.id === current)) {
        return current;
      }

      const firstWithTasks = strats.find((strategy) =>
        allTasks.some((task) => task.strategyId === strategy.id),
      );

      return firstWithTasks?.id || strats[0]?.id || null;
    });

    // Run weekly review in the background (non-blocking)
    strats.forEach((s) => {
      runWeeklyReviewIfNeeded(s, key).catch(() => {});
    });

    // Fetch daily AI insight in the background (non-blocking)
    if (strats.length > 0 && key === todayKey) {
      const firstStrat = strats[0];
      const stratTasks = allTasks.filter(t => t.strategyId === firstStrat.id);
      const completedCount = stratTasks.filter(t => t.completed).length;
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const now = new Date();

      getAIDailyFeedback({
        goalTitle: firstStrat.goal.title,
        tasksCompleted: completedCount,
        tasksTotal: stratTasks.length,
        streak: 0, // Will be enriched by snapshot if available
        completionRate: stratTasks.length > 0 ? completedCount / stratTasks.length : 0,
        dayOfWeek: dayNames[now.getDay()],
        timeOfDay: now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening',
      }).then((result) => {
        if (result) setDailyInsight(result);
      }).catch(() => {});
    }
  };

  const changeRoutineForDay = async (strategyId: string, routine: DayRoutine) => {
      // 1. Remove existing tasks for this strategy for the current day (if any are uncompleted? Or just wipe all to replace?)
      // User requested "choose the type of group". Implicitly replacing the plan for the day.
      // We should probably keep completed tasks or warn? For now, we replace *all* tasks for this strategy on this day to match the new routine.
      
      const otherTasks = tasks.filter(t => t.strategyId !== strategyId);
      const baseId = Date.now();
      let counter = 0;
      
      const newTasks = routine.habits.map(h => ({
          id: baseId + counter++,
          text: h.title,
          completed: false,
          block: inferBlock(h.title),
          durationMinutes: h.duration,
          points: h.coins || getCoinsForTask(h.duration, h.title),
          strategyId: strategyId
      }));

      const updated = [...otherTasks, ...newTasks];
      setTasks(updated);
      await saveDayTasks(dateKey, updated);
      setShowRoutineSelector(null);
  };

  // Task Management
  const toggleTask = (id: number, touchPos?: {x: number, y: number}) => {
    if (isPast) return; // Prevent toggling in the past
    if (isFuture) return; // Prevent toggling in the future
    setTasks((current) => {
      const updated = current.map((task) => {
        if (task.id === id) {
          const newState = !task.completed;
          if (newState) {
              Vibration.vibrate(30);
              if (touchPos) {
                  setConfettiOrigin(touchPos);
                  setTimeout(() => setConfettiOrigin(null), 1000);
              }
              import('../../src/services/notifications').then(({ onTaskCompleted }) => {
                onTaskCompleted();
              }).catch(() => {});
          }
          return { ...task, completed: newState };
        }
        return task;
      });
      saveDayTasks(dateKey, updated);
      updateDailyLog(updated);
      return updated;
    });
  };

  // Delete Task
  const handleDeleteTask = (taskId: number) => {
    Alert.alert(
      "Delete Task",
      "Are you sure you want to delete this task?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: () => {
            setTasks((current) => {
              const updated = current.filter((t) => t.id !== taskId);
              saveDayTasks(dateKey, updated);
              updateDailyLog(updated);
              return updated;
            });
            setShowMenuTask(null);
          }
        }
      ]
    );
  };

  const updateDailyLog = async (currentTasks: DayTask[]) => {
    // Only count active strategies
    const activeStrategyIds = new Set(strategies.map(s => s.id));
    const activeTasks = currentTasks.filter(t => t.strategyId && activeStrategyIds.has(t.strategyId));
    const completed = activeTasks.filter(t => t.completed);
    
    let points = 0;
    if (onboardingProfile?.trackingMode === 'time') {
        points = completed.reduce((acc, t) => acc + t.durationMinutes, 0);
    } else {
        points = completed.reduce((acc, t) => acc + getTaskCoins(t, coinMultiplier), 0);
    }

    await updateDailyEntry({
      date: dateKey,
      completedTaskIds: completed.map(t => t.id),
      points,
    });
    // Refresh log for calendar
    const newLog = await getDailyLog();
    setDailyLog(newLog);
  };

  const handleReschedule = async (task: DayTask) => {
    if (isPast) return;
    const tomorrow = new Date(selectedDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = tomorrow.toISOString().slice(0, 10);
    
    const existing = await getDayTasks(tomorrowKey);
    const nextTasks = Array.isArray(existing) ? existing : [];
    
    const newTask = { ...task, id: Date.now(), completed: false };
    
    await saveDayTasks(tomorrowKey, [...nextTasks, newTask]);
    
    const updatedCurrent = tasks.filter((t) => t.id !== task.id);
    setTasks(updatedCurrent);
    saveDayTasks(dateKey, updatedCurrent);
    setShowEditModal(false);
  };

  const handleSaveEdit = () => {
    if (!editingTask) return;
    const updated = tasks.map((task) =>
        task.id === editingTask.id
          ? {
              ...task,
              text: editingText.trim() || task.text,
              block: inferBlock(editingText.trim() || task.text),
              durationMinutes: parseDurationMinutes(editingText.trim() || task.text),
              points: getCoinsForTask(
                parseDurationMinutes(editingText.trim() || task.text),
                editingText.trim() || task.text,
              ),
            }
          : task
      );
    setTasks(updated);
    saveDayTasks(dateKey, updated);
    setShowEditModal(false);
    setEditingTask(null);
  };

  const handleMoveToBottom = (task: DayTask) => {
    if (isPast) return;
    setShowMenuTask(null);
    setTasks((current) => {
        const without = current.filter(t => t.id !== task.id);
        const updated = [...without, task];
        saveDayTasks(dateKey, updated); // Save order
        return updated;
    });
  };

  const handleStartFocus = (task: DayTask) => {
    setShowMenuTask(null);
    router.push({
        pathname: '/(main)/focus-mode',
        params: {
            task: task.text,
            duration: String(task.durationMinutes),
            taskId: String(task.id),
        },
    });
  };

  // Progress Calculation
  const progressStats = useMemo(() => {
    const totalCoinsTarget = tasks.reduce((acc, task) => acc + getTaskCoins(task, coinMultiplier), 0);
    const totalCoinsEarned = tasks
      .filter((task) => task.completed)
      .reduce((acc, task) => acc + getTaskCoins(task, coinMultiplier), 0);
    const remainingCoins = Math.max(totalCoinsTarget - totalCoinsEarned, 0);

    if (tasks.length === 0) {
      return {
        progress: 0,
        label: '0/0 coins',
        remaining: 'No coins planned yet',
      };
    }

    return {
      progress: totalCoinsTarget > 0 ? Math.min(totalCoinsEarned / totalCoinsTarget, 1) : 0,
      label: `${totalCoinsEarned}/${totalCoinsTarget} coins`,
      remaining: `${remainingCoins} coins left`,
    };
  }, [tasks]);

  const progressHeading = useMemo(() => {
    return 'Daily Coins';
  }, []);

  const totalCoinsCollected = useMemo(() => {
    return getTotalCoinsCollected(dailyLog);
  }, [dailyLog]);

  const availableCoins = useMemo(() => {
    return getAvailableCoins(
      totalCoinsCollected,
      shopState || { purchasedPackIds: [], archivedPackIds: [], activePackIds: {}, spentCoins: 0 },
    );
  }, [shopState, totalCoinsCollected]);

  const openCalendar = () => {
    setCalendarViewDate(selectedDate);
    setShowCalendarModal(true);
  };

  const changeCalendarMonth = (offset: number) => {
    const next = new Date(calendarViewDate);
    next.setMonth(next.getMonth() + offset, 1);

    if (startDateStr) {
      const startDate = new Date(`${startDateStr}T00:00:00`);
      const earliestMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const nextMonth = new Date(next.getFullYear(), next.getMonth(), 1);
      if (nextMonth < earliestMonth) return;
    }

    setCalendarViewDate(next);
  };

  const calendarData = useMemo(() => {
    const now = new Date();
    const currentMonth = calendarViewDate.getMonth();
    const currentYear = calendarViewDate.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const startDay = new Date(currentYear, currentMonth, 1).getDay();
    const target = onboardingProfile?.trackingTarget || 60;
    
    const activeStrategyIds = new Set(strategies.map(s => s.id));
    const activeTasks = tasks.filter(t => t.strategyId && activeStrategyIds.has(t.strategyId));

    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const date = new Date(currentYear, currentMonth, day);
      const key = date.toISOString().slice(0, 10);
      const entry = dailyLog[key];
      const onBreak = isBreakDate(key, breakDates);
      let opacity = 0;
      let status: 'future' | 'nonexistant' | 'active' = 'future';
      
      if (startDateStr && key < startDateStr) {
        status = 'nonexistant';
      } else if (date <= now || key === todayKey || onBreak) {
        status = 'active';
        if (onBreak) {
            opacity = 1;
        } else if (key === todayKey) {
            const doneTasks = activeTasks.filter(t => t.completed);
            let currentPoints = 0;
            if (onboardingProfile?.trackingMode === 'time') {
                 currentPoints = doneTasks.reduce((acc, t) => acc + t.durationMinutes, 0);
            } else {
                 currentPoints = doneTasks.reduce((acc, t) => acc + getTaskCoins(t, coinMultiplier), 0);
            }
            
            let progressRatio = currentPoints / target;
            opacity = Math.min(progressRatio, 1);
            if (opacity === 0 && doneTasks.length > 0) opacity = 0.2;

        } else if (entry) {
            let progressRatio = entry.points / target;
            opacity = Math.min(progressRatio, 1);
            if (opacity === 0 && entry.completedTaskIds.length > 0) opacity = 0.2;
        }
      }
      return { day, date, status, opacity, onBreak };
    });
    return [
      ...Array.from({ length: startDay }, () => ({ day: null, date: null, status: 'future' as const, opacity: 0, onBreak: false })),
      ...days,
    ];
  }, [breakDates, calendarViewDate, dailyLog, tasks, strategies, startDateStr, todayKey, onboardingProfile, coinMultiplier]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <View style={styles.dateRow}>
          <View style={styles.coinsInlineWrap}>
            <Text style={styles.coinsInlineEmoji}>🪙</Text>
            <Text style={[styles.coinsInlineValue, { color: colors.text }]}>{availableCoins}</Text>
          </View>
          <Pressable onPress={openCalendar} style={styles.dateContainer}>
            <Text style={[styles.date, { color: colors.text }]}>{displayDate}</Text>
          </Pressable>
          <View style={styles.dateRowRightSpacer} />
        </View>

        <View style={styles.progressRow}>
          <Text style={[styles.progressLabel, { color: colors.text }]}>{progressHeading}</Text>
          <View style={[styles.progressTube, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${progressStats.progress * 100}%`, backgroundColor: highlightColor },
              ]}
            />
          </View>
          <View style={styles.progressMetaRow}>
            <Text style={[styles.progressMetaMain, { color: colors.text }]}>{progressStats.label}</Text>
            <Text style={[styles.progressMetaSub, { color: colors.textSecondary }]}>{progressStats.remaining}</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Daily AI Insight Card */}
        {dailyInsight && strategies.length > 0 && isToday && (
          <View style={[styles.insightCard, { backgroundColor: colors.card, borderColor: highlightColor }]}>
            <Text style={styles.insightEmoji}>{dailyInsight.emoji}</Text>
            <Text style={[styles.insightText, { color: colors.text }]}>{dailyInsight.insight}</Text>
          </View>
        )}

        {strategies.length === 0 ? (
            <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No goals yet.</Text>
                <TouchableOpacity style={[styles.addGoalButton, { backgroundColor: highlightColor }]} onPress={() => router.push('/(main)/creator')}>
                    <Text style={[styles.addGoalText, { color: activeTextColor }]}>Create your first goal</Text>
                </TouchableOpacity>
            </View>
        ) : (
            strategies.map((strat) => {
                const stratTasks = tasks.filter(t => t.strategyId === strat.id);
                const isExpanded = expandedStrategyId === strat.id;
                const completedCount = stratTasks.filter(t => t.completed).length;
                const totalCount = stratTasks.length;
                const isAllDone = totalCount > 0 && completedCount === totalCount;
                
                // Calculate goal progress based on THIS strategy's tracking mode
                let goalProgressLabel = `${completedCount}/${totalCount} tasks`;
                const goalTrackingMode = strat.goal.trackingMode || onboardingProfile?.trackingMode || 'points';
                
                if (goalTrackingMode === 'time') {
                    const completedMins = stratTasks.filter(t => t.completed).reduce((acc, t) => acc + t.durationMinutes, 0);
                    const totalMins = stratTasks.reduce((acc, t) => acc + t.durationMinutes, 0);
                    goalProgressLabel = `${completedMins}/${totalMins} min`;
                } else if (goalTrackingMode === 'points') {
                    const completedPts = stratTasks.filter(t => t.completed).reduce((acc, t) => acc + getTaskCoins(t, coinMultiplier), 0);
                    const totalPts = stratTasks.reduce((acc, t) => acc + getTaskCoins(t, coinMultiplier), 0);
                    goalProgressLabel = `${completedPts}/${totalPts} coins`;
                } else {
                    goalProgressLabel = `${completedCount}/${totalCount} tasks`;
                }

                return (
                    <View 
                        key={strat.id} 
              style={[
                            styles.strategyCard, 
                            { backgroundColor: colors.card, borderColor: colors.border },
                            isPast && styles.pastCard, 
                            (isExpanded || isAllDone) && { borderColor: highlightColor },
                            isAllDone && { backgroundColor: highlightColor }
                        ]}
                    >
                        <TouchableOpacity 
                style={[
                                styles.strategyHeader,
                                { backgroundColor: colors.card },
                                (isExpanded || isAllDone) && [styles.strategyHeaderExpanded, { backgroundColor: highlightColor }],
                                isPast && styles.pastHeader
                            ]} 
                            onPress={() => {
                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                setExpandedStrategyId(isExpanded ? null : strat.id);
                            }}
                            activeOpacity={0.8}
                        >
                            <View style={styles.strategyInfo}>
                                <Text style={styles.strategyIcon}>{strat.goal.sticker || '🎯'}</Text>
                                <View>
                                    <Text style={[
                                        styles.strategyTitle, 
                                        { color: colors.text },
                                        (isExpanded || isAllDone) && { 
                                            color: activeTextColor
                                        },
                                        isPast && styles.pastText
                                    ]}>
                                        {strat.goal.title}
              </Text>
                                    {strat.goal.aiLabel ? (
                                        <Text style={[
                                            styles.strategySub,
                                            { color: colors.textSecondary },
                                            (isExpanded || isAllDone) && {
                                                color: activeTextColor
                                            },
                                            isPast && styles.pastText
                                        ]}>
                                            {strat.goal.aiLabel}
                                        </Text>
                                    ) : null}
                                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                                        <Text style={[
                                            styles.strategySub, 
                                            { color: colors.textSecondary },
                                            (isExpanded || isAllDone) && { 
                                                color: activeTextColor
                                            },
                                            isPast && styles.pastText
                                        ]}>
                                            {goalProgressLabel}
                                        </Text>
                                        {isAllDone && (
                                            <View style={[styles.doneBadge, { backgroundColor: isLightTone(highlightColor) && !appearance.darkMode ? COLORS.black : colors.white }]}>
                                                <Text style={[styles.doneBadgeText, { color: isLightTone(highlightColor) && !appearance.darkMode ? COLORS.white : highlightColor }]}>Done for today</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            </View>
                            {isExpanded ? 
                                <ChevronUp color={(isPast || isAllDone) ? activeTextColor : colors.text} /> : 
                                <ChevronDown color={isAllDone ? activeTextColor : colors.text} />
                            }
            </TouchableOpacity>

                        {isExpanded && (
                            <View style={[styles.taskList, isAllDone && { backgroundColor: colors.white }]}> 
                                
                                {/* Routine Switcher Button (if routines exist) */}
                                {strat.dayRoutines && strat.dayRoutines.length > 1 && !isPast && !isFuture && (
          <TouchableOpacity
                                        style={styles.routineSwitchBtn} 
                                        onPress={() => setShowRoutineSelector({ strategyId: strat.id, routines: strat.dayRoutines })}
          >
                                        <RefreshCw size={14} color={colors.textSecondary} />
                                        <Text style={[styles.routineSwitchText, { color: colors.textSecondary }]}>Change Day Routine</Text>
          </TouchableOpacity>
                                )}

                                {stratTasks.length === 0 ? (
                                    <Text style={[styles.noTasksText, { color: colors.textSecondary }]}>No tasks for today.</Text>
                                ) : (
                                    <View>
                                        {stratTasks.map((item) => (
                                            (isPast || isFuture) ? (
                                                <View key={item.id} style={[styles.taskRow, styles.pastRow, { backgroundColor: colors.card, borderBottomColor: colors.lightGrey }]}>
                                                    <View style={styles.taskContent}>
                                                        <Text style={[styles.taskText, styles.pastText, { color: colors.textSecondary }]}>
                                                            {item.text}
                                                        </Text>
                                                        <Text style={[styles.taskTime, styles.pastText, { color: colors.textSecondary }]}>{getTaskDisplayValue(item, strat.goal.trackingMode || onboardingProfile?.trackingMode, coinMultiplier)}</Text>
                                                    </View>
                                                    <View style={[
                                                        styles.checkbox, 
                                                        { borderColor: colors.border }, 
                                                        item.completed && [styles.checkboxCheckedPast, { backgroundColor: colors.mediumGrey }],
                                                        isFuture && { opacity: 0.4 }
                                                    ]}>
                                                        {item.completed && <Check size={14} color={colors.white} />}
                                                    </View>
                                                </View>
                                            ) : (
                                                <View key={item.id} style={[
                                                    styles.taskRow, 
                                                    { backgroundColor: colors.card, borderBottomColor: colors.lightGrey },
                                                    item.completed && styles.taskCompleted,
                                                ]}>
                                                    <View style={styles.taskContent}>
                                                        <Text style={[styles.taskText, { color: colors.text }, item.completed && styles.taskTextCompleted]}>
                                                            {item.text}
                                                        </Text>
                                                        <Text style={[styles.taskTime, { color: colors.textSecondary }]}>{getTaskDisplayValue(item, strat.goal.trackingMode || onboardingProfile?.trackingMode, coinMultiplier)}</Text>
                                                    </View>

                                                    <TouchableOpacity 
                                                        style={styles.iconButton} 
                                                        onPress={() => setShowMenuTask(item)}
                                                    >
                                                        <MoreVertical size={20} color={colors.mediumGrey} />
                                                    </TouchableOpacity>

                                                    <TouchableOpacity 
                                                        style={[
                                                            styles.checkbox, 
                                                            { borderColor: colors.border },
                                                            item.completed && [styles.checkboxChecked, { backgroundColor: highlightColor, borderColor: highlightColor }]
                                                        ]}
                                                        onPress={(e) => toggleTask(item.id, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
                                                    >
                                                        {item.completed && <Check size={14} color={activeTextColor} />}
                                                    </TouchableOpacity>
                                                </View>
                                            )
                                        ))}
                                    </View>
                                )}
                            </View>
                        )}
                    </View>
                );
            })
        )}

        {strategies.length > 0 && !isPast && (
            <TouchableOpacity style={[styles.appendGoalButton, { borderColor: highlightColor }]} onPress={() => router.push('/(main)/creator')}>
                <Plus size={20} color={highlightColor} />
                <Text style={[styles.appendGoalText, { color: highlightColor }]}>Add New Goal</Text>
            </TouchableOpacity>
        )}
      </ScrollView>

      {/* Confetti Overlay */}
      {confettiOrigin && <CompletionEffectOverlay origin={confettiOrigin} color={highlightColor} effectId={activeEffectId} />}

      {/* Calendar Modal */}
      <Modal visible={showCalendarModal} transparent animationType="fade">
        <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setShowCalendarModal(false)}
        >
            <View style={[styles.calendarModalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.calendarHeader}>
                    <TouchableOpacity style={styles.calendarMonthArrow} onPress={() => changeCalendarMonth(-1)}>
                        <ChevronLeft color={colors.text} size={18} />
                    </TouchableOpacity>
                    <Text style={[styles.calendarMonth, { color: colors.text }]}>
                        {calendarViewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </Text>
                    <TouchableOpacity style={styles.calendarMonthArrow} onPress={() => changeCalendarMonth(1)}>
                        <ChevronRight color={colors.text} size={18} />
                    </TouchableOpacity>
                </View>
                <View style={styles.weekHeader}>
                    {DAYS.map((d, i) => (
                        <Text key={i} style={[styles.dayLabel, { color: colors.mediumGrey }]}>{d}</Text>
            ))}
          </View>
                <View style={styles.calendarGrid}>
                    {calendarData.map((item, index) => (
                        <TouchableOpacity 
                            key={index} 
                            style={styles.dayCell}
                            onPress={() => {
                                if (item.date) {
                                    // Prevent before start date
                                    const pickKey = item.date.toISOString().slice(0, 10);
                                    if (startDateStr && pickKey < startDateStr) return;
                                    
                                    setSelectedDate(item.date);
                                    setShowCalendarModal(false);
                                }
                            }}
                        >
                            {item.day ? (
                              <View style={[
                                  styles.dayBox,
                                  { borderColor: colors.border },
                                  item.status === 'active' && {
                                      backgroundColor: getColorForProgress(item.opacity * 100, highlightColor),
                                      opacity: Math.max(0.1, item.opacity), // Always show at least faint
                                      borderColor: item.opacity >= 1 ? highlightColor : colors.border
                                  },
                                  item.status === 'nonexistant' && [styles.nonexistantDay, { borderColor: colors.lightGrey, backgroundColor: colors.background }],
                                  item.date?.toISOString().slice(0, 10) === dateKey && [styles.selectedDayBox, { borderColor: colors.border }]
                              ]}>
                                  <Text style={[
                                      styles.dayText,
                                      { color: colors.text },
                                      item.status === 'active' && item.opacity > 0.6 && styles.completedDayText,
                                      item.status === 'nonexistant' && { color: colors.lightGrey }
                                  ]}>{item.day}</Text>
                              </View>
                            ) : (
                              <View style={styles.dayBoxEmpty} />
                            )}
                        </TouchableOpacity>
            ))}
          </View>
            </View>
        </TouchableOpacity>
      </Modal>

      {/* Routine Selector Modal */}
      <Modal visible={!!showRoutineSelector} transparent animationType="slide">
          <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setShowRoutineSelector(null)}
          >
              <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Choose Today's Routine</Text>
                  {showRoutineSelector?.routines.map((routine) => (
                      <TouchableOpacity 
                        key={routine.id}
                        style={[styles.routineOption, { borderBottomColor: colors.lightGrey }]}
                        onPress={() => changeRoutineForDay(showRoutineSelector.strategyId, routine)}
                      >
                          <Text style={[styles.routineTitle, { color: colors.text }]}>{routine.title}</Text>
                          <Text style={[styles.routineMeta, { color: colors.textSecondary }]}>{routine.habits.length} habits • {routine.habits.reduce((acc, h) => acc + h.duration, 0)} min</Text>
                      </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => setShowRoutineSelector(null)}>
                      <Text style={[styles.btnText, { color: colors.text }]}>Cancel</Text>
                  </TouchableOpacity>
        </View>
          </TouchableOpacity>
      </Modal>

      {/* Date Picker Modal */}
      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowDatePicker(false);
            if (date) {
                // Prevent picking before start date
                const pickKey = date.toISOString().slice(0, 10);
                if (startDateStr && pickKey < startDateStr) return;
                setSelectedDate(date);
            }
          }}
        />
      )}

      {/* Task Menu Modal */}
      <Modal visible={!!showMenuTask} transparent animationType="fade">
        <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setShowMenuTask(null)}
        >
            <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TouchableOpacity 
                    style={styles.menuItem} 
                    onPress={() => showMenuTask && handleStartFocus(showMenuTask)}
                >
                    <Timer size={20} color={colors.text} />
                    <Text style={[styles.menuText, { color: colors.text }]}>Start Focus Timer</Text>
                </TouchableOpacity>
                <View style={[styles.divider, { backgroundColor: colors.lightGrey }]} />
                <TouchableOpacity 
                    style={styles.menuItem} 
                    onPress={() => showMenuTask && handleMoveToBottom(showMenuTask)}
                >
                    <ArrowDown size={20} color={colors.text} />
                    <Text style={[styles.menuText, { color: colors.text }]}>Move to Bottom</Text>
                </TouchableOpacity>
                <View style={[styles.divider, { backgroundColor: colors.lightGrey }]} />
                <TouchableOpacity 
                    style={styles.menuItem} 
                    onPress={() => showMenuTask && handleDeleteTask(showMenuTask.id)}
                >
                    <Trash2 size={20} color="#ff4444" />
                    <Text style={[styles.menuText, { color: '#ff4444' }]}>Delete Task</Text>
                </TouchableOpacity>
            </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={showEditModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Task</Text>
                <TextInput 
                    style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]} 
                    value={editingText} 
                    onChangeText={setEditingText}
                    autoFocus
                />
                <View style={styles.modalActions}>
                    <TouchableOpacity onPress={() => handleReschedule(editingTask!)} style={[styles.secondaryBtn, { borderColor: colors.border }]}>
                        <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Reschedule to Tomorrow</Text>
                    </TouchableOpacity>
                    <View style={styles.row}>
                        <TouchableOpacity onPress={() => setShowEditModal(false)} style={[styles.cancelBtn, { borderColor: colors.border }]}>
                            <Text style={[styles.btnText, { color: colors.text }]}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleSaveEdit} style={[styles.primaryBtn, { backgroundColor: highlightColor }]}>
                            <Text style={[styles.primaryBtnText, { color: colors.white }]}>Save</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </View>
      </Modal>
      
      {/* Detail Modal */}
      <Modal visible={showDetailModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{detailTask?.text}</Text>
                <Text style={[styles.detailMeta, { color: colors.textSecondary }]}>{detailTask ? getTaskDisplayValue(detailTask, strategies.find(s => s.id === detailTask.strategyId)?.goal.trackingMode || onboardingProfile?.trackingMode, coinMultiplier) : ''} • {detailTask?.block}</Text>
                <Text style={[styles.detailLabel, { color: colors.text }]}>Notes</Text>
                <Text style={[styles.detailBody, { color: colors.text }]}>No notes added.</Text>
                <TouchableOpacity 
                    style={[styles.primaryBtn, { marginTop: 20, backgroundColor: highlightColor }]} 
                    onPress={() => setShowDetailModal(false)}
                >
                    <Text style={[styles.primaryBtnText, { color: colors.white }]}>Close</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: SIZES.padding,
    paddingTop: 16,
    paddingBottom: 12,
    zIndex: 10,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 16,
  },
  coinsInlineWrap: {
    position: 'absolute',
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 64,
    zIndex: 2,
  },
  coinsInlineEmoji: {
    fontSize: 18,
  },
  coinsInlineValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  dateContainer: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '72%',
  },
  date: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  dateRowRightSpacer: {
    position: 'absolute',
    right: 0,
    width: 64,
  },
  disabledArrow: {
    opacity: 0.3,
  },
  progressRow: {
    gap: 6,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  progressTube: {
    height: 14,
    borderWidth: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  progressMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  progressMetaMain: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressMetaSub: {
    fontSize: 12,
  },
  content: {
    padding: SIZES.padding,
    gap: 16,
    paddingBottom: 100,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 40,
    gap: 16,
  },
  emptyText: {
    fontSize: 16,
  },
  addGoalButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 99,
  },
  addGoalText: {
    fontWeight: '700',
  },
  strategyCard: {
    borderWidth: 3,
    borderRadius: 18,
    overflow: 'hidden',
  },
  pastCard: {
    opacity: 0.8,
  },
  strategyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  strategyHeaderExpanded: {
    // Background set inline
  },
  pastHeader: {
    // Background set inline
  },
  strategyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  strategyIcon: {
    fontSize: 24,
  },
  strategyTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  strategyTitleExpanded: {
    color: COLORS.white,
  },
  strategySub: {
    fontSize: 12,
  },
  strategySubExpanded: {
    color: COLORS.lightGrey,
  },
  pastText: {
    // Color set inline
  },
  taskList: {
    borderTopWidth: 0,
  },
  taskScrollView: {
    // No maxHeight - tasks render inline, parent ScrollView handles scrolling
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
  },
  pastRow: {
    // Background set inline
  },
  taskCompleted: {
    // Background set inline
  },
  taskDragging: {
    opacity: 0.8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderRadius: 4, // Square
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    // Background set inline
  },
  checkboxCheckedPast: {
    // Background set inline
  },
  taskContent: {
    flex: 1,
  },
  taskText: {
    fontSize: 16,
    fontWeight: '500',
  },
  taskTextCompleted: {
    textDecorationLine: 'line-through',
  },
  taskTime: {
    fontSize: 12,
    marginTop: 2,
  },
  iconButton: {
    padding: 4,
  },
  noTasksText: {
    padding: 16,
    fontStyle: 'italic',
  },
  appendGoalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 3,
    borderRadius: 18,
    gap: 8,
    marginTop: 8,
    borderStyle: 'dashed',
  },
  appendGoalText: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    padding: 24,
    borderRadius: 24,
    borderWidth: 3,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 16,
  },
  input: {
    borderWidth: 3,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    marginBottom: 24,
  },
  modalActions: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontWeight: '700',
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 3,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnText: {
    fontWeight: '700',
  },
  secondaryBtn: {
    padding: 14,
    alignItems: 'center',
    borderWidth: 3,
    borderRadius: 12,
    marginBottom: 8,
  },
  secondaryBtnText: {
    fontWeight: '700',
  },
  swipeActions: {
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtn: {
    padding: 16,
  },
  actionText: {
    fontWeight: '700',
  },
  detailMeta: {
    marginBottom: 20,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  detailBody: {
    fontSize: 16,
  },
  menuCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 3,
    position: 'absolute',
    alignSelf: 'center',
    width: '80%',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  menuText: {
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
  calendarModalCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 3,
    marginHorizontal: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  calendarMonth: {
    fontSize: 18,
    fontWeight: '800',
  },
  calendarMonthArrow: {
    padding: 6,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  dayLabel: {
    width: 32,
    textAlign: 'center',
    color: COLORS.mediumGrey,
    fontWeight: 'bold',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
  },
  dayCell: {
    width: '14.28%',
    alignItems: 'center',
  },
  dayBox: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  selectedDayBox: {
    borderWidth: 4,
  },
  dayBoxEmpty: {
    width: 32,
    height: 32,
  },
  nonexistantDay: {
    // Colors set inline
  },
  nonexistantText: {
    // Color set inline
  },
  dayText: {
    fontSize: 14,
  },
  completedDayText: {
    color: COLORS.white,
  },
  doneBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  doneBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  routineSwitchBtn: {
      flexDirection: 'row',
    alignItems: 'center',
      gap: 6,
      padding: 10,
      justifyContent: 'center',
      borderBottomWidth: 1,
  },
  routineSwitchText: {
      fontSize: 12,
    fontWeight: '600',
  },
  routineOption: {
      padding: 16,
      borderBottomWidth: 1,
  },
  routineTitle: {
      fontSize: 16,
      fontWeight: '700',
  },
  routineMeta: {
      fontSize: 12,
      marginTop: 4,
  },
  insightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 2,
    marginBottom: 16,
    gap: 12,
  },
  insightEmoji: {
    fontSize: 24,
  },
  insightText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
});
