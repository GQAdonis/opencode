# Plan — Phase: tauri-parity-runtime-verification

**Date:** 2026-06-03
**Source:** `assessment.md` (gaps V1–V5) + confirmed decisions below.
**Backend:** native KBD (no OpenSpec, no evolver).

## Confirmed decisions (from /kbd-plan interview)
- **Q1 — CI: NOT desired at this time.** → **V1 dropped from scope.** Cross-platform builds (G2) are **deferred**, not scheduled. Recorded as an explicit deferred item, not a gap to close now.
- **Q2 — GUI acceptance: manual checklist.** → **V4 = a documentation run-sheet**, no automated tauri-driver/WebDriver harness.
- **Q3 — Keep accepted divergences.** → **V5 = confirmation note only** (single-window "New Window" + Linux-pinch-relaunch stay permanent documented divergences).

## Scope after decisions

With CI and automated GUI harness both off the table, this phase reduces to what is **achievable and verifiable headlessly in this repo**, plus honest documentation of what must be verified manually / is deferred.

| Order | Change | Gap | Sev | Agent | Verifiable |
|------|--------|-----|-----|-------|-----------|
| 1 | change-101 Fix build flow: predev wiring + README (specta/nightly + sidecar) | V3 | HIGH | typescript/docs | Yes — run the documented steps |
| 2 | change-102 Headless behavior tests (extract pure cores → unit test) | V2 | HIGH | rust | **Yes — `cargo test`** |
| 3 | change-103 Manual GUI run-sheet (from PARITY-CHECKLIST) | V4 | MED | docs | run by user |
| 4 | change-104 Record deferred cross-platform + confirm divergences | V1(def)/V5 | LOW | docs | N/A |

**Out of scope this phase (deferred, documented in change-104):** CI workflows, cross-platform Linux/Windows builds, automated GUI testing. Revisit if/when CI becomes desired.

---

## Change details

### change-101 — Fix the build flow + README  (HIGH · V3)
**Gap:** README's `tauri dev` fails on a clean checkout — `build.rs` needs `src-tauri/sidecars/opencode-cli-<target>` (only `predev` makes it) and the build needs nightly + the specta `.cargo/config.toml` fix, both undocumented.
**Approach:**
- Update `packages/desktop-tauri/README.md`: document the full clean-checkout flow — `bun install`, then `bun run --cwd packages/desktop-tauri predev` (builds + copies the sidecar) before `tauri dev`; note the nightly toolchain requirement and that `src-tauri/.cargo/config.toml` injects the specta f16/f128 fix automatically.
- Verify `package.json` has a `predev` script wired to `tauri dev` (Tauri runs `beforeDevCommand`/`predev` — confirm the npm `predev` hook or tauri.conf `beforeDevCommand` actually triggers it; wire it if not).
**Acceptance:** following the README from a clean state (sidecar absent) produces a working `cargo check`/`tauri dev` without manual file copying. Documented steps match reality.

### change-102 — Headless behavior tests  (HIGH · V2)
**Gap:** crash reporting, debug-log export, and start-stall have no automated coverage; their command wrappers need an `AppHandle` (not unit-testable), but their I/O cores are pure.
**Approach (extract-then-test):**
- **Debug export:** `copy_dir_filtered` (size cap + symlink skip + recursion) is already AppHandle-free → add `#[cfg(test)]` tests in `logging.rs`: copies files, skips >50MB, skips symlinks, recurses subdirs. Optionally extract a `gather_manifest(version, os, arch, paths)` pure builder and test its JSON shape.
- **Crash report:** extract the formatting (message + location + metadata → report string) from `write_report` into a pure `format_crash_report(...)` and test it (handles `&str` and `String` payloads, includes version/os/arch/location). The panic-hook install + file write stay in the wrapper (manual).
- **Start-stall:** assert the `SIDECAR_START_STALL_TIMEOUT` constant and, if feasible, a small test of the select-branch ordering logic; otherwise document it as manual (timing-dependent).
**Acceptance:** `cargo test` (in `src-tauri`) passes with new tests covering the export filters and crash-report formatting. No behavior change to the commands.

### change-103 — Manual GUI verification run-sheet  (MEDIUM · V4)
**Gap:** GUI-bound behaviors (watchdog dialog, theme-switch flash, live pinch-zoom, menu items, crash-on-real-panic) can only be confirmed by a human at a running app.
**Approach:** add `packages/desktop-tauri/MANUAL-VERIFICATION.md` — a step-by-step `tauri dev` run-sheet derived from `PARITY-CHECKLIST.md`, with explicit reproduction steps and expected results per item (e.g. "block the renderer N s → dialog appears with Relaunch/Export Logs/Quit; click Export Logs → folder opens"). Link it from `PARITY-CHECKLIST.md` and the README. This is the artifact the user (or a future tester) runs.
**Acceptance:** run-sheet exists, covers every GUI-bound checklist item with repro + expected result, and is linked.

### change-104 — Record deferred work + confirm divergences  (LOW · V1-deferred/V5)
**Approach:**
- In `PARITY-CHECKLIST.md` (or a short `DEFERRED.md`), record that **cross-platform builds and CI are deferred by decision (2026-06-03)** — not gaps; revisit when CI is desired. List the cfg-gated paths that remain locally-unverified (Linux GTK/WM/display, Windows registry/decorum/WSL).
- Confirm the two accepted divergences (single-window New Window; Linux pinch-zoom relaunch-only) as **permanent** per Q3.
**Acceptance:** deferred scope + permanent divergences are written down where the next upstream-merge reader will see them.

---

## Sequencing notes
- **change-101 first** — fixing the build flow makes everything else (and any future contributor) reproducible; it's also a prerequisite for trusting `cargo test` runs.
- **change-102** is the only real code/test work; do after 101 so the test environment is sane.
- **change-103 / 104** are documentation; can be done in either order, last.

## Risks / unknowns
- Tauri's `predev` triggering: need to confirm whether the npm `predev` lifecycle hook fires for `tauri dev`, or whether it's `tauri.conf.json` `beforeDevCommand`. change-101 verifies this.
- Extracting pure cores must not change command behavior — keep wrappers thin, re-run `cargo check` + existing tests.

## Next action
`/kbd-execute` — start with change-101. All four changes are headless-completable except change-103's *execution* (the run-sheet is authored by the agent; running it is the user's manual pass).
