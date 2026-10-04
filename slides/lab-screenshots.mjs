// Screenshots the CALM Learning Lab lesson for the deck: the whole lab at the start of agentic-sdlc-model with the
// diagram tab open, and the terminal after the lesson's first deliberate failure. Needs a lab serving the lesson:
// the hosted lab once the lesson has landed, or the dev server from a checkout of finos/architecture-as-code
// (`npm run calm-lab:run`, http://localhost:5173). Playwright comes from that checkout next to this repo.
// Run: node slides/lab-screenshots.mjs [lab url]
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(join(here, '..', '..', 'architecture-as-code', 'node_modules', 'playwright', 'index.mjs'));
const lab = process.argv[2] ?? 'https://lab.calm.finos.org';
const FAILING = 'calm validate -p architecture/governed-service.pattern.json -a architecture/broken/missing-parameter.json -u architecture/url-mapping.json -f pretty';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => { try { localStorage.setItem('theme', 'light'); } catch { /* storage may be blocked */ } });
  await page.goto(`${lab}/?lesson=agentic-sdlc-model`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Diagram', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(here, 'img', 'lab-model.png') });
  const input = page.locator('input[aria-label="Terminal input"]');
  await input.click();
  await input.fill(FAILING);
  await input.press('Enter');
  await page.waitForTimeout(4000);
  // The terminal panel's left 960 px, from its tab row to its prompt: the error block, legible at slide width.
  const tab = await page.getByText('Terminal', { exact: true }).first().boundingBox();
  const prompt = await input.boundingBox();
  const x = Math.max(0, tab.x - 20);
  await page.screenshot({ path: join(here, 'img', 'lab-terminal.png'), clip: { x, y: tab.y - 2, width: 960, height: prompt.y + prompt.height - tab.y + 16 } });
  console.log('wrote slides/img/lab-model.png and slides/img/lab-terminal.png');
} finally {
  await browser.close();
}
