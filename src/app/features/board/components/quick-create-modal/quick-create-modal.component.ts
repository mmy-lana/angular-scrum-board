import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { BoardColumn } from '../../../../core/models/column.model';
import {
  ISSUE_PRIORITIES,
  ISSUE_TYPES,
  IssuePriority,
  IssueType,
} from '../../../../core/models/issue.model';
import { Sprint } from '../../../../core/models/sprint.model';
import { User } from '../../../../core/models/user.model';
import { BoardStateService } from '../../../../core/services/board-state.service';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';
import { InputComponent } from '../../../../shared/ui/input/input.component';
import { ModalShellComponent } from '../../../../shared/ui/modal/modal-shell.component';

/** Story point values offered as quick chips. */
const STORY_POINT_CHOICES: readonly number[] = [1, 2, 3, 5, 8, 13];

/**
 * Fast path for adding work: a title plus the few fields that must be decided
 * at creation time.
 *
 * Type and priority can be pre-seeded by the single-key shortcuts, which is
 * why they arrive as inputs rather than being hardcoded.
 */
@Component({
  selector: 'app-quick-create-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, InputComponent, ModalShellComponent],
  template: `
    <app-modal-shell title="New issue" (closed)="closed.emit()">
      <form class="flex flex-col gap-3" (submit)="handleSubmit($event)">
        <app-input
          controlId="quick-create-title"
          label="Title"
          placeholder="What needs to be done?"
          [value]="title()"
          [required]="true"
          [error]="titleError()"
          (valueChange)="title.set($event)"
        />

        <div class="flex flex-col gap-1">
          <span class="text-xs font-medium text-slate-200">Type</span>
          <div class="flex flex-wrap gap-2">
            @for (type of ISSUE_TYPES; track type) {
              <button
                type="button"
                [class]="chipClasses(selectedType() === type)"
                [attr.aria-pressed]="selectedType() === type"
                (click)="selectedType.set(type)"
              >
                {{ type }}
              </button>
            }
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <span class="text-xs font-medium text-slate-200">Priority</span>
          <div class="flex flex-wrap gap-2">
            @for (priority of ISSUE_PRIORITIES; track priority) {
              <button
                type="button"
                [class]="chipClasses(selectedPriority() === priority)"
                [attr.aria-pressed]="selectedPriority() === priority"
                (click)="selectedPriority.set(priority)"
              >
                {{ priority }}
              </button>
            }
          </div>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div class="flex flex-col gap-1">
            <label for="quick-create-column" class="text-xs font-medium text-slate-200">
              Column
            </label>
            <select
              id="quick-create-column"
              [value]="selectedColumnId()"
              class="min-h-11 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm
                text-slate-100 focus:outline-2 focus:outline-offset-2 focus:outline-indigo-500"
              (change)="handleColumnChange($event)"
            >
              @for (column of columns(); track column.id) {
                <option [value]="column.id">{{ column.title }}</option>
              }
            </select>
          </div>

          <div class="flex flex-col gap-1">
            <label for="quick-create-sprint" class="text-xs font-medium text-slate-200">
              Sprint
            </label>
            <select
              id="quick-create-sprint"
              [value]="selectedSprintId() ?? ''"
              class="min-h-11 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm
                text-slate-100 focus:outline-2 focus:outline-offset-2 focus:outline-indigo-500"
              (change)="handleSprintChange($event)"
            >
              <option value="">Backlog</option>
              @for (sprint of sprints(); track sprint.id) {
                <option [value]="sprint.id">{{ sprint.name }}</option>
              }
            </select>
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <span class="text-xs font-medium text-slate-200">Story points</span>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              [class]="chipClasses(storyPoints() === null)"
              [attr.aria-pressed]="storyPoints() === null"
              (click)="storyPoints.set(null)"
            >
              Unestimated
            </button>
            @for (points of STORY_POINT_CHOICES; track points) {
              <button
                type="button"
                [class]="chipClasses(storyPoints() === points)"
                [attr.aria-pressed]="storyPoints() === points"
                (click)="storyPoints.set(points)"
              >
                {{ points }}
              </button>
            }
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <label for="quick-create-assignee" class="text-xs font-medium text-slate-200">
            Assignee
          </label>
          <select
            id="quick-create-assignee"
            [value]="selectedAssigneeId() ?? ''"
            class="min-h-11 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm
              text-slate-100 focus:outline-2 focus:outline-offset-2 focus:outline-indigo-500"
            (change)="handleAssigneeChange($event)"
          >
            <option value="">Unassigned</option>
            @for (user of assignableUsers(); track user.id) {
              <option [value]="user.id">{{ user.name }}</option>
            }
          </select>
        </div>
      </form>

      <ng-container modalFooter>
        <app-button
          label="Cancel"
          variant="secondary"
          buttonType="button"
          (click)="closed.emit()"
        />
        <app-button
          label="Create issue"
          buttonType="button"
          [loading]="isSaving()"
          [disabled]="title().trim().length === 0"
          (click)="submit()"
        />
      </ng-container>
    </app-modal-shell>
  `,
})
export class QuickCreateModalComponent {
  private readonly board = inject(BoardStateService);

