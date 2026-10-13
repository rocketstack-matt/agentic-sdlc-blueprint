// gh-apps.mjs: creates the two GitHub Apps the GitHub demo needs, with GitHub's app manifest flow, and keeps their
// ids and private keys in gateway/.github-demo.json and gateway/keys/. Open the page it prints, press each button,
// confirm on GitHub, then install each app on the demo repository from the link the page shows.
//   the agent    opens the demo's pull requests (it writes the code)
//   the reviewer the review bot: approves every new commit, from the laptop (no GitHub Actions in the way)
//   the gateway  reports the "Architecture controls" check and comments on every decision
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, loadConfig, saveConfig } from './github.mjs';
import { ROOT, run } from './lib.mjs';

const PORT = Number(process.env.PORT ?? 3456);
const home = `https://github.com/${REPO}`;
const apps = {
  agent: {
    name: 'calm-trade-agent',
    description: 'The coding agent in the OSFF New York demo: opens pull requests on the trade capture system.',
    default_permissions: { contents: 'write', pull_requests: 'write', metadata: 'read' },
  },
  reviewer: {
    name: 'calm-review-bot',
    description: 'The review bot in the OSFF New York demo: an automated reviewer the architecture names as approved.',
    default_permissions: { contents: 'read', pull_requests: 'write', metadata: 'read' },
  },
  gateway: {
    name: 'calm-merge-gateway',
    description: 'The merge gateway in the OSFF New York demo: checks every pull request against the controls in the CALM architecture.',
    default_permissions: { contents: 'write', pull_requests: 'write', checks: 'write', statuses: 'write', metadata: 'read' },
  },
};
const manifest = (role) => JSON.stringify({
  ...apps[role], url: home, public: false,
  redirect_url: `http://localhost:${PORT}/created`,
  hook_attributes: { url: 'https://example.invalid/unused', active: false },
});
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function page() {
  const cfg = loadConfig();
  const rows = Object.keys(apps).map((role) => {
    const made = cfg.apps?.[role];
    return made
      ? `<p><b>${role}</b>: created as <code>${esc(made.slug)}</code>. <a href="https://github.com/apps/${esc(made.slug)}/installations/new" target="_blank">Install it on ${REPO}</a> (choose "Only select repositories").</p>`
      : `<form method="post" action="https://github.com/settings/apps/new?state=${role}"><input type="hidden" name="manifest" value="${esc(manifest(role))}"><p><b>${role}</b>: ${esc(apps[role].description)} <button>Create ${esc(apps[role].name)}</button></p></form>`;
  }).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>GitHub Apps for the demo</title><body style="font:18px system-ui;max-width:52em;margin:3em auto">
<h1>GitHub Apps for ${REPO}</h1>${rows}<p>When each is installed, stop the terminal with Ctrl-C.</p></body>`;
}

run(async () => {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === '/created') {
      const role = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      const r = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, { method: 'POST', headers: { accept: 'application/vnd.github+json' } });
      if (!r.ok || !apps[role]) { res.writeHead(500).end(`could not create the ${role} app: ${r.status} ${await r.text()}`); return; }
      const app = await r.json();
      const dir = join(ROOT, 'keys');
      mkdirSync(dir, { recursive: true });
      const key = join(dir, `github-${app.slug}.pem`);
      writeFileSync(key, app.pem, { mode: 0o600 });
      const cfg = loadConfig();
      cfg.apps = { ...cfg.apps, [role]: { id: app.id, slug: app.slug, key: `keys/github-${app.slug}.pem` } };
      saveConfig(cfg);
      console.log(`created ${role}: ${app.slug} (app id ${app.id})`);
      res.writeHead(302, { location: '/' }).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' }).end(page());
  });
  server.listen(PORT, () => console.log(`open http://localhost:${PORT}/ to create the demo's GitHub Apps (Ctrl-C when each is installed)`));
});
