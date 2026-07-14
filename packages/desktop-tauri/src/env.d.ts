interface Window {
  __OPENCODE__?: {
    deepLinks?: string[]
    wsl?: boolean
    updaterEnabled?: boolean
  }
  __TAURI_INTERNALS__?: {
    convertFileSrc?: (path: string, protocol?: string) => string
  }
}

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_SENTRY_ENVIRONMENT?: string
  readonly VITE_SENTRY_RELEASE?: string
  readonly OPENCODE_CHANNEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
