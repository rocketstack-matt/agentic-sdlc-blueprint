# Plan 1: ergo × CALM spike — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove, with throwaway code, that ergo can evaluate controls held in a CALM architecture, run as WebAssembly from Node, and produce the four demo verdicts, including a newly added connection pulling `trade-api` into the ledger rule. Then write down what we learned.

**Architecture:** A generic Rego entrypoint collects the ergo `subjects` and `requirements` from every control `config` in `input.architecture` (system controls and node controls), and calls `ergo.report(input, policy, {})`. The input is `{ architecture, change, spec }`. The policy is plain data in the model, so the Wasm module never changes when the model does. A Node test drives scenarios through the Wasm build and compares each report with `opa eval`.

**Tech Stack:** OPA 1.21.1 (CLI, for `opa build -t wasm` and `opa eval`), ergo `ergo.rego` at commit `d924f4d` (9 Oct 2026), Node 22+ with `node:test`, `@open-policy-agent/opa-wasm` ^1.10.0.

**Spec:** `docs/superpowers/specs/2026-10-12-osff-talk-reframe-design.md` (Delivery order step 1; Part 2, sections 2.1 to 2.3)

This is plan 1 of 5. Plans 2 to 5 (decorator Standard; model, policy and gateway; Hub UI; deck) are written after this spike reports, because its findings decide the policy code.

## Global Constraints

- Everything this plan builds lives in `.amp/in/spike/` and `.amp/in/bin/`, which are git-excluded. It is throwaway. The only committed output is the findings note in Task 7.
- Nothing under `architecture/`, `gates/`, `agent/`, `.github/` or `AGENTS.md` is modified. The spike works on a generated copy of the model.
- OPA 1.19 or later; use 1.21.1, the version `gateway/policy/build.sh` was last run with.
- ergo is copied unchanged from `kosli-dev/ergo` at `d924f4d`. Do not edit `ergo.rego`.
- Prefer ergo built-in operators. Write a custom operator only if a scenario cannot be expressed without one, and record why in the findings.
- No tiers, no data classifications, no SPIFFE ids in the fixtures. Identities are plain names: `author-agent`, `review-bot`, `alice`.
- From your own Rego, call only `ergo.report` and `ergo.violations`.

## Review Focus

1. **A docs-only change touches no nodes** (`change.nodes` is `[]`). People expect it to pass. ergo's `in` fails on empty `values`; if that makes the ledger filter unreadable, every docs change would be blocked. Pinned by scenario S10 in Task 4.
2. **The model holds relationships that are not `connects`** (`interacts`, `composed-of`). People expect them to be ignored by the ledger rule, not to fail it. Pinned by S1 (the base model has both kinds) in Task 3 and the `present` filter in Task 4.
3. **Two controls define the same subject or requirement name.** People expect a deny, not a silent merge. Pinned by S11 in Task 5.
4. **The Wasm build and `opa eval` disagree.** People expect the gateway (Wasm) and CI (`opa eval`) to give the same answer. Pinned by the parity test in Task 6.
5. **An approval that is present but bound to another diff.** People expect a deny that names the diff. Pinned by S4b in Task 4.

---

### Task 1: Toolchain and scaffold

**Files:**
- Create: `.amp/in/bin/opa` (downloaded binary)
- Create: `.amp/in/spike/ergo.rego` (copied from `.amp/in/ergo/ergo.rego`)
- Create: `.amp/in/spike/package.json`
- Create: `.amp/in/spike/build.sh`

**Interfaces:**
- Produces: `.amp/in/bin/opa` (OPA 1.21.1); `bash .amp/in/spike/build.sh` builds `.amp/in/spike/policy.wasm` with entrypoints `controls/report` and `controls/violations`.

- [ ] **Step 1: Confirm the git exclude is in place**

Run: `grep -n '^/.amp/in/' "$(git rev-parse --git-path info/exclude)"`
Expected: one line, `/.amp/in/`. If missing, append it.

- [ ] **Step 2: Download OPA 1.21.1**

