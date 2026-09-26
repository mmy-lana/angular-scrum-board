import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';

import { ISSUE_PRIORITIES, Issue, IssuePriority } from '../../../../core/models/issue.model';
import { User } from '../../../../core/models/user.model';
import { BoardStateService } from '../../../../core/services/board-state.service';
import { PriorityIconComponent } from '../../../../shared/icons/priority-icon.component';
import { TypeIconComponent } from '../../../../shared/icons/type-icon.component';
import { AvatarComponent } from '../../../../shared/ui/avatar/avatar.component';
import { BadgeComponent } from '../../../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';
import { ModalShellComponent } from '../../../../shared/ui/modal/modal-shell.component';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago.pipe';
import { IssueActivityTimelineComponent } from '../../components/issue-activity-timeline/issue-activity-timeline.component';
import { IssueCommentsComponent } from '../../components/issue-comments/issue-comments.component';

/** An issue joined with the display names the dialog needs. */
interface IssueDetailView extends Issue {
  readonly statusLabel: string;
  readonly assignee: User | null;
  readonly reporterName: string;
}

/**
 * Full editing surface for a single issue: editable metadata, the comment
 * thread and the activity trail.
 *
 * Field edits are version-guarded by the store: saving writes through the
 * optimistic-concurrency check, and a conflict surfaces as a message rather
 * than silently overwriting someone else's change.
 */
@Component({
  selector: 'app-issue-detail-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    IssueActivityTimelineComponent,
    IssueCommentsComponent,
    ModalShellComponent,
    PriorityIconComponent,
    TypeIconComponent,
    TimeAgoPipe,
  ],
  template: `
    @if (view(); as current) {
      <app-modal-shell [title]="current.key" (closed)="closed.emit()">
        <div class="flex flex-col gap-4">
          <div class="flex flex-wrap items-center gap-2">
            <app-type-icon [type]="current.type" />
            <app-priority-icon [priority]="current.priority" />
            <app-badge [label]="current.type" tone="info" size="sm" />
            <app-badge [label]="current.statusLabel" tone="neutral" size="sm" />
            <span class="text-xs text-slate-400">
              Updated {{ current.updatedAt | timeAgo }}
            </span>
          </div>

          <h3 class="text-lg font-semibold text-slate-100">{{ current.title }}</h3>

          <p class="whitespace-pre-wrap text-sm text-slate-300">
            {{ current.description.length > 0 ? current.description : 'No description provided.' }}
          </p>

          <dl class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div class="flex flex-col gap-1">
              <label for="detail-status" class="text-xs font-medium text-slate-200">Status</label>
              <select
                id="detail-status"
                [value]="current.statusId"
                class="min-h-11 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm
                  text-slate-100 focus:outline-2 focus:outline-offset-2 focus:outline-indigo-500"
                (change)="onStatusChange($event)"
              >
                @for (column of board.columnsSorted(); track column.id) {
                  <option [value]="column.id">{{ column.title }}</option>
                }
              </select>
            </div>

            <div class="flex flex-col gap-1">
              <label for="detail-priority" class="text-xs font-medium text-slate-200">
                Priority
              </label>
              <select
                id="detail-priority"
                [value]="current.priority"
                class="min-h-11 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm
                  capitalize text-slate-100 focus:outline-2 focus:outline-offset-2
                  focus:outline-indigo-500"
                (change)="onPriorityChange($event)"
              >
                @for (priority of ISSUE_PRIORITIES; track priority) {
                  <option [value]="priority">{{ priority }}</option>
                }
              </select>
            </div>

            <div class="flex flex-col gap-1">
              <label for="detail-assignee" class="text-xs font-medium text-slate-200">
                Assignee
              </label>
              <select
                id="detail-assignee"
                [value]="current.assigneeId ?? ''"
                class="min-h-11 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm
                  text-slate-100 focus:outline-2 focus:outline-offset-2 focus:outline-indigo-500"
                (change)="onAssigneeChange($event)"
              >
                <option value="">Unassigned</option>
                @for (user of assignableUsers(); track user.id) {
                  <option [value]="user.id">{{ user.name }}</option>
                }
              </select>
            </div>

            <div class="flex flex-col gap-1">
              <label for="detail-points" class="text-xs font-medium text-slate-200">
                Story points
              </label>
              <input
                id="detail-points"
                type="number"
                min="0"
                step="1"
                [value]="current.storyPoints ?? ''"
                class="min-h-11 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm
                  text-slate-100 focus:outline-2 focus:outline-offset-2 focus:outline-indigo-500"
                (change)="onStoryPointsChange($event)"
              />
            </div>
          </dl>

          <div class="flex items-center gap-2 border-t border-slate-700 pt-3">
            <app-avatar [user]="current.assignee" size="md" [decorative]="true" />
            <div class="min-w-0">
              <p class="truncate text-sm text-slate-100">
                {{ current.assignee?.name ?? 'Unassigned' }}
              </p>
              <p class="truncate text-xs text-slate-400">
                Reported by {{ current.reporterName }}
              </p>
            </div>
          </div>

          @if (board.errorMessage(); as message) {
            <p
              role="alert"
              class="rounded-lg border border-rose-500 bg-rose-500/10 px-3 py-2 text-sm
                text-rose-500"
            >
              {{ message }}
            </p>
          }

          <app-issue-comments [issueId]="current.id" />

          <app-issue-activity-timeline [issueId]="current.id" />
        </div>

        <ng-container modalFooter>
          <app-button
            label="Share via WhatsApp"
            variant="secondary"
            size="sm"
            (click)="shareToWhatsApp()"
          />

          <app-button
            [label]="copyLabel()"
            variant="secondary"
            size="sm"
            (click)="copySummary()"
          />

          <app-button
            label="Delete issue"
            variant="danger"
            size="sm"
            [loading]="isDeleting()"
            (click)="requestDelete()"
          />

          <app-button
            label="Close"
            variant="secondary"
            (click)="closed.emit()"
          />
        </ng-container>
      </app-modal-shell>

      @if (confirmingDelete()) {
        <app-modal-shell
          title="Delete this issue?"
          [dismissOnBackdropClick]="false"
          (closed)="confirmingDelete.set(false)"
        >
          <p class="text-sm text-slate-300">
            Deleting <strong class="text-slate-100">{{ current.key }}</strong> also removes its
            comments and activity history. This cannot be undone.
          </p>

          <ng-container modalFooter>
            <app-button
              label="Cancel"
              variant="secondary"
              (click)="confirmingDelete.set(false)"
            />
            <app-button
              label="Delete permanently"
              variant="danger"
              [loading]="isDeleting()"
              (click)="confirmDelete()"
            />
          </ng-container>
        </app-modal-shell>
      }
    }
  `,
})
export class IssueDetailModalComponent {
  protected readonly board = inject(BoardStateService);

