# Project Specification: angular-scrum-board

---

## 1. System Architecture & Compiler Guardrails

### 1.1 Package & Tooling Strategy
* **Angular:** Latest standalone APIs (`signal`, `computed`, `effect`, `inject`, Control Flow `@if`/`@for`/`@switch`).
* **Angular CDK:** Must match the active `@angular/core` major release precisely in package manifests to eliminate peer-dependency resolution failures.
* **Tailwind CSS (v4 Engine):** CSS-first configuration via `@theme` in `src/styles.css`. No legacy `tailwind.config.js` or `postcss.config.js` files.
* **Module Import Architecture:** Strictly ban barrel files (`index.ts`). All imports must point directly to concrete file paths (e.g., `import { ButtonComponent } from '../../shared/ui/button/button.component'`) to avoid esbuild circular dependency TDZ runtime failures.
* **Standalone Component Isolation:** Every component declares its own dependencies inside its `@Component({ imports: [...] })` array. Shared wrapper modules are prohibited.
* **Subscription Management:** Every Dexie `liveQuery` subscription instantiated within components or non-root contexts must register `takeUntilDestroyed(inject(DestroyRef))`.

### 1.2 Global Styles & Design Tokens (`src/styles.css`)

```css
@import "tailwindcss";

@theme {
  --color-slate-950: #020617;
  --color-slate-900: #0f172a;
  --color-slate-800: #1e293b;
  --color-slate-700: #334155;
  --color-slate-600: #475569;
  --color-slate-400: #94a3b8;
  --color-slate-200: #e2e8f0;
  --color-slate-100: #f1f5f9;

  --color-indigo-500: #6366f1;
  --color-indigo-600: #4f46e5;
  --color-emerald-500: #10b981;
  --color-amber-500: #f59e0b;
  --color-rose-500: #f43f5e;

  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

html, body {
  height: 100%;
  background-color: var(--color-slate-950);
  color: var(--color-slate-100);
  font-family: var(--font-sans);
  margin: 0;
  padding: 0;
}
```

---

## 2. Data Schema & Pure TypeScript Interfaces

```typescript
export type IssueType = 'story' | 'bug' | 'task' | 'epic';
export type IssuePriority = 'lowest' | 'low' | 'medium' | 'high' | 'urgent';
export type SprintStatus = 'future' | 'active' | 'completed';
export type ViewDensity = 'compact' | 'comfortable';

export interface Project {
  id: string;
  key: string; // e.g., 'SCRUM'
  name: string;
  description: string;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  role: 'admin' | 'member' | 'viewer';
  createdAt: string;
}

export interface IssueComment {
  id: string;
  issueId: string;
  authorId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface IssueActivity {
  id: string;
  issueId: string;
  actorId: string;
  action: 'created' | 'status_change' | 'assignee_change' | 'priority_change' | 'commented';
  details: {
    field?: string;
    from?: string;
    to?: string;
  };
  timestamp: string;
}

export interface Issue {
  id: string;
  projectId: string;
  key: string;
  title: string;
  description: string;
  type: IssueType;
  priority: IssuePriority;
  statusId: string; // Foreign key to BoardColumn.id
  storyPoints: number | null;
  assigneeId: string | null;
  reporterId: string;
  sprintId: string | null;
  sortOrder: number;
  tags: string[];
  version: number; // Concurrency control
  createdAt: string;
  updatedAt: string;
}

export interface BoardColumn {
  id: string;
  projectId: string;
  title: string;
  wipLimit: number | null;
  sortOrder: number;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string;
  status: SprintStatus;
  startDate: string | null;
  endDate: string | null;
  totalPoints: number;
  completedPoints: number;
  createdAt: string;
}

export interface BoardFilterState {
  searchQuery: string;
  assigneeIds: string[];
  priorities: IssuePriority[];
  types: IssueType[];
  sprintId: string | null;
  density: ViewDensity;
}

// Backlog and Sprint Boundary Rule:
// Completing a sprint sets sprintId = null on incomplete issues while preserving their statusId.
// The Backlog view queries exclusively on { sprintId: null }, decoupling backlog membership from column status.
```

---

## 3. Storage Layer & Atomic Transactions

