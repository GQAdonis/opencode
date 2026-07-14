# Assessment — Phase: tauri-parity-runtime-verification

**Date:** 2026-06-03
**Previous phase:** tauri-electron-feature-parity (complete, 13/13)
**Goal:** Prove the parity work behaves correctly at runtime — GUI verification (macOS), cross-platform builds (Linux/Windows cfg paths), reproducible build flow, decide open divergences.

## Method

Inspected the actual verification tooling state: rustup targets, GUI/display feasibility, CI workflows, existing tests, the build/predev flow, and README accuracy. Findings are grounded in those signals.

## Current State (verification readiness)

| Capability | State |
|------------|-------|
| Host platform | macOS `aarch64-apple-darwin` (GUI-capable; can run `tauri dev`) |
| Installed rust targets | `aarch64-apple-darwin`, `wasm32-unknown-unknown` only — **no Linux/Windows targets** |
| Tauri CLI | present (`node_modules/.bin/tauri`) |
| Rust unit tests | **28** across `cli.rs`, `lib.rs`, `linux_windowing.rs` — runnable headless |
| `cargo check` (darwin) | green (with `.cargo/config.toml` specta fix) |
| `bun typecheck` | green |
| Sidecar binary | present now (manually copied last phase); produced by `scripts/predev.ts` |
| **CI for desktop-tauri** | **NONE** — no workflow builds/tests the Tauri app (died with upstream PR #25822) |
| **E2E / GUI harness** | **NONE** — no Playwright/tauri-driver/webdriver setup |
| README build docs | present but **incomplete/inaccurate** — omits the nightly + specta `.cargo/config.toml` requirement and the predev sidecar step, so the documented `tauri dev` fails on a clean checkout |

## Gap Analysis (vs phase goals G1–G4)

### G1 — Runtime GUI verification (macOS)
- **Blocker (environmental):** runtime acceptance of GUI behaviors (watchdog dialog firing, theme-switch flash, live pinch-zoom, crash-on-panic) requires **observing a running window**. The agent cannot see a GUI; this needs either (a) the user driving `tauri dev` against `PARITY-CHECKLIST.md`, or (b) an **automated GUI harness** (tauri-driver + WebDriver/Playwright) — which **does not exist** (gap).
- **What IS agent-verifiable headlessly:** the crash-report path (force a panic, assert a file in `crashes/`), the debug-export command (invoke, assert the folder+manifest), and the start-stall timeout — all can be covered by **Rust integration tests** without a display.
- Status: **NOT MET** — needs a harness decision (manual checklist run vs. automated) + headless tests for the non-GUI-bound behaviors.

### G2 — Cross-platform builds (Linux / Windows cfg paths)
- **Blocker (environmental):** no Linux/Windows rust targets installed, and Tauri links native GUI libraries (GTK/WebKit2GTK on Linux, WebView2/MSVC on Windows) that **cannot be cross-compiled from macOS** without full sysroots. Realistically this requires **CI runners** (ubuntu-latest, windows-latest) or native machines.
- The `cfg(target_os = "linux")` / `cfg(windows)` code (GTK pinch-zoom, WM detection, registry resolution, WSL) currently compiles only behind cfg on this host — **never type-checked for those targets locally**.
- Status: **NOT MET** — needs CI workflow(s) that `cargo check`/build the Tauri crate on Linux + Windows. This is the single highest-leverage gap (also gives ongoing regression protection).

### G3 — Reproducible build flow
- README's documented `tauri dev` **fails on a clean checkout**: (1) `build.rs` requires `src-tauri/sidecars/opencode-cli-<target>` which only `predev` produces; (2) the specta git rev needs nightly + the `-Zcrate-attr` fix in `.cargo/config.toml`, undocumented.
- `scripts/predev.ts` exists and builds+copies the sidecar, but isn't referenced in the dev instructions.
- Status: **PARTIAL** — the pieces exist (predev script, .cargo/config.toml committed); the gap is **documentation + wiring** so `bun run --cwd packages/desktop-tauri tauri dev` works after a fresh `bun install`. Low effort, high value.

### G4 — Decide open divergences
- Two accepted divergences from last phase: single-window "New Window" (omitted) and live Linux pinch-zoom (relaunch-only). Both are documented in `PARITY-CHECKLIST.md`.
- Status: **DECISION, not code** — confirm "keep as documented divergences" or scope follow-up. No investigation blocker; a quick confirmation in the plan.

## Gap Summary

| Gap | Severity | Nature | Verifiable by agent? |
|-----|----------|--------|----------------------|
| **V1** No CI building/testing desktop-tauri (Linux+Windows+macOS) | **CRITICAL** | infra/tooling | Yes — author workflow; runs on push |
| **V2** No headless tests for crash/export/start-stall behaviors | HIGH | testing | **Yes** — Rust integration tests |
| **V3** README build flow broken on clean checkout (predev + specta nightly undocumented) | HIGH | docs/flow | Yes — fix docs; verify steps |
| **V4** No automated GUI harness; GUI acceptance is manual-only | MEDIUM | testing | No — needs harness or human |
| **V5** G4 divergence decisions unconfirmed | LOW | decision | N/A — user confirm |

## Key Realities (shape the plan)

- **The agent cannot visually verify GUI behavior.** Honest split: maximize *headless* coverage (V2 tests + V1 CI compile-checks on all 3 OSes), and produce a **precise manual checklist run-sheet** for the GUI-bound items (V4) rather than claiming them verified.
- **CI is the highest-leverage move (V1).** It simultaneously satisfies most of G2 (cross-platform compile), guards against upstream-merge regressions, and is the natural home to run V2's tests. Do it first.
- **V3 is cheap and unblocks everyone** (including CI, which needs the same predev+specta steps).

## Recommended Plan Shape (for /kbd-plan)
1. **V3** — fix the build flow + README (predev wiring, specta/nightly note). Cheap, unblocks CI.
2. **V1** — add a GitHub Actions workflow: `cargo check`/test the Tauri crate on macOS + Linux + Windows (exercises all cfg paths). Highest leverage.
3. **V2** — Rust integration tests for crash reporting, debug export, start-stall (headless-verifiable parity behaviors).
4. **V4** — write a `tauri dev` manual run-sheet (from PARITY-CHECKLIST) for GUI-bound items; optionally evaluate tauri-driver for future automation.
5. **V5** — confirm the two accepted divergences (plan-time question).

## Open Questions (resolve in /kbd-plan)
- Q1: Is **CI** (GitHub Actions on anomalyco fork) available/desired, or should cross-platform verification be deferred to the user's own machines? (Determines whether V1/V2 land as CI or local-only.)
- Q2: For GUI acceptance (V4): manual checklist run by you, or invest in an automated tauri-driver/WebDriver harness now?
- Q3: G4 — keep single-window + Linux-pinch-relaunch as permanent accepted divergences, or scope follow-up work?

## Verification Signals Used
- `rustup target list --installed` → only darwin-arm64 + wasm.
- No `.github/workflows/*` references `desktop-tauri`/`tauri build`.
- 28 `#[test]`/`#[tokio::test]` in src-tauri; no e2e harness.
- README omits predev + specta nightly requirements (clean-checkout `tauri dev` would fail).
