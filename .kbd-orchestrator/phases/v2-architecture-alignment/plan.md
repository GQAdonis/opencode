# Plan: v2-architecture-alignment

**Date:** 2026-07-14
**Backend:** OpenSpec (`openspec/` present on branch `v2`)
**Branch:** `v2` (cut from `upstream/v2` @ `aa8fc4234d`)
**Source:** [assessment.md](./assessment.md)

## Governing constraint

Zero permanent core divergence. Every change is either (a) config/plugin with no
core edit, (b) fork-owned code (`packages/desktop-tauri`), or (c) a core change
**shaped as an upstreamable contribution**. Nothing lands as a private core patch
we intend to keep.

## Ordering rationale

The spike goes first because two of its answers **gate the ranking design** — the
most expensive change in the phase. It is cheap (hours) and can invalidate work we
would otherwise do blind.

The zero-patch wins go next: they are independent, they *delete* code, and they
prove the branch is live with minimal risk.

Tauri follows because it is fork-owned, has no upstream coupling, and (post-
correction) is far smaller than feared — it de-risks the "can we actually ship on
v2" question early.

The three upstream contributions go last-but-one, ordered by how easy they are to
sell (a documented-but-missing hook and a genuine bug beat a feature request).

Ranking lands last because it **depends on change-007's hook existing**.

---

## Change list

| # | Change | Type | Depends on | Agent |
|---|---|---|---|---|
| 001 | Spike: validate v2 behavior gaps | spike | — | general-purpose |
| 002 | Adopt v2 natives (delete 3 patches) | plugin/config | 001 | typescript-reviewer |
| 003 | Rebase Tauri app onto v2 + build | fork | — | rust-build-resolver |
| 004 | Close 4 Tauri `Platform` gaps | fork | 003 | rust-reviewer |
| 005 | App model-persistence fixes (4) | core (app) | 003 | typescript-reviewer |
| 006 | openai-compatible `$defs` inlining | **upstream PR** | 001 | typescript-reviewer |
| 007 | Skill guidance hook in core | **upstream PR** | 001 | architect |
| 008 | Skill ranking + reporting **as a plugin** | plugin | 007, 001 | tdd-guide |

---

### change-001 — Spike: validate v2 behavior gaps  *(BLOCKING)*

`/opsx:new v2-spike-validate-gaps`

Answer four questions with evidence before any implementation. Each has a
falsifiable test.

1. **Does the skill re-invocation loop still reproduce on v2?** v2's `Instructions`
   delta-renderer (`core/src/skill/guidance.ts:34-57`) may already prevent it, but
   the `skill` *tool* does not dedupe (`core/src/tool/skill.ts:61-103`). Write a
   failing-or-passing repro against the **v2 runner** (`core/src/session/runner/llm.ts`),
   not the v1 tree. **If it does not reproduce, change C is deleted outright.**
2. **Does the unbounded agent loop reproduce on v2?** Confirm `agentInfo.steps`
   is undefined by default (`runner/llm.ts:196`) and that a tool-call loop actually
   runs away. Then confirm `AgentDraft.update(id, a => { a.steps ??= N })` caps it
   **and** that v2's last-step tool-disabling (`llm.ts:197,216`) engages.
3. **Is the `$defs` rejection still reachable on v2?** Build a tool schema that
   emits `$defs` (`llm/src/tool.ts:233`), lower it through
   `ToolSchemaProjection.openAI` (`llm/protocols/utils/tool-schema.ts:48`), and
   confirm `$ref` survives. **This is the evidence for the upstream bug report.**
4. **Confirm the 4 Tauri `Platform` gaps** against a v2 build, not by grep alone.

**Also decide:** which hook shape to propose upstream (see change-007).

**Exit:** `spike.md` with a verdict + evidence per question. Changes 002/006/008
are re-scoped or dropped based on it.

---

### change-002 — Adopt v2 natives; delete three patches

`/opsx:new v2-adopt-natives`

Pure subtraction plus config. **No core edits.**