```bash
mkdir -p .amp/in/bin
curl -fsSL -o .amp/in/bin/opa https://github.com/open-policy-agent/opa/releases/download/v1.21.1/opa_darwin_arm64_static
chmod +x .amp/in/bin/opa
.amp/in/bin/opa version | head -1
```

Expected: `Version: 1.21.1`. If the static asset is not published for darwin arm64, use `opa_darwin_arm64` from the same release.

- [ ] **Step 3: Copy ergo and record its commit**

```bash
mkdir -p .amp/in/spike
git -C .amp/in/ergo log -1 --format=%h   # expect d924f4d
cp .amp/in/ergo/ergo.rego .amp/in/spike/ergo.rego
```

If `.amp/in/ergo` is missing: `git clone https://github.com/kosli-dev/ergo .amp/in/ergo && git -C .amp/in/ergo checkout d924f4d`.

- [ ] **Step 4: Write `package.json` and install the Wasm runtime**

`.amp/in/spike/package.json`:

```json
{
  "name": "ergo-calm-spike",
  "private": true,
  "type": "module",
  "scripts": { "build": "bash build.sh", "test": "node --test" },
  "dependencies": { "@open-policy-agent/opa-wasm": "^1.10.0" }
}
```

Run: `cd .amp/in/spike && npm install`
Expected: installs without errors.

- [ ] **Step 5: Write `build.sh`**

`.amp/in/spike/build.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
OPA="${OPA:-../bin/opa}"
"$OPA" check --strict ergo.rego controls.rego
"$OPA" build -t wasm -e controls/report -e controls/violations -o bundle.tar.gz ergo.rego controls.rego
tar -xzOf bundle.tar.gz /policy.wasm > policy.wasm
rm bundle.tar.gz
echo "built policy.wasm ($(shasum -a 256 policy.wasm | cut -c1-12))"
```

It needs `controls.rego`, written in Task 3. Do not run it yet.

---

### Task 2: Fixtures generated from the real model

**Files:**
- Create: `.amp/in/spike/controls.json`
- Create: `.amp/in/spike/build-fixtures.mjs`
- Output: `.amp/in/spike/fixtures/architecture.json`, `fixtures/architecture-architect.json`, `fixtures/architecture-typo.json`, `fixtures/architecture-clash.json`

**Interfaces:**
- Consumes: `architecture/trade-capture.architecture.json` (read only).
- Produces: fixture architectures in which `position-store` is renamed `client-ledger` ("Client Ledger"), tier and classification metadata are gone, and controls come from `controls.json`. `controls.json` has the shape `{ "system": { <control-key>: <CALM control> }, "nodes": { <node-id>: { <control-key>: <CALM control> } } }`. Every CALM control here has the shape `{ "description": string, "requirements": [ { "requirement-url": string, "config": { "control-id": string, "name": string, "ergo": { "subjects": {...}, "requirements": {...} } } } ] }`.

- [ ] **Step 1: Write `controls.json` with the code review control only**

Tasks 4 and 5 add the other three controls to this file.

```json
{
  "system": {
    "sdlc-prev-001-code-review": {
      "description": "Every change is reviewed by an approved reviewer who is not its author.",
      "requirements": [
        {
          "requirement-url": "https://hub.calm.finos.org/calm/domains/finos-sdlc-common-controls/controls/sdlc-prev-001-code-review/requirement/versions/1.0.0",
          "config": {
            "control-id": "SDLC-PREV-001",
            "name": "Code Review",
            "ergo": {
              "subjects": {
                "change under review": {
                  "description": "The change proposed for merge",
                  "from": ["change"],
                  "id": ["commit"]
                }
              },
              "requirements": {
                "code-review": {
                  "description": "Every change is reviewed by an approved reviewer who is not its author",
                  "meta": { "control-id": "SDLC-PREV-001", "calm-control": "sdlc-prev-001-code-review" },
                  "subject": "change under review",
                  "checks": {
                    "review_approves": { "description": "The review approves the change", "op": "equals", "path": ["review", "verdict"], "value": "approve" },
                    "review_verified": { "description": "The review record's signature checked out", "op": "equals", "path": ["review", "verified"], "value": true },
                    "not_the_author": { "description": "The author may not review its own change", "op": "compare", "left": ["review", "reviewer"], "right": ["author"], "cmp": "ne" },
                    "approved_reviewer": { "description": "The reviewer is an approved reviewer", "op": "in", "path": ["review", "reviewer"], "values": ["review-bot"] },
                    "review_of_this_commit": { "description": "The review is of this commit", "op": "compare", "left": ["review", "commit"], "right": ["commit"], "cmp": "eq" },
                    "review_of_this_diff": { "description": "The review is of this exact diff", "op": "compare", "left": ["review", "diff_sha256"], "right": ["diff_sha256"], "cmp": "eq" }
                  }
                }
              }
            }
          }
        }
      ]
    }
  },
  "nodes": {}
}
```

