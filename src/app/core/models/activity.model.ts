/** The kind of transition an {@link IssueActivity} entry records. */
export type IssueActivityAction =
  | 'created'
  | 'status_change'
  | 'assignee_change'
  | 'priority_change'
  | 'commented';

/** Every valid {@link IssueActivityAction} value. */
export const ISSUE_ACTIVITY_ACTIONS: readonly IssueActivityAction[] = [
  'created',
  'status_change',
  'assignee_change',
  'priority_change',
  'commented',
];

/**
 * Before/after payload for a tracked change. `field` is absent for `created`
 * and `commented` entries; `from` is absent when a value was first assigned.
 */
export interface IssueActivityDetails {
  field?: string;
  from?: string;
  to?: string;
}

/** An immutable audit entry describing something that happened to an issue. */
export interface IssueActivity {
  id: string;
  issueId: string;
  actorId: string;
  action: IssueActivityAction;
  details: IssueActivityDetails;
  timestamp: string;
}