- **Delete** `skills.exclude` → express as v2 permission rules:
  `{"action":"skill","resource":"<glob>","effect":"deny"}` (`core/src/skill.ts:38`).
  Document the migration for our users in the fork README.
- **Delete** the terminate-on-hard-error patch → v2's `runner/retry.ts:19`
  taxonomy already does it, with bounded retries.
- **Delete** `DEFAULT_MAX_STEPS` → ship a small fork plugin that sets
  `a.steps ??= 1000` via `ctx.agent.transform` (`plugin/src/v2/effect/agent.ts:6-12`),
  **or** just document the `steps` config key if a plugin is overkill.

This is the first commit on `v2` and should shrink the diff versus upstream.

**Verify:** the three behaviors still hold on v2 (tests from change-001).

---

### change-003 — Rebase the Tauri app onto v2

`/opsx:new v2-tauri-rebase`

`packages/desktop-tauri/` is additive; `packages/desktop` (Electron) and
`packages/app/src/context/platform.tsx` are effectively unchanged `dev`→`v2`
(+17/−3 across 7 files; `platform.tsx` byte-identical). Expect a near-clean
transplant.

- Bring `packages/desktop-tauri/` onto `v2` as one commit.
- Rebuild: specta fix in `src-tauri/.cargo/config.toml`, sidecar staging
  (`scripts/stage-sidecar.ts`). **Note the sidecar binary is now `opencode2`** —
  verify `externalBin` still resolves.
- Version lockstep: v2 has no 2.0 stamp (`0.0.0-next-*` on npm); decide our own
  version string rather than inheriting a placeholder.

**Verify:** app boots against a v2 sidecar; run `PARITY-CHECKLIST.md`.

---

### change-004 — Close the four Tauri `Platform` gaps

`/opsx:new v2-tauri-platform-gaps`

Consume the existing `Platform` abstraction (`packages/app/src/context/platform.tsx`)
instead of bespoke wiring. Ordered cheapest-first:

1. **`exportDebugLogs`** — the Rust command already exists (`src-tauri/src/logging.rs:71`)
   and is only missing from the `Platform` object, so the in-app command
   (`app/src/app.tsx:293`) is **dead code today**. Near-free fix.
2. **`recordFatalRendererError`** — no refs in Tauri.
3. **`runDesktopMenuAction`** — the `DesktopMenuAction` union (`app/src/desktop-menu.ts:3-22`)
   never reaches Tauri, so app-chrome menu actions don't work.
4. **`wslServers`** — largest. The whole `app/src/wsl/` UI tree is inert without it.
   Scope separately if it grows; it is Windows-only and may be deferred.

---

### change-005 — App model-selection persistence (4 fixes)

`/opsx:new v2-app-model-persistence`

v2's `local.tsx` is upstream-vanilla — our 74-line patch is simply absent, and v2
restructured nothing here. Re-apply all four; they remain correct:

