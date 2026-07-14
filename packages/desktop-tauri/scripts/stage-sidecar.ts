// Builds the opencode V2 CLI for the current Tauri target triple and stages it as
// the desktop sidecar (`src-tauri/sidecars/opencode-cli-<triple>`), which Tauri
// renames to `opencode-cli` next to the app binary.
//
// Source is `packages/cli` (V2). It is deliberately NOT `packages/opencode`, which is
// upstream's V1 tree and is reference-only.
//
// Tauri needs an external server binary even though v2's Electron app no longer does.
// Electron hosts the server in-process — a Node utility process importing
// `virtual:opencode-server` — which it can do because its main process *is* Node. Tauri's
// host process is Rust and cannot run a JS server, so spawning a real binary stays the
// correct design here.
//
// Run before BOTH `dev` and `build` (via the `predev`/`prebuild` lifecycle
// hooks in package.json) so the bundled sidecar is always the freshly-built CLI
// — never a stale binary left in `src-tauri/sidecars/` from a previous build.
// The Tauri CLI sets TAURI_ENV_TARGET_TRIPLE for both `beforeDevCommand` and
// `beforeBuildCommand`.
import { $ } from "bun"

import { CLI_PACKAGE, cliBinaryPath, copyBinaryToSidecarFolder, getCurrentSidecar } from "./utils"

const RUST_TARGET = Bun.env.TAURI_ENV_TARGET_TRIPLE

const sidecarConfig = getCurrentSidecar(RUST_TARGET)

const binaryPath = cliBinaryPath(`../${CLI_PACKAGE}/dist`, sidecarConfig.ocBinary)

await (sidecarConfig.ocBinary.includes("-baseline")
  ? $`cd ../${CLI_PACKAGE} && bun run build --single --baseline`
  : $`cd ../${CLI_PACKAGE} && bun run build --single`)

await copyBinaryToSidecarFolder(binaryPath, RUST_TARGET)
