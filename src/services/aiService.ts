import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { PlanningTimelineUnit, StrategyPlan } from '../types/goal';
import { buildCoinReward, getCoinsForTask } from './coins';
import {
  buildPlanningTimeline,
  getTimelineDetailCount,
  getTimelineDetailUnit,
  getTimelineStageLabel,
  getTimelineUnitLabel,
  type PlanningTimeline,
} from './planningTimeline';

type LocalAiStatus = {
  state: string;
  ready: boolean;
  backend: string;
  modelPath: string;
  downloaded: boolean;
  downloadedBytes: number;
  totalBytes: number;
  lastError?: string | null;
  diagnosticsPath?: string | null;
};

type LocalAiModuleType = {
  prepareModel(): Promise<LocalAiStatus>;
  getStatus(): Promise<LocalAiStatus>;
  generate(prompt: string): Promise<string>;
  getDiagnostics?(): Promise<string>;
};

export type LocalAIState =
  | 'unsupported'
  | 'not_downloaded'
  | 'downloading'
  | 'initializing'
  | 'ready'
  | 'generating'
  | 'failed';

export type LocalAIProgress = {
  state: LocalAIState;
  ready: boolean;
  backend: string;
  modelPath: string;
  downloaded: boolean;
  downloadedBytes: number;
  totalBytes: number;
  progress: number | null;
  lastError?: string | null;
};

export type LocalAIDebugSnapshot = {
  mode: 'plan' | 'refine' | 'weekly_review' | 'daily_feedback';
  prompt: string;
  rawOutput: string | null;
  parsed: boolean;
  contextSummary?: string;
  promptChars?: number;
  promptEstimatedTokens?: number;
  rawOutputChars?: number;
  rawOutputEstimatedTokens?: number;
  extractedJSONObject?: boolean;
  possibleTruncation?: boolean;
};

export type LocalAIAttemptLog = {
  id: string;
  timestamp: string;
  surface: 'vision_setup' | 'onboarding' | 'onboarding_plan' | 'strategy_review';
  mode: 'plan' | 'refine';
  outcome: 'ai' | 'deterministic';
  reason: string;
  backend?: string;
  state?: string;
  lastError?: string | null;
  parsed?: boolean;
  contextSummary?: string;
};

const GEMMA_PROMPTING_NOTE = 'Return one valid JSON object only. No markdown or code fences.';
const LOCAL_AI_ATTEMPTS_KEY = 'ziel_local_ai_attempts';
const MAX_LOCAL_AI_ATTEMPTS = 30;

const VENCER_PERSONA =
  'You are Vencer, a practical planning assistant for a goal-tracking app. Be realistic, personalized, concise, and action-oriented.';

export const GEMMA_MODEL_LABEL = 'Gemma 4 E4B';
const GEMMA_OUTPUT_TOKEN_LIMIT = 3000;
const INITIAL_DETAILED_WEEKS = 4;
export const DEFAULT_ASSUMED_TIME_BUDGET_MINUTES = 25;
export const DEFAULT_ASSUMED_SCHEDULE_LABEL = 'Flexible 3 days / week';

type AIPlanOverviewResult = {
  planTitle?: string;
  goalEmoji?: string;
  northStar?: string;
  realismNote?: string;
  goalSummary?: string;
  planHorizonMonths?: number;
  timelineUnit?: PlanningTimelineUnit;
  timelineCount?: number;
  milestones?: { month: number; title: string; focus: string }[];
  ifThenRules?: { trigger: string; response: string }[];
  recommendedTools?: { name: string; description: string; isFree: boolean }[];
};

type AIPlanDetailsResult = {
  weeklyFocus?: {
    week: number;
    focus: string;
    objective?: string;
    successSignal?: string;
    lightTasks?: string[];
    standardTasks?: string[];
    intenseTasks?: string[];
  }[];
  dayRoutines?: {
    id: string;
    title: string;
    habits: { id: string; title: string; duration: number; coins?: number; type: 'habit' | 'task'; tool?: string; cue?: string; reward?: string }[];
  }[];
  continuationNote?: string;
  detailedWeeksThrough?: number;
  timelineUnit?: PlanningTimelineUnit;
  timelineCount?: number;
};

type AIPlanPatchResult = {
  target?: string;
  reason?: string;
  planTitle?: string;
  goalEmoji?: string;
  northStar?: string;
  realismNote?: string;
  goalSummary?: string;
  planHorizonMonths?: number;
  timelineUnit?: PlanningTimelineUnit;
  timelineCount?: number;
  milestones?: { month: number; title: string; focus: string }[];
  weeklyFocus?: {
    week: number;
    focus: string;
    objective?: string;
    successSignal?: string;
    lightTasks?: string[];
    standardTasks?: string[];
    intenseTasks?: string[];
  }[];
  dayRoutines?: {
    id: string;
    title: string;
    habits: { id: string; title: string; duration: number; coins?: number; type: 'habit' | 'task'; tool?: string; cue?: string; reward?: string }[];
  }[];
  ifThenRules?: { trigger: string; response: string }[];
  recommendedTools?: { name: string; description: string; isFree: boolean }[];
  continuationNote?: string;
  detailedWeeksThrough?: number;
};

type RefinementTarget =
  | 'replace_overview'
  | 'replace_milestones'
  | 'replace_weeks'
  | 'replace_routines'
  | 'replace_supporting'
  | 'replace_multiple';

const gemmaModule = Platform.OS === 'android'
  ? (NativeModules.GemmaLocalAi as LocalAiModuleType | undefined)
  : undefined;

let preparePromise: Promise<LocalAiStatus> | null = null;
let lastLocalAIDebugSnapshot: LocalAIDebugSnapshot | null = null;

const supportsLocalAi = () => Platform.OS === 'android' && Boolean(gemmaModule);

function buildAvailabilityAssumptions(context: {
  timeBudgetMinutes?: unknown;
  preferredDays?: unknown;
  customDays?: unknown;
}) {
  const rawMinutes = Number(context.timeBudgetMinutes) || 0;
  const hasExplicitTimeBudget = rawMinutes > 0;
  const effectiveTimeBudgetMinutes = hasExplicitTimeBudget ? rawMinutes : DEFAULT_ASSUMED_TIME_BUDGET_MINUTES;

  const preferredDays = String(context.preferredDays || '').trim();
  const customDays = Array.isArray(context.customDays)
    ? context.customDays.map((day) => String(day || '').trim()).filter(Boolean)
    : [];

  const hasExplicitSchedule = Boolean(preferredDays);
  const effectiveSchedule =
    preferredDays === 'Custom' && customDays.length > 0
      ? customDays.join(', ')
      : preferredDays || DEFAULT_ASSUMED_SCHEDULE_LABEL;

  return {
    hasExplicitTimeBudget,
    effectiveTimeBudgetMinutes,
    hasExplicitSchedule,
    effectiveSchedule,
    assumptionNote:
      hasExplicitTimeBudget || hasExplicitSchedule
        ? 'Use the provided time and schedule as hard limits.'
        : `No time or schedule was provided. Assume a modest routine of about ${DEFAULT_ASSUMED_TIME_BUDGET_MINUTES} minutes and ${DEFAULT_ASSUMED_SCHEDULE_LABEL.toLowerCase()}.`,
  };
}

function buildPromptTimelineContext(
  goalName: string,
  deadline?: string | null,
  chosenTimeline?: Partial<Pick<AIPlanOverviewResult, 'timelineUnit' | 'timelineCount'>> | null,
) {
  const baseTimeline = buildPlanTimeline(goalName, deadline || null);
  const deadlineProvided = Boolean(deadline);
  const chosenUnit = (chosenTimeline?.timelineUnit || baseTimeline.unit) as PlanningTimelineUnit;
  const chosenCount = Math.max(1, Number(chosenTimeline?.timelineCount) || baseTimeline.count);
  const chosenTimelineShape: PlanningTimeline = {
    ...baseTimeline,
    unit: chosenUnit,
    count: chosenCount,
  };

  return {
    deadlineProvided,
    suggestedUnit: baseTimeline.unit,
    suggestedCount: baseTimeline.count,
    chosenUnit,
    chosenCount,
    detailUnit: getTimelineDetailUnit(chosenUnit),
    detailCount: getTimelineDetailCount(chosenTimelineShape),
    daysUntilDeadline: baseTimeline.daysUntilDeadline,
    weeksUntilDeadline: baseTimeline.weeksUntilDeadline,
    monthsUntilDeadline: baseTimeline.monthsUntilDeadline,
  };
}

function setLastLocalAIDebugSnapshot(snapshot: LocalAIDebugSnapshot | null) {
  lastLocalAIDebugSnapshot = snapshot;
}

export function getLastLocalAIDebugSnapshot() {
  return lastLocalAIDebugSnapshot;
}

export function describeLocalAIFallbackReason(options: {
  status?: Partial<LocalAiStatus> | null;
  snapshot?: LocalAIDebugSnapshot | null;
  error?: unknown;
}) {
  const errorMessage = options.error instanceof Error ? options.error.message : String(options.error || '').trim();
  if (errorMessage) return errorMessage;

  if (options.status?.lastError) {
    return String(options.status.lastError);
  }

  if (options.snapshot && !options.snapshot.parsed) {
    if (!options.snapshot.rawOutput) {
      return 'Gemma returned no output.';
    }
    if (options.snapshot.possibleTruncation) {
      return 'Gemma returned output, but it appears to have been cut off before the JSON finished. The app kept the deterministic fallback.';
    }
    return 'Gemma returned output, but the app could not parse it into a valid plan.';
  }

  const state = String(options.status?.state || '').trim();
  if (state === 'unsupported') return 'Local AI is unsupported on this build.';
  if (state === 'downloading') return 'The local model was still downloading when the app needed a plan.';
  if (state === 'initializing') return 'The local model was still initializing when the app needed a plan.';
  if (state === 'failed' || state === 'error') return 'Local AI reported a failure before the plan was applied.';

  return 'The app did not get a usable AI plan, so it kept the deterministic fallback.';
}

export async function recordLocalAIAttempt(attempt: LocalAIAttemptLog) {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_AI_ATTEMPTS_KEY);
    const existing = raw ? (JSON.parse(raw) as LocalAIAttemptLog[]) : [];
    const next = [attempt, ...existing].slice(0, MAX_LOCAL_AI_ATTEMPTS);
    await AsyncStorage.setItem(LOCAL_AI_ATTEMPTS_KEY, JSON.stringify(next));
  } catch (error) {
    console.log('[aiService] Could not record local AI attempt:', (error as Error).message);
  }
}

export async function getRecentLocalAIAttempts(limit = 20) {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_AI_ATTEMPTS_KEY);
    const existing = raw ? (JSON.parse(raw) as LocalAIAttemptLog[]) : [];
    return existing.slice(0, Math.max(1, limit));
  } catch (error) {
    console.log('[aiService] Could not read local AI attempts:', (error as Error).message);
    return [];
  }
}

function buildLocalAIProgress(
  status?: Partial<LocalAiStatus> | null,
  overrides: Partial<LocalAIProgress> = {},
): LocalAIProgress {
  const downloadedBytes = Number(status?.downloadedBytes || 0);
  const totalBytes = Number(status?.totalBytes || 0);
  const downloaded = Boolean(status?.downloaded);
  const ready = Boolean(status?.ready);
  const rawState = String(status?.state || '');

  let state: LocalAIState;
  if (!supportsLocalAi()) {
    state = 'unsupported';
  } else if (overrides.state) {
    state = overrides.state;
  } else if (ready) {
    state = 'ready';
  } else if (rawState === 'generating') {
    state = 'generating';
  } else if (rawState === 'downloading') {
    state = 'downloading';
  } else if (rawState === 'initializing') {
    state = 'initializing';
  } else if (rawState === 'error') {
    state = 'failed';
  } else if (downloaded || downloadedBytes > 0) {
    state = 'initializing';
  } else {
    state = 'not_downloaded';
  }

  return {
    state,
    ready,
    backend: String(status?.backend || 'none'),
    modelPath: String(status?.modelPath || ''),
    downloaded,
    downloadedBytes,
    totalBytes,
    progress: totalBytes > 0 ? Math.min(1, downloadedBytes / totalBytes) : null,
    lastError: status?.lastError ?? null,
    ...overrides,
  };
}

