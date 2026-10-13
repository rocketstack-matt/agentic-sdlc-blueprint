// The GitHub side of the demo: its configuration (gateway/.github-demo.json, kept out of git), the two GitHub Apps'
// installation tokens, a small REST client, and the map from GitHub identities to the people and bots the model names.
import { execFileSync } from 'node:child_process';
import { createPrivateKey, sign } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

export const REPO = process.env.DEMO_REPO ?? 'rocketstack-matt/osffny-sdlc-calm';
export const CHECK = 'Architecture controls';
const CONFIG = join(ROOT, '.github-demo.json');

// Who is who. The model's controls name review-bot as the approved reviewer and alice as the person who may approve;
// on GitHub those are the review workflow and the approvers: Aaron live, and a demo account for the screenshots
// (config "approvers"). Anyone not listed keeps their GitHub login, so an unknown reviewer or approver never counts.
export const OWNER = REPO.split('/')[0];
export const approvers = () => loadConfig().approvers ?? ['aaronsearle'];
// The approver the gateway names in its comments: DEMO_APPROVER, else the first approver.
export const approver = () => process.env.DEMO_APPROVER ?? approvers()[0];
export const identityOf = (login) => {
  const agent = loadConfig().apps?.agent?.slug;
  if (agent && login === `${agent}[bot]`) return 'author-agent';
  if (login === 'github-actions[bot]') return 'review-bot';
  if (approvers().includes(login)) return 'alice';
  if (login === OWNER) return 'bob';
  return login;
};
// A person's token from the gh CLI's keyring (gh auth login once per account), whichever account is active.
export const tokenOf = (login) => execFileSync('gh', ['auth', 'token', '--user', login], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export const loadConfig = () => (existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, 'utf8')) : {});
export const saveConfig = (cfg) => { writeFileSync(`${CONFIG}.tmp`, `${JSON.stringify(cfg, null, 2)}\n`); renameSync(`${CONFIG}.tmp`, CONFIG); };

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
function appJwt(app) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({ iat: now - 60, exp: now + 540, iss: String(app.id) })}`;
  return `${body}.${sign('sha256', Buffer.from(body), createPrivateKey(readFileSync(join(ROOT, app.key)))).toString('base64url')}`;
}

async function request(token, method, path, body, scheme = 'token') {
  const res = await fetch(path.startsWith('http') ? path : `https://api.github.com${path}`, {
    method,
    headers: { accept: 'application/vnd.github+json', authorization: `${scheme} ${token}`, 'x-github-api-version': '2022-11-28', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const tokens = {};
// An installation token for one of the demo's apps ('agent' or 'gateway'), refreshed a few minutes before it expires.
export async function appToken(role) {
  const cached = tokens[role];
  if (cached && Date.parse(cached.expires_at) - Date.now() > 300_000) return cached.token;
  const app = loadConfig().apps?.[role];
  if (!app) throw new Error(`no ${role} app: run node gateway/gh-apps.mjs first`);
  const jwt = appJwt(app);
  const inst = await request(jwt, 'GET', `/repos/${REPO}/installation`, undefined, 'Bearer');
  tokens[role] = await request(jwt, 'POST', `/app/installations/${inst.id}/access_tokens`, undefined, 'Bearer');
  return tokens[role].token;
}

// A REST client acting as one of the apps ('agent', 'gateway'), the repository's owner ('owner'), or a GitHub login.
export async function as(role) {
  const token = role === 'agent' || role === 'gateway' ? await appToken(role) : role === 'owner' ? (process.env.GH_TOKEN ?? tokenOf(OWNER)) : tokenOf(role);
  const call = (method, path, body) => request(token, method, path, body);
  return { token, get: (p) => call('GET', p), post: (p, b) => call('POST', p, b ?? {}), put: (p, b) => call('PUT', p, b ?? {}), patch: (p, b) => call('PATCH', p, b ?? {}), del: (p) => call('DELETE', p) };
}

export const appSlug = (role) => loadConfig().apps?.[role]?.slug;

// The gateway's own clone of the demo repository, where it reads diffs and checks out code to scan. Its decisions,
// decorators and CALM Hub state live beside it, apart from the local demo's.
export const GH = join(ROOT, '.gh');
export const CLONE = join(GH, 'repo');
process.env.GATEWAY_HUB_STATE ??= join(GH, 'hub-state.json');
export const inClone = (...args) => execFileSync('git', args, { cwd: CLONE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim();
export const diffIn = (base, head) => execFileSync('git', ['diff', '--no-color', '--no-ext-diff', '--full-index', '--no-renames', `${base}...${head}`], { cwd: CLONE, maxBuffer: 64 * 1024 * 1024 });
export const remote = (token) => `https://x-access-token:${token}@github.com/${REPO}.git`;
