# Tauri ⇄ Electron Parity Checklist

This fork maintains **two** desktop apps: the upstream Electron app at
`packages/desktop` and this Tauri app at `packages/desktop-tauri`. The Tauri app
must stay at feature parity with Electron. Run this checklist after each upstream
merge that touches `packages/desktop`, and whenever changing the Tauri app.

> Version policy: `packages/desktop-tauri` tracks `packages/desktop`'s version
> exactly (lockstep). Bump both together. (`tauri.conf.json` reads the version
> from `package.json`.)

## Build gate

- [ ] `cd packages/desktop-tauri/src-tauri && cargo check` is green
      (requires nightly + the `.cargo/config.toml` specta f16/f128 fix).
- [ ] `bun run --cwd packages/desktop-tauri typecheck` is green.
- [ ] `cargo test` (in `src-tauri`) passes.
- [ ] `tauri-specta` bindings regenerated if any `#[tauri::command]` changed
      (`cargo test test_export_types` rewrites `src/bindings.ts`).
- [ ] Bundled sidecar is the freshly-built CLI. `tauri build` runs the
      `prebuild` hook (`scripts/stage-sidecar.ts`), which rebuilds the opencode
      CLI and restages `src-tauri/sidecars/opencode-cli-<triple>`. After a build,
      `<App>.app/Contents/MacOS/opencode-cli --version` must match the CLI just
      built — never a stale binary. (Both `dev` and `build` stage via the
      `predev`/`prebuild` hooks; `tauri build` provides `TAURI_ENV_TARGET_TRIPLE`.)

## Capability parity (verify each still works in a `tauri dev` run)

> GUI-bound items below have a step-by-step repro + expected-result run-sheet in
> [`MANUAL-VERIFICATION.md`](./MANUAL-VERIFICATION.md). Headless behaviors
> (export filters, crash-report formatting, env stripping) are covered by
> `cargo test` in `src-tauri`.

- [ ] **Reliability** — unresponsive watchdog shows the Relaunch/Export Logs/Quit
      dialog when the UI hangs (heartbeat stops); each button works. *(change-001)*
- [ ] **Crash reports** — a panic writes a file to `<log_dir>/crashes/`. *(change-002)*
- [ ] **Debug export** — Export Logs produces `~/Downloads/opencode-debug-<ts>/`
      with logs, crashes, and `manifest.json`, and reveals the folder. *(change-003)*
- [ ] **macOS menu** — App (Settings, Export Logs, Check for Updates), File,
      Edit, View (project nav, Toggle Full Screen), Window, Help all present and
      working. *(change-004)*
- [ ] **Background sync** — native window bg matches the web theme on launch and
      theme switch (no flash). *(change-005)*
- [ ] **Pinch-zoom toggle** — Settings toggle enables/disables pinch zoom live on
      macOS; persists. *(change-006)*
- [ ] **CA certs / env** — outbound HTTPS trusts enterprise CA roots; sidecar env
      has no DEBUG/LD_PRELOAD. *(change-007)*
- [ ] **Start-stall** — a sidecar that never becomes healthy is killed within 60s
      with a clear error. *(change-008)*
- [ ] **WSL setting** round-trips through the store. *(change-009)*
- [ ] **Sentry** — desktop build sends events tagged `platform: desktop`,
      release `desktop@<version>` (when DSN set). *(change-010)*
- [ ] **i18n** — 16 locales incl. `uk`. *(change-011)*
- [ ] **First-launch onboarding** — on a clean profile (no sessions, no paid
      providers, no projects, no tabs, only builtin servers, at `/`), the app
      creates `~/Documents/New OpenCode Project` and opens a draft tab; the
      `firstLaunchOnboardingComplete` store key gates it to once. *(change-014)*
- [ ] **Native window appearance** — macOS window frame hairline + drop shadow
      track the web theme via `setTitlebar` (`set_theme` + `invalidateShadow`),
      not the OS appearance; `scheme: "system"` follows the OS. *(change-014)*
- [ ] **Traffic-light position** — `{14, 14}` (lockstep with Electron). *(change-014)*

## Accepted divergences (NOT gaps — do not "fix")

- **New Window** *(PERMANENT — confirmed 2026-06-03)*: Tauri shell is
  single-window (MainWindow is idempotent); the menu omits New Window
  intentionally. *(change-004)*
