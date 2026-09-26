import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { Issue } from '../../../../core/models/issue.model';
import { Sprint, SprintStatus } from '../../../../core/models/sprint.model';
import { BoardStateService } from '../../../../core/services/board-state.service';
import { KeyboardShortcutService } from '../../../../core/services/keyboard-shortcut.service';
import { SprintStateService } from '../../../../core/services/sprint-state.service';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';
import { ModalShellComponent } from '../../../../shared/ui/modal/modal-shell.component';
import { BoardFilterBarComponent } from '../../../board/components/board-filter-bar/board-filter-bar.component';
import { QuickCreateModalComponent } from '../../../board/components/quick-create-modal/quick-create-modal.component';
import { IssueDetailModalComponent } from '../../../board/containers/issue-detail-modal/issue-detail-modal.component';
import { SprintGroupComponent } from '../../components/sprint-group/sprint-group.component';

/** A rendered group of the backlog: one sprint, or the unscheduled pool. */
interface BacklogGroup {
  readonly key: string;
  readonly title: string;
  readonly goal: string;
  /** Null for the unscheduled pool, which no sprint action applies to. */
  readonly sprint: Sprint | null;
  readonly issues: Issue[];
  readonly completedPoints: number;
  readonly totalPoints: number;
  readonly isActive: boolean;
  readonly isCompleted: boolean;
}

/** Display order for sprint statuses: what is live, then what is next, then history. */
const STATUS_ORDER: Readonly<Record<SprintStatus, number>> = {
  active: 0,
  future: 1,
  completed: 2,
};

/**
 * The backlog: every issue grouped by the sprint it belongs to, with the
 * unscheduled pool last.
 *
 * The board's filter state is shared rather than duplicated, so moving between
 * the board and the backlog keeps whatever the user narrowed down. Sprint
 * actions live here because they are backlog-level decisions — the board shows
 * work, not planning.
 */
@Component({
  selector: 'app-backlog-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BoardFilterBarComponent,
    ButtonComponent,
    IssueDetailModalComponent,
    ModalShellComponent,
    QuickCreateModalComponent,
    SprintGroupComponent,
  ],
  template: `
    <section class="flex h-full flex-col gap-4">
      <app-board-filter-bar
        [filter]="board.filter()"
        [users]="board.users()"
        [sprints]="board.sprintsSorted()"
        (searchChanged)="board.setSearchQuery($event)"
        (toggleAssignee)="board.toggleAssigneeFilter($event)"
        (togglePriority)="board.togglePriorityFilter($event)"
        (toggleType)="board.toggleTypeFilter($event)"
        (sprintChanged)="board.setSprintFilter($event)"
        (densityChanged)="board.setDensity($event)"
        (clearRequested)="board.clearFilters()"
      />

      @if (board.errorMessage(); as message) {
        <div
          role="alert"
          class="flex items-start justify-between gap-3 rounded-lg border border-rose-500
            bg-rose-500/10 px-3 py-2 text-sm text-rose-500"
        >
          <p class="min-w-0 flex-1">{{ message }}</p>
          <button
            type="button"
            class="min-h-11 min-w-11 shrink-0 rounded-lg text-rose-500 hover:bg-rose-500/20"
            aria-label="Dismiss error"
            (click)="board.dismissError()"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      } @else if (sprints.errorMessage(); as message) {
        <div
          role="alert"
          class="flex items-start justify-between gap-3 rounded-lg border border-rose-500
            bg-rose-500/10 px-3 py-2 text-sm text-rose-500"
        >
          <p class="min-w-0 flex-1">{{ message }}</p>
          <button
            type="button"
            class="min-h-11 min-w-11 shrink-0 rounded-lg text-rose-500 hover:bg-rose-500/20"
            aria-label="Dismiss error"
            (click)="sprints.dismissError()"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      }

      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-sm font-semibold text-slate-100">
          Backlog
          @if (board.activeFilterCount() > 0) {
            <span class="font-normal text-slate-400">
              · {{ board.filteredIssues().length }} of {{ board.issues().length }} shown
            </span>
          }
        </h2>

        <app-button label="New issue" size="sm" (click)="quickCreateOpen.set(true)" />
      </div>

      @if (groups().length === 0) {
        <div
          class="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border
            border-dashed border-slate-700 bg-slate-900 p-8 text-center"
        >
          <p class="text-base font-semibold text-slate-100">
            {{ board.issues().length === 0 ? 'The backlog is empty' : 'Nothing matches' }}
          </p>
          <p class="max-w-sm text-sm text-slate-400">
            {{
              board.issues().length === 0
                ? 'No issues have been created yet. Start by adding the first one.'
                : 'No issue matches the current filters. Try widening your search.'
            }}
          </p>
          <app-button
            [label]="board.issues().length === 0 ? 'New issue' : 'Clear filters'"
            variant="secondary"
            (click)="board.issues().length === 0 ? quickCreateOpen.set(true) : board.clearFilters()"
          />
        </div>
      } @else {
        <ul class="flex flex-col gap-4">
          @for (group of groups(); track group.key) {
            <li class="flex flex-col gap-2">
              <app-sprint-group
                [groupId]="group.key"
                [title]="group.title"
                [goal]="group.goal"
                [issues]="group.issues"
                [usersById]="board.usersById()"
                [completedPoints]="group.completedPoints"
                [totalPoints]="group.totalPoints"
                [isActive]="group.isActive"
                [isCompleted]="group.isCompleted"
                (issueOpened)="openIssueId.set($event)"
              />

              @if (group.sprint !== null) {
                <div class="flex justify-end">
                  @if (group.sprint.status === 'future') {
                    <app-button
                      label="Start sprint"
                      variant="secondary"
                      size="sm"
                      [loading]="sprints.isMutating()"
                      (click)="startSprint(group.sprint.id)"
                    />
                  } @else if (group.sprint.status === 'active') {
                    <app-button
                      label="Complete sprint"
                      variant="danger"
                      size="sm"
                      [loading]="sprints.isMutating()"
                      (click)="completeCandidate.set(group.sprint)"
                    />
                  }
                </div>
              }
            </li>
          }
        </ul>
      }
    </section>

    @if (completeCandidate(); as sprint) {
      <app-modal-shell
        title="Complete this sprint?"
        [dismissOnBackdropClick]="false"
        (closed)="completeCandidate.set(null)"
      >
        <p class="text-sm text-slate-300">
          Completing <strong class="text-slate-100">{{ sprint.name }}</strong> records its
          delivered points and returns every unfinished issue to the backlog. Issues already in
          the terminal column stay with the sprint as history.
        </p>

        <ng-container modalFooter>
          <app-button
            label="Cancel"
            variant="secondary"
            [disabled]="sprints.isMutating()"
            (click)="completeCandidate.set(null)"
          />
          <app-button
            label="Complete sprint"
            variant="danger"
            [loading]="sprints.isMutating()"
            (click)="completeSprint(sprint.id)"
          />
        </ng-container>
      </app-modal-shell>
    }

    @if (quickCreateOpen()) {
      <app-quick-create-modal
        [columns]="board.columnsSorted()"
        [users]="board.users()"
        [sprints]="board.sprintsSorted()"
        [defaultColumnId]="board.columnsSorted()[0]?.id ?? null"
        (created)="onIssueCreated($event)"
        (closed)="quickCreateOpen.set(false)"
      />
    }

    @if (openIssueId(); as issueId) {
      <app-issue-detail-modal [issueId]="issueId" (closed)="openIssueId.set(null)" />
    }
  `,
})
export class BacklogContainerComponent {
  protected readonly board = inject(BoardStateService);
  protected readonly sprints = inject(SprintStateService);
  private readonly shortcuts = inject(KeyboardShortcutService);

