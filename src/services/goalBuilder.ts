/**
 * goalBuilder.ts - Deterministic goal plan generator.
 * No AI, no network. Builds a complete StrategyPlan from 9 user answers.
 */
import {
  StrategyPlan,
  GoalDetails,
  MilestoneItem,
  WeeklyFocusItem,
  DayRoutine,
  DailyHabit,
} from '../types/goal';
import { buildCoinReward, getCoinsForTask, getRoutineTargetCoins } from './coins';
import {
  buildPlanningTimeline,
  getTimelineDetailCount,
  getTimelineStageLabel,
  type PlanningTimeline,
} from './planningTimeline';

export type GoalAnswers = {
  goalName: string;
  category?: string;
  identityStatement: string;
  goalType: 'habit' | 'project';
  coreAction: string;
  frequency: 'daily' | '5x' | '4x' | '3x' | '2x' | '1x';
  startDate: string;
  deadline: string | null;
  successMetric: 'binary' | 'numeric' | 'duration' | 'points';
  successTarget?: number;
  successUnit?: string;
  minimumViableSession: string;
  mvsDurationMinutes: number;
  sticker?: string;
};

const freqToDaysPerWeek: Record<GoalAnswers['frequency'], number> = {
  daily: 7,
  '5x': 5,
  '4x': 4,
  '3x': 3,
  '2x': 2,
  '1x': 1,
};

const metricToTrackingMode = (metric: GoalAnswers['successMetric']) => {
  switch (metric) {
    case 'duration':
      return 'time' as const;
    case 'numeric':
    case 'binary':
      return 'tasks' as const;
    case 'points':
    default:
      return 'points' as const;
  }
};

type GoalDomain =
  | 'language'
  | 'fitness'
  | 'coding'
  | 'writing'
  | 'spiritual'
  | 'sleep'
  | 'strategy'
  | 'study'
  | 'general';

