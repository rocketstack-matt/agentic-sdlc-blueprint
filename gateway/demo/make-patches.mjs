// make-patches.mjs: regenerates demo/patches from the edits below, applied to a scratch clone of the blueprint in the
// order the demo merges them, so each patch applies to the main the demo will present it to. Run after changing the
// services or the model; commit the patches.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const here = resolve(import.meta.dirname);
const blueprint = resolve(here, '..', '..');
const dir = mkdtempSync(join(tmpdir(), 'patches-'));
const env = { ...process.env, GIT_AUTHOR_NAME: 'p', GIT_AUTHOR_EMAIL: 'p@example.invalid', GIT_COMMITTER_NAME: 'p', GIT_COMMITTER_EMAIL: 'p@example.invalid' };
const g = (...args) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' });
const edit = (path, fn) => writeFileSync(join(dir, path), fn(readFileSync(join(dir, path), 'utf8')));
const insertBefore = (marker, text) => (src) => {
  if (!src.includes(marker)) throw new Error(`marker not found: ${marker}`);
  return src.replace(marker, `${text}${marker}`);
};
const HEALTH = "      if (url.pathname === '/health') return send(res, 200, { status: 'ok' });";

const summaryHandler = `      const summary = url.pathname.match(/^\\/accounts\\/([^/]+)\\/summary$/);
      if (req.method === 'GET' && summary) {
        const account = decodeURIComponent(summary[1]!);
        // SPEC-001: positions are owned by position-service. We reach them only over the modelled connection
        // trade-api-to-position-service, never by reading the Client Ledger.
        const upstream = await fetch(\`\${positionServiceUrl}/positions/\${encodeURIComponent(account)}\`).catch(() => undefined);
        if (!upstream?.ok) return send(res, 502, { error: 'position-service unavailable' });
        const { positions } = (await upstream.json()) as { positions: Record<string, number> };
        return send(res, 200, { account, trades: store.all().filter((t) => t.account === account), positions });
      }
`;
const totalHandler = (extra = '') => `      const total = url.pathname.match(/^\\/positions\\/([^/]+)\\/total$/);
      if (req.method === 'GET' && total) {
        const account = decodeURIComponent(total[1]!);
        const holdings = Object.values(store.read()[account] ?? {});
${extra}        return send(res, 200, { account, total: holdings.reduce((sum, q) => sum + q, 0) });
      }
`;
const countHandler = `      if (req.method === 'GET' && url.pathname === '/trades/count') {
        return send(res, 200, { count: store.all().length });
      }
`;

const steps = [
  { patch: 'account-summary.patch', merge: true, apply: () => {
    edit('services/trade-api/src/app.ts', insertBefore(HEALTH, summaryHandler));
    writeFileSync(join(dir, 'test/account-summary.test.ts'), readFileSync(join(here, 'fixtures/account-summary.test.ts'), 'utf8'));
  } },
  // The position-total change from the same base with one more line: the approval for CHG-0422 does not cover it.
  { patch: 'position-total-amended.patch', merge: false, apply: () => {
    edit('services/position-service/src/app.ts', insertBefore(HEALTH, totalHandler("        res.setHeader('x-total-source', 'client-ledger');\n")));
    writeFileSync(join(dir, 'test/position-total.test.ts'), readFileSync(join(here, 'fixtures/position-total.test.ts'), 'utf8'));
  } },
  { patch: 'position-total.patch', merge: true, apply: () => {
    edit('services/position-service/src/app.ts', insertBefore(HEALTH, totalHandler()));
    writeFileSync(join(dir, 'test/position-total.test.ts'), readFileSync(join(here, 'fixtures/position-total.test.ts'), 'utf8'));
  } },
  { patch: 'ledger-shortcut.patch', merge: false, apply: () => {
    edit('services/trade-api/src/config.ts', (src) => src.replace('};', "  // Quicker than asking position-service: read the ledger file directly.\n  ledgerPath: process.env.POSITION_STORE_PATH ?? 'data/positions.json',\n};"));
  } },
  { patch: 'architect-ledger-connection.patch', merge: true, apply: () => {
    edit('architecture/trade-capture.architecture.json', (src) => {
      const arch = JSON.parse(src);
      const at = arch.relationships.findIndex((r) => r['unique-id'] === 'trade-api-to-trade-store') + 1;
      arch.relationships.splice(at, 0, {
        'unique-id': 'trade-api-to-client-ledger',
        description: 'Trade API writes end-of-day trade snapshots straight to the Client Ledger (SPEC-003).',
        'relationship-type': { connects: { source: { node: 'trade-api' }, destination: { node: 'client-ledger', interfaces: ['client-ledger-file'] } } },
      });
      return `${JSON.stringify(arch, null, 2)}\n`;
    });
  } },
  { patch: 'trade-count.patch', merge: true, apply: () => {
    edit('services/trade-api/src/app.ts', insertBefore(HEALTH, countHandler));
  } },
];

try {
  g('clone', '--quiet', '--no-hardlinks', blueprint, dir);
  g('checkout', '-q', '-B', 'main');
  mkdirSync(join(here, 'patches'), { recursive: true });
  for (const step of steps) {
    g('checkout', '-q', '-B', 'work', 'main');
    step.apply();
    g('add', '-A');
    g('commit', '-q', '-m', step.patch);
    writeFileSync(join(here, 'patches', step.patch), g('diff', '--no-color', '--full-index', 'main', 'work'));
    g('checkout', '-q', 'main');
    if (step.merge) g('merge', '-q', '--no-ff', '-m', `merge ${step.patch}`, 'work');
    console.log(`wrote patches/${step.patch}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
