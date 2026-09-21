#!/usr/bin/env node
// The deck's test. Parses index.html and captures.js and fails on structural defects.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const problems = [];

const sections = html.match(/<section\b[^>]*>[\s\S]*?<\/section>/g) ?? [];
const expected = Number(process.env.EXPECTED_SLIDES ?? 27);
if (sections.length !== expected) problems.push(`expected ${expected} slides, found ${sections.length}`);

sections.forEach((s, i) => {
  const n = i + 1;
  const notes = s.match(/<aside class="notes">([\s\S]*?)<\/aside>/);
  if (!notes) problems.push(`slide ${n}: no speaker notes`);
  else if (!/^\s*Speaker: (Aaron|Matthew)\b/.test(notes[1])) problems.push(`slide ${n}: notes must start with "Speaker: Aaron" or "Speaker: Matthew"`);
  const isTitle = /class="title"/.test(s.split('>')[0]);
  const isSection = /class="section-slide"/.test(s.split('>')[0]);
  const station = s.split('>')[0].match(/data-station="(model|spec|agent|gate|evidence|none)"/);
  if (!isTitle && !isSection && !station) problems.push(`slide ${n}: content slide needs data-station`);
});

// No em-dashes anywhere authored under slides/, skipping vendored and generated output.
const TEXT_EXTS = new Set(['.html', '.css', '.js', '.mjs', '.sh', '.md']);
const SKIP_DIRS = new Set(['vendor', 'qa']);
function findTextFiles(base) {
  const out = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...findTextFiles(join(base, entry.name)));
    } else if (TEXT_EXTS.has(extname(entry.name))) {
      out.push(join(base, entry.name));
    }
  }
  return out;
}
for (const file of findTextFiles(dir)) {
  if (/\u2014/.test(readFileSync(file, 'utf8'))) problems.push(`${relative(dir, file)} contains an em-dash`);
}

const keys = [...html.matchAll(/data-capture="([^"]+)"/g)].map((m) => m[1]);
if (keys.length) {
  const capturesPath = join(dir, 'captures.js');
  if (!existsSync(capturesPath)) problems.push('captures.js missing; run slides/capture.sh');
  else {
    const w = {};
    new Function('window', readFileSync(capturesPath, 'utf8'))(w);
    const captures = w.CAPTURES ?? {};
    for (const k of new Set(keys)) if (!(k in captures)) problems.push(`capture "${k}" is referenced but not in captures.js`);
  }
}

for (const p of problems) console.error(`check: ${p}`);
console.log(problems.length ? `check: ${problems.length} problem(s)` : `check: ok, ${sections.length} slides`);
process.exit(problems.length ? 1 : 0);
