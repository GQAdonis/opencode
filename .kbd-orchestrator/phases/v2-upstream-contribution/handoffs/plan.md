# Handoff: plan → execute

**Phase:** v2-upstream-contribution
**Date:** 2026-07-15

## Change count & ordering

4 changes. Local reviewable artifacts first (001 cleanup+integration test, 002 PR branches,
003 brief human-voice drafts), then GATED submission (004). Upstream CONTRIBUTING forces the
shape: issue-first is mandatory, AI-generated PR text is rejected (drafts must be short and
Travis-edited), and the core session-hook seam (PR A) needs design review so it goes via an
early issue/discussion while the two bug fixes (B=$defs, C=model-persistence) merge first.

## First change to apply

`/kbd-apply v2c-cleanup-and-integration-test` — delete spike evidence, add the ranking-plugin
integration test (the one real quality gap). Safe, local, no outward action.

## Hard gate for execute (carry to change-004)

No issue or PR is opened against anomalyco/opencode without explicit user go-ahead. I prepare
branches + brief drafts + exact gh commands; Travis edits the text into his voice and owns
submission. Rebase branches on the live upstream/v2 tip and re-run tests immediately before opening.
