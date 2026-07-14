# change-002 — Local crash reporting (panic hook → dump file)

- **Severity:** CRITICAL (gap G2 part 1)
- **Status:** [x] DONE 2026-06-03 (cargo check pass; panic hook → crashes/ subdir, local-only)
- **Agent:** rust
- **Decision:** D3 local-only — NO network transmission (match Electron uploadToServer:false)
- **Files:** new packages/desktop-tauri/src-tauri/src/crash.rs, lib.rs, logging.rs

## Approach
Install Rust panic::set_hook writing a timestamped crash file (message + backtrace + app/version/platform) into the log dir. No network. Surface crash dir in debug export (change-003).

## Tasks
- [ ] Add panic hook writing crash file to log dir
- [ ] Include version/platform/arch/backtrace in dump
- [ ] Ensure crash dir picked up by export (coordinate with change-003)

## Acceptance
- Forced panic writes a readable crash file.
- File included in debug export; nothing leaves the device.
