# change-013 — Version lockstep + parity smoke checklist

- **Severity:** LOW (versioning + maintenance)
- **Status:** [x] DONE 2026-06-03 (version 1.15.13 lockstep; PARITY-CHECKLIST.md created + linked from AGENTS/CLAUDE)
- **Agent:** typescript
- **Decision:** D1 match Electron version EXACTLY (1.15.13; bump in lockstep)
- **Files:** packages/desktop-tauri/package.json, src-tauri/tauri*.conf.json, src-tauri/Cargo.toml, build scripts, new PARITY-CHECKLIST.md, AGENTS.md

## Approach
Set desktop-tauri version to track packages/desktop (1.15.13). Align tauri.conf.json + Cargo.toml bundle version. (CLI build dev-channel scheme is separate, unchanged.) Add PARITY-CHECKLIST.md condensing the 13 acceptance criteria; link from AGENTS.md Fork Divergences.

## Tasks
- [ ] Bump desktop-tauri package.json to 1.15.13
- [ ] Align tauri.conf.json / Cargo.toml version
- [ ] Create PARITY-CHECKLIST.md
- [ ] Link checklist from AGENTS.md

## Acceptance
- Versions match Electron; checklist exists + linked from AGENTS.md.
