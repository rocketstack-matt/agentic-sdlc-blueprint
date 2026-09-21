import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Trade {
  id: string;
  account: string;
  security: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  capturedAt: string;
}

export class TradeStore {
  constructor(private readonly path: string) {}

  all(): Trade[] {
    if (!existsSync(this.path)) return [];
    return JSON.parse(readFileSync(this.path, 'utf8')) as Trade[];
  }

  add(trade: Trade): void {
    const trades = this.all();
    trades.push(trade);
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(trades, null, 2));
  }
}
