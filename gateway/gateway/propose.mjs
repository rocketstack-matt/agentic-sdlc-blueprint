// propose.mjs <demo/changes/x.json>: the agent's branch. Applies the change's patch to main in the guarded repository
// as one commit by its author, with a Spec trailer, and shows the change the way the gateway will see it.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { nodeForPath } from '../../gates/lib/calm.mjs';
import { ARCHITECTURE, diffOf, git, label, parseArgs, paths, run, sha256 } from './lib.mjs';

run(async () => {
  const { positional } = parseArgs(process.argv.slice(2));
  if (!positional[0]) throw new Error('usage: node gateway/propose.mjs <demo/changes/x.json>');
  const file = resolve(positional[0]);
  const desc = JSON.parse(readFileSync(file, 'utf8'));
  for (const key of ['id', 'title', 'spec', 'author', 'patch']) if (!desc[key]) throw new Error(`${positional[0]} has no ${key}`);

  git('checkout', '-q', '-B', `agent/${desc.id}`, 'main');
  try {
    git('apply', '--index', join(dirname(file), '..', 'patches', desc.patch));
    git('-c', `user.name=${desc.author}`, '-c', `user.email=${desc.author}@example.invalid`, 'commit', '-q', '-m', `${desc.title}\n\nSpec: ${desc.spec}`);
  } finally {
    git('checkout', '-q', 'main');
  }
  const commit = git('rev-parse', `agent/${desc.id}`);
  const diff = diffOf(commit);
  const files = git('diff', '--name-only', '--no-renames', `main...${commit}`).split('\n').filter(Boolean);
  const change = { id: desc.id, title: desc.title, spec: desc.spec, author: desc.author, commit, diff_sha256: sha256(diff), files };
  mkdirSync(paths.changes, { recursive: true });
  writeFileSync(join(paths.changes, `${desc.id}.json`), `${JSON.stringify(change, null, 2)}\n`);

  const arch = JSON.parse(git('show', `main:${ARCHITECTURE}`));
  const nodes = [...new Set(files.map((f) => nodeForPath(arch, f)?.['unique-id']).filter(Boolean))];
  console.log(label('change', `${change.id}  ${change.title}`));
  console.log(label('spec', change.spec));
  console.log(label('author', change.author));
  console.log(label('commit', `${commit.slice(0, 7)} on agent/${change.id}`));
  files.forEach((f, i) => console.log(label(i === 0 ? 'files' : '', f)));
  console.log(label('nodes', nodes.length ? nodes.join(', ') : 'none: no node owns these files'));
  console.log(label('diff', `sha256 ${change.diff_sha256.slice(0, 16)}…, ${diff.toString('utf8').split('\n').length} lines`));
});
