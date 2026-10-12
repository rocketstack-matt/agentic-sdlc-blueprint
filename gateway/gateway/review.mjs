// review.mjs <id> --as <identity> [--verdict approve|reject]: a review record signed (ES256) by that identity, bound to
// the change's commit and the SHA-256 of its exact diff, recomputed from the repository.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { diffOf, keyPair, loadChange, parseArgs, paths, run, sha256, signJws, slug } from './lib.mjs';

run(async () => {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  if (!positional[0] || typeof flags.as !== 'string') throw new Error('usage: node gateway/review.mjs <id> --as <identity> [--verdict approve|reject]');
  const change = loadChange(positional[0]);
  const reviewer = flags.as;
  const verdict = flags.verdict ?? 'approve';
  const claims = { iss: reviewer, sub: change.id, reviewer, commit: change.commit, diff_sha256: sha256(diffOf(change.commit)), verdict, iat: Math.floor(Date.now() / 1000) };
  const jws = signJws(claims, keyPair(reviewer).privateKey, slug(reviewer));
  mkdirSync(paths.reviews, { recursive: true });
  const out = join(paths.reviews, `${change.id}.${slug(reviewer)}.json`);
  writeFileSync(out, `${JSON.stringify({ jws, claims }, null, 2)}\n`);
  console.log(`review  ${change.id} ${change.commit.slice(0, 7)}  ${verdict} by ${reviewer}  -> ${relative(process.cwd(), out)}`);
});
