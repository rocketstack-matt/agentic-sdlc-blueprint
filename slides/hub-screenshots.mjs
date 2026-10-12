// Retakes the CALM Hub pictures in slides/img/hub/: the gateway demo run step by step against a running CALM Hub,
// with the Hub UI photographed at each moment the talk shows. Needs CALM Hub (CALM_HUB_URL, default
// http://localhost:8080) and the Hub UI (HUB_UI, default http://localhost:5173) from the architecture-as-code checkout
// next to this repo, and Playwright from the same checkout, imported by path because Node's ESM resolver ignores
// NODE_PATH. Resets the demo and the Hub architecture it owns; leaves gateway/sessions.json alone.
// Run: node slides/hub-screenshots.mjs
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(join(here, '..', '..', 'architecture-as-code', 'node_modules', 'playwright', 'index.mjs'));

const HUB = process.env.CALM_HUB_URL ?? 'http://localhost:8080';
const UI = process.env.HUB_UI ?? 'http://localhost:5173';
const NS = 'finos.agentic-sdlc';
const gateway = join(here, '..', 'gateway');
const out = join(here, 'img', 'hub');
mkdirSync(out, { recursive: true });

// A DENY exits non-zero; that is a result, not a failure.
const run = (cmd) => {
  try { return execSync(cmd, { cwd: gateway, env: { ...process.env, CALM_HUB_URL: HUB }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { return `${e.stdout ?? ''}${e.stderr ?? ''}`; }
};
const step = (cmd) => { process.stdout.write(`$ ${cmd}\n${run(cmd)}`); };
const code = (change) => run(`node -e "import('./gateway/lib.mjs').then((m) => { const c = m.loadChange('${change}'); console.log(m.bindingCode({ commit: c.commit, diff_sha256: m.sha256(m.diffOf(c.commit)) })); })"`).trim();
const R = '.demo/reviews';
const change = (n, file, { approve = false } = {}) => {
  step(`node gateway/propose.mjs demo/changes/${file}.json`);
  step(`node gateway/review.mjs CHG-${n} --as review-bot`);
  step(`node gateway/merge.mjs CHG-${n} --review ${R}/CHG-${n}.review-bot.json`);
  if (approve) {
    step(`APPROVE_CODE=${code(`CHG-${n}`)} node gateway/approve.mjs CHG-${n} --as alice --lines 12`);
    step(`node gateway/merge.mjs CHG-${n} --review ${R}/CHG-${n}.review-bot.json --approval .demo/token.json`);
  }
};

// The default layout keeps every edge clear of the boxes, including the one the architect adds in 1.1.0.
// Children are placed relative to the system that contains them.
const layout = { nodes: {
  trader: { x: 180, y: 100 }, 'trade-capture': { x: 100, y: 250 },
  'trade-api': { x: 80, y: 230 }, 'position-service': { x: 530, y: 230 },
  'client-ledger': { x: 980, y: 70 }, 'trade-store': { x: 530, y: 390 },
} };
const putLayout = async () => {
  const { architectureId } = JSON.parse(readFileSync(join(gateway, '.hub-state.json'), 'utf8'));
  const res = await fetch(`${HUB}/api/calm/namespaces/${NS}/architectures/${architectureId}/layout`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(layout) });
  if (!res.ok) throw new Error(`layout: ${res.status} ${await res.text()}`);
  return architectureId;
};

const browser = await chromium.launch();
let id;
// Where each box sits in each picture, as percentages of the picture, so the deck can pin labels to boxes.
const positions = {};
// One picture of the diagram at a version, cropped to the diagram at 2x, without the canvas controls.
// hover names a box to hover over, so its evaluation card is in the picture; panel crops to the evaluations panel.
async function shoot(name, version, { hover, panel = false } = {}) {
  const page = await browser.newPage({ viewport: { width: panel ? 1100 : 1500, height: hover ? 1200 : 960 }, deviceScaleFactor: 2 });
  await page.goto(`${UI}/#/${NS}/architectures/${id}/${version}`);
  await page.waitForSelector('[data-testid="custom-node"]', { timeout: 30000 });
  await page.addStyleTag({ content: '.react-flow__minimap, .react-flow__controls, .react-flow__attribution, .react-flow__panel.top { display: none !important; }' });
  await page.getByLabel('Collapse sidebar').first().click().catch(() => {});
  if (panel) await page.getByLabel('Expand metadata panel').click();
  await page.waitForTimeout(2500); // the evaluations poll and the fit-to-view settle
  if (hover) {
    await page.locator('[data-testid="custom-node"]', { hasText: hover }).first().hover();
    await page.waitForTimeout(700);
  }
  // The fit-to-view can still be moving the canvas: wait until the boxes stop, then measure and shoot from one reading.
  const read = () => page.$$eval('.react-flow__node', (els) => els.map((e) => [e.dataset.id, e.getBoundingClientRect().toJSON()]));
  let nodes = await read();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(300);
    const again = await read();
    if (JSON.stringify(again) === JSON.stringify(nodes)) break;
    nodes = again;
  }
  const flow = await page.locator('.react-flow').first().boundingBox();
  let box;
  if (panel) {
    // Drag the panel's handle up so every evaluation row shows, then crop to the panel.
    const btn = await page.getByLabel('Collapse metadata panel').boundingBox();
    const x = flow.x + flow.width / 2;
    await page.mouse.move(x, btn.y - 12);
    await page.mouse.down();
    await page.mouse.move(x, btn.y - 360, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    const top = (await page.getByLabel('Collapse metadata panel').boundingBox()).y - 16;
    const bottom = (await page.getByText('Browse versions').first().boundingBox()).y - 24;
    // The left of the panel holds the findings; the timestamps on the far right stay out, so the text reads larger.
    box = { x: flow.x, y: top, width: Math.min(flow.width, 720), height: bottom - top };
  } else {
    // Crop to the boxes, and the hover card when there is one, with a margin.
    const rects = nodes.map(([, r]) => r);
    if (hover) {
      // The card down to the end of its evaluations; the description under them stays out of the picture.
      rects.push(await page.getByText('Latest control evaluations').first().evaluate((el) => {
        const list = el.parentElement.getBoundingClientRect();
        while (el.parentElement && el.parentElement.getBoundingClientRect().width < 600) el = el.parentElement;
        const card = el.getBoundingClientRect();
        return { left: card.left, top: card.top, right: card.right, bottom: list.bottom - 40 };
      }));
    }
    const pad = 40;
    const x0 = Math.max(flow.x, Math.min(...rects.map((r) => r.left)) - pad);
    const y0 = Math.max(flow.y, Math.min(...rects.map((r) => r.top)) - pad);
    const x1 = Math.min(flow.x + flow.width, Math.max(...rects.map((r) => r.right)) + pad);
    const y1 = Math.min(flow.y + flow.height, Math.max(...rects.map((r) => r.bottom)) + pad);
    box = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }
  await page.screenshot({ path: join(out, `${name}.png`), clip: box });
  const pct = (v) => Math.round(v * 1000) / 10;
  positions[name] = Object.fromEntries(nodes.map(([node, r]) => [node, { x: pct((r.left - box.x) / box.width), y: pct((r.top - box.y) / box.height), w: pct(r.width / box.width), h: pct(r.height / box.height) }]));
  await page.close();
  console.log(`hub: ${name}.png (${version}${hover ? `, hover ${hover}` : ''}${panel ? ', panel' : ''})`);
}

try {
  step('node gateway/reset.mjs');
  id = await putLayout();
  await shoot('clean', '1.0.0');

  step('node gateway/propose.mjs demo/changes/account-summary.json');
  step('node gateway/review.mjs CHG-0421 --as review-bot');
  step(`node gateway/merge.mjs CHG-0421 --review ${R}/CHG-0421.review-bot.json`);
  await shoot('routine', '1.0.0');

  change('0422', 'position-total');
  await shoot('ledger', '1.0.0', { hover: 'Position Service' });
  step(`APPROVE_CODE=${code('CHG-0422')} node gateway/approve.mjs CHG-0422 --as alice --lines 12`);
  step(`node gateway/merge.mjs CHG-0422 --review ${R}/CHG-0422.review-bot.json --approval .demo/token.json`);

  change('0424', 'ledger-shortcut');
  await shoot('shortcut', '1.0.0', { hover: 'Trade API' });

  change('0425', 'architect-ledger-connection', { approve: true });

  change('0426', 'trade-count');
  await shoot('climax', '1.1.0');
  await shoot('evidence', '1.1.0', { panel: true });
  writeFileSync(join(out, 'positions.js'), `// Generated by slides/hub-screenshots.mjs. Do not edit.\nwindow.HUB_POSITIONS = ${JSON.stringify(positions, null, 1)};\n`);
} finally {
  await browser.close();
}
