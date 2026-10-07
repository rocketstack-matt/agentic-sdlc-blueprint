// Assembles sessions.json from the .sessions/ step files that run-demo.sh writes, then checks that
// every session shows the verdict the demo promises. Prints "demo ok" or the failures.
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dir = join(root, '.sessions');
const read = (name) => readFileSync(join(dir, name), 'utf8');
const stripAnsi = (text) => text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

const sessions = [];
const numbers = readdirSync(dir).filter((f) => f.endsWith('.key')).map((f) => Number(f.split('.')[0])).sort((a, b) => a - b);
for (const n of numbers) {
  const key = read(`${n}.key`);
  const step = { cmd: read(`${n}.cmd`), out: stripAnsi(read(`${n}.out`)).replace(/\n$/, '') };
  if (sessions.at(-1)?.key !== key) sessions.push({ key, steps: [] });
  sessions.at(-1).steps.push(step);
}
writeFileSync(join(root, 'sessions.json'), `${JSON.stringify(sessions, null, 2)}\n`);
rmSync(dir, { recursive: true });

// Per session: the substrings each step's output must contain, and must not.
const expected = {
  propose: [{ has: ['CHG-0421', 'trade-api (tier 2'] }],
  'self-review': [{ has: ['-> reviews/'] }, { first: 'DENY', has: ['author may not review its own change'] }],
  reviewed: [{ has: ['-> reviews/'] }, { first: 'ALLOW', not: ['DENY', 'token'] }],
  'tier1-no-token': [{ has: ['position-service (tier 1'] }, { has: ['-> reviews/'] }, { first: 'DENY', has: ['human approval required', 'no token presented'] }],
  approve: [{ has: ['diff --git', 'more lines', 'binding code', 'approved by approver@bank', '-> token.json'] }],
  amended: [{ has: ['-> reviews/'] }, { first: 'DENY', has: ['approval token is bound to a different diff'], not: ['bound to commit'] }],
  allowed: [{ first: 'ALLOW', has: ['spent: single use'] }],
  replay: [{ first: 'DENY', has: ['has already been used'] }],
  evidence: [{ has: ['ALLOW', 'DENY', 'has already been used', 'policy        sha256:'] }],
};

const failures = [];
const keys = sessions.map((s) => s.key);
if (keys.join(' ') !== Object.keys(expected).join(' ')) failures.push(`session order is ${keys.join(', ')}`);
for (const session of sessions) {
  const checks = expected[session.key] ?? [];
  if (checks.length !== session.steps.length) failures.push(`${session.key}: ${session.steps.length} steps, expected ${checks.length}`);
  session.steps.forEach((step, i) => {
    const check = checks[i] ?? {};
    const lines = step.out.split('\n');
    if (lines.length >= 22) failures.push(`${session.key} step ${i + 1}: ${lines.length} lines`);
    if (check.first && lines[0] !== check.first) failures.push(`${session.key} step ${i + 1}: first line is "${lines[0]}", expected ${check.first}`);
    for (const s of check.has ?? []) if (!step.out.includes(s)) failures.push(`${session.key} step ${i + 1}: missing "${s}"`);
    for (const s of check.not ?? []) if (step.out.includes(s)) failures.push(`${session.key} step ${i + 1}: must not contain "${s}"`);
    if (/error:|at .*\.mjs:\d+/.test(step.out)) failures.push(`${session.key} step ${i + 1}: error output`);
  });
}

if (failures.length) {
  console.log('demo FAILED');
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`${sessions.length} sessions, ${sessions.reduce((n, s) => n + s.steps.length, 0)} steps recorded in sessions.json`);
console.log('demo ok');
