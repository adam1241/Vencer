import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Plus } from 'lucide-react-native';
import { COLORS, SIZES } from '../../src/constants/theme';
import { getStrategies, deleteStrategy, saveStrategy, getDailyLog, getDayTasks } from '../../src/services/storage';
import { StrategyPlan } from '../../src/types/goal';
import { DayTask } from '../../src/types/task';
import { useAppearance } from '../../src/context/appearance';
import { ThemedText as Text } from '../../src/components/ThemedText';

export default function ManageGoalsScreen() {
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
  const [goals, setGoals] = useState<StrategyPlan[]>([]);
  const [goalProgressMap, setGoalProgressMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editingGoal, setEditingGoal] = useState<StrategyPlan | null>(null);
  const [editTitle, setEditTitle] = useState('');

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [])
  );

  const load = async () => {
    setLoading(true);
    const [strategiesData, logData] = await Promise.all([
      getStrategies(),
      getDailyLog(),
    ]);

    setGoals(strategiesData);

    const progressMap: Record<string, number> = {};
    const now = new Date();
    const logDates = Object.keys(logData).sort();

    if (logDates.length > 0) {
      const dateToTasks: Record<string, DayTask[]> = {};
      const taskResults = await Promise.all(
        logDates.map(async (date) => ({
          date,
          tasks: (await getDayTasks(date)) as DayTask[] | null,
        })),
      );

      taskResults.forEach((result) => {
        dateToTasks[result.date] = Array.isArray(result.tasks) ? result.tasks : [];
      });

      strategiesData.forEach((goal) => {
        let planDurationMonths = 1;
        if (goal.milestones && goal.milestones.length > 0) {
          const maxMilestoneMonth = Math.max(...goal.milestones.map((milestone) => milestone.month));
          planDurationMonths = Math.max(maxMilestoneMonth, 1);
        }

        let totalMonthlyPercentages = 0;
        const created = new Date(goal.createdAt);
        const currentCheckDate = new Date(created);
        currentCheckDate.setDate(1);

        for (let monthIndex = 0; monthIndex < planDurationMonths; monthIndex += 1) {
          const year = currentCheckDate.getFullYear();
          const month = currentCheckDate.getMonth();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          let activeDays = 0;

          const monthStartDate = new Date(year, month, 1);
          if (monthStartDate <= now) {
            for (let day = 1; day <= daysInMonth; day += 1) {
              const dateObj = new Date(year, month, day);
              const dateStr = dateObj.toISOString().slice(0, 10);
              if (dateStr < goal.createdAt.slice(0, 10)) continue;
              if (dateObj > now) break;
              const tasks = dateToTasks[dateStr] || [];
              const goalTasks = tasks.filter((task) => task.strategyId === goal.id);
              if (goalTasks.some((task) => task.completed)) {
                activeDays += 1;
              }
            }
          }

          totalMonthlyPercentages += (activeDays / daysInMonth) * 100;
          currentCheckDate.setMonth(currentCheckDate.getMonth() + 1);
        }

        progressMap[goal.id] = Math.round(totalMonthlyPercentages / planDurationMonths);
      });
    } else {
      strategiesData.forEach((goal) => {
        progressMap[goal.id] = 0;
      });
    }

    setGoalProgressMap(progressMap);
    setLoading(false);
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Goal', 'Are you sure? This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteStrategy(id);
          load();
        },
      },
    ]);
  };

  const handleEdit = (goal: StrategyPlan) => {
    setEditingGoal(goal);
    setEditTitle(goal.goal.title);
  };

  const saveEdit = async () => {
    if (!editingGoal) return;
    const updated = {
      ...editingGoal,
      goal: { ...editingGoal.goal, title: editTitle },
    };
    await saveStrategy(updated);
    setEditingGoal(null);
    load();
  };

  const goalCards = useMemo(() => {
    return goals.map((goal) => ({
      ...goal,
      progress: goalProgressMap[goal.id] || 0,
    }));
  }, [goals, goalProgressMap]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.header, { color: highlightColor }, highlightTitleStyle]}>Manage Goals.</Text>
          <View style={styles.headerSpacer} />
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={highlightColor} style={{ marginTop: 40 }} />
        ) : goalCards.length ? (
          goalCards.map((item) => (
            <View key={item.id} style={styles.goalCardWrapper}>
              <TouchableOpacity
                style={[styles.goalCard, { borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={() =>
                  router.push({
                    pathname: '/goal-details',
                    params: { goal: JSON.stringify(item) },
                  })
                }
              >
                <View style={styles.goalHeader}>
                  <Text style={[styles.goalTitle, { color: colors.text }]}>
                    {(item.goal.sticker || '🎯') + ' ' + item.goal.title}
                  </Text>
                  <Text style={[styles.goalProgress, { color: highlightColor }]}>{item.progress}%</Text>
                </View>
                <View style={[styles.progressTube, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <View style={[styles.progressFill, { width: `${item.progress}%`, backgroundColor: highlightColor }]} />
                </View>
                <Text style={[styles.goalSubtitle, { color: colors.textSecondary }]}>Active goal</Text>
              </TouchableOpacity>

              <View style={styles.goalActions}>
                <TouchableOpacity
                  style={[styles.actionChip, { borderColor: colors.border, backgroundColor: colors.card }]}
                  onPress={() => handleEdit(item)}
                >
                  <Text style={[styles.actionChipText, { color: colors.text }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionChip, { borderColor: '#D9534F', backgroundColor: colors.card }]}
                  onPress={() => handleDelete(item.id)}
                >
                  <Text style={[styles.actionChipText, { color: '#D9534F' }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        ) : (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No goals yet. Create one from Create Goal.
          </Text>
        )}

        <TouchableOpacity style={[styles.addButton, { backgroundColor: highlightColor }]} onPress={() => router.push('/(main)/creator')}>
          <Plus color={activeTextColor} size={24} />
          <Text style={[styles.addButtonText, { color: activeTextColor }]}>
            Create New Goal
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={!!editingGoal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Goal Title</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
              value={editTitle}
              onChangeText={setEditTitle}
              autoFocus
            />
            <View style={styles.row}>
              <TouchableOpacity onPress={() => setEditingGoal(null)} style={[styles.cancelBtn, { borderColor: colors.border }]}>
                <Text style={[styles.btnText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveEdit} style={[styles.primaryBtn, { backgroundColor: highlightColor }]}>
                <Text style={[styles.primaryBtnText, { color: (highlightColor === '#FFFFFF' || highlightColor === '#ffffff') ? COLORS.black : colors.white }]}>
                  Save
                </Text>
              </TouchableOpacity>
            </View>
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
  content: {
    padding: SIZES.padding,
    paddingBottom: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  header: {
    fontSize: 32,
    fontWeight: '800',
  },
  goalCardWrapper: {
    marginBottom: 16,
    gap: 10,
  },
  goalCard: {
    borderWidth: 3,
    borderRadius: 18,
    padding: 16,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  goalTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  goalProgress: {
    fontSize: 14,
    fontWeight: '700',
  },
  progressTube: {
    height: 10,
    borderWidth: 2,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
  },
  goalSubtitle: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  goalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionChip: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionChipText: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 14,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 22,
    marginTop: 20,
    gap: 10,
  },
  addButtonText: {
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
});
