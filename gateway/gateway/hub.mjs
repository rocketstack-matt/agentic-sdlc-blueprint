// The CALM Hub client: publishes the architecture the gateway guards, one version per model it decides on, and posts
// each decision's control-evaluation decorators against that version. Off unless CALM_HUB_URL is set. It never throws:
// a decision is made, logged and printed whether or not the Hub is reachable.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
const load = () => (existsSync(cfg().state) ? JSON.parse(readFileSync(cfg().state, 'utf8')) : empty());
const save = (s) => writeFileSync(cfg().state, `${JSON.stringify(s, null, 2)}\n`);
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

export async function resetHub() {
  if (!hubEnabled()) return;
  const s = load();
  try {
    for (const id of s.decorators) await call('DELETE', `/api/calm/namespaces/${cfg().ns}/decorators/${id}`);
    if (s.architectureId) await call('DELETE', `/api/calm/namespaces/${cfg().ns}/architectures/${s.architectureId}`);
  } catch { /* an unreachable hub leaves nothing to reset */ }
  save(empty());
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
      s.architectureId = Number(res.headers.get('location')?.match(/architectures\/(\d+)\//)?.[1]);
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
    const id = Number(res.headers.get('location')?.match(/decorators\/(\d+)/)?.[1]);
    const s = load();
    s.decorators.push(id);
    save(s);
    return id;
  } catch (e) {
    return { error: e.message };
  }
}
