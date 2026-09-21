import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { PositionStore } from './store.ts';

export interface TradeApplied {
  account: string;
  security: string;
  side: 'BUY' | 'SELL';
  quantity: number;
}

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readJson = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
};

export function createApp(store: PositionStore): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (req.method === 'POST' && url.pathname === '/positions/apply') {
        const trade = (await readJson(req)) as TradeApplied;
        const positions = store.read();
        const account = (positions[trade.account] ??= {});
        const delta = trade.side === 'BUY' ? trade.quantity : -trade.quantity;
        account[trade.security] = (account[trade.security] ?? 0) + delta;
        store.write(positions);
        return send(res, 200, { account: trade.account, positions: account });
      }
      const match = url.pathname.match(/^\/positions\/([^/]+)$/);
      if (req.method === 'GET' && match) {
        const account = decodeURIComponent(match[1]!);
        return send(res, 200, { account, positions: store.read()[account] ?? {} });
      }
      if (url.pathname === '/health') return send(res, 200, { status: 'ok' });
      return send(res, 404, { error: 'not found' });
    } catch (err) {
      return send(res, 400, { error: (err as Error).message });
    }
  });
}
