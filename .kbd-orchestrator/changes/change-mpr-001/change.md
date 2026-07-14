# change-mpr-001 — Fix snapshot() to preserve raw ModelKey

- **Phase:** model-persistence-revert
- **Severity:** CRITICAL (primary fix — stops corrupt state from being written)
- **Status:** [x] DONE 2026-06-05 (typecheck clean; typescript-reviewer: no CRITICAL/HIGH)
- **Agent:** typescript-reviewer after implementation
- **Files:** packages/app/src/context/local.tsx

## Why

`snapshot()` resolves the model through `current()` → `models.find()`, which requires
the model to exist in the provider's enumerated model list. Custom and OpenAI-compatible
models often do not appear there. When `models.find()` returns undefined, `snapshot()`
produces `{model: undefined}`, which `session.promote()` then writes permanently to
`saved.session[newSessionId]` — overwriting the user's real selection before the
session even starts. On the next turn, the UI reads `undefined` and falls back to the
default.

`scope()?.model` already holds the raw `ModelKey` written when the user picked the
model. Reading it directly skips the enumeration round-trip.

## Exact Change

**File:** `packages/app/src/context/local.tsx`

```typescript
// BEFORE (~line 276)
const snapshot = () => {
  const model = current()
  return {
    agent: agent.current()?.name,
    model: model ? { providerID: model.provider.id, modelID: model.id } : undefined,
    variant: selected(),
  } satisfies State
}

// AFTER
const snapshot = () => {
  const s = scope()
  return {
    agent: agent.current()?.name,
    model: s?.model,
    variant: s?.variant ?? null,
  } satisfies State
}
```

## Tasks

- [ ] Apply the diff above
- [ ] Run `bun typecheck` in packages/app — must pass
- [ ] Manual test: select a built-in model → send message → model persists on next turn
- [ ] Manual test: select a custom/OpenAI-compatible model → send message → model persists
- [ ] Manual test: open fresh workspace with no prior selection → valid fallback shown (no crash)
- [ ] Run typescript-reviewer agent on the changed code

## Acceptance

- Model persists across the session-creation boundary for both built-in and custom models
- TypeScript compiles clean
- No regressions to agent or variant selection
