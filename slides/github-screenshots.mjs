// Plays the GitHub demo from the start and photographs each moment the talk shows into slides/img/github/: the
// gateway's comment on each pull request, and the approvals around it. Runs the gateway itself while it plays. Where
// a person must approve, the demo account named by DEMO_APPROVER approves, with its token from the gh CLI (gh auth
// login once as that account); with no token, it waits for that person to approve on GitHub. Needs the demo's GitHub
// Apps (node gateway/gateway/gh-apps.mjs), the gh CLI logged in as the repository's owner, and Playwright from the
// architecture-as-code checkout next to this repo. CALM_HUB_URL publishes to CALM Hub as it goes.
// Run: DEMO_APPROVER=<login> node slides/github-screenshots.mjs
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(join(here, '..', '..', 'architecture-as-code', 'node_modules', 'playwright', 'index.mjs'));
const { REPO, CHECK, appSlug, approver, approvers, as, tokenOf } = await import('../gateway/gateway/github.mjs');

const gateway = join(here, '..', 'gateway');
const out = join(here, 'img', 'github');
mkdirSync(out, { recursive: true });
const APPROVER = approver();
if (!approvers().includes(APPROVER)) throw new Error(`${APPROVER} is not in the approvers in gateway/.github-demo.json`);
let approverToken = null;
try { approverToken = tokenOf(APPROVER); } catch { console.log(`no gh token for ${APPROVER}: will wait for them to approve on GitHub`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const node = (...args) => execFileSync('node', args, { cwd: gateway, encoding: 'utf8', env: process.env }).trim();
const owner = await as('owner');

const propose = (change, ...flags) => {
  const text = node('gateway/gh-propose.mjs', `demo/changes/${change}.json`, ...flags);
  console.log(text);
  return Number(text.match(/#(\d+)/)?.[1]);
};
const head = async (n) => (await owner.get(`/repos/${REPO}/pulls/${n}`)).head.sha;
// The gateway's latest finished check on the pull request's head commit.
async function verdict(n, want) {
  for (;;) {
    const sha = await head(n);
    const runs = (await owner.get(`/repos/${REPO}/commits/${sha}/check-runs?check_name=${encodeURIComponent(CHECK)}`)).check_runs;
    const done = runs.filter((r) => r.status === 'completed').sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at))[0];
    if (done && (!want || done.conclusion === want)) return done.conclusion;
    await sleep(3000);
  }
}
async function approvals(n) {
  return (await owner.get(`/repos/${REPO}/pulls/${n}/reviews`)).filter((r) => r.user.login === APPROVER && r.state === 'APPROVED');
}
async function waitForApproval(n, already) {
  if (approverToken) {
    const person = await as(APPROVER);
    await person.post(`/repos/${REPO}/pulls/${n}/reviews`, { commit_id: await head(n), event: 'APPROVE', body: 'I have read the diff. Approved.' });
    console.log(`@${APPROVER} approved #${n}`);
  } else console.log(`waiting for @${APPROVER} to approve https://github.com/${REPO}/pull/${n}`);
  while ((await approvals(n)).length <= already) await sleep(3000);
}
// The approver must be a collaborator: invite them, and accept the invitation with their token.
async function ensureCollaborator() {
  const collaborators = (await owner.get(`/repos/${REPO}/collaborators`)).map((c) => c.login);
  if (collaborators.includes(APPROVER)) return;
  await owner.put(`/repos/${REPO}/collaborators/${APPROVER}`, { permission: 'push' });
  if (!approverToken) throw new Error(`invited ${APPROVER}: accept the invitation, then run again`);
  const person = await as(APPROVER);
  for (const inv of await person.get('/user/repository_invitations')) if (inv.repository.full_name === REPO) await person.patch(`/user/repository_invitations/${inv.id}`);
}
const merge = (n) => owner.put(`/repos/${REPO}/pulls/${n}/merge`, { merge_method: 'merge' });

// A picture of the pull request's timeline, from the last item that matches `from` to the last that matches `to`,
// so the gateway's comment and what led to it are in one frame.
const browser = await chromium.launch();
async function shoot(name, n, { from, to }) {
  const page = await browser.newPage({ viewport: { width: 1012, height: 900 }, deviceScaleFactor: 2 });
  let box = null;
  // GitHub can serve the page a moment before the newest timeline items: load it again until they are there.
  for (let attempt = 0; attempt < 10 && !box; attempt += 1) {
    if (attempt) await sleep(3000);
    try {
      await page.goto(`https://github.com/${REPO}/pull/${n}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('.js-timeline-item', { timeout: 15000 });
      await page.waitForTimeout(1500);
    } catch { continue; }
    await page.addStyleTag({ content: '.js-notice, .flash, header, .AppHeader, .gh-header-sticky { display: none !important; }' });
    box = await locate(page, from, to);
  }
  if (!box) throw new Error(`#${n}: nothing in the timeline matches ${from ?? to}`);
  await page.screenshot({ path: join(out, `${name}.png`), clip: box, fullPage: true });
  await page.close();
  console.log(`github: ${name}.png (#${n})`);
}
function locate(page, from, to) {
  return page.evaluate(({ from, to, bot }) => {
    const items = [...document.querySelectorAll('.js-timeline-item')];
    const last = (text) => items.map((e, i) => [e, i]).filter(([e]) => e.innerText.includes(text)).at(-1);
    // The gateway's comment that says `to`, and the item that says `from` before it.
    const end = items.map((e, i) => [e, i]).filter(([e]) => e.innerText.includes(bot) && e.innerText.includes(to)).at(-1);
    const start = from ? last(from) : end;
    if (!end || !start || start[1] > end[1]) return null;
    const a = start[0].getBoundingClientRect(), b = end[0].getBoundingClientRect();
    return { x: Math.min(a.left, b.left) - 8, y: a.top + window.scrollY - 8, width: Math.max(a.right, b.right) - Math.min(a.left, b.left) + 16, height: b.bottom - a.top + 16 };
  }, { from, to, bot: appSlug('gateway') });
}

let gw;
try {
  await ensureCollaborator();
  console.log(node('gateway/gh-reset.mjs'));
  gw = spawn('node', ['gateway/gh-gateway.mjs', '--watch'], { cwd: gateway, env: process.env, stdio: ['ignore', 'inherit', 'inherit'] });

  // 1. Harmless: green.
  const one = propose('account-summary');
  await verdict(one, 'success');
  await shoot('1-harmless', one, { to: 'All controls met' });
  await merge(one);

  // 2. Near the ledger: red. 3. Aaron approves: green.
  const two = propose('position-total');
  await verdict(two, 'failure');
  await shoot('2-ledger', two, { to: 'needs a person' });
  await waitForApproval(two, 0);
  await verdict(two, 'success');
  await shoot('3-approved', two, { from: `${APPROVER} approved`, to: 'All controls met' });

  // 4. One more line after approval: red. Aaron approves again; merge.
  propose('position-total-amended', '--onto', String(two), '--message', 'Add a source header to the position total');
  await sleep(5000);
  await verdict(two, 'failure');
  await shoot('4-stale', two, { to: 'earlier commit' });
  await waitForApproval(two, 1);
  await verdict(two, 'success');
  await merge(two);

  // 5. The shortcut: red; closed.
  const five = propose('ledger-shortcut');
  await verdict(five, 'failure');
  await shoot('5-shortcut', five, { to: 'not in the architecture' });
  await owner.patch(`/repos/${REPO}/pulls/${five}`, { state: 'closed' });

  // 6. The architect: red until Aaron approves; merge.
  const six = propose('architect-ledger-connection', '--as', 'owner');
  await verdict(six, 'failure');
  await waitForApproval(six, 0);
  await verdict(six, 'success');
  await shoot('6-architect', six, { from: `${APPROVER} approved`, to: 'All controls met' });
  await merge(six);

  // 7. The same harmless change, after the architecture changed: red.
  await sleep(8000); // the gateway publishes the new architecture to CALM Hub
  const seven = propose('trade-count');
  await verdict(seven, 'failure');
  await shoot('7-climax', seven, { to: 'needs a person' });
} finally {
  gw?.kill();
  await browser.close();
}
