import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { IssueComment } from '../../../../core/models/issue.model';
import { BoardStateService } from '../../../../core/services/board-state.service';
import { AvatarComponent } from '../../../../shared/ui/avatar/avatar.component';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago.pipe';

/**
 * The comment thread on an issue.
 *
 * Comments are read reactively from the store, so a comment posted here (or
 * anywhere else) appears without this component managing a local copy.
 */
@Component({
  selector: 'app-issue-comments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarComponent, ButtonComponent, TimeAgoPipe],
  template: `
    <section class="flex flex-col gap-3">
      <h3 class="text-sm font-semibold text-slate-100">
        Comments
        @if (comments().length > 0) {
          <span class="text-slate-400">({{ comments().length }})</span>
        }
      </h3>

      @if (comments().length === 0) {
        <p
          class="rounded-lg border border-dashed border-slate-700 bg-slate-900 p-4 text-center
            text-sm text-slate-400"
        >
          No comments yet. Start the discussion below.
        </p>
      } @else {
        <ul class="flex flex-col gap-2">
          @for (comment of comments(); track comment.id) {
            <li class="flex items-start gap-2 rounded-lg border border-slate-700 bg-slate-800 p-3">
              <app-avatar [user]="authorOf(comment)" size="sm" [decorative]="true" />
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline justify-between gap-2">
                  <span class="truncate text-sm font-medium text-slate-100">
                    {{ authorName(comment) }}
                  </span>
                  <time
                    [attr.datetime]="comment.createdAt"
                    class="shrink-0 text-xs text-slate-400"
                  >
                    {{ comment.createdAt | timeAgo }}
                  </time>
                </div>
                <p class="mt-1 whitespace-pre-wrap break-words text-sm text-slate-200">
                  {{ comment.content }}
                </p>
              </div>
            </li>
          }
        </ul>
      }

      <div class="flex flex-col gap-2">
        <label for="comment-input" class="text-xs font-medium text-slate-200">
          Add a comment
        </label>
        <textarea
          id="comment-input"
          rows="3"
          [value]="draft()"
          placeholder="Share an update…"
          class="w-full rounded-lg border border-slate-700 bg-slate-800 p-3 text-sm text-slate-100
            placeholder:text-slate-400 focus:outline-2 focus:outline-offset-2
            focus:outline-indigo-500"
          (input)="handleDraft($event)"
        ></textarea>
        @if (draftError() !== null) {
          <p role="alert" class="text-xs text-rose-500">{{ draftError() }}</p>
        }
        <div class="flex justify-end">
          <app-button
            label="Post comment"
            size="sm"
            [disabled]="draft().trim().length === 0"
            [loading]="isPosting()"
            (click)="post()"
          />
        </div>
      </div>
    </section>
  `,
})
export class IssueCommentsComponent {
  private readonly board = inject(BoardStateService);

  readonly issueId = input.required<string>();

  protected readonly draft = signal('');
  protected readonly draftError = signal<string | null>(null);
  protected readonly isPosting = signal(false);

  protected readonly comments = computed<IssueComment[]>(() =>
    this.board.commentsForIssue(this.issueId()),
  );

  protected authorName(comment: IssueComment): string {
    return this.board.userById(comment.authorId)?.name ?? 'Unknown user';
  }

  protected authorOf(comment: IssueComment) {
    return this.board.userById(comment.authorId);
  }

  protected handleDraft(event: Event): void {
    const target = event.target;

    if (target instanceof HTMLTextAreaElement) {
      this.draft.set(target.value);
      this.draftError.set(null);
    }
  }

  protected async post(): Promise<void> {
    if (this.isPosting()) {
      return;
    }

    if (this.draft().trim().length === 0) {
      this.draftError.set('A comment cannot be empty.');
      return;
    }

    this.isPosting.set(true);

    try {
      const posted = await this.board.addComment(this.issueId(), this.draft());

      if (posted) {
        this.draft.set('');
      } else {
        this.draftError.set(this.board.errorMessage() ?? 'Could not post the comment.');
      }
    } finally {
      this.isPosting.set(false);
    }
  }
}
