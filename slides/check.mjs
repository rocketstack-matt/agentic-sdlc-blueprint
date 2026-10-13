// The deck's test. Run: node slides/check.mjs
// Slide count, speaker notes on every slide, every picture present on disk, every CALM Hub pin with a recorded
// position, and no em-dashes. slides/overflow-check.mjs catches clipping.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const EXPECTED = 28;
const html = readFileSync(join(here, 'index.html'), 'utf8');
const problems = [];

const sections = html.match(/<section[\s\S]*?<\/section>/g) ?? [];
if (sections.length !== EXPECTED) problems.push(`expected ${EXPECTED} slides, found ${sections.length}`);

const window = {};
try { eval(readFileSync(join(here, 'img', 'hub', 'positions.js'), 'utf8')); } catch (e) { problems.push(`img/hub/positions.js does not load: ${e.message}`); }
const positions = window.HUB_POSITIONS ?? {};

sections.forEach((s, i) => {
  const title = (s.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/)?.[1] ?? '').replace(/<[^>]+>/g, '').trim();
  const label = `slide ${i + 1}${title ? ` (${title})` : ''}`;
  const notes = s.match(/<aside class="notes">([\s\S]*?)<\/aside>/)?.[1]?.trim() ?? '';
  if (notes.length < 40) problems.push(`${label}: speaker notes missing or too short`);
  for (const m of s.matchAll(/<img[^>]+src="([^"]+)"/g)) if (!existsSync(join(here, m[1]))) problems.push(`${label}: picture ${m[1]} is missing (run slides/github-screenshots.mjs)`);
  for (const wrap of s.match(/<div class="shot-wrap">[\s\S]*?<\/div>/g) ?? []) {
    const shot = wrap.match(/src="img\/hub\/([^"]+)\.png"/)?.[1];
    for (const m of wrap.matchAll(/data-node="([^"]+)"/g)) if (!positions[shot]?.[m[1]]) problems.push(`${label}: no position for ${m[1]} in ${shot} (run slides/hub-screenshots.mjs)`);
  }
});

for (const file of ['index.html', 'deck.css', 'README.md', 'hub-screenshots.mjs', 'github-screenshots.mjs']) {
  if (!existsSync(join(here, file))) continue;
  const text = readFileSync(join(here, file), 'utf8');
  const line = text.split('\n').findIndex((l) => l.includes('—'));
  if (line >= 0) problems.push(`${file}:${line + 1} contains an em-dash`);
}

for (const p of problems) console.error(`check: ${p}`);
console.log(problems.length ? `check: ${problems.length} problem(s)` : `check: ok, ${sections.length} slides`);
process.exit(problems.length ? 1 : 0);
