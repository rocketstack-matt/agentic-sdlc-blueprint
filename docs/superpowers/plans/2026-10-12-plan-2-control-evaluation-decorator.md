# Plan 2: control-evaluation decorator Standard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `control-evaluation` decorator Standard to FINOS CALM's draft standards, so the result of evaluating a control (met, not met, not applicable, and why) can be pinned onto the architecture elements it concerns.

**Architecture:** One JSON Schema that extends the draft base decorator (`calm/draft/2026-03/meta/decorators.json#/defs/decorator`) with `allOf`, exactly as the deployment standard beside it does, plus three worked examples and READMEs. The Standard is engine-neutral: ergo is one way to produce it, so no ergo field names leak into it.

**Tech Stack:** JSON Schema 2020-12; `ajv-cli` 5 with `ajv-formats` 3 for validation (run through `npx`, not added to the repository).

**Spec:** `docs/superpowers/specs/2026-10-12-osff-talk-reframe-design.md` (Part 2, section 2.4), with `docs/superpowers/specs/2026-10-12-ergo-calm-spike-findings.md`.

**Repository:** `../architecture-as-code` (relative to this repository), the user's fork `rocketstack-matt/architecture-as-code` with `upstream` = `finos/architecture-as-code`.

## Global Constraints

- Work on a new branch `feat/control-evaluation-decorator` in `../architecture-as-code`, cut from an up-to-date `main` (sync the fork first with the `sync-fork` skill).
- Only these paths change: `calm/draft/2026-03/standards/compliance/` (new), `calm/draft/2026-03/standards/README.md`, `calm/draft/2026-03/README.md`. Never touch `calm/release/`.
- Follow the deployment standard's conventions: `$id` under `https://calm.finos.org/draft/2026-03/standards/...`, 4-space JSON indentation, kebab-case property names, `target-type` restricted to `["architecture"]`, `data.additionalProperties: true`.
- Engine-neutral: the words `ergo`, `opa`, `rego` appear only as example values, never as property names.
- Status values are `met`, `not-met`, `not-applicable`.
- Do not open an upstream issue or pull request, and do not push to `upstream`. Pushing the branch to `origin` (the user's fork) is allowed. Opening the upstream issue and PR needs the user's explicit approval (Task 4).
- Commits follow the repository's conventional style: `feat(calm): ...`, `docs(calm): ...`.

## Review Focus

1. **A `not-met` evaluation with no findings.** A reader of the decorator can't tell why it failed. Expect the schema to reject it. Pinned in Task 2 (invalid case `not-met-without-findings`).
2. **A Hub target, not a file path.** CALM Hub filters decorators by an exact target string of the form `/api/calm/namespaces/{namespace}/architectures/{id}/versions/{major-minor-patch}` (see `calm-hub-ui/src/service/calm-service.tsx`, `fetchDeploymentDecoratorsForArchitecture`). People expect the examples to show that form. Pinned by the examples in Task 2.
3. **An evaluation where nothing was in scope.** `applies-to` needs at least one id. People expect guidance on what to put there. Pinned by the `not-applicable` example and the README rule in Task 3.
4. **A finding about something that is not an architecture element** (a connection found in code, `trade-api->client-ledger`). People expect it to be recordable. Pinned: `findings[].subject` is a free string, shown in the `not-met` shortcut example.
5. **An evaluation with no change** (a scheduled check of the architecture itself). People expect `change` to be optional. Pinned by the `not-applicable` example, which has no `change`.

---

### Task 1: Branch

**Files:** none

- [ ] **Step 1: Sync the fork and branch**

Load the `sync-fork` skill and follow it in `../architecture-as-code` to fast-forward `main` from `upstream` and push it to `origin`. Then:

```bash
cd ../architecture-as-code
git switch -c feat/control-evaluation-decorator
git status --short
```

Expected: on the new branch; `git status --short` lists nothing you made (pre-existing untracked files are fine; leave them).

---

### Task 2: The Standard and its examples

**Files:**
- Create: `calm/draft/2026-03/standards/compliance/control-evaluation.decorator.standard.json`
- Create: `calm/draft/2026-03/standards/compliance/examples/ledger-change-not-met.decorator.json`
- Create: `calm/draft/2026-03/standards/compliance/examples/ledger-change-met.decorator.json`
- Create: `calm/draft/2026-03/standards/compliance/examples/service-dependency-not-applicable.decorator.json`
- Scratch (not committed): `/tmp/control-evaluation-invalid/*.json`

**Interfaces:**
- Produces: schema `$id` `https://calm.finos.org/draft/2026-03/standards/compliance/control-evaluation.decorator.standard.json`. Plan 3 copies this file into the blueprint and validates every decorator the gateway emits against it. Plan 4 (Hub UI) reads `type == "control-evaluation"`, `applies-to`, `data.status`, `data.control.unique-id`, `data.evaluated-at`, `data.findings[].description` and `data.actors.approver`.

- [ ] **Step 1: Write the three valid examples first**

`examples/ledger-change-not-met.decorator.json`:

```json
{
    "$schema": "https://calm.finos.org/draft/2026-03/standards/compliance/control-evaluation.decorator.standard.json",
    "unique-id": "eval-c0ffee1-client-ledger-human-approval",
    "type": "control-evaluation",
    "target": [
        "/api/calm/namespaces/demo/architectures/1/versions/1-0-0"
    ],
    "target-type": [
        "architecture"
    ],
    "applies-to": [
        "position-service-to-client-ledger",
        "position-service"
    ],
    "data": {
        "control": {
            "unique-id": "client-ledger-human-approval",
            "control-id": "SDLC-PREV-001",
            "requirement-url": "https://hub.calm.finos.org/calm/domains/finos-sdlc-common-controls/controls/sdlc-prev-001-code-review/requirement/versions/1.0.0",
            "attached-to": "client-ledger"
        },
        "status": "not-met",
        "evaluated-at": "2026-11-04T15:12:00Z",
        "change": {
            "commit": "c0ffee1a2b3c4d5e6f708192a3b4c5d6e7f80912",
            "diff-sha256": "d1ff01d1ff01d1ff01d1ff01d1ff01d1ff01d1ff01d1ff01d1ff01d1ff01d1ff",
            "spec": "SPEC-001"
        },
        "findings": [
            {
                "subject": "position-service-to-client-ledger",
                "check": "human_approved",
                "description": "A human approved this change",
                "expression": "$$input.change.approval.approver is a non-empty string",
                "cause": "absent"
            }
        ],
        "actors": {
            "author": "author-agent",
            "reviewer": "review-bot"
        },
        "engine": {
            "name": "ergo",
            "version": "d924f4d",
            "policy-sha256": "0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9"
        },
        "report-sha256": "9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0"
    }
}
```

`examples/ledger-change-met.decorator.json`:

```json
{
    "$schema": "https://calm.finos.org/draft/2026-03/standards/compliance/control-evaluation.decorator.standard.json",
    "unique-id": "eval-c0ffee1-client-ledger-human-approval-2",
    "type": "control-evaluation",
    "target": [
        "/api/calm/namespaces/demo/architectures/1/versions/1-0-0"
    ],
    "target-type": [
        "architecture"
    ],
    "applies-to": [
        "position-service-to-client-ledger",
        "position-service"
    ],
    "data": {
        "control": {
            "unique-id": "client-ledger-human-approval",
            "control-id": "SDLC-PREV-001",
            "requirement-url": "https://hub.calm.finos.org/calm/domains/finos-sdlc-common-controls/controls/sdlc-prev-001-code-review/requirement/versions/1.0.0",
            "attached-to": "client-ledger"
        },
        "status": "met",
        "evaluated-at": "2026-11-04T15:16:40Z",
        "change": {
            "commit": "c0ffee1a2b3c4d5e6f708192a3b4c5d6e7f80912",
            "diff-sha256": "d1ff01d1ff01d1ff01d1ff01d1ff01d1ff01d1ff01d1ff01d1ff01d1ff01d1ff",
            "spec": "SPEC-001"
        },
        "actors": {
            "author": "author-agent",
            "reviewer": "review-bot",
            "approver": "alice"
        },
        "engine": {
            "name": "ergo",
            "version": "d924f4d",
            "policy-sha256": "0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9"
        },
        "report-sha256": "1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809",
        "report-uri": "https://github.com/example/repo/actions/runs/123456/artifacts/report.json"
    }
}
```

`examples/service-dependency-not-applicable.decorator.json`:

```json
{
    "$schema": "https://calm.finos.org/draft/2026-03/standards/compliance/control-evaluation.decorator.standard.json",
    "unique-id": "eval-nightly-sdlc-prev-017",
    "type": "control-evaluation",
    "target": [
        "/api/calm/namespaces/demo/architectures/1/versions/1-0-0"
    ],
    "target-type": [
        "architecture"
    ],
    "applies-to": [
        "trade-capture"
    ],
    "data": {
        "control": {
            "unique-id": "sdlc-prev-017-service-dependency",
            "control-id": "SDLC-PREV-017",
            "requirement-url": "https://hub.calm.finos.org/calm/domains/finos-sdlc-common-controls/controls/sdlc-prev-017-service-dependency/requirement/versions/1.0.0",
            "attached-to": "trade-capture"
        },
        "status": "not-applicable",
        "evaluated-at": "2026-11-04T02:00:00Z",
        "engine": {
            "name": "ergo",
            "version": "d924f4d"
        }
    }
}
```

- [ ] **Step 2: Write the invalid cases (scratch)**

```bash
mkdir -p /tmp/control-evaluation-invalid && cd ../architecture-as-code/calm/draft/2026-03/standards/compliance
node -e '
const fs = require("fs");
const base = JSON.parse(fs.readFileSync("examples/ledger-change-not-met.decorator.json", "utf8"));
const cases = {
  "not-met-without-findings": (d) => { delete d.data.findings; },
  "not-met-empty-findings": (d) => { d.data.findings = []; },
  "unknown-status": (d) => { d.data.status = "failed"; },
  "wrong-type": (d) => { d.type = "deployment"; },
  "missing-evaluated-at": (d) => { delete d.data["evaluated-at"]; },
  "missing-control-requirement-url": (d) => { delete d.data.control["requirement-url"]; },
  "bad-diff-sha": (d) => { d.data.change["diff-sha256"] = "d1ff01"; },
  "change-without-commit": (d) => { delete d.data.change.commit; },
  "finding-without-description": (d) => { delete d.data.findings[0].description; },
  "pattern-target-type": (d) => { d["target-type"] = ["pattern"]; },
};
for (const [name, mutate] of Object.entries(cases)) {
  const d = structuredClone(base); mutate(d);
  fs.writeFileSync(`/tmp/control-evaluation-invalid/${name}.json`, JSON.stringify(d, null, 4));
}
console.log(Object.keys(cases).length, "invalid cases written");'
```

Expected: `10 invalid cases written`.

- [ ] **Step 3: Run validation to verify it fails (no Standard yet)**

From `calm/draft/2026-03/standards/compliance`:

```bash
npx -y -p ajv-cli@5 -p ajv-formats@3 ajv validate --spec=draft2020 --strict=false -c ajv-formats \
  -s control-evaluation.decorator.standard.json -r ../../meta/decorators.json -d "examples/*.decorator.json"
```

Expected: FAIL, the schema file does not exist.

- [ ] **Step 4: Write the Standard**

`control-evaluation.decorator.standard.json`:

```json
{
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://calm.finos.org/draft/2026-03/standards/compliance/control-evaluation.decorator.standard.json",
    "title": "CALM Control Evaluation Decorator Standard",
    "description": "Records the result of evaluating one control from a CALM document, such as a policy engine checking a change before it merges. Pins the result, and the reasons for it, onto the architecture elements it concerns. Extends the base CALM decorator.",
    "allOf": [
        {
            "$ref": "https://calm.finos.org/draft/2026-03/meta/decorators.json#/defs/decorator"
        },
        {
            "type": "object",
            "properties": {
                "type": {
                    "const": "control-evaluation",
                    "description": "Must be 'control-evaluation' for control evaluation decorators"
                },
                "target-type": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": [
                            "architecture"
                        ]
                    },
                    "description": "Control evaluation decorators target the architecture whose controls were evaluated."
                },
                "data": {
                    "type": "object",
                    "properties": {
                        "control": {
                            "type": "object",
                            "description": "The control that was evaluated, as it appears in the targeted architecture",
                            "properties": {
                                "unique-id": {
                                    "type": "string",
                                    "description": "The control's key in the architecture's controls map"
                                },
                                "control-id": {
                                    "type": "string",
                                    "description": "The control's identifier in an external catalog, such as SDLC-PREV-001"
                                },
                                "requirement-url": {
                                    "type": "string",
                                    "format": "uri",
                                    "description": "URL of the control requirement the evaluated configuration conforms to"
                                },
                                "attached-to": {
                                    "type": "string",
                                    "description": "unique-id of the architecture element that carries the control"
                                }
                            },
                            "required": [
                                "unique-id",
                                "requirement-url"
                            ],
                            "additionalProperties": true
                        },
                        "status": {
                            "type": "string",
                            "enum": [
                                "met",
                                "not-met",
                                "not-applicable"
                            ],
                            "description": "met: every in-scope subject passed. not-met: something failed, or could not be checked. not-applicable: nothing was in scope."
                        },
                        "evaluated-at": {
                            "type": "string",
                            "format": "date-time",
                            "description": "ISO 8601 timestamp of the evaluation"
                        },
                        "change": {
                            "type": "object",
                            "description": "The change evaluated, when the evaluation was of a proposed change",
                            "properties": {
                                "commit": {
                                    "type": "string",
                                    "description": "Commit identifier of the change"
                                },
                                "diff-sha256": {
                                    "type": "string",
                                    "pattern": "^[a-f0-9]{64}$",
                                    "description": "SHA-256 of the exact diff evaluated"
                                },
                                "spec": {
                                    "type": "string",
                                    "description": "Identifier of the requirement or specification the change implements"
                                }
                            },
                            "required": [
                                "commit"
                            ],
                            "additionalProperties": true
                        },
                        "findings": {
                            "type": "array",
                            "description": "Why the control was not met: one entry per failed check",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "subject": {
                                        "type": "string",
                                        "description": "What the check was about: an architecture element unique-id, or another identifier such as a connection found in code"
                                    },
                                    "check": {
                                        "type": "string",
                                        "description": "Name of the check that failed"
                                    },
                                    "description": {
                                        "type": "string",
                                        "description": "What the check requires, in plain words"
                                    },
                                    "expression": {
                                        "type": "string",
                                        "description": "The check as the engine expressed it"
                                    },
                                    "cause": {
                                        "type": "string",
                                        "description": "Why the check failed, such as absent or value"
                                    }
                                },
                                "required": [
                                    "subject",
                                    "description"
                                ],
                                "additionalProperties": true
                            }
                        },
                        "actors": {
                            "type": "object",
                            "description": "Identities involved in the change, such as author, reviewer and approver",
                            "additionalProperties": {
                                "type": "string"
                            }
                        },
                        "engine": {
                            "type": "object",
                            "description": "What evaluated the control",
                            "properties": {
                                "name": {
                                    "type": "string"
                                },
                                "version": {
                                    "type": "string"
                                },
                                "policy-sha256": {
                                    "type": "string",
                                    "pattern": "^[a-f0-9]{64}$",
                                    "description": "SHA-256 of the policy or module evaluated"
                                }
                            },
                            "required": [
                                "name"
                            ],
                            "additionalProperties": true
                        },
                        "report-sha256": {
                            "type": "string",
                            "pattern": "^[a-f0-9]{64}$",
                            "description": "SHA-256 of the engine's full report, kept as evidence"
                        },
                        "report-uri": {
                            "type": "string",
                            "format": "uri",
                            "description": "Where the engine's full report is kept"
                        }
                    },
                    "required": [
                        "control",
                        "status",
                        "evaluated-at"
                    ],
                    "if": {
                        "properties": {
                            "status": {
                                "const": "not-met"
                            }
                        },
                        "required": [
                            "status"
                        ]
                    },
                    "then": {
                        "properties": {
                            "findings": {
                                "minItems": 1
                            }
                        },
                        "required": [
                            "findings"
                        ]
                    },
                    "additionalProperties": true
                }
            },
            "required": [
                "type",
                "target-type",
                "data"
            ]
        }
    ]
}
```

- [ ] **Step 5: Run validation on the examples and the invalid cases**

From `calm/draft/2026-03/standards/compliance`:

```bash
AJV='npx -y -p ajv-cli@5 -p ajv-formats@3 ajv validate --spec=draft2020 --strict=false -c ajv-formats -s control-evaluation.decorator.standard.json -r ../../meta/decorators.json'
$AJV -d "examples/*.decorator.json"
for f in /tmp/control-evaluation-invalid/*.json; do $AJV -d "$f" >/dev/null 2>&1 && echo "UNEXPECTEDLY VALID: $f" || echo "rejected: $(basename $f)"; done
```

Expected: the three examples print `valid`; all ten invalid cases print `rejected:`; no `UNEXPECTEDLY VALID`.

- [ ] **Step 6: Check the deployment standard still validates with the same command (control for the tooling)**

```bash
cd ../deployment
npx -y -p ajv-cli@5 -p ajv-formats@3 ajv validate --spec=draft2020 --strict=false -c ajv-formats \
  -s deployment.decorator.standard.json -r ../../meta/decorators.json -d examples/simple-deployment.decorator.json
```

Expected: `valid`. This shows the command validates the existing standard the same way.

- [ ] **Step 7: Commit**

```bash
cd ../architecture-as-code
git add calm/draft/2026-03/standards/compliance/control-evaluation.decorator.standard.json calm/draft/2026-03/standards/compliance/examples/*.decorator.json
git commit -m "feat(calm): add a control-evaluation decorator standard

Records the result of evaluating a control from a CALM document, such as a
policy engine checking a change before merge, pinned to the elements it concerns."
rm -rf /tmp/control-evaluation-invalid
```

---

### Task 3: Documentation

**Files:**
- Create: `calm/draft/2026-03/standards/compliance/README.md`
- Create: `calm/draft/2026-03/standards/compliance/examples/README.md`
- Modify: `calm/draft/2026-03/standards/README.md` (Organization list)
- Modify: `calm/draft/2026-03/README.md` (Contents)

- [ ] **Step 1: Write `compliance/README.md`**

```markdown
# Compliance Decorator Standards

## Control evaluation

`control-evaluation.decorator.standard.json` records the result of evaluating one control from a CALM
architecture: whether it was met, and if not, why. A policy engine that checks a change before it merges writes one
decorator per control per change, so the architecture carries its own compliance history.

The Standard is engine-neutral. Any engine that can say which control it evaluated, whether it passed and which
checks failed can produce it.

### Fields

| Field | Required | Meaning |
| --- | --- | --- |
| `target-type` | yes | Always `["architecture"]` |
| `target` | yes | The architecture evaluated, at its version. In CALM Hub, the exact path `/api/calm/namespaces/{namespace}/architectures/{id}/versions/{major-minor-patch}` |
| `applies-to` | yes | The elements the evaluation was about: the nodes and relationships that were in scope. When nothing was in scope, the element that carries the control |
| `data.control.unique-id` | yes | The control's key in the architecture's `controls` map |
| `data.control.requirement-url` | yes | The control requirement its configuration conforms to |
| `data.control.control-id` | no | The control's id in an external catalog, such as `SDLC-PREV-001` |
| `data.control.attached-to` | no | The element that carries the control |
| `data.status` | yes | `met`, `not-met` or `not-applicable` |
| `data.evaluated-at` | yes | When it was evaluated |
| `data.findings` | when `not-met` | One entry per failed check: `subject`, `description` (required), `check`, `expression`, `cause` |
| `data.change` | no | The change evaluated: `commit` (required), `diff-sha256`, `spec` |
| `data.actors` | no | Identities involved, such as `author`, `reviewer`, `approver` |
| `data.engine` | no | What evaluated it: `name` (required), `version`, `policy-sha256` |
| `data.report-sha256`, `data.report-uri` | no | The engine's full report, kept as evidence |

A `not-met` evaluation must say why: `findings` is required and cannot be empty.

### Example

See [`examples/`](examples/).
```

- [ ] **Step 2: Write `compliance/examples/README.md`**

```markdown
# Control Evaluation Decorator Examples

| Example | Demonstrates |
| --- | --- |
| `ledger-change-not-met.decorator.json` | A change to a service that connects to the Client Ledger, with no human approval: `not-met`, with the finding |
| `ledger-change-met.decorator.json` | The same change after a human approved it: `met`, with the approver |
| `service-dependency-not-applicable.decorator.json` | A scheduled evaluation with nothing in scope: `not-applicable`, no `change`, `applies-to` names the element carrying the control |

All three target an architecture stored in CALM Hub, by the exact path the Hub uses to filter decorators.
```

- [ ] **Step 3: Update the two existing READMEs**

In `calm/draft/2026-03/standards/README.md`, under `## Organization`, add after the Deployment bullet:

```markdown
- **Compliance**: Control evaluation decorators recording whether a control on the architecture was met, and why
```

In `calm/draft/2026-03/README.md`, under `### Contents`, add:

```markdown
- `standards/compliance/` - Control evaluation decorator standard and examples
```

- [ ] **Step 4: Commit and push to the fork**

```bash
cd ../architecture-as-code
git add calm/draft/2026-03/standards/compliance/README.md calm/draft/2026-03/standards/compliance/examples/README.md calm/draft/2026-03/standards/README.md calm/draft/2026-03/README.md
git commit -m "docs(calm): describe the control-evaluation decorator standard"
git push -u origin feat/control-evaluation-decorator
```

Expected: the branch is on `origin`. Nothing is pushed to `upstream`.

---

### Task 4: Hand-off for the upstream proposal

**Files:** none

- [ ] **Step 1: Draft the issue text and stop**

CALM's governance (`calm/AGENTS.md`) wants a schema change to start from an issue using the Schema Change Proposal template. Draft the issue body in your final message (title: `Control evaluation decorator standard`; what it records, why, the field table, a link to the branch on the fork) and ask the user for explicit approval before opening the issue or a pull request on `finos/architecture-as-code`.
