# change-mpr-002 — Tighten restore() guard against undefined-model slots

- **Phase:** model-persistence-revert
- **Severity:** HIGH (defense in depth — prevents restore() from skipping a corrupt slot)
- **Status:** [x] DONE 2026-06-05 (typecheck clean; typescript-reviewer HIGH resolved — pendingRestore effect guard also updated)
- **Agent:** typescript-reviewer after implementation
- **Files:** packages/app/src/context/local.tsx
- **Depends on:** change-mpr-001

## Why

`restore()` guards with `if (saved.session[session] !== undefined) return`. This
treats a slot containing `{model: undefined}` as "already set with valid data" and
exits without correcting it. After change-mpr-001 this path is unlikely to be hit
(snapshot() no longer writes undefined), but the guard is still semantically wrong:
a slot with no model is not a valid prior selection and should be overridable by
`restore()`.

## Exact Change

**File:** `packages/app/src/context/local.tsx`

```typescript
// BEFORE (~line 439)
if (saved.session[session] !== undefined) return

// AFTER
const existing = saved.session[session]
if (existing !== undefined && existing.model !== undefined) return
```

## Tasks

- [ ] Apply the diff above (inside `restore()`, after the `handoff.has()` guard)
- [ ] Run `bun typecheck` in packages/app — must pass
- [ ] Manual test: open existing session with saved model → restore does not overwrite it
- [ ] Manual test: navigate to new session → restore seeds from last message model
- [ ] Manual test: session slot with `{model: undefined}` → restore corrects it
- [ ] Run typescript-reviewer agent on the changed code

## Acceptance

- Existing valid selections are not overwritten by restore()
- Corrupt/empty slots are corrected by restore()
- TypeScript compiles clean
