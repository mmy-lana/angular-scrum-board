import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { IssueActivity, IssueActivityAction } from '../../../../core/models/activity.model';
import { BoardStateService } from '../../../../core/services/board-state.service';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago.pipe';

/** A single activity entry rendered for display. */
interface ActivityEntryView {
  readonly id: string;
  readonly action: IssueActivityAction;
  readonly actorName: string;
  readonly timestamp: string;
  /** Fully resolved sentence describing what happened. */
  readonly description: string;
}

/**
 * Read-only audit trail for an issue, newest first.
 *
 * Activity rows are append-only records written by the store at the moment of
 * each mutation, so the timeline never has to be corrected or deduplicated
 * here — it only has to be phrased in English.
 */
@Component({
  selector: 'app-issue-activity-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TimeAgoPipe],
  template: `
    <section class="flex flex-col gap-3">
      <h3 class="text-sm font-semibold text-slate-100">Activity</h3>

      @if (entries().length === 0) {
        <p
          class="rounded-lg border border-dashed border-slate-700 bg-slate-900 p-4 text-center
            text-sm text-slate-400"
        >
          Nothing has happened to this issue yet.
        </p>
      } @else {
        <ol class="flex flex-col gap-0">
          @for (entry of entries(); track entry.id; let first = $first) {
            <li class="flex gap-3">
              <div class="flex flex-col items-center">
                <span
                  class="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  [class]="markerClasses(entry.action)"
                ></span>
                @if (!first) {
                  <span class="w-px flex-1 bg-slate-700"></span>
                }
              </div>

              <div class="min-w-0 flex-1 pb-4">
                <p class="text-sm text-slate-200">{{ entry.description }}</p>
                <time [attr.datetime]="entry.timestamp" class="text-xs text-slate-400">
                  {{ entry.timestamp | timeAgo }}
                </time>
              </div>
            </li>
          }
        </ol>
      }
    </section>
  `,
})
export class IssueActivityTimelineComponent {
  private readonly board = inject(BoardStateService);

  readonly issueId = input.required<string>();

  protected readonly entries = computed<ActivityEntryView[]>(() =>
    this.board
      .activityForIssue(this.issueId())
      .map((activity) => this.toEntry(activity)),
  );

  private toEntry(activity: IssueActivity): ActivityEntryView {
    return {
      id: activity.id,
      action: activity.action,
      actorName: this.board.userById(activity.actorId)?.name ?? 'Someone',
      timestamp: activity.timestamp,
      description: describe(activity, this.board.userById(activity.actorId)?.name ?? 'Someone'),
    };
  }

  protected markerClasses(action: IssueActivityAction): string {
    switch (action) {
      case 'created':
        return 'bg-indigo-500';
      case 'status_change':
        return 'bg-slate-400';
      case 'assignee_change':
        return 'bg-emerald-500';
      case 'priority_change':
        return 'bg-amber-500';
      case 'commented':
        return 'bg-rose-500';
    }
  }
}

/** Turns an activity row into a readable sentence. */
function describe(activity: IssueActivity, actorName: string): string {
  const { from, to } = activity.details;

  switch (activity.action) {
    case 'created':
      return `${actorName} created this issue${to === undefined ? '' : ` in ${to}`}.`;
    case 'status_change':
      return `${actorName} moved this from ${from ?? 'Unknown'} to ${to ?? 'Unknown'}.`;
    case 'assignee_change':
      return from === null || from === undefined
        ? `${actorName} assigned this to ${to ?? 'nobody'}.`
        : `${actorName} reassigned this from ${from} to ${to ?? 'nobody'}.`;
    case 'priority_change':
      return `${actorName} changed priority from ${from ?? 'unset'} to ${to ?? 'unset'}.`;
    case 'commented':
      return `${actorName} commented.`;
  }
}