  readonly issueId = input.required<string>();

  readonly closed = output<void>();

  protected readonly ISSUE_PRIORITIES = ISSUE_PRIORITIES;
  protected readonly confirmingDelete = signal(false);
  protected readonly isDeleting = signal(false);

  /** The issue joined with display names, or `null` if it was deleted. */
  protected readonly view = computed<IssueDetailView | null>(() => {
    const issue = this.board.issueById(this.issueId());

    if (issue === null) {
      return null;
    }

    return {
      ...issue,
      statusLabel: this.board.columnTitleById(issue.statusId),
      assignee: this.board.userById(issue.assigneeId),
      reporterName: this.board.userById(issue.reporterId)?.name ?? 'Unknown user',
    };
  });

  protected readonly assignableUsers = computed(() =>
    this.board.users().filter((user) => user.role !== 'viewer'),
  );

  protected onStatusChange(event: Event): void {
    const value = readValue(event);

    if (value.length > 0) {
      void this.board.updateIssue(this.issueId(), { statusId: value });
    }
  }

  protected onPriorityChange(event: Event): void {
    const value = readValue(event) as IssuePriority;

    if (value.length > 0) {
      void this.board.updateIssue(this.issueId(), { priority: value });
    }
  }

  protected onAssigneeChange(event: Event): void {
    const value = readValue(event);
    void this.board.updateIssue(this.issueId(), {
      assigneeId: value.length === 0 ? null : value,
    });
  }

