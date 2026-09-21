#!/usr/bin/env node
// SDLC-PREV-012 Deployment Gating: run every blocking gate named in the CALM model, collect results.
// Usage: node gates/run-all.mjs [--json]
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, loadArchitecture } from './lib/calm.mjs';

const run = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } });
const gateScript = (name) => {
  const r = run('node', [`gates/${name}.mjs`, '--json']);
  try { return JSON.parse(r.stdout); } catch { return { gate: name, controls: [], passed: false, findings: [{ level: 'error', message: (r.stderr || r.stdout).trim() }] }; }
};

const runners = {
  'calm-validate': () => {
    const out = join(mkdtempSync(join(tmpdir(), 'calm-')), 'validate.json');
    const r = run('npx', ['--no-install', 'calm', 'validate', '-p', 'architecture/governed-service.pattern.json', '-a', 'architecture/trade-capture.architecture.json', '-u', 'architecture/url-mapping.json', '-f', 'json', '-o', out]);
    let parsed = {};
    try { parsed = JSON.parse(readFileSync(out, 'utf8')); } catch { /* fall through to exit code */ }
    const passed = r.status === 0 && parsed.hasErrors !== true;
    return { gate: 'calm-validate', controls: ['SDLC-PREV-012'], passed, findings: passed ? [] : [{ level: 'error', message: 'CALM architecture failed schema validation. Run `npm run calm:validate`.' }], summary: passed ? 'Architecture valid against CALM 1.2, the governed-service pattern and the control requirement schemas.' : 'Architecture, pattern conformance or a control config is invalid.' };
  },
  'spec-check': () => gateScript('spec-check'),
  'drift-check': () => gateScript('drift-check'),
  tests: () => {
    // TAP is requested explicitly: Node 23+ defaults to the spec reporter even off a TTY, which would leave the counts below at 0.
    const r = run('npx', ['--no-install', 'tsx', '--test', '--test-reporter=tap', ...readdirSync(join(ROOT, 'test')).filter((f) => f.endsWith('.test.ts')).map((f) => `test/${f}`)]);
    const count = (k) => Number(r.stdout.match(new RegExp(`# ${k} (\\d+)`))?.[1] ?? 0);
    return { gate: 'tests', controls: ['SDLC-PREV-016', 'SDLC-PREV-014'], passed: r.status === 0, findings: r.status === 0 ? [] : [{ level: 'error', message: 'Test failures. Run `npm test`.' }], tests: { pass: count('pass'), fail: count('fail') }, summary: `${count('pass')} passed, ${count('fail')} failed.` };
  },
  'review-router': () => gateScript('review-router'),
};

export const runAll = () => {
  const blocking = loadArchitecture().controls['sdlc-prev-012-deployment-gating'].requirements[0].config['blocking-gates'];
  const results = blocking.map((name) => (runners[name] ? runners[name]() : { gate: name, controls: [], passed: false, findings: [{ level: 'error', message: `The model requires gate "${name}" but no runner exists for it` }] }));
  return { admissible: results.every((r) => r.passed), results };
};

if (process.argv[1]?.endsWith('run-all.mjs')) {
  const { admissible, results } = runAll();
  if (process.argv.includes('--json')) console.log(JSON.stringify({ admissible, results }, null, 2));
  else {
    for (const r of results) {
      console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.gate.padEnd(14)} ${r.summary ?? ''}`);
      for (const f of r.findings ?? []) if (f.level !== 'info' || r.gate === 'review-router') console.log(`      ${f.level.toUpperCase().padEnd(5)} ${f.message}`);
    }
    console.log(`\n${admissible ? 'ADMISSIBLE' : 'BLOCKED'}: ${admissible ? 'every blocking gate passed.' : 'at least one blocking gate failed.'}`);
  }
  process.exitCode = admissible ? 0 : 1;
}
