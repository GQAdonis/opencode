import type { JsonSchema, ModelToolSchemaCompatibility } from "../../schema"
import { isRecord } from "../../utils/record"
import { GeminiToolSchema } from "./gemini-tool-schema"

const refName = (ref: string): string | undefined => {
  const match = /^#\/(?:\$defs|definitions)\/(.+)$/.exec(ref)
  return match ? decodeURIComponent(match[1]) : undefined
}

// Inline every internal `$ref` against the schema's own `$defs`/`definitions`, then drop those
// containers. v2 emits `$defs` for any reused struct (llm/tool.ts), and the OpenAI wire format
// does not resolve references — OpenAI strict mode rejects bare `$defs`, and OpenAI-compatible
// backends (DeepSeek, MiniMax) reject an unresolved `$ref` outright. Every OpenAI-family request
// goes through `openAI`, so inlining here makes the projected schema self-contained.
//
// Pure and exported for testing. Handles refs at any depth, preserves sibling keys on a $ref
// node (e.g. `description`), guards cycles (a self-referential schema cannot be inlined into
// finite JSON, so the recursive position collapses to a permissive `{}`), and drops any ref it
// cannot resolve rather than leaving a dangling pointer.
export const inlineDefs = (schema: JsonSchema): JsonSchema => {
  const defs: Record<string, unknown> = {
    ...(isRecord(schema.definitions) ? schema.definitions : {}),
    ...(isRecord(schema.$defs) ? schema.$defs : {}),
  }
  if (Object.keys(defs).length === 0) return schema

  const walk = (value: unknown, expanding: ReadonlySet<string>): unknown => {
    if (Array.isArray(value)) return value.map((item) => walk(item, expanding))
    if (!isRecord(value)) return value

    if (typeof value.$ref === "string") {
      const { $ref, ...siblings } = value
      const name = refName($ref)
      const target = name !== undefined ? defs[name] : undefined
      // Unknown/external ref, or a cycle we are already expanding: drop the pointer, keep
      // siblings. For a cycle this yields a permissive node instead of infinite recursion.
      if (target === undefined || (name !== undefined && expanding.has(name))) {
        return walk(siblings, expanding)
      }
      const resolved = walk(target, name !== undefined ? new Set(expanding).add(name) : expanding)
      // Merge siblings over the resolved target so keys like `description` survive inlining.
      const merged = walk(siblings, expanding)
      return isRecord(resolved) && isRecord(merged) ? { ...resolved, ...merged } : resolved
    }

    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walk(item, expanding)]))
  }

  const inlined = walk(schema, new Set<string>())
  if (!isRecord(inlined)) return schema
  const { $defs: _defs, definitions: _definitions, ...rest } = inlined
  return rest as JsonSchema
}

const removeNullSchemas = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(removeNullSchemas)
  if (!isRecord(value)) return value
  const fields = Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "anyOf")
      .map(([key, field]) => [key, removeNullSchemas(field)]),
  )
  if (!Array.isArray(value.anyOf)) return fields
  const variants = value.anyOf.filter((variant) => !isRecord(variant) || variant.type !== "null").map(removeNullSchemas)
  if (variants.length === 1 && isRecord(variants[0])) return { ...fields, ...variants[0] }
  return { ...fields, anyOf: variants }
}

const tupleItemsSchema = (items: ReadonlyArray<unknown>) => {
  const projected = items.map(moonshotNode)
  if (projected.length === 0) return {}
  if (projected.length === 1) return projected[0]
  return { anyOf: projected }
}

const moonshotNode = (schema: unknown): unknown => {
  if (Array.isArray(schema)) return schema.map(moonshotNode)
  if (!isRecord(schema)) return schema
  if (typeof schema.$ref === "string") return { $ref: schema.$ref }
  return Object.fromEntries(
    Object.entries(schema).flatMap(([key, value]) => {
      if (key === "items" && Array.isArray(value)) return [[key, tupleItemsSchema(value)]]
      if (key === "prefixItems") {
        if ("items" in schema) return []
        return [["items", tupleItemsSchema(Array.isArray(value) ? value : [])]]
      }
      if (key === "unevaluatedItems") return []
      return [[key, moonshotNode(value)]]
    }),
  )
}

const moonshot = (schema: JsonSchema): JsonSchema => {
  const projected = moonshotNode(schema)
  return isRecord(projected) ? projected : {}
}

const openAI = (input: JsonSchema): JsonSchema => {
  // Resolve `$ref`/`$defs` first: the OpenAI wire format does not resolve references, and
  // OpenAI-compatible backends reject an unresolved `$ref`.
  const schema = inlineDefs(input)
  const variants = Array.isArray(schema.anyOf) ? schema.anyOf.filter(isRecord) : []
  const flattened =
    variants.length === 0
      ? { ...schema, type: "object" }
      : {
          ...Object.fromEntries(Object.entries(schema).filter(([key]) => key !== "anyOf")),
          type: "object",
          properties: variants.reduce(
            (properties, variant) => ({ ...(isRecord(variant.properties) ? variant.properties : {}), ...properties }),
            {},
          ),
          additionalProperties: false,
        }
  const normalized = removeNullSchemas(flattened)
  return isRecord(normalized) ? normalized : { type: "object" }
}

const gemini = (schema: JsonSchema): JsonSchema => GeminiToolSchema.convert(schema) ?? {}

const modelCompatibility = (
  schema: JsonSchema,
  compatibility: ModelToolSchemaCompatibility | undefined,
): JsonSchema => {
  if (compatibility === undefined) return schema
  switch (compatibility) {
    case "gemini":
      return gemini(schema)
    case "moonshot":
      return moonshot(schema)
  }
}

export const ToolSchemaProjection = {
  gemini,
  modelCompatibility,
  moonshot,
  openAI,
} as const
