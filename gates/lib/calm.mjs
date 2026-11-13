// Shared helpers: load the CALM architecture and relate repo paths to it.
// No dependencies on purpose, so every gate runs with plain `node`.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ARCHITECTURE = 'architecture/trade-capture.architecture.json';

export const loadArchitecture = () => JSON.parse(readFileSync(join(ROOT, ARCHITECTURE), 'utf8'));
export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
export const architectureSha = () => sha256(readFileSync(join(ROOT, ARCHITECTURE)));

export const nodeById = (arch, id) => arch.nodes.find((n) => n['unique-id'] === id);

/** Nodes that have code in this repo, keyed by their metadata.source-path. */
export const codeNodes = (arch) => arch.nodes.filter((n) => n.metadata?.['source-path']);

/** Which CALM node owns a repo-relative file path, if any. */
export const nodeForPath = (arch, path) =>
  codeNodes(arch).find((n) => (path + '/').startsWith(n.metadata['source-path'].replace(/\/?$/, '/')));

/** env-binding name -> owning node id, from every interface in the model. */
export const envBindings = (arch) => {
  const map = new Map();
  for (const node of arch.nodes)
    for (const i of node.interfaces ?? []) if (i['env-binding']) map.set(i['env-binding'], node['unique-id']);
  return map;
};

/** All `connects` edges in the model as {source, destination, id}. */
export const modelledEdges = (arch) =>
  arch.relationships.flatMap((r) => {
    const c = r['relationship-type']?.connects;
    return c ? [{ id: r['unique-id'], source: c.source.node, destination: c.destination.node }] : [];
  });

export const walk = (dir) =>
  !existsSync(dir) ? [] : readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const gitIn = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const git = (...args) => gitIn(ROOT, ...args);

/**
 * The change under evaluation.
 *  - BASE_REF set (CI): everything between BASE_REF and the working tree, i.e. the whole pull request.
 *  - Dirty working tree: whatever the agent just did, relative to HEAD.
 *  - Clean working tree: the last commit, relative to its parent.
 */
export const changeBase = () => {
  if (process.env.BASE_REF) return process.env.BASE_REF;
  if (git('status', '--porcelain') !== '') return 'HEAD';
  try { return git('rev-parse', '--verify', '--quiet', 'HEAD~1'); } catch { return 'HEAD'; } // root commit: nothing to evaluate
};

/**
 * Paths the change touches, base..head. --no-renames: a moved file lists its old path and its new one, so moving a
 * file out of a node still touches that node. head defaults to the working tree (plus untracked files); given a commit,
 * the two commits are compared instead.
 */
export const changedFiles = (base = changeBase(), head, root = ROOT) => {
  const tracked = gitIn(root, 'diff', '--name-only', '--no-renames', base, ...(head ? [head] : [])).split('\n');
  const untracked = head ? [] : gitIn(root, 'ls-files', '--others', '--exclude-standard').split('\n');
  return [...new Set([...tracked, ...untracked])].filter(Boolean).sort();
};

/** The spec this change is made under: SPEC env var, or a `Spec: SPEC-nnn` trailer on the last commit. */
export const currentSpecId = () =>
  process.env.SPEC || git('log', '-1', '--format=%B').match(/^Spec:\s*(SPEC-\d+)/m)?.[1] || undefined;

export const gitInfo = () => ({
  commit: git('rev-parse', 'HEAD'),
  branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || git('rev-parse', '--abbrev-ref', 'HEAD'),
  tree: git('rev-parse', 'HEAD^{tree}'),
  dirty: git('status', '--porcelain') !== '',
});

/** A path relative to root, with forward slashes. */
const relTo = (root, p) => relative(root, p).split(sep).join('/');
export const rel = (p) => relTo(ROOT, p);

/** Minimal front matter reader: `key: value` and `key: [a, b]`. Enough for specs, no YAML dependency. */
export const frontMatter = (text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    const v = kv[2].trim();
    out[kv[1]] = v.startsWith('[') ? v.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean) : v;
  }
  return out;
};

export const loadSpecs = (root = ROOT) =>
  walk(join(root, 'specs')).filter((p) => /SPEC-\d+.*\.md$/.test(p)).map((p) => ({ path: relTo(root, p), ...frontMatter(readFileSync(p, 'utf8')) }));

/** Print a result for humans, or JSON with --json, and exit non-zero on failure. */
export const report = (result) => {
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`${result.passed ? 'PASS' : 'FAIL'}  ${result.gate}  [${result.controls.join(', ')}]`);
    for (const f of result.findings) console.log(`  ${f.level.toUpperCase().padEnd(5)} ${f.message}`);
    if (result.summary) console.log(`  ${result.summary}`);
  }
  process.exitCode = result.passed ? 0 : 1;
  return result;
};

/**
 * Every connection the code makes, found by the convention the old drift gate used: process.env reads mapped to
 * the node whose interface declares that env-binding, and relative imports that reach into another node's source-path.
 * An env name no interface declares is a connection with destination null. One entry per source->destination.
 */
