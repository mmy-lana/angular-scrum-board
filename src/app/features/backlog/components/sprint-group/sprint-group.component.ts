import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { Issue } from '../../../../core/models/issue.model';
import { User } from '../../../../core/models/user.model';
import { BadgeComponent } from '../../../../shared/ui/badge/badge.component';
import { BacklogRowComponent } from '../backlog-row/backlog-row.component';

/**
 * One sprint's backlog: a header carrying its rollups, and a collapsible list
 * of the issues assigned to it.
 *
 * A finished sprint starts collapsed because its contents are history, while
 * the sprint in flight starts expanded so the current work is visible on
 * arrival. Once the user toggles a group their choice wins.
 */
@Component({
  selector: 'app-sprint-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BacklogRowComponent, BadgeComponent],
  template: `
    <section class="overflow-hidden rounded-xl border bg-slate-900" [class]="frameClasses()">
      <h3>
        <button
          type="button"
          class="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-800
            focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-500"
          [attr.aria-expanded]="expanded()"
          [attr.aria-controls]="listId()"
          (click)="toggle()"
        >
          <span
            aria-hidden="true"
            class="shrink-0 text-slate-400 transition-transform"
            [class.rotate-90]="expanded()"
          >
            &#9656;
          </span>

          <span class="min-w-0 flex-1">
            <span class="flex flex-wrap items-center gap-2">
              <span class="truncate text-sm font-semibold text-slate-100">{{ title() }}</span>
              @if (isActive()) {
                <app-badge label="Active" tone="info" size="sm" />
              } @else if (isCompleted()) {
                <app-badge label="Completed" tone="success" size="sm" />
              }
            </span>
            @if (goal().length > 0) {
              <span class="mt-0.5 block truncate text-xs text-slate-400">{{ goal() }}</span>
            }
          </span>

          <span class="shrink-0 text-right">
            <span class="block text-sm font-medium text-slate-100">
              {{ completedPoints() }} / {{ totalPoints() }} pts
            </span>
            <span class="block text-xs text-slate-400">{{ issues().length }} issues</span>
          </span>
        </button>
      </h3>

      <div
        class="h-1 w-full bg-slate-800"
        role="progressbar"
        [attr.aria-valuenow]="progressPercent()"
        aria-valuemin="0"
        aria-valuemax="100"
        [attr.aria-label]="'Progress for ' + title()"
      >
        <div class="h-full bg-indigo-500" [style.width.%]="progressPercent()"></div>
      </div>

      <div [id]="listId()">
        @if (expanded()) {
          @if (issues().length === 0) {
            <p class="p-4 text-sm text-slate-400">No issues in this sprint yet.</p>
          } @else {
            <ul class="flex flex-col gap-1 p-2">
              @for (issue of issues(); track issue.id) {
                <li>
                  <app-backlog-row
                    [issue]="issue"
                    [assignee]="usersById().get(issue.assigneeId ?? '') ?? null"
                    (opened)="issueOpened.emit($event)"
                  />
                </li>
              }
            </ul>
          }
        }
      </div>
    </section>
  `,
})
export class SprintGroupComponent {
  /** Stable identifier, used to build the toggle's `aria-controls` target. */
  readonly groupId = input.required<string>();
  readonly title = input.required<string>();
  readonly goal = input('');
  readonly issues = input.required<Issue[]>();
  readonly usersById = input.required<ReadonlyMap<string, User>>();
  readonly completedPoints = input(0);
  readonly totalPoints = input(0);
  readonly isActive = input(false);
  readonly isCompleted = input(false);

  readonly issueOpened = output<string>();

  /** `null` until the user toggles, at which point their choice is final. */
  private readonly userChoice = signal<boolean | null>(null);

  protected readonly expanded = computed(() => this.userChoice() ?? !this.isCompleted());

  protected readonly progressPercent = computed(() => {
    const total = this.totalPoints();

    return total === 0 ? 0 : Math.round((this.completedPoints() / total) * 100);
  });

  protected frameClasses(): string {
    return this.isCompleted() ? 'border-slate-700' : 'border-indigo-500/40';
  }

  protected listId(): string {
    return `sprint-group-list-${this.groupId()}`;
  }

  protected toggle(): void {
    this.userChoice.set(!this.expanded());
  }
}
