import { IssuePriority, IssueType } from './issue.model';

/** How much vertical space an issue card occupies. */
export type ViewDensity = 'compact' | 'comfortable';

/** Every valid {@link ViewDensity} value. */
export const VIEW_DENSITIES: readonly ViewDensity[] = ['compact', 'comfortable'];

/**
 * The complete set of predicates applied to the raw issue collection before it
 * reaches the board. An empty array means "no constraint" for list-valued
 * fields; `null` means "no constraint" for scalar fields.
 */
export interface BoardFilterState {
  searchQuery: string;
  assigneeIds: string[];
  priorities: IssuePriority[];
  types: IssueType[];
  sprintId: string | null;
  density: ViewDensity;
}

/**
 * Builds a fresh filter state.
 *
 * A new object (with new arrays) is returned on every call so that callers can
 * hand the result to a signal `set`/`update` without risking a shared mutable
 * default being aliased across the application.
 */
export function createDefaultBoardFilterState(): BoardFilterState {
  return {
    searchQuery: '',
    assigneeIds: [],
    priorities: [],
    types: [],
    sprintId: null,
    density: 'comfortable',
  };
}

/**
 * Counts how many filter criteria are actively narrowing the board. Used to
 * drive the badge on the collapsed mobile filter control.
 */
export function countActiveFilters(filter: BoardFilterState): number {
  let active = 0;

  if (filter.searchQuery.trim().length > 0) {
    active += 1;
  }
  active += filter.assigneeIds.length;
  active += filter.priorities.length;
  active += filter.types.length;

  return active;
}

/** Removes every narrowing criterion, preserving the chosen density. */
export function clearBoardFilters(filter: BoardFilterState): BoardFilterState {
  return {
    ...createDefaultBoardFilterState(),
    density: filter.density,
  };
}
