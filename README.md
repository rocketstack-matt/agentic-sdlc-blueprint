# agentic-sdlc-blueprint

**Governing the agentic SDLC: model, spec, agent, gate, evidence.**

A small, real repository you can clone and work through in under an hour. It shows how three FINOS initiatives
compose into one operating model for AI-assisted delivery in a regulated firm:

| Initiative | Role here |
| --- | --- |
| [FINOS CALM](https://calm.finos.org) (architecture as code) | The machine-readable model that gives an agent its context and gives the pipeline something to check against |
| [FINOS SDLC Common Controls Catalog](https://finos.github.io/sdlc-common-controls/) | The shared language for the controls, attached to the model as CALM controls and enforced by gates |
| [FINOS AI Governance Framework](https://air-governance-framework.finos.org) | The mitigations that govern the agent itself |

Companion to the talk *Governing the Agentic SDLC: Driving Agentic Development with FINOS CALM*
(Open Source in Finance Forum, New York, November 2026. Matthew Bain and Aaron Searle).

The talk's slides are in [`slides/`](slides/) and published at
[rocketstack-matt.github.io/agentic-sdlc-blueprint/slides](https://rocketstack-matt.github.io/agentic-sdlc-blueprint/slides/).

> **Status.** A teaching blueprint, not a product.

## The idea in one minute

Coding agents produce confident, syntactically correct, architecturally catastrophic code. Tests pass. Types pass.
A tired reviewer approves. Drift happens one reasonable assumption at a time.

An agent is only as good as its context, and the missing context is **how** you want something built. That already
exists if your architecture is code. So:

1. **Model.** The system is described in CALM, with catalog controls attached to nodes as data.
2. **Spec.** Requirements reference CALM nodes, which fixes the scope an agent may touch.
3. **Agent.** The agent reads the model (MCP or CLI) before it writes anything.
4. **Gate.** Deterministic checks compare the change to the model. The model also decides who must review it.
5. **Evidence.** One hashed bundle per change, keyed by catalog control id, plus one CALM evidence document per
   control configuration in the model.

## Quick start

Needs Node 22+ and git. No API key, no cloud account, no containers.

**Fork first.** This repository is a template you take away, not a project you send changes to. Fork it, clone
your fork, and raise pull requests against your fork. The workflow in `.github/workflows/governed-sdlc.yml`
runs there, on your changes, and writes your evidence. Pull requests to this repository are only for fixing
the blueprint itself: the labs, the gates, the docs.

```sh
git clone https://github.com/<you>/agentic-sdlc-blueprint && cd agentic-sdlc-blueprint
npm install
npm test
npm run gates                                   # ADMISSIBLE on a clean tree

git apply labs/patches/attempt-a-shortcut.patch # an agent's reasonable shortcut
npm test                                        # still green
SPEC=SPEC-001 npm run gates                     # BLOCKED: drift, and a control breach
```

Then work through the labs. To see the pipeline run on your own changes, enable Actions on your fork
(GitHub disables workflows on forks until you do) and open a pull request there.

| Lab | Station | You will |
| --- | --- | --- |
| [01](labs/01-model.md) | Model | Read the CALM model, validate it, break a control config on purpose |
| [02](labs/02-spec.md) | Spec | See how a spec pins itself to the model and what context that yields |
| [03](labs/03-agent.md) | Agent | Replay two agent attempts at one spec, or run your own agent live |
| [04](labs/04-gate.md) | Gate | Watch the architecture pick the review mode, catch an agent editing the model, then see the right path for a model change |
| [05](labs/05-evidence.md) | Evidence | Produce the evidence bundle, then make the blueprint yours |

## What enforces what

| Catalog id | Control | Attached in CALM to | Enforced by |
| --- | --- | --- | --- |
| SDLC-PREV-001 | Code Review | system | `gates/review-router.mjs` (policy lives in the model) |
| SDLC-PREV-004 | Requirements Repository | system | `gates/spec-check.mjs`, `specs/` |
| SDLC-PREV-012 | Deployment Gating | system | `gates/run-all.mjs` (the blocking gate list lives in the model) |
| SDLC-PREV-014 | Test Evidence Retention | system | `gates/evidence.mjs` |
| SDLC-PREV-016 | Test Execution and Sign-Off | n/a | `tests` gate |
| SDLC-PREV-017 | Service Dependency Control | `position-store` node | `gates/drift-check.mjs`, `gates/model-diff.mjs` (a model change must be declared by its spec) |
| SDLC-PREV-007, -009, -010 | Dependency scanning, SBOM, secret detection | n/a | `.github/workflows/governed-sdlc.yml` |

Risks in view: SDLC-OP-007 Configuration Drift, SDLC-SEC-008 Unauthorised Change, SDLC-RC-005 Audit and Compliance
Evidence Failure. Agent mitigations: AIGF AIR-PREV-018 and AIR-PREV-019, see [`agent/GUARDRAILS.md`](agent/GUARDRAILS.md).

## Layout

```
architecture/   CALM 1.2 model, the pattern that enforces the controls, the node and interface Standards, copies of the catalog's control requirement documents and their Standard from CALM Hub, URL mapping for offline validation
specs/          version-controlled requirements, pinned to CALM nodes
services/       two tiny Node/TypeScript services (no framework, no database server)
agent/          CALM context for agents: shared logic, a CLI, a read-only MCP server, AIGF mapping
gates/          dependency-free Node scripts: spec-check, drift-check, model-diff, review-router, run-all, evidence
labs/           five labs, four pre-recorded agent attempts and one human model change
docs/           candidate controls to take back to the catalog, and two recorded live agent runs
AGENTS.md       the instructions any coding agent gets
```

## Honest limitations

- `drift-check` is a convention-based scanner (env bindings and cross-node imports), not a general solution.
  It is about 80 lines so that you can read it on a slide. Real estates need richer signals: IaC, service mesh
  config, OpenAPI clients, runtime traces. That gap is the interesting open-source work.
- The review router emits a decision. Enforcing it (required reviewers, an approved cognitive review engine) is platform work.
- Evidence is written to disk and a CI artefact. Immutability and retention are yours to provide. The CALM evidence
  documents are checked for shape by `labs/verify.sh`, not validated against the meta schema: the CLI validates
  architectures and patterns, not evidence. A gate that cites a control with no config in the model (SDLC-PREV-016
  in `tests`) is in the bundle but gets no document.
- The pattern requires the system-level controls, pins each to its catalog document, fixes the parameters the gates
  read, and checks the config of any node that carries SDLC-PREV-017. It cannot know which node should carry that
  control; `position-store` does. That stays a modelling decision.

## Contributing

Your own work belongs in your fork. Issues and pull requests here are for the blueprint itself: a lab that does not
run as printed, a gate that misses something, a control mapped to the wrong catalog entry. `labs/verify.sh` replays
every lab command and must stay green on `main`. Licensed under Apache 2.0. If a control here looks wrong, the better
fix is usually upstream in the [catalog](https://github.com/finos/sdlc-common-controls).
