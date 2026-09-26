import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { BoardFilterState, countActiveFilters } from '../../../../core/models/filter.model';
import {
  IssuePriority,
  IssueType,
} from '../../../../core/models/issue.model';
import { Sprint } from '../../../../core/models/sprint.model';
import { User } from '../../../../core/models/user.model';
import { ModalShellComponent } from '../../../../shared/ui/modal/modal-shell.component';
import { BoardFilterControlsComponent } from '../board-filter-controls/board-filter-controls.component';

/**
 * The board's filter surface: free-text search plus a set of filter controls.
 *
 * From the large breakpoint up the controls sit inline beside the search
 * field. Below it they collapse behind a single trigger that carries a count
 * of the active filters, opening a bottom sheet — roughly twenty chips are far
 * too many to leave on screen at phone widths.
 */
@Component({
  selector: 'app-board-filter-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BoardFilterControlsComponent, ModalShellComponent],
  template: `
    <div
      class="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3
        lg:flex-row lg:items-center lg:flex-wrap"
    >
      <div class="min-w-0 flex-1 lg:min-w-56">
        <label for="board-search" class="sr-only">Search issues</label>
        <input
          #searchField
          id="board-search"
          type="search"
          placeholder="Search issues…"
          [value]="filter().searchQuery"
          class="block min-h-11 w-full rounded-lg border border-slate-700 bg-slate-800 px-3
            text-sm text-slate-100 placeholder:text-slate-400 focus:outline-2
            focus:outline-offset-2 focus:outline-indigo-500"
          (input)="handleSearch($event)"
        />
      </div>

      <button
        type="button"
        class="flex min-h-11 items-center justify-center gap-2 rounded-lg border
          border-slate-700 bg-slate-800 px-3 text-sm font-medium text-slate-100
          hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-indigo-500 lg:hidden"
        [attr.aria-expanded]="sheetOpen()"
        aria-haspopup="dialog"
        (click)="openSheet()"
      >
        <svg
          class="h-4 w-4 shrink-0"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M2 4h12M4.5 8h7M6.5 12h3" />
        </svg>
        Filters
        @if (activeCount() > 0) {
          <span
            class="inline-flex h-5 min-w-5 items-center justify-center rounded-full
              bg-indigo-500 px-1.5 text-xs font-semibold text-white"
          >
            {{ activeCount() }}
          </span>
        }
      </button>

      <app-board-filter-controls
        class="hidden lg:flex lg:flex-wrap lg:items-center lg:gap-2"
        [filter]="filter()"
        [users]="users()"
        [sprints]="sprints()"
        (toggleAssignee)="toggleAssignee.emit($event)"
        (togglePriority)="togglePriority.emit($event)"
        (toggleType)="toggleType.emit($event)"
        (sprintChanged)="sprintChanged.emit($event)"
        (densityChanged)="densityChanged.emit($event)"
        (clearRequested)="clearRequested.emit()"
      />
    </div>

    @if (sheetOpen()) {
      <app-modal-shell title="Filters" variant="sheet" (closed)="closeSheet()">
        <div class="flex flex-col gap-4">
          <app-board-filter-controls
            [filter]="filter()"
            [users]="users()"
            [sprints]="sprints()"
            (toggleAssignee)="toggleAssignee.emit($event)"
            (togglePriority)="togglePriority.emit($event)"
            (toggleType)="toggleType.emit($event)"
            (sprintChanged)="sprintChanged.emit($event)"
            (densityChanged)="densityChanged.emit($event)"
            (clearRequested)="clearRequested.emit()"
          />
        </div>
      </app-modal-shell>
    }
  `,
})
export class BoardFilterBarComponent {
  readonly filter = input.required<BoardFilterState>();
  readonly users = input<User[]>([]);
  readonly sprints = input<Sprint[]>([]);

  readonly searchChanged = output<string>();
  readonly toggleAssignee = output<string>();
  readonly togglePriority = output<IssuePriority>();
  readonly toggleType = output<IssueType>();
  readonly sprintChanged = output<string | null>();
  readonly densityChanged = output<'compact' | 'comfortable'>();
  readonly clearRequested = output<void>();

  private readonly searchField = viewChild<ElementRef<HTMLInputElement>>('searchField');

  /** Moves focus to the search field; bound to the `/` shortcut. */
  focusSearch(): void {
    this.searchField()?.nativeElement.focus();
  }

  protected readonly activeCount = computed(() => countActiveFilters(this.filter()));

  /** True while the mobile filter sheet is open; the inline bar is desktop-only. */
  protected readonly sheetOpen = signal(false);

  protected openSheet(): void {
    this.sheetOpen.set(true);
  }

  protected closeSheet(): void {
    this.sheetOpen.set(false);
  }

  protected handleSearch(event: Event): void {
    const target = event.target;

    if (target instanceof HTMLInputElement) {
      this.searchChanged.emit(target.value);
    }
  }
}
