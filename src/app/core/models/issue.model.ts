/** The agile classification of an issue. */
export type IssueType = 'story' | 'bug' | 'task' | 'epic';

/** Every valid {@link IssueType} value. */
export const ISSUE_TYPES: readonly IssueType[] = ['story', 'bug', 'task', 'epic'];

/** Relative urgency of an issue. `urgent` is the highest, `lowest` the lowest. */
export type IssuePriority = 'lowest' | 'low' | 'medium' | 'high' | 'urgent';

/** Every valid {@link IssuePriority} value, ordered from lowest to highest. */
export const ISSUE_PRIORITIES: readonly IssuePriority[] = [
  'lowest',
  'low',
  'medium',
  'high',
  'urgent',
];

/** Type guard narrowing an arbitrary value to an {@link IssueType}. */
export function isIssueType(value: unknown): value is IssueType {
  return typeof value === 'string' && (ISSUE_TYPES as readonly string[]).includes(value);
}

/** Type guard narrowing an arbitrary value to an {@link IssuePriority}. */
export function isIssuePriority(value: unknown): value is IssuePriority {
  return (
    typeof value === 'string' && (ISSUE_PRIORITIES as readonly string[]).includes(value)
  );
}

/**
 * A single unit of tracked work.
 *
 * `sortOrder` is a fractional index (see `RankingService`): values are spaced
 * {@link RANKING_STEP} apart and a card dropped between two neighbours receives
 * the midpoint of their orders, so a move writes exactly one record.
 *
 * `version` is the optimistic-concurrency token. Every mutation increments it
 * and rejects writes that supply a stale value.
 */
export interface Issue {
  id: string;
  projectId: string;
  key: string;
  title: string;
  description: string;
  type: IssueType;
  priority: IssuePriority;
  /** Foreign key to {@link BoardColumn.id}. */
  statusId: string;
  storyPoints: number | null;
  assigneeId: string | null;
  reporterId: string;
  /**
   * Foreign key to {@link Sprint.id}, or `null` when the issue sits in the
   * backlog. The Backlog view queries exclusively on `sprintId === null`.
   */
  sprintId: string | null;
  sortOrder: number;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** A free-text comment attached to an {@link Issue}. */
export interface IssueComment {
  id: string;
  issueId: string;
  authorId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Base gap used when generating fractional sort orders. Kept in the model
 * layer because it is part of the persisted ordering contract rather than a
 * tunable of any particular service.
 */
export const RANKING_STEP = 1000.0;

/**
 * Two neighbours closer together than this are considered numerically
 * indistinguishable and trigger a column rebalance.
 */
export const RANKING_PRECISION_THRESHOLD = 0.0001;
