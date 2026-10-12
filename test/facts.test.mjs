import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ROOT, baseArchitecture, loadArchitecture, observedConnections } from '../gates/lib/calm.mjs';

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
    const commit = git(['commit-tree', tree, '-p', 'HEAD', '-m', 'base probe'], { env });
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
