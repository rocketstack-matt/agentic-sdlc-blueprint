// merge.mjs <id> --review <file> [--approval <file>]: the merge gateway. Verifies signatures and recomputes the diff
// in Node, works out the facts with the controls of main, evaluates them with ergo at stage merge, records the
// decision as control-evaluation decorators (and on CALM Hub when CALM_HUB_URL is set), and on ALLOW merges into main.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { baseArchitectureText, baseEngine, changeInput } from '../../gates/lib/calm.mjs';
import { evaluateControls } from '../../gates/lib/controls.mjs';
import { buildDecorators, checkRank, validateDecorator } from './decorators.mjs';
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

// The gateway's own refusals (the change is not what its file says, or cannot be merged) are printed as they are; an
// error from the controls says so.
const reasons = (outcome) => {
  const lines = [];
  if (outcome.error) lines.push(outcome.refused ? outcome.error : `the controls could not be evaluated: ${outcome.error}`);
  for (const p of outcome.problems ?? []) lines.push(p);
  for (const name of outcome.failing ?? []) {
    lines.push(outcome.report.requirements[name].description);
    const vs = outcome.violations.filter((v) => v.requirement === name).sort((a, b) => checkRank(a) - checkRank(b));
    const subject = (id) => (/^[0-9a-f]{40}$/.test(id ?? '') ? id.slice(0, 7) : id);
    const seen = [...new Set(vs.map((v) => `${subject(v.subject?.id)}: ${v.description || v.check}`))];
    for (const s of seen.slice(0, 2)) lines.push(`  ✗ ${s}`);
    if (seen.length > 2) lines.push(`  … and ${seen.length - 2} more`);
  }
  return lines;
};

// The author and the spec are the commit's: the change file is only where the gateway finds the commit.
function identityProblem(change) {
  const author = git('log', '-1', '--format=%an', change.commit);
  const spec = git('log', '-1', '--format=%(trailers:key=Spec,valueonly)', change.commit).trim();
  if (!author) return 'the commit has no author';
  if (author !== change.author) return `the change file names author ${change.author}, but the commit's author is ${author}`;
  if (!spec) return 'the commit has no Spec trailer';
  if (spec !== change.spec) return `the change file names spec ${change.spec}, but the commit's Spec trailer is ${spec}`;
  return null;
}

// Asked before anything is decided: a merge that would conflict is never started.
const mergesCleanly = (commit) => { try { git('merge-tree', '--write-tree', 'main', commit); return true; } catch { return false; } };

const refused = (error) => ({ allowed: false, refused: true, error, controls: {} });

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

  const identity = identityProblem(change);
  let input = { architecture: arch, change: { ...change, files: [] } };
  let approval;
  let outcome;
  if (identity) outcome = refused(identity);
  else {
    input = await withCheckout(change.commit, (tree) => changeInput({ arch, base, head: change.commit, root: paths.repo, treeRoot: tree, specId: change.spec, author: change.author }));
    input.change.diff_sha256 = diffSha;
    input.change.review = loadReview(flags.review);
    if (typeof flags.approval === 'string') { approval = loadApproval(flags.approval, now); const { jti, ...claims } = approval; input.change.approval = claims; }
    // A change with nothing left to merge (already in main) is not a change; one that conflicts with main cannot merge.
    if (input.change.files.length === 0) outcome = refused('nothing to merge: the change is already in main');
    else if (!mergesCleanly(change.commit)) outcome = refused('the change does not merge cleanly into main');
    else outcome = await evaluateControls(input, { stage: 'merge', wasm: () => baseEngine(main, paths.repo) });
  }

  const decisionId = randomUUID();
  const evaluatedAt = new Date().toISOString();
  const published = await publishArchitecture(archText); // the decorators' target is this version on the Hub
  const target = published && !published.error ? published.target : `${ARCHITECTURE}@${sha256(archText).slice(0, 12)}`;
  let decorators = buildDecorators({ outcome, input, decisionId, target, evaluatedAt });
  // Every decorator is valid, or none is written or posted and the change is denied.
  const invalid = decorators.map((d) => ({ d, ...validateDecorator(d) })).find((x) => !x.valid);
  if (invalid) {
    outcome = { ...refused(`the decision could not be recorded: decorator ${invalid.d['unique-id']} is not valid: ${invalid.errors.join('; ')}`), failing: outcome.failing, report: outcome.report, violations: outcome.violations };
    decorators = [];
  }
  logDecision({
    decision_id: decisionId, timestamp: evaluatedAt, allowed: outcome.allowed,
    change: { id: change.id, commit: change.commit, diff_sha256: diffSha, spec: change.spec, author: change.author },
    architecture_sha256: sha256(archText), policy_sha256: outcome.policySha ?? null,
    failing: outcome.failing ?? [], problems: outcome.problems ?? [], error: outcome.error ?? null,
    decorators: decorators.map((d) => ({ id: d['unique-id'], control: d.data.control['unique-id'], status: d.data.status, 'applies-to': d['applies-to'] })),
    hub: published && !published.error ? { version: published.version, target } : null,
  });
  mkdirSync(paths.decorators, { recursive: true });
  for (const d of decorators) writeFileSync(join(paths.decorators, `${d['unique-id']}.json`), `${JSON.stringify(d, null, 2)}\n`);

  if (outcome.allowed) {
    console.log(paint.bold(paint.green('ALLOW')));
    git('merge', '--no-ff', '-q', '-m', `Merge ${change.id}: ${change.title}\n\nSpec: ${change.spec}`, change.commit);
    if (approval) markUsed(approval.jti, { change: change.id, commit: change.commit, decision_id: decisionId, at: evaluatedAt });
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

  // The verdict is out; only now is the Hub asked to take the decorators, and only if it has the version they target.
  let hubNote = '';
  if (hubEnabled()) {
    if (published?.error) hubNote = `  hub failed: ${published.error}; decorators not posted`;
    else {
      const hubIds = [];
      for (const d of decorators) hubIds.push(await postDecorator(d));
      hubNote = hubIds.some((x) => x?.error) ? '  hub: some decorators failed' : `  hub ${published.version}`;
    }
  }
  console.log(paint.dim(`logged  decision ${decisionId.slice(0, 8)}  ${decorators.length} decorators${hubNote}`));
  process.exitCode = outcome.allowed ? 0 : 1;
});
