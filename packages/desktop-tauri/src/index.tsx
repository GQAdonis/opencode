// @refresh reload

import {
  ACCEPTED_FILE_EXTENSIONS,
  filePickerFilters,
  AppBaseProviders,
  AppInterface,
  handleNotificationClick,
  loadLocaleDict,
  normalizeLocale,
  type Locale,
  type Platform,
  PlatformProvider,
  ServerConnection,
  useCommand,
  type UpdaterState,
} from "@opencode-ai/app"
import * as Sentry from "@sentry/solid"
import type { AsyncStorage } from "@solid-primitives/storage"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { readImage } from "@tauri-apps/plugin-clipboard-manager"
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link"
import { open, save } from "@tauri-apps/plugin-dialog"
import { fetch as tauriFetch } from "@tauri-apps/plugin-http"
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification"
import { type as ostype } from "@tauri-apps/plugin-os"
import { relaunch } from "@tauri-apps/plugin-process"
import { open as shellOpen } from "@tauri-apps/plugin-shell"
import { Store } from "@tauri-apps/plugin-store"
import { check, type Update } from "@tauri-apps/plugin-updater"
import { createResource, createSignal, onCleanup, onMount, Show, type Component } from "solid-js"
import { createMemoryHistory, MemoryRouter, type BaseRouterProps } from "@solidjs/router"
import { render } from "solid-js/web"
import pkg from "../package.json"
import { initI18n, t } from "./i18n"
import { UPDATER_ENABLED } from "./updater"
import { webviewZoom } from "./webview-zoom"
import "./styles.css"
import { Channel } from "@tauri-apps/api/core"
import { commands, type InitStep } from "./bindings"
import { createMenu } from "./menu"
import { DesktopFirstLaunchOnboarding } from "./onboarding"

// Bridge the shared app's `window.api.setTitlebar` hook (invoked by ThemeProvider
// on every theme change) to the native window. Electron implements this in its
// preload; Tauri has no preload, so define it here before the app mounts. This
// aligns the native window appearance (macOS frame hairline + shadow) with the
// web theme — parity with the Electron desktop app. Background color is synced
// separately via the DOM observer in DesktopRoot's onMount.
{
  const api = ((window as unknown as { api?: Record<string, unknown> }).api ??= {})
  api.setTitlebar = ({ mode, scheme }: { mode: "light" | "dark"; scheme?: "system" | "light" | "dark" }) =>
    commands.setTitlebar(mode, scheme ?? null).catch(() => undefined)
}

const root = document.getElementById("root")
if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(t("error.dev.rootNotFound"))
}

// Initialize Sentry for the desktop build (the Tauri app has its own render
// entry and does not go through the shared web entry, so it must init here).
// Mirrors the Electron app: desktop release + platform tag, gated on the DSN.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE ?? `desktop@${pkg.version}`,
    initialScope: {
      tags: {
        platform: "desktop",
      },
    },
    integrations: (integrations) => {
      return integrations.filter(
        (i) =>
          i.name !== "Breadcrumbs" &&
          !(
            import.meta.env.OPENCODE_CHANNEL === "prod" &&
            (i.name === "GlobalHandlers" || i.name === "BrowserApiErrors")
          ),
      )
    },
  })
}

void initI18n()

let update: Update | null = null

const deepLinkEvent = "opencode:deep-link"

const emitDeepLinks = (urls: string[]) => {
  if (urls.length === 0) return
  window.__OPENCODE__ ??= {}
  const pending = window.__OPENCODE__.deepLinks ?? []
  window.__OPENCODE__.deepLinks = [...pending, ...urls]
  window.dispatchEvent(new CustomEvent(deepLinkEvent, { detail: { urls } }))
}

const listenForDeepLinks = async () => {
  const startUrls = await getCurrent().catch(() => null)
  if (startUrls?.length) emitDeepLinks(startUrls)
  await onOpenUrl((urls) => emitDeepLinks(urls)).catch(() => undefined)
}

