# Current Waypoint

**Phase:** v2-architecture-alignment
**Status:** planned (0 of 8 changes complete)
**Updated:** 2026-07-14
**Branch:** `v2` (cut from `upstream/v2` @ `aa8fc4234d`)
**Backend:** OpenSpec

## Next action

```
/kbd-apply change-001    # spike — BLOCKING, gates 002/006/008
```

## What this phase is

Move the fork fully onto upstream's 2.0 line (`upstream/v2`) **without carrying a
permanent core divergence**. Every fork feature is either adopted from v2, rebuilt
as a plugin, or contributed upstream.

## Load-bearing facts

- **`upstream/v2` is the real 2.0 line.** `upstream/2.0` is a dead 2026-04
  exploration branch; `upstream/beta` is the 1.17.x channel. 2.0 is a **public beta**
  (`@opencode-ai/cli@next`, binary `opencode2`, version `0.0.0-next-*`, no 2.x tag).
- **`packages/opencode` is V1, reference-only** (`AGENTS.md:4`). Nothing lands there.
  Our original 19-file patch-port applied cleanly *because nothing touches that tree*
  — it is abandoned. **The previous waypoint's "divergences preserved" table describes
  patches to a frozen tree and is obsolete.**
- **The documented plugin hook does not exist.** `session.hook("request")` appears in
  v2.opencode.ai and two in-repo READMEs but **not** in `core/src/plugin/hooks.ts`,
  which exposes only `aisdk` + `tool`. Plugins can add skill *sources* but cannot
  rank/truncate the advertised list. This is the phase's central blocker.
- **v2 is a backend rewrite, not a frontend rewrite.** `dev`→`v2`: `packages/app`
  +2397/−2367, Electron desktop +17/−3, `platform.tsx` byte-identical. Tauri risk is
  much lower than first assessed.
- **`Skill.Info.triggers` is dropped.** No home in v2's schema; frontmatter `metadata`
  is parsed then discarded. Skill IDs are path-derived, not frontmatter-derived.

## Change list (8)

| # | Change | Type | Status |
|---|---|---|---|
| 001 | Spike: validate v2 behavior gaps | spike | **NEXT** |
| 002 | Adopt v2 natives (delete 3 patches) | plugin/config | pending |
| 003 | Rebase Tauri app onto v2 | fork | pending |
| 004 | Close 4 Tauri `Platform` gaps | fork | pending |
| 005 | App model-persistence fixes | core (app) | pending |
| 006 | openai-compatible `$defs` inlining | **upstream PR** | pending |
| 007 | Skill guidance hook in core | **upstream PR** | pending |
| 008 | Skill ranking + reporting as a plugin | plugin | pending |

## The prize

If 006 + 007 (+ the 005 race-condition bug) land upstream, our permanent core
divergence goes to **zero** and the fork reduces to: a ranking **plugin**, the
**Tauri app**, and config.

## Previous phase

upstream-merge-2026-07-03 (complete, 6/6 changes)
