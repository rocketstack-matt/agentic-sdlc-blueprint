# Plan 3b: the gateway decides with the model's controls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the merge gateway on `gates/lib/controls.mjs`: it guards a real git repository, evaluates the base model's ergo controls at stage `merge`, records every decision as CALM `control-evaluation` decorators, publishes the architecture and the decorators to a local CALM Hub, and replays the talk's four moments end to end.

**Architecture:** `gateway/.demo/repo` is a clone of the blueprint that only the gateway merges into. `propose` turns a demo patch into a real commit on an agent branch; `review` and `approve` sign records bound to that commit and the SHA-256 of its diff; `merge` computes the facts with `changeInput` against `main` (controls from `main`, code scanned from a checkout of the change), evaluates, writes decorators (validated against the Standard), posts them to CALM Hub when `CALM_HUB_URL` is set, and on ALLOW merges into `main`. When a merge changes the architecture, the new model is published as the next Hub version. `run-demo.sh` records every command into `sessions.json` and checks every verdict.

**Tech Stack:** Node 22+, git, `@open-policy-agent/opa-wasm` and ergo (via `gates/lib/controls.mjs`), `ajv` 8 + `ajv-formats` (decorator validation), CALM Hub 0.7.6 in standalone mode (`../mvnw quarkus:dev -Pstandalone,server-only` in `../architecture-as-code/calm-hub`, no auth, port 8080).

**Spec:** `docs/superpowers/specs/2026-10-12-osff-talk-reframe-design.md` (Part 1 demo beats; Part 2, 2.3 and 2.4) and `docs/superpowers/specs/2026-10-12-ergo-calm-spike-findings.md`.

Plan 3a's branch `feat/controls-as-ergo` is the base: this plan continues on it, and the two merge together (ruling at the end of 3a).

## Governance

Approving this plan approves `specs/SPEC-004-gateway-decides-with-the-model.md`, `specs/SPEC-003-ledger-snapshots.md` (the demo architect's spec) and the control-plane edits listed (`gates/lib/calm.mjs`, `.github/workflows/governed-sdlc.yml`, descriptions in `architecture/`). Every commit carries `Spec: SPEC-004`.

## Global Constraints

- Branch `feat/controls-as-ergo`; nothing is pushed. Nothing in `../architecture-as-code` is committed or pushed by this plan (the Hub is only run).
- The gateway never trusts a change file's hashes: it recomputes the diff and its SHA-256 from git (`git diff --no-color --no-ext-diff --full-index --no-renames main...<commit>`).
- Controls always come from `main` of the guarded repository at the moment of the merge decision. Code connections are scanned from a checkout of the change's commit.
- The verdict is `evaluateControls(input, { stage: 'merge' }).allowed`. Any error denies.
- Identities on screen are plain names: authors `author-agent` and `bob` (the architect), reviewer `review-bot`, approver `alice`. No SPIFFE ids, no tiers.
- Approval tokens: issuer `approval-service`, audience `merge-gateway`, single use, ten minutes; Node folds signature, issuer, audience, expiry and age into `verified`, and the ledger into `used`.
- Decorators conform to `gateway/standards/control-evaluation.decorator.standard.json` (a copy of the draft Standard from plan 2, `requirement-url` fully qualified). `unique-id` is `eval-<first 8 of decision id>-<control key>`. Validation strips the instance's `$schema` first (a known issue in CALM's base decorator schema).
- CALM Hub: `CALM_HUB_URL` (unset = off), `CALM_HUB_NAMESPACE` (default `finos.agentic-sdlc`), architecture name `Trade Capture (governed)`. The gateway deletes only what it created (ids kept in `gateway/.hub-state.json`). Decorator targets use the Hub's exact form `/api/calm/namespaces/{ns}/architectures/{numericId}/versions/{x-y-z}`.
- Each recorded demo step prints fewer than 22 lines.

## Review Focus

1. **Replaying a merged change.** After ALLOW the commit is in `main`, so its diff against `main` is empty; expect a deny, not an allow on an empty change. Pinned in Task 4 (`a merged change cannot be merged again`).
2. **An approval for a different commit or diff, or minted for a different change.** Expect a deny naming the approval check. Pinned by the demo's `amended` session (Task 5) and Task 4's test.
3. **CALM Hub unreachable while `CALM_HUB_URL` is set.** Expect the decision still made, logged and printed, with a `hub: failed …` line, never a crash and never a changed verdict. Pinned in Task 3 (`a failing hub never throws`).
4. **A not-met control with no element in scope** (a control-plane file change). Expect a valid decorator whose `applies-to` falls back to the change's nodes, then to the element the control sits on. Pinned in Task 2.
5. **The guarded repository has uncommitted blueprint changes.** `reset` clones the blueprint's HEAD; expect it to say so when the blueprint's working tree is dirty. Pinned in Task 4 (`reset warns about a dirty blueprint`).

---

### Task 1: SPEC-004, SPEC-003, the spec's decorator wording, and `changeInput` for another repository

**Files:**
- Create: `specs/SPEC-004-gateway-decides-with-the-model.md`, `specs/SPEC-003-ledger-snapshots.md`
- Modify: `docs/superpowers/specs/2026-10-12-osff-talk-reframe-design.md` (section 2.4 wording)
- Modify: `gates/lib/calm.mjs`
- Modify: `test/facts.test.mjs`

**Interfaces:**
- Produces: `changedFiles(base, head, root = ROOT)`, `loadSpecs(root = ROOT)`, `observedConnections(arch, root = ROOT)`, `baseArchitecture(base, root = ROOT)`, `baseArchitectureText(base, root = ROOT)`, `changeInput({ arch, base, head, root = ROOT, treeRoot = root, specId = currentSpecId(), author = process.env.CHANGE_AUTHOR_ID ?? 'unknown' })`. Existing callers (`gates/check.mjs`) keep working unchanged.

- [ ] **Step 1: Write the specs**

`specs/SPEC-004-gateway-decides-with-the-model.md`:

```markdown
---
id: SPEC-004
title: The gateway decides with the model's controls
status: approved
owner: matthew-bain
calm-nodes: []
calm-relationships: []
model-change: []
---

# SPEC-004 The gateway decides with the model's controls

## Why
The merge gateway should enforce exactly the controls the architecture carries, and leave its decisions on the
architecture where people can see them.

## What
- The gateway guards a real repository, evaluates the ergo controls of `main` at stage `merge`, and merges on ALLOW.
- Every decision is recorded as CALM control-evaluation decorators, published with the architecture to CALM Hub.
- The demo replays the talk's moments: a routine change, the Client Ledger rule, the shortcut, and the architect's change.

## Acceptance
- `bash gateway/run-demo.sh` ends with `demo ok`, with and without `CALM_HUB_URL`.
- `npm test`, `npm run typecheck` and `SPEC=SPEC-004 npm run gates` pass.
```

`specs/SPEC-003-ledger-snapshots.md`:

```markdown
---
id: SPEC-003
title: Trade API writes end-of-day snapshots to the Client Ledger
status: approved
owner: trade-capture-leads
calm-nodes: []
calm-relationships: []
model-change: [trade-api-to-client-ledger]
---

# SPEC-003 Trade API writes end-of-day snapshots to the Client Ledger

## Why
Operations want each day's trades written to the book of record directly, without a round trip per trade.

## What
A model change only: the relationship `trade-api-to-client-ledger`, trade-api connecting to the Client Ledger's file
interface. The code that uses it follows under its own spec once the relationship is in the model.

## Acceptance
- The relationship is in the model. From then on, a change to trade-api is a change to a service that connects to the
  Client Ledger, and needs a human approver.
```

- [ ] **Step 2: Fix the design spec's decorator wording**

In `docs/superpowers/specs/2026-10-12-osff-talk-reframe-design.md`, section 2.4, replace the `data:` bullet with:

```markdown
- `data`: `control` (`unique-id`, `control-id`, fully qualified `requirement-url`, `attached-to`), `status`
  (`met`, `not-met`, `not-applicable`), `evaluated-at`, `findings` (required when `not-met`: `subject`,
  `description`, `check`, `expression`, `cause`), `change` (`commit`, `diff-sha256`, `spec`), `actors` (`author`,
  `reviewer`, `approver`), `engine` (`name`, `version`, `policy-sha256`), `report-sha256`
```

- [ ] **Step 3: Write the failing test**

Append to `test/facts.test.mjs`:

```js
import { mkdtempSync as mkdtemp2, rmSync as rm2, writeFileSync as write2, readFileSync as read2 } from 'node:fs';
import { tmpdir as tmp2 } from 'node:os';
import { join as join2 } from 'node:path';
import { changeInput } from '../gates/lib/calm.mjs';

test('changeInput can evaluate a commit in another repository, scanning a checkout of that commit', () => {
  const dir = mkdtemp2(join2(tmp2(), 'guarded-'));
  const repo = join2(dir, 'repo');
  const tree = join2(dir, 'tree');
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' };
  const g = (cwd, ...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();
  try {
    g(dir, 'clone', '--quiet', '--no-hardlinks', new URL('..', import.meta.url).pathname, repo);
    g(repo, 'checkout', '-q', '-B', 'main');
    g(repo, 'checkout', '-q', '-b', 'agent/x');
    const config = join2(repo, 'services/trade-api/src/config.ts');
    write2(config, read2(config, 'utf8').replace('};', "  ledgerPath: process.env.POSITION_STORE_PATH ?? 'data/positions.json',\n};"));
    g(repo, 'commit', '-qam', 'shortcut\n\nSpec: SPEC-001');
    const head = g(repo, 'rev-parse', 'HEAD');
    g(repo, 'worktree', 'add', '--detach', '--quiet', tree, head);
    const arch = baseArchitecture('main', repo);
    const input = changeInput({ arch, base: 'main', head, root: repo, treeRoot: tree, specId: 'SPEC-001', author: 'author-agent' });
    assert.equal(input.change.commit, head);
    assert.deepEqual(input.change.files, [{ path: 'services/trade-api/src/config.ts', node: 'trade-api' }]);
    assert.equal(input.change.author, 'author-agent');
    assert.equal(input.spec.id, 'SPEC-001');
    assert.ok(input.change.connections.some((c) => c.id === 'trade-api->client-ledger'), 'connections come from the checkout of head');
    assert.equal(observedConnections(loadArchitecture()).some((c) => c.id === 'trade-api->client-ledger'), false, 'the blueprint itself has no such connection');
  } finally {
    rm2(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `node --test test/facts.test.mjs 2>&1 | tail -8`
Expected: FAIL (`baseArchitecture` and `changeInput` ignore the repository arguments).

- [ ] **Step 5: Thread `root` through `gates/lib/calm.mjs`**

Make these changes, keeping every default equal to today's behaviour:

```js
const gitIn = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const git = (...args) => gitIn(ROOT, ...args);
```

```js
export const changedFiles = (base = changeBase(), head, root = ROOT) => {
  const tracked = gitIn(root, 'diff', '--name-only', '--no-renames', base, ...(head ? [head] : [])).split('\n');
  const untracked = head ? [] : gitIn(root, 'ls-files', '--others', '--exclude-standard').split('\n');
  return [...new Set([...tracked, ...untracked])].filter(Boolean).sort();
};
```

```js
export const loadSpecs = (root = ROOT) =>
  walk(join(root, 'specs')).filter((p) => /SPEC-\d+.*\.md$/.test(p)).map((p) => ({ path: relative(root, p).split(sep).join('/'), ...frontMatter(readFileSync(p, 'utf8')) }));
