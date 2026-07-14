import { describe, expect, test } from "bun:test"
import { LLMClient, LLMEvent, LLMError, Model, type LLMClientShape, type LLMRequest } from "@opencode-ai/llm"
import * as OpenAIChat from "@opencode-ai/llm/protocols/openai-chat"
import { Database } from "@opencode-ai/core/database/database"
import { makeLocationNode } from "@opencode-ai/core/effect/app-node"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNodePlatform } from "@opencode-ai/core/effect/app-node-platform"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
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
import { PluginSupervisor } from "@opencode-ai/core/plugin/supervisor"
import { ToolOutputStore } from "@opencode-ai/core/tool-output-store"
import { AgentV2 } from "@opencode-ai/core/agent"
import { Agent as AgentSchema } from "@opencode-ai/schema/agent"
import { Config } from "@opencode-ai/core/config"
import { ConfigCompaction } from "@opencode-ai/core/config/compaction"
import { Tool } from "@opencode-ai/core/tool/tool"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { InstructionEntry } from "@opencode-ai/core/session/instruction-entry"
import { SessionStore } from "@opencode-ai/core/session/store"
import { Instructions } from "@opencode-ai/core/instructions"
import { InstructionBuiltIns } from "@opencode-ai/core/instructions/builtins"
import { InstructionDiscovery } from "@opencode-ai/core/instruction-discovery"
import { SkillGuidance } from "@opencode-ai/core/skill/guidance"
import { ReferenceGuidance } from "@opencode-ai/core/reference/guidance"
import { McpGuidance } from "@opencode-ai/core/mcp/guidance"
import { Location } from "@opencode-ai/core/location"
import { Effect, Layer, Schema } from "effect"
import { testEffect } from "./lib/effect"

// ---------------------------------------------------------------------------
// Harness (minimal copy of test/session-runner.test.ts scaffolding)
// ---------------------------------------------------------------------------

const requests: LLMRequest[] = []
let responses: LLMEvent[][] | undefined
/** Never-ending supply of tool calls: emulates a model stuck in a tool loop. */
let infiniteToolCalls = false
let streamCount = 0

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

/** Hard stop so a genuinely unbounded loop fails the test instead of hanging forever. */
const RUNAWAY_GUARD = 25

const client = Layer.succeed(
  LLMClient.Service,
  LLMClient.Service.of({
    prepare: () => Effect.die("unused"),
    stream: ((request: LLMRequest) => {
      requests.push(request)
      streamCount++
      if (infiniteToolCalls) {
        // The model *always* wants another tool call. Only the runner can stop this.
        if (streamCount > RUNAWAY_GUARD) return Stream_fromEvents(reply.stop())
        return Stream_fromEvents(reply.tool(`call-${streamCount}`, "echo", { text: `step-${streamCount}` }))
      }
      return Stream_fromEvents(responses?.shift() ?? reply.stop())
    }) as unknown as LLMClientShape["stream"],
    generate: () => Effect.die("unused"),
  }),
)

// Local helper so we don't depend on Stream import shape drifting.
import { Stream } from "effect"
const Stream_fromEvents = (events: LLMEvent[]) => Stream.fromIterable(events) as Stream.Stream<LLMEvent, LLMError>

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

const executions: string[] = []
const echo = Layer.effectDiscard(
  ToolRegistry.Service.use((registry) =>
    registry.register(
      {
        echo: Tool.make({
          description: "Echo text",
          input: Schema.Struct({ text: Schema.String }),
          output: Schema.Struct({ text: Schema.String }),
          toModelOutput: ({ output }) => [{ type: "text", text: output.text }],
          execute: ({ text }) =>
            Effect.sync(() => {
              executions.push(text)
              return { text }
            }),
        }),
      },
      { codemode: false },
    ),
  ),
)
const echoNode = makeLocationNode({ name: "spike/tools", layer: echo, deps: [ToolRegistry.node] })

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
const skillGuidance = Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(Instructions.empty) })
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

const runnerLayer = AppNodeBuilder.build(SessionRunnerLLM.node, [
  [Snapshot.node, Snapshot.noopLayer],
  [LayerNodePlatform.llmClient, client],
  [SessionRunnerModel.node, models],
  [InstructionBuiltIns.node, systemContext],
  [InstructionDiscovery.node, instructionContext],
  [Location.node, Location.boundNode({ directory: AbsolutePath.make("/project") })],
  [SkillGuidance.node, skillGuidance],
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
      echoNode,
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
      [SkillGuidance.node, skillGuidance],
      [ReferenceGuidance.node, referenceGuidance],
      [Snapshot.node, Snapshot.noopLayer],
      [SessionExecution.node, execution],
      [Config.node, config],
      [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
      [PluginSupervisor.node, pluginSupervisor],
    ],
  ),
)

const sessionID = SessionV2.ID.make("ses_spike_steps")
const admit = (session: SessionV2.Interface, text: string) => session.prompt({ sessionID, text, resume: false })