export const observedConnections = (arch, root = ROOT) => {
  const bindings = envBindings(arch);
  const found = new Map();
  const add = (source, destination, evidence) => {
    const id = `${source}->${destination ?? 'undeclared'}`;
    if (!found.has(id)) found.set(id, { id, source, destination, evidence });
  };
  for (const node of codeNodes(arch)) {
    const id = node['unique-id'];
    for (const file of walk(join(root, node.metadata['source-path'])).filter((f) => /\.(ts|js|mjs)$/.test(f))) {
      readFileSync(file, 'utf8').split('\n').forEach((text, i) => {
        for (const m of text.matchAll(/process\.env\.([A-Z0-9_]+)|process\.env\[['"]([A-Z0-9_]+)['"]\]/g)) {
          const name = m[1] ?? m[2];
          const owner = bindings.get(name);
          if (owner !== id) add(id, owner ?? null, `${relTo(root, file)}:${i + 1} env ${name}`);
        }
        const imp = text.match(/from\s+['"](\.{1,2}\/[^'"]+)['"]/);
        if (imp) {
          const target = nodeForPath(arch, relTo(root, resolve(dirname(file), imp[1])));
          if (target && target['unique-id'] !== id) add(id, target['unique-id'], `${relTo(root, file)}:${i + 1} import ${imp[1]}`);
        }
      });
    }
  }
  return [...found.values()].sort((a, b) => a.id.localeCompare(b.id));
};

const carriesPolicy = (arch) => /"ergo"\s*:/.test(JSON.stringify(arch.controls ?? {})) || arch.nodes.some((n) => /"ergo"\s*:/.test(JSON.stringify(n.controls ?? {})));

/**
 * The architecture on the base of the change: its controls decide, never the change's own copy of the model.
 * One exception, for bootstrapping: a base model that carries no ergo policy at all (before SPEC-002 merged)
 * cannot evaluate anything, so the working tree's model is used. Once the base carries a policy this never fires,
 * so a change cannot use it to remove its own controls. The fallback needs a base model that was read and parsed:
 * if the base model cannot be read (unknown or unfetched ref, no model at that ref, invalid JSON) this throws, so
 * the caller denies rather than evaluating the change against its own model.
 */
const baseArchitectureSource = (base, root = ROOT) => {
  let text, arch;
  try {
    text = execFileSync('git', ['show', `${base}:${ARCHITECTURE}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    arch = JSON.parse(text);
  } catch (e) {
    throw new Error(`The base model at ${base}:${ARCHITECTURE} could not be read: ${e.message.trim()}`);
  }
  if (carriesPolicy(arch)) return { text, arch, bootstrapped: false };
  text = readFileSync(join(root, ARCHITECTURE), 'utf8');
  return { text, arch: JSON.parse(text), bootstrapped: true };
};
export const baseArchitecture = (base = changeBase(), root = ROOT) => baseArchitectureSource(base, root).arch;
/** The exact text of the model baseArchitecture returns (git's bytes at base, or the working tree's file when bootstrapping), so its hash can be reproduced. */
export const baseArchitectureText = (base = changeBase(), root = ROOT) => baseArchitectureSource(base, root).text;

export const ENGINE = 'gates/policy/controls.wasm';
/**
 * The policy engine that goes with baseArchitecture: controls.wasm as git holds it at base. The base's policies are
 * written for the base's engine, so they are evaluated by it, never by the change's own copy. A change that upgrades
 * the engine, and rewrites the policies for it, is decided by the engine and policies it replaces, and its own pair
 * decides the changes after it. When bootstrapping (the working tree's model is used) the working tree's engine goes
 * with it. If the engine cannot be read at base this throws, so the caller denies.
 */
export const baseEngine = (base = changeBase(), root = ROOT) => {
  if (baseArchitectureSource(base, root).bootstrapped) return readFileSync(join(root, ENGINE));
  try {
    return execFileSync('git', ['show', `${base}:${ENGINE}`], { cwd: root, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    throw new Error(`The base engine at ${base}:${ENGINE} could not be read: ${String(e.stderr || e.message).trim()}`);
  }
};

/**
 * The facts the controls are evaluated on, for the change between base and head (default: the working tree).
 * root is the repository the change is in; treeRoot is a checkout of head, where the code's connections and the
 * specs are read. The gateway passes all of them; gates/check.mjs uses the defaults (this repository, its working tree).
 */
export const changeInput = ({ arch, base = changeBase(), head, root = ROOT, treeRoot = root, specId = currentSpecId(), author = process.env.CHANGE_AUTHOR_ID ?? 'unknown' }) => {
  const files = changedFiles(base, head, root).map((path) => ({ path, node: nodeForPath(arch, path)?.['unique-id'] ?? null }));
  const spec = loadSpecs(treeRoot).find((s) => s.id === specId);
  return {
    architecture: arch,
    change: {
      commit: head ? gitIn(root, 'rev-parse', head) : gitInfo().commit,
      author,
      ...(specId ? { spec: specId } : {}),
      files,
      nodes: [...new Set(files.map((f) => f.node).filter(Boolean))].sort(),
      connections: observedConnections(arch, treeRoot),
    },
    spec: spec ? { id: spec.id, approved: spec.status === 'approved', nodes: spec['calm-nodes'] ?? [] } : { id: null, approved: false, nodes: [] }, // a spec not in specs/ has no id, so spec_exists fails
  };
};
