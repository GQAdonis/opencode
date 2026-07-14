# change-003 — Debug-log export command (zip + open folder)

- **Severity:** CRITICAL (gap G2 part 2)
- **Status:** [x] DONE 2026-06-03 (cargo check + typecheck pass; folder export + manifest, Export Logs wired into watchdog dialog)
- **Agent:** rust + typescript
- **Files:** src-tauri/src/logging.rs, lib.rs, src/bindings.ts (regen), src/index.tsx

## Approach
New #[tauri::command] export_debug_logs() gathering desktop log dir, server log dir (XDG + app data), crash files (change-002), manifest.json (version/platform/arch/paths); zip to ~/Downloads/opencode-debug-<ts>.zip (skip >50MB or >24h old); open folder via tauri-plugin-opener. Add to tauri-specta bindings + menu/UI entry.

## Tasks
- [ ] Implement export_debug_logs command (gather + zip + filters)
- [ ] Write manifest.json into zip
- [ ] Open containing folder
- [ ] Regenerate tauri-specta bindings.ts
- [ ] Wire menu/UI entry (mirror Electron)

## Acceptance
- Produces zip with logs+crash+manifest; folder opens; respects size/age filters.

## Depends on
- change-002 (crash files)
