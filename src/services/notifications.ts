import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { getSettings } from './settings';
import { getStrategies, getDayTasks } from './storage';
import { buildPlanningSnapshot } from './planningEngine';
import { PlanningSnapshot } from '../types/goal';

const NOTIFICATION_PERMISSION_KEY = 'ziel_notification_permission';

// Detect if running in Expo Go (push notifications removed in SDK 53)
const isExpoGo = Constants.appOwnership === 'expo';

// Lazy-load expo-notifications — skip entirely in Expo Go to avoid side-effect errors
let Notifications: typeof import('expo-notifications') | null = null;
let notificationsReady = false;

const getNotifications = async () => {
  if (isExpoGo) {
    return null;
  }
  if (Notifications) return Notifications;
  try {
    Notifications = await import('expo-notifications');
    if (!notificationsReady) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      notificationsReady = true;
    }
    return Notifications;
  } catch (e) {
    console.log('expo-notifications not available:', e);
    return null;
  }
};

export const requestNotificationPermissions = async (): Promise<boolean> => {
  try {
    const N = await getNotifications();
    if (!N) return false;

    const { status: existingStatus } = await N.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await N.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Notification permissions not granted');
      return false;
    }

    await AsyncStorage.setItem(NOTIFICATION_PERMISSION_KEY, 'granted');
    return true;
  } catch (e) {
    console.error('Failed to request notification permissions', e);
    return false;
  }
};

export const cancelAllNotifications = async () => {
  try {
    const N = await getNotifications();
    if (!N) return;
    await N.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    console.error('Failed to cancel notifications', e);
  }
};

// Helper to get effective date based on dayStartHour
const getEffectiveDate = (dayStartHour: number): Date => {
  const now = new Date();
  const currentHour = now.getHours();

  if (dayStartHour > 0 && currentHour < dayStartHour) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  }
  return now;
};

// Static motivational message pools (replaces AI-generated messages)
const MESSAGE_POOLS: Record<string, string[]> = {
  morning: [
    'New day, new chance to build momentum. What will you accomplish?',
    'Your goals are waiting. Start with the smallest step.',
    'Consistency beats intensity. Show up today.',
    'Yesterday is done. Today is yours to shape.',
    'The best time to start was yesterday. The next best time is now.',
  ],
  evening: [
    'How did today go? Take a moment to reflect.',
    'Even small progress is still progress. Well done.',
    'Rest well tonight — tomorrow is another opportunity.',
    'Review your day. What worked? What can improve?',
    'You showed up today. That matters more than you think.',
  ],
  hourly: [
    'Quick check — are you on track for today?',
    'Stay focused. You\'re building something great.',
    'One task at a time. You\'ve got this.',
    'Don\'t break the chain. Keep going.',
    'Progress happens in small moments like this one.',
  ],
  task_reminder: [
    'This task is waiting for you. Just start.',
    'You planned this for a reason. Make it happen.',
    'Start small if you need to — just begin.',
    'Your future self will thank you.',
    'Five minutes of effort beats zero minutes of perfection.',
  ],
  goal_reminder: [
    'Remember why you started this goal.',
    'Your goals don\'t work unless you do.',
    'Every action moves you closer to who you want to become.',
    'Discipline is choosing between what you want now and what you want most.',
    'Stay committed. Results are coming.',
  ],
};

const getMessages = async (
  context: 'morning' | 'evening' | 'hourly' | 'task_reminder' | 'goal_reminder',
  _snapshot: PlanningSnapshot | null
): Promise<string[]> => {
  return MESSAGE_POOLS[context] || MESSAGE_POOLS.hourly;
};

const pickRandom = (arr: string[]): string => arr[Math.floor(Math.random() * arr.length)] || arr[0];

export const scheduleNotifications = async () => {
  try {
    const settings = await getSettings();

    // Cancel existing notifications first
    await cancelAllNotifications();

    // Check if notifications are disabled
    if (settings.notificationMode === 'none') {
      return;
    }

    // Request permissions if not already granted
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      return;
    }

    const strategies = await getStrategies();
    if (!strategies || strategies.length === 0) {
      return;
    }

    const effectiveToday = getEffectiveDate(settings.dayStartHour);
    const todayKey = effectiveToday.toISOString().slice(0, 10);
    const tasks = await getDayTasks(todayKey);
    const taskList = Array.isArray(tasks) ? tasks : [];
    const incompleteTasks = taskList.filter((t: any) => !t.completed);

    // Build a planning snapshot from the first (primary) strategy for notifications
    let snapshot: PlanningSnapshot | null = null;
    try {
      snapshot = await buildPlanningSnapshot(strategies[0], todayKey);
    } catch (e) {
      console.log('Snapshot build failed for notifications, using fallbacks');
    }

    switch (settings.notificationMode) {
      case 'hourly':
        await scheduleHourlyNotifications(settings.dayStartHour, snapshot);
        break;
      case 'daily':
        await scheduleDailyNotification(settings.dayStartHour, snapshot);
        break;
      case 'by_task_goal':
        if (settings.notifications.goals) {
          await scheduleGoalReminders(strategies, snapshot);
        }
        if (settings.notifications.tasks) {
          await scheduleTaskReminders(incompleteTasks, snapshot);
        }
        break;
    }
  } catch (e) {
    console.error('Failed to schedule notifications', e);
  }
};