function prunePromptValue(value: unknown): unknown {
  if (value == null) return undefined;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => prunePromptValue(item))
      .filter((item): item is NonNullable<typeof item> => item !== undefined);
    return items.length > 0 ? items : undefined;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, entryValue]) => [key, prunePromptValue(entryValue)] as const)
      .filter(([, entryValue]) => entryValue !== undefined);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }

  return value;
}

function truncateText(value: unknown, maxLength = 180): string | undefined {
  const text = String(value || '').trim();
  if (!text) return undefined;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
}

type GoalDomain =
  | 'language'
  | 'fitness'
  | 'coding'
  | 'writing'
  | 'spiritual'
  | 'sleep'
  | 'study'
  | 'strategy'
  | 'creative'
  | 'business'
  | 'general';

function inferGoalDomain(goalName: string): GoalDomain {
  const text = String(goalName || '').toLowerCase();

  if (/(quran|qur'an|surah|surat|ayah|ayat|juz|tajweed|hifz|recit|memorize quran|memorise quran|islam)/.test(text)) {
    return 'spiritual';
  }
  if (/(sleep|bedtime|wake up on time|wake up|wakeup|circadian|insomnia|sleep schedule)/.test(text)) {
    return 'sleep';
  }
  if (/(chinese|japanese|spanish|french|german|language|vocabulary|grammar|speaking|fluency|conversation)/.test(text)) {
    return 'language';
  }
  if (/(gym|workout|fitness|strength|run|running|marathon|weight|muscle|cardio|exercise)/.test(text)) {
    return 'fitness';
  }
  if (/(code|coding|programming|developer|app|software|react|javascript|python|build app)/.test(text)) {
    return 'coding';
  }
  if (/(write|writing|book|essay|newsletter|blog|content|copywriting)/.test(text)) {
    return 'writing';
  }
  if (/(chess|elo|opening|endgame|tactic|tactics|checkmate|lichess|chess\.com)/.test(text)) {
    return 'strategy';
  }
  if (/(study|exam|course|learn|school|university|math|physics|biology|history)/.test(text)) {
    return 'study';
  }
  if (/(draw|drawing|paint|guitar|piano|music|sing|design|art)/.test(text)) {
    return 'creative';
  }
  if (/(business|startup|sales|marketing|client|portfolio|career|interview)/.test(text)) {
    return 'business';
  }

  return 'general';
}

export function inferGoalEmoji(goalName: string) {
  const domain = inferGoalDomain(goalName);
  if (domain === 'language') return '🗣️';
  if (domain === 'fitness') return '💪';
  if (domain === 'coding') return '💻';
  if (domain === 'writing') return '✍️';
  if (domain === 'spiritual') return '📖';
  if (domain === 'sleep') return '🌙';
  if (domain === 'study') return '📚';
  if (domain === 'creative') return '🎨';
  if (domain === 'business') return '📈';
  return '🎯';
}

function normalizeGoalEmoji(goalName: string, value: unknown) {
  const candidate = String(value || '').trim();
  if (!candidate) return inferGoalEmoji(goalName);
  const emojiMatches = candidate.match(/\p{Extended_Pictographic}/gu);
  return emojiMatches?.[0] || inferGoalEmoji(goalName);
}

function isEasyDifficulty(difficulty?: string | null) {
  return String(difficulty || '').trim().toLowerCase() === 'easy';
}

function buildConcreteFallbackTasks(
  goalName: string,
  routineId: 'light' | 'standard' | 'intense',
  difficulty?: string | null,
) {
  const domain = inferGoalDomain(goalName);
  const easy = isEasyDifficulty(difficulty);

  const catalog: Record<GoalDomain, Record<'light' | 'standard' | 'intense', string[]>> = {
    language: {
      light: [easy ? 'Review 5 useful words aloud' : 'Review 10 useful words aloud'],
      standard: easy
        ? ['Review 5 words aloud', 'Say 3 simple sentences aloud']
        : ['Complete 1 beginner lesson', 'Speak 5 simple sentences aloud'],
      intense: easy
        ? ['Review 10 useful words aloud', 'Practice listening for 10 minutes', 'Say 5 simple sentences aloud']
        : ['Complete 1 full lesson and take notes', 'Practice listening for 15 minutes', 'Write 5 short sentences from memory'],
    },
    fitness: {
      light: ['Take a 15-minute brisk walk'],
      standard: easy
        ? ['Do one 15-minute workout block', 'Take a 10-minute walk after one meal']
        : ['Do one 20-minute workout block', 'Take a 15-minute walk after one meal'],
      intense: easy
        ? ['Do one 25-minute workout block', 'Take a 15-minute brisk walk', 'Stretch for 5 minutes']
        : ['Do one full 30-minute training session', 'Take a 20-minute brisk walk', 'Stretch for 8 minutes after training'],
    },
    coding: {
      light: ['Fix one small bug or coding exercise'],
      standard: easy
        ? ['Finish one very small coding task', 'Write one note about what you learned']
        : ['Build one focused feature block', 'Write one note about what you learned'],
      intense: easy
        ? ['Finish one focused feature step', 'Review one bug carefully', 'Write one note about the result']
        : ['Ship one meaningful feature step', 'Refactor one weak area', 'Write tests or review one bug carefully'],
    },
    writing: {
      light: ['Write 100 words without editing'],
      standard: easy
        ? ['Write for 10 minutes', 'Edit one short paragraph']
        : ['Write for one focused block', 'Edit one section for clarity'],
      intense: easy
        ? ['Draft one short section', 'Edit one weak paragraph', 'Capture the next 2 ideas']
        : ['Draft a full focused section', 'Revise one weak section', 'Capture the next 3 ideas or outlines'],
    },
    spiritual: {
      light: [easy ? 'Recite 5 ayat slowly from memory' : 'Recite 5 ayat aloud from memory'],
      standard: easy
        ? ['Memorize 3 new ayat with repetition', 'Review yesterday\'s ayat aloud once']
        : ['Memorize 5 new ayat with repetition', 'Review yesterday\'s ayat aloud once'],
      intense: easy
        ? ['Memorize 5 new ayat with repetition', 'Review the last 5 memorized ayat aloud', 'Listen to one reciter and correct one weak part']
        : ['Memorize 5 new ayat with 10 repetitions', 'Review the last 10 memorized ayat aloud', 'Listen to one reciter and correct weak spots'],
    },
    sleep: {
      light: ['Put your phone away 20 minutes before bed'],
      standard: easy
        ? ['Start a 15-minute wind-down before bed', 'Get in bed at your target bedtime']
        : ['Start a 20-minute wind-down before bed', 'Get in bed at your target bedtime'],
      intense: easy
        ? ['Put your phone away 30 minutes before bed', 'Dim the lights and do 10 minutes of quiet wind-down', 'Lie down at your target bedtime']
        : ['Stop caffeine or heavy snacks after your cut-off time', 'Do a full 20-minute wind-down with dim lights', 'Lie down at your target bedtime and keep screens out of the room'],
    },
    study: {
      light: [easy ? 'Review one short note block' : 'Review notes for 10 minutes'],
      standard: easy
        ? ['Study one short topic block', 'Answer 3 recall questions']
        : ['Study one topic block', 'Answer 5 recall questions'],
      intense: easy
        ? ['Complete one focused study block', 'Answer 5 recall questions', 'Review one mistake list']
        : ['Complete one deep study block', 'Solve practice questions', 'Review mistakes and rewrite key notes'],
    },
    strategy: {
      light: [easy ? 'Solve 3 easy chess puzzles' : 'Solve 5 chess puzzles and review the answers'],
      standard: easy
        ? ['Solve 5 chess puzzles', 'Review one short opening line on the board']
        : ['Solve 8 chess puzzles', 'Review one opening line and play it once on the board'],
      intense: easy
        ? ['Solve 8 chess puzzles', 'Review one endgame pattern for 10 minutes', 'Play one slow practice game and note one mistake']
        : ['Solve 10 chess puzzles', 'Review one opening or endgame line on the board', 'Play one slow practice game and write down the main mistake'],
    },
    creative: {
      light: ['Do one 10-minute skill drill'],
      standard: ['Practice one core technique', 'Review one thing to improve'],
      intense: ['Complete one deep practice block', 'Repeat one weak section several times', 'Record what to improve next session'],
    },
    business: {
      light: ['Do one small business-building action'],
      standard: ['Complete one focused growth task', 'Track one result or lesson'],
      intense: ['Finish one high-value business task', 'Follow up on one opportunity', 'Review what to improve next'],
    },
    general: {
      light: ['Practice one clearly defined sub-skill for 10 minutes'],
      standard: easy
        ? ['Practice one clearly defined sub-skill for 15 minutes', 'Write down one concrete takeaway from today']
        : ['Practice one clearly defined sub-skill for 20 minutes', 'Write down one concrete takeaway from today'],
      intense: easy
        ? ['Practice one clearly defined sub-skill for 20 minutes', 'Repeat the same sub-skill once more', 'Write the next improvement step']
        : ['Practice one clearly defined sub-skill for 25 minutes', 'Repeat the same sub-skill once more', 'Write the next improvement step'],
    },
  };

  return catalog[domain][routineId];
}

function buildTaskToolSuggestion(goalName: string, taskTitle: string) {
  const domain = inferGoalDomain(goalName);
  const title = String(taskTitle || '').trim().toLowerCase();
  if (!title) return 'Use the simplest setup that lets you finish one clearly bounded session.';

  if (domain === 'language') {
    if (/listen|audio|conversation|speak|aloud/.test(title)) return 'Use short audio or a speaking drill and repeat aloud until you finish one clear block.';
    if (/write|sentence|note/.test(title)) return 'Use notes or paper and finish a short written output in one sitting.';
    return 'Use one lesson, flashcards, or a short drill and complete the full block before stopping.';
  }
  if (domain === 'coding') {
    if (/bug|fix|test/.test(title)) return 'Work in one file or one bug ticket and stop once the fix is verified.';
    return 'Use one repo or exercise and complete one feature slice end to end.';
  }
  if (domain === 'fitness') {
    if (/walk|cardio|run/.test(title)) return 'Use a timer and one route or cardio block you can complete from start to finish without multitasking.';
    return 'Use one workout video, gym circuit, or bodyweight sequence and finish the full block before switching tasks.';
  }
  if (domain === 'writing') {
    return 'Use one document and one prompt or section so the session ends with visible written output.';
  }
  if (domain === 'spiritual') {
    if (/listen|audio|recite|tajweed/.test(title)) return 'Use one reciter audio track and repeat each ayah aloud until the recitation feels steady.';
    if (/memorize|memorise|ayat|ayah|surah|juz/.test(title)) return 'Use one mushaf page or Quran app and repeat the same ayat in short cycles until you can recite them without looking.';
    return 'Use one mushaf page, short repetition cycles, and slow aloud recitation until the session has one clear result.';
  }
  if (domain === 'sleep') {
    return 'Use a bedtime alarm, dim lights, and one simple wind-down routine that ends with getting into bed on time.';
  }
  if (domain === 'study') {
    return 'Use one topic block or one question set and finish it before switching.';
  }
  if (domain === 'strategy') {
    if (/puzzle|tactic/.test(title)) return 'Use Lichess, Chess.com, or a puzzle book and finish the full puzzle set before stopping.';
    if (/game|match|play/.test(title)) return 'Play one slow game on a board or app, then review the biggest mistake right after.';
    return 'Use one board or chess app and complete one opening, endgame, or tactic block from start to finish.';
  }
  if (domain === 'creative') {
    return 'Use one drill, one reference, or one short practice piece and complete one repeatable session.';
  }
  if (domain === 'business') {
    return 'Use one concrete task list, draft, or outreach block and finish one measurable action.';
  }

  return 'Use one small, clearly bounded session so you can tell exactly what was finished today.';
}

function buildConcreteMilestoneFocus(goalName: string, month: number, totalMonths: number) {
  const domain = inferGoalDomain(goalName);
  const phase =
    month === 1
      ? 'foundation'
      : month <= Math.ceil(totalMonths * 0.4)
        ? 'build'
        : month <= Math.ceil(totalMonths * 0.75)
          ? 'expand'
          : 'consolidate';

  const catalog: Record<GoalDomain, Record<string, string>> = {
    language: {
      foundation: 'Build a repeatable study routine, finish beginner material, and produce simple spoken or written sentences in regular sessions.',
      build: 'Increase vocabulary and grammar use through short lessons, listening blocks, and repeated speaking or writing practice.',
      expand: 'Use the language in longer listening, speaking, and writing sessions while reviewing weak points regularly.',
      consolidate: 'Hold longer conversations or complete longer outputs while correcting recurring mistakes and closing major gaps.',
    },
    fitness: {
      foundation: 'Lock in a repeatable training rhythm, complete the basic sessions consistently, and build recovery into the routine.',
      build: 'Increase training volume or intensity gradually and complete the main workouts with consistent recovery.',
      expand: 'Add stronger sets, longer sessions, or more precise technique work while tracking performance changes.',
      consolidate: 'Turn the gains into stable performance with consistent sessions, recovery, and measurable outputs.',
    },
    coding: {
      foundation: 'Set up the core workflow, complete small practice tasks, and ship simple working pieces consistently.',
      build: 'Finish meaningful feature slices or small projects while strengthening debugging, testing, and code organization.',
      expand: 'Build larger project pieces, refactor weak areas, and complete more realistic end-to-end coding sessions.',
      consolidate: 'Ship a polished project or portfolio-quality work and close the biggest technical gaps through review.',
    },
    writing: {
      foundation: 'Build a writing habit, produce short drafts consistently, and define a repeatable writing process.',
      build: 'Increase output with focused drafting and editing blocks that produce finished sections regularly.',
      expand: 'Write longer pieces, revise weak sections, and improve clarity, structure, and consistency across outputs.',
      consolidate: 'Turn rough work into finished pieces with deliberate editing, feedback, and final polishing.',
    },
    spiritual: {
      foundation: 'Build a calm memorization and recitation routine, memorize small daily portions, and review them aloud consistently.',
      build: 'Increase the amount you can memorize while keeping daily recitation, repetition, and correction steady.',
      expand: 'Handle longer recitation and memorization blocks while reviewing weak ayat and keeping earlier passages fresh.',
      consolidate: 'Turn the memorized material into stable recitation through review cycles, correction, and consistent revision.',
    },
    sleep: {
      foundation: 'Build a repeatable bedtime and wind-down routine so going to sleep on time becomes easier to start and repeat.',
      build: 'Keep the same bedtime and wake-up pattern while reducing the biggest nightly disruptions and late habits.',
      expand: 'Protect the sleep routine on busier days and strengthen the habits that make the bedtime stick.',
      consolidate: 'Turn the sleep schedule into a stable rhythm you can keep without feeling like you are constantly restarting.',
    },
    study: {
      foundation: 'Create a repeatable study loop, finish the core basics, and test recall with short question sets regularly.',
      build: 'Cover larger topic blocks while mixing review, practice questions, and error correction.',
      expand: 'Handle deeper topics, harder exercises, and regular review of weak areas with measurable progress.',
      consolidate: 'Turn the knowledge into reliable exam or performance readiness through mixed review and targeted correction.',
    },
    strategy: {
      foundation: 'Build a steady chess routine with puzzles, slow games, and short opening or endgame review in regular sessions.',
      build: 'Increase tactical accuracy and board understanding through regular puzzles, annotated games, and targeted review.',
      expand: 'Handle stronger practice games, deeper calculation, and more deliberate opening or endgame work each week.',
      consolidate: 'Turn practice into stable over-the-board strength through review, correction, and consistent serious games.',
    },
    creative: {
      foundation: 'Build a repeatable practice habit and complete short drills or studies that strengthen core technique.',
      build: 'Increase practice depth and finish small creative pieces or focused exercises regularly.',
      expand: 'Work on more demanding pieces, repeat weak sections, and improve technique with deliberate review.',
      consolidate: 'Turn practice into polished outputs with revision, performance review, and consistent final-quality work.',
    },
    business: {
      foundation: 'Set up a repeatable business-building routine and complete small measurable actions consistently.',
      build: 'Increase outreach, production, or delivery volume while tracking clear business results.',
      expand: 'Run larger growth or delivery blocks and improve conversion, consistency, or quality through review.',
      consolidate: 'Turn the process into stable business output with regular execution, tracking, and optimization.',
    },
    general: {
      foundation: 'Build a repeatable routine and complete small concrete sessions consistently.',
      build: 'Increase consistency and finish more meaningful work blocks tied to the goal.',
      expand: 'Handle bigger sessions, review weak points, and create visible progress regularly.',
      consolidate: 'Turn the work into stable real-life capability through repetition, review, and measurable output.',
    },
  };

  return catalog[domain][phase];
}

function looksVagueMilestoneFocus(text: string) {
  const normalized = String(text || '').toLowerCase().trim();
  if (!normalized) return true;
  return /(make progress|work on|improve|stay consistent|foundation|foundations|growth|mastery|expand)/.test(normalized) && normalized.split(/\s+/).length < 8;
}

function buildFallbackWeeklyFocus(
  goalName: string,
  weekNumber: number,
  milestone: { month: number; title: string; focus: string } | null,
  timelineUnit: PlanningTimelineUnit,
) {
  const stageInCycle = timelineUnit === 'month' ? ((weekNumber - 1) % 4) + 1 : weekNumber;
  const stageLabel = timelineUnit === 'day' ? 'day' : 'week';
  const milestoneFocus = milestone?.focus || goalName;

  if (stageInCycle === 1) {
    return {
      focus: `Start this ${stageLabel} with one repeatable block of ${milestoneFocus.toLowerCase()}`,
      objective: `Finish the first small but complete sessions for ${milestoneFocus.toLowerCase()} and make the next step obvious.`,
      successSignal: 'You completed the first planned sessions and know exactly when and how you will repeat them.',
    };
  }
  if (stageInCycle === 2) {
    return {
      focus: `Repeat the core work and build consistency in ${milestoneFocus.toLowerCase()}`,
      objective: `Do the same core work more consistently and remove one friction point that slowed you down.`,
      successSignal: 'You repeated the core sessions on schedule and felt less friction starting them.',
    };
  }
  if (stageInCycle === 3) {
    return {
      focus: `Apply ${milestoneFocus.toLowerCase()} in a slightly harder real session`,
      objective: `Turn the routine into visible output by doing one more demanding or more complete version of the work.`,
      successSignal: 'You finished at least one session that was clearly more demanding than the earlier weeks.',
    };
  }
  return {
    focus: `Review this ${stageLabel} and adjust the next step for ${milestoneFocus.toLowerCase()}`,
    objective: `Review what worked, keep the best parts, and prepare the next step with one clear adjustment.`,
    successSignal: 'You captured what to keep, what to change, and the next stage starts with a clearer plan.',
  };
}

function looksVagueWeeklyFocus(text: string) {
  const normalized = String(text || '').toLowerCase().trim();
  if (!normalized) return true;
  return /(make progress|work on|improve|practice|review week|review and adjust|focus on|week \d+ focus|track what works)/.test(normalized);
}

function looksVagueTask(text: string, goalName: string) {
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) return true;
  const domain = inferGoalDomain(goalName);

  if (
    /^(set up|setup|prepare|organize|work on|make progress|improve|practice|review and extend|study plan|review session|routine|daily routine|practice session|study session|work session|deep work|focused session|starter session|memorization|memorisation|recitation|revision|complete .*task \d+|push .*task \d+|do .*task \d+)\b/.test(
      normalized,
    )
  ) {
    return true;
  }

  if (/(focused session|practice session|study session|work session|review results|take notes on what you learned|what you learned)/.test(normalized)) {
    return true;
  }

  const strippedGoal = String(goalName || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .trim();

  if (
    strippedGoal &&
    normalized.includes(strippedGoal) &&
    !/(minutes|lesson|words|sentences|questions|notes|set|walk|workout|feature|bug|section|chapter|exercise|drill|stretch|listen|write|read|review|log|track|speak|solve)/.test(
      normalized,
    )
  ) {
    return true;
  }

  if (
    domain === 'spiritual' &&
    /(study|lesson|topic|notes|chapter|flashcards)/.test(normalized) &&
    !/(ayah|ayat|surah|juz|recit|memor|tajweed|mushaf|quran)/.test(normalized)
  ) {
    return true;
  }

  if (
    domain === 'fitness' &&
    /(study|lesson|notes|chapter|flashcards|what you learned|topic|review notes)/.test(normalized)
  ) {
    return true;
  }

  if (
    domain === 'strategy' &&
    /(focused session|study session|routine|general practice|work block|learned)/.test(normalized)
  ) {
    return true;
  }

  if (
    domain === 'sleep' &&
    /(study|lesson|notes|deep work|focused session|practice questions|review notes)/.test(normalized)
  ) {
    return true;
  }

  return normalized.split(/\s+/).length < 3;
}

function sanitizeTaskList(
  goalName: string,
  routineId: 'light' | 'standard' | 'intense',
  tasks: string[],
) {
  const trimmed = tasks
    .map((task) => String(task || '').trim())
    .filter(Boolean);

  const fallbacks = buildConcreteFallbackTasks(goalName, routineId);

  if (trimmed.length === 0 || trimmed.every((task) => looksVagueTask(task, goalName))) {
    return fallbacks;
  }

  return trimmed.map((task, index) => (looksVagueTask(task, goalName) ? fallbacks[index] || fallbacks[fallbacks.length - 1] : task));
}

function compactPlanForPrompt(plan: Partial<StrategyPlan> | null | undefined) {
  if (!plan) return undefined;

  const weeklyItems = Array.isArray(plan.weeklyFocus) ? plan.weeklyFocus : [];
  const weekNumbers = weeklyItems
    .map((item) => Number(item?.week) || 0)
    .filter((week) => week > 0);
  const firstWeek = weekNumbers.length > 0 ? Math.min(...weekNumbers) : undefined;
  const lastWeek = weekNumbers.length > 0 ? Math.max(...weekNumbers) : undefined;

  return prunePromptValue({
    planTitle: truncateText(plan.goal?.title || ''),
    goalEmoji: truncateText(plan.goal?.sticker || '', 8),
    goalSummary: truncateText(plan.goal?.currentLevel || plan.northStar || ''),
    northStar: truncateText(plan.northStar, 220),
    timelineUnit: plan.goal?.aiTimelineUnit,
    timelineCount: plan.goal?.aiTimelineCount,
    planHorizonMonths: Array.isArray(plan.milestones) ? plan.milestones.length : undefined,
    milestones: Array.isArray(plan.milestones)
      ? plan.milestones.slice(0, 12).map((item) => ({
          month: item.month,
          title: truncateText(item.title, 90),
          focus: truncateText(item.focus, 120),
        }))
      : undefined,
    weeklyFocusRange:
      firstWeek && lastWeek
        ? {
            firstWeek,
            lastWeek,
            count: weekNumbers.length,
          }
        : undefined,
    weeklyFocus: Array.isArray(plan.weeklyFocus)
      ? plan.weeklyFocus.slice(0, 24).map((item) => ({
          month: Math.max(1, Math.ceil((Number(item.week) || 1) / 4)),
          week: item.week,
          focus: truncateText(item.focus, 90),
          objective: truncateText(item.objective, 110),
          lightTasks: item.lightTasks?.slice(0, 1).map((task) => truncateText(task, 70)),
          standardTasks: item.standardTasks?.slice(0, 2).map((task) => truncateText(task, 70)),
          intenseTasks: item.intenseTasks?.slice(0, 3).map((task) => truncateText(task, 70)),
        }))
      : undefined,
    dayRoutines: Array.isArray(plan.dayRoutines)
      ? plan.dayRoutines.slice(0, 3).map((routine) => ({
          id: routine.id,
          title: truncateText(routine.title, 50),
          habits: routine.habits?.slice(0, 4).map((habit) => ({
            title: truncateText(habit.title, 70),
            duration: habit.duration,
            coins: habit.coins,
            tool: truncateText(habit.tool || habit.cue, 90),
          })),
        }))
      : undefined,
    ifThenRules: Array.isArray(plan.ifThenRules)
      ? plan.ifThenRules.slice(0, 3).map((rule) => ({
          trigger: truncateText(rule.trigger, 80),
          response: truncateText(rule.response, 110),
        }))
      : undefined,
    recommendedTools: Array.isArray(plan.recommendedTools)
      ? plan.recommendedTools.slice(0, 3).map((tool) => ({
          name: truncateText(tool.name, 40),
          description: truncateText(tool.description, 90),
          isFree: Boolean(tool.isFree),
        }))
      : undefined,
    continuationNote: truncateText(plan.goal?.aiContinuationNote || '', 160),
    detailedWeeksThrough: getMaxWeekNumber(plan.weeklyFocus),
  });
}

export function describeLocalAIProgress(progress: LocalAIProgress, taskLabel = 'your request') {
  const percent =
    typeof progress.progress === 'number' ? `${Math.round(progress.progress * 100)}%` : null;

  if (progress.state === 'unsupported') {
    return {
      title: 'Local AI unavailable',
      subtitle: 'This feature needs an Android native build with the local AI module.',
    };
  }

  if (progress.state === 'not_downloaded' || progress.state === 'downloading') {
    return {
      title: 'Downloading local AI model...',
      subtitle: percent
        ? `Preparing Gemma for offline use. Download progress: ${percent}.`
        : 'Preparing Gemma for offline use on this device.',
    };
  }

  if (progress.state === 'initializing') {
    return {
      title: 'Preparing local AI...',
      subtitle: progress.downloaded
        ? 'Gemma model downloaded. Finishing native initialization now.'
        : 'Gemma is almost ready. Finishing native initialization now.',
    };
  }

  if (progress.state === 'generating') {
    return {
      title: `Building ${taskLabel}...`,
      subtitle: 'Local AI is ready and generating the result on your device.',
    };
  }

  if (progress.state === 'failed') {
    return {
      title: 'Local AI hit a problem',
      subtitle: progress.lastError || 'The local model could not be prepared on this device.',
    };
  }

  return {
    title: `Building ${taskLabel}...`,
    subtitle: 'Local AI is ready on this device.',
  };
}

export function describeLocalAIAttribution(status?: { ready?: boolean; backend?: string } | null) {
  if (!status?.ready) return 'Local AI plan';
  const backend = String(status.backend || '').toUpperCase();
  return backend ? `Local AI plan (${backend})` : 'Local AI plan';
}

export async function initializeLocalAI(): Promise<LocalAiStatus | null> {
  if (!supportsLocalAi() || !gemmaModule) return null;

  if (!preparePromise) {
    preparePromise = gemmaModule.prepareModel().catch((error) => {
      preparePromise = null;
      throw error;
    });
  }

  return preparePromise;
}

export async function getLocalAIStatus(): Promise<LocalAiStatus | null> {
  if (!supportsLocalAi() || !gemmaModule) return null;

  try {
    return await gemmaModule.getStatus();
  } catch (error) {
    console.log('[aiService] Could not read local AI status:', (error as Error).message);
    return null;
  }
}

export async function getLocalAIDiagnostics(): Promise<string | null> {
  if (!supportsLocalAi() || !gemmaModule?.getDiagnostics) return null;

  try {
    return await gemmaModule.getDiagnostics();
  } catch (error) {
    console.log('[aiService] Could not read local AI diagnostics:', (error as Error).message);
    return null;
  }
}

async function emitLocalAIProgress(
  onProgress?: (progress: LocalAIProgress) => void,
  overrides: Partial<LocalAIProgress> = {},
) {
  if (!onProgress) return;
  const status = await getLocalAIStatus();
  onProgress(buildLocalAIProgress(status, overrides));
}

async function prepareLocalAI(onProgress?: (progress: LocalAIProgress) => void): Promise<LocalAIProgress | null> {
  if (!supportsLocalAi() || !gemmaModule) {
    const unsupported = buildLocalAIProgress(null);
    onProgress?.(unsupported);
    return unsupported;
  }

  let timer: ReturnType<typeof setInterval> | null = null;

  try {
    await emitLocalAIProgress(onProgress);
    if (onProgress) {
      timer = setInterval(() => {
        emitLocalAIProgress(onProgress).catch(() => {});
      }, 500);
    }

    const status = await initializeLocalAI();
    const progress = buildLocalAIProgress(status);
    onProgress?.(progress);
    return progress;
  } catch (error) {
    const status = await getLocalAIStatus();
    const failure = buildLocalAIProgress(status, {
      state: 'failed',
      lastError: (error as Error).message || status?.lastError || 'Local AI preparation failed.',
    });
    onProgress?.(failure);
    throw error;
  } finally {
    if (timer) clearInterval(timer);
  }
}

async function callLocalModel(
  prompt: string,
  onProgress?: (progress: LocalAIProgress) => void,
  options: { required?: boolean } = {},
): Promise<string | null> {
  if (!supportsLocalAi() || !gemmaModule) {
    const message = 'Local AI is only available on Android native builds.';
    console.log(`[aiService] ${message}`);
    const progress = buildLocalAIProgress(null);
    onProgress?.(progress);
    if (options.required) {
      throw new Error(message);
    }
    return null;
  }

  try {
    const prepared = await prepareLocalAI(onProgress);
    onProgress?.(
      buildLocalAIProgress(prepared, {
        state: 'generating',
        ready: true,
      }),
    );
    const promptEstimatedTokens = estimateTokenCount(prompt);
    console.log(
      `[aiService] Local Gemma request starting. promptChars=${prompt.length} promptEstimatedTokens=${promptEstimatedTokens} outputLimit=${GEMMA_OUTPUT_TOKEN_LIMIT}`,
    );
    const raw = await gemmaModule.generate(prompt);
    const outputAnalysis = analyzeLocalAIOutput(raw);
    console.log(
      `[aiService] Local Gemma response received. rawChars=${outputAnalysis.rawOutputChars} rawEstimatedTokens=${outputAnalysis.rawOutputEstimatedTokens} extractedJSONObject=${outputAnalysis.extractedJSONObject} possibleTruncation=${outputAnalysis.possibleTruncation}`,
    );
    return raw;
  } catch (error) {
    console.log('[aiService] Local Gemma call failed:', (error as Error).message);
    const status = await getLocalAIStatus();
    onProgress?.(
      buildLocalAIProgress(status, {
        state: 'failed',
        lastError: (error as Error).message,
      }),
    );
    if (options.required) {
      throw error instanceof Error ? error : new Error('Local Gemma call failed.');
    }
    return null;
  }
}

function estimateTokenCount(text: string | null | undefined) {
  const source = String(text || '').trim();
  if (!source) return 0;
  return Math.ceil(source.length / 4);
}

function analyzeLocalAIOutput(text: string | null | undefined) {
  const raw = String(text || '');
  const trimmed = raw.trim();
  const extracted = trimmed ? extractBalancedJSONObject(trimmed) : null;
  const rawOutputChars = trimmed.length;
  const rawOutputEstimatedTokens = estimateTokenCount(trimmed);
  const possibleTruncation = Boolean(
    trimmed &&
      trimmed.includes('{') &&
      !extracted &&
      (!trimmed.endsWith('}') || rawOutputEstimatedTokens >= Math.floor(GEMMA_OUTPUT_TOKEN_LIMIT * 0.8)),
  );

  return {
    rawOutputChars,
    rawOutputEstimatedTokens,
    extractedJSONObject: Boolean(extracted),
    possibleTruncation,
  };
}

function extractBalancedJSONObject(text: string): string | null {
  const source = String(text || '');
  const start = source.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return null;
}

function stripUnexpectedControlChars(text: string) {
  return String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function escapeLineBreaksInsideStrings(text: string) {
  const source = stripUnexpectedControlChars(text);
  let output = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (!inString) {
      output += char;
      if (char === '"') inString = true;
      continue;
    }

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      output += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      output += char;
      inString = false;
      continue;
    }

    if (char === '\r') {
      if (source[index + 1] === '\n') index += 1;
      output += '\\n';
      continue;
    }

    if (char === '\n') {
      output += '\\n';
      continue;
    }

    if (char === '\t') {
      output += '\\t';
      continue;
    }

    output += char;
  }

  return output;
}

