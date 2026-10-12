import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { baseArchitecture, loadArchitecture, observedConnections } from '../gates/lib/calm.mjs';

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

test('a base model with no ergo policy at all falls back to the working tree (bootstrap only)', () => {
  // 5b09598 is main before SPEC-002: its model carries no ergo policy.
  assert.deepEqual(baseArchitecture('5b09598'), loadArchitecture());
});
