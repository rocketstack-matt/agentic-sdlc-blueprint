#!/usr/bin/env node
// The deck's test. Parses index.html and captures.js and fails on structural defects.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const problems = [];

const sections = html.match(/<section\b[^>]*>[\s\S]*?<\/section>/g) ?? [];
const expected = Number(process.env.EXPECTED_SLIDES ?? 36);
if (sections.length !== expected) problems.push(`expected ${expected} slides, found ${sections.length}`);

sections.forEach((s, i) => {
  const n = i + 1;
  const notes = s.match(/<aside class="notes">([\s\S]*?)<\/aside>/);
  if (!notes) problems.push(`slide ${n}: no speaker notes`);
  else if (!/^\s*Speaker: (Aaron|Matthew)\b/.test(notes[1])) problems.push(`slide ${n}: notes must start with "Speaker: Aaron" or "Speaker: Matthew"`);
  const isTitle = /class="title"/.test(s.split('>')[0]);
  const isSection = /class="section-slide"/.test(s.split('>')[0]);
  if (isSection && !/data-ring="(model|spec|agent|gate|evidence|none)"/.test(s.split('>')[0])) problems.push(`slide ${n}: section card needs data-ring`);
  const station = s.split('>')[0].match(/data-station="(model|spec|agent|gate|evidence|none)"/);
  if (!isTitle && !isSection && !station) problems.push(`slide ${n}: content slide needs data-station`);
});

// Every image the deck references must exist: a missing screenshot renders as a broken image, silently.
for (const m of html.matchAll(/(?:src|data-background-image)="(img\/[^"]+)"/g)) {
  if (!existsSync(join(dir, m[1]))) problems.push(`image ${m[1]} is referenced but missing`);
}

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

// Words that must appear somewhere in specific captures, so the terminal panes keep showing the
// outcome the surrounding slide talks about even after captures.js is regenerated.
const REQUIRED_WORDS = {
  'clean-gates': ['ADMISSIBLE'],
  'lab1-break-pattern': ['source-path'],
  'attempt-a-gates': ['BLOCKED', 'DRIFT:', 'CONTROL BREACH:'],
  'attempt-b-gates': ['ADMISSIBLE', 'COGNITIVE'],
  'review-human': ['HUMAN'],
  'attempt-c-gates': ['UNDECLARED MODEL CHANGE:'],
  'spec-002-model': ['STALE MODEL?'],
  'spec-002-impl': ['ADMISSIBLE'],
  'evidence': ['evidence written'],
};

// pre.term has overflow hidden, so a regenerated capture that outgrows its pane is silently
// clipped on the slide. Estimate each pane's rendered size against its box. The budgets mirror
// deck.css geometry: chars = pane content width / monospace advance (0.6em), lines = pane
// max-height (or the slide space a solo pane has) / line-height. Revisit if deck.css changes.
// The fill script in index.html trims what a pane shows: a gate run keeps PASS and FAIL lines, ERROR and WARN,
// and INFO only under a failing gate, with long summary lines cut; the evidence JSON drops its sums and hash.
// The same trimming here keeps the estimate honest. The captures themselves stay whole.
const GATE_RUNS = new Set(['attempt-a-gates', 'attempt-b-gates', 'attempt-c-gates', 'spec-002-model', 'spec-002-impl']);
const fit = (line, max) => (line.length > max ? line.slice(0, max - 3).trimEnd() + '...' : line);
const shown = (key, text) => {
  if (GATE_RUNS.has(key)) {
    const out = []; let passing = false;
    for (const line of text.split('\n')) {
      if (/^(PASS|FAIL)\s/.test(line)) { passing = line.startsWith('PASS'); out.push(fit(line, 88)); }
      else if (/^\s+INFO\b/.test(line)) { if (!passing) out.push(line); }
      else out.push(line);
    }
    return out.join('\n');
  }
  if (key === 'evidence-json') return text.split('\n').filter((line) => !/"(admissible|controls|sha256)"/.test(line)).join('\n');
  return text;
};
const PANE_BUDGETS = {
  solo: { chars: 89, lines: 16 },    // .term.solo: 30px type, full 1680px content width, under a lead line
  tight: { chars: 61, lines: 22 },   // .term.tight: 22px type in a half column or stacked
  dense: { chars: 56, lines: 20 },   // .term.dense: 24px type in a half column
  default: { chars: 56, lines: 20 }, // .term in a half column: 24px type
};
const paneClasses = new Map([...html.matchAll(/<pre class="([^"]*)" data-capture="([^"]+)"/g)].map((m) => [m[2], m[1]]));

const keys = [...html.matchAll(/data-capture="([^"]+)"/g)].map((m) => m[1]);
if (keys.length) {
  const capturesPath = join(dir, 'captures.js');
  if (!existsSync(capturesPath)) problems.push('captures.js missing; run slides/capture.sh');
  else {
    const w = {};
    new Function('window', readFileSync(capturesPath, 'utf8'))(w);
    const captures = w.CAPTURES ?? {};
    for (const k of new Set(keys)) {
      if (!(k in captures)) { problems.push(`capture "${k}" is referenced but not in captures.js`); continue; }
      if (captures[k].trim() === '') problems.push(`capture "${k}" is empty`);
      for (const word of REQUIRED_WORDS[k] ?? []) {
        if (!captures[k].includes(word)) problems.push(`capture "${k}" is missing "${word}"`);
      }
      const cls = paneClasses.get(k) ?? '';
      const budget = cls.includes('solo') ? PANE_BUDGETS.solo : cls.includes('tight') ? PANE_BUDGETS.tight : cls.includes('dense') ? PANE_BUDGETS.dense : PANE_BUDGETS.default;
      const rendered = shown(k, captures[k]).trimEnd().split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / budget.chars)), 0);
      if (rendered > budget.lines) problems.push(`capture "${k}" renders ~${rendered} lines but its pane fits ~${budget.lines}; it will be clipped`);
    }
  }
}

for (const p of problems) console.error(`check: ${p}`);
console.log(problems.length ? `check: ${problems.length} problem(s)` : `check: ok, ${sections.length} slides`);
process.exit(problems.length ? 1 : 0);
