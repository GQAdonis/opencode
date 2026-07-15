# model-persistence

## ADDED Requirements

### Requirement: A persisted model selection survives across turns and agent switches

The app SHALL persist exactly the model the user selected, and SHALL NOT silently revert it —
including for custom / OpenAI-compatible providers whose model lists are not fully enumerated,
and including across agent switches.

#### Scenario: A custom-provider model is not reverted

- **GIVEN** a connected custom / OpenAI-compatible provider
- **AND** the user selects a model whose id is not enumerated in `provider.models`
- **WHEN** the selection is persisted and read back on a later turn
- **THEN** the model SHALL remain the user's selection
- **AND** it SHALL NOT revert to the default

#### Scenario: Switching agents preserves the user's model

- **GIVEN** the user has explicitly selected a model
- **WHEN** the user switches to an agent that configures a different model
- **THEN** the user's selected model SHALL be kept
- **AND** the agent's configured model SHALL be used only when the user has selected none

#### Scenario: snapshot persists the raw selection

- **WHEN** the current selection is snapshotted for persistence
- **THEN** it SHALL record the raw selected model and variant
- **AND** it SHALL NOT depend on the model resolving cleanly through `current()`

### Requirement: Session restore does not clobber the selection under async storage

When the persisted store loads asynchronously (as with the Tauri desktop host), session
restore SHALL NOT overwrite a not-yet-loaded selection with the last message's model.

#### Scenario: A restore arriving before the store is ready is deferred

- **GIVEN** a desktop host whose persisted store loads asynchronously
- **AND** a restore message arrives before the store has finished loading
- **WHEN** restore runs
- **THEN** it SHALL queue the restore rather than write immediately
- **AND** once the store is ready it SHALL apply the queued restore only if the user has no
  existing selection for that session
