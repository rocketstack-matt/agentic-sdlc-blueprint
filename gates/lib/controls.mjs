// Evaluates the controls the CALM model carries. The policy is data in the model; controls.wasm is the generic
// module (ergo plus gates/policy/controls.rego) that turns it into a report. The gates and the gateways pass the
// module as the base holds it (baseEngine in calm.mjs), so a model's policies are evaluated by the engine they were
// written for; without one, the working tree's module is used. stage 'change' blocks only on
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

const loaded = new Map();
const policy = (bytes, sha) => {
  if (!loaded.has(sha)) loaded.set(sha, loadPolicy(bytes, undefined, { 'time.parse_rfc3339_ns': parseTime }));
  return loaded.get(sha);
};

export async function evaluateControls(input, { stage, wasm } = {}) {
  let policySha = null;
  const deny = (error) => ({ allowed: false, failing: [], pending: [], violations: [], problems: [], controls: {}, policySha, error });
  try {
    // wasm is the module's bytes, or a function that returns them (called here, so a module that can't be read denies).
    const bytes = (typeof wasm === 'function' ? wasm() : wasm) ?? readFileSync(WASM);
    policySha = sha256(bytes);
    // Anything else ('Merge', undefined) would silently block only on change-stage requirements.
    if (stage !== 'change' && stage !== 'merge') return deny(`unknown stage ${JSON.stringify(stage)}: expected 'change' or 'merge'`);
    const result = (await policy(bytes, policySha)).evaluate(input, 'controls/result')[0]?.result;
    if (!result?.report?.requirements) return deny('the policy returned no report');
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
  } catch (thrown) {
    // Never throw to a caller: a gate that cannot decide denies.
    return deny(String(thrown));
  }
}
