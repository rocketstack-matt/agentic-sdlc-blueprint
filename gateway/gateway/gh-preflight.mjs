// gh-preflight.mjs: everything the live demo needs, checked before going on stage. Ends with the links to open.
// Run after gh-reset, with the gateway watching. Exit code 1 if anything is not ready.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARCHITECTURE, BLUEPRINT, run } from './lib.mjs';
import { CHECK, CLONE, GH, REPO, appSlug, approvers, as, tokenOf } from './github.mjs';

const HUB = process.env.CALM_HUB_URL?.replace(/\/$/, '');
const HUB_UI = process.env.HUB_UI ?? 'http://localhost:5173';
const NS = process.env.CALM_HUB_NAMESPACE ?? 'finos.agentic-sdlc';
const HUB_BRANCH = 'feat/hub-ui-presentation-mode';
let failed = 0;
const check = async (what, fn) => {
  try {
    const note = await fn();
    console.log(`✓ ${what}${note ? `: ${note}` : ''}`);
  } catch (e) {
    failed += 1;
    console.log(`✗ ${what}: ${e.message}`);
  }
};
const must = (ok, why) => { if (!ok) throw new Error(why); };

run(async () => {
  await check('CALM Hub', async () => {
    must(HUB, 'set CALM_HUB_URL (for example http://localhost:8080)');
    const res = await fetch(`${HUB}/api/calm/namespaces`, { signal: AbortSignal.timeout(3000) });
    must(res.ok, `${HUB} answered ${res.status}`);
    return HUB;
  });
  await check('CALM Hub UI', async () => {
    const res = await fetch(HUB_UI, { signal: AbortSignal.timeout(3000) });
    must(res.ok, `${HUB_UI} answered ${res.status}`);
    const checkout = join(BLUEPRINT, '..', 'architecture-as-code');
    const branch = execFileSync('git', ['-C', checkout, 'branch', '--show-current'], { encoding: 'utf8' }).trim();
    must(branch === HUB_BRANCH, `the UI's checkout is on ${branch}, not ${HUB_BRANCH} (presentation mode and the overlay)`);
    return `${HUB_UI}, from ${HUB_BRANCH}`;
  });
  for (const role of ['agent', 'reviewer', 'gateway']) {
    await check(`GitHub App: ${role}`, async () => {
      must(appSlug(role), `not created: run node gateway/gh-apps.mjs${role === 'reviewer' ? ' (or the review bot falls back to GitHub Actions, which is slower)' : ''}`);
      const repo = await (await as(role)).get(`/repos/${REPO}`);
      return `${appSlug(role)}, installed on ${repo.full_name}`;
    });
  }
  await check('the owner', async () => (await (await as('owner')).get('/user')).login);
  await check('the approvers', async () => {
    const collaborators = (await (await as('owner')).get(`/repos/${REPO}/collaborators`)).map((c) => c.login);
    const missing = approvers().filter((a) => !collaborators.includes(a));
    must(!missing.length, `not collaborators yet: ${missing.join(', ')}`);
    const fallback = approvers().filter((a) => { try { tokenOf(a); return true; } catch { return false; } });
    return `${approvers().join(', ')}; can approve from this laptop if needed: ${fallback.join(', ') || 'nobody'}`;
  });
  await check('the repository is at the start', async () => {
    const owner = await as('owner');
    const open = await owner.get(`/repos/${REPO}/pulls?state=open`);
    must(!open.length, `${open.length} pull request(s) open: run node gateway/gh-reset.mjs`);
    const protection = await owner.get(`/repos/${REPO}/branches/main/protection`);
    must(protection.required_status_checks?.checks?.some((c) => c.context === CHECK), `main does not require "${CHECK}"`);
    const arch = JSON.parse(Buffer.from((await owner.get(`/repos/${REPO}/contents/${ARCHITECTURE}`)).content, 'base64').toString('utf8'));
    must(!arch.relationships.some((r) => r['unique-id'] === 'trade-api-to-client-ledger'), 'main already has the architect\'s change: run node gateway/gh-reset.mjs');
    must(existsSync(CLONE), 'the gateway has no clone: run node gateway/gh-reset.mjs');
    must(!existsSync(join(GH, 'demo-state.json')), 'gh-demo has already been run since the reset: run node gateway/gh-reset.mjs');
    return 'no open pull requests, main protected, architecture 1.0';
  });
  await check('the gateway is watching', async () => {
    const file = join(GH, 'gateway-run.json');
    must(existsSync(file), 'start it after the reset: CALM_HUB_URL=… node gateway/gh-gateway.mjs --watch');
    const { pid, approver } = JSON.parse(readFileSync(file, 'utf8'));
    try { process.kill(pid, 0); } catch { throw new Error(`it has stopped (pid ${pid}): start it again`); }
    must(approver === 'aaronsearle', `its comments name @${approver}; for the talk start it without DEMO_APPROVER`);
    return `pid ${pid}, naming @${approver}`;
  });

  if (existsSync(join(GH, 'hub-state.json'))) {
    const { architectureId } = JSON.parse(readFileSync(join(GH, 'hub-state.json'), 'utf8'));
    console.log(`\nopen:\n  https://github.com/${REPO}/pulls\n  ${HUB_UI}/#/${NS}/architectures/${architectureId}/1.0.0?present=1\nthen: node gateway/gh-demo.mjs`);
  }
  if (failed) console.log(`\n${failed} thing(s) not ready`);
  process.exitCode = failed ? 1 : 0;
});
