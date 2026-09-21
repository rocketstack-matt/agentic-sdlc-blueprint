#!/usr/bin/env node
// Gate: is this change tied to an approved spec, and did it stay inside the spec's declared scope?
//
//  - Every spec must reference CALM nodes and relationships that actually exist in the model.
//  - A change that touches code must name a spec (SPEC env var, or `Spec: SPEC-001` in the last commit message).
//  - The CALM nodes the diff touches must be a subset of the nodes the spec declares.
//    An agent that wanders outside its spec is stopped here, before review.
//
// Control: SDLC-PREV-004 Requirements Repository.
import { loadArchitecture, loadSpecs, nodeById, nodeForPath, changedFiles, currentSpecId, report } from './lib/calm.mjs';

const arch = loadArchitecture();
const specs = loadSpecs();
const findings = [];
const relationshipIds = new Set(arch.relationships.map((r) => r['unique-id']));

for (const s of specs) {
  for (const n of s['calm-nodes'] ?? []) if (!nodeById(arch, n)) findings.push({ level: 'error', message: `${s.path}: references unknown CALM node "${n}"` });
  for (const r of s['calm-relationships'] ?? []) if (!relationshipIds.has(r)) findings.push({ level: 'error', message: `${s.path}: references unknown CALM relationship "${r}"` });
  if (!s.id || !s.status) findings.push({ level: 'error', message: `${s.path}: front matter needs id and status` });
}

const touched = [...new Set(changedFiles().map((f) => nodeForPath(arch, f)?.['unique-id']).filter(Boolean))];
const specId = currentSpecId();

if (touched.length) {
  const spec = specs.find((s) => s.id === specId);
  if (!specId) findings.push({ level: 'error', message: `Change touches [${touched.join(', ')}] but names no spec. Set SPEC=SPEC-nnn or add "Spec: SPEC-nnn" to the commit message.` });
  else if (!spec) findings.push({ level: 'error', message: `Spec ${specId} not found in specs/` });
  else {
    if (spec.status !== 'approved') findings.push({ level: 'error', message: `${spec.id} is "${spec.status}", not approved` });
    const outside = touched.filter((n) => !(spec['calm-nodes'] ?? []).includes(n));
    if (outside.length) findings.push({ level: 'error', message: `OUT OF SCOPE: change touches [${outside.join(', ')}] but ${spec.id} only declares [${(spec['calm-nodes'] ?? []).join(', ')}]` });
  }
}

report({
  gate: 'spec-check',
  controls: ['SDLC-PREV-004'],
  passed: !findings.some((f) => f.level === 'error'),
  findings,
  spec: specId ?? null,
  touchedNodes: touched,
  summary: `${specs.length} spec(s) checked against the model. Change touches ${touched.length ? touched.join(', ') : 'no code nodes'}${specId ? ` under ${specId}` : ''}.`,
});
