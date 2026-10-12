#!/usr/bin/env node
// SDLC-PREV-012 Deployment Gating: run every blocking gate the model names. 'controls' evaluates the ergo policies
// the base branch's model carries against this change; requirements that need a review or a human approval are
// listed as pending, for the merge gateway. SDLC-PREV-014: the full control report is kept in evidence/out.
// Usage: node gates/check.mjs [--json]
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, ARCHITECTURE, architectureSha, baseArchitecture, changeBase, changeInput, sha256 } from './lib/calm.mjs';
import { evaluateControls } from './lib/controls.mjs';

const run = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } });

const runners = {
  'calm-validate': async () => {
    const out = join(mkdtempSync(join(tmpdir(), 'calm-')), 'validate.json');
    const r = run('npx', ['--no-install', 'calm', 'validate', '-p', 'architecture/governed-service.pattern.json', '-a', ARCHITECTURE, '-u', 'architecture/url-mapping.json', '-f', 'json', '-o', out]);
    let parsed = {};
    try { parsed = JSON.parse(readFileSync(out, 'utf8')); } catch { /* exit code decides */ }
    const passed = r.status === 0 && parsed.hasErrors !== true;
    return { gate: 'calm-validate', passed, findings: passed ? [] : [{ level: 'error', message: 'The model failed validation. Run `npm run calm:validate`.' }], summary: passed ? 'Model valid against CALM 1.2, the pattern and its Standards.' : 'Model, pattern conformance or a control config is invalid.' };
  },
  tests: async () => {
    const files = readdirSync(join(ROOT, 'test')).filter((f) => /\.test\.(ts|mjs)$/.test(f)).map((f) => `test/${f}`);
    const r = run('npx', ['--no-install', 'tsx', '--test', '--test-reporter=tap', ...files]);
    const count = (k) => Number(r.stdout.match(new RegExp(`# ${k} (\\d+)`))?.[1] ?? 0);
    return { gate: 'tests', passed: r.status === 0, findings: r.status === 0 ? [] : [{ level: 'error', message: 'Test failures. Run `npm test`.' }], summary: `${count('pass')} passed, ${count('fail')} failed.` };
  },
  controls: async () => {
    const base = changeBase();
    const arch = baseArchitecture(base);
    const input = changeInput({ arch, base });
    const outcome = await evaluateControls(input, { stage: 'change' });
    mkdirSync(join(ROOT, 'evidence/out'), { recursive: true });
    writeFileSync(join(ROOT, 'evidence/out/controls-report.json'), JSON.stringify({ comparedTo: base, commit: input.change.commit, spec: input.spec.id, evaluatedArchitectureSha256: sha256(JSON.stringify(arch)), workingTreeArchitectureSha256: architectureSha(), policySha256: outcome.policySha, outcome }, null, 2));
    const findings = [
      ...(outcome.error ? [{ level: 'error', message: `The policy could not be evaluated: ${outcome.error}` }] : []),
      ...outcome.problems.map((message) => ({ level: 'error', message })),
      ...outcome.violations.map((v) => ({ level: 'error', message: `${v.requirement}: ${v.subject?.id}: ${v.description}` })),
      ...outcome.pending.map((p) => ({ level: 'info', message: `needed at merge: ${p.description}` })),
    ];
    return { gate: 'controls', passed: outcome.allowed, findings, summary: `${Object.keys(outcome.report?.requirements ?? {}).length} requirements from the model, evaluated against ${base}.` };
  },
};

export async function runChecks() {
  const blocking = baseArchitecture().controls['sdlc-prev-012-deployment-gating'].requirements[0].config['blocking-gates'];
  const results = [];
  for (const name of blocking) {
    results.push(runners[name] ? await runners[name]() : { gate: name, passed: false, findings: [{ level: 'error', message: `The model requires gate "${name}" but no runner exists for it` }] });
  }
  return { admissible: results.every((r) => r.passed), results };
}

if (process.argv[1]?.endsWith('check.mjs')) {
  const { admissible, results } = await runChecks();
  if (process.argv.includes('--json')) console.log(JSON.stringify({ admissible, results }, null, 2));
  else {
    for (const r of results) {
      console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.gate.padEnd(14)} ${r.summary ?? ''}`);
      for (const f of r.findings ?? []) console.log(`      ${f.level.toUpperCase().padEnd(5)} ${f.message}`);
    }
    console.log(`\n${admissible ? 'ADMISSIBLE' : 'BLOCKED'}: ${admissible ? 'every blocking gate passed.' : 'at least one blocking gate failed.'}`);
  }
  process.exitCode = admissible ? 0 : 1;
}
