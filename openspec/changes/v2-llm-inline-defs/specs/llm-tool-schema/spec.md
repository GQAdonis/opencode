# llm-tool-schema

## ADDED Requirements

### Requirement: The OpenAI tool-schema projection emits no unresolved references

The OpenAI tool-schema projection SHALL inline all internal schema definitions so the
projected schema contains no `$defs`/`definitions` container and no `#/$defs`/`#/definitions`
`$ref`. Providers behind OpenAI-compatible endpoints that do not resolve JSON-Schema
references (e.g. DeepSeek, MiniMax) SHALL therefore receive a self-contained schema.

#### Scenario: A reused struct is inlined

- **GIVEN** a tool schema with a `$defs` entry referenced from two properties via `$ref`
- **WHEN** it is projected through the OpenAI projection
- **THEN** each `$ref` SHALL be replaced by the referenced definition
- **AND** the projected schema SHALL contain no `$defs` container and no `$ref`

#### Scenario: A reference's sibling keys are preserved

- **GIVEN** a `$ref` node that also carries a `description`
- **WHEN** it is inlined
- **THEN** the resolved definition SHALL be present
- **AND** the `description` SHALL be preserved

#### Scenario: A recursive reference does not loop

- **GIVEN** a schema whose definition references itself
- **WHEN** it is projected
- **THEN** projection SHALL terminate
- **AND** the projected schema SHALL contain no dangling `$ref`

#### Scenario: An unresolvable reference is not left dangling

- **GIVEN** a `$ref` whose target is not present in `$defs`/`definitions`
- **WHEN** it is inlined
- **THEN** the dangling `$ref` SHALL be removed
- **AND** any sibling keys on that node SHALL be preserved
