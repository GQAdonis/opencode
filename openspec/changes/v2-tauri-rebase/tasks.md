# Tasks

- [x] 1. Transplant `packages/desktop-tauri/` from `dev` onto the `v2` branch (additive; absent upstream, so no conflict)
- [x] 2. Repoint the sidecar build from `packages/opencode` (frozen V1 tree) to `packages/cli` (V2, binary `opencode2`)
- [x] 3. Align the Rust sidecar spawn with v2's `serve` contract (hostname/port args + `OPENCODE_SERVER_PASSWORD` env, basic-auth `opencode`)
- [x] 4. Set the fork's own version (upstream has no 2.0 stamp; the beta is `0.0.0-next-*`) and record the Electron-vs-Tauri server-hosting divergence in the app's docs
- [x] 5. Verify: typecheck the Tauri frontend, confirm the sidecar builds from `packages/cli`, and confirm zero diff vs `upstream/v2` outside fork-owned paths
