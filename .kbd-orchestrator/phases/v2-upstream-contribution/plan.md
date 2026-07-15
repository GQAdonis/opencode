# Plan: v2-upstream-contribution

**Date:** 2026-07-15
**Backend:** OpenSpec
**Branch:** `v2` (worktree, shared object store with main repo)
**Source:** [assessment.md](./assessment.md)
**User intent:** "give back and get credit" — contributions upstream will *want* to accept,
attributed to Travis.

## What upstream's CONTRIBUTING.md forces (this reshapes the plan)

1. **Issue-First Policy is mandatory.** "All PRs must reference an existing issue… PRs without a
   linked issue may be closed without review." → an issue precedes every PR (`Fixes #NNN`).
2. **AI-generated descriptions are rejected.** The PR template: "If you paste a large clearly AI
   generated description here your PR may be IGNORED or CLOSED!" → PR/issue text must be **short
   and in Travis's voice**. The verbose commit messages are NOT usable as PR bodies.
3. **Core features need design review** before implementation. PR A (the `session.hook` seam) is a
   core change → it goes through an **issue/discussion first**, opened early to run in parallel,
   PR'd only once a maintainer is receptive.
4. **Bug fixes and "missing standard behavior" are explicitly welcomed** → B and C are the safe,
   likely-quick merges. Land those first to build a track record.
5. **PR titles = conventional commits** → our commit subjects already comply.

## Credit model

The three source commits are authored **Travis James <travis@know-me.tools>** (Co-Authored-By
Claude). Git authorship + the PR under the GQAdonis account is the credit mechanism — Travis is
the contributor of record. Nothing in the plan changes authorship.

## Division of labor (hard gate)

Opening issues/PRs against `anomalyco/opencode` is **outward-facing, hard to reverse, and
third-party**. This plan has me **prepare everything** — clean branches, brief draft text,
green tests — and has **Travis own submission** (review/edit the text into his voice, then open
the issues and PRs, or explicitly authorize me to run the `gh` commands with his approved text).
No issue or PR is opened without explicit go-ahead.

## Ordering rationale

Local, reviewable artifacts first (branches, descriptions, cleanup, the integration test) — all
safe, no outward action. Then submission, gated, and within submission: the two bug fixes before
the core seam, with the seam's discussion opened early.

## Change list

| # | Change | Type | Outward? | Depends on |
|---|---|---|---|---|
| 001 | Delete spike evidence + add ranking integration test | local code | no | — |
| 002 | Prepare 3 clean PR branches (packages/-only, rebased on upstream tip) | local git | no | 001 |
| 003 | Draft brief, human-voice issue + PR text per contribution | local docs | no | 002 |
| 004 | **[GATED]** Open issues, then PRs — Travis-owned | outward | **YES** | 003 + go-ahead |

---

### change-001 — Clean the tree + close the test gap

`/opsx:new v2c-cleanup-and-integration-test`

Two things that make the branches trustworthy before they're seen:

- **Delete spike evidence** (`openspec/changes/v2-spike-validate-gaps/evidence/{spike-agent-steps,
  spike-defs-inlining,spike-skill-loop}.test.ts`). Keep `spike.md`'s prose (the reasoning), drop
  the throwaway tests. They can't reach a PR (openspec/, not packages/), but they're clutter.
- **Add the ranking-plugin integration test.** The one real quality gap: today only the pure core
  and the hook mechanism are tested, not the plugin loaded into a live host. Model it on
  `packages/core/test/plugin.test.ts` — load `fork.skill-ranking`, drive a request through the
  host, assert the `<available_skills>` block comes back reordered/filtered. Decide its home:
  `packages/fork-plugins` (already dev-deps `@opencode-ai/core`) keeps it fork-owned — preferred.

**Exit:** integration test green; spike tests gone; fork-plugins + core suites still pass.

---

### change-002 — Prepare three clean PR branches

`/opsx:new v2c-pr-branches`

For each contribution, cut a branch from the **current** `upstream/v2` tip carrying only its
`packages/` diff (no `.kbd-orchestrator/`, no `openspec/`):