```

In `observedConnections`, add a `root = ROOT` parameter; walk `join(root, node.metadata['source-path'])`; compute evidence paths and import targets relative to `root` (replace `rel(file)` with `relative(root, file).split(sep).join('/')`, and `rel(resolve(dirname(file), imp[1]))` with the same relative-to-root form).

In `baseArchitectureSource(base, root = ROOT)`, run `git show` with `cwd: root` and read the bootstrap fallback from `join(root, ARCHITECTURE)`; export `baseArchitecture = (base = changeBase(), root = ROOT) => baseArchitectureSource(base, root).arch` and `baseArchitectureText = (base = changeBase(), root = ROOT) => baseArchitectureSource(base, root).text`.

Replace `changeInput` with:

```js
/**
 * The facts the controls are evaluated on, for the change between base and head (default: the working tree).
 * root is the repository the change is in; treeRoot is a checkout of head, where the code's connections and the
 * specs are read. The gateway passes all of them; gates/check.mjs uses the defaults (this repository, its working tree).
 */
export const changeInput = ({ arch, base = changeBase(), head, root = ROOT, treeRoot = root, specId = currentSpecId(), author = process.env.CHANGE_AUTHOR_ID ?? 'unknown' }) => {
  const files = changedFiles(base, head, root).map((path) => ({ path, node: nodeForPath(arch, path)?.['unique-id'] ?? null }));
  const spec = loadSpecs(treeRoot).find((s) => s.id === specId);
  return {
    architecture: arch,
    change: {
      commit: head ? gitIn(root, 'rev-parse', head) : gitInfo().commit,
      author,
      ...(specId ? { spec: specId } : {}),
      files,
      nodes: [...new Set(files.map((f) => f.node).filter(Boolean))].sort(),
      connections: observedConnections(arch, treeRoot),
    },
    spec: spec ? { id: spec.id, approved: spec.status === 'approved', nodes: spec['calm-nodes'] ?? [] } : { id: null, approved: false, nodes: [] },
  };
};
```

- [ ] **Step 6: Run the tests**

Run: `npm test 2>&1 | grep -E '^ℹ (pass|fail)|^✖'` and `SPEC=SPEC-004 node gates/check.mjs | tail -2`
Expected: all pass; `ADMISSIBLE`.

- [ ] **Step 7: Commit**

```bash
git add specs/SPEC-004-gateway-decides-with-the-model.md specs/SPEC-003-ledger-snapshots.md docs/superpowers/specs/2026-10-12-osff-talk-reframe-design.md gates/lib/calm.mjs test/facts.test.mjs
git commit -m "feat(gates): changeInput evaluates a commit in another repository

Spec: SPEC-004"
```

---

### Task 2: Decorators from a decision

**Files:**
- Create: `gateway/standards/control-evaluation.decorator.standard.json` (copy), `gateway/standards/decorators.json` (copy), `gateway/standards/README.md`
- Create: `gateway/gateway/decorators.mjs`
- Create: `test/decorators.test.mjs`
- Modify: `package.json` (devDependency `ajv-formats`)

**Interfaces:**
- Consumes: `evaluateControls` outcome `{ report, violations, controls, policySha }`; the input `{ architecture, change: { commit, diff_sha256, spec, author, nodes, review?, approval? } }`.
- Produces: `buildDecorators({ outcome, input, decisionId, target, evaluatedAt }) -> decorator[]` and `validateDecorator(d) -> { valid: boolean, errors: string[] }`, exported from `gateway/gateway/decorators.mjs`. `STANDARD_ID` is the Standard's `$id`.

- [ ] **Step 1: Copy the Standard and its base**

```bash
mkdir -p gateway/standards
cp ../architecture-as-code/calm/draft/2026-03/standards/compliance/control-evaluation.decorator.standard.json gateway/standards/
cp ../architecture-as-code/calm/draft/2026-03/meta/decorators.json gateway/standards/
npm install --save-dev ajv-formats@^3
```

`gateway/standards/README.md`:

```markdown
# Decorator Standard (copy)

`control-evaluation.decorator.standard.json` is the control evaluation decorator Standard proposed to FINOS CALM's
draft standards (`calm/draft/2026-03/standards/compliance/`), with `decorators.json`, the draft base decorator it
extends. Every decorator the gateway writes is validated against them. The validation removes the instance's
`$schema` key first: CALM's base decorator schema sets `additionalProperties: false` without listing `$schema`, so
every decorator instance that names its schema, upstream's own examples included, would fail otherwise.
```

- [ ] **Step 2: Write the failing tests**

`test/decorators.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateControls } from '../gates/lib/controls.mjs';
import { buildDecorators, validateDecorator, STANDARD_ID } from '../gateway/gateway/decorators.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const model = () => JSON.parse(readFileSync(`${ROOT}architecture/trade-capture.architecture.json`, 'utf8'));
const sha = (c) => c.repeat(64);
const review = { reviewer: 'review-bot', verdict: 'approve', commit: 'c0ffee1', diff_sha256: sha('d'), verified: true };
const base = { commit: 'c0ffee1', diff_sha256: sha('d'), author: 'author-agent', spec: 'SPEC-001', connections: [{ id: 'trade-api->position-service', source: 'trade-api', destination: 'position-service' }], review };
const spec = { id: 'SPEC-001', approved: true, nodes: ['trade-api', 'position-service'] };
const target = '/api/calm/namespaces/finos.agentic-sdlc/architectures/7/versions/1-0-0';
const decide = async (change, architecture = model()) => {
  const input = { architecture, change, spec };
  const outcome = await evaluateControls(input, { stage: 'merge' });
  return { outcome, decorators: buildDecorators({ outcome, input, decisionId: '1234abcd-0000-0000-0000-000000000000', target, evaluatedAt: '2026-11-04T15:00:00.000Z' }) };
};
const byControl = (ds, key) => ds.find((d) => d.data.control['unique-id'] === key);
const ledgerChange = { ...base, files: [{ path: 'services/position-service/src/app.ts', node: 'position-service' }], nodes: ['position-service'] };

test('one decorator per control, each valid against the Standard', async () => {
  const { decorators } = await decide(ledgerChange);
  assert.deepEqual(decorators.map((d) => d.data.control['unique-id']).sort(), ['client-ledger-human-approval', 'sdlc-prev-001-code-review', 'sdlc-prev-004-requirements-repository', 'sdlc-prev-017-service-dependency']);
  for (const d of decorators) {
    assert.equal(d.$schema, STANDARD_ID);
    assert.deepEqual(validateDecorator(d), { valid: true, errors: [] }, d['unique-id']);
    assert.deepEqual(d.target, [target]);
    assert.match(d['unique-id'], /^eval-1234abcd-/);
  }
});

test('the ledger rule not met: applies to the ledger connection and its source, with the finding', async () => {
  const d = byControl((await decide(ledgerChange)).decorators, 'client-ledger-human-approval');
  assert.equal(d.data.status, 'not-met');
  assert.deepEqual(d['applies-to'], ['position-service', 'position-service-to-client-ledger']);
  assert.equal(d.data.control['attached-to'], 'client-ledger');
  assert.equal(d.data.control['requirement-url'], 'https://hub.calm.finos.org/calm/domains/finos-sdlc-common-controls/controls/sdlc-prev-001-code-review/requirement/versions/1.0.0');
  assert.ok(d.data.findings.some((f) => f.subject === 'position-service-to-client-ledger' && f.description === 'A human approved this change' && f.cause === 'absent'));
  assert.deepEqual(d.data.actors, { author: 'author-agent', reviewer: 'review-bot' });
});

test('a met control has no findings and records the approver', async () => {
  const approval = { approver: 'alice', commit: 'c0ffee1', diff_sha256: sha('d'), verified: true, used: false };
  const d = byControl((await decide({ ...ledgerChange, approval })).decorators, 'client-ledger-human-approval');
  assert.equal(d.data.status, 'met');
  assert.equal(d.data.findings, undefined);
  assert.equal(d.data.actors.approver, 'alice');
});

test('not applicable: applies to the element that carries the control', async () => {
  const change = { ...base, files: [{ path: 'services/trade-api/src/app.ts', node: 'trade-api' }], nodes: ['trade-api'] };
  const d = byControl((await decide(change)).decorators, 'client-ledger-human-approval');
  assert.equal(d.data.status, 'not-applicable');
  assert.deepEqual(d['applies-to'], ['client-ledger']);
});

test('a control whose subjects are not elements applies to the nodes the change touches', async () => {
  const change = { ...base, files: [{ path: 'services/trade-api/src/app.ts', node: 'trade-api' }], nodes: ['trade-api'] };
  const d = byControl((await decide(change)).decorators, 'sdlc-prev-001-code-review');
  assert.equal(d.data.status, 'met');
  assert.deepEqual(d['applies-to'], ['trade-api']);
});

test('a control-plane change with no nodes falls back to the system node', async () => {
  const change = { ...base, files: [{ path: 'architecture/trade-capture.architecture.json', node: null }], nodes: [], connections: [] };
  const d = byControl((await decide(change)).decorators, 'sdlc-prev-001-code-review');
  assert.equal(d.data.status, 'not-met');
  assert.deepEqual(d['applies-to'], ['trade-capture']);
  assert.ok(d.data.findings.some((f) => f.subject === 'architecture/trade-capture.architecture.json'));
  assert.deepEqual(validateDecorator(d).valid, true);
});

test('a short diff hash is left out rather than written invalid', async () => {
  const d = byControl((await decide({ ...ledgerChange, diff_sha256: 'd1ff01', review: { ...review, diff_sha256: 'd1ff01' } })).decorators, 'sdlc-prev-001-code-review');
  assert.equal(d.data.change['diff-sha256'], undefined);
  assert.equal(validateDecorator(d).valid, true);
});

test('validateDecorator rejects a not-met decorator without findings', () => {
  const bad = { 'unique-id': 'x', type: 'control-evaluation', target: [target], 'target-type': ['architecture'], 'applies-to': ['trade-api'], data: { control: { 'unique-id': 'k', 'requirement-url': 'https://example.org/r' }, status: 'not-met', 'evaluated-at': '2026-11-04T15:00:00Z' } };
  assert.equal(validateDecorator(bad).valid, false);
});

