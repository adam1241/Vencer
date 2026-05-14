export type TaskBlock = 'Morning' | 'Deep Work' | 'Anytime';

export type DayTask = {
  id: number;
  text: string;
  completed: boolean;
  block: TaskBlock;
  durationMinutes: number;
  points?: number;
  strategyId?: string;
};
