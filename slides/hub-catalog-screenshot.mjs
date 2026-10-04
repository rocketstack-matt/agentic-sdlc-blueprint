// Screenshots the SDLC Common Controls domain page in CALM Hub's UI at 2x, cropped to the card grid, for the
// "how the catalog becomes enforceable" slide. Needs a hub seeded with the finos-sdlc-common-controls domain:
// the read-only image built from finos/architecture-as-code has it. Playwright comes from the architecture-as-code
// checkout next to this repo, imported by path because Node's ESM resolver ignores NODE_PATH.
// Run: node slides/hub-catalog-screenshot.mjs [hub url]
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(join(here, '..', '..', 'architecture-as-code', 'node_modules', 'playwright', 'index.mjs'));
const hub = process.argv[2] ?? 'http://localhost:8080';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  await page.goto(`${hub}/#/domain/finos-sdlc-common-controls`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  // The content column only: the title row and the first row of cards, without the sidebar, so the
  // picture fits under the flow diagram on its slide.
  await page.screenshot({ path: join(here, 'img', 'hub-catalog.png'), clip: { x: 260, y: 90, width: 1320, height: 340 } });
  console.log('wrote slides/img/hub-catalog.png');
} finally {
  await browser.close();
}
