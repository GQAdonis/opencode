#!/usr/bin/env bun
import { $ } from "bun"

import { Script } from "@opencode-ai/script"
import { cliBinaryPath, copyBinaryToSidecarFolder, getCurrentSidecar } from "./utils"

// The fork versions this app itself. `Script.version` derives from upstream's npm release and
// on the V2 line yields a placeholder (e.g. `0.0.0-v2-202607142104`) — upstream has not stamped
// a 2.0, so inheriting it would leave the app with a meaningless version and break the
// updater's ordering. Release CI supplies OPENCODE_FORK_VERSION; otherwise the committed
// package.json version stands.
const pkg = await Bun.file("./package.json").json()
const forkVersion = process.env.OPENCODE_FORK_VERSION
if (forkVersion) {
  pkg.version = forkVersion
  await Bun.write("./package.json", JSON.stringify(pkg, null, 2) + "\n")
  console.log(`Updated package.json version to ${forkVersion}`)
} else {
  console.log(`Keeping fork version ${pkg.version} (upstream Script.version would be ${Script.version})`)
}

const sidecarConfig = getCurrentSidecar()
const artifact = process.env.OPENCODE_CLI_ARTIFACT ?? "opencode-cli"

const dir = "src-tauri/target/opencode-binaries"

await $`mkdir -p ${dir}`
await $`gh run download ${process.env.GITHUB_RUN_ID} -n ${artifact}`.cwd(dir)

// The CI artifact carries the V2 CLI's dist layout (`cli-<os>-<arch>/bin/opencode2`), so the
// workflow that produces `OPENCODE_CLI_ARTIFACT` must build `packages/cli`, not
// `packages/opencode`.
await copyBinaryToSidecarFolder(cliBinaryPath(dir, sidecarConfig.ocBinary))
