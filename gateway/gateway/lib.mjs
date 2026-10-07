// Shared pieces of the merge gateway prototype: paths, the architecture and spec loaders,
// hashing, ES256 keys and compact JWS, the token ledger, the decision log and terminal output.
import {
  createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign, verify,
} from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPolicy } from '@open-policy-agent/opa-wasm';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The governed repository is read, never written.
export const REPO = process.env.BLUEPRINT_REPO ?? resolve(ROOT, '..');

export const paths = {
  arch: join(REPO, 'architecture/trade-capture.architecture.json'),
  specs: join(REPO, 'specs'),
  wasm: join(ROOT, 'policy/merge.wasm'),
  keys: join(ROOT, 'keys'),
  reviews: join(ROOT, 'reviews'),
  decisions: join(ROOT, 'decisions.ndjson'),
  ledger: join(ROOT, 'ledger.json'),
  token: join(ROOT, 'token.json'),
};

export const APPROVAL_SERVICE = 'approval-service';

// --- hashing and encoding ---------------------------------------------------------------------

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const short = (hex, n = 8) => String(hex ?? '').slice(0, n);
export const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
export const fromB64url = (text) => Buffer.from(text, 'base64url');

// --- the architecture: DATA for the policy -------------------------------------------------------

export function loadArchitecture() {
  const raw = readFileSync(paths.arch);
  const arch = JSON.parse(raw.toString('utf8'));
  const config = arch.controls['sdlc-prev-001-code-review'].requirements[0].config;
  // In the real repository these two keys live in the model, next to author-may-not-review and
  // rules. The prototype adds them in memory so the model file stays untouched; the hash recorded
  // in every decision is the hash of that file on disk.
  config['approved-cognitive-engines'] = ['spiffe://bank/agents/reviewer'];
  config['human-approval'] = {
    issuer: APPROVAL_SERVICE,
    audience: 'merge-gateway',
    'max-age-seconds': 600,
    'single-use': true,
    'bound-to': ['commit-sha', 'diff-sha256', 'spec-id'],
  };
  return { arch, sha: sha256(raw) };
}

// The nodes whose source-path owns a file in the change, with tier and classification.
export function nodesTouched(arch, files) {
  return arch.nodes
    .filter((node) => node.metadata?.['source-path'])
    .filter((node) => files.some((file) => file.startsWith(`${node.metadata['source-path']}/`)))
    .map((node) => ({
      id: node['unique-id'],
      tier: node.metadata['criticality-tier'],
      classification: node.metadata['data-classification'],
    }));
}

// --- the spec ---------------------------------------------------------------------------------

function frontMatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  const out = {};
  if (!match) return out;
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
    }
    out[key] = value;
  }
  return out;
}

export function loadSpec(id) {
  for (const name of readdirSync(paths.specs).filter((f) => f.endsWith('.md')).sort()) {
    const fm = frontMatter(readFileSync(join(paths.specs, name), 'utf8'));
    if (fm.id === id) {
      return { id, approved: fm.status === 'approved', status: fm.status, nodes: fm['calm-nodes'] ?? [], title: fm.title };
    }
  }
  return { id, approved: false, status: 'missing', nodes: [] };
}

// --- the change ------------------------------------------------------------------------------

export function loadChange(file) {
  const path = resolve(file);
  if (!existsSync(path)) throw new Error(`no change file at ${file}`);
  const change = JSON.parse(readFileSync(path, 'utf8'));
  const diffPath = resolve(dirname(path), change.diff ?? '');
  if (!change.diff || !existsSync(diffPath)) throw new Error(`${basename(path)} points at no readable diff file`);
  const diffBytes = readFileSync(diffPath);
  const diffText = diffBytes.toString('utf8');
  const inDiff = [...diffText.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
  const files = change.files ?? inDiff;
  const missing = inDiff.filter((f) => !files.includes(f));
  if (missing.length) throw new Error(`${basename(path)} does not list every file in its diff: ${missing.join(', ')}`);
  for (const key of ['id', 'spec', 'author', 'commit']) {
    if (!change[key]) throw new Error(`${basename(path)} has no ${key}`);
  }
  return {
    ...change,
    files,
    path,
    name: basename(path, '.json'),
    diffPath: relative(process.cwd(), diffPath),
    diffText,
    diff_sha256: sha256(diffBytes),
  };
}

// What the policy sees of the change.
export const changeInput = (change) => ({
  id: change.id,
  spec: change.spec,
  author: change.author,
  commit: change.commit,
  files: change.files,
  diff_sha256: change.diff_sha256,
});

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

// --- the policy and the decision log ----------------------------------------------------------

export async function evaluate(input) {
  const wasm = readFileSync(paths.wasm);
  const policy = await loadPolicy(wasm);
  const { arch, sha: archSha } = loadArchitecture();
  policy.setData({ arch });
  const started = process.hrtime.bigint();
  const allow = policy.evaluate(input, 'merge/allow')[0]?.result === true;
  const deny = (policy.evaluate(input, 'merge/deny')[0]?.result ?? []).sort();
  const evalNs = Number(process.hrtime.bigint() - started);
  return { allow, deny, policySha: sha256(wasm), archSha, evalNs };
}

// One line per decision, in the shape of an OPA decision log event.
export function logDecision({ input, allow, deny, policySha, archSha, evalNs }) {
  const entry = {
    decision_id: randomUUID(),
    labels: { app: 'merge-gateway', id: 'gateway-proto', version: '0.1.0' },
    bundles: {
      'merge-policy': { revision: `sha256:${policySha}` },
      architecture: { revision: `sha256:${archSha}` },
    },
    path: 'merge',
    input,
    result: { allow, deny },
    requested_by: 'gateway/merge.mjs',
    timestamp: new Date().toISOString(),
    metrics: { timer_rego_query_eval_ns: evalNs },
  };
  appendFileSync(paths.decisions, `${JSON.stringify(entry)}\n`);
  return entry;
}

export function readDecisions() {
  if (!existsSync(paths.decisions)) return [];
  return readFileSync(paths.decisions, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

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
