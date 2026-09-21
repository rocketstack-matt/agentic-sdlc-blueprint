#!/usr/bin/env node
// SDLC-PREV-014 Test Evidence Retention, and the answer to risk SDLC-RC-005 Audit and Compliance Evidence Failure.
// Produces one machine-readable bundle per change, bound to the commit, the spec and the exact architecture,
// then hashes it. In CI the bundle is uploaded as an artefact; in a bank it goes to WORM storage.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, architectureSha, gitInfo, sha256, changeBase, changedFiles } from './lib/calm.mjs';
import { runAll } from './run-all.mjs';

const git = gitInfo();
const { admissible, results } = runAll();
const spec = results.find((r) => r.gate === 'spec-check')?.spec ?? null;
const review = results.find((r) => r.gate === 'review-router');

const body = {
  schema: 'agentic-sdlc-blueprint/evidence/v0',
  generatedAt: new Date().toISOString(),
  subject: { commit: git.commit, tree: git.tree, workingTreeDirty: git.dirty, spec, architectureSha256: architectureSha(), comparedTo: changeBase(), changedFiles: changedFiles() },
  author: { kind: process.env.CHANGE_AUTHOR_KIND ?? 'unknown', id: process.env.CHANGE_AUTHOR_ID ?? 'unknown' },
  admissible,
  review: { requiredMode: review?.decision?.mode ?? null, authorMayNotReview: review?.decision?.authorMayNotReview ?? null, policyInputs: review?.policyInputs ?? [] },
  controls: [...new Set(results.flatMap((r) => r.controls))].sort(),
  gates: results,
};
const bundle = { ...body, sha256: sha256(JSON.stringify(body)) };

const dir = join(ROOT, 'evidence', 'out');
mkdirSync(dir, { recursive: true });
const file = join(dir, `${git.commit.slice(0, 12)}${git.dirty ? '-dirty' : ''}.json`);
writeFileSync(file, JSON.stringify(bundle, null, 2));
console.log(`${admissible ? 'ADMISSIBLE' : 'BLOCKED'}  evidence written to ${file.replace(ROOT + '/', '')}`);
console.log(`  controls evidenced: ${bundle.controls.join(', ')}`);
console.log(`  review mode: ${bundle.review.requiredMode}   sha256: ${bundle.sha256.slice(0, 16)}...`);
if (git.dirty) console.log('  NOTE working tree is dirty: commit first for evidence that binds to a real commit.');
process.exitCode = admissible ? 0 : 1;
