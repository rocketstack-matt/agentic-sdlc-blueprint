// reset.mjs: a fresh repository for the gateway to guard, cloned from the blueprint's last commit, and, when
// CALM_HUB_URL is set, its architecture published to CALM Hub as the first version.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { relative } from 'node:path';
import { ARCHITECTURE, BLUEPRINT, DEMO, git, label, paths, run, short } from './lib.mjs';
import { hubEnabled, publishArchitecture, resetHub } from './hub.mjs';

run(async () => {
  await resetHub();
  rmSync(DEMO, { recursive: true, force: true });
  for (const dir of [paths.changes, paths.reviews, paths.decorators]) mkdirSync(dir, { recursive: true });
  execFileSync('git', ['clone', '--quiet', '--no-hardlinks', BLUEPRINT, paths.repo]);
  git('checkout', '-q', '-B', 'main');
  git('config', 'user.name', 'merge-gateway');
  git('config', 'user.email', 'merge-gateway@example.invalid');
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: BLUEPRINT, encoding: 'utf8' }).trim() !== '';
  console.log(label('repo', `${relative(process.cwd(), paths.repo) || paths.repo} at ${short(git('rev-parse', 'main'), 7)} (main)`));
  if (dirty) console.log(label('', 'note: the blueprint has uncommitted changes; the guarded repository has its last commit only'));
  if (!hubEnabled()) { console.log(label('hub', 'off (set CALM_HUB_URL to publish the architecture and every decision)')); return; }
  const published = await publishArchitecture(`${git('show', `main:${ARCHITECTURE}`)}\n`); // the file's bytes: same text, same Hub version
  console.log(label('hub', published?.error ? `failed: ${published.error}` : `Trade Capture (governed) ${published.version} -> ${published.target}`));
});