- **Linux pinch-zoom enable** *(PERMANENT — confirmed 2026-06-03)*: GTK gesture
  is destroyed on disable, so enabling at runtime only takes effect after
  relaunch (macOS toggles live). *(change-006)*
- **Stop-timeout**: no separate 6s force-kill timer — process-wrap kills the
  process group/JobObject immediately. *(change-008)*
- **Windows titlebar theming**: decorum's overlay is a transparent CSS-themed
  strip; it tracks the web theme automatically (no native color API needed,
  unlike Electron). *(change-012)*
- **Network logging (`netLog`)**: not ported — no clean Tauri equivalent;
  `tracing` covers the health path. *(change-010)*
- **Reverse migration (`tauriMigrated`)**: Electron-only (Tauri→Electron), N/A
  in this direction. *(change-009)*

## Deferred (by decision 2026-06-03 — NOT gaps)

CI is not desired at this time, so the following are intentionally deferred.
Revisit if/when CI (GitHub Actions on the fork) becomes desired.

- **CI** building/testing the Tauri crate (macOS + Linux + Windows). No workflow
  currently builds `packages/desktop-tauri`.
- **Cross-platform builds / runtime.** Verified locally on macOS arm64 only.
  These `cfg`-gated paths compile only behind cfg on the dev host and are NOT
  built/run for their target OS locally — they need CI runners or native machines:
  - Linux: GTK pinch-zoom (`window_customizer.rs`), WM/decoration detection
    (`linux_windowing.rs`), display-backend selection (`linux_display.rs`).
  - Windows: registry app resolution + PowerShell (`os/windows.rs`), decorum
    titlebar, WSL path conversion (`wsl_path`).
- **Automated GUI testing** (tauri-driver/WebDriver). GUI acceptance is manual
  via `MANUAL-VERIFICATION.md` (decision: manual checklist).

## Platform API parity fixes applied 2026-06-21 (v1.17.9)

Upstream v1.17.9 changed the `Platform` interface in `packages/app/src/context/platform.tsx`.
All changes applied in commit `fa8ca2e40`:

- **`openAttachmentPickerDialog`**: upstream renamed `openFilePickerDialog` to
  `openAttachmentPickerDialog(opts, onFile)` — streaming per-file callback API.
  Implemented using `open()` + `fetch(convertFileSrc(path))`.
- **`getPathForFile`**: new method added. Implemented via `WeakMap<File, string>`.
- **`getWslEnabled`/`setWslEnabled`**: removed from `Platform` interface.
- **`updater`**: replaced flat `checkUpdate`/`updateAndRestart` with `updater: { state, check, install }`
  matching `UpdaterPlatform` type.
- **Version**: bumped to v1.17.9 (lockstep with `packages/desktop`).

## Parity fixes applied 2026-07-10 (v1.17.18)

Upstream v1.17.10–v1.17.18 added a first-launch onboarding flow plus macOS
window-appearance polish to `packages/desktop`. Ported here as change-014:

- **First-launch onboarding**: new Rust commands `is_first_launch_onboarding_pending`
  and `finish_first_launch_onboarding(create_default_project)` (store key
  `firstLaunchOnboardingComplete`, default project under `~/Documents/New OpenCode
  Project`), a `src/onboarding.tsx` component mirroring the Electron renderer, and
  `AppInterface` wired with `startup` + `serverScoped`.
- **`setTitlebar` bridge**: Tauri has no preload, so `window.api.setTitlebar` is
  defined in `index.tsx` and forwards the shared `ThemeProvider` callback to the
  new `set_titlebar(mode, scheme)` command. It aligns the native window
  appearance with the web theme (`WebviewWindow::set_theme`), mirroring Electron's
  `nativeTheme.themeSource = scheme ?? mode ?? "system"`.
- **`invalidateShadow`**: `set_background_color` and `set_titlebar` invalidate the
  NSWindow shadow on macOS (via `objc2` `msg_send!`) so the drop shadow tracks
  theme changes, mirroring Electron's `win.invalidateShadow()`.
- **Traffic-light**: moved `{12, 18}` → `{14, 14}` in `windows.rs` (lockstep).
- **Version**: bumped to v1.17.18 (lockstep with `packages/desktop`).

## Tauri-ahead features (preserve — do NOT regress)

- Linux WM/decoration detection (`linux_windowing.rs`).
- Linux display-backend (Wayland/X11) selection (`linux_display.rs`).
- CLI install/sync with version check (`cli.rs`).
