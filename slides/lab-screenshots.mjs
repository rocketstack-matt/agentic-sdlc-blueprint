// Screenshots the two CALM Learning Lab lessons for the deck, one picture per workshop step, into slides/img/lab/:
// the whole lab and its diagram, the editor at the node and the control the talk explains, the whole lab with the
// terminal enlarged after the failing validate, the editor after each edit, the terminal after each command and the
// completion card. Needs a lab serving the lessons: the hosted lab once they have landed, or the dev server from a
// checkout of finos/architecture-as-code (`npm run calm-lab:run`, http://localhost:5173). Playwright comes from that
// checkout next to this repo. Run: node slides/lab-screenshots.mjs [lab url]
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(join(here, '..', '..', 'architecture-as-code', 'node_modules', 'playwright', 'index.mjs'));
const lab = process.argv[2] ?? 'https://lab.calm.finos.org';
const dir = join(here, 'img', 'lab');
mkdirSync(dir, { recursive: true });

const HOME = '/workspace';
const ARCHITECTURE = `${HOME}/architecture/trade-capture.architecture.json`;
const SPEC_002 = `${HOME}/specs/SPEC-002-position-reconciliation.md`;
const validate = (architecture) => `calm validate -p architecture/governed-service.pattern.json -a ${architecture} -u architecture/url-mapping.json -f pretty`;
const VALIDATE_MODEL = validate('architecture/trade-capture.architecture.json');
const DIFF = 'calm diff -a architecture/baseline.json -b architecture/trade-capture.architecture.json';
const connects = (id, source, destination, iface, description) => ({
  'unique-id': id, description, 'relationship-type': { connects: { source: { node: source }, destination: { node: destination, interfaces: [iface] } } },
});
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const browser = await chromium.launch();
const written = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => { try { localStorage.setItem('theme', 'light'); } catch { /* storage may be blocked */ } });
  const shot = async (name, clip) => { await page.screenshot({ path: join(dir, `${name}.png`), ...(clip ? { clip } : {}) }); written.push(name); };
  const box = async (locator, what) => { const b = await locator.boundingBox(); if (!b) throw new Error(`cannot find ${what}`); return b; };
  // The lab's terminal text is sized for a laptop; a slide needs it larger, so each page gets a bigger terminal font.
  const open = async (lesson) => {
    await page.goto(`${lab}/?lesson=${lesson}`, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: '[class*="termScroll"], [class*="termScroll"] * { font-size: 17px !important; line-height: 1.5 !important; }' });
    await page.waitForTimeout(2500);
  };
  // The editor tab is named after the open file, so it is addressed as the first tab of its pane.
  const tab = async (name) => {
    const target = name === 'Editor' ? page.locator('[role="tablist"][aria-label="Editor panes"] [role="tab"]').first() : page.getByRole('tab', { name: new RegExp(`^${name}`) });
    await target.click();
    await page.waitForTimeout(800);
  };
  const input = () => page.locator('input[aria-label="Terminal input"]');
  const run = async (command, wait = 4000) => { await input().click(); await input().fill(command); await input().press('Enter'); await page.waitForTimeout(wait); };
  // The terminal pane's left 960 px from its tab row to its prompt: what the learner just saw, legible at slide width.
  // With `from`, the pane is first scrolled so that line sits at the top and the crop stops at the pane's bottom,
  // for output longer than the pane (calm diff) where a later part is the part that matters.
  const terminalShot = async (name, from) => {
    await tab('Terminal');
    const t = await box(page.getByRole('tab', { name: /^Terminal/ }), 'the Terminal tab');
    let bottom;
    if (from) {
      const line = page.getByText(from, { exact: false }).last();
      await line.evaluate((el) => { const pane = el.closest('[class*="termScroll"]'); pane.scrollTop = el.offsetTop - pane.offsetTop - 6; });
      await page.waitForTimeout(400);
      const pane = await box(page.locator('[class*="termScroll"]').first(), 'the terminal scroll pane');
      bottom = pane.y + pane.height;
    } else {
      const p = await box(input(), 'the terminal prompt');
      bottom = p.y + p.height + 16;
    }
    await shot(name, { x: Math.max(0, t.x - 20), y: t.y - 2, width: 960, height: bottom - t.y + 2 });
  };
  const diagramShot = async (name) => { await tab('Diagram'); await page.waitForTimeout(1500); await shot(name, await box(page.locator('[aria-label^="Live diagram"]'), 'the diagram')); };
  // The guide's completion box alone, small enough to sit beside a terminal on a slide.
  const completionShot = async (name) => shot(name, await box(page.getByText('Lesson complete').locator('xpath=..'), 'the completion box'));
  const editor = () => page.locator('textarea[aria-label^="Edit "]');
  const openFile = async (path) => {
    await tab('Editor');
    const select = page.locator('select[aria-label="File"]');
    const values = await select.locator('option').evaluateAll((opts) => opts.map((o) => o.value));
    const value = values.find((v) => v === path || v.endsWith(path.replace(HOME, '')));
    if (!value) throw new Error(`no file option for ${path} among ${values.join(', ')}`);
    await select.selectOption(value);
    await page.waitForTimeout(600);
  };
  const save = async () => { await page.getByRole('button', { name: /^Save/ }).click(); await page.waitForTimeout(1500); };
  const edit = async (transform) => { await tab('Editor'); await editor().fill(transform(await editor().inputValue())); await save(); };
  // Scroll the editor so the line holding `needle` sits `above` lines from the top.
  const scrollEditorTo = async (needle, above) => {
    await tab('Editor');
    await editor().evaluate((el, [n, a]) => {
      const i = el.value.split('\n').findIndex((l) => l.includes(n));
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
      el.scrollTop = Math.max(0, (i - a) * lh);
      el.dispatchEvent(new Event('scroll'));
    }, [needle, above]);
    await page.waitForTimeout(400);
  };
  // The editor pane scrolled to `needle` with `above` lines of context, cropped with its header and gutter.
  const editorShot = async (name, needle, above = 7) => {
    await scrollEditorTo(needle, above);
    const b = await box(editor(), 'the editor');
    await shot(name, { x: Math.max(0, b.x - 72), y: Math.max(0, b.y - 58), width: Math.min(b.width + 84, 1100), height: Math.min(b.height + 62, 600) });
  };
  // The lab's terminal is a quarter of the window; dragging the split handle up gives it the room a crop needs.
  const enlargeTerminal = async (by = 330) => {
    const h = await box(page.locator('[aria-label="Resize editor and terminal"]'), 'the split handle');
    const x = h.x + h.width / 2;
    const y = h.y + h.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - by, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(600);
  };

  // Lesson 1: a governed model, controls as data. The open file carries one wrong control id.
  await open('agentic-sdlc-model');
  await tab('Diagram');
  await page.waitForTimeout(1500);
  await shot('model-full');
  await diagramShot('model-diagram');
  await editorShot('model-node', '"unique-id": "trade-api"', 1);
  await editorShot('model-control', '"sdlc-prev-017-service-dependency"', 1);
  await run(VALIDATE_MODEL);
  await enlargeTerminal();
  await scrollEditorTo('"SDLC-PREV-999"', 6);
  await shot('model-broken-full');
  await enlargeTerminal(-330);   // the editor gets its room back for the repair
  await edit((text) => { const doc = JSON.parse(text); doc.controls['sdlc-prev-012-deployment-gating'].requirements[0].config['control-id'] = 'SDLC-PREV-012'; return json(doc); });
  await editorShot('model-fix', '"sdlc-prev-012-deployment-gating"', 1);
  await run(VALIDATE_MODEL); await terminalShot('model-validate-fix');
  await run(validate('architecture/broken/missing-parameter.json')); await terminalShot('model-missing-parameter');
  await run(validate('architecture/broken/missing-source-path.json')); await terminalShot('model-missing-source-path');
  await completionShot('model-complete');

  // Lesson 2: a change to the model, what validation cannot know.
  await open('agentic-sdlc-change');
  await enlargeTerminal();
  await openFile(ARCHITECTURE);
  await edit((text) => {
    const doc = JSON.parse(text);
    doc.relationships.push(connects('trade-api-to-position-store', 'trade-api', 'position-store', 'position-store-file', 'The shortcut: trade-api reads the position store directly.'));
    return json(doc);
  });
  await diagramShot('change-shortcut-diagram');
  await run(VALIDATE_MODEL); await terminalShot('change-valid');
  await run(DIFF); await terminalShot('change-diff', '"edgesAdded"');
  await openFile(SPEC_002);
  await edit((text) => text.replace('model-change: []', 'model-change: [trade-api, position-service-to-trade-api]'));
  await editorShot('change-spec', 'model-change', 7);
  await openFile(ARCHITECTURE);
  await edit((text) => {
    const doc = JSON.parse(text);
    doc.relationships = doc.relationships.filter((r) => r['unique-id'] !== 'trade-api-to-position-store');
    const tradeApi = doc.nodes.find((n) => n['unique-id'] === 'trade-api');
    tradeApi.interfaces = [...(tradeApi.interfaces ?? []), { 'unique-id': 'trade-api-url', protocol: 'HTTP', 'env-binding': 'TRADE_API_URL' }];
    doc.relationships.push(connects('position-service-to-trade-api', 'position-service', 'trade-api', 'trade-api-url', "position-service reads an account's trades from trade-api to reconcile its positions."));
    return json(doc);
  });
  await diagramShot('change-declared-diagram');
  await run(VALIDATE_MODEL); await terminalShot('change-final-valid');
  await run(DIFF); await terminalShot('change-final-diff', '"edgesAdded"');
} finally {
  await browser.close();
}
console.log(`wrote ${written.length} pictures to slides/img/lab/: ${written.join(', ')}`);
