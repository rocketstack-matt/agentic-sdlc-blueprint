#!/usr/bin/env node
// Gate: did this change alter the architecture, and did its spec say it would?
//
// The CALM CLI's own `calm diff` says what changed, in CALM terms. This gate applies one rule on top:
// a change to the map (nodes, relationships, the metadata and dependency permissions the other gates read)
// or to the policy in a system-level control config, is admissible only when the spec declares it in
// `model-change`. Descriptions and catalog links are text: reported here, routed to human review by SDLC-PREV-001,
// never blocked here.
//
// Controls: SDLC-PREV-004 (the spec declares scope), SDLC-PREV-017 (dependency changes go through change management).
// Risk: SDLC-SEC-008 Unauthorised Change.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, ARCHITECTURE, changeBase, currentSpecId, loadArchitecture, loadSpecs, report } from './lib/calm.mjs';

const base = changeBase();
let baseline = null;
try { baseline = execFileSync('git', ['show', `${base}:${ARCHITECTURE}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { /* no baseline: nothing to compare */ }

// What the other gates read from a node or relationship. Anything else is text.
const shape = (x) => JSON.stringify({
  type: x['node-type'] ?? x['relationship-type'], protocol: x.protocol, interfaces: x.interfaces, metadata: x.metadata,
  allowed: Object.values(x.controls ?? {}).map((c) => c.requirements?.[0]?.config?.['allowed-sources']),
});
// A system-level control's config is policy the gates execute. Only its catalog pointers are text.
const policy = (c) => { const { 'catalog-url': u, 'catalog-id': i, 'enforced-by': e, ...rest } = c?.requirements?.[0]?.config ?? {}; return JSON.stringify(rest); };
const id = (x) => x['unique-id'] ?? x.updated?.['unique-id'];
const material = (list) => list.filter((m) => !m.original || shape(m.original) !== shape(m.updated)).map(id);

let changes = { added: [], removed: [], modified: [], text: [] };
if (baseline) {
  const dir = mkdtempSync(join(tmpdir(), 'calm-diff-'));
  writeFileSync(join(dir, 'base.json'), baseline);
  spawnSync('npx', ['--no-install', 'calm', 'diff', '-a', join(dir, 'base.json'), '-b', ARCHITECTURE, '-f', 'json', '-o', join(dir, 'diff.json')], { cwd: ROOT, encoding: 'utf8' });
  const d = JSON.parse(readFileSync(join(dir, 'diff.json'), 'utf8'));
  const modified = [...d.nodesModified, ...d.edgesModified];
  changes = {
    added: [...d.nodesAdded, ...d.edgesAdded].map(id),
    removed: [...d.nodesRemoved, ...d.edgesRemoved].map(id),
    modified: material(modified),
    text: modified.map(id).filter((i) => !material(modified).includes(i)),
  };
  const before = JSON.parse(baseline).controls ?? {}, after = loadArchitecture().controls ?? {};
  for (const c of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!before[c]) changes.added.push(c);
    else if (!after[c]) changes.removed.push(c);
    else if (policy(before[c]) !== policy(after[c])) changes.modified.push(c);
    else if (d.controlItemsModified?.[c]) changes.text.push(c);
  }
}

const mapChanges = [...changes.added, ...changes.removed, ...changes.modified];
const specId = currentSpecId();
const spec = loadSpecs().find((s) => s.id === specId);
const declared = spec?.['model-change'] ?? [];
const undeclared = mapChanges.filter((i) => !declared.includes(i));

const findings = [];
if (mapChanges.length && !specId) findings.push({ level: 'error', message: `MODEL CHANGE without a spec: [${mapChanges.join(', ')}]. A model change is made by a human under a spec that declares it in model-change.` });
else if (undeclared.length) findings.push({ level: 'error', message: `UNDECLARED MODEL CHANGE: ${specId} does not declare [${undeclared.join(', ')}] in model-change. Propose the model change for human approval first; do not edit the model to make a gate pass.` });
for (const i of mapChanges.filter((i) => declared.includes(i))) findings.push({ level: 'info', message: `Declared model change under ${specId}: ${i}` });
for (const i of changes.text) findings.push({ level: 'info', message: `Text changed on ${i}: not blocked here, routed to human review by SDLC-PREV-001.` });

report({
  gate: 'model-diff',
  controls: ['SDLC-PREV-004', 'SDLC-PREV-017'],
  risks: ['SDLC-SEC-008'],
  passed: !findings.some((f) => f.level === 'error'),
  findings,
  comparedTo: baseline ? base : null,
  changes,
  summary: !baseline ? 'No baseline architecture to compare against.' : mapChanges.length ? `Model changed against ${base}: +${changes.added.length} -${changes.removed.length} ~${changes.modified.length}.` : `Model unchanged against ${base}.`,
});
