# change-005 — Dynamic background-color theme sync

- **Severity:** HIGH (gap G3; grep-confirmed missing)
- **Status:** [x] DONE 2026-06-03 (cargo + typecheck pass; set_background_color cmd + MutationObserver sync)
- **Agent:** rust + typescript
- **Files:** src-tauri/src/windows.rs (new set_background_color cmd), src/bindings.ts, src/index.tsx

## Approach
Add #[tauri::command] set_background_color(color) calling window.set_background_color() on all windows; expose via bindings; renderer calls on theme/mode change (mirror Electron index.tsx against --background-base).

## Tasks
- [ ] Add set_background_color command (all windows)
- [ ] Regenerate bindings.ts
- [ ] Call from renderer on theme/mode change

## Acceptance
- Theme switch updates native window bg immediately; no white flash on launch/resize.
