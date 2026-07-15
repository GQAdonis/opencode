# Spike report — change-001 (v2-spike-validate-gaps)

**Date:** 2026-07-14
**Branch:** `v2` @ `aa8fc4234d`
**Status:** complete — all four questions answered with executable evidence

Evidence artifacts (throwaway; **delete before any merge**):
- `packages/llm/test/spike-defs-inlining.test.ts` (2 pass)
- `packages/core/test/spike-skill-loop.test.ts` (2 pass, 16 assertions)
- `packages/core/test/spike-agent-steps.test.ts` (5 pass, 26 assertions)
- fixture dir `packages/core/.spike-skills/`

---

## Q1 — Skill re-invocation loop: **CONFIRMED. Our fix still has a job.**

I expected v2's Instructions delta-renderer to have made this obsolete. **It has not.** The
distinction I had glossed over is the entire answer:

> The delta-renderer suppresses re-listing an **unchanged list**. It does nothing about an
> **already-loaded skill**. Those are different things, and only the second one matters.

**v2 does not track loaded skills at all.**

- `SkillGuidance.load` (`core/src/skill/guidance.ts:60`) is
  `(agent: AgentV2.Selection) => Effect<Instructions>` — **no session parameter, no
  loaded-set, no ledger**. Its output is a pure function of the permitted skill list.
  Loading a skill does not change what it returns (asserted: read → settle the real `skill`
  tool → re-read → byte-identical; `Instructions.diff` yields `delta === {}`).
- Driven through the **real runner**: a skill loaded on step 1 is still in
  `<available_skills>` on steps 2 and 3. The block lives in **`request.system`** (asserted
  present in `request.system`, absent from `request.messages`, all 3 steps), which is
  rebuilt and re-sent every step. The model is re-told about the loaded skill every turn —
  exactly the v1 pressure.
- The `changed` renderer (`guidance.ts:34-57`) never fires here: the hash is unchanged, so
  `instructions/index.ts:154` short-circuits. It only speaks when skills are added / removed
  / edited. **It is orthogonal to the loop.**
- `core/src/tool/skill.ts:61-103` has **no dedupe** — a second `skill(id)` call re-injects
  the full `<skill_content>` verbatim (asserted: exactly 2 occurrences).

**Correction to the sub-agent's report:** it claimed *nothing* publishes
`session.skill.activated`. That is too strong. `SessionV2.skill()`
(`core/src/session.ts:628-648`) **does** publish it — that is the *explicit* activation path
(slash command / UI). What is true, and sharper:

> The event, its publisher, its projector (`session/projector.ts:676`) and its consumer
> (`session/message-updater.ts:194`) **all exist and work**. The **model-facing skill tool
> simply does not participate** — zero references in `tool/skill.ts`.

That reframes the fix from "build new machinery" to "make the tool consistent with the
slash path" — a far easier upstream sell.

**Downstream:** the fix survives, but as *new state*, not a tweak. **change-002 does NOT
absorb it.**

---

## Q2 — Agent loop cap: **ZERO CORE EDITS. Confirmed.**

**(a) Default is genuinely unbounded.** `Agent.Info.empty("build").steps === undefined`.
Driven through the real runner with a model that calls a tool forever: `isLastStep`
(`runner/llm.ts:196`) was false on **every one of 26 steps**; all 26 requests kept
`toolChoice === undefined` and a non-empty `tools` array. The loop only stopped because the
*fake model* gave up — the runner never would have.

**(b) The plugin remedy works.** `AgentV2.Draft.update` hands back
`Types.DeepMutable<Info>`, and `Service.transform` is the same `State.Transformable` that
plugins reach via `ctx.agent.transform`. The literal plugin idiom —
`draft.update(agent.id, a => { a.steps ??= cap })` — caps the same runaway model at exactly
`cap` requests. `??=` correctly defers to an agent that configured its own `steps`.
Upstream's own tests use this seam (`test/session-runner.test.ts:3598,3633,3894`), so it is
load-bearing and unlikely to regress.

