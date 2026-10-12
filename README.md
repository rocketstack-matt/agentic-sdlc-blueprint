# agentic-sdlc-blueprint

**Governing the agentic SDLC: the controls as data on the architecture, a gate that says no by default, and a human
who keeps the only key.**

Companion to the talk *Governing the Agentic SDLC: Driving Agentic Development with FINOS CALM* (Open Source in
Finance Forum, New York, 4 November 2026; Matthew Bain and Aaron Searle). The talk follows one control from the
[FINOS SDLC Common Controls Catalog](https://finos.github.io/sdlc-common-controls/), SDLC-PREV-001 Code Review,
from the catalog's own record to a merge gateway that enforces it when an AI agent writes the code and an AI agent
reviews the pull request. This repository is everything the second half of the talk shows, runnable with Node and
git. The slides are in [`slides/`](slides/) and published at
[rocketstack-matt.github.io/agentic-sdlc-blueprint/slides](https://rocketstack-matt.github.io/agentic-sdlc-blueprint/slides/).

Built on two FINOS projects: the catalog says what the controls are, and [FINOS CALM](https://calm.finos.org)
makes them checkable by holding the architecture, and the controls on it, as data. The agent's own guardrails
follow two mitigations from the [FINOS AI Governance Framework](https://air-governance-framework.finos.org); see
[`agent/GUARDRAILS.md`](agent/GUARDRAILS.md).

> **Status.** A teaching blueprint, not a product.

## The question, and the answer

A pull request opened by a coding agent, approved by a review agent, every check green, merged. Which of your
controls did it pass? Code review was one, and the author and the reviewer were the same model under two names.
The control kept its name; what it controlled has changed.

The answer here is not to make the agent read the policy. It is to make the gate refuse. Four things, and nothing
else:

| | What it is | Where |
| --- | --- | --- |
| **The model** | The system in CALM, with the catalog's controls attached to the parts they govern, as data | [`architecture/`](architecture/) |
| **The policy** | The controls carry their policy as ergo requirements in the model; one generic module evaluates them | [`gates/policy/`](gates/policy/) |
| **The gate** | The merge gateway and `gates/check.mjs` | [`gateway/`](gateway/), [`gates/`](gates/) |
| **The evidence** | Every decision as CALM control-evaluation decorators, on CALM Hub; the CI evidence bundle | [`gateway/`](gateway/), `evidence/out/` |

The agent is deliberately not one of the four. The best agent and the worst agent meet the same gate.

## Run it

Needs Node 22+ and git. No API key, no cloud account, no containers.

**Fork first.** This repository is a template you take away, not a project you send changes to. Fork it, clone
your fork, and raise pull requests against your fork; the workflow in `.github/workflows/governed-sdlc.yml` runs
there, on your changes, and writes your evidence.

```sh
git clone https://github.com/<you>/agentic-sdlc-blueprint && cd agentic-sdlc-blueprint
npm install && npm test && npm run gates        # the gates on a clean tree: ADMISSIBLE

bash gateway/run-demo.sh                        # the demo the talk shows, every verdict checked
CALM_HUB_URL=http://localhost:8080 bash gateway/run-demo.sh   # the same, published to a local CALM Hub
```

What the demo shows, one idea per moment; the gateway's [README](gateway/README.md) has each command:

1. **A routine change.** The author agent reviews its own change: **DENY**, in the catalog's words. The approved
   review bot reviews it: **ALLOW**, and `main` moves.
2. **The Client Ledger.** A change to `position-service`, which connects to the ledger: **DENY** until a human
   approves. The approval renders the real diff from the repository. Changing one line after approval kills the
   approval.
3. **The shortcut.** The agent makes trade-api read the ledger's file directly: **DENY**, that connection is not in
   the architecture.
4. **The architect's change.** The architect adds `trade-api -> client-ledger` to the model: a change no node owns,
   so it needs a human too. On merge the new architecture is published as the next version. The same kind of
   trade-api change that merged in moment 1 is now denied: the diagram changed, so the control followed.

To see the pipeline run on your own changes, enable Actions on your fork (GitHub disables workflows on forks until
you do) and open a pull request there.

## What enforces what

`gates/check.mjs` runs on every change in CI (`npm run gates`): it validates the model, runs the tests and evaluates
every control's ergo requirements that apply in the pipeline. The merge gateway evaluates the same requirements, with
the same evaluator, at stage `merge`, where the review and any approval are known.

| Catalog id | Control | Attached in CALM to | Enforced by |
| --- | --- | --- | --- |
| SDLC-PREV-001 | Code Review | system | `code-review` (an approved reviewer who is not the author) and `control-plane-human-approval` (a change to a file no node owns, other than documentation and tests, needs a human approval bound to the commit and the diff); the merge gateway |
| SDLC-PREV-001 | Client Ledger human approval | `client-ledger` node | `client-ledger-human-approval` (a change to any service that connects to the Client Ledger needs a human approval bound to the commit and the diff); the merge gateway |
| SDLC-PREV-004 | Requirements Repository | system | `change-names-approved-spec` and `requirements-scope` (a change names an approved spec in `specs/` and touches only the nodes it declares); CI and the merge gateway |
| SDLC-PREV-017 | Service Dependency Control | system | `service-dependency` (every connection the code makes is a connection in the architecture); CI and the merge gateway |
| SDLC-PREV-012 | Deployment Gating | system | `gates/check.mjs` runs the gates the model names; any failure blocks |
| SDLC-PREV-014 | Test Evidence Retention | system | `evidence/out/gates.json`; the merge gateway's control-evaluation decorators |
| SDLC-PREV-007, -009, -010 | Dependency scanning, SBOM, secret detection | n/a | `.github/workflows/governed-sdlc.yml` |

Risks in view: SDLC-OP-007 Configuration Drift, SDLC-SEC-008 Unauthorised Change, SDLC-RC-005 Audit and Compliance
Evidence Failure.

## Layout

```
architecture/   the CALM 1.2 model, the pattern that enforces the controls, the node and interface Standards, copies of the catalog's control requirement documents and their Standard from CALM Hub, URL mapping for offline validation
gateway/        the merge gateway, its demo, the decorator Standard copy
gates/          gates/check.mjs, gates/lib (facts and the evaluator), gates/policy (ergo, the generic entrypoint, the built module)
specs/          version-controlled requirements, pinned to CALM nodes
services/       two tiny Node/TypeScript services (no framework, no database server)
agent/          CALM context for agents: shared logic, a CLI, a read-only MCP server, the agent guardrails
slides/         the talk deck, with the scripts that keep its screens real
docs/           candidate controls to take back to the catalog, and two recorded live agent runs
tools/          the generator that turns the catalog's source into its CALM Hub control domain and Standard
AGENTS.md       the instructions any coding agent gets
```

## Honest limitations

- The approval ceremony is mocked. A terminal prompt where the approver types a binding code stands in for a
  passkey on a device the agent runtime cannot reach. In a bank the standards are there: CIBA for the out-of-band
  request, WebAuthn for the person, RFC 9396 for binding the token to the exact action.
- CI reads the policy module and the evaluator from the change itself; the gateway reads them from its own checkout.
  In a bank both come from a protected source, not the change.
- Agent identity is a string in a signed record. In a bank it is a platform-issued workload identity, and the
  approved reviewer is recorded as the control's approved tool identity.
- The service dependency control finds connections with a convention-based scanner (env bindings and cross-node
  imports), not a general solution. Real estates need richer signals: IaC, service mesh config, OpenAPI clients,
  runtime traces.
- Evidence is written to disk, a CI artefact and, when `CALM_HUB_URL` is set, CALM Hub. Immutability and retention
  are yours to provide. The decorators are validated against the control-evaluation decorator Standard; the CI
  evidence bundle is hashed JSON, not a CALM document.
- The pattern requires the system-level controls, pins each to its catalog document, fixes the parameters the gates
  read, and requires an ergo policy on any control attached to a node. It cannot know which node should carry a
  control; the human approval control sits on `client-ledger` because that is where the risk is. That stays a
  modelling decision.

## Contributing

Your own work belongs in your fork. Issues and pull requests here are for the blueprint itself: a verdict the
gateway gets wrong, a gate that misses something, a control mapped to the wrong catalog entry. The gateway's demo
replays every decision the talk shows and must stay green on `main`. Licensed under Apache 2.0. If a control here
looks wrong, the better fix is usually upstream in the [catalog](https://github.com/finos/sdlc-common-controls).