function windowLastActiveUrlKey(windowID: string) {
  return `opencode.desktop.window.${windowID}.last-active-url`
}

function getLastActiveUrl(windowID: string) {
  if (typeof localStorage !== "object") return "/"
  try {
    const value = localStorage.getItem(windowLastActiveUrlKey(windowID))
    if (value?.startsWith("/") && !value.startsWith("//")) return value
  } catch {}
  return "/"
}

function setLastActiveUrl(windowID: string, value: string) {
  if (typeof localStorage !== "object") return
  try {
    localStorage.setItem(windowLastActiveUrlKey(windowID), value)
  } catch {}
}

function DesktopMemoryRouter(props: BaseRouterProps & { windowID: string }) {
  const history = createMemoryHistory()
  const initialUrl = getLastActiveUrl(props.windowID)
  if (initialUrl !== "/") history.set({ value: initialUrl, replace: true, scroll: false })
  onCleanup(history.listen((value: string) => setLastActiveUrl(props.windowID, value)))
  return <MemoryRouter {...props} history={history} />
}

const createPlatform = (windowID?: string): Platform => {
  const os = (() => {
    const type = ostype()
    if (type === "macos" || type === "windows" || type === "linux") return type
    return undefined
  })()

  const wslHome = async () => {
    if (os !== "windows" || !window.__OPENCODE__?.wsl) return undefined
    return commands.wslPath("~", "windows").catch(() => undefined)
  }

  const handleWslPicker = async <T extends string | string[]>(result: T | null): Promise<T | null> => {
    if (!result || !window.__OPENCODE__?.wsl) return result
    if (Array.isArray(result)) {
      return Promise.all(result.map((path) => commands.wslPath(path, "linux").catch(() => path))) as any
    }
    return commands.wslPath(result, "linux").catch(() => result) as any
  }

  const attachmentPaths = new WeakMap<File, string>()

  return {
    platform: "desktop",
    os,
    version: pkg.version,
    windowID,

    async openDirectoryPickerDialog(opts) {
      const defaultPath = await wslHome()
      const result = await open({
        directory: true,
        multiple: opts?.multiple ?? false,
        title: opts?.title ?? t("desktop.dialog.chooseFolder"),
        defaultPath,
      })
      return await handleWslPicker(result)
    },

    async openAttachmentPickerDialog(opts, onFile) {
      const result = await open({
        directory: false,
        multiple: opts?.multiple ?? false,
        title: opts?.title ?? t("desktop.dialog.chooseFile"),
        filters: filePickerFilters(opts?.extensions ?? ACCEPTED_FILE_EXTENSIONS),
        defaultPath: opts?.defaultPath,
      })
      if (!result) return
      const paths = Array.isArray(result) ? result : [result]
      for (const path of paths) {
        const url = window.__TAURI_INTERNALS__?.convertFileSrc
          ? (window.__TAURI_INTERNALS__ as any).convertFileSrc(path)
          : `asset://localhost/${encodeURIComponent(path)}`
        const response = await fetch(url)
        const blob = await response.blob()
        const name = path.split("/").pop() ?? path.split("\\").pop() ?? "file"
        const file = new File([blob], name)
        attachmentPaths.set(file, path)
        await onFile(file)
      }
    },

    getPathForFile(file: File) {
      return attachmentPaths.get(file) ?? ""
    },

    async saveFilePickerDialog(opts) {
      const result = await save({
        title: opts?.title ?? t("desktop.dialog.saveFile"),
        defaultPath: opts?.defaultPath,
      })
      return handleWslPicker(result)
    },

    openLink(url: string) {
      void shellOpen(url).catch(() => undefined)
    },
    async openPath(path: string, app?: string) {
      await commands.openPath(path, app ?? null)
    },

    back() {
      window.history.back()
    },

    forward() {
      window.history.forward()
    },

    storage: (() => {
      type StoreLike = {
        get(key: string): Promise<string | null | undefined>
        set(key: string, value: string): Promise<unknown>
        delete(key: string): Promise<unknown>
        clear(): Promise<unknown>
        keys(): Promise<string[]>
        length(): Promise<number>
      }

      const WRITE_DEBOUNCE_MS = 250

      const storeCache = new Map<string, Promise<StoreLike>>()
      const apiCache = new Map<string, AsyncStorage & { flush: () => Promise<void> }>()
      const memoryCache = new Map<string, StoreLike>()

      const flushAll = async () => {
        const apis = Array.from(apiCache.values())
        await Promise.all(apis.map((api) => api.flush().catch(() => undefined)))
      }

      if ("addEventListener" in globalThis) {
        const handleVisibility = () => {
          if (document.visibilityState !== "hidden") return
          void flushAll()
        }

        window.addEventListener("pagehide", () => void flushAll())
        document.addEventListener("visibilitychange", handleVisibility)
      }

      const createMemoryStore = () => {
        const data = new Map<string, string>()
        const store: StoreLike = {
          get: async (key) => data.get(key),
          set: async (key, value) => {
            data.set(key, value)
          },
          delete: async (key) => {
            data.delete(key)
          },
          clear: async () => {
            data.clear()
          },
          keys: async () => Array.from(data.keys()),
          length: async () => data.size,
        }
        return store
      }

      const getStore = (name: string) => {
        const cached = storeCache.get(name)
        if (cached) return cached

        const store = Store.load(name).catch(() => {
          const cached = memoryCache.get(name)
          if (cached) return cached

          const memory = createMemoryStore()
          memoryCache.set(name, memory)
          return memory
        })

        storeCache.set(name, store)
        return store
      }

      const createStorage = (name: string) => {
        const pending = new Map<string, string | null>()
        let timer: ReturnType<typeof setTimeout> | undefined
        let flushing: Promise<void> | undefined

        const flush = async () => {
          if (flushing) return flushing

          flushing = (async () => {
            const store = await getStore(name)
            while (pending.size > 0) {
              const batch = Array.from(pending.entries())
              pending.clear()
              for (const [key, value] of batch) {
                if (value === null) {
                  await store.delete(key).catch(() => undefined)
                } else {
                  await store.set(key, value).catch(() => undefined)
                }
              }
            }
          })().finally(() => {
            flushing = undefined
          })

          return flushing
        }

        const schedule = () => {
          if (timer) return
          timer = setTimeout(() => {
            timer = undefined
            void flush()
          }, WRITE_DEBOUNCE_MS)
        }

        const api: AsyncStorage & { flush: () => Promise<void> } = {
          flush,
          getItem: async (key: string) => {
            const next = pending.get(key)
            if (next !== undefined) return next

            const store = await getStore(name)
            const value = await store.get(key).catch(() => null)
            if (value === undefined) return null
            return value
          },
          setItem: async (key: string, value: string) => {
            pending.set(key, value)
            schedule()
          },
          removeItem: async (key: string) => {
            pending.set(key, null)
            schedule()
          },
          clear: async () => {
            pending.clear()
            const store = await getStore(name)
            await store.clear().catch(() => undefined)
          },
          key: async (index: number) => {
            const store = await getStore(name)
            return (await store.keys().catch(() => []))[index]
          },
          getLength: async () => {
            const store = await getStore(name)
            return await store.length().catch(() => 0)
          },
          get length() {
            return api.getLength()
          },
        }

        return api
      }

      return (name = "default.dat") => {
        const cached = apiCache.get(name)
        if (cached) return cached

        const api = createStorage(name)
        apiCache.set(name, api)
        return api
      }
    })(),

    updater: (() => {
      if (!UPDATER_ENABLED) return undefined
      const [state, setState] = createSignal<UpdaterState>({ status: "idle" })
      return {
        state,
        check: async (): Promise<UpdaterState> => {
          setState({ status: "checking" })
          const next = await check().catch(() => null)
          if (!next) {
            const s: UpdaterState = { status: "up-to-date" }
            setState(s)
            return s
          }
          setState({ status: "downloading", version: next.version })
          const ok = await next.download().then(() => true).catch(() => false)
          if (!ok) {
            const s: UpdaterState = { status: "error", message: "Download failed" }
            setState(s)
            return s
          }
          update = next
          const s: UpdaterState = { status: "ready", version: next.version }
          setState(s)
          return s
        },
        install: async (): Promise<void> => {
          if (!update) return
          setState({ status: "installing", version: update.version })
          if (ostype() === "windows") await commands.killSidecar().catch(() => undefined)
          const installed = await update.install().then(() => true).catch(() => false)
          if (!installed) {
            setState({ status: "error", message: "Install failed" })
            return
          }
          await commands.killSidecar().catch(() => undefined)
          await relaunch()
        },
      }
    })(),

    restart: async () => {
      await commands.killSidecar().catch(() => undefined)
      await relaunch()
    },

    notify: async (title, description, href) => {
      const granted = await isPermissionGranted().catch(() => false)
      const permission = granted ? "granted" : await requestPermission().catch(() => "denied")
      if (permission !== "granted") return

      const win = getCurrentWindow()
      const focused = await win.isFocused().catch(() => document.hasFocus())
      if (focused) return

      await Promise.resolve()
        .then(() => {
          const notification = new Notification(title, {
            body: description ?? "",
            icon: "https://opencode.ai/favicon-96x96-v3.png",
          })
          notification.onclick = () => {
            const win = getCurrentWindow()
            void win.show().catch(() => undefined)
            void win.unminimize().catch(() => undefined)
            void win.setFocus().catch(() => undefined)
            handleNotificationClick(href)
            notification.close()
          }
        })
        .catch(() => undefined)
    },

    fetch: (input, init) => {
      if (input instanceof Request) {
        return tauriFetch(input)
      } else {
        return tauriFetch(input, init)
      }
    },

    getPinchZoomEnabled: () => commands.getPinchZoomEnabled().catch(() => false),

    setPinchZoomEnabled: async (enabled) => {
      await commands.setPinchZoomEnabled(enabled).catch(() => undefined)
    },

    getDefaultServer: async () => {
      const url = await commands.getDefaultServerUrl().catch(() => null)
      if (!url) return null
      return ServerConnection.Key.make(url)
    },

    setDefaultServer: async (url: string | null) => {
      await commands.setDefaultServerUrl(url)
    },

    getDisplayBackend: async () => {
      const result = await commands.getDisplayBackend().catch(() => null)
      return result
    },

    setDisplayBackend: async (backend) => {
      await commands.setDisplayBackend(backend)
    },

    parseMarkdown: (markdown: string) => commands.parseMarkdownCommand(markdown),

    webviewZoom,

    checkAppExists: async (appName: string) => {
      return commands.checkAppExists(appName)
    },

    async readClipboardImage() {
      const image = await readImage().catch(() => null)
      if (!image) return null
      const bytes = await image.rgba().catch(() => null)
      if (!bytes || bytes.length === 0) return null
      const size = await image.size().catch(() => null)
      if (!size) return null
      const canvas = document.createElement("canvas")
      canvas.width = size.width
      canvas.height = size.height
      const ctx = canvas.getContext("2d")
      if (!ctx) return null
      const imageData = ctx.createImageData(size.width, size.height)
      imageData.data.set(bytes)
      ctx.putImageData(imageData, 0, 0)
      return new Promise<File | null>((resolve) => {
        canvas.toBlob((blob) => {
          if (!blob) return resolve(null)
          resolve(
            new File([blob], `pasted-image-${Date.now()}.png`, {
              type: "image/png",
            }),
          )
        }, "image/png")
      })
    },
  }
}

