# Tasks

- [x] 1. Implement `inlineDefs` in `tool-schema.ts`: resolve `$ref` at any depth, merge siblings, guard cycles, drop unknown refs, strip the `$defs`/`definitions` containers
- [x] 2. Apply it at the start of `openAI(...)`
- [x] 3. Tests: reused struct, nested refs, sibling `description` preserved, recursive ref terminates, unknown ref dropped
- [x] 4. Verify: `packages/llm` typecheck + tests clean; the change-001 spike repro now shows `$ref` gone after projection