- [ ] **Step 2: Write `build-fixtures.mjs`**

```js
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const here = (p) => new URL(p, import.meta.url);
const source = readFileSync(here('../../../architecture/trade-capture.architecture.json'), 'utf8');
const controls = JSON.parse(readFileSync(here('./controls.json'), 'utf8'));

const arch = JSON.parse(source.replaceAll('position-store', 'client-ledger').replaceAll('Position Store', 'Client Ledger'));
for (const node of arch.nodes) {
  if (node.metadata) {
    delete node.metadata['criticality-tier'];
    delete node.metadata['data-classification'];
  }
  delete node.controls;
  if (controls.nodes[node['unique-id']]) node.controls = controls.nodes[node['unique-id']];
}
arch.controls = controls.system;

const architect = structuredClone(arch);
architect.relationships.push({
  'unique-id': 'trade-api-to-client-ledger',
  description: 'Trade API writes trades straight to the Client Ledger',
  'relationship-type': { connects: { source: { node: 'trade-api' }, destination: { node: 'client-ledger' } } },
});

const typo = structuredClone(arch);
const review = typo.controls['sdlc-prev-001-code-review'].requirements[0].config.ergo.requirements['code-review'];
review.checks.review_approves.op = 'equalz';

const clash = structuredClone(arch);
clash.controls['duplicate-control'] = structuredClone(clash.controls['sdlc-prev-001-code-review']);
clash.controls['duplicate-control'].requirements[0].config.ergo.subjects['change under review'].id = ['diff_sha256'];

mkdirSync(here('./fixtures/'), { recursive: true });
for (const [name, doc] of Object.entries({ architecture: arch, 'architecture-architect': architect, 'architecture-typo': typo, 'architecture-clash': clash })) {
  writeFileSync(here(`./fixtures/${name}.json`), JSON.stringify(doc, null, 2));
}
console.log('fixtures written');
```

- [ ] **Step 3: Generate and inspect**

Run: `cd .amp/in/spike && node build-fixtures.mjs && node -e "const a=require('./fixtures/architecture.json'); console.log(a.nodes.map(n=>n['unique-id']).join(' '), '|', a.relationships.map(r=>r['unique-id']).join(' '))"`

Expected: `trader trade-capture trade-api position-service trade-store client-ledger | trader-uses-trade-api trade-api-to-position-service trade-api-to-trade-store position-service-to-client-ledger trade-capture-composition`

---

### Task 3: Entrypoint, harness and the code review control

**Files:**
- Create: `.amp/in/spike/controls.rego`
- Create: `.amp/in/spike/harness.mjs`
- Create: `.amp/in/spike/spike.test.mjs`

**Interfaces:**
- Consumes: `fixtures/*.json` from Task 2; `build.sh` from Task 1.
- Produces: `harness.mjs` exporting `evaluate(input) -> { report, violations }` (Wasm), `viaOpa(input) -> report` (`opa eval`), `arch(name) -> object`, `input(architecture, changeOverrides?) -> object`, `approval` (object), `status(result, requirement) -> string | undefined`, `has(result, { requirement?, subject?, check?, cause? }) -> boolean`, `buildFixtures()`.

- [ ] **Step 1: Write the harness**

`.amp/in/spike/harness.mjs`:

```js
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPolicy } from '@open-policy-agent/opa-wasm';

const dir = fileURLToPath(new URL('.', import.meta.url));
const OPA = process.env.OPA ?? fileURLToPath(new URL('../bin/opa', import.meta.url));

const parseTime = (v) => {
  const [, time, fraction = '', zone] = /^(.{19})(?:\.(\d+))?(.*)$/.exec(v);
  return JSON.rawJSON(String(BigInt(Date.parse(time + zone)) / 1000n * 1000000000n + BigInt(fraction.padEnd(9, '0').slice(0, 9))));
};

export const buildFixtures = () => execFileSync('node', ['build-fixtures.mjs'], { cwd: dir });
buildFixtures();
execFileSync('bash', ['build.sh'], { cwd: dir, env: { ...process.env, OPA } });
export const policy = await loadPolicy(readFileSync(new URL('./policy.wasm', import.meta.url)), undefined, { 'time.parse_rfc3339_ns': parseTime });

export const arch = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

const baseChange = {
  commit: 'c0ffee1',
  diff_sha256: 'd1ff01',
  author: 'author-agent',
  spec: 'SPEC-001',
  nodes: ['trade-api'],
  connections: [{ id: 'trade-api->position-service', source: 'trade-api', destination: 'position-service' }],
  review: { reviewer: 'review-bot', verdict: 'approve', commit: 'c0ffee1', diff_sha256: 'd1ff01', verified: true },
};
const spec = { id: 'SPEC-001', approved: true, nodes: ['trade-api', 'position-service'] };

export const approval = { approver: 'alice', commit: 'c0ffee1', diff_sha256: 'd1ff01', verified: true, used: false };
export const input = (architecture, change = {}) => ({ architecture, change: { ...baseChange, ...change }, spec });

export function evaluate(doc) {
  const report = policy.evaluate(doc, 'controls/report')[0]?.result;
  const violations = policy.evaluate(doc, 'controls/violations')[0]?.result;
  return { report, violations };
}

export const viaOpa = (doc) => JSON.parse(execFileSync(OPA, ['eval', '--format', 'json', '-d', 'ergo.rego', '-d', 'controls.rego', '-I', 'data.controls.report'], { cwd: dir, input: JSON.stringify(doc) })).result?.[0]?.expressions?.[0]?.value;

export const status = (r, requirement) => r.report?.requirements?.[requirement]?.status;
export const has = (r, want) => (r.violations ?? []).some((v) =>
  Object.entries(want).every(([k, val]) => (k === 'subject' ? v.subject?.id === val : v[k] === val)));
```

- [ ] **Step 2: Write the failing tests for S1 and S2**

`.amp/in/spike/spike.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arch, evaluate, has, input, status } from './harness.mjs';

const model = arch('architecture');

test('S1 routine change to trade-api, reviewed by review-bot: allowed', () => {
  const r = evaluate(input(model));
  assert.equal(r.report.compliant, true, JSON.stringify(r.violations, null, 2));
  assert.equal(status(r, 'code-review'), 'met');
});

test('S2 the author reviews its own change: denied in the catalog words', () => {
  const r = evaluate(input(model, { review: { reviewer: 'author-agent', verdict: 'approve', commit: 'c0ffee1', diff_sha256: 'd1ff01', verified: true } }));
  assert.equal(r.report.compliant, false);
  assert.ok(has(r, { requirement: 'code-review', check: 'not_the_author', cause: 'value' }), JSON.stringify(r.violations, null, 2));
  assert.ok(has(r, { requirement: 'code-review', check: 'approved_reviewer' }));
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd .amp/in/spike && npm test`
Expected: FAIL, because `build.sh` cannot find `controls.rego`.

- [ ] **Step 4: Write the entrypoint**

`.amp/in/spike/controls.rego`:

```rego
package controls

import data.ergo

system_configs := [r.config |
	some c in object.get(input.architecture, "controls", {})
	some r in c.requirements
]

node_configs := [r.config |
	some n in input.architecture.nodes
	some c in object.get(n, "controls", {})
	some r in c.requirements
]

configs := array.concat(system_configs, node_configs)

policy := {
	"subjects": {name: s | some cfg in configs; some name, s in cfg.ergo.subjects},
	"requirements": {name: q | some cfg in configs; some name, q in cfg.ergo.requirements},
}

report := ergo.report(input, policy, {})

violations := ergo.violations(report)
```

