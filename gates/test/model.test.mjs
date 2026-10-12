import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const model = () => JSON.parse(readFileSync(join(ROOT, 'architecture/trade-capture.architecture.json'), 'utf8'));
const validate = (doc) => {
  const dir = mkdtempSync(join(tmpdir(), 'model-'));
  const file = join(dir, 'arch.json');
  writeFileSync(file, JSON.stringify(doc));
  const out = join(dir, 'out.json');
  const r = spawnSync('npx', ['--no-install', 'calm', 'validate', '-p', 'architecture/governed-service.pattern.json', '-a', file, '-u', 'architecture/url-mapping.json', '-f', 'json', '-o', out], { cwd: ROOT, encoding: 'utf8' });
  let parsed = {};
  try { parsed = JSON.parse(readFileSync(out, 'utf8')); } catch { /* exit code decides */ }
  return r.status === 0 && parsed.hasErrors !== true;
};
const ledger = (doc) => doc.nodes.find((n) => n['unique-id'] === 'client-ledger');

test('the model is valid against the pattern', () => {
  assert.equal(validate(model()), true);
});

test('the client ledger exists, and nothing carries a tier or a classification', () => {
  const doc = model();
  assert.ok(ledger(doc));
  assert.equal(JSON.stringify(doc).includes('position-store'), false);
  assert.equal(/criticality-tier|data-classification/.test(JSON.stringify(doc)), false);
});

test('a system control without config.ergo is rejected by the pattern', () => {
  const doc = model();
  delete doc.controls['sdlc-prev-001-code-review'].requirements[0].config.ergo;
  assert.equal(validate(doc), false);
});

test('a node control without config.ergo is rejected by the pattern', () => {
  const doc = model();
  delete ledger(doc).controls['client-ledger-human-approval'].requirements[0].config.ergo;
  assert.equal(validate(doc), false);
});

test('an ergo requirement without meta.stage is rejected by the pattern', () => {
  const doc = model();
  delete doc.controls['sdlc-prev-017-service-dependency'].requirements[0].config.ergo.requirements['service-dependency'].meta.stage;
  assert.equal(validate(doc), false);
});
