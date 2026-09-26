import Dexie, { Table, UpdateSpec } from 'dexie';

import { APP_CONFIG } from '../config/runtime-config';
import { IssueActivity } from '../models/activity.model';
import { BoardColumn } from '../models/column.model';
import { Issue, IssueComment } from '../models/issue.model';
import { Project } from '../models/project.model';
import { Sprint } from '../models/sprint.model';
import { User } from '../models/user.model';

/** Fields of an {@link Issue} that a caller may patch. */
export type IssuePatch = Partial<Omit<Issue, 'id' | 'version'>>;

/** Raised when a write is rejected because another mutation won the race. */
export class OptimisticConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OptimisticConcurrencyError';
  }
}

/**
 * The local-first storage client.
 *
 * A single IndexedDB connection backs the whole application. All compound
 * mutations that must not be observed half-applied are wrapped in explicit
 * `transaction` calls so that reactive `liveQuery` consumers only ever see
 * committed state.
 */
export class ScrumDatabase extends Dexie {
  projects!: Table<Project, string>;
  issues!: Table<Issue, string>;
  sprints!: Table<Sprint, string>;
  users!: Table<User, string>;
  comments!: Table<IssueComment, string>;
  activities!: Table<IssueActivity, string>;
  columns!: Table<BoardColumn, string>;

  constructor(databaseName: string = APP_CONFIG.databaseName) {
    super(databaseName);

    this.version(1).stores({
      projects: 'id, key',
      issues: 'id, projectId, key, statusId, sprintId, assigneeId, sortOrder, version, createdAt',
      sprints: 'id, projectId, status, startDate, endDate',
      users: 'id, email',
      comments: 'id, issueId, authorId, createdAt',
      activities: 'id, issueId, actorId, timestamp',
      columns: 'id, projectId, sortOrder',
    });
  }

  /**
   * Deletes an issue together with every dependent record.
   *
   * Comments and activity entries are removed in the same transaction as the
   * issue itself, so a concurrent reader can never observe an orphaned thread.
   */
  async deleteIssueCascade(issueId: string): Promise<void> {
    await this.transaction('rw', [this.issues, this.comments, this.activities], async () => {
      await this.comments.where('issueId').equals(issueId).delete();
      await this.activities.where('issueId').equals(issueId).delete();
      await this.issues.delete(issueId);
    });
  }

  /**
   * Applies a patch to an issue only if the stored version still matches
   * {@link currentVersion}, then increments the version.
   *
   * @throws {OptimisticConcurrencyError} when the issue is missing or its
   * version has already moved on, which signals that a refresh is required
   * before retrying.
   */
  async updateIssueOptimistic(issueId: string, currentVersion: number, changes: IssuePatch): Promise<void> {
    await this.transaction('rw', this.issues, async () => {
      const existing = await this.issues.get(issueId);

      if (!existing) {
        throw new OptimisticConcurrencyError(`Issue ${issueId} not found.`);
      }

      if (existing.version !== currentVersion) {
        throw new OptimisticConcurrencyError(
          'Conflict detected: This record has been modified by another operation.',
        );
      }

      const update: UpdateSpec<Issue> = {
        ...changes,
        version: existing.version + 1,
        updatedAt: new Date().toISOString(),
      };

      await this.issues.update(issueId, update);
    });
  }

  /**
   * Writes a complete set of seed records atomically, replacing any previous
   * contents. Returns once every table has been committed.
   *
   * The table operations run one after another rather than through
   * `Promise.all`. Dexie tracks the operations belonging to a transaction, and
   * combining them in a native `Promise.all` can let the transaction commit
   * before the last write is registered — surfacing as a
   * `PrematureCommitError` on a first run. Sequential awaits are also the
   * pattern Dexie documents for transaction bodies.
   */
  async replaceAllData(payload: {
    projects: readonly Project[];
    issues: readonly Issue[];
    sprints: readonly Sprint[];
    users: readonly User[];
    comments: readonly IssueComment[];
    activities: readonly IssueActivity[];
    columns: readonly BoardColumn[];
  }): Promise<void> {
    await this.transaction(
      'rw',
      [
        this.projects,
        this.issues,
        this.sprints,
        this.users,
        this.comments,
        this.activities,
        this.columns,
      ],
      async () => {
        await this.projects.clear();
        await this.issues.clear();
        await this.sprints.clear();
        await this.users.clear();
        await this.comments.clear();
        await this.activities.clear();
        await this.columns.clear();

        await writeRows(this.projects, payload.projects);
        await writeRows(this.issues, payload.issues);
        await writeRows(this.sprints, payload.sprints);
        await writeRows(this.users, payload.users);
        await writeRows(this.comments, payload.comments);
        await writeRows(this.activities, payload.activities);
        await writeRows(this.columns, payload.columns);
      },
    );
  }
}

/**
 * Adds rows to a table, skipping the call when there is nothing to write.
 *
 * `bulkAdd([])` registers no work, so calling it inside a transaction leaves a
 * point at which Dexie can consider the transaction finished early.
 */
async function writeRows<T>(table: Table<T>, rows: readonly T[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  await table.bulkAdd(rows);
}

/** The single application-wide database connection. */
export const db = new ScrumDatabase();
