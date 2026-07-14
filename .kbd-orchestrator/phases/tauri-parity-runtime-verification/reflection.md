# Reflection — Phase: tauri-parity-runtime-verification

**Date:** 2026-06-04
**Previous phase:** tauri-electron-feature-parity (complete) · **Backend:** native-tool · **Evolver:** no
**Outcome:** 4/4 changes DONE. Goal substantially MET within the decided scope (CI/cross-platform deferred by choice).

## Goal

Prove the prior phase's parity work is trustworthy and reproducible: runtime/GUI verification, cross-platform coverage, build-flow reproducibility, and divergence decisions.

## Decisions that shaped scope (from /kbd-plan)
- **CI not desired** → V1 (CI) dropped; cross-platform builds (G2) deferred, documented.
- **GUI acceptance manual** → V4 = authored run-sheet, not an automated harness.
- **Keep divergences** → confirmed permanent.

## Goal Achievement (vs phase goals G1–G4 / gaps V1–V5)

| Goal | Gap | Status | Change |
|------|-----|--------|--------|
| G1 Runtime GUI verification (macOS) | V2, V4 | **PARTIAL** — headless cores now auto-tested; GUI-bound items captured in a runnable manual run-sheet (execution = human) | 102, 103 |
| G2 Cross-platform builds | V1 | **DEFERRED** by decision (no CI); locally-unverified cfg paths enumerated | 104 |
| G3 Reproducible build flow | V3 | **MET** — README documents nightly + specta + predev sidecar mechanics; verified by experiment | 101 |
| G4 Decide open divergences | V5 | **MET** — single-window + Linux-pinch-relaunch confirmed permanent | 104 |

**Goal achievement (within decided scope): ~100%.** Everything in-scope is done; G2 is an explicit, documented deferral, not a miss.

## Delivered Changes (6 commits)

- 101 accurate build flow + README (V3)
- 102 headless behavior tests via pure-core extraction (V2) — `format_crash_report`, `copy_dir_filtered_capped`
- 103 `MANUAL-VERIFICATION.md` GUI run-sheet (V4)
- 104 deferred-scope + permanent-divergence record (V1-def/V5)

## Artifact Quality Summary

artifact-refiner not installed; QA via per-change verification (cargo test/check, typecheck) + reality-checks on docs. No agent code-review needed (changes were <3-file code or docs-only).

| Metric | Value |
| ------ | ----- |
| Changes with automated verification | 102 (cargo test) + 101 (experimental verification of predev env) |
| New tests added | 4 (`copy_skips_oversized_and_recurses`, `copy_skips_symlinks`, `crash_report_includes_all_fields`, `crash_report_handles_empty_backtrace`) |
| src-tauri test count | 11 passing (was 7 at phase start; +4) |
| Build state at phase end | `cargo test` 11/11, `cargo check` green |
| Behavior changes | none (pure extraction; commands unchanged) |

No constraint violations; no rework required this phase.

## Technical Debt — status vs prior phase

| Prior-phase debt | This phase |
| ---------------- | ---------- |
| Runtime GUI unverified | **Partially paid** — headless cores now tested; GUI items have a runnable run-sheet (still needs a human pass) |
| Cross-platform unverified | **Consciously deferred** (documented, not silent) |
| Sidecar hand-copied / build flow unclear | **Paid** — README documents the real flow incl. the predev env caveat |
| specta fix fragile | Documented in README + memory (unchanged) |

### Remaining / new debt
1. **GUI run-sheet not yet executed** — `MANUAL-VERIFICATION.md` exists but no human has run it against `tauri dev`. Until then, GUI behaviors are "implemented + spec'd", not "observed working".
2. **Cross-platform still unverified** — deferred; will need CI or native machines when revisited.
3. **Release build not yet produced/verified** (being done as a follow-up to this phase per user request).

## Lessons Captured

- **Verify doc claims by experiment.** The assessment guessed the README `tauri dev` was "broken"; testing showed it actually works (the Tauri CLI injects `TAURI_ENV_TARGET_TRIPLE` so predev runs) — the real gap was the *undocumented* nightly/specta requirement + the standalone-predev failure mode. Running the command beat reasoning about it.
- **Extract pure cores to make AppHandle-bound Tauri commands testable.** The bug-prone logic (size cap, symlink skip, recursion, report formatting) is separable from the `AppHandle` plumbing; testing the cores gives real coverage without a GUI app instance.
- **Scope honestly to the environment.** With no CI and no GUI observability, the right move was: automate what's headless, write a precise manual sheet for the rest, and *document* deferrals rather than fake them.

## Recommended Focus for Next Phase

The KBD parity track is effectively complete (parity built + verified to the extent possible without CI). Candidate next steps, only if/when warranted:
- **Run** `MANUAL-VERIFICATION.md` against a real `tauri dev` (human) and record results.
- **`tauri-ci-and-cross-platform`** — only if CI becomes desired (revisits the deferred G2/V1).
- Otherwise: no further KBD phase needed; resume normal feature work, running `PARITY-CHECKLIST.md` on each upstream merge.

## Verification Signals
- progress.json 4/4 done; 4 archived change dirs.
- `cargo test` (src-tauri) 11/11; `cargo check` green.
- Docs present: README.md, PARITY-CHECKLIST.md, MANUAL-VERIFICATION.md.
- Commits `15aac7ba4`..`19f2adc1f` on `dev`.
