import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { Issue } from '../../../../core/models/issue.model';
import { ViewDensity } from '../../../../core/models/filter.model';
import { User } from '../../../../core/models/user.model';
import { PriorityIconComponent } from '../../../../shared/icons/priority-icon.component';
import { TypeIconComponent } from '../../../../shared/icons/type-icon.component';
import { AvatarComponent } from '../../../../shared/ui/avatar/avatar.component';

/**
 * A single draggable work item.
 *
 * Density is a hard requirement rather than a nicety: on a 360px viewport the
 * compact layout keeps roughly four cards visible per screen by collapsing to
 * a single truncated line, while comfortable density is used from 768px up.
 *
 * The whole card is the hit target, because a title-sized button is a poor
 * target on touch and a card is expected to open where it is tapped. That
 * rules out marking the card itself as a button, which would nest the move
 * control inside a button role. Instead the card is a focusable article that
 * responds to Enter and Space, and the two gestures that mean something other
 * than "open this" — dragging and the move sheet — stop their clicks from
 * reaching it.
 */
@Component({
  selector: 'app-issue-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarComponent, PriorityIconComponent, TypeIconComponent, CdkDragHandle],
  host: {
    // A drop is followed by a click on whatever was under the pointer, which
    // would otherwise open the card the user just moved somewhere else.
    '(cdkDragStarted)': 'setDragging(true)',
    '(cdkDragEnded)': 'setDragging(false)',
  },
  template: `
    <article
      tabindex="0"
      [class]="containerClasses()"
      [attr.aria-label]="accessibleLabel()"
      (click)="open()"
      (keydown.enter)="open()"
      (keydown.space)="openFromSpace($event)"
    >
      <div class="flex items-start gap-2">
        <div class="flex min-w-0 flex-1 items-center gap-1.5">
          <span class="font-mono text-xs text-slate-400">{{ issue().key }}</span>
          <app-type-icon [type]="issue().type" [decorative]="true" />
          <app-priority-icon [priority]="issue().priority" [decorative]="true" />
        </div>

        <div class="flex shrink-0 items-center gap-1">
          @if (showMoveControl()) {
            <button
              type="button"
              class="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400
                hover:bg-slate-700 hover:text-slate-100 focus-visible:outline-2
                focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
              [attr.aria-label]="'Move ' + issue().key + ' without dragging'"
              (click)="requestMove($event)"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M2.5 5.5h11M2.5 10.5h11" />
                <path d="M5.5 3 3 5.5 2.5 6M10.5 8l2.5 2.5-2.5 2.5" />
              </svg>
            </button>
          }

          <span
            cdkDragHandle
            (click)="$event.stopPropagation()"
            class="flex min-h-11 min-w-11 cursor-grab touch-none items-center justify-center
              rounded-lg text-slate-400 hover:bg-slate-700 hover:text-slate-100 active:cursor-grabbing
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            [attr.aria-label]="'Drag ' + issue().key + ' to reorder'"
          >
            <svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <circle cx="6" cy="4" r="1.3" />
              <circle cx="10" cy="4" r="1.3" />
              <circle cx="6" cy="8" r="1.3" />
              <circle cx="10" cy="8" r="1.3" />
              <circle cx="6" cy="12" r="1.3" />
              <circle cx="10" cy="12" r="1.3" />
            </svg>
          </span>
        </div>
      </div>

      <p [class]="titleClasses()">
        {{ issue().title }}
      </p>

      <div class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2">
          @if (issue().storyPoints !== null) {
            <span
              class="inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-md
                bg-slate-900 px-1.5 text-xs font-medium text-slate-400"
              [attr.aria-label]="issue().storyPoints + ' story points'"
            >
              {{ issue().storyPoints }}
            </span>
          }

          @if (showTags()) {
            @for (tag of issue().tags; track tag) {
              <span class="truncate text-[10px] text-slate-400">#{{ tag }}</span>
            }
          }
        </div>

        <app-avatar [user]="assignee()" size="xs" [decorative]="true" />
      </div>
    </article>
  `,
})
export class IssueCardComponent {
  readonly issue = input.required<Issue>();
  /** `null` renders the initials placeholder rather than a broken avatar. */
  readonly assignee = input<User | null>(null);
  readonly density = input<ViewDensity>('comfortable');
  /** Surfaces the move affordance, which replaces dragging on touch devices. */
  readonly showMoveControl = input(false);

  readonly opened = output<string>();
  readonly moveRequested = output<string>();

  protected readonly isCompact = computed(() => this.density() === 'compact');

  /**
   * Suppresses the click that follows a drag. The flag is only ever read
   * inside {@link open}, so a missed reset costs one un-openable card rather
   * than a stuck drag.
   */
  private readonly dragging = signal(false);

  protected readonly containerClasses = computed<string>(() => {
    const base =
      'flex w-full cursor-pointer flex-col rounded-lg border border-slate-700 bg-slate-800 ' +
      'text-left shadow-sm transition-colors hover:border-slate-600 ' +
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ' +
      'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-indigo-500';

    return `${base} ${this.isCompact() ? 'gap-1.5 p-3' : 'gap-2 p-3'}`;
  });

  /**
   * Compact collapses the title to one truncated line; comfortable allows two
   * clamped lines, which is enough for most titles without letting a single
   * card grow arbitrarily tall.
   */
  protected readonly titleClasses = computed<string>(() => {
    const base = 'w-full text-left text-sm font-medium text-slate-100 hover:text-white';

    return this.isCompact() ? `${base} truncate` : `${base} line-clamp-2`;
  });

  /** Tags are the first thing dropped when space is tight. */
  protected readonly showTags = computed(() => !this.isCompact());

  protected readonly accessibleLabel = computed<string>(() => {
    const issue = this.issue();
    const points = issue.storyPoints === null ? '' : `, ${issue.storyPoints} story points`;

    return `${issue.key}: ${issue.title}${points}`;
  });

  /** Opens the detail view. The card surface, the title and Enter all land here. */
  protected open(): void {
    if (this.dragging()) {
      return;
    }

    this.opened.emit(this.issue().id);
  }

  /**
   * Space is the other activation key, but it also scrolls. On a card that is
   * a reasonable way to move the page, so the default is suppressed.
   */
  protected openFromSpace(event: Event): void {
    event.preventDefault();
    this.open();
  }

  protected setDragging(dragging: boolean): void {
    this.dragging.set(dragging);
  }

  /** Opens the move sheet, the touch equivalent of dragging. */
  protected requestMove(event: Event): void {
    event.stopPropagation();
    this.moveRequested.emit(this.issue().id);
  }
}
