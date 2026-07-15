# Tasks

- [x] 1. Pure helpers in `packages/fork-plugins/src/skill-ranking.ts`: tokenize, deterministic score, parse `<available_skills>` block, render block (byte-faithful to core), rankBlock (filter loaded + rank + cap)
- [x] 2. The `fork.skill-ranking` plugin: maintain a per-session loaded-skill set via `ctx.tool.hook("execute.after")`; rewrite `event.system` via `ctx.session.hook("request")`
- [x] 3. Wire options (`maxShown`) and export from index.ts; update README + MIGRATION
- [x] 4. Tests: relevance ordering, determinism/cache-stability, loaded-skill filtering, top-K cap, empty-query fallback, block format fidelity
- [x] 5. Verify: `packages/fork-plugins` typecheck + tests clean; zero diff vs `upstream/v2` in upstream packages