| Branch | From commit | Contents | Title |
|---|---|---|---|
| `pr/llm-inline-defs` | `48733d20b1` | `packages/llm` (2 files) | `fix(llm): inline $defs/$ref in OpenAI tool-schema projection` |
| `pr/app-model-persistence` | `de59a2010d` | `packages/app/src/context/local.tsx` | `fix(app): keep model selection across turns and restore` |
| `pr/session-request-hook` | `8f5646c596` | `packages/core` + `packages/plugin` (8 files) | `feat(core): implement documented session.hook("request")` |

Method: `git checkout -b <branch> upstream/v2` then `git checkout <commit> -- <packages paths>`
(cherry-pick the tree, not the commit, so KBD/openspec files never come along). Commit with the
existing conventional-commit subject. **Rebase-fresh on `upstream/v2` at prep time** (it moved 3
commits last phase). Run each branch's package tests + typecheck green in isolation.

**Do not push yet** — pushing to origin is part of the gated change-004.

**Exit:** three local branches, each `packages/`-only, tests green, based on current upstream tip.

---

### change-003 — Draft brief, human-voice submission text

`/opsx:new v2c-submission-drafts`

One markdown file per contribution under `.kbd-orchestrator/phases/v2-upstream-contribution/prs/`,
each holding a **short** issue draft + PR draft that fit upstream's template and anti-AI-slop rule:

- **Issue draft:** 2–4 sentences — the problem, why it matters, no fluff.
- **PR draft:** template fields only — `Closes #`, type checkbox, a few plain sentences on
  what/why, and **"How did you verify"** (we have concrete test evidence per PR: the `$defs`
  repro, the model-persistence reasoning, the 4 session-hook tests).
- Explicitly written to be **edited by Travis into his own voice** before submission — these are
  drafts, not final copy, precisely because upstream rejects AI-authored text.

Special handling for **PR A (session hook)**: draft a **discussion/issue** that leads with "your
docs and READMEs already describe `session.hook("request")` but it isn't implemented — here's an
implementation that makes them true," and note it is a core change that may want design review.
This issue is opened **first and early** (change-004) so the conversation can run while B and C
merge.

**Exit:** three `prs/*.md` drafts, brief and template-shaped, ready for Travis to edit.

---

### change-004 — [GATED] Open issues, then PRs

`/opsx:new v2c-submit` — **requires explicit user go-ahead; Travis owns the submit action.**

Sequence, once Travis approves and has edited the drafts:

1. Open the **issue** for each contribution (A's first/early). Capture issue numbers.
2. Insert `Closes #NNN` into each PR draft.
3. Push branches to `origin` (GQAdonis fork).
4. Open cross-repo PRs `GQAdonis:<branch>` → `anomalyco:v2`, **bug fixes (B, C) first**, the
   core seam (A) only once a maintainer is receptive on its issue.
5. Fill the PR template exactly (checklist ticked honestly: tested locally ✓, no unrelated
   changes ✓).

I prepare the exact `gh issue create` / `gh pr create` commands with the approved text; Travis
runs them or authorizes me to. **Nothing outward happens in this change without that approval.**

**Exit:** issues open, PRs open against `anomalyco:v2`, each linking its issue.

---

## Deferred / not in this phase

- `wslServers` (004b from the prior phase) — still deferred.
- The fork-owned work (plugins, Tauri) is **not** contributed upstream — it's ours by design.
  Only the three upstream-shaped surfaces go back.

## Risks

1. **Anti-AI-slop rejection.** The single biggest acceptance risk. Mitigated by drafting *short*
   text explicitly for Travis to rewrite in his voice — not pasting commit messages.
2. **Core-seam design review (PR A).** May stall or get redirected. Mitigated by issue-first and
   an early discussion; B and C don't depend on it.
3. **Moving beta.** Rebase branches on the live `upstream/v2` tip and re-run tests immediately
   before opening each PR.
4. **Outward, irreversible.** Enforced by the change-004 gate — no submission without go-ahead.
