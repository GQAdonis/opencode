import fs from "fs/promises"
import path from "path"
import { describe, expect } from "bun:test"
import { LLMClient, LLMEvent, LLMError, Model, type LLMClientShape, type LLMRequest } from "@opencode-ai/llm"
import * as OpenAIChat from "@opencode-ai/llm/protocols/openai-chat"
import { Database } from "@opencode-ai/core/database/database"
import { makeLocationNode } from "@opencode-ai/core/effect/app-node"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNodePlatform } from "@opencode-ai/core/effect/app-node-platform"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { PermissionV2 } from "@opencode-ai/core/permission"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { Form } from "@opencode-ai/core/form"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionV2 } from "@opencode-ai/core/session"
import { Snapshot } from "@opencode-ai/core/snapshot"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionExecution } from "@opencode-ai/core/session/execution"
import { SessionRunCoordinator } from "@opencode-ai/core/session/run-coordinator"
import { SessionRunner } from "@opencode-ai/core/session/runner"
import * as SessionRunnerLLM from "@opencode-ai/core/session/runner/llm"
import { SessionRunnerModel } from "@opencode-ai/core/session/runner/model"
import { ToolRegistry } from "@opencode-ai/core/tool/registry"
import { SkillTool } from "@opencode-ai/core/tool/skill"
import { SkillV2 } from "@opencode-ai/core/skill"
import { SkillGuidance } from "@opencode-ai/core/skill/guidance"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { PluginSupervisor } from "@opencode-ai/core/plugin/supervisor"
import { ToolOutputStore } from "@opencode-ai/core/tool-output-store"
import { AgentV2 } from "@opencode-ai/core/agent"
import { Config } from "@opencode-ai/core/config"
import { ConfigCompaction } from "@opencode-ai/core/config/compaction"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { InstructionEntry } from "@opencode-ai/core/session/instruction-entry"
import { SessionStore } from "@opencode-ai/core/session/store"
import { Instructions } from "@opencode-ai/core/instructions"
import { InstructionBuiltIns } from "@opencode-ai/core/instructions/builtins"
import { InstructionDiscovery } from "@opencode-ai/core/instruction-discovery"
import { ReferenceGuidance } from "@opencode-ai/core/reference/guidance"
import { McpGuidance } from "@opencode-ai/core/mcp/guidance"
import { Location } from "@opencode-ai/core/location"
import { Effect, Layer, Schema, Stream } from "effect"
import { eq } from "drizzle-orm"
import { testEffect } from "./lib/effect"
import { registerToolPlugin } from "./lib/tool"

// ---------------------------------------------------------------------------
// Skill fixture on disk (the real SkillTool globs the skill directory).
// ---------------------------------------------------------------------------

const skillDir = path.join(process.cwd(), ".spike-skills", "effect")
const skillFile = path.join(skillDir, "SKILL.md")
await fs.mkdir(skillDir, { recursive: true })
await fs.writeFile(skillFile, "unused")

/** Single-line marker so it survives JSON serialization of tool-result parts. */
const SKILL_MARKER = "Always use Effect.gen."
const SKILL_CONTENT = `# Effect\n\n${SKILL_MARKER}`
const skillInfo: SkillV2.Info = {
  id: SkillV2.ID.make("effect"),
  name: SkillV2.Name.make("Effect"),
  description: "Guidance for writing Effect code",
  location: AbsolutePath.make(skillFile),
  content: SKILL_CONTENT,
}

// The REAL SkillV2 service is a filesystem scanner; we only stub the source list.
// Everything downstream of `list()` — guidance, tool, runner — is real.
const skills = Layer.mock(SkillV2.Service, { list: () => Effect.succeed([skillInfo]) })

// ---------------------------------------------------------------------------
// Runner harness
// ---------------------------------------------------------------------------

const requests: LLMRequest[] = []
let responses: LLMEvent[][] | undefined