- [ ] **Step 5: Run to verify S1 and S2 pass**

Run: `cd .amp/in/spike && npm test`
Expected: PASS, 2 tests. If `opa check --strict` rejects something, fix `controls.rego`, not `ergo.rego`.

---

### Task 4: The Client Ledger control

**Files:**
- Modify: `.amp/in/spike/controls.json` (add the ledger control under `nodes`)
- Modify: `.amp/in/spike/spike.test.mjs` (append S3, S4, S4b, S6, S10)

**Interfaces:**
- Consumes: `evaluate`, `input`, `approval`, `status`, `has`, `arch` from `harness.mjs`.
- Produces: requirement name `client-ledger-human-approval` and subject name `connection to the client ledger, changed`, used by the findings.

- [ ] **Step 1: Write the failing tests**

Append to `spike.test.mjs`:

```js
const architect = arch('architecture-architect');
const ledgerChange = {
  nodes: ['position-service'],
  connections: [{ id: 'position-service->client-ledger', source: 'position-service', destination: 'client-ledger' }],
};

test('S1b the ledger rule does not apply to a trade-api change in the base model', () => {
  assert.equal(status(evaluate(input(model)), 'client-ledger-human-approval'), 'not_applicable');
});

test('S3 change to position-service without a human: denied, naming the ledger connection', () => {
  const r = evaluate(input(model, ledgerChange));
  assert.equal(r.report.compliant, false);
  assert.ok(has(r, { requirement: 'client-ledger-human-approval', subject: 'position-service-to-client-ledger', check: 'human_approved', cause: 'absent' }), JSON.stringify(r.violations, null, 2));
});

test('S4 the same change approved by a human for this commit and diff: allowed', () => {
  const r = evaluate(input(model, { ...ledgerChange, approval }));
  assert.equal(r.report.compliant, true, JSON.stringify(r.violations, null, 2));
  assert.equal(status(r, 'client-ledger-human-approval'), 'met');
});

test('S4b an approval bound to another diff: denied', () => {
  const r = evaluate(input(model, { ...ledgerChange, approval: { ...approval, diff_sha256: 'other' } }));
  assert.equal(r.report.compliant, false);
  assert.ok(has(r, { requirement: 'client-ledger-human-approval', check: 'approval_for_this_diff', cause: 'value' }), JSON.stringify(r.violations, null, 2));
});

test('S6 climax: after the architect adds trade-api -> client-ledger, the S1 change is denied', () => {
  const r = evaluate(input(architect));
  assert.equal(r.report.compliant, false);
  assert.ok(has(r, { requirement: 'client-ledger-human-approval', subject: 'trade-api-to-client-ledger', check: 'human_approved' }), JSON.stringify(r.violations, null, 2));
});

test('S10 a docs-only change touches no nodes: the ledger rule does not apply', () => {
  const r = evaluate(input(model, { nodes: [], connections: [] }));
  assert.equal(status(r, 'client-ledger-human-approval'), 'not_applicable', JSON.stringify(r.violations, null, 2));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd .amp/in/spike && npm test`
Expected: S1b, S3, S4, S4b, S6 and S10 FAIL (the requirement does not exist yet). S1 and S2 still pass.

- [ ] **Step 3: Add the ledger control**

Replace `"nodes": {}` in `controls.json` with:

