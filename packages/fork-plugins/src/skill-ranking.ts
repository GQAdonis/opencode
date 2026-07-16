import { define } from "@opencode-ai/plugin/v2/effect/plugin"
import { Effect } from "effect"
import { rewriteSystemPart } from "./skill-ranking-core"

export interface Options {
  /** Advertise at most this many skills (the highest-ranked). Omit to show all. */
  readonly maxShown?: number
}

const EMPTY: ReadonlySet<string> = new Set()

/**
 * Extract user-authored text from the conversation, defensively (messages are duck-typed to
 * avoid a direct @opencode-ai/ai dependency): a message's `content` may be a plain string or an
 * array of parts where text parts carry `{ type: "text", text }`.
 */
const userText = (messages: ReadonlyArray<unknown>): string => {
  const out: string[] = []
  for (const message of messages) {
    const m = message as { role?: string; content?: unknown }
    if (m.role !== "user") continue
    if (typeof m.content === "string") {
      out.push(m.content)
      continue
    }
    if (Array.isArray(m.content)) {
      for (const part of m.content) {
        const p = part as { type?: string; text?: unknown }
        if (p.type === "text" && typeof p.text === "string") out.push(p.text)
      }
    }
  }
  return out.join(" ")
}

/**
 * Ranks the `<available_skills>` block by conversation relevance, drops already-loaded skills,
 * and optionally caps the list — from upstream's `session.hook("context")` seam, so
 * `packages/core` stays untouched. See skill-ranking-core.ts for the deterministic ranking core.
 */
export const Plugin = define({
  id: "fork.skill-ranking",
  effect: Effect.fn(function* (ctx) {
    const maxShown = (ctx.options as Options | undefined)?.maxShown

    // Per-session set of skills already loaded via the `skill` tool. Populated from the tool's
    // after-hook, consumed by the context hook so a loaded skill stops being re-advertised.
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

    yield* ctx.session.hook("context", (event) =>
      Effect.sync(() => {
        const loaded = loadedBySession.get(event.sessionID) ?? EMPTY
        const query = userText(event.messages)
        // Upstream's system is SystemPart[]; the <available_skills> block lives inside one text
        // part. Rewrite that part's text; leave every other part (and non-text parts) untouched.
        event.system = event.system.map((part) =>
          part.type === "text" ? { ...part, text: rewriteSystemPart(part.text, query, loaded, maxShown) } : part,
        )
      }),
    )
  }),
})

export default Plugin
