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
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`${hub}/#/${ns}/architectures/trade-capture/1.0.0`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Fit the whole model into the React Flow canvas, then screenshot the canvas only (not the full
  // page): the sidebar, header and URL bar around it make node labels too small at slide size.
  const canvas = page.locator('.react-flow').first();
  await page.getByRole('button', { name: 'fit view' }).click();
  await page.waitForTimeout(500);
  await canvas.screenshot({ path: 'slides/img/hub-model.png' });
  console.log('wrote slides/img/hub-model.png');
} finally {
  await browser.close();
}
