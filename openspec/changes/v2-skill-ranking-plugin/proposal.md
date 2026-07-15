# Skill ranking + selection reporting as a plugin

**KBD change:** change-008 (phase `v2-architecture-alignment`) — the flagship feature, rebuilt.
**Depends on:** change-007 (the `session.hook("request")` seam).
**Absorbs:** change-007b's loaded-skill tracking (via `tool.execute.after`, no core change).
**Shape:** pure fork plugin in `packages/fork-plugins`. **Zero core divergence.**

## Why

The fork's flagship v1 feature ranked skills by relevance to the conversation and reported the
selection, instead of upstream's flat alphabetical list. The spike (change-001) confirmed v2
still ranks alphabetically with no ranking, no top-K, no loaded-skill filtering — so this is a
genuine, still-wanted capability. change-007 added the seam; this builds the feature on it as a
plugin, restoring the phase's zero-divergence goal.

## What the plugin does (`fork.skill-ranking`)

On `ctx.session.hook("request")`, it rewrites the `<available_skills>` block that
`SkillGuidance` renders into the system prompt:

1. **Rank** the advertised skills by relevance of `name`+`description` to the conversation
   (a small, dependency-free TF-style scorer over `event.messages`).
2. **Filter** out skills already loaded this session (so an already-loaded skill stops being
   re-advertised every turn — the v1 "re-invocation loop" fix). The loaded set is maintained
   from `ctx.tool.hook("execute.after")` watching the `skill` tool's `input.id`.
3. **Cap** to a top-K (`maxShown` plugin option), when set.

The block format is reproduced exactly from `core/src/skill/guidance.ts` (`<available_skills>` /
`<skill><id><name><description>`), so only the order/subset changes.

## The design constraints, and how they are met

- **No delta-renderer thrash.** The spike warned that re-ranking would churn the Instructions
  delta-renderer. That risk applied to *patching `guidance.ts`*. This plugin runs **after** the
  delta-renderer, on the final system string — `SkillGuidance`'s internal alphabetical list
  (which the diff is computed from) is untouched, so the diff never sees the reorder.
- **Prompt-cache stability.** Ranking is **deterministic and stable**: same conversation + same
  skills ⇒ byte-identical output, ties broken by id. Unchanged input reproduces the exact
  string, preserving the prompt cache. Re-ranking only when the conversation genuinely changes
  is the intended behavior.
- **Hiding is safe.** The `skill` tool loads any valid id against the full skill list
  (`core/src/tool/skill.ts`), independent of what is advertised. Filtering/capping changes
  suggestions, never what is loadable.

## Non-goals

- No change to `packages/core`/`packages/llm`/`packages/schema`. The plugin is the only new code.
- Selection *reporting* into the message UI (the old `session-ui/message-part.tsx` bit) is not
  reintroduced as a core patch; if wanted later it can ride the same plugin via tool output.

## Success criteria

- Ranking is deterministic (same input ⇒ identical output) and orders relevant skills first.
- Already-loaded skills are dropped from the advertised block.
- `maxShown` caps the list.
- Empty conversation ⇒ stable alphabetical fallback (matches core behavior on the first turn).
- Block format is byte-faithful to core's renderer.
- `packages/fork-plugins` typecheck + tests clean; zero diff vs `upstream/v2` in any upstream package.
