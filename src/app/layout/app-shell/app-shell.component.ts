import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { APP_CONFIG } from '../../core/config/runtime-config';
import { BoardStateService } from '../../core/services/board-state.service';

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
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
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

        <nav aria-label="Primary" class="flex flex-col gap-1 p-2">
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
            </div>
          </nav>
        </div>
      }
    </div>
  `,
})
export class AppShellComponent {
  private readonly board = inject(BoardStateService);

  protected readonly navItems = NAV_ITEMS;
  protected readonly title = APP_CONFIG.appTitle;
  protected readonly drawerOpen = signal(false);

  protected readonly projectKey = computed(
    () => this.board.project()?.key ?? 'Scrum board',
  );

  protected openDrawer(): void {
    this.drawerOpen.set(true);
  }

  protected closeDrawer(): void {
    this.drawerOpen.set(false);
  }
}
