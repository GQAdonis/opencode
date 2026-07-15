# Close the Tauri `Platform` gaps

**KBD change:** change-004 (phase `v2-architecture-alignment`)
**Depends on:** change-003 (Tauri rebased onto v2)
**Split from:** `wslServers` → change-004b (deferred)

## Why

The integration contract between the shared SolidJS frontend and a desktop host is the
`Platform` object (`packages/app/src/context/platform.tsx`) — unchanged `dev`→`v2` and
predating v2. Our Tauri host builds it as a single object literal
(`packages/desktop-tauri/src/index.tsx`, no spreads), so a member missing from that literal is
simply absent.

Three members are absent. Each leaves a **user-visible feature dead** in the shared app,
because the app feature-detects on the Platform member and silently hides or no-ops:

| Member | Consumer in `packages/app` | What is broken today |
|---|---|---|
| `exportDebugLogs` | `app.tsx:293` (`logs.export` command), `pages/error.tsx:302` | Command palette entry absent; "Export logs" button on the crash screen hidden |
| `runDesktopMenuAction` | `windows-app-menu.tsx:34` via `titlebar.tsx` | **Windows/Linux only.** Every *action*-typed menu entry is a dead click (reload, devtools, all zoom, fullscreen, window ops, undo/redo/cut/copy/paste), while *command*-typed entries still work — so the menu looks **half-functional**, the worst failure mode. macOS is unaffected (Tauri builds a real native menu). |
| `recordFatalRendererError` | `pages/error.tsx:233` | Fatal renderer errors are never written to native logs |

**`exportDebugLogs` is a one-line fix.** The Rust command (`src-tauri/src/logging.rs:71`), its
invoke registration (`src-tauri/src/lib.rs:603`), and the generated TS binding
(`src/bindings.ts:30`) **all already exist** — it is only missing from the Platform literal, so
today the Rust command is reachable from the native macOS menu but not from the app.

## What

1. `exportDebugLogs` — expose the existing binding on `Platform`.
2. `recordFatalRendererError` — new Rust command writing into the existing `logging.rs` sink,
   plus binding regen, plus the Platform member.
3. `runDesktopMenuAction` — a renderer-side dispatcher for the `DesktopMenuAction` union.
   Mirror Electron's split: handle zoom in the renderer, everything else via Tauri's window /
   process / updater APIs — the same primitives `src/menu.ts` already uses for the macOS
   native menu. This requires exporting the zoom helpers, which are currently module-private
   in `src/webview-zoom.ts`.

## Non-goals

- `wslServers` (change-004b). It is an **11-method subsystem**, not a wiring gap: Electron
  implements it across 6 modules; Tauri exposes 3 WSL-adjacent commands and has no distro
  enumeration/install logic. Windows-only, and it degrades gracefully today.

## Success criteria

- All three members present on the Platform object and typechecking against the contract.
- `cargo check` clean; frontend typecheck clean.
- Zero diff vs `upstream/v2` outside fork-owned paths.
