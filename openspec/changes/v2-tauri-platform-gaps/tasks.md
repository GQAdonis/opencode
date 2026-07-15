# Tasks

- [x] 1. `exportDebugLogs` — expose the existing binding on the Platform literal (command, registration and binding already exist; only the Platform member is missing)
- [x] 2. `recordFatalRendererError` — add the Rust command writing to the existing logging sink, register it, regenerate bindings, and expose it on Platform
- [x] 3. `runDesktopMenuAction` — export the zoom helpers from `webview-zoom.ts`, then implement a dispatcher covering every `DesktopMenuAction` (exhaustively, so a new action cannot be silently ignored)
- [x] 4. Verify: `cargo check` clean, frontend typecheck clean, zero diff vs `upstream/v2` outside fork-owned paths
