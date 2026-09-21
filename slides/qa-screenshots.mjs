// Screenshots every slide at 1920x1080 for visual review. Playwright comes from the
// architecture-as-code checkout next to this repo. NODE_PATH is not honoured by Node's ESM
// resolver (only by CommonJS require), so the package is imported by a path resolved relative to
// this file instead of by bare specifier, the same as slides/hub-screenshot.mjs.
// Run: node slides/qa-screenshots.mjs
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const here = dirname(fileURLToPath(import.meta.url));
const playwrightEntry = join(here, '..', '..', 'architecture-as-code', 'node_modules', 'playwright', 'index.mjs');
const { chromium } = await import(playwrightEntry);

mkdirSync('slides/qa', { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('file://' + resolve('slides/index.html') + '?print-pdf', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  const total = await page.evaluate(() => Reveal.getTotalSlides());
  await page.goto('file://' + resolve('slides/index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(800);
  for (let i = 0; i < total; i++) {
    await page.evaluate((n) => Reveal.slide(n), i);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `slides/qa/slide-${String(i + 1).padStart(2, '0')}.png` });
  }
  console.log(`wrote ${total} screenshots to slides/qa/`);
} finally {
  await browser.close();
}
