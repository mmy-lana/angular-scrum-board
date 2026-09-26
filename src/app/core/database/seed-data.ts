import { APP_CONFIG } from '../config/runtime-config';
import { BoardColumn } from '../models/column.model';
import { Issue, IssuePriority, IssueType } from '../models/issue.model';
import { Project } from '../models/project.model';
import { Sprint } from '../models/sprint.model';
import { User } from '../models/user.model';
import { db } from './scrum-database';

/** Result of a {@link seedDatabase} call. */
export interface SeedSummary {
  /** Project the board opens on, or `null` when the database is empty. */
  readonly project: Project | null;
  readonly columns: number;
  readonly sprints: number;
  readonly users: number;
  readonly issues: number;
  /** `true` only when this call actually wrote the fixture data. */
  readonly seeded: boolean;
}

/** Options controlling {@link seedDatabase}. */
export interface SeedOptions {
  /** Wipe and rewrite the database even when it already holds data. */
  readonly force?: boolean;
}

/** The compact shape of a seeded issue before ids and sort orders are assigned. */
interface IssueSeedRow {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly type: IssueType;
  readonly priority: IssuePriority;
  readonly columnId: string;
  readonly sprintId: string | null;
  readonly storyPoints: number | null;
  readonly assigneeId: string | null;
  readonly tags: readonly string[];
}

const PROJECT_ID = APP_CONFIG.defaultProjectId;
const COLUMN_TODO = 'column-todo';
const COLUMN_IN_PROGRESS = 'column-in-progress';
const COLUMN_IN_REVIEW = 'column-in-review';
const COLUMN_DONE = 'column-done';
const SPRINT_ACTIVE = 'sprint-1';
const SPRINT_FUTURE = 'sprint-2';
const USER_ADMIN = 'user-ada';
const USER_GRACE = 'user-grace';
const USER_ALAN = 'user-alan';
const USER_KATHERINE = 'user-katherine';

const BASE_TIMESTAMP = '2026-01-05T09:00:00.000Z';

