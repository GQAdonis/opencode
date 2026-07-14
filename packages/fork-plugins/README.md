# @opencode-fork/plugins

Fork-owned opencode plugins.

## Why this package exists

Everything this fork changes about opencode's *behavior* lives here, as plugins built on
upstream's public extension points. `packages/core`, `packages/llm`, and `packages/schema`
stay **byte-identical to `upstream/v2`**, so merging upstream stays cheap.

This is a deliberate reversal of the old fork strategy, which patched core directly and
paid a merge tax on every sync.

## Plugins

| Plugin | ID | What it does |
|---|---|---|
| `agent-steps` | `fork.agent-steps` | Bounds the agent loop. Upstream leaves `steps` unset, which makes the loop **unbounded** — a model that keeps emitting tool calls repeats forever. This sets a default cap via `ctx.agent.transform`. |

## Registration

Plugins are loaded through the ordered `plugins` array in `opencode.json(c)`:

```jsonc
{
  "plugins": ["@opencode-fork/plugins/agent-steps"]
}
```

Disable one with a `-` prefix (`"-fork.agent-steps"`).

## Notes for maintainers

- **Do not add core patches here.** If a fork feature cannot be built on a public
  extension point, the correct move is to contribute the extension point upstream
  (see `.kbd-orchestrator/phases/v2-architecture-alignment/`), not to patch core.
- `packages/opencode` is upstream's **V1 tree and is reference-only** (`AGENTS.md`).
  Nothing in this fork should touch it.
