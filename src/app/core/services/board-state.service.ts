import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { liveQuery } from 'dexie';
import { Subscribable } from 'rxjs';

import { APP_CONFIG } from '../config/runtime-config';
import { db, OptimisticConcurrencyError } from '../database/scrum-database';
import {
  IssueActivity,
  IssueActivityAction,
  IssueActivityDetails,
} from '../models/activity.model';
import { BoardColumn } from '../models/column.model';
import {
  BoardFilterState,
  ViewDensity,
  clearBoardFilters,
  createDefaultBoardFilterState,
} from '../models/filter.model';
import { Issue, IssueComment, IssuePriority } from '../models/issue.model';
import { Project } from '../models/project.model';
import { Sprint } from '../models/sprint.model';
import { User } from '../models/user.model';
import { NeighborOrders, RankingService, StalePositionError } from './ranking.service';

/** A request to place an issue at an insertion point in a column. */
export interface IssueMoveRequest {
  readonly issueId: string;
  readonly targetColumnId: string;
  /** Insertion index within the target column, measured after the card is lifted out. */
  readonly targetIndex: number;
}

/** Everything required to create a new issue. */
export interface CreateIssueRequest {
  readonly title: string;
  readonly type: Issue['type'];
  readonly priority: IssuePriority;
  readonly statusId: string;
  readonly assigneeId: string | null;
  readonly storyPoints: number | null;
  readonly sprintId: string | null;
  readonly description?: string;
}

/** Everything required to add a teammate. */
export interface CreateUserInput {
  readonly name: string;
  readonly email: string;
  readonly role: User['role'];
  /** Optional; omitted or blank renders initials instead of an image. */
  readonly avatarUrl?: string;
}

/** A partial edit. Omitted fields are left untouched. */
export type UpdateUserInput = Partial<Omit<User, 'id' | 'createdAt'>>;

/**
 * Deliberately permissive: enough to catch a typo without rejecting addresses
 * that are perfectly valid but unusual. The only real test of an address is
 * delivering to it.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The single reactive owner of board state.
 *
 * Tables are exposed as signals fed by Dexie `liveQuery`, so a write anywhere
 * propagates back through IndexedDB and updates every view. Mutations never
 * patch local copies: they write to the database and let the query re-emit,
 * which is what keeps the rendered board and the store from drifting apart.
 *
 * Ordering uses fractional indices, so a move writes exactly one row instead
 * of renumbering the column.
 */
@Injectable({ providedIn: 'root' })
export class BoardStateService {
  private readonly ranking = inject(RankingService);

  private readonly projectId = APP_CONFIG.defaultProjectId;

  readonly project = toOptionalSignal<Project>(
    liveQuery(() => db.projects.get(this.projectId)),
  );

  readonly columns = toArraySignal<BoardColumn>(
    liveQuery(() => db.columns.where('projectId').equals(this.projectId).toArray()),
  );

  readonly issues = toArraySignal<Issue>(
    liveQuery(() => db.issues.where('projectId').equals(this.projectId).toArray()),
  );

  readonly sprints = toArraySignal<Sprint>(
    liveQuery(() => db.sprints.where('projectId').equals(this.projectId).toArray()),
  );

  readonly users = toArraySignal<User>(liveQuery(() => db.users.toArray()));

  readonly comments = toArraySignal<IssueComment>(liveQuery(() => db.comments.toArray()));

  readonly activities = toArraySignal<IssueActivity>(liveQuery(() => db.activities.toArray()));

  /** The active filter set, owned here so every surface stays in sync. */
  readonly filter = signal<BoardFilterState>(createDefaultBoardFilterState());

  /** User-facing message from the last failed mutation, if any. */
  readonly errorMessage = signal<string | null>(null);

  /**
   * Dismisses the current error.
   *
   * A stale failure is worse than none: the next successful write would leave
   * it on screen, describing a problem the user has already moved past.
   */
  clearError(): void {
    this.errorMessage.set(null);
  }

  /** True while a mutation is in flight; used to disable destructive actions. */
  readonly isMutating = signal(false);

  readonly columnsSorted = computed<BoardColumn[]>(() =>
    [...this.columns()].sort((a, b) => a.sortOrder - b.sortOrder),
  );

  readonly sprintsSorted = computed<Sprint[]>(() =>
    [...this.sprints()].sort((a, b) => a.name.localeCompare(b.name)),
  );

