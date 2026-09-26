/**
 * Build-time configuration for the storage client and the application shell.
 *
 * Values are read from Vite environment variables so a deployment can retarget
 * the local database without a code change. Every entry is optional at the
 * environment level; the fallbacks below are what make the app boot cleanly
 * with no `.env` file present.
 */
export interface AppRuntimeConfig {
  /** Document/shell title. */
  readonly appTitle: string;
  /** IndexedDB database name backing the local-first storage client. */
  readonly databaseName: string;
  /** Project selected on first boot by the board state service. */
  readonly defaultProjectId: string;
}

/** Reads a trimmed environment value, treating an empty string as absent. */
function readEnv(value: string | undefined, fallback: string): string {
  return value !== undefined && value.trim().length > 0 ? value.trim() : fallback;
}

/** The frozen runtime configuration used across the application. */
export const APP_CONFIG: AppRuntimeConfig = Object.freeze({
  appTitle: readEnv(import.meta.env.VITE_APP_TITLE, 'Angular Scrum Board'),
  databaseName: readEnv(import.meta.env.VITE_DB_NAME, 'ScrumBoardDatabase'),
  defaultProjectId: readEnv(import.meta.env.VITE_DEFAULT_PROJECT_ID, 'project-scrum-default'),
});
