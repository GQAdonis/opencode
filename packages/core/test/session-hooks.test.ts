import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Agent } from "@opencode-ai/schema/agent"
import { Session } from "@opencode-ai/schema/session"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionHooks } from "@opencode-ai/core/session/hooks"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(SessionHooks.node))

const event = (system: string[]): SessionHooks.RequestEvent => ({
  sessionID: Session.ID.make("ses_test"),
  agent: Agent.ID.make("build"),
  messages: [{ role: "user", text: "find the postgres migration" }],
  system,
})

describe("SessionHooks.request", () => {
  it.effect("a registered hook mutates system and the mutation reaches runRequest", () =>
    Effect.gen(function* () {
      const hooks = yield* SessionHooks.Service
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* hooks.hook.request((e) => {
            e.system = e.system.map((part) => (part.includes("<available_skills>") ? "RANKED" : part))
          })
          const result = yield* hooks.runRequest(event(["intro", "<available_skills>...</available_skills>"]))
          expect(result.system).toEqual(["intro", "RANKED"])
        }),
      )
    }),
  )

  it.effect("a hook can read the conversation view", () =>
    Effect.gen(function* () {
      const hooks = yield* SessionHooks.Service
      let seen = ""
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* hooks.hook.request((e) => {
            seen = e.messages.map((m) => m.text).join(" ")
          })
          yield* hooks.runRequest(event(["intro"]))
          expect(seen).toBe("find the postgres migration")
        }),
      )
    }),
  )

  it.effect("multiple hooks run in registration order and compose", () =>
    Effect.gen(function* () {
      const hooks = yield* SessionHooks.Service
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* hooks.hook.request((e) => e.system.push("first"))
          yield* hooks.hook.request((e) => {
            // The second hook observes the first's mutation.
            if (e.system.includes("first")) e.system.push("second")
          })
          const result = yield* hooks.runRequest(event(["base"]))
          expect(result.system).toEqual(["base", "first", "second"])
        }),
      )
    }),
  )

  it.effect("an unregistered (disposed) hook no longer runs", () =>
    Effect.gen(function* () {
      const hooks = yield* SessionHooks.Service
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* hooks.hook.request((e) => e.system.push("temp"))
        }),
      )
      // Scope closed → the hook's finalizer removed it.
      const result = yield* hooks.runRequest(event(["base"]))
      expect(result.system).toEqual(["base"])
    }),
  )
})
