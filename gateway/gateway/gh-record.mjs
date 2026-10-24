// gh-record.mjs: records one run of the GitHub demo to video, for a backup or to share. Run by
// `npm run demo:record` (gh-live.sh --record), which resets everything and starts the gateway first.
// It plays every moment the way gh-demo does (the agent, the approver and the merges are real), filming a title card,
// the pull request on GitHub and the decision in CALM Hub for each. Frames come from Chrome's screencast, each with the
// time it was captured; frames captured during a wait are dropped, so the video only shows finished pages.
// Needs: Playwright in the architecture-as-code checkout next to this repository, ffmpeg, and an approver from
// .github-demo.json logged in to the gh CLI.
// Out: gateway/.live/recording/osffny-demo.mp4, and a still of every scene beside it.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHECK, GH, REPO, approvers, tokenOf } from './github.mjs';
import { ROOT } from './lib.mjs';

const HUB_UI = process.env.HUB_UI ?? 'http://localhost:5173';
const HUB_API = process.env.CALM_HUB_URL ?? 'http://localhost:8080';
const NS = process.env.CALM_HUB_NAMESPACE ?? 'finos.agentic-sdlc';
const OUT = join(ROOT, '.live', 'recording');
const FRAMES = join(OUT, 'frames');
const W = 1600, H = 900, FPS = 30;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (message) => { console.error(message); process.exit(1); };
// Our own timer around anything that could hang: a stuck request or browser call must fail, not stop the recording.
const within = (p, what, ms = 20000) => {
  let timer;
  return Promise.race([p, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out: ${what}`)), ms); })]).finally(() => clearTimeout(timer));
};

// Before anything: the tools, an approver, and the gateway that gh-live.sh started.
const playwright = join(ROOT, '..', '..', 'architecture-as-code', 'node_modules', 'playwright', 'index.mjs');
if (!existsSync(playwright)) fail(`no Playwright at ${playwright}: run npm install in the architecture-as-code checkout`);
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { fail('no ffmpeg: install it (brew install ffmpeg)'); }
const approver = approvers().find((login) => { try { return Boolean(tokenOf(login)); } catch { return false; } });
if (!approver) fail(`log in to the gh CLI as one of the approvers (${approvers().join(', ')}): gh auth login`);
const run = existsSync(join(GH, 'gateway-run.json')) ? JSON.parse(readFileSync(join(GH, 'gateway-run.json'), 'utf8')) : null;
try { process.kill(run?.pid, 0); } catch { fail('the gateway is not running: use npm run demo:record'); }
const { chromium } = await import(playwright);

// GitHub, with tokens read once: no gh CLI calls (and no keychain prompts) while recording.
const TOKENS = { owner: tokenOf(REPO.split('/')[0]), approver: tokenOf(approver) };
async function api(as, method, path, body) {
  const call = async () => {
    const res = await fetch(`https://api.github.com${path}`, {
      method,
      headers: { accept: 'application/vnd.github+json', authorization: `token ${TOKENS[as]}`, 'x-github-api-version': '2022-11-28', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  };
  for (let attempt = 1; ; attempt++) {
    try { return await within(call(), `${method} ${path}`); }
    catch (e) { if (!e.message.startsWith('timed out') || method !== 'GET' || attempt === 3) throw e; log(e.message); } // only reads are retried
  }
}
const get = (path) => api('owner', 'GET', path);
const propose = (...args) => Number(execFileSync('node', ['gateway/gh-propose.mjs', ...args], { cwd: ROOT, encoding: 'utf8', timeout: 120000 }).match(/#(\d+)/)[1]);
const hubState = () => JSON.parse(readFileSync(join(GH, 'hub-state.json'), 'utf8'));

async function checkOf(n) {
  const pr = await get(`/repos/${REPO}/pulls/${n}`);
  const runs = (await get(`/repos/${REPO}/commits/${pr.head.sha}/check-runs?check_name=${encodeURIComponent(CHECK)}`)).check_runs;
  const latest = runs.sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))[0];
  return { pr, state: latest?.status !== 'completed' ? 'waiting' : latest.conclusion };
}
async function waitCheck(n, want) {
  for (let i = 0; i < 120; i++) {
    if ((await checkOf(n)).state === want) return;
    await sleep(2000);
  }
  throw new Error(`#${n} never reached ${want}`);
}
async function approve(n) {
  const { pr } = await checkOf(n);
  const approved = async () => (await get(`/repos/${REPO}/pulls/${n}/reviews`)).some((r) => r.user.login === approver && r.state === 'APPROVED');
  for (let i = 0; i < 3 && !(await approved()); i++) {
    await api('approver', 'POST', `/repos/${REPO}/pulls/${n}/reviews`, { commit_id: pr.head.sha, event: 'APPROVE' }).catch((e) => log(e.message));
  }
  log(`approved #${n} as ${approver}`);
}
// GitHub can refuse a merge for a moment after the required check passes: try until it is merged.
async function merge(n) {
  for (let i = 0; i < 20; i++) {
    await api('owner', 'PUT', `/repos/${REPO}/pulls/${n}/merge`, { merge_method: 'merge' }).catch((e) => log(e.message));
    if ((await get(`/repos/${REPO}/pulls/${n}`)).merged) return log(`merged #${n}`);
    await sleep(2000);
  }
  throw new Error(`#${n} would not merge`);
}
const gatewayComments = async (n) => (await get(`/repos/${REPO}/issues/${n}/comments?per_page=100`)).filter((c) => c.user.login.startsWith('calm-merge-gateway')).length;
// Decisions in CALM Hub for one commit: the gateway writes one set of decorators, with one evaluated-at, per decision.
async function hubDecisions(sha) {
  const body = await (await within(fetch(`${HUB_API}/api/calm/namespaces/${NS}/decorators/values?type=control-evaluation`), 'CALM Hub decorators')).json();
  const values = Array.isArray(body) ? body : body.values ?? [];
  return new Set(values.filter((d) => d.data?.change?.commit === sha).map((d) => d.data['evaluated-at'])).size;
}

// The browser: one filmed page, and an unfilmed one that checks what the signed-out GitHub page shows.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: W, height: H } });
const page = await context.newPage();
const probe = await (await browser.newContext()).newPage();
const frames = [];
const cdp = await context.newCDPSession(page);
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  const file = join(FRAMES, `${String(frames.length).padStart(6, '0')}.jpg`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  frames.push({ at: metadata.timestamp, file }); // seconds since the epoch, when the frame was captured
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: W, maxHeight: H, everyNthFrame: 1 });

// Waits happen between hold() and resume(): what the page shows then is left out of the video.
const now = () => Date.now() / 1000;
const holds = [];
const hold = () => { if (holds.at(-1)?.length !== 1) holds.push([now()]); };
const resume = () => { if (holds.at(-1)?.length === 1) holds.at(-1).push(now()); };
let shot = 0;
async function still(name) {
  await within(page.screenshot({ path: join(OUT, `${String(++shot).padStart(2, '0')}-${name}.png`) }), 'screenshot').catch((e) => log(e.message));
}
async function go(pg, url) {
  for (let attempt = 1; ; attempt++) {
    try { return await within(pg.goto(url, { waitUntil: 'domcontentloaded' }), `open ${url}`); }
    catch (e) { if (attempt === 2) throw e; log(e.message); }
  }
}

const CARD = (title, sub, kicker) => `<!doctype html><html><body style="margin:0;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:0 140px;box-sizing:border-box;background:#0d1b2a;color:#fff;font-family:-apple-system,Segoe UI,Helvetica,Arial">
  ${kicker ? `<div style="font-size:26px;letter-spacing:.08em;text-transform:uppercase;color:#58a6ff;margin-bottom:24px">${kicker}</div>` : ''}
  <div style="font-size:64px;font-weight:700;line-height:1.15">${title}</div>
  ${sub ? `<div style="font-size:30px;line-height:1.45;color:#c9d1d9;margin-top:32px;max-width:1200px">${sub}</div>` : ''}</body></html>`;
async function card(title, sub, kicker, ms = 5000) {
  await within(page.setContent(CARD(title, sub, kicker)), 'card');
  await still('card');
  await sleep(ms);
}
async function caption(text) {
  await within(page.evaluate((text) => {
    let el = document.getElementById('__caption');
    if (!el) {
      el = document.createElement('div');
      el.id = '__caption';
      el.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;background:rgba(13,27,42,.92);color:#fff;font:600 24px -apple-system,Segoe UI,Helvetica,Arial;padding:14px 28px;border-radius:10px;width:max-content;max-width:1450px;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.25)';
      document.body.appendChild(el);
    }
    el.textContent = text;
  }, text), 'caption');
}

// GitHub serves the signed-out pull request page from a cache that can lag the API: wait for the gateway's comments.
async function fresh(n, { merged = false } = {}) {
  const want = await gatewayComments(n);
  for (let i = 0; i < 150; i++) {
    await go(probe, `https://github.com/${REPO}/pull/${n}?r=${Date.now()}`);
    await sleep(1000);
    const s = await within(probe.evaluate(() => ({
      gateway: [...document.querySelectorAll('a.author')].filter((a) => a.textContent.trim() === 'calm-merge-gateway').length,
      merged: [...document.querySelectorAll('[class*=StateLabel]')].some((e) => e.textContent.trim() === 'Merged'),
    })), 'probe');
    if (s.gateway >= want && (!merged || s.merged)) return;
    await sleep(2000);
  }
  throw new Error(`#${n}: the GitHub page never caught up`);
}
// Every navigation happens inside a cut, so a page only appears once it is tidied and captioned.
async function openPR(n, text) {
  hold();
  await go(page, `https://github.com/${REPO}/pull/${n}?r=${Date.now()}`);
  await sleep(2500);
  await within(page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = '.HeaderMktg{display:none!important}'; // the signed-out header
    document.head.appendChild(style);
    const signup = [...document.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Sign up for free');
    if (signup?.parentElement?.parentElement) signup.parentElement.parentElement.style.display = 'none';
  }), 'tidy');
  await caption(text);
  resume();
}
async function scrollTo(target) {
  await within(page.evaluate((target) => {
    const author = [...document.querySelectorAll('a.author')].filter((a) => a.textContent.trim() === 'calm-merge-gateway').at(-1);
    const top = target === 'gateway' && author ? author.closest('.timeline-comment').getBoundingClientRect().top + window.scrollY - 90 : document.body.scrollHeight;
    window.scrollTo({ top, behavior: 'smooth' });
  }, target), 'scroll');
  await sleep(1800);
}
async function hub(version, node, text, then) {
  hold();
  await go(page, `${HUB_UI}/#/${NS}/architectures/${hubState().architectureId}/${version}?present=1&node=${node}`);
  await sleep(3500);
  if (then) { await then(); await sleep(1200); }
  await caption(text);
  resume();
}

