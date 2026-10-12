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
  // A recording is made from a clean tree; with CALM Hub the architecture is published, not failed.
  reset: [{ has: ['(main)', 'hub'], not: ['uncommitted', ...(process.env.CALM_HUB_URL ? ['failed'] : [])] }],
  routine: [
    { has: ['CHG-0421', 'trade-api'] },
    { has: ['by author-agent'] },
    { first: 'DENY', has: ['The author may not review its own change'] },
    { has: ['by review-bot'] },
    { first: 'ALLOW', has: ['main ->'], not: ['DENY'] },
  ],
  ledger: [
    { has: ['CHG-0422', 'position-service'] },
    { has: ['by review-bot'] },
    { first: 'DENY', has: ['connects to the Client Ledger', 'position-service-to-client-ledger: A human approved this change'] },
  ],
  approve: [{ has: ['diff --git', 'binding code', 'approved by alice', '-> .demo/token.json'] }],
  amended: [
    { has: ['CHG-0423'] },
    { has: ['by review-bot'] },
    { first: 'DENY', has: ['The approval is for this exact diff'] },
  ],
  allowed: [{ first: 'ALLOW', has: ['main ->'] }],
  shortcut: [
    { has: ['CHG-0424', 'trade-api'] },
    { has: ['by review-bot'] },
    { first: 'DENY', has: ['Every connection the code makes exists in the architecture', 'trade-api->client-ledger: The architecture has this connection'] },
  ],
  architect: [
    { has: ['CHG-0425', 'architecture/trade-capture.architecture.json', 'none: no node owns these files'] },
    { has: ['by review-bot'] },
    { first: 'DENY', has: ['no node owns', 'A human approved this change'] },
    { has: ['diff --git', 'trade-api-to-client-ledger', 'approved by alice'] },
    { first: 'ALLOW', has: ['main ->', 'architecture changed on main'] },
  ],
  climax: [
    { has: ['CHG-0426', 'trade-api'] },
    { has: ['by review-bot'] },
    { first: 'DENY', has: ['connects to the Client Ledger', 'trade-api-to-client-ledger: A human approved this change'] },
  ],
  // The climax decision itself: not-met on the line for trade-api and its new connection to the ledger.
  evidence: [{ has: ['control-evaluation'], line: ['not-met', 'client-ledger-human-approval  on trade-api, trade-api-to-client-ledger'] }],
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
    if (check.line && !lines.some((l) => check.line.every((s) => l.includes(s)))) failures.push(`${session.key} step ${i + 1}: no line with all of ${check.line.map((s) => `"${s}"`).join(', ')}`);
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
