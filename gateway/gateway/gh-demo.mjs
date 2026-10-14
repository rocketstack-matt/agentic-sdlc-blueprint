// gh-demo.mjs: the live demo, one key per moment. Run it after gh-reset, with the gateway watching in another
// terminal. It remembers where it got to (gateway/.gh/demo-state.json), so it can be stopped and started again.
//   Enter  the next moment          m  merge the current pull request (when its check has passed)
//   o      open it on GitHub        h  open CALM Hub at the latest version, in presentation mode
//   s      where we are             q  quit
// Without a terminal (input piped in), each line is a key; an empty line is Enter.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { CHECK, GH, REPO, as } from './github.mjs';
import { ROOT, run } from './lib.mjs';

const STATE = join(GH, 'demo-state.json');
const HUB_UI = process.env.HUB_UI ?? 'http://localhost:5173';
const NS = process.env.CALM_HUB_NAMESPACE ?? 'finos.agentic-sdlc';
const load = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { step: 0, prs: {}, current: null });
const save = (s) => writeFileSync(STATE, `${JSON.stringify(s, null, 2)}\n`);
const propose = (...args) => {
  const out = execFileSync('node', ['gateway/gh-propose.mjs', ...args], { cwd: ROOT, encoding: 'utf8' });
  return Number(out.match(/#(\d+)/)?.[1]);
};

// The talk's moments. Moment 3 is Aaron approving on GitHub; nothing to press for it.
const MOMENTS = [
  { n: 1, title: 'A harmless change', next: 'Green in a few seconds: press Merge on GitHub (or m).',
    run: (s) => { s.prs.harmless = propose('demo/changes/account-summary.json'); return s.prs.harmless; } },
  { n: 2, title: 'A change near the ledger', next: 'Red: needs a person. Moment 3: Aaron approves on GitHub; it turns green. Then press Merge (or m).',
    run: (s) => { s.prs.ledger = propose('demo/changes/position-total.json'); return s.prs.ledger; } },
  { n: 4, title: 'The shortcut', next: 'Red: that connection is not in the architecture. The next key closes it.',
    run: (s) => { s.prs.shortcut = propose('demo/changes/ledger-shortcut.json'); return s.prs.shortcut; } },
  { n: 5, title: 'The architect changes the architecture', next: 'Red until Aaron approves; then press Merge (or m), and move CALM Hub to 1.1.0 (or h).',
    run: async (s) => {
      if (s.prs.shortcut) await (await as('owner')).patch(`/repos/${REPO}/pulls/${s.prs.shortcut}`, { state: 'closed' });
      s.prs.architect = propose('demo/changes/architect-ledger-connection.json', '--as', 'owner');
      return s.prs.architect;
    } },
  { n: 6, title: 'The same harmless change, again', next: 'Red: now it needs a person. Back to the slides.',
    run: (s) => { s.prs.climax = propose('demo/changes/trade-count.json'); return s.prs.climax; } },
];

const url = (n) => `https://github.com/${REPO}/pull/${n}`;
const say = (text) => console.log(text);

async function checkOf(n) {
  const gh = await as('owner');
  const pr = await gh.get(`/repos/${REPO}/pulls/${n}`);
  const runs = (await gh.get(`/repos/${REPO}/commits/${pr.head.sha}/check-runs?check_name=${encodeURIComponent(CHECK)}`)).check_runs;
  const latest = runs.sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))[0];
  return { pr, state: pr.merged ? 'merged' : pr.state === 'closed' ? 'closed' : latest?.status !== 'completed' ? 'waiting' : latest.conclusion, title: latest?.output?.title };
}

run(async () => {
  if (!existsSync(GH)) throw new Error('run node gateway/gh-reset.mjs first');
  const state = load();
  let busy = false;
  let lastSeen = '';
  const status = () => {
    const next = MOMENTS[state.step];
    say(next ? `next: ${next.n}. ${next.title} (Enter)` : 'all moments done (q to quit)');
    if (state.current) say(`current pull request: ${url(state.current)}`);
  };
  // Say when the current pull request's check changes, so the presenter knows when to move on.
  setInterval(async () => {
    if (!state.current || busy) return;
    try {
      const c = await checkOf(state.current);
      const line = `#${state.current} ${c.state}${c.title ? `: ${c.title}` : ''}`;
      if (line !== lastSeen) { lastSeen = line; say(`  ${c.state === 'success' ? '✓' : c.state === 'failure' ? '✗' : '·'} ${line}`); }
    } catch { /* the next tick tries again */ }
  }, 3000).unref?.();

  const keys = {
    async next() {
      const moment = MOMENTS[state.step];
      if (!moment) { say('all moments done'); return; }
      say(`\n${moment.n}. ${moment.title}`);
      state.current = await moment.run(state);
      state.step += 1;
      save(state);
      lastSeen = '';
      say(`  ${url(state.current)}\n  ${moment.next}`);
    },
    async m() {
      if (!state.current) return say('no pull request yet');
      const c = await checkOf(state.current);
      if (c.state !== 'success') return say(`#${state.current} is ${c.state}: not merging`);
      await (await as('owner')).put(`/repos/${REPO}/pulls/${state.current}/merge`, { merge_method: 'merge' });
      say(`  merged #${state.current}`);
    },
    async o() { if (state.current) execFileSync('open', [url(state.current)]); },
    async h() {
      const hub = JSON.parse(readFileSync(join(GH, 'hub-state.json'), 'utf8'));
      const version = Object.values(hub.versions).sort().at(-1);
      execFileSync('open', [`${HUB_UI}/#/${NS}/architectures/${hub.architectureId}/${version}?present=1`]);
    },
    async s() { status(); },
    async q() { process.exit(0); },
  };
  const press = async (key) => {
    const name = key === '' || key === '\r' || key === '\n' || key === ' ' ? 'next' : key;
    if (!keys[name] || busy) return;
    busy = true;
    try { await keys[name](); } catch (e) { say(`  error: ${e.message}`); } finally { busy = false; }
  };

  say(`the live demo on ${REPO}`);
  status();
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (k) => { if (k === '\u0003') process.exit(0); press(k); });
  } else {
    const lines = createInterface({ input: process.stdin });
    for await (const line of lines) { await press(line.trim()); }
    // Piped input ended: let the last check finish printing, then stop.
    await new Promise((r) => setTimeout(r, 4000));
    process.exit(0);
  }
});
