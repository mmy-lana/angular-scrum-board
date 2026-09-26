import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { BoardColumn } from '../../../../core/models/column.model';

/**
 * Horizontal tab list that replaces the kanban lanes on narrow viewports.
 *
 * The board is unusable at 360px with four lanes side by side, so below 768px
 * the lanes become a single scrolling pane selected through this control.
 */
@Component({
  selector: 'app-mobile-column-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block lg:hidden',
  },
  template: `
    <div
      role="tablist"
      aria-label="Board columns"
      class="flex gap-2 overflow-x-auto pb-2"
    >
      @for (column of columns(); track column.id) {
        <button
          type="button"
          role="tab"
          [id]="tabId(column.id)"
          [attr.aria-selected]="column.id === selectedColumnId()"
          [attr.aria-controls]="panelId(column.id)"
          [class]="tabClasses(column.id === selectedColumnId())"
          (click)="columnSelected.emit(column.id)"
        >
          <span class="truncate">{{ column.title }}</span>
          <span
            class="shrink-0 rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-slate-400"
          >
            {{ countFor(column.id) }}
          </span>
        </button>
      }
    </div>
  `,
})
export class MobileColumnSwitcherComponent {
  readonly columns = input.required<BoardColumn[]>();
  readonly selectedColumnId = input.required<string>();
  /** Live per-column card counts, keyed by column id. */
  readonly countsByColumnId = input<ReadonlyMap<string, number>>(new Map());

  readonly columnSelected = output<string>();

  protected readonly tabs = computed(() => this.columns());

  protected tabClasses(isSelected: boolean): string {
    const base =
      'flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium ' +
      'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ' +
      'focus-visible:outline-indigo-500';

    return isSelected
      ? `${base} border-indigo-500 bg-indigo-600 text-white`
      : `${base} border-slate-700 bg-slate-800 text-slate-200`;
  }

  protected countFor(columnId: string): number {
    return this.countsByColumnId().get(columnId) ?? 0;
  }

  protected tabId(columnId: string): string {
    return `column-tab-${columnId}`;
  }

  protected panelId(columnId: string): string {
    return `column-panel-${columnId}`;
  }
}
