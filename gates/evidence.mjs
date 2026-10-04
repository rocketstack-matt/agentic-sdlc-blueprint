#!/usr/bin/env node
// SDLC-PREV-014 Test Evidence Retention, and the answer to risk SDLC-RC-005 Audit and Compliance Evidence Failure.
// Produces one machine-readable bundle per change, bound to the commit, the spec and the exact architecture,
// then hashes it. Beside the bundle, one CALM evidence document per control configuration in the model, each
// pointing at the gate results that evidenced it and at the exact config they evidenced. In CI the lot is
// uploaded as an artefact; in a bank it goes to WORM storage.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, ARCHITECTURE, architectureSha, gitInfo, loadArchitecture, sha256, changeBase, changedFiles } from './lib/calm.mjs';
import { runAll } from './run-all.mjs';

const git = gitInfo();
const { admissible, results } = runAll();
const spec = results.find((r) => r.gate === 'spec-check')?.spec ?? null;
const review = results.find((r) => r.gate === 'review-router');

const body = {
  schema: 'agentic-sdlc-blueprint/evidence/v0',
  generatedAt: new Date().toISOString(),
  subject: { commit: git.commit, branch: git.branch, tree: git.tree, workingTreeDirty: git.dirty, spec, architectureSha256: architectureSha(), comparedTo: changeBase(), changedFiles: changedFiles() },
  author: { kind: process.env.CHANGE_AUTHOR_KIND ?? 'unknown', id: process.env.CHANGE_AUTHOR_ID ?? 'unknown' },
  pipeline: process.env.GITHUB_RUN_ID ? { runId: process.env.GITHUB_RUN_ID, url: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` } : null,
  admissible,
  review: { requiredMode: review?.decision?.mode ?? null, authorMayNotReview: review?.decision?.authorMayNotReview ?? null, policyInputs: review?.policyInputs ?? [] },
  controls: [...new Set(results.flatMap((r) => r.controls))].sort(),
  gates: results,
};
const bundle = { ...body, sha256: sha256(JSON.stringify(body)) };

const stem = `${git.commit.slice(0, 12)}${git.dirty ? '-dirty' : ''}`;
const dir = join(ROOT, 'evidence', 'out');
mkdirSync(join(dir, stem), { recursive: true });
const file = `evidence/out/${stem}.json`;
writeFileSync(join(ROOT, file), JSON.stringify(bundle, null, 2));

// CALM evidence documents (https://calm.finos.org/release/1.2/meta/evidence.json): one per control configuration
// that a gate evidenced, found by the catalog control id the config carries. `control-config-url` is the
// architecture's own `$id` plus a JSON Pointer to that config; `evidence-paths` point into the bundle above.
const arch = loadArchitecture();
const configs = [
  ...Object.keys(arch.controls ?? {}).map((key) => ({ scope: arch['unique-id'], key, pointer: `/controls/${key}` })),
  ...arch.nodes.flatMap((n, i) => Object.keys(n.controls ?? {}).map((key) => ({ scope: n['unique-id'], key, pointer: `/nodes/${i}/controls/${key}` }))),
];
const documents = configs.flatMap(({ scope, key, pointer }) => {
  const control = scope === arch['unique-id'] ? arch.controls[key] : arch.nodes.find((n) => n['unique-id'] === scope).controls[key];
  const controlId = control.requirements?.[0]?.config?.['control-id'];
  const paths = results.flatMap((r, i) => (r.controls.includes(controlId) ? [`${file}#/gates/${i}`] : []));
  if (!paths.length) return [];
  const document = {
    $schema: 'https://calm.finos.org/release/1.2/meta/evidence.json',
    evidence: { 'unique-id': `${stem}-${scope}-${key}`, 'evidence-paths': paths, 'control-config-url': `${arch.$id ?? ARCHITECTURE}#${pointer}/requirements/0/config` },
  };
  writeFileSync(join(dir, stem, `${scope}.${key}.json`), JSON.stringify(document, null, 2));
  return [document];
});

console.log(`${admissible ? 'ADMISSIBLE' : 'BLOCKED'}  evidence written to ${file}`);
console.log(`  controls evidenced: ${bundle.controls.join(', ')}`);
console.log(`  review mode: ${bundle.review.requiredMode}   sha256: ${bundle.sha256.slice(0, 16)}...`);
console.log(`  ${documents.length} CALM evidence documents in evidence/out/${stem}/`);
if (git.dirty) console.log('  NOTE working tree is dirty: commit first for evidence that binds to a real commit.');
process.exitCode = admissible ? 0 : 1;
