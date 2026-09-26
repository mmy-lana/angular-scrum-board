import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { auditTime, fromEvent } from 'rxjs';

import { Issue, IssuePriority } from '../../../../core/models/issue.model';
import { BoardStateService } from '../../../../core/services/board-state.service';
import {
  KeyboardShortcutService,
  ShortcutAction,
  priorityForDigit,
  typeForLetter,
} from '../../../../core/services/keyboard-shortcut.service';
import { BoardFilterBarComponent } from '../../components/board-filter-bar/board-filter-bar.component';
import { BoardColumnComponent } from '../../components/board-column/board-column.component';
import { IssueCardComponent } from '../../components/issue-card/issue-card.component';
import { MobileColumnSwitcherComponent } from '../../components/mobile-column-switcher/mobile-column-switcher.component';
import {
  IssueMoveTarget,
  MobileMoveSheetComponent,
} from '../../components/mobile-move-sheet/mobile-move-sheet.component';
import { QuickCreateModalComponent } from '../../components/quick-create-modal/quick-create-modal.component';
import { IssueDetailModalComponent } from '../issue-detail-modal/issue-detail-modal.component';

/** Below this width the lanes are selected one at a time instead of fanned out. */
const STACKED_BREAKPOINT = 1024;

/**
 * The board screen: filter bar, drag-and-drop lanes, quick create, issue detail
 * and the touch move sheet.
 *
 * The container owns no data of its own. It reads derived view state from
 * {@link BoardStateService} and translates CDK drop events into move requests,
 * which keeps the drop logic verifiable independently of the template.
 */