function stripTrailingCommasOutsideStrings(text: string) {
  const source = String(text || '');
  let output = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === ',') {
      let lookahead = index + 1;
      while (lookahead < source.length && /\s/.test(source[lookahead])) {
        lookahead += 1;
      }
      const nextChar = source[lookahead];
      if (nextChar === '}' || nextChar === ']') {
        continue;
      }
    }

    output += char;
  }

  return output;
}

function repairJSONCandidate(text: string | null | undefined) {
  if (!text) return null;
  return stripTrailingCommasOutsideStrings(escapeLineBreaksInsideStrings(text)).trim();
}

function tryParseJSON<T>(text: string | null | undefined): T | null {
  if (!text) return null;

  const cleaned = String(text)
    .replace(/<\|channel\|>thought[\s\S]*?<\|channel\|>/g, '')
    .trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (jsonMatch ? jsonMatch[1] : cleaned).trim();
  const extracted = extractBalancedJSONObject(raw);
  const candidates = [raw, extracted, repairJSONCandidate(raw), repairJSONCandidate(extracted)].filter(
    (candidate, index, list): candidate is string =>
      Boolean(candidate) && list.indexOf(candidate) === index,
  );

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Keep trying more forgiving candidates.
    }
  }

  const analysis = analyzeLocalAIOutput(raw);
  console.log(
    `[aiService] Could not parse local model JSON. rawChars=${analysis.rawOutputChars} rawEstimatedTokens=${analysis.rawOutputEstimatedTokens} extractedJSONObject=${analysis.extractedJSONObject} possibleTruncation=${analysis.possibleTruncation} preview=${raw.slice(0, 500)}`,
  );
  return null;
}

