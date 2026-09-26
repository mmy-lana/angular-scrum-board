import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { BoardColumn } from '../../../../core/models/column.model';
import { Issue } from '../../../../core/models/issue.model';
import { ViewDensity } from '../../../../core/models/filter.model';
import { User } from '../../../../core/models/user.model';
import { computeWipStatus } from '../../../../core/utils/wip-validator';

/**
 * Header state for a column lane.
 *
 * Split out so the lane header and the WIP badge can be rendered together
 * without recomputing the status twice per change detection pass.
 */
export interface ColumnHeaderView {
  readonly wipLabel: string;
  readonly overLimit: boolean;
  readonly atLimit: boolean;
}

/**
 * One kanban lane: a header with the WIP counter, then the list of cards.
 *
 * The lane itself is presentational. Drag and drop directives are attached by
 * {@link BoardColumnComponent}'s consumer, which owns the board-wide
 * connection between lanes.
 */
@Component({
  selector: 'app-board-column',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="flex h-full w-full flex-col rounded-xl border bg-slate-900"
      [class]="borderClasses()"
      [attr.aria-label]="column().title + ' column'"
    >
      <header
        class="flex items-center justify-between gap-2 border-b border-slate-700 px-3 py-2"
        [class]="headerClasses()"
      >
        <div class="flex min-w-0 items-center gap-2">
          <span class="truncate text-sm font-semibold text-slate-100">
            {{ column().title }}
          </span>
          <span class="shrink-0 text-xs text-slate-400" [attr.aria-label]="countLabel()">
            {{ header().wipLabel }}
          </span>
        </div>

        @if (header().atLimit || header().overLimit) {
          <span
            class="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase"
            [class]="warningClasses()"
          >
            {{ header().overLimit ? 'Over WIP' : 'At WIP' }}
          </span>
        }
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <ng-content />
      </div>
    </section>
  `,
})
export class BoardColumnComponent {
  readonly column = input.required<BoardColumn>();
  /** Cards for this lane, already filtered and ordered by the consumer. */
  readonly issues = input<Issue[]>([]);
  /** Assignee lookup, supplied by the consumer to avoid per-card queries. */
  readonly usersById = input<ReadonlyMap<string, User>>(new Map());
  readonly density = input<ViewDensity>('comfortable');
  /** Enables the touch-friendly move control on each card. */
  readonly showMoveControl = input(false);

  readonly issueOpened = output<string>();
  readonly moveRequested = output<string>();
  readonly createRequested = output<string>();

  protected readonly header = computed<ColumnHeaderView>(() => {
    const status = computeWipStatus(this.issues().length, this.column().wipLimit);

    return {
      wipLabel: status.label,
      overLimit: status.overLimit,
      atLimit: status.atLimit,
    };
  });

  protected readonly borderClasses = computed<string>(() =>
    this.header().overLimit
      ? 'border-rose-500'
      : this.header().atLimit
        ? 'border-amber-500'
        : 'border-slate-700',
  );

  protected readonly headerClasses = computed<string>(() =>
    this.header().overLimit
      ? 'bg-rose-500/10'
      : this.header().atLimit
        ? 'bg-amber-500/10'
        : '',
  );

  protected readonly warningClasses = computed<string>(() =>
    this.header().overLimit ? 'bg-rose-500/20 text-rose-500' : 'bg-amber-500/20 text-amber-500',
  );

  protected readonly countLabel = computed<string>(() => {
    const status = computeWipStatus(this.issues().length, this.column().wipLimit);

    return status.limit === null
      ? `${status.count} issues`
      : `${status.count} of ${status.limit} issues`;
  });

  /** Resolves an assignee for a card, or `null` when unassigned or unknown. */
  protected assigneeFor(issue: Issue): User | null {
    if (issue.assigneeId === null) {
      return null;
    }

    return this.usersById().get(issue.assigneeId) ?? null;
  }
}
