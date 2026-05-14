import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, SIZES } from '../../src/constants/theme';
import { ChevronRight, Bell, LogOut, Globe, Clock, Calendar, Download, Trash2, Eye, Shield, Smartphone, Check, X, RotateCcw, Target, Sparkles } from 'lucide-react-native';
import { supabase } from '../../src/services/supabase';
import { getProfile } from '../../src/services/profile';
import { useAppearance } from '../../src/context/appearance';
import { AppearanceFontStyle, AppearanceTextSize } from '../../src/types/appearance';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSettings, saveSetting, SETTINGS_KEYS, AppSettings, NotificationMode } from '../../src/services/settings';
import { ThemedText as Text } from '../../src/components/ThemedText';
import { DEFAULT_APPEARANCE } from '../../src/services/appearance';
import { EffectPreviewLoop } from '../../src/components/CompletionEffectOverlay';
import { getDayTasks, getDailyLog, getStrategies, saveDayTasks, saveStrategy, updateDailyEntry } from '../../src/services/storage';
import {
  ShopPack,
  ShopState,
  activatePack,
  applyBreakPack,
  deactivateCategory,
  getActiveEffectPack,
  getActiveSpecialPack,
  getShopState,
  getUnlockedEffectPacks,
  getUnlockedFontPacks,
  getUnlockedSpecialPacks,
  getUnlockedThemePacks,
} from '../../src/services/shop';

const BASE_HIGHLIGHTS = ['#000000', '#FF6B6B', '#4D96FF', '#00C48C', '#FFB800', '#6C5CE7'];
const BASE_FONT_OPTIONS: { id: AppearanceFontStyle; label: string }[] = [
  { id: 'modern', label: 'System' },
  { id: 'coder', label: 'Mono' },
  { id: 'journal', label: 'Serif' },
];

const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Japanese', 'Chinese'];
const TIMEZONES = [
    'UTC', 'GMT', 'EST', 'CST', 'MST', 'PST', 
    'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Australia/Sydney'
]; // Simplified list

const DAY_START_OPTIONS = [20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6];

const getEffectiveDate = (dayStartHour: number) => {
  const now = new Date();
  if (dayStartHour > 0 && now.getHours() < dayStartHour) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  }
  return now;
};

