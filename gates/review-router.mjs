#!/usr/bin/env node
// Gate: which kind of review does this change need?
//
// SDLC-PREV-001 asks for a deterministic, machine-evaluable policy that selects the review mode,
// and for the policy inputs to be recorded. Here the policy is NOT in this script. It lives in the
// CALM architecture, as the config of the `sdlc-prev-001-code-review` control, and the inputs
// (criticality tier, data classification) come from the CALM nodes the diff touches.
//
//   human      an eligible person who is not the author
//   cognitive  an approved AI review engine that is not the authoring agent
//   automated  deterministic checks alone satisfy the gate
//
// This gate never fails a build. It emits a decision record that your platform enforces
// (for example as a required reviewer or a required status check).
import { loadArchitecture, nodeForPath, changedFiles, report } from './lib/calm.mjs';

const RANK = { automated: 0, cognitive: 1, human: 2 };
const arch = loadArchitecture();
const policy = arch.controls['sdlc-prev-001-code-review'].requirements[0].config;

const decide = (file) => {
  const node = nodeForPath(arch, file);
  const tier = node?.metadata?.['criticality-tier'];
  const dataClass = node?.metadata?.['data-classification'];
  for (const rule of policy.rules) {
    const byPath = rule.paths?.some((p) => file === p || file.startsWith(p));
    const byTier = node && rule['max-criticality-tier'] !== undefined && tier <= rule['max-criticality-tier'];
    const byData = node && rule['data-classifications']?.includes(dataClass);
    if (byPath || byTier || byData) return { file, node: node?.['unique-id'] ?? null, tier: tier ?? null, dataClass: dataClass ?? null, mode: rule.mode, reason: rule.reason };
  }
  return { file, node: node?.['unique-id'] ?? null, tier: tier ?? null, dataClass: dataClass ?? null, mode: policy['default-mode'], reason: 'No rule matched: fail safe to the default mode' };
};

const inputs = changedFiles().map(decide);
const mode = inputs.reduce((m, d) => (RANK[d.mode] > RANK[m] ? d.mode : m), 'automated');
const deciding = inputs.filter((d) => d.mode === mode);

report({
  gate: 'review-router',
  controls: ['SDLC-PREV-001'],
  passed: true,
  findings: deciding.slice(0, 5).map((d) => ({ level: 'info', message: `${d.file}${d.node ? ` (node ${d.node}, tier ${d.tier}, ${d.dataClass})` : ''}: ${d.reason}` })),
  decision: { mode, authorMayNotReview: policy['author-may-not-review'] === true },
  policyInputs: inputs,
  summary: inputs.length ? `Required review mode: ${mode.toUpperCase()}` : 'No changes to review.',
});