@Component({
  selector: 'app-board-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDropList,
    CdkDropListGroup,
    CdkDrag,
    BoardFilterBarComponent,
    BoardColumnComponent,
    IssueCardComponent,
    MobileColumnSwitcherComponent,
    MobileMoveSheetComponent,
    QuickCreateModalComponent,
    IssueDetailModalComponent,
  ],
  host: {
    // The host is a custom element, so it defaults to `display: block` with
    // `min-height: auto`. As a flex item of `main` it would then refuse to
    // shrink below its content and the board would be cropped by `main`
    // instead of scrolling inside the lanes.
    class: 'flex min-h-0 flex-1 flex-col overflow-hidden',
  },
  template: `
    <section class="flex h-full min-h-0 flex-col gap-4">
      <header class="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <h1 class="truncate text-lg font-semibold text-slate-100">
            {{ board.project()?.name ?? 'Board' }}
          </h1>
          @if (board.project()?.description; as description) {
            <p class="truncate text-sm text-slate-400">{{ description }}</p>
          }
        </div>

        <button
          type="button"
          class="min-h-11 shrink-0 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white
            hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2
            focus-visible:outline-indigo-500"
          (click)="openQuickCreate()"
        >
          New issue
        </button>
      </header>

      <app-board-filter-bar
        #filterBar
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
      }

      @if (board.isBoardEmpty()) {
        <div
          class="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border
            border-dashed border-slate-700 bg-slate-900 p-8 text-center"
        >
          <p class="text-base font-semibold text-slate-100">This board is empty</p>
          <p class="max-w-sm text-sm text-slate-400">
            Create the first issue to start tracking work through your columns.
          </p>
          <button
            type="button"
            class="min-h-11 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white
              hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-indigo-500"
            (click)="openQuickCreate()"
          >
            New issue
          </button>
        </div>
      } @else if (board.isFilteredEmpty()) {
        <div
          class="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border
            border-dashed border-slate-700 bg-slate-900 p-8 text-center"
        >
          <p class="text-base font-semibold text-slate-100">No matching issues</p>
          <p class="max-w-sm text-sm text-slate-400">
            No issue matches the current filters. Try widening your search.
          </p>
          <button
            type="button"
            class="min-h-11 rounded-lg border border-slate-700 bg-slate-800 px-4 text-sm
              font-medium text-slate-100 hover:bg-slate-700 focus-visible:outline-2
              focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            (click)="board.clearFilters()"
          >
            Clear filters
          </button>
        </div>
      } @else {
        <app-mobile-column-switcher
          [columns]="board.columnsSorted()"
          [selectedColumnId]="selectedColumnId()"
          [countsByColumnId]="board.columnCountsById()"
          (columnSelected)="selectColumn($event)"
        />

        <div
          cdkDropListGroup
          class="grid min-h-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          @for (column of board.columnsSorted(); track column.id) {
            <div
              [id]="panelId(column.id)"
              [attr.role]="isStackedLayout() ? 'tabpanel' : null"
              [attr.aria-labelledby]="isStackedLayout() ? tabId(column.id) : null"
              [class.hidden]="isStackedLayout() && column.id !== selectedColumnId()"
              class="min-h-0"
            >
              <app-board-column
                [column]="column"
                [issues]="board.issuesInColumn(column.id)"
                [usersById]="board.usersById()"
                [density]="board.density()"
                [showMoveControl]="isStackedLayout()"
              >
                <div
                  cdkDropList
                  [cdkDropListData]="board.issuesInColumn(column.id)"
                  [cdkDropListConnectedTo]="dropListIds()"
                  [id]="dropListId(column.id)"
                  class="flex min-h-full flex-col gap-2"
                  (cdkDropListDropped)="onDrop($event, column.id)"
                >
                  @for (issue of board.issuesInColumn(column.id); track issue.id) {
                    <app-issue-card
                      cdkDrag
                      [cdkDragData]="issue"
                      [issue]="issue"
                      [assignee]="board.assigneeFor(issue)"
                      [density]="board.density()"
                      [showMoveControl]="isStackedLayout()"
                      (opened)="openIssue($event)"
                      (moveRequested)="openMoveSheet($event)"
                    />
                  }
                </div>
              </app-board-column>
            </div>
          }
        </div>
      }
    </section>

    @if (quickCreateOpen()) {
      <app-quick-create-modal
        [columns]="board.columnsSorted()"
        [users]="board.users()"
        [sprints]="board.sprintsSorted()"
        [defaultColumnId]="quickCreateColumnId()"
        [initialPriority]="seededPriority()"
        [initialType]="seededType()"
        (created)="onIssueCreated($event)"
        (closed)="closeQuickCreate()"
      />
    }

    @if (openIssueId(); as issueId) {
      <app-issue-detail-modal [issueId]="issueId" (closed)="openIssueId.set(null)" />
    }

    @if (moveSheetIssue(); as issue) {
      <app-mobile-move-sheet
        [issue]="issue"
        [columns]="board.columnsSorted()"
        [columnIssues]="board.issuesInColumn(issue.statusId)"
        (moveWithinColumn)="onMoveWithinColumn($event, issue.id)"
        (moveToColumn)="onMoveToColumn($event, issue.id)"
        (closed)="moveSheetIssueId.set(null)"
      />
    }
  `,
})
export class BoardContainerComponent {
  protected readonly board = inject(BoardStateService);
  private readonly shortcuts = inject(KeyboardShortcutService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly filterBar = viewChild(BoardFilterBarComponent);

  protected readonly quickCreateOpen = signal(false);
  protected readonly quickCreateColumnId = signal<string | null>(null);
  protected readonly openIssueId = signal<string | null>(null);
  protected readonly moveSheetIssueId = signal<string | null>(null);

  /**
   * The column the user picked, or `null` before they have picked one.
   *
   * Held separately from the effective selection below because the columns
   * arrive asynchronously: seeding this from the constructor captured an empty
   * list, left the selection as an id matching no column, and hid every lane.
   */
  private readonly requestedColumnId = signal<string | null>(null);

  /** Falls back to the first lane until the user makes a choice. */
  protected readonly selectedColumnId = computed<string>(() => {
    const requested = this.requestedColumnId();

    if (requested !== null && this.board.columnById(requested) !== null) {
      return requested;
    }

    return this.board.columnsSorted()[0]?.id ?? '';
  });

  /** Priority and type pre-seeded into the quick-create dialog by a shortcut. */
  protected readonly seededPriority = signal<IssuePriority | null>(null);
  protected readonly seededType = signal<Issue['type'] | null>(null);

  private readonly viewportWidth = signal(readViewportWidth());

  /**
   * From {@link STACKED_BREAKPOINT} upwards the lanes fan four-across. Below
   * it each one is too narrow to read, so the switcher reveals a single lane at
   * a time and the touch move sheet replaces dragging.
   *
   * The constant must stay equal to the `lg` breakpoint the lane grid switches
   * on. While the two disagreed, a viewport between them got the fanned
   * layout with a two-by-two grid, leaving two lanes below the fold.
   */
  protected readonly isStackedLayout = computed(
    () => this.viewportWidth() < STACKED_BREAKPOINT,
  );

  /** Every lane is a drop target, so cards can move between any two columns. */
  protected readonly dropListIds = computed<string[]>(() =>
    this.board.columnsSorted().map((column) => this.dropListId(column.id)),
  );

  /**
   * Resolved to a full issue so the move sheet never receives a null for a
   * required input; an issue deleted while the sheet was open closes it.
   */
  protected readonly moveSheetIssue = computed<Issue | null>(() => {
    const issueId = this.moveSheetIssueId();
    return issueId === null ? null : this.board.issueById(issueId);
  });

  constructor() {
    this.shortcuts.shortcuts$
      .pipe(takeUntilDestroyed())
      .subscribe((shortcut) => this.handleShortcut(shortcut.action));

    // Resize fires continuously while a window is dragged, and every event
    // re-derives the whole column/tab layout. Sampling at 100ms keeps the
    // breakpoint honest while collapsing a drag into a handful of updates.
    fromEvent(window, 'resize')
      .pipe(
        auditTime(100),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.viewportWidth.set(readViewportWidth()));
  }

  protected handleShortcut(action: ShortcutAction): void {
    switch (action) {
      case 'open-quick-create':
        this.openQuickCreate();
        break;

      case 'focus-search':
        this.filterBar()?.focusSearch();
        break;

      case 'close-overlay':
        this.closeTopOverlay();
        break;

      default: {
        // Priority and type shortcuts pre-seed the quick-create dialog. They
        // open it first so the shortcut is never a no-op from the board view.
        if (action.startsWith('set-priority-')) {
          const digit = Number(action.slice('set-priority-'.length));
          const priority = priorityForDigit(digit);
          if (priority !== null) {
            this.seededPriority.set(priority);
            this.seededType.set(null);
            this.openQuickCreate();
          }
          return;
        }

        if (action.startsWith('set-type-')) {
          const letter = action.slice('set-type-'.length);
          const type = typeForLetter(letter);
          if (type !== null) {
            this.seededType.set(type);
            this.seededPriority.set(null);
            this.openQuickCreate();
          }
        }
        break;
      }
    }
  }

  protected openQuickCreate(columnId?: string): void {
    this.quickCreateColumnId.set(columnId ?? this.board.columnsSorted()[0]?.id ?? null);
    this.quickCreateOpen.set(true);
  }

  protected closeQuickCreate(): void {
    this.quickCreateOpen.set(false);
    this.seededPriority.set(null);
    this.seededType.set(null);
  }

  protected selectColumn(columnId: string): void {
    this.requestedColumnId.set(columnId);
  }

  protected openIssue(issueId: string): void {
    this.openIssueId.set(issueId);
  }

  protected openMoveSheet(issueId: string): void {
    this.moveSheetIssueId.set(issueId);
  }

  protected onIssueCreated(issueId: string): void {
    this.closeQuickCreate();
    this.openIssue(issueId);
  }

  /**
   * Translates a CDK drop into a store move.
   *
   * CDK reports the index measured against the destination list *after* the
   * dragged card has been lifted out, which is the convention `moveIssue`
   * expects, so the index is forwarded unchanged.
   */
  protected onDrop(event: CdkDragDrop<Issue[]>, columnId: string): void {
    const issue = event.item.data as Issue | undefined;

    if (issue === undefined) {
      return;
    }

    void this.board.moveIssue({
      issueId: issue.id,
      targetColumnId: columnId,
      targetIndex: event.currentIndex,
    });
  }

  protected onMoveWithinColumn(target: IssueMoveTarget, issueId: string): void {
    this.moveSheetIssueId.set(null);
    const issue = this.board.issueById(issueId);

    if (issue === null) {
      return;
    }

    switch (target) {
      case 'top':
        void this.board.moveToEdge(issueId, issue.statusId, 'top');
        break;
      case 'bottom':
        void this.board.moveToEdge(issueId, issue.statusId, 'bottom');
        break;
      case 'up':
        void this.board.moveByOffset(issueId, -1);
        break;
      case 'down':
        void this.board.moveByOffset(issueId, 1);
        break;
    }
  }

  protected onMoveToColumn(columnId: string, issueId: string): void {
    this.moveSheetIssueId.set(null);
    void this.board.moveToEdge(issueId, columnId, 'top');
  }

  /** Dismisses the most recently opened overlay, mirroring `Escape`. */
  private closeTopOverlay(): void {
    if (this.moveSheetIssue() !== null) {
      this.moveSheetIssueId.set(null);
      return;
    }

    if (this.openIssueId() !== null) {
      this.openIssueId.set(null);
      return;
    }

    if (this.quickCreateOpen()) {
      this.closeQuickCreate();
    }
  }

  protected panelId(columnId: string): string {
    return `column-panel-${columnId}`;
  }

  protected tabId(columnId: string): string {
    return `column-tab-${columnId}`;
  }

  protected dropListId(columnId: string): string {
    return `column-drop-${columnId}`;
  }
}

/** Current viewport width, guarded for non-browser test environments. */
function readViewportWidth(): number {
  return typeof window === 'undefined' ? STACKED_BREAKPOINT : window.innerWidth;
}
