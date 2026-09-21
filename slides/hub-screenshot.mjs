// Screenshots the pushed architecture in CALM Hub's UI at 2x. Playwright comes from the architecture-as-code
// checkout next to this repo. NODE_PATH is not honoured by Node's ESM resolver (only by CommonJS require), so
// the package is imported by a path resolved relative to this file instead of by bare specifier.
// The hub UI is a hash-router SPA: the document route is http://<hub>/#/:namespace/:type/:id/:version,
// found by exploring the UI from http://localhost:8080/ (there is no plain-path /:namespace/... route).
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const playwrightEntry = join(here, '..', '..', 'architecture-as-code', 'node_modules', 'playwright', 'index.mjs');
const { chromium } = await import(playwrightEntry);
const [hub, ns] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
await page.goto(`${hub}/#/${ns}/architectures/trade-capture/1.0.0`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'slides/img/hub-model.png' });
const node = page.getByText('Position Store', { exact: false }).first();
const found = (await node.count()) > 0;
if (found) { await node.click(); await page.waitForTimeout(800); await page.screenshot({ path: 'slides/img/hub-position-store.png' }); }
await browser.close();
console.log('wrote slides/img/hub-model.png' + (found ? ' and hub-position-store.png' : ' (position-store selection not found; retake by hand)'));