function toTitleCase(value: string) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function buildPlanTimeline(goalName: string, deadline?: string | null) {
  return buildPlanningTimeline(goalName, deadline || null);
}

function getMaxWeekNumber(weeklyFocus: unknown) {
  if (!Array.isArray(weeklyFocus)) return 0;
  return weeklyFocus.reduce((max, item: any) => {
    const week = Number(item?.week) || 0;
    return week > max ? week : max;
  }, 0);
}

function buildProgressiveContinuationNote(
  goalName: string,
  timeline: PlanningTimeline,
  detailedWeeksThrough = INITIAL_DETAILED_WEEKS,
) {
  const detailUnit = getTimelineDetailUnit(timeline.unit);
  const fullTimelineLabel = getTimelineUnitLabel(timeline.unit, timeline.count).toLowerCase();

  if (timeline.unit === 'month') {
    const detailedMonths = Math.max(1, Math.ceil(detailedWeeksThrough / 4));
    return `The AI has detailed weeks 1-${detailedWeeksThrough} for month ${detailedMonths} so far. Later weeks can be generated or refined as you progress through the rest of the ${timeline.count}-month plan for ${goalName}.`;
  }

  return `The AI has detailed ${detailUnit} 1-${detailedWeeksThrough} so far. If you need changes, it can refine the remaining ${fullTimelineLabel} of ${goalName} without rewriting the whole plan.`;
}

function normalizeContinuationNote(
  goalName: string,
  value: unknown,
  timeline: PlanningTimeline,
  detailedWeeksThrough = INITIAL_DETAILED_WEEKS,
) {
  const note = String(value || '').trim();
  return note || buildProgressiveContinuationNote(goalName, timeline, detailedWeeksThrough);
}

function parseRequestedMonth(userPrompt: string) {
  const text = String(userPrompt || '').toLowerCase();
  if (!text) return null;

  const ordinalMap: Record<string, number> = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
    sixth: 6,
    seventh: 7,
    eighth: 8,
    ninth: 9,
    tenth: 10,
    eleventh: 11,
    twelfth: 12,
  };

  const directMonth = text.match(/\bmonth\s+(\d{1,2})\b/);
  if (directMonth) return Number(directMonth[1]) || null;

  for (const [word, month] of Object.entries(ordinalMap)) {
    if (text.includes(`${word} month`) || text.includes(`month ${word}`)) {
      return month;
    }
  }

  if (text.includes('month one')) return 1;
  return null;
}

function inferRefinementTarget(userPrompt: string): RefinementTarget {
  const text = String(userPrompt || '').toLowerCase();
  const signals = new Set<RefinementTarget>();

  if (/(north star|goal statement|summary|goal summary|title|plan title)/.test(text)) {
    signals.add('replace_overview');
  }
  if (/(milestone|milestones|horizon|months|deadline)/.test(text)) {
    signals.add('replace_milestones');
  }
  if (/(week|weeks|weekly|month 1|month 2|month 3|month 4|tasks|generate next month|generate month)/.test(text)) {
    signals.add('replace_weeks');
  }
  if (/(routine|routines|day plan|day plans|day routine|light day|standard day|advanced day|intense day|habit|habits)/.test(text)) {
    signals.add('replace_routines');
  }
  if (/(if-then|if then|rule|rules|tool|tools)/.test(text)) {
    signals.add('replace_supporting');
  }

  if (signals.size === 0) return 'replace_multiple';
  if (signals.size > 1) return 'replace_multiple';
  return Array.from(signals)[0];
}

