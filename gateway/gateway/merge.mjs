// merge.mjs <id> --review <file> [--approval <file>]: the merge gateway. Verifies signatures and recomputes the diff
// in Node, works out the facts with the controls of main, evaluates them with ergo at stage merge, records the
// decision as control-evaluation decorators (and on CALM Hub when CALM_HUB_URL is set), and on ALLOW merges into main.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { baseArchitectureText, changeInput } from '../../gates/lib/calm.mjs';
import { evaluateControls } from '../../gates/lib/controls.mjs';
import { buildDecorators, validateDecorator } from './decorators.mjs';
import { hubEnabled, postDecorator, publishArchitecture } from './hub.mjs';
import {
  APPROVAL, ARCHITECTURE, decodeJws, diffOf, git, loadChange, logDecision, markUsed, paint, parseArgs, paths,
  publicKeyOf, readLedger, run, sha256, verifyJws, withCheckout,
} from './lib.mjs';

function loadReview(file) {
  const { jws } = JSON.parse(readFileSync(file, 'utf8'));
  const { claims } = decodeJws(jws);
  return { reviewer: claims.reviewer, commit: claims.commit, diff_sha256: claims.diff_sha256, verdict: claims.verdict, verified: verifyJws(jws, publicKeyOf(claims.reviewer ?? '')) };
}

// Everything about the token that is not about this change is checked here and folded into verified; the binding to
// this commit and diff, and single use, are the policy's checks.
function loadApproval(file, now) {
  const { jwt } = JSON.parse(readFileSync(file, 'utf8'));
  const { claims } = decodeJws(jwt);
  const grant = (claims.authorization_details ?? []).find((g) => g.type === 'repo:merge') ?? {};
  const verified = verifyJws(jwt, publicKeyOf(APPROVAL.issuer)) && claims.iss === APPROVAL.issuer && claims.aud === APPROVAL.audience
    && now <= claims.exp && now - claims.iat <= APPROVAL.maxAgeSeconds;
  return { approver: claims.sub, commit: grant.commit, diff_sha256: grant.diff_sha256, verified, used: Boolean(readLedger().used[claims.jti]), jti: claims.jti };
}

// The checks a reader needs first when a requirement fails; the rest follow in report order.
const FIRST = ['human_approved', 'not_the_author', 'in_architecture', 'in_spec', 'names_a_spec', 'approval_for_this_diff'];
const rank = (v) => (FIRST.includes(v.check) ? FIRST.indexOf(v.check) : FIRST.length);
const reasons = (outcome) => {
  const lines = [];
  if (outcome.error) lines.push(`the controls could not be evaluated: ${outcome.error}`);
  for (const p of outcome.problems ?? []) lines.push(p);
  for (const name of outcome.failing ?? []) {
    lines.push(outcome.report.requirements[name].description);
    const vs = outcome.violations.filter((v) => v.requirement === name).sort((a, b) => rank(a) - rank(b));
    const subject = (id) => (/^[0-9a-f]{40}$/.test(id ?? '') ? id.slice(0, 7) : id);
    const seen = [...new Set(vs.map((v) => `${subject(v.subject?.id)}: ${v.description || v.check}`))];
    for (const s of seen.slice(0, 2)) lines.push(`  ✗ ${s}`);
    if (seen.length > 2) lines.push(`  … and ${seen.length - 2} more`);
  }
  return lines;
};

run(async () => {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  if (!positional[0] || typeof flags.review !== 'string') throw new Error('usage: node gateway/merge.mjs <id> --review <file> [--approval <file>]');
  const change = loadChange(positional[0]);
  const now = Math.floor(Date.now() / 1000);
  const main = git('rev-parse', 'main');
  // Controls from main as it is now; the change's files from where it left main.
  const base = git('merge-base', main, change.commit);
  const archText = baseArchitectureText(main, paths.repo);
  const arch = JSON.parse(archText);
  const diffSha = sha256(diffOf(change.commit));

  const input = await withCheckout(change.commit, (tree) => changeInput({ arch, base, head: change.commit, root: paths.repo, treeRoot: tree, specId: change.spec, author: change.author }));
  input.change.diff_sha256 = diffSha;
  input.change.review = loadReview(flags.review);
  let approval;
  if (typeof flags.approval === 'string') { approval = loadApproval(flags.approval, now); const { jti, ...claims } = approval; input.change.approval = claims; }

  // A change with nothing left to merge (already in main) is not a change.
  const empty = input.change.files.length === 0;
  const outcome = empty ? { allowed: false, error: 'nothing to merge: the change is already in main', controls: {} } : await evaluateControls(input, { stage: 'merge' });

  const decisionId = randomUUID();
  const evaluatedAt = new Date().toISOString();
  const published = await publishArchitecture(archText);
  const target = published?.target ?? `${ARCHITECTURE}@${sha256(archText).slice(0, 12)}`;
  const decorators = buildDecorators({ outcome, input, decisionId, target, evaluatedAt });
  mkdirSync(paths.decorators, { recursive: true });
  const hubIds = [];
  for (const d of decorators) {
    const { valid, errors } = validateDecorator(d);
    if (!valid) throw new Error(`decorator ${d['unique-id']} is not valid: ${errors.join('; ')}`);
    writeFileSync(join(paths.decorators, `${d['unique-id']}.json`), `${JSON.stringify(d, null, 2)}\n`);
    hubIds.push(await postDecorator(d));
  }
  logDecision({
    decision_id: decisionId, timestamp: evaluatedAt, allowed: outcome.allowed,
    change: { id: change.id, commit: change.commit, diff_sha256: diffSha, spec: change.spec, author: change.author },
    architecture_sha256: sha256(archText), policy_sha256: outcome.policySha ?? null,
    failing: outcome.failing ?? [], problems: outcome.problems ?? [], error: outcome.error ?? null,
    decorators: decorators.map((d) => ({ id: d['unique-id'], control: d.data.control['unique-id'], status: d.data.status, 'applies-to': d['applies-to'] })),
    hub: published && !published.error ? { version: published.version, target } : null,
  });

  if (outcome.allowed) {
    console.log(paint.bold(paint.green('ALLOW')));
    if (approval) markUsed(approval.jti, { change: change.id, commit: change.commit, decision_id: decisionId, at: evaluatedAt });
    git('merge', '--no-ff', '-q', '-m', `Merge ${change.id}: ${change.title}\n\nSpec: ${change.spec}`, change.commit);
    console.log(`  main -> ${git('rev-parse', '--short=7', 'main')} (merged ${change.id})`);
    const after = git('show', `main:${ARCHITECTURE}`);
    if (after !== archText.trim()) {
      console.log('  architecture changed on main');
      if (hubEnabled()) {
        const next = await publishArchitecture(`${after}\n`);
        console.log(`  hub: ${next?.error ? `failed: ${next.error}` : `published ${next.version} -> ${next.target}`}`);
      }
    }
  } else {
    console.log(paint.bold(paint.red('DENY')));
    for (const line of reasons(outcome)) console.log(`  ${line}`);
  }
  const hubNote = !hubEnabled() ? '' : published?.error ? `  hub failed: ${published.error}` : hubIds.some((x) => x?.error) ? '  hub: some decorators failed' : `  hub ${published.version}`;
  console.log(paint.dim(`logged  decision ${decisionId.slice(0, 8)}  ${decorators.length} decorators${hubNote}`));
  process.exitCode = outcome.allowed ? 0 : 1;
});
