// merge.mjs <change.json> [--review review.json] [--approval token.json]
// The merge gateway: verifies signatures and hashes in Node, evaluates the policy in wasm,
// appends the decision to the log and, on ALLOW, spends the approval token.
import { readFileSync } from 'node:fs';
import {
  APPROVAL_SERVICE, changeInput, decodeJws, evaluate, loadChange, loadSpec, logDecision, markUsed,
  paint, parseArgs, publicKeyOf, readLedger, run, short, verifyJws,
} from './lib.mjs';

// The review record: claims plus whether the reviewer's signature checks out.
function loadReview(file) {
  const { jws } = JSON.parse(readFileSync(file, 'utf8'));
  const { claims } = decodeJws(jws);
  const verified = verifyJws(jws, publicKeyOf(claims.reviewer ?? claims.iss ?? ''));
  return { reviewer: claims.reviewer, commit: claims.commit, diff_sha256: claims.diff_sha256, verdict: claims.verdict, verified };
}

// The approval token: claims plus signature and ledger status. Expiry and binding are policy.
function loadApproval(file) {
  const { jwt } = JSON.parse(readFileSync(file, 'utf8'));
  const { claims } = decodeJws(jwt);
  const verified = verifyJws(jwt, publicKeyOf(APPROVAL_SERVICE));
  const used = Boolean(readLedger().used[claims.jti]);
  return { ...claims, verified, used };
}

run(async () => {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  if (!positional[0]) throw new Error('usage: node gateway/merge.mjs <change.json> [--review review.json] [--approval token.json]');
  const change = loadChange(positional[0]);
  const spec = loadSpec(change.spec);
  const input = {
    change: changeInput(change),
    spec: { id: spec.id, approved: spec.approved, nodes: spec.nodes },
    now: Math.floor(Date.now() / 1000),
  };
  if (typeof flags.review === 'string') input.review = loadReview(flags.review);
  if (typeof flags.approval === 'string') input.approval = loadApproval(flags.approval);

  const outcome = await evaluate(input);
  const entry = logDecision({ input, ...outcome });

  if (outcome.allow) {
    console.log(paint.bold(paint.green('ALLOW')));
    if (input.approval) {
      markUsed(input.approval.jti, { change: change.id, commit: change.commit, decision_id: entry.decision_id, at: entry.timestamp });
      console.log(`  approval token ${short(input.approval.jti)} spent: single use`);
    }
  } else {
    console.log(paint.bold(paint.red('DENY')));
    for (const reason of outcome.deny) console.log(`  ${reason}`);
  }
  console.log(paint.dim(`logged  decision ${short(entry.decision_id)}  change ${short(change.diff_sha256)}  arch ${short(outcome.archSha)}  policy ${short(outcome.policySha)}  -> decisions.ndjson`));
  process.exitCode = outcome.allow ? 0 : 1;
});
