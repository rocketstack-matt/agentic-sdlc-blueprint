# Plan 3a: the model carries the policy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the controls in `architecture/trade-capture.architecture.json` carry ergo policies, evaluate them with one generic Wasm module, and replace the six bespoke gate scripts with that evaluation. Rename `position-store` to `client-ledger` and remove tiers.

**Architecture:** Each control's `config.ergo` holds ergo `subjects` and `requirements`. `gates/policy/controls.rego` collects them from the model and returns one result: `{report, violations, problems, controls}`. Node works out the facts about a change (files with their owning node, touched nodes, connections found in code, the spec) and evaluates against the **base branch's** model. Each requirement's `meta.stage` says when it blocks: `change` requirements block in CI, `merge` requirements (anything that needs a review or a human approval) block in the merge gateway, which plan 3b rebuilds.

**Tech Stack:** OPA 1.21.1 (build only), ergo `d924f4d`, `@open-policy-agent/opa-wasm` ^1.10.0 (now a root devDependency), Node 22+, `@finos/calm-cli` (existing), `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-12-osff-talk-reframe-design.md` (Part 2, 2.1 to 2.3), with `docs/superpowers/specs/2026-10-12-ergo-calm-spike-findings.md` (control shapes, and gaps 1 to 5, which this plan closes).

This is plan 3a of the reframe. Plan 3b (gateway on ergo, decorators, Hub publishing, demo) follows and consumes `gates/lib/controls.mjs` and `gates/lib/calm.mjs#changeInput`.

## Governance

Approving this plan approves `specs/SPEC-002-controls-as-ergo.md` and every control-plane edit listed below (`architecture/`, `gates/`, `agent/`, `.github/`, `AGENTS.md`). Matthew reviews the control-plane diff before it is pushed. Every commit carries the trailer `Spec: SPEC-002`.

## Global Constraints