```typescript
import Dexie, { Table } from 'dexie';
import { Project, User, IssueComment, IssueActivity, Issue, BoardColumn, Sprint } from './core/models';

export class ScrumDatabase extends Dexie {
  projects!: Table<Project, string>;
  issues!: Table<Issue, string>;
  sprints!: Table<Sprint, string>;
  users!: Table<User, string>;
  comments!: Table<IssueComment, string>;
  activities!: Table<IssueActivity, string>;
  columns!: Table<BoardColumn, string>;

  constructor() {
    super('ScrumBoardDatabase');
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

  // Atomic Issue Cascade Deletion
  async deleteIssueCascade(issueId: string): Promise<void> {
    await this.transaction('rw', [this.issues, this.comments, this.activities], async () => {
      await this.comments.where('issueId').equals(issueId).delete();
      await this.activities.where('issueId').equals(issueId).delete();
      await this.issues.delete(issueId);
    });
  }

  // Atomic Issue Update with Optimistic Concurrency Control
  async updateIssueOptimistic(issueId: string, currentVersion: number, changes: Partial<Omit<Issue, 'id' | 'version'>>): Promise<void> {
    await this.transaction('rw', this.issues, async () => {
      const existing = await this.issues.get(issueId);
      if (!existing) {
        throw new Error(`Issue ${issueId} not found`);
      }
      if (existing.version !== currentVersion) {
        throw new Error('Conflict detected: This record has been modified by another operation.');
      }
      await this.issues.update(issueId, {
        ...changes,
        version: existing.version + 1,
        updatedAt: new Date().toISOString()
      });
    });
  }
}

export const db = new ScrumDatabase();
```

---

## 4. Algorithmic Services

### 4.1 Order Calculation & Column Rebalance Engine

```typescript
import { Injectable } from '@angular/core';
import { db } from './scrum-database';
import { Issue } from './core/models';

@Injectable({ providedIn: 'root' })
export class RankingService {
  readonly STEP = 1000.0;
  readonly PRECISION_THRESHOLD = 0.0001;

  calculateNewOrder(prevOrder: number | null, nextOrder: number | null): number {
    if (prevOrder === null && nextOrder === null) return this.STEP;
    if (prevOrder === null && nextOrder !== null) return nextOrder / 2;
    if (prevOrder !== null && nextOrder === null) return prevOrder + this.STEP;
    if (prevOrder !== null && nextOrder !== null) {
      return (prevOrder + nextOrder) / 2;
    }
    return this.STEP;
  }

  needsRebalance(prevOrder: number | null, nextOrder: number | null): boolean {
    if (prevOrder === null || nextOrder === null) return false;
    return Math.abs(nextOrder - prevOrder) < this.PRECISION_THRESHOLD;
  }

  /**
   * Transaction Contract: Any method with the `*WithinTx` suffix must strictly be executed
   * within an active Dexie transaction context (`db.transaction('rw', ...)`). Standalone invocation
   * outside an active transaction scope is prohibited.
   */
  async rebalanceColumnWithinTx(statusId: string, sprintId: string | null): Promise<void> {
    const issues = await db.issues
      .where('statusId')
      .equals(statusId)
      .filter((issue) => issue.sprintId === sprintId)
      .sortBy('sortOrder');

    let currentStep = this.STEP;
    for (const issue of issues) {
      await db.issues.update(issue.id, {
        sortOrder: currentStep,
        version: issue.version + 1,
        updatedAt: new Date().toISOString()
      });
      currentStep += this.STEP;
    }
  }
}

export interface ColumnWipStatus {
  current: number;
  max: number | null;
  isExceeded: boolean;
}

export function computeWipStatus(column: BoardColumn, issueCount: number): ColumnWipStatus {
  const max = column.wipLimit;
  return {
    current: issueCount,
    max,
    isExceeded: max !== null && issueCount > max
  };
}
```

### 4.2 Board State Service

