# change-009 — Store-key parity

- **Severity:** MEDIUM (gap G8)
- **Status:** [x] DONE 2026-06-03 (cargo check pass; wslEnabled real read; key audit complete)
- **Agent:** rust
- **Files:** src-tauri/src/server.rs, cli.rs (WSL read path)

## Approach
get_wsl_config is hardcoded false (read commented out). Wire real store read; audit defaultServerUrl, linuxDisplayConfig, language keys vs Electron.

## Tasks
- [ ] Wire real wslEnabled store read
- [ ] Audit remaining store keys vs Electron semantics

## Acceptance
- WSL setting round-trips through store; key set matches Electron.
