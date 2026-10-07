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
| **The policy** | Deny by default. Its data is the model, so the code review control's config is what it reads | [`gateway/policy/`](gateway/policy/) |
| **The gate** | A merge gateway: nothing reaches `main` without a yes | [`gateway/`](gateway/) |
| **The evidence** | Every decision logged with the hashes of the change, the model and the policy it was decided with | `gateway/decisions.ndjson`, [`gates/evidence.mjs`](gates/evidence.mjs) |

The agent is deliberately not one of the four. The best agent and the worst agent meet the same gate.

## Run it

Needs Node 22+ and git. No API key, no cloud account, no containers.

**Fork first.** This repository is a template you take away, not a project you send changes to. Fork it, clone
your fork, and raise pull requests against your fork; the workflow in `.github/workflows/governed-sdlc.yml` runs
there, on your changes, and writes your evidence.

```sh
git clone https://github.com/<you>/agentic-sdlc-blueprint && cd agentic-sdlc-blueprint
npm install && npm test && npm run gates        # the six checks on a clean tree: ADMISSIBLE

cd gateway && npm install
bash run-demo.sh                                # the talk's second half, every verdict checked
```

What the demo shows, one idea per step; the gateway's [README](gateway/README.md) has each command:

1. The author agent reviews its own change. **DENY**: "author may not review its own change", the catalog's own
   requirement, read from the model, not written into the gate.
2. The approved review engine reviews a tier 2 change. **ALLOW**: tier by risk, no human needed.
3. A change to a tier 1 service. **DENY**: human approval required. The agent can ask for one. It cannot mint one.
4. The approval service renders the real diff from the repository, never the agent's summary of it, and mints a
   token bound to the commit and the hash of the diff: single use, ten minutes.
5. The agent amends one line and presents the same token. **DENY**: bound to a different diff. The same token
   twice: **DENY**, already used.
6. The approved change. **ALLOW**, and the decision log line is the evidence: who reviewed, who approved, and the
   hashes of the change, the model and the policy.

To see the pipeline run on your own changes, enable Actions on your fork (GitHub disables workflows on forks until
you do) and open a pull request there.

## What enforces what

The six gates in [`gates/`](gates/) run on every change in CI (`npm run gates`) and are the checks a pipeline
feeds a gateway. Today the gateway and the gates run side by side.

| Catalog id | Control | Attached in CALM to | Enforced by |
| --- | --- | --- | --- |
| SDLC-PREV-001 | Code Review | system | the gateway's policy (the author may not review, approved review engines, a human approval bound to the change for tier 1 and control plane changes); `gates/review-router.mjs` picks the review mode from the same control |
| SDLC-PREV-004 | Requirements Repository | system | the policy's spec scope check; `gates/spec-check.mjs`; `specs/` |
| SDLC-PREV-012 | Deployment Gating | system | `gates/run-all.mjs` (the blocking gate list lives in the model) |
| SDLC-PREV-014 | Test Evidence Retention | system | `gates/evidence.mjs`; the gateway's decision log |
| SDLC-PREV-016 | Test Execution and Sign-Off | n/a | the `tests` gate |
| SDLC-PREV-017 | Service Dependency Control | `position-store` node | `gates/drift-check.mjs`, `gates/model-diff.mjs` (a model change must be declared by its spec) |
| SDLC-PREV-007, -009, -010 | Dependency scanning, SBOM, secret detection | n/a | `.github/workflows/governed-sdlc.yml` |

Risks in view: SDLC-OP-007 Configuration Drift, SDLC-SEC-008 Unauthorised Change, SDLC-RC-005 Audit and Compliance
Evidence Failure.

## Layout

```
architecture/   the CALM 1.2 model, the pattern that enforces the controls, the node and interface Standards, copies of the catalog's control requirement documents and their Standard from CALM Hub, URL mapping for offline validation
gateway/        the merge gateway: the policy (Rego, compiled to WebAssembly), the approval service, the decision log, the demo
gates/          dependency-free Node scripts: spec-check, drift-check, model-diff, review-router, run-all, evidence
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
- Two keys the policy needs on the code review control, the approved review engines and the shape of a human
  approval, are added in memory by the gateway until they are added to the model and required by the pattern.
- The gateway and the six gates run side by side; the gates' results are not yet an input to the policy.
- Agent identity is a string in a signed record. In a bank it is a platform-issued workload identity, and the
  review engine is recorded as the control's approved tool identity.
- `drift-check` is a convention-based scanner (env bindings and cross-node imports), not a general solution.
  Real estates need richer signals: IaC, service mesh config, OpenAPI clients, runtime traces.
- Evidence is written to disk and a CI artefact. Immutability and retention are yours to provide. The CALM evidence
  documents are not validated against the meta schema: the CLI validates architectures and patterns, not evidence.
- The pattern requires the system-level controls, pins each to its catalog document, fixes the parameters the gates
  read, and checks the config of any node that carries SDLC-PREV-017. It cannot know which node should carry that
  control; `position-store` does. That stays a modelling decision.

## Contributing

Your own work belongs in your fork. Issues and pull requests here are for the blueprint itself: a verdict the
gateway gets wrong, a gate that misses something, a control mapped to the wrong catalog entry. The gateway's demo
replays every decision the talk shows and must stay green on `main`. Licensed under Apache 2.0. If a control here
looks wrong, the better fix is usually upstream in the [catalog](https://github.com/finos/sdlc-common-controls).
