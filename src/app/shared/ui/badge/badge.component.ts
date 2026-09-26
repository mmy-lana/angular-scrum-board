import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Semantic colour of a badge. */
export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** Badge sizing ramp. */
export type BadgeSize = 'sm' | 'md';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'border-slate-700 bg-slate-800 text-slate-200',
  info: 'border-indigo-500/40 bg-indigo-500/15 text-indigo-500',
  success: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-500',
  warning: 'border-amber-500/40 bg-amber-500/15 text-amber-500',
  danger: 'border-rose-500/40 bg-rose-500/15 text-rose-500',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'min-h-5 px-1.5 text-[10px]',
  md: 'min-h-6 px-2 text-xs',
};

/**
 * Compact status pill used for issue priorities, column statuses and sprint
 * states. Rendered as a `<span>` rather than a `<div>` so it is valid inside
 * the inline text of a card.
 */
@Component({
  selector: 'app-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      [class]="badgeClasses()"
      [attr.title]="label()"
    >
      {{ label() }}
    </span>
  `,
})
export class BadgeComponent {
  readonly label = input.required<string>();
  readonly tone = input<BadgeTone>('neutral');
  readonly size = input<BadgeSize>('md');

  protected readonly badgeClasses = computed<string>(() => {
    const base =
      'inline-flex items-center gap-1 rounded-full border font-medium uppercase tracking-wide ' +
      'leading-none whitespace-nowrap';

    return `${base} ${TONE_CLASSES[this.tone()]} ${SIZE_CLASSES[this.size()]}`;
  });
}
