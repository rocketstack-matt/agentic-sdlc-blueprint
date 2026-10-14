// Plays the GitHub demo from the start and photographs each moment the talk shows: the gateway's comment on each pull
// request, and the approvals around it, into slides/img/github/; and CALM Hub's diagram at the same moment, in
// presentation mode with the decision overlay, into slides/img/hub/ (CALM_HUB_URL and the Hub UI at HUB_UI). Runs the gateway itself while it plays. Where
// a person must approve, the demo account named by DEMO_APPROVER approves, with its token from the gh CLI (gh auth
// login once as that account); with no token, it waits for that person to approve on GitHub. Needs the demo's GitHub
// Apps (node gateway/gateway/gh-apps.mjs), the gh CLI logged in as the repository's owner, and Playwright from the
// architecture-as-code checkout next to this repo. CALM_HUB_URL publishes to CALM Hub as it goes.
// Run: DEMO_APPROVER=<login> node slides/github-screenshots.mjs
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(join(here, '..', '..', 'architecture-as-code', 'node_modules', 'playwright', 'index.mjs'));
const { REPO, CHECK, appSlug, approver, approvers, as, tokenOf } = await import('../gateway/gateway/github.mjs');

const gateway = join(here, '..', 'gateway');
const out = join(here, 'img', 'github');
const hubOut = join(here, 'img', 'hub');
mkdirSync(out, { recursive: true });
mkdirSync(hubOut, { recursive: true });
const HUB_UI = process.env.HUB_UI ?? 'http://localhost:5173';
const NS = process.env.CALM_HUB_NAMESPACE ?? 'finos.agentic-sdlc';
// The demo's moments happen on these three boxes; the trader and the trade store stay out of those pictures.
const FOCUS = ['trade-api', 'position-service', 'client-ledger'];
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
// to: the gateway's comment that says it; from: the item before it to start the frame at; only: just the last item
// that says it, instead of a gateway comment.
async function shoot(name, n, { from, to, only }) {
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
    box = await locate(page, from, to, only);
  }
  if (!box) throw new Error(`#${n}: nothing in the timeline matches ${from ?? to}`);
  await page.screenshot({ path: join(out, `${name}.png`), clip: box, fullPage: true });
  await page.close();
  console.log(`github: ${name}.png (#${n})`);
}
// CALM Hub's diagram of a version, in presentation mode with the decision overlay, cropped to the boxes and their
// callouts. The gateway posts the decision's decorators just after its check, so give it a moment first.
// focus names the boxes to frame (with every callout); without it, the whole diagram.
async function hubShot(name, version, focus) {
  if (!process.env.CALM_HUB_URL) return;
  await sleep(3000);
  const { architectureId } = JSON.parse(readFileSync(join(gateway, '.gh', 'hub-state.json'), 'utf8'));
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
  await page.goto(`${HUB_UI}/#/${NS}/architectures/${architectureId}/${version}?present=1`);
  await page.waitForSelector('[data-testid="custom-node"]', { timeout: 30000 });
  await page.addStyleTag({ content: '.react-flow__controls, .react-flow__attribution, .react-flow__panel.top { display: none !important; }' });
  await page.getByLabel('Collapse sidebar').first().click().catch(() => {});
  await page.waitForTimeout(3000);
  const box = await page.evaluate((focus) => {
    const flow = document.querySelector('.react-flow').getBoundingClientRect();
    const nodes = [...document.querySelectorAll('.react-flow__node')].filter((e) => !focus || focus.includes(e.dataset.id));
    const rects = [...nodes, ...document.querySelectorAll('[data-testid="decision-callout"]')].map((e) => e.getBoundingClientRect());
    const pad = 30;
    const x0 = Math.max(flow.left, Math.min(...rects.map((r) => r.left)) - pad);
    // Keep the system's own label in the frame when the frame starts just under it.
    const group = document.querySelector('.react-flow__node-group')?.getBoundingClientRect();
    let top = Math.min(...rects.map((r) => r.top)) - pad;
    if (group && group.top < top && top - group.top < 200) top = group.top - 10;
    const y0 = Math.max(flow.top, top);
    const x1 = Math.min(flow.right, Math.max(...rects.map((r) => r.right)) + pad);
    const y1 = Math.min(flow.bottom, Math.max(...rects.map((r) => r.bottom)) + pad);
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }, focus ?? null);
  await page.screenshot({ path: join(hubOut, `${name}.png`), clip: box });
  await page.close();
  console.log(`hub: ${name}.png (${version})`);
}

