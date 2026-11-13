// gh-reset.mjs: puts the GitHub demo back to its start. The demo repository's main becomes the trade capture system
// from this blueprint's last commit (the architecture, the services, their tests, the specs it needs, and a review
// bot); open pull requests are closed and their branches deleted; main is protected so it needs the gateway's check;
// the gateway's clone is made afresh; and with CALM_HUB_URL set, the architecture is published to CALM Hub again.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHECK, CLONE, GH, REPO, as, inClone, loadConfig, remote } from './github.mjs';
import { hubEnabled, publishArchitecture, resetHub } from './hub.mjs';
import { ARCHITECTURE, BLUEPRINT, label, run } from './lib.mjs';

// The engine is kept too: the gateway evaluates each pull request with the engine on main (baseEngine), and denies
// when main has none.
const KEEP = ['architecture', 'services', 'test', 'specs/README.md', 'specs/SPEC-001-account-summary.md', 'specs/SPEC-003-ledger-snapshots.md', 'tsconfig.json', 'gates/policy/controls.wasm'];

const README = `# Trade capture, governed by its architecture

The live demo from *Governing the Agentic SDLC* (Open Source in Finance Forum, New York, 4 November 2026; Matthew
Bain and Aaron Searle). Agents write and review the code here. Which of their changes need a person is decided by
the architecture, not by a reviewer's memory.

## The system, and one rule on it

A small trade capture system: a **Trade API**, a **Position Service**, a **Trade Store**, and the **Client Ledger**,
the book of record. Its architecture is in [\`architecture/\`](architecture/), written in
[FINOS CALM](https://calm.finos.org). The SDLC controls from the FINOS SDLC Common Controls Catalog are written on
that architecture, and one of them sits on the Client Ledger:

> Any change to a service that connects to the Client Ledger needs a human approver.

Today only the Position Service connects to the Client Ledger.

## Who does what

- **\`calm-trade-agent\`**, a coding agent, writes the changes and opens the pull requests.
- **\`calm-review-bot\`**, a review agent, reviews every commit.
- **\`calm-merge-gateway\`** posts the **Architecture controls** check. It reads the architecture on \`main\`, decides
  each pull request against the controls written on it, explains the decision in a comment, and records it on the
  architecture in CALM Hub. \`main\` takes a pull request only when this check has passed.
- **@aaronsearle** approves when a person is needed.
- **@rocketstack-matt** is the architect, who changes the architecture.

## The journey, one pull request at a time

Open the [pull requests](https://github.com/${REPO}/pulls?q=is%3Apr) and read them in the order they were opened. On each one, look at
the **Architecture controls** check and the gateway's comment beneath it.

1. **Account summary endpoint on trade-api.** A harmless change. The review agent approves it, the check goes green
   on its own, and it merges. No person was needed: the Trade API does not connect to the Client Ledger.
2. **Position total endpoint on position-service.** Just as small, but the Position Service writes to the Client
   Ledger. The check goes red and names the person who must approve. Aaron approves on GitHub, the check goes green,
   and it merges. The rule was not in a CODEOWNERS file or anyone's head. The gateway found it on the architecture.
3. **Read positions straight from the ledger file in trade-api.** A shortcut: the Trade API reaching into the ledger
   directly. The check goes red because that connection is not in the architecture, so it does not exist. The pull
   request stays open.
4. **Model: trade-api writes end-of-day snapshots to the Client Ledger.** The architect changes the architecture
   itself: the Trade API now connects to the Client Ledger, through a connection that is designed and approved. A
   change to the architecture needs a person, so Aaron approves it and it merges. The architecture is now version
   1.1.0.

   Now go back to the shortcut. Nobody pushed to it, but the gateway decided it again against the new architecture.
   The connection is no longer refused, because it is in the architecture now. Instead the check asks for a person,
   because the Trade API now connects to the Client Ledger. Aaron approves and it merges. Nobody changed the
   pipeline, the check or its configuration. The architecture changed, and the control followed it.

Every decision, allowed or not, is recorded on the architecture as a CALM decorator: which control, on which part of
the system, for which commit, and who reviewed or approved. During the talk CALM Hub ran on the presenter's laptop,
and the slides show it.

## Run it yourself

This repository is put back to its start before every run, from
[agentic-sdlc-blueprint](https://github.com/rocketstack-matt/agentic-sdlc-blueprint). Everything behind the demo is
there: the architecture and its controls, the merge gateway, the specs, a version you can run on your laptop with
Node and git, and the slides. Fork that repository, not this one.
`;

const PACKAGE = {
  name: 'osffny-sdlc-calm', private: true, type: 'module', license: 'Apache-2.0',
  scripts: { test: 'tsx --test test/*.test.ts', typecheck: 'tsc --noEmit' },
  devDependencies: { '@types/node': '^22.0.0', tsx: '^4.19.0', typescript: '^5.6.0' },
};

