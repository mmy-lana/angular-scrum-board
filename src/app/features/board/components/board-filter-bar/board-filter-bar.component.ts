import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { BoardFilterState, countActiveFilters } from '../../../../core/models/filter.model';
import {
  ISSUE_PRIORITIES,
  IssuePriority,
  IssueType,
  ISSUE_TYPES,
} from '../../../../core/models/issue.model';
import { Sprint } from '../../../../core/models/sprint.model';
import { User } from '../../../../core/models/user.model';
import { AvatarComponent } from '../../../../shared/ui/avatar/avatar.component';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';

/**
 * The board's filter surface: free-text search, assignee, priority, type and
 * sprint selectors plus the density toggle.
 *
 * The component never mutates the filter object it receives. Every change is
 * emitted as a complete, new {@link BoardFilterState} so the owning store
 * stays the single source of truth.
 */
@Component({
  selector: 'app-board-filter-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarComponent, ButtonComponent],
  template: `
    <div
      class="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3
        lg:flex-row lg:items-center lg:flex-wrap"
    >
      <div class="min-w-0 flex-1 lg:min-w-56">
        <label for="board-search" class="sr-only">Search issues</label>
        <input
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

      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-medium uppercase tracking-wide text-slate-400">Assignee</span>
        @for (user of assignableUsers(); track user.id) {
          <button
            type="button"
            [class]="assigneeClasses(user.id)"
            [attr.aria-pressed]="filter().assigneeIds.includes(user.id)"
            [attr.aria-label]="'Filter by ' + user.name"
            (click)="toggleAssignee.emit(user.id)"
          >
            <app-avatar [user]="user" size="xs" [decorative]="true" />
            <span class="truncate">{{ firstName(user) }}</span>
          </button>
        }
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-medium uppercase tracking-wide text-slate-400">Priority</span>
        @for (priority of ISSUE_PRIORITIES; track priority) {
          <button
            type="button"
            [class]="chipClasses(filter().priorities.includes(priority))"
            [attr.aria-pressed]="filter().priorities.includes(priority)"
            (click)="togglePriority.emit(priority)"
          >
            {{ priority }}
          </button>
        }
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-medium uppercase tracking-wide text-slate-400">Type</span>
        @for (type of ISSUE_TYPES; track type) {
          <button
            type="button"
            [class]="chipClasses(filter().types.includes(type))"
            [attr.aria-pressed]="filter().types.includes(type)"
            (click)="toggleType.emit(type)"
          >
            {{ type }}
          </button>
        }
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <label for="sprint-filter" class="text-xs font-medium uppercase tracking-wide text-slate-400">
          Sprint
        </label>
        <select
          id="sprint-filter"
          [value]="filter().sprintId ?? ''"
          class="min-h-11 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm
            text-slate-100 focus:outline-2 focus:outline-offset-2 focus:outline-indigo-500"
          (change)="handleSprintChange($event)"
        >
          <option value="">All sprints</option>
          @for (sprint of sprints(); track sprint.id) {
            <option [value]="sprint.id">{{ sprint.name }}</option>
          }
        </select>
      </div>

      <div class="flex items-center gap-2">
        <app-button
          label="Compact"
          size="sm"
          variant="secondary"
          [pressed]="filter().density === 'compact'"
          (pressedChange)="densityChanged.emit('compact')"
        />
        <app-button
          label="Comfortable"
          size="sm"
          variant="secondary"
          [pressed]="filter().density === 'comfortable'"
          (pressedChange)="densityChanged.emit('comfortable')"
        />

        @if (activeCount() > 0) {
          <app-button
            [label]="'Clear ' + activeCount() + ' filters'"
            size="sm"
            variant="secondary"
            (click)="clearRequested.emit()"
          />
        }
      </div>
    </div>
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

  protected readonly ISSUE_PRIORITIES = ISSUE_PRIORITIES;
  protected readonly ISSUE_TYPES = ISSUE_TYPES;

  protected readonly activeCount = computed(() => countActiveFilters(this.filter()));

  /** Viewers cannot own work, so they are not offered as a filter option. */
  protected readonly assignableUsers = computed(() =>
    this.users().filter((user) => user.role !== 'viewer'),
  );

  /** First name only; the avatar already identifies the person. */
  protected firstName(user: User): string {
    return user.name.split(/\s+/)[0] ?? user.name;
  }

  protected chipClasses(isActive: boolean): string {
    const base =
      'min-h-11 rounded-lg border px-3 text-sm font-medium capitalize transition-colors ' +
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500';

    return isActive
      ? `${base} border-indigo-500 bg-indigo-600 text-white`
      : `${base} border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700`;
  }

  protected assigneeClasses(userId: string): string {
    const base =
      'flex min-h-11 items-center gap-2 rounded-lg border px-2 text-sm font-medium ' +
      'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ' +
      'focus-visible:outline-indigo-500';

    return this.filter().assigneeIds.includes(userId)
      ? `${base} border-indigo-500 bg-indigo-600 text-white`
      : `${base} border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700`;
  }

  protected handleSearch(event: Event): void {
    const target = event.target;

    if (target instanceof HTMLInputElement) {
      this.searchChanged.emit(target.value);
    }
  }

  protected handleSprintChange(event: Event): void {
    const target = event.target;

    if (target instanceof HTMLSelectElement) {
      this.sprintChanged.emit(target.value.length === 0 ? null : target.value);
    }
  }
}