// A decision: wait off camera for the check and for GitHub's page, then show the gateway's comment.
async function decision(n, want, text) {
  hold();
  await waitCheck(n, want);
  await fresh(n);
  await openPR(n, text);
  await scrollTo('gateway');
  await still(`pr-${n}-${want}`);
}
// The same decision in CALM Hub, once the gateway has written its decorators there.
async function inHub(n, nth, version, node, text, { evaluations = false } = {}) {
  hold();
  const sha = (await checkOf(n)).pr.head.sha;
  for (let i = 0; i < 60 && (await hubDecisions(sha)) < nth; i++) await sleep(1500);
  await hub(version, node, text, evaluations ? () => within(page.getByRole('button', { name: 'Expand metadata panel' }).click(), 'expand') : undefined);
  await still(`hub-${node}`);
  await sleep(evaluations ? 9000 : 8000);
}
async function mergeOnCamera(n, text) {
  hold();
  await merge(n);
  await fresh(n, { merged: true });
  await openPR(n, text);
  await scrollTo('end');
  await sleep(3000);
}
// The details pane's JSON is a Monaco editor: scroll it so a line is near the top.
async function reveal(text) {
  await within(page.evaluate((text) => {
    const editor = window.monaco?.editor.getEditors?.().at(-1);
    const match = editor?.getModel().findMatches(text, false, false, true, null, false)[0];
    if (match) editor.revealLineNearTop(match.range.startLineNumber, 0);
  }, text), 'reveal');
  await sleep(1200);
}
async function widenDetails(by) {
  const h = await page.getByRole('separator', { name: 'Resize details panel' }).boundingBox();
  const x = h.x + h.width / 2, y = h.y + h.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 25; i++) { await page.mouse.move(x - (by * i) / 25, y); await sleep(25); }
  await page.mouse.up();
}