  protected readonly quickCreateOpen = signal(false);
  protected readonly openIssueId = signal<string | null>(null);
  protected readonly completeCandidate = signal<Sprint | null>(null);

  /**
   * Sprints in working order, then the unscheduled pool. A group with no
   * matching issues is dropped, so the page never shows a header with nothing
   * under it — a brand-new sprint simply does not appear until it has work.
   */
  protected readonly groups = computed<BacklogGroup[]>(() => {
    const filtered = this.board.filteredIssues();
    const all = this.board.issues();

    const scheduled = [...this.board.sprintsSorted()]
      .sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          (a.startDate ?? '').localeCompare(b.startDate ?? '') ||
          a.name.localeCompare(b.name),
      )
      .map((sprint) => {
        const issues = all
          .filter((issue) => issue.sprintId === sprint.id && filtered.includes(issue))
          .sort((a, b) => a.sortOrder - b.sortOrder);

        if (issues.length === 0) {
          return null;
        }

        const progress = this.sprints.progressForIssues(issues);

        return {
          key: sprint.id,
          title: sprint.name,
          goal: sprint.goal,
          sprint,
          issues,
          completedPoints: progress.completedPoints,
          totalPoints: progress.totalPoints,
          isActive: sprint.status === 'active',
          isCompleted: sprint.status === 'completed',
        } satisfies BacklogGroup;
      })
      .filter((group) => group !== null);

    const unscheduled = all
      .filter((issue) => issue.sprintId === null && filtered.includes(issue))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    if (unscheduled.length === 0) {
      return scheduled;
    }

    const progress = this.sprints.progressForIssues(unscheduled);

    return [
      ...scheduled,
      {
        key: 'unscheduled',
        title: 'Unscheduled',
        goal: 'Issues that are not assigned to a sprint',
        sprint: null,
        issues: unscheduled,
        completedPoints: progress.completedPoints,
        totalPoints: progress.totalPoints,
        isActive: false,
        isCompleted: false,
      },
    ];
  });

  constructor() {
    this.shortcuts.shortcuts$
      .pipe(takeUntilDestroyed())
      .subscribe(({ action }) => {
        if (action === 'open-quick-create') {
          this.quickCreateOpen.set(true);
        }
      });
  }

  protected async startSprint(sprintId: string): Promise<void> {
    await this.sprints.startSprint(sprintId);
  }

  protected async completeSprint(sprintId: string): Promise<void> {
    const succeeded = await this.sprints.completeSprint(sprintId);

    if (succeeded) {
      this.completeCandidate.set(null);
    }
  }

  protected onIssueCreated(issueId: string): void {
    this.quickCreateOpen.set(false);
    this.openIssueId.set(issueId);
  }
}
