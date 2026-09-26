/**
 * A vertical lane on the kanban board. Issues reference a column through
 * {@link Issue.statusId}.
 */
export interface BoardColumn {
  id: string;
  projectId: string;
  title: string;
  /**
   * Maximum number of issues permitted in this lane, or `null` for no limit.
   * Exceeding a defined limit is a warning condition, not a hard block.
   */
  wipLimit: number | null;
  sortOrder: number;
}
