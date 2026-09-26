import { Routes } from '@angular/router';

import { AppShellComponent } from './layout/app-shell/app-shell.component';

/**
 * Every route renders inside the shell, which owns the navigation frame.
 * Feature containers are lazily loaded so the initial bundle carries the
 * shell and the data layer rather than every screen.
 */
export const routes: Routes = [
  {
    path: '',
    component: AppShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'board' },
      {
        path: 'board',
        title: 'Board',
        loadComponent: () =>
          import('./features/board/containers/board-container/board-container.component').then(
            (m) => m.BoardContainerComponent,
          ),
      },
      {
        path: 'backlog',
        title: 'Backlog',
        loadComponent: () =>
          import('./features/backlog/containers/backlog-container/backlog-container.component').then(
            (m) => m.BacklogContainerComponent,
          ),
      },
      { path: '**', redirectTo: 'board' },
    ],
  },
];
