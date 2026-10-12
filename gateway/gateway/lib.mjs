// Shared pieces of the merge gateway: the repository it guards, hashing, ES256 keys and compact JWS, the approval token ledger, the decision log and terminal output.
import { execFileSync } from 'node:child_process';
import {
  createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify,
} from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // gateway/
export const BLUEPRINT = resolve(ROOT, '..');
export const DEMO = process.env.GATEWAY_DEMO ?? join(ROOT, '.demo');
export const paths = {
  repo: join(DEMO, 'repo'),
  changes: join(DEMO, 'changes'),
  reviews: join(DEMO, 'reviews'),
  decorators: join(DEMO, 'decorators'),
  token: join(DEMO, 'token.json'),
  ledger: join(DEMO, 'ledger.json'),
  decisions: join(DEMO, 'decisions.ndjson'),
  keys: join(ROOT, 'keys'),
};
export const ARCHITECTURE = 'architecture/trade-capture.architecture.json';
export const APPROVAL = { issuer: 'approval-service', audience: 'merge-gateway', maxAgeSeconds: 600 };
export const APPROVAL_SERVICE = APPROVAL.issuer;

// --- hashing and encoding ---------------------------------------------------------------------

export const short = (hex, n = 8) => String(hex ?? '').slice(0, n);
export const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
export const fromB64url = (text) => Buffer.from(text, 'base64url');

// --- keys and compact JWS (ES256) --------------------------------------------------------------

export const slug = (identity) => identity.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// A key pair per identity, generated on first use. Stands in for SPIFFE SVIDs and an HSM.
export function keyPair(identity) {
  mkdirSync(paths.keys, { recursive: true });
  const priv = join(paths.keys, `${slug(identity)}.key.pem`);
  const pub = join(paths.keys, `${slug(identity)}.pub.pem`);
  if (!existsSync(priv)) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    writeFileSync(priv, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    writeFileSync(pub, publicKey.export({ type: 'spki', format: 'pem' }));
  }
  return { privateKey: createPrivateKey(readFileSync(priv)), publicKey: createPublicKey(readFileSync(pub)) };
}

export function publicKeyOf(identity) {
  const pub = join(paths.keys, `${slug(identity)}.pub.pem`);
  return existsSync(pub) ? createPublicKey(readFileSync(pub)) : undefined;
}

export function signJws(claims, privateKey, kid) {
  const header = b64url(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid }));
  const payload = b64url(JSON.stringify(claims));
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${header}.${payload}.${b64url(signature)}`;
}

export function decodeJws(compact) {
  const [header, payload, signature] = String(compact).split('.');
  if (!header || !payload || !signature) throw new Error('not a compact JWS');
  return {
    header: JSON.parse(fromB64url(header).toString('utf8')),
    claims: JSON.parse(fromB64url(payload).toString('utf8')),
    signingInput: Buffer.from(`${header}.${payload}`),
    signature: fromB64url(signature),
  };
}

export function verifyJws(compact, publicKey) {
  if (!publicKey) return false;
  const { header, signingInput, signature } = decodeJws(compact);
  if (header.alg !== 'ES256') return false;
  return verify('sha256', signingInput, { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature);
}

// Six characters the human types back: derived from the commit and the exact diff, so the code
// only matches the diff that was rendered. Alphabet without 0, O, 1 and I.
export function bindingCode(change) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const digest = createHash('sha256').update(`approve:${change.commit}:${change.diff_sha256}`).digest();
  return [...digest.subarray(0, 6)].map((b) => alphabet[b % 32]).join('');
}

// --- the ledger of used tokens -----------------------------------------------------------------

export function readLedger() {
  return existsSync(paths.ledger) ? JSON.parse(readFileSync(paths.ledger, 'utf8')) : { used: {} };
}

export function markUsed(jti, record) {
  const ledger = readLedger();
  ledger.used[jti] = record;
  writeFileSync(paths.ledger, `${JSON.stringify(ledger, null, 2)}\n`);
}

// --- the guarded repository and the decision log ---------------------------------------------

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const git = (...args) => execFileSync('git', args, { cwd: paths.repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const gitBytes = (...args) => execFileSync('git', args, { cwd: paths.repo, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });

// The exact diff a change carries: its commit against the point where it left main. The gateway recomputes it on
// every decision and never takes a hash from the change file.
export const diffOf = (commit) => gitBytes('diff', '--no-color', '--no-ext-diff', '--full-index', '--no-renames', `main...${commit}`);

export const loadChange = (id) => {
  const file = join(paths.changes, `${id}.json`);
  if (!existsSync(file)) throw new Error(`no proposed change ${id}: run propose first`);
  return JSON.parse(readFileSync(file, 'utf8'));
};

// A clean checkout of a commit, for scanning its code, removed afterwards.
export async function withCheckout(commit, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-'));
  git('worktree', 'add', '--detach', '--quiet', dir, commit);
  try { return await fn(dir); } finally { git('worktree', 'remove', '--force', dir); }
}

export function logDecision(entry) {
  appendFileSync(paths.decisions, `${JSON.stringify(entry)}\n`);
  return entry;
}
export const readDecisions = () => (existsSync(paths.decisions) ? readFileSync(paths.decisions, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

// --- terminal ---------------------------------------------------------------------------------

const tty = process.stdout.isTTY;
export const paint = {
  green: (s) => (tty ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s) => (tty ? `\x1b[31m${s}\x1b[0m` : s),
  bold: (s) => (tty ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s) => (tty ? `\x1b[2m${s}\x1b[0m` : s),
};

export const label = (name, value) => `${name.padEnd(10)}${value}`;

// --flag value pairs and positionals. Flags without a value are true.
export function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      const name = argv[i].slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags[name] = next; i += 1; } else flags[name] = true;
    } else positional.push(argv[i]);
  }
  return { flags, positional };
}

// Runs a command, printing one line and no stack trace when it fails.
export function run(main) {
  main().catch((err) => {
    console.error(`error: ${err.message}`);
    process.exit(2);
  });
}
