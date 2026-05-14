require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const crypto = require('crypto');
const Groq = require('groq-sdk');
const { VENCER_PERSONA } = require('./prompts');

const PORT = process.env.PORT || 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'moonshotai/kimi-k2-instruct-0905';
const ENABLE_WEB_SEARCH = process.env.ENABLE_WEB_SEARCH !== 'false';

if (!OPENAI_API_KEY && !GROQ_API_KEY) {
  console.error('No AI provider configured. Set OPENAI_API_KEY or GROQ_API_KEY.');
  process.exit(1);
}

const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
const app = express();

app.use(cors());
app.use(express.json({ limit: '75kb' }));

const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.headers['x-user-id'] || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit reached. You can make 5 AI requests per hour.' },
});

function hashPrompt(prompt) {
  return crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 16);
}

function tryParseJSON(text) {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = jsonMatch ? jsonMatch[1].trim() : String(text || '').trim();
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toTitleCase(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function monthsBetween(todayIso, endIso) {
  if (!endIso) return null;
  const start = new Date(`${todayIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  const raw = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  return Math.max(1, raw);
}

function inferGoalCategory(goalName) {
  const text = String(goalName || '').toLowerCase();
  if (/(russian|japanese|spanish|french|german|language|fluency|speaking)/.test(text)) return 'language';
  if (/(run|marathon|gym|fitness|strength|muscle|weight|cardio)/.test(text)) return 'fitness';
  if (/(write|book|essay|blog|newsletter)/.test(text)) return 'writing';
  if (/(study|exam|course|cert|learn|skill)/.test(text)) return 'learning';
  if (/(business|startup|career|portfolio|productivity|deep work)/.test(text)) return 'productivity';
  if (/(meditation|mindful|journal|sleep|calm)/.test(text)) return 'mindfulness';
  return 'general';
}

function inferSuggestedMonths(goalName, deadline) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const deadlineMonths = monthsBetween(todayIso, deadline);
  if (deadlineMonths) return Math.min(Math.max(deadlineMonths, 1), 18);

  const category = inferGoalCategory(goalName);
  if (category === 'language') return 12;
  if (category === 'fitness') return 6;
  if (category === 'learning') return 6;
  return 4;
}

function simplifyPlanTitle(goalName) {
  const cleaned = String(goalName || '')
    .replace(/^(learn(ing)?|build(ing)?|start(ing)?|become|improve|master)\s+/i, '')
    .replace(/[^\w\s]/g, ' ')
    .trim();
  const words = (cleaned || goalName || 'Goal Plan').split(/\s+/).filter(Boolean).slice(0, 4);
  return toTitleCase(words.join(' '));
}

function buildDefaultWeeklyTasks(goalName, focus, objective) {
  const subject = goalName || 'the goal';
  const focusSeed = objective || focus || `Make progress on ${subject}`;
  return {
    lightTasks: [`Do a 10-minute minimum version of: ${focusSeed}`],
    standardTasks: [
      `Do the main practice block for: ${focusSeed}`,
      `Log one concrete takeaway or mistake from today's ${subject} work`,
    ],
    intenseTasks: [
      `Do an extended deep-work block for: ${focusSeed}`,
      `Complete one deliberate practice drill tied to this week's focus`,
      `Review mistakes and write the next improvement step`,
    ],
  };
}

function normalizeWeeklyFocus(goalName, weeklyFocus, monthCount) {
  const targetWeeks = Math.max(4, monthCount * 4);
  const items = Array.isArray(weeklyFocus) ? weeklyFocus : [];
  const normalized = [];

  for (let week = 1; week <= targetWeeks; week++) {
    const source = items.find((item) => Number(item.week) === week) || items[week - 1] || {};
    const focus = String(source.focus || `Week ${week} progress block for ${goalName}`).trim();
    const objective = String(source.objective || '').trim();
    const successSignal = String(source.successSignal || `You complete the key sessions for week ${week}.`).trim();
    const defaults = buildDefaultWeeklyTasks(goalName, focus, objective);

    normalized.push({
      week,
      focus,
      objective: objective || focus,
      successSignal,
      lightTasks: Array.isArray(source.lightTasks) && source.lightTasks.length > 0 ? source.lightTasks.slice(0, 3) : defaults.lightTasks,
      standardTasks: Array.isArray(source.standardTasks) && source.standardTasks.length > 0 ? source.standardTasks.slice(0, 4) : defaults.standardTasks,
      intenseTasks: Array.isArray(source.intenseTasks) && source.intenseTasks.length > 0 ? source.intenseTasks.slice(0, 5) : defaults.intenseTasks,
    });
  }

  return normalized;
}

function normalizeDayRoutines(goalName, dayRoutines, timeBudgetMinutes, difficulty) {
  const fallbackTitle = simplifyPlanTitle(goalName);
  const target = Math.max(15, Number(timeBudgetMinutes) || 30);
  const difficultyScale =
    String(difficulty || 'Balanced').toLowerCase() === 'easy'
      ? { light: 0.5, standard: 0.8, intense: 1.1 }
      : String(difficulty || 'Balanced').toLowerCase() === 'intense'
        ? { light: 0.5, standard: 1, intense: 1.5 }
        : { light: 0.5, standard: 1, intense: 1.3 };

  const defaults = {
    standard: {
      id: 'standard',
      title: 'Standard Day',
      habits: [
        {
          id: 'h_std_1',
          title: `Main ${fallbackTitle} block`,
          duration: Math.round(target * difficultyScale.standard),
          type: 'habit',
          cue: 'After I start my first planned focus block',
          reward: 'Then I mark it done and take a 2-minute reset',
        },
      ],
    },
    light: {
      id: 'light',
      title: 'Light Day',
      habits: [
        {
          id: 'h_lgt_1',
          title: `Minimum ${fallbackTitle} session`,
          duration: Math.max(8, Math.round(target * difficultyScale.light)),
          type: 'habit',
          cue: 'After I sit down for my easiest available work block',
          reward: 'Then I mark the streak and stop guilt-free if needed',
        },
      ],
    },
    intense: {
      id: 'intense',
      title: 'Intense Day',
      habits: [
        {
          id: 'h_int_1',
          title: `Deep ${fallbackTitle} session`,
          duration: Math.round(target * difficultyScale.intense),
          type: 'habit',
          cue: 'After I clear distractions from my desk and phone',
          reward: 'Then I log one concrete win and take a short walk',
        },
      ],
    },
  };

  const byId = {};
  for (const routine of Array.isArray(dayRoutines) ? dayRoutines : []) {
    if (!routine || !routine.id) continue;
    byId[routine.id] = {
      id: routine.id,
      title: routine.title || defaults[routine.id]?.title || toTitleCase(routine.id),
      habits: Array.isArray(routine.habits) && routine.habits.length > 0
        ? routine.habits.slice(0, 4).map((habit, index) => ({
            id: habit.id || `h_${routine.id}_${index + 1}`,
            title: String(habit.title || `${fallbackTitle} step ${index + 1}`).trim(),
            duration: Math.max(5, Number(habit.duration) || defaults[routine.id]?.habits?.[0]?.duration || 15),
            type: habit.type === 'task' ? 'task' : 'habit',
            cue: String(habit.cue || defaults[routine.id]?.habits?.[0]?.cue || '').trim(),
            reward: String(habit.reward || defaults[routine.id]?.habits?.[0]?.reward || '').trim(),
          }))
        : defaults[routine.id]?.habits || [],
    };
  }

  return ['standard', 'light', 'intense'].map((id) => byId[id] || defaults[id]);
}

function normalizePlan(goalName, plan, meta = {}) {
  const monthCount = Math.min(
    Math.max(Array.isArray(plan?.milestones) ? plan.milestones.length : 0, meta.suggestedMonths || 4, 1),
    18,
  );
  const normalizedMilestones = Array.from({ length: monthCount }, (_, index) => {
    const month = index + 1;
    const source =
      (Array.isArray(plan?.milestones) && plan.milestones.find((item) => Number(item.month) === month)) ||
      plan?.milestones?.[index] ||
      null;

    return {
      month,
      title: String(source?.title || `Month ${month}: ${month === 1 ? 'Foundation' : `Build ${month}`}`).trim(),
      focus: String(source?.focus || `Build realistic progress on ${goalName} during month ${month}.`).trim(),
    };
  });

  return {
    planTitle: String(plan?.planTitle || simplifyPlanTitle(goalName)).trim(),
    goalSummary: String(plan?.goalSummary || `A simpler version of the goal is: ${simplifyPlanTitle(goalName)}.`).trim(),
    realismNote: String(plan?.realismNote || '').trim(),
    northStar: String(plan?.northStar || `I am becoming someone who follows through on ${goalName}.`).trim(),
    planHorizonMonths: monthCount,
    milestones: normalizedMilestones,
    weeklyFocus: normalizeWeeklyFocus(goalName, plan?.weeklyFocus, monthCount),
    dayRoutines: normalizeDayRoutines(goalName, plan?.dayRoutines, meta.timeBudgetMinutes, meta.difficulty),
    ifThenRules: Array.isArray(plan?.ifThenRules) && plan.ifThenRules.length > 0
      ? plan.ifThenRules.slice(0, 5).map((rule) => ({
          trigger: String(rule.trigger || '').trim(),
          response: String(rule.response || '').trim(),
        }))
      : [
          { trigger: 'If I feel low energy or short on time', response: 'Switch to the Light Day version and protect the streak.' },
          { trigger: 'If I miss a day', response: 'Do not double up. Resume with the next scheduled session and make it easy to restart.' },
          { trigger: 'If distractions keep interrupting me', response: 'Do a 10-minute focused block with the phone away, then reassess.' },
        ],
    recommendedTools: Array.isArray(plan?.recommendedTools)
      ? plan.recommendedTools.slice(0, 5).map((tool) => ({
          name: String(tool.name || '').trim(),
          description: String(tool.description || '').trim(),
          isFree: Boolean(tool.isFree),
        })).filter((tool) => tool.name)
      : [],
    sources: Array.isArray(plan?.sources)
      ? plan.sources.slice(0, 5).map((source) => ({
          title: String(source.title || '').trim(),
          url: String(source.url || '').trim(),
        })).filter((source) => source.url)
      : [],
  };
}

function extractOpenAIText(response) {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) {
    return response.output_text;
  }

  const chunks = [];
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim();
}

