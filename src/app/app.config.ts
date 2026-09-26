import {
  ApplicationConfig,
  provideAppInitializer,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { seedDatabase } from './core/database/seed-data';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    // Zoneless change detection: every piece of state in this application is a
    // signal, so zone.js would only add weight. It also conflicts with Dexie,
    // whose transaction tracking relies on unpatched promise microtasks and
    // otherwise aborts a first-run seed with `PrematureCommitError`.
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideAppInitializer(async () => {
      try {
        const summary = await seedDatabase();
        if (summary.seeded) {
          console.info(
            `[scrum-board] Seeded demo data: ${summary.issues} issues, ${summary.columns} columns, ${summary.sprints} sprints, ${summary.users} users.`,
          );
        }
      } catch (error: unknown) {
        console.error('[scrum-board] Failed to initialise the local database.', error);
      }
    }),
  ],
};