1. Relaxed `validModel` (custom/openai-compatible providers don't enumerate models).
2. Agent-switch priority `prev?.model ?? item.model` (user selection wins).
3. `snapshot()` reads the **raw scope** model — the actual revert fix.
4. `session.restore()` async-store race guard.

**Upstream candidate:** #4 is arguably an upstream bug — Electron also uses an
async IPC-backed store (`desktop/src/preload/types.ts:60-65`), so the race is latent
for them too. **File it upstream rather than carrying it forever.**

---

### change-006 — openai-compatible `$defs` inlining  → **UPSTREAM PR**

`/opsx:new v2-llm-inline-defs`

Not a fork preference — a **genuine bug** for any openai-compatible backend
(DeepSeek, MiniMax). v2 removed the ai-sdk npm-dispatch that caused our original
bug, but `ToolSchemaProjection.openAI` (`llm/protocols/utils/tool-schema.ts:48-64`)
still does not inline `$defs`/`$ref`, while `llm/src/tool.ts:233-236` emits `$defs`.

- Add a `$defs`/`$ref` inlining pass to `openAI()`. Universal and safe — OpenAI
  strict mode also rejects bare `$defs`.
- Do **not** build on `ModelCompatibility.toolSchema`: the knob exists
  (`llm/src/schema/options.ts:166`) but **nothing in core populates it**; that
  plumbing is unbuilt work we'd own.
- Ship with the change-001 repro as the PR's evidence.

---

### change-007 — Skill guidance hook in core  → **UPSTREAM PR** *(gates 008)*

`/opsx:new v2-skill-guidance-hook`

The blocker: `SkillGuidance.load` (`core/src/skill/guidance.ts:71-92`) is the only
place deciding what skills the model sees. It sorts **alphabetically**, has **no
hook**, and its signature takes only `AgentV2.Selection` — **not a sessionID**, so
it cannot see conversation context.

Two candidate shapes (decide in change-001):

- **(a) Implement `session.hook("request")`** — already documented at
  v2.opencode.ai and in `plugin/src/v2/effect/README.md:87`, but **absent from
  `core/src/plugin/hooks.ts:9-12`** (only `aisdk` + `tool` domains exist).
  *Strongest sell: "implement what you already documented."* Gives mutable
  `system`/`messages`/`tools` before dispatch.
- **(b) A `skill.guidance` transform** — matches the existing transform idiom;
  narrower and more surgical, but a new API surface to argue for.

Whichever ships, it must thread conversation context into the decision point.

**If upstream rejects both:** fall back to carrying (b) as the single core patch —
one file, small diff — and re-evaluate each sync.

---

### change-008 — Skill ranking + selection reporting **as a plugin**

`/opsx:new v2-skill-ranking-plugin`

Rebuild the flagship feature on the change-007 hook, in a fork-owned plugin
package. **Not a port — a re-implementation.**

Design constraints that fall out of v2's architecture:

- **`triggers` has no home.** `SkillV2.Info` is `{id,name,description?,slash?,autoinvoke?,location,content}`
  (`schema/src/skill.ts:27-35`), and frontmatter `metadata` is parsed then
  **discarded** except two booleans. Rank on `description` + `content` + `name`,
  or carry trigger keywords in our own sidecar metadata — do **not** reintroduce a
  `triggers` field into upstream's schema.
- **Skill IDs are path-derived**, not frontmatter-derived. Our name-keyed
  assumptions must go.
- **The delta-renderer will thrash.** `guidance.ts:34-57` diffs the skill list each
  step and emits "new skills available / no longer available" deltas. A re-ranker
  that reorders every turn will spam the model. **Ranking must be hysteretic** (or
  expressed through the `Instructions` value-delta contract). This is the hardest
  part of the change; design it explicitly, test it explicitly.
- `maxShown` / top-K lands here too (no v2 equivalent).
- Selection reporting (old `session-ui/message-part.tsx` + `tool/skill.ts` metadata)
  is re-derived from the plugin, not patched into core.

**Verify:** ranking quality tests (port the intent of `test/skill/rank.test.ts`,
not its v1 fixtures) + a delta-thrash test asserting a stable list across steps
when context is unchanged.

---

## Deferred / dropped

- **`packages/opencode` patches** — the entire V1 tree is reference-only
  (`AGENTS.md:4`). Nothing lands there. Our original 19-file port is **abandoned**.
- **`Skill.Info.triggers`** — dropped; no home in v2's schema.
- **`skills.exclude` / `skills.maxShown` config object** — dropped; v2's `skills`
  key is a flat `string[]` and cannot carry it (`v1/config/migrate.ts:76`).
- **`web/skills.mdx` docs** — folded into change-008.

## Risks

1. **Upstream rejects the hook (007).** → fall back to a single-file core patch;
   re-evaluate each sync. This is the main threat to the zero-divergence goal.
2. **v2 is a moving beta** (`0.0.0-next-*`, "APIs may continue to change"). Plugin
   API churn can break change-008 without warning. Mitigate: keep the plugin small,
   pin what we can, re-run tests on each sync.
3. **Ranking thrashes the Instructions delta.** Designed for in 008; if hysteresis
   proves intractable, ranking may need to live behind the guidance hook as a
   stable-ordering function rather than a per-turn re-rank.
