import { describe, expect, test } from "bun:test"
import { parseBlock, rank, renderBlock, rewriteSystemPart, select, type Skill } from "../src/skill-ranking-core"

const skill = (id: string, name: string, description: string): Skill => ({ id, name, description })

const SKILLS: Skill[] = [
  skill("postgres-helper", "Postgres Helper", "PostgreSQL queries and migration optimization"),
  skill("seo-audit", "SEO Audit", "search rankings and page optimization"),
  skill("release-notes", "Release Notes", "create changelogs and release notes"),
]

// The exact block the core renderer emits (packages/core/src/skill/guidance.ts), so parse/render
// fidelity is tested against reality, not a guess.
const coreBlock = (skills: Skill[]) =>
  [
    "Skills provide specialized instructions and workflows for specific tasks.",
    "Use the skill tool to load a skill when a task matches its description.",
    "<available_skills>",
    ...skills.flatMap((s) => [
      "  <skill>",
      `    <id>${s.id}</id>`,
      `    <name>${s.name}</name>`,
      `    <description>${s.description}</description>`,
      "  </skill>",
    ]),
    "</available_skills>",
  ].join("\n")

describe("ranking core", () => {
  test("relevant skills rank first", () => {
    const ranked = rank(SKILLS, "help me write a postgres migration")
    expect(ranked[0].id).toBe("postgres-helper")
    expect(ranked.map((s) => s.id)).toContain("seo-audit")
  })

  test("ranking is deterministic and cache-stable", () => {
    const a = rank(SKILLS, "postgres migration").map((s) => s.id)
    const b = rank(SKILLS, "postgres migration").map((s) => s.id)
    expect(a).toEqual(b)
  })

  test("empty query falls back to alphabetical-by-id", () => {
    const ranked = rank(SKILLS, "")
    expect(ranked.map((s) => s.id)).toEqual(["postgres-helper", "release-notes", "seo-audit"])
  })

  test("name matches outweigh description matches", () => {
    const items = [
      skill("a-desc", "Alpha", "something about postgres in the description"),
      skill("b-name", "Postgres Tool", "unrelated text"),
    ]
    // "postgres" hits b-name's NAME (weight 2) vs a-desc's DESCRIPTION (weight 1).
    expect(rank(items, "postgres")[0].id).toBe("b-name")
  })
})

describe("select (filter + rank + cap)", () => {
  test("drops already-loaded skills", () => {
    const out = select(SKILLS, "postgres", new Set(["postgres-helper"]))
    expect(out.map((s) => s.id)).not.toContain("postgres-helper")
    expect(out.map((s) => s.id)).toContain("seo-audit")
  })

  test("caps to maxShown, keeping the highest-ranked", () => {
    const out = select(SKILLS, "postgres migration", new Set(), 1)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe("postgres-helper")
  })

  test("maxShown of 0 yields an empty list", () => {
    expect(select(SKILLS, "postgres", new Set(), 0)).toEqual([])
  })
})

describe("block parse/render", () => {
  test("parses the core block format", () => {
    const parsed = parseBlock(coreBlock(SKILLS))
    expect(parsed).toBeDefined()
    expect(parsed!.map((s) => s.id)).toEqual(["postgres-helper", "seo-audit", "release-notes"])
    expect(parsed![0].description).toBe("PostgreSQL queries and migration optimization")
  })

  test("render is byte-faithful to the core block skill entries", () => {
    // A block rendered from the same skills, in the same order, must match the core's inner block.
    const rendered = renderBlock(SKILLS)
    const coreInner = coreBlock(SKILLS).slice(
      coreBlock(SKILLS).indexOf("<available_skills>"),
    )
    expect(rendered).toBe(coreInner)
  })

  test("returns undefined when there is no block", () => {
    expect(parseBlock("just some system prose, no skills here")).toBeUndefined()
  })
})

describe("rewriteSystemPart", () => {
  test("reorders the block in place, preserving surrounding prose", () => {
    const input = coreBlock(SKILLS)
    const out = rewriteSystemPart(input, "postgres migration", new Set())
    // Prose preserved.
    expect(out.startsWith("Skills provide specialized instructions")).toBe(true)
    // Block reordered: postgres first.
    const ids = parseBlock(out)!.map((s) => s.id)
    expect(ids[0]).toBe("postgres-helper")
  })

  test("is idempotent for identical inputs (cache-stable)", () => {
    const input = coreBlock(SKILLS)
    const once = rewriteSystemPart(input, "postgres", new Set())
    const twice = rewriteSystemPart(once, "postgres", new Set())
    expect(twice).toBe(once)
  })

  test("filters loaded skills out of the rewritten block", () => {
    const out = rewriteSystemPart(coreBlock(SKILLS), "postgres", new Set(["postgres-helper"]))
    expect(parseBlock(out)!.map((s) => s.id)).not.toContain("postgres-helper")
  })

  test("leaves a part with no block untouched", () => {
    const part = "System prompt with no skills block."
    expect(rewriteSystemPart(part, "postgres", new Set())).toBe(part)
  })
})
