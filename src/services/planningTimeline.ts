import type { PlanningTimelineUnit } from '../types/goal';

export type PlanningTimeline = {
  unit: PlanningTimelineUnit;
  count: number;
  daysUntilDeadline: number | null;
  weeksUntilDeadline: number | null;
  monthsUntilDeadline: number | null;
};

function clampTimelineCount(value: number, unit: PlanningTimelineUnit) {
  if (unit === 'day') return Math.max(1, Math.min(value, 14));
  if (unit === 'week') return Math.max(1, Math.min(value, 12));
  return Math.max(1, Math.min(value, 36));
}

function diffDays(startIso: string, endIso: string) {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  const diff = Math.ceil((end.getTime() - start.getTime()) / 86400000);
  return Math.max(1, diff);
}

function inferFallbackMonths(goalName: string) {
  const text = String(goalName || '').toLowerCase();
  if (/(quran|qur'an|surah|surat|ayah|ayat|juz|tajweed|hifz|recit|islam|prayer|pray)/.test(text)) return 12;
  if (/(language|spanish|french|german|japanese|chinese|fluency|speaking|conversation)/.test(text)) return 12;
  if (/(sleep|bedtime|wake up|wakeup|circadian|insomnia)/.test(text)) return 3;
  if (/(weight loss|lose fat|lose weight|fitness|strength|muscle|gym|run|running|workout|exercise)/.test(text)) return 6;
  if (/(exam|course|certification|study|school|university|math|physics|biology|history)/.test(text)) return 6;
  if (/(chess|elo|opening|endgame|tactic|lichess|chess\.com)/.test(text)) return 4;
  return 4;
}

export function buildPlanningTimeline(
  goalName: string,
  deadline?: string | null,
  todayIso = new Date().toISOString().slice(0, 10),
): PlanningTimeline {
  if (!deadline) {
    return {
      unit: 'month',
      count: inferFallbackMonths(goalName),
      daysUntilDeadline: null,
      weeksUntilDeadline: null,
      monthsUntilDeadline: null,
    };
  }

  const daysUntilDeadline = diffDays(todayIso, deadline);
  const weeksUntilDeadline = Math.ceil(daysUntilDeadline / 7);
  const monthsUntilDeadline = Math.ceil(daysUntilDeadline / 30);

  if (daysUntilDeadline <= 14) {
    return {
      unit: 'day',
      count: clampTimelineCount(daysUntilDeadline, 'day'),
      daysUntilDeadline,
      weeksUntilDeadline,
      monthsUntilDeadline,
    };
  }

  if (daysUntilDeadline <= 84) {
    return {
      unit: 'week',
      count: clampTimelineCount(weeksUntilDeadline, 'week'),
      daysUntilDeadline,
      weeksUntilDeadline,
      monthsUntilDeadline,
    };
  }

  return {
    unit: 'month',
    count: clampTimelineCount(monthsUntilDeadline, 'month'),
    daysUntilDeadline,
    weeksUntilDeadline,
    monthsUntilDeadline,
  };
}

export function getTimelineUnitLabel(unit: PlanningTimelineUnit, count = 2) {
  const singular = unit === 'day' ? 'Day' : unit === 'week' ? 'Week' : 'Month';
  return count === 1 ? singular : `${singular}s`;
}

export function getTimelineStageLabel(unit: PlanningTimelineUnit, index: number) {
  return `${getTimelineUnitLabel(unit, 1)} ${index}`;
}

export function getTimelineDetailUnit(unit: PlanningTimelineUnit) {
  return unit === 'day' ? 'day' : 'week';
}

export function getTimelineDetailCount(timeline: PlanningTimeline) {
  if (timeline.unit === 'day') return timeline.count;
  if (timeline.unit === 'week') return timeline.count <= 8 ? timeline.count : 4;
  return 4;
}

export function getTimelineMilestoneIndex(unit: PlanningTimelineUnit, daysElapsed: number) {
  if (unit === 'day') return daysElapsed;
  if (unit === 'week') return Math.floor(daysElapsed / 7);
  return Math.floor(daysElapsed / 30);
}

export function getTimelineDetailIndex(unit: PlanningTimelineUnit, daysElapsed: number) {
  if (unit === 'day') return daysElapsed;
  return Math.floor(daysElapsed / 7);
}