function buildRefinementScopeSummary(userPrompt: string, plan: Partial<StrategyPlan> | null | undefined) {
  const target = inferRefinementTarget(userPrompt);
  const requestedMonth = parseRequestedMonth(userPrompt);
  const existingDetailedWeeksThrough = getMaxWeekNumber(plan?.weeklyFocus);
  const requestedWeekRange =
    requestedMonth && requestedMonth > 0
      ? {
          startWeek: (requestedMonth - 1) * 4 + 1,
          endWeek: requestedMonth * 4,
        }
      : null;

  return {
    target,
    requestedMonth,
    requestedWeekRange,
    existingDetailedWeeksThrough,
  };
}

function simplifyPlanTitle(goalName: string) {
  const cleaned = String(goalName || '')
    .replace(/^(learn(ing)?|build(ing)?|start(ing)?|become|improve|master)\s+/i, '')
    .replace(/[^\w\s]/g, ' ')
    .trim();
  const words = (cleaned || goalName || 'Goal Plan')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
  return toTitleCase(words.join(' '));
}

function summarizeFinalStage(goalName: string, source?: unknown) {
  const candidate = String(source || '').trim();
  if (candidate) return candidate;
  return `Final stage: you can honestly say "${goalName}" is now part of your real life, not just a future intention.`;
}

function summarizePlanContext(plan: Partial<StrategyPlan> | null | undefined) {
  if (!plan) return 'No existing plan context sent.';

  const monthCount = Array.isArray(plan.milestones) ? plan.milestones.length : 0;
  const timelineUnit = plan.goal?.aiTimelineUnit || 'month';
  const timelineCount = Number(plan.goal?.aiTimelineCount) || monthCount;
  const weekNumbers = Array.isArray(plan.weeklyFocus)
    ? plan.weeklyFocus
        .map((item) => Number(item?.week) || 0)
        .filter((week) => week > 0)
    : [];
  const firstWeek = weekNumbers.length > 0 ? Math.min(...weekNumbers) : null;
  const lastWeek = weekNumbers.length > 0 ? Math.max(...weekNumbers) : null;
  const routineIds = Array.isArray(plan.dayRoutines)
    ? plan.dayRoutines.map((routine) => String(routine?.id || '').trim()).filter(Boolean)
    : [];
  const detailUnit = timelineUnit === 'day' ? 'day' : 'week';

  return [
    `Timeline: ${timelineCount} ${getTimelineUnitLabel(timelineUnit, timelineCount).toLowerCase()}`,
    `Stages sent: ${monthCount || 0}`,
    `Weekly entries sent: ${weekNumbers.length}`,
    firstWeek && lastWeek ? `${getTimelineUnitLabel(detailUnit, weekNumbers.length)} sent: ${firstWeek}-${lastWeek}` : `${getTimelineUnitLabel(detailUnit, 2)} sent: none`,
    `Detailed through ${detailUnit}: ${getMaxWeekNumber(plan.weeklyFocus) || 0}`,
    routineIds.length > 0 ? `Routine ids sent: ${routineIds.join(', ')}` : 'Routine ids sent: none',
  ].join(' | ');
}

function buildFallbackMilestone(index: number, totalStages: number, goalName: string, timelineUnit: PlanningTimelineUnit) {
  const phase =
    index === 1
      ? 'Foundation'
      : index <= Math.ceil(totalStages * 0.4)
        ? 'Build'
        : index <= Math.ceil(totalStages * 0.75)
          ? 'Expand'
          : 'Stabilize';

  return {
    month: index,
    title: `${getTimelineStageLabel(timelineUnit, index)}: ${phase}`,
    focus: buildConcreteMilestoneFocus(goalName, index, totalStages),
  };
}

function normalizeMilestones(
  goalName: string,
  milestones: any,
  targetStages: number,
  timelineUnit: PlanningTimelineUnit,
) {
  const items = Array.isArray(milestones)
    ? milestones.map((source: any, index: number) => ({
        month: Number(source?.month) || index + 1,
        title: String(source?.title || '').trim(),
        focus: String(source?.focus || '').trim(),
      }))
    : [];

  const normalized: { month: number; title: string; focus: string }[] = [];

  for (let index = 0; index < targetStages; index += 1) {
    const monthNumber = index + 1;
    const existing =
      items.find((item) => item.month === monthNumber) ||
      items[index] ||
      null;
    const fallback = buildFallbackMilestone(monthNumber, targetStages, goalName, timelineUnit);

    normalized.push({
      month: monthNumber,
      title: String(existing?.title || fallback.title).trim() || fallback.title,
      focus: looksVagueMilestoneFocus(String(existing?.focus || '').trim())
        ? fallback.focus
        : String(existing?.focus || fallback.focus).trim(),
    });
  }

  return normalized;
}

function normalizeWeeklyFocusWindow(
  goalName: string,
  weeklyFocus: any,
  milestones: { month: number; title: string; focus: string }[],
  timelineUnit: PlanningTimelineUnit,
  startWeek: number,
  endWeek: number,
) {
  const items = Array.isArray(weeklyFocus) ? weeklyFocus : [];
  const safeStartWeek = Math.max(1, startWeek);
  const safeEndWeek = Math.max(safeStartWeek, endWeek);
  const targetWeeks = safeEndWeek - safeStartWeek + 1;

  const normalizeRoutineTasks = (
    routineId: 'light' | 'standard' | 'intense',
    tasks: unknown,
  ) => {
    const expectedMinimum = routineId === 'light' ? 1 : routineId === 'standard' ? 2 : 3;
    const maxAllowed = routineId === 'intense' ? 4 : expectedMinimum;
    const rawTasks = Array.isArray(tasks)
      ? tasks.map((task: unknown) => String(task || '').trim()).filter(Boolean)
      : [];
    const sanitized = sanitizeTaskList(goalName, routineId, rawTasks);
    const fallbacks = buildConcreteFallbackTasks(goalName, routineId);
    const normalized = sanitized.slice(0, maxAllowed);

    while (normalized.length < expectedMinimum) {
      normalized.push(fallbacks[normalized.length] || fallbacks[fallbacks.length - 1]);
    }

    return normalized;
  };

  return Array.from({ length: targetWeeks }, (_, index) => {
    const weekNumber = safeStartWeek + index;
    const monthIndex =
      timelineUnit === 'month'
        ? Math.floor((weekNumber - 1) / 4)
        : weekNumber - 1;
    const milestone = milestones[monthIndex] || milestones[milestones.length - 1] || null;
    const source =
      items.find((item: any) => Number(item?.week) === weekNumber) ||
      items[index] ||
      null;
    const fallback = buildFallbackWeeklyFocus(goalName, weekNumber, milestone, timelineUnit);
    const previous = index > 0 ? items.find((item: any) => Number(item?.week) === weekNumber - 1) || items[index - 1] || null : null;
    const sourceFocus = String(source?.focus || '').trim();
    const previousFocus = String(previous?.focus || '').trim().toLowerCase();
    const useFallbackFocus =
      looksVagueWeeklyFocus(sourceFocus) ||
      (sourceFocus && previousFocus && sourceFocus.toLowerCase() === previousFocus);

    return {
      week: weekNumber,
      focus: useFallbackFocus ? fallback.focus : sourceFocus,
      objective: String(source?.objective || fallback.objective).trim(),
      successSignal: String(source?.successSignal || fallback.successSignal).trim(),
      lightTasks: normalizeRoutineTasks('light', source?.lightTasks),
      standardTasks: normalizeRoutineTasks('standard', source?.standardTasks),
      intenseTasks: normalizeRoutineTasks('intense', source?.intenseTasks),
    };
  });
}

function mergeWeeklyFocusEntries(
  existingWeeklyFocus: unknown,
  incomingWeeklyFocus: unknown,
) {
  const merged = new Map<number, any>();

  (Array.isArray(existingWeeklyFocus) ? existingWeeklyFocus : []).forEach((item: any) => {
    const week = Number(item?.week) || 0;
    if (week > 0) merged.set(week, item);
  });

  (Array.isArray(incomingWeeklyFocus) ? incomingWeeklyFocus : []).forEach((item: any, index: number) => {
    const fallbackWeek = index + 1;
    const week = Number(item?.week) || fallbackWeek;
    if (week > 0) {
      merged.set(week, { ...item, week });
    }
  });

  return Array.from(merged.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, item]) => item);
}

function inferRoutineMode(value: unknown, fallbackIndex = 0): 'standard' | 'light' | 'intense' {
  const text = String(value || '').toLowerCase();
  if (text.includes('light')) return 'light';
  if (text.includes('standard')) return 'standard';
  if (text.includes('intense') || text.includes('advanced') || text.includes('hard')) return 'intense';
  if (fallbackIndex === 0) return 'standard';
  if (fallbackIndex === 1) return 'light';
  return 'intense';
}

function buildFallbackRoutineHabits(
  goalName: string,
  routineId: 'standard' | 'light' | 'intense',
  sourceTasks: string[] | undefined,
  timeBudgetMinutes?: number,
  difficulty?: string | null,
) {
  const expectedCount = routineId === 'light' ? 1 : routineId === 'standard' ? 2 : 3;
  const fallbackTasks = buildConcreteFallbackTasks(goalName, routineId, difficulty);
  const tasks = (sourceTasks && sourceTasks.length > 0 ? sourceTasks : fallbackTasks).slice(0, expectedCount);

  while (tasks.length < expectedCount) {
    tasks.push(fallbackTasks[tasks.length] || fallbackTasks[fallbackTasks.length - 1]);
  }

  const totalMinutes =
    routineId === 'light'
      ? Math.min(timeBudgetMinutes || 15, 15)
      : routineId === 'standard'
        ? Math.max(20, Math.min(timeBudgetMinutes || DEFAULT_ASSUMED_TIME_BUDGET_MINUTES, 45))
        : Math.max(30, Math.min(Math.round((timeBudgetMinutes || DEFAULT_ASSUMED_TIME_BUDGET_MINUTES) * 1.4), 75));

  const perHabit = Math.max(8, Math.round(totalMinutes / tasks.length));

    return tasks.map((title, index) => {
      const duration = perHabit;
      const coins = getCoinsForTask(duration, title);
      return {
        id: `${routineId}_habit_${index + 1}`,
        title,
        duration,
        coins,
        type: 'habit' as const,
        tool: buildTaskToolSuggestion(goalName, title),
        reward: buildCoinReward(coins, duration),
      };
    });
}

function normalizeDayRoutines(
  goalName: string,
  dayRoutines: any,
  firstWeek: any,
  timeBudgetMinutes?: number,
  difficulty?: string,
) {
  const routines = Array.isArray(dayRoutines) ? dayRoutines : [];
  const desiredOrder: Array<'standard' | 'light' | 'intense'> = ['standard', 'light', 'intense'];
  const displayTitles: Record<'standard' | 'light' | 'intense', string> = {
    standard: 'Standard Day',
    light: 'Light Day',
    intense: 'Advanced Day',
  };

  const routineMap = new Map<'standard' | 'light' | 'intense', any>();

  routines.forEach((routine: any, index: number) => {
    const mode = inferRoutineMode(`${routine?.id || ''} ${routine?.title || ''}`, index);
    if (!routineMap.has(mode)) {
      routineMap.set(mode, routine);
    }
  });

  return desiredOrder.map((routineId) => {
    const source = routineMap.get(routineId) || null;
    const fallbackTasks = buildConcreteFallbackTasks(goalName, routineId, difficulty);
    const sourceHabits = Array.isArray(source?.habits)
      ? source.habits
          .map((habit: any, habitIndex: number) => ({
            id: String(habit?.id || `${routineId}_habit_${habitIndex + 1}`).trim(),
            title: String(habit?.title || '').trim(),
            duration: Number(habit?.duration) || 0,
            coins: Number(habit?.coins) || 0,
            type: habit?.type === 'task' ? 'task' : 'habit',
            tool: String(habit?.tool || habit?.cue || '').trim(),
            reward: String(habit?.reward || '').trim(),
          }))
          .filter((habit: any) => habit.title)
      : [];

    const weeklyTasks =
      routineId === 'light'
        ? firstWeek?.lightTasks
        : routineId === 'intense'
          ? firstWeek?.intenseTasks
          : firstWeek?.standardTasks;

    const habits =
      sourceHabits.length > 0 && sourceHabits.some((habit: any) => !looksVagueTask(habit.title, goalName))
        ? sourceHabits
        : buildFallbackRoutineHabits(goalName, routineId, weeklyTasks, timeBudgetMinutes, difficulty);

    const repairedHabits = habits.length > 0
      ? habits.map((habit: any, habitIndex: number) => {
          const duration = Number(habit.duration) || 15;
          const rawTitle = String(habit.title || '').trim();
          const title = rawTitle && !looksVagueTask(rawTitle, goalName)
            ? rawTitle
            : (fallbackTasks[habitIndex] || fallbackTasks[0] || weeklyTasks?.[habitIndex] || weeklyTasks?.[0] || rawTitle);
          const coins = Number(habit.coins) || getCoinsForTask(duration, title);
          return {
            id: String(habit.id || `${routineId}_habit_${habitIndex + 1}`).trim(),
            title,
            duration,
            coins,
            type: habit.type === 'task' ? 'task' : 'habit',
            tool: String(habit.tool || habit.cue || '').trim() || buildTaskToolSuggestion(goalName, title),
            reward: String(habit.reward || '').trim() || buildCoinReward(coins, duration),
          };
        })
      : buildFallbackRoutineHabits(goalName, routineId, weeklyTasks, timeBudgetMinutes, difficulty);

    return {
      id: routineId,
      title: displayTitles[routineId],
      habits: repairedHabits,
    };
  });
}

