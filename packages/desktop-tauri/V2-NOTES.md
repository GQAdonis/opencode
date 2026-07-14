# Running on the V2 line

Notes for the Tauri app after the move to `upstream/v2`. Read this before "fixing" anything
that looks divergent from the Electron app — some of it is divergent on purpose.

## The server: Tauri spawns a binary, Electron does not

**This is a permanent, correct divergence. Do not try to converge it.**

On V2, Electron hosts the server **in-process**, in an Electron *utility process*
(`packages/desktop/src/main/sidecar.ts`):

```ts
const { Server } = await import("virtual:opencode-server")
listener = await Server.listen({ port, hostname, username: "opencode", password, cors: ["oc://renderer"] })
```

It can do that because Electron's main process **is Node**. **Tauri's host process is Rust**
and cannot run a JavaScript server, so this app spawns a real server binary as a sidecar.
That is not technical debt; it is the only design available to a Rust host.

## The sidecar is built from `packages/cli`, never `packages/opencode`

`packages/opencode` is upstream's **V1 tree and is reference-only** (`AGENTS.md`). Building
the sidecar from it would ship a V1 server inside a V2 app.

The V2 CLI is `packages/cli`, whose binary is **`opencode2`**, built to
`dist/cli-<os>-<arch>[-baseline]/bin/opencode2`. `scripts/utils.ts` derives that path from the
existing `SIDECAR_BINARIES` table (`opencode-*` → `cli-*`); a `--single` build never emits a
musl target, so no `abi` suffix appears.

## V2 CLI flag changes that will silently break the app

Verified against a real `opencode2` build:

| V1 (broken on V2) | V2 | Failure mode if you get it wrong |
|---|---|---|
| `--print-logs` | **removed** | CLI prints usage and **exits 1** — the server never starts, and the app just times out its health check with no obvious cause |
| `--log-level WARN` | `--log-level warn` | `Invalid value for flag --log-level: "WARN"` — only lowercase is accepted |
| `debug config` | **removed** (`debug` now offers only `agents`) | would print usage to stdout and then fail to parse it as JSON |

The working invocation is:

```
opencode2 --log-level warn serve --hostname <host> --port <port>
```

with `OPENCODE_SERVER_USERNAME=opencode` and `OPENCODE_SERVER_PASSWORD=<password>` in the
environment — matching what Electron sets in its own `prepareSidecarEnv`.

## The installed CLI is named `opencode2`

Upstream publishes the V2 CLI as `opencode2` specifically so it can coexist with a V1
`opencode` install. "Install CLI" therefore writes `~/.opencode/bin/opencode2`. Installing it
as `opencode` would silently shadow a user's V1 CLI.

(For reference: on V2 Electron's own `install-cli` IPC handler is **not registered** — the
preload declares it and the renderer calls it, but nothing handles it — presumably because
Electron no longer bundles a CLI binary at all. Our implementation is real and works.)

## Versioning

Upstream has **not stamped a 2.0**. The `v2` branch self-reports `1.17.x` and its npm beta
ships as a `0.0.0-v2-<timestamp>` placeholder. This app therefore carries **its own** version
(`2.0.0-beta.1`). Release CI can override it with `OPENCODE_FORK_VERSION`; `scripts/prepare.ts`
no longer inherits upstream's placeholder, which would otherwise leave the app unversioned and
break updater ordering.

## Known gaps (tracked, not forgotten)

Four `Platform` members are unimplemented in this host — see change-004 / change-004b:

- `exportDebugLogs` — one line; the Rust command, its registration, and the TS binding all exist
- `runDesktopMenuAction` — Windows/Linux menu *action* entries are dead clicks today
- `recordFatalRendererError` — fatal renderer errors are not persisted natively
- `wslServers` — an 11-method subsystem, Windows-only; deferred
