// Catches silent clipping: fails when any slide's content is taller than the slide, or any terminal or code pane is
// taller than the room it has, which `overflow: hidden` would otherwise hide. Playwright comes from the
// architecture-as-code checkout next to this repo, imported by path because Node's ESM resolver ignores NODE_PATH.
// Run: node slides/overflow-check.mjs
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(join(here, '..', '..', 'architecture-as-code', 'node_modules', 'playwright', 'index.mjs'));

const browser = await chromium.launch();
const problems = [];
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('file://' + resolve(here, 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const total = await page.evaluate(() => Reveal.getTotalSlides());
  for (let i = 0; i < total; i++) {
    await page.evaluate((n) => Reveal.slide(n), i);
    await page.waitForTimeout(250);
    const report = await page.evaluate(() => {
      const section = document.querySelector('section.present');
      const over = [];
      const bottom = section.getBoundingClientRect();
      // Absolutely positioned slides measure by children: anything whose box ends below the slide's own box.
      for (const el of section.querySelectorAll('h1, h2, h3, p, ul, ol, table, pre, img, svg, dl, div.cols, div.cards')) {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.bottom > bottom.bottom + 1) over.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} ends ${Math.round(r.bottom - bottom.bottom)}px below the slide`);
      }
      for (const pre of section.querySelectorAll('pre')) {
        if (pre.scrollHeight > pre.clientHeight + 2) over.push(`pre.${pre.className.split(' ')[0]} clips ${pre.scrollHeight - pre.clientHeight}px of its own content`);
      }
      return over;
    });
    for (const line of report) problems.push(`slide ${i + 1}: ${line}`);
  }
} finally {
  await browser.close();
}
for (const p of problems) console.error(`overflow: ${p}`);
console.log(problems.length ? `overflow: ${problems.length} problem(s)` : 'overflow: ok');
process.exit(problems.length ? 1 : 0);
