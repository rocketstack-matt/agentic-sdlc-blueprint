import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { TradeStore, type Trade } from './store.ts';

export interface Deps {
  store: TradeStore;
  positionServiceUrl: string;
}

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readJson = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
};

export function createApp({ store, positionServiceUrl }: Deps): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (req.method === 'POST' && url.pathname === '/trades') {
        const body = await readJson(req);
        const { account, security, side, quantity } = body;
        if (typeof account !== 'string' || typeof security !== 'string' ||
            (side !== 'BUY' && side !== 'SELL') || typeof quantity !== 'number' || quantity <= 0) {
          return send(res, 422, { error: 'account, security, side (BUY|SELL) and a positive quantity are required' });
        }
        const trade: Trade = { id: randomUUID(), account, security, side, quantity, capturedAt: new Date().toISOString() };
        store.add(trade);
        const applied = await fetch(`${positionServiceUrl}/positions/apply`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(trade),
        });
        if (!applied.ok) return send(res, 502, { error: 'position-service rejected the trade', trade });
        return send(res, 201, trade);
      }
      if (req.method === 'GET' && url.pathname === '/trades') {
        const account = url.searchParams.get('account');
        const trades = store.all().filter((t) => !account || t.account === account);
        return send(res, 200, trades);
      }
      if (url.pathname === '/health') return send(res, 200, { status: 'ok' });
      return send(res, 404, { error: 'not found' });
    } catch (err) {
      return send(res, 400, { error: (err as Error).message });
    }
  });
}
