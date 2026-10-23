// The deck's test. Run: node slides/check.mjs
// Slide count, speaker notes on every slide, every picture present on disk, and no em-dashes. slides/overflow-check.mjs catches clipping.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const EXPECTED = 16;
const html = readFileSync(join(here, 'index.html'), 'utf8');
const problems = [];

const sections = html.match(/<section[\s\S]*?<\/section>/g) ?? [];
if (sections.length !== EXPECTED) problems.push(`expected ${EXPECTED} slides, found ${sections.length}`);


sections.forEach((s, i) => {
  const title = (s.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/)?.[1] ?? '').replace(/<[^>]+>/g, '').trim();
  const label = `slide ${i + 1}${title ? ` (${title})` : ''}`;
  const notes = s.match(/<aside class="notes">([\s\S]*?)<\/aside>/)?.[1]?.trim() ?? '';
  if (notes.length < 40) problems.push(`${label}: speaker notes missing or too short`);
  for (const m of s.matchAll(/<img[^>]+src="([^"]+)"/g)) if (!existsSync(join(here, m[1]))) problems.push(`${label}: picture ${m[1]} is missing (run slides/github-screenshots.mjs)`);
});

for (const file of ['index.html', 'deck.css', 'README.md', 'github-screenshots.mjs']) {
  if (!existsSync(join(here, file))) continue;
  const text = readFileSync(join(here, file), 'utf8');
  const line = text.split('\n').findIndex((l) => l.includes('—'));
  if (line >= 0) problems.push(`${file}:${line + 1} contains an em-dash`);
}

for (const p of problems) console.error(`check: ${p}`);
console.log(problems.length ? `check: ${problems.length} problem(s)` : `check: ok, ${sections.length} slides`);
process.exit(problems.length ? 1 : 0);
