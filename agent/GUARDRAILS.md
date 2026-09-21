# Governing the agent itself

The SDLC Common Controls Catalog governs the **change**. The FINOS AI Governance Framework (AIGF) governs the
**agent** that made it. CALM is what both of them point at. This file records which AIGF mitigations this
blueprint applies and where. It is intentionally short: two mitigations, fully wired, rather than twenty in prose.

| AIGF mitigation | How this repo applies it | Where |
| --- | --- | --- |
| [AIR-PREV-018 Agent Authority Least Privilege Framework](https://air-governance-framework.finos.org/mitigations/mi-18_agent-authority-least-privilege-framework.html) | The MCP server is read-only: it can describe the architecture and run gates, it cannot change the model, the gates or the pipeline. Scope is narrowed per task: a spec names the CALM nodes the agent may touch and `spec-check` enforces it. | `agent/mcp/`, `gates/spec-check.mjs` |
| [AIR-PREV-019 Tool Chain Validation and Sanitization](https://air-governance-framework.finos.org/mitigations/mi-19_tool-chain-validation-and-sanitization.html) | The agent reaches the model and the gates only through fixed tools whose parameters select from the model (a spec id, a node id, a repo path) and are never executed. The tools run fixed commands; the agent supplies no command text. | `agent/mcp/`, `agent/context.mjs` |

The gates are not an AIGF mitigation. AIR-PREV-019 as written covers validating tool selection and tool parameters;
it does not say that an agent's code output must be checked by deterministic controls it cannot alter. That practice
comes from the SDLC catalog: SDLC-PREV-012 gating, with changes to `gates/` routed to human review by SDLC-PREV-001.

## What is deliberately left to your platform

- **Agent identity.** `evidence.mjs` records `CHANGE_AUTHOR_KIND` and `CHANGE_AUTHOR_ID`. In a bank these come from
  the platform (a signed commit by a registered agent identity), not from an environment variable.
- **Cognitive review engine.** When the router says `cognitive`, the reviewing engine must be approved and must not be
  the authoring agent. This repo emits the decision. It does not ship a reviewer.
- **Sandboxing and network egress** for the agent runtime.
