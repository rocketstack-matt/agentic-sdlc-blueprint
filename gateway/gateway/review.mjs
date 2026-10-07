// review.mjs <change.json> --as <identity> [--verdict approve|reject] [--out review.json]
// Writes a review record signed (ES256) by that identity, bound to the commit and the exact diff.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { keyPair, loadChange, parseArgs, paths, run, short, signJws, slug } from './lib.mjs';

run(async () => {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  if (!positional[0] || typeof flags.as !== 'string') {
    throw new Error('usage: node gateway/review.mjs <change.json> --as <identity> [--verdict approve|reject] [--out review.json]');
  }
  const change = loadChange(positional[0]);
  const reviewer = flags.as;
  const verdict = flags.verdict ?? 'approve';
  const claims = {
    iss: reviewer,
    sub: change.id,
    reviewer,
    commit: change.commit,
    diff_sha256: change.diff_sha256,
    verdict,
    iat: Math.floor(Date.now() / 1000),
  };
  const { privateKey } = keyPair(reviewer);
  const jws = signJws(claims, privateKey, slug(reviewer));

  mkdirSync(paths.reviews, { recursive: true });
  const out = flags.out ?? join(paths.reviews, `${change.name.replace(/^change-/, '')}.${reviewer.split('/').pop()}.json`);
  // claims is a readable copy; the gateway verifies the jws, never the copy.
  writeFileSync(out, `${JSON.stringify({ jws, claims }, null, 2)}\n`);
  console.log(`review  ${change.id} ${short(change.commit, 7)} diff ${short(change.diff_sha256)}  ${verdict} by ${reviewer}  -> ${relative(process.cwd(), out)}`);
});
