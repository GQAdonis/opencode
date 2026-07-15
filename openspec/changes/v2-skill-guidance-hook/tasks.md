# Tasks

- [x] 1. Create `packages/core/src/session/hooks.ts` — SessionHooks service (request hook register + runRequest trigger), mirroring `core/src/tool/hooks.ts`
- [x] 2. Extend `packages/plugin/src/v2/effect/session.ts` — SessionRequestEvent, SessionHooks, `hook` on SessionDomain
- [x] 3. Register `SessionHooks.node` in `packages/core/src/plugin.ts`; bridge `session.hook` in `packages/core/src/plugin/host.ts`
- [x] 4. Fire `runRequest` in `packages/core/src/session/runner/llm.ts` before dispatch; apply the mutated system; build the `{role,text}` conversation view
- [x] 5. Update the plugin README example to the implemented event shape
- [x] 6. Test: a plugin request hook mutates `event.system` and the mutation reaches the dispatched request; typecheck core + plugin clean