const reply = {
  stop: () => [
    LLMEvent.stepStart({ index: 0 }),
    LLMEvent.stepFinish({ index: 0, reason: "stop" }),
    LLMEvent.finish({ reason: "stop" }),
  ],
  tool: (id: string, name: string, input: unknown) => [
    LLMEvent.stepStart({ index: 0 }),
    LLMEvent.toolCall({ id, name, input }),
    LLMEvent.stepFinish({ index: 0, reason: "tool-calls" }),
    LLMEvent.finish({ reason: "tool-calls" }),
  ],
}

const client = Layer.succeed(
  LLMClient.Service,
  LLMClient.Service.of({
    prepare: () => Effect.die("unused"),
    stream: ((request: LLMRequest) => {
      requests.push(request)
      return Stream.fromIterable(responses?.shift() ?? reply.stop()) as Stream.Stream<LLMEvent, LLMError>
    }) as unknown as LLMClientShape["stream"],
    generate: () => Effect.die("unused"),
  }),
)

const model = Model.make({ id: "fake-model", provider: "fake", route: OpenAIChat.route })
const models = SessionRunnerModel.layerWith(() => Effect.succeed(SessionRunnerModel.resolved(model, undefined)))

const permission = Layer.succeed(
  PermissionV2.Service,
  PermissionV2.Service.of({
    assert: () => Effect.void,
    ask: () => Effect.die("unused"),
    reply: () => Effect.die("unused"),
    get: () => Effect.die("unused"),
    forSession: () => Effect.die("unused"),
    list: () => Effect.die("unused"),
  }),
)

// The REAL skill tool, registered through the same plugin path production uses.
const skillToolNode = makeLocationNode({
  name: "spike/skill-tool",
  layer: Layer.effectDiscard(registerToolPlugin(SkillTool.Plugin)),
  deps: [ToolRegistry.toolsNode, FSUtil.node, SkillV2.node, PermissionV2.node],
})

const systemContext = Layer.mock(InstructionBuiltIns.Service, {
  load: () =>
    Effect.sync(() =>
      Instructions.make({
        key: Instructions.Key.make("test/context"),
        codec: Schema.toCodecJson(Schema.String),
        read: Effect.succeed("Initial context"),
        render: { initial: String, changed: (_p, c) => c, removed: () => "removed" },
      }),
    ),
})
const instructionContext = Layer.mock(InstructionDiscovery.Service, { load: () => Effect.succeed(Instructions.empty) })
const referenceGuidance = Layer.mock(ReferenceGuidance.Service, { load: () => Effect.succeed(Instructions.empty) })
const mcpGuidance = Layer.mock(McpGuidance.Service, { load: () => Effect.succeed(Instructions.empty) })

const config = Layer.succeed(
  Config.Service,
  Config.Service.of({
    entries: () =>
      Effect.succeed([
        new Config.Document({
          type: "document",
          info: new Config.Info({
            compaction: new ConfigCompaction.Info({
              buffer: 3_000,
              keep: new ConfigCompaction.Keep({ tokens: 1_000 }),
            }),
          }),
        }),
      ]),
  }),
)
const pluginSupervisor = Layer.succeed(PluginSupervisor.Service, PluginSupervisor.Service.of({ flush: Effect.void }))

