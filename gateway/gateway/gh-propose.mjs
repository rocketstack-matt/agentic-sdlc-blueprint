// gh-propose.mjs <demo/changes/x.json> [--as agent|owner] [--onto <pull request number> [--message <text>]]: opens one of the demo's
// changes as a pull request on the demo repository, as the agent app (or as you, for the architect's change). With
// --onto, the change is pushed as one more commit on that pull request's branch instead: the push after approval.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { CLONE, REPO, appSlug, as, inClone, remote } from './github.mjs';
import { label, parseArgs, run } from './lib.mjs';

run(async () => {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  if (!positional[0]) throw new Error('usage: node gateway/gh-propose.mjs <demo/changes/x.json> [--as agent|owner] [--onto <pr>]');
  const file = resolve(positional[0]);
  const desc = JSON.parse(readFileSync(file, 'utf8'));
  const role = flags.as === 'owner' ? 'owner' : 'agent';
  const gh = await as(role);
  // The commit's author is who opens the pull request: the agent app's bot user, or the owner.
  let who;
  if (role === 'agent') {
    const bot = await gh.get(`/users/${encodeURIComponent(`${appSlug('agent')}[bot]`)}`);
    who = { name: bot.login, email: `${bot.id}+${bot.login}@users.noreply.github.com` };
  } else {
    const me = await gh.get('/user');
    who = { name: me.name ?? me.login, email: `${me.id}+${me.login}@users.noreply.github.com` };
  }
  const commit = (message) => execFileSync('git', ['-c', `user.name=${who.name}`, '-c', `user.email=${who.email}`, 'commit', '-q', '-m', message], { cwd: CLONE });
  const patch = join(dirname(file), '..', 'patches', desc.patch);
  inClone('fetch', '-q', 'origin');

  if (flags.onto) {
    // One more commit on the open pull request: its tree becomes main plus this change.
    const pr = await gh.get(`/repos/${REPO}/pulls/${flags.onto}`);
    const branch = pr.head.ref;
    inClone('checkout', '-q', '-B', 'scratch', 'origin/main');
    inClone('apply', '--index', patch);
    const tree = inClone('write-tree');
    inClone('reset', '-q', '--hard');
    inClone('checkout', '-q', '-B', branch, `origin/${branch}`);
    inClone('read-tree', '-u', '--reset', tree);
    commit(`${typeof flags.message === 'string' ? flags.message : desc.title}\n\nSpec: ${desc.spec}`);
    inClone('push', '-q', remote(gh.token), `${branch}:${branch}`);
    inClone('checkout', '-q', '--detach', 'origin/main');
    console.log(label('pushed', `${inClone('rev-parse', '--short=7', branch)} onto #${pr.number} (${branch})`));
    console.log(label('url', pr.html_url));
    return;
  }

  const branch = `agent/${desc.id.toLowerCase()}`;
  inClone('checkout', '-q', '-B', branch, 'origin/main');
  inClone('apply', '--index', patch);
  commit(`${desc.title}\n\nSpec: ${desc.spec}`);
  inClone('push', '-q', '--force', remote(gh.token), `${branch}:${branch}`);
  inClone('checkout', '-q', '--detach', 'origin/main');
  const pr = await gh.post(`/repos/${REPO}/pulls`, { title: desc.title, head: branch, base: 'main', body: `${desc.body ?? ''}\n\nSpec: ${desc.spec}`.trim() });
  console.log(label('opened', `#${pr.number} ${desc.title}`));
  console.log(label('url', pr.html_url));
});
