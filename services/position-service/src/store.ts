import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export type Positions = Record<string, Record<string, number>>; // account -> security -> quantity

export class PositionStore {
  constructor(private readonly path: string) {}

  read(): Positions {
    if (!existsSync(this.path)) return {};
    return JSON.parse(readFileSync(this.path, 'utf8')) as Positions;
  }

  write(positions: Positions): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(positions, null, 2));
  }
}
