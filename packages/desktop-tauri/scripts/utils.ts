import { $ } from "bun"

export const SIDECAR_BINARIES: Array<{ rustTarget: string; ocBinary: string; assetExt: string }> = [
  {
    rustTarget: "aarch64-apple-darwin",
    ocBinary: "opencode-darwin-arm64",
    assetExt: "zip",
  },
  {
    rustTarget: "x86_64-apple-darwin",
    ocBinary: "opencode-darwin-x64-baseline",
    assetExt: "zip",
  },
  {
    rustTarget: "aarch64-pc-windows-msvc",
    ocBinary: "opencode-windows-arm64",
    assetExt: "zip",
  },
  {
    rustTarget: "x86_64-pc-windows-msvc",
    ocBinary: "opencode-windows-x64-baseline",
    assetExt: "zip",
  },
  {
    rustTarget: "x86_64-unknown-linux-gnu",
    ocBinary: "opencode-linux-x64-baseline",
    assetExt: "tar.gz",
  },
  {
    rustTarget: "aarch64-unknown-linux-gnu",
    ocBinary: "opencode-linux-arm64",
    assetExt: "tar.gz",
  },
]

export const RUST_TARGET = Bun.env.RUST_TARGET

// The server we bundle comes from `packages/cli` (V2). `packages/opencode` is upstream's V1
// tree and is reference-only, so it must not be the sidecar source.
//
// V2 builds as `opencode2` into `dist/cli-<os>-<arch>[-baseline]/bin/opencode2`
// (packages/cli/script/build.ts). The `ocBinary` names above still describe the V1 layout
// (`opencode-<os>-<arch>`), so derive the V2 directory from them rather than maintaining a
// second table that can drift. A `--single` build never emits a musl target, so no `abi`
// suffix can appear here.
export const CLI_PACKAGE = "cli"
export const CLI_BINARY = "opencode2"

export function cliDistDir(ocBinary: string) {
  return ocBinary.replace(/^opencode/, "cli")
}

/** Path to the built V2 CLI binary inside a dist root (a package dir or a CI artifact dir). */
export function cliBinaryPath(root: string, ocBinary: string) {
  return windowsify(`${root}/${cliDistDir(ocBinary)}/bin/${CLI_BINARY}`)
}

export function getCurrentSidecar(target = RUST_TARGET) {
  if (!target && !RUST_TARGET) throw new Error("RUST_TARGET not set")

  const binaryConfig = SIDECAR_BINARIES.find((b) => b.rustTarget === target)
  if (!binaryConfig) throw new Error(`Sidecar configuration not available for Rust target '${RUST_TARGET}'`)

  return binaryConfig
}

export async function copyBinaryToSidecarFolder(source: string, target = RUST_TARGET) {
  await $`mkdir -p src-tauri/sidecars`
  const dest = windowsify(`src-tauri/sidecars/opencode-cli-${target}`)
  await $`cp ${source} ${dest}`
  if (process.platform === "win32" && process.env.GITHUB_ACTIONS === "true") {
    await $`pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File ../../script/sign-windows.ps1 ${dest}`
  }

  console.log(`Copied ${source} to ${dest}`)
}

export function windowsify(path: string) {
  if (path.endsWith(".exe")) return path
  return `${path}${process.platform === "win32" ? ".exe" : ""}`
}
