#!/usr/bin/env node
// SDLC-PREV-012 Deployment Gating: run every blocking gate the model names. 'controls' evaluates the ergo policies
// the base branch's model carries against this change; requirements that need a review or a human approval are
// listed as pending, for the merge gateway. SDLC-PREV-014: the full control report is kept in evidence/out.
// Usage: node gates/check.mjs [--json]
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, ARCHITECTURE, architectureSha, baseArchitecture, baseArchitectureText, baseEngine, changeBase, changeInput, currentSpecId, gitInfo, sha256 } from './lib/calm.mjs';
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
    const files = ['test', 'gates/test'].flatMap((dir) => readdirSync(join(ROOT, dir)).filter((f) => /\.test\.(ts|mjs)$/.test(f)).map((f) => `${dir}/${f}`));
    const r = run('npx', ['--no-install', 'tsx', '--test', '--test-reporter=tap', ...files]);
    const count = (k) => Number(r.stdout.match(new RegExp(`# ${k} (\\d+)`))?.[1] ?? 0);
    return { gate: 'tests', passed: r.status === 0, findings: r.status === 0 ? [] : [{ level: 'error', message: 'Test failures. Run `npm test`.' }], summary: `${count('pass')} passed, ${count('fail')} failed.` };
  },
  controls: async (evidence) => {
    const base = changeBase();
    // The hash is of the model's bytes as git holds them at base (the working tree's file when bootstrapping), so
    // `git show <base>:architecture/trade-capture.architecture.json | sha256sum` reproduces it.
    const text = baseArchitectureText(base);
    const arch = JSON.parse(text);
    const input = changeInput({ arch, base });
    // Main's policies, evaluated by main's engine: the change's own engine decides only the changes after it.
    const outcome = await evaluateControls(input, { stage: 'change', wasm: () => baseEngine(base) });
    evidence.architecture.evaluatedSha256 = sha256(text);
    evidence.policySha256 = outcome.policySha;
    const report = JSON.stringify({ comparedTo: base, commit: input.change.commit, spec: input.spec.id, evaluatedArchitectureSha256: evidence.architecture.evaluatedSha256, workingTreeArchitectureSha256: evidence.architecture.workingTreeSha256, policySha256: outcome.policySha, outcome }, null, 2);
    mkdirSync(join(ROOT, 'evidence/out'), { recursive: true });
    writeFileSync(join(ROOT, 'evidence/out/controls-report.json'), report);
    evidence.controlsReportSha256 = sha256(report);
    const findings = [
      ...(outcome.error ? [{ level: 'error', message: `The policy could not be evaluated: ${outcome.error}` }] : []),
      ...outcome.problems.map((message) => ({ level: 'error', message })),
      ...outcome.violations.map((v) => ({ level: 'error', message: `${v.requirement}: ${v.subject?.id}: ${v.description}` })),
      ...outcome.pending.map((p) => ({ level: 'info', message: `needed at merge: ${p.description}` })),
    ];
    return { gate: 'controls', passed: outcome.allowed, findings, summary: `${Object.keys(outcome.report?.requirements ?? {}).length} requirements from the model, evaluated against ${base}.` };
  },
};

const failed = (gate, message) => ({ gate, passed: false, findings: [{ level: 'error', message }] });

/** Never throws: a gate that cannot run, or a blocking-gates list that cannot be read, is a failed result. */
export async function runChecks() {
  let workingTreeSha256 = null;
  try { workingTreeSha256 = architectureSha(); } catch { /* no model in the working tree: recorded as null */ }
  // Filled in by the controls runner; null where it did not get that far.
  const evidence = { architecture: { evaluatedSha256: null, workingTreeSha256 }, policySha256: null, controlsReportSha256: null };
  let blocking;
  try {
    blocking = baseArchitecture().controls['sdlc-prev-012-deployment-gating'].requirements[0].config['blocking-gates'];
    if (!Array.isArray(blocking) || blocking.length === 0) throw new Error('the base model names no blocking gates');
  } catch (e) {
    return { admissible: false, results: [failed('blocking-gates', `The blocking gates could not be read from the base model: ${e.message}`)], evidence };
  }
  const results = [];
  for (const name of blocking) {
    if (!runners[name]) { results.push(failed(name, `The model requires gate "${name}" but no runner exists for it`)); continue; }
    try {
      results.push(await runners[name](evidence));
    } catch (e) {
      results.push(failed(name, `The gate could not run: ${e?.message ?? String(e)}`));
    }
  }
  return { admissible: results.every((r) => r.passed), results, evidence };
}

if (process.argv[1]?.endsWith('check.mjs')) {
  const { admissible, results, evidence } = await runChecks();
  // SDLC-PREV-014: one hashed bundle per change, bound to the commit, the spec, the author and the pipeline run.
  // Written only from the CLI, never when runChecks is imported (the MCP server imports it).
  const git = gitInfo();
  const { GITHUB_RUN_ID, GITHUB_SERVER_URL, GITHUB_REPOSITORY } = process.env;
  const body = {
    generatedAt: new Date().toISOString(),
    commit: git.commit, tree: git.tree, dirty: git.dirty, branch: git.branch,
    spec: currentSpecId() ?? null,
    comparedTo: changeBase(),
    author: { kind: process.env.CHANGE_AUTHOR_KIND ?? 'unknown', id: process.env.CHANGE_AUTHOR_ID ?? 'unknown' },
    pipeline: GITHUB_RUN_ID ? { runId: GITHUB_RUN_ID, url: `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` } : null,
    architecture: evidence.architecture, // sha256 of the model bytes the controls came from, and of the working tree's
    policySha256: evidence.policySha256, // gates/policy/controls.wasm
    controlsReportSha256: evidence.controlsReportSha256, // evidence/out/controls-report.json, as written
    admissible,
    results,
  };
  mkdirSync(join(ROOT, 'evidence/out'), { recursive: true });
  writeFileSync(join(ROOT, 'evidence/out/gates.json'), JSON.stringify({ ...body, sha256: sha256(JSON.stringify(body)) }, null, 2));
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
