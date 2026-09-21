import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export const tempFile = (name: string) => join(mkdtempSync(join(tmpdir(), 'blueprint-')), name);

export const listen = (server: Server): Promise<string> =>
  new Promise((resolve) =>
    server.listen(0, () => resolve(`http://localhost:${(server.address() as AddressInfo).port}`)),
  );
