export type PlanningTimelineUnit = 'day' | 'week' | 'month';

export type GoalDetails = {
  title: string;
  timeframe: string;
  customTimeframe?: string;
  why?: string;
  currentLevel?: string;
  currentActivities?: string;
  targetLevel?: string;
  deadlineBased?: boolean;
  deadlineDate?: string;
  approach?: string;
  milestones?: string[];
  sticker?: string;
  trackingMode?: TrackingMode;
  trackingTarget?: number;
  notificationPreference?: OnboardingProfile['notificationPreference'];
  howToProceed?: string;
  aiLabel?: string;
  aiDebugSummary?: string;
  aiContinuationNote?: string;
  aiDetailedWeeksThrough?: number;
  aiTimelineUnit?: PlanningTimelineUnit;
  aiTimelineCount?: number;
  difficulty?: 'Easy' | 'Balanced' | 'Intense';
  preferredDays?: 'Every day' | 'Weekdays' | 'Custom';
  customDays?: string[];
  constraints?: string;
  timeBudgetMinutes?: number;
  notificationTimes?: string[];
  stylePreference?: 'Simple & minimal' | 'Detailed & structured' | 'Flexible & adaptive';
  // New fields for deterministic goal builder
  identityStatement?: string;
  goalType?: 'habit' | 'project';
  coreAction?: string;
  frequency?: 'daily' | '5x' | '4x' | '3x' | '2x' | '1x';
  startDate?: string;
  successMetric?: 'binary' | 'numeric' | 'duration' | 'points';
  successUnit?: string;
  minimumViableSession?: string;
  mvsDurationMinutes?: number;
  category?: string;
};

export type StrategyPhase = {
  title: string;
  duration: string;
  focus: string;
  milestones?: string[];
  weeklyPlan?: string[];
};

export type DailyPlanDay = {
  day: string;
  tasks: string[];
};

export type DailyHabit = {
  id: string;
  title: string;
  duration: number; // minutes
  type: 'habit' | 'task';
  coins?: number;
  tool?: string;
  cue?: string;
  reward?: string;
};

export type DayRoutine = {
    id: string;
    title: string; // "Standard", "Light", "Intense"
    habits: DailyHabit[];
}

export type MilestoneItem = {
  month: number;
  title: string; // e.g. "Month 1: Foundations"
  focus: string; // e.g. "Foundations"
};

export type WeeklyFocusItem = {
  week: number;
  focus: string; // e.g. "Basic sentence building"
  objective?: string;
  successSignal?: string;
  lightTasks?: string[];
  standardTasks?: string[];
  intenseTasks?: string[];
};

export type StrategyPlan = {
  id: string;
  goal: GoalDetails;
  
  // Layer 1: North Star
  northStar: string;
  
  // Layer 2: Milestones (Monthly/Phase-based)
  milestones: MilestoneItem[];
  
  // Layer 3: Weekly Focus
  weeklyFocus: WeeklyFocusItem[];
  
  // Layer 4: Daily Habits
  dayRoutines: DayRoutine[];
  
  // Vencer Logic Additions
  ifThenRules?: { trigger: string; response: string }[];
  recommendedTools?: { name: string; description: string; isFree: boolean }[];
  
  // Kept for backward compatibility or direct access if needed
  dailyHabits?: DailyHabit[]; 
  phases?: StrategyPhase[]; 
  dailyRoutine?: string[]; 
  dailyPlan?: DailyPlanDay[];
  
  pointsPerDay: number;
  createdAt: string;
  monthPlan?: string[];
  weekPlan?: string[];
  lastAdjustmentAt?: string;
  adjustmentNote?: string;
};

export type DailyLogEntry = {
  date: string;
  completedTaskIds: number[];
  points: number;
  target?: number;
};

export type DailyLog = Record<string, DailyLogEntry>;

export type Profile = {
  id: string;
  email?: string;
  fullName?: string;
  avatarUrl?: string;
  isPremium?: boolean;
};

export type UserConstraints = {
  focus: string;
  timeBudgetMinutes: number;
  peakEnergy: 'Morning' | 'Afternoon' | 'Night';
};

export type TrackingMode = 'points' | 'time' | 'tasks' | 'mixed';

export type OnboardingProfile = {
  goal: string;
  motivation: string;
  currentSituation: string;
  currentActivities?: string;
  timeBudgetMinutes: number;
  trackingMode: TrackingMode;
  trackingTarget: number;
  deadlineDate?: string;
  notificationPreference: 'Daily' | 'Specific times' | 'Per task' | 'No reminders';
  difficulty: 'Easy' | 'Balanced' | 'Intense';
  preferredDays: 'Every day' | 'Weekdays' | 'Custom';
  customDays?: string[];
  specificTimes?: string[];
  constraints: string;
  stylePreference: 'Simple & minimal' | 'Detailed & structured' | 'Flexible & adaptive';
};

export type Post = {
  id: string;
  userId: string;
  content: string;
  points: number;
  streak: number;
  createdAt: string;
  goalTitle?: string;
  authorName?: string;
};

// --- Planning Engine Types ---

export type PlanningSnapshot = {
  date: string;                    // Today's date (YYYY-MM-DD)
  goalCreatedAt: string;
  daysElapsed: number;
  daysRemaining: number | null;    // null if no deadline

  // Strategy context
  northStar: string;
  currentMilestone: MilestoneItem | null;
  currentWeeklyFocus: WeeklyFocusItem | null;
  dayRoutines: DayRoutine[];

  // Execution history (last 7 days)
  recentHistory: {
    date: string;
    tasksTotal: number;
    tasksCompleted: number;
    points: number;
    completedTaskNames: string[];
    missedTaskNames: string[];
  }[];

  // Derived stats
  currentStreak: number;
  completionRate7d: number;       // 0-1
  averagePointsPerDay: number;
  missedTaskPatterns: string[];   // Tasks frequently skipped

  // User context
  goalTitle: string;
  goalSticker: string;
  difficulty: string;
  preferredDays: string;
  constraints: string;
  trackingMode: string;
  trackingTarget: number;          // user's daily target (points/minutes/tasks)
  timeBudgetMinutes: number;

  // Feedback loop
  lastWeeklyReview: WeeklyReviewResult | null;
};

export type WeeklyReviewResult = {
  weekOf: string;
  whatWorked: string;
  whatFailed: string;
  adjustments: string;
  recommendedRoutineType: 'standard' | 'light' | 'intense';
  principleApplied: string;
};
