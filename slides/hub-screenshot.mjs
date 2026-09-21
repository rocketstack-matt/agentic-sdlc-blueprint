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

  const node = page.getByText('Position Store', { exact: false }).first();
  const found = (await node.count()) > 0;
  if (found) {
    await node.click();
    await page.waitForTimeout(800);
    // Selecting a node opens a metadata panel to the right of the canvas and narrows the canvas to
    // make room for it; re-fit so the narrower canvas still shows the whole model.
    await page.getByRole('button', { name: 'fit view' }).click();
    await page.waitForTimeout(500);

    // The panel lives outside the .react-flow element. A page-level clip spanning the canvas and the
    // panel is fragile (it previously pulled in the breadcrumb, tabs and URL bar that also sit in
    // that x/y range), so instead: screenshot only the panel's nearest bounded ancestor, and only use
    // that shot if it is a properly sized card (under half the viewport tall, not an oversized
    // wrapper); otherwise fall back to a screenshot of the diagram container alone, which never
    // includes any page chrome.
    const heading = page.getByRole('heading', { name: 'Node', exact: true });
    let cardPath = null;
    if (await heading.count()) {
      const card = heading.locator('xpath=ancestor::*[2]');
      const cardBox = (await card.count()) ? await card.boundingBox() : null;
      const viewportHeight = page.viewportSize().height;
      if (cardBox && cardBox.height < viewportHeight / 2) {
        cardPath = card;
      }
    }
    if (cardPath) {
      await cardPath.screenshot({ path: 'slides/img/hub-position-store.png' });
      console.log('hub-position-store.png: metadata card shot (bounded ancestor under half the viewport)');
    } else {
      await canvas.screenshot({ path: 'slides/img/hub-position-store.png' });
      console.log('hub-position-store.png: diagram container shot (metadata card was not properly bounded)');
    }
  }
  console.log('wrote slides/img/hub-model.png' + (found ? ' and hub-position-store.png' : ' (position-store selection not found; retake by hand)'));
} finally {
  await browser.close();
}