  readonly usersById = computed<ReadonlyMap<string, User>>(
    () => new Map(this.users().map((user) => [user.id, user])),
  );

  /**
   * The identity attributed as the author of comments and activity entries.
   *
   * There is no authentication layer in a local-first board, so the acting user
   * is the project's first administrator, falling back to the first
   * participant when no administrator exists.
   */
  readonly currentUserId = computed<string | null>(() => {
    const all = this.users();

    if (all.length === 0) {
      return null;
    }

    return all.find((user) => user.role === 'admin')?.id ?? all[0]?.id ?? null;
  });

  /** Issues after every active filter has been applied. */
  readonly filteredIssues = computed<Issue[]>(() => {
    const state = this.filter();
    const query = state.searchQuery.trim().toLowerCase();

    return this.issues().filter((issue) => {
      if (query.length > 0 && !`${issue.key} ${issue.title}`.toLowerCase().includes(query)) {
        return false;
      }

      if (state.assigneeIds.length > 0 && !state.assigneeIds.includes(issue.assigneeId ?? '')) {
        return false;
      }

      if (state.priorities.length > 0 && !state.priorities.includes(issue.priority)) {
        return false;
      }

      if (state.types.length > 0 && !state.types.includes(issue.type)) {
        return false;
      }

      if (state.sprintId !== null && issue.sprintId !== state.sprintId) {
        return false;
      }

      return true;
    });
  });

  /**
   * The filtered issues grouped into per-column lists ordered by sort order.
   *
   * Derived rather than stored, and seeded from the column list so that every
   * lane is a valid drop target even while it holds no cards.
   */
  readonly columnIssueMap = computed<ReadonlyMap<string, Issue[]>>(() => {
    const map = new Map<string, Issue[]>();

    for (const column of this.columnsSorted()) {
      map.set(column.id, []);
    }

    for (const issue of this.filteredIssues()) {
      map.get(issue.statusId)?.push(issue);
    }

    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    return map;
  });

  /** Live per-column counts, used by the mobile switcher and the move sheet. */
  readonly columnCountsById = computed<ReadonlyMap<string, number>>(() => {
    const counts = new Map<string, number>();

    for (const [columnId, issues] of this.columnIssueMap()) {
      counts.set(columnId, issues.length);
    }

    return counts;
  });

  readonly density = computed<ViewDensity>(() => this.filter().density);

  readonly activeFilterCount = computed(() => {
    const state = this.filter();
    const hasQuery = state.searchQuery.trim().length > 0;

    return (
      (hasQuery ? 1 : 0) +
      state.assigneeIds.length +
      state.priorities.length +
      state.types.length
    );
  });

  /** True when the board has no issues at all, before filtering. */
  readonly isBoardEmpty = computed(() => this.issues().length === 0);

  /** True when issues exist but the current filter hides all of them. */
  readonly isFilteredEmpty = computed(
    () => this.issues().length > 0 && this.filteredIssues().length === 0,
  );

  // --- filter mutations -------------------------------------------------

  setSearchQuery(searchQuery: string): void {
    this.patchFilter({ searchQuery });
  }

  toggleAssigneeFilter(assigneeId: string): void {
    this.patchFilter({ assigneeIds: toggleInArray(this.filter().assigneeIds, assigneeId) });
  }

  togglePriorityFilter(priority: IssuePriority): void {
    this.patchFilter({ priorities: toggleInArray(this.filter().priorities, priority) });
  }

  toggleTypeFilter(type: Issue['type']): void {
    this.patchFilter({ types: toggleInArray(this.filter().types, type) });
  }

  setSprintFilter(sprintId: string | null): void {
    this.patchFilter({ sprintId });
  }

  setDensity(density: ViewDensity): void {
    this.patchFilter({ density });
  }

  clearFilters(): void {
    this.filter.set(clearBoardFilters(this.filter()));
  }

  dismissError(): void {
    this.errorMessage.set(null);
  }

  // --- reads ------------------------------------------------------------

  issuesInColumn(columnId: string): Issue[] {
    return this.columnIssueMap().get(columnId) ?? [];
  }

  issueById(issueId: string): Issue | null {
    return this.issues().find((issue) => issue.id === issueId) ?? null;
  }

  columnById(columnId: string): BoardColumn | null {
    return this.columns().find((column) => column.id === columnId) ?? null;
  }

  columnTitleById(columnId: string): string {
    return this.columnById(columnId)?.title ?? 'Unknown column';
  }