async function callOpenAI(prompt, { useWebSearch = false, maxOutputTokens = 5000 } = {}) {
  const body = {
    model: OPENAI_MODEL,
    instructions: VENCER_PERSONA,
    input: prompt,
    max_output_tokens: maxOutputTokens,
  };

  if (useWebSearch && ENABLE_WEB_SEARCH) {
    body.tools = [{ type: 'web_search_preview' }];
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message || 'OpenAI request failed');
  }

  return extractOpenAIText(json);
}

async function callGroq(messages, maxTokens = 4096) {
  if (!groq) {
    throw new Error('Groq is not configured');
  }

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages,
    max_tokens: maxTokens,
    temperature: 0.5,
  });

  return completion.choices[0]?.message?.content || '';
}

async function callPlanner(prompt, options = {}) {
  if (OPENAI_API_KEY) {
    return callOpenAI(prompt, options);
  }

  return callGroq(
    [
      { role: 'system', content: VENCER_PERSONA },
      { role: 'user', content: prompt },
    ],
    options.maxOutputTokens || 4096,
  );
}

function buildPlanningPrompt(context, existingPlan = null, userPrompt = null) {
  const requestedDeadline = context.deadline || 'None';
  const suggestedMonths = inferSuggestedMonths(context.goalName, context.deadline);

  return `Return only one valid JSON object. No markdown. No code fences. No extra text.

TASK:
Build a realistic, highly practical habit and goal plan. The plan must be specific enough that a mobile app can turn the current week's plan into daily actions without guessing.

USER CONTEXT:
${JSON.stringify({
  goalName: context.goalName,
  motivation: context.motivation || '',
  currentSituation: context.currentSituation || '',
  currentActivities: context.currentActivities || '',
  timeBudgetMinutes: context.timeBudgetMinutes || 30,
  trackingMode: context.trackingMode || 'points',
  trackingTarget: context.trackingTarget || 30,
  deadline: requestedDeadline,
  difficulty: context.difficulty || 'Balanced',
  preferredDays: context.preferredDays || 'Every day',
  customDays: context.customDays || [],
  notificationPreference: context.notificationPreference || '',
  specificTimes: context.specificTimes || [],
  constraints: context.constraints || '',
  stylePreference: context.stylePreference || '',
  suggestedMonths,
}, null, 2)}

${existingPlan ? `CURRENT PLAN:\n${JSON.stringify(existingPlan, null, 2)}\n` : ''}
${userPrompt ? `USER CHANGE REQUEST:\n${userPrompt}\n` : ''}

PLANNING RULES:
- Restate the goal as a simpler short title in planTitle. 2 to 4 words only.
- Add goalSummary as one sentence that reframes the goal in plain language.
- Be realistic. If the goal is broad, the plan should focus on the next believable phase, not promise mastery too fast.
- If the deadline is short, adjust the scope honestly. Example: for a language, 3 months means foundations and simple conversation practice, not fluency.
- Milestones must be concrete, progressive, and practical. Avoid vague themes like "Improve more" or "Keep going".
- Weekly focus must be much more specific than milestones.
- Every weeklyFocus item must include:
  - focus: short weekly headline
  - objective: what changes this week
  - successSignal: one observable proof
  - lightTasks: 1 to 2 practical daily actions for low-energy days
  - standardTasks: 2 to 3 practical daily actions for normal days
  - intenseTasks: 2 to 4 practical daily actions for hard days
- Daily task strings must start with action verbs and be usable as checklist items.
- Make the weekly tasks reflect the month phase. Example for language learning: pronunciation, core vocabulary, sentence patterns, listening reps, speaking reps, review, and retrieval practice in a realistic order.
- dayRoutines should define reusable templates for Standard Day, Light Day, and Intense Day with realistic durations, concrete cues, and immediate rewards.
- Difficulty rules:
  - Easy: light day should be the realistic default and standard day should still be manageable.
  - Balanced: standard day should fit the user's normal week.
  - Intense: intense day should be ambitious but still respect the user's time budget.
- Constraints are hard limits.
- If you know good real tools or apps for this goal, include them in recommendedTools. If web search is available, use it to improve realism, sequence, and tool recommendations.

JSON SHAPE:
{
  "planTitle": "short title",
  "goalSummary": "plain-language summary",
  "realismNote": "optional note about realistic scope or deadline tradeoff",
  "northStar": "identity-based system statement",
  "planHorizonMonths": ${suggestedMonths},
  "milestones": [
    { "month": 1, "title": "Month 1: ...", "focus": "..." }
  ],
  "weeklyFocus": [
    {
      "week": 1,
      "focus": "...",
      "objective": "...",
      "successSignal": "...",
      "lightTasks": ["..."],
      "standardTasks": ["...", "..."],
      "intenseTasks": ["...", "..."]
    }
  ],
  "dayRoutines": [
    {
      "id": "standard",
      "title": "Standard Day",
      "habits": [
        { "id": "h_std_1", "title": "...", "duration": 30, "type": "habit", "cue": "After ...", "reward": "Then ..." }
      ]
    },
    {
      "id": "light",
      "title": "Light Day",
      "habits": [
        { "id": "h_lgt_1", "title": "...", "duration": 10, "type": "habit", "cue": "After ...", "reward": "Then ..." }
      ]
    },
    {
      "id": "intense",
      "title": "Intense Day",
      "habits": [
        { "id": "h_int_1", "title": "...", "duration": 45, "type": "habit", "cue": "After ...", "reward": "Then ..." }
      ]
    }
  ],
  "ifThenRules": [
    { "trigger": "If ...", "response": "Then ..." }
  ],
  "recommendedTools": [
    { "name": "Tool", "description": "Why it helps", "isFree": true }
  ]
}`;
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    cached: cache.keys().length,
    provider: OPENAI_API_KEY ? 'openai' : 'groq',
    webSearch: Boolean(OPENAI_API_KEY && ENABLE_WEB_SEARCH),
  });
});

