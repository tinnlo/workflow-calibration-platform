/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Fully-qualified API origin (e.g. "https://api.example.com").
   * Required in production/staging builds (enforced at build time and runtime).
   * Must be a bare origin — no path, query, hash, or userinfo.
   * Falls back to "/api" in development (vite dev server proxies to backend).
   */
  readonly VITE_API_BASE_URL?: string
  readonly VITE_E2E_HOOKS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}