let failed = false;
try {
  await card('Architecture-driven SDLC controls', 'A live run: an AI coding agent proposes changes on GitHub. A merge gateway checks each one against the controls on the CALM architecture, using ergo, and records every decision back on the architecture in CALM Hub.', 'Demo', 7000);

  log('1. the architecture');
  await card('1. The architecture', 'The trade capture system in CALM Hub. The Client Ledger carries a control: any change to a service that connects to it needs a human approval.', 'Moment 1');
  await hub('1.0.0', 'client-ledger', 'The control lives on the Client Ledger node in the architecture');
  await still('hub-architecture');
  await sleep(6000);
  await caption('Pull out the details pane and open the node as CALM JSON');
  await sleep(1500);
  await widenDetails(400);
  await sleep(800);
  await within(page.getByRole('tab', { name: 'JSON' }).nth(1).click(), 'JSON tab'); // the details pane's, not the page's
  await sleep(1500);
  await reveal('"controls"');
  await caption('The control is part of the architecture: CALM JSON, versioned with it');
  await still('json-control');
  await sleep(6000);
  await reveal('"ergo"');
  await caption('It carries its own rule for ergo: which connections are in scope');
  await still('json-ergo');
  await sleep(7000);
  await reveal('"checks"');
  await caption('…and what must be true: a person approved, who is not the author or the reviewer');
  await still('json-checks');
  await sleep(8000);
  hold();
  await page.getByRole('separator', { name: 'Resize details panel' }).dblclick(); // the width is remembered: reset it
  await sleep(300);
  resume();

  log('2. a harmless change');
  await card('2. A harmless change', 'The agent adds an endpoint to the Trade API, which does not touch the ledger.', 'Moment 2');
  hold();
  const harmless = propose('demo/changes/account-summary.json');
  await decision(harmless, 'success', 'The agent opened it, the review bot reviewed it: green, every control is met');
  await sleep(7000);
  await inHub(harmless, 1, '1.0.0', 'trade-api', 'CALM Hub: the decision is recorded on the Trade API, every control met');
  await mergeOnCamera(harmless, 'Merged, with no person involved');

  log('3. a change near the ledger');
  await card('3. A change near the ledger', 'The agent adds an endpoint to the Position Service, which writes to the Client Ledger.', 'Moment 3');
  hold();
  const ledger = propose('demo/changes/position-total.json');
  await decision(ledger, 'failure', 'Red: the Position Service connects to the Client Ledger, so a person must approve');
  await sleep(8000);
  await inHub(ledger, 1, '1.0.0', 'position-service', 'CALM Hub: blocked, on the Position Service and its connection to the ledger');

  log('4. a person approves');
  await card('4. A person approves', 'An approver named by the control approves the pull request on GitHub.', 'Moment 4', 4000);
  hold();
  await approve(ledger);
  await decision(ledger, 'success', 'Approved by a person: the control is met, the check goes green');
  await sleep(6000);
  await inHub(ledger, 2, '1.0.0', 'position-service', 'CALM Hub: approved, and who approved it, on the architecture');
  await mergeOnCamera(ledger, 'Merged, with the approval on record');

  log('5. the shortcut');
  await card('5. The shortcut', 'The agent makes the Trade API read the ledger file directly: a connection that is not in the architecture.', 'Moment 5');
  hold();
  const shortcut = propose('demo/changes/ledger-shortcut.json');
  await decision(shortcut, 'failure', 'Red: that connection is not in the architecture, so it cannot merge');
  await sleep(8000);
  await inHub(shortcut, 1, '1.0.0', 'trade-api', 'CALM Hub: blocked on the Trade API, a connection the architecture does not have');

  log('6. the architect changes the architecture');
  await card('6. The architect changes the architecture', 'The shortcut is closed. The architect proposes the connection where it belongs: on the architecture, Trade API to Client Ledger.', 'Moment 6', 6000);
  hold();
  await api('owner', 'PATCH', `/repos/${REPO}/pulls/${shortcut}`, { state: 'closed' });
  const architect = propose('demo/changes/architect-ledger-connection.json', '--as', 'owner');
  await decision(architect, 'failure', 'A change to the architecture itself: red until a person approves');
  await sleep(7000);
  // A decision about the whole system has no node to draw on: it is in the evaluations.
  await inHub(architect, 1, '1.0.0', 'trade-capture', 'CALM Hub: the decision on the system, in the evaluations', { evaluations: true });
  hold();
  await approve(architect);
  await decision(architect, 'success', 'A person approved: the architecture gets the Trade API to Client Ledger connection');
  await sleep(6000);
  const versions = Object.keys(hubState().versions).length;
  await mergeOnCamera(architect, 'Merged: the architecture on main now has the new connection');
  hold();
  for (let i = 0; i < 60 && Object.keys(hubState().versions).length <= versions; i++) await sleep(2000);
  const latest = Object.values(hubState().versions).sort().at(-1);
  await hub(latest, 'trade-api', `Version ${latest} in CALM Hub: the Trade API now connects to the Client Ledger`);
  await still('hub-new-version');
  await sleep(8000);

  log('7. the same harmless change, again');
  await card('7. The same harmless change, again', 'The agent adds another endpoint to the Trade API, the same kind of change as moment 2.', 'Moment 7');
  hold();
  const climax = propose('demo/changes/trade-count.json');
  await decision(climax, 'failure', 'Now red: the Trade API connects to the ledger, so a person must approve');
  await sleep(8000);
  await inHub(climax, 1, latest, 'trade-api', `CALM Hub, version ${latest}: blocked on the Trade API and its new connection to the ledger`);
  await card('Nobody touched the pipeline', 'The architect changed the architecture. The controls followed.', null, 7000);
} catch (e) {
  failed = true;
  log('stopped:', e.stack);
} finally {
  const end = now();
  await within(cdp.send('Page.stopScreencast'), 'stopping the screencast').catch(() => {});
  await within(browser.close(), 'closing the browser', 10000).catch(() => {});
  if (failed || !frames.length) process.exit(1);
  // Each frame stays on screen until the next one, less any time spent in a wait.
  const held = (from, to) => holds.reduce((sum, [a, b = end]) => sum + Math.max(0, Math.min(to, b) - Math.max(from, a)), 0);
  let list = 'ffconcat version 1.0\n';
  let last;
  let total = 0;
  frames.forEach(({ at, file }, i) => {
    const until = frames[i + 1]?.at ?? end;
    const shown = until - at - held(at, until);
    if (shown > 0.0005) { list += `file '${file}'\nduration ${shown.toFixed(4)}\n`; last = file; total += shown; }
  });
  list += `file '${last}'\n`; // the concat format needs the last file twice; -t below stops it adding time
  const listFile = join(OUT, 'frames.txt');
  writeFileSync(listFile, list);
  const mp4 = join(OUT, 'osffny-demo.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', `fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=white,format=yuv420p`,
    '-t', total.toFixed(3), '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-movflags', '+faststart', mp4]);
  rmSync(FRAMES, { recursive: true, force: true });
  rmSync(listFile);
  log(`recorded: ${mp4}`);
}
