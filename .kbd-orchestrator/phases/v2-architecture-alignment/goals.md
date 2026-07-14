# Phase: v2-architecture-alignment

**Opened:** 2026-07-14
**Previous phase:** upstream-merge-2026-07-03 (complete)

## Context

Upstream `anomalyco/opencode` is developing its 2.0 rewrite on branch `upstream/v2`
(NOT `upstream/2.0`, which is a dead 2026-04 exploration branch, and NOT
`upstream/beta`, which is the 1.17.x beta channel). `upstream/v2` forked from the
shared line at `0e2dd4ad1` (2026-06-26) and is actively developed. It has not been
version-stamped 2.0 — it still self-reports `1.17.18` and no `v2.*` tag exists.

We are moving our fork fully onto `upstream/v2`.

## The governing principle for this phase

**Do not re-add what v2 deliberately discarded, and do not force v1-era shapes onto
v2.** A clean `git apply` proves textual compatibility, not architectural fit.

An earlier patch-port dry run showed all 19 of our code files applying to v2 with
zero conflicts, typechecking clean, and 35/35 skill tests passing — but it achieved
that by re-adding our fork's `triggers` field to `Skill.Info` and reinstating v1
shapes v2 had moved past. That is the wrong outcome even though it is "green".

For every fork divergence we must answer, in order:

1. **Does v2 already do this?** If yes → delete our patch, adopt v2's mechanism.
2. **If not, did v2 introduce a more natural abstraction for it?** If yes →
   re-implement on that abstraction (plugin, skill source, service, hook), not on
   our old v1 shape.
3. **Only if neither** → port it, in v2 idiom, as a genuinely new capability.

Prefer extension points (plugins/hooks/sources) over core patches wherever v2
provides them, so future upstream syncs stay cheap.

## Goals

1. Complete an inventory of every fork divergence and classify each against the
   three-way test above. No divergence carried forward unclassified.
2. Re-implement the skill ranking + selection reporting feature natively in v2's
   skill architecture (SkillV2 / plugin sources), not as a patch to a v1 `Skill.Info`.
3. Determine whether v2 already owns the session loop cap, terminal-error handling,
   and openai-compatible schema sanitization; drop our patches where it does.
4. Determine where skills config (`exclude`, `maxShown`) belongs in v2's config
   architecture.
5. Realign the Tauri desktop app (`packages/desktop-tauri/`) to v2's desktop
   integration contract and consume v2 abstractions instead of bespoke ones where
   v2 now provides them.
6. Validate conclusions against external research on opencode v2's intended
   architecture, not just code reading.

## Constraints

- Keep BOTH desktop apps. Tauri stays fork-maintained at feature parity.
- OpenSpec must be initialized for opencode, claude, kimi, and codex. (DONE — the
  v2 branch has `openspec/` + `.opencode`/`.claude`/`.kimi`/`.codex`.)
- Work happens on branch `v2` (cut from `upstream/v2`). `dev` stays intact as the
  1.17.x line until v2 is proven.

## Non-goals

- Shipping a released 2.0. Upstream has not stamped one; we are tracking a live branch.
- Preserving our 40-commit fork history verbatim on v2. Structure is a clean,
  purpose-scoped commit stack that rebases cheaply against a daily-moving branch.
