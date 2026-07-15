# Handoff: assess → plan

**Phase:** v2-upstream-contribution
**Date:** 2026-07-15

## Key gaps found

Three PR surfaces are each ONE clean single-concern commit on `v2` (A: session.hook seam
`8f5646c596`, B: $defs `48733d20b1`, C: model-persistence `de59a2010d`), independent, ready to
extract as `packages/`-only branches from `upstream/v2` (strip 3 KBD/openspec files each). gh is
authed as GQAdonis; origin (the fork) is pushable; PRs base on `anomalyco:v2`. Two non-PR gaps:
spike evidence tests still tracked under openspec/ (inert, low-urgency cleanup), and the
ranking-plugin integration test is missing (feasible — plugin.test.ts shows the host-load pattern).

## Open questions for plan

- Confirm PR base is `anomalyco:v2` (upstream default is `dev`).
- Integration test home: fork-plugins vs core-side.
- Spike evidence: delete files, keep spike.md prose.

## Hard gate for execute

Opening PRs to a third-party repo is outward-facing and hard to reverse — prepare branches +
bodies, but DO NOT open any PR without explicit user go-ahead. Rebase each branch on the current
upstream/v2 tip and re-run its tests immediately before opening.