  protected onStoryPointsChange(event: Event): void {
    const raw = readValue(event).trim();

    if (raw.length === 0) {
      void this.board.updateIssue(this.issueId(), { storyPoints: null });
      return;
    }

    const parsed = Number.parseInt(raw, 10);

    if (Number.isNaN(parsed) || parsed < 0) {
      this.board.dismissError();
      return;
    }

    void this.board.updateIssue(this.issueId(), { storyPoints: parsed });
  }

  /**
   * Renders the issue as Markdown for pasting into a ticket, a chat or a PR.
   *
   * The status is resolved to its column title here rather than exported as an
   * id, because the recipient has no way to look up what `col-in-progress-2`
   * means.
   */
  protected getFormattedSummary(): string {
    const current = this.view();

    if (current === null) {
      return '';
    }

    const facts = [
      `**Status:** ${current.statusLabel}`,
      `**Priority:** ${current.priority}`,
      `**Type:** ${current.type}`,
      `**Assignee:** ${current.assignee?.name ?? 'Unassigned'}`,
      `**Points:** ${current.storyPoints ?? 'Unestimated'}`,
    ];

    const description =
      current.description.trim().length > 0
        ? current.description.trim()
        : '_No description provided._';

    return [`### [${current.key}] ${current.title}`, '', ...facts, '', description].join('\n');
  }

  protected readonly copyState = signal<'idle' | 'copied' | 'failed'>('idle');

  protected readonly copyLabel = computed<string>(() => {
    switch (this.copyState()) {
      case 'copied':
        return 'Copied';
      case 'failed':
        return 'Copy failed';
      default:
        return 'Copy summary';
    }
  });

  /**
   * Copies the Markdown summary, reporting the outcome rather than assuming it.
   *
   * The async clipboard API is unavailable outside a secure context and can be
   * refused by permission policy, so the legacy `execCommand` path stays as a
   * fallback. Either way the user gets a visible result.
   */
  protected async copySummary(): Promise<void> {
    const text = this.getFormattedSummary();

    if (text.length === 0) {
      return;
    }

    const written = await writeToClipboard(text);

    this.copyState.set(written ? 'copied' : 'failed');

    // Returns the label to its resting state so the button is not stuck
    // advertising a copy that has since scrolled out of relevance.
    setTimeout(() => this.copyState.set('idle'), 2500);
  }

  /**
   * Opens WhatsApp with the summary pre-filled.
   *
   * `wa.me` is used rather than a raw `https://api.whatsapp.com/send` so the
   * recipient number can be chosen in the same flow.
   */
  protected shareToWhatsApp(): void {
    const text = this.getFormattedSummary();

    if (text.length === 0) {
      return;
    }

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  protected requestDelete(): void {
    this.confirmingDelete.set(true);
  }

  protected async confirmDelete(): Promise<void> {
    if (this.isDeleting()) {
      return;
    }

    this.isDeleting.set(true);

    try {
      if (await this.board.deleteIssue(this.issueId())) {
        this.confirmingDelete.set(false);
        this.closed.emit();
      }
    } finally {
      this.isDeleting.set(false);
    }
  }
}

/** Reads the value of a native form control, or an empty string. */
function readValue(event: Event): string {
  const target = event.target;

  if (target instanceof HTMLSelectElement || target instanceof HTMLInputElement) {
    return target.value;
  }

  return '';
}

/**
 * Puts text on the system clipboard, reporting whether it actually landed.
 *
 * `navigator.clipboard` needs a secure context and a granted permission, so a
 * hidden textarea plus `execCommand` remains the fallback. Both paths return a
 * boolean instead of rejecting, because a refusal here is a UI state to show,
 * not an error to propagate.
 */
async function writeToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText !== undefined) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path rather than surfacing the failure yet.
    }
  }

  try {
    const staging = document.createElement('textarea');
    staging.value = text;
    staging.setAttribute('readonly', '');
    staging.className = 'fixed -top-0 -left-0 h-px w-px opacity-0';
    document.body.appendChild(staging);
    staging.select();

    const copied = document.execCommand('copy');
    staging.remove();

    return copied;
  } catch {
    return false;
  }
}
