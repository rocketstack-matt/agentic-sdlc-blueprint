// evidence.mjs [--last N]: print the most recent decisions from the log, readably.
import { parseArgs, readDecisions, run, short } from './lib.mjs';

run(async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  const all = readDecisions();
  const last = Number(flags.last ?? 2);
  console.log(`decisions.ndjson  ${all.length} entries, last ${Math.min(last, all.length)}`);
  for (const [i, entry] of all.slice(-last).entries()) {
    const n = all.length - Math.min(last, all.length) + i + 1;
    const { change } = entry.input;
    console.log(`#${n}  ${entry.timestamp}  ${entry.result.allow ? 'ALLOW' : 'DENY'}  ${change.id} commit ${short(change.commit, 7)}`);
    console.log(`    decision      ${entry.decision_id}`);
    console.log(`    change        sha256:${change.diff_sha256}`);
    console.log(`    architecture  ${entry.bundles.architecture.revision}`);
    console.log(`    policy        ${entry.bundles['merge-policy'].revision}`);
    if (entry.input.approval) console.log(`    token         jti ${entry.input.approval.jti}`);
    for (const reason of entry.result.deny) console.log(`    deny          ${reason}`);
  }
});
