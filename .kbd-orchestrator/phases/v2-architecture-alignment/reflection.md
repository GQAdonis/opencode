# Reflection: v2-architecture-alignment

**Date:** 2026-07-15
**Branch:** `v2` (cut from `upstream/v2`, currently at `634386fe0f`)
**Backend:** OpenSpec
**Outcome:** 9/9 active changes complete (1 dropped, 1 deferred). Governing goal met.

## The governing goal, and whether it was met

> Move the fork onto v2 **without carrying a permanent core divergence** — adopt v2's
> architecture, never re-add v1 shapes v2 discarded.

**MET.** Final divergence against `upstream/v2`, by bucket:

| Bucket | Files | Lines | Permanence |
|---|---|---|---|
| Upstream-PR surface (`packages/core`, `packages/llm`) | 8 | +341 / −9 | Zero **if the PRs land** |
| App bug-fix patch (`packages/app/src/context/local.tsx`) | 1 | +55 / −8 | Zero **if the PR lands** |
| Fork-owned (`fork-plugins` + `desktop-tauri`) | 239 | +15,842 | Permanent by design |
| Any other upstream package | **0** | — | — |

No file under `packages/schema`, `cli`, `server`, `ui`, `desktop`, `tui`, `sdk-next`,
`client`, or `protocol` diverges. Every upstream-touching change is either a genuine bug
fix or the implementation of an already-documented API — all filed-upstream-shaped. If the
three PRs are accepted, **permanent core divergence reaches zero** and the fork reduces to two
plugins + the Tauri app.

## Goal-by-goal

| # | Goal | Verdict |
|---|---|---|
| 1 | Inventory every divergence, classify against the 3-way test | **MET** — assessment classified all 10; the spike (change-001) then verified each against the real v2 runtime, not code-reading |
| 2 | Re-implement skill ranking natively in v2 | **MET** — `fork.skill-ranking` plugin (change-008), zero core edits, on the new hook |
| 3 | Determine if v2 owns loop cap / terminal errors / schema sanitization | **MET** — terminal errors: v2 owns it (deleted). Loop cap: gap, but zero-patch via plugin. `$defs`: still-reachable bug, fixed upstream |
| 4 | Where skills config (`exclude`, `maxShown`) belongs in v2 | **MET** — `exclude` → v2 permission rules (dropped ours); `maxShown` → plugin option |
| 5 | Realign the Tauri app to v2's desktop contract | **MET** — rebased, sidecar repointed to the V2 CLI, 3 Platform gaps closed; `wslServers` deferred (Windows-only subsystem) |
| 6 | Validate against external research | **MET** — v2.opencode.ai + `upstream/v2` AGENTS.md confirmed the "V1 tree is reference-only" rule that reset the whole approach |

## Delivered changes

| Change | Bucket | What |
|---|---|---|
| 001 spike | — | Verified 4 assumptions against the real runtime with executable tests; decided the hook shape |
| 002 adopt-natives | plugin | Retired 3 v1 patches; loop cap as `fork.agent-steps` |
| 003 tauri-rebase | fork | Transplant + sidecar repointed to `packages/cli` (`opencode2`); 3 CLI-flag breaks fixed |
| 004 tauri-platform-gaps | fork | `exportDebugLogs`, `recordFatalRendererError`, `runDesktopMenuAction` |
| 005 app-model-persistence | app (upstream) | 4 model-selection bug fixes; toast dropped |
| 006 llm-inline-defs | llm (upstream) | `$defs`/`$ref` inlining in the OpenAI projection |
| 007 skill-guidance-hook | core (upstream) | Implemented the documented `session.hook("request")` |
| 008 skill-ranking | plugin | Ranking + loaded-skill filtering + top-K |
| 007b (dropped) | — | Skill-tool activated event — would double-inject; unnecessary |
| 004b (deferred) | fork | `wslServers` — 11-method Rust subsystem, Windows-only |

## Test evidence

No artifact-refiner logs (QA gate not configured this phase); verification was per-change
executable tests instead:

- `fork-plugins`: 18 pass (agent-steps 4, skill-ranking 14)
- `packages/llm`: 316 pass / 0 fail
- `packages/core` session-runner: 159 pass; session-hooks: 4 pass
- `desktop-tauri` Rust: 13 pass (`cargo test`); `cargo check` clean
- Every change: typecheck clean; zero-divergence gate enforced per commit

## What went well

- **The spike paid for itself repeatedly.** It caught that the "clean patch-port" was patching
  the frozen V1 tree; it overturned the assumption that v2's delta-renderer made our loop fix
  obsolete; and its `$defs` repro became the upstream PR's evidence. Cheap verification, expensive
  mistakes avoided.
- **Verify-before-implement caught two real errors mid-flight**: change-007b would have
  double-injected skill content (killed before writing it), and the Tauri sidecar was pointed at
  the V1 tree with 3 CLI flags that would have made the app dead-on-arrival (caught by running the
  real binary, not reading its `--help`).
- **The zero-divergence gate as a spec requirement** (not just an intention) caught spike test
  files polluting `packages/core` on the first run of change-002.

## Technical debt / follow-ups

1. **Three upstream PRs to file** (from their commits): `session.hook("request")` (008-blocker,
   strongest sell — "implement what you documented"), the `$defs` fix (clear bug), and the
   model-persistence fixes (esp. #4, the async-storage race, which affects Electron too).
2. **Spike evidence must be deleted before any merge**: `spike-agent-steps.test.ts`,
   `spike-defs-inlining.test.ts`, `spike-skill-loop.test.ts` under
   `openspec/changes/v2-spike-validate-gaps/evidence/` (moved out of `packages/` already, but still
   in-tree).
3. **Ranking plugin is type-verified, not integration-tested.** The pure core has 14 tests and the
   hook mechanism has 4, but the plugin registered in a live runner end-to-end is unproven. Close
   this with one integration test before relying on it in production.
4. **`wslServers` (004b) remains open** — deferred, Windows-only.
5. **Moving-beta risk is real and recurring.** `upstream/v2` advanced 3 commits mid-phase; each
   sync needs the zero-divergence gate re-run and the spike findings re-checked (the `$defs` repro
   was re-verified after one fast-forward and still held).

## Lessons for the knowledge base

- **A clean `git apply` proves textual compatibility, not architectural fit.** On a repo with a
  frozen reference tree, green tests can mean you patched the museum. Read the target's own
  AGENTS.md/architecture docs before trusting a merge.
- **Test the artifact, not its help text.** `opencode2 serve --help` exited 0 and proved nothing;
  actually starting the server exposed three breaking flag changes.
- **Baseline before blaming.** Session-test "regressions" were 81 pre-existing stock-v2 failures;
  only diffing against stock separated signal from noise.
- **The best home for a fork feature is often an extension point that doesn't exist yet** —
  contributing it upstream converts a permanent merge tax into a one-time PR.

## Recommended next phase

**`v2-upstream-contribution`** — file and shepherd the three PRs, delete the spike evidence, and
add the ranking-plugin integration test. Gate the phase on: PRs opened with linked evidence, tree
clean of throwaway tests, and one end-to-end ranking test green. Keep `wslServers` (004b) and a
recurring `upstream/v2` re-sync as standing backlog items.