function normalizePlan(
  goalName: string,
  plan: any,
  meta: {
    timeline?: PlanningTimeline;
    timeBudgetMinutes?: number;
    difficulty?: string;
    defaultDetailedWeeksThrough?: number;
  } = {},
) {
  const fallbackTimeline = meta.timeline || buildPlanTimeline(goalName, null);
  const timelineUnit = (plan?.timelineUnit || plan?.goal?.aiTimelineUnit || fallbackTimeline.unit) as PlanningTimelineUnit;
  const requestedStages = Math.max(
    Number(plan?.planHorizonMonths) || 0,
    Number(plan?.timelineCount) || 0,
    Array.isArray(plan?.milestones) ? plan.milestones.length : 0,
    fallbackTimeline.count || 0,
    1,
  );
  const timeline: PlanningTimeline = {
    ...fallbackTimeline,
    unit: timelineUnit,
    count: requestedStages,
  };
  const normalizedMilestones = normalizeMilestones(goalName, plan?.milestones, requestedStages, timeline.unit);
  const detailDefault = meta.defaultDetailedWeeksThrough || getTimelineDetailCount(timeline);
  const detailedWeeksThrough = Math.max(
    Number(plan?.detailedWeeksThrough) || 0,
    getMaxWeekNumber(plan?.weeklyFocus),
    detailDefault,
  );
  const normalizedWeeklyFocus =
    detailedWeeksThrough > 0
      ? normalizeWeeklyFocusWindow(goalName, plan?.weeklyFocus, normalizedMilestones, timeline.unit, 1, detailedWeeksThrough)
      : [];
  const continuationNote = normalizeContinuationNote(goalName, plan?.continuationNote, timeline, detailedWeeksThrough || detailDefault);

  return {
    planTitle: String(plan?.planTitle || simplifyPlanTitle(goalName)).trim(),
    goalEmoji: normalizeGoalEmoji(goalName, plan?.goalEmoji),
    goalSummary: String(plan?.goalSummary || summarizeFinalStage(goalName, plan?.northStar)).trim(),
    realismNote: String(plan?.realismNote || 'This plan is sized to fit your current time, consistency, and constraints.').trim(),
    northStar: String(plan?.northStar || summarizeFinalStage(goalName, plan?.goalSummary)).trim(),
    planHorizonMonths: requestedStages,
    timelineUnit: timeline.unit,
    timelineCount: requestedStages,
    milestones: normalizedMilestones,
    weeklyFocus: normalizedWeeklyFocus,
    dayRoutines: normalizeDayRoutines(goalName, plan?.dayRoutines, normalizedWeeklyFocus[0], meta.timeBudgetMinutes, meta.difficulty),
    continuationNote,
    detailedWeeksThrough,
    ifThenRules:
      Array.isArray(plan?.ifThenRules) && plan.ifThenRules.length > 0
        ? plan.ifThenRules.slice(0, 5).map((rule: any) => ({
            trigger: String(rule.trigger || '').trim(),
            response: String(rule.response || '').trim(),
          }))
        : [],
    recommendedTools: Array.isArray(plan?.recommendedTools)
      ? plan.recommendedTools
          .slice(0, 5)
          .map((tool: any) => ({
            name: String(tool.name || '').trim(),
            description: String(tool.description || '').trim(),
            isFree: Boolean(tool.isFree),
          }))
          .filter((tool: any) => tool.name)
      : [],
    sources: Array.isArray(plan?.sources)
      ? plan.sources
          .slice(0, 5)
          .map((source: any) => ({
            title: String(source.title || '').trim(),
            url: String(source.url || '').trim(),
          }))
          .filter((source: any) => source.url)
      : [],
  };
}

function buildGemmaPrompt(task: string, payload: unknown) {
  const compactPayload = prunePromptValue(payload) ?? {};
  return [
    GEMMA_PROMPTING_NOTE,
    `ROLE: ${VENCER_PERSONA}`,
    `TASK: ${task.trim()}`,
    `DATA: ${JSON.stringify(compactPayload)}`,
  ].join('\n');
}

const PLANNING_OVERVIEW_TASK = `Create the long-horizon overview for a habit app. Keep it realistic, personalized, concise, and action-oriented. planTitle must be simple, 2-3 words max. Choose one accurate single emoji for goalEmoji that matches the goal well. goalSummary must describe the final visualized stage, not the next step. If context.timeline.deadlineProvided is true, use context.timeline.suggestedUnit and context.timeline.suggestedCount as a hard planning anchor. If context.timeline.deadlineProvided is false, do not assume a fake deadline: choose the most suitable timelineUnit and timelineCount yourself based on the goal, constraints, and realism. In that case, context.timeline.suggestedUnit and suggestedCount are only soft hints, not hard limits. If timelineUnit is day, the milestones must be day-by-day. If timelineUnit is week, the milestones must be week-by-week. If timelineUnit is month, the milestones must be month-by-month. The schema keeps the numeric field name month even when the real unit is day or week, so use month as the stage index only. Do not invent extra months when the deadline is only a few days or weeks away. Each milestone title and focus must say what the user will tangibly do or achieve in that exact stage, not vague labels like growth, progress, or mastery. Respect the actual topic exactly: fitness or weight loss goals must stay in training, movement, food, and recovery language; sleep goals must stay in bedtime, wake-up, wind-down, and sleep-environment language; chess goals must stay in puzzles, games, openings, endgames, and review; spiritual or Quran goals must stay in recitation, memorization, prayer, or review language. If difficulty is Easy, keep expectations simple and low-friction. Use context.planningAssumptions as hard limits when time or schedule is missing. If no explicit timing or schedule was provided, stay modest and low-load rather than assuming daily high availability. Return JSON with only: planTitle, goalEmoji, goalSummary, realismNote, northStar, planHorizonMonths, timelineUnit, timelineCount, milestones[{month,title,focus}], ifThenRules[{trigger,response}], recommendedTools[{name,description,isFree}]. Do not include weeklyFocus or dayRoutines in this step.`;

const MONTH_ONE_DETAILS_TASK = `Create only the detailed starter layer for the plan. The roadmap already exists. Return JSON with only: weeklyFocus, dayRoutines, continuationNote, detailedWeeksThrough, timelineUnit, timelineCount. Use overviewPlan.timelineUnit and overviewPlan.timelineCount as the chosen roadmap. Use context.timeline.detailUnit and context.timeline.detailCount as the number of starter entries to generate. If detailUnit is day, create exactly detailCount weeklyFocus entries representing day 1 to day N. If detailUnit is week, create exactly detailCount weeklyFocus entries representing week 1 to week N. The schema keeps the numeric field name week even when the real unit is day, so use week as the sequence index only. If the overall timeline is month-based, these detailed entries are the first 4 weeks of month 1 only. Each focus title, objective, and successSignal must be strategically different and tangible. Each weeklyFocus must include exactly 1 light task, 2 standard tasks, and 3 or 4 intense tasks. Every task must be one real-world action a person can do in one session. Avoid vague tasks like set up, work on the goal, make progress, focused session, or review what you learned. Respect the topic exactly: fitness or weight loss goals must stay in movement, workouts, food structure, or recovery; sleep goals must stay in bedtime, wind-down, wake-up, or sleep-environment actions; chess goals must stay in puzzles, games, opening review, or endgame review; spiritual goals must stay in memorization, recitation, prayer, or review. If no explicit timing or schedule was provided, use context.planningAssumptions and keep the daily layer especially modest and realistic. dayRoutines must include exactly 3 routines: light, standard, and intense. dayRoutines must show only example activities for the first day of the plan, not a full week schedule. Light Day = 1 activity, Standard Day = 2 activities, Intense Day = 3 or 4 activities. Every day-routine habit title must be a tangible one-session action, preferably starting with a verb and including the exact thing to do, quantity, or method. If a title could describe a category instead of a session, rewrite it until it becomes one clear session the user can do immediately. Every day-routine habit must include duration in minutes, coins, type, tool, and a reward mentioning coins. tool should explain how to do the habit in a practical way, like the resource, setup, or method to use. Do not use cue. continuationNote must clearly say that later detailed stages can be generated or refined as the user progresses. detailedWeeksThrough must equal context.timeline.detailCount.`;

const REFINEMENT_PATCH_TASK = `You are refining an existing plan. Return one valid JSON object only. Use the smallest possible patch instead of rewriting the whole plan. Allowed target values: replace_overview, replace_milestones, replace_weeks, replace_routines, replace_supporting, replace_multiple. Respect the exact goal topic and difficulty. Fitness or weight loss goals must stay in workout, movement, food structure, and recovery language. Sleep goals must stay in bedtime, wake-up, wind-down, and sleep-environment language. Chess goals must stay in puzzles, games, openings, endgames, and review. Spiritual or Quran goals must stay in recitation, memorization, prayer, or review language. If difficulty is Easy, keep changes simple and low-friction. If the original plan had no explicit timing or schedule, keep refinements modest and realistic instead of expanding the load. If the plan has no deadline, preserve the current chosen horizon unless the user clearly asks to change it. Return JSON with: target, reason, and only the fields that need changing from this schema: planTitle, goalEmoji, goalSummary, realismNote, northStar, planHorizonMonths, timelineUnit, timelineCount, milestones[{month,title,focus}], weeklyFocus[{week,focus,objective,successSignal,lightTasks,standardTasks,intenseTasks}], dayRoutines[{id,title,habits[{id,title,duration,coins,type,tool,reward}]}], ifThenRules[{trigger,response}], recommendedTools[{name,description,isFree}], continuationNote, detailedWeeksThrough. If the request is about routines, return only dayRoutines. If the request is about milestones or horizon, return milestones, planHorizonMonths, timelineUnit, and timelineCount only. Preserve unchanged sections by omitting them.`;

function buildPlanningOverviewPrompt(context: Record<string, unknown>) {
  const timeline = buildPromptTimelineContext(
    String(context.goalName || ''),
    (context.deadline as string | null | undefined) || null,
  );
  const planningAssumptions = buildAvailabilityAssumptions({
    timeBudgetMinutes: context.timeBudgetMinutes,
    preferredDays: context.preferredDays,
    customDays: context.customDays,
  });
  return buildGemmaPrompt(PLANNING_OVERVIEW_TASK, {
    context: {
      ...context,
      planningAssumptions,
      timeBudgetMinutes: planningAssumptions.effectiveTimeBudgetMinutes,
      goalDomain: inferGoalDomain(String(context.goalName || '')),
      timeline: {
        deadlineProvided: timeline.deadlineProvided,
        suggestedUnit: timeline.suggestedUnit,
        suggestedCount: timeline.suggestedCount,
        daysUntilDeadline: timeline.daysUntilDeadline,
        weeksUntilDeadline: timeline.weeksUntilDeadline,
        monthsUntilDeadline: timeline.monthsUntilDeadline,
      },
    },
  });
}

