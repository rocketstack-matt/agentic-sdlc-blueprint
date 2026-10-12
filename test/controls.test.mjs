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

test('a control given only by requirement-url and config-url is a problem, naming the control', async () => {
  const doc = model();
  doc.controls['url-only-control'] = { description: 'Config lives elsewhere', requirements: [{ 'requirement-url': 'https://example.com/req.json', 'config-url': 'https://example.com/config.json' }] };
  const r = await merge(input(tradeApiChange, doc));
  assert.equal(r.allowed, false);
  assert.ok(r.problems.some((p) => p.includes('url-only-control')), JSON.stringify(r.problems));
});

test('a control without ergo on a relationship is a problem, naming the control', async () => {
  const doc = model();
  doc.relationships.find((x) => x['unique-id'] === 'trade-api-to-position-service').controls = {
    'relationship-control': { description: 'No ergo here', requirements: [{ 'requirement-url': 'https://example.com/req.json', config: { note: 'no ergo' } }] },
  };
  const r = await merge(input(tradeApiChange, doc));
  assert.equal(r.allowed, false);
  assert.ok(r.problems.some((p) => p.includes('relationship-control')), JSON.stringify(r.problems));
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