test('no report, no decorators', async () => {
  assert.deepEqual(buildDecorators({ outcome: { allowed: false, controls: {}, error: 'x' }, input: { architecture: model(), change: base }, decisionId: '1234abcd', target, evaluatedAt: '2026-11-04T15:00:00.000Z' }), []);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --test test/decorators.test.mjs 2>&1 | tail -4`
Expected: FAIL, `Cannot find module '../gateway/gateway/decorators.mjs'`.

- [ ] **Step 4: Write `gateway/gateway/decorators.mjs`**

```js
// Turns one merge decision into CALM control-evaluation decorators: one per control the model carries, pinned to the
// architecture elements the control was about, with the reasons when it was not met. Validated against the Standard
// in gateway/standards before anything is written or published.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020.js').default;
const addFormats = require('ajv-formats').default;

const STANDARDS = join(fileURLToPath(new URL('..', import.meta.url)), 'standards');
const standard = JSON.parse(readFileSync(join(STANDARDS, 'control-evaluation.decorator.standard.json'), 'utf8'));
export const STANDARD_ID = standard.$id;

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(JSON.parse(readFileSync(join(STANDARDS, 'decorators.json'), 'utf8')));
const check = ajv.compile(standard);

export function validateDecorator(decorator) {
  const { $schema, ...instance } = decorator;
  const valid = check(instance);
  return { valid, errors: valid ? [] : check.errors.map((e) => `${e.instancePath || '/'} ${e.message}`) };
}

const ENGINE = { name: 'ergo', version: 'd924f4d' };
const STATUS = { not_met: 'not-met', met: 'met', not_applicable: 'not-applicable' };
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const isSha = (s) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);

const controlAt = (arch, key, on) => {
  if (on === 'system') return arch.controls?.[key];
  const holder = [...arch.nodes, ...(arch.relationships ?? []), ...(arch.flows ?? [])].find((e) => e['unique-id'] === on);
  return holder?.controls?.[key];
};

export function buildDecorators({ outcome, input, decisionId, target, evaluatedAt }) {
  const requirements = outcome.report?.requirements;
  if (!requirements) return [];
  const arch = input.architecture;
  const change = input.change ?? {};
  const elements = new Set([...arch.nodes, ...(arch.relationships ?? [])].map((e) => e['unique-id']));
  const sourceOf = Object.fromEntries((arch.relationships ?? []).filter((r) => r['relationship-type']?.connects).map((r) => [r['unique-id'], r['relationship-type'].connects.source.node]));
  const systemNode = arch.nodes.find((n) => n['node-type'] === 'system')?.['unique-id'];
  const reportSha = sha256(JSON.stringify(outcome.report));
  const actors = Object.fromEntries(Object.entries({ author: change.author, reviewer: change.review?.reviewer, approver: change.approval?.approver }).filter(([, v]) => typeof v === 'string' && v));

  return Object.entries(outcome.controls ?? {}).flatMap(([key, on]) => {
    const names = Object.entries(requirements).filter(([, q]) => q.meta?.['calm-control'] === key).map(([name]) => name);
    if (!names.length) return [];
    const statuses = names.map((n) => requirements[n].status);
    const status = statuses.includes('not_met') ? 'not-met' : statuses.includes('met') ? 'met' : 'not-applicable';
    const attachedTo = on === 'system' ? systemNode : on;

    const inScope = new Set(outcome.report.results.filter((r) => names.includes(r.requirement) && !String(r.check).startsWith('$')).map((r) => String(r.subject?.id)));
    const appliesTo = new Set();
    for (const id of inScope) if (elements.has(id)) { appliesTo.add(id); if (sourceOf[id]) appliesTo.add(sourceOf[id]); }
    if (!appliesTo.size && status !== 'not-applicable') for (const n of change.nodes ?? []) appliesTo.add(n);
    if (!appliesTo.size) appliesTo.add(attachedTo);

    let findings = (outcome.violations ?? []).filter((v) => names.includes(v.requirement)).map((v) => ({
      subject: String(v.subject?.id ?? v.requirement),
      check: v.check,
      description: v.description || v.check,
      ...(v.expression ? { expression: v.expression } : {}),
      ...(v.cause ? { cause: v.cause } : {}),
    }));
    if (status === 'not-met' && !findings.length) findings = [{ subject: key, description: 'The control was not met' }];

    const control = controlAt(arch, key, on)?.requirements?.[0] ?? {};
    return [{
      $schema: STANDARD_ID,
      'unique-id': `eval-${String(decisionId).slice(0, 8)}-${key}`,
      type: 'control-evaluation',
      target: [target],
      'target-type': ['architecture'],
      'applies-to': [...appliesTo].sort(),
      data: {
        control: { 'unique-id': key, ...(control.config?.['control-id'] ? { 'control-id': control.config['control-id'] } : {}), 'requirement-url': control['requirement-url'], 'attached-to': attachedTo },
        status,
        'evaluated-at': evaluatedAt,
        change: { commit: change.commit, ...(isSha(change.diff_sha256) ? { 'diff-sha256': change.diff_sha256 } : {}), ...(change.spec ? { spec: change.spec } : {}) },
        ...(status === 'not-met' ? { findings } : {}),
        ...(Object.keys(actors).length ? { actors } : {}),
        engine: { ...ENGINE, ...(isSha(outcome.policySha) ? { 'policy-sha256': outcome.policySha } : {}) },
        'report-sha256': reportSha,
      },
    }];
  });
}
```

`STATUS` is unused once written this way; delete that line before committing.

- [ ] **Step 5: Run the tests**

Run: `node --test test/decorators.test.mjs && npm test 2>&1 | grep -E '^ℹ (pass|fail)'`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add gateway/standards gateway/gateway/decorators.mjs test/decorators.test.mjs package.json package-lock.json
git commit -m "feat(gateway): every decision becomes control-evaluation decorators

Spec: SPEC-004"
```

---

### Task 3: The CALM Hub client

**Files:**
- Create: `gateway/gateway/hub.mjs`
- Create: `test/hub.test.mjs`

**Interfaces:**
- Produces, from `gateway/gateway/hub.mjs`: `hubEnabled() -> boolean`; `resetHub() -> Promise<void>`; `publishArchitecture(text) -> Promise<{ id, version, target } | null>`; `targetFor(id, version) -> string`; `postDecorator(decorator) -> Promise<number | null>`. All read `CALM_HUB_URL`, `CALM_HUB_NAMESPACE` and `GATEWAY_HUB_STATE` (default `gateway/.hub-state.json`) when called, not at import. Every function except `targetFor` returns `null` (or resolves) without network when `CALM_HUB_URL` is unset, and **never throws**: failures resolve to `{ error }` (for `publishArchitecture` and `postDecorator`) so a decision is never lost to the Hub.

- [ ] **Step 1: Write the failing tests**

`test/hub.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { postDecorator, publishArchitecture, resetHub, targetFor, hubEnabled } from '../gateway/gateway/hub.mjs';

const stub = async () => {
  const calls = [];
  let nextArch = 41, nextDec = 1;
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    calls.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : null });
    if (req.method === 'GET' && req.url === '/api/calm/namespaces') { res.end(JSON.stringify({ values: [{ name: 'finos.agentic-sdlc' }] })); return; }
    if (req.method === 'POST' && req.url === '/api/calm/namespaces/finos.agentic-sdlc/architectures') { res.writeHead(201, { location: `http://x/api/calm/namespaces/finos.agentic-sdlc/architectures/${nextArch}/versions/1.0.0` }).end(); return; }
    if (req.method === 'POST' && /\/architectures\/\d+\/versions\//.test(req.url)) { res.writeHead(201).end(); return; }
    if (req.method === 'POST' && req.url.endsWith('/decorators')) { res.writeHead(201, { location: `http://x/api/calm/namespaces/finos.agentic-sdlc/decorators/${nextDec++}` }).end(); return; }
    if (req.method === 'DELETE') { res.writeHead(204).end(); return; }
    res.writeHead(500).end('unexpected');
  });
  await new Promise((r) => server.listen(0, r));
  return { calls, url: `http://localhost:${server.address().port}`, close: () => server.close() };
};
const env = (url) => {
  process.env.CALM_HUB_URL = url;
  process.env.GATEWAY_HUB_STATE = join(mkdtempSync(join(tmpdir(), 'hub-')), 'state.json');
};

test('off without CALM_HUB_URL', async () => {
  delete process.env.CALM_HUB_URL;
  assert.equal(hubEnabled(), false);
  assert.equal(await publishArchitecture('{}'), null);
  assert.equal(await postDecorator({}), null);
});

test('targets use the Hub filter form, with dashes in the version', () => {
  process.env.CALM_HUB_NAMESPACE = 'finos.agentic-sdlc';
  assert.equal(targetFor(41, '1.1.0'), '/api/calm/namespaces/finos.agentic-sdlc/architectures/41/versions/1-1-0');
});

test('first publish creates the architecture, a new model is the next version, the same model is reused', async () => {
  const hub = await stub(); env(hub.url);
  try {
    const a = await publishArchitecture('{"v":1}');
    assert.deepEqual(a, { id: 41, version: '1.0.0', target: '/api/calm/namespaces/finos.agentic-sdlc/architectures/41/versions/1-0-0' });
    const b = await publishArchitecture('{"v":2}');
    assert.equal(b.version, '1.1.0');
    assert.deepEqual(await publishArchitecture('{"v":1}'), a);
    const posts = hub.calls.filter((c) => c.method === 'POST');
    assert.equal(posts[0].body.name, 'Trade Capture (governed)');
    assert.equal(posts[0].body.architectureJson, '{"v":1}');
    assert.equal(posts[1].url, '/api/calm/namespaces/finos.agentic-sdlc/architectures/41/versions/1.1.0');
  } finally { hub.close(); }
});

test('decorators are posted and reset deletes only what was created', async () => {
  const hub = await stub(); env(hub.url);
  try {
    await publishArchitecture('{"v":1}');
    assert.equal(await postDecorator({ 'unique-id': 'd1' }), 1);
    assert.equal(await postDecorator({ 'unique-id': 'd2' }), 2);
    await resetHub();
    const deletes = hub.calls.filter((c) => c.method === 'DELETE').map((c) => c.url);
    assert.deepEqual(deletes, ['/api/calm/namespaces/finos.agentic-sdlc/decorators/1', '/api/calm/namespaces/finos.agentic-sdlc/decorators/2', '/api/calm/namespaces/finos.agentic-sdlc/architectures/41']);
  } finally { hub.close(); }
});

