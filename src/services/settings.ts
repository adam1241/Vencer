import AsyncStorage from '@react-native-async-storage/async-storage';

export const SETTINGS_KEYS = {
  LANGUAGE: 'ziel_settings_language',
  TIMEZONE: 'ziel_settings_timezone',
  DAY_START_HOUR: 'ziel_settings_day_start',
  WEEK_START_DAY: 'ziel_settings_week_start',
  DATA_SYNC: 'ziel_settings_data_sync',
  TEXT_SIZE: 'ziel_settings_text_size',
  AI_DATA_USAGE: 'ziel_settings_ai_usage',
  ANALYTICS_STORAGE: 'ziel_settings_analytics_storage',
  NOTIFICATION_MODE: 'ziel_settings_notification_mode',
  NOTIFICATION_GOALS: 'ziel_settings_notification_goals',
  NOTIFICATION_TASKS: 'ziel_settings_notification_tasks',
};

export type NotificationMode = 'hourly' | 'daily' | 'by_task_goal' | 'none';
export type TextSize = 'small' | 'medium' | 'large';

export type AppSettings = {
  language: string;
  timezone: string;
  dayStartHour: number; // 0-23
  weekStartDay: 'Mon' | 'Sun';
  dataSync: boolean;
  textSize: TextSize;
  aiDataUsage: boolean;
  analyticsStorage: 'local' | 'cloud';
  notificationMode: NotificationMode;
  notifications: {
    goals: boolean;
    tasks: boolean;
  };
};

const DEFAULT_SETTINGS: AppSettings = {
  language: 'English',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  dayStartHour: 0, // Midnight
  weekStartDay: 'Mon',
  dataSync: false,
  textSize: 'medium',
  aiDataUsage: true,
  analyticsStorage: 'local',
  notificationMode: 'daily',
  notifications: {
    goals: true,
    tasks: true,
  },
};

export const getSettings = async (): Promise<AppSettings> => {
  try {
    const keys = Object.values(SETTINGS_KEYS);
    const result = await AsyncStorage.multiGet(keys);
    const settings = { ...DEFAULT_SETTINGS };

    result.forEach(([key, value]) => {
      if (value !== null) {
        if (key === SETTINGS_KEYS.DAY_START_HOUR) settings.dayStartHour = parseInt(value, 10);
        else if (key === SETTINGS_KEYS.DATA_SYNC) settings.dataSync = value === 'true';
        else if (key === SETTINGS_KEYS.AI_DATA_USAGE) settings.aiDataUsage = value === 'true';
        else if (key === SETTINGS_KEYS.WEEK_START_DAY) settings.weekStartDay = value as 'Mon' | 'Sun';
        else if (key === SETTINGS_KEYS.TEXT_SIZE) settings.textSize = value as TextSize;
        else if (key === SETTINGS_KEYS.ANALYTICS_STORAGE) settings.analyticsStorage = value as 'local' | 'cloud';
        else if (key === SETTINGS_KEYS.LANGUAGE) settings.language = value;
        else if (key === SETTINGS_KEYS.TIMEZONE) settings.timezone = value;
        else if (key === SETTINGS_KEYS.NOTIFICATION_MODE) settings.notificationMode = value as NotificationMode;
        else if (key === SETTINGS_KEYS.NOTIFICATION_GOALS) settings.notifications.goals = value === 'true';
        else if (key === SETTINGS_KEYS.NOTIFICATION_TASKS) settings.notifications.tasks = value === 'true';
      }
    });
    return settings;
  } catch (e) {
    console.error('Failed to load settings', e);
    return DEFAULT_SETTINGS;
  }
};

export const saveSetting = async (key: string, value: string | boolean | number) => {
  try {
    await AsyncStorage.setItem(key, String(value));
  } catch (e) {
    console.error(`Failed to save setting ${key}`, e);
  }
};
