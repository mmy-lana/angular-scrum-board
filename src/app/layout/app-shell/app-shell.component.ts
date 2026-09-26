import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { APP_CONFIG } from '../../core/config/runtime-config';
import { db } from '../../core/database/scrum-database';
import { BoardStateService } from '../../core/services/board-state.service';
import { TeamManagerComponent } from '../../features/team/components/team-manager/team-manager.component';

/** A primary destination in the left navigation. */
interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly description: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  {
    path: '/board',
    label: 'Board',
    description: 'Drag work between columns',
  },
  {
    path: '/backlog',
    label: 'Backlog',
    description: 'Plan sprints and upcoming work',
  },
];

/**
 * Application frame: brand, primary navigation, and the routed view.
 *
 * The navigation is a persistent sidebar from the large breakpoint up and a
 * slide-out drawer below it. The drawer is closed on navigation so a tap always
 * reveals the content the user asked for, and `Escape` closes it the same way
 * it closes a dialog.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TeamManagerComponent],
  host: {
    '(document:keydown.escape)': 'closeDrawer()',
  },
  template: `
    <div class="flex min-h-screen bg-slate-950">
      <!-- Sidebar from lg up. -->
      <aside
        class="hidden w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900 lg:flex"
      >
        <div class="border-b border-slate-800 p-4">
          <p class="truncate text-sm font-semibold text-slate-100">{{ title }}</p>
          <p class="truncate text-xs text-slate-400">{{ projectKey() }}</p>
        </div>

        <nav aria-label="Primary" class="flex flex-1 flex-col gap-1 p-2">
          @for (item of navItems; track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="bg-indigo-600 text-white"
              [routerLinkActiveOptions]="{ exact: false }"
              class="flex min-h-11 flex-col justify-center rounded-lg px-3 text-sm
                font-medium text-slate-200 hover:bg-slate-800 hover:text-slate-100
                focus-visible:outline-2 focus-visible:outline-offset-2
                focus-visible:outline-indigo-500"
            >
              <span>{{ item.label }}</span>
              <span class="text-xs font-normal text-slate-400">{{ item.description }}</span>
            </a>
          }

          <div class="mt-auto flex flex-col gap-1 border-t border-slate-800 p-2 pt-3">
            <button
              type="button"
              class="flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm
                font-medium text-slate-200 hover:bg-slate-800 hover:text-slate-100
                focus-visible:outline-2 focus-visible:outline-offset-2
                focus-visible:outline-indigo-500"
              (click)="openTeam()"
            >
              Team
              <span class="text-xs font-normal text-slate-400">
                {{ board.users().length }} {{ board.users().length === 1 ? 'person' : 'people' }}
              </span>
            </button>

            <button
              type="button"
              class="flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm
                font-medium text-slate-200 hover:bg-slate-800 hover:text-slate-100
                focus-visible:outline-2 focus-visible:outline-offset-2
                focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              [disabled]="exporting()"
              (click)="exportCheckpoint()"
            >
              {{ exporting() ? 'Preparing…' : 'Export checkpoint' }}
            </button>

            <label
              class="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm
                font-medium text-slate-200 hover:bg-slate-800 hover:text-slate-100
                focus-within:outline-2 focus-within:outline-offset-2
                focus-within:outline-indigo-500"
            >
              {{ restoring() ? 'Restoring…' : 'Restore checkpoint' }}
              <input
                #restoreInput
                type="file"
                accept="application/json,.json"
                class="sr-only"
                [disabled]="restoring()"
                (change)="importCheckpoint($event)"
              />
            </label>

            @if (checkpointMessage(); as message) {
              <p
                role="status"
                [class]="checkpointTone() === 'error'
                  ? 'px-3 text-xs text-rose-500'
                  : 'px-3 text-xs text-emerald-500'"
              >
                {{ message }}
              </p>
            }
          </div>
        </nav>
      </aside>

      <!-- Mobile top bar. -->
      <div class="flex min-w-0 flex-1 flex-col">
        <header
          class="flex items-center gap-3 border-b border-slate-800 bg-slate-900 px-3 py-2
            lg:hidden"
        >
          <button
            type="button"
            class="min-h-11 min-w-11 rounded-lg text-slate-200 hover:bg-slate-800
              focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-indigo-500"
            aria-label="Open navigation"
            [attr.aria-expanded]="drawerOpen()"
            aria-controls="mobile-drawer"
            (click)="openDrawer()"
          >
            <span aria-hidden="true" class="text-lg leading-none">&#9776;</span>
          </button>

          <p class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">
            {{ title }}
          </p>
        </header>

        <main class="min-w-0 flex-1 p-3 sm:p-4 lg:p-6">
          <router-outlet />
        </main>
      </div>

      <!-- Mobile slide-out. -->
      @if (drawerOpen()) {
        <div class="fixed inset-0 z-40 lg:hidden">
          <div
            class="absolute inset-0 bg-slate-950/70"
            role="button"
            tabindex="-1"
            aria-label="Close navigation"
            (click)="closeDrawer()"
          ></div>

          <nav
            id="mobile-drawer"
            aria-label="Primary"
            class="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r
              border-slate-800 bg-slate-900 shadow-xl"
          >
            <div class="flex items-center justify-between border-b border-slate-800 p-4">
              <p class="min-w-0 truncate text-sm font-semibold text-slate-100">{{ title }}</p>
              <button
                type="button"
                class="min-h-11 min-w-11 rounded-lg text-slate-200 hover:bg-slate-800
                  focus-visible:outline-2 focus-visible:outline-offset-2
                  focus-visible:outline-indigo-500"
                aria-label="Close navigation"
                (click)="closeDrawer()"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </div>

            <div class="flex flex-col gap-1 p-2">
              @for (item of navItems; track item.path) {
                <a
                  [routerLink]="item.path"
                  routerLinkActive="bg-indigo-600 text-white"
                  [routerLinkActiveOptions]="{ exact: false }"
                  class="flex min-h-11 flex-col justify-center rounded-lg px-3 text-sm
                    font-medium text-slate-200 hover:bg-slate-800 hover:text-slate-100
                    focus-visible:outline-2 focus-visible:outline-offset-2
                    focus-visible:outline-indigo-500"
                  (click)="closeDrawer()"
                >
                  <span>{{ item.label }}</span>
                  <span class="text-xs font-normal text-slate-400">{{ item.description }}</span>
                </a>
              }

              <button
                type="button"
                class="mt-2 flex min-h-11 flex-col justify-center rounded-lg border-t
                  border-slate-800 px-3 pt-3 text-left text-sm font-medium text-slate-200"
                (click)="openTeamFromDrawer()"
              >
                Team
                <span class="text-xs font-normal text-slate-400">
                  {{ board.users().length }} {{ board.users().length === 1 ? 'person' : 'people' }}
                </span>
              </button>
            </div>
          </nav>
        </div>
      }

      @if (teamOpen()) {
        <app-team-manager (closed)="teamOpen.set(false)" />
      }
    </div>
  `,
})
export class AppShellComponent {
  protected readonly board = inject(BoardStateService);

  protected readonly navItems = NAV_ITEMS;
  protected readonly title = APP_CONFIG.appTitle;
  protected readonly drawerOpen = signal(false);
  protected readonly teamOpen = signal(false);
  protected readonly exporting = signal(false);
  protected readonly restoring = signal(false);

  /** Inline result of the last checkpoint operation. */
  protected readonly checkpointMessage = signal<string | null>(null);
  protected readonly checkpointTone = signal<'ok' | 'error'>('ok');

  protected readonly projectKey = computed(
    () => this.board.project()?.key ?? 'Scrum board',
  );

  protected openDrawer(): void {
    this.drawerOpen.set(true);
  }

  protected closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  protected openTeam(): void {
    this.teamOpen.set(true);
  }

  /** The drawer would otherwise stay open behind the dialog. */
  protected openTeamFromDrawer(): void {
    this.closeDrawer();
    this.teamOpen.set(true);
  }

  private reportCheckpoint(message: string, tone: 'ok' | 'error'): void {
    this.checkpointMessage.set(message);
    this.checkpointTone.set(tone);
  }

  /**
   * Writes a JSON checkpoint to the user's downloads folder.
   *
   * The object URL is released on the next task rather than immediately:
   * revoking it in the same turn can cancel the download before the browser
   * has read the blob. The anchor is attached to the document for the same
   * reason — some browsers ignore clicks on detached nodes.
   */
  protected async exportCheckpoint(): Promise<void> {
    if (this.exporting()) {
      return;
    }

    this.exporting.set(true);
    this.checkpointMessage.set(null);

    try {
      const json = await db.exportCheckpoint();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');

      anchor.href = url;
      anchor.download = `scrum-board-checkpoint-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      setTimeout(() => URL.revokeObjectURL(url), 0);

      this.reportCheckpoint('Checkpoint saved.', 'ok');
    } catch (error: unknown) {
      this.reportCheckpoint(
        error instanceof Error ? error.message : 'The checkpoint could not be written.',
        'error',
      );
    } finally {
      this.exporting.set(false);
    }
  }

  /**
   * Restores a checkpoint, replacing everything currently stored.
   *
   * The file input is cleared on every path so choosing the same file twice in
   * a row still fires a change event. Failures are reported inline rather than
   * through `alert`, which would block the app and discard the selection.
   */
  protected async importCheckpoint(event: Event): Promise<void> {
    const target = event.target;

    if (!(target instanceof HTMLInputElement) || this.restoring()) {
      return;
    }

    const file = target.files?.[0];

    if (file === undefined) {
      return;
    }

    this.restoring.set(true);
    this.checkpointMessage.set(null);

    try {
      const text = await file.text();
      const result = await db.importCheckpoint(text);

      if (result.success) {
        this.reportCheckpoint('Checkpoint restored.', 'ok');
      } else {
        this.reportCheckpoint(`Restore failed: ${result.error}`, 'error');
      }
    } catch (error: unknown) {
      this.reportCheckpoint(
        error instanceof Error ? error.message : 'The checkpoint file could not be read.',
        'error',
      );
    } finally {
      target.value = '';
      this.restoring.set(false);
    }
  }
}
