# Plan — Phase: tauri-electron-feature-parity

**Date:** 2026-06-02
**Source:** `assessment.md` (50-point parity matrix) + confirmed decisions below.
**Backend:** native KBD (no OpenSpec, no evolver).
**Direction:** one-way parity — bring Electron (`packages/desktop`) features INTO Tauri (`packages/desktop-tauri`). Do **not** modify Electron.

## Confirmed decisions (from /kbd-plan interview)
- **D1 Versioning:** Tauri matches Electron's version EXACTLY (`1.15.13` now; bump in lockstep). → change-013.
- **D2 Port-back:** Tauri-ahead features (Linux WM detect, display backend, CLI sync) stay **Tauri-only**. No Electron edits. Preserve, don't regress.
- **D3 Crash reports:** **local-only** (match Electron `uploadToServer:false`). No off-device transmission. → change-002.

## ❓ items resolved during planning (grep-confirmed)
- **#6 background color** → CONFIRMED MISSING in Tauri → change-005.
- **#18 CA certs** → CONFIRMED MISSING → change-007.
- **#19 sidecar env cleanup (DEBUG/LD_PRELOAD)** → CONFIRMED MISSING → change-007.
- **#36 Sentry** → `Sentry.init()` runs via shared `packages/app/src/entry.tsx`, so Tauri DOES get Sentry; only desktop-specific tags/release differ → DESCOPED to a verify task in change-010 (not net-new init).
- **#50 Win titlebar theming** → static decorum overlay, no runtime theme color → real but LOW → change-012.
- **#15 timeouts** → Tauri has 5s shell-env + 7s health request timeouts but no start-stall-kill / stop-timeout → change-008.

---

## Ordered Change List

Ordering rationale: (1) reliability gaps first — self-contained Rust, highest user impact; (2) frontend/host integration parity — touches the shared SolidJS surface; (3) enterprise hardening; (4) build/version/cosmetic. Within each group, smallest-blast-radius first.

| Order | Change ID | Title | Sev | Primary files | Recommended agent |
|------|-----------|-------|-----|---------------|-------------------|
| 1 | change-001 | Unresponsive detection + crash dialogs | CRIT | `src-tauri/src/windows.rs`, new `unresponsive.rs`, `lib.rs` | rust-reviewer + flutter? → **rust** |
| 2 | change-002 | Local crash reporting (panic hook → dump file) | CRIT | new `src-tauri/src/crash.rs`, `lib.rs`, `logging.rs` | rust |
| 3 | change-003 | Debug-log export command (+ zip + open folder) | CRIT | `src-tauri/src/logging.rs`, `lib.rs`, `bindings.ts`, `src/index.tsx` | rust + typescript |
| 4 | change-004 | macOS menu / desktop-menu-action coverage audit | HIGH | `src/menu.ts`, compare `@opencode-ai/app` DESKTOP_MENU | typescript |
| 5 | change-005 | Dynamic background-color theme sync | HIGH | new `set_background_color` cmd in `windows.rs`, `bindings.ts`, `src/index.tsx` | rust + typescript |
| 6 | change-006 | Pinch-zoom runtime toggle (store-backed setting) | HIGH | `window_customizer.rs`, store key, `bindings.ts`, `src/index.tsx` | rust + typescript |
| 7 | change-007 | Enterprise hardening: system CA certs + sidecar env cleanup | MED | `cli.rs`, `server.rs`, `main.rs` | rust |
| 8 | change-008 | Sidecar start-stall kill + stop-timeout parity | MED | `cli.rs`, `server.rs`, `constants.rs` | rust |
| 9 | change-009 | Store-key parity (`wslEnabled` read, audit) | MED | `server.rs`, `cli.rs` (WSL read path) | rust |
| 10 | change-010 | Network logging + Sentry desktop tags verify | MED | `logging.rs`, `src/index.tsx` | rust + typescript |
| 11 | change-011 | Add Ukrainian (`uk`) locale | HIGH(easy) | `src/i18n/uk.ts`, `src/i18n/index.ts` | typescript |
| 12 | change-012 | Windows runtime titlebar theming | LOW | `windows.rs`, `bindings.ts` | rust |
| 13 | change-013 | Version lockstep with Electron (1.15.13) + parity smoke checklist | LOW | `package.json`, `tauri.conf.json`, `Cargo.toml`, build scripts, new `PARITY-CHECKLIST.md` | typescript |

> change-011 (`uk` locale) is HIGH severity but trivial effort — sequenced at 11 so it rides with the other i18n/frontend touches, but it can be pulled forward as a quick win if desired.

---

## Change details

