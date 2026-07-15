# skill-ranking

## ADDED Requirements

### Requirement: Advertised skills are ranked by conversation relevance

The plugin SHALL reorder the `<available_skills>` block so skills whose name/description are
more relevant to the conversation appear first, and the ranking SHALL be deterministic.

#### Scenario: Relevant skills rank first

- **GIVEN** an available set including a `postgres` skill and an unrelated `seo` skill
- **AND** a conversation mentioning "postgres migration"
- **WHEN** the request hook rewrites the block
- **THEN** the `postgres` skill SHALL appear before the `seo` skill

#### Scenario: Ranking is deterministic and cache-stable

- **GIVEN** the same conversation and the same available skills
- **WHEN** the block is ranked twice
- **THEN** the two outputs SHALL be byte-identical

#### Scenario: Empty conversation falls back to a stable order

- **GIVEN** no user text in the conversation
- **WHEN** the block is ranked
- **THEN** the skills SHALL be ordered deterministically (by id)

### Requirement: Already-loaded skills are not re-advertised

The plugin SHALL remove from the advertised block any skill already loaded this session, so a
loaded skill stops being re-suggested every turn.

#### Scenario: A loaded skill disappears from the block

- **GIVEN** the `skill` tool has loaded skill `postgres-helper` this session
- **WHEN** a later request's block is rewritten
- **THEN** `postgres-helper` SHALL NOT appear in `<available_skills>`
- **AND** other skills SHALL remain

### Requirement: The advertised list can be capped

When a `maxShown` option is configured, the block SHALL contain at most that many skills (the
highest-ranked ones).

#### Scenario: Top-K cap applied

- **GIVEN** five available skills and `maxShown = 2`
- **WHEN** the block is rewritten
- **THEN** exactly the two highest-ranked skills SHALL appear

### Requirement: The rewrite preserves the core block format

The rewritten block SHALL use the same structure the core renderer emits, changing only the
order and subset of skills.

#### Scenario: Format fidelity

- **WHEN** the block is rewritten
- **THEN** each skill SHALL be emitted as `<skill>` with `<id>`, `<name>`, `<description>`
  children, wrapped in `<available_skills>`, matching the core renderer
