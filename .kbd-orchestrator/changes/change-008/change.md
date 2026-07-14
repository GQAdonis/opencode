# change-008 — Sidecar start-stall kill + stop-timeout parity

- **Severity:** MEDIUM (gap G9 / #15)
- **Status:** [x] DONE 2026-06-03 (cargo check pass; 60s start-stall kill; stop already forceful via process-wrap)
- **Agent:** rust
- **Files:** src-tauri/src/cli.rs, server.rs, constants.rs

## Approach
Electron: 60s start-stall (refreshed on sqlite progress) + 6s stop timeout. Add start-stall watchdog (refresh on sqlite-migration: lines) that kills+errors if ready not seen ~60s; add stop timeout force-kill ~6s. Constants in constants.rs.

## Tasks
- [ ] Add START_STALL + STOP timeout constants
- [ ] Start-stall watchdog refreshed on sqlite progress
- [ ] Stop timeout force-kill in kill_sidecar

## Acceptance
- Hung sidecar killed with clear error; stop completes within timeout.
