# plugin-session-hook

## ADDED Requirements

### Requirement: Plugins can shape the request before dispatch

A plugin SHALL be able to register a `session.hook("request", ...)` callback that runs on every
model request before it is dispatched, receiving the session id, the acting agent, a read-only
conversation view, and a **mutable** system prompt.

#### Scenario: A plugin rewrites the system prompt

- **GIVEN** a plugin that registers `ctx.session.hook("request", cb)`
- **AND** `cb` rewrites an entry of `event.system`
- **WHEN** the runner assembles a model request
- **THEN** the hook SHALL run before dispatch
- **AND** the dispatched request's system prompt SHALL reflect the plugin's rewrite

#### Scenario: The event carries conversation context

- **GIVEN** a session with prior user messages
- **WHEN** the request hook fires
- **THEN** `event.messages` SHALL contain a `{ role, text }` entry per message
- **AND** `event.sessionID` and `event.agent` SHALL be populated

#### Scenario: Multiple hooks run in registration order

- **GIVEN** two registered request hooks
- **WHEN** a request is assembled
- **THEN** both SHALL run in registration order
- **AND** the second SHALL observe the first's mutation to `event.system`
