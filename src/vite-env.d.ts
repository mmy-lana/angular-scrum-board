/// <reference types="vite/client" />

/**
 * Typed surface for the Vite-provided `import.meta.env` object.
 *
 * Every variable is declared optional so the application still compiles and
 * boots when a given `.env` entry is absent; `APP_CONFIG` in
 * `core/config/runtime-config.ts` is responsible for resolving the fallback.
 */
interface ImportMetaEnv {
  readonly VITE_APP_TITLE?: string;
  readonly VITE_DB_NAME?: string;
  readonly VITE_DEFAULT_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
