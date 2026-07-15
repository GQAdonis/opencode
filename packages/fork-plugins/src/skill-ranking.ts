import { define } from "@opencode-ai/plugin/v2/effect/plugin"
import { Effect } from "effect"
import { rewriteSystemPart } from "./skill-ranking-core"

export interface Options {
  /** Advertise at most this many skills (the highest-ranked). Omit to show all. */
  readonly maxShown?: number
}

const EMPTY: ReadonlySet<string> = new Set()

/**
 * Ranks the `<available_skills>` block by conversation relevance, drops already-loaded skills,
 * and optionally caps the list — all from the `session.hook("request")` seam, so `packages/core`
 * stays untouched. See skill-ranking-core.ts for the deterministic ranking core.
 */
export const Plugin = define({
  id: "fork.skill-ranking",
  effect: Effect.fn(function* (ctx) {
    const maxShown = (ctx.options as Options | undefined)?.maxShown

    // Per-session set of skills already loaded via the `skill` tool. Populated from the tool's
    // after-hook, consumed by the request hook so a loaded skill stops being re-advertised.
    const loadedBySession = new Map<string, Set<string>>()

    yield* ctx.tool.hook("execute.after", (event) =>
      Effect.sync(() => {
        if (event.tool !== "skill") return
        const id = (event.input as { id?: unknown } | undefined)?.id
        if (typeof id !== "string") return
        const set = loadedBySession.get(event.sessionID) ?? new Set<string>()
        set.add(id)
        loadedBySession.set(event.sessionID, set)
      }),
    )

    yield* ctx.session.hook("request", (event) =>
      Effect.sync(() => {
        const loaded = loadedBySession.get(event.sessionID) ?? EMPTY
        const query = event.messages
          .filter((message) => message.role === "user")
          .map((message) => message.text)
          .join(" ")
        event.system = event.system.map((part) => rewriteSystemPart(part, query, loaded, maxShown))
      }),
    )
  }),
})

export default Plugin
