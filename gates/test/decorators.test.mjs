import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateControls } from '../lib/controls.mjs';
import { buildDecorators, validateDecorator, STANDARD_ID } from '../../gateway/gateway/decorators.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
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
  assert.equal(d.data.findings[0].description, 'A human approved this change');
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
