# change-007 — CA certs + sidecar env cleanup

- **Severity:** MEDIUM (gap G7; grep-confirmed missing)
- **Status:** [x] DONE 2026-06-03 (cargo test pass; native CA roots + DEBUG/LD_PRELOAD strip w/ unit tests)
- **Agent:** rust
- **Files:** src-tauri/src/cli.rs, server.rs, main.rs

## Approach
(a) reqwest health client: use rustls + rustls-native-certs to load system roots. (b) cli.rs sidecar spawn: remove DEBUG always, LD_PRELOAD on Linux, before launch.

## Tasks
- [ ] Load system CA roots for reqwest client
- [ ] Strip DEBUG from sidecar env (all platforms)
- [ ] Strip LD_PRELOAD on Linux

## Acceptance
- Health check works behind enterprise CA; sidecar env free of DEBUG/LD_PRELOAD.