  readonly columns = input.required<BoardColumn[]>();
  readonly users = input<User[]>([]);
  readonly sprints = input<Sprint[]>([]);
  readonly defaultColumnId = input<string | null>(null);
  /** Pre-selected priority, set by the numeric shortcuts. */
  readonly initialPriority = input<IssuePriority | null>(null);
  /** Pre-selected type, set by the letter shortcuts. */
  readonly initialType = input<IssueType | null>(null);

  readonly created = output<string>();
  readonly closed = output<void>();

  protected readonly STORY_POINT_CHOICES = STORY_POINT_CHOICES;
  protected readonly ISSUE_TYPES = ISSUE_TYPES;
  protected readonly ISSUE_PRIORITIES = ISSUE_PRIORITIES;

  protected readonly title = signal('');
  protected readonly titleError = signal<string | null>(null);
  protected readonly selectedType = signal<IssueType>('story');
  protected readonly selectedPriority = signal<IssuePriority>('medium');
  protected readonly selectedColumnId = signal<string>('');
  protected readonly selectedSprintId = signal<string | null>(null);
  protected readonly selectedAssigneeId = signal<string | null>(null);
  protected readonly storyPoints = signal<number | null>(null);
  protected readonly isSaving = signal(false);

  protected readonly assignableUsers = computed(() =>
    this.users().filter((user) => user.role !== 'viewer'),
  );

  constructor() {
    // Seed the dialog from the shortcuts that opened it. The effect only
    // re-runs when the input itself changes, so a later manual choice sticks.
    effect(() => {
      const priority = this.initialPriority();

      if (priority !== null) {
        this.selectedPriority.set(priority);
      }
    });

    effect(() => {
      const type = this.initialType();

      if (type !== null) {
        this.selectedType.set(type);
      }
    });
  }

  protected chipClasses(isActive: boolean): string {
    const base =
      'min-h-11 rounded-lg border px-3 text-sm font-medium capitalize transition-colors ' +
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500';

    return isActive
      ? `${base} border-indigo-500 bg-indigo-600 text-white`
      : `${base} border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700`;
  }

  protected handleColumnChange(event: Event): void {
    this.selectedColumnId.set(readValue(event));
  }

  protected handleSprintChange(event: Event): void {
    const value = readValue(event);
    this.selectedSprintId.set(value.length === 0 ? null : value);
  }

  protected handleAssigneeChange(event: Event): void {
    const value = readValue(event);
    this.selectedAssigneeId.set(value.length === 0 ? null : value);
  }

  protected handleSubmit(event: Event): void {
    event.preventDefault();
    this.submit();
  }

  protected async submit(): Promise<void> {
    if (this.isSaving()) {
      return;
    }

    const title = this.title().trim();

    if (title.length === 0) {
      this.titleError.set('A title is required.');
      return;
    }

    this.titleError.set(null);
    this.isSaving.set(true);

    try {
      const issueId = await this.board.createIssue({
        title,
        type: this.selectedType(),
        priority: this.selectedPriority(),
        statusId: this.resolveColumnId(),
        assigneeId: this.selectedAssigneeId(),
        storyPoints: this.storyPoints(),
        sprintId: this.selectedSprintId(),
      });

      if (issueId !== null) {
        this.created.emit(issueId);
      }
    } finally {
      this.isSaving.set(false);
    }
  }

  private resolveColumnId(): string {
    const explicit = this.selectedColumnId();

    if (explicit.length > 0) {
      return explicit;
    }

    return this.defaultColumnId() ?? this.columns()[0]?.id ?? '';
  }
}

/** Reads the value of a native select or input, or an empty string. */
function readValue(event: Event): string {
  const target = event.target;
  return target instanceof HTMLSelectElement || target instanceof HTMLInputElement
    ? target.value
    : '';
}
