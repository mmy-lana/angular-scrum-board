import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  input,
  output,
} from '@angular/core';

import { ButtonComponent } from '../button/button.component';

/** Presentation of the overlay: a centred dialog or a bottom sheet. */
export type ModalVariant = 'dialog' | 'sheet';

/**
 * Accessible overlay primitive.
 *
 * Handles the three things every overlay in the application needs and none
 * should re-implement: a focus trap that captures focus on open and restores
 * it on close, dismissal on backdrop click and on `Escape`, and a viewport
 * constraint that keeps tall content scrollable instead of clipped.
 */
@Component({
  selector: 'app-modal-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkTrapFocus, ButtonComponent],
  template: `
    <div
      class="fixed inset-0 z-50 flex justify-center"
      [class.items-end]="variant() === 'sheet'"
      [class.items-center]="variant() === 'dialog'"
    >
      <div
        class="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        (click)="handleBackdropClick()"
      ></div>

      <div
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        [class]="panelClasses()"
      >
        <header class="flex items-start justify-between gap-3">
          <h2 [id]="titleId" class="min-w-0 flex-1 truncate text-base font-semibold text-slate-100">
            {{ title() }}
          </h2>
          <app-button
            label="Close dialog"
            variant="secondary"
            size="sm"
            [iconOnly]="true"
            (click)="requestClose()"
          >
            <svg
              buttonIcon
              class="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </app-button>
        </header>

        <div class="min-h-0 flex-1">
          <ng-content />
        </div>

        <footer class="flex flex-wrap items-center justify-end gap-2">
          <ng-content select="[modalFooter]" />
        </footer>
      </div>
    </div>
  `,
})
export class ModalShellComponent {
  readonly title = input.required<string>();
  readonly variant = input<ModalVariant>('dialog');
  /** Disables backdrop dismissal for flows that must be resolved explicitly. */
  readonly dismissOnBackdropClick = input(true);

  readonly closed = output<void>();

  /** Stable id used to wire `aria-labelledby` to the rendered heading. */
  protected readonly titleId = 'modal-shell-title';

  protected readonly panelClasses = computed<string>(() => {
    const base =
      'relative flex w-full flex-col gap-4 bg-slate-900 p-4 shadow-2xl ' +
      'max-h-[80vh] overflow-y-auto';

    return this.variant() === 'sheet'
      ? `${base} rounded-t-xl border-t border-slate-700`
      : `${base} rounded-xl border border-slate-700 sm:max-w-lg`;
  });

  @HostListener('document:keydown.escape')
  protected handleEscape(): void {
    this.requestClose();
  }

  protected handleBackdropClick(): void {
    if (this.dismissOnBackdropClick()) {
      this.requestClose();
    }
  }

  protected requestClose(): void {
    this.closed.emit();
  }
}
