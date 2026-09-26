import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'board',
  },
  {
    path: 'board',
    loadComponent: () =>
      import('./features/board/board-container.component').then(
        (m) => m.BoardContainerComponent
      ),
  },
];
