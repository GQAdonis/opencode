# OpenCode Desktop (Tauri)

Native OpenCode desktop app, built with Tauri v2.

> Fork note: upstream abandoned this Tauri app in PR #25822 and replaced it with an Electron app at `packages/desktop`. This fork keeps the Tauri app here at `packages/desktop-tauri` (recovered from commit `6f7d63e9c`). See root `CLAUDE.md`/`AGENTS.md` → "Fork Divergences".

## Prerequisites

- **Tauri system deps** — Rust toolchain + platform libraries. See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).
- **A nightly Rust toolchain.** The patched `specta` rev (see `src-tauri/Cargo.toml` `[patch]`) enables `impl Type for f16/f128` and needs nightly. `src-tauri/.cargo/config.toml` injects the required `#![feature(f16,f128)]` crate attributes + `RUSTC_BOOTSTRAP=1` automatically, so a normal `nightly` toolchain works without manual flags:
  ```bash
  rustup toolchain install nightly   # if you don't have one
  ```
  If `cargo check` ever fails with `E0658 ... f16/f128 is unstable`, confirm you're on nightly and that `src-tauri/.cargo/config.toml` exists.

## Development

From the repo root:

```bash
bun install
bun run --cwd packages/desktop-tauri tauri dev
```

`tauri dev` runs `beforeDevCommand` (`bun run dev`), which triggers the `predev`
script — this **builds the opencode CLI and copies it into
`src-tauri/sidecars/opencode-cli-<target>`** (Tauri's `build.rs` requires that
sidecar to exist). The sidecar is gitignored, so the first `tauri dev` after a
clean checkout produces it for you.

> The `predev` script reads `TAURI_ENV_TARGET_TRIPLE`, which only the Tauri CLI
> sets. Don't run `bun run predev` standalone (it errors `RUST_TARGET not set`),
> and don't run a bare `cargo check`/`cargo build` in `src-tauri` on a clean
> checkout — the sidecar won't exist yet. Use `tauri dev` / `tauri build`, or set
> the target yourself and build the sidecar first:
> ```bash
> # only needed for bare cargo work in src-tauri:
> bun run --cwd packages/opencode build --single   # builds the CLI
> cp packages/opencode/dist/opencode-darwin-arm64/bin/opencode \
>    packages/desktop-tauri/src-tauri/sidecars/opencode-cli-aarch64-apple-darwin
> ```

## Build

```bash
bun run --cwd packages/desktop-tauri tauri build
```

## Verification

After changes (and after upstream merges that touch `packages/desktop`), follow:

- `PARITY-CHECKLIST.md` — the Tauri ⇄ Electron parity gate.
- `MANUAL-VERIFICATION.md` — step-by-step `tauri dev` run-sheet for GUI behaviors.

## Troubleshooting

### Rust compiler not found

If you see errors about Rust not being found, install it via [rustup](https://rustup.rs/):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```
