# Handoff: reflect → next phase

**Phase:** v2-architecture-alignment (closed)
**Date:** 2026-07-15

## Deltas found

Governing goal (zero permanent core divergence) **met**: no upstream package diverges except
the three upstream-PR/bug-fix surfaces (core+llm +341/−9, app +55/−8). Fork reduces to two
plugins + the Tauri app once the PRs land. The spike and verify-before-implement caught three
would-be errors (patching the frozen V1 tree; a double-injecting event; a dead-on-arrival
sidecar with 3 stale CLI flags).

## Corrective actions carried forward

- File 3 upstream PRs (session.hook seam; `$defs` fix; model-persistence fixes).
- Delete spike evidence tests before any merge.
- Add one end-to-end integration test for the ranking plugin (currently type-verified only).
- `wslServers` (004b) deferred; recurring `upstream/v2` re-sync is standing backlog.

## Recommended next phase

**`v2-upstream-contribution`** — open the PRs with linked evidence, clean the throwaway tests,
prove the ranking plugin end-to-end. Gate on: PRs opened, tree clean, integration test green.