// NOTE: SkillGuidance.node is the REAL implementation (src/skill/guidance.ts).
const runnerLayer = AppNodeBuilder.build(SessionRunnerLLM.node, [
  [Snapshot.node, Snapshot.noopLayer],
  [LayerNodePlatform.llmClient, client],
  [SessionRunnerModel.node, models],
  [InstructionBuiltIns.node, systemContext],
  [InstructionDiscovery.node, instructionContext],
  [Location.node, Location.boundNode({ directory: AbsolutePath.make("/project") })],
  [SkillV2.node, skills],
  [ReferenceGuidance.node, referenceGuidance],
  [PermissionV2.node, permission],
  [Config.node, config],
  [McpGuidance.node, mcpGuidance],
  [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
  [PluginSupervisor.node, pluginSupervisor],
])

const execution = Layer.effect(
  SessionExecution.Service,
  Effect.gen(function* () {
    const sessionRunner = yield* SessionRunner.Service
    const coordinator = yield* SessionRunCoordinator.make<SessionV2.ID, SessionRunner.RunError>({
      drain: (sessionID, force) => sessionRunner.drain({ sessionID, force }),
    })
    return SessionExecution.Service.of({
      active: coordinator.active,
      resume: coordinator.run,
      wake: coordinator.wake,
      interrupt: coordinator.interrupt,
      awaitIdle: coordinator.awaitIdle,
    })
  }),
).pipe(Layer.provide(runnerLayer))

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      EventV2.node,
      Form.node,
      SessionProjector.node,
      SessionStore.node,
      AgentV2.node,
      ToolRegistry.node,
      ToolRegistry.toolsNode,
      skillToolNode,
      SessionRunnerModel.node,
      InstructionBuiltIns.node,
      InstructionDiscovery.node,
      InstructionEntry.node,
      SkillGuidance.node,
      ReferenceGuidance.node,
      Config.node,
      Snapshot.node,
      SessionRunnerLLM.node,
      SessionExecution.node,
      SessionV2.node,
    ]),
    [
      [LayerNodePlatform.llmClient, client],
      [PermissionV2.node, permission],
      [SessionRunnerModel.node, models],
      [InstructionBuiltIns.node, systemContext],
      [InstructionDiscovery.node, instructionContext],
      [Location.node, Location.boundNode({ directory: AbsolutePath.make("/project") })],
      [SkillV2.node, skills],
      [ReferenceGuidance.node, referenceGuidance],
      [Snapshot.node, Snapshot.noopLayer],
      [SessionExecution.node, execution],
      [Config.node, config],
      [McpGuidance.node, mcpGuidance],
      [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
      [PluginSupervisor.node, pluginSupervisor],
    ],
  ),
)

const sessionID = SessionV2.ID.make("ses_spike_skill")
const admit = (session: SessionV2.Interface, text: string) => session.prompt({ sessionID, text, resume: false })

const setup = Effect.gen(function* () {
  const { db } = yield* Database.Service
  requests.length = 0
  responses = undefined
  const agents = yield* AgentV2.Service
  yield* agents.transform((draft) =>
    draft.update(AgentV2.ID.make("build"), (agent) => {
      agent.mode = "primary"
    }),
  )
  yield* db
    .insert(ProjectTable)
    .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
  yield* db
    .insert(SessionTable)
    .values({
      id: sessionID,
      project_id: Project.ID.global,
      slug: sessionID,
      directory: "/project",
      title: "test",
      version: "test",
    })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
  return yield* SessionV2.Service
})

/** Every piece of text the model actually sees in a request (system + messages). */
const allText = (request: LLMRequest) =>
  [
    ...request.system.map((part) => ("text" in part ? String(part.text) : "")),
    ...request.messages.flatMap((message) =>
      message.content.flatMap((content: { type: string; text?: string }) =>
        content.type === "text" && content.text !== undefined ? [content.text] : [],
      ),
    ),
  ].join("\n---\n")

const eventTypes = (id: SessionV2.ID) =>
  Database.Service.use(({ db }) =>
    db
      .select({ type: EventTable.type })
      .from(EventTable)
      .where(eq(EventTable.aggregate_id, id))
      .all()
      .pipe(
        Effect.orDie,
        Effect.map((rows) => rows.map((row) => row.type)),
      ),
  )

