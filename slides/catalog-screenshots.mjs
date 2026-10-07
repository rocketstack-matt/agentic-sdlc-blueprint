// The picture of the catalog's record the first half of the deck shows: the founding proposal's three problems, on GitHub. Playwright comes from the
// architecture-as-code checkout next to this repo. Run: node slides/catalog-screenshots.mjs
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(join(here, '..', '..', 'architecture-as-code', 'node_modules', 'playwright', 'index.mjs'));
const out = join(here, 'img', 'catalog');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
// 1. The founding proposal's problem block on GitHub.
await page.goto('https://github.com/finos/devops-automation/issues/261', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const problems = page.locator('text=This leads to the following problems').first();
await problems.scrollIntoViewIfNeeded();
const pb = await problems.boundingBox();
await page.screenshot({ path: `${out}/da261-problems.png`, clip: { x: pb.x - 20, y: pb.y - 10, width: 900, height: 330 } });
console.log('da261-problems');
await browser.close();
