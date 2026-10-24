// Turns one merge decision into CALM control-evaluation decorators: one per control the model carries, pinned to the
// architecture elements the control was about, with the reasons when it was not met. Validated against the Standard
// in gateway/standards before anything is written or published.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020.js').default;
const addFormats = require('ajv-formats').default;

const STANDARDS = join(fileURLToPath(new URL('..', import.meta.url)), 'standards');
const standard = JSON.parse(readFileSync(join(STANDARDS, 'control-evaluation.decorator.standard.json'), 'utf8'));
export const STANDARD_ID = standard.$id;

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(JSON.parse(readFileSync(join(STANDARDS, 'decorators.json'), 'utf8')));
const check = ajv.compile(standard);

export function validateDecorator(decorator) {
  const valid = check(decorator);
  return { valid, errors: valid ? [] : check.errors.map((e) => `${e.instancePath || '/'} ${e.message}`) };
}

// The checks a reader needs first when a requirement fails; the rest follow in report order. The gateway's screen and
// the decorators' findings use the same order.
export const FIRST_CHECKS = ['human_approved', 'not_the_author', 'in_architecture', 'in_spec', 'names_a_spec', 'approval_for_this_diff'];
export const checkRank = (v) => (FIRST_CHECKS.includes(v.check) ? FIRST_CHECKS.indexOf(v.check) : FIRST_CHECKS.length);

const ENGINE = { name: 'ergo', version: 'd924f4d' };
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const isSha = (s) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);

const controlAt = (arch, key, on) => {
  if (on === 'system') return arch.controls?.[key];
  const holder = [...arch.nodes, ...(arch.relationships ?? []), ...(arch.flows ?? [])].find((e) => e['unique-id'] === on);
  return holder?.controls?.[key];
};

export function buildDecorators({ outcome, input, decisionId, target, evaluatedAt }) {
  const requirements = outcome.report?.requirements;
  if (!requirements) return [];
  const arch = input.architecture;
  const change = input.change ?? {};
  const elements = new Set([...arch.nodes, ...(arch.relationships ?? [])].map((e) => e['unique-id']));
  const sourceOf = Object.fromEntries((arch.relationships ?? []).filter((r) => r['relationship-type']?.connects).map((r) => [r['unique-id'], r['relationship-type'].connects.source.node]));
  const systemNode = arch.nodes.find((n) => n['node-type'] === 'system')?.['unique-id'];
  const reportSha = sha256(JSON.stringify(outcome.report));
  const actors = Object.fromEntries(Object.entries({ author: change.author, reviewer: change.review?.reviewer, approver: change.approval?.approver }).filter(([, v]) => typeof v === 'string' && v));

  return Object.entries(outcome.controls ?? {}).flatMap(([key, on]) => {
    const names = Object.entries(requirements).filter(([, q]) => q.meta?.['calm-control'] === key).map(([name]) => name);
    if (!names.length) return [];
    const statuses = names.map((n) => requirements[n].status);
    const status = statuses.includes('not_met') ? 'not-met' : statuses.includes('met') ? 'met' : 'not-applicable';
    const attachedTo = on === 'system' ? systemNode : on;

    const inScope = new Set(outcome.report.results.filter((r) => names.includes(r.requirement) && !String(r.check).startsWith('$')).map((r) => String(r.subject?.id)));
    const appliesTo = new Set();
    for (const id of inScope) if (elements.has(id)) { appliesTo.add(id); if (sourceOf[id]) appliesTo.add(sourceOf[id]); }
    if (!appliesTo.size && status !== 'not-applicable') for (const n of change.nodes ?? []) appliesTo.add(n);
    if (!appliesTo.size) appliesTo.add(attachedTo);

    let findings = (outcome.violations ?? []).filter((v) => names.includes(v.requirement)).sort((a, b) => checkRank(a) - checkRank(b)).map((v) => ({
      subject: String(v.subject?.id ?? v.requirement),
      check: v.check,
      description: v.description || v.check,
      ...(v.expression ? { expression: v.expression } : {}),
      ...(v.cause ? { cause: v.cause } : {}),
    }));
    if (status === 'not-met' && !findings.length) findings = [{ subject: key, description: 'The control was not met' }];

    const control = controlAt(arch, key, on)?.requirements?.[0] ?? {};
    return [{
      $schema: STANDARD_ID,
      'unique-id': `eval-${String(decisionId).slice(0, 8)}-${key}`,
      type: 'control-evaluation',
      target: [target],
      'target-type': ['architecture'],
      'applies-to': [...appliesTo].sort(),
      data: {
        control: { 'unique-id': key, ...(control.config?.['control-id'] ? { 'control-id': control.config['control-id'] } : {}), 'requirement-url': control['requirement-url'], 'attached-to': attachedTo },
        status,
        'evaluated-at': evaluatedAt,
        change: { commit: change.commit, ...(isSha(change.diff_sha256) ? { 'diff-sha256': change.diff_sha256 } : {}), ...(change.spec ? { spec: change.spec } : {}) },
        ...(status === 'not-met' ? { findings } : {}),
        ...(Object.keys(actors).length ? { actors } : {}),
        engine: { ...ENGINE, ...(isSha(outcome.policySha) ? { 'policy-sha256': outcome.policySha } : {}) },
        'report-sha256': reportSha,
      },
    }];
  });
}
