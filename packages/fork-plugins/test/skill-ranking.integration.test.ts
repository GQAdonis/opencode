import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { PluginHooks } from "@opencode-ai/core/plugin/hooks"
import { ToolHooks } from "@opencode-ai/core/tool/hooks"
import { Plugin } from "../src/skill-ranking"

// Integration test: runs the REAL fork.skill-ranking plugin effect against upstream's REAL hook
// machinery — the generic PluginHooks (session "context" domain) and ToolHooks (execute.after) —
// wired through a ctx that mirrors the host bridge in packages/core/src/plugin/host.ts:
//   session.hook(name, cb) -> hooks.register("session", name, cb)
//   tool.hook("execute.after", cb) -> toolHooks.hook.after(cb)
// Only the ctx object is a stand-in; registration, PluginHooks.trigger, and ToolHooks.runAfter
// are the production code paths the runner uses (llm.ts fires hooks.trigger("session","context")).

const Layers = LayerNode.compile(LayerNode.group([PluginHooks.node, ToolHooks.node])) as Layer.Layer<
  PluginHooks.Service | ToolHooks.Service
>

const makeCtx = (hooks: PluginHooks.Interface, toolHooks: ToolHooks.Interface, options?: unknown) =>
  ({
    options,
    session: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hook: (name: any, callback: any) => hooks.register("session", name, callback),
    },
    tool: {
      hook: (_name: string, callback: (event: ToolHooks.AfterEvent) => Effect.Effect<void>) =>
        toolHooks.hook.after((event) => callback(event)),
    },
  }) as unknown as Parameters<typeof Plugin.effect>[0]

const skillsBlock = [
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

// A SessionContext (SessionHooks["context"]) with the skills block in one text system part.
const contextEvent = (text: string) =>
  ({
    sessionID: "ses_it",
    agent: "build",
    model: { providerID: "openai", modelID: "gpt-5" },
    system: [{ type: "text", text: skillsBlock }],
    messages: [{ role: "user", content: [{ type: "text", text }] }],
    tools: {},
  }) as any

const idsIn = (system: ReadonlyArray<{ text: string }>) =>
  [...system[0].text.matchAll(/<id>(.*?)<\/id>/g)].map((m) => m[1])

const run = <A>(body: (h: PluginHooks.Interface, t: ToolHooks.Interface) => Effect.Effect<A>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const hooks = yield* PluginHooks.Service
        const toolHooks = yield* ToolHooks.Service
        return yield* body(hooks, toolHooks)
      }),
    ).pipe(Effect.provide(Layers)),
  )

describe("fork.skill-ranking (integration, upstream PluginHooks)", () => {
  test("the loaded plugin reorders the available_skills block by relevance", async () => {
    const ids = await run((hooks, toolHooks) =>
      Effect.gen(function* () {
        yield* Plugin.effect(makeCtx(hooks, toolHooks))
        const event = contextEvent("help with a postgres migration")
        yield* hooks.trigger("session", "context", event)
        return idsIn(event.system)
      }),
    )
    expect(ids).toEqual(["postgres-helper", "seo-audit"])
  })

  test("a skill loaded via the tool hook is filtered out of a later context", async () => {
    const ids = await run((hooks, toolHooks) =>
      Effect.gen(function* () {
        yield* Plugin.effect(makeCtx(hooks, toolHooks))
        yield* toolHooks.runAfter({
          tool: "skill",
          sessionID: "ses_it",
          agent: "build",
          assistantMessageID: "msg_it",
          toolCallID: "call_it",
          input: { id: "postgres-helper" },
          result: undefined as never,
        } as unknown as ToolHooks.AfterEvent)
        const event = contextEvent("more postgres work")
        yield* hooks.trigger("session", "context", event)
        return idsIn(event.system)
      }),
    )
    expect(ids).not.toContain("postgres-helper")
    expect(ids).toContain("seo-audit")
  })

  test("maxShown caps the advertised list", async () => {
    const ids = await run((hooks, toolHooks) =>
      Effect.gen(function* () {
        yield* Plugin.effect(makeCtx(hooks, toolHooks, { maxShown: 1 }))
        const event = contextEvent("postgres migration")
        yield* hooks.trigger("session", "context", event)
        return idsIn(event.system)
      }),
    )
    expect(ids).toEqual(["postgres-helper"])
  })
})
