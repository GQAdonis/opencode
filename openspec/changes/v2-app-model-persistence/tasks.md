# Tasks

- [x] 1. Fix #1 `snapshot()` reads the raw scope model/variant (the core model-revert bug)
- [x] 2. Fix #2 relax `validModel` for custom / openai-compatible providers
- [x] 3. Fix #3 agent-switch model priority: `prev?.model ?? item.model` (user selection wins)
- [x] 4. Fix #4 `session.restore()` async-storage race guard (pendingRestore signal + savedReady effect)
- [x] 5. Verify: frontend typecheck clean; the local.tsx patch contains NO toast / fork-preference code (fully upstreamable); no other packages/* upstream file diverges