  userById(userId: string | null): User | null {
    if (userId === null) {
      return null;
    }

    return this.usersById().get(userId) ?? null;
  }

  assigneeFor(issue: Issue): User | null {
    return this.userById(issue.assigneeId);
  }

  /** Comments for one issue, oldest first. */
  commentsForIssue(issueId: string): IssueComment[] {
    return this.comments()
      .filter((comment) => comment.issueId === issueId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** Activity for one issue, newest first. */
  activityForIssue(issueId: string): IssueActivity[] {
    return this.activities()
      .filter((activity) => activity.issueId === issueId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  // --- move operations --------------------------------------------------

  /**
   * Moves an issue to an insertion point in a column.
   *
   * The new fractional order is interpolated from the two cards that will
   * bracket it, so the write touches a single row. When those neighbours have
   * collapsed to an indistinguishable distance the target column is renumbered
   * inside the same transaction, which is what keeps a long-lived board
   * reorderable instead of slowly exhausting float precision.
   */
  async moveIssue(request: IssueMoveRequest): Promise<boolean> {
    const issue = this.issueById(request.issueId);

    if (issue === null) {
      this.errorMessage.set('That issue no longer exists.');
      return false;
    }

    if (this.columnById(request.targetColumnId) === null) {
      this.errorMessage.set('That column no longer exists.');
      return false;
    }

    const fromColumnTitle = this.columnTitleById(issue.statusId);
    const toColumnTitle = this.columnTitleById(request.targetColumnId);
    const changedColumn = issue.statusId !== request.targetColumnId;

    this.isMutating.set(true);

    try {
      await db.transaction('rw', [db.issues, db.activities], async () => {
        let neighbors = await this.resolveNeighborsInTx(
          request.targetColumnId,
          request.issueId,
          request.targetIndex,
        );

        if (this.ranking.needsRebalance(neighbors.previous, neighbors.next)) {
          // Renumbering moves every neighbour, so the insertion point has to be
          // re-read against the freshly spaced column.
          await this.ranking.rebalanceColumnWithinTx(request.targetColumnId, issue.sprintId);
          neighbors = await this.resolveNeighborsInTx(
            request.targetColumnId,
            request.issueId,
            request.targetIndex,
          );
        }

        const sortOrder = this.ranking.calculateNewOrder(
          neighbors.previous,
          neighbors.next,
        );

        await db.updateIssueOptimistic(request.issueId, issue.version, {
          statusId: request.targetColumnId,
          sortOrder,
        });

        // The history row shares the move's transaction. Writing it afterwards
        // would let a failure land between the two commits, producing a card
        // that moved with nothing in its timeline to explain why.
        if (changedColumn) {
          await this.addActivity(request.issueId, 'status_change', {
            field: 'statusId',
            from: fromColumnTitle,
            to: toColumnTitle,
          });
        }
      });

      return true;
    } catch (error) {
      this.reportMutationFailure(error, 'move the issue');
      return false;
    } finally {
      this.isMutating.set(false);
    }
  }

  /** Reorders a card within its own column. */
  reorderWithinColumn(issueId: string, targetIndex: number): Promise<boolean> {
    const issue = this.issueById(issueId);

    if (issue === null) {
      this.errorMessage.set('That issue no longer exists.');
      return Promise.resolve(false);
    }

    return this.moveIssue({ issueId, targetColumnId: issue.statusId, targetIndex });
  }

  /** Moves a card to an absolute position: the top or the bottom of a column. */
  moveToEdge(issueId: string, columnId: string, edge: 'top' | 'bottom'): Promise<boolean> {
    const siblings = this.issuesInColumn(columnId).filter(
      (candidate) => candidate.id !== issueId,
    );

    return this.moveIssue({
      issueId,
      targetColumnId: columnId,
      targetIndex: edge === 'top' ? 0 : siblings.length,
    });
  }

  /** Nudges a card one slot up or down within its column. */
  moveByOffset(issueId: string, offset: -1 | 1): Promise<boolean> {
    const issue = this.issueById(issueId);

    if (issue === null) {
      this.errorMessage.set('That issue no longer exists.');
      return Promise.resolve(false);
    }

    const siblings = this.issuesInColumn(issue.statusId);
    const currentIndex = siblings.findIndex((candidate) => candidate.id === issueId);
    const targetIndex = currentIndex + offset;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length) {
      return Promise.resolve(false);
    }

    return this.moveIssue({ issueId, targetColumnId: issue.statusId, targetIndex });
  }

  // --- record mutations -------------------------------------------------

  /** Applies a field edit, guarding against a lost update. */
  async updateIssue(
    issueId: string,
    changes: Partial<Omit<Issue, 'id' | 'version' | 'createdAt'>>,
  ): Promise<boolean> {
    const issue = this.issueById(issueId);

    if (issue === null) {
      this.errorMessage.set('That issue no longer exists.');
      return false;
    }

    const previousAssigneeId = issue.assigneeId;
    const previousPriority = issue.priority;

    this.isMutating.set(true);

    try {
      await db.transaction('rw', [db.issues, db.activities], async () => {
        await db.updateIssueOptimistic(issueId, issue.version, changes);

        if (changes.assigneeId !== undefined && changes.assigneeId !== previousAssigneeId) {
          await this.addActivity(issueId, 'assignee_change', {
            field: 'assigneeId',
            from: this.userById(previousAssigneeId)?.name ?? null,
            to: this.userById(changes.assigneeId)?.name ?? null,
          });
        }

        if (changes.priority !== undefined && changes.priority !== previousPriority) {
          await this.addActivity(issueId, 'priority_change', {
            field: 'priority',
            from: previousPriority,
            to: changes.priority,
          });
        }
      });

      return true;
    } catch (error) {
      this.reportMutationFailure(error, 'save the changes');
      return false;
    } finally {
      this.isMutating.set(false);
    }
  }

  async createIssue(request: CreateIssueRequest): Promise<string | null> {
    const title = request.title.trim();

    if (title.length === 0) {
      this.errorMessage.set('A title is required.');
      return null;
    }

    const reporterId = this.currentUserId();

    if (reporterId === null) {
      this.errorMessage.set('No active user is available to own this issue.');
      return null;
    }

    const now = new Date().toISOString();
    const siblings = this.issuesInColumn(request.statusId);
    const tail = siblings[siblings.length - 1] ?? null;
    const issueId = `issue-${crypto.randomUUID()}`;

    const issue: Issue = {
      id: issueId,
      projectId: this.projectId,
      key: this.nextIssueKey(),
      title,
      description: request.description?.trim() ?? '',
      type: request.type,
      priority: request.priority,
      statusId: request.statusId,
      storyPoints: request.storyPoints,
      assigneeId: request.assigneeId,
      reporterId,
      sprintId: request.sprintId,
      sortOrder: this.ranking.calculateNewOrder(tail?.sortOrder ?? null, null),
      tags: [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.isMutating.set(true);

    try {
      await db.transaction('rw', [db.issues, db.activities], async () => {
        await db.issues.add(issue);
        await this.addActivity(issueId, 'created', {
          field: 'statusId',
          to: this.columnTitleById(request.statusId),
        });
      });

      return issueId;
    } catch (error) {
      this.reportMutationFailure(error, 'create the issue');
      return null;
    } finally {
      this.isMutating.set(false);
    }
  }

  /** Deletes an issue along with its comments and activity. */
  async deleteIssue(issueId: string): Promise<boolean> {
    this.isMutating.set(true);

    try {
      await db.deleteIssueCascade(issueId);
      return true;
    } catch (error) {
      this.reportMutationFailure(error, 'delete the issue');
      return false;
    } finally {
      this.isMutating.set(false);
    }
  }

  // --- team administration ------------------------------------------------
  //
  // `users` is derived from a `liveQuery`, so every write here propagates to
  // each assignee picker and to the activity avatar without any extra wiring.

  /**
   * Adds a teammate.
   *
   * @returns the new id, or `null` when validation or the write failed. The
   * reason is left on {@link errorMessage} for the caller to surface.
   */
  async createUser(input: CreateUserInput): Promise<string | null> {
    const name = input.name.trim();
    const email = input.email.trim();

    if (name.length === 0 || email.length === 0) {
      this.errorMessage.set('A teammate needs both a name and an email address.');
      return null;
    }

    if (!EMAIL_PATTERN.test(email)) {
      this.errorMessage.set(`"${email}" is not a valid email address.`);
      return null;
    }

    if (this.users().some((user) => user.email.toLowerCase() === email.toLowerCase())) {
      this.errorMessage.set(`${name} already has an account on this board.`);
      return null;
    }

    const user: User = {
      id: `user-${crypto.randomUUID()}`,
      name,
      email,
      role: input.role,
      avatarUrl: input.avatarUrl?.trim() ?? '',
      createdAt: new Date().toISOString(),
    };

    this.isMutating.set(true);

    try {
      await db.users.add(user);
      return user.id;
    } catch (error) {
      this.reportMutationFailure(error, 'add the teammate');
      return null;
    } finally {
      this.isMutating.set(false);
    }
  }

  /**
   * Applies a partial edit to a teammate.
   *
   * Blank or malformed values are rejected before any field is touched, so a
   * rejected edit cannot leave a teammate with, say, a new name and the old
   * email.
   */
  async updateUser(userId: string, changes: UpdateUserInput): Promise<boolean> {
    const current = this.usersById().get(userId);

    if (current === undefined) {
      this.errorMessage.set('That teammate no longer exists.');
      return false;
    }

    const patch: Partial<Omit<User, 'id' | 'createdAt'>> = {};

    if (changes.name !== undefined) {
      const name = changes.name.trim();

      if (name.length === 0) {
        this.errorMessage.set('A teammate cannot be renamed to an empty name.');
        return false;
      }

      patch.name = name;
    }

    if (changes.email !== undefined) {
      const email = changes.email.trim();

      if (!EMAIL_PATTERN.test(email)) {
        this.errorMessage.set(`"${email}" is not a valid email address.`);
        return false;
      }

      const duplicate = this.users().some(
        (user) => user.id !== userId && user.email.toLowerCase() === email.toLowerCase(),
      );

      if (duplicate) {
        this.errorMessage.set('Another teammate already uses that email address.');
        return false;
      }

      patch.email = email;
    }

    if (changes.role !== undefined) {
      patch.role = changes.role;
    }

    if (changes.avatarUrl !== undefined) {
      patch.avatarUrl = changes.avatarUrl.trim();
    }

    if (Object.keys(patch).length === 0) {
      return true;
    }

    this.isMutating.set(true);

    try {
      await db.users.update(userId, patch);
      return true;
    } catch (error) {
      this.reportMutationFailure(error, 'update the teammate');
      return false;
    } finally {
      this.isMutating.set(false);
    }
  }

  /**
   * Removes a teammate and unassigns their issues in one transaction.
   *
   * Leaving the assignments behind would strand cards on an id that resolves
   * to nobody, which the avatars already render as an empty placeholder. The
   * last remaining user is refused: the board needs somebody to be acting as.
   */
  async deleteUser(userId: string): Promise<boolean> {
    if (this.users().length <= 1) {
      this.errorMessage.set('The last remaining teammate cannot be removed.');
      return false;
    }

    this.isMutating.set(true);

    try {
      await db.transaction('rw', [db.users, db.issues], async () => {
        const assigned = await db.issues.where('assigneeId').equals(userId).toArray();

        for (const issue of assigned) {
          await db.issues.update(issue.id, {
            assigneeId: null,
            version: issue.version + 1,
            updatedAt: new Date().toISOString(),
          });
        }

        await db.users.delete(userId);
      });

      return true;
    } catch (error) {
      this.reportMutationFailure(error, 'remove the teammate');
      return false;
    } finally {
      this.isMutating.set(false);
    }
  }

  async addComment(issueId: string, content: string): Promise<boolean> {
    const trimmed = content.trim();

    if (trimmed.length === 0) {
      this.errorMessage.set('A comment cannot be empty.');
      return false;
    }

    const authorId = this.currentUserId();

    if (authorId === null) {
      this.errorMessage.set('No active user is available to author this comment.');
      return false;
    }

    const now = new Date().toISOString();

    const comment: IssueComment = {
      id: `comment-${crypto.randomUUID()}`,
      issueId,
      authorId,
      content: trimmed,
      createdAt: now,
      updatedAt: now,
    };

    this.isMutating.set(true);

    try {
      await db.transaction('rw', [db.comments, db.activities], async () => {
        await db.comments.add(comment);
        await this.addActivity(issueId, 'commented', {});
      });

      return true;
    } catch (error) {
      this.reportMutationFailure(error, 'post the comment');
      return false;
    } finally {
      this.isMutating.set(false);
    }
  }

  async deleteComment(commentId: string): Promise<boolean> {
    try {
      await db.comments.delete(commentId);
      return true;
    } catch (error) {
      this.reportMutationFailure(error, 'delete the comment');
      return false;
    }
  }

  // --- internals --------------------------------------------------------

  /**
   * Reads the destination column and derives the bracketing orders for an
   * insertion index, from committed data rather than from what the UI rendered.
   *
   * @throws {StalePositionError} when the referenced anchor card has moved.
   */
  private async resolveNeighborsInTx(
    targetColumnId: string,
    movingIssueId: string,
    targetIndex: number,
  ): Promise<NeighborOrders> {
    const fresh = await db.issues
      .where('statusId')
      .equals(targetColumnId)
      .filter((issue) => issue.id !== movingIssueId)
      .sortBy('sortOrder');

    const index = Math.max(0, Math.min(targetIndex, fresh.length));
    const previousIssue = index > 0 ? (fresh[index - 1] ?? null) : null;
    const nextIssue = index < fresh.length ? (fresh[index] ?? null) : null;

    return this.ranking.resolveNeighborOrders(
      fresh,
      previousIssue?.sortOrder ?? null,
      nextIssue?.sortOrder ?? null,
    );
  }

  /**
   * Writes one activity row.
   *
   * The caller supplies the surrounding transaction, so the history entry
   * commits or rolls back together with the change it describes.
   */
  private async addActivity(
    issueId: string,
    action: IssueActivityAction,
    details: IssueActivityDetails,
  ): Promise<void> {
    const actorId = this.currentUserId();

    if (actorId === null) {
      return;
    }

    const activity: IssueActivity = {
      id: `activity-${crypto.randomUUID()}`,
      issueId,
      actorId,
      action,
      details,
      timestamp: new Date().toISOString(),
    };

    await db.activities.add(activity);
  }

  /** Derives the next human-facing key by incrementing the highest suffix. */
  private nextIssueKey(): string {
    const prefix = this.project()?.key ?? 'SCRUM';

    const highest = this.issues().reduce((max, issue) => {
      // Slicing on the prefix assumed every key was `${prefix}-${n}`. An
      // imported checkpoint or a key from a different project would then be
      // parsed as a fragment, and `Number.parseInt` would quietly treat the
      // first digit it found as authoritative — or yield NaN. Taking the
      // trailing run of digits is independent of how the prefix is spelled.
      const match = /(\d+)$/.exec(issue.key);
      const parsed = match?.[1] === undefined ? Number.NaN : Number.parseInt(match[1], 10);

      return Number.isNaN(parsed) ? max : Math.max(max, parsed);
    }, 0);

    return `${prefix}-${highest + 1}`;
  }

  private patchFilter(patch: Partial<BoardFilterState>): void {
    this.filter.update((current) => ({ ...current, ...patch }));
  }

  /**
   * Turns a failed mutation into a message worth showing.
   *
   * Concurrency and stale-position failures are reported distinctly because
   * the remedy differs: the live queries have already re-read the record, so
   * the user simply retries instead of reconciling a conflict by hand.
   */
  private reportMutationFailure(error: unknown, action: string): void {
    if (error instanceof OptimisticConcurrencyError) {
      this.errorMessage.set(
        'This issue changed while you were working on it. The board has refreshed — please try again.',
      );
      return;
    }

    if (error instanceof StalePositionError) {
      this.errorMessage.set(
        'This column was reordered elsewhere. The board has refreshed — please try again.',
      );
      return;
    }

    console.error(`[BoardStateService] Failed to ${action}.`, error);
    this.errorMessage.set(`Could not ${action}. Please try again.`);
  }
}

/** Adds a value to a list, or removes it when already present. */
function toggleInArray<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

/**
 * `toSignal` for a query that always resolves to a list.
 *
 * Two details of the current toolchain require this wrapper. `liveQuery`
 * returns Dexie's own `Observable` rather than rxjs's, so the parameter is
 * typed as the `Subscribable` that `toSignal` actually accepts. And
 * `toSignal`'s overloads do not survive here intact: leaving the type
 * parameters to inference yields `Signal<unknown>`, while supplying only
 * `<T>` selects an overload that widens the result to `T | undefined`.
 * Naming both parameters keeps the element type exact, and routing every
 * table through this helper states that intent once.
 */
function toArraySignal<T>(source: Subscribable<T[]>): Signal<T[]> {
  return toSignal<T[], T[]>(source, { initialValue: [] as T[] });
}

/** `toSignal` counterpart for a query that may resolve to nothing. */
function toOptionalSignal<T>(source: Subscribable<T | undefined>): Signal<T | undefined> {
  return toSignal<T | undefined, T | undefined>(source, { initialValue: undefined });
}
