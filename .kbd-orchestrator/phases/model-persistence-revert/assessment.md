# Assessment: Model Persistence Revert Bug

**Phase:** model-persistence-revert  
**Assessed:** 2026-06-04  
**Status:** complete

## Summary

After the user selects a new model in the Tauri desktop application, the very next turn reverts the model back to the default. Three prior patch attempts failed because they treated timing symptoms rather than the root cause.

## Root Causes Identified

### Root Cause 1 (Primary): `snapshot()` writes `undefined` model on promotion

`session.promote()` fires when a new session is created. It calls `snapshot()`, which resolves the model through `current()` → `models.find(item)`. `models.find()` searches the enumerated provider model list. If the model is not in that list (custom model, OpenAI-compatible model, or provider not yet enumerated), `current()` returns `undefined`. Result: `{model: undefined}` is permanently written to `saved.session[newId]` before the session even starts.

**File:** `packages/app/src/context/local.tsx`, `snapshot()` at line 276

### Root Cause 2 (Secondary): `restore()` guard exits early on corrupt slot

`restore()` checks `if (saved.session[session] !== undefined) return`. Since `promote()` already wrote a corrupt `{model: undefined}` value to the slot, `restore()` sees it as "already set" and exits without correcting it. The async timing guard (`savedReady`) added in prior fixes is irrelevant here — it solves a timing problem but not the corruption problem.

**File:** `packages/app/src/context/local.tsx`, `session.restore()` at line 426

### Root Cause 3 (Supporting): `validModel()` and `models.find()` use different criteria

`validModel()` checks provider connectivity. `models.find()` checks provider model enumeration. A custom model can pass `validModel()` indefinitely while `models.find()` returns `undefined` indefinitely — they are not equivalent.

## Failure Sequence

1. User selects model → written to `saved.session[draftId]` via `write()`
2. User sends message → `session.promote()` fires for new session ID
3. `promote()` calls `snapshot()` → `current()` → `models.find()` returns `undefined`
4. `{model: undefined}` written to `saved.session[newId]`
5. `restore()` fires on navigation → sees slot already set → exits early
6. UI reads `model: undefined` → falls back to default

## What the Prior Patches Missed

All three patches focused on the async `savedReady()` timing race in `restore()`. None addressed the fact that `promote()` was writing corrupt state upstream of `restore()`.

## Scope

- **Files to change:** `packages/app/src/context/local.tsx` only
- **Lines of change:** ~5 lines total
- **Risk:** Low — changes are confined to two functions in one file
- **No new dependencies required**
