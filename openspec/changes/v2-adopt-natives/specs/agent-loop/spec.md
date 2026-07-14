# agent-loop

## ADDED Requirements

### Requirement: Agent loop iterations are bounded by default

The agent loop SHALL terminate after a bounded number of steps even when no agent
configures its own `steps` value. Without this bound the loop is unbounded: a model that
keeps emitting tool calls repeats forever.

The bound SHALL be applied without modifying `packages/core` — it is contributed by a
fork plugin through the `ctx.agent.transform` extension point.

#### Scenario: A runaway model is stopped at the cap

- **GIVEN** an agent with no `steps` configured
- **AND** the fork `agent-steps` plugin is registered with a cap of N
- **WHEN** a model emits a tool call on every step without ever finishing
- **THEN** the runner SHALL make exactly N model requests and stop
- **AND** on the final step the request SHALL carry `tools: []` and `toolChoice: "none"`
- **AND** a tool call emitted on the final step SHALL NOT execute, and SHALL be recorded
  with an error status

#### Scenario: An agent's own steps value is not overridden

- **GIVEN** an agent that explicitly configures `steps: 2`
- **AND** the fork `agent-steps` plugin is registered with a cap of 1000
- **WHEN** the agent runs
- **THEN** the agent's own value of 2 SHALL take effect, not the plugin's 1000

#### Scenario: The cap is contributed without core modification

- **GIVEN** the fork `v2` branch
- **WHEN** the working tree is diffed against `upstream/v2`
- **THEN** no file under `packages/core`, `packages/llm`, or `packages/schema` SHALL differ
