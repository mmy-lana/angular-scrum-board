import { ApplicationConfig, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { seedDatabase } from './core/database/seed-data';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
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