function buildMonthOnePrompt(
  context: Record<string, unknown>,
  overview: AIPlanOverviewResult | null,
) {
  const timeline = buildPromptTimelineContext(
    String(context.goalName || ''),
    (context.deadline as string | null | undefined) || null,
    overview,
  );
  const planningAssumptions = buildAvailabilityAssumptions({
    timeBudgetMinutes: context.timeBudgetMinutes,
    preferredDays: context.preferredDays,
    customDays: context.customDays,
  });

  return buildGemmaPrompt(MONTH_ONE_DETAILS_TASK, {
    context: {
      ...context,
      planningAssumptions,
      timeBudgetMinutes: planningAssumptions.effectiveTimeBudgetMinutes,
      goalDomain: inferGoalDomain(String(context.goalName || '')),
      timeline: {
        deadlineProvided: timeline.deadlineProvided,
        chosenUnit: timeline.chosenUnit,
        chosenCount: timeline.chosenCount,
        detailUnit: timeline.detailUnit,
        detailCount: timeline.detailCount,
        daysUntilDeadline: timeline.daysUntilDeadline,
        weeksUntilDeadline: timeline.weeksUntilDeadline,
        monthsUntilDeadline: timeline.monthsUntilDeadline,
      },
    },
    overviewPlan: prunePromptValue(overview) ?? null,
  });
}

function buildRefinementPrompt(
  context: Record<string, unknown>,
  existingPlan: Partial<StrategyPlan> | null | undefined,
  userPrompt: string,
) {
  const timeline = buildPromptTimelineContext(
    String(context.goalName || ''),
    (context.deadline as string | null | undefined) || null,
    {
      timelineUnit: existingPlan?.goal?.aiTimelineUnit,
      timelineCount: existingPlan?.goal?.aiTimelineCount || existingPlan?.milestones?.length,
    },
  );
  const planningAssumptions = buildAvailabilityAssumptions({
    timeBudgetMinutes: context.timeBudgetMinutes,
    preferredDays: context.preferredDays,
    customDays: context.customDays,
  });
  const scope = buildRefinementScopeSummary(userPrompt, existingPlan);
  const compactPlan = (compactPlanForPrompt(existingPlan) ?? {}) as any;

  const targetedContext =
    scope.target === 'replace_weeks'
      ? {
          planTitle: existingPlan?.goal?.title,
          milestones: compactPlan?.milestones,
          weeklyFocusRange: compactPlan?.weeklyFocusRange,
          weeklyFocus: Array.isArray(existingPlan?.weeklyFocus)
            ? existingPlan?.weeklyFocus.filter((item) => {
                if (!scope.requestedWeekRange) return true;
                const week = Number(item?.week) || 0;
                return week >= scope.requestedWeekRange.startWeek && week <= scope.requestedWeekRange.endWeek;
              })
            : [],
          dayRoutines: compactPlan?.dayRoutines,
        }
      : scope.target === 'replace_routines'
        ? {
            dayRoutines: compactPlan?.dayRoutines,
            weeklyFocus: Array.isArray(existingPlan?.weeklyFocus) ? existingPlan.weeklyFocus.slice(0, 4) : [],
          }
        : scope.target === 'replace_milestones'
          ? {
              planTitle: existingPlan?.goal?.title,
              northStar: existingPlan?.northStar,
              milestones: compactPlan?.milestones,
            }
          : scope.target === 'replace_supporting'
            ? {
                ifThenRules: compactPlan?.ifThenRules,
                recommendedTools: compactPlan?.recommendedTools,
              }
            : compactPlan;

  return buildGemmaPrompt(REFINEMENT_PATCH_TASK, {
    context: {
      ...context,
      planningAssumptions,
      timeBudgetMinutes: planningAssumptions.effectiveTimeBudgetMinutes,
      goalDomain: inferGoalDomain(String(context.goalName || '')),
      timeline: {
        deadlineProvided: timeline.deadlineProvided,
        chosenUnit: timeline.chosenUnit,
        chosenCount: timeline.chosenCount,
        detailUnit: timeline.detailUnit,
        detailCount: timeline.detailCount,
        daysUntilDeadline: timeline.daysUntilDeadline,
        weeksUntilDeadline: timeline.weeksUntilDeadline,
        monthsUntilDeadline: timeline.monthsUntilDeadline,
      },
    },
    refinementScope: scope,
    currentPlan: targetedContext,
    userChangeRequest: userPrompt,
  });
}

export type AIPlanResult = {
  planTitle: string;
  goalEmoji?: string;
  northStar: string;
  realismNote?: string;
  goalSummary?: string;
  planHorizonMonths?: number;
  timelineUnit?: PlanningTimelineUnit;
  timelineCount?: number;
  continuationNote?: string;
  detailedWeeksThrough?: number;
  milestones: { month: number; title: string; focus: string }[];
  weeklyFocus: {
    week: number;
    focus: string;
    objective?: string;
    successSignal?: string;
    lightTasks?: string[];
    standardTasks?: string[];
    intenseTasks?: string[];
  }[];
  dayRoutines: {
    id: string;
    title: string;
    habits: { id: string; title: string; duration: number; coins?: number; type: 'habit' | 'task'; tool?: string; cue?: string; reward?: string }[];
  }[];
  ifThenRules?: { trigger: string; response: string }[];
  recommendedTools?: { name: string; description: string; isFree: boolean }[];
  sources?: { title: string; url: string }[];
};

function alignPatchWeeklyFocusToScope(
  weeklyFocus: AIPlanPatchResult['weeklyFocus'],
  userPrompt: string,
) {
  if (!Array.isArray(weeklyFocus) || weeklyFocus.length === 0) return weeklyFocus;
  const scope = buildRefinementScopeSummary(userPrompt, null);
  if (!scope.requestedWeekRange) return weeklyFocus;

  const { startWeek, endWeek } = scope.requestedWeekRange;
  const requestedLength = endWeek - startWeek + 1;
  const weeks = weeklyFocus.map((item) => Number(item?.week) || 0).filter((week) => week > 0);
  const alreadyScoped = weeks.length > 0 && weeks.every((week) => week >= startWeek && week <= endWeek);

  if (alreadyScoped) return weeklyFocus;
  if (weeklyFocus.length === requestedLength) {
    return weeklyFocus.map((item, index) => ({
      ...item,
      week: startWeek + index,
    }));
  }

  return weeklyFocus;
}

function applyAIPlanPatch(
  goalName: string,
  existingPlan: Partial<StrategyPlan>,
  patch: AIPlanPatchResult,
  userPrompt: string,
  meta: {
    timeline?: PlanningTimeline;
    timeBudgetMinutes?: number;
    difficulty?: string;
  } = {},
) {
  const alignedWeeklyFocus = alignPatchWeeklyFocusToScope(patch.weeklyFocus, userPrompt);
  const mergedWeeklyFocus = alignedWeeklyFocus
    ? mergeWeeklyFocusEntries(existingPlan.weeklyFocus, alignedWeeklyFocus)
    : existingPlan.weeklyFocus;
  const requestedScope = buildRefinementScopeSummary(userPrompt, existingPlan);
  const detailedWeeksThrough = Math.max(
    getMaxWeekNumber(existingPlan.weeklyFocus),
    getMaxWeekNumber(mergedWeeklyFocus),
    Number(patch?.detailedWeeksThrough) || 0,
    requestedScope.requestedWeekRange?.endWeek || 0,
  );
  const timeline =
    meta.timeline ||
    buildPlanTimeline(goalName, existingPlan.goal?.deadlineDate || null);

  const mergedPlan = {
    planTitle: patch.planTitle || existingPlan.goal?.title || simplifyPlanTitle(goalName),
    goalEmoji: patch.goalEmoji || existingPlan.goal?.sticker || inferGoalEmoji(goalName),
    goalSummary:
      patch.goalSummary ||
      existingPlan.goal?.currentLevel ||
      summarizeFinalStage(goalName, existingPlan.northStar),
    realismNote: patch.realismNote,
    northStar: patch.northStar || existingPlan.northStar || summarizeFinalStage(goalName),
    planHorizonMonths:
      Number(patch.planHorizonMonths) ||
      Number(patch.timelineCount) ||
      (Array.isArray(patch.milestones) ? patch.milestones.length : 0) ||
      (Array.isArray(existingPlan.milestones) ? existingPlan.milestones.length : 0) ||
      timeline.count ||
      1,
    timelineUnit: patch.timelineUnit || existingPlan.goal?.aiTimelineUnit || timeline.unit,
    timelineCount:
      Number(patch.timelineCount) ||
      Number(existingPlan.goal?.aiTimelineCount) ||
      Number(patch.planHorizonMonths) ||
      timeline.count,
    milestones: patch.milestones || existingPlan.milestones,
    weeklyFocus: mergedWeeklyFocus,
    dayRoutines: patch.dayRoutines || existingPlan.dayRoutines,
    ifThenRules: patch.ifThenRules || existingPlan.ifThenRules,
    recommendedTools: patch.recommendedTools || existingPlan.recommendedTools,
    continuationNote:
      patch.continuationNote ||
      existingPlan.goal?.aiContinuationNote ||
      buildProgressiveContinuationNote(goalName, timeline, detailedWeeksThrough || getTimelineDetailCount(timeline)),
    detailedWeeksThrough,
  };

  return normalizePlan(goalName, mergedPlan, {
    timeline,
    timeBudgetMinutes: meta.timeBudgetMinutes,
    difficulty: meta.difficulty,
    defaultDetailedWeeksThrough: detailedWeeksThrough || getTimelineDetailCount(timeline),
  });
}