**(c) v2's enforcement beats our v1 patch.** v1 injected a prompt and hoped. v2 *enforces*:
last step sets `tools: []` + `toolChoice: {type:"none"}` (`llm.ts:197,216-217`) and
**force-fails** a disobedient tool call (`llm.ts:251-258`). Asserted end-to-end: the
disobedient call never executed and landed in context as `status: "error"`.

**Downstream:** **delete** the v1 `maxSteps` patch. Ship a ~5-line plugin (or document the
`steps` config key). We inherit *better* enforcement than the patch gave us.

---

## Q3 — openai-compatible `$defs`: **CONFIRMED. Real bug, still reachable.**

- v2's `toJsonSchema` (`llm/src/tool.ts:232-236`) emits `$defs` + `$ref` for a reused struct:
  `"origin": {"$ref": "#/$defs/Point"}`.
- `ToolSchemaProjection.openAI` (`llm/protocols/utils/tool-schema.ts:48-64`) spreads
  `...schema` (so `$defs` survives) and `removeNullSchemas` only touches `anyOf` —
  **`$ref` is never inlined**.
- `openai-compatible-chat` reuses `OpenAIChat.protocol` **verbatim**
  (`protocols/openai-compatible-chat.ts:17-23`), so that projection is the *only* one applied.

⇒ DeepSeek / MiniMax receive an unresolved `$ref` → "Error resolving schema reference".

**Downstream:** **change-006 proceeds** as an upstream bug-fix PR. This test is its evidence.
Note the *original* v1 cause (ai-sdk `npm`-string dispatch) is genuinely gone in v2 — this is
a different, narrower bug in the same place.

---

## Q4 — Tauri `Platform` gaps: **all four CONFIRMED. No new gaps.**

Both earlier grep false-positives (`setDefaultServer`, `setDisplayBackend`) stay **retracted** —
they are implemented. Tauri's `createPlatform` is a single object literal
(`desktop-tauri/src/index.tsx:157-516`, no spreads), so absence from it is dispositive.

| Gap | Effort | User-visible impact |
|---|---|---|
| `exportDebugLogs` | **ONE LINE** | Rust command (`logging.rs:71`), invoke registration (`lib.rs:603`), and TS binding (`bindings.ts:30`) **all already exist**. Only the Platform property is missing. Lights up `logs.export` (`app.tsx:293`) + the crash-screen button (`error.tsx:302`). |
| `runDesktopMenuAction` | moderate | **Worst failure mode.** Windows/Linux only: every *action*-typed menu entry is a dead click (reload, devtools, all zoom, fullscreen, window ops, undo/redo/cut/copy/paste) while *command*-typed entries still work — so the menu looks **half-functional**. macOS unaffected (real native menu). |
| `recordFatalRendererError` | small | Fatal renderer errors never persisted to native logs. Needs a new Rust command + binding regen. |
| `wslServers` | **large — a whole Rust subsystem** | `WslServersPlatform` needs **11 methods**; Tauri exposes 3 WSL-adjacent commands; Electron implements it as 6 modules. **Not a wiring gap.** Windows-only, degrades gracefully — except `wsl/dialog-add-server.tsx:259` uses `platform.wslServers!` (non-null assertion → would throw if reached). |

**Downstream:** **change-004 must be SPLIT.** My plan bundled a one-line fix with a
multi-week Rust port and called it "cheapest first". `wslServers` becomes its own change and
is deferrable (Windows-only).

---

## Decision (task 6) — the change-007 hook shape

**Chosen: implement the already-documented `session.hook("request")`.**

Rationale:

1. **Q1 made it viable.** The `<available_skills>` block is proven to land in
   **`request.system`** (`runner/llm.ts:209`), which the documented hook exposes as mutable
   immediately before dispatch. So one hook lets a plugin do **all three** of our skill needs —
   rank, cap to top-K, and filter already-loaded skills — with **no further core edits**.
