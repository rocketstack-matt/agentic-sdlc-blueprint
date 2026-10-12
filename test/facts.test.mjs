import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ROOT, ARCHITECTURE, baseArchitecture, baseArchitectureText, changeInput, changedFiles, loadArchitecture, observedConnections, sha256 } from '../gates/lib/calm.mjs';
import { evaluateControls } from '../gates/lib/controls.mjs';

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
