# Manual GUI Verification Run-Sheet — Tauri Desktop

Some parity behaviors can only be confirmed by a human at a running window
(the agent/CI cannot observe GUI). Run this sheet in a `tauri dev` session after
significant changes to `packages/desktop-tauri` or after an upstream merge that
touches `packages/desktop`. Headless-testable behavior is already covered by
`cargo test` (see `src-tauri/src/{crash,logging,cli}.rs` test modules) — this
sheet is only the GUI-bound remainder.

## Setup

```bash
bun install
bun run --cwd packages/desktop-tauri tauri dev    # builds sidecar via predev, opens the app
```
Requires a nightly toolchain (see README). Wait for the main window + a working session.

Record PASS/FAIL per item. A FAIL is a parity regression — file it against the
relevant change.

---

## 1. Unresponsive watchdog + recovery dialog  *(change-001, gap G1)*

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | With the app focused, freeze the renderer: open devtools console and run `while(true){}` (or a long sync loop). Keep the window focused for ~15s. | After ~15s a native dialog appears: **"opencode is not responding"** with buttons **Relaunch / Export Logs / Quit**. |
| 1.2 | Click **Export Logs**. | A `~/Downloads/opencode-debug-<ts>/` folder opens (see §3); the dialog re-appears afterward. |
| 1.3 | Click **Quit**. | App exits; sidecar process is gone (`pgrep opencode-cli` empty). |
| 1.4 | Repeat 1.1, click **Relaunch**. | App restarts cleanly; only one sidecar runs afterward. |
| 1.5 | Negative: blur the window (click another app) while the renderer is busy. | **No** dialog while unfocused; no duplicate dialogs on refocus. |

## 2. Crash reporting  *(change-002, gap G2)*

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | Trigger a Rust panic (e.g. a debug build with a temporary `panic!` in a command, or a known crash path). | A file `crash_<ts>.txt` appears in `<app_log_dir>/crashes/` (macOS: `~/Library/Logs/<bundle-id>/crashes/`). |
| 2.2 | Open the crash file. | Contains `version`, `os`, `arch`, `location`, `message`, and a `backtrace:` section. Nothing is sent off-device. |

## 3. Debug-log export  *(change-003, gap G2)*

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | Trigger export: macOS menu **App → Export Logs…**, or the watchdog dialog's Export Logs. | A `~/Downloads/opencode-debug-<ts>/` folder is created and revealed in Finder. |
| 3.2 | Inspect the folder. | Contains `desktop-logs/` (incl. `crashes/` if any), `server-logs-*/` if present, and `manifest.json` with version/os/arch/paths. Files >50MB are absent. |

## 4. Background-color theme sync  *(change-005, gap G3)*

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | Launch the app. | No white/black flash before the UI paints — the native window bg matches the theme immediately. |
| 4.2 | Switch theme/mode (light ↔ dark) in settings. | The native window background updates to match with no mismatched border/edge flash on resize. |

## 5. Pinch-zoom runtime toggle  *(change-006, gap G4)*

| Step | Action | Expected |
|------|--------|----------|
| 5.1 | macOS: Settings → toggle "pinch/Ctrl-scroll zoom" **on**. Then trackpad-pinch or Cmd+Ctrl+scroll. | Zoom gesture now changes magnification **live** (no relaunch). |
| 5.2 | Toggle **off**, pinch again. | Gesture no longer zooms, live. |
| 5.3 | Restart the app. | The last setting persists. |
| 5.4 | Linux only (if available): toggling **off** disables the gesture; toggling **on** takes effect **after relaunch** (documented divergence — not a bug). |

## 6. macOS menu coverage  *(change-004, gap G5)*

| Step | Action | Expected |
|------|--------|----------|
| 6.1 | Open each menu. | **App**: About, Check for Updates, Install CLI, Settings (⌘,), Reload Webview, Export Logs…, Restart. **File**: New Session (⇧⌘S), Open Project (⌘O), Close Window. **Edit**: standard. **View**: Toggle Sidebar/Terminal/File Tree, Back/Forward, Prev/Next Session, **Prev/Next Project** (⌘⌥↑/↓), **Toggle Full Screen**. **Window**: Minimize/Maximize/Close. **Help**: Docs, Support, Feedback, Report Bug. |
| 6.2 | Trigger Settings (⌘,), Toggle Full Screen, Next/Prev Project. | Each performs its action (settings opens; window enters/exits fullscreen; project navigation works). |
| 6.3 | Confirm **New Window** is absent. | Correct — Tauri shell is single-window (documented divergence). |

## 7. i18n  *(change-011, gap G6)*

| Step | Action | Expected |
|------|--------|----------|
| 7.1 | Settings → language → Ukrainian (`uk`). | Desktop strings render in Ukrainian (menu/updater/CLI dialogs). 16 locales selectable. |

---

## Sign-off

| Section | Result | Notes |
|---------|--------|-------|
| 1 Unresponsive | ☐ | |
| 2 Crash | ☐ | |
| 3 Export | ☐ | |
| 4 BG sync | ☐ | |
| 5 Pinch-zoom | ☐ | |
| 6 Menu | ☐ | |
| 7 i18n | ☐ | |

A full pass = the Tauri GUI is at parity for this revision. Cross-platform
(Linux/Windows) GUI verification is **deferred** — see `PARITY-CHECKLIST.md`.