/** Builds a deterministic DiceBear avatar URL for a participant. */
function dicebearAvatar(seed: string, backgroundColor: string): string {
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(
    seed,
  )}&backgroundColor=${backgroundColor}&fontFamily=Arial&fontWeight=600`;
}

const PROJECT: Project = {
  id: PROJECT_ID,
  key: 'SCRUM',
  name: 'Angular Scrum Board',
  description:
    'Local-first scrum and agile project board for tracking sprints, issues and delivery flow.',
  createdAt: BASE_TIMESTAMP,
};

const COLUMNS: readonly BoardColumn[] = [
  {
    id: COLUMN_TODO,
    projectId: PROJECT_ID,
    title: 'To Do',
    wipLimit: null,
    sortOrder: 1000,
  },
  {
    id: COLUMN_IN_PROGRESS,
    projectId: PROJECT_ID,
    title: 'In Progress',
    wipLimit: 3,
    sortOrder: 2000,
  },
  {
    id: COLUMN_IN_REVIEW,
    projectId: PROJECT_ID,
    title: 'In Review',
    wipLimit: 2,
    sortOrder: 3000,
  },
  {
    id: COLUMN_DONE,
    projectId: PROJECT_ID,
    title: 'Done',
    wipLimit: null,
    sortOrder: 4000,
  },
];

const USERS: readonly User[] = [
  {
    id: USER_ADMIN,
    name: 'Ada Lovelace',
    email: 'ada.lovelace@example.com',
    avatarUrl: dicebearAvatar('Ada Lovelace', '6366f1'),
    role: 'admin',
    createdAt: BASE_TIMESTAMP,
  },
  {
    id: USER_GRACE,
    name: 'Grace Hopper',
    email: 'grace.hopper@example.com',
    avatarUrl: dicebearAvatar('Grace Hopper', '10b981'),
    role: 'member',
    createdAt: BASE_TIMESTAMP,
  },
  {
    id: USER_ALAN,
    name: 'Alan Turing',
    email: 'alan.turing@example.com',
    avatarUrl: dicebearAvatar('Alan Turing', 'f59e0b'),
    role: 'member',
    createdAt: BASE_TIMESTAMP,
  },
  {
    // Deliberately avatar-less so the initials fallback path stays exercised.
    id: USER_KATHERINE,
    name: 'Katherine Johnson',
    email: 'katherine.johnson@example.com',
    avatarUrl: '',
    role: 'viewer',
    createdAt: BASE_TIMESTAMP,
  },
];

/**
 * Ordering is intentionally meaningful: five issues queued, three in progress
 * (exactly at the WIP limit), two in review (exactly at the WIP limit), and
 * four delivered, so no column renders in a permanently breaching state.
 */
const ISSUE_ROWS: readonly IssueSeedRow[] = [
  {
    key: 'SCRUM-1',
    title: 'Model the sprint and issue domain types',
    description:
      'Define pure TypeScript interfaces for projects, users, issues, columns, sprints, comments and activity entries.',
    type: 'story',
    priority: 'high',
    columnId: COLUMN_TODO,
    sprintId: SPRINT_ACTIVE,
    storyPoints: 5,
    assigneeId: USER_GRACE,
    tags: ['architecture', 'domain'],
  },
  {
    key: 'SCRUM-2',
    title: 'Persist board state in IndexedDB',
    description:
      'Introduce a Dexie-backed storage client with explicit transaction boundaries for compound writes.',
    type: 'story',
    priority: 'high',
    columnId: COLUMN_TODO,
    sprintId: SPRINT_ACTIVE,
    storyPoints: 8,
    assigneeId: USER_ALAN,
    tags: ['storage', 'architecture'],
  },
  {
    key: 'SCRUM-3',
    title: 'Rank issues with fractional sort orders',
    description:
      'Compute a midpoint order when a card is dropped between two neighbours so a reorder writes one record.',
    type: 'story',
    priority: 'medium',
    columnId: COLUMN_TODO,
    sprintId: SPRINT_ACTIVE,
    storyPoints: 5,
    assigneeId: USER_ALAN,
    tags: ['ordering'],
  },
  {
    key: 'SCRUM-4',
    title: 'Rebalance a column when precision runs out',
    description:
      'Detect numerically indistinguishable neighbour orders and renumber the column inside the same transaction.',
    type: 'task',
    priority: 'low',
    columnId: COLUMN_TODO,
    sprintId: SPRINT_ACTIVE,
    storyPoints: 3,
    assigneeId: USER_ALAN,
    tags: ['ordering'],
  },
  {
    key: 'SCRUM-5',
    title: 'Reject stale drag positions',
    description:
      'Refuse a drop whose anchor card has moved or been deleted and prompt the user to retry.',
    type: 'bug',
    priority: 'medium',
    columnId: COLUMN_TODO,
    sprintId: SPRINT_ACTIVE,
    storyPoints: null,
    assigneeId: USER_KATHERINE,
    tags: ['concurrency'],
  },
  {
    key: 'SCRUM-6',
    title: 'Derive the column map from live signals',
    description:
      'Build the per-column issue map as a computed signal so every consumer reacts to a single source of truth.',
    type: 'story',
    priority: 'urgent',
    columnId: COLUMN_IN_PROGRESS,
    sprintId: SPRINT_ACTIVE,
    storyPoints: 8,
    assigneeId: USER_GRACE,
    tags: ['signals'],
  },
  {
    key: 'SCRUM-7',
    title: 'Guard every live query subscription',
    description:
      'Tear down Dexie observable subscriptions with takeUntilDestroyed so component teardown cannot leak.',
    type: 'task',
    priority: 'high',
    columnId: COLUMN_IN_PROGRESS,
    sprintId: SPRINT_ACTIVE,
    storyPoints: 3,
    assigneeId: USER_ALAN,
    tags: ['memory-leak'],
  },
  {
    key: 'SCRUM-8',
    title: 'Design the dark board surface',
    description:
      'Establish the slate and indigo token set and verify contrast for card text against the board background.',
    type: 'story',
    priority: 'medium',
    columnId: COLUMN_IN_PROGRESS,
    sprintId: SPRINT_ACTIVE,
    storyPoints: 2,
    assigneeId: USER_KATHERINE,
    tags: ['design'],
  },
  {
    key: 'SCRUM-9',
    title: 'Collapse filters into a mobile sheet',
    description:
      'Present inline filter controls on desktop and a badge-counted bottom sheet on narrow viewports.',
    type: 'story',
    priority: 'medium',
    columnId: COLUMN_IN_REVIEW,
    sprintId: SPRINT_ACTIVE,
    storyPoints: 5,
    assigneeId: USER_KATHERINE,
    tags: ['responsive'],
  },
  {
    key: 'SCRUM-10',
    title: 'Truncate dense cards without losing context',
    description:
      'Keep the priority icon, issue key and avatar visible in compact density while the title clamps to one line.',
    type: 'task',
    priority: 'low',
    columnId: COLUMN_IN_REVIEW,
    sprintId: SPRINT_ACTIVE,
    storyPoints: 2,
    assigneeId: USER_GRACE,
    tags: ['responsive', 'design'],
  },
  {
    key: 'SCRUM-11',
    title: 'Ship the fractional ranking engine',
    description: 'Accept new card positions and rebalance when the midpoint gap collapses.',
    type: 'story',
    priority: 'high',
    columnId: COLUMN_DONE,
    sprintId: SPRINT_ACTIVE,
    storyPoints: 5,
    assigneeId: USER_ALAN,
    tags: ['ordering'],
  },
  {
    key: 'SCRUM-12',
    title: 'Open the database and expose typed tables',
    description: 'Declare the versioned schema and export the shared connection for the whole application.',
    type: 'task',
    priority: 'medium',
    columnId: COLUMN_DONE,
    sprintId: SPRINT_ACTIVE,
    storyPoints: 3,
    assigneeId: USER_GRACE,
    tags: ['storage'],
  },
  {
    key: 'SCRUM-13',
    title: 'Define the design token layer',
    description: 'Publish the colour ramp and font stack through the Tailwind theme block.',
    type: 'task',
    priority: 'low',
    columnId: COLUMN_DONE,
    sprintId: SPRINT_ACTIVE,
    storyPoints: null,
    assigneeId: USER_KATHERINE,
    tags: ['design'],
  },
  {
    key: 'SCRUM-14',
    title: 'Write optimistic update primitives',
    description: 'Expose versioned writes that reject a patch applied against a stale record.',
    type: 'story',
    priority: 'high',
    columnId: COLUMN_DONE,
    sprintId: SPRINT_ACTIVE,
    storyPoints: 5,
    assigneeId: USER_ALAN,
    tags: ['concurrency'],
  },
  // Backlog: these carry a column status but no sprint, which is what decouples
  // backlog membership from the board lane an issue currently sits in.
  {
    key: 'SCRUM-15',
    title: 'Support multiple projects per workspace',
    description: 'Allow switching the active project without discarding filter or density preferences.',
    type: 'epic',
    priority: 'lowest',
    columnId: COLUMN_TODO,
    sprintId: null,
    storyPoints: 13,
    assigneeId: null,
    tags: ['backlog', 'architecture'],
  },
  {
    key: 'SCRUM-16',
    title: 'Offer board export as CSV',
    description: 'Serialise the currently filtered issue set for reporting outside the tool.',
    type: 'story',
    priority: 'low',
    columnId: COLUMN_TODO,
    sprintId: null,
    storyPoints: 3,
    assigneeId: USER_ALAN,
    tags: ['backlog', 'reporting'],
  },
  {
    key: 'SCRUM-17',
    title: 'Virtualise long columns',
    description: 'Render only the visible card window once a column exceeds a few hundred issues.',
    type: 'story',
    priority: 'medium',
    columnId: COLUMN_IN_PROGRESS,
    sprintId: null,
    storyPoints: 8,
    assigneeId: null,
    tags: ['backlog', 'performance'],
  },
  {
    key: 'SCRUM-18',
    title: 'Round-trip issues through the API',
    description: 'Design an endpoint that mirrors the local schema for multi-user deployments.',
    type: 'epic',
    priority: 'low',
    columnId: COLUMN_TODO,
    sprintId: null,
    storyPoints: 13,
    assigneeId: USER_GRACE,
    tags: ['backlog', 'api'],
  },
  {
    key: 'SCRUM-19',
    title: 'Surface stale-order conflicts to the user',
    description: 'Show a refresh prompt when a write is rejected because the version moved on.',
    type: 'bug',
    priority: 'high',
    columnId: COLUMN_IN_REVIEW,
    sprintId: null,
    storyPoints: 2,
    assigneeId: USER_KATHERINE,
    tags: ['backlog', 'concurrency'],
  },
  {
    key: 'SCRUM-20',
    title: 'Archive closed sprints',
    description: 'Retain completed sprint history for velocity reporting without cluttering the active view.',
    type: 'task',
    priority: 'lowest',
    columnId: COLUMN_TODO,
    sprintId: null,
    storyPoints: null,
    assigneeId: null,
    tags: ['backlog', 'sprints'],
  },
];

/**
 * Assigns sort orders of `base + n * step` per column so that the seeded board
 * matches the spacing the ranking engine maintains at runtime.
 */
function buildIssues(): readonly Issue[] {
  const lastOrderByColumn = new Map<string, number>();

  return ISSUE_ROWS.map((row, index) => {
    const previousOrder = lastOrderByColumn.get(row.columnId);
    const sortOrder = previousOrder === undefined ? 1000 : previousOrder + 1000;
    lastOrderByColumn.set(row.columnId, sortOrder);

    return {
      id: `issue-${row.key.toLowerCase()}`,
      projectId: PROJECT_ID,
      key: row.key,
      title: row.title,
      description: row.description,
      type: row.type,
      priority: row.priority,
      statusId: row.columnId,
      storyPoints: row.storyPoints,
      assigneeId: row.assigneeId,
      reporterId: USER_ADMIN,
      sprintId: row.sprintId,
      sortOrder,
      tags: [...row.tags],
      version: 1,
      createdAt: BASE_TIMESTAMP,
      updatedAt: new Date(Date.parse(BASE_TIMESTAMP) + index * 60_000).toISOString(),
    };
  });
}

/** Sums the story points of a set of issues, treating unpointed work as zero. */
function sumStoryPoints(issues: readonly Issue[]): number {
  return issues.reduce<number>((total, issue) => total + (issue.storyPoints ?? 0), 0);
}

/**
 * Derives sprint totals from the seeded issues so the persisted figures can
 * never drift from the issue set they summarise.
 */
function buildSprints(issues: readonly Issue[]): readonly Sprint[] {
  const activeIssues = issues.filter((issue) => issue.sprintId === SPRINT_ACTIVE);
  const completedIssues = activeIssues.filter((issue) => issue.statusId === COLUMN_DONE);

  return [
    {
      id: SPRINT_ACTIVE,
      projectId: PROJECT_ID,
      name: 'Sprint 1',
      goal: 'Land the local-first board foundation: schema, ranking engine and reactive state.',
      status: 'active',
      startDate: '2026-01-05',
      endDate: '2026-01-19',
      totalPoints: sumStoryPoints(activeIssues),
      completedPoints: sumStoryPoints(completedIssues),
      createdAt: BASE_TIMESTAMP,
    },
    {
      id: SPRINT_FUTURE,
      projectId: PROJECT_ID,
      name: 'Sprint 2',
      goal: 'Assemble the responsive board surface and the issue detail experience.',
      status: 'future',
      startDate: '2026-01-19',
      endDate: '2026-02-02',
      totalPoints: sumStoryPoints(issues.filter((issue) => issue.sprintId === SPRINT_FUTURE)),
      completedPoints: 0,
      createdAt: BASE_TIMESTAMP,
    },
  ];
}

/** Reads the current row counts and default project from the database. */
async function readSummary(seeded: boolean): Promise<SeedSummary> {
  const [columns, sprints, users, issues, project] = await Promise.all([
    db.columns.count(),
    db.sprints.count(),
    db.users.count(),
    db.issues.count(),
    db.projects.get(PROJECT_ID),
  ]);

  return { project: project ?? null, columns, sprints, users, issues, seeded };
}

/** Reports whether the database already holds the fixture data. */
export async function isDatabaseSeeded(): Promise<boolean> {
  return (await db.projects.count()) > 0;
}

/**
 * Populates the database with a deterministic demo dataset: one project, four
 * columns, two sprints, four users and twenty issues.
 *
 * The call is idempotent. It is a no-op when the database already holds data
 * unless {@link SeedOptions.force} is set, in which case every table is cleared
 * and rewritten inside a single transaction so reactive consumers never
 * observe a partially seeded board.
 */
export async function seedDatabase(options: SeedOptions = {}): Promise<SeedSummary> {
  if (!options.force && (await isDatabaseSeeded())) {
    return readSummary(false);
  }

  const issues = buildIssues();

  await db.replaceAllData({
    projects: [PROJECT],
    issues,
    sprints: buildSprints(issues),
    users: USERS,
    comments: [],
    activities: [],
    columns: COLUMNS,
  });

  return readSummary(true);
}

/** Identifier of the project the demo dataset is attached to. */
export const SEED_PROJECT_ID = PROJECT_ID;

/** Identifier of the sprint marked `active` in the demo dataset. */
export const SEED_ACTIVE_SPRINT_ID = SPRINT_ACTIVE;