// The review bot: an automated reviewer the architecture names as approved. It approves every new commit.
const REVIEW_BOT = `name: review-bot
on:
  pull_request:
    types: [opened, synchronize, reopened]
permissions:
  contents: read
  pull-requests: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Review the change
        env:
          GH_TOKEN: \${{ github.token }}
          PR: \${{ github.event.pull_request.number }}
          REPO: \${{ github.repository }}
          SHA: \${{ github.event.pull_request.head.sha }}
        run: |
          files=$(gh pr diff "$PR" -R "$REPO" --name-only | sed 's/^/- /')
          body=$(printf 'Reviewed %s: the code does what the title says.\\n\\nFiles reviewed:\\n%s\\n' "\${SHA:0:7}" "$files")
          gh api -X POST "repos/$REPO/pulls/$PR/reviews" -f commit_id="$SHA" -f event=APPROVE -f body="$body"
`;

run(async () => {
  const owner = await as('owner');
  const gatewayApp = loadConfig().apps?.gateway;

  // 1. main: the trade capture system, one commit.
  const dir = mkdtempSync(join(tmpdir(), 'osffny-'));
  execFileSync('sh', ['-c', `git -C "${BLUEPRINT}" archive HEAD ${KEEP.join(' ')} | tar -x -C "${dir}"`]);
  writeFileSync(join(dir, 'README.md'), README);
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(PACKAGE, null, 2)}\n`);
  writeFileSync(join(dir, '.gitignore'), 'node_modules\n');
  // With the review bot on the laptop, GitHub Actions does not review as well.
  if (!loadConfig().apps?.reviewer) {
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(dir, '.github', 'workflows', 'review-bot.yml'), REVIEW_BOT);
  }
  const g = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  g('init', '-q', '-b', 'main');
  g('add', '-A');
  g('-c', 'user.name=Matthew Bain', '-c', 'user.email=rocketstack-matt@users.noreply.github.com', 'commit', '-q', '-m', 'The trade capture system and its architecture\n\nSpec: SPEC-001');

  // 2. Unprotect, close what is open, push, protect.
  await owner.del(`/repos/${REPO}/branches/main/protection`).catch(() => {});
  for (const pr of await owner.get(`/repos/${REPO}/pulls?state=open&per_page=100`)) await owner.patch(`/repos/${REPO}/pulls/${pr.number}`, { state: 'closed' });
  g('push', '-q', '--force', remote(owner.token), 'main');
  for (const b of await owner.get(`/repos/${REPO}/branches?per_page=100`)) if (b.name !== 'main') await owner.del(`/repos/${REPO}/git/refs/heads/${b.name}`);
  await owner.put(`/repos/${REPO}/actions/permissions/workflow`, { default_workflow_permissions: 'read', can_approve_pull_request_reviews: true });
  await owner.put(`/repos/${REPO}/branches/main/protection`, {
    required_status_checks: { strict: false, checks: [{ context: CHECK, ...(gatewayApp ? { app_id: gatewayApp.id } : {}) }] },
    enforce_admins: true, required_pull_request_reviews: null, restrictions: null,
  });
  console.log(label('repo', `${REPO} main at ${g('rev-parse', '--short=7', 'HEAD')}, protected by "${CHECK}"`));

  rmSync(dir, { recursive: true, force: true });

  // 3. The Hub's old architecture goes (its state lives in the gateway's folder), then the clone is made afresh.
  await resetHub();
  rmSync(GH, { recursive: true, force: true });
  mkdirSync(GH, { recursive: true });
  execFileSync('git', ['clone', '-q', `https://github.com/${REPO}.git`, CLONE]);
  if (!hubEnabled()) { console.log(label('hub', 'off (set CALM_HUB_URL to publish the architecture and every decision)')); return; }
  const published = await publishArchitecture(`${inClone('show', `origin/main:${ARCHITECTURE}`)}\n`);
  console.log(label('hub', published?.error ? `failed: ${published.error}` : `Trade Capture (governed) ${published.version} -> ${published.target}`));
  if (!published?.error) await saveLayout(published.id);
});

// The default layout in CALM Hub keeps every line clear of the boxes, including the one the architect adds in 1.1.0.
// Boxes inside the system are placed relative to it.
// Under Trade API and Position Service there is room for CALM Hub's decision callouts.
const LAYOUT = { nodes: {
  trader: { x: 180, y: 120 }, 'trade-capture': { x: 100, y: 250 },
  'trade-api': { x: 80, y: 130 }, 'position-service': { x: 560, y: 200 },
  'client-ledger': { x: 1040, y: 30 }, 'trade-store': { x: 80, y: 540 },
} };
async function saveLayout(id) {
  const ns = process.env.CALM_HUB_NAMESPACE ?? 'finos.agentic-sdlc';
  const res = await fetch(`${process.env.CALM_HUB_URL.replace(/\/$/, '')}/api/calm/namespaces/${ns}/architectures/${id}/layout`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(LAYOUT) });
  console.log(label('', res.ok ? 'default layout saved' : `layout not saved: ${res.status}`));
}
