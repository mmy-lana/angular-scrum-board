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

    /**
     * Indexes `issues.reporterId` so a departing teammate's reports can be
     * found without scanning the table.
     *
     * Removing a user has to re-point the issues they reported, and querying
     * an unindexed key path throws `SchemaError` rather than falling back to a
     * scan. IndexedDB backfills a newly created index over the records already
     * in the store, so the upgrade needs no data migration and commits as one
     * transaction.
     */
    this.version(2).stores({
      issues: 'id, projectId, key, statusId, sprintId, assigneeId, reporterId, sortOrder, version, createdAt',
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

  /**
   * Serialises the whole database to a portable JSON checkpoint.
   *
   * Browser storage is evictable, so this gives the user a copy they own
   * outside the origin. Every table is read, and the payload is stamped with a
   * schema version and an export timestamp so a later restore can refuse
   * anything it does not understand instead of writing half-understood rows.
   */
  async exportCheckpoint(): Promise<string> {
    const [projects, issues, sprints, users, comments, activities, columns] = await Promise.all([
      this.projects.toArray(),
      this.issues.toArray(),
      this.sprints.toArray(),
      this.users.toArray(),
      this.comments.toArray(),
      this.activities.toArray(),
      this.columns.toArray(),
    ]);

    const checkpoint: CheckpointPayload = {
      version: CHECKPOINT_VERSION,
      exportedAt: new Date().toISOString(),
      data: { projects, issues, sprints, users, comments, activities, columns },
    };

    return JSON.stringify(checkpoint, null, 2);
  }

  /**
   * Replaces the entire database from a checkpoint produced by
   * {@link exportCheckpoint}.
   *
   * The schema version is checked before anything is written, and the restore
   * then runs through {@link replaceAllData} so either every table lands or the
   * database is left exactly as it was. A partially applied restore would be
   * worse than none, because the live queries would happily render the
   * wreckage.
   *
   * @returns `{ success: true }` once committed, otherwise a message suitable
   * for display. The original state is preserved on every failure path.
   */
  async importCheckpoint(json: string): Promise<ImportResult> {
    let parsed: unknown;

    try {
      parsed = JSON.parse(json);
    } catch {
      return { success: false, error: 'That file is not valid JSON.' };
    }

    const validation = validateCheckpoint(parsed);

    if (validation === null) {
      return {
        success: false,
        error: `Unsupported checkpoint: expected version ${CHECKPOINT_VERSION} with a data object.`,
      };
    }

    try {
      await this.replaceAllData(validation);

      return { success: true };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'The checkpoint could not be restored.',
      };
    }
  }
}

/** Bumped whenever a table shape changes in a way old files cannot satisfy. */
const CHECKPOINT_VERSION = 1;

/** The full set of tables captured by a checkpoint. */
type CheckpointTables = {
  projects: Project[];
  issues: Issue[];
  sprints: Sprint[];
  users: User[];
  comments: IssueComment[];
  activities: IssueActivity[];
  columns: BoardColumn[];
};

/** The on-disk shape written by {@link ScrumDatabase.exportCheckpoint}. */
type CheckpointPayload = {
  version: number;
  exportedAt: string;
  data: CheckpointTables;
};

/** Outcome of a restore attempt; `error` is present exactly when `success` is false. */
export type ImportResult = { success: true } | { success: false; error: string };

/**
 * Narrows untrusted JSON to a checkpoint payload.
 *
 * Only the envelope and the table arrays are checked. Record-level validation
 * is the application's job elsewhere, and re-deriving it here would duplicate
 * the domain rules; what matters at this boundary is that each table really is
 * an array, so a hand-edited file cannot smuggle a scalar into `bulkAdd`.
 */
function validateCheckpoint(value: unknown): CheckpointTables | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidate = value as Partial<CheckpointPayload>;
  const data = candidate.data as Partial<CheckpointTables> | undefined;

  if (candidate.version !== CHECKPOINT_VERSION || typeof data !== 'object' || data === null) {
    return null;
  }

  const tables: (keyof CheckpointTables)[] = [
    'projects',
    'issues',
    'sprints',
    'users',
    'comments',
    'activities',
    'columns',
  ];

  if (!tables.every((table) => Array.isArray(data[table]))) {
    return null;
  }

  return {
    projects: data.projects as Project[],
    issues: data.issues as Issue[],
    sprints: data.sprints as Sprint[],
    users: data.users as User[],
    comments: data.comments as IssueComment[],
    activities: data.activities as IssueActivity[],
    columns: data.columns as BoardColumn[],
  };
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
