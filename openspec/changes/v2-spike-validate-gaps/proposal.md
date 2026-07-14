# Spike: validate v2 behavior gaps

**KBD change:** change-001 (phase `v2-architecture-alignment`)
**Type:** spike — investigation only, no production code ships from this change
**Blocking:** gates change-002, change-006, change-008

## Why

Our fork carries patches written against opencode **v1**. We are moving to
`upstream/v2`. The assessment established that `packages/opencode` is a frozen V1
reference tree (`AGENTS.md:4`) and that our earlier 19-file patch-port was therefore
meaningless — it applied cleanly *because nothing touches that tree any more*.

Before we build anything on v2, four assumptions must be tested against the **real v2
runtime** (`packages/core`, `packages/llm`), not against greps or the V1 tree. Each
question is falsifiable and each answer changes downstream scope — one can delete a
planned change outright.

We already made the mistake of building on an unverified premise once. This change
exists so we do not make it twice.

## What

Answer four questions with executable evidence, plus take one design decision.

1. **Skill re-invocation loop.** Does it still reproduce on v2? v2's `Instructions`
   delta-renderer (`core/src/skill/guidance.ts:34-57`) may already prevent it, but the
   `skill` tool does not dedupe (`core/src/tool/skill.ts:61-103`).
   → **If it does not reproduce, the fix is deleted from the plan.**

2. **Unbounded agent loop.** Confirm `agentInfo.steps` is undefined by default
   (`core/src/session/runner/llm.ts:196`) so the loop is unbounded. Then confirm the
   zero-patch remedy works: `AgentDraft.update(id, a => { a.steps ??= N })`
   (`plugin/src/v2/effect/agent.ts:6-12`) caps it, **and** that v2's last-step
   tool-disabling (`llm.ts:197,216` — `toolChoice: "none"`) engages.
   → Determines whether change-002 needs a plugin at all, or just config.

3. **openai-compatible `$defs`.** Confirm the rejection is still reachable:
   `llm/src/tool.ts:233-236` emits `$defs`, while `ToolSchemaProjection.openAI`
   (`llm/protocols/utils/tool-schema.ts:48-64`) does not inline `$ref`.
   → This repro **is the evidence for the change-006 upstream PR**. No repro, no PR.

4. **Tauri `Platform` gaps.** Verify the four gaps (`wslServers`, `exportDebugLogs`,
   `recordFatalRendererError`, `runDesktopMenuAction`) against a v2 build rather than
   by grep, since a grep already produced two false positives in the assessment
   (`setDefaultServer` / `setDisplayBackend` are in fact implemented).

5. **Decision:** which hook shape to propose upstream in change-007 — implement the
   already-documented-but-absent `session.hook("request")`, or a narrower
   `skill.guidance` transform.

## Non-goals

- No production code. No commits to `packages/core` or `packages/llm` beyond throwaway
  test scaffolding.
- Not designing the ranking algorithm — that is change-008.

## Success criteria

`spike.md` records, per question: a **verdict** (confirmed / refuted), the **evidence**
(test output, file:line), and the **downstream scope change**. The hook-shape decision
is recorded with its rationale.
