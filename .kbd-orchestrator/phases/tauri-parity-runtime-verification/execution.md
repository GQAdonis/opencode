# Execution — Phase: tauri-parity-runtime-verification

**Date:** 2026-06-03 · **Backend:** native-tool (Claude Code direct) · No OpenSpec/evolver.

## Per-change protocol
1. Mark `in_progress` in `progress.json`.
2. Implement per the change file Tasks/Acceptance.
3. Verify: docs → check steps reflect reality; tests → `cargo test` in `packages/desktop-tauri/src-tauri`; build → `cargo check`.
4. Mark `DONE`, archive, commit (conventional).
5. QA gate: artifact-refiner not installed → substitute code-reviewer agent for ≥3-file code changes; docs-only / <3-file → skip per rules.

## Order
- change-101 (build flow + README) → change-102 (headless tests) → change-103 (manual run-sheet, authored) → change-104 (deferred + divergences).

## Agent-completable?
- 101 ✅ · 102 ✅ (cargo test) · 103 authored ✅ / executed by user · 104 ✅.

## Verification commands
```sh
( cd packages/desktop-tauri/src-tauri && cargo test )
( cd packages/desktop-tauri/src-tauri && cargo check )
```
