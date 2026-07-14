# change-101 — Fix build flow + README (predev + specta/nightly)

- **Severity:** HIGH (gap V3) · **Status:** [x] DONE 2026-06-03 (README documents nightly+specta+predev flow; verified predev env requirement) · **Agent:** typescript/docs
- **Files:** packages/desktop-tauri/README.md, packages/desktop-tauri/package.json, src-tauri/tauri.conf.json (verify beforeDevCommand)

## Why
README `tauri dev` fails on a clean checkout: build.rs needs the sidecar (only predev makes it) and the build needs nightly + the specta .cargo/config.toml fix — all undocumented.

## Tasks
- [ ] Document clean-checkout flow in README: bun install → predev (builds+copies sidecar) → tauri dev; note nightly + .cargo/config.toml specta fix
- [ ] Verify predev actually triggers (npm predev hook vs tauri beforeDevCommand); wire if missing
- [ ] Confirm steps work from a sidecar-absent state

## Acceptance
- Following the README from clean state yields working cargo check/tauri dev with no manual sidecar copy.
