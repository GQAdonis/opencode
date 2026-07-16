import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionHooks } from "@opencode-ai/core/session/hooks"
import { ToolHooks } from "@opencode-ai/core/tool/hooks"
import { Plugin } from "../src/skill-ranking"

// Integration test: runs the REAL fork.skill-ranking plugin effect against the REAL
// SessionHooks + ToolHooks services, wired through a ctx that mirrors the host bridge in
// packages/core/src/plugin/host.ts. This closes the gap the unit tests left open — that the
// plugin's ctx.session.hook / ctx.tool.hook registrations flow through the bridge into the hook
// services and mutate a real runRequest event.
//
// Only the ctx object is a stand-in (the real host builds a much larger context). The hook
// registration, the copy-back semantics, and runRequest/runAfter are the production code paths.

const Layers = LayerNode.compile(LayerNode.group([SessionHooks.node, ToolHooks.node])) as Layer.Layer<
  SessionHooks.Service | ToolHooks.Service
>

// Mirror of the host-bridge wiring for the two hooks this plugin uses (host.ts session.hook /
// tool.hook "execute.after" branches), so the plugin registers against the real services.
const makeCtx = (sessionHooks: SessionHooks.Interface, toolHooks: ToolHooks.Interface, options?: unknown) =>
  ({
    options,
    session: {
      hook: (_name: string, callback: (event: SessionHooks.RequestEvent) => Effect.Effect<void>) =>
        sessionHooks.hook.request((event) => {
          const output = { sessionID: event.sessionID, agent: event.agent, messages: event.messages, system: event.system }
          return callback(output).pipe(Effect.tap(() => Effect.sync(() => (event.system = output.system))))
        }),
    },
    tool: {
      hook: (_name: string, callback: (event: ToolHooks.AfterEvent) => Effect.Effect<void>) =>
        toolHooks.hook.after((event) => callback(event)),
    },
  }) as unknown as Parameters<typeof Plugin.effect>[0]

const AVAILABLE = [
  "Skills provide specialized instructions and workflows for specific tasks.",
  "<available_skills>",
  "  <skill>",
  "    <id>postgres-helper</id>",
  "    <name>Postgres Helper</name>",
  "    <description>PostgreSQL queries and migration</description>",
  "  </skill>",
  "  <skill>",
  "    <id>seo-audit</id>",
  "    <name>SEO Audit</name>",
  "    <description>search rankings and page optimization</description>",
  "  </skill>",
  "</available_skills>",
].join("\n")

const requestEvent = (system: string[], text: string): SessionHooks.RequestEvent =>
  ({
    sessionID: "ses_it",
    agent: "build",
    messages: [{ role: "user", text }],
    system,
  }) as unknown as SessionHooks.RequestEvent

const idsInBlock = (system: string) => [...system.matchAll(/<id>(.*?)<\/id>/g)].map((m) => m[1])

const run = <A>(body: (s: SessionHooks.Interface, t: ToolHooks.Interface) => Effect.Effect<A>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const sessionHooks = yield* SessionHooks.Service
        const toolHooks = yield* ToolHooks.Service
        return yield* body(sessionHooks, toolHooks)
      }),
    ).pipe(Effect.provide(Layers)),
  )

describe("fork.skill-ranking (integration)", () => {
  test("the loaded plugin reorders the available_skills block by relevance", async () => {
    const ids = await run((sessionHooks, toolHooks) =>
      Effect.gen(function* () {
        yield* Plugin.effect(makeCtx(sessionHooks, toolHooks))
        const result = yield* sessionHooks.runRequest(requestEvent([AVAILABLE], "help with a postgres migration"))
        return idsInBlock(result.system[0])
      }),
    )
    expect(ids).toEqual(["postgres-helper", "seo-audit"])
  })

  test("a skill loaded via the tool hook is filtered out of a later request", async () => {
    const ids = await run((sessionHooks, toolHooks) =>
      Effect.gen(function* () {
        yield* Plugin.effect(makeCtx(sessionHooks, toolHooks))
        yield* toolHooks.runAfter({
          tool: "skill",
          sessionID: "ses_it",
          agent: "build",
          assistantMessageID: "msg_it",
          toolCallID: "call_it",
          input: { id: "postgres-helper" },
          result: undefined as never,
        } as unknown as ToolHooks.AfterEvent)
        const result = yield* sessionHooks.runRequest(requestEvent([AVAILABLE], "more postgres work"))
        return idsInBlock(result.system[0])
      }),
    )
    expect(ids).not.toContain("postgres-helper")
    expect(ids).toContain("seo-audit")
  })

  test("maxShown caps the advertised list", async () => {
    const ids = await run((sessionHooks, toolHooks) =>
      Effect.gen(function* () {
        yield* Plugin.effect(makeCtx(sessionHooks, toolHooks, { maxShown: 1 }))
        const result = yield* sessionHooks.runRequest(requestEvent([AVAILABLE], "postgres migration"))
        return idsInBlock(result.system[0])
      }),
    )
    expect(ids).toEqual(["postgres-helper"])
  })
})