```json
"nodes": {
  "client-ledger": {
    "client-ledger-human-approval": {
      "description": "The Client Ledger records client positions. Any change to a service that connects to it needs a human approver.",
      "requirements": [
        {
          "requirement-url": "https://hub.calm.finos.org/calm/domains/finos-sdlc-common-controls/controls/sdlc-prev-001-code-review/requirement/versions/1.0.0",
          "config": {
            "control-id": "SDLC-PREV-001",
            "name": "Code Review: human approval for the Client Ledger",
            "ergo": {
              "subjects": {
                "connection": {
                  "description": "A connection in the architecture",
                  "from": ["architecture", "relationships"],
                  "id": ["unique-id"],
                  "applies_to": { "is_connection": { "op": "present", "path": ["relationship-type", "connects"] } }
                },
                "connection to the client ledger, changed": {
                  "description": "A connection into the Client Ledger from a node this change touches",
                  "of": "connection",
                  "applies_to": {
                    "into_the_ledger": { "op": "equals", "path": ["relationship-type", "connects", "destination", "node"], "value": "client-ledger" },
                    "from_a_changed_node": { "op": "in", "path": ["relationship-type", "connects", "source", "node"], "values": { "ref": ["$$input", "change", "nodes"] } }
                  }
                }
              },
              "requirements": {
                "client-ledger-human-approval": {
                  "description": "Any change to a service that connects to the Client Ledger is approved by a human",
                  "meta": { "control-id": "SDLC-PREV-001", "calm-control": "client-ledger-human-approval" },
                  "subject": "connection to the client ledger, changed",
                  "min_subjects": 0,
                  "checks": {
                    "human_approved": { "description": "A human approved this change", "op": "non_empty_string", "path": ["$$input", "change", "approval", "approver"] },
                    "approval_verified": { "description": "The approval's signature checked out", "op": "equals", "path": ["$$input", "change", "approval", "verified"], "value": true },
                    "approval_unused": { "description": "The approval has not been used before", "op": "equals", "path": ["$$input", "change", "approval", "used"], "value": false },
                    "approval_for_this_commit": { "description": "The approval is for this commit", "op": "compare", "left": ["$$input", "change", "approval", "commit"], "right": ["$$input", "change", "commit"], "cmp": "eq" },
                    "approval_for_this_diff": { "description": "The approval is for this exact diff", "op": "compare", "left": ["$$input", "change", "approval", "diff_sha256"], "right": ["$$input", "change", "diff_sha256"], "cmp": "eq" }
                  }
                }
              }
            }
          }
        }
      ]
    }
  }
}
```

- [ ] **Step 4: Run and record**

Run: `cd .amp/in/spike && npm test`
Expected: all pass except possibly S10.

If S10 fails, print the `$applies` rows for the empty-nodes input and note the cause in the findings (`node -e` with `evaluate` and `report.results.filter(r => r.check === '$applies')`). Then try this fallback, which keeps the rule out of scope when nothing is touched: in `from_a_changed_node`, replace the `in` with `{ "op": "any", "path": ["$$input", "change", "nodes"], "check": { "op": "compare", "left": [], "right": ["$conn", "relationship-type", "connects", "source", "node"], "cmp": "eq" } }`, and add `{"each_as": "conn"}` as the last step of the `connection` subject's `from`. Re-run all tests. Record which form passed every scenario. If neither passes S10, record that, leave S10 failing and go on: the fallback for plan 3 is to have the gateway skip ergo for changes with no nodes, and that is a design decision for the findings.

---

### Task 5: Service dependency, requirements scope and failing closed

**Files:**
- Modify: `.amp/in/spike/controls.json` (add two system controls)
- Modify: `.amp/in/spike/spike.test.mjs` (append S5, S5b, S7, S9, S11)

**Interfaces:**
- Consumes: as Task 4.
- Produces: requirement names `service-dependency` and `requirements-scope`.

- [ ] **Step 1: Write the failing tests**

Append to `spike.test.mjs`:

