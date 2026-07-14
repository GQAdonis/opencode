import { define } from "@opencode-ai/plugin/v2/effect/plugin"
import { Effect } from "effect"

/**
 * Upstream leaves `steps` unset on every agent, and the runner's only termination guard is
 * `agentInfo.steps !== undefined && currentStep >= agentInfo.steps`. With `steps` undefined
 * that guard never fires, so a model which keeps emitting tool calls loops forever.
 *
 * Reaching the cap is not merely advisory: the runner drops the tool list, sends
 * `toolChoice: "none"`, and force-fails any tool call the model emits anyway.
 */
const DEFAULT_MAX_STEPS = 1000

export interface Options {
  /** Cap applied to agents that do not configure their own `steps`. */
  readonly steps?: number
}

export const Plugin = define({
  id: "fork.agent-steps",
  effect: Effect.fn(function* (ctx) {
    const configured = (ctx.options as Options | undefined)?.steps
    const cap = typeof configured === "number" && configured > 0 ? configured : DEFAULT_MAX_STEPS

    yield* ctx.agent.transform((draft) => {
      for (const agent of draft.list()) {
        // `??=` so an agent that sets its own `steps` always wins over this default.
        draft.update(agent.id, (item) => {
          item.steps ??= cap
        })
      }
    })
  }),
})

export default Plugin
