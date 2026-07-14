# Assessment: v2-architecture-alignment

**Date:** 2026-07-14
**Branch under assessment:** `v2` (cut from `upstream/v2` @ `aa8fc4234d`)
**Method:** 4 parallel investigations (v2 skill architecture; session/config/provider; app + desktop/Tauri; external research), all grounded in source with file:line citations.

---

## 0. Two errors corrected during assess (recorded so they don't recur)

**Error 1 — I patched the wrong tree.** The initial dry run ported our 19 files onto v2 with "zero conflicts, typecheck clean, 35/35 skill tests green". That result was worthless. v2's own `AGENTS.md:4` states:

> "Do not modify `packages/opencode` unless the user explicitly asks for V1 work. `packages/opencode` is the V1 implementation and is **present for reference only**. New implementation changes should land in the V2 package set: `packages/core`, `packages/cli`, `packages/server`, `packages/protocol`, `packages/schema`."

Every file that applied cleanly lives in `packages/opencode` — the frozen V1 tree. It applied cleanly *because nothing touches it any more*. The real skill system is `packages/core/src/skill.ts` + `packages/core/src/skill/guidance.ts`, which the patch never went near.

**Error 2 — I inflated the frontend/Tauri risk ~12x.** I measured churn from the `dev`↔`v2` merge-base (2026-06-26) to `v2`, which counts upstream dev work *our `dev` already contains*. Correct `dev`→`v2` deltas:

| Package | Reported (wrong) | Actual `dev`→`v2` |
|---|---|---|
| `packages/app` | +28,920 / −6,006 | **+2,397 / −2,367** |
| `packages/desktop` (Electron) | "+802 / 6 commits" | **+17 / −3, 7 files** |

Our `dev` already has `sdk-next`, `client`, `protocol`, `desktop`, `session-ui`. **v2 is a backend/core/CLI/TUI rewrite, not a frontend rewrite.** Churn `dev`→`v2` concentrates in `core` (380 files), `opencode` (152), `tui` (157), `codemode`.

---

## 1. What v2 is