describe("Q1: skill re-invocation loop on v2", () => {
  it.live("an already-loaded skill stays advertised in <available_skills> on EVERY subsequent step", () =>
    Effect.gen(function* () {
      const session = yield* setup

      // Step 1: model loads the skill.  Step 2: model loads THE SAME skill again.
      // Step 3: model finally stops.
      responses = [
        reply.tool("call-1", "skill", { id: "effect" }),
        reply.tool("call-2", "skill", { id: "effect" }),
        reply.stop(),
      ]

      yield* admit(session, "Write some Effect code")
      yield* session.resume(sessionID)

      expect(requests).toHaveLength(3)

      // The advertisement lives in the SYSTEM prompt, which is rebuilt and re-sent
      // on every single step — so it is re-stated to the model every turn.
      const systemOf = (request: LLMRequest) =>
        request.system.map((part) => ("text" in part ? String(part.text) : "")).join("\n")
      for (const request of requests) {
        expect(systemOf(request)).toContain("<available_skills>")
        expect(JSON.stringify(request.messages)).not.toContain("<available_skills>")
      }

      // --- (1) The skill is advertised on step 1, before it is loaded. -------
      const step1 = allText(requests[0]!)
      expect(step1).toContain("<available_skills>")
      expect(step1).toContain("<id>effect</id>")

      // --- (2) THE CORE FINDING ---------------------------------------------
      // After the skill has been loaded (step 1's tool call), the skill is STILL
      // in <available_skills> on step 2 and step 3. Nothing in v2 removes a
      // loaded skill from the advertised list.
      const step2 = allText(requests[1]!)
      const step3 = allText(requests[2]!)
      expect(step2).toContain("<available_skills>")
      expect(step2).toContain("<id>effect</id>")
      expect(step3).toContain("<available_skills>")
      expect(step3).toContain("<id>effect</id>")

      // --- (3) The delta-renderer never fires: the LIST is unchanged, so no
      // "skills have changed" text is ever emitted. Suppressing a re-LIST is
      // not the same as suppressing a re-ADVERTISEMENT.
      expect(step2).not.toContain("The available skills have changed")
      expect(step2).not.toContain("no longer available")
      expect(step3).not.toContain("The available skills have changed")

      // --- (4) The skill tool has NO dedupe: the full content is re-injected
      // verbatim on the second call. Tool results are ToolResultParts, not text
      // parts, so search the serialized messages the model actually receives.
      const finalRequest = JSON.stringify(requests[2]!.messages)
      const injections = finalRequest.split(SKILL_MARKER).length - 1
      expect(injections).toBe(2)
      expect(finalRequest.split('<skill_content name=\\"Effect\\">').length - 1).toBe(2)

      // --- (5) Nothing publishes session.skill.activated, so there is no
      // durable record the runner could dedupe against.
      expect(yield* eventTypes(sessionID)).not.toContain("session.skill.activated.1")
    }),
  )

  it.live("SkillGuidance.load re-reads the FULL permitted list; loading is not tracked", () =>
    Effect.gen(function* () {
      yield* setup
      const guidance = yield* SkillGuidance.Service
      const agents = yield* AgentV2.Service
      const selection = yield* agents.select(AgentV2.ID.make("build"))

      // Read the guidance source twice, with a skill "load" in between.
      const before = yield* Instructions.read(yield* guidance.load(selection))

      const registry = yield* ToolRegistry.Service
      const materialized = yield* registry.materialize()
      yield* materialized.settle({
        sessionID,
        agent: AgentV2.ID.make("build"),
        assistantMessageID: SessionV2.ID.make("ses_spike_skill") as never,
        call: { id: "c1", name: "skill", input: { id: "effect" } } as never,
      })

      const after = yield* Instructions.read(yield* guidance.load(selection))

      // Identical. The guidance source has no notion of "loaded" — its `read`
      // (guidance.ts:74-85) is a pure function of the permitted skill list.
      expect(JSON.stringify(after)).toEqual(JSON.stringify(before))
      expect(JSON.stringify(after)).toContain("effect")

      // Therefore Instructions.diff produces NO delta: the hash is unchanged, so
      // the `changed` renderer at guidance.ts:34-57 is never even called.
      const previous = Object.fromEntries(
        before.map((entry) => [entry.key, Instructions.hash(entry.value as never)] as const),
      )
      const admission = yield* Instructions.diff(after, previous as never)
      expect(admission.delta).toEqual({})
    }),
  )
})
