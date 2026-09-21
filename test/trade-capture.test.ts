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

const post = (body: unknown) =>
  fetch(`${tradesUrl}/trades`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('a captured trade is stored and applied to the position', async () => {
  const res = await post({ account: 'ACC-1', security: 'VOD.L', side: 'BUY', quantity: 100 });
  assert.equal(res.status, 201);
  await post({ account: 'ACC-1', security: 'VOD.L', side: 'SELL', quantity: 40 });

  const listed = await (await fetch(`${tradesUrl}/trades?account=ACC-1`)).json() as unknown[];
  assert.equal(listed.length, 2);

  const pos = await (await fetch(`${positionsUrl}/positions/ACC-1`)).json() as { positions: Record<string, number> };
  assert.equal(pos.positions['VOD.L'], 60);
});

test('an invalid trade is rejected', async () => {
  const res = await post({ account: 'ACC-1', security: 'VOD.L', side: 'HOLD', quantity: 1 });
  assert.equal(res.status, 422);
});