2. **Easiest upstream sell.** It is already specified at v2.opencode.ai and in two in-repo
   READMEs (`plugin/src/v2/effect/README.md:87`), but absent from
   `core/src/plugin/hooks.ts:9-12` (only `aisdk` + `tool` domains exist). The PR is
   *"implement what you already documented"*, not *"add a hook for my use case"*.
3. **General, not bespoke.** A `skill.guidance` transform would serve only us; the session
   hook serves every plugin author and matches upstream's stated intent.

**Trade-off, stated honestly:** the hook exposes `system` as a **string/array**, so a plugin
manipulates the rendered `<available_skills>` block textually rather than filtering a
structured list. That is more brittle than a typed `skill.guidance` transform. Accepted
because it needs **zero** further core surface and matches upstream's own design. If it
proves too fragile in change-008, fall back to the typed transform.

**Paired micro-PR:** have the **skill tool publish `session.skill.activated`**
(`tool/skill.ts`), matching what `SessionV2.skill()` already does at `session.ts:635`. Tiny,
obviously correct, makes an already-wired event work for the tool path — and gives our plugin
a durable loaded-skill ledger to filter against.

---

## Re-scoping of the plan

| Change | Before spike | After spike |
|---|---|---|
| **002** Adopt v2 natives | delete 3 patches (exclude, terminal-error, loop cap) — *and maybe the skill loop* | **Confirmed for exclude + terminal-error + loop cap.** Loop cap = ~5-line plugin. **The skill loop is NOT absorbed here** (Q1 refuted that hope) — it moves to 008. |
| **004** Tauri Platform gaps | one change, 4 gaps | **SPLIT.** 004a = `exportDebugLogs` (one line) + `recordFatalRendererError` + `runDesktopMenuAction`. **004b = `wslServers`** — own change, Windows-only, deferrable. |
| **006** `$defs` inlining | pending repro | **Confirmed. Proceeds** with executable evidence. |
| **007** Skill guidance hook | shape undecided | **Decided:** implement documented `session.hook("request")` + a paired micro-PR making the skill tool publish `session.skill.activated`. |
| **008** Ranking plugin | ranking + top-K | **Grows:** ranking + top-K **+ loaded-skill filtering** (inherited from Q1). All three now live in the same plugin on the same hook. |

**Net effect on the zero-divergence goal:** unchanged and still achievable. Two upstream PRs
(the hook + the `$defs` fix) and one micro-PR (skill-tool event). If all land, permanent core
divergence is **zero**; the fork is a ranking plugin + a loop-cap plugin + the Tauri app.

## Standing risk

`guidance.ts:34-57`'s delta renderer will emit "no longer available" churn if the plugin
reorders/truncates the list per turn. Q1 showed the renderer stays silent while the hash is
unchanged — so **ranking must be hysteretic**, or every turn will spam the model. This is now
the single hardest design problem in change-008.


## Post-hoc correction (during change-007b)

change-007b (skill tool publishes `session.skill.activated`) was **DROPPED** after
verification during implementation. Two reasons:

1. **It would double-inject skill content.** `runner/to-llm-message.ts` maps a `skill`
   message to a `user` message carrying `skill.content`. The skill *tool* already injects that
   same content via its `<skill_content>` output. Publishing the event from the tool would put
   the skill body into the model context twice.
2. **It is unnecessary.** change-008 can maintain a per-session loaded-skill ledger via the
   existing `ctx.tool.hook("execute.after")` (the after-event carries `tool`, `sessionID`, and
   `input.id`) with ZERO core change — strictly better for the zero-divergence goal.

Loaded-skill tracking therefore moves into change-008's plugin. The spike's original
recommendation to publish the event was wrong; recorded here so the reasoning is not lost.
