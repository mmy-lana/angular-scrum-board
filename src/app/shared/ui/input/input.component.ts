import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

/** Native input behaviour. */
export type InputType = 'text' | 'search' | 'number' | 'date' | 'email';

/** Guaranteures a unique default `id` so several fields can share a screen. */
let inputSequence = 0;

/**
 * Labelled text field with first-class error and hint states.
 *
 * The component owns the accessibility wiring: the label, the hint and the
 * error message are all linked to the control through `aria-describedby`, and
 * `aria-invalid` tracks the error so a screen reader announces the problem
 * as soon as it appears.
 */
@Component({
  selector: 'app-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label [for]="controlId()" class="block text-xs font-medium text-slate-200">
      {{ label() }}
    </label>

    <input
      [id]="controlId()"
      [type]="type()"
      [value]="value()"
      [placeholder]="placeholder()"
      [disabled]="disabled()"
      [required]="required()"
      [attr.maxlength]="maxLength()"
      [attr.aria-invalid]="error() === null ? null : 'true'"
      [attr.aria-describedby]="describedBy()"
      (input)="handleInput($event)"
      (keydown.enter)="handleEnter()"
      class="mt-1 block w-full min-h-11 rounded-lg border bg-slate-800 px-3 text-sm text-slate-100
        placeholder:text-slate-400 focus:outline-2 focus:outline-offset-2
        focus:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      [class.border-rose-500]="error() !== null"
      [class.border-slate-700]="error() === null"
    />

    @if (hint() !== null && error() === null) {
      <p [id]="hintId()" class="mt-1 text-xs text-slate-400">{{ hint() }}</p>
    }

    @if (error() !== null) {
      <p [id]="errorId()" role="alert" class="mt-1 text-xs text-rose-500">{{ error() }}</p>
    }
  `,
})
export class InputComponent {
  readonly label = input.required<string>();
  readonly value = input('');
  readonly placeholder = input('');
  readonly type = input<InputType>('text');
  readonly hint = input<string | null>(null);
  readonly error = input<string | null>(null);
  readonly disabled = input(false);
  readonly maxLength = input<number | null>(null);
  /** Overrides the generated id when the host needs a stable one. */
  readonly controlId = input(`app-input-${inputSequence++}`);
  readonly required = input(false);

  readonly valueChange = output<string>();
  /** Emits on `Enter`, used by the quick-create and search fields. */
  readonly submitted = output<void>();

  // Description ids derive from the control id so that several instances on
  // one screen never share an `aria-describedby` target.
  protected readonly hintId = computed(() => `${this.controlId()}-hint`);
  protected readonly errorId = computed(() => `${this.controlId()}-error`);

  /**
   * Only the currently visible description is announced, so a resolved error
   * does not leave a stale `aria-describedby` target behind.
   */
  protected readonly describedBy = computed<string | null>(() => {
    if (this.error() !== null) {
      return this.errorId();
    }

    return this.hint() === null ? null : this.hintId();
  });

  protected handleInput(event: Event): void {
    const target = event.target;

    if (target instanceof HTMLInputElement) {
      this.valueChange.emit(target.value);
    }
  }

  protected handleEnter(): void {
    this.submitted.emit();
  }
}
