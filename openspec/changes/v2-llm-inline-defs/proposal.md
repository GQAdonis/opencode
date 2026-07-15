# Inline `$defs`/`$ref` in the OpenAI tool-schema projection

**KBD change:** change-006 (phase `v2-architecture-alignment`)
**Shape:** upstream bug-fix PR (touches `packages/llm`). Genuine bug, not a fork preference —
carried on our branch only until upstream accepts it.
**Evidence:** change-001 spike (`spike-defs-inlining.test.ts`).

## Why (a real upstream bug, proven)

v2 generates tool input schemas that emit `$defs` + `$ref` for any reused struct
(`packages/llm/src/tool.ts:232-236` attaches `$defs` when `Schema.toJsonSchemaDocument`
produces definitions). The OpenAI projection that lowers those schemas onto the wire
(`packages/llm/src/protocols/utils/tool-schema.ts` → `openAI`) spreads `...schema` and only
normalizes `anyOf` — it never resolves `$ref`. So the `$defs` map and every `#/$defs/...`
pointer pass straight through to the provider.

`openai-compatible-chat` reuses `OpenAIChat.protocol` verbatim
(`src/protocols/openai-compatible-chat.ts`), so this projection is the only one applied on
that path. Providers that do not resolve JSON-Schema references — DeepSeek via Fireworks,
MiniMax, and others behind OpenAI-compatible endpoints — reject the request with
"Error resolving schema reference". OpenAI's own strict mode also dislikes bare `$defs`.

The spike proved it end-to-end: `toJsonSchema` emits `{"$ref":"#/$defs/Point"}`, and
`ToolSchemaProjection.openAI` returns it with `$defs` and `$ref` intact (2 assertions).

**Note on the fork's V1 history:** our V1 patch fixed this in `provider/transform.ts` by
widening an `npm`-string branch to include `@ai-sdk/openai-compatible`. That branch is gone in
v2 (it dropped ai-sdk `npm` dispatch), so the V1 fix does not port. This is the *same class* of
bug in the new location, fixed the v2 way.

## What

Add an `inlineDefs` pass to the OpenAI projection that resolves every `$ref` against the
schema's `$defs`/`definitions`, then drops those containers. Requirements:

- Resolve `#/$defs/<name>` and `#/definitions/<name>` at **any depth**.
- Preserve sibling keys on a `$ref` node (e.g. `description`) by merging them over the
  resolved target.
- **Guard cycles**: a self-referential schema cannot be inlined into finite JSON; replace the
  recursive position with a permissive empty schema rather than looping or emitting a dangling
  `$ref`.
- Drop an unknown/external `$ref` (keep siblings) rather than leave a pointer the provider
  cannot resolve.

Apply it at the start of `openAI(...)`. Keep it a standalone, exported, pure helper so it is
unit-testable and reusable by other projections later.

## Non-goals

- Wiring the unused `ModelCompatibility.toolSchema` knob (that plumbing is unbuilt in core and
  is a larger change). The inlining is universal and safe: every OpenAI-family request already
  goes through `openAI`, and OpenAI proper also rejects bare `$defs` in strict mode.
- Changing gemini/moonshot projections.

## Success criteria

- After `openAI(...)`, no `$defs`/`definitions` container and no `#/$defs`/`#/definitions`
  `$ref` remain.
- Reused, nested, and cyclic schemas all covered by tests.
- `packages/llm` typecheck + tests clean.
