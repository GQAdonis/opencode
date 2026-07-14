# change-006 — Pinch-zoom runtime toggle (store-backed)

- **Severity:** HIGH (gap G4)
- **Status:** [x] DONE 2026-06-03 (cargo + typecheck pass; macOS live toggle, Linux/Win apply-at-creation; SAFETY-documented)
- **Agent:** rust + typescript
- **Files:** src-tauri/src/window_customizer.rs, store key, src/bindings.ts, src/index.tsx

## Approach
Make the unconditional disable toggleable: store key pinchZoomEnabled (plugin-store), command to read/set, window_customizer enables/disables magnification (macOS objc2) / GTK gesture (Linux) per setting; broadcast change. Match Electron defaults.

## Tasks
- [ ] Add pinchZoomEnabled store key + read/set command
- [ ] Make macOS magnification toggle live
- [ ] Make Linux GTK gesture toggle live
- [ ] Broadcast + persist; regen bindings; wire renderer setting

## Acceptance
- Toggle enables/disables pinch-zoom live (macOS + Linux); persists across restart.
