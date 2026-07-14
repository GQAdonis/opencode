# Plan: Model Persistence Revert Bug Fix

**Phase:** model-persistence-revert  
**Planned:** 2026-06-05  
**Status:** ready  
**Estimated changes:** 2

## Goal

Fix the bug where the selected model reverts to default on the turn after selection in the Tauri desktop app. Two surgical changes to `packages/app/src/context/local.tsx`.

## Changes

### change-mpr-001 — Fix `snapshot()` to preserve raw ModelKey

**Priority:** P0 — Primary fix. Prevents corrupt state from being written.  
**File:** `packages/app/src/context/local.tsx`  
**Function:** `snapshot()` (line 276)  
**Agent:** typescript-reviewer after implementation

**Problem:**  
`snapshot()` resolves the user's model selection through `current()` → `models.find()`. This requires the model to be in the provider's enumerated model list. If it isn't (custom model, loading in progress), `current()` returns `undefined`, and the snapshot captures `{model: undefined}`.

**Fix:**  
Read `scope()?.model` directly. This is the raw `ModelKey` the user selected, already persisted by `write()` when they picked it. No need to resolve it through the enumeration layer at snapshot time.

```typescript
// BEFORE (line 276-283)
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

**Why this is safe:**  
- `scope()` returns `saved.session[id]` or `store.draft` — the same state `write()` updates when the user picks a model
- The `model` field in scope is a raw `ModelKey` (`{providerID, modelID}`) — exactly what `promote()` needs to carry forward
- Resolution (finding the full model object) only needs to happen at render time, not at save time
- If scope has no model (`s?.model` is undefined), that is genuinely "no selection" — the same as before, but now it won't corrupt a real selection

**Tests to verify:**  
- Select a custom/OpenAI-compatible model → send a message → confirm model persists on next turn
- Select a built-in model → send a message → confirm model persists
- Open a new session with no prior selection → confirm fallback model is shown (not a crash)

---

### change-mpr-002 — Tighten `restore()` guard against corrupt-but-set slots

**Priority:** P1 — Defense in depth. Catches cases where a corrupt slot slips through.  
**File:** `packages/app/src/context/local.tsx`  
**Function:** `session.restore()` (line 426)  
**Agent:** typescript-reviewer after implementation  
**Depends on:** change-mpr-001 (implement after)

**Problem:**  
`restore()` guards with `if (saved.session[session] !== undefined) return`. This treats a slot containing `{model: undefined}` as "already set with valid data" and skips correction. After change-001 this path is far less likely to be hit, but the guard is still semantically wrong: a slot with no model is not a valid prior selection.

**Fix:**  
Treat a slot with no model as "not yet set" so `restore()` can seed it from the server message:

```typescript
// BEFORE (line 438-439)
if (saved.session[session] !== undefined) return

// AFTER
const existing = saved.session[session]
if (existing !== undefined && existing.model !== undefined) return
```

**Why this is safe:**  
- If the user genuinely has no model saved for this session (first turn, new session), `restore()` should proceed — this preserves that behavior
- If the user has a real model saved (`model !== undefined`), `restore()` still exits early — selection is not overwritten
- The `pendingRestore` mechanism from the prior fix remains and is harmless — it just becomes less critical

**Tests to verify:**  
- Open an existing session that has a saved model → verify restore does not overwrite it
- Navigate to a brand-new session → verify restore seeds from last message model
- Navigate to a session where promote() previously wrote `{model: undefined}` → verify restore corrects it

---

## Implementation Order

```
change-mpr-001  →  change-mpr-002
```

change-mpr-001 must be implemented and verified before change-mpr-002. They are in the same file, same reactive context. Implement sequentially, not in parallel.

## Success Criteria

- [ ] User selects a model in the Tauri app
- [ ] User sends a message (session is created, promote() fires)
- [ ] On the next turn, the selected model is still active
- [ ] Custom/OpenAI-compatible models persist identically to built-in models
- [ ] Opening a new workspace with no prior selection still shows a valid fallback model
- [ ] TypeScript compiles without errors (`bun typecheck` in packages/app)
- [ ] No regressions in agent selection or variant selection

## Files Changed

| File | Change |
|---|---|
| `packages/app/src/context/local.tsx` | snapshot() + restore() guard |

## Rejected Approaches

**Option C (remove restore() entirely):** Architecturally cleaner but higher risk. Requires verifying all entry points that rely on `restore()` seeding behavior. Deferred to a follow-up phase.

**Option D (eager store hydration with Suspense):** Correct long-term but requires restructuring LocalProvider lifecycle and adding a loading state to the directory layout. Significant scope. Deferred.

**Prior patches (savedReady timing fixes):** Addressed the wrong problem. The async timing issue in `restore()` is real but secondary — the primary failure is `promote()` writing corrupt state before `restore()` ever runs.
