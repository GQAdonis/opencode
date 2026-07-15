export * as SessionHooks from "./hooks"

import { makeLocationNode } from "../effect/app-node"
import { Agent } from "@opencode-ai/schema/agent"
import { Session } from "@opencode-ai/schema/session"
import { State } from "../state"
import { Context, Effect, Layer, Scope } from "effect"

/** A read-only projection of one conversation message, safe to hand to plugins. */
export interface MessageView {
  readonly role: string
  readonly text: string
}

/**
 * Fires once per model request, immediately before dispatch. `system` is mutable: a plugin may
 * rewrite or reorder its entries to change what the model sees (the `<available_skills>` block
 * lives here, so this is the seam skill ranking uses). `messages` is a read-only conversation
 * view for scoring decisions.
 */
export interface RequestEvent {
  readonly sessionID: Session.ID
  readonly agent: Agent.ID
  readonly messages: ReadonlyArray<MessageView>
  system: string[]
}

export interface Interface {
  readonly hook: {
    readonly request: (
      callback: (event: RequestEvent) => Effect.Effect<void> | void,
    ) => Effect.Effect<State.Registration, never, Scope.Scope>
  }
  readonly runRequest: (event: RequestEvent) => Effect.Effect<RequestEvent>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/SessionHooks") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    let requestHooks: ((event: RequestEvent) => Effect.Effect<void> | void)[] = []

    const register = <Event>(
      hooks: () => ((event: Event) => Effect.Effect<void> | void)[],
      update: (hooks: ((event: Event) => Effect.Effect<void> | void)[]) => void,
    ) =>
      Effect.fn("SessionHooks.hook")(function* (callback: (event: Event) => Effect.Effect<void> | void) {
        const scope = yield* Scope.Scope
        let active = true
        update([...hooks(), callback])
        const dispose = Effect.sync(() => {
          if (!active) return
          active = false
          update(hooks().filter((item) => item !== callback))
        })
        yield* Scope.addFinalizer(scope, dispose)
        return { dispose }
      })

    const run = Effect.fnUntraced(function* <Event>(
      hooks: readonly ((event: Event) => Effect.Effect<void> | void)[],
      event: Event,
    ) {
      for (const hook of hooks) {
        const result = hook(event)
        if (Effect.isEffect(result)) yield* result
      }
      return event
    })

    return Service.of({
      hook: {
        request: register(
          () => requestHooks,
          (next) => (requestHooks = next),
        ),
      },
      runRequest: (event) => run(requestHooks, event),
    })
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [] })
