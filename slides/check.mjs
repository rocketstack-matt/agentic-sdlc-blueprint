// The deck's test. Run: node slides/check.mjs
// Slide count, speaker notes on every slide, every capture a pane names present
// in captures.js, every picture present on disk, every step slide carrying its screen and its two-part callout, and
// no em-dashes. Panes are not budgeted: they show the captures whole, and slides/overflow-check.mjs catches clipping.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const EXPECTED = 20;
const html = readFileSync(join(here, 'index.html'), 'utf8');
const problems = [];

const sections = html.match(/<section[\s\S]*?<\/section>/g) ?? [];
if (sections.length !== EXPECTED) problems.push(`expected ${EXPECTED} slides, found ${sections.length}`);

const window = {};
try { eval(readFileSync(join(here, 'captures.js'), 'utf8')); } catch (e) { problems.push(`captures.js does not load: ${e.message}`); }
const captures = window.CAPTURES ?? {};
try { eval(readFileSync(join(here, 'img', 'hub', 'positions.js'), 'utf8')); } catch (e) { problems.push(`img/hub/positions.js does not load: ${e.message}`); }
const positions = window.HUB_POSITIONS ?? {};
const used = new Set();

sections.forEach((s, i) => {
  const n = i + 1;
  const title = (s.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/)?.[1] ?? '').replace(/<[^>]+>/g, '').trim();
  const label = `slide ${n}${title ? ` (${title})` : ''}`;
  const notes = s.match(/<aside class="notes">([\s\S]*?)<\/aside>/)?.[1]?.trim() ?? '';
  if (notes.length < 40) problems.push(`${label}: speaker notes missing or too short`);
  for (const m of s.matchAll(/data-capture="([^"]+)"/g)) {
    for (const key of m[1].split(/\s+/).filter(Boolean)) {
      used.add(key);
      if (!Array.isArray(captures[key])) problems.push(`${label}: capture "${key}" is not in captures.js (see slides/README.md)`);
    }
  }
  for (const m of s.matchAll(/<img[^>]+src="([^"]+)"/g)) {
    if (!existsSync(join(here, m[1]))) problems.push(`${label}: picture ${m[1]} is missing`);
  }
  for (const wrap of s.match(/<div class="shot-wrap">[\s\S]*?<\/div>/g) ?? []) {
    const shot = wrap.match(/src="img\/hub\/([^"]+)\.png"/)?.[1];
    for (const m of wrap.matchAll(/data-node="([^"]+)"/g)) {
      if (!positions[shot]?.[m[1]]) problems.push(`${label}: no position for ${m[1]} in ${shot} (run slides/hub-screenshots.mjs)`);
    }
  }
  if (/class="step"|class="step /.test(s) || /<section[^>]*\bstep\b/.test(s.split('\n')[0])) {
    const hasScreen = /<img class="shot|<pre class="term|class="lab-frame"|class="pr-card"/.test(s);
    if (!hasScreen) problems.push(`${label}: step slide without a screen (picture or terminal)`);
    if (!/<h3>What this shows<\/h3>/.test(s) || !/<h3>Take away<\/h3>/.test(s)) problems.push(`${label}: step slide without both callout parts`);
    if (!/class="pane-head"/.test(s)) problems.push(`${label}: step slide without a pane heading naming the environment`);
  }
});

for (const key of Object.keys(captures)) if (!used.has(key)) console.log(`note: capture "${key}" is recorded but no slide shows it`);
for (const file of ['index.html', 'deck.css', 'README.md', 'demo-captures.mjs', 'hub-screenshots.mjs']) {
  const text = readFileSync(join(here, file), 'utf8');
  const line = text.split('\n').findIndex((l) => l.includes('—'));
  if (line >= 0) problems.push(`${file}:${line + 1} contains an em-dash`);
}

for (const p of problems) console.error(`check: ${p}`);
console.log(problems.length ? `check: ${problems.length} problem(s)` : `check: ok, ${sections.length} slides`);
process.exit(problems.length ? 1 : 0);
