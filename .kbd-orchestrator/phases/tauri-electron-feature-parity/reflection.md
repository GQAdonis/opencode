# Reflection — Phase: tauri-electron-feature-parity

**Date:** 2026-06-03
**Backend:** native-tool (Claude Code direct) · **Evolver cycle:** no
**Outcome:** 13/13 changes DONE. Phase goal substantially MET (compile/type-verified; runtime acceptance pending a GUI pass).

## Goal

Bring the Tauri desktop app (`packages/desktop-tauri`) to feature parity with the maintained Electron app (`packages/desktop`), one-directional (Electron → Tauri), and keep it maintained going forward.

## Goal Achievement (vs assessment gaps G1–G11)

| Gap | Description | Status | Change(s) |
|-----|-------------|--------|-----------|
| G1 | Unresponsive + crash dialogs | **MET** | 001 |
| G2 | Crash reporting + debug-log export | **MET** | 002, 003 |
| G3 | Dynamic background-color theme sync | **MET** | 005 |
| G4 | Pinch-zoom runtime toggle | **PARTIAL** (macOS live; Linux/Win apply-at-creation — platform limit, documented) | 006 |
| G5 | macOS menu / action coverage | **MET** (New Window omitted — single-window, documented) | 004 |
| G6 | Ukrainian `uk` locale | **MET** | 011 |
| G7 | CA certs + sidecar env cleanup + netlog | **MET** for CA/env; netlog deliberately not ported (no clean Tauri equivalent) | 007, 010 |
| G8 | Store-key parity (`wslEnabled`) | **MET** | 009 |
| G9 | Sidecar start-stall + stop-timeout | **MET** (start-stall added; stop already forceful via process-wrap) | 008 |
| G10 | Sentry desktop tags | **MET** — and stronger than planned: Sentry was *entirely uninitialized* in Tauri; now fully initialized with desktop release/tags | 010 |
| G11 | Windows titlebar theming | **MET by architecture** (decorum overlay is transparent/CSS-themed; no native API needed) | 012 |
| — | Version lockstep + maintenance checklist | **MET** | 013 |

**Goal achievement: ~96%** — 10 of 11 capability gaps fully MET, 1 PARTIAL by genuine platform limitation. Plus a build-infrastructure blocker resolved and a maintenance contract (PARITY-CHECKLIST.md) established.

## Delivered Changes (15 commits)

- Infra: specta f16/f128 nightly compile fix (`.cargo/config.toml`) — unblocked all Rust work.
- 001 unresponsive watchdog + recovery dialog · 002 local crash reporting · 003 debug-log export
- 004 macOS menu coverage · 005 background-color sync · 006 pinch-zoom toggle
- 007 CA certs + env hygiene · 008 start-stall timeout · 009 wslEnabled read
- 010 Sentry init · 011 `uk` locale · 012 titlebar (by architecture) · 013 version lockstep + checklist

## Artifact Quality Summary

artifact-refiner is not installed in this environment; QA was performed via `rust-reviewer` code-review agents (on the ≥3-file, safety-sensitive changes) plus per-change acceptance checks (`cargo check`, `cargo test`, `bun typecheck`, `tauri-specta` binding regen).

| Metric | Value |
| ------ | ----- |
| Changes with QA review | 2 deep agent reviews (001, 006) + compile/type/test on all 13 |
| Issues caught pre-commit | 5 (3 HIGH on 001, 2 incl. SAFETY on 006) |
| Changes requiring rework before commit | 2 (001, 006) |
| Unit tests added | change-007 (env stripping) |
| Build state at phase end | `cargo check` green, `bun typecheck` green |

### Issues caught by QA (all fixed before commit)
- **change-001 (HIGH×3):** double-dialog/double-restart on window blur; `blocking_show` unsafe on macOS main thread → switched to async `show_with_result`; mutex-poison panic in recovery path → poison recovery.
- **change-006 (HIGH×2):** missing `// SAFETY:` comments on objc2/GTK `unsafe` blocks; silenced `with_webview` errors → logged; placeholder plugin name.

No recurring constraint violations across changes (each issue was change-specific).

## Technical Debt Introduced

1. **Runtime acceptance unverified.** All changes are compile/type/test-verified, but GUI behaviors (watchdog dialog firing, live pinch-zoom toggle, theme-switch flash, crash file on real panic) were not exercised in a `tauri dev` session. → Tracked in `PARITY-CHECKLIST.md` for a human/CI GUI pass.
2. **Cross-platform builds unverified.** Only darwin-arm64 was compiled. Linux (GTK pinch-zoom path, decoration logic) and Windows (registry, decorum, WSL) code compiles behind `cfg` but wasn't built/run.
3. **Sidecar binary is a manual artifact.** `src-tauri/sidecars/opencode-cli-aarch64-apple-darwin` was hand-copied to unblock builds; the real flow is `scripts/predev.ts`. Gitignored, so not committed — but a clean checkout needs predev run first.
4. **specta f16/f128 fix is fragile.** Relies on `-Zcrate-attr` + `RUSTC_BOOTSTRAP=1` against a pinned git rev; a specta bump could change the shape. Documented + memory-saved.
5. **change-006 Linux enable** is a known no-op until relaunch (gesture destroyed, not suspended) — accepted divergence, not debt to pay down unless a webview-recreate path is wanted.

## Lessons Captured (for knowledge base)

- **Verify the build compiles before planning Rust work.** The biggest surprise (specta f16/f128) was a *pre-existing* compile failure, not introduced by changes. A `cargo check` baseline at execute-start would have surfaced it during planning, not mid-change-001. → saved as memory `tauri-build-toolchain-fix`.
- **Don't assume shared-entry inheritance.** The plan assumed Tauri inherited Sentry from the shared web `entry.tsx`; it has its own `render` and inherited *nothing*. Grep-confirming "where does X actually initialize" beats reasoning from architecture. (This is exactly why the plan flagged Sentry as ❓-verify — that flag paid off.)
- **QA agents catch real concurrency/FFI bugs.** The watchdog double-restart race and the macOS-main-thread dialog issue were genuine, not style nits. Worth the cost on sensitive Rust.
- **Platform reality caps parity honestly.** Pinch-zoom (GTK destroy-vs-suspend) and titlebar (decorum transparent overlay) are architectural differences, not lazy gaps. Documenting them as accepted divergences is more honest than a no-op "fix".

## Recommended Focus for Next Phase

**Phase candidate: `tauri-parity-runtime-verification`** — close the debt above:
1. Run `PARITY-CHECKLIST.md` capability checks in an actual `tauri dev` GUI session (macOS first).
2. Cross-compile/CI for Linux + Windows; exercise the `cfg`-gated paths.
3. Wire predev into the build docs so a clean checkout builds without manual sidecar copy.
4. (Optional) Decide whether to pursue true multi-window "New Window" and live Linux pinch-zoom, or keep them as accepted divergences.

Also pending (out of phase): push the 15 fork commits to `origin` when ready.

## Verification Signals
- `progress.json`: 13/13 done · 13 archived change dirs.
- Final `cargo check` (darwin-arm64) green; `bun typecheck` green; change-007 unit tests pass.
- Commits `7e39f0cdb`..`34839f163` on `dev`.