```js
const shortcut = {
  nodes: ['trade-api'],
  connections: [{ id: 'trade-api->client-ledger', source: 'trade-api', destination: 'client-ledger' }],
};

test('S5 the shortcut: trade-api writes to the ledger without that connection in the model: denied', () => {
  const r = evaluate(input(model, shortcut));
  assert.equal(r.report.compliant, false);
  assert.ok(has(r, { requirement: 'service-dependency', subject: 'trade-api->client-ledger', check: 'in_architecture' }), JSON.stringify(r.violations, null, 2));
});

test('S5b the same code after the architect adds the connection, approved by a human: allowed', () => {
  const r = evaluate(input(architect, { ...shortcut, approval }));
  assert.equal(r.report.compliant, true, JSON.stringify(r.violations, null, 2));
});

test('S9 a change touching a node its spec does not declare: denied', () => {
  const r = evaluate(input(model, { nodes: ['trade-api', 'trade-store'], connections: [] }));
  assert.equal(r.report.compliant, false);
  assert.ok(has(r, { requirement: 'requirements-scope', subject: 'trade-store', check: 'in_spec' }), JSON.stringify(r.violations, null, 2));
});

test('S7 a typo in a control in the model fails closed', () => {
  const r = evaluate(input(arch('architecture-typo')));
  assert.equal(r.report.compliant, false);
  assert.ok(has(r, { requirement: 'code-review', check: '$well_formed' }), JSON.stringify(r.violations, null, 2));
});

test('S11 two controls defining the same subject name differently: no report, so the gateway must deny', () => {
  let r;
  try {
    r = evaluate(input(arch('architecture-clash')));
  } catch (e) {
    r = { error: e.message };
  }
  assert.ok(r.error || r.report === undefined || r.report.compliant === false, JSON.stringify(r).slice(0, 500));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd .amp/in/spike && npm test`
Expected: S5, S5b and S9 FAIL (requirements missing). S7 and S11 may already pass; that is fine, they pin behaviour.

- [ ] **Step 3: Add the two system controls**

Add these two keys inside `"system"` in `controls.json`, beside `sdlc-prev-001-code-review`:

```json
"sdlc-prev-017-service-dependency": {
  "description": "Every connection the code makes exists in the architecture.",
  "requirements": [
    {
      "requirement-url": "https://hub.calm.finos.org/calm/domains/finos-sdlc-common-controls/controls/sdlc-prev-017-service-dependency/requirement/versions/1.0.0",
      "config": {
        "control-id": "SDLC-PREV-017",
        "name": "Service Dependency Control",
        "ergo": {
          "subjects": {
            "connection the code makes": {
              "description": "A connection from one node to another, found in the changed code",
              "from": ["change", "connections", { "each_as": "made" }],
              "id": ["id"]
            }
          },
          "requirements": {
            "service-dependency": {
              "description": "Every connection the code makes exists in the architecture",
              "meta": { "control-id": "SDLC-PREV-017", "calm-control": "sdlc-prev-017-service-dependency" },
              "subject": "connection the code makes",
              "min_subjects": 0,
              "checks": {
                "in_architecture": {
                  "description": "The architecture has this connection",
                  "op": "any",
                  "path": ["$$input", "architecture", "relationships"],
                  "check": {
                    "op": "any_of",
                    "options": {
                      "same_connection": [
                        { "op": "compare", "left": ["relationship-type", "connects", "source", "node"], "right": ["$made", "source"], "cmp": "eq" },
                        { "op": "compare", "left": ["relationship-type", "connects", "destination", "node"], "right": ["$made", "destination"], "cmp": "eq" }
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  ]
},
"sdlc-prev-004-requirements-repository": {
  "description": "Every change names an approved spec and touches only the nodes it declares.",
  "requirements": [
    {
      "requirement-url": "https://hub.calm.finos.org/calm/domains/finos-sdlc-common-controls/controls/sdlc-prev-004-requirements/requirement/versions/1.0.0",
      "config": {
        "control-id": "SDLC-PREV-004",
        "name": "Requirements Repository",
        "ergo": {
          "subjects": {
            "node the change touches": {
              "description": "A node in the architecture that owns a changed file",
              "from": ["change", "nodes"]
            }
          },
          "requirements": {
            "requirements-scope": {
              "description": "The change names an approved spec and touches only the nodes it declares",
              "meta": { "control-id": "SDLC-PREV-004", "calm-control": "sdlc-prev-004-requirements-repository" },
              "subject": "node the change touches",
              "min_subjects": 0,
              "checks": {
                "spec_approved": { "description": "The change's spec is approved", "op": "equals", "path": ["$$input", "spec", "approved"], "value": true },
                "in_spec": { "description": "The spec declares this node", "op": "in", "path": [], "values": { "ref": ["$$input", "spec", "nodes"] } }
              }
            }
          }
        }
      }
    }
  ]
}
```

- [ ] **Step 4: Run all tests**

