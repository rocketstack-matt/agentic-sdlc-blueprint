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
