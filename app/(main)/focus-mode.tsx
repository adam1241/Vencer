import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Animated, Modal, Pressable, SafeAreaView, StyleSheet, Text, View, TouchableOpacity, Vibration, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { COLORS, SIZES } from '../../src/constants/theme';
import { useAppearance } from '../../src/context/appearance';
import { Plus, Minus, Check, X, Clock, Play, Pause } from 'lucide-react-native';
import { getDayTasks, saveDayTasks } from '../../src/services/storage';
import { DayTask } from '../../src/types/task';
import { CompletionEffectOverlay } from '../../src/components/CompletionEffectOverlay';
import { getActiveEffectPack, getShopState, ShopState } from '../../src/services/shop';

const pad = (value: number) => value.toString().padStart(2, '0');

export default function FocusModeScreen() {
  const router = useRouter();
  const { appearance, colors } = useAppearance();
  const { task, duration, taskId } = useLocalSearchParams();
  const durationMinutes = Number(duration) || 25;
  const totalSeconds = durationMinutes * 60;

  // Track the current taskId to detect task changes
  const currentTaskIdRef = useRef<string | null>(null);

  // State
  const [remainingSeconds, setRemainingSeconds] = useState(totalSeconds);
  const [isRunning, setIsRunning] = useState(false); // Start paused
  const [showTimeModal, setShowTimeModal] = useState(true);
  const [adjustedMinutes, setAdjustedMinutes] = useState(durationMinutes);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [confettiOrigin, setConfettiOrigin] = useState<{x: number, y: number} | null>(null);
  const [shopState, setShopState] = useState<ShopState | null>(null);

  // Use highlightColor from appearance settings
  const highlightColor = appearance.highlightColor || (appearance.darkMode ? '#FFFFFF' : '#000000');

  // Determine text color for buttons with highlightColor background
  const getTextColorForHighlight = () => {
    if (highlightColor === '#FFFFFF' || highlightColor === '#ffffff') {
      return '#000000';
    }
    return '#FFFFFF';
  };

  const primaryTextColor = getTextColorForHighlight();
  const activeEffectId = getActiveEffectPack(shopState)?.id || null;

  useEffect(() => {
    getShopState().then(setShopState).catch(() => {});
  }, []);

  // Reset state when page comes into focus or when task changes
  useFocusEffect(
    useCallback(() => {
      const newTaskId = taskId as string;

      // Check if task has changed (new task or no previous task)
      const taskChanged = currentTaskIdRef.current !== newTaskId;

      // Always reset when entering the page
      if (taskChanged || currentTaskIdRef.current === null) {
        // Reset everything to initial state for new session
        setIsRunning(false);
        setShowTimeModal(true);
        setAdjustedMinutes(durationMinutes);
        setRemainingSeconds(durationMinutes * 60);
        setConfettiOrigin(null);
        currentTaskIdRef.current = newTaskId;
      }

      return () => {
        // Cleanup when leaving - reset ref so next visit is treated as fresh
        setIsRunning(false);
        setConfettiOrigin(null);
        currentTaskIdRef.current = null;
      };
    }, [taskId, durationMinutes])
  );
  
  const progress = useMemo(() => {
    const currentTotal = adjustedMinutes * 60;
    return Math.min(1, (currentTotal - remainingSeconds) / currentTotal);
  }, [remainingSeconds, adjustedMinutes]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) {
          clearInterval(id);
          // Don't auto-complete, let user click Complete
          setIsRunning(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isRunning, adjustedMinutes]);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const inkHeight = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const handleTimeConfirm = () => {
    setShowTimeModal(false);
    setRemainingSeconds(adjustedMinutes * 60);
    setIsRunning(true);
  };

  const adjustTime = (amount: number) => {
    setAdjustedMinutes((prev) => Math.max(1, Math.min(120, prev + amount)));
  };

  const handleComplete = async () => {
    setIsRunning(false);

    // Trigger confetti from center of screen
    setConfettiOrigin({ x: Dimensions.get('window').width / 2, y: Dimensions.get('window').height / 2 });
    Vibration.vibrate([50, 50, 50]);

    // Mark task as completed if taskId is provided
    if (taskId) {
      try {
        const todayKey = new Date().toISOString().slice(0, 10);
        const tasks = await getDayTasks(todayKey);
        const taskIdNum = Number(taskId);
        const safeTasks: DayTask[] = Array.isArray(tasks) ? tasks : [];

        const updatedTasks = safeTasks.map((t) =>
          t.id === taskIdNum ? { ...t, completed: true } : t
        );

        await saveDayTasks(todayKey, updatedTasks);
      } catch (error) {
        console.error('Failed to mark task as completed:', error);
      }
    }

    // Navigate back after showing confetti
    setTimeout(() => {
      router.back();
    }, 1000);
  };

  const handleGiveUp = () => {
    setIsRunning(false);
    router.back();
  };

  const formatTime = (mins: number) => {
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.inkContainer, { backgroundColor: colors.card }]}>
        <Animated.View style={[styles.inkFill, { height: inkHeight, backgroundColor: highlightColor }]} />
      </View>

      <View style={styles.content}>
        <Text style={[styles.title, { color: highlightColor }]}>Focus.</Text>
        <Text style={[styles.taskText, { color: colors.text }]}>
          {typeof task === 'string' ? task : 'Deep Work Session'}
        </Text>
        <Text style={[styles.timer, { color: colors.text }]}>
          {pad(minutes)}:{pad(seconds)}
        </Text>
        <Text style={[styles.elapsedTime, { color: colors.textSecondary }]}>
          {formatTime(adjustedMinutes - minutes)} elapsed
        </Text>

        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.controlButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setIsRunning((prev) => !prev)}
          >
            {isRunning ? (
              <Pause size={20} color={colors.text} />
            ) : (
              <Play size={20} color={colors.text} />
            )}
            <Text style={[styles.controlText, { color: colors.text }]}>
              {isRunning ? 'Pause' : 'Resume'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.controlButton, { backgroundColor: colors.card, borderColor: colors.border }]} 
            onPress={handleGiveUp}
          >
            <X size={20} color={colors.text} />
            <Text style={[styles.controlText, { color: colors.text }]}>Give Up</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.controlButton, styles.primaryButton, { backgroundColor: highlightColor, borderColor: highlightColor }]}
            onPress={handleComplete}
          >
            <Check size={20} color={primaryTextColor} />
            <Text style={[styles.controlText, styles.primaryText, { color: primaryTextColor }]}>Complete</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Time Confirmation Modal */}
      <Modal visible={showTimeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Clock size={32} color={highlightColor} style={styles.modalIcon} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Focus Time</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              Is {adjustedMinutes} minutes enough for this task?
            </Text>

            <View style={[styles.timeAdjuster, { backgroundColor: colors.background, borderColor: colors.lightGrey }]}>
              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() => adjustTime(-5)}
              >
                <Minus size={24} color={colors.text} />
                <Text style={[styles.adjustLabel, { color: colors.textSecondary }]}>-5m</Text>
              </TouchableOpacity>

              <View style={styles.timeDisplay}>
                <Text style={[styles.timeValue, { color: colors.text }]}>
                  {adjustedMinutes}
                </Text>
                <Text style={[styles.timeUnit, { color: colors.textSecondary }]}>min</Text>
              </View>

              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() => adjustTime(5)}
              >
                <Plus size={24} color={colors.text} />
                <Text style={[styles.adjustLabel, { color: colors.textSecondary }]}>+5m</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.goButton, { backgroundColor: highlightColor }]}
              onPress={handleTimeConfirm}
            >
              <Play size={20} color={primaryTextColor} />
              <Text style={[styles.goButtonText, { color: primaryTextColor }]}>Go</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Confetti Overlay */}
      {confettiOrigin && <CompletionEffectOverlay origin={confettiOrigin} color={highlightColor} effectId={activeEffectId} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inkContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  inkFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  content: {
    flex: 1,
    padding: SIZES.padding * 1.5,
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 20,
    marginTop: 20,
  },
  taskText: {
    marginTop: 8,
    fontSize: 16,
  },
  timer: {
    marginTop: 40,
    fontSize: 64,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -1,
  },
  elapsedTime: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  controls: {
    gap: 14,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 3,
    borderRadius: 22,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryButton: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  controlText: {
    fontSize: 16,
    fontWeight: '700',
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    padding: 32,
    borderRadius: 24,
    borderWidth: 3,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  modalIcon: {
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  timeAdjuster: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    marginBottom: 24,
  },
  adjustButton: {
    alignItems: 'center',
    gap: 4,
  },
  adjustLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  timeDisplay: {
    alignItems: 'center',
  },
  timeValue: {
    fontSize: 48,
    fontWeight: '800',
  },
  timeUnit: {
    fontSize: 16,
    marginTop: -4,
  },
  goButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 18,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  goButtonText: {
    fontSize: 18,
    fontWeight: '800',
  },
});