function locate(page, from, to, only) {
  return page.evaluate(({ from, to, bot, only }) => {
    const items = [...document.querySelectorAll('.js-timeline-item')];
    const last = (text) => items.map((e, i) => [e, i]).filter(([e]) => e.innerText.includes(text)).at(-1);
    // The gateway's comment that says `to`, and the item that says `from` before it.
    const end = only ? last(only) : items.map((e, i) => [e, i]).filter(([e]) => e.innerText.includes(bot) && e.innerText.includes(to)).at(-1);
    const start = from ? last(from) : end;
    if (!end || !start || start[1] > end[1]) return null;
    const a = start[0].getBoundingClientRect(), b = end[0].getBoundingClientRect();
    return { x: Math.min(a.left, b.left) - 8, y: a.top + window.scrollY - 8, width: Math.max(a.right, b.right) - Math.min(a.left, b.left) + 16, height: b.bottom - a.top + 16 };
  }, { from, to, bot: appSlug('gateway'), only: only ?? null });
}

let gw;
try {
  await ensureCollaborator();
  console.log(node('gateway/gh-reset.mjs'));
  gw = spawn('node', ['gateway/gh-gateway.mjs', '--watch'], { cwd: gateway, env: process.env, stdio: ['ignore', 'inherit', 'inherit'] });
  await hubShot('0-architecture', '1.0.0');

  // 1. Harmless: green.
  const one = propose('account-summary');
  await verdict(one, 'success');
  await shoot('1-harmless', one, { to: 'All controls met' });
  await hubShot('1-harmless', '1.0.0', FOCUS);
  await merge(one);

  // 2. Near the ledger: red. 3. The approver approves: green; merge.
  const two = propose('position-total');
  await verdict(two, 'failure');
  await shoot('2-ledger', two, { to: 'needs a person' });
  await hubShot('2-ledger', '1.0.0', FOCUS);
  await waitForApproval(two, 0);
  await verdict(two, 'success');
  await shoot('3-approved', two, { only: `${APPROVER} approved` });
  await hubShot('3-approved', '1.0.0', FOCUS);
  await merge(two);

  // 4. The shortcut: red; closed.
  const shortcut = propose('ledger-shortcut');
  await verdict(shortcut, 'failure');
  await shoot('4-shortcut', shortcut, { to: 'not in the architecture' });
  await hubShot('4-shortcut', '1.0.0', FOCUS);
  await owner.patch(`/repos/${REPO}/pulls/${shortcut}`, { state: 'closed' });

  // 5. The architect: red until the approver approves; merge.
  const architect = propose('architect-ledger-connection', '--as', 'owner');
  await verdict(architect, 'failure');
  await waitForApproval(architect, 0);
  await verdict(architect, 'success');
  await shoot('5-architect', architect, { only: `${APPROVER} approved` });
  await merge(architect);
  await sleep(8000); // the gateway publishes the new architecture to CALM Hub
  await hubShot('5-architect', '1.1.0', FOCUS);

  // 6. The same harmless change, after the architecture changed: red.
  const climax = propose('trade-count');
  await verdict(climax, 'failure');
  await shoot('6-climax', climax, { to: 'needs a person' });
  await hubShot('6-climax', '1.1.0', FOCUS);
} finally {
  gw?.kill();
  await browser.close();
}
