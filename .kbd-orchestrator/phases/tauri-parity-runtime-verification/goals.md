# Goals — tauri-parity-runtime-verification

Close the verification debt from the `tauri-electron-feature-parity` phase: that
phase delivered 13/13 changes compile/type/test-verified, but GUI runtime
behaviors and non-macOS platforms were not exercised. This phase proves the
parity work actually behaves correctly at runtime.

## Goals

- **G1 — Runtime GUI verification (macOS).** Run the capability checks in
  `packages/desktop-tauri/PARITY-CHECKLIST.md` in an actual `tauri dev` session:
  unresponsive watchdog dialog fires + each button works; crash file written on a
  real panic; debug-log export produces the folder + reveals it; background-color
  tracks theme switch with no flash; pinch-zoom toggle works live; macOS menu
  items all function.
- **G2 — Cross-platform builds.** Compile (and where feasible run) the Tauri app
  for Linux and Windows so the `cfg`-gated paths are exercised: Linux GTK
  pinch-zoom + WM decoration detection + display backend; Windows registry app
  resolution, decorum titlebar, WSL path conversion.
- **G3 — Reproducible build flow.** Wire `scripts/predev.ts` (sidecar build/copy)
  into the build docs/flow so a clean checkout builds without the manual sidecar
  copy used during the prior phase. Document the specta `.cargo/config.toml`
  requirement in the README.
- **G4 — Decide open divergences.** Confirm or close the accepted divergences:
  single-window "New Window" and live Linux pinch-zoom — keep as documented
  divergences, or scope follow-up work.

## Non-goals

- New feature parity items (the prior phase covered the gap list).
- Porting Tauri-ahead features back into Electron (decided: Tauri-only).
