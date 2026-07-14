# Rebase the Tauri desktop app onto v2

**KBD change:** change-003 (phase `v2-architecture-alignment`)

## Why

`packages/desktop-tauri/` (228 files) is fork-owned and **absent from `upstream/v2`**, so the
transplant itself is conflict-free. The work is not the copy — it is the **sidecar contract**,
which v2 changed underneath us.

## The finding that defines this change

Our `scripts/stage-sidecar.ts` builds the sidecar from
`../opencode/dist/<target>/bin/opencode` — i.e. **`packages/opencode`, upstream's frozen V1
tree** (`AGENTS.md`: "present for reference only"). On v2 the CLI is **`packages/cli`**, whose
binary is **`opencode2`**. We are shipping a V1 server binary inside a V2 app.

Meanwhile **v2's Electron app no longer spawns a sidecar binary at all.** It runs the server
**in-process** in an Electron *utility process* (`packages/desktop/src/main/sidecar.ts`):

```ts
const { Server } = await import("virtual:opencode-server")
listener = await Server.listen({ port, hostname, username: "opencode", password, cors: ["oc://renderer"] })
```

That is available to Electron because its main process **is Node**. **Tauri's main process is
Rust and cannot host a JS server**, so Tauri must keep spawning an external binary. This is a
permanent, legitimate architectural divergence between the two hosts — not something to
"fix" by copying Electron.

The good news: the *contract* still matches. Our Rust already health-checks with basic auth
`opencode` : `<password>` (`src-tauri/src/server.rs:180`), which is exactly what v2's
`Server.listen({ username: "opencode", password })` expects, and v2's `serve` command takes
`hostname` + `port` (`packages/cli/src/commands/handlers/serve.ts:12-13`) with the password
supplied via `OPENCODE_SERVER_PASSWORD` (as Electron does in `prepareSidecarEnv`).

So: repoint the sidecar at `packages/cli`, keep everything else.

## What

1. Transplant `packages/desktop-tauri/` onto `v2` (additive).
2. **Repoint the sidecar build from `packages/opencode` (V1) to `packages/cli` (V2).**
3. Align the Rust spawn with v2's `serve` contract (args + `OPENCODE_SERVER_PASSWORD`).
4. Set the fork's own version. Upstream has **not** stamped 2.0 — `v2` self-reports `1.17.x`
   and npm ships the beta as `0.0.0-next-*` — so inheriting a placeholder is not an option.

## Non-goals

- The four `Platform` gaps → change-004.
- `wslServers` → change-004b (deferred; it is an 11-method Rust subsystem, not wiring).
- Adopting Electron's in-process server. **Structurally impossible for Tauri.**

## Success criteria

- The staged sidecar is built from `packages/cli` and reports a v2 server.
- The app boots against it and passes the health check.
- Zero diff vs `upstream/v2` outside `packages/desktop-tauri` + fork-owned files.
