# Assessment: v2-upstream-contribution

**Date:** 2026-07-15
**Branch:** `v2` @ `576b173114` (worktree; shares object store with the main repo — verified)
**Goal of phase:** turn the migration's upstream-shaped work into actual PRs, clean the tree,
and close the one honest test gap.

## Environment (PR feasibility)

| Fact | State |
|---|---|
| `origin` | `git@github.com:GQAdonis/opencode.git` — the fork, **pushable** |
| `upstream` | `ssh://git@github.com/anomalyco/opencode.git` |
| `gh` auth | Logged in as **GQAdonis** (active) |
| Upstream default branch | `dev` — but the v2 work targets the **`v2`** branch, so PRs base on `anomalyco/opencode:v2` |

**PR flow:** push each clean branch to `origin`, then open a cross-repo PR
(`GQAdonis:<branch>` → `anomalyco:v2`). The push to `origin` is safe (Travis's own fork); the
cross-repo PR open is an **outward-facing action to a third-party repo** and is gated on
explicit user go-ahead (see Risks).

## The three PR surfaces — each is one clean, single-concern commit

Each already exists as a self-contained commit on `v2`. The **only** preparation needed is to
extract the `packages/` diff onto a fresh branch from `upstream/v2`, dropping the KBD/openspec
scaffolding that must not go upstream.

| PR | Source commit | `packages/` files | Strip (KBD/openspec) | Independent? |
|---|---|---|---|---|
| **A. `session.hook("request")` seam** | `8f5646c596` | 8 (`core` ×6, `plugin` ×2) | 3 | Yes — standalone |
| **B. `$defs` inlining** | `48733d20b1` | 2 (`llm`) | 3 | Yes — standalone |
| **C. model-persistence fixes** | `de59a2010d` | 1 (`app/context/local.tsx`) | 3 | Yes — standalone |

None depends on another, and none references fork-only code (the ranking *plugin* that consumes
seam A stays in the fork; A ships only the seam). So three independent PRs, orderable by
strength of sell:

1. **A first** — the strongest framing: "implement the `session.hook("request")` you already
   document" (v2.opencode.ai + the in-repo plugin READMEs). It also updates the README example
   to the shape actually implemented, so it makes the docs true.
2. **B** — a clean provider bug (DeepSeek/MiniMax reject unresolved `$ref`), with an executable
   repro already in the commit's test.
3. **C** — four model-selection bug fixes; fix #4 (async-storage restore race) is worth calling
   out as affecting Electron too, not just Tauri.

Each commit's message already carries the rationale/evidence and can seed the PR body.

## Gaps against the phase goals

| Goal | State | Gap |
|---|---|---|
| File PR A (seam) | Commit ready | Needs a clean branch from `upstream/v2` (strip 3 KBD files); PR body from commit msg; **user go-ahead to open** |
| File PR B (`$defs`) | Commit ready | Same extraction; repro test already included |
| File PR C (model-persistence) | Commit ready | Same extraction |
| Delete spike evidence | **Still tracked** — `openspec/changes/v2-spike-validate-gaps/evidence/{spike-agent-steps,spike-defs-inlining,spike-skill-loop}.test.ts` | Delete them. **Low urgency:** they live under `openspec/`, not `packages/`, so they cannot leak into any code PR (which only takes `packages/` files) and a package-dir test run never reaches them. Cleanup, not a blocker. |
| Ranking-plugin integration test | **Missing** — only unit tests (`skill-ranking.test.ts` on the pure core, `agent-steps.test.ts`) | Add one test that loads `fork.skill-ranking` into the plugin host and asserts a rewritten `<available_skills>` reaches a dispatched request. **Feasible:** `packages/core/test/plugin.test.ts` already demonstrates loading a plugin into the host. |

## Open questions for plan/execute

1. **PR base confirmation.** All three target `anomalyco/opencode:v2`. Confirm that is the branch
   upstream wants v2 contributions against (their default is `dev`; the v2 code only exists on
   `v2`). Worth a quick check of upstream's contributing norms before opening.
2. **Where does the integration test live** — in `packages/fork-plugins` (needs `@opencode-ai/core`
   as a dev dep to spin a host; it already has it) or as a core-side test? Fork-plugins keeps it
   fork-owned; decide in plan.
3. **Spike evidence: delete vs archive.** They are referenced by `spike.md`. Deleting the files
   but keeping `spike.md`'s prose is the tidy option; confirm in plan.

## Risks

1. **Outward-facing, hard-to-reverse.** Opening PRs against a third-party repo publishes the fork's
   name and code and starts a public review thread. Prepare everything (branches, bodies), but
   **do not open PRs without explicit user confirmation.** This phase is mostly external
   follow-through — its cadence depends on upstream review, not our work.
2. **Moving beta.** `upstream/v2` advanced 3 commits during the last phase. Rebase each PR branch
   on the current `upstream/v2` tip immediately before opening, and re-run its tests (the `$defs`
   repro already survived one such fast-forward).
3. **Plugin API instability.** Upstream warns the v2 plugin API "may continue to change." Seam A is
   the most exposed; if upstream reshapes hooks before merging, PR A may need rework.
