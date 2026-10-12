// Evaluates the controls the CALM model carries. The policy is data in the model; controls.wasm is the generic
// module (ergo plus gates/policy/controls.rego) that turns it into a report. stage 'change' blocks only on
// requirements whose meta.stage is 'change' (CI); stage 'merge' blocks on all of them (the merge gateway).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPolicy } from '@open-policy-agent/opa-wasm';
import { ROOT, sha256 } from './calm.mjs';

const WASM = join(ROOT, 'gates/policy/controls.wasm');

// ergo's Wasm notes: the JS runtime lacks this built-in. None of our checks compare times.
const parseTime = (v) => {
  const [, time, fraction = '', zone] = /^(.{19})(?:\.(\d+))?(.*)$/.exec(v);
  return JSON.rawJSON(String(BigInt(Date.parse(time + zone)) / 1000n * 1000000000n + BigInt(fraction.padEnd(9, '0').slice(0, 9))));
};

let loaded;
const policy = async () => (loaded ??= await loadPolicy(readFileSync(WASM), undefined, { 'time.parse_rfc3339_ns': parseTime }));

export async function evaluateControls(input, { stage }) {
  const policySha = sha256(readFileSync(WASM));
  let result;
  try {
    result = (await policy()).evaluate(input, 'controls/result')[0]?.result;
  } catch (thrown) {
    return { allowed: false, failing: [], pending: [], violations: [], problems: [], controls: {}, policySha, error: String(thrown) };
  }
  if (!result?.report?.requirements) {
    return { allowed: false, failing: [], pending: [], violations: [], problems: [], controls: {}, policySha, error: 'the policy returned no report' };
  }
  const { report, violations, problems, controls } = result;
  const entries = Object.entries(report.requirements);
  const blocking = entries.filter(([, q]) => stage === 'merge' || q.meta?.stage === 'change');
  const failing = blocking.filter(([, q]) => q.status === 'not_met').map(([name]) => name);
  const pending = stage === 'merge' ? [] : entries
    .filter(([, q]) => q.meta?.stage === 'merge' && q.status !== 'not_applicable')
    .map(([requirement, q]) => ({ requirement, description: q.description }));
  return {
    allowed: problems.length === 0 && blocking.length > 0 && failing.length === 0,
    failing,
    pending,
    report,
    violations: violations.filter((v) => failing.includes(v.requirement)),
    problems,
    controls,
    policySha,
  };
}
