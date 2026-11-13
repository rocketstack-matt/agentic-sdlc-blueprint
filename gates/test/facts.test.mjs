import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ROOT, ARCHITECTURE, ENGINE, baseArchitecture, baseArchitectureText, baseEngine, changeInput, changedFiles, loadArchitecture, observedConnections, sha256 } from '../lib/calm.mjs';
import { evaluateControls } from '../lib/controls.mjs';

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

test('base architecture comes from the base ref even when it differs from the working tree', () => {
  // Build a commit (not on any branch, working tree untouched) whose model differs from the working tree's
  // but still carries the policy, then ask for it as the base.
  const git = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', ...opts }).trim();
  const head = JSON.parse(git(['show', 'HEAD:architecture/trade-capture.architecture.json']));
  const based = { ...head, description: `${head.description} (base probe)` };
  const blob = git(['hash-object', '-w', '--stdin'], { input: JSON.stringify(based, null, 2) });
  const index = join(mkdtempSync(join(tmpdir(), 'facts-')), 'index');
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    git(['read-tree', 'HEAD'], { env });
    git(['update-index', '--cacheinfo', `100644,${blob},architecture/trade-capture.architecture.json`], { env });
    const tree = git(['write-tree'], { env });
    const commit = git(['commit-tree', tree, '-p', 'HEAD', '-m', 'base probe'], {
      env: {
        ...env,
        GIT_AUTHOR_NAME: 'facts-test',
        GIT_AUTHOR_EMAIL: 'facts-test@example.invalid',
        GIT_COMMITTER_NAME: 'facts-test',
        GIT_COMMITTER_EMAIL: 'facts-test@example.invalid',
      },
    });
    assert.notDeepEqual(loadArchitecture(), based);
    assert.deepEqual(baseArchitecture(commit), based);
  } finally {
    rmSync(dirname(index), { recursive: true, force: true });
  }
});

test('a base model that cannot be read is an error, not a fallback to the working tree', () => {
  assert.throws(() => baseArchitecture('no-such-ref-xyz'), /no-such-ref-xyz.*could not be read/);
});

test('the base engine is controls.wasm as git holds it at base', () => {
  assert.deepEqual(baseEngine('HEAD'), execFileSync('git', ['show', `HEAD:${ENGINE}`], { maxBuffer: 256 * 1024 * 1024 }));
});

test('the base engine decides, not the change\'s own engine', async () => {
  // A commit (not on any branch, working tree untouched) whose controls.wasm is not a module: evaluated with that
  // base's engine, the change is denied, though HEAD's engine allows it.
  const git = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', ...opts }).trim();
  const blob = git(['hash-object', '-w', '--stdin'], { input: 'not a wasm module' });
  const index = join(mkdtempSync(join(tmpdir(), 'facts-')), 'index');
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    git(['read-tree', 'HEAD'], { env });
    git(['update-index', '--cacheinfo', `100644,${blob},${ENGINE}`], { env });
    const tree = git(['write-tree'], { env });
    const commit = git(['commit-tree', tree, '-p', 'HEAD', '-m', 'engine probe'], { env: { ...env, GIT_AUTHOR_NAME: 'facts-test', GIT_AUTHOR_EMAIL: 'facts-test@example.invalid', GIT_COMMITTER_NAME: 'facts-test', GIT_COMMITTER_EMAIL: 'facts-test@example.invalid' } });
    assert.equal(baseEngine(commit).toString(), 'not a wasm module');
    const input = { architecture: baseArchitecture(commit), change: { commit: 'c1', author: 'a', files: [{ path: 'README.md', node: null }], nodes: [], connections: [] }, spec: { id: null, approved: false, nodes: [] } };
    assert.equal((await evaluateControls(input, { stage: 'change', wasm: () => baseEngine('HEAD') })).allowed, true);
    const withBase = await evaluateControls(input, { stage: 'change', wasm: () => baseEngine(commit) });
    assert.equal(withBase.allowed, false);
    assert.ok(withBase.error);
    assert.equal(withBase.policySha, sha256('not a wasm module'));
  } finally {
    rmSync(dirname(index), { recursive: true, force: true });
  }
});

test('an engine that cannot be read at base denies, naming the ref', async () => {
  const input = { architecture: loadArchitecture(), change: { commit: 'c1', author: 'a', files: [], nodes: [], connections: [] }, spec: { id: null, approved: false, nodes: [] } };
  const r = await evaluateControls(input, { stage: 'change', wasm: () => baseEngine('no-such-ref-xyz') });
  assert.equal(r.allowed, false);
  assert.match(r.error, /no-such-ref-xyz.*could not be read/);
});

test('a base model with no ergo policy goes with the working tree\'s engine (bootstrap only)', () => {
  assert.deepEqual(baseEngine('5b09598'), readFileSync(join(ROOT, ENGINE)));
});

test('a relative import into another node is a connection', () => {
  // position-service makes no other connection to trade-api, so the evidence can only come from this import.
  const probe = join(ROOT, 'services/position-service/src/__tmp_import_probe.ts');
  try {
    writeFileSync(probe, "import { x } from '../../trade-api/src/store.ts';\n");
    const c = observedConnections(loadArchitecture()).find((x) => x.id === 'position-service->trade-api');
    assert.ok(c, 'position-service->trade-api is observed');
    assert.match(c.evidence, /__tmp_import_probe\.ts:1 import \.\.\/\.\.\/trade-api\/src\/store\.ts/);
  } finally {
    rmSync(probe, { force: true });
  }
});

