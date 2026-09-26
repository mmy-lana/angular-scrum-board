import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/** Visual weight of a button. */
export type ButtonVariant = 'primary' | 'secondary' | 'danger';

/** Button sizing ramp. Every size keeps a 44px minimum touch height. */
export type ButtonSize = 'sm' | 'md' | 'lg';

/** Native button behaviour. */
export type ButtonType = 'button' | 'submit' | 'reset';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-600',
  secondary:
    'border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700 active:bg-slate-800',
  danger: 'bg-rose-500 text-white hover:bg-rose-500/85 active:bg-rose-500',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'min-h-11 gap-1.5 px-3 text-xs',
  md: 'min-h-11 gap-2 px-4 text-sm',
  lg: 'min-h-12 gap-2 px-5 text-base',
};

/**
 * The single interactive primitive for the board.
 *
 * The visible label is a required input rather than projected content, which
 * guarantees every button carries an accessible name. An optional leading icon
 * is projected through a `[buttonIcon]` slot for icon-only cases.
 */
@Component({
  selector: 'app-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      [type]="buttonType()"
      [class]="buttonClasses()"
      [disabled]="disabled() || loading()"
      [attr.aria-busy]="loading()"
      [attr.aria-pressed]="pressedAttribute()"
      (click)="handleClick()"
    >
      @if (loading()) {
        <svg
          class="h-4 w-4 shrink-0 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
          />
        </svg>
      } @else {
        <ng-content select="[buttonIcon]" />
      }
      <span [class.sr-only]="iconOnly()" class="truncate">{{ label() }}</span>
    </button>
  `,
})
export class ButtonComponent {
  /** Visible text, or the accessible name when `iconOnly` is set. */
  readonly label = input.required<string>();
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly buttonType = input<ButtonType>('button');
  readonly disabled = input(false);
  /** Swaps the leading icon for a spinner and blocks interaction. */
  readonly loading = input(false);
  /** Visually hides the label while keeping it available to screen readers. */
  readonly iconOnly = input(false);
  /** When set, the button becomes a toggle and reports state changes. */
  readonly pressed = input<boolean | null>(null);

  readonly pressedChange = output<boolean>();

  protected readonly buttonClasses = computed<string>(() => {
    const base =
      'inline-flex items-center justify-center rounded-lg font-medium transition-colors ' +
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ' +
      'disabled:cursor-not-allowed disabled:opacity-50';

    return `${base} ${VARIANT_CLASSES[this.variant()]} ${SIZE_CLASSES[this.size()]}`;
  });

  /** `null` keeps `aria-pressed` off the element for non-toggle buttons. */
  protected readonly pressedAttribute = computed<string | null>(() => {
    const pressed = this.pressed();
    return pressed === null ? null : String(pressed);
  });

  protected handleClick(): void {
    const pressed = this.pressed();

    if (pressed !== null) {
      this.pressedChange.emit(!pressed);
    }
  }
}
