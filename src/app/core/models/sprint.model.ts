/** Lifecycle state of a {@link Sprint}. */
export type SprintStatus = 'future' | 'active' | 'completed';

/** Every valid {@link SprintStatus} value, ordered by lifecycle progression. */
export const SPRINT_STATUSES: readonly SprintStatus[] = ['future', 'active', 'completed'];

/** Type guard narrowing an arbitrary value to a {@link SprintStatus}. */
export function isSprintStatus(value: unknown): value is SprintStatus {
  return typeof value === 'string' && (SPRINT_STATUSES as readonly string[]).includes(value);
}

/** A time-boxed iteration that groups issues for delivery. */
export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string;
  status: SprintStatus;
  /** ISO-8601 date, or `null` while the sprint has not been scheduled. */
  startDate: string | null;
  /** ISO-8601 date, or `null` while the sprint has not been scheduled. */
  endDate: string | null;
  totalPoints: number;
  completedPoints: number;
  createdAt: string;
}
