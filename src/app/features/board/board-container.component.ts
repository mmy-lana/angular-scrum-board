import { Component } from '@angular/core';

@Component({
  selector: 'app-board-container',
  standalone: true,
  template: `
    <div class="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <h1 class="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">
        angular-scrum-board
      </h1>
      <p class="mt-2 text-sm text-slate-400">
        Interactive Scrum and Agile Project Board
      </p>
    </div>
  `,
})
export class BoardContainerComponent {}