let menuTrigger = null as null | ((id: string) => void)
void createMenu((id) => {
  menuTrigger?.(id)
})
void listenForDeepLinks()

function TauriRoot(props: { windowID: string }) {
  const platform = createPlatform(props.windowID)

  const loadLocale = async () => {
    const current = await platform.storage?.("opencode.global.dat").getItem("language")
    const legacy = current ? undefined : await platform.storage?.().getItem("language.v1")
    const raw = current ?? legacy
    if (!raw) return
    const locale = raw.match(/"locale"\s*:\s*"([^"]+)"/)?.[1]
    if (!locale) return
    const next = normalizeLocale(locale)
    if (next !== "en") await loadLocaleDict(next)
    return next satisfies Locale
  }

  // Fetch sidecar credentials from Rust (available immediately, before health check)
  const [sidecar] = createResource(() => commands.awaitInitialization(new Channel<InitStep>() as any))

  const [defaultServer] = createResource(() =>
    platform.getDefaultServer?.().then((url) => {
      if (url) return ServerConnection.key({ type: "http", http: { url } })
    }),
  )
  const [locale] = createResource(loadLocale)

  // Build the sidecar server connection once credentials arrive
  const servers = () => {
    const data = sidecar()
    if (!data) return []
    const http = {
      url: data.url,
      username: data.username ?? undefined,
      password: data.password ?? undefined,
    }
    const server: ServerConnection.Sidecar = {
      displayName: t("desktop.server.local"),
      type: "sidecar",
      variant: "base",
      http,
    }
    return [server] as ServerConnection.Any[]
  }

  const router: Component<BaseRouterProps> = (routerProps) => (
    <DesktopMemoryRouter {...routerProps} windowID={props.windowID} />
  )

  // Gate the app's startup on the first-launch onboarding probe so the initial
  // draft (if any) is opened before the UI settles (parity with Electron).
  const onboarding = Promise.withResolvers<void>()

  function handleClick(e: MouseEvent) {
    const link = (e.target as HTMLElement).closest("a.external-link") as HTMLAnchorElement | null
    if (link?.href) {
      e.preventDefault()
      platform.openLink(link.href)
    }
  }

  function Inner() {
    const cmd = useCommand()
    menuTrigger = (id) => cmd.trigger(id)
    return null
  }

  onMount(() => {
    document.addEventListener("click", handleClick)

    // Liveness heartbeat: the Rust watchdog flags the UI as unresponsive if it
    // stops hearing from us. Ping well within the native stall window.
    void commands.reportAlive().catch(() => undefined)
    const heartbeat = setInterval(() => {
      void commands.reportAlive().catch(() => undefined)
    }, 1000)

    // Keep the native window background in sync with the web UI theme so there
    // is no flash/mismatch on launch, resize, or theme switch (mirrors the
    // Electron app). The theme system toggles attributes on <html>, so observe
    // it and re-read the resolved --background-base (a hex color) on change.
    const syncBackground = () => {
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--background-base").trim()
      if (bg) void commands.setBackgroundColor(bg).catch(() => undefined)
    }
    syncBackground()
    const themeObserver = new MutationObserver(syncBackground)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme", "data-mode"],
    })

    onCleanup(() => {
      document.removeEventListener("click", handleClick)
      clearInterval(heartbeat)
      themeObserver.disconnect()
    })
  })

  return (
    <PlatformProvider value={platform}>
      <AppBaseProviders locale={locale.latest}>
        <Show when={!defaultServer.loading && !sidecar.loading && !locale.loading}>
          {(_) => {
            return (
              <AppInterface
                defaultServer={defaultServer.latest ?? ServerConnection.Key.make("sidecar")}
                servers={servers()}
                router={router}
                startup={onboarding.promise}
                serverScoped={
                  <DesktopFirstLaunchOnboarding
                    initialUrl={getLastActiveUrl(props.windowID ?? "browser")}
                    onLoaded={onboarding.resolve}
                  />
                }
              >
                <Inner />
              </AppInterface>
            )
          }}
        </Show>
      </AppBaseProviders>
    </PlatformProvider>
  )
}

render(() => {
  const [windowID] = createResource(() => commands.getWindowId())
  return (
    <Show when={windowID.latest} fallback={null} keyed>
      {(id) => <TauriRoot windowID={id} />}
    </Show>
  )
}, root!)