export default function SettingsScreen() {
  const router = useRouter();
  const { appearance, setHighlightColor, setFontStyle, setTextSize, setDarkMode, colors } = useAppearance();
  const highlightColor = appearance.highlightColor || (appearance.darkMode ? COLORS.white : COLORS.black);
  const isLightTone = (color: string) => {
    const value = color.replace('#', '');
    if (value.length !== 6) return false;
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return ((r * 299) + (g * 587) + (b * 114)) / 1000 >= 170;
  };
  const activeTextColor = appearance.darkMode
    ? colors.white
    : isLightTone(highlightColor)
      ? COLORS.black
      : colors.white;
  const highlightTitleStyle = !appearance.darkMode && isLightTone(highlightColor)
    ? {
        textShadowColor: 'rgba(0,0,0,0.35)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 1.2,
      }
    : null;
  const [profile, setProfile] = useState<{ email?: string; fullName?: string; isPremium?: boolean } | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [shopState, setShopState] = useState<ShopState | null>(null);
  const [selectedSpecialPack, setSelectedSpecialPack] = useState<ShopPack | null>(null);

  // Modal States
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showTimezoneModal, setShowTimezoneModal] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    const [{ data }, dbProfile, loadedSettings, loadedShopState] = await Promise.all([
      supabase.auth.getUser(),
      getProfile(),
      getSettings(),
      getShopState(),
    ]);
    const user = data.user;
    setProfile({
      email: user?.email || '',
      fullName: dbProfile?.fullName || 'Guest',
      isPremium: Boolean(dbProfile?.isPremium),
    });
    setSettings(loadedSettings);
    setShopState(loadedShopState);
  };

  const updateSetting = async (key: string, value: any) => {
    if (!settings) return;
    setSettings(prev => {
        if (!prev) return null;
        let next = { ...prev };
        
        switch (key) {
            case SETTINGS_KEYS.LANGUAGE: next.language = value; break;
            case SETTINGS_KEYS.TIMEZONE: next.timezone = value; break;
            case SETTINGS_KEYS.DAY_START_HOUR: next.dayStartHour = value; break;
            case SETTINGS_KEYS.WEEK_START_DAY: next.weekStartDay = value; break;
            case SETTINGS_KEYS.DATA_SYNC: next.dataSync = value; break;
            case SETTINGS_KEYS.AI_DATA_USAGE: next.aiDataUsage = value; break;
            case SETTINGS_KEYS.NOTIFICATION_MODE: next.notificationMode = value; break;
            case SETTINGS_KEYS.NOTIFICATION_GOALS: next.notifications.goals = value; break;
            case SETTINGS_KEYS.NOTIFICATION_TASKS: next.notifications.tasks = value; break;
        }
        return next;
    });
    
    await saveSetting(key, value);
    
    if (key.includes('notification')) {
        try {
            const { scheduleNotifications, requestNotificationPermissions } = await import('../../src/services/notifications');
            if (value !== 'none' && key === SETTINGS_KEYS.NOTIFICATION_MODE) {
                const hasPermission = await requestNotificationPermissions();
                if (!hasPermission) {
                    Alert.alert(
                        'Notifications Disabled',
                        'Please enable notifications in your device settings to receive reminders.'
                    );
                }
            }
            await scheduleNotifications();
        } catch (e) {
            console.log('Notifications not available:', e);
        }
    }
  };

  const cycleDayStart = (direction: 'prev' | 'next') => {
      if (!settings) return;
      const currentIndex = DAY_START_OPTIONS.indexOf(settings.dayStartHour);
      let nextIndex;
      if (direction === 'next') {
          nextIndex = (currentIndex + 1) % DAY_START_OPTIONS.length;
      } else {
          nextIndex = (currentIndex - 1 + DAY_START_OPTIONS.length) % DAY_START_OPTIONS.length;
      }
      updateSetting(SETTINGS_KEYS.DAY_START_HOUR, DAY_START_OPTIONS[nextIndex]);
  };

  const handleResetAppearance = async () => {
    setHighlightColor(DEFAULT_APPEARANCE.highlightColor);
    setFontStyle(DEFAULT_APPEARANCE.fontStyle);
    setTextSize(DEFAULT_APPEARANCE.textSize);
    setDarkMode(DEFAULT_APPEARANCE.darkMode);
    const resetThemes = await deactivateCategory('themes');
    const resetFonts = await deactivateCategory('fonts');
    const resetEffects = await deactivateCategory('effects');
    setShopState({
      ...resetThemes,
      activePackIds: {
        ...resetThemes.activePackIds,
        ...resetFonts.activePackIds,
        ...resetEffects.activePackIds,
      },
    });
    Alert.alert("Appearance Reset", "Settings restored to defaults.");
  };

  const handleSignOut = async () => {
    if (profile?.email) {
      await supabase.auth.signOut();
      await AsyncStorage.clear(); 
      router.replace('/onboarding');
    } else {
      Alert.alert(
        "Exit & Reset?",
        "You are not signed in. All current data will be lost if you exit.",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Exit Anyway", 
            style: "destructive",
            onPress: async () => {
                await AsyncStorage.clear();
                router.replace('/onboarding');
            }
          }
        ]
      );
    }
  };

  const handleDeleteAccount = () => {
      Alert.alert(
          "Delete Account & Data",
          "This will permanently delete all your goals, tasks, and settings. This action cannot be undone.",
          [
              { text: "Cancel", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: async () => {
                  await AsyncStorage.clear();
                  router.replace('/onboarding');
              }}
          ]
      );
  };

  const handleExportData = async () => {
      Alert.alert("Export Data", "Generating CSV...");
  };

  const handlePrivacyInfo = () => {
    Alert.alert(
      'Privacy Policy',
      'Vencer currently keeps your plans, purchased packs, settings, and progress on this device. Your local planning data stays inside the app unless you explicitly export or sync it in a future version.',
    );
  };

  const handleTermsInfo = () => {
    Alert.alert(
      'Terms of Service',
      'Use Vencer for personal planning and progress tracking. Purchased visual packs and advantage packs are tied to this device state for now, and future online features may update how storage and sync work.',
    );
  };

  const safeShopState = shopState || { purchasedPackIds: [], archivedPackIds: [], activePackIds: {}, spentCoins: 0 };
  const purchasedThemePacks = useMemo(() => getUnlockedThemePacks(safeShopState), [safeShopState]);
  const purchasedFontPacks = useMemo(() => getUnlockedFontPacks(safeShopState), [safeShopState]);
  const purchasedEffectPacks = useMemo(() => getUnlockedEffectPacks(safeShopState), [safeShopState]);
  const purchasedSpecialPacks = useMemo(() => getUnlockedSpecialPacks(safeShopState), [safeShopState]);
  const activeEffectPack = useMemo(() => getActiveEffectPack(shopState), [shopState]);
  const activeSpecialPack = useMemo(() => getActiveSpecialPack(shopState), [shopState]);

  const highlightOptions = useMemo(() => {
    return [
      ...BASE_HIGHLIGHTS.map((color) => ({ id: color, label: null as string | null, primary: color, accent: undefined as string | undefined })),
      ...purchasedThemePacks.map((pack) => ({
        id: pack.id,
        label: pack.name,
        primary: pack.highlightColor || '#000000',
        accent: pack.accentColor,
      })),
    ];
  }, [purchasedThemePacks]);

  const fontOptions = useMemo(() => {
    const merged = [...BASE_FONT_OPTIONS];
    purchasedFontPacks.forEach((pack) => {
      if (pack.fontStyle && !merged.some((option) => option.id === pack.fontStyle)) {
        merged.push({ id: pack.fontStyle, label: pack.name });
      }
    });
    return merged;
  }, [purchasedFontPacks]);

  const applyPurchasedPack = async (pack: ShopPack) => {
    if (pack.highlightColor) {
      setHighlightColor(pack.highlightColor);
    }
    if (pack.fontStyle) {
      setFontStyle(pack.fontStyle);
    }
    const nextState = await activatePack(pack.id);
    setShopState(nextState);
  };

  const useDefaultForCategory = async (category: 'themes' | 'fonts' | 'effects' | 'special') => {
    if (category === 'themes') {
      setHighlightColor(DEFAULT_APPEARANCE.highlightColor);
    }
    if (category === 'fonts') {
      setFontStyle(DEFAULT_APPEARANCE.fontStyle);
    }
    const nextState = await deactivateCategory(category);
    setShopState(nextState);
  };

  const handleThemeSelect = async (option: { id: string; primary: string }) => {
    setHighlightColor(appearance.darkMode && option.primary === '#000000' ? '#FFFFFF' : option.primary);
    if (option.id !== option.primary) {
      const nextState = await activatePack(option.id);
      setShopState(nextState);
    } else {
      const nextState = await deactivateCategory('themes');
      setShopState(nextState);
    }
  };

  const handleFontSelect = async (option: { id: AppearanceFontStyle }) => {
    setFontStyle(option.id);
    const unlockedPack = purchasedFontPacks.find((pack) => pack.fontStyle === option.id);
    if (unlockedPack) {
      const nextState = await activatePack(unlockedPack.id);
      setShopState(nextState);
    } else {
      const nextState = await deactivateCategory('fonts');
      setShopState(nextState);
    }
  };

  const handleSpecialAction = async (pack: ShopPack) => {
    if (!settings) return;
    const effectiveDate = getEffectiveDate(settings.dayStartHour);
    const todayKey = effectiveDate.toISOString().slice(0, 10);

    if (pack.id === 'special_focus_boost') {
      const nextState = await activatePack(pack.id);
      setShopState(nextState);
      setSelectedSpecialPack(null);
      Alert.alert('Focus Boost Active', 'Today now uses the boosted reward multiplier.');
      return;
    }

    if (pack.id === 'special_streak_shield') {
      const log = await getDailyLog();
      const todayEntry = log[todayKey];
      await updateDailyEntry({
        date: todayKey,
        completedTaskIds: todayEntry?.completedTaskIds || [],
        points: Math.max(todayEntry?.points || 0, 1),
      });
      setSelectedSpecialPack(null);
      Alert.alert('Streak Protected', 'Today has been protected so your streak stays alive.');
      return;
    }

    if (pack.id === 'special_second_chance') {
      const yesterday = new Date(effectiveDate);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = yesterday.toISOString().slice(0, 10);
      const yesterdayTasks = (await getDayTasks(yesterdayKey)) as Array<any> | null;
      const todayTasks = (await getDayTasks(todayKey)) as Array<any> | null;
      const missedTask = (yesterdayTasks || []).find((task) => !task.completed);
      if (!missedTask) {
        setSelectedSpecialPack(null);
        Alert.alert('No Missed Task', 'There is no missed task from yesterday to restore.');
        return;
      }
      const nextTasks = [...(Array.isArray(todayTasks) ? todayTasks : []), { ...missedTask, id: Date.now(), completed: false }];
      await saveDayTasks(todayKey, nextTasks);
      setSelectedSpecialPack(null);
      Alert.alert('Task Restored', 'One missed task was moved into today.');
      return;
    }

    if (pack.id === 'special_time_extension') {
      const strategies = await getStrategies();
      const deadlineStrategies = strategies.filter((strategy) => strategy.goal.deadlineDate);
      if (!deadlineStrategies.length) {
        setSelectedSpecialPack(null);
        Alert.alert('No Deadlines', 'There are no deadline-based goals to extend right now.');
        return;
      }
      await Promise.all(
        deadlineStrategies.map(async (strategy) => {
          const nextDeadline = new Date(strategy.goal.deadlineDate as string);
          nextDeadline.setDate(nextDeadline.getDate() + 3);
          await saveStrategy({
            ...strategy,
            goal: {
              ...strategy.goal,
              deadlineDate: nextDeadline.toISOString().slice(0, 10),
            },
          });
        }),
      );
      setSelectedSpecialPack(null);
      Alert.alert('Time Extended', 'All active goal deadlines were moved forward by 3 days.');
      return;
    }

    if (pack.id.startsWith('special_break_')) {
      await applyBreakPack(pack.id, todayKey);
      const breakDays =
        pack.id === 'special_break_1d'
          ? 1
          : pack.id === 'special_break_3d'
            ? 3
            : pack.id === 'special_break_7d'
              ? 7
              : 30;
      setSelectedSpecialPack(null);
      Alert.alert(
        'Break Added',
        `${breakDays} day${breakDays === 1 ? '' : 's'} from today are now marked complete in your calendar and statistics.`,
      );
    }
  };

  if (!settings) return null;

  const renderPickerModal = (visible: boolean, onClose: () => void, title: string, data: string[], onSelect: (val: string) => void) => (
      <Modal visible={visible} transparent animationType="fade">
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
              <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>{title}</Text>
                  <FlatList 
                      data={data}
                      keyExtractor={(item) => item}
                      renderItem={({ item }) => (
                          <TouchableOpacity style={styles.modalItem} onPress={() => { onSelect(item); onClose(); }}>
                              <Text style={styles.modalItemText}>{item}</Text>
                              {((title === 'Language' && settings.language === item) || (title === 'Time Zone' && settings.timezone === item)) && 
                                  <Check size={20} color={highlightColor} />
                              }
                          </TouchableOpacity>
                      )}
                  />
                  <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose}>
                      <Text style={styles.modalCloseText}>Cancel</Text>
                  </TouchableOpacity>
              </View>
          </TouchableOpacity>
      </Modal>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.header, { color: highlightColor }, highlightTitleStyle]}>Settings.</Text>

        {/* 1. Account & Data */}
        <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>Account & Data</Text>
            
            <TouchableOpacity style={[styles.row, { borderBottomColor: colors.lightGrey }]} onPress={() => setShowLanguageModal(true)}>
                <View style={styles.rowLeft}>
                    <Globe size={20} color={colors.textSecondary} />
                    <Text style={[styles.rowLabel, { color: colors.text }]}>Language</Text>
                </View>
                <View style={styles.rowRight}>
                    <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{settings.language}</Text>
                    <ChevronRight size={20} color={colors.lightGrey} />
                </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.row, { borderBottomColor: colors.lightGrey }]} onPress={() => setShowTimezoneModal(true)}>
                <View style={styles.rowLeft}>
                    <Clock size={20} color={colors.textSecondary} />
                    <Text style={[styles.rowLabel, { color: colors.text }]}>Time Zone</Text>
                </View>
                <View style={styles.rowRight}>
                    <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{settings.timezone}</Text>
                    <ChevronRight size={20} color={colors.lightGrey} />
                </View>
            </TouchableOpacity>

            <View style={[styles.row, { borderBottomColor: colors.lightGrey }]}>
                <View style={styles.rowLeft}>
                    <Clock size={20} color={colors.textSecondary} />
                    <Text style={[styles.rowLabel, { color: colors.text }]}>New Day Start</Text>
                </View>
                <View style={styles.stepper}>
                    <TouchableOpacity onPress={() => cycleDayStart('prev')}>
                        <Text style={[styles.stepperBtn, { color: colors.text }]}>-</Text>
                    </TouchableOpacity>
                    <Text style={[styles.stepperValue, { color: colors.text }]}>{settings.dayStartHour}:00</Text>
                    <TouchableOpacity onPress={() => cycleDayStart('next')}>
                        <Text style={[styles.stepperBtn, { color: colors.text }]}>+</Text>
                    </TouchableOpacity>
                </View>
            </View>
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>Day transition time (8 PM - 6 AM). When the new day starts, today&apos;s plan refreshes automatically.</Text>

            <View style={[styles.row, { borderBottomColor: colors.lightGrey }]}>
                <View style={styles.rowLeft}>
                    <Calendar size={20} color={colors.textSecondary} />
                    <Text style={[styles.rowLabel, { color: colors.text }]}>Week Start</Text>
                </View>
                <View style={[styles.toggleRow, { backgroundColor: colors.lightGrey }]}>
                    <TouchableOpacity 
                        style={[styles.toggleBtn, settings.weekStartDay === 'Mon' && { backgroundColor: highlightColor, borderColor: (settings.weekStartDay === 'Mon' ? colors.border : 'transparent') }]}
                        onPress={() => updateSetting(SETTINGS_KEYS.WEEK_START_DAY, 'Mon')}
                    >
                        <Text style={[
                            styles.toggleText, 
                            { color: colors.textSecondary }, 
                            settings.weekStartDay === 'Mon' && { 
                                color: activeTextColor
                            }
                        ]}>Mon</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[styles.toggleBtn, settings.weekStartDay === 'Sun' && { backgroundColor: highlightColor, borderColor: (settings.weekStartDay === 'Sun' ? colors.border : 'transparent') }]}
                        onPress={() => updateSetting(SETTINGS_KEYS.WEEK_START_DAY, 'Sun')}
                    >
                        <Text style={[
                            styles.toggleText, 
                            { color: colors.textSecondary }, 
                            settings.weekStartDay === 'Sun' && { 
                                color: activeTextColor
                            }
                        ]}>Sun</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <TouchableOpacity style={[styles.row, { borderBottomColor: colors.lightGrey }]} onPress={handleExportData}>
                <View style={styles.rowLeft}>
                    <Download size={20} color={colors.textSecondary} />
                    <Text style={[styles.rowLabel, { color: colors.text }]}>Export Data</Text>
                </View>
                <ChevronRight size={20} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.row, { borderBottomColor: colors.lightGrey }]} onPress={() => router.push('/(main)/manage-goals')}>
                <View style={styles.rowLeft}>
                    <Target size={20} color={colors.textSecondary} />
                    <Text style={[styles.rowLabel, { color: colors.text }]}>Manage Goals</Text>
                </View>
                <ChevronRight size={20} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.row, { borderBottomColor: colors.lightGrey }]} onPress={handleDeleteAccount}>
                <View style={styles.rowLeft}>
                    <Trash2 size={20} color="red" />
                    <Text style={[styles.rowLabel, { color: 'red' }]}>Delete Data</Text>
                </View>
                <ChevronRight size={20} color={colors.textSecondary} />
            </TouchableOpacity>
        </View>

        {/* 2. Notifications */}
        <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>Notifications</Text>
            
            {(['hourly', 'daily', 'by_task_goal', 'none'] as NotificationMode[]).map((mode) => (
                <TouchableOpacity 
                    key={mode} 
                    style={[styles.radioRow, { borderBottomColor: colors.lightGrey }]}
                    onPress={() => updateSetting(SETTINGS_KEYS.NOTIFICATION_MODE, mode)}
                >
                    <View style={styles.rowLeft}>
                        <View style={[
                            styles.radioCircle, 
                            { borderColor: colors.border },
                            settings.notificationMode === mode && { borderColor: highlightColor }
                        ]}>
                            {settings.notificationMode === mode && <View style={[styles.radioDot, { backgroundColor: highlightColor }]} />}
                        </View>
                        <Text style={[styles.rowLabel, { color: colors.text }]}>
                            {mode === 'by_task_goal' ? 'By Task/Goal' : mode.charAt(0).toUpperCase() + mode.slice(1)}
                        </Text>
                    </View>
                </TouchableOpacity>
            ))}

            {settings.notificationMode === 'by_task_goal' && (
                <View style={styles.subOptions}>
                    <View style={[styles.row, { borderBottomColor: colors.lightGrey }]}>
                        <Text style={[styles.subOptionText, { color: colors.text }]}>Goal Reminders</Text>
                        <Switch
                            value={settings.notifications.goals}
                            trackColor={{ false: colors.lightGrey, true: highlightColor }}
                            thumbColor={activeTextColor}
                            onValueChange={(val) => updateSetting(SETTINGS_KEYS.NOTIFICATION_GOALS, val)}
                        />
                    </View>
                    <View style={[styles.row, { borderBottomColor: colors.lightGrey }]}>
                        <Text style={[styles.subOptionText, { color: colors.text }]}>Task Reminders</Text>
                        <Switch
                            value={settings.notifications.tasks}
                            trackColor={{ false: colors.lightGrey, true: highlightColor }}
                            thumbColor={activeTextColor}
                            onValueChange={(val) => updateSetting(SETTINGS_KEYS.NOTIFICATION_TASKS, val)}
                        />
                    </View>
                </View>
            )}
        </View>

        {/* 3. Appearance */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>Appearance</Text>
          <Text style={[styles.sectionLabel, { color: colors.text }]}>Highlight Color</Text>
          <View style={styles.paletteRow}>
            {highlightOptions.map((option) => {
              const isActive = appearance.highlightColor === option.primary;
              const isBlackInDarkMode = option.primary === '#000000' && appearance.darkMode;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: option.primary },
                    isActive 
                      ? { borderColor: colors.border, borderWidth: 3 }
                      : { borderColor: 'transparent', borderWidth: 0 },
                    isBlackInDarkMode && !isActive && { borderColor: colors.white, borderWidth: 2 },
                    option.accent ? { shadowColor: option.accent, shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } } : null,
                  ]}
                  onPress={() => handleThemeSelect(option)}
                >
                  {option.accent ? <View style={[styles.colorAccentDot, { backgroundColor: option.accent }]} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>Bought color packs appear here automatically.</Text>

          <Text style={[styles.sectionLabel, { color: colors.text }]}>Font Style</Text>
          <View style={styles.chipRow}>
            {fontOptions.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.chip,
                  { borderColor: colors.border },
                  appearance.fontStyle === option.id && {
                    backgroundColor: highlightColor,
                    borderColor: highlightColor,
                  },
                ]}
                onPress={() => handleFontSelect(option)}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: colors.text },
                    appearance.fontStyle === option.id && {
                      color: activeTextColor
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>Bought font packs appear here automatically.</Text>

          <Text style={[styles.sectionLabel, { marginTop: 12, color: colors.text }]}>Completion Effect</Text>
          <View style={styles.effectGrid}>
            <TouchableOpacity
              style={[
                styles.effectBlock,
                { borderColor: colors.border, backgroundColor: colors.card },
                !activeEffectPack && { borderColor: highlightColor, borderWidth: 3 },
              ]}
              onPress={async () => {
                await useDefaultForCategory('effects');
              }}
            >
              <View style={[styles.effectBlockStage, { backgroundColor: colors.background, borderColor: colors.lightGrey }]}>
                <Text style={[styles.effectBlockHint, { color: colors.textSecondary }]}>No animation</Text>
              </View>
              <Text style={[styles.effectBlockLabel, { color: colors.text }]}>Classic</Text>
            </TouchableOpacity>

            {purchasedEffectPacks.map((pack) => {
              const isActive = activeEffectPack?.id === pack.id;
              return (
                <TouchableOpacity
                  key={pack.id}
                  style={[
                    styles.effectBlock,
                    { borderColor: colors.border, backgroundColor: colors.card },
                    isActive && { borderColor: highlightColor, borderWidth: 3 },
                  ]}
                  onPress={async () => {
                    await applyPurchasedPack(pack);
                  }}
                >
                  <View style={[styles.effectBlockStage, { backgroundColor: colors.background, borderColor: colors.lightGrey }]}>
                    <EffectPreviewLoop effectId={pack.id} color={highlightColor} size={70} />
                  </View>
                  <Text style={[styles.effectBlockLabel, { color: colors.text }]}>{pack.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>Select the animation used when a task is completed.</Text>

          {/* Moved Text Size Here */}
          <Text style={[styles.sectionLabel, { marginTop: 12, color: colors.text }]}>Text Size</Text>
          {/* Use chipRow style instead of toggleRow for better sizing */}
          <View style={styles.chipRow}>
              {['small', 'medium', 'large'].map((size) => (
                  <TouchableOpacity 
                      key={size}
                      style={[
                          styles.chip, // Changed from toggleBtn to chip for consistent sizing
                          { paddingHorizontal: 24, paddingVertical: 10, borderColor: colors.border },
                          appearance.textSize === size && { backgroundColor: highlightColor, borderColor: highlightColor }
                      ]}
                      onPress={() => setTextSize(size as AppearanceTextSize)}
                  >
                      <Text style={[
                          styles.chipText, // Changed from toggleText
                          { color: colors.text },
                          appearance.textSize === size && { 
                            color: activeTextColor
                          }
                      ]}>{size === 'small' ? 'S' : size === 'medium' ? 'M' : 'L'}</Text>
                  </TouchableOpacity>
              ))}
          </View>

          {/* Dark Mode Toggle */}
          <View style={[styles.row, { borderBottomColor: colors.lightGrey }]}>
              <View style={styles.rowLeft}>
                  <Eye size={20} color={colors.textSecondary} />
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Dark Mode</Text>
              </View>
              <Switch
                  value={appearance.darkMode}
                  trackColor={{ false: colors.lightGrey, true: highlightColor }}
                  thumbColor={activeTextColor}
                  onValueChange={setDarkMode}
              />
          </View>
          
          {/* Default Mode Button */}
          <TouchableOpacity 
              style={[styles.outlineButton, { borderColor: colors.border, marginTop: 16 }]}
              onPress={handleResetAppearance}
          >
             <RotateCcw size={16} color={colors.border} style={{ marginRight: 8 }} />
             <Text style={[styles.outlineButtonText, { color: colors.text }]}>Default Mode</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>Advantages</Text>
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>
            Bought advantages are used here when you want them.
          </Text>

          {purchasedSpecialPacks.length > 0 ? (
            <View style={styles.specialGrid}>
              {purchasedSpecialPacks.map((pack) => {
                const isActive = activeSpecialPack?.id === pack.id;
                return (
                  <TouchableOpacity
                    key={pack.id}
                    style={[
                      styles.specialBlock,
                      { borderColor: colors.border, backgroundColor: colors.card },
                      isActive && { borderColor: highlightColor, borderWidth: 3 },
                    ]}
                    onPress={() => setSelectedSpecialPack(pack)}
                  >
                    <View style={styles.specialBlockHeader}>
                      <Sparkles size={16} color={isActive ? highlightColor : colors.textSecondary} />
                      {isActive ? <Text style={[styles.specialActiveText, { color: highlightColor }]}>Active</Text> : null}
                    </View>
                    <Text style={[styles.specialBlockTitle, { color: colors.text }]}>{pack.name}</Text>
                    <Text style={[styles.specialBlockBody, { color: colors.textSecondary }]}>{pack.preview}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={[styles.archiveEmptyText, { color: colors.textSecondary }]}>No purchased advantages yet. Available in Shop.</Text>
          )}
        </View>

        {/* 4. Privacy & Trust */}
        <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>Privacy & Trust</Text>

            <TouchableOpacity style={[styles.row, { borderBottomColor: colors.lightGrey }]} onPress={handlePrivacyInfo}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>Privacy Policy</Text>
                <ChevronRight size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.row, { borderBottomColor: colors.lightGrey }]} onPress={handleTermsInfo}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>Terms of Service</Text>
                <ChevronRight size={20} color={colors.textSecondary} />
            </TouchableOpacity>
        </View>

        {/* Pro */}
        <View style={styles.section}>
            <Text style={styles.sectionHeader}>Premium</Text>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: highlightColor }]}
              onPress={() => router.push('/(main)/upgrade')}
            >
                <Text style={[styles.primaryButtonText, { color: activeTextColor }]}>
                  {profile?.isPremium ? 'Manage Vencer Pro' : 'Upgrade to Vencer Pro'}
                </Text>
            </TouchableOpacity>
        </View>

        {/* Exit */}
        <View style={[styles.section, { marginBottom: 100 }]}>
            <TouchableOpacity
              style={styles.row}
              onPress={handleSignOut}
            >
                <Text style={[styles.rowLabel, { color: 'red', fontWeight: 'bold' }]}>
                    {profile?.email ? 'Sign Out' : 'Exit App / Reset'}
                </Text>
                <LogOut size={20} color="red" />
            </TouchableOpacity>
        </View>

        {renderPickerModal(showLanguageModal, () => setShowLanguageModal(false), 'Language', LANGUAGES, (val) => updateSetting(SETTINGS_KEYS.LANGUAGE, val))}
        {renderPickerModal(showTimezoneModal, () => setShowTimezoneModal(false), 'Time Zone', TIMEZONES, (val) => updateSetting(SETTINGS_KEYS.TIMEZONE, val))}
        <Modal visible={!!selectedSpecialPack} transparent animationType="fade" onRequestClose={() => setSelectedSpecialPack(null)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedSpecialPack(null)}>
            <View style={styles.modalContent}>
              {selectedSpecialPack ? (
                <>
                  <Text style={styles.modalTitle}>Use Advantage</Text>
                  <Text style={[styles.specialModalName, { color: colors.text }]}>{selectedSpecialPack.name}</Text>
                  <Text style={[styles.specialModalBody, { color: colors.textSecondary }]}>{selectedSpecialPack.description}</Text>
                  <Text style={[styles.specialModalHint, { color: colors.textSecondary }]}>
                    {selectedSpecialPack.id === 'special_focus_boost'
                      ? 'This stays active until you choose another special.'
                      : 'Use it now or keep it ready for later.'}
                  </Text>
                  <View style={styles.specialModalActions}>
                    <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setSelectedSpecialPack(null)}>
                      <Text style={styles.modalCloseText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.specialUseButton, { backgroundColor: highlightColor }]}
                      onPress={() => handleSpecialAction(selectedSpecialPack)}
                    >
                      <Text style={[styles.specialUseText, { color: activeTextColor }]}>
                        Use
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
            </View>
          </TouchableOpacity>
        </Modal>

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
    color: COLORS.primary,
    marginBottom: 20,
    marginTop: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 16,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionLabel: {
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 10,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGrey,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
  },
  rowLabel: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '500',
  },
  rowValue: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
  },
  stepperBtn: {
      fontSize: 24,
      fontWeight: '700',
      color: COLORS.text,
      paddingHorizontal: 8,
  },
  stepperValue: {
      fontSize: 16,
      fontWeight: '600',
      color: COLORS.text,
      minWidth: 40,
      textAlign: 'center',
  },
  toggleRow: {
      flexDirection: 'row',
      backgroundColor: COLORS.lightGrey,
      borderRadius: 8,
      padding: 2,
  },
  toggleBtn: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 6,
  },
  toggleText: {
      fontSize: 14,
      fontWeight: '600',
      color: COLORS.textSecondary,
  },
  helperText: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  effectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  chip: {
    borderWidth: 3,
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '700',
  },
  chipActiveText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
  },
  paletteRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
  },
  colorAccentDot: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  primaryButton: {
    borderRadius: SIZES.radius,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 16,
  },
  outlineButton: {
    flexDirection: 'row',
    borderWidth: 3,
    borderColor: COLORS.black,
    borderRadius: 18,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineButtonText: {
    color: COLORS.black,
    fontWeight: '700',
    fontSize: 14,
  },
  modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      padding: 20,
  },
  modalContent: {
      backgroundColor: COLORS.white,
      borderRadius: 16,
      padding: 20,
      maxHeight: '70%',
  },
  modalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 16,
      textAlign: 'center',
  },
  modalItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.lightGrey,
  },
  modalItemText: {
      fontSize: 16,
      color: COLORS.black,
  },
  modalCloseBtn: {
      marginTop: 16,
      alignItems: 'center',
      padding: 12,
  },
  modalCloseText: {
      fontWeight: 'bold',
      color: COLORS.textSecondary,
  },
  radioRow: {
      paddingVertical: 12,
  },
  radioCircle: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: COLORS.lightGrey,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
  },
  radioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
  },
  subOptions: {
      paddingLeft: 30,
      marginTop: 0,
  },
  subOptionText: {
      fontSize: 14,
      color: COLORS.text,
  },
  packArchiveBlock: {
    marginTop: 8,
    gap: 10,
  },
  packRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  packRowTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  packRowSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  packActionChip: {
    minWidth: 76,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  packActionChipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  smallActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  smallActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  archiveEmptyText: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  effectBlock: {
    width: '47%',
    borderWidth: 2,
    borderRadius: 18,
    padding: 12,
    gap: 10,
  },
  effectBlockStage: {
    height: 82,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  effectBlockLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  effectBlockHint: {
    fontSize: 12,
    fontWeight: '700',
  },
  effectPreviewCard: {
    borderWidth: 2,
    borderRadius: 20,
    padding: 14,
    marginTop: 12,
  },
  effectPreviewStage: {
    height: 140,
    borderWidth: 1,
    borderRadius: 16,
    marginTop: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewStageText: {
    fontSize: 13,
    fontWeight: '600',
  },
  specialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  specialBlock: {
    width: '47%',
    borderWidth: 2,
    borderRadius: 18,
    padding: 14,
    gap: 8,
  },
  specialBlockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  specialActiveText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  specialBlockTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  specialBlockBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  specialModalName: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  specialModalBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  specialModalHint: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 8,
  },
  specialModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  specialUseButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 12,
  },
  specialUseText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