const setup = Effect.gen(function* () {
  const { db } = yield* Database.Service
  requests.length = 0
  executions.length = 0
  responses = undefined
  infiniteToolCalls = false
  streamCount = 0
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

/**
 * The EXACT shape a plugin would use:
 *   ctx.agent.transform((draft) => { for (const a of draft.list()) draft.update(a.id, (x) => { x.steps ??= 1000 }) })
 * Nothing here is core-specific; AgentV2.Draft === plugin AgentDraft.
 */
const stepCapPlugin = (cap: number) =>
  Effect.gen(function* () {
    const agents = yield* AgentV2.Service
    yield* agents.transform((draft) => {
      for (const agent of draft.list()) {
        draft.update(agent.id, (a) => {
          a.steps ??= (cap as never)
        })
      }
    })
  })

// ---------------------------------------------------------------------------
// Q2 (a) — the default is genuinely unbounded
// ---------------------------------------------------------------------------

describe("Q2a: default step allowance", () => {
  test("Agent.Info.empty omits steps (schema-level default is undefined)", () => {
    expect(AgentSchema.Info.empty(AgentSchema.ID.make("build")).steps).toBeUndefined()
  })

  it.effect("an agent with no configured steps never hits isLastStep — the drain loop is unbounded", () =>
    Effect.gen(function* () {
      const session = yield* setup
      const agents = yield* AgentV2.Service

      // No plugin, no config: steps is undefined.
      expect((yield* agents.get(AgentV2.ID.make("build")))?.steps).toBeUndefined()

      infiniteToolCalls = true
      yield* admit(session, "Loop forever")
      yield* session.resume(sessionID)

      // The ONLY thing that stopped the loop was our test-side RUNAWAY_GUARD,
      // not the runner. Every request kept tools enabled and toolChoice unset,
      // i.e. isLastStep was false on every single step.
      expect(requests.length).toBe(RUNAWAY_GUARD + 1)
      expect(requests.every((request) => request.toolChoice === undefined)).toBe(true)
      expect(requests.every((request) => (request.tools ?? []).length > 0)).toBe(true)
      expect(executions.length).toBe(RUNAWAY_GUARD)
    }),
  )
})

// ---------------------------------------------------------------------------
// Q2 (b) — zero-patch remedy via the plugin AgentDraft
// ---------------------------------------------------------------------------

describe("Q2b: plugin-only step cap", () => {
  it.effect("a plugin-shaped agent.transform sets steps, and the runner honors it", () =>
    Effect.gen(function* () {
      const session = yield* setup
      const agents = yield* AgentV2.Service

      yield* stepCapPlugin(3)

      // The field really is mutable through the draft.
      expect((yield* agents.get(AgentV2.ID.make("build")))?.steps).toBe(3)

      infiniteToolCalls = true
      yield* admit(session, "Loop forever, but capped")
      yield* session.resume(sessionID)

      // Capped at 3 steps — well below RUNAWAY_GUARD, so the RUNNER stopped it.
      expect(requests.length).toBe(3)
      expect(executions).toEqual(["step-1", "step-2"])
    }),
  )

  it.effect("`??=` respects an agent that already configured its own steps", () =>
    Effect.gen(function* () {
      const session = yield* setup
      const agents = yield* AgentV2.Service

      // Simulate user config setting steps=2 (config/plugin/agent.ts:108).
      yield* agents.transform((draft) =>
        draft.update(AgentV2.ID.make("build"), (agent) => {
          agent.steps = (2 as never)
        }),
      )
      yield* stepCapPlugin(1000)

      expect((yield* agents.get(AgentV2.ID.make("build")))?.steps).toBe(2)

      infiniteToolCalls = true
      yield* admit(session, "User cap wins")
      yield* session.resume(sessionID)

      expect(requests.length).toBe(2)
    }),
  )
})

// ---------------------------------------------------------------------------
// Q2 (c) — last-step behavior is enforced, not merely prompted
// ---------------------------------------------------------------------------

describe("Q2c: last-step enforcement", () => {
  it.effect("on the last step v2 strips tools, forces toolChoice=none, and force-fails any tool call", () =>
    Effect.gen(function* () {
      const session = yield* setup
      yield* stepCapPlugin(2)
      yield* admit(session, "Finish at the limit")

      responses = [
        reply.tool("call-allowed", "echo", { text: "done" }),
        // The model disobeys the prompt and calls a tool anyway on the last step.
        reply.tool("call-forbidden", "echo", { text: "forbidden" }),
      ]
      yield* session.resume(sessionID)

      expect(requests).toHaveLength(2)

      // Step 1: normal.
      expect(requests[0]?.toolChoice).toBeUndefined()
      expect((requests[0]?.tools ?? []).length).toBeGreaterThan(0)

      // Step 2 (last): tools stripped + toolChoice none + MAX_STEPS_PROMPT injected.
      expect(requests[1]?.toolChoice).toMatchObject({ type: "none" })
      expect(requests[1]?.tools).toEqual([])
      expect(requests[1]?.messages.at(-1)).toMatchObject({
        role: "assistant",
        content: [{ type: "text", text: expect.stringContaining("MAXIMUM STEPS REACHED") }],
      })

      // ENFORCEMENT (not just a prompt): the disobedient tool call never executed.
      expect(executions).toEqual(["done"])

      const context = yield* session.context(sessionID)
      expect(context).toMatchObject([
        { type: "user", text: "Finish at the limit" },
        { type: "assistant", content: [{ type: "tool", id: "call-allowed", state: { status: "completed" } }] },
        { type: "assistant", content: [{ type: "tool", id: "call-forbidden", state: { status: "error" } }] },
      ])

      // And the error carries the specific max-steps message.
      const failed = context
        .flatMap((message) => (message.type === "assistant" ? message.content : []))
        .find((part) => part.type === "tool" && part.id === "call-forbidden")
      expect(JSON.stringify(failed)).toContain("Tools are disabled after the maximum agent steps")
    }),
  )
})