const inferGoalDomain = (goalName: string, category?: string): GoalDomain => {
  const text = `${goalName} ${category || ''}`.toLowerCase();
  if (/(quran|qur'an|surah|surat|ayah|ayat|juz|tajweed|hifz|recit|islam|prayer|pray)/.test(text)) return 'spiritual';
  if (/(sleep|bedtime|wake up|wakeup|circadian|insomnia)/.test(text)) return 'sleep';
  if (/(language|spanish|french|german|japanese|chinese|speaking|fluency|conversation)/.test(text)) return 'language';
  if (/(run|running|gym|fitness|strength|muscle|workout|exercise|weight loss|lose fat|lose weight)/.test(text)) return 'fitness';
  if (/(chess|elo|opening|endgame|tactic|tactics|lichess|chess\.com)/.test(text)) return 'strategy';
  if (/(code|coding|programming|developer|app|software|react|python|javascript)/.test(text)) return 'coding';
  if (/(write|writing|book|essay|blog|newsletter)/.test(text)) return 'writing';
  if (/(study|exam|course|learn|math|science|history|school|university)/.test(text)) return 'study';
  return 'general';
};

export const inferGoalSticker = (goalName: string) => {
  const domain = inferGoalDomain(goalName);
  if (domain === 'spiritual') return '📖';
  if (domain === 'language') return '🗣️';
  if (domain === 'fitness') return '💪';
  if (domain === 'coding') return '💻';
  if (domain === 'writing') return '✍️';
  if (domain === 'strategy') return '♟️';
  if (domain === 'sleep') return '🌙';
  if (domain === 'study') return '📚';
  return '🎯';
};

const getPhaseLabel = (
  index: number,
  total: number,
  goalName: string,
  category: string | undefined,
  unit: PlanningTimeline['unit'],
): { title: string; focus: string } => {
  const ratio = index / total;
  const domain = inferGoalDomain(goalName, category);
  const stageWord = unit === 'day' ? 'day' : unit === 'week' ? 'week' : 'month';

  if (domain === 'fitness') {
    if (ratio <= 0.25) return { title: 'Foundation', focus: `Lock in the workout, walking, and recovery rhythm for ${goalName} with sessions you can actually repeat.` };
    if (ratio <= 0.5) return { title: 'Consistency', focus: `Repeat the core sessions for ${goalName}, increase movement, and keep food and recovery supportive.` };
    if (ratio <= 0.75) return { title: 'Progress', focus: `Push one part of ${goalName} slightly harder while staying consistent enough to recover well.` };
    return { title: 'Solidify', focus: `Turn ${goalName} into a stable routine that keeps results moving without burnout.` };
  }

  if (domain === 'sleep') {
    if (ratio <= 0.25) return { title: 'Reset', focus: `Set the bedtime and wind-down rhythm that will make ${goalName} easier to repeat each ${stageWord}.` };
    if (ratio <= 0.5) return { title: 'Stabilize', focus: `Keep the same bedtime and wake-up pattern while removing the biggest nightly disruptions.` };
    if (ratio <= 0.75) return { title: 'Protect', focus: `Hold the sleep routine even on busy days so ${goalName} becomes normal, not fragile.` };
    return { title: 'Maintain', focus: `Make the sleep pattern reliable enough that it keeps working without constant effort.` };
  }

  if (domain === 'strategy') {
    if (ratio <= 0.25) return { title: 'Foundation', focus: `Build a steady chess routine with puzzles, one slow game, and one short board review each ${stageWord}.` };
    if (ratio <= 0.5) return { title: 'Consistency', focus: `Repeat tactical work, review one opening or endgame theme, and track one recurring mistake.` };
    if (ratio <= 0.75) return { title: 'Progress', focus: `Use harder puzzles and more serious games so ${goalName} becomes real board strength, not just theory.` };
    return { title: 'Solidify', focus: `Convert the practice into stable playing strength through review, correction, and better habits.` };
  }

  if (domain === 'spiritual') {
    if (ratio <= 0.25) return { title: 'Foundation', focus: `Set a calm recitation and repetition rhythm so each ${stageWord} produces real memorization or prayer progress.` };
    if (ratio <= 0.5) return { title: 'Consistency', focus: `Keep memorization, review, and recitation steady so new passages and older ones both stay alive.` };
    if (ratio <= 0.75) return { title: 'Progress', focus: `Increase the amount you can recite or memorize while keeping pronunciation and review quality steady.` };
    return { title: 'Solidify', focus: `Turn ${goalName} into stable recitation or practice through deliberate review and correction.` };
  }

  if (ratio <= 0.25) {
    return {
      title: 'Foundation',
      focus: `Build the routine for ${goalName} and complete small, repeatable sessions that clearly move the goal forward.`,
    };
  }
  if (ratio <= 0.5) {
    return {
      title: 'Consistency',
      focus: `Repeat the main work for ${goalName} often enough that it starts to feel normal and measurable.`,
    };
  }
  if (ratio <= 0.75) {
    return {
      title: 'Progress',
      focus: `Use slightly harder or more real sessions so ${goalName} turns into visible ability instead of preparation.`,
    };
  }
  return {
    title: 'Solidify',
    focus: `Turn ${goalName} into reliable real-life ability by reviewing weak spots and repeating the best process.`,
  };
};

const buildMilestones = (answers: GoalAnswers, timeline: PlanningTimeline): MilestoneItem[] => {
  const milestones: MilestoneItem[] = [];
  for (let index = 1; index <= timeline.count; index += 1) {
    const phase = getPhaseLabel(index, timeline.count, answers.goalName, answers.category, timeline.unit);
    milestones.push({
      month: index,
      title: `${getTimelineStageLabel(timeline.unit, index)}: ${phase.title}`,
      focus: phase.focus,
    });
  }
  return milestones;
};

const buildWeeklyFocus = (answers: GoalAnswers, timeline: PlanningTimeline): WeeklyFocusItem[] => {
  const domain = inferGoalDomain(answers.goalName, answers.category);
  const detailCount = timeline.unit === 'month' ? timeline.count * 4 : getTimelineDetailCount(timeline);
  const focusCatalog: Record<GoalDomain, string[]> = {
    language: [
      'Review useful words aloud and say a few simple sentences',
      'Repeat the same material with less hesitation',
      'Use the language in a slightly more real listening or speaking session',
      'Review weak words and prepare the next small conversation block',
    ],
    fitness: [
      'Lock in the easiest workout and walking rhythm you can actually repeat',
      'Repeat the core sessions and keep meals or recovery supportive',
      'Push one workout slightly harder while keeping consistency',
      'Review what worked and plan the next training step',
    ],
    coding: [
      'Finish one small working coding block',
      'Repeat the same type of task with less friction',
      'Ship one slightly harder feature or fix',
      'Review the weak spot and choose the next concrete coding step',
    ],
    writing: [
      'Write a short draft without over-editing',
      'Repeat the drafting rhythm and improve one weak paragraph',
      'Write a slightly longer or more focused section',
      'Review clarity and decide the next section to draft',
    ],
    spiritual: [
      'Start with a small recitation or memorization portion you can repeat daily',
      'Repeat the same portion until it feels steadier',
      'Add one slightly longer or harder recitation block',
      'Review the weak ayat and prepare the next portion',
    ],
    sleep: [
      'Set the bedtime and wind-down routine for the week',
      'Repeat the same bedtime and reduce the biggest sleep disruption',
      'Hold the routine even on a busy day',
      'Review what delayed sleep and tighten the next step',
    ],
    strategy: [
      'Solve a small set of tactical puzzles and note the main pattern',
      'Review one opening line and play it once on the board',
      'Play one slow game and identify the biggest mistake',
      'Review one endgame idea and repeat the weak spots',
    ],
    study: [
      'Finish one short study block and test recall right after',
      'Repeat the same topic with a few practice questions',
      'Handle a slightly harder problem set or concept block',
      'Review mistakes and prepare the next topic clearly',
    ],
    general: [
      `Start the easiest repeatable version of ${answers.coreAction}`,
      `${answers.coreAction} again with less friction and more consistency`,
      `Use ${answers.coreAction} in a slightly harder or more real session`,
      `Review the result and choose the next concrete step`,
    ],
  };

  return Array.from({ length: detailCount }, (_, index) => ({
    week: index + 1,
    focus: focusCatalog[domain][timeline.unit === 'month' ? index % 4 : Math.min(index, focusCatalog[domain].length - 1)],
  }));
};

const buildHabit = (id: string, title: string, duration: number, tool: string): DailyHabit => {
  const coins = getCoinsForTask(duration, title);
  return {
    id,
    title,
    duration,
    coins,
    tool,
    reward: buildCoinReward(coins, duration),
    type: 'habit',
  };
};

const buildDayRoutines = (answers: GoalAnswers): DayRoutine[] => {
  const target = answers.successTarget || 30;
  const mvsDuration = answers.mvsDurationMinutes || 10;
  const domain = inferGoalDomain(answers.goalName, answers.category);

  let standardHabits: DailyHabit[];
  let lightHabits: DailyHabit[];
  let intenseHabits: DailyHabit[];

  if (domain === 'fitness') {
    lightHabits = [buildHabit('h_lgt_1', 'Take a 15-minute brisk walk', Math.max(12, mvsDuration), 'Put on walking shoes, start a timer, and keep a pace that raises your breathing slightly.')];
    standardHabits = [
      buildHabit('h_std_1', 'Do a 20-minute workout block', Math.max(18, Math.round(target * 0.55)), 'Use one workout video, gym circuit, or bodyweight set list and finish the full block before stopping.'),
      buildHabit('h_std_2', 'Take a 15-minute walk after one meal', Math.max(12, Math.round(target * 0.35)), 'Walk right after lunch or dinner so the task stays simple and repeatable.'),
    ];
    intenseHabits = [
      buildHabit('h_int_1', 'Do a full 30-minute workout', Math.max(24, Math.round(target * 0.6)), 'Use one full routine and finish every planned set without jumping between workouts.'),
      buildHabit('h_int_2', 'Walk briskly for 20 minutes', 20, 'Use a timer and keep the pace steady for the full walk.'),
      buildHabit('h_int_3', 'Stretch for 8 minutes after training', 8, 'Use one short stretching sequence and finish it before sitting down.'),
    ];
  } else if (domain === 'strategy') {
    lightHabits = [buildHabit('h_lgt_1', 'Solve 3 easy chess puzzles', Math.max(10, mvsDuration), 'Use Lichess, Chess.com, or a puzzle book and solve only three puzzles with full focus.')];
    standardHabits = [
      buildHabit('h_std_1', 'Solve 5 chess puzzles', Math.max(12, Math.round(target * 0.4)), 'Use one puzzle set and think through each move before checking the answer.'),
      buildHabit('h_std_2', 'Review one opening line on a board for 10 minutes', Math.max(10, Math.round(target * 0.35)), 'Use a board or app and replay one opening line until you remember the main moves.'),
    ];
    intenseHabits = [
      buildHabit('h_int_1', 'Solve 8 chess puzzles', Math.max(15, Math.round(target * 0.3)), 'Use one harder puzzle set and finish all eight without multitasking.'),
      buildHabit('h_int_2', 'Play one 15+10 practice game', Math.max(20, Math.round(target * 0.45)), 'Play one full slow game so you can actually think through each move.'),
      buildHabit('h_int_3', 'Review the biggest mistake from the game for 10 minutes', 10, 'Replay the critical position and say or write what you should have played instead.'),
    ];
  } else if (domain === 'spiritual') {
    lightHabits = [buildHabit('h_lgt_1', 'Recite 5 ayat aloud from memory', Math.max(10, mvsDuration), 'Use one mushaf page or Quran app and repeat the same ayat aloud until they feel steady.')];
    standardHabits = [
      buildHabit('h_std_1', 'Memorize 3 new ayat with repetition', Math.max(12, Math.round(target * 0.45)), 'Repeat each ayah aloud several times before moving to the next one.'),
      buildHabit('h_std_2', 'Review yesterday’s ayat aloud once', Math.max(8, Math.round(target * 0.25)), 'Recite the previous ayat without looking first, then check and correct them.'),
    ];
    intenseHabits = [
      buildHabit('h_int_1', 'Memorize 5 new ayat with repetition', Math.max(15, Math.round(target * 0.35)), 'Use short repetition cycles on one small section until you can recite it without looking.'),
      buildHabit('h_int_2', 'Review the last 10 memorized ayat aloud', Math.max(12, Math.round(target * 0.25)), 'Recite the recent ayat in order and correct weak spots immediately.'),
      buildHabit('h_int_3', 'Listen to one reciter and repeat the weak ayat', Math.max(10, Math.round(target * 0.2)), 'Use one reciter audio track and mirror the pronunciation on the ayat that feel shaky.'),
    ];
  } else if (domain === 'sleep') {
    lightHabits = [buildHabit('h_lgt_1', 'Put your phone away 20 minutes before bed', Math.max(8, mvsDuration), 'Set one alarm and place the phone out of reach before your target bedtime.')];
    standardHabits = [
      buildHabit('h_std_1', 'Start a 20-minute wind-down before bed', Math.max(15, Math.round(target * 0.45)), 'Dim lights, stop stimulating apps, and do one quiet activity until bedtime.'),
      buildHabit('h_std_2', 'Get in bed at your target bedtime', Math.max(8, Math.round(target * 0.2)), 'Treat bedtime like an appointment and lie down when the alarm hits.'),
    ];
    intenseHabits = [
      buildHabit('h_int_1', 'Stop caffeine or heavy snacks after your cut-off time', 8, 'Choose the cut-off earlier in the day and follow it completely tonight.'),
      buildHabit('h_int_2', 'Do a full 20-minute wind-down with dim lights', Math.max(15, Math.round(target * 0.4)), 'Use reading, stretching, or quiet breathing only, with no scrolling.'),
      buildHabit('h_int_3', 'Lie down at target bedtime and keep screens out of the room', Math.max(10, Math.round(target * 0.2)), 'Place screens away before bed and commit to lights out on time.'),
    ];
  } else {
    lightHabits = [buildHabit('h_lgt_1', `Do one minimum viable step of ${answers.coreAction}`, mvsDuration, 'Use the smallest version that still produces a real finished step, not just preparation.')];
    standardHabits = [
      buildHabit('h_std_1', `Complete one small clear step of ${answers.coreAction}`, Math.max(10, Math.round(target * 0.4)), 'Pick one bounded step you can fully finish in one sitting.'),
      buildHabit('h_std_2', `Finish one measurable output for ${answers.coreAction}`, Math.max(15, Math.round(target * 0.5)), 'Stop only after you can point to one finished output, not just time spent.'),
    ];
    const intenseDuration = Math.max(45, Math.round(target * 1.5));
    intenseHabits = [
      buildHabit('h_int_1', `Complete one starter block of ${answers.coreAction}`, Math.max(10, Math.round(intenseDuration * 0.2)), 'Use a short opening block that gets you into the real work fast.'),
      buildHabit('h_int_2', `Finish one deep work block for ${answers.coreAction}`, Math.max(20, Math.round(intenseDuration * 0.5)), 'Stay on one clearly bounded task until the block is fully done.'),
      buildHabit('h_int_3', `Close with one visible next step for ${answers.coreAction}`, Math.max(12, Math.round(intenseDuration * 0.3)), 'Leave the session with one concrete next action already prepared for tomorrow.'),
    ];
  }

  return [
    { id: 'standard', title: 'Standard Day', habits: standardHabits },
    { id: 'light', title: 'Light Day', habits: lightHabits },
    { id: 'intense', title: 'Intense Day', habits: intenseHabits },
  ];
};

export const buildStrategyFromAnswers = (answers: GoalAnswers): StrategyPlan => {
  const timeline = buildPlanningTimeline(answers.goalName, answers.deadline, answers.startDate);
  const milestones = buildMilestones(answers, timeline);
  const weeklyFocus = buildWeeklyFocus(answers, timeline);
  const dayRoutines = buildDayRoutines(answers);

  const daysPerWeek = freqToDaysPerWeek[answers.frequency];
  const target = answers.successTarget || 30;

  let pointsPerDay = 60;
  if (answers.successMetric === 'points') pointsPerDay = getRoutineTargetCoins(dayRoutines[0].habits);
  else if (answers.successMetric === 'duration') pointsPerDay = target;
  else pointsPerDay = dayRoutines[0].habits.length * 10;

  const goal: GoalDetails = {
    title: answers.goalName,
    timeframe: answers.deadline ? `By ${answers.deadline}` : 'Ongoing',
    customTimeframe: answers.deadline || undefined,
    deadlineBased: Boolean(answers.deadline),
    deadlineDate: answers.deadline || undefined,
    why: answers.identityStatement,
    sticker: answers.sticker || inferGoalSticker(answers.goalName),
    trackingMode: metricToTrackingMode(answers.successMetric),
    trackingTarget: answers.successMetric === 'points' ? pointsPerDay : target,
    aiTimelineUnit: timeline.unit,
    aiTimelineCount: timeline.count,
    difficulty: 'Balanced',
    preferredDays: daysPerWeek >= 7 ? 'Every day' : daysPerWeek >= 5 ? 'Weekdays' : 'Custom',
    constraints: '',
    identityStatement: answers.identityStatement,
    goalType: answers.goalType,
    coreAction: answers.coreAction,
    frequency: answers.frequency,
    startDate: answers.startDate,
    successMetric: answers.successMetric,
    successUnit: answers.successUnit,
    minimumViableSession: answers.minimumViableSession,
    mvsDurationMinutes: answers.mvsDurationMinutes,
    category: answers.category,
  };

  return {
    id: `goal_${Date.now()}`,
    goal,
    northStar: answers.identityStatement,
    milestones,
    weeklyFocus,
    dayRoutines,
    pointsPerDay,
    createdAt: new Date().toISOString(),
  };
};

export type SimpleReviewInput = {
  completionRate: number;
  streak: number;
  missedPatterns: string[];
  goalTitle: string;
  weekOf: string;
};

export const buildWeeklyReview = (input: SimpleReviewInput) => {
  const { completionRate, streak, missedPatterns, goalTitle, weekOf } = input;

  let whatWorked = '';
  let whatFailed = '';
  let adjustments = '';
  let recommendedRoutineType: 'standard' | 'light' | 'intense' = 'standard';

  if (completionRate >= 0.8) {
    whatWorked = `Strong consistency on "${goalTitle}" - ${Math.round(completionRate * 100)}% completion this week.`;
    whatFailed = missedPatterns.length > 0
      ? `Occasionally missed: ${missedPatterns.slice(0, 2).join(', ')}.`
      : 'No significant gaps this week.';
    adjustments = streak >= 7
      ? 'Consider switching to Intense routine to push growth.'
      : 'Keep the current routine going - momentum is building.';
    recommendedRoutineType = streak >= 7 ? 'intense' : 'standard';
  } else if (completionRate >= 0.5) {
    whatWorked = `Solid effort - ${Math.round(completionRate * 100)}% completion shows commitment.`;
    whatFailed = missedPatterns.length > 0
      ? `Recurring skips: ${missedPatterns.slice(0, 2).join(', ')}. Consider if timing or energy is the issue.`
      : 'Some days were missed - look at what interrupted the routine.';
    adjustments = 'Stick with Standard routine. Focus on never missing two days in a row.';
    recommendedRoutineType = 'standard';
  } else {
    whatWorked = streak > 0
      ? `You had a ${streak}-day streak - that is something to build on.`
      : `Showing up at all on "${goalTitle}" is the first step. Do not quit.`;
    whatFailed = `Completion was ${Math.round(completionRate * 100)}%. ${
      missedPatterns.length > 0
        ? `Most skipped: ${missedPatterns.slice(0, 2).join(', ')}.`
        : 'The routine may be too demanding right now.'
    }`;
    adjustments = 'Switch to Light routine. Lower the bar so you can show up every day.';
    recommendedRoutineType = 'light';
  }

  return {
    weekOf,
    whatWorked,
    whatFailed,
    adjustments,
    recommendedRoutineType,
    principleApplied: completionRate < 0.5 ? 'Never miss twice' : 'Progressive overload',
  };
};
