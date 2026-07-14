# Tasks

- [x] 1. Confirm the v2 runtime surface: locate the v2 skill/session/llm entry points and get a v2 test harness running (`packages/core`, `packages/llm`), so all later tasks test the real runtime and not the frozen V1 tree
- [x] 2. Q1 — Skill re-invocation loop: determine whether calling the `skill` tool twice re-injects content on v2, and whether the Instructions delta-renderer already prevents the loop. Verdict + evidence.
- [x] 3. Q2 — Agent loop cap: confirm the loop is unbounded by default on v2, then confirm `AgentDraft.update(a.steps ??= N)` caps it and that last-step tool-disabling (`toolChoice: "none"`) engages. Verdict + evidence.
- [x] 4. Q3 — openai-compatible `$defs`: CONFIRMED. `toJsonSchema` emits `{"$ref":"#/$defs/Point"}`; `ToolSchemaProjection.openAI` passes `$defs`+`$ref` through untouched. Evidence: `packages/llm/test/spike-defs-inlining.test.ts` (2 pass).
- [x] 5. Q4 — Tauri `Platform` gaps: verify the four claimed gaps against the real `Platform` contract rather than by grep. Verdict per gap.
- [x] 6. Decide the change-007 hook shape (implement documented `session.hook("request")` vs. new `skill.guidance` transform); record rationale.
- [x] 7. Write `spike.md` with all verdicts, evidence, and the resulting scope changes to changes 002 / 006 / 008.
