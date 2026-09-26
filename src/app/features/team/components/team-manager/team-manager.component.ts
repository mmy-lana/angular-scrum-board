import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';

import { User, UserRole, USER_ROLES } from '../../../../core/models/user.model';
import { BoardStateService } from '../../../../core/services/board-state.service';
import { AvatarComponent } from '../../../../shared/ui/avatar/avatar.component';
import { ButtonComponent } from '../../../../shared/ui/button/button.component';
import { InputComponent } from '../../../../shared/ui/input/input.component';
import { ModalShellComponent } from '../../../../shared/ui/modal/modal-shell.component';

/** Whether the form is adding a new teammate or editing an existing one. */
type FormMode = { kind: 'create' } | { kind: 'edit'; userId: string };

/**
 * Team administration: add, edit and remove the people who appear in assignee
 * pickers, comment authorship and activity avatars.
 *
 * Writes go through {@link BoardStateService}, which validates before touching
 * storage and leaves the reason on `errorMessage`; this component surfaces that
 * message against the field or the row it came from rather than inventing its
 * own rules.
 */
@Component({
  selector: 'app-team-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvatarComponent,
    ButtonComponent,
    InputComponent,
    ModalShellComponent,
  ],
  template: `
    <app-modal-shell title="Team" (closed)="closed.emit()">
      @if (board.errorMessage(); as message) {
        <p
          role="alert"
          class="rounded-lg border border-rose-500 bg-rose-500/10 px-3 py-2 text-sm text-rose-500"
        >
          {{ message }}
        </p>
      }

      <ul class="flex flex-col gap-2">
        @for (user of board.users(); track user.id) {
          <li
            class="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800 p-2"
          >
            <app-avatar [user]="user" size="sm" [decorative]="true" />

            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-slate-100">{{ user.name }}</p>
              <p class="truncate text-xs text-slate-400">{{ user.email }}</p>
            </div>

            <span class="shrink-0 rounded-md bg-slate-900 px-2 py-1 text-xs capitalize text-slate-400">
              {{ user.role }}
            </span>

            <app-button
              label="Edit"
              size="sm"
              variant="secondary"
              (click)="beginEdit(user)"
            />

            <app-button
              [label]="'Remove ' + user.name"
              size="sm"
              variant="danger"
              [disabled]="board.users().length <= 1"
              (click)="remove(user)"
            />
          </li>
        } @empty {
          <li class="rounded-lg border border-slate-700 p-4 text-center text-sm text-slate-400">
            No teammates yet.
          </li>
        }
      </ul>

      <form class="flex flex-col gap-3 border-t border-slate-800 pt-4" (submit)="save($event)">
        <h3 class="text-sm font-semibold text-slate-100">
          {{ mode().kind === 'edit' ? 'Edit teammate' : 'Add a teammate' }}
        </h3>

        <app-input
          label="Name"
          [value]="draftName()"
          placeholder="Ada Lovelace"
          [disabled]="busy()"
          (valueChange)="draftName.set($event)"
        />

        <app-input
          label="Email"
          type="email"
          [value]="draftEmail()"
          placeholder="ada@example.com"
          [disabled]="busy()"
          [error]="emailTaken() ? 'Another teammate already uses this address.' : null"
          (valueChange)="draftEmail.set($event)"
        />

        <div class="flex flex-col gap-1">
          <label for="team-role" class="text-sm font-medium text-slate-200">Role</label>
          <select
            id="team-role"
            [value]="draftRole()"
            [disabled]="busy()"
            class="min-h-11 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm
              text-slate-100 focus:outline-2 focus:outline-offset-2 focus:outline-indigo-500"
            (change)="handleRoleChange($event)"
          >
            @for (role of roles; track role) {
              <option [value]="role">{{ role }}</option>
            }
          </select>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <app-button
            [label]="mode().kind === 'edit' ? 'Save changes' : 'Add teammate'"
            size="sm"
            [loading]="busy()"
            (click)="save($event)"
          />

          @if (mode().kind === 'edit') {
            <app-button label="Cancel" size="sm" variant="secondary" (click)="resetForm()" />
          }
        </div>
      </form>
    </app-modal-shell>
  `,
})
export class TeamManagerComponent {
  protected readonly board = inject(BoardStateService);

  readonly closed = output<void>();

  protected readonly roles = USER_ROLES;
  protected readonly busy = signal(false);
  protected readonly mode = signal<FormMode>({ kind: 'create' });

  protected readonly draftName = signal('');
  protected readonly draftEmail = signal('');
  protected readonly draftRole = signal<UserRole>('member');

  /** True when a teammate already carries this email, ignoring the one being edited. */
  protected readonly emailTaken = computed(() => {
    const email = this.draftEmail().trim().toLowerCase();
    const current = this.mode();
    const editing = current.kind === 'edit' ? current.userId : null;

    if (email.length === 0) {
      return false;
    }

    return this.board
      .users()
      .some((user) => user.id !== editing && user.email.toLowerCase() === email);
  });

  protected beginEdit(user: User): void {
    this.board.clearError();
    this.mode.set({ kind: 'edit', userId: user.id });
    this.draftName.set(user.name);
    this.draftEmail.set(user.email);
    this.draftRole.set(user.role);
  }

  protected resetForm(): void {
    this.board.clearError();
    this.mode.set({ kind: 'create' });
    this.draftName.set('');
    this.draftEmail.set('');
    this.draftRole.set('member');
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();

    if (this.busy()) {
      return;
    }

    this.busy.set(true);
    this.board.clearError();

    try {
      const current = this.mode();
      const role = this.draftRole();
      const name = this.draftName();
      const email = this.draftEmail();

      const ok =
        current.kind === 'edit'
          ? await this.board.updateUser(current.userId, { name, email, role })
          : (await this.board.createUser({ name, email, role })) !== null;

      if (ok) {
        this.resetForm();
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(user: User): Promise<void> {
    if (this.busy()) {
      return;
    }

    this.busy.set(true);
    this.board.clearError();

    try {
      const removed = await this.board.deleteUser(user.id);
      const current = this.mode();

      // Editing the row that just disappeared would silently repopulate the
      // form with a teammate who is no longer there.
      if (removed && current.kind === 'edit' && current.userId === user.id) {
        this.resetForm();
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected handleRoleChange(event: Event): void {
    const target = event.target;

    if (target instanceof HTMLSelectElement) {
      this.draftRole.set(target.value as UserRole);
    }
  }
}
