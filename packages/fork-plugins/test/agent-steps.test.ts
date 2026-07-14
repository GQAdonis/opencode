import { describe, expect, test } from "bun:test"
import { Effect, Scope } from "effect"
import { Plugin, type Options } from "../src/agent-steps"

const DEFAULT_MAX_STEPS = 1000

type Agent = { id: string; steps?: number }

/**
 * Minimal stand-in for the plugin Context. `transform` is the real contract
 * (`Transform<AgentDraft>` — a sync void callback over the draft), so the plugin exercises
 * the same surface `ctx.agent.transform` gives it at runtime.
 *
 * The end-to-end proof that this seam actually bounds the runner lives in the change-001
 * spike: with the cap applied through this same transform, a model emitting tool calls
 * forever was cut off at exactly the cap, the final request carried `tools: []` +
 * `toolChoice: "none"`, and a tool call on that step never executed.
 */
const run = (agents: Agent[], options?: Options) => {
  const draft = {
    list: () => agents,
    get: (id: string) => agents.find((a) => a.id === id),
    default: () => {},
    remove: () => {},
    update: (id: string, update: (agent: Agent) => void) => {
      const agent = agents.find((a) => a.id === id)
      if (agent) update(agent)
    },
  }

  const ctx = {
    options,
    agent: {
      transform: (callback: (input: typeof draft) => void) =>
        Effect.sync(() => {
          callback(draft)
          return { dispose: Effect.void }
        }),
    },
  }

  return Effect.runPromise(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Effect.scoped(Plugin.effect(ctx as any) as Effect.Effect<void, never, Scope.Scope>),
  ).then(() => agents)
}

describe("fork.agent-steps", () => {
  test("applies the default cap to an agent that has no steps configured", async () => {
    const agents = await run([{ id: "build" }, { id: "plan" }])
    expect(agents.map((a) => a.steps)).toEqual([DEFAULT_MAX_STEPS, DEFAULT_MAX_STEPS])
  })

  test("an agent's own steps value wins over the plugin default", async () => {
    const agents = await run([{ id: "build", steps: 2 }, { id: "plan" }])
    // `??=` must defer to the explicitly configured agent.
    expect(agents.find((a) => a.id === "build")?.steps).toBe(2)
    expect(agents.find((a) => a.id === "plan")?.steps).toBe(DEFAULT_MAX_STEPS)
  })

  test("honors a cap supplied via plugin options", async () => {
    const agents = await run([{ id: "build" }], { steps: 7 })
    expect(agents[0]?.steps).toBe(7)
  })

  test("ignores a nonsensical option and falls back to the default", async () => {
    const agents = await run([{ id: "build" }], { steps: 0 })
    expect(agents[0]?.steps).toBe(DEFAULT_MAX_STEPS)
  })
})
