# Assessment — Phase: tauri-electron-feature-parity

**Date:** 2026-06-02
**Goal (from argument):** Bring the Tauri desktop app (`packages/desktop-tauri`, `@opencode-ai/desktop-tauri`) to feature parity with the maintained Electron app (`packages/desktop`, `@opencode-ai/desktop`), and keep the Tauri app maintained going forward.

## Context

- Both desktop apps are intentionally kept in this fork (see `CLAUDE.md`/`AGENTS.md` → "Fork Divergences").
- The Tauri app is the snapshot recovered from commit `6f7d63e9c` (pre upstream PR #25822, which replaced Tauri with Electron). It is therefore **frozen at the feature level of ~April 2026** while the Electron app has continued to evolve upstream.
- Versions: Electron `1.15.13` vs Tauri `1.14.35` — the gap is the window of features added to Electron after the Tauri snapshot.
- Both share the same SolidJS frontend (`@opencode-ai/app` + `@opencode-ai/ui`) and the same `Platform` interface contract, so parity work is concentrated in the **native/host layer** (Rust commands vs Electron main process) plus a few renderer integration points.

## Method

Two exhaustive code inventories were produced (Electron main/preload/renderer/build; Tauri Rust/bindings/frontend/build) and compared capability-area by capability-area. Findings below are grounded in specific files.

---

## Parity Matrix (Electron = reference)

Legend: ✅ present & equivalent · 🟡 present but behind/divergent · ❌ missing · ➖ N/A

| # | Capability | Electron | Tauri | Gap |
|---|------------|----------|-------|-----|
| 1 | Window creation, idempotent main window | ✅ | ✅ | — |
| 2 | Window state persistence | ✅ `electron-window-state` | ✅ `plugin-window-state` (200ms debounce) | ✅ |
| 3 | macOS traffic-light positioning | ✅ (12,14) | ✅ (12,18) | 🟡 minor offset diff |
| 4 | Windows frameless + overlay titlebar | ✅ `titleBarOverlay`, theme-aware, zoom-scaled | 🟡 `plugin-decorum` overlay | 🟡 verify theme-color + zoom-height parity |
| 5 | Linux decoration policy (tiling WM detection) | ➖ standard frame | ✅ richer (`linux_windowing.rs`) | Tauri ahead |
| 6 | Dynamic background color (theme sync) | ✅ all-windows propagate | ❓ not observed | ❌ likely missing |
| 7 | Dock icon (macOS) | ✅ `setDockIcon` | ❓ via bundle only | 🟡 verify |
| 8 | Webview zoom (kbd +/-/0, range 0.2–10) | ✅ | ✅ | ✅ |
| 9 | Pinch-zoom disable | ✅ store-toggle + wheel gesture | ✅ native (objc2 / GTK) | 🟡 Tauri lacks the *runtime toggle*; disables unconditionally |
| 10 | **Unresponsive handling** (JS callstack sampler + dialog) | ✅ `unresponsive.ts` | ❌ none | **❌ MISSING** |
| 11 | **Crash handling** (render-process-gone, did-fail-load dialogs) | ✅ | ❌ none | **❌ MISSING** |
| 12 | Server/sidecar spawn | ✅ utilityProcess fork | ✅ process-wrap | ✅ different mechanism, equivalent |
| 13 | Free-port allocation + `OPENCODE_PORT` | ✅ | ✅ | ✅ |
| 14 | Basic-auth password (UUID) + health check | ✅ `/global/health` | ✅ same | ✅ |
| 15 | Start-stall / stop timeouts | ✅ 60s/6s | 🟡 30s health cap, no explicit stall-kill on `ready` | 🟡 verify timeout parity |
| 16 | Shell env probe (`-il`→`-l`, nushell skip, env -0) | ✅ | ✅ | ✅ |
| 17 | Loopback NO_PROXY injection | ✅ | ✅ | ✅ |
| 18 | System CA certs (enterprise) | ✅ `tls.setDefaultCACertificates` | ❓ not observed | 🟡 verify / likely missing |
| 19 | Sidecar env cleanup (strip DEBUG, LD_PRELOAD) | ✅ | ❓ not observed | 🟡 verify |
| 20 | WSL spawn + path conversion (`wsl_path`) | ✅ | ✅ | ✅ |
| 21 | CLI install/sync (version check) | 🟡 `install-cli` stub | ✅ `install_cli`/`sync_cli` | Tauri ahead |
| 22 | Deep links (`opencode://`) | ✅ | ✅ | ✅ |
| 23 | Single-instance lock | ✅ | ✅ | ✅ |
| 24 | Pending deep-link buffering before renderer ready | ✅ `consume-initial-deep-links` | ✅ `getCurrent()` | ✅ |
| 25 | macOS native menu | ✅ from `DESKTOP_MENU` | 🟡 hand-built in `menu.ts` | 🟡 verify menu items match current DESKTOP_MENU (e.g. New Window, project nav) |
| 26 | Windows in-app menu | ✅ (renderer) | ✅ (shared renderer) | ✅ |
| 27 | Desktop menu action dispatch (window/view/edit) | ✅ `desktop-menu-actions.ts` (full set incl. New Window) | 🟡 `cmd.trigger` bridge | 🟡 verify all actions covered (New Window, zoom, fullscreen, devtools) |
| 28 | electron-store / plugin-store key parity | ✅ multi-store | 🟡 fewer keys; `wslEnabled` read hardcoded false | 🟡 wire reads |
| 29 | **Migration** (Tauri↔Electron `.dat`) | ✅ Tauri→Electron one-shot | ➖ reverse N/A | ➖ |
| 30 | SQLite (JSON→SQLite) migration + loading UI | ✅ | ✅ | ✅ |
| 31 | Markdown native render | ✅ `marked` (Node) | ✅ `comrak` (Rust) | ✅ equivalent |
| 32 | Structured logging + 7-day cleanup | ✅ `electron-log` | ✅ `tracing` | ✅ |
| 33 | Network logging (`netLog`) | ✅ | ❌ none | 🟡 minor |
| 34 | **Crash reporter (Crashpad, local dumps)** | ✅ | ❌ none | **❌ MISSING** |
| 35 | **Debug-log export (zip + open folder)** | ✅ `export-debug-logs` | 🟡 `tail()` only, no zip/export command | **❌ MISSING export** |
| 36 | Sentry (renderer) | ✅ explicit init in `index.tsx` | 🟡 dep present, init not in desktop entry | 🟡 verify init path |
| 37 | Clipboard read image → PNG | ✅ | ✅ | ✅ |
| 38 | Notifications (focus-gated) | ✅ | ✅ | ✅ |
| 39 | Dialogs (open/save/dir/message/ask) | ✅ | ✅ | ✅ |
| 40 | Shell open / open-path (+ macOS `open -a`, PowerShell) | ✅ | ✅ (`open_in_powershell`) | ✅ |
| 41 | OS info / app-exists / resolve-app-path (registry) | ✅ | ✅ (registry, where.exe) | ✅ |
| 42 | Linux display backend (Wayland/X11 select) | 🟡 stub IPC | ✅ full (`linux_display.rs`) | Tauri ahead |
| 43 | Updater (check/download/prompt/install/relaunch) | ✅ `electron-updater` | ✅ `plugin-updater` | ✅ equivalent flow |
| 44 | `latest.json` (Tauri-format) generation | ✅ script | ✅ script | ✅ |
| 45 | `latest.yml` (electron-updater) generation | ✅ | ➖ N/A for Tauri | ➖ |
| 46 | Build targets mac/win/linux | ✅ dmg+zip / nsis / AppImage+deb+rpm | ✅ dmg(app) / nsis / deb+rpm+AppImage | 🟡 Electron also ships `zip` (mac); Tauri uses `.app` |
| 47 | Code signing (mac notarize, win PS) | ✅ | 🟡 win PS present; mac notarize unverified | 🟡 verify notarization |
| 48 | i18n locales | ✅ **16** (adds `uk`) | 🟡 **15** (no `uk`) | **❌ missing `uk` (Ukrainian)** |
| 49 | Three channels (dev/beta/prod) | ✅ | ✅ | ✅ |
| 50 | Window permission `set-titlebar` runtime (Win theme) | ✅ | ❓ static | 🟡 verify dynamic titlebar theming on Windows |

---

## Gap Summary

### CRITICAL (functional gaps — user-visible reliability)
- **G1. Unresponsive + crash handling (#10, #11):** Electron samples JS call stacks on hang and shows Relaunch/Export/Quit dialogs on crash. Tauri has none. Reliability regression for users.
- **G2. Crash reporter + debug-log export (#34, #35):** Electron produces local Crashpad dumps and a one-click debug zip (`export-debug-logs`) used in support. Tauri only has an in-memory `tail()`. No support-grade diagnostics export.

### HIGH (feature/behavior gaps)
- **G3. Dynamic background color theme sync (#6):** likely missing on Tauri; causes flash/mismatch on theme switch.
- **G4. Pinch-zoom runtime toggle (#9):** Electron exposes a user setting; Tauri disables unconditionally — no parity setting.
- **G5. macOS menu / desktop-menu-action coverage (#25, #27):** Tauri menu is hand-built and predates current `DESKTOP_MENU`; verify New Window, project/session navigation, zoom, fullscreen, devtools actions are all present and wired.
- **G6. Ukrainian locale `uk` (#48):** present in Electron, absent in Tauri.

### MEDIUM (hardening / enterprise parity)
- **G7. System CA certs (#18), sidecar env cleanup (#19), network logging (#33):** enterprise/proxy hardening Electron added; verify/port to Tauri.
- **G8. Store key parity (#28):** `wslEnabled` read is hardcoded `false` in Tauri; wire it and audit other keys.
- **G9. Start-stall kill + timeout parity (#15):** align sidecar start/stop timeout semantics.
- **G10. Sentry init path (#36):** confirm Sentry initializes for the Tauri desktop entry, not only the shared app.

### LOW (cosmetic / build)
- **G11. Traffic-light offset (#3), mac `zip` artifact (#46), notarization verification (#47), Windows runtime titlebar theming (#50).**

### AREAS WHERE TAURI IS AHEAD (preserve, do not regress)
- Linux decoration policy + display-backend selection (#5, #42), CLI install/sync (#21).

---

## Recommended Phase Breakdown (for /kbd-plan)

1. **P1 — Reliability core:** unresponsive sampler + crash dialogs (G1), crash reporting + debug-log export command + zip (G2). Highest user impact.
2. **P2 — Frontend/host integration parity:** dynamic background color (G3), pinch-zoom toggle (G4), menu/action coverage audit + fixes (G5), add `uk` locale (G6).
3. **P3 — Enterprise hardening:** system CA certs, sidecar env cleanup, network logging, store-key wiring, timeout parity, Sentry init (G7–G10).
4. **P4 — Build/packaging + cosmetic:** mac zip, notarization verification, titlebar theming, traffic-light offset (G11). Add a **parity smoke checklist** the Tauri build must pass each upstream merge.

## Open Questions (resolve in /kbd-plan)
- Q1: Is matching Electron's **exact** version number (`1.15.13`) a goal, or keep Tauri on its own dev-channel scheme (`0.0.0-dev-<ts>`) as currently built? (Affects #version + updater manifests.)
- Q2: Are the "Tauri ahead" features (Linux WM detection, CLI sync) ones we want to *port back* into Electron too, or keep Tauri-only?
- Q3: Crash reporting — local-only (match Electron's `uploadToServer:false`) or wire to Sentry?

## Verification Signals Used
- Electron main-process inventory: `packages/desktop/src/main/*.ts`, `preload/*`, `renderer/*`, build configs.
- Tauri inventory: `packages/desktop-tauri/src-tauri/src/*.rs`, `tauri*.conf.json`, `capabilities/default.json`, `src/*`, build scripts.
- Locale diff: 16 (Electron) vs 15 (Tauri); missing `uk`.
- Version diff: `1.15.13` vs `1.14.35`.

## Items marked ❓ require code-confirmation in /kbd-plan
#6 background color, #18 CA certs, #19 env cleanup, #36 Sentry init, #50 titlebar theming — these were "not observed" in the inventory and must be grep-confirmed before being scheduled as work (avoid building something that already exists).
