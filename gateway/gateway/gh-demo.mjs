// gh-demo.mjs: the live demo, one key per moment. Run it after gh-reset, with the gateway watching in another
// terminal. It remembers where it got to (gateway/.gh/demo-state.json), so it can be stopped and started again.
//   Enter  the next moment          m  merge the current pull request (when its check has passed)
//   o      open it on GitHub        h  open CALM Hub at the latest version, in presentation mode
//   a      approve it from this laptop, as an approver logged in to the gh CLI (rehearsals, or if Aaron cannot)
//   s      where we are             q  quit
// Without a terminal (input piped in), each line is a key; an empty line is Enter.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { CHECK, GH, REPO, approvers, as, tokenOf } from './github.mjs';
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

// The talk's moments. Moment 4 is Aaron approving on GitHub; nothing to press for it. `does` is what Enter will do,
// shown before the key is pressed; `next` is what to watch for and do once it has.
const MOMENTS = [
  { n: 1, title: 'The architecture',
    does: 'opens CALM Hub on the trade capture system, with the Client Ledger and its rule in the details pane',
    next: 'Walk the system: Trade API, Position Service, Client Ledger, and the rule on the ledger.',
    run: (s) => { openHub('1.0.0', 'client-ledger'); return s.current; } },
  { n: 2, title: 'A harmless change',
    does: 'the agent opens "Account summary endpoint on trade-api": nowhere near the ledger, so it should go green',
    next: 'Green in a few seconds: press Merge on GitHub (or m).',
    run: (s) => { s.prs.harmless = propose('demo/changes/account-summary.json'); return s.prs.harmless; } },
  { n: 3, title: 'A change near the ledger',
    does: 'the agent opens "Position total endpoint on position-service": the Position Service writes the ledger, so it should go red and ask for a person',
    next: 'Red: needs a person. Moment 4: Aaron approves on GitHub (or a); it turns green. Then press Merge (or m).',
    run: (s) => { s.prs.ledger = propose('demo/changes/position-total.json'); return s.prs.ledger; } },
  { n: 5, title: 'The shortcut',
    does: 'the agent opens a pull request where the Trade API reads the ledger file directly: a connection the architecture does not have, so red',
    next: 'Red: that connection is not in the architecture. The next Enter closes it.',
    run: (s) => { s.prs.shortcut = propose('demo/changes/ledger-shortcut.json'); return s.prs.shortcut; } },
  { n: 6, title: 'The architect changes the architecture',
    does: 'closes the shortcut, and you, as the architect, open a pull request adding Trade API -> Client Ledger to the architecture: red until a person approves',
    next: 'Red until Aaron approves (or a); then press Merge (or m), and move CALM Hub to 1.1.0 (or h).',
    run: async (s) => {
      if (s.prs.shortcut) await (await as('owner')).patch(`/repos/${REPO}/pulls/${s.prs.shortcut}`, { state: 'closed' });
      s.prs.architect = propose('demo/changes/architect-ledger-connection.json', '--as', 'owner');
      return s.prs.architect;
    } },
  { n: 7, title: 'The same harmless change, again',
    does: 'the agent opens "Trade count endpoint on trade-api", the same kind of change as moment 2: now red, because the Trade API connects to the ledger',
    next: 'Red: now it needs a person. Nobody touched the pipeline. Back to the slides.',
    run: (s) => { s.prs.climax = propose('demo/changes/trade-count.json'); return s.prs.climax; } },
];

// CALM Hub in presentation mode at a version of the demo's architecture (the latest when none is given), with a
// node open in the details pane when one is named.
function openHub(version, node) {
  const hub = JSON.parse(readFileSync(join(GH, 'hub-state.json'), 'utf8'));
  const at = version ?? Object.values(hub.versions).sort().at(-1);
  execFileSync('open', [`${HUB_UI}/#/${NS}/architectures/${hub.architectureId}/${at}?present=1${node ? `&node=${node}` : ''}`]);
}

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
  // What Enter will do next, so the presenter never has to remember.
  const upNext = () => {
    const next = MOMENTS[state.step];
    say(next ? `\n  \x1b[1mEnter -> ${next.n}. ${next.title}\x1b[0m: ${next.does}` : '\n  all moments done (q to quit)');
  };
  const status = () => {
    if (state.current) say(`current pull request: ${url(state.current)}`);
    upNext();
  };
  // Say when the current pull request's check changes, so the presenter knows when to move on.
  setInterval(async () => {
    const n = state.current;
    if (!n || busy) return;
    try {
      const c = await checkOf(n);
      if (n !== state.current) return; // the next moment started while this one was being checked
      const line = `#${n} ${c.state}${c.title ? `: ${c.title}` : ''}`;
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
      say(`${state.current ? `  ${url(state.current)}\n` : ''}  ${moment.next}`);
      upNext();
    },
    async m() {
      if (!state.current) return say('no pull request yet');
      const c = await checkOf(state.current);
      if (c.state !== 'success') return say(`#${state.current} is ${c.state}: not merging`);
      await (await as('owner')).put(`/repos/${REPO}/pulls/${state.current}/merge`, { merge_method: 'merge' });
      say(`  merged #${state.current}`);
    },
    async a() {
      if (!state.current) return say('no pull request yet');
      const who = approvers().find((login) => { try { return Boolean(tokenOf(login)); } catch { return false; } });
      if (!who) return say('no approver is logged in to the gh CLI on this laptop: approve on GitHub');
      const { pr } = await checkOf(state.current);
      await (await as(who)).post(`/repos/${REPO}/pulls/${state.current}/reviews`, { commit_id: pr.head.sha, event: 'APPROVE' });
      say(`  approved #${state.current} as @${who}`);
    },
    async o() { if (state.current) execFileSync('open', [url(state.current)]); },
    async h() { openHub(); },
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