test('a base model with no ergo policy at all falls back to the working tree (bootstrap only)', () => {
  // 5b09598 is main before SPEC-002: its model carries no ergo policy.
  assert.deepEqual(baseArchitecture('5b09598'), loadArchitecture());
});

const identity = {
  GIT_AUTHOR_NAME: 'facts-test',
  GIT_AUTHOR_EMAIL: 'facts-test@example.invalid',
  GIT_COMMITTER_NAME: 'facts-test',
  GIT_COMMITTER_EMAIL: 'facts-test@example.invalid',
};

/** A commit on top of HEAD (not on any branch, working tree untouched) that moves position-service's app.ts into docs/. */
const renameCommit = () => {
  const git = (args, opts = {}) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', ...opts }).trim();
  const index = join(mkdtempSync(join(tmpdir(), 'facts-')), 'index');
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    git(['read-tree', 'HEAD'], { env });
    const blob = git(['rev-parse', 'HEAD:services/position-service/src/app.ts']);
    git(['update-index', '--force-remove', 'services/position-service/src/app.ts'], { env });
    git(['update-index', '--add', '--cacheinfo', `100644,${blob},docs/x/app.ts`], { env });
    const tree = git(['write-tree'], { env });
    return git(['commit-tree', tree, '-p', 'HEAD', '-m', 'rename probe'], { env: { ...env, ...identity } });
  } finally {
    rmSync(dirname(index), { recursive: true, force: true });
  }
};

test('a file moved out of a node lists both its old and its new path, so the node it left is still touched', () => {
  const head = renameCommit();
  const files = changedFiles('HEAD', head);
  assert.ok(files.includes('services/position-service/src/app.ts'), JSON.stringify(files));
  assert.ok(files.includes('docs/x/app.ts'), JSON.stringify(files));
  const input = changeInput({ arch: loadArchitecture(), base: 'HEAD', head });
  assert.deepEqual(input.change.nodes, ['position-service']);
});

test('a change naming a spec that is not in specs/ fails spec_exists', async () => {
  const head = renameCommit();
  const saved = process.env.SPEC;
  process.env.SPEC = 'SPEC-999';
  let input;
  try {
    input = changeInput({ arch: loadArchitecture(), base: 'HEAD', head });
  } finally {
    if (saved === undefined) delete process.env.SPEC; else process.env.SPEC = saved;
  }
  assert.equal(input.spec.id, null);
  const r = await evaluateControls(input, { stage: 'change' });
  assert.equal(r.allowed, false);
  assert.ok(r.violations.some((v) => v.requirement === 'change-names-approved-spec' && v.check === 'spec_exists'), JSON.stringify(r.violations));
});

test('the base model text is the raw bytes git holds at the base, so its hash can be reproduced from git', () => {
  const raw = execFileSync('git', ['show', `HEAD:${ARCHITECTURE}`], { cwd: ROOT });
  const text = baseArchitectureText('HEAD');
  assert.equal(sha256(text), sha256(raw));
  assert.deepEqual(JSON.parse(text), baseArchitecture('HEAD'));
});

test('changeInput can evaluate a commit in another repository, scanning a checkout of that commit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guarded-'));
  const repo = join(dir, 'repo');
  const tree = join(dir, 'tree');
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' };
  const g = (cwd, ...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();
  try {
    g(dir, 'clone', '--quiet', '--no-hardlinks', ROOT, repo);
    g(repo, 'checkout', '-q', '-B', 'main');
    g(repo, 'checkout', '-q', '-b', 'agent/x');
    const config = join(repo, 'services/trade-api/src/config.ts');
    writeFileSync(config, readFileSync(config, 'utf8').replace('};', "  ledgerPath: process.env.POSITION_STORE_PATH ?? 'data/positions.json',\n};"));
    writeFileSync(join(repo, 'specs/SPEC-099-probe.md'), '---\nid: SPEC-099\ntitle: Probe\nstatus: approved\ncalm-nodes: [trade-api]\n---\n\n# SPEC-099 Probe\n');
    g(repo, 'add', '-A');
    g(repo, 'commit', '-qm', 'shortcut\n\nSpec: SPEC-099');
    const head = g(repo, 'rev-parse', 'HEAD');
    g(repo, 'worktree', 'add', '--detach', '--quiet', tree, head);
    g(repo, 'checkout', '-q', 'main'); // repo's working tree no longer has the change: only the checkout of head does
    const arch = baseArchitecture('main', repo);
    const input = changeInput({ arch, base: 'main', head, root: repo, treeRoot: tree, specId: 'SPEC-099', author: 'author-agent' });
    assert.equal(input.change.commit, head);
    assert.deepEqual([...input.change.files].sort((a, b) => a.path.localeCompare(b.path)), [
      { path: 'services/trade-api/src/config.ts', node: 'trade-api' },
      { path: 'specs/SPEC-099-probe.md', node: null },
    ]);
    assert.equal(input.change.author, 'author-agent');
    assert.deepEqual(input.spec, { id: 'SPEC-099', approved: true, nodes: ['trade-api'] }, 'the spec comes from the checkout of head');
    assert.ok(input.change.connections.some((c) => c.id === 'trade-api->client-ledger'), 'connections come from the checkout of head');
    assert.equal(observedConnections(loadArchitecture()).some((c) => c.id === 'trade-api->client-ledger'), false, 'the blueprint itself has no such connection');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
