# Implement the documented `session.hook("request")`

**KBD change:** change-007 (phase `v2-architecture-alignment`) — the phase's central blocker.
**Shape:** upstream PR (touches `packages/core` + `packages/plugin`). Not a fork feature — it
**implements an API upstream already documents but never wired**, so it is a clean "make the
docs true" contribution. Carried on our branch until accepted.
**Unblocks:** change-008 (skill ranking as a plugin).

## Why

The spike (change-001) established the blocker: the only place that decides which skills the
model sees is `SkillGuidance.load` (`core/src/skill/guidance.ts`), it sorts alphabetically, it
has **no hook**, and its signature takes no session context. Plugins can add skill *sources*
but cannot rank/cap/filter the advertised list.

The spike also found the exit: the `<available_skills>` block is delivered in the **system
prompt** (`request.system`, proven end-to-end). And upstream **already documents** a hook that
exposes the request's mutable `system` before dispatch:

```ts
// packages/plugin/src/v2/effect/README.md
ctx.session.hook("request", (event) => { ... })
```

But `SessionDomain` (`plugin/v2/effect/session.ts`) exposes only API methods — no `hook` — and
core's hook wiring only knows `aisdk` + `tool`. **The documented API does not exist.** This
change implements it.

Once it exists, change-008 ranks/caps/filters the `<available_skills>` block from a plugin,
with **zero further core edits** — restoring the phase's zero-divergence goal.

## What

Mirror the existing `ToolHooks` service pattern exactly:

1. **`packages/core/src/session/hooks.ts`** (new) — `SessionHooks` service with a `request`
   hook (register) + `runRequest` (trigger), following `core/src/tool/hooks.ts` line for line.
2. **`packages/plugin/src/v2/effect/session.ts`** — add `SessionRequestEvent`, `SessionHooks`,
   and `hook: Hooks<SessionHooks>` on `SessionDomain`.
3. **`packages/core/src/plugin.ts`** — register `SessionHooks.node`.
4. **`packages/core/src/plugin/host.ts`** — bridge `ctx.session.hook("request", cb)` into the
   service, copying mutated fields back (same shape as the tool-hook bridge).
5. **`packages/core/src/session/runner/llm.ts`** — build the event, fire `runRequest` right
   before `LLM.request(...)`, and apply the (possibly mutated) `system`.
6. Update the plugin README so its example matches the implemented event shape.

### The event (minimal, plugin-safe, faithful)

```ts
interface SessionRequestEvent {
  readonly sessionID: string
  readonly agent: string
  // Plain-text conversation view for scoring decisions (each message's discriminant + text).
  readonly messages: ReadonlyArray<{ readonly role: string; readonly text: string }>
  // The system prompt parts. MUTABLE: rewrite/reorder to change what the model sees
  // (this is where <available_skills> lives).
  system: string[]
}
```

Design decisions, made deliberately:
- **`system` is the mutable surface**, exposed as plain strings (rebuilt into `SystemPart`s
  after the hook). It is exactly what skill ranking needs and what the README emphasizes.
- **`messages` is a read-only `{role, text}` projection**, not raw LLM messages: the plugin
  package does not depend on `@opencode-ai/llm`, so exposing that type would couple it. The
  projection is enough to score skills against the conversation.
- **`tools` mutation is intentionally NOT included.** `ToolDefinition` is a frozen `Schema.Class`,
  the ranking use case does not touch tools (skills live in `system`, per the spike), and a
  faithful tools-record surface is a larger change. The README's tools example is updated to
  the implemented shape rather than shipping an unused, risky surface. A follow-up can add it.

## Success criteria

- A plugin can register `ctx.session.hook("request", cb)`, mutate `event.system`, and the
  model receives the mutated system prompt.
- Read-only `messages` and `agent`/`sessionID` are populated.
- `packages/core` + `packages/plugin` typecheck; a test proves the mutation reaches dispatch.
- The README example matches the implemented shape.
