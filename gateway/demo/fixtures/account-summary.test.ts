import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp as createPositions } from '../services/position-service/src/app.ts';
import { PositionStore } from '../services/position-service/src/store.ts';
import { createApp as createTrades } from '../services/trade-api/src/app.ts';
import { TradeStore } from '../services/trade-api/src/store.ts';
import { listen, tempFile } from './helpers.ts';

const positions = createPositions(new PositionStore(tempFile('positions.json')));
const positionsUrl = await listen(positions);
const trades = createTrades({ store: new TradeStore(tempFile('trades.json')), positionServiceUrl: positionsUrl });
const tradesUrl = await listen(trades);
after(() => { positions.close(); trades.close(); });

test('SPEC-001: account summary returns trades and positions', async () => {
  await fetch(`${tradesUrl}/trades`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account: 'ACC-9', security: 'BARC.L', side: 'BUY', quantity: 25 }) });
  const body = await (await fetch(`${tradesUrl}/accounts/ACC-9/summary`)).json() as { trades: unknown[]; positions: Record<string, number> };
  assert.equal(body.trades.length, 1);
  assert.equal(body.positions['BARC.L'], 25);
});

test('SPEC-001: unknown account returns empty collections', async () => {
  const body = await (await fetch(`${tradesUrl}/accounts/NOPE/summary`)).json();
  assert.deepEqual(body, { account: 'NOPE', trades: [], positions: {} });
});

test('SPEC-001: 502 when position-service is unavailable', async () => {
  const orphan = createTrades({ store: new TradeStore(tempFile('t.json')), positionServiceUrl: 'http://localhost:1' });
  const url = await listen(orphan);
  const res = await fetch(`${url}/accounts/ACC-9/summary`);
  orphan.close();
  assert.equal(res.status, 502);
});
