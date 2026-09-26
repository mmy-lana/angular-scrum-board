import { Injectable, computed, inject, signal } from '@angular/core';

import { APP_CONFIG } from '../config/runtime-config';
import { db } from '../database/scrum-database';
import { Issue } from '../models/issue.model';
import { Sprint, SprintStatus } from '../models/sprint.model';
import { BoardStateService } from './board-state.service';

/** Everything required to schedule a new sprint. */
export interface CreateSprintRequest {
  readonly name: string;
  readonly goal: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
}

/** Delivery progress for a single sprint. */
export interface SprintProgress {
  readonly totalPoints: number;
  readonly completedPoints: number;
  /** Completion from 0 to 1, or 0 when the sprint carries no points. */
  readonly ratio: number;
  readonly totalIssues: number;
  readonly completedIssues: number;
}

/**
 * Owns the sprint lifecycle and the point rollups shown on sprint cards.
 *
 * A sprint has exactly one of three states. Starting a sprint demotes any
 * other active sprint, which keeps the "one sprint in progress" invariant
 * without a uniqueness constraint in IndexedDB. Completing a sprint returns
 * its unfinished issues to the backlog rather than leaving them stranded in a
 * sprint nobody is working on.
 */
@Injectable({ providedIn: 'root' })
export class SprintStateService {
  private readonly board = inject(BoardStateService);

  /** User-facing message from the last failed sprint mutation. */
  readonly errorMessage = signal<string | null>(null);

  readonly isMutating = signal(false);

  readonly activeSprint = computed<Sprint | null>(
    () => this.board.sprints().find((sprint) => sprint.status === 'active') ?? null,
  );

  /**
   * The terminal lane, identified positionally as the right-most column.
   *
   * Derived from the column data rather than a hardcoded id so that the
   * service keeps working if the project's lanes are reconfigured.
   */
  private readonly doneColumnId = computed<string | null>(() => {
    const columns = this.board.columnsSorted();
    return columns.length === 0 ? null : (columns[columns.length - 1]?.id ?? null);
  });

  /**
   * Live point and issue totals for a sprint, derived from the issues table so
   * the figures can never drift from the work they describe.
   */
  progressFor(sprintId: string): SprintProgress {
    const doneColumnId = this.doneColumnId();
    const issues = this.board.issues().filter((issue) => issue.sprintId === sprintId);
    const completed = issues.filter((issue) => issue.statusId === doneColumnId);

    const totalPoints = sumPoints(issues);
    const completedPoints = sumPoints(completed);

    return {
      totalPoints,
      completedPoints,
      ratio: totalPoints === 0 ? 0 : completedPoints / totalPoints,
      totalIssues: issues.length,
      completedIssues: completed.length,
    };
  }

  async createSprint(request: CreateSprintRequest): Promise<string | null> {
    const name = request.name.trim();

    if (name.length === 0) {
      this.errorMessage.set('A sprint name is required.');
      return null;
    }

    const now = new Date().toISOString();
    const sprintId = `sprint-${crypto.randomUUID()}`;

    const sprint: Sprint = {
      id: sprintId,
      projectId: APP_CONFIG.defaultProjectId,
      name,
      goal: request.goal.trim(),
      status: 'future',
      startDate: request.startDate,
      endDate: request.endDate,
      totalPoints: 0,
      completedPoints: 0,
      createdAt: now,
    };

    this.isMutating.set(true);

    try {
      await db.sprints.add(sprint);
      return sprintId;
    } catch (error) {
      this.reportFailure(error, 'create the sprint');
      return null;
    } finally {
      this.isMutating.set(false);
    }
  }

  /**
   * Promotes a sprint to active and demotes the current one to future.
   *
   * Rollups are recomputed on the way in so a sprint that was populated while
   * it sat in the backlog opens with accurate totals.
   */
  async startSprint(sprintId: string): Promise<boolean> {
    const target = this.board.sprints().find((sprint) => sprint.id === sprintId);

    if (target === undefined) {
      this.errorMessage.set('That sprint no longer exists.');
      return false;
    }

    if (target.status === 'completed') {
      this.errorMessage.set('A completed sprint cannot be restarted.');
      return false;
    }

    if (target.status === 'active') {
      return true;
    }

    this.isMutating.set(true);

    try {
      await db.transaction('rw', db.sprints, async () => {
        for (const sprint of this.board.sprints()) {
          if (sprint.id === sprintId) {
            continue;
          }

          if (sprint.status === 'active') {
            await db.sprints.update(sprint.id, { status: 'future' satisfies SprintStatus });
          }
        }

        const progress = this.progressFor(sprintId);
        const startDate = target.startDate ?? new Date().toISOString().slice(0, 10);

        await db.sprints.update(sprintId, {
          status: 'active',
          startDate,
          totalPoints: progress.totalPoints,
          completedPoints: progress.completedPoints,
        });
      });

      return true;
    } catch (error) {
      this.reportFailure(error, 'start the sprint');
      return false;
    } finally {
      this.isMutating.set(false);
    }
  }

  /**
   * Closes a sprint and returns its unfinished issues to the backlog.
   *
   * Work sitting in the terminal lane stays in the sprint as delivered; only
   * the issues that were not completed are released, so the completed set
   * still reports as finished history.
   */
  async completeSprint(sprintId: string): Promise<boolean> {
    const target = this.board.sprints().find((sprint) => sprint.id === sprintId);

    if (target === undefined) {
      this.errorMessage.set('That sprint no longer exists.');
      return false;
    }

    if (target.status === 'completed') {
      return true;
    }

    const doneColumnId = this.doneColumnId();
    const now = new Date().toISOString();

    this.isMutating.set(true);

    try {
      await db.transaction('rw', [db.sprints, db.issues], async () => {
        const sprintIssues = await db.issues.where('sprintId').equals(sprintId).toArray();
        const completed = sprintIssues.filter((issue) => issue.statusId === doneColumnId);

        // Release everything that is not in the terminal lane back to backlog.
        await Promise.all(
          sprintIssues
            .filter((issue) => issue.statusId !== doneColumnId)
            .map((issue) =>
              db.issues.update(issue.id, {
                sprintId: null,
                version: issue.version + 1,
                updatedAt: now,
              }),
            ),
        );

        await db.sprints.update(sprintId, {
          status: 'completed',
          endDate: new Date().toISOString().slice(0, 10),
          totalPoints: sumPoints(sprintIssues),
          completedPoints: sumPoints(completed),
        });
      });

      return true;
    } catch (error) {
      this.reportFailure(error, 'complete the sprint');
      return false;
    } finally {
      this.isMutating.set(false);
    }
  }

  /** Recomputes and persists the stored rollups for a sprint. */
  async refreshRollups(sprintId: string): Promise<void> {
    const progress = this.progressFor(sprintId);

    await db.sprints.update(sprintId, {
      totalPoints: progress.totalPoints,
      completedPoints: progress.completedPoints,
    });
  }

  dismissError(): void {
    this.errorMessage.set(null);
  }

  private reportFailure(error: unknown, action: string): void {
    console.error(`[SprintStateService] Failed to ${action}.`, error);
    this.errorMessage.set(`Could not ${action}. Please try again.`);
  }
}

/** Sums story points, treating an unestimated issue as zero. */
function sumPoints(issues: readonly Issue[]): number {
  return issues.reduce((total, issue) => total + (issue.storyPoints ?? 0), 0);
}