```typescript
import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { liveQuery } from 'dexie';
import { db } from './scrum-database';
import { Issue, BoardColumn, BoardFilterState } from './core/models';
import { RankingService } from './ranking.service';

@Injectable({ providedIn: 'root' })
export class BoardStateService {
  private ranking = inject(RankingService);

  readonly projectId = signal<string>('project-scrum-default');
  readonly activeSprintId = signal<string | null>(null);
  readonly issuesRaw = signal<Issue[]>([]);
  readonly columnsRaw = signal<BoardColumn[]>([]);
  readonly isLoading = signal<boolean>(true);
  readonly errorMessage = signal<string | null>(null);

  readonly filters = signal<BoardFilterState>({
    searchQuery: '',
    assigneeIds: [],
    priorities: [],
    types: [],
    sprintId: null,
    density: 'comfortable'
  });

  // Filtered Issues Computed Signal
  readonly filteredIssues = computed(() => {
    const list = this.issuesRaw();
    const filter = this.filters();
    const activeSprint = this.activeSprintId();

    return list.filter((issue) => {
      if (issue.projectId !== this.projectId()) return false;
      if (issue.sprintId !== activeSprint) return false;
      if (filter.searchQuery.trim()) {
        const query = filter.searchQuery.toLowerCase();
        const matchesKey = issue.key.toLowerCase().includes(query);
        const matchesTitle = issue.title.toLowerCase().includes(query);
        if (!matchesKey && !matchesTitle) return false;
      }
      if (filter.assigneeIds.length > 0 && (!issue.assigneeId || !filter.assigneeIds.includes(issue.assigneeId))) {
        return false;
      }
      if (filter.priorities.length > 0 && !filter.priorities.includes(issue.priority)) {
        return false;
      }
      if (filter.types.length > 0 && !filter.types.includes(issue.type)) {
        return false;
      }
      return true;
    });
  });

  // Dynamic Column Mapping Derived Directly from columnsRaw Signal
  readonly columnIssueMap = computed(() => {
    const columns = this.columnsRaw();
    const issues = this.filteredIssues();
    const map = new Map<string, Issue[]>();

    for (const column of columns) {
      map.set(column.id, []);
    }

    for (const issue of issues) {
      const list = map.get(issue.statusId);
      if (list) {
        list.push(issue);
      }
    }

    map.forEach((items) => items.sort((a, b) => a.sortOrder - b.sortOrder));
    return map;
  });

  constructor() {
    this.initDatabaseSubscription();
  }

  private initDatabaseSubscription(): void {
    liveQuery(() => db.issues.toArray()).subscribe({
      next: (data) => {
        this.issuesRaw.set(data);
        this.isLoading.set(false);
      },
      error: (err: Error) => {
        this.errorMessage.set(err.message);
        this.isLoading.set(false);
      }
    });

    liveQuery(() => db.columns.orderBy('sortOrder').toArray()).subscribe({
      next: (cols) => this.columnsRaw.set(cols),
      error: (err: Error) => this.errorMessage.set(err.message)
    });
  }

  // Atomic Transactional Move with Local Re-read
  async moveIssue(
    issueId: string,
    targetStatusId: string,
    prevOrder: number | null,
    nextOrder: number | null,
    expectedVersion: number
  ): Promise<void> {
    try {
      await db.transaction('rw', db.issues, async () => {
        const freshTargetIssues = await db.issues
          .where('statusId')
          .equals(targetStatusId)
          .filter((i) => i.sprintId === this.activeSprintId() && i.id !== issueId)
          .sortBy('sortOrder');

        // Resolve neighbor indices
        let resolvedPrev: number | null = null;
        let resolvedNext: number | null = null;

        if (prevOrder === null && nextOrder === null) {
          // Empty column
          resolvedPrev = null;
          resolvedNext = null;
        } else if (prevOrder === null && nextOrder !== null) {
          // Placed at head
          resolvedNext = freshTargetIssues.length > 0 ? freshTargetIssues[0].sortOrder : null;
        } else if (prevOrder !== null && nextOrder === null) {
          // Placed at tail
          resolvedPrev = freshTargetIssues.length > 0 ? freshTargetIssues[freshTargetIssues.length - 1].sortOrder : null;
        } else {
          // Placed between two elements
          const pIndex = freshTargetIssues.findIndex((i) => i.sortOrder === prevOrder);
          if (pIndex === -1) {
            throw new Error('StalePositionError: Target issue reference disappeared. Please retry the move operation.');
          }
          resolvedPrev = freshTargetIssues[pIndex].sortOrder;
          resolvedNext = freshTargetIssues[pIndex + 1] ? freshTargetIssues[pIndex + 1].sortOrder : null;
        }

        const newOrder = this.ranking.calculateNewOrder(resolvedPrev, resolvedNext);
        const existing = await db.issues.get(issueId);

        if (!existing) {
          throw new Error('Target issue not found.');
        }
        if (existing.version !== expectedVersion) {
          throw new Error('Version mismatch: Card order has been updated elsewhere.');
        }

        await db.issues.update(issueId, {
          statusId: targetStatusId,
          sortOrder: newOrder,
          version: existing.version + 1,
          updatedAt: new Date().toISOString()
        });

        if (this.ranking.needsRebalance(resolvedPrev, resolvedNext)) {
          await this.ranking.rebalanceColumnWithinTx(targetStatusId, this.activeSprintId());
        }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to move issue';
      this.errorMessage.set(msg);
      throw err;
    }
  }

  setFilter(partial: Partial<BoardFilterState>): void {
    this.filters.update((current) => ({ ...current, ...partial }));
  }
}
```

