import type { SessionApi } from "@opencode-ai/client/effect/api"
import type { Hooks } from "./registration.js"

/** A read-only projection of one conversation message. */
export interface SessionMessageView {
  readonly role: string
  readonly text: string
}

/**
 * Fires once per model request, immediately before dispatch. `system` is mutable — rewrite or
 * reorder its entries to change what the model sees (e.g. the `<available_skills>` block).
 * `messages` is a read-only conversation view for scoring decisions.
 */
export interface SessionRequestEvent {
  readonly sessionID: string
  readonly agent: string
  readonly messages: ReadonlyArray<SessionMessageView>
  system: string[]
}

export interface SessionHooks {
  readonly request: SessionRequestEvent
}

export interface SessionDomain
  extends Pick<SessionApi<unknown>, "create" | "get" | "prompt" | "command" | "interrupt"> {
  readonly hook: Hooks<SessionHooks>
}
