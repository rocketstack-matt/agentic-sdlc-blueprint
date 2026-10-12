// evidence.mjs [--last N]: the most recent decisions from the log, with the decorators each one wrote.
import { parseArgs, readDecisions, run } from './lib.mjs';

run(async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  const all = readDecisions();
  const last = Math.min(Number(flags.last ?? 2), all.length);
  console.log(`decisions.ndjson  ${all.length} decisions, last ${last}, each recorded as control-evaluation decorators`);
  for (const entry of all.slice(-last)) {
    console.log(`${entry.timestamp}  ${entry.allowed ? 'ALLOW' : 'DENY'}  ${entry.change.id} ${entry.change.commit.slice(0, 7)}  decision ${entry.decision_id.slice(0, 8)}`);
    console.log(`    architecture sha256:${entry.architecture_sha256.slice(0, 16)}…  policy sha256:${(entry.policy_sha256 ?? 'none').slice(0, 16)}…${entry.hub ? `  hub ${entry.hub.version}` : ''}`);
    for (const d of entry.decorators) console.log(`    ${d.status.padEnd(15)}${d.control}  on ${d['applies-to'].join(', ')}`);
  }
});
