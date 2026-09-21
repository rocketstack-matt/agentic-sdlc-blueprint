#!/usr/bin/env node
// Gate: does the code still match the architecture?
//
// How it works, deliberately simply:
//  1. Each CALM node with code declares `metadata.source-path`.
//  2. Each CALM interface that code can bind to declares an `env-binding` (e.g. POSITION_STORE_PATH).
//  3. We scan each service's source for `process.env.X` and for imports that reach into another node.
//     Each hit is a connection the CODE makes. An env name no interface declares is a binding the model does not know.
//  4. Any connection the code makes that the MODEL does not contain as a `connects` relationship is drift.
//     Any node-level SDLC-PREV-017 `allowed-sources` list is enforced too.
//
// Risk addressed: SDLC-OP-007 Configuration Drift (here: architectural drift).
// Controls: SDLC-PREV-017 Service Dependency Control, SDLC-PREV-012 Deployment Gating.
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { ROOT, loadArchitecture, codeNodes, envBindings, modelledEdges, nodeForPath, nodeById, walk, rel, report } from './lib/calm.mjs';

const arch = loadArchitecture();
const bindings = envBindings(arch);
const modelled = modelledEdges(arch);
const isModelled = (s, d) => modelled.some((e) => e.source === s && e.destination === d);

const observed = []; // {source, destination, file, line, via}
for (const node of codeNodes(arch)) {
  const id = node['unique-id'];
  for (const file of walk(join(ROOT, node.metadata['source-path'])).filter((f) => /\.(ts|js|mjs)$/.test(f))) {
    readFileSync(file, 'utf8').split('\n').forEach((text, i) => {
      for (const m of text.matchAll(/process\.env\.([A-Z0-9_]+)|process\.env\[['"]([A-Z0-9_]+)['"]\]/g)) {
        const owner = bindings.get(m[1] ?? m[2]);
        if (owner !== id) observed.push({ source: id, destination: owner ?? null, file: rel(file), line: i + 1, via: `env ${m[1] ?? m[2]}` });
      }
      const imp = text.match(/from\s+['"](\.{1,2}\/[^'"]+)['"]/);
      if (imp) {
        const target = nodeForPath(arch, rel(resolve(dirname(file), imp[1])));
        if (target && target['unique-id'] !== id)
          observed.push({ source: id, destination: target['unique-id'], file: rel(file), line: i + 1, via: `import ${imp[1]}` });
      }
    });
  }
}

const findings = [];
for (const o of observed) {
  const where = `${o.file}:${o.line} (${o.via})`;
  if (!o.destination) { findings.push({ level: 'error', message: `UNMODELLED BINDING: ${o.source} reads an env name no CALM interface declares. ${where}` }); continue; }
  if (!isModelled(o.source, o.destination)) {
    findings.push({ level: 'error', message: `DRIFT: code connects ${o.source} -> ${o.destination}, which is not in the CALM model. ${where}` });
  }
  const allowed = nodeById(arch, o.destination)?.controls?.['sdlc-prev-017-service-dependency']?.requirements?.[0]?.config?.['allowed-sources'];
  if (allowed && !allowed.includes(o.source)) {
    findings.push({ level: 'error', message: `CONTROL BREACH: ${o.destination} only permits [${allowed.join(', ')}] but ${o.source} connects to it. ${where}` });
  }
}
for (const e of modelled) {
  const bothHaveCodeOrBinding = codeNodes(arch).some((n) => n['unique-id'] === e.source);
  if (bothHaveCodeOrBinding && !observed.some((o) => o.source === e.source && o.destination === e.destination))
    findings.push({ level: 'warn', message: `STALE MODEL? ${e.id} is modelled but no code evidence was found for ${e.source} -> ${e.destination}.` });
}

const edges = [...new Set(observed.filter((o) => o.destination).map((o) => `${o.source} -> ${o.destination}`))];
report({
  gate: 'drift-check',
  controls: ['SDLC-PREV-017', 'SDLC-PREV-012'],
  risks: ['SDLC-OP-007'],
  passed: !findings.some((f) => f.level === 'error'),
  findings,
  observedEdges: edges,
  summary: `${edges.length} connection(s) observed in code, ${modelled.length} modelled in CALM.`,
});
