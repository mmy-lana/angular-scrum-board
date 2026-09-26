import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <main class="min-h-screen bg-slate-950 text-slate-100 antialiased">
      <router-outlet></router-outlet>
    </main>
  `,
})
export class AppComponent {}
