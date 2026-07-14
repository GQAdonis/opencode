# Execution — Phase: tauri-electron-feature-parity

**Date:** 2026-06-02
**Backend:** `native-tool` (Claude Code direct implementation)
**Source of truth:** KBD (`progress.json` + change files). No OpenSpec, no evolver.

## Backend rationale
- No `openspec/` dir → not openspec.
- Changes are concrete code edits with explicit acceptance criteria → Claude Code implements directly.
- Rust build env verified: `cargo`/`rustc` 1.97 nightly present, `tauri` CLI installed, Cargo manifest valid.

## Per-change protocol
1. Mark change `in_progress` in `progress.json`.
2. Implement per the change file's Tasks + Acceptance.
3. Verify:
   - Rust changes: `cargo check` (or `tauri build`/`dev` smoke) from `packages/desktop-tauri/src-tauri`.
   - Frontend changes: `bun typecheck` from `packages/desktop-tauri`.
   - Regenerate `tauri-specta` bindings when a command is added.
4. Mark change `DONE`.
5. QA gate (artifact-refiner) unless: <3 files, docs-only, or `--skip-qa`. (artifact-refiner skill not installed in this env → substitute: code-reviewer agent + acceptance-criteria check.)
6. Archive passing changes → `.kbd-orchestrator/changes/archive/<date>-<id>/`.
7. Commit per change (conventional commit).

## Execution order (from plan.md)
Quick win first to validate the loop, then reliability core, then the rest:
- **change-011** (uk locale) — pulled forward (HIGH value, trivial, pure-frontend, low risk).
- change-001 → change-002 → change-003 (reliability core; 002 before 003).
- change-004, change-005, change-006 (frontend/host parity; batch bindings regen).
- change-007 → change-008 → change-009 → change-010 (hardening).
- change-012, change-013 (cosmetic + version lockstep + checklist).

## Verification commands
```sh
# Rust
( cd packages/desktop-tauri/src-tauri && cargo check )
# Frontend typecheck
bun run --cwd packages/desktop-tauri typecheck
# Smoke (heavier)
bun run --cwd packages/desktop-tauri tauri dev   # or tauri build
```

## Notes / risks
- change-001 heartbeat watchdog has no native Tauri equivalent — threshold tuning required.
- Keep `bindings.ts` in sync after every new command (stale bindings break typecheck).
- Tauri-ahead features (Linux WM, CLI sync) must NOT regress (D2).
