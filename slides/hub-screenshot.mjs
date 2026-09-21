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

// Fit the whole model into the React Flow canvas, then screenshot the canvas only (not the full
// page): the sidebar, header and URL bar around it make node labels too small at slide size.
const canvas = page.locator('.react-flow').first();
await page.getByRole('button', { name: 'fit view' }).click();
await page.waitForTimeout(500);
await canvas.screenshot({ path: 'slides/img/hub-model.png' });

const node = page.getByText('Position Store', { exact: false }).first();
const found = (await node.count()) > 0;
if (found) {
  await node.click();
  await page.waitForTimeout(800);
  // Selecting a node opens a metadata panel to the right of the canvas and narrows the canvas to
  // make room for it; re-fit so the narrower canvas still shows the whole model.
  await page.getByRole('button', { name: 'fit view' }).click();
  await page.waitForTimeout(500);
  // The panel lives outside the .react-flow element, so this shot clips the page to the canvas
  // plus that panel rather than the canvas alone.
  const canvasBox = await canvas.boundingBox();
  const panel = page.getByRole('heading', { name: 'Node', exact: true }).locator('xpath=ancestor::*[2]');
  const panelBox = (await panel.count()) ? await panel.boundingBox() : null;
  if (canvasBox && panelBox) {
    const x = Math.min(canvasBox.x, panelBox.x);
    const y = Math.min(canvasBox.y, panelBox.y);
    const right = Math.max(canvasBox.x + canvasBox.width, panelBox.x + panelBox.width);
    const bottom = Math.max(canvasBox.y + canvasBox.height, panelBox.y + panelBox.height);
    await page.screenshot({ path: 'slides/img/hub-position-store.png', clip: { x, y, width: right - x, height: bottom - y } });
  } else {
    await canvas.screenshot({ path: 'slides/img/hub-position-store.png' });
  }
}
await browser.close();
console.log('wrote slides/img/hub-model.png' + (found ? ' and hub-position-store.png' : ' (position-store selection not found; retake by hand)'));