Run: `cd .amp/in/spike && npm test`
Expected: all pass (S10 as recorded in Task 4). If S5 fails because `$made` cannot be read inside `any`, record the `$well_formed` problem from the report, then try giving the outer list a name instead: `"as": "rel"` on the `any`, and inner `compare` sides `["$rel", "relationship-type", ...]` against `["$made", ...]`. Record which worked.

---

### Task 6: Parity, built-ins and memory

**Files:**
- Modify: `.amp/in/spike/spike.test.mjs` (append the parity test)
- Create: `.amp/in/spike/measure.mjs`

**Interfaces:**
- Consumes: `viaOpa`, `evaluate`, `policy`, `input`, `arch`, `approval` from `harness.mjs`.

- [ ] **Step 1: Write the parity test**

Append to `spike.test.mjs`:

```js
import { viaOpa } from './harness.mjs';

test('the Wasm build and opa eval give the same report for every scenario', () => {
  const cases = [
    input(model),
    input(model, ledgerChange),
    input(model, { ...ledgerChange, approval }),
    input(architect),
    input(model, shortcut),
    input(model, { nodes: [], connections: [] }),
    input(arch('architecture-typo')),
  ];
  for (const doc of cases) assert.deepEqual(evaluate(doc).report, viaOpa(doc));
});
```

Move the new `import` line to the top of the file with the other imports.

- [ ] **Step 2: Run it**

Run: `cd .amp/in/spike && npm test`
Expected: PASS. A difference is a finding, not something to fix here: record the first differing path.

- [ ] **Step 3: Measure built-ins and memory**

`.amp/in/spike/measure.mjs`:

```js
import { arch, approval, evaluate, input, policy } from './harness.mjs';

const { builtins, opa_json_dump, opa_heap_ptr_get } = policy.wasmInstance.exports;
const mem = new Uint8Array(policy.mem.buffer);
const start = opa_json_dump(builtins());
console.log('built-ins the module needs from JS:', Object.keys(JSON.parse(Buffer.from(mem.slice(start, mem.indexOf(0, start))).toString())));

const before = opa_heap_ptr_get();
const r = evaluate(input(arch('architecture-architect'), { nodes: ['trade-api', 'position-service'], approval }));
console.log('rows:', r.report.results.length, 'compliant:', r.report.compliant);
console.log('Wasm heap used by one evaluation (MB):', ((opa_heap_ptr_get() - before) / 1e6).toFixed(2));
```

Run: `cd .amp/in/spike && node measure.mjs`
Expected: the built-ins list is empty or only `time.parse_rfc3339_ns`; memory well under ergo's 20 MB budget. Record the numbers.

---

### Task 7: Findings note

**Files:**
- Create: `docs/superpowers/specs/2026-10-12-ergo-calm-spike-findings.md`

- [ ] **Step 1: Write the findings**

Use this structure, filled with what the runs showed (copy real output; do not write from memory):

```markdown
# ergo × CALM spike: findings

Ran on <date> with OPA <version>, ergo <commit>, @open-policy-agent/opa-wasm <version>, Node <version>.
Code: throwaway, in .amp/in/spike (not committed).

## Answers to the spec's questions
1. ergo compiles to Wasm and runs from Node: <yes/no, built-ins needed, memory per evaluation>.
2. Membership via a $$input ref without a custom operator: <yes/no; S10 result and which form of the ledger filter passed>.
3. Custom operators needed: <none / which and why>.

## Scenario results
| Scenario | Expected | Result | Violation shown (description, cause) |
| S1 ... | allow | ... | ... |
(one row per test, S1 to S11)

## Surprises
<anything that behaved differently from the reference or from this plan, with the report excerpt>

## Recommendation for plan 3
<the control config shape to put in the model; how the gateway assembles input; what Node must still compute (touched nodes, code connections); whether calm.rego is needed; how to treat S11>
```

- [ ] **Step 2: Commit the findings note only**

```bash
git add docs/superpowers/specs/2026-10-12-ergo-calm-spike-findings.md
git commit -m "docs: what the ergo and CALM spike showed"
```

Do not commit anything under `.amp/in/`.
