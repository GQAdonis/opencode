import {
  ServerConnection,
  useLayout,
  useProviders,
  useServer,
  useServerSDK,
  useServerSync,
  useTabs,
} from "@opencode-ai/app"
import { onMount, startTransition } from "solid-js"
import { commands } from "./bindings"

// Port of the Electron desktop app's DesktopFirstLaunchOnboarding. The only
// divergence is the native bridge: Electron calls window.api.* (its preload),
// while Tauri invokes the equivalent Rust commands. Keep this in sync with
// packages/desktop/src/renderer/onboarding.tsx.
export function DesktopFirstLaunchOnboarding(props: { initialUrl: string; onLoaded: () => void }) {
  const server = useServer()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const layout = useLayout()
  const providers = useProviders()
  const tabs = useTabs()

  onMount(() => {
    void runFirstLaunchOnboarding().finally(props.onLoaded)
  })

  async function runFirstLaunchOnboarding() {
    try {
      await Promise.all(
        [server.ready.promise, layout.ready.promise, tabs.ready.promise, tabs.recentReady.promise].map(
          (p) => p ?? Promise.resolve(),
        ),
      )
      if (!server.isLocal()) return

      const pending = await commands.isFirstLaunchOnboardingPending()
      if (!pending) return

      const sessions = await serverSDK()
        .client.session.list()
        .then((x) => x.data ?? [])
        .catch(() => undefined)
      const connectedProviders = providers.connected()
      const paidProviders = providers.paid()
      const persistedProjects = layout.projects.list()
      const shouldTrigger =
        props.initialUrl === "/" &&
        sessions?.length === 0 &&
        paidProviders.length === 0 &&
        persistedProjects.length === 0 &&
        tabs.store.length === 0 &&
        server.list.every(ServerConnection.builtin)

      console.info("[desktop-onboarding] first launch onboarding evaluated", {
        pending,
        shouldTrigger,
        initialUrl: props.initialUrl,
        sessions: sessions?.length,
        connectedProviders: connectedProviders.length,
        paidProviders: paidProviders.length,
        serverProjects: serverSync().data.project.length,
        persistedProjects: persistedProjects.length,
        tabs: tabs.store.length,
        servers: server.list.map(ServerConnection.key),
      })

      const directory = await commands.finishFirstLaunchOnboarding(shouldTrigger)
      if (!shouldTrigger || !directory) return

      console.info("[desktop-onboarding] starting first launch draft", { directory })
      server.projects.open(directory)
      server.projects.touch(directory)
      await startTransition(() => {
        tabs.newDraft({ server: server.key, directory })
      })
    } catch (error) {
      console.error("[desktop-onboarding] first launch onboarding failed", error)
    }
  }

  return null
}
