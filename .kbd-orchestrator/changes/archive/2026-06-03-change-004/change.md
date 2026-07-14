# change-004 — macOS menu / desktop-menu-action coverage audit

- **Severity:** HIGH (gap G5)
- **Status:** [x] DONE 2026-06-03 (typecheck + cargo check pass; added Settings, Export Logs, project nav, Full Screen, Window menu)
- **Agent:** typescript
- **Files:** packages/desktop-tauri/src/menu.ts; compare @opencode-ai/app DESKTOP_MENU + Electron desktop-menu-actions.ts

## Approach
Diff Tauri menu.ts against current DESKTOP_MENU (macos filter) and Electron runDesktopMenuAction set. Add missing items (New Window, project nav Cmd+Opt+Up/Down, View toggles, zoom, fullscreen, devtools); ensure each fires cmd.trigger(id) or native window action. Prefer driving from shared DESKTOP_MENU to avoid drift.

## Tasks
- [ ] Diff against DESKTOP_MENU (macos) and Electron action set
- [ ] Add missing menu items + accelerators
- [ ] Wire missing actions (window/view/edit/zoom/fullscreen/devtools)
- [ ] Prefer shared DESKTOP_MENU source

## Acceptance
- Every macos DESKTOP_MENU item present + working in Tauri build; action items function.
