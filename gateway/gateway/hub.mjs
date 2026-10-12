// The CALM Hub client: publishes the architecture the gateway guards, one version per model it decides on, and posts
// each decision's control-evaluation decorators against that version. Off unless CALM_HUB_URL is set. It never throws:
// a decision is made, logged and printed whether or not the Hub is reachable.
import { createHash } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'Trade Capture (governed)';
const DESCRIPTION = 'The architecture the merge gateway guards: one version per model it has decided on, with every decision as a control-evaluation decorator.';
const cfg = () => ({
  url: process.env.CALM_HUB_URL?.replace(/\/$/, ''),
  ns: process.env.CALM_HUB_NAMESPACE ?? 'finos.agentic-sdlc',
  state: process.env.GATEWAY_HUB_STATE ?? join(fileURLToPath(new URL('..', import.meta.url)), '.hub-state.json'),
});
const empty = () => ({ architectureId: null, versions: {}, decorators: [] });
const load = () => {
  try {
    const s = JSON.parse(readFileSync(cfg().state, 'utf8'));
    return { ...empty(), ...s, versions: s?.versions ?? {}, decorators: Array.isArray(s?.decorators) ? s.decorators : [] };
  } catch { return empty(); } // missing, unreadable or corrupt state means nothing is known to have been created
};
const save = (s) => {
  const { state } = cfg();
  writeFileSync(`${state}.tmp`, `${JSON.stringify(s, null, 2)}\n`);
  renameSync(`${state}.tmp`, state);
};
const idFrom = (res, pattern) => {
  const id = Number(res.headers.get('location')?.match(pattern)?.[1]);
  if (!Number.isInteger(id)) throw new Error(`no id in Location header: ${res.headers.get('location')}`);
  return id;
};
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

export const hubEnabled = () => Boolean(cfg().url);
export const targetFor = (id, version) => `/api/calm/namespaces/${cfg().ns}/architectures/${id}/versions/${version.replaceAll('.', '-')}`;

async function call(method, path, body) {
  const res = await fetch(`${cfg().url}${path}`, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok && !(method === 'DELETE' && res.status === 404)) throw new Error(`${method} ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function ensureNamespace() {
  const { ns } = cfg();
  const names = ((await (await call('GET', '/api/calm/namespaces')).json()).values ?? []).map((v) => v.name);
  if (!names.includes(ns)) await call('POST', '/api/calm/namespaces', { name: ns, description: 'Agentic SDLC blueprint: the governed trade capture demo' });
}

const deleted = async (path) => {
  try { await call('DELETE', path); return true; } catch { return false; } // call() already treats 404 as success
};

// Every delete is attempted independently; only the ids whose delete failed stay in state, to be retried next reset.
export async function resetHub() {
  if (!hubEnabled()) return;
  try {
    const s = load();
    const left = empty();
    for (const id of s.decorators) if (!(await deleted(`/api/calm/namespaces/${cfg().ns}/decorators/${id}`))) left.decorators.push(id);
    if (s.architectureId && !(await deleted(`/api/calm/namespaces/${cfg().ns}/architectures/${s.architectureId}`))) {
      left.architectureId = s.architectureId;
      left.versions = s.versions;
    }
    save(left);
  } catch { /* reset never throws */ }
}

export async function publishArchitecture(text) {
  if (!hubEnabled()) return null;
  try {
    const s = load();
    const key = sha256(text);
    if (s.versions[key]) return { id: s.architectureId, version: s.versions[key], target: targetFor(s.architectureId, s.versions[key]) };
    const version = `1.${Object.keys(s.versions).length}.0`;
    const body = { name: NAME, description: DESCRIPTION, architectureJson: text };
    if (!s.architectureId) {
      await ensureNamespace();
      const res = await call('POST', `/api/calm/namespaces/${cfg().ns}/architectures`, body);
      s.architectureId = idFrom(res, /architectures\/(\d+)\//);
    } else {
      await call('POST', `/api/calm/namespaces/${cfg().ns}/architectures/${s.architectureId}/versions/${version}`, body);
    }
    s.versions[key] = version;
    save(s);
    return { id: s.architectureId, version, target: targetFor(s.architectureId, version) };
  } catch (e) {
    return { error: e.message };
  }
}

export async function postDecorator(decorator) {
  if (!hubEnabled()) return null;
  try {
    const res = await call('POST', `/api/calm/namespaces/${cfg().ns}/decorators`, decorator);
    const id = idFrom(res, /decorators\/(\d+)/);
    const s = load();
    s.decorators.push(id);
    save(s);
    return id;
  } catch (e) {
    return { error: e.message };
  }
}
