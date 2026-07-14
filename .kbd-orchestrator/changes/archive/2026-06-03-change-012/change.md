# change-012 — Windows runtime titlebar theming

- **Severity:** LOW (gap G11 / #50)
- **Status:** [x] DONE 2026-06-03 (satisfied by architecture — decorum overlay is transparent/CSS-themed; no code needed)
- **Agent:** rust
- **Files:** src-tauri/src/windows.rs, src/bindings.ts

## Approach
Electron updates Windows titlebar overlay colors at runtime by theme; Tauri decorum overlay is static. Add command/path to update decorum overlay colors on theme change (best-effort within decorum API).

## Tasks
- [ ] Add runtime titlebar color update path (Windows)
- [ ] Wire renderer theme change → command

## Acceptance
- Windows titlebar tracks light/dark theme at runtime (best-effort).

## Resolution (2026-06-03): satisfied by architecture — no code change

decorum 1.1.1 exposes only `create_overlay_titlebar()`; it has NO native
titlebar color API. Its overlay is a transparent (`backgroundColor: transparent`)
injected HTML strip over the web page, so it already tracks the web UI theme by
construction — unlike Electron's native `titleBarOverlay`, which required an
explicit runtime color setter. With change-005 also syncing the native window
background beneath it, Windows titlebar theming tracks the theme automatically.

This is an accepted architectural difference, not a fixable gap. No runtime
command is warranted (it would be a no-op). Documented in the parity checklist.