const scheduleHourlyNotifications = async (
  dayStartHour: number,
  snapshot: PlanningSnapshot | null
) => {
  const N = await getNotifications();
  if (!N) return;

  const now = new Date();
  const currentHour = now.getHours();

  const startHour = Math.max(9, dayStartHour);
  const endHour = 21;

  const messages = await getMessages('hourly', snapshot);

  for (let hour = startHour; hour <= endHour; hour++) {
    if (hour <= currentHour) continue;

    const trigger = new Date();
    trigger.setHours(hour, 0, 0, 0);

    if (trigger <= now) continue;

    await N.scheduleNotificationAsync({
      content: {
        title: 'Vencer Reminder',
        body: pickRandom(messages),
        sound: true,
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DATE,
        date: trigger,
      },
    });
  }
};

const scheduleDailyNotification = async (
  dayStartHour: number,
  snapshot: PlanningSnapshot | null
) => {
  const N = await getNotifications();
  if (!N) return;

  const morningMessages = await getMessages('morning', snapshot);
  const eveningMessages = await getMessages('evening', snapshot);

  const morningHour = Math.max(9, dayStartHour + 1);

  const morningTrigger = new Date();
  morningTrigger.setHours(morningHour, 0, 0, 0);

  if (morningTrigger <= new Date()) {
    morningTrigger.setDate(morningTrigger.getDate() + 1);
  }

  await N.scheduleNotificationAsync({
    content: {
      title: 'Good morning',
      body: pickRandom(morningMessages),
      sound: true,
    },
    trigger: {
      type: N.SchedulableTriggerInputTypes.DATE,
      date: morningTrigger,
    },
  });

  const eveningTrigger = new Date();
  eveningTrigger.setHours(19, 0, 0, 0);

  if (eveningTrigger <= new Date()) {
    eveningTrigger.setDate(eveningTrigger.getDate() + 1);
  }

  await N.scheduleNotificationAsync({
    content: {
      title: 'Evening Check-in',
      body: pickRandom(eveningMessages),
      sound: true,
    },
    trigger: {
      type: N.SchedulableTriggerInputTypes.DATE,
      date: eveningTrigger,
    },
  });
};

const scheduleGoalReminders = async (
  strategies: any[],
  snapshot: PlanningSnapshot | null
) => {
  const N = await getNotifications();
  if (!N) return;

  const now = new Date();
  const messages = await getMessages('goal_reminder', snapshot);

  for (let i = 0; i < Math.min(strategies.length, 3); i++) {
    const strategy = strategies[i];
    const reminderTime = new Date();
    reminderTime.setHours(10 + i * 3, 0, 0, 0);

    if (reminderTime <= now) {
      reminderTime.setDate(reminderTime.getDate() + 1);
    }

    await N.scheduleNotificationAsync({
      content: {
        title: `${strategy.goal?.sticker || '🎯'} ${strategy.goal?.title || 'Your Goal'}`,
        body: pickRandom(messages),
        sound: true,
        data: { goalId: strategy.id },
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DATE,
        date: reminderTime,
      },
    });
  }
};

const scheduleTaskReminders = async (
  incompleteTasks: any[],
  snapshot: PlanningSnapshot | null
) => {
  const N = await getNotifications();
  if (!N) return;

  const now = new Date();
  const baseHour = 9;

  const messages = await getMessages('task_reminder', snapshot);

  for (let i = 0; i < Math.min(incompleteTasks.length, 5); i++) {
    const task = incompleteTasks[i];
    const reminderTime = new Date();
    reminderTime.setHours(baseHour + i * 2, 30, 0, 0);

    if (reminderTime <= now) {
      reminderTime.setDate(reminderTime.getDate() + 1);
    }

    await N.scheduleNotificationAsync({
      content: {
        title: 'Task Reminder',
        body: `${task.text} — ${pickRandom(messages)}`,
        sound: true,
        data: { taskId: task.id },
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DATE,
        date: reminderTime,
      },
    });
  }
};

// Call this when app starts or settings change
export const initializeNotifications = async () => {
  await scheduleNotifications();
};

// Call this when user completes a task (to update notifications)
export const onTaskCompleted = async () => {
  await scheduleNotifications();
};
