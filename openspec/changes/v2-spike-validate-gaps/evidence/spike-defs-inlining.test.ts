// SPIKE (KBD change-001, Q3) — throwaway evidence, not production code.
//
// Question: on v2, does a tool schema containing $defs/$ref survive the
// openai-compatible lowering path with its $ref intact? If so, backends that
// reject unresolved $ref (DeepSeek via Fireworks, MiniMax, ...) still break —
// the same bug our v1 fork patched in provider/transform.ts.
//
// Path under test (v2):
//   llm/src/tool.ts:232-236   toJsonSchema -> attaches $defs when definitions exist
//   llm/src/protocols/openai-chat.ts:178-185  lowerTool -> ToolSchemaProjection.openAI
//   llm/src/protocols/openai-compatible-chat.ts:17-23  reuses OpenAIChat.protocol verbatim
import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { ToolSchemaProjection } from "../src/protocols/utils/tool-schema"

// Mirror of llm/src/tool.ts:232-236 (not exported, so reproduced verbatim).
const toJsonSchema = (schema: Schema.Top) => {
  const document = Schema.toJsonSchemaDocument(schema)
  if (Object.keys(document.definitions).length === 0) return document.schema
  return { ...document.schema, $defs: document.definitions } as Record<string, unknown>
}

// A reused, identified sub-struct is what makes Effect emit `definitions`
// (i.e. $defs + $ref) rather than inlining.
const Point = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
}).annotate({ identifier: "Point" })

const ToolInput = Schema.Struct({
  origin: Point,
  target: Point,
})

describe("SPIKE Q3: $defs survival through the openai-compatible path", () => {
  test("v2 tool schema generation emits $defs/$ref for a reused struct", () => {
    const schema = toJsonSchema(ToolInput)
    console.log("GENERATED:", JSON.stringify(schema, null, 2))

    // Precondition: v2 really does emit $defs.
    expect(schema.$defs).toBeDefined()
    expect(JSON.stringify(schema)).toContain("$ref")
  })

  test("ToolSchemaProjection.openAI does NOT inline $defs/$ref", () => {
    const generated = toJsonSchema(ToolInput)
    const projected = ToolSchemaProjection.openAI(generated as never)
    console.log("PROJECTED:", JSON.stringify(projected, null, 2))

    const serialized = JSON.stringify(projected)

    // THE BUG: if these hold, an unresolved $ref reaches the provider wire.
    expect(projected.$defs).toBeDefined()
    expect(serialized).toContain("$ref")

    // What a correct inlining pass WOULD produce (documented, expected to fail today):
    // expect(projected.$defs).toBeUndefined()
    // expect(serialized).not.toContain("$ref")
  })
})
