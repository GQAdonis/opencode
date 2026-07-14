# Handoff: plan → execute

**Phase:** v2-architecture-alignment
**Stage:** plan (complete)
**Date:** 2026-07-14

## Summary

8 changes, ordered so the one BLOCKING spike (change-001) runs first — two of its
answers gate the design of the most expensive change in the phase (skill ranking),
and one supplies the evidence for an upstream bug report. Zero-patch wins (002) and
the fork-owned Tauri work (003/004) follow because they are independent and low-risk.
The three core changes are all shaped as **upstream contributions** (006, 007, and the
async-storage race in 005), not private patches — that is what delivers the phase's
governing constraint of zero permanent core divergence.

## First change to apply

`/kbd-apply change-001` — spike. Four falsifiable questions:
1. Does the skill re-invocation loop still reproduce on v2? (may delete change C entirely)
2. Does the unbounded agent loop reproduce, and does `AgentDraft.update(a.steps ??= N)` cap it?
3. Is the `$defs` rejection still reachable? (evidence for the change-006 upstream PR)
4. Confirm the 4 Tauri `Platform` gaps against a real v2 build.

Plus one decision: which hook shape to propose upstream in change-007 —
implement the already-documented `session.hook("request")`, or a narrower
`skill.guidance` transform.

## Open questions carried into execute

- **Will upstream accept the hook (007)?** This is the main threat to zero-divergence.
  Fallback: carry a single-file core patch on `guidance.ts` and re-evaluate each sync.
- **Ranking vs. the Instructions delta-renderer.** `guidance.ts:34-57` diffs the skill
  list per step; a per-turn re-ranker will thrash it and spam the model with
  "new/removed skills" churn. Ranking must be hysteretic. Hardest part of change-008;
  design and test it explicitly.
- v2 is a moving beta ("APIs may continue to change") — plugin API churn can break
  change-008 without warning.
