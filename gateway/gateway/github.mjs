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
// on GitHub those are the review workflow and Aaron. Anyone not listed keeps their GitHub login, so an unknown
// reviewer or approver never counts.
const PEOPLE = { 'github-actions[bot]': 'review-bot', aaronsearle: 'alice', 'rocketstack-matt': 'bob' };
export const identityOf = (login) => {
  const agent = loadConfig().apps?.agent?.slug;
  return agent && login === `${agent}[bot]` ? 'author-agent' : PEOPLE[login] ?? login;
};

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

// A REST client acting as one of the apps, or as the person logged in to the gh CLI ('owner').
export async function as(role) {
  const token = role === 'owner' ? (process.env.GH_TOKEN ?? execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim()) : await appToken(role);
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
