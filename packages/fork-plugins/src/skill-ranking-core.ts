// Pure, dependency-free ranking core. Kept separate from the plugin wiring so it is trivially
// unit-testable. Everything here is deterministic: identical input produces byte-identical
// output, which is what keeps the rewritten system prompt cache-stable across steps.

export interface Skill {
  readonly id: string
  readonly name: string
  readonly description: string
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are", "be",
  "this", "that", "it", "as", "at", "by", "from", "use", "using", "used",
])

/** Lowercase alphanumeric terms, stopwords and 1-char tokens dropped. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 1 && !STOPWORDS.has(term))
}

/**
 * Relevance of a skill to the query terms. A name match weighs more than a description match.
 * Distinct query terms only (so a repeated word does not dominate), giving a stable small-integer
 * score. Zero when nothing overlaps.
 */
export function score(skill: Skill, queryTerms: ReadonlySet<string>): number {
  if (queryTerms.size === 0) return 0
  const nameTerms = new Set(tokenize(skill.name))
  const descTerms = new Set(tokenize(skill.description))
  let total = 0
  for (const term of queryTerms) {
    if (nameTerms.has(term)) total += 2
    else if (descTerms.has(term)) total += 1
  }
  return total
}

/**
 * Deterministic ranking: by score descending, then id ascending as a stable tie-break. With an
 * empty query every score is 0, so this collapses to alphabetical-by-id — matching the core
 * renderer's default order.
 */
export function rank(skills: ReadonlyArray<Skill>, query: string): Skill[] {
  const queryTerms = new Set(tokenize(query))
  return [...skills].sort((a, b) => {
    const diff = score(b, queryTerms) - score(a, queryTerms)
    return diff !== 0 ? diff : a.id.localeCompare(b.id)
  })
}

/**
 * Select the skills to advertise: drop already-loaded ones, rank by relevance, cap to `maxShown`
 * when provided. Pure — the loaded set and options are passed in.
 */
export function select(
  skills: ReadonlyArray<Skill>,
  query: string,
  loaded: ReadonlySet<string>,
  maxShown?: number,
): Skill[] {
  const fresh = skills.filter((skill) => !loaded.has(skill.id))
  const ranked = rank(fresh, query)
  return typeof maxShown === "number" && maxShown >= 0 ? ranked.slice(0, maxShown) : ranked
}

const BLOCK_OPEN = "<available_skills>"
const BLOCK_CLOSE = "</available_skills>"

/** Extract skills from a `<available_skills>` block. Returns undefined if the block is absent. */
export function parseBlock(system: string): Skill[] | undefined {
  const start = system.indexOf(BLOCK_OPEN)
  const end = system.indexOf(BLOCK_CLOSE)
  if (start === -1 || end === -1 || end < start) return undefined
  const inner = system.slice(start + BLOCK_OPEN.length, end)
  const skills: Skill[] = []
  const re = /<skill>\s*<id>([\s\S]*?)<\/id>\s*<name>([\s\S]*?)<\/name>\s*<description>([\s\S]*?)<\/description>\s*<\/skill>/g
  let match: RegExpExecArray | null
  while ((match = re.exec(inner)) !== null) {
    skills.push({ id: match[1].trim(), name: match[2].trim(), description: match[3].trim() })
  }
  return skills
}

/** Render skills into the exact `<available_skills>` shape the core renderer emits. */
export function renderBlock(skills: ReadonlyArray<Skill>): string {
  const entries = skills.flatMap((skill) => [
    "  <skill>",
    `    <id>${skill.id}</id>`,
    `    <name>${skill.name}</name>`,
    `    <description>${skill.description}</description>`,
    "  </skill>",
  ])
  return [BLOCK_OPEN, ...entries, BLOCK_CLOSE].join("\n")
}

/**
 * Rewrite a system part's `<available_skills>` block in place: parse → select → re-render,
 * replacing only the block and leaving surrounding prose untouched. Returns the original string
 * unchanged when there is no block. Deterministic.
 */
export function rewriteSystemPart(
  systemPart: string,
  query: string,
  loaded: ReadonlySet<string>,
  maxShown?: number,
): string {
  const skills = parseBlock(systemPart)
  if (skills === undefined) return systemPart
  const selected = select(skills, query, loaded, maxShown)
  const start = systemPart.indexOf(BLOCK_OPEN)
  const end = systemPart.indexOf(BLOCK_CLOSE) + BLOCK_CLOSE.length
  return systemPart.slice(0, start) + renderBlock(selected) + systemPart.slice(end)
}
