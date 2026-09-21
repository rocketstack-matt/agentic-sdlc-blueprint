// Screenshots every slide at 1920x1080 for visual review. Playwright comes from the architecture-as-code checkout.
// Run: NODE_PATH=../architecture-as-code/node_modules node slides/qa-screenshots.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
mkdirSync('slides/qa', { recursive: true });
const browser = await chromium.launch();
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
await browser.close();
console.log(`wrote ${total} screenshots to slides/qa/`);