test('a failing hub never throws', async () => {
  env('http://localhost:1');
  const r = await publishArchitecture('{"v":1}');
  assert.ok(r.error, 'publish reports the error');
  assert.ok((await postDecorator({ 'unique-id': 'd' })).error);
  await resetHub();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/hub.test.mjs 2>&1 | tail -4`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `gateway/gateway/hub.mjs`**

```js
// The CALM Hub client: publishes the architecture the gateway guards, one version per model it decides on, and posts
// each decision's control-evaluation decorators against that version. Off unless CALM_HUB_URL is set. It never throws:
// a decision is made, logged and printed whether or not the Hub is reachable.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'Trade Capture (governed)';
const DESCRIPTION = 'The architecture the merge gateway guards: one version per model it has decided on, with every decision as a control-evaluation decorator.';
const cfg = () => ({
  url: process.env.CALM_HUB_URL?.replace(/\/$/, ''),
  ns: process.env.CALM_HUB_NAMESPACE ?? 'finos.agentic-sdlc',
  state: process.env.GATEWAY_HUB_STATE ?? join(fileURLToPath(new URL('..', import.meta.url)), '.hub-state.json'),
});
const empty = () => ({ architectureId: null, versions: {}, decorators: [] });
const load = () => (existsSync(cfg().state) ? JSON.parse(readFileSync(cfg().state, 'utf8')) : empty());
const save = (s) => writeFileSync(cfg().state, `${JSON.stringify(s, null, 2)}\n`);
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

export const hubEnabled = () => Boolean(cfg().url);
export const targetFor = (id, version) => `/api/calm/namespaces/${cfg().ns}/architectures/${id}/versions/${version.replaceAll('.', '-')}`;

async function call(method, path, body) {
  const res = await fetch(`${cfg().url}${path}`, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok && !(method === 'DELETE' && res.status === 404)) throw new Error(`${method} ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function ensureNamespace() {
  const { ns } = cfg();
  const names = ((await (await call('GET', '/api/calm/namespaces')).json()).values ?? []).map((v) => v.name);
  if (!names.includes(ns)) await call('POST', '/api/calm/namespaces', { name: ns, description: 'Agentic SDLC blueprint: the governed trade capture demo' });
}

export async function resetHub() {
  if (!hubEnabled()) return;
  const s = load();
  try {
    for (const id of s.decorators) await call('DELETE', `/api/calm/namespaces/${cfg().ns}/decorators/${id}`);
    if (s.architectureId) await call('DELETE', `/api/calm/namespaces/${cfg().ns}/architectures/${s.architectureId}`);
  } catch { /* an unreachable hub leaves nothing to reset */ }
  save(empty());
}

export async function publishArchitecture(text) {
  if (!hubEnabled()) return null;
  try {
    const s = load();
    const key = sha256(text);
    if (s.versions[key]) return { id: s.architectureId, version: s.versions[key], target: targetFor(s.architectureId, s.versions[key]) };
    const version = `1.${Object.keys(s.versions).length}.0`;
    const body = { name: NAME, description: DESCRIPTION, architectureJson: text };
    if (!s.architectureId) {
      await ensureNamespace();
      const res = await call('POST', `/api/calm/namespaces/${cfg().ns}/architectures`, body);
      s.architectureId = Number(res.headers.get('location')?.match(/architectures\/(\d+)\//)?.[1]);
    } else {
      await call('POST', `/api/calm/namespaces/${cfg().ns}/architectures/${s.architectureId}/versions/${version}`, body);
    }
    s.versions[key] = version;
    save(s);
    return { id: s.architectureId, version, target: targetFor(s.architectureId, version) };
  } catch (e) {
    return { error: e.message };
  }
}

export async function postDecorator(decorator) {
  if (!hubEnabled()) return null;
  try {
    const res = await call('POST', `/api/calm/namespaces/${cfg().ns}/decorators`, decorator);
    const id = Number(res.headers.get('location')?.match(/decorators\/(\d+)/)?.[1]);
    const s = load();
    s.decorators.push(id);
    save(s);
    return id;
  } catch (e) {
    return { error: e.message };
  }
}
```

- [ ] **Step 4: Run the tests, then commit**

Run: `node --test test/hub.test.mjs && npm test 2>&1 | grep -E '^ℹ (pass|fail)'`
Expected: all pass.

```bash
git add gateway/gateway/hub.mjs test/hub.test.mjs
git commit -m "feat(gateway): publish the architecture and its decorators to CALM Hub

Spec: SPEC-004"
```

---

### Task 4: The gateway commands

**Files:**
- Rewrite: `gateway/gateway/lib.mjs`, `gateway/gateway/propose.mjs`, `gateway/gateway/review.mjs`, `gateway/gateway/approve.mjs`, `gateway/gateway/merge.mjs`, `gateway/gateway/evidence.mjs`
- Create: `gateway/gateway/reset.mjs`
- Delete: `gateway/policy/` (all), `gateway/package.json`, `gateway/package-lock.json`, `gateway/decisions.ndjson`, `gateway/ledger.json`, `gateway/token.json`, `gateway/reviews/` (untracked runtime files; delete if present)
- Modify: `gateway/.gitignore`
- Create: `test/gateway.test.mjs`

**Interfaces:**
- Consumes: `changeInput`, `baseArchitecture`, `baseArchitectureText`, `nodeForPath` (gates/lib/calm.mjs); `evaluateControls` (gates/lib/controls.mjs); `buildDecorators`, `validateDecorator` (Task 2); hub functions (Task 3).
- Produces: command lines used by `run-demo.sh` in Task 5:
  - `node gateway/reset.mjs`
  - `node gateway/propose.mjs <demo/changes/x.json>` → writes `.demo/changes/<id>.json` `{ id, title, spec, author, commit, diff_sha256, files }`
  - `node gateway/review.mjs <id> --as <identity> [--verdict approve|reject]` → `.demo/reviews/<id>.<identity>.json`
  - `node gateway/approve.mjs <id> --as <approver> [--lines N]` (binding code from `APPROVE_CODE` without a TTY) → `.demo/token.json`
  - `node gateway/merge.mjs <id> --review <file> [--approval <file>]` → exit 0 ALLOW / 1 DENY
  - `node gateway/evidence.mjs [--last N]`
  - `bindingCode(change)` and `loadChange(id)` exported from `lib.mjs`.

- [ ] **Step 1: Write the failing tests**

`test/gateway.test.mjs` drives the commands as processes in a temporary copy of the gateway state (`GATEWAY_DEMO` points `.demo` elsewhere):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GW = new URL('../gateway/', import.meta.url).pathname;
const run = (env, ...args) => spawnSync('node', args, { cwd: GW, env: { ...process.env, CALM_HUB_URL: '', ...env }, encoding: 'utf8' });

test('a routine change: self review denied, approved reviewer allowed, then main moves; a merged change cannot be merged again', () => {
  const demo = mkdtempSync(join(tmpdir(), 'gw-demo-'));
  const env = { GATEWAY_DEMO: demo };
  try {
    assert.equal(run(env, 'gateway/reset.mjs').status, 0);
    assert.equal(run(env, 'gateway/propose.mjs', 'demo/changes/account-summary.json').status, 0);
    run(env, 'gateway/review.mjs', 'CHG-0421', '--as', 'author-agent');
    const self = run(env, 'gateway/merge.mjs', 'CHG-0421', '--review', join(demo, 'reviews/CHG-0421.author-agent.json'));
    assert.equal(self.status, 1);
    assert.match(self.stdout, /^DENY/);
    assert.match(self.stdout, /The author may not review its own change/);
    run(env, 'gateway/review.mjs', 'CHG-0421', '--as', 'review-bot');
    const ok = run(env, 'gateway/merge.mjs', 'CHG-0421', '--review', join(demo, 'reviews/CHG-0421.review-bot.json'));
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /^ALLOW/);
    assert.match(ok.stdout, /main -> [0-9a-f]{7}/);
    const again = run(env, 'gateway/merge.mjs', 'CHG-0421', '--review', join(demo, 'reviews/CHG-0421.review-bot.json'));
    assert.equal(again.status, 1, 'a change already in main is not merged again');
  } finally { rmSync(demo, { recursive: true, force: true }); }
});

test('an approval bound to another commit is denied', () => {
  const demo = mkdtempSync(join(tmpdir(), 'gw-demo-'));
  const env = { GATEWAY_DEMO: demo };
  try {
    run(env, 'gateway/reset.mjs');
    run(env, 'gateway/propose.mjs', 'demo/changes/position-total.json');
    const code = spawnSync('node', ['-e', `import('./gateway/lib.mjs').then((m) => console.log(m.bindingCode(m.loadChange('CHG-0422'))))`], { cwd: GW, env: { ...process.env, ...env }, encoding: 'utf8' }).stdout.trim();
    assert.equal(run({ ...env, APPROVE_CODE: code }, 'gateway/approve.mjs', 'CHG-0422', '--as', 'alice').status, 0);
    run(env, 'gateway/propose.mjs', 'demo/changes/position-total-amended.json');
    run(env, 'gateway/review.mjs', 'CHG-0423', '--as', 'review-bot');
    const r = run(env, 'gateway/merge.mjs', 'CHG-0423', '--review', join(demo, 'reviews/CHG-0423.review-bot.json'), '--approval', join(demo, 'token.json'));
    assert.equal(r.status, 1);
    assert.match(r.stdout, /The approval is for this (commit|exact diff)/);
  } finally { rmSync(demo, { recursive: true, force: true }); }
});

test('every decision writes valid decorators to the demo directory', () => {
  const demo = mkdtempSync(join(tmpdir(), 'gw-demo-'));
  const env = { GATEWAY_DEMO: demo };
  try {
    run(env, 'gateway/reset.mjs');
    run(env, 'gateway/propose.mjs', 'demo/changes/account-summary.json');
    run(env, 'gateway/review.mjs', 'CHG-0421', '--as', 'review-bot');
    run(env, 'gateway/merge.mjs', 'CHG-0421', '--review', join(demo, 'reviews/CHG-0421.review-bot.json'));
    const ls = spawnSync('ls', [join(demo, 'decorators')], { encoding: 'utf8' }).stdout.trim().split('\n');
    assert.equal(ls.length, 4, ls.join(','));
  } finally { rmSync(demo, { recursive: true, force: true }); }
});

test('reset warns about a dirty blueprint', () => {
  const demo = mkdtempSync(join(tmpdir(), 'gw-demo-'));
  const probe = new URL('../gateway/.dirty-probe', import.meta.url).pathname;
  try {
    writeFileSync(probe, 'x');
    const r = run({ GATEWAY_DEMO: demo }, 'gateway/reset.mjs');
    assert.match(r.stdout, /uncommitted/);
  } finally { rmSync(probe, { force: true }); rmSync(demo, { recursive: true, force: true }); }
});
```

These tests need the demo's change descriptors and patches. Do Task 5 Steps 1 and 2 (descriptors, fixtures, `make-patches.mjs`, run it, remove the old demo files) first, as part of this task, and commit them with it; Task 5 then starts at Step 3.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/gateway.test.mjs 2>&1 | tail -6`
Expected: FAIL (`reset.mjs` missing).

- [ ] **Step 3: Rewrite `gateway/gateway/lib.mjs`**

Keep these existing functions **verbatim** from the current file: `b64url`, `fromB64url`, `slug`, `keyPair`, `publicKeyOf`, `signJws`, `decodeJws`, `verifyJws`, `bindingCode`, `readLedger`, `markUsed`, `paint`, `label`, `parseArgs`, `run`, `short`. Delete `loadArchitecture`, `nodesTouched`, `frontMatter`, `loadSpec`, `changeInput`, `evaluate`, `logDecision`, `readDecisions` and the `paths`/`REPO`/`APPROVAL_SERVICE` definitions, and add:

```js
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // gateway/
export const BLUEPRINT = resolve(ROOT, '..');
export const DEMO = process.env.GATEWAY_DEMO ?? join(ROOT, '.demo');
export const paths = {
  repo: join(DEMO, 'repo'),
  changes: join(DEMO, 'changes'),
  reviews: join(DEMO, 'reviews'),
  decorators: join(DEMO, 'decorators'),
  token: join(DEMO, 'token.json'),
  ledger: join(DEMO, 'ledger.json'),
  decisions: join(DEMO, 'decisions.ndjson'),
  keys: join(ROOT, 'keys'),
};
export const ARCHITECTURE = 'architecture/trade-capture.architecture.json';
export const APPROVAL = { issuer: 'approval-service', audience: 'merge-gateway', maxAgeSeconds: 600 };
export const APPROVAL_SERVICE = APPROVAL.issuer;

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const git = (...args) => execFileSync('git', args, { cwd: paths.repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const gitBytes = (...args) => execFileSync('git', args, { cwd: paths.repo, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });

// The exact diff a change carries: its commit against the point where it left main. The gateway recomputes it on
// every decision and never takes a hash from the change file.
export const diffOf = (commit) => gitBytes('diff', '--no-color', '--no-ext-diff', '--full-index', '--no-renames', `main...${commit}`);

export const loadChange = (id) => {
  const file = join(paths.changes, `${id}.json`);
  if (!existsSync(file)) throw new Error(`no proposed change ${id}: run propose first`);
  return JSON.parse(readFileSync(file, 'utf8'));
};

// A clean checkout of a commit, for scanning its code, removed afterwards.
export async function withCheckout(commit, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-'));
  git('worktree', 'add', '--detach', '--quiet', dir, commit);
  try { return await fn(dir); } finally { git('worktree', 'remove', '--force', dir); }
}

export function logDecision(entry) {
  appendFileSync(paths.decisions, `${JSON.stringify(entry)}\n`);
  return entry;
}
export const readDecisions = () => (existsSync(paths.decisions) ? readFileSync(paths.decisions, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
```

Update the file's header comment to: `// Shared pieces of the merge gateway: the repository it guards, hashing, ES256 keys and compact JWS, the approval token ledger, the decision log and terminal output.` Remove the `@open-policy-agent/opa-wasm` import.

- [ ] **Step 4: Write `gateway/gateway/reset.mjs`**

```js
// reset.mjs: a fresh repository for the gateway to guard, cloned from the blueprint's last commit, and, when
// CALM_HUB_URL is set, its architecture published to CALM Hub as the first version.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { relative } from 'node:path';
import { ARCHITECTURE, BLUEPRINT, DEMO, git, label, paths, run, short } from './lib.mjs';
import { hubEnabled, publishArchitecture, resetHub } from './hub.mjs';

run(async () => {
  await resetHub();
  rmSync(DEMO, { recursive: true, force: true });
  for (const dir of [paths.changes, paths.reviews, paths.decorators]) mkdirSync(dir, { recursive: true });
  execFileSync('git', ['clone', '--quiet', '--no-hardlinks', BLUEPRINT, paths.repo]);
  git('checkout', '-q', '-B', 'main');
  git('config', 'user.name', 'merge-gateway');
  git('config', 'user.email', 'merge-gateway@example.invalid');
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: BLUEPRINT, encoding: 'utf8' }).trim() !== '';
  console.log(label('repo', `${relative(process.cwd(), paths.repo) || paths.repo} at ${short(git('rev-parse', 'main'), 7)} (main)`));
  if (dirty) console.log(label('', 'note: the blueprint has uncommitted changes; the guarded repository has its last commit only'));
  if (!hubEnabled()) { console.log(label('hub', 'off (set CALM_HUB_URL to publish the architecture and every decision)')); return; }
  const published = await publishArchitecture(`${git('show', `main:${ARCHITECTURE}`)}\n`); // the file's bytes: same text, same Hub version
  console.log(label('hub', published?.error ? `failed: ${published.error}` : `Trade Capture (governed) ${published.version} -> ${published.target}`));
});
```

- [ ] **Step 5: Write `gateway/gateway/propose.mjs`**

```js
// propose.mjs <demo/changes/x.json>: the agent's branch. Applies the change's patch to main in the guarded repository
// as one commit by its author, with a Spec trailer, and shows the change the way the gateway will see it.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { nodeForPath } from '../../gates/lib/calm.mjs';
import { ARCHITECTURE, diffOf, git, label, parseArgs, paths, run, sha256 } from './lib.mjs';

run(async () => {
  const { positional } = parseArgs(process.argv.slice(2));
  if (!positional[0]) throw new Error('usage: node gateway/propose.mjs <demo/changes/x.json>');
  const file = resolve(positional[0]);
  const desc = JSON.parse(readFileSync(file, 'utf8'));
  for (const key of ['id', 'title', 'spec', 'author', 'patch']) if (!desc[key]) throw new Error(`${positional[0]} has no ${key}`);

  git('checkout', '-q', '-B', `agent/${desc.id}`, 'main');
  try {
    git('apply', '--index', join(dirname(file), '..', 'patches', desc.patch));
    git('-c', `user.name=${desc.author}`, '-c', `user.email=${desc.author}@example.invalid`, 'commit', '-q', '-m', `${desc.title}\n\nSpec: ${desc.spec}`);
  } finally {
    git('checkout', '-q', 'main');
  }
  const commit = git('rev-parse', `agent/${desc.id}`);
  const diff = diffOf(commit);
  const files = git('diff', '--name-only', '--no-renames', `main...${commit}`).split('\n').filter(Boolean);
  const change = { id: desc.id, title: desc.title, spec: desc.spec, author: desc.author, commit, diff_sha256: sha256(diff), files };
  mkdirSync(paths.changes, { recursive: true });
  writeFileSync(join(paths.changes, `${desc.id}.json`), `${JSON.stringify(change, null, 2)}\n`);

  const arch = JSON.parse(git('show', `main:${ARCHITECTURE}`));
  const nodes = [...new Set(files.map((f) => nodeForPath(arch, f)?.['unique-id']).filter(Boolean))];
  console.log(label('change', `${change.id}  ${change.title}`));
  console.log(label('spec', change.spec));
  console.log(label('author', change.author));
  console.log(label('commit', `${commit.slice(0, 7)} on agent/${change.id}`));
  files.forEach((f, i) => console.log(label(i === 0 ? 'files' : '', f)));
  console.log(label('nodes', nodes.length ? nodes.join(', ') : 'none: no node owns these files'));
  console.log(label('diff', `sha256 ${change.diff_sha256.slice(0, 16)}…, ${diff.toString('utf8').split('\n').length} lines`));
});
```

- [ ] **Step 6: Write `gateway/gateway/review.mjs`**

```js
// review.mjs <id> --as <identity> [--verdict approve|reject]: a review record signed (ES256) by that identity, bound to
// the change's commit and the SHA-256 of its exact diff, recomputed from the repository.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { diffOf, keyPair, loadChange, parseArgs, paths, run, sha256, signJws, slug } from './lib.mjs';

run(async () => {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  if (!positional[0] || typeof flags.as !== 'string') throw new Error('usage: node gateway/review.mjs <id> --as <identity> [--verdict approve|reject]');
  const change = loadChange(positional[0]);
  const reviewer = flags.as;
  const verdict = flags.verdict ?? 'approve';
  const claims = { iss: reviewer, sub: change.id, reviewer, commit: change.commit, diff_sha256: sha256(diffOf(change.commit)), verdict, iat: Math.floor(Date.now() / 1000) };
  const jws = signJws(claims, keyPair(reviewer).privateKey, slug(reviewer));
  mkdirSync(paths.reviews, { recursive: true });
  const out = join(paths.reviews, `${change.id}.${slug(reviewer)}.json`);
  writeFileSync(out, `${JSON.stringify({ jws, claims }, null, 2)}\n`);
  console.log(`review  ${change.id} ${change.commit.slice(0, 7)}  ${verdict} by ${reviewer}  -> ${relative(process.cwd(), out)}`);
});
```

- [ ] **Step 7: Write `gateway/gateway/approve.mjs`**

Start from the current file and change only these things:
- Usage: `node gateway/approve.mjs <id> --as <approver> [--lines N] [--width N]`; `--as` is required.
- `loadChange(positional[0])` takes an id. Render the diff from the repository: `const diff = diffOf(change.commit); const diffText = diff.toString('utf8'); const diffSha = sha256(diff);` and print `diff sha256 ${diffSha}` and the first `--lines` lines of `diffText` (never the change file's summary).
- The binding code is `bindingCode({ commit: change.commit, diff_sha256: diffSha })`.
- Remove the `loadArchitecture` / `human-approval` lookup; `exp: iat + APPROVAL.maxAgeSeconds`, `aud: APPROVAL.audience`, `iss: APPROVAL.issuer`, `sub: flags.as`.
- `authorization_details: [{ type: 'repo:merge', change: change.id, commit: change.commit, diff_sha256: diffSha, spec: change.spec }]`.
- Final lines: `approved by ${claims.sub} (amr webauthn, mocked)` and the token line as today.

- [ ] **Step 8: Write `gateway/gateway/merge.mjs`**

```js
// merge.mjs <id> --review <file> [--approval <file>]: the merge gateway. Verifies signatures and recomputes the diff
// in Node, works out the facts with the controls of main, evaluates them with ergo at stage merge, records the
// decision as control-evaluation decorators (and on CALM Hub when CALM_HUB_URL is set), and on ALLOW merges into main.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { baseArchitectureText, changeInput } from '../../gates/lib/calm.mjs';
import { evaluateControls } from '../../gates/lib/controls.mjs';
import { buildDecorators, validateDecorator } from './decorators.mjs';
import { hubEnabled, postDecorator, publishArchitecture } from './hub.mjs';
import {
  APPROVAL, ARCHITECTURE, decodeJws, diffOf, git, loadChange, logDecision, markUsed, paint, parseArgs, paths,
  publicKeyOf, readLedger, run, sha256, verifyJws, withCheckout,
} from './lib.mjs';

function loadReview(file) {
  const { jws } = JSON.parse(readFileSync(file, 'utf8'));
  const { claims } = decodeJws(jws);
  return { reviewer: claims.reviewer, commit: claims.commit, diff_sha256: claims.diff_sha256, verdict: claims.verdict, verified: verifyJws(jws, publicKeyOf(claims.reviewer ?? '')) };
}

// Everything about the token that is not about this change is checked here and folded into verified; the binding to
// this commit and diff, and single use, are the policy's checks.
function loadApproval(file, now) {
  const { jwt } = JSON.parse(readFileSync(file, 'utf8'));
  const { claims } = decodeJws(jwt);
  const grant = (claims.authorization_details ?? []).find((g) => g.type === 'repo:merge') ?? {};
  const verified = verifyJws(jwt, publicKeyOf(APPROVAL.issuer)) && claims.iss === APPROVAL.issuer && claims.aud === APPROVAL.audience
    && now <= claims.exp && now - claims.iat <= APPROVAL.maxAgeSeconds;
  return { approver: claims.sub, commit: grant.commit, diff_sha256: grant.diff_sha256, verified, used: Boolean(readLedger().used[claims.jti]), jti: claims.jti };
}

// The checks a reader needs first when a requirement fails; the rest follow in report order.
const FIRST = ['human_approved', 'not_the_author', 'in_architecture', 'in_spec', 'names_a_spec', 'approval_for_this_diff'];
const rank = (v) => (FIRST.includes(v.check) ? FIRST.indexOf(v.check) : FIRST.length);
const reasons = (outcome) => {
  const lines = [];
  if (outcome.error) lines.push(`the controls could not be evaluated: ${outcome.error}`);
  for (const p of outcome.problems ?? []) lines.push(p);
  for (const name of outcome.failing ?? []) {
    lines.push(outcome.report.requirements[name].description);
    const vs = outcome.violations.filter((v) => v.requirement === name).sort((a, b) => rank(a) - rank(b));
    const seen = [...new Set(vs.map((v) => `${v.subject?.id}: ${v.description || v.check}`))];
    for (const s of seen.slice(0, 2)) lines.push(`  ${s}`);
    if (seen.length > 2) lines.push(`  … and ${seen.length - 2} more`);
  }
  return lines;
};

run(async () => {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  if (!positional[0] || typeof flags.review !== 'string') throw new Error('usage: node gateway/merge.mjs <id> --review <file> [--approval <file>]');
  const change = loadChange(positional[0]);
  const now = Math.floor(Date.now() / 1000);
  const main = git('rev-parse', 'main');
  // Controls from main as it is now; the change's files from where it left main.
  const base = git('merge-base', main, change.commit);
  const archText = baseArchitectureText(main, paths.repo);
  const arch = JSON.parse(archText);
  const diffSha = sha256(diffOf(change.commit));

  const input = await withCheckout(change.commit, (tree) => changeInput({ arch, base, head: change.commit, root: paths.repo, treeRoot: tree, specId: change.spec, author: change.author }));
  input.change.diff_sha256 = diffSha;
  input.change.review = loadReview(flags.review);
  let approval;
  if (typeof flags.approval === 'string') { approval = loadApproval(flags.approval, now); const { jti, ...claims } = approval; input.change.approval = claims; }

  // A change with nothing left to merge (already in main) is not a change.
  const empty = input.change.files.length === 0;
  const outcome = empty ? { allowed: false, error: 'nothing to merge: the change is already in main', controls: {} } : await evaluateControls(input, { stage: 'merge' });

  const decisionId = randomUUID();
  const evaluatedAt = new Date().toISOString();
  const published = await publishArchitecture(archText);
  const target = published?.target ?? `${ARCHITECTURE}@${sha256(archText).slice(0, 12)}`;
  const decorators = buildDecorators({ outcome, input, decisionId, target, evaluatedAt });
  mkdirSync(paths.decorators, { recursive: true });
  const hubIds = [];
  for (const d of decorators) {
    const { valid, errors } = validateDecorator(d);
    if (!valid) throw new Error(`decorator ${d['unique-id']} is not valid: ${errors.join('; ')}`);
    writeFileSync(join(paths.decorators, `${d['unique-id']}.json`), `${JSON.stringify(d, null, 2)}\n`);
    hubIds.push(await postDecorator(d));
  }
  logDecision({
    decision_id: decisionId, timestamp: evaluatedAt, allowed: outcome.allowed,
    change: { id: change.id, commit: change.commit, diff_sha256: diffSha, spec: change.spec, author: change.author },
    architecture_sha256: sha256(archText), policy_sha256: outcome.policySha ?? null,
    failing: outcome.failing ?? [], problems: outcome.problems ?? [], error: outcome.error ?? null,
    decorators: decorators.map((d) => ({ id: d['unique-id'], control: d.data.control['unique-id'], status: d.data.status, 'applies-to': d['applies-to'] })),
    hub: published && !published.error ? { version: published.version, target } : null,
  });

  if (outcome.allowed) {
    console.log(paint.bold(paint.green('ALLOW')));
    if (approval) markUsed(approval.jti, { change: change.id, commit: change.commit, decision_id: decisionId, at: evaluatedAt });
    git('merge', '--no-ff', '-q', '-m', `Merge ${change.id}: ${change.title}\n\nSpec: ${change.spec}`, change.commit);
    console.log(`  main -> ${git('rev-parse', '--short=7', 'main')} (merged ${change.id})`);
    const after = git('show', `main:${ARCHITECTURE}`);
    if (after !== archText.trim()) {
      console.log('  architecture changed on main');
      if (hubEnabled()) {
        const next = await publishArchitecture(`${after}\n`);
        console.log(`  hub: ${next?.error ? `failed: ${next.error}` : `published ${next.version} -> ${next.target}`}`);
      }
    }
  } else {
    console.log(paint.bold(paint.red('DENY')));
    for (const line of reasons(outcome)) console.log(`  ${line}`);
  }
  const hubNote = !hubEnabled() ? '' : published?.error ? `  hub failed: ${published.error}` : hubIds.some((x) => x?.error) ? '  hub: some decorators failed' : `  hub ${published.version}`;
  console.log(paint.dim(`logged  decision ${decisionId.slice(0, 8)}  ${decorators.length} decorators${hubNote}`));
  process.exitCode = outcome.allowed ? 0 : 1;
});
```

Note: `git show` output is trimmed by the `git` helper; compare `after` with `archText.trim()`, and publish `after` plus the newline the file ends with, so the same model always hashes the same way.

- [ ] **Step 9: Write `gateway/gateway/evidence.mjs`**

```js
// evidence.mjs [--last N]: the most recent decisions from the log, with the decorators each one wrote.
import { parseArgs, readDecisions, run } from './lib.mjs';

run(async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  const all = readDecisions();
  const last = Math.min(Number(flags.last ?? 2), all.length);
  console.log(`decisions.ndjson  ${all.length} decisions, last ${last}, each recorded as control-evaluation decorators`);
  for (const entry of all.slice(-last)) {
    console.log(`${entry.timestamp}  ${entry.allowed ? 'ALLOW' : 'DENY'}  ${entry.change.id} ${entry.change.commit.slice(0, 7)}  decision ${entry.decision_id.slice(0, 8)}`);
    console.log(`    architecture sha256:${entry.architecture_sha256.slice(0, 16)}…  policy sha256:${(entry.policy_sha256 ?? 'none').slice(0, 16)}…${entry.hub ? `  hub ${entry.hub.version}` : ''}`);
    for (const d of entry.decorators) console.log(`    ${d.status.padEnd(15)}${d.control}  on ${d['applies-to'].join(', ')}`);
  }
});
```

- [ ] **Step 10: Delete the old policy and install, update `.gitignore`**

```bash
git rm -r -q gateway/policy gateway/package.json gateway/package-lock.json
rm -rf gateway/node_modules gateway/reviews gateway/decisions.ndjson gateway/ledger.json gateway/token.json
```

`gateway/.gitignore`:

```
.demo/
.sessions/
.hub-state.json
keys/
```

- [ ] **Step 11: Run the tests**

Run: `node --test test/gateway.test.mjs && npm test 2>&1 | grep -E '^ℹ (pass|fail)' && npm run typecheck`
Expected: all pass. The tests clone the blueprint's last commit, so commit Tasks 1–3 before running them (they are committed by then).

- [ ] **Step 12: Commit**

```bash
git add -A gateway test/gateway.test.mjs
git commit -m "feat(gateway): guard a real repository, decide with the model's controls, merge on ALLOW

Spec: SPEC-004"
```

---

### Task 5: The demo: changes, patches, run-demo, self-check, CI

**Files:**
- Create: `gateway/demo/make-patches.mjs`, `gateway/demo/changes/*.json` (6), `gateway/demo/patches/*.patch` (6)
- Delete: `gateway/demo/change-tier1.json`, `gateway/demo/change-tier1-amended.json`, `gateway/demo/change-tier2.json`, `gateway/demo/tier1.patch`, `gateway/demo/tier1-amended.patch`, `gateway/demo/tier2.patch`
- Rewrite: `gateway/run-demo.sh`, `gateway/demo/sessions.mjs`
- Regenerate: `gateway/sessions.json`
- Modify: `.github/workflows/governed-sdlc.yml` (job `gateway`)

**Interfaces:**
- Consumes: the commands from Task 4.
- Produces: `gateway/sessions.json` with sessions, in order: `reset`, `routine`, `ledger`, `approve`, `amended`, `allowed`, `shortcut`, `architect`, `climax`, `evidence`. Plan 5 (the deck) reads it.

- [ ] **Step 1: Write the change descriptors**

`gateway/demo/changes/account-summary.json`:
```json
{ "id": "CHG-0421", "title": "Account summary endpoint on trade-api", "spec": "SPEC-001", "author": "author-agent", "patch": "account-summary.patch" }
```
`position-total.json`:
```json
{ "id": "CHG-0422", "title": "Position total endpoint on position-service", "spec": "SPEC-001", "author": "author-agent", "patch": "position-total.patch" }
```
`position-total-amended.json`:
```json
{ "id": "CHG-0423", "title": "Position total endpoint on position-service, one more line after approval", "spec": "SPEC-001", "author": "author-agent", "patch": "position-total-amended.patch" }
```
`ledger-shortcut.json`:
```json
{ "id": "CHG-0424", "title": "Read positions straight from the ledger file in trade-api", "spec": "SPEC-001", "author": "author-agent", "patch": "ledger-shortcut.patch" }
```
`architect-ledger-connection.json`:
```json
{ "id": "CHG-0425", "title": "Model: trade-api writes end-of-day snapshots to the Client Ledger", "spec": "SPEC-003", "author": "bob", "patch": "architect-ledger-connection.patch" }
```
`trade-count.json`:
```json
{ "id": "CHG-0426", "title": "Trade count endpoint on trade-api", "spec": "SPEC-001", "author": "author-agent", "patch": "trade-count.patch" }
```

- [ ] **Step 2: Write the patch generator**

`gateway/demo/make-patches.mjs` regenerates every patch from edits applied in the order the demo merges them, so each patch applies to the `main` it will meet:

```js
// make-patches.mjs: regenerates demo/patches from the edits below, applied to a scratch clone of the blueprint in the
// order the demo merges them, so each patch applies to the main the demo will present it to. Run after changing the
// services or the model; commit the patches.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const here = resolve(import.meta.dirname);
const blueprint = resolve(here, '..', '..');
const dir = mkdtempSync(join(tmpdir(), 'patches-'));
const env = { ...process.env, GIT_AUTHOR_NAME: 'p', GIT_AUTHOR_EMAIL: 'p@example.invalid', GIT_COMMITTER_NAME: 'p', GIT_COMMITTER_EMAIL: 'p@example.invalid' };
const g = (...args) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' });
const edit = (path, fn) => writeFileSync(join(dir, path), fn(readFileSync(join(dir, path), 'utf8')));
const insertBefore = (marker, text) => (src) => {
  if (!src.includes(marker)) throw new Error(`marker not found: ${marker}`);
  return src.replace(marker, `${text}${marker}`);
};
const HEALTH = "      if (url.pathname === '/health') return send(res, 200, { status: 'ok' });";

const summaryHandler = `      const summary = url.pathname.match(/^\\/accounts\\/([^/]+)\\/summary$/);
      if (req.method === 'GET' && summary) {
        const account = decodeURIComponent(summary[1]!);
        // SPEC-001: positions are owned by position-service. We reach them only over the modelled connection
        // trade-api-to-position-service, never by reading the Client Ledger.
        const upstream = await fetch(\`\${positionServiceUrl}/positions/\${encodeURIComponent(account)}\`).catch(() => undefined);
        if (!upstream?.ok) return send(res, 502, { error: 'position-service unavailable' });
        const { positions } = (await upstream.json()) as { positions: Record<string, number> };
        return send(res, 200, { account, trades: store.all().filter((t) => t.account === account), positions });
      }
`;
const totalHandler = (extra = '') => `      const total = url.pathname.match(/^\\/positions\\/([^/]+)\\/total$/);
      if (req.method === 'GET' && total) {
        const account = decodeURIComponent(total[1]!);
        const holdings = Object.values(store.read()[account] ?? {});
${extra}        return send(res, 200, { account, total: holdings.reduce((sum, q) => sum + q, 0) });
      }
`;
const countHandler = `      if (req.method === 'GET' && url.pathname === '/trades/count') {
        return send(res, 200, { count: store.all().length });
      }
`;

const steps = [
  { patch: 'account-summary.patch', merge: true, apply: () => {
    edit('services/trade-api/src/app.ts', insertBefore(HEALTH, summaryHandler));
    writeFileSync(join(dir, 'test/account-summary.test.ts'), readFileSync(join(here, 'fixtures/account-summary.test.ts'), 'utf8'));
  } },
  { patch: 'position-total-amended.patch', merge: false, apply: () => {
    edit('services/position-service/src/app.ts', insertBefore(HEALTH, totalHandler("        res.setHeader('x-total-source', 'client-ledger');\n")));
  } },
  { patch: 'position-total.patch', merge: true, apply: () => {
    edit('services/position-service/src/app.ts', insertBefore(HEALTH, totalHandler()));
    writeFileSync(join(dir, 'test/position-total.test.ts'), readFileSync(join(here, 'fixtures/position-total.test.ts'), 'utf8'));
  } },
  { patch: 'ledger-shortcut.patch', merge: false, apply: () => {
    edit('services/trade-api/src/config.ts', (src) => src.replace('};', "  // Quicker than asking position-service: read the ledger file directly.\n  ledgerPath: process.env.POSITION_STORE_PATH ?? 'data/positions.json',\n};"));
  } },
  { patch: 'architect-ledger-connection.patch', merge: true, apply: () => {
    edit('architecture/trade-capture.architecture.json', (src) => {
      const arch = JSON.parse(src);
      const at = arch.relationships.findIndex((r) => r['unique-id'] === 'trade-api-to-trade-store') + 1;
      arch.relationships.splice(at, 0, {
        'unique-id': 'trade-api-to-client-ledger',
        description: 'Trade API writes end-of-day trade snapshots straight to the Client Ledger (SPEC-003).',
        'relationship-type': { connects: { source: { node: 'trade-api' }, destination: { node: 'client-ledger', interfaces: ['client-ledger-file'] } } },
      });
      return `${JSON.stringify(arch, null, 2)}\n`;
    });
  } },
  { patch: 'trade-count.patch', merge: true, apply: () => {
    edit('services/trade-api/src/app.ts', insertBefore(HEALTH, countHandler));
  } },
];

try {
  g('clone', '--quiet', '--no-hardlinks', blueprint, dir);
  g('checkout', '-q', '-B', 'main');
  mkdirSync(join(here, 'patches'), { recursive: true });
  for (const step of steps) {
    g('checkout', '-q', '-B', 'work', 'main');
    step.apply();
    g('add', '-A');
    g('commit', '-q', '-m', step.patch);
    writeFileSync(join(here, 'patches', step.patch), g('diff', '--no-color', '--full-index', 'main', 'work'));
    g('checkout', '-q', 'main');
    if (step.merge) g('merge', '-q', '--no-ff', '-m', `merge ${step.patch}`, 'work');
    console.log(`wrote patches/${step.patch}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
```

The two test fixtures it reads:

`gateway/demo/fixtures/account-summary.test.ts`: the content of `test/account-summary.test.ts` from the current `gateway/demo/tier2.patch` (the 34 added lines, without the leading `+`), with its test names unchanged.

`gateway/demo/fixtures/position-total.test.ts`:

```ts
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../services/position-service/src/app.ts';
import { PositionStore } from '../services/position-service/src/store.ts';
import { listen, tempFile } from './helpers.ts';

const store = new PositionStore(tempFile('positions.json'));
const app = createApp(store);
const url = await listen(app);
after(() => app.close());

test('SPEC-001: position total sums an account\'s holdings', async () => {
  store.write({ 'ACC-3': { 'VOD.L': 60, 'BARC.L': 15 } });
  const body = await (await fetch(`${url}/positions/ACC-3/total`)).json();
  assert.deepEqual(body, { account: 'ACC-3', total: 75 });
});
```

Add `fixtures/` to `tsconfig.json`'s exclusions only if `npm run typecheck` picks them up (it includes `services` and `test` only, so it should not).

Run: `node gateway/demo/make-patches.mjs` and then `git rm -q gateway/demo/change-tier1.json gateway/demo/change-tier1-amended.json gateway/demo/change-tier2.json gateway/demo/tier1.patch gateway/demo/tier1-amended.patch gateway/demo/tier2.patch`
Expected: six `wrote patches/…` lines. Commit Tasks 4 and 5's files before running `run-demo.sh`, since the demo clones the last commit.

- [ ] **Step 3: Rewrite `gateway/run-demo.sh`**

```bash
#!/usr/bin/env bash
# Runs the demo the talk shows with no human at the keyboard and records every command with its exact output in
# sessions.json: one session per moment, one step per command. Ends with a self-check of every verdict.
# Set CALM_HUB_URL (for example http://localhost:8080) to publish the architecture and every decision to CALM Hub.
set -u
cd "$(dirname "$0")"
rm -rf .sessions sessions.json && mkdir -p .sessions

n=0
key=""
session() { key="$1"; }
step() {
  n=$((n + 1))
  printf '%s' "$key" > ".sessions/$n.key"
  printf '%s' "$1" > ".sessions/$n.cmd"
  bash -c "$1" < /dev/null > ".sessions/$n.out" 2>&1 || true
  printf '$ %s\n' "$1"
  cat ".sessions/$n.out"
  echo
}
# The human reads the binding code off the approval screen; the script derives it the same way.
code() { node -e "import('./gateway/lib.mjs').then((m) => { const c = m.loadChange('$1'); const d = m.sha256(m.diffOf(c.commit)); console.log(m.bindingCode({ commit: c.commit, diff_sha256: d })); })"; }
R=.demo/reviews

session reset
step "node gateway/reset.mjs"

session routine
step "node gateway/propose.mjs demo/changes/account-summary.json"
step "node gateway/review.mjs CHG-0421 --as author-agent"
step "node gateway/merge.mjs CHG-0421 --review $R/CHG-0421.author-agent.json"
step "node gateway/review.mjs CHG-0421 --as review-bot"
step "node gateway/merge.mjs CHG-0421 --review $R/CHG-0421.review-bot.json"

session ledger
step "node gateway/propose.mjs demo/changes/position-total.json"
step "node gateway/review.mjs CHG-0422 --as review-bot"
step "node gateway/merge.mjs CHG-0422 --review $R/CHG-0422.review-bot.json"

session approve
CODE=$(code CHG-0422)
step "APPROVE_CODE=$CODE node gateway/approve.mjs CHG-0422 --as alice --lines 12"

session amended
step "node gateway/propose.mjs demo/changes/position-total-amended.json"
step "node gateway/review.mjs CHG-0423 --as review-bot"
step "node gateway/merge.mjs CHG-0423 --review $R/CHG-0423.review-bot.json --approval .demo/token.json"

session allowed
step "node gateway/merge.mjs CHG-0422 --review $R/CHG-0422.review-bot.json --approval .demo/token.json"

session shortcut
step "node gateway/propose.mjs demo/changes/ledger-shortcut.json"
step "node gateway/review.mjs CHG-0424 --as review-bot"
step "node gateway/merge.mjs CHG-0424 --review $R/CHG-0424.review-bot.json"

session architect
step "node gateway/propose.mjs demo/changes/architect-ledger-connection.json"
step "node gateway/review.mjs CHG-0425 --as review-bot"
step "node gateway/merge.mjs CHG-0425 --review $R/CHG-0425.review-bot.json"
CODE=$(code CHG-0425)
step "APPROVE_CODE=$CODE node gateway/approve.mjs CHG-0425 --as alice --lines 12"
step "node gateway/merge.mjs CHG-0425 --review $R/CHG-0425.review-bot.json --approval .demo/token.json"

session climax
step "node gateway/propose.mjs demo/changes/trade-count.json"
step "node gateway/review.mjs CHG-0426 --as review-bot"
step "node gateway/merge.mjs CHG-0426 --review $R/CHG-0426.review-bot.json"

session evidence
step "node gateway/evidence.mjs --last 3"

node demo/sessions.mjs
```

- [ ] **Step 4: Update the self-check in `gateway/demo/sessions.mjs`**

Keep the assembly code and the checking loop; replace the `expected` object with:

```js
const expected = {
  reset: [{ has: ['(main)', 'hub'] }],
  routine: [
    { has: ['CHG-0421', 'trade-api'] },
    { has: ['by author-agent'] },
    { first: 'DENY', has: ['The author may not review its own change'] },
    { has: ['by review-bot'] },
    { first: 'ALLOW', has: ['main ->'], not: ['DENY'] },
  ],
  ledger: [
    { has: ['CHG-0422', 'position-service'] },
    { has: ['by review-bot'] },
    { first: 'DENY', has: ['connects to the Client Ledger', 'position-service-to-client-ledger: A human approved this change'] },
  ],
  approve: [{ has: ['diff --git', 'binding code', 'approved by alice', '-> .demo/token.json'] }],
  amended: [
    { has: ['CHG-0423'] },
    { has: ['by review-bot'] },
    { first: 'DENY', has: ['The approval is for this exact diff'] },
  ],
  allowed: [{ first: 'ALLOW', has: ['main ->'] }],
  shortcut: [
    { has: ['CHG-0424', 'trade-api'] },
    { has: ['by review-bot'] },
    { first: 'DENY', has: ['Every connection the code makes exists in the architecture', 'trade-api->client-ledger: The architecture has this connection'] },
  ],
  architect: [
    { has: ['CHG-0425', 'architecture/trade-capture.architecture.json', 'none: no node owns these files'] },
    { has: ['by review-bot'] },
    { first: 'DENY', has: ['no node owns', 'A human approved this change'] },
    { has: ['diff --git', 'trade-api-to-client-ledger', 'approved by alice'] },
    { first: 'ALLOW', has: ['main ->', 'architecture changed on main'] },
  ],
  climax: [
    { has: ['CHG-0426', 'trade-api'] },
    { has: ['by review-bot'] },
    { first: 'DENY', has: ['connects to the Client Ledger', 'trade-api-to-client-ledger: A human approved this change'] },
  ],
  evidence: [{ has: ['control-evaluation', 'not-met', 'client-ledger-human-approval'] }],
};
```

The architect's approval renders only 12 lines of the diff; if `trade-api-to-client-ledger` falls outside them, raise `--lines` for that step in `run-demo.sh` (keep the output under 22 lines) rather than dropping the check.

- [ ] **Step 5: Run the demo without and with the Hub**

```bash
git add -A gateway && git commit -q -m "feat(gateway): the four moments of the talk, replayed and checked

Spec: SPEC-004"
bash gateway/run-demo.sh | tail -3
```
Expected: `demo ok`.

Start CALM Hub if it is not running (`cd ../architecture-as-code/calm-hub && ../mvnw quarkus:dev -Pstandalone,server-only -Dquarkus.console.enabled=false`, wait for `Listening on: http://localhost:8080`), then:

```bash
CALM_HUB_URL=http://localhost:8080 bash gateway/run-demo.sh | tail -3
CALM_HUB_URL=http://localhost:8080 bash gateway/run-demo.sh | tail -3   # twice: reset must clean up
node -e "const s=require('./gateway/.hub-state.json'); console.log(s)"
curl -s "localhost:8080/api/calm/namespaces/finos.agentic-sdlc/architectures/$(node -p "require('./gateway/.hub-state.json').architectureId")/versions"
curl -s "localhost:8080/api/calm/namespaces/finos.agentic-sdlc/decorators/values?type=control-evaluation&target=/api/calm/namespaces/finos.agentic-sdlc/architectures/$(node -p "require('./gateway/.hub-state.json').architectureId")/versions/1-1-0" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const v=JSON.parse(s).values;console.log(v.length, v.map(d=>d.data.control['unique-id']+':'+d.data.status).join(' '))})"
```
Expected: `demo ok` both times; versions `["1.0.0","1.1.0"]`; the 1.1.0 decorators include `client-ledger-human-approval:not-met` (the climax). The architecture with id 15 (`trade-capture`) that was already in the local Hub is untouched (`curl -s localhost:8080/api/calm/namespaces/finos.agentic-sdlc/architectures`).

Commit the regenerated `gateway/sessions.json` from the run **without** the Hub (so it records `hub off`), re-running `bash gateway/run-demo.sh` last.

- [ ] **Step 6: The gateway CI job**

Replace job `gateway` in `.github/workflows/governed-sdlc.yml` with:

```yaml
  # The merge gateway the talk demonstrates: replays every decision the deck shows in a scratch clone of this
  # repository and fails if any verdict changes.
  gateway:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: bash gateway/run-demo.sh
```

- [ ] **Step 7: Run everything and commit**

Run: `npm run typecheck && npm test 2>&1 | grep -E '^ℹ (pass|fail)' && bash gateway/run-demo.sh | tail -1 && SPEC=SPEC-004 npm run gates | tail -1`
Expected: clean; all pass; `demo ok`; `ADMISSIBLE`.

```bash
git add -A gateway .github/workflows/governed-sdlc.yml
git commit -m "ci(gateway): replay the demo from the repository root

Spec: SPEC-004"
```

---

### Task 6: Documentation and leftover wording

**Files:**
- Rewrite: `gateway/README.md`
- Modify: `README.md` (sections "The question, and the answer", "Run it", "What enforces what", "Layout", "Honest limitations")
- Modify: `AGENTS.md:29` and `agent/GUARDRAILS.md:20` (router wording), `architecture/trade-capture.architecture.json` (two lowercase "position store" descriptions), `architecture/governed-service.pattern.json` (relationships description naming `gates/drift-check.mjs`), `architecture/standards/env-binding-interface.standard.json` (description naming `drift-check`), `specs/README.md` (`model-change` is informational)

- [ ] **Step 1: Write the failing check**

```bash
grep -rn "drift-check\|review-router\|run-all\|evidence\.mjs\|merge\.rego\|merge\.wasm\|tier 1\|tier 2\|criticality\|spiffe\|position store\|the router" README.md gateway/README.md AGENTS.md agent architecture/trade-capture.architecture.json architecture/governed-service.pattern.json architecture/standards specs/README.md
```
Expected: matches (the list to clear). `architecture/hub/*` (vendored catalog text) and `docs/` are out of scope.

- [ ] **Step 2: Rewrite `gateway/README.md`**

```markdown
# The merge gateway

The demo the talk shows, runnable. The gateway guards a repository (`.demo/repo`, a clone of this one) and is the
only thing that merges into its `main`. For every change it works out the facts with the controls of `main`'s
architecture, evaluates them with ergo (the same `gates/lib/controls.mjs` CI uses, at stage `merge`), records the
decision as CALM control-evaluation decorators, and merges on ALLOW. Deny by default.

    bash run-demo.sh                                    # every moment, recorded into sessions.json, self-checked
    CALM_HUB_URL=http://localhost:8080 bash run-demo.sh # the same, published to a local CALM Hub

The commands: `node gateway/reset.mjs`, `node gateway/propose.mjs demo/changes/<x>.json` (the agent's commit on a
branch), `node gateway/review.mjs <id> --as <identity>` (a signed review bound to the commit and the diff's SHA-256),
`node gateway/approve.mjs <id> --as <approver>` (the approval service: renders the real diff, asks for a binding code,
mints a single-use token bound to that commit and diff), `node gateway/merge.mjs <id> --review <file> [--approval
<file>]` and `node gateway/evidence.mjs --last N`.

What the demo shows:

1. **A routine change.** The author agent reviews its own change: DENY, in the catalog's words. The approved review
   bot reviews it: ALLOW, and `main` moves.
2. **The Client Ledger.** A change to `position-service`, which connects to the ledger: DENY until a human approves.
   The approval renders the real diff from the repository. Changing one line after approval kills the approval.
3. **The shortcut.** The agent makes trade-api read the ledger's file directly: DENY, that connection is not in the
   architecture.
4. **The architect's change.** The architect adds `trade-api -> client-ledger` to the model: a change no node owns,
   so it needs a human too. On merge the new architecture is published as the next version. The same kind of
   trade-api change that merged in moment 1 is now denied: the diagram changed, so the control followed.

Every decision is a line in `.demo/decisions.ndjson` and one decorator per control in `.demo/decorators/`, validated
against `standards/control-evaluation.decorator.standard.json`. With `CALM_HUB_URL` set, the architecture is published
to the namespace `CALM_HUB_NAMESPACE` (default `finos.agentic-sdlc`) as `Trade Capture (governed)`, one version per
model, and every decorator is posted against the version it was decided on. The gateway deletes only what it created
(`.hub-state.json`). To run CALM Hub locally: `../mvnw quarkus:dev -Pstandalone,server-only` in a checkout of
finos/architecture-as-code's `calm-hub`.

`demo/make-patches.mjs` regenerates the demo patches when the services or the model change. The slides' terminal
panes come from `sessions.json`.
```

- [ ] **Step 3: Update the root `README.md`**

Update these sections so they describe the repository as it now is (keep everything else; plan 5 revises the talk framing):
- **The question, and the answer** table: "The policy" row → `The controls carry their policy as ergo requirements in the model; one generic module evaluates them` (`gates/policy/`); "The gate" → `the merge gateway and gates/check.mjs` (`gateway/`, `gates/`); "The evidence" → `every decision as CALM control-evaluation decorators, on CALM Hub; the CI evidence bundle` (`gateway/`, `evidence/out/`).
- **Run it**: `npm install && npm test && npm run gates`, then `bash gateway/run-demo.sh`; replace the numbered list with the four moments from `gateway/README.md`, and add the `CALM_HUB_URL` line.
- **What enforces what**: one row per control in the model: SDLC-PREV-001 Code Review (system; `code-review`, `control-plane-human-approval`, merge gateway), Client Ledger human approval (on `client-ledger`; merge gateway), SDLC-PREV-004 (system; `change-names-approved-spec`, `requirements-scope`; CI and gateway), SDLC-PREV-017 (system; `service-dependency`; CI and gateway), SDLC-PREV-012 (system; `gates/check.mjs` runs the gates the model names), SDLC-PREV-014 (system; `evidence/out/gates.json`, decorators), and the workflow-only controls SDLC-PREV-007, -009, -010 as today.
- **Layout**: `gates/` becomes `gates/check.mjs, gates/lib (facts and the evaluator), gates/policy (ergo, the generic entrypoint, the built module)`; `gateway/` becomes `the merge gateway, its demo, the decorator Standard copy`.
- **Honest limitations**: remove the two bullets about keys added in memory and gates running beside the gateway; keep the approval-ceremony, identity, drift-scanner, evidence-retention and pattern bullets, updated to the new names; add: `CI reads the policy module and the evaluator from the change itself; the gateway reads them from its own checkout. In a bank both come from a protected source, not the change.`

- [ ] **Step 4: The leftover wording**

- `AGENTS.md:29`: `- You do not review your own change. The review router decides who does.` → `- You do not review your own change. The code review control in the model decides who may, and the merge gateway enforces it.`
- `agent/GUARDRAILS.md:20`: replace the sentence about "the router says `cognitive`" with one that says the code review control requires an approved reviewer who is not the author.
- `architecture/trade-capture.architecture.json`: the two descriptions containing "position store" → "Client Ledger" (case as appropriate; descriptions only).
- `architecture/governed-service.pattern.json`: the `relationships` description → `Every relationship is CALM 1.2; service dependency control compares the connections the code makes with the connects relationships here.`
- `architecture/standards/env-binding-interface.standard.json`: replace `gates/drift-check.mjs` in the description with `the service dependency control`.
- `specs/README.md`: in the `model-change` row, add `Informational: a model change is a change to a file no node owns, which needs a human approver at merge.`

- [ ] **Step 5: Run the check and everything**

Run the grep from Step 1. Expected: no matches.
Run: `npm run calm:validate | tail -1 && npm test 2>&1 | grep -E '^ℹ (pass|fail)' && SPEC=SPEC-004 npm run gates | tail -1 && bash gateway/run-demo.sh | tail -1`
Expected: `No issues found.`; all pass; `ADMISSIBLE`; `demo ok`.

- [ ] **Step 6: Commit**

```bash
git add README.md gateway/README.md AGENTS.md agent/GUARDRAILS.md architecture specs/README.md
git commit -m "docs: the gateway, the controls and the decorators, as they now are

Spec: SPEC-004"
```