- **2.0 is a public beta, not shipped.** Ships as `@opencode-ai/cli@next` at placeholder version `0.0.0-next-15526`; binary is **`opencode2`**, coexisting with v1's `opencode`. No `v2.*` git tag exists; the branch still self-reports `1.17.x`.
- Official docs live at **v2.opencode.ai** (separate from v1's opencode.ai/docs).
- Upstream's own warning: *"Beta data may be wiped, features may break unintentionally, and the server and plugin APIs may continue to change."*
- Architecture: Effect (`effect@4.0.0-beta.83`) services/layers/schema; dependency rule Schema → Core/Protocol → Server. Skills are **sources contributed by plugins**. Even built-in skills (`opencode.skill`) and config-driven skill discovery (`opencode.config.skill`) are plugins. That is the idiom.
- Desktop: PR #25822 replaced Tauri with Electron for **maintenance-consolidation reasons only** — *no technical criticism of Tauri*. v2's Electron app still spawns the server as a **sidecar**, the same seam our Tauri app uses.

---

## 2. THE CRITICAL CONSTRAINT: the documented plugin hook does not exist

The v2 docs and two in-repo READMEs (`packages/plugin/src/v2/effect/README.md:87`, `.../promise/README.md:91`) advertise:

```ts
ctx.session.hook("request", (event) => { /* mutable system, messages, tools */ })
```

**This is not implemented.** The authoritative registry, `packages/core/src/plugin/hooks.ts:9-12`, is exactly two domains:

```ts
export interface Domains {
  readonly aisdk: AISDKHooks   // "sdk" | "language"
  readonly tool: ToolHooks     // "execute.before" | "execute.after"
}
```

There is no `SessionDomain` type in `packages/plugin/src/v2/effect/session.ts`. **The documentation describes an API that does not exist in the code.** Any plan built on the docs alone would have failed at implementation time.

Consequence: plugins can contribute skill **sources** (input) but cannot rank, filter, reorder, or truncate the **advertised list** (output). Per the skill investigation: *"an input registry, not an output pipeline… and it is a real ceiling."*

---

## 3. Divergence inventory, classified against the three-way test

Legend — **ADOPT**: v2 already does it, delete our patch. **PLUGIN**: achievable with zero core edits. **CORE**: requires a core change (shape as an upstreamable contribution). **FORK**: our own package, no conflict.

| # | Fork divergence | v2 status | Verdict |
|---|---|---|---|
| **B** | `skills.exclude` config | **Already solved.** `PermissionV2.evaluate("skill", skill.id, agent.permissions).effect !== "deny"` (`core/src/skill.ts:38`), applied in `SkillGuidance.load` (`skill/guidance.ts:74`) and enforced at load in the skill tool (`core/src/tool/skill.ts:76`). Glob resources + per-agent scoping. Also: v2 `Config.Info.skills` is a flat `string[]` (`core/src/config.ts:93`) — our v1 object shape cannot even survive `v1/config/migrate.ts:76`. | **ADOPT** — delete patch, use `permissions` rules. Strictly better than ours. |
| **E** | Terminate agent loop on hard error | **Already solved.** Exhaustive retryable/terminal taxonomy with a `never` exhaustiveness check (`core/src/session/runner/retry.ts:19-38`); retries bounded to 4 (`Schedule.take(4)`); hard errors bypass `RetryableFailure` and propagate (`runner/llm.ts:344-358`, `472-481`). | **ADOPT** — delete patch. Tune the `switch` only if a specific reason is misclassified. |
| **D** | Agent loop hard cap (`DEFAULT_MAX_STEPS`) | **Gap, but reachable without code.** v2 is still unbounded (`runner/llm.ts:196`: `agentInfo.steps !== undefined && currentStep >= agentInfo.steps`; nothing defaults `steps`). BUT `steps` is a config field (`config/agent.ts:22`) and plugins can set it: `AgentDraft.update(id, a => { a.steps ??= 1000 })` (`plugin/src/v2/effect/agent.ts:6-12`). v2's enforcement is *better* than our v1 patch: on the last step it disables tools entirely and sets `toolChoice: "none"` (`runner/llm.ts:197,216`), force-failing any tool call. | **PLUGIN** — zero core edits. Delete our patch; set `steps` via agent config or a tiny `ctx.agent.transform` plugin. |
| **A** | **Skill ranking + selection reporting** (flagship) | **Absent in v2, and no extension point.** `SkillGuidance.load` (`skill/guidance.ts:71-92`) is the *only* place deciding what the model sees: permission filter → drop `autoinvoke:false`/no-description → **alphabetical sort by id** → `<available_skills>` XML. No scoring, no triggers, no top-K anywhere (verified across core, schema, protocol, docs). **It has no hook, and its signature takes only `AgentV2.Selection` — not a sessionID**, so it cannot see conversation context at all. Our `triggers` frontmatter field has no home: `SkillV2.Info` is `{id,name,description?,slash?,autoinvoke?,location,content}` (`schema/src/skill.ts:27-35`), and frontmatter `metadata` is parsed then **discarded** except for two booleans. Skill IDs are **path-derived**, not frontmatter-derived. | **CORE → upstream.** Decision taken: implement the missing extension point (a `skill.guidance` transform, or the documented session-request hook), **contribute it upstream**, and build ranking as a pure plugin on top. Carry the minimal patch on our branch until accepted. |
| **B2** | `skills.maxShown` (top-K) | **Absent.** `guidance.ts:71` renders every permitted skill, uncapped. | **CORE** — rides along with A (same hook). |
| **C** | Loaded-skill re-invocation loop fix | **Partial.** v2's `Instructions` subsystem already diffs the skill list across steps and emits deltas rather than restating (`skill/guidance.ts:34-57`). But the `skill` **tool** does not dedupe — calling it twice re-injects full content (`core/src/tool/skill.ts:61-103`). The idiomatic dedupe machinery to copy is `SessionInstructions` (`core/src/session/instructions.ts:43-80`). | **VERIFY, then PLUGIN.** `ctx.tool.hook("execute.before")` can intercept a repeat `skill` call — a real plugin seam. Re-test whether the loop still reproduces on v2 before building anything. |
| **F** | openai-compatible `$defs`/`$ref` inlining | **Half-solved.** The *cause* is gone: v2 dropped ai-sdk `npm`-string dispatch; `openai-compatible-chat` reuses `OpenAIChat.protocol` verbatim (`llm/src/protocols/openai-compatible-chat.ts:17`), so `ToolSchemaProjection.openAI` always applies. **But `openAI()` does not inline `$defs`/`$ref`** (`llm/src/protocols/utils/tool-schema.ts:48-64`) while `llm/src/tool.ts:233-236` *emits* `$defs` — so the DeepSeek/MiniMax rejection is **still reachable**. No plugin seam (`aisdk` hooks cover model construction only). | **CORE → upstream as a bug fix.** Add inlining to `openAI()` in `llm/protocols/utils/tool-schema.ts`. Universal and safe (OpenAI strict mode also dislikes bare `$defs`). Note: the `ModelCompatibility.toolSchema` knob exists but **nothing in core populates it** — that plumbing is unbuilt. |
| **G** | App model-selection persistence (4 fixes) | **Absent — v2's `local.tsx` is upstream-vanilla; our 74-line patch is simply not there.** All four remain valid: (1) relaxed `validModel` for custom/openai-compatible providers whose models aren't enumerated; (2) agent-switch model priority (`prev?.model ?? item.model`); (3) `snapshot()` reading the **raw scope** model (the actual revert fix); (4) `session.restore()` async-store race guard. v2 restructured **nothing** here — `context/models.tsx`, `model-variant.ts`, `utils/persist.ts` all unchanged. | **CORE (shared app pkg) → upstream candidates.** Re-apply. **#4 is arguably an upstream bug**: Electron *also* uses an async IPC-backed store (`preload/types.ts:60-65`), so the race is latent for them too — worth reporting rather than carrying forever. |
| **H** | `session-ui/message-part.tsx` skill-selection display | Follows A. | Deferred to A. |
| **I** | `web/skills.mdx` docs | Docs only. | Trivial. |
| **J** | **`packages/desktop-tauri/`** | **Contract unchanged.** The integration seam is `packages/app/src/context/platform.tsx` — **byte-identical `dev`↔`v2`**, and it *predates* v2. Electron on v2 changed by 7 files / +17/−3. The `Platform` object is already the abstraction to consume. **Four real gaps in our Tauri host** (all pre-existing, none v2-induced): `wslServers` (largest — the whole `app/src/wsl/` UI tree is inert), `exportDebugLogs` (**cheapest — the Rust command already exists at `logging.rs:71`, it's just never exposed on `Platform`, so the in-app command at `app.tsx:293` is dead**), `recordFatalRendererError`, `runDesktopMenuAction`. | **FORK** — rebase onto v2 (near-trivial), then close the 4 `Platform` gaps. Far less work than feared. |

---

## 4. Score against the phase goal (zero core edits, easy upstream sync)

**Achievable with zero core changes — 4 of 10:** B (permissions), D (agent config/plugin), E (delete), C (tool hook, pending verify). Plus skill *injection* via `ctx.skill.transform(draft.source(...))`.

**Requires core changes — 3:** A + B2 (no hook exists), F (no plugin seam), G (shared app package).

**Fork-owned, no conflict — 3:** J, H, I.

**The strategy that satisfies the constraint:** every unavoidable core change is shaped as an **upstreamable contribution**, not a private divergence —
1. **A/B2** → contribute the missing skill-guidance hook; our ranking becomes a plugin.
2. **F** → contribute the `$defs` inlining as a bug fix (it's a genuine bug for any openai-compatible backend, not a fork preference).
3. **G #4** → report the async-storage restore race as an upstream bug (it affects Electron too).

If all three land upstream, our permanent core divergence goes to **zero** and the fork reduces to: a ranking **plugin**, the **Tauri app**, and config. That is the end-state worth aiming at.

---

## 5. Open questions for plan stage

1. **Does the skill re-invocation loop (C) still reproduce on v2?** Its Instructions delta-renderer may already prevent it. Must test before building.
2. **Which hook shape will upstream accept for A** — a `skill.guidance` transform (matches the existing transform idiom) or the already-documented `session.hook("request")` (matches their own docs, and would make the docs true)? The latter is arguably an easier sell: *implement what you already documented*.
3. **Ranking + the delta renderer.** `guidance.ts:34-57` diffs the skill list per step; a re-ranker that reorders every turn will **thrash that diff**. Ranking must be expressed through the `Instructions` value-delta contract, or be stable/hysteretic across steps. This is a real design constraint, not a detail.
4. Re-validate the 4 Tauri `Platform` gaps against a v2 build before committing scope.
