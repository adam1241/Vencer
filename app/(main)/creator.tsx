import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, SIZES } from '../../src/constants/theme';
import { getDayTasks, saveDayTasks, getStrategies } from '../../src/services/storage';
import { DayTask, TaskBlock } from '../../src/types/task';
import { StrategyPlan } from '../../src/types/goal';
import { useAppearance } from '../../src/context/appearance';
import { ChevronDown, Settings, Sparkles } from 'lucide-react-native';
import { ThemedText as Text } from '../../src/components/ThemedText';
import { getCoinsForTask } from '../../src/services/coins';

const inferBlock = (text: string): TaskBlock => {
  const value = text.toLowerCase();
  if (value.includes('morning')) return 'Morning';
  if (value.includes('deep') || value.includes('work') || value.includes('study')) {
    return 'Deep Work';
  }
  return 'Anytime';
};

export default function CreatorScreen() {
  const router = useRouter();
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
  const [quickTask, setQuickTask] = useState('');
  const [duration, setDuration] = useState('20'); // Default minutes
  const [strategies, setStrategies] = useState<StrategyPlan[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyPlan | null>(null);
  const [showGoalPicker, setShowGoalPicker] = useState(false);

  useEffect(() => {
    const loadGoals = async () => {
      const list = await getStrategies();
      setStrategies(list || []);
      if (list && list.length > 0) {
        setSelectedStrategy(list[0]);
      }
    };
    loadGoals();
  }, []);

  const handleQuickAdd = async () => {
    if (!quickTask.trim()) return;
    
    const todayKey = new Date().toISOString().slice(0, 10);
    const existing = await getDayTasks(todayKey);
    const list = Array.isArray(existing) ? existing : [];
    
    const taskDuration = parseInt(duration) || 20;

    const task: DayTask = {
      id: Date.now(),
      text: quickTask.trim(),
      completed: false,
      block: inferBlock(quickTask),
      durationMinutes: taskDuration,
      points: getCoinsForTask(taskDuration, quickTask.trim()),
      strategyId: selectedStrategy?.id,
    };
    
    await saveDayTasks(todayKey, [...list, task]);
    setQuickTask('');
    setDuration('20');
    Alert.alert('Added', 'Task added to today.');
    router.replace('/(main)/home');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: highlightColor }, highlightTitleStyle]}>Create Goal</Text>
          <TouchableOpacity
            style={styles.manageButton}
            onPress={() => router.push('/(main)/manage-goals')}
          >
            <Settings size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Use the same guided AI flow as onboarding to build a new realistic plan.</Text>

        <View style={[styles.heroCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={styles.heroHeader}>
            <View style={[styles.heroIconWrap, { backgroundColor: highlightColor }]}>
              <Sparkles
                size={20}
                color={activeTextColor}
              />
            </View>
            <View style={styles.heroTextWrap}>
              <Text style={[styles.heroTitle, { color: colors.text }]}>Guided AI Plan</Text>
              <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                Answer the onboarding-style questions and let Gemma build the plan for you.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: highlightColor }]}
            onPress={() => router.push('/vision-setup')}
          >
            <Text style={[styles.primaryButtonText, { color: activeTextColor }]}>Start Guided Plan</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Quick Add For Today</Text>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>Optional: add one extra task directly to today.</Text>
          
          <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Task:</Text>
              <View style={{ flex: 1 }}>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                    placeholder="Buy milk"
                    placeholderTextColor={colors.mediumGrey}
                    value={quickTask}
                    onChangeText={setQuickTask}
                  />
              </View>
          </View>

          <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Min:</Text>
              <View>
                  <TextInput
                    style={[styles.input, styles.durationInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                    placeholder="Min"
                    placeholderTextColor={colors.mediumGrey}
                    value={duration}
                    onChangeText={setDuration}
                    keyboardType="numeric"
                  />
              </View>
          </View>
          
          {strategies.length > 0 && (
            <TouchableOpacity 
                style={styles.goalSelector} 
                onPress={() => setShowGoalPicker(true)}
            >
                <Text style={[styles.goalSelectorLabel, { color: colors.text }]}>Goal:</Text>
                <View style={[styles.goalSelectorValue, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Text style={[styles.goalSelectorText, { color: colors.text }]} numberOfLines={1}>
                        {selectedStrategy?.goal?.title || 'Select a goal'}
                    </Text>
                    <ChevronDown size={16} color={colors.text} />
                </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: highlightColor }]} onPress={handleQuickAdd}>
            <Text style={[styles.primaryButtonText, { color: activeTextColor }]}>Add Task</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Goal Picker Modal */}
      <Modal visible={showGoalPicker} transparent animationType="fade">
        <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setShowGoalPicker(false)}
        >
            <View style={[styles.pickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.pickerTitle, { color: colors.text }]}>Select Goal</Text>
                <ScrollView style={{ maxHeight: 300 }}>
                    {strategies.map((strat) => (
                        <TouchableOpacity 
                            key={strat.id} 
                            style={[
                                styles.pickerItem, 
                                { backgroundColor: colors.background, borderBottomColor: colors.lightGrey },
                                selectedStrategy?.id === strat.id && { backgroundColor: highlightColor }
                            ]}
                            onPress={() => {
                                setSelectedStrategy(strat);
                                setShowGoalPicker(false);
                            }}
                        >
                            <Text style={[
                                styles.pickerItemText,
                                { color: colors.text },
                                selectedStrategy?.id === strat.id && { color: activeTextColor, fontWeight: '700' }
                            ]}>
                                {strat.goal.sticker} {strat.goal.title}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <TouchableOpacity 
                    style={[styles.closeButton, { borderColor: colors.border }]}
                    onPress={() => setShowGoalPicker(false)}
                >
                    <Text style={[styles.closeButtonText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
            </View>
        </TouchableOpacity>
      </Modal>
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
    gap: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    marginTop: 20,
    paddingHorizontal: 0,
  },
  manageButton: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
    marginBottom: 24,
  },
  card: {
    borderWidth: 3,
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
  },
  heroCard: {
    borderWidth: 3,
    borderRadius: 24,
    padding: 18,
    marginBottom: 20,
  },
  heroHeader: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 18,
  },
  heroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextWrap: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 13,
    marginBottom: 12,
  },
  inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
      gap: 8,
  },
  inputLabel: {
      fontSize: 14,
      fontWeight: '600',
      width: 40, // Fixed width for alignment
  },
  input: {
    borderWidth: 3,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  durationInput: {
      width: 80,
      textAlign: 'center',
  },
  goalSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  goalSelectorLabel: {
    fontSize: 14,
    fontWeight: '600',
    width: 40, // Match inputLabel width
  },
  goalSelectorValue: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  goalSelectorText: {
    fontSize: 14,
    fontWeight: '500',
    maxWidth: '90%',
  },
  primaryButton: {
    borderRadius: 18,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  pickerCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 3,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 16,
    textAlign: 'center',
  },
  pickerItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
  },
  pickerItemText: {
    fontSize: 16,
  },
  closeButton: {
    marginTop: 16,
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
  },
  closeButtonText: {
    fontWeight: '700',
  },
});
