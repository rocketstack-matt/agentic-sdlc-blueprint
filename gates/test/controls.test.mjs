import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { evaluateControls } from '../lib/controls.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
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
  // One row per node, with the node itself as the subject (issue 4, gap 2): trade-api passes, position-service fails.
  const rows = r.report.results.filter((x) => x.requirement === 'requirements-scope' && x.check === 'in_spec');
  assert.deepEqual(rows.map((x) => [x.subject.id, x.passed]).sort(), [['position-service', false], ['trade-api', true]]);
  const v = r.violations.find((x) => x.requirement === 'requirements-scope');
  assert.equal(v.message, 'node the change touches is "position-service", and $input.spec.nodes is ["trade-api"]');
});

test('docs-only change needs no spec: allowed in CI, and the spec rule is not applicable', async () => {
  const r = await ci(input({ commit: 'c0ffee1', author: 'someone', files: [{ path: 'README.md', node: null }, { path: 'docs/how-calm-and-ergo-work.md', node: null }], nodes: [], connections: [] }, model(), { id: null, approved: false, nodes: [] }));
  assert.equal(r.allowed, true, JSON.stringify(r.violations, null, 2));
  // The change is scoped by "some file is not documentation" (issue 4, gap 1), so a docs-only change is out of scope.
  assert.equal(status(r, 'change-names-approved-spec'), 'not_applicable');
});

test('a change with one file outside the docs needs a spec', async () => {
  const r = await ci(input({ commit: 'c0ffee1', author: 'someone', files: [{ path: 'docs/a.md', node: null }, { path: 'services/trade-api/src/app.ts', node: 'trade-api' }], nodes: ['trade-api'], connections: [] }, model(), { id: null, approved: false, nodes: [] }));
  assert.equal(r.allowed, false);
  assert.equal(status(r, 'change-names-approved-spec'), 'not_met');
});

test('a connection matches only when one relationship has both its source and its destination', async () => {
  // trade-api connects to position-service, and position-service to client-ledger: neither is trade-api -> client-ledger.
  const r = await ci(input({ ...tradeApiChange, connections: [{ id: 'trade-api->client-ledger', source: 'trade-api', destination: 'client-ledger' }] }));
  assert.equal(r.allowed, false);
  assert.ok(has(r, { requirement: 'service-dependency', check: 'in_architecture', cause: 'value' }));
});

test('every policy is well formed for the engine: no $well_formed row fails', async () => {
  const r = await merge(input({ ...ledgerChange, approval }));
  const bad = r.report.results.filter((x) => x.check === '$well_formed' && !x.passed);
  assert.deepEqual(bad, []);
  assert.deepEqual([r.report.ergo, r.report.engine], ['v0.6', { name: 'ergo-rego', version: '0.6.0' }]);
});

test('controls that disagree on ergo_spec are a problem, and the policy is denied', async () => {
  const doc = model();
  doc.controls['sdlc-prev-017-service-dependency'].requirements[0].config.ergo.ergo_spec = 'v0.5';
  const r = await merge(input({ ...tradeApiChange }, doc));
  assert.equal(r.allowed, false);
  assert.ok(r.problems.some((p) => p === 'the controls disagree on ergo_spec: v0.5, v0.6'), JSON.stringify(r.problems));
});

test('a control without ergo_spec is denied: ergo reads the policy as written wrong', async () => {
  const doc = model();
  for (const c of Object.values(doc.controls)) delete c.requirements[0].config.ergo?.ergo_spec;
  delete doc.nodes.find((n) => n['unique-id'] === 'client-ledger').controls['client-ledger-human-approval'].requirements[0].config.ergo.ergo_spec;
  const r = await merge(input({ ...tradeApiChange }, doc));
  assert.equal(r.allowed, false);
  assert.ok(r.report.results.some((x) => x.check === '$well_formed' && !x.passed));
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

test('a test no node owns needs a spec and a review, not a human', async () => {
  const change = { ...tradeApiChange, files: [{ path: 'test/x.test.ts', node: null }], nodes: [], connections: [] };
  const atMerge = await merge(input(change));
  assert.equal(atMerge.allowed, true, JSON.stringify(atMerge.violations, null, 2));
  const noSpec = await ci(input({ ...change, spec: null }, model(), { id: null, approved: false, nodes: [] }));
  assert.equal(noSpec.allowed, false);
  assert.ok(has(noSpec, { requirement: 'change-names-approved-spec', check: 'names_a_spec' }));
});

test('a change to the gate tests is the control plane: it needs a human at merge', async () => {
  const change = { ...tradeApiChange, files: [{ path: 'gates/test/controls.test.mjs', node: null }], nodes: [], connections: [] };
  const atMerge = await merge(input(change));
  assert.equal(atMerge.allowed, false);
  assert.ok(has(atMerge, { requirement: 'control-plane-human-approval', subject: 'gates/test/controls.test.mjs', check: 'human_approved' }), JSON.stringify(atMerge.violations, null, 2));
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
  doc.controls['duplicate'].requirements[0].config.ergo.subjects['change under review'].identified_by = 'diff_sha256';
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
  // CI rebuilds the module and fails on any difference; this ties the committed module to that build.
  const wasm = createHash('sha256').update(readFileSync(`${ROOT}gates/policy/controls.wasm`)).digest('hex');
  assert.equal(readFileSync(`${ROOT}gates/policy/controls.wasm.sha256`, 'utf8').trim(), wasm);
});

test('a stage other than change or merge is denied with an error, not treated as change', async () => {
  for (const stage of ['Merge', undefined]) {
    const r = await evaluateControls(input(tradeApiChange), { stage });
    assert.equal(r.allowed, false, String(stage));
    assert.match(r.error ?? '', /unknown stage/, String(stage));
    assert.deepEqual([r.failing, r.pending, r.violations, r.problems], [[], [], [], []]);
  }
});
