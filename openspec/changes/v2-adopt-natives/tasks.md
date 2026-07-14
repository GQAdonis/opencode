# Tasks

- [x] 1. Create the fork-owned plugin package `packages/fork-plugins` (additive; the home for all fork behavior so upstream sync stays cheap)
- [x] 2. Implement the `agent-steps` cap plugin using `ctx.agent.transform` + `steps ??= cap`
- [x] 3. Test: a runaway model stops at the cap, last-step enforcement engages, and an agent's own `steps` wins over the plugin default
- [x] 4. Document the `skills.exclude` → v2 `permissions` migration, and record the two dropped patches (terminal-error, DEFAULT_MAX_STEPS)
- [x] 5. Verify zero diff against `upstream/v2` outside `packages/fork-plugins` + config; typecheck clean
