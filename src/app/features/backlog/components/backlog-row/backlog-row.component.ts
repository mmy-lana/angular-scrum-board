import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { Issue, IssuePriority } from '../../../../core/models/issue.model';
import { User } from '../../../../core/models/user.model';
import { PriorityIconComponent } from '../../../../shared/icons/priority-icon.component';
import { TypeIconComponent } from '../../../../shared/icons/type-icon.component';
import { AvatarComponent } from '../../../../shared/ui/avatar/avatar.component';
import { BadgeComponent, BadgeTone } from '../../../../shared/ui/badge/badge.component';

const PRIORITY_TONES: Record<IssuePriority, BadgeTone> = {
  urgent: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'neutral',
  lowest: 'neutral',
};

/**
 * One line of the backlog table.
 *
 * The same component serves two very different viewports: a fixed grid of
 * columns from 768px up, and a stacked card below it. Rather than branching
 * the DOM in JavaScript, the layout is expressed once as a grid whose columns
 * collapse to a single flexible track under `md`.
 *
 * The interactive element is a real `<button>` so the row is reachable and
 * operable from the keyboard for free. `<button>` only permits phrasing
 * content, so the grid is a `<span>` styled with `display: grid`.
 */
@Component({
  selector: 'app-backlog-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarComponent, BadgeComponent, PriorityIconComponent, TypeIconComponent],
  template: `
    <button
      type="button"
      class="block w-full rounded-lg border border-transparent px-3 py-2 text-left
        transition-colors hover:border-slate-700 hover:bg-slate-800
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
      (click)="opened.emit(issue().id)"
    >
      <span
        class="grid grid-cols-1 items-center gap-2 md:grid-cols-[6rem_minmax(0,1fr)_9rem_4rem_4rem] md:gap-4"
      >
        <span class="flex items-center gap-1.5">
          <span class="font-mono text-xs text-slate-400">{{ issue().key }}</span>
          <app-type-icon [type]="issue().type" [decorative]="true" />
        </span>

        <span class="min-w-0 truncate text-sm text-slate-100">{{ issue().title }}</span>

        <span class="flex items-center gap-1.5">
          <app-priority-icon [priority]="issue().priority" [decorative]="true" />
          <app-badge [label]="issue().priority" [tone]="PRIORITY_TONES[issue().priority]" size="sm" />
        </span>

        <span
          class="inline-flex min-h-6 min-w-6 items-center justify-center self-start rounded-md
            bg-slate-800 px-1.5 text-xs font-medium text-slate-400 md:self-auto"
        >
          {{ issue().storyPoints ?? '—' }}
        </span>

        <app-avatar [user]="assignee()" size="xs" [decorative]="true" />
      </span>
    </button>
  `,
})
export class BacklogRowComponent {
  readonly issue = input.required<Issue>();
  /** `null` renders the initials placeholder rather than a broken avatar. */
  readonly assignee = input<User | null>(null);

  readonly opened = output<string>();

  protected readonly PRIORITY_TONES = PRIORITY_TONES;
}