---

## 5. Strict Null-Safe Pure Pipe Implementation

```typescript
import { Pipe, PipeTransform } from '@angular/core';
import { liveQuery } from 'dexie';
import { Observable, of } from 'rxjs';
import { db } from './scrum-database';
import { User } from './core/models';

@Pipe({
  name: 'userLookup',
  standalone: true
})
export class UserLookupPipe implements PipeTransform {
  transform(userId: string | null | undefined): Observable<User | null> {
    if (!userId) {
      return of(null);
    }
    return new Observable<User | null>((subscriber) => {
      const subscription = liveQuery(async () => {
        const user = await db.users.get(userId);
        return user || null;
      }).subscribe({
        next: (value) => subscriber.next(value),
        error: (err: unknown) => subscriber.error(err)
      });

      return () => subscription.unsubscribe();
    });
  }
}
```

---

## 6. Mobile Layout & Breakpoint Specifications

### 6.1 Viewport Targets
* **360px - 430px (Small to Large Mobile Phones)**
  * Kanban Board switches to a single column view with an explicit top pill selector to switch between column states.
  * Direct CDK card dragging is disabled; tapping a card reveals action triggers and a touch modal.
  * Filters collapse behind a single "Filters" button with badge count.
  * Backlog switches to vertical stacked card view.
* **768px (Tablet)**
  * Two columns visible horizontally with native smooth touch panning.
  * CDK drag active with drag handles.
* **1024px+ (Desktop)**
  * All columns rendered simultaneously in CSS grid (`grid-flow-col auto-cols-fr`).
  * CDK Drag & Drop enabled on entire card surface.

### 6.2 Mobile Action Sheet (`MobileMoveSheetComponent`)
* Layout: `fixed inset-x-0 bottom-0 z-50 rounded-t-xl bg-slate-900 border-t border-slate-700 shadow-2xl p-4`.
* Bounded viewport containment: `max-h-[80vh] overflow-y-auto flex flex-col gap-4`.
* Minimum tap target size: `min-h-11 min-w-11` (44px) for all select items and action buttons.
* Order Repositioning Controls: Single-record mutations using `calculateNewOrder` to avoid multi-record locking and version conflicts:
  * "Move to Top": Place before first card (`prevOrder: null`, `nextOrder: firstCard.sortOrder`). Disabled if card is already first.
  * "Move Up": Insert between predecessor's predecessor and predecessor (`prevOrder: predPred?.sortOrder ?? null`, `nextOrder: pred.sortOrder`). Disabled if card has no predecessor.
  * "Move Down": Insert between successor and successor's successor (`prevOrder: succ.sortOrder`, `nextOrder: succSucc?.sortOrder ?? null`). Disabled if card has no successor.
  * "Move to Bottom": Place after last card (`prevOrder: lastCard.sortOrder`, `nextOrder: null`). Disabled if card is already last.
  * Boundary & Strict Typing Contract: When `predPred` or `succSucc` is absent, the value must explicitly resolve to `null` (never `undefined`) to strictly fulfill `calculateNewOrder(number | null, number | null)`.

### 6.3 Card Density Truncation Strategy (`IssueCardComponent`)
* **Compact Mode (Desktop & Mobile):**
  1. Priority SVG Icon remains visible (`w-4 h-4 shrink-0`).
  2. Issue key remains visible (`text-xs font-mono shrink-0`).
  3. Title truncates via `truncate` / CSS line clamp 1.
  4. Story points badge is completely hidden on screens < 430px in compact mode.
  5. Assignee avatar remains visible (`h-6 w-6 rounded-full shrink-0 min-h-6 min-w-6`).
* **Touch Target Enforcements:**
  * Context menu triggers: `h-11 w-11 flex items-center justify-center p-2.5`.

