import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { LLM } from "../src"
import { OpenAIChat } from "../src/protocols"
import { inlineDefs, ToolSchemaProjection } from "../src/protocols/utils/tool-schema"
import { Auth, LLMClient } from "../src/route"
import { it } from "./lib/effect"

const hasRef = (value: unknown): boolean => JSON.stringify(value).includes("$ref")

describe("openAI $defs inlining", () => {
  test("inlines a reused struct and drops the $defs container", () => {
    const out = ToolSchemaProjection.openAI({
      type: "object",
      properties: {
        origin: { $ref: "#/$defs/Point" },
        target: { $ref: "#/$defs/Point" },
      },
      $defs: {
        Point: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } },
      },
    })
    expect(hasRef(out)).toBe(false)
    expect(out.$defs).toBeUndefined()
    const props = out.properties as Record<string, { properties?: Record<string, unknown> }>
    expect(props.origin.properties?.x).toEqual({ type: "number" })
    expect(props.target.properties?.y).toEqual({ type: "number" })
  })

  test("resolves nested references transitively", () => {
    const out = inlineDefs({
      type: "object",
      properties: { line: { $ref: "#/$defs/Line" } },
      $defs: {
        Line: { type: "object", properties: { from: { $ref: "#/$defs/Point" } } },
        Point: { type: "object", properties: { x: { type: "number" } } },
      },
    })
    expect(hasRef(out)).toBe(false)
    const props = out.properties as any
    expect(props.line.properties.from.properties.x).toEqual({ type: "number" })
  })

  test("preserves sibling keys on a $ref node", () => {
    const out = inlineDefs({
      type: "object",
      properties: { pt: { $ref: "#/$defs/Point", description: "a point" } },
      $defs: { Point: { type: "object", properties: { x: { type: "number" } } } },
    })
    const props = out.properties as any
    expect(props.pt.description).toBe("a point")
    expect(props.pt.type).toBe("object")
    expect(hasRef(out)).toBe(false)
  })

  test("terminates on a recursive reference with no dangling $ref", () => {
    const out = inlineDefs({
      type: "object",
      properties: { root: { $ref: "#/$defs/Tree" } },
      $defs: {
        Tree: {
          type: "object",
          properties: { value: { type: "number" }, next: { $ref: "#/$defs/Tree" } },
        },
      },
    })
    expect(hasRef(out)).toBe(false)
    const props = out.properties as any
    // The non-recursive part survives; the recursive position collapsed to a permissive node.
    expect(props.root.properties.value).toEqual({ type: "number" })
    expect(props.root.properties.next).toEqual({})
  })

  test("drops an unresolvable $ref but keeps its siblings", () => {
    const out = inlineDefs({
      type: "object",
      properties: { x: { $ref: "#/$defs/Missing", description: "kept" } },
      $defs: { Point: { type: "object" } },
    })
    const props = out.properties as any
    expect(props.x.$ref).toBeUndefined()
    expect(props.x.description).toBe("kept")
  })

  test("leaves a schema with no $defs unchanged", () => {
    const input = { type: "object", properties: { x: { type: "number" } } }
    expect(inlineDefs(input)).toEqual(input)
  })
})

describe("tool schema projections", () => {
  test("moonshot strips $ref siblings and converts tuple arrays to a schema object", () => {
    expect(
      ToolSchemaProjection.moonshot({
        type: "object",
        properties: {
          linked: { $ref: "#/$defs/Linked", description: "drop me" },
          tuple: { type: "array", items: [{ type: "string" }, { type: "number" }] },
          prefixTuple: { type: "array", prefixItems: [{ type: "boolean" }, { type: "string" }] },
        },
      }),
    ).toEqual({
      type: "object",
      properties: {
        linked: { $ref: "#/$defs/Linked" },
        tuple: { type: "array", items: { anyOf: [{ type: "string" }, { type: "number" }] } },
        prefixTuple: { type: "array", items: { anyOf: [{ type: "boolean" }, { type: "string" }] } },
      },
    })
  })

  test("gemini handles numeric enums, dangling required fields, untyped arrays, and scalar object keys", () => {
    expect(
      ToolSchemaProjection.gemini({
        type: "object",
        required: ["status", "missing"],
        properties: {
          status: { type: "integer", enum: [1, 2] },
          tags: { type: "array" },
          name: { type: "string", properties: { ignored: { type: "string" } }, required: ["ignored"] },
        },
      }),
    ).toEqual({
      type: "object",
      required: ["status"],
      properties: {
        status: { type: "string", enum: ["1", "2"] },
        tags: { type: "array", items: { type: "string" } },
        name: { type: "string" },
      },
    })
  })

  test("openai keeps one flat object top-level schema", () => {
    expect(
      ToolSchemaProjection.openAI({
        anyOf: [
          {
            type: "object",
            properties: {
              path: { type: "string" },
              maybe: { anyOf: [{ type: "string" }, { type: "null" }] },
            },
          },
          { type: "object", properties: { resource: { type: "string" } } },
        ],
      }),
    ).toEqual({
      type: "object",
      properties: {
        path: { type: "string" },
        maybe: { type: "string" },
        resource: { type: "string" },
      },
      additionalProperties: false,
    })
  })

  it.effect("applies model compatibility before protocol projection", () =>
    Effect.gen(function* () {
      const model = OpenAIChat.route
        .with({ endpoint: { baseURL: "https://api.openai.test/v1/" }, auth: Auth.bearer("test") })
        .model({ id: "kimi-k2", compatibility: { toolSchema: "moonshot" } })
      const prepared = yield* LLMClient.prepare<OpenAIChat.OpenAIChatBody>(
        LLM.request({
          model,
          prompt: "Use the tool.",
          tools: [
            {
              name: "lookup",
              description: "Lookup data.",
              inputSchema: {
                type: "object",
                anyOf: [
                  {
                    type: "object",
                    properties: {
                      tuple: { type: "array", items: [{ type: "string" }, { type: "number" }] },
                      linked: { $ref: "#/$defs/Linked", description: "drop me" },
                    },
                  },
                ],
              },
            },
          ],
        }),
      )

      expect(prepared.body.tools?.[0]?.function.parameters).toEqual({
        type: "object",
        properties: {
          tuple: { type: "array", items: { anyOf: [{ type: "string" }, { type: "number" }] } },
          linked: { $ref: "#/$defs/Linked" },
        },
        additionalProperties: false,
      })
    }),
  )
})