export async function generateAIPlan(params: {
  goalName: string;
  motivation?: string;
  currentSituation?: string;
  currentActivities?: string;
  timeBudgetMinutes?: number;
  trackingMode?: string;
  trackingTarget?: number;
  deadline?: string | null;
  difficulty?: string;
  preferredDays?: string;
  customDays?: string[];
  notificationPreference?: string;
  specificTimes?: string[];
  constraints?: string;
  stylePreference?: string;
  requireLocalAI?: boolean;
  onLocalAIProgress?: (progress: LocalAIProgress) => void;
}): Promise<AIPlanResult | null> {
  const { onLocalAIProgress, requireLocalAI = false, ...planningParams } = params;
  const effectiveTimeBudgetMinutes =
    Number(planningParams.timeBudgetMinutes) || DEFAULT_ASSUMED_TIME_BUDGET_MINUTES;
  const timeline = buildPlanTimeline(planningParams.goalName, planningParams.deadline);
  const overviewPrompt = buildPlanningOverviewPrompt(planningParams);
  let overviewRaw = await callLocalModel(overviewPrompt, onLocalAIProgress, {
    required: requireLocalAI,
  });
  let overviewParsed = tryParseJSON<AIPlanOverviewResult>(overviewRaw);

  if (!overviewParsed && requireLocalAI && overviewRaw) {
    console.log('[aiService] Retrying Gemma planning overview after invalid JSON.');
    overviewRaw = await callLocalModel(overviewPrompt, onLocalAIProgress, {
      required: true,
    });
    overviewParsed = tryParseJSON<AIPlanOverviewResult>(overviewRaw);
  }

  const overviewAnalysis = analyzeLocalAIOutput(overviewRaw);

  let monthOnePrompt: string | null = null;
  let monthOneRaw: string | null = null;
  let monthOneParsed: AIPlanDetailsResult | null = null;
  let monthOneAnalysis = analyzeLocalAIOutput(null);

  if (overviewParsed) {
    monthOnePrompt = buildMonthOnePrompt(planningParams, overviewParsed);
    monthOneRaw = await callLocalModel(monthOnePrompt, onLocalAIProgress, {
      required: requireLocalAI,
    });
    monthOneParsed = tryParseJSON<AIPlanDetailsResult>(monthOneRaw);

    if (!monthOneParsed && requireLocalAI && monthOneRaw) {
      console.log('[aiService] Retrying Gemma plan details after invalid JSON.');
      monthOneRaw = await callLocalModel(monthOnePrompt, onLocalAIProgress, {
        required: true,
      });
      monthOneParsed = tryParseJSON<AIPlanDetailsResult>(monthOneRaw);
    }

    monthOneAnalysis = analyzeLocalAIOutput(monthOneRaw);
  }

  const requiredDetailsMissing = Boolean(
    requireLocalAI &&
      overviewParsed &&
      (!monthOneParsed ||
        !Array.isArray(monthOneParsed.weeklyFocus) ||
        monthOneParsed.weeklyFocus.length === 0 ||
        !Array.isArray(monthOneParsed.dayRoutines) ||
        monthOneParsed.dayRoutines.length === 0),
  );
  const parsed = Boolean(overviewParsed) && !requiredDetailsMissing;
  const combinedPlan =
    overviewParsed && !requiredDetailsMissing
      ? normalizePlan(
          planningParams.goalName,
          {
            ...overviewParsed,
            ...(monthOneParsed || {}),
            continuationNote: normalizeContinuationNote(
              planningParams.goalName,
              monthOneParsed?.continuationNote,
              timeline,
              getTimelineDetailCount(timeline),
            ),
            detailedWeeksThrough: monthOneParsed?.detailedWeeksThrough || getTimelineDetailCount(timeline),
          },
          {
            timeline,
            timeBudgetMinutes: effectiveTimeBudgetMinutes,
            difficulty: planningParams.difficulty,
            defaultDetailedWeeksThrough: getTimelineDetailCount(timeline),
          },
        )
      : null;

  const debugSnapshot: LocalAIDebugSnapshot = {
    mode: 'plan',
    prompt: [overviewPrompt, monthOnePrompt].filter(Boolean).join('\n\n---\n\n'),
    rawOutput: [
      overviewRaw ? `[overview]\n${overviewRaw}` : null,
      monthOneRaw ? `[month_1]\n${monthOneRaw}` : null,
    ]
      .filter(Boolean)
      .join('\n\n'),
    parsed,
    promptChars: overviewPrompt.length + (monthOnePrompt?.length || 0),
    promptEstimatedTokens: estimateTokenCount(overviewPrompt) + estimateTokenCount(monthOnePrompt),
    rawOutputChars: overviewAnalysis.rawOutputChars + monthOneAnalysis.rawOutputChars,
    rawOutputEstimatedTokens:
      overviewAnalysis.rawOutputEstimatedTokens + monthOneAnalysis.rawOutputEstimatedTokens,
    extractedJSONObject:
      overviewAnalysis.extractedJSONObject && (monthOnePrompt ? monthOneAnalysis.extractedJSONObject : true),
    possibleTruncation: overviewAnalysis.possibleTruncation || monthOneAnalysis.possibleTruncation,
    contextSummary: [
      `Overview parsed: ${overviewParsed ? 'yes' : 'no'}`,
      `Detail layer parsed: ${monthOneParsed ? 'yes' : 'no'}`,
      `Timeline: ${timeline.count} ${getTimelineUnitLabel(timeline.unit, timeline.count).toLowerCase()}`,
      `Detail layer: ${getTimelineDetailCount(timeline)} ${getTimelineUnitLabel(getTimelineDetailUnit(timeline.unit), getTimelineDetailCount(timeline)).toLowerCase()}`,
      `Prompt chars: ${overviewPrompt.length + (monthOnePrompt?.length || 0)}`,
      `Prompt est tokens: ${estimateTokenCount(overviewPrompt) + estimateTokenCount(monthOnePrompt)}`,
      `Output chars: ${overviewAnalysis.rawOutputChars + monthOneAnalysis.rawOutputChars}`,
      `Output est tokens: ${overviewAnalysis.rawOutputEstimatedTokens + monthOneAnalysis.rawOutputEstimatedTokens}`,
      `Possible truncation: ${overviewAnalysis.possibleTruncation || monthOneAnalysis.possibleTruncation ? 'yes' : 'no'}`,
    ].join(' | '),
  };
  setLastLocalAIDebugSnapshot(debugSnapshot);

  if (requireLocalAI && !combinedPlan) {
    const status = await getLocalAIStatus();
    const reason = describeLocalAIFallbackReason({ status, snapshot: debugSnapshot });
    throw new Error(reason);
  }

  if (!combinedPlan) return null;

  return combinedPlan;
}

export async function refineAIPlan(params: {
  plan: Partial<StrategyPlan>;
  userPrompt: string;
  goalName?: string;
  currentSituation?: string;
  currentActivities?: string;
  trackingMode?: string;
  trackingTarget?: number;
  deadline?: string | null;
  difficulty?: string;
  preferredDays?: string;
  timeBudgetMinutes?: number;
  constraints?: string;
  stylePreference?: string;
  onLocalAIProgress?: (progress: LocalAIProgress) => void;
}): Promise<AIPlanResult | null> {
  const {
    plan,
    userPrompt,
    goalName,
    currentSituation,
    currentActivities,
    trackingMode,
    trackingTarget,
    deadline,
    difficulty,
    preferredDays,
    timeBudgetMinutes,
    constraints,
    stylePreference,
    onLocalAIProgress,
  } = params;
  const effectiveTimeBudgetMinutes = Number(timeBudgetMinutes) || DEFAULT_ASSUMED_TIME_BUDGET_MINUTES;

  const context = {
    goalName: goalName || plan?.goal?.title || 'Goal',
    currentSituation,
    currentActivities,
    trackingMode,
    trackingTarget,
    deadline,
    difficulty,
    preferredDays,
    timeBudgetMinutes,
    constraints,
    stylePreference,
  };
  const timeline = buildPlanTimeline(String(context.goalName), deadline || plan?.goal?.deadlineDate || null);

  const prompt = buildRefinementPrompt(context, plan, userPrompt);
  const raw = await callLocalModel(prompt, onLocalAIProgress);
  const parsed = tryParseJSON<AIPlanPatchResult>(raw);
  const outputAnalysis = analyzeLocalAIOutput(raw);
  setLastLocalAIDebugSnapshot({
    mode: 'refine',
    prompt,
    rawOutput: raw,
    parsed: Boolean(parsed),
    promptChars: prompt.length,
    promptEstimatedTokens: estimateTokenCount(prompt),
    rawOutputChars: outputAnalysis.rawOutputChars,
    rawOutputEstimatedTokens: outputAnalysis.rawOutputEstimatedTokens,
    extractedJSONObject: outputAnalysis.extractedJSONObject,
    possibleTruncation: outputAnalysis.possibleTruncation,
    contextSummary: [
      summarizePlanContext(plan),
      `Target: ${buildRefinementScopeSummary(userPrompt, plan).target}`,
      buildRefinementScopeSummary(userPrompt, plan).requestedMonth
        ? `Requested month: ${buildRefinementScopeSummary(userPrompt, plan).requestedMonth}`
        : 'Requested month: none',
      `Prompt chars: ${prompt.length}`,
      `Prompt est tokens: ${estimateTokenCount(prompt)}`,
      `Output chars: ${outputAnalysis.rawOutputChars}`,
      `Output est tokens: ${outputAnalysis.rawOutputEstimatedTokens}`,
      `Possible truncation: ${outputAnalysis.possibleTruncation ? 'yes' : 'no'}`,
    ].join(' | '),
  });
  if (!parsed) return null;

  return applyAIPlanPatch(String(context.goalName), plan, parsed, userPrompt, {
    timeline,
    timeBudgetMinutes: effectiveTimeBudgetMinutes,
    difficulty,
  });
}

export type AIWeeklyReviewResult = {
  weekOf: string;
  whatWorked: string;
  whatFailed: string;
  adjustments: string;
  recommendedRoutineType: 'standard' | 'light' | 'intense';
  principleApplied: string;
};

export async function getAIWeeklyReview(params: {
  goalTitle: string;
  completionRate: number;
  currentStreak: number;
  missedTaskPatterns: string[];
  weekOf: string;
  northStar?: string;
  currentMilestone?: { title: string; focus: string } | null;
  recentHistory?: { date: string; tasksCompleted: number; tasksTotal: number }[];
}): Promise<AIWeeklyReviewResult | null> {
  const prompt = buildGemmaPrompt(
    `Create a concise weekly review for a habit app. Return JSON with weekOf="${params.weekOf}", whatWorked, whatFailed, adjustments, recommendedRoutineType, and principleApplied.`,
    {
      ...params,
      completionRate: Math.round((params.completionRate || 0) * 100),
    },
  );

  return tryParseJSON<AIWeeklyReviewResult>(await callLocalModel(prompt));
}

export type AIDailyFeedbackResult = {
  insight: string;
  emoji: string;
};

export type AIDailyPlanResult = {
  tasks: {
    title: string;
    durationMinutes: number;
    block?: 'Morning' | 'Deep Work' | 'Anytime';
    reason?: string;
  }[];
};

export async function getAIDailyFeedback(params: {
  goalTitle: string;
  tasksCompleted: number;
  tasksTotal: number;
  streak: number;
  completionRate: number;
  dayOfWeek?: string;
  timeOfDay?: string;
}): Promise<AIDailyFeedbackResult | null> {
  const prompt = buildGemmaPrompt(
    'Write a brief daily insight for a habit app. Return JSON with insight under 120 characters and one emoji.',
    {
      ...params,
      completionRate: Math.round((params.completionRate || 0) * 100),
    },
  );

  return tryParseJSON<AIDailyFeedbackResult>(await callLocalModel(prompt));
}

export async function getAIDailyPlan(params: {
  dateKey: string;
  goalTitle: string;
  goalEmoji?: string;
  northStar?: string;
  currentMilestone?: { month?: number; title?: string; focus?: string } | null;
  currentWeeklyFocus?: {
    week?: number;
    focus?: string;
    objective?: string;
    successSignal?: string;
    lightTasks?: string[];
    standardTasks?: string[];
    intenseTasks?: string[];
  } | null;
  selectedRoutineId: 'light' | 'standard' | 'intense';
  routineHabits?: { title: string; duration?: number; tool?: string }[];
  difficulty?: string;
  timeBudgetMinutes?: number;
  currentStreak?: number;
  completionRate7d?: number;
  missedTaskPatterns?: string[];
  recentHistory?: { date: string; tasksCompleted: number; tasksTotal: number; completedTaskNames?: string[]; missedTaskNames?: string[] }[];
  constraints?: string;
}): Promise<AIDailyPlanResult | null> {
  const prompt = buildGemmaPrompt(
    'Create today\'s daily task plan for a habit app. Return JSON with only tasks[{title,durationMinutes,block,reason}]. Keep the total duration within timeBudgetMinutes. Make every title a concrete one-session action. Use the current weekly focus as the main driver. Match the selectedRoutineId: light = 1 task, standard = 2 tasks, intense = 3 or 4 tasks. Prefer blocks Morning, Deep Work, or Anytime. Use recent history and missed patterns to avoid repeating failed tasks in the same vague way. Fitness or weight loss goals must stay in workouts, walks, food structure, or recovery. Sleep goals must stay in bedtime, wake-up, wind-down, or sleep-environment actions. Chess goals must stay in puzzles, games, openings, endgames, or review. Spiritual or Quran goals must stay in recitation, memorization, prayer, or review. If difficulty is Easy, keep the tasks simple, calm, and low-friction.',
    {
      ...params,
      timeBudgetMinutes: params.timeBudgetMinutes || DEFAULT_ASSUMED_TIME_BUDGET_MINUTES,
      completionRate7d: Math.round((params.completionRate7d || 0) * 100),
    },
  );

  const parsed = tryParseJSON<AIDailyPlanResult>(await callLocalModel(prompt));
  if (!parsed?.tasks || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0) return null;

  const fallbackTitles = (
    Array.isArray(params.routineHabits) && params.routineHabits.length > 0
      ? params.routineHabits.map((habit) => String(habit?.title || '').trim()).filter(Boolean)
      : buildConcreteFallbackTasks(params.goalTitle, params.selectedRoutineId, params.difficulty)
  ).filter(Boolean);

  return {
    tasks: parsed.tasks
      .map((task, index) => {
        const rawTitle = String(task?.title || '').trim();
        const fallbackTitle = fallbackTitles[index] || fallbackTitles[fallbackTitles.length - 1] || rawTitle;
        const title =
          rawTitle && !looksVagueTask(rawTitle, params.goalTitle)
            ? rawTitle
            : fallbackTitle;
        return {
          title,
          durationMinutes: Math.max(8, Number(task?.durationMinutes) || 15),
          block:
            task?.block === 'Morning' || task?.block === 'Deep Work' || task?.block === 'Anytime'
              ? task.block
              : 'Anytime',
          reason: String(task?.reason || '').trim() || undefined,
        };
      })
      .filter((task) => task.title),
  };
}