- Work on branch `feat/controls-as-ergo` from `main`.
- ergo is copied unchanged from `kosli-dev/ergo` at `d924f4d` into `gates/policy/ergo.rego`, keeping its license header. Credit it in `NOTICE`.
- From Rego, call only `ergo.report` and `ergo.violations`. Build text with `concat`, never `sprintf` (ergo's Wasm notes).
- The verdict is decided from requirement `status`, never from "no violations".
- Controls are always read from the base branch's architecture (`git show <base>:architecture/trade-capture.architecture.json`), never the working tree's (findings gap 5). The single exception is bootstrapping: a base model with no ergo policy anywhere (main before this plan merges) falls back to the working tree. `calm validate` still validates the working tree's model.
- Any thrown value or missing result from the Wasm module is a deny.
- No tiers, no data classifications anywhere in the model, the pattern, the Standards, the gates or the agent context.
- Keep the env-binding name `POSITION_STORE_PATH` so no service code changes. Only ids and names change.
- `OPA` defaults to `opa`; locally use `OPA=.amp/in/bin/opa` (installed by plan 1).
- Requirement names and subject names are unique across all controls.
- Docs paths, which never need a spec or an approval: `^README\.md$`, `^docs/`, `^slides/`, `^LICENSE$`, `^NOTICE$`.
- Approved reviewers: `["review-bot"]`. Approvers (people): `["alice"]`. Plan 3b may change these lists in the model.

## Review Focus

1. **A pull request that edits the model to remove its own controls.** Expect the base branch's controls to apply. Pinned in Task 4 (`base architecture is used, not the working tree`).
2. **A file outside every node that is not docs** (a change to `gates/`, `architecture/`, `gateway/`). Expect it to need a spec in CI and a human approval at merge. Pinned in Task 3 (`unowned file needs a human`, `unowned file needs a spec`).
3. **A docs-only change with no spec.** Expect it to pass CI. Pinned in Task 3 (`docs-only change needs no spec`).
4. **A control without `config.ergo` and without `evaluated-by: pipeline`.** Expect a deny, naming the control. Pinned in Task 3 (`a control without ergo is a problem`) and in Task 2 (the pattern rejects it).
5. **The approver is the author or the reviewer, or not a listed person.** Expect a deny. Pinned in Task 3 (`approver must be a listed person who is neither author nor reviewer`).

---

### Task 1: Branch and SPEC-002

**Files:**
- Create: `specs/SPEC-002-controls-as-ergo.md`

- [ ] **Step 1: Branch**

```bash
git switch main && git pull --ff-only && git switch -c feat/controls-as-ergo
```

- [ ] **Step 2: Write the spec**

`specs/SPEC-002-controls-as-ergo.md`:

```markdown
---
id: SPEC-002
title: The model carries the policy
status: approved
owner: matthew-bain
calm-nodes: []
calm-relationships: []
model-change: [client-ledger, position-service-to-client-ledger, trade-capture-composition, client-ledger-human-approval, sdlc-prev-001-code-review, sdlc-prev-004-requirements-repository, sdlc-prev-012-deployment-gating, sdlc-prev-014-test-evidence-retention, sdlc-prev-017-service-dependency]
---

# SPEC-002 The model carries the policy

## Why
The controls on the architecture should be the checks that run, not descriptions of scripts that run elsewhere.

## What
- Each control in the CALM model carries its policy as ergo requirements in `config.ergo`.
- One generic policy module evaluates whatever controls the base branch's model carries.
- `position-store` becomes `client-ledger`. Tiers and data classifications are removed.
- The Client Ledger carries a control: any change to a service that connects to it needs a human approver.
- Service dependency control moves to the system: every connection the code makes must be in the model.
- The bespoke gate scripts are replaced by `gates/check.mjs`.

## Acceptance
- `npm run calm:validate`, `npm test`, `npm run typecheck` and `SPEC=SPEC-002 npm run gates` pass.
- The scenarios in `test/controls.test.mjs` pass, including the Client Ledger rule following a new connection.
```

- [ ] **Step 3: Commit**

```bash
git add specs/SPEC-002-controls-as-ergo.md
git commit -m "docs(specs): SPEC-002, the model carries the policy

Spec: SPEC-002"
```

---

### Task 2: The ergo-control Standard, the pattern and the model

**Files:**
- Create: `architecture/standards/ergo-control.standard.json`
- Modify: `architecture/url-mapping.json`
- Modify: `architecture/standards/governed-node.standard.json` (remove the tier block)
- Modify: `architecture/governed-service.pattern.json` (`$defs`, `properties.controls`, `properties.nodes`, `description`)
- Modify: `architecture/trade-capture.architecture.json`
- Modify: `specs/SPEC-001-account-summary.md` (architectural context names the ledger)
- Create: `test/model.test.mjs`
- Modify: `package.json` (`test` script picks up `.test.mjs`)

**Interfaces:**
- Produces: the model shape every later task reads. System controls `sdlc-prev-001-code-review`, `sdlc-prev-004-requirements-repository`, `sdlc-prev-017-service-dependency` and node control `client-ledger.controls.client-ledger-human-approval` carry `config.ergo`. `sdlc-prev-012-deployment-gating` and `sdlc-prev-014-test-evidence-retention` carry `config["evaluated-by"] == "pipeline"`. `sdlc-prev-012…config["blocking-gates"] == ["calm-validate", "tests", "controls"]`. Requirement names: `code-review`, `control-plane-human-approval`, `client-ledger-human-approval`, `requirements-scope`, `change-names-approved-spec`, `service-dependency`.

- [ ] **Step 1: Write the failing model test**

`test/model.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const model = () => JSON.parse(readFileSync(join(ROOT, 'architecture/trade-capture.architecture.json'), 'utf8'));
const validate = (doc) => {
  const dir = mkdtempSync(join(tmpdir(), 'model-'));
  const file = join(dir, 'arch.json');
  writeFileSync(file, JSON.stringify(doc));
  const out = join(dir, 'out.json');
  const r = spawnSync('npx', ['--no-install', 'calm', 'validate', '-p', 'architecture/governed-service.pattern.json', '-a', file, '-u', 'architecture/url-mapping.json', '-f', 'json', '-o', out], { cwd: ROOT, encoding: 'utf8' });
  let parsed = {};
  try { parsed = JSON.parse(readFileSync(out, 'utf8')); } catch { /* exit code decides */ }
  return r.status === 0 && parsed.hasErrors !== true;
};
const ledger = (doc) => doc.nodes.find((n) => n['unique-id'] === 'client-ledger');

test('the model is valid against the pattern', () => {
  assert.equal(validate(model()), true);
});

test('the client ledger exists, and nothing carries a tier or a classification', () => {
  const doc = model();
  assert.ok(ledger(doc));
  assert.equal(JSON.stringify(doc).includes('position-store'), false);
  assert.equal(/criticality-tier|data-classification/.test(JSON.stringify(doc)), false);
});

test('a system control without config.ergo is rejected by the pattern', () => {
  const doc = model();
  delete doc.controls['sdlc-prev-001-code-review'].requirements[0].config.ergo;
  assert.equal(validate(doc), false);
});

test('a node control without config.ergo is rejected by the pattern', () => {
  const doc = model();
  delete ledger(doc).controls['client-ledger-human-approval'].requirements[0].config.ergo;
  assert.equal(validate(doc), false);
});

test('an ergo requirement without meta.stage is rejected by the pattern', () => {
  const doc = model();
  delete doc.controls['sdlc-prev-017-service-dependency'].requirements[0].config.ergo.requirements['service-dependency'].meta.stage;
  assert.equal(validate(doc), false);
});
```

In `package.json`, change the `test` script to:

```json
"test": "tsx --test test/*.test.ts test/*.test.mjs",
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test 2>&1 | tail -15`
Expected: the model tests FAIL (`client-ledger` missing, tiers present, `sdlc-prev-017-service-dependency` not a system control).

- [ ] **Step 3: Write the ergo-control Standard**

`architecture/standards/ergo-control.standard.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://hub.calm.finos.org/calm/namespaces/finos.agentic-sdlc/standards/ergo-control/versions/1.0.0",
  "title": "Control carrying an ergo policy",
  "description": "A CALM control whose config holds the policy that enforces it, as ergo subjects and requirements (https://github.com/kosli-dev/ergo). The policy reads the architecture and the change, so the control on the diagram is the check that runs. meta.stage says when a requirement blocks: change (on every change, in CI) or merge (in the merge gateway, where the review and any approval are known).",
  "type": "object",
  "properties": {
    "requirements": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "properties": {
          "requirement-url": { "type": "string" },
          "config": { "$ref": "#/$defs/config" }
        },
        "required": ["requirement-url", "config"]
      }
    }
  },
  "required": ["requirements"],
  "$defs": {
    "config": {
      "type": "object",
      "properties": {
        "control-id": { "type": "string" },
        "name": { "type": "string" },
        "description": { "type": "string" },
        "ergo": {
          "type": "object",
          "properties": {
            "subjects": { "type": "object", "minProperties": 1 },
            "requirements": {
              "type": "object",
              "minProperties": 1,
              "additionalProperties": {
                "type": "object",
                "properties": {
                  "description": { "type": "string", "minLength": 1 },
                  "subject": { "type": "string" },
                  "meta": {
                    "type": "object",
                    "properties": {
                      "control-id": { "type": "string" },
                      "calm-control": { "type": "string" },
                      "stage": { "enum": ["change", "merge"] }
                    },
                    "required": ["control-id", "calm-control", "stage"]
                  },
                  "checks": { "type": "object", "minProperties": 1 }
                },
                "required": ["description", "subject", "meta", "checks"]
              }
            }
          },
          "required": ["subjects", "requirements"]
        }
      },
      "required": ["control-id", "name", "ergo"]
    }
  }
}
```

Add to `architecture/url-mapping.json`:

```json
"https://hub.calm.finos.org/calm/namespaces/finos.agentic-sdlc/standards/ergo-control/versions/1.0.0": "standards/ergo-control.standard.json",
```

- [ ] **Step 4: Remove the tier block from the governed-node Standard**

```bash
node -e '
const fs = require("fs"); const p = "architecture/standards/governed-node.standard.json";
const s = JSON.parse(fs.readFileSync(p, "utf8"));
s.allOf = s.allOf.filter((part) => !JSON.stringify(part).includes("criticality-tier"));
s.description = "What every node in this estate must carry for the gates to work. Services declare where their code lives, so the gates can tell which node a changed file belongs to and which connections its code makes; every interface declares its environment binding.";
fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");'
grep -c criticality-tier architecture/standards/governed-node.standard.json
```

Expected: `0`.

- [ ] **Step 5: Rewrite the pattern's controls and nodes**

```bash
node -e '
const fs = require("fs"); const p = "architecture/governed-service.pattern.json";
const s = JSON.parse(fs.readFileSync(p, "utf8"));
const ERGO = "https://hub.calm.finos.org/calm/namespaces/finos.agentic-sdlc/standards/ergo-control/versions/1.0.0";
const hub = (slug) => `https://hub.calm.finos.org/calm/domains/finos-sdlc-common-controls/controls/${slug}/requirement/versions/1.0.0`;
const ergoControl = (slug, description) => ({ description, allOf: [{ $ref: ERGO }, { properties: { requirements: { prefixItems: [{ properties: { "requirement-url": { const: hub(slug) } } }] } } }] });
const pipelineControl = (slug, description, extra) => ({ description, type: "object", properties: { requirements: { type: "array", minItems: 1, prefixItems: [{ type: "object", properties: { "requirement-url": { const: hub(slug) }, config: { type: "object", properties: { "evaluated-by": { const: "pipeline" }, ...extra.properties }, required: ["evaluated-by", ...extra.required] } }, required: ["requirement-url", "config"] }] } }, required: ["requirements"] });
s.$defs = {
  "code-review": ergoControl("sdlc-prev-001-code-review", "SDLC-PREV-001 Code Review: its ergo policy is evaluated by the merge gateway."),
  "requirements-repository": ergoControl("sdlc-prev-004-requirements", "SDLC-PREV-004 Requirements Repository: its ergo policy is evaluated on every change."),
  "service-dependency-control": ergoControl("sdlc-prev-017-service-dependency-control", "SDLC-PREV-017 Service Dependency Control: every connection the code makes must be in the model."),
  "deployment-gating": pipelineControl("sdlc-prev-012-deployment-gating", "SDLC-PREV-012 Deployment Gating: the gates gates/check.mjs must see pass.", { properties: { "blocking-gates": { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true } }, required: ["blocking-gates"] }),
  "test-evidence-retention": pipelineControl("sdlc-prev-014-test-evidence", "SDLC-PREV-014 Test Evidence Retention: every evaluation is kept as evidence.", { properties: {}, required: [] }),
};
s.properties.controls = {
  type: "object",
  properties: {
    "sdlc-prev-001-code-review": { $ref: "#/$defs/code-review" },
    "sdlc-prev-004-requirements-repository": { $ref: "#/$defs/requirements-repository" },
    "sdlc-prev-012-deployment-gating": { $ref: "#/$defs/deployment-gating" },
    "sdlc-prev-014-test-evidence-retention": { $ref: "#/$defs/test-evidence-retention" },
    "sdlc-prev-017-service-dependency": { $ref: "#/$defs/service-dependency-control" },
  },
  required: ["sdlc-prev-001-code-review", "sdlc-prev-004-requirements-repository", "sdlc-prev-012-deployment-gating", "sdlc-prev-014-test-evidence-retention", "sdlc-prev-017-service-dependency"],
};
s.properties.nodes = { type: "array", items: { allOf: [
  { $ref: "https://hub.calm.finos.org/calm/namespaces/finos.agentic-sdlc/standards/governed-node/versions/1.0.0" },
  { type: "object", properties: { controls: { type: "object", additionalProperties: { $ref: ERGO } } } },
] } };
s.description = "How this estate enforces the SDLC Common Controls on every architecture. The pattern requires five system-level controls and pins each to its control requirement document in the finos-sdlc-common-controls domain on CALM Hub. Three carry their policy as ergo requirements, evaluated by gates/check.mjs and the merge gateway; two are enforced by the pipeline. Any control on a node carries an ergo policy. Every node satisfies the governed-node Standard.";
fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");'
```

- [ ] **Step 6: Rewrite the model**

Write `.amp/in/model-controls.json` (scratch) holding the five system controls and the ledger control exactly as below, then apply it with the script in Step 7.

The approval checks appear twice (ledger and control plane), as `APPROVAL` in the script; they are written out once here:

```json
{
  "human_approved": { "description": "A human approved this change", "op": "non_empty_string", "path": ["$$input", "change", "approval", "approver"] },
  "approver_is_a_person": { "description": "The approver is one of the people who may approve", "op": "in", "path": ["$$input", "change", "approval", "approver"], "values": ["alice"] },
  "approver_is_not_the_author": { "description": "The approver did not write the change", "op": "compare", "left": ["$$input", "change", "approval", "approver"], "right": ["$$input", "change", "author"], "cmp": "ne" },
  "approver_is_not_the_reviewer": { "description": "The approver is not the reviewer", "op": "compare", "left": ["$$input", "change", "approval", "approver"], "right": ["$$input", "change", "review", "reviewer"], "cmp": "ne" },
  "approval_verified": { "description": "The approval's signature checked out", "op": "equals", "path": ["$$input", "change", "approval", "verified"], "value": true },
  "approval_unused": { "description": "The approval has not been used before", "op": "equals", "path": ["$$input", "change", "approval", "used"], "value": false },
  "approval_for_this_commit": { "description": "The approval is for this commit", "op": "compare", "left": ["$$input", "change", "approval", "commit"], "right": ["$$input", "change", "commit"], "cmp": "eq" },
  "approval_for_this_diff": { "description": "The approval is for this exact diff", "op": "compare", "left": ["$$input", "change", "approval", "diff_sha256"], "right": ["$$input", "change", "diff_sha256"], "cmp": "eq" }
}
```

- [ ] **Step 7: Apply the model changes**

`.amp/in/rewrite-model.mjs` (scratch, deleted after use):

```js
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'architecture/trade-capture.architecture.json';
const hub = (slug) => `https://hub.calm.finos.org/calm/domains/finos-sdlc-common-controls/controls/${slug}/requirement/versions/1.0.0`;
const DOCS = ['^README\\.md$', '^docs/', '^slides/', '^LICENSE$', '^NOTICE$'];
const APPROVAL = JSON.parse(readFileSync('.amp/in/model-controls.json', 'utf8'));
const meta = (id, key, stage) => ({ 'control-id': id, 'calm-control': key, stage });

let arch = JSON.parse(readFileSync(P, 'utf8').replaceAll('position-store', 'client-ledger').replaceAll('Position Store', 'Client Ledger'));
for (const node of arch.nodes) {
  if (node.metadata) {
    delete node.metadata['criticality-tier'];
    delete node.metadata['data-classification'];
    if (Object.keys(node.metadata).length === 0) delete node.metadata;
  }
}
const ledger = arch.nodes.find((n) => n['unique-id'] === 'client-ledger');
ledger.description = 'Records client positions: the book of record.';
ledger.controls = {
  'client-ledger-human-approval': {
    description: 'The Client Ledger records client positions. Any change to a service that connects to it needs a human approver.',
    requirements: [{
      'requirement-url': hub('sdlc-prev-001-code-review'),
      config: {
        'control-id': 'SDLC-PREV-001',
        name: 'Code Review',
        description: 'A change to any service with a connection into the Client Ledger is approved by a human, on top of its code review.',
        ergo: {
          subjects: {
            connection: { description: 'A connection in the architecture', from: ['architecture', 'relationships'], id: ['unique-id'], applies_to: { is_connection: { op: 'present', path: ['relationship-type', 'connects'] } } },
            'connection to the client ledger, changed': {
              description: 'A connection into the Client Ledger from a node this change touches',
              of: 'connection',
              applies_to: {
                into_the_ledger: { op: 'equals', path: ['relationship-type', 'connects', 'destination', 'node'], value: 'client-ledger' },
                from_a_changed_node: { op: 'in', path: ['relationship-type', 'connects', 'source', 'node'], values: { ref: ['$$input', 'change', 'nodes'] } },
              },
            },
          },
          requirements: {
            'client-ledger-human-approval': {
              description: 'Any change to a service that connects to the Client Ledger is approved by a human',
              meta: meta('SDLC-PREV-001', 'client-ledger-human-approval', 'merge'),
              subject: 'connection to the client ledger, changed',
              min_subjects: 0,
              checks: APPROVAL,
            },
          },
        },
      },
    }],
  },
};

arch.controls = {
  'sdlc-prev-001-code-review': {
    description: 'Every change is reviewed by an approved reviewer who is not its author. A change to anything no node owns, such as the model, the gates or the pipeline, also needs a human approver.',
    requirements: [{
      'requirement-url': hub('sdlc-prev-001-code-review'),
      config: {
        'control-id': 'SDLC-PREV-001',
        name: 'Code Review',
        description: 'Evaluated by the merge gateway, which knows the review and any approval.',
        ergo: {
          subjects: {
            'change under review': { description: 'The change proposed for merge', from: ['change'], id: ['commit'] },
            'changed file no node owns': {
              description: 'A changed file outside every node that is not documentation',
              from: ['change', 'files'],
              id: ['path'],
              applies_to: { unowned: { op: 'missing', path: ['node'] }, not_docs: { op: 'not_matches_any', path: ['path'], patterns: DOCS } },
            },
          },
          requirements: {
            'code-review': {
              description: 'Every change is reviewed by an approved reviewer who is not its author',
              meta: meta('SDLC-PREV-001', 'sdlc-prev-001-code-review', 'merge'),
              subject: 'change under review',
              checks: {
                review_approves: { description: 'The review approves the change', op: 'equals', path: ['review', 'verdict'], value: 'approve' },
                review_verified: { description: "The review record's signature checked out", op: 'equals', path: ['review', 'verified'], value: true },
                not_the_author: { description: 'The author may not review its own change', op: 'compare', left: ['review', 'reviewer'], right: ['author'], cmp: 'ne' },
                approved_reviewer: { description: 'The reviewer is an approved reviewer', op: 'in', path: ['review', 'reviewer'], values: ['review-bot'] },
                review_of_this_commit: { description: 'The review is of this commit', op: 'compare', left: ['review', 'commit'], right: ['commit'], cmp: 'eq' },
                review_of_this_diff: { description: 'The review is of this exact diff', op: 'compare', left: ['review', 'diff_sha256'], right: ['diff_sha256'], cmp: 'eq' },
              },
            },
            'control-plane-human-approval': {
              description: 'A change to anything no node owns, such as the architecture, the gates or the pipeline, is approved by a human',
              meta: meta('SDLC-PREV-001', 'sdlc-prev-001-code-review', 'merge'),
              subject: 'changed file no node owns',
              min_subjects: 0,
              checks: APPROVAL,
            },
          },
        },
      },
    }],
  },
  'sdlc-prev-004-requirements-repository': {
    description: 'Every change other than documentation names an approved spec, and touches only the nodes it declares.',
    requirements: [{
      'requirement-url': hub('sdlc-prev-004-requirements'),
      config: {
        'control-id': 'SDLC-PREV-004',
        name: 'Requirements Repository',
        description: 'Requirements are version-controlled specs in specs/.',
        ergo: {
          subjects: {
            'change outside the docs': {
              description: 'The change, when it touches anything other than documentation',
              from: ['change'],
              id: ['commit'],
              applies_to: { touches_more_than_docs: { op: 'any', path: ['files'], check: { op: 'not_matches_any', path: ['path'], patterns: DOCS } } },
            },
            'node the change touches': { description: 'A node in the architecture that owns a changed file', from: ['change', 'nodes'] },
          },
          requirements: {
            'change-names-approved-spec': {
              description: 'A change other than documentation names an approved spec',
              meta: meta('SDLC-PREV-004', 'sdlc-prev-004-requirements-repository', 'change'),
              subject: 'change outside the docs',
              min_subjects: 0,
              checks: {
                names_a_spec: { description: 'The change names a spec', op: 'non_empty_string', path: ['spec'] },
                spec_exists: { description: 'The spec it names is in specs/', op: 'compare', left: ['spec'], right: ['$$input', 'spec', 'id'], cmp: 'eq' },
                spec_approved: { description: "The change's spec is approved", op: 'equals', path: ['$$input', 'spec', 'approved'], value: true },
              },
            },
            'requirements-scope': {
              description: 'A change touches only the nodes its spec declares',
              meta: meta('SDLC-PREV-004', 'sdlc-prev-004-requirements-repository', 'change'),
              subject: 'node the change touches',
              min_subjects: 0,
              checks: { in_spec: { description: 'The spec declares this node', op: 'in', path: [], values: { ref: ['$$input', 'spec', 'nodes'] } } },
            },
          },
        },
      },
    }],
  },
  'sdlc-prev-012-deployment-gating': {
    description: 'A change is only admissible when every blocking gate passes. Without this the other controls are advisory.',
    requirements: [{
      'requirement-url': hub('sdlc-prev-012-deployment-gating'),
      config: { 'control-id': 'SDLC-PREV-012', name: 'Deployment Gating', description: 'gates/check.mjs runs every gate below; any failure blocks.', 'evaluated-by': 'pipeline', 'blocking-gates': ['calm-validate', 'tests', 'controls'] },
    }],
  },
  'sdlc-prev-014-test-evidence-retention': {
    description: 'Every evaluation of the controls is kept as evidence, bound to the commit and the architecture it was decided on.',
    requirements: [{
      'requirement-url': hub('sdlc-prev-014-test-evidence'),
      config: { 'control-id': 'SDLC-PREV-014', name: 'Test Evidence Retention', description: 'gates/check.mjs writes the full control report to evidence/out; the merge gateway records each decision as a control-evaluation decorator.', 'evaluated-by': 'pipeline', 'bound-to': ['commit-sha', 'spec-id', 'architecture-sha256'], format: 'application/json' },
    }],
  },
  'sdlc-prev-017-service-dependency': {
    description: 'Service dependencies are mapped in this model and kept current with every change: every connection the code makes must be a connection in the architecture.',
    requirements: [{
      'requirement-url': hub('sdlc-prev-017-service-dependency-control'),
      config: {
        'control-id': 'SDLC-PREV-017',
        name: 'Service Dependency Control',
        description: 'Connections found in code (environment bindings and imports across nodes) are compared with the connects relationships here.',
        ergo: {
          subjects: { 'connection the code makes': { description: 'A connection from one node to another, found in the code', from: ['change', 'connections', { each_as: 'made' }], id: ['id'] } },
          requirements: {
            'service-dependency': {
              description: 'Every connection the code makes exists in the architecture',
              meta: meta('SDLC-PREV-017', 'sdlc-prev-017-service-dependency', 'change'),
              subject: 'connection the code makes',
              min_subjects: 0,
              checks: {
                in_architecture: {
                  description: 'The architecture has this connection',
                  op: 'any',
                  path: ['$$input', 'architecture', 'relationships'],
                  check: { op: 'any_of', options: { same_connection: [
                    { op: 'compare', left: ['relationship-type', 'connects', 'source', 'node'], right: ['$made', 'source'], cmp: 'eq' },
                    { op: 'compare', left: ['relationship-type', 'connects', 'destination', 'node'], right: ['$made', 'destination'], cmp: 'eq' },
                  ] } },
                },
              },
            },
          },
        },
      },
    }],
  },
};
writeFileSync(P, `${JSON.stringify(arch, null, 2)}\n`);
console.log('model rewritten');
```

Run: `node .amp/in/rewrite-model.mjs && rm .amp/in/rewrite-model.mjs .amp/in/model-controls.json`

- [ ] **Step 8: Update SPEC-001's architectural context**

In `specs/SPEC-001-account-summary.md`, replace the bullet that begins `- Node \`position-store\` carries control` with:

```markdown
- Node `client-ledger` (the book of record) carries a control: any change to a service that connects to it needs a
  human approver. trade-api has no connection to it. **Reading the ledger from trade-api is not an available
  option**, even though it would be fewer lines of code: the connection is not in the model, so service dependency
  control blocks it.
```

- [ ] **Step 9: Run the model tests**

Run: `npm run calm:validate 2>&1 | tail -3 && npm test 2>&1 | grep -E '^ℹ (pass|fail)|^✖'`
Expected: `No issues found.`; all model tests pass; the two existing service tests pass. If `calm validate` cannot resolve `#/$defs/config` inside the Standard, inline the config schema under `properties.requirements.items.properties.config` and record the ruling.

- [ ] **Step 10: Commit**

```bash
git add architecture/ specs/SPEC-001-account-summary.md test/model.test.mjs package.json
git commit -m "feat(model): controls carry their ergo policy; position-store becomes client-ledger

The pattern requires an ergo policy on every enforced control. Tiers and data
classifications are gone; the Client Ledger carries the human approval rule.

Spec: SPEC-002"
```

---

### Task 3: The policy module

**Files:**
- Create: `gates/policy/ergo.rego` (copy), `gates/policy/controls.rego`, `gates/policy/build.sh`
- Create (built): `gates/policy/controls.wasm`, `gates/policy/controls.sources.sha256`
- Create: `gates/lib/controls.mjs`
- Create: `test/controls.test.mjs`
- Modify: `package.json` (devDependency `@open-policy-agent/opa-wasm`), `NOTICE`

**Interfaces:**
- Consumes: the model from Task 2.
- Produces: `evaluateControls(input, { stage: 'change' | 'merge' }) -> Promise<{ allowed: boolean, failing: string[], pending: {requirement, description}[], report, violations, problems: string[], controls: {[controlKey]: elementId}, policySha: string, error?: string }>` from `gates/lib/controls.mjs`. `controls` maps each control key to the unique-id of the node it sits on, or `"system"`. Input shape: `{ architecture, change: { commit, diff_sha256?, author, spec?, files: [{path, node: string|null}], nodes: string[], connections: [{id, source, destination: string|null}], review?, approval? }, spec: { id, approved, nodes } }`.

- [ ] **Step 1: Write the failing tests**

`test/controls.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { evaluateControls } from '../gates/lib/controls.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const model = () => JSON.parse(readFileSync(`${ROOT}architecture/trade-capture.architecture.json`, 'utf8'));
const architect = () => {
  const doc = model();
  doc.relationships.push({ 'unique-id': 'trade-api-to-client-ledger', description: 'Trade API writes trades straight to the Client Ledger', 'relationship-type': { connects: { source: { node: 'trade-api' }, destination: { node: 'client-ledger' } } } });
  return doc;
};
const review = { reviewer: 'review-bot', verdict: 'approve', commit: 'c0ffee1', diff_sha256: 'd1ff01', verified: true };
const approval = { approver: 'alice', commit: 'c0ffee1', diff_sha256: 'd1ff01', verified: true, used: false };
const tradeApiChange = {
  commit: 'c0ffee1', diff_sha256: 'd1ff01', author: 'author-agent', spec: 'SPEC-001',
  files: [{ path: 'services/trade-api/src/app.ts', node: 'trade-api' }], nodes: ['trade-api'],
  connections: [{ id: 'trade-api->position-service', source: 'trade-api', destination: 'position-service' }],
  review,
};
const ledgerChange = { ...tradeApiChange, files: [{ path: 'services/position-service/src/app.ts', node: 'position-service' }], nodes: ['position-service'] };
const spec = { id: 'SPEC-001', approved: true, nodes: ['trade-api', 'position-service'] };
const input = (change, architecture = model(), s = spec) => ({ architecture, change, spec: s });
const merge = (doc) => evaluateControls(doc, { stage: 'merge' });
const ci = (doc) => evaluateControls(doc, { stage: 'change' });
const has = (r, want) => r.violations.some((v) => Object.entries(want).every(([k, val]) => (k === 'subject' ? v.subject?.id === val : v[k] === val)));
const status = (r, name) => r.report.requirements[name]?.status;

test('S1 routine trade-api change reviewed by review-bot: allowed at merge', async () => {
  const r = await merge(input(tradeApiChange));
  assert.equal(r.allowed, true, JSON.stringify(r.violations, null, 2));
  assert.equal(status(r, 'client-ledger-human-approval'), 'not_applicable');
});

test('S2 the author reviews its own change: denied', async () => {
  const r = await merge(input({ ...tradeApiChange, review: { ...review, reviewer: 'author-agent' } }));
  assert.equal(r.allowed, false);
  assert.ok(has(r, { requirement: 'code-review', check: 'not_the_author', cause: 'value' }));
});

test('S3 a position-service change with no approval: denied on the ledger connection', async () => {
  const r = await merge(input(ledgerChange));
  assert.equal(r.allowed, false);
  assert.ok(has(r, { requirement: 'client-ledger-human-approval', subject: 'position-service-to-client-ledger', check: 'human_approved', cause: 'absent' }));
});

test('S4 the same change approved by alice: allowed', async () => {
  const r = await merge(input({ ...ledgerChange, approval }));
  assert.equal(r.allowed, true, JSON.stringify(r.violations, null, 2));
});

test('S4b an approval bound to another diff: denied', async () => {
  const r = await merge(input({ ...ledgerChange, approval: { ...approval, diff_sha256: 'other' } }));
  assert.equal(r.allowed, false);
  assert.ok(has(r, { check: 'approval_for_this_diff', cause: 'value' }));
});

test('approver must be a listed person who is neither author nor reviewer', async () => {
  for (const approver of ['author-agent', 'review-bot', 'mallory']) {
    const r = await merge(input({ ...ledgerChange, approval: { ...approval, approver } }));
    assert.equal(r.allowed, false, approver);
  }
});

test('S6 the architect adds trade-api -> client-ledger: the S1 change is denied', async () => {
  const r = await merge(input(tradeApiChange, architect()));
  assert.equal(r.allowed, false);
  assert.ok(has(r, { requirement: 'client-ledger-human-approval', subject: 'trade-api-to-client-ledger', check: 'human_approved', cause: 'absent' }));
});

test('S5 the shortcut: code connects trade-api -> client-ledger without it in the model: denied in CI', async () => {
  const r = await ci(input({ ...tradeApiChange, connections: [{ id: 'trade-api->client-ledger', source: 'trade-api', destination: 'client-ledger' }] }));
  assert.equal(r.allowed, false);
  assert.ok(has(r, { requirement: 'service-dependency', subject: 'trade-api->client-ledger', check: 'in_architecture' }));
});

test('S5b the same code after the architect adds the connection, approved: allowed at merge', async () => {
  const r = await merge(input({ ...tradeApiChange, connections: [{ id: 'trade-api->client-ledger', source: 'trade-api', destination: 'client-ledger' }], approval }, architect()));
  assert.equal(r.allowed, true, JSON.stringify(r.violations, null, 2));
});

test('S9 touching a node the spec does not declare: denied in CI', async () => {
  const r = await ci(input({ ...tradeApiChange, files: [...tradeApiChange.files, { path: 'services/position-service/src/app.ts', node: 'position-service' }], nodes: ['trade-api', 'position-service'] }, model(), { ...spec, nodes: ['trade-api'] }));
  assert.equal(r.allowed, false);
  assert.ok(has(r, { requirement: 'requirements-scope', subject: 'position-service', check: 'in_spec' }));
});

test('docs-only change needs no spec: allowed in CI', async () => {
  const r = await ci(input({ commit: 'c0ffee1', author: 'someone', files: [{ path: 'README.md', node: null }], nodes: [], connections: [] }, model(), { id: null, approved: false, nodes: [] }));
  assert.equal(r.allowed, true, JSON.stringify(r.violations, null, 2));
});

test('unowned file needs a spec: denied in CI without one', async () => {
  const r = await ci(input({ commit: 'c0ffee1', author: 'someone', files: [{ path: 'gates/check.mjs', node: null }], nodes: [], connections: [] }, model(), { id: null, approved: false, nodes: [] }));
  assert.equal(r.allowed, false);
  assert.ok(has(r, { requirement: 'change-names-approved-spec', check: 'names_a_spec' }));
});

test('spec id that does not match the change: denied in CI', async () => {
  const r = await ci(input(tradeApiChange, model(), { ...spec, id: 'SPEC-999' }));
  assert.equal(r.allowed, false);
  assert.ok(has(r, { requirement: 'change-names-approved-spec', check: 'spec_exists' }));
});

test('unowned file needs a human at merge, and CI lists it as pending', async () => {
  const change = { ...tradeApiChange, files: [{ path: 'architecture/trade-capture.architecture.json', node: null }], nodes: [], connections: [] };
  const atMerge = await merge(input(change));
  assert.equal(atMerge.allowed, false);
  assert.ok(has(atMerge, { requirement: 'control-plane-human-approval', subject: 'architecture/trade-capture.architecture.json', check: 'human_approved' }));
  const inCi = await ci(input(change));
  assert.equal(inCi.allowed, true, JSON.stringify(inCi.violations, null, 2));
  assert.ok(inCi.pending.some((p) => p.requirement === 'control-plane-human-approval'));
});

test('a control without ergo is a problem, naming the control', async () => {
  const doc = model();
  delete doc.nodes.find((n) => n['unique-id'] === 'client-ledger').controls['client-ledger-human-approval'].requirements[0].config.ergo;
  const r = await merge(input({ ...ledgerChange, approval }, doc));
  assert.equal(r.allowed, false);
  assert.ok(r.problems.some((p) => p.includes('client-ledger-human-approval')), JSON.stringify(r.problems));
});

test('two controls defining the same subject differently: denied, not thrown', async () => {
  const doc = model();
  doc.controls['duplicate'] = structuredClone(doc.controls['sdlc-prev-001-code-review']);
  doc.controls['duplicate'].requirements[0].config.ergo.subjects['change under review'].id = ['diff_sha256'];
  const r = await merge(input(tradeApiChange, doc));
  assert.equal(r.allowed, false);
  assert.match(r.error ?? '', /conflict/);
});

test('controls maps each control to the element it sits on', async () => {
  const r = await merge(input(tradeApiChange));
  assert.equal(r.controls['client-ledger-human-approval'], 'client-ledger');
  assert.equal(r.controls['sdlc-prev-001-code-review'], 'system');
});

test('the committed Wasm module was built from the committed Rego', () => {
  const src = ['gates/policy/ergo.rego', 'gates/policy/controls.rego'].map((f) => readFileSync(`${ROOT}${f}`)).reduce((h, b) => h.update(b), createHash('sha256')).digest('hex');
  assert.equal(readFileSync(`${ROOT}gates/policy/controls.sources.sha256`, 'utf8').trim(), src);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test 2>&1 | tail -5`
Expected: FAIL, `Cannot find module '../gates/lib/controls.mjs'`.

- [ ] **Step 3: Add the dependency, copy ergo, credit it**

```bash
npm install --save-dev @open-policy-agent/opa-wasm@^1.10.0
mkdir -p gates/policy && cp .amp/in/ergo/ergo.rego gates/policy/ergo.rego
git -C .amp/in/ergo log -1 --format=%h   # expect d924f4d
```

Append to `NOTICE`:

```
gates/policy/ergo.rego is copied unchanged from ergo (https://github.com/kosli-dev/ergo) at commit d924f4d,
licensed under the Apache License 2.0.
```

- [ ] **Step 4: Write the policy entrypoint**

`gates/policy/controls.rego`:

```rego
package controls

import data.ergo

entries := array.concat(
	[{"key": key, "on": "system", "config": r.config} |
		some key, c in object.get(input.architecture, "controls", {})
		some r in c.requirements
	],
	[{"key": key, "on": n["unique-id"], "config": r.config} |
		some n in input.architecture.nodes
		some key, c in object.get(n, "controls", {})
		some r in c.requirements
	],
)

with_ergo := [e | some e in entries; e.config.ergo]

policy := {
	"subjects": {name: s | some e in with_ergo; some name, s in e.config.ergo.subjects},
	"requirements": {name: q | some e in with_ergo; some name, q in e.config.ergo.requirements},
}

covered contains m if {
	some q in policy.requirements
	m := q.meta["calm-control"]
}

problems := array.concat(
	[concat("", ["control ", e.key, " has neither config.ergo nor evaluated-by: pipeline"]) |
		some e in entries
		not e.config.ergo
		not e.config["evaluated-by"] == "pipeline"
	],
	[concat("", ["control ", e.key, " has no requirement whose meta.calm-control names it"]) |
		some e in with_ergo
		not covered[e.key]
	],
)

report := ergo.report(input, policy, {})

result := {
	"report": report,
	"violations": ergo.violations(report),
	"problems": problems,
	"controls": {e.key: e.on | some e in entries},
}
```

- [ ] **Step 5: Write the build script and build**

`gates/policy/build.sh`:

```bash
#!/usr/bin/env bash
# Builds controls.wasm from ergo.rego and controls.rego, and records the sha256 of those sources so a test can
# tell when the committed module is stale. The gates never shell out to opa; only the maintainer runs this.
set -euo pipefail
cd "$(dirname "$0")"
OPA="${OPA:-opa}"
"$OPA" check --strict ergo.rego controls.rego
"$OPA" build -t wasm -e controls/result -o bundle.tar.gz ergo.rego controls.rego
tar -xzOf bundle.tar.gz /policy.wasm > controls.wasm
rm bundle.tar.gz
cat ergo.rego controls.rego | shasum -a 256 | cut -d' ' -f1 > controls.sources.sha256
echo "built controls.wasm with $("$OPA" version | head -1) ($(shasum -a 256 controls.wasm | cut -c1-12))"
```

Run: `OPA=.amp/in/bin/opa bash gates/policy/build.sh`
Expected: `built controls.wasm with Version: 1.21.1 (...)`.

- [ ] **Step 6: Write the Node evaluator**

`gates/lib/controls.mjs`:

```js
// Evaluates the controls the CALM model carries. The policy is data in the model; controls.wasm is the generic
// module (ergo plus gates/policy/controls.rego) that turns it into a report. stage 'change' blocks only on
// requirements whose meta.stage is 'change' (CI); stage 'merge' blocks on all of them (the merge gateway).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPolicy } from '@open-policy-agent/opa-wasm';
import { ROOT, sha256 } from './calm.mjs';

const WASM = join(ROOT, 'gates/policy/controls.wasm');

// ergo's Wasm notes: the JS runtime lacks this built-in. None of our checks compare times.
const parseTime = (v) => {
  const [, time, fraction = '', zone] = /^(.{19})(?:\.(\d+))?(.*)$/.exec(v);
  return JSON.rawJSON(String(BigInt(Date.parse(time + zone)) / 1000n * 1000000000n + BigInt(fraction.padEnd(9, '0').slice(0, 9))));
};

let loaded;
const policy = async () => (loaded ??= await loadPolicy(readFileSync(WASM), undefined, { 'time.parse_rfc3339_ns': parseTime }));

export async function evaluateControls(input, { stage }) {
  const policySha = sha256(readFileSync(WASM));
  let result;
  try {
    result = (await policy()).evaluate(input, 'controls/result')[0]?.result;
  } catch (thrown) {
    return { allowed: false, failing: [], pending: [], violations: [], problems: [], controls: {}, policySha, error: String(thrown) };
  }
  if (!result?.report?.requirements) {
    return { allowed: false, failing: [], pending: [], violations: [], problems: [], controls: {}, policySha, error: 'the policy returned no report' };
  }
  const { report, violations, problems, controls } = result;
  const entries = Object.entries(report.requirements);
  const blocking = entries.filter(([, q]) => stage === 'merge' || q.meta?.stage === 'change');
  const failing = blocking.filter(([, q]) => q.status === 'not_met').map(([name]) => name);
  const pending = stage === 'merge' ? [] : entries
    .filter(([, q]) => q.meta?.stage === 'merge' && q.status !== 'not_applicable')
    .map(([requirement, q]) => ({ requirement, description: q.description }));
  return {
    allowed: problems.length === 0 && blocking.length > 0 && failing.length === 0,
    failing,
    pending,
    report,
    violations: violations.filter((v) => failing.includes(v.requirement)),
    problems,
    controls,
    policySha,
  };
}
```

- [ ] **Step 7: Run the tests**

Run: `npm test 2>&1 | grep -E '^ℹ (pass|fail)|^✖'`
Expected: every test passes. If one fails, debug the policy or the model (not the test's expectation), rebuild with `build.sh`, and rerun.

- [ ] **Step 8: Commit**

```bash
git add gates/policy gates/lib/controls.mjs test/controls.test.mjs package.json package-lock.json NOTICE
git commit -m "feat(gates): one ergo policy module evaluates the controls the model carries

Spec: SPEC-002"
```

---

### Task 4: Facts about the change, and `gates/check.mjs`

**Files:**
- Modify: `gates/lib/calm.mjs` (add `observedConnections`, `baseArchitecture`, `changeInput`)
- Create: `gates/check.mjs`
- Create: `test/facts.test.mjs`

**Interfaces:**
- Consumes: `evaluateControls` from Task 3.
- Produces: `observedConnections(arch) -> [{id, source, destination: string|null, evidence: string}]`; `baseArchitecture(base?) -> object`; `changeInput({ arch, base }) -> input` (the shape in Task 3, without `review` and `approval`); `runChecks() -> Promise<{ admissible: boolean, results: [{gate, passed, findings, summary}] }>` from `gates/check.mjs`. Plan 3b's gateway calls `changeInput` and adds `review`, `approval` and `diff_sha256`.

- [ ] **Step 1: Write the failing tests**

`test/facts.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { baseArchitecture, loadArchitecture, observedConnections } from '../gates/lib/calm.mjs';

test('the connections the code makes today are the three the model has', () => {
  const ids = observedConnections(loadArchitecture()).map((c) => c.id).sort();
  assert.deepEqual(ids, ['position-service->client-ledger', 'trade-api->position-service', 'trade-api->trade-store']);
});

test('an env name no interface declares is a connection with no destination', () => {
  const arch = loadArchitecture();
  arch.nodes.find((n) => n['unique-id'] === 'client-ledger').interfaces = [];
  const c = observedConnections(arch).find((x) => x.source === 'position-service' && x.destination === null);
  assert.ok(c, 'position-service reads POSITION_STORE_PATH, which no interface now declares');
});

test('base architecture is used, not the working tree', () => {
  const head = JSON.parse(execFileSync('git', ['show', 'HEAD:architecture/trade-capture.architecture.json'], { encoding: 'utf8' }));
  assert.deepEqual(baseArchitecture('HEAD'), head);
});

test('a base model with no ergo policy at all falls back to the working tree (bootstrap only)', () => {
  // 5b09598 is main before SPEC-002: its model carries no ergo policy.
  assert.deepEqual(baseArchitecture('5b09598'), loadArchitecture());
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test 2>&1 | grep -E 'facts|SyntaxError|does not provide' | head -5`
Expected: FAIL, `observedConnections` is not exported.

- [ ] **Step 3: Add the facts to `gates/lib/calm.mjs`**

Append:

```js
/**
 * Every connection the code makes, found the way drift-check always did: process.env reads mapped to the node
 * whose interface declares that env-binding, and relative imports that reach into another node's source-path.
 * An env name no interface declares is a connection with destination null. One entry per source->destination.
 */
export const observedConnections = (arch) => {
  const bindings = envBindings(arch);
  const found = new Map();
  const add = (source, destination, evidence) => {
    const id = `${source}->${destination ?? 'undeclared'}`;
    if (!found.has(id)) found.set(id, { id, source, destination, evidence });
  };
  for (const node of codeNodes(arch)) {
    const id = node['unique-id'];
    for (const file of walk(join(ROOT, node.metadata['source-path'])).filter((f) => /\.(ts|js|mjs)$/.test(f))) {
      readFileSync(file, 'utf8').split('\n').forEach((text, i) => {
        for (const m of text.matchAll(/process\.env\.([A-Z0-9_]+)|process\.env\[['"]([A-Z0-9_]+)['"]\]/g)) {
          const name = m[1] ?? m[2];
          const owner = bindings.get(name);
          if (owner !== id) add(id, owner ?? null, `${rel(file)}:${i + 1} env ${name}`);
        }
        const imp = text.match(/from\s+['"](\.{1,2}\/[^'"]+)['"]/);
        if (imp) {
          const target = nodeForPath(arch, rel(resolve(dirname(file), imp[1])));
          if (target && target['unique-id'] !== id) add(id, target['unique-id'], `${rel(file)}:${i + 1} import ${imp[1]}`);
        }
      });
    }
  }
  return [...found.values()].sort((a, b) => a.id.localeCompare(b.id));
};

const carriesPolicy = (arch) => /"ergo"\s*:/.test(JSON.stringify(arch.controls ?? {})) || arch.nodes.some((n) => /"ergo"\s*:/.test(JSON.stringify(n.controls ?? {})));

/**
 * The architecture on the base of the change: its controls decide, never the change's own copy of the model.
 * One exception, for bootstrapping: a base model that carries no ergo policy at all (before SPEC-002 merged)
 * cannot evaluate anything, so the working tree's model is used. Once the base carries a policy this never fires,
 * so a change cannot use it to remove its own controls.
 */
export const baseArchitecture = (base = changeBase()) => {
  let arch;
  try { arch = JSON.parse(git('show', `${base}:${ARCHITECTURE}`)); } catch { return loadArchitecture(); }
  return carriesPolicy(arch) ? arch : loadArchitecture();
};

/** The facts the controls are evaluated on, for the change between base and the working tree. */
export const changeInput = ({ arch, base = changeBase() }) => {
  const files = changedFiles(base).map((path) => ({ path, node: nodeForPath(arch, path)?.['unique-id'] ?? null }));
  const specId = currentSpecId();
  const spec = loadSpecs().find((s) => s.id === specId);
  return {
    architecture: arch,
    change: {
      commit: gitInfo().commit,
      author: process.env.CHANGE_AUTHOR_ID ?? 'unknown',
      ...(specId ? { spec: specId } : {}),
      files,
      nodes: [...new Set(files.map((f) => f.node).filter(Boolean))].sort(),
      connections: observedConnections(arch),
    },
    spec: spec ? { id: spec.id, approved: spec.status === 'approved', nodes: spec['calm-nodes'] ?? [] } : { id: specId ?? null, approved: false, nodes: [] },
  };
};
```

- [ ] **Step 4: Write `gates/check.mjs`**

```js
#!/usr/bin/env node
// SDLC-PREV-012 Deployment Gating: run every blocking gate the model names. 'controls' evaluates the ergo policies
// the base branch's model carries against this change; requirements that need a review or a human approval are
// listed as pending, for the merge gateway. SDLC-PREV-014: the full control report is kept in evidence/out.
// Usage: node gates/check.mjs [--json]
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, ARCHITECTURE, architectureSha, baseArchitecture, changeBase, changeInput } from './lib/calm.mjs';
import { evaluateControls } from './lib/controls.mjs';

const run = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } });

const runners = {
  'calm-validate': async () => {
    const out = join(mkdtempSync(join(tmpdir(), 'calm-')), 'validate.json');
    const r = run('npx', ['--no-install', 'calm', 'validate', '-p', 'architecture/governed-service.pattern.json', '-a', ARCHITECTURE, '-u', 'architecture/url-mapping.json', '-f', 'json', '-o', out]);
    let parsed = {};
    try { parsed = JSON.parse(readFileSync(out, 'utf8')); } catch { /* exit code decides */ }
    const passed = r.status === 0 && parsed.hasErrors !== true;
    return { gate: 'calm-validate', passed, findings: passed ? [] : [{ level: 'error', message: 'The model failed validation. Run `npm run calm:validate`.' }], summary: passed ? 'Model valid against CALM 1.2, the pattern and its Standards.' : 'Model, pattern conformance or a control config is invalid.' };
  },
  tests: async () => {
    const files = readdirSync(join(ROOT, 'test')).filter((f) => /\.test\.(ts|mjs)$/.test(f)).map((f) => `test/${f}`);
    const r = run('npx', ['--no-install', 'tsx', '--test', '--test-reporter=tap', ...files]);
    const count = (k) => Number(r.stdout.match(new RegExp(`# ${k} (\\d+)`))?.[1] ?? 0);
    return { gate: 'tests', passed: r.status === 0, findings: r.status === 0 ? [] : [{ level: 'error', message: 'Test failures. Run `npm test`.' }], summary: `${count('pass')} passed, ${count('fail')} failed.` };
  },
  controls: async () => {
    const base = changeBase();
    const input = changeInput({ arch: baseArchitecture(base), base });
    const outcome = await evaluateControls(input, { stage: 'change' });
    mkdirSync(join(ROOT, 'evidence/out'), { recursive: true });
    writeFileSync(join(ROOT, 'evidence/out/controls-report.json'), JSON.stringify({ comparedTo: base, commit: input.change.commit, spec: input.spec.id, architectureSha256: architectureSha(), policySha256: outcome.policySha, outcome }, null, 2));
    const findings = [
      ...(outcome.error ? [{ level: 'error', message: `The policy could not be evaluated: ${outcome.error}` }] : []),
      ...outcome.problems.map((message) => ({ level: 'error', message })),
      ...outcome.violations.map((v) => ({ level: 'error', message: `${v.requirement}: ${v.subject?.id}: ${v.description}` })),
      ...outcome.pending.map((p) => ({ level: 'info', message: `needed at merge: ${p.description}` })),
    ];
    return { gate: 'controls', passed: outcome.allowed, findings, summary: `${Object.keys(outcome.report?.requirements ?? {}).length} requirements from the model, evaluated against ${base}.` };
  },
};

