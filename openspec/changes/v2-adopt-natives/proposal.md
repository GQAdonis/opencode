# Adopt v2 natives; retire three v1 patches

**KBD change:** change-002 (phase `v2-architecture-alignment`)
**Depends on:** change-001 (spike) — verdicts below are all spike-confirmed

## Why

Our fork carried three v1 patches. The spike (change-001) established that **none of
them should be ported**:

| v1 patch | Spike verdict | Disposition |
|---|---|---|
| `skills.exclude` config | v2 does this natively via the **permission ruleset** (`core/src/skill.ts:38` — `PermissionV2.evaluate("skill", id, agent.permissions).effect !== "deny"`). v2's `Config.Info.skills` is a flat `string[]` and *cannot* carry our object shape anyway. | **Drop.** Migrate to `permissions` rules. |
| Terminate agent loop on hard error | v2 has an exhaustive retryable/terminal taxonomy with a `never` exhaustiveness check (`session/runner/retry.ts:19-38`) and bounded retries (`Schedule.take(4)`). Hard errors already propagate. | **Drop.** Already solved. |
| `DEFAULT_MAX_STEPS` loop cap | v2 is genuinely unbounded (proven: 26 steps, `isLastStep` false every time). BUT the cap is reachable with **zero core edits** via `ctx.agent.transform`. And v2's last-step enforcement (`tools: []`, `toolChoice: "none"`, force-failed tool calls) is **strictly better** than our patch, which only injected a prompt. | **Reimplement as a plugin.** |

**Scope correction:** the plan described this change as "delete three patches". That is a
misnomer — the patches only ever existed on `dev` and were never applied to the `v2`
branch. Nothing is deleted here. The decision *not to port* them is the substance, and the
only **code** deliverable is the loop-cap plugin.

## What

1. **New fork-owned package `packages/fork-plugins`** — additive, no core edits. This is
   where all fork behavior lives from now on, keeping upstream sync cheap.
2. **`agent-steps` plugin** — caps the agent loop via
   `ctx.agent.transform(draft => draft.update(id, a => { a.steps ??= cap }))`.
   `??=` defers to any agent that configured its own `steps`.
3. **Document the `skills.exclude` → `permissions` migration** for fork users.

## Non-goals

- The skill re-invocation loop fix. The spike **refuted** the hope that this change would
  absorb it (v2 does not track loaded skills at all) — it moves to change-008.
- Any edit to `packages/core`, `packages/llm`, or `packages/schema`.

## Success criteria

- A runaway tool-call loop terminates at the configured cap, and v2's last-step tool
  disabling engages (`tools: []` + `toolChoice: "none"`).
- An agent with its own `steps` is not overridden.
- Zero diff against `upstream/v2` outside `packages/fork-plugins` and config.