app.post('/api/ai/generate-plan', aiLimiter, async (req, res) => {
  try {
    const {
      goalName,
      motivation,
      currentSituation,
      currentActivities,
      timeBudgetMinutes,
      trackingMode,
      trackingTarget,
      deadline,
      difficulty,
      preferredDays,
      customDays,
      notificationPreference,
      specificTimes,
      constraints,
      stylePreference,
    } = req.body;

    if (!goalName) return res.status(400).json({ error: 'goalName is required' });

    const context = {
      goalName,
      motivation,
      currentSituation,
      currentActivities,
      timeBudgetMinutes,
      trackingMode,
      trackingTarget,
      deadline,
      difficulty,
      preferredDays,
      customDays,
      notificationPreference,
      specificTimes,
      constraints,
      stylePreference,
    };

    const prompt = buildPlanningPrompt(context);
    const cacheKey = `plan_${OPENAI_API_KEY ? 'openai' : 'groq'}_${hashPrompt(prompt)}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const raw = await callPlanner(prompt, {
      useWebSearch: true,
      maxOutputTokens: 7000,
    });

    const parsed = tryParseJSON(raw);
    if (!parsed) {
      console.error('Failed to parse generate-plan response:', raw.slice(0, 500));
      return res.status(502).json({ error: 'AI returned invalid format' });
    }

    const finalPlan = normalizePlan(goalName, parsed, {
      suggestedMonths: inferSuggestedMonths(goalName, deadline),
      timeBudgetMinutes,
      difficulty,
    });

    cache.set(cacheKey, finalPlan);
    res.json(finalPlan);
  } catch (err) {
    console.error('generate-plan error:', err.message);
    res.status(503).json({ error: 'AI is a bit busy, try in a moment' });
  }
});

app.post('/api/ai/refine-plan', aiLimiter, async (req, res) => {
  try {
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
    } = req.body;

    if (!plan || !userPrompt) {
      return res.status(400).json({ error: 'Both plan and userPrompt are required' });
    }

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

    const prompt = buildPlanningPrompt(context, plan, userPrompt);
    const raw = await callPlanner(prompt, {
      useWebSearch: true,
      maxOutputTokens: 7000,
    });

    const parsed = tryParseJSON(raw);
    if (!parsed) {
      console.error('Failed to parse refine-plan response:', raw.slice(0, 500));
      return res.status(502).json({ error: 'AI returned invalid format during refinement' });
    }

    const finalPlan = normalizePlan(context.goalName, parsed, {
      suggestedMonths: inferSuggestedMonths(context.goalName, deadline),
      timeBudgetMinutes,
      difficulty,
    });

    res.json(finalPlan);
  } catch (err) {
    console.error('refine-plan error:', err.message);
    res.status(503).json({ error: 'AI is a bit busy, try in a moment' });
  }
});

app.post('/api/ai/weekly-review', aiLimiter, async (req, res) => {
  try {
    const { goalTitle, completionRate, currentStreak, missedTaskPatterns, weekOf, northStar, currentMilestone, recentHistory } = req.body;

    if (!goalTitle) return res.status(400).json({ error: 'goalTitle is required' });

    const prompt = `Return one valid JSON object only.
You are doing a concise weekly review for a habit app.

CONTEXT:
${JSON.stringify({
  goalTitle,
  northStar,
  currentMilestone,
  weekOf,
  completionRate: Math.round((completionRate || 0) * 100),
  currentStreak,
  missedTaskPatterns: missedTaskPatterns || [],
  recentHistory: recentHistory || [],
}, null, 2)}

JSON:
{
  "weekOf": "${weekOf}",
  "whatWorked": "1-2 sentences",
  "whatFailed": "1-2 sentences",
  "adjustments": "1-2 specific actions",
  "recommendedRoutineType": "standard",
  "principleApplied": "short principle"
}`;

    const cacheKey = 'review_' + hashPrompt(`${goalTitle}_${weekOf}_${completionRate}`);
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const raw = await callPlanner(prompt, { maxOutputTokens: 1200 });
    const parsed = tryParseJSON(raw);
    if (!parsed) {
      return res.status(502).json({ error: 'AI returned invalid format' });
    }

    cache.set(cacheKey, parsed);
    res.json(parsed);
  } catch (err) {
    console.error('weekly-review error:', err.message);
    res.status(503).json({ error: 'AI is a bit busy, try in a moment' });
  }
});

app.post('/api/ai/daily-feedback', aiLimiter, async (req, res) => {
  try {
    const { goalTitle, tasksCompleted, tasksTotal, streak, completionRate, dayOfWeek, timeOfDay } = req.body;

    if (!goalTitle) return res.status(400).json({ error: 'goalTitle is required' });

    const prompt = `Return one valid JSON object only.
You are writing a brief daily insight for a habit app.

CONTEXT:
${JSON.stringify({
  goalTitle,
  tasksCompleted,
  tasksTotal,
  streak,
  completionRate: Math.round((completionRate || 0) * 100),
  dayOfWeek,
  timeOfDay,
}, null, 2)}

JSON:
{
  "insight": "A tactical or encouraging note under 120 characters",
  "emoji": "One emoji"
}`;

    const cacheKey = 'daily_' + hashPrompt(`${goalTitle}_${tasksCompleted}_${tasksTotal}_${streak}_${dayOfWeek}`);
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const raw = await callPlanner(prompt, { maxOutputTokens: 500 });
    const parsed = tryParseJSON(raw);
    if (!parsed) {
      return res.status(502).json({ error: 'AI returned invalid format' });
    }

    cache.set(cacheKey, parsed);
    res.json(parsed);
  } catch (err) {
    console.error('daily-feedback error:', err.message);
    res.status(503).json({ error: 'AI is a bit busy, try in a moment' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Ziel AI server running on 0.0.0.0:${PORT}`);
  console.log(`Provider: ${OPENAI_API_KEY ? `OpenAI (${OPENAI_MODEL})` : `Groq (${GROQ_MODEL})`}`);
  console.log(`Web search: ${OPENAI_API_KEY && ENABLE_WEB_SEARCH ? 'enabled' : 'disabled'}`);
});
