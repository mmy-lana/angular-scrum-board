import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { IssueType } from '../../core/models/issue.model';

const TYPE_CLASSES: Record<IssueType, string> = {
  story: 'text-indigo-500',
  bug: 'text-rose-500',
  task: 'text-emerald-500',
  epic: 'text-amber-500',
};

const TYPE_LABELS: Record<IssueType, string> = {
  story: 'Story',
  bug: 'Bug',
  task: 'Task',
  epic: 'Epic',
};

/**
 * Glyph indicating the agile classification of an issue: a book for stories,
 * a bug for defects, a checklist for tasks and a bolt for epics.
 */
@Component({
  selector: 'app-type-icon',
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
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.aria-hidden]="decorative() ? 'true' : null"
      [attr.aria-label]="decorative() ? null : accessibleLabel()"
      [attr.role]="decorative() ? 'presentation' : 'img'"
    >
      @switch (type()) {
        @case ('story') {
          <path d="M2.5 3.5A1.5 1.5 0 0 1 4 2h3.5v11H4A1.5 1.5 0 0 0 2.5 14.5z" />
          <path d="M13.5 3.5A1.5 1.5 0 0 0 12 2H8.5v11H12a1.5 1.5 0 0 1 1.5 1.5z" />
        }
        @case ('bug') {
          <rect x="5" y="5.5" width="6" height="8" rx="3" />
          <path d="M5 9H2.5M14 9h-2.5M5 12.5H2.5M14 12.5h-2.5" />
          <path d="M8 5.5V3" />
        }
        @case ('task') {
          <path d="M2.5 4.5 4 6l2.5-2.5" />
          <path d="M2.5 9.5 4 11l2.5-2.5" />
          <path d="M8.5 4.5h5M8.5 9.5h5" />
        }
        @case ('epic') {
          <path d="M9 1.5 3.5 9H7l-1 5.5L12.5 7H9z" />
        }
      }
    </svg>
  `,
})
export class TypeIconComponent {
  readonly type = input.required<IssueType>();
  /** Hides the icon from assistive technology when the text already conveys it. */
  readonly decorative = input(false);

  protected readonly iconClasses = computed<string>(
    () => `h-4 w-4 shrink-0 ${TYPE_CLASSES[this.type()]}`,
  );

  protected readonly accessibleLabel = computed<string>(() => TYPE_LABELS[this.type()]);
}
