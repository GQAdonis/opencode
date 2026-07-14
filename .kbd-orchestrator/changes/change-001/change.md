# change-001 — Unresponsive detection + crash dialogs

- **Severity:** CRITICAL (gap G1)
- **Status:** [x] DONE 2026-06-03 (cargo check + typecheck pass; code-review HIGH issues fixed)
- **Agent:** rust-reviewer / rust-build-resolver
- **Files:** packages/desktop-tauri/src-tauri/src/windows.rs, new unresponsive.rs, lib.rs

## Why
Electron samples JS call stacks on hang and shows Relaunch/Export/Quit dialogs on crash. Tauri has none — reliability regression.

## Approach
Tauri/WRY has no native unresponsive event. Implement a heartbeat watchdog: renderer posts periodic __alive ping; a tokio task flags stalled if no ping within N seconds, then shows a tauri-plugin-dialog (Relaunch / Export Logs / Quit) wired to relaunch(), export cmd (change-003), process::exit. On webview load failure show the same dialog.

## Tasks
- [ ] Add renderer heartbeat ping (interval, only-when-focused)
- [ ] Add Rust watchdog tokio task + stall threshold constant
- [ ] Show dialog (Relaunch/Export/Quit) on stall
- [ ] Wire load-failure path to same dialog
- [ ] Tune threshold to avoid false positives under heavy load

## Acceptance
- Hanging/killing the webview surfaces the dialog; each button works.
- No false positives during normal heavy load.

## Depends on
- change-003 (Export Logs button target)
