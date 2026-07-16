# PR B — $defs inlining (packages/ai)

**Branch:** `pr/ai-inline-defs` (worktree: scratchpad/pr-ai-defs), 1 commit off current `upstream/v2` tip.
**Base:** `anomalyco/opencode:v2` (packages/ai is v2-only; the rename llm→ai hasn't reached dev).
**Status:** ready; projection tests 10/10 in isolation on a pristine upstream checkout.

> ⚠️ These are DRAFTS in your voice to edit. Upstream rejects AI-written descriptions — please
> rewrite as your own before submitting. Keep them short.

---

## Issue draft

**Title:** `OpenAI-compatible providers reject tool schemas containing $defs/$ref`

**Body:**
> When a tool's input schema reuses a struct, it emits `$defs` plus `#/$defs/...` refs. The
> OpenAI tool-schema projection doesn't resolve those, so they reach the provider. Providers
> behind OpenAI-compatible endpoints that don't dereference JSON Schema — DeepSeek (via
> Fireworks), MiniMax — reject the request with "Error resolving schema reference". OpenAI's own
> strict mode also dislikes bare `$defs`.
>
> Repro: define a tool whose parameters reuse a named sub-struct, call it against an
> openai-compatible provider.

---

## PR draft (fits the template)

**Title:** `fix(ai): inline $defs/$ref in the OpenAI tool-schema projection`

**Type of change:** Bug fix

**Issue:** Closes #NNN _(the issue above)_

**What does this PR do?**
> Resolves internal schema refs before the OpenAI projection instead of passing them to the
> wire. Adds `inlineDefs()`: resolves `#/$defs` and `#/definitions` refs at any depth, merges a
> ref node's sibling keys (e.g. `description`) over the resolved target, guards cycles (a
> self-referential schema collapses its recursive position to `{}` rather than looping or
> emitting a dangling ref), drops unresolvable refs, and strips the `$defs`/`definitions`
> containers. Called at the start of `openAI()` in `protocols/utils/tool-schema.ts`.

**How did you verify your code works?**
> Added 6 unit tests to `tool-schema-projection.test.ts` (reused struct, nested refs, sibling
> `description` preserved, recursive ref terminates, unknown ref dropped, no-defs untouched).
> The projection test file passes 10/10.

**Checklist:** tested locally ✓ · no unrelated changes ✓

**Note for maintainers (optional, your call whether to include):** the same bug exists on `dev`
under `packages/llm` (the `llm→ai` rename is v2-only). Happy to also send it there if wanted.

---

## Exact commands (run after you've edited the text; nothing fires until you do)

```sh
# 1. Open the issue (edit --title/--body to your wording first)
gh issue create --repo anomalyco/opencode \
  --title "OpenAI-compatible providers reject tool schemas containing \$defs/\$ref" \
  --body "<your issue text>"
# → note the issue number it prints, e.g. 12345

# 2. Push the branch to your fork
git -C /private/tmp/claude-501/-Users-gqadonis-Projects-references-opencode/85763f9d-35b0-403e-9444-470c25b8c4c0/scratchpad/pr-ai-defs \
  push origin pr/ai-inline-defs

# 3. Open the PR (put the issue number in the body's "Closes #")
gh pr create --repo anomalyco/opencode \
  --base v2 --head GQAdonis:pr/ai-inline-defs \
  --title "fix(ai): inline \$defs/\$ref in the OpenAI tool-schema projection" \
  --body "<your PR text, with Closes #12345>"
```
