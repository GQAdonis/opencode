# Fork migration: v1 patches → v2 natives

What happened to the three behaviors this fork used to patch into core. All three were
validated against the real v2 runtime in the change-001 spike; see
`.kbd-orchestrator/phases/v2-architecture-alignment/` and
`openspec/changes/v2-spike-validate-gaps/spike.md`.

---

## 1. `skills.exclude` → **use v2 `permissions` rules**

**Dropped.** v2 does this natively, and better.

The fork used to add an `exclude` list under a `skills` config object. That shape cannot
survive on v2 at all: `Config.Info.skills` is a flat `string[]` of discovery paths/URLs
(`packages/core/src/config.ts`), and v1's `{paths, urls}` object is collapsed into it during
config migration.

v2 filters skills through the **permission ruleset** instead
(`packages/core/src/skill.ts:38`):

```ts
PermissionV2.evaluate("skill", skill.id, agent.permissions).effect !== "deny"
```

### Before (fork, v1)

```jsonc
{
  "skills": { "exclude": ["some-skill", "another-skill"] }
}
```

### After (v2, native)

```jsonc
{
  "permissions": [
    { "action": "skill", "resource": "some-skill", "effect": "deny" },
    { "action": "skill", "resource": "internal-*", "effect": "deny" }
  ]
}
```

The rule shape is `{ action, resource, effect }` (`packages/schema/src/permission.ts:58-62`);
`effect` is `allow | deny | ask`. This is strictly more capable than our patch was:

- `resource` supports **globs**, so `internal-*` excludes a whole family.
- Rules can be set **globally or per-agent** (`Config.Info.permissions`, or per agent).
- `deny` hides the skill from the model **and** rejects it at tool-load time.
- `ask` is a third option we never had: advertise the skill, but require approval to load.

Note the resource matched is the skill **`id`**, which on v2 is **derived from the path**
(`skills/git-release/SKILL.md` → `git-release`), *not* from the frontmatter `name`.

Two other native levers, if you want a softer exclusion:

| Lever | Where | Effect |
|---|---|---|
| omit `description` | SKILL.md frontmatter | skill is never advertised to the model |
| `metadata: { "opencode/autoinvoke": false }` | SKILL.md frontmatter | hidden from the model-facing list, but still loadable by explicit id |

---

## 2. Terminate the agent loop on a hard error → **dropped; v2 already does it**

The fork patched the session processor to stop retrying on a terminal error.

v2 has a proper taxonomy (`packages/core/src/session/runner/retry.ts:19-38`): `isRetryable`
switches over the error reason with a `never` exhaustiveness check, so a new failure mode is
a *compile error* until it is classified. `RateLimit` / `ProviderInternal` / `Transport`
retry; `Authentication` / `QuotaExceeded` / `ContentPolicy` / `InvalidRequest` / `NoRoute`
and friends do not. Retries are bounded (`Schedule.take(4)`, exponential, honoring
`retryAfterMs`), and a non-retryable failure propagates immediately.

**Nothing to port.** If a *specific* reason is misclassified for our providers, the correct
edit is that one `switch` — upstream, not in a fork patch.

---

## 3. `DEFAULT_MAX_STEPS` loop cap → **reimplemented as the `fork.agent-steps` plugin**

This one is a real gap in v2 — but it needs **no core patch**.

Upstream never defaults `steps`, and the runner's only termination guard is
`agentInfo.steps !== undefined && currentStep >= agentInfo.steps`
(`packages/core/src/session/runner/llm.ts`). With `steps` undefined that guard never fires.
The spike proved it empirically: a model emitting tool calls forever ran 26 steps with
`isLastStep` false every time — and only stopped because the *test's* fake model gave up.

The cap is now contributed through the public `ctx.agent.transform` extension point — see
`src/agent-steps.ts`. Enable it in `opencode.json(c)`:

```jsonc
{
  "plugins": ["@opencode-fork/plugins/agent-steps"]
}
```

or with an explicit cap:

```jsonc
{
  "plugins": [["@opencode-fork/plugins/agent-steps", { "steps": 500 }]]
}
```

You can also skip the plugin entirely and just set `steps` per agent in config — the plugin
only supplies a *default* for agents that don't.

**v2's enforcement is better than our old patch.** The v1 patch merely injected a
"max steps reached" prompt and hoped the model complied. v2 *enforces* it: on the final step
it sends `tools: []` and `toolChoice: "none"`, and force-fails any tool call the model emits
anyway with `"Tools are disabled after the maximum agent steps"`. By dropping our patch we
gained enforcement we never had.
