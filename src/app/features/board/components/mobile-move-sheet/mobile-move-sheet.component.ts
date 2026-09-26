import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { BoardColumn } from '../../../../core/models/column.model';
import { Issue } from '../../../../core/models/issue.model';
import { ModalShellComponent } from '../../../../shared/ui/modal/modal-shell.component';

/** A relative position an issue can be moved to within its column. */
export type IssueMoveTarget = 'top' | 'up' | 'down' | 'bottom';

interface MoveOption {
  readonly target: IssueMoveTarget;
  readonly label: string;
  readonly disabled: boolean;
}

const POSITION_OPTIONS: readonly MoveOption[] = [
  { target: 'top', label: 'Move to top', disabled: false },
  { target: 'up', label: 'Move up', disabled: false },
  { target: 'down', label: 'Move down', disabled: false },
  { target: 'bottom', label: 'Move to bottom', disabled: false },
];

const OPTION_CLASSES =
  'flex min-h-11 w-full items-center rounded-lg border border-slate-700 bg-slate-800 px-3 ' +
  'text-left text-sm font-medium text-slate-100 transition-colors hover:bg-slate-700 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ' +
  'disabled:cursor-not-allowed disabled:opacity-40';

/**
 * Touch-first alternative to drag and drop.
 *
 * Dragging a card is unreliable on a touch device, so mobile exposes a sheet
 * offering the four relative moves that matter plus a direct jump to any other
 * column. Every target is a full-width 44px row.
 */
@Component({
  selector: 'app-mobile-move-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalShellComponent],
  template: `
    <app-modal-shell
      [title]="'Move ' + issue().key"
      variant="sheet"
      (closed)="closed.emit()"
    >
      <p class="text-sm text-slate-400">{{ issue().title }}</p>

      <div class="flex flex-col gap-3">
        <section>
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Reorder in {{ currentColumnTitle() }}
          </h3>
          <div class="flex flex-col gap-2">
            @for (option of positionOptions(); track option.target) {
              <button
                type="button"
                [class]="OPTION_CLASSES"
                [disabled]="option.disabled"
                (click)="moveWithinColumn.emit(option.target)"
              >
                {{ option.label }}
              </button>
            }
          </div>
        </section>

        <section>
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Move to column
          </h3>
          <div class="flex flex-col gap-2">
            @for (column of otherColumns(); track column.id) {
              <button
                type="button"
                [class]="OPTION_CLASSES"
                (click)="moveToColumn.emit(column.id)"
              >
                {{ column.title }}
              </button>
            }

            @if (otherColumns().length === 0) {
              <p class="rounded-lg border border-slate-700 bg-slate-800 p-3 text-sm text-slate-400">
                This is the only column on the board.
              </p>
            }
          </div>
        </section>
      </div>

      <ng-container modalFooter>
        <button
          type="button"
          [class]="OPTION_CLASSES"
          (click)="closed.emit()"
        >
          Cancel
        </button>
      </ng-container>
    </app-modal-shell>
  `,
})
export class MobileMoveSheetComponent {
  readonly issue = input.required<Issue>();
  readonly columns = input.required<BoardColumn[]>();
  /**
   * The issues in the current column, in sort order. Required rather than
   * just a count so the sheet can tell whether "up" and "down" are real moves.
   */
  readonly columnIssues = input<Issue[]>([]);

  readonly moveWithinColumn = output<IssueMoveTarget>();
  readonly moveToColumn = output<string>();
  readonly closed = output<void>();

  protected readonly OPTION_CLASSES = OPTION_CLASSES;

  protected readonly currentColumnTitle = computed(
    () =>
      this.columns().find((column) => column.id === this.issue().statusId)?.title ??
      'this column',
  );

  protected readonly otherColumns = computed(() =>
    this.columns().filter((column) => column.id !== this.issue().statusId),
  );

  /**
   * "Up" and "down" are disabled at the ends of the lane. "To top" and
   * "to bottom" stay enabled: they are harmless no-ops that simply re-anchor
   * the fractional index, and hiding them would make the sheet look broken.
   */
  protected readonly positionOptions = computed<MoveOption[]>(() => {
    const siblings = this.columnIssues();
    const index = siblings.findIndex((sibling) => sibling.id === this.issue().id);

    if (index < 0) {
      return [...POSITION_OPTIONS];
    }

    const isFirst = index === 0;
    const isLast = index === siblings.length - 1;

    return POSITION_OPTIONS.map((option) => ({
      ...option,
      disabled:
        (option.target === 'up' && isFirst) || (option.target === 'down' && isLast),
    }));
  });
}