export async function runChecks() {
  const blocking = baseArchitecture().controls['sdlc-prev-012-deployment-gating'].requirements[0].config['blocking-gates'];
  const results = [];
  for (const name of blocking) {
    results.push(runners[name] ? await runners[name]() : { gate: name, passed: false, findings: [{ level: 'error', message: `The model requires gate "${name}" but no runner exists for it` }] });
  }
  return { admissible: results.every((r) => r.passed), results };
}

if (process.argv[1]?.endsWith('check.mjs')) {
  const { admissible, results } = await runChecks();
  if (process.argv.includes('--json')) console.log(JSON.stringify({ admissible, results }, null, 2));
  else {
    for (const r of results) {
      console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.gate.padEnd(14)} ${r.summary ?? ''}`);
      for (const f of r.findings ?? []) console.log(`      ${f.level.toUpperCase().padEnd(5)} ${f.message}`);
    }
    console.log(`\n${admissible ? 'ADMISSIBLE' : 'BLOCKED'}: ${admissible ? 'every blocking gate passed.' : 'at least one blocking gate failed.'}`);
  }
  process.exitCode = admissible ? 0 : 1;
}
```

`gates/lib/calm.mjs` already imports `resolve` and `dirname`; check the import line includes `readFileSync`, `join`, `resolve`, `dirname` and add any that are missing.

- [ ] **Step 5: Run the tests and the new gate**

Run: `npm test 2>&1 | grep -E '^ℹ (pass|fail)|^✖' && node gates/check.mjs; echo "exit $?"`
Expected: all tests pass. `check.mjs` on the dirty tree under no spec reports `controls` FAIL with `change-names-approved-spec: ...: The change names a spec` (the change touches `gates/`), which is correct. Then `SPEC=SPEC-002 node gates/check.mjs` → `ADMISSIBLE`, with `needed at merge: A change to anything no node owns ...` lines.

- [ ] **Step 6: Commit**

```bash
git add gates/lib/calm.mjs gates/check.mjs test/facts.test.mjs
git commit -m "feat(gates): check.mjs evaluates the base model's controls against the change

Spec: SPEC-002"
```

---

### Task 5: Retire the old gates and point everything at `check.mjs`

**Files:**
- Delete: `gates/spec-check.mjs`, `gates/drift-check.mjs`, `gates/model-diff.mjs`, `gates/review-router.mjs`, `gates/run-all.mjs`, `gates/evidence.mjs`
- Modify: `package.json` (scripts), `.github/workflows/governed-sdlc.yml`, `agent/context.mjs`, `agent/mcp/calm-context-server.mjs`, `agent/GUARDRAILS.md`, `AGENTS.md`, `specs/README.md`

- [ ] **Step 1: Write the failing check**

```bash
grep -rn "spec-check\|drift-check\|model-diff\|review-router\|run-all\|gates/evidence\|npm run evidence\|criticality\|allowed-sources" package.json .github agent AGENTS.md specs/README.md gates | grep -v '^gates/\(spec-check\|drift-check\|model-diff\|review-router\|run-all\|evidence\)\.mjs'
```

Expected: matches (this is the list to clear).

- [ ] **Step 2: Delete the scripts and update `package.json`**

```bash
git rm gates/spec-check.mjs gates/drift-check.mjs gates/model-diff.mjs gates/review-router.mjs gates/run-all.mjs gates/evidence.mjs
```

In `package.json` `scripts`: delete `gate:spec`, `gate:drift`, `gate:review` and `evidence`; set `"gates": "node gates/check.mjs"`.

- [ ] **Step 3: Update the workflow**

In `.github/workflows/governed-sdlc.yml`, job `gates`:
- Replace the step `- run: npm run evidence` and its comment with:

```yaml
      # SDLC-PREV-012 gating + SDLC-PREV-014 evidence: the controls the model carries, evaluated by ergo. Fails the job if any blocking gate fails.
      - run: npm run gates
```

- Delete the step `Publish the review decision` (review routing is now a merge-stage requirement, listed as `needed at merge` in the gate output).

- [ ] **Step 4: Update the agent context and MCP server**

In `agent/context.mjs`:
- Replace the `forbidden` computation and the `mustNotConnectTo` field with nothing (delete both).
- In `node: {...}` delete `criticalityTier` and `dataClassification`.
- Set `rule` to: `'Any connection not listed in mayConnectTo is architectural drift: service dependency control (SDLC-PREV-017) blocks it. If the spec cannot be met within these connections, stop and propose a model change for human review. Do not edit architecture/ to make a gate pass.'`
- In `specContext`, set `rule` to: `` `Only touch code owned by: ${(spec['calm-nodes'] ?? []).join(', ')}. The requirements control (SDLC-PREV-004) blocks anything else.` ``
- In `contextForPath`, keep the note as it is.

In `agent/mcp/calm-context-server.mjs`:
- Replace `import { runAll } from '../../gates/run-all.mjs';` with `import { runChecks } from '../../gates/check.mjs';`
- Replace the `run_gates` handler body with `async ({ specId }) => { process.env.SPEC = specId; return text(await runChecks()); }`
- In the `calm_node_context` description, replace `controls, criticality.` with `controls.`

- [ ] **Step 5: Update the guidance files**

- `AGENTS.md`: delete the table row for `npm run evidence`; change the `npm run gates` row's purpose to `every blocking gate the model names, including the controls it carries`.
- `agent/GUARDRAILS.md`: replace `` `spec-check` enforces it `` with `the requirements control (SDLC-PREV-004) enforces it`, and `` `gates/spec-check.mjs` `` in the same row with `` `gates/check.mjs` ``.
- `specs/README.md`: replace the last paragraph with: ``The requirements control in the model (SDLC-PREV-004, evaluated by `npm run gates`) blocks a change other than documentation that names no approved spec, or that touches a node its spec does not declare. A model change is a change to a file no node owns, so it needs a human approver at merge.``

- [ ] **Step 6: Run the check from Step 1 and the whole suite**

Run the grep from Step 1. Expected: no matches.

Run: `npm run typecheck && npm test 2>&1 | grep -E '^ℹ (pass|fail)' && SPEC=SPEC-002 npm run gates; echo "exit $?"`
Expected: typecheck clean; tests all pass; `ADMISSIBLE`, exit 0.

Run the MCP server's handler once to prove the import works: `node -e "import('./agent/mcp/calm-context-server.mjs')" & sleep 2; kill %1` → no import error printed.

- [ ] **Step 7: Commit**

```bash
git add -A package.json .github/workflows/governed-sdlc.yml agent AGENTS.md specs/README.md gates
git commit -m "chore(gates): retire the six gate scripts; everything runs the model's controls

Spec: SPEC-002"
```

---

### Task 6: Hand-off

- [ ] **Step 1: Show Matthew the control-plane diff and stop before pushing**

```bash
git diff --stat main...HEAD -- architecture gates agent .github AGENTS.md
```

Report the stat and the full gate output from `SPEC=SPEC-002 npm run gates` in the final message, and ask Matthew to review the control-plane diff and approve the push of `feat/controls-as-ergo`. The gateway job in CI still runs the old `gateway/policy/merge.rego` demo, which reads `criticality-tier` and will fail until plan 3b lands; say so.
