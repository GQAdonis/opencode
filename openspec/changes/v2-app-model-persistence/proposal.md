# App model-selection persistence fixes

**KBD change:** change-005 (phase `v2-architecture-alignment`)
**Depends on:** change-003 (Tauri on v2)

## Why this breaks the zero-divergence rule (deliberately)

Every other change in this phase keeps `packages/*` upstream code byte-identical and puts fork
behavior in plugins or `packages/desktop-tauri`. **This change cannot.** The four defects live
in `packages/app/src/context/local.tsx` — the shared SolidJS model-selection context — which
has **no plugin seam**: `createSimpleContext` is a plain context factory, not an extension
point. The Tauri app consumes this context; it does not re-implement it.

So this is the single unavoidable shared-package patch in the phase. We keep it tolerable two
ways:

1. **All four are genuine bugs, not fork preferences** → they are shaped to be filed upstream.
   If accepted, this divergence goes to zero.
2. **The one fork *preference* that used to live here — a toast on model selection — is dropped
   on v2.** It is a UX nicety, not a bug, and keeping it would mean a permanent divergence in a
   churning shared package. Dropping it keeps this patch 100% upstreamable.

All four anchor points on v2 are **byte-identical** to what our `dev` patch targeted, so v2
never restructured this code — the bugs are present on v2 as-is.

## The four fixes

1. **Model revert via `snapshot()` (the core bug).** `snapshot()` reads the *resolved*
   `current()` and rebuilds a `ModelKey`. For a custom/openai-compatible model that does not
   resolve cleanly, this loses the selection. Fix: read the **raw scope** (`scope()?.model` /
   `scope()?.variant`) so the persisted value is exactly what the user chose.

2. **`validModel` too strict for custom providers.** It requires `provider.models[modelID]` to
   exist. Custom / OpenAI-compatible providers have free-form model lists not enumerated into
   that map, so a valid selection was silently dropped and reverted to default on later turns.
   Fix: trust a connected+known provider; let the server surface a real `ModelNotFound` instead
   of a silent revert.

3. **Agent-switch clobbers the user's model.** On agent switch, `model: item.model ?? prev?.model`
   lets the agent's configured model override the user's explicit choice. Fix:
   `prev?.model ?? item.model` — the user's selection wins; fall back to the agent's only if
   none.

4. **`session.restore()` async-storage race.** `restore()` bails on
   `saved.session[session] !== undefined`, but with Tauri's **async** storage the persisted
   store may not have loaded yet, so it reads `undefined` and overwrites the user's prior
   selection with the last message's model — the selection appears to revert. Fix: queue the
   restore in a `pendingRestore` signal and apply it from an effect once `savedReady()` is true.
   **Upstream candidate beyond us:** Electron also uses an async IPC-backed store, so this race
   is latent there too — worth filing regardless of Tauri.

## Not included

- The toast on validated model selection (fork preference — dropped on v2, see above).

## Success criteria

- The four fixes present in `local.tsx`; frontend typecheck clean.
- The patch contains **no** fork-preference code (no toast) — it is entirely upstreamable.
- No other `packages/*` upstream file diverges.