### change-001 — Unresponsive detection + crash dialogs  (CRITICAL)
**Gap G1.** Electron samples JS call stacks on hang (`unresponsive.ts`) and shows Relaunch/Export/Quit dialogs on `render-process-gone`/`did-fail-load`.
**Approach (Tauri):** Tauri/WRY has no direct "unresponsive" event equivalent to Electron. Implement a **heartbeat watchdog**: renderer posts a periodic `__alive` IPC ping; a Rust `tokio` task flags "stalled" if no ping within N seconds, then shows a `tauri-plugin-dialog` message (Relaunch / Export Logs / Quit) wired to `relaunch()`, the export command (change-003), and `process::exit`. On `WebviewWindow` load failure, show the same dialog.
**Acceptance:** killing/hanging the webview surfaces the dialog; each button works. No false positives during normal heavy load (tune interval, match Electron's 15s/1s sampling spirit).
**Risk:** heartbeat false-positives. Mitigate with generous threshold + only-when-focused.

### change-002 — Local crash reporting  (CRITICAL · D3 local-only)
**Gap G2 (part 1).** Electron uses Crashpad local dumps (`uploadToServer:false`).
**Approach:** install a Rust `panic::set_hook` (and optionally the `human-panic`/`log-panics` pattern) that writes a timestamped crash file (panic message + backtrace + app/version/platform) into the log dir alongside `logging.rs` output. No network (D3). Surface the crash dir in the debug-export zip (change-003).
**Acceptance:** a forced panic writes a readable crash file; file is included in debug export. No data leaves the device.

### change-003 — Debug-log export command  (CRITICAL)
**Gap G2 (part 2).** Electron `export-debug-logs` zips logs+netlog+crashpad → `~/Downloads/opencode-debug-*.zip` and opens the folder.
**Approach:** new `#[tauri::command] export_debug_logs()` that gathers: desktop log dir, server log dir (XDG + app data), crash files (change-002), a `manifest.json` (version/platform/arch/paths); zips to `~/Downloads/opencode-debug-<ts>.zip` (skip files >50MB or >24h old, matching Electron); opens containing folder via `tauri-plugin-opener`. Add to `tauri-specta` bindings + a menu/UI entry mirroring Electron.
**Acceptance:** command produces a zip with logs+crash+manifest; folder opens; respects size/age filters.

### change-004 — macOS menu / action coverage audit  (HIGH)
**Gap G5.** Tauri `menu.ts` is hand-built and predates the current `DESKTOP_MENU`. Electron derives its native menu from `@opencode-ai/app` `DESKTOP_MENU` + `desktop-menu-actions.ts` (full action set incl. New Window, project/session nav, zoom, fullscreen, devtools).
**Approach:** diff Tauri `menu.ts` against the current `DESKTOP_MENU` (macos filter) and against Electron's `runDesktopMenuAction` action set; add missing items (New Window, project nav Cmd+Opt+Up/Down, View toggles, zoom, fullscreen, devtools) and ensure each fires either `cmd.trigger(id)` or a native window action. Prefer driving from the shared `DESKTOP_MENU` definition to avoid future drift.
**Acceptance:** every macos `DESKTOP_MENU` item appears and works in the Tauri build; action items (window/view/edit/zoom/fullscreen) function.

### change-005 — Dynamic background-color theme sync  (HIGH · confirmed missing)
**Gap G3.** Electron `setBackgroundColor` propagates the theme base color to all windows on every theme/mode change (prevents flash/mismatch).
**Approach:** add `#[tauri::command] set_background_color(color)` that calls `window.set_background_color()` on all windows; expose via bindings; have the renderer call it on theme/mode change (mirror Electron's `index.tsx` wiring against `--background-base`).
**Acceptance:** switching theme updates native window bg immediately; no white flash on launch/resize.

### change-006 — Pinch-zoom runtime toggle  (HIGH)
**Gap G4.** Electron exposes a user setting (`pinchZoomEnabled`, store-backed, broadcast). Tauri disables pinch-zoom unconditionally via `PinchZoomDisablePlugin`.
**Approach:** make the disable toggleable at runtime — store key `pinchZoomEnabled` (plugin-store), a command to read/set it, and have `window_customizer.rs` enable/disable the magnification/GTK-gesture based on the setting; broadcast change to windows. Match Electron defaults.
**Acceptance:** toggling the setting enables/disables pinch-zoom live on macOS and Linux; persists across restart.

### change-007 — Enterprise hardening: CA certs + sidecar env cleanup  (MED · confirmed missing)
**Gap G7.** Electron trusts enterprise system CA certs (`tls.setDefaultCACertificates`) and strips `DEBUG` (all) + `LD_PRELOAD` (Linux) from sidecar env.
**Approach:** (a) for the Rust `reqwest` health client, use `rustls` + `rustls-native-certs` to load system roots (it currently uses `rustls-tls` defaults). (b) In `cli.rs` sidecar spawn, remove `DEBUG` always and `LD_PRELOAD` on Linux before launch. (Sidecar TLS itself is the CLI binary's concern; scope to what the host controls.)
**Acceptance:** health check works behind an enterprise CA; sidecar env no longer carries DEBUG/LD_PRELOAD.

### change-008 — Sidecar start-stall kill + stop-timeout parity  (MED)
**Gap G9/#15.** Electron: 60s start-stall (refreshed on sqlite progress) kills a hung sidecar; 6s stop timeout then force-kill.
**Approach:** add a start-stall watchdog in the spawn/health flow (refresh on `sqlite-migration:` progress lines) that kills + errors if `ready` not seen in ~60s; add a stop timeout in `kill_sidecar` that force-kills after ~6s. Add constants to `constants.rs`.
**Acceptance:** a sidecar that never becomes ready is killed with a clear error; stop always completes within the timeout.

### change-009 — Store-key parity (`wslEnabled` read)  (MED)
**Gap G8.** `get_wsl_config` is hardcoded `false` (store read commented out); audit other keys vs Electron.
**Approach:** wire the real store read for `wslEnabled`; audit `defaultServerUrl`, `linuxDisplayConfig`, language keys for parity with Electron's store usage.
**Acceptance:** WSL setting round-trips through the store; key set matches Electron's semantics.

### change-010 — Network logging + Sentry desktop tags verify  (MED)
**Gap G7(netlog)/#36.** Electron has `netLog`; Sentry in Electron adds desktop-specific tags/release (`desktop@<v>`, `platform:"desktop"`).
**Approach:** (a) add lightweight request logging on the Rust health/HTTP path (optional, low priority). (b) Verify the shared `Sentry.init` (in `packages/app/entry.tsx`) receives correct release/tags when running under Tauri; add desktop tags if absent. No duplicate init.
**Acceptance:** Sentry events from the Tauri build carry desktop platform/release tags; basic network diagnostics available.

### change-011 — Add Ukrainian (`uk`) locale  (HIGH severity / trivial effort)
**Gap G6.** Electron has 16 locales incl. `uk`; Tauri has 15 (missing `uk`).
**Approach:** port `packages/desktop/src/renderer/i18n/uk.ts` desktop strings into `packages/desktop-tauri/src/i18n/uk.ts`; register in `i18n/index.ts` (detection + dictionary merge), matching the `no`/`zht` mapping style.
**Acceptance:** `uk` selectable and detected; desktop strings render; count = 16.

### change-012 — Windows runtime titlebar theming  (LOW)
**Gap G11/#50.** Electron updates Windows titlebar overlay colors at runtime by theme; Tauri's decorum overlay is static.
**Approach:** add a command/path to update the decorum/overlay title bar colors when the renderer theme changes on Windows (best-effort within decorum's API).
**Acceptance:** Windows titlebar symbol/background tracks light/dark theme at runtime.

### change-013 — Version lockstep + parity smoke checklist  (LOW · D1)
**Gap version + ongoing maintenance.** D1: match Electron version exactly.
**Approach:** set `packages/desktop-tauri/package.json` version to track `packages/desktop` (1.15.13); align `tauri.conf.json` `version` and `Cargo.toml` where they drive bundle version (note: the CLI build's dev-channel scheme is separate and unchanged). Add `packages/desktop-tauri/PARITY-CHECKLIST.md` — a smoke checklist the Tauri build must pass on each upstream merge (the 13 changes' acceptance criteria condensed). Reference it from `AGENTS.md` Fork Divergences.
**Acceptance:** versions match; checklist exists and is linked from AGENTS.md.

---

## Sequencing notes
- **change-001/002/003 form the "reliability core"** and share files (`logging.rs`, `lib.rs`); do them as a unit, 002 before 003 (export depends on crash files).
- **change-005/006/012** all add a Rust command + a `bindings.ts` regen + a renderer call — batch the `tauri-specta` regen.
- **change-004 and change-011** are pure-frontend and can run in parallel with the Rust changes.
- After every Rust change: `bun run --cwd packages/desktop-tauri tauri build` (or `dev`) smoke + `cargo check`. After frontend: `bun typecheck` from the package.

## Risks / unknowns to watch
- Tauri has **no native unresponsive event** → change-001 uses a heartbeat; needs careful threshold tuning.
- `tauri-specta` binding regen must stay in sync; stale `bindings.ts` will break typecheck.
- decorum's runtime theming API may be limited (change-012 best-effort).
- Building Tauri requires the Rust toolchain + platform libs (per README); confirm local env before change-001.

## Next action
`/kbd-execute` — start with change-001 (or pull change-011 forward as a quick win). Recommended agent per change is in the table.
