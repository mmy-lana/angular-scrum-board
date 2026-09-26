import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { IssuePriority } from '../../core/models/issue.model';

/**
 * Colour ramp for priority. Only the tokens declared in the `@theme` block of
 * `styles.css` are used, so this never references an undefined utility.
 */
const PRIORITY_CLASSES: Record<IssuePriority, string> = {
  urgent: 'text-rose-500',
  high: 'text-amber-500',
  medium: 'text-indigo-500',
  low: 'text-slate-400',
  lowest: 'text-slate-600',
};

const PRIORITY_LABELS: Record<IssuePriority, string> = {
  urgent: 'Urgent priority',
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
  lowest: 'Lowest priority',
};

/**
 * Chevron-based priority indicator.
 *
 * Drawn with `currentColor` so a single colour class drives the whole glyph.
 * The icon is sized `w-4 h-4 shrink-0` so it survives the compact card layout
 * described in the mobile density rules.
 */
@Component({
  selector: 'app-priority-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex shrink-0',
  },
  template: `
    <svg
      [class]="iconClasses()"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.aria-hidden]="decorative() ? 'true' : null"
      [attr.aria-label]="decorative() ? null : accessibleLabel()"
      [attr.role]="decorative() ? 'presentation' : 'img'"
    >
      @switch (priority()) {
        @case ('urgent') {
          <path d="M8 6.5V1.5" />
          <path d="M4.5 4.5 8 1l3.5 3.5" />
          <path d="M8 14.5V9.5" />
          <path d="M4.5 12.5 8 16l3.5-3.5" />
        }
        @case ('high') {
          <path d="M8 14V2" />
          <path d="M3.5 6.5 8 2l4.5 4.5" />
        }
        @case ('medium') {
          <path d="M3 8h10" />
        }
        @case ('low') {
          <path d="M8 2v12" />
          <path d="M3.5 9.5 8 14l4.5-4.5" />
        }
        @case ('lowest') {
          <path d="M8 2v5" />
          <path d="M4.5 3.5 8 8l3.5-4.5" />
          <path d="M8 9v5" />
          <path d="M4.5 10.5 8 15l3.5-4.5" />
        }
      }
    </svg>
  `,
})
export class PriorityIconComponent {
  readonly priority = input.required<IssuePriority>();
  /** Hides the icon from assistive technology when the text already conveys it. */
  readonly decorative = input(false);

  protected readonly iconClasses = computed<string>(
    () => `h-4 w-4 shrink-0 ${PRIORITY_CLASSES[this.priority()]}`,
  );

  protected readonly accessibleLabel = computed<string>(
    () => PRIORITY_LABELS[this.priority()],
  );
}