### 6.4 Backlog Row Mobile Adaptation (`BacklogRowComponent`)
* Template structure uses conditional responsive display:
  * Container: `flex flex-col gap-2 p-3 border-b border-slate-800 md:grid md:grid-cols-[80px_1fr_100px_100px_80px] md:items-center`.
  * Top mobile line: Issue Key, Type Icon, and Status Badge.
  * Middle mobile line: Full Issue Title.
  * Bottom mobile line: Assignee Avatar, Story Points Pill, and Priority Badge.

---

## 7. Revised Five-Phase Sequential Queue

### Phase 1: Types, Storage/API Client Config, and Base Utilities
* [ ] Pin `@angular/cdk` version in `package.json` to match the exact resolved `@angular/core` major.minor version prior to installation.
* [ ] Create pure TypeScript models (`Project`, `User`, `Issue`, `BoardColumn`, `Sprint`, `IssueComment`, `IssueActivity`) in `src/app/core/models/` without index barrel exports.
* [ ] Configure Tailwind CSS v4 `@theme` block in `src/styles.css` directly overriding default color tokens (`--color-indigo-500`, etc.).
* [ ] Implement `ScrumDatabase` Dexie class including `deleteIssueCascade` and `updateIssueOptimistic` methods.
* [ ] Implement `RankingService` with fractional index calculation, stale position rejection, and intra-transaction rebalancing.
* [ ] Build test seeder creating 1 Project, 4 Columns, 2 Sprints, 4 Users, and 20 Issues.

### Phase 2: Design Foundation & Atomic UI Primitives
* [ ] Implement standalone `ButtonComponent` with explicit variants (primary, secondary, danger) and 44px min touch heights.
* [ ] Implement standalone `AvatarComponent` with null-safe initials fallback and size tokens.
* [ ] Implement standalone `BadgeComponent` for priorities and statuses.
* [ ] Implement standalone SVG indicator primitives (`PriorityIconComponent`, `TypeIconComponent`).
* [ ] Implement standalone `ModalShellComponent` with focus trap, backdrop escape handlers, and `max-h-[80vh] overflow-y-auto` sheet constraint.
* [ ] Implement `UserLookupPipe` with null-safe parameter handling and Observable cleanup.

### Phase 3: Compound Molecules & Feature Components
* [ ] Implement pure `computeWipStatus` helper function with strict `ColumnWipStatus` return type.
* [ ] Build `MobileColumnSwitcherComponent` providing pill tabs for single-column mobile viewports.
* [ ] Build `BoardFilterBarComponent` with desktop inline filters and a collapsed mobile bottom-sheet filter modal.
* [ ] Build `IssueCardComponent` with compact and comfortable density modes, dynamic truncation rules, and CDK drag handles.
* [ ] Build `BoardColumnComponent` dynamically consuming `BoardColumn` entities with WIP calculation warning styles.
* [ ] Build `MobileMoveSheetComponent` with quick status changes, discrete step repositioning (Top/Up/Down/Bottom), and 44x44px touch surfaces.
* [ ] Build `BacklogRowComponent` supporting both desktop grid and mobile stacked-card presentation.

### Phase 4: Domain Logic, Reactive State, and Drag & Drop
* [ ] Implement `BoardStateService` with dynamic `columnIssueMap` derived from `columnsRaw()` signal.
* [ ] Implement CDK Drag & Drop handling across connected drop lists with fractional index updates and transaction boundaries.
* [ ] Implement keyboard navigation service (`c` for quick create, `/` for search focus, `Escape` to close modals).
* [ ] Implement `SprintStateService` to support starting sprints, completing sprints, and moving uncompleted issues to backlog.
* [ ] Add optimistic concurrency error banners with refresh prompt on version mismatch.

### Phase 5: Complete Page Assembly & Responsive Shell
* [ ] Implement `AppShellComponent` with responsive left navigation and mobile slide-out menu.
* [ ] Implement `BoardContainerComponent` validating layouts at 360px, 390px, 430px, 768px, and 1024px+.
* [ ] Implement `BacklogContainerComponent` grouping sprint cards with collapsible issue lists.
* [ ] Implement `IssueDetailModalComponent` with cascade delete trigger, optimistic detail updates, and comment thread.
* [ ] Final compile verification: verify zero barrel files, no unmanaged RxJS/Dexie subscriptions, and zero implicit `any` compiler errors under Angular strict mode.