// node policy/test.mjs: evaluates merge.wasm against the real model with hand-built inputs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPolicy } from '@open-policy-agent/opa-wasm';
import { loadArchitecture, paths } from '../gateway/lib.mjs';

const policy = await loadPolicy(readFileSync(paths.wasm));
policy.setData({ arch: loadArchitecture().arch });
const now = 1000;
const reviewer = 'spiffe://bank/agents/reviewer';
const spec = { id: 'SPEC-001', approved: true, nodes: ['trade-api', 'position-service'] };
const t2 = { id: 'CHG-1', spec: 'SPEC-001', author: 'spiffe://bank/agents/author', commit: 'aaaa111', files: ['services/trade-api/src/app.ts', 'test/x.test.ts'], diff_sha256: 'd2' };
const t1 = { ...t2, id: 'CHG-2', commit: 'bbbb222', files: ['services/position-service/src/app.ts'], diff_sha256: 'd1' };
const amended = { ...t1, diff_sha256: 'd1x' };
const review = (c, who = reviewer) => ({ reviewer: who, commit: c.commit, diff_sha256: c.diff_sha256, verdict: 'approve', verified: true });
const token = (c, extra = {}) => ({
  iss: 'approval-service', sub: 'approver@bank', aud: 'merge-gateway', jti: 'J1234567-x', iat: now - 5, exp: now + 595, amr: ['webauthn'],
  authorization_details: [{ type: 'repo:merge', commit: c.commit, diff_sha256: c.diff_sha256, spec: c.spec }], verified: true, used: false, ...extra,
});
const cases = [
  ['no review', { change: t2, spec, now }, ['no review record']],
  ['self review', { change: t2, spec, now, review: review(t2, t2.author) }, ['author may not review its own change', 'reviewer spiffe://bank/agents/author is not an approved cognitive engine']],
  ['reviewed tier 2', { change: t2, spec, now, review: review(t2) }, []],
  ['tier 1 no token', { change: t1, spec, now, review: review(t1) }, ['human approval required (position-service is tier 1, confidential) but no token presented']],
  ['tier 1 amended', { change: amended, spec, now, review: review(amended), approval: token(t1) }, ['approval token is bound to a different diff (sha256 d1, this change is d1x)']],
  ['tier 1 allowed', { change: t1, spec, now, review: review(t1), approval: token(t1) }, []],
  ['tier 1 replay', { change: t1, spec, now, review: review(t1), approval: token(t1, { used: true }) }, ['approval token J1234567 has already been used']],
  ['tier 1 expired', { change: t1, spec, now: now + 700, review: review(t1), approval: token(t1) }, ['approval token has expired', 'approval token is older than 600 seconds']],
  ['wrong audience', { change: t1, spec, now, review: review(t1), approval: token(t1, { aud: 'ci' }) }, ['approval token is for audience ci, not merge-gateway']],
  ['control plane path', { change: { ...t2, files: ['gates/x.mjs'] }, spec, now, review: review(t2) }, ['human approval required (gates/x.mjs is a control plane path) but no token presented']],
  ['outside spec scope', { change: t1, spec: { ...spec, nodes: ['trade-api'] }, now, review: review(t1), approval: token(t1) }, ['node position-service is outside the scope of SPEC-001']],
  ['unsigned records', { change: t1, spec, now, review: { ...review(t1), verified: false }, approval: token(t1, { verified: false }) }, ['approval token signature is invalid', 'review signature is invalid']],
];
for (const [name, input, expected] of cases) {
  const allow = policy.evaluate(input, 'merge/allow')[0]?.result;
  const deny = (policy.evaluate(input, 'merge/deny')[0]?.result ?? []).sort();
  assert.deepEqual(deny, expected, name);
  assert.equal(allow, expected.length === 0, name);
}
console.log(`policy ok: ${cases.length} cases`);
