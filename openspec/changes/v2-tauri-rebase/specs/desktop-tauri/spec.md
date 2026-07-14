# desktop-tauri

## ADDED Requirements

### Requirement: The Tauri desktop app runs the V2 server

The Tauri desktop app SHALL start an opencode **V2** server. Because Tauri's host process is
Rust and cannot host a JavaScript server in-process (as v2's Electron app does via
`virtual:opencode-server` in a Node utility process), Tauri SHALL spawn the server as an
external sidecar binary.

That sidecar SHALL be built from `packages/cli` (the V2 CLI). It SHALL NOT be built from
`packages/opencode`, which is upstream's V1 tree and is reference-only.

#### Scenario: The staged sidecar is the V2 CLI

- **GIVEN** the Tauri app's sidecar staging script
- **WHEN** the sidecar is staged for a build
- **THEN** the binary SHALL be produced from `packages/cli`
- **AND** it SHALL NOT be produced from `packages/opencode`

#### Scenario: The app authenticates against the spawned server

- **GIVEN** a spawned sidecar server with a generated password
- **WHEN** the app performs its startup health check
- **THEN** it SHALL authenticate with basic auth username `opencode` and that password
- **AND** the server SHALL report healthy within the start-stall timeout

### Requirement: The fork carries its own version

Upstream has not stamped a 2.0 release: the `v2` branch self-reports a `1.17.x` version and
the beta is published under a `0.0.0-next-*` placeholder. The fork's desktop app SHALL
therefore declare its own explicit version rather than inheriting an upstream placeholder.

#### Scenario: Version is explicit

- **GIVEN** the Tauri app's package manifest
- **WHEN** its version is read
- **THEN** it SHALL be an explicit fork version, not `0.0.0-next-*`
