import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GW = new URL('../../gateway/', import.meta.url).pathname;
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
    assert.match(again.stdout, /nothing to merge/);
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
  const probe = new URL('../../gateway/.dirty-probe', import.meta.url).pathname;
  try {
    writeFileSync(probe, 'x');
    const r = run({ GATEWAY_DEMO: demo }, 'gateway/reset.mjs');
    assert.match(r.stdout, /uncommitted/);
  } finally { rmSync(probe, { force: true }); rmSync(demo, { recursive: true, force: true }); }
});

test('the author is the commit\'s: a change file that names someone else is denied', () => {
  const demo = mkdtempSync(join(tmpdir(), 'gw-demo-'));
  const env = { GATEWAY_DEMO: demo };
  try {
    run(env, 'gateway/reset.mjs');
    assert.equal(run(env, 'gateway/propose.mjs', 'demo/changes/account-summary.json').status, 0);
    run(env, 'gateway/review.mjs', 'CHG-0421', '--as', 'review-bot');
    const file = join(demo, 'changes/CHG-0421.json');
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), author: 'someone-else' }));
    const r = run(env, 'gateway/merge.mjs', 'CHG-0421', '--review', join(demo, 'reviews/CHG-0421.review-bot.json'));
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /^DENY/);
    assert.match(r.stdout, /author.*someone-else.*author-agent|author.*author-agent.*someone-else/);
    assert.equal(run(env, 'gateway/propose.mjs', 'demo/changes/position-total.json').status, 0);
  } finally { rmSync(demo, { recursive: true, force: true }); }
});

test('the spec is the commit\'s: a change file that names another spec is denied', () => {
  const demo = mkdtempSync(join(tmpdir(), 'gw-demo-'));
  const env = { GATEWAY_DEMO: demo };
  try {
    run(env, 'gateway/reset.mjs');
    run(env, 'gateway/propose.mjs', 'demo/changes/account-summary.json');
    run(env, 'gateway/review.mjs', 'CHG-0421', '--as', 'review-bot');
    const file = join(demo, 'changes/CHG-0421.json');
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), spec: 'SPEC-004' }));
    const r = run(env, 'gateway/merge.mjs', 'CHG-0421', '--review', join(demo, 'reviews/CHG-0421.review-bot.json'));
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /spec.*SPEC-004.*SPEC-001|spec.*SPEC-001.*SPEC-004/);
  } finally { rmSync(demo, { recursive: true, force: true }); }
});

test('a change that does not merge cleanly is denied, spends nothing and leaves the repository clean', () => {
  const demo = mkdtempSync(join(tmpdir(), 'gw-demo-'));
  const env = { GATEWAY_DEMO: demo };
  const repo = join(demo, 'repo');
  const g = (...args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  const kit = mkdtempSync(join(tmpdir(), 'gw-kit-'));
  try {
    run(env, 'gateway/reset.mjs');
    mkdirSync(join(kit, 'changes'));
    mkdirSync(join(kit, 'patches'));
    const readme = readFileSync(join(repo, 'README.md'), 'utf8');
    for (const [id, title] of [['CHG-9001', 'one'], ['CHG-9002', 'two']]) {
      writeFileSync(join(repo, 'README.md'), readme.replace(/^# .*/, `# blueprint ${title}`));
      writeFileSync(join(kit, 'patches', `${id}.patch`), g('diff').stdout);
      g('checkout', '--', 'README.md');
      writeFileSync(join(kit, 'changes', `${id}.json`), JSON.stringify({ id, title: `Retitle ${title}`, spec: 'SPEC-004', author: 'author-agent', patch: `${id}.patch` }));
      assert.equal(run(env, 'gateway/propose.mjs', join(kit, 'changes', `${id}.json`)).status, 0);
      run(env, 'gateway/review.mjs', id, '--as', 'review-bot');
    }
    const first = run(env, 'gateway/merge.mjs', 'CHG-9001', '--review', join(demo, 'reviews/CHG-9001.review-bot.json'));
    assert.match(first.stdout, /^ALLOW/, first.stdout + first.stderr);
    const second = run(env, 'gateway/merge.mjs', 'CHG-9002', '--review', join(demo, 'reviews/CHG-9002.review-bot.json'));
    assert.equal(second.status, 1, second.stdout + second.stderr);
    assert.match(second.stdout, /^DENY/);
    assert.match(second.stdout, /the change does not merge cleanly into main/);
    assert.equal(g('status', '--porcelain').stdout, '');
    assert.equal(run(env, 'gateway/propose.mjs', 'demo/changes/account-summary.json').status, 0);
  } finally { rmSync(demo, { recursive: true, force: true }); rmSync(kit, { recursive: true, force: true }); }
});
