import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { postDecorator, publishArchitecture, resetHub, targetFor, hubEnabled } from '../../gateway/gateway/hub.mjs';

const stub = async ({ failDelete = [], noArchLocation = false } = {}) => {
  const calls = [];
  let nextArch = 41, nextDec = 1;
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    calls.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : null });
    if (req.method === 'GET' && req.url === '/api/calm/namespaces') { res.end(JSON.stringify({ values: [{ name: 'finos.agentic-sdlc' }] })); return; }
    if (req.method === 'POST' && req.url === '/api/calm/namespaces/finos.agentic-sdlc/architectures' && noArchLocation) { res.writeHead(201).end(); return; }
    if (req.method === 'DELETE' && failDelete.includes(req.url)) { res.writeHead(500).end('boom'); return; }
    if (req.method === 'POST' && req.url === '/api/calm/namespaces/finos.agentic-sdlc/architectures') { res.writeHead(201, { location: `http://x/api/calm/namespaces/finos.agentic-sdlc/architectures/${nextArch}/versions/1.0.0` }).end(); return; }
    if (req.method === 'POST' && /\/architectures\/\d+\/versions\//.test(req.url)) { res.writeHead(201).end(); return; }
    if (req.method === 'POST' && req.url.endsWith('/decorators')) { res.writeHead(201, { location: `http://x/api/calm/namespaces/finos.agentic-sdlc/decorators/${nextDec++}` }).end(); return; }
    if (req.method === 'DELETE') { res.writeHead(204).end(); return; }
    res.writeHead(500).end('unexpected');
  });
  await new Promise((r) => server.listen(0, r));
  return { calls, url: `http://localhost:${server.address().port}`, close: () => server.close() };
};
const env = (url) => {
  process.env.CALM_HUB_URL = url;
  process.env.GATEWAY_HUB_STATE = join(mkdtempSync(join(tmpdir(), 'hub-')), 'state.json');
};

test('off without CALM_HUB_URL', async () => {
  delete process.env.CALM_HUB_URL;
  assert.equal(hubEnabled(), false);
  assert.equal(await publishArchitecture('{}'), null);
  assert.equal(await postDecorator({}), null);
});

test('targets use the Hub filter form, with dashes in the version', () => {
  process.env.CALM_HUB_NAMESPACE = 'finos.agentic-sdlc';
  assert.equal(targetFor(41, '1.1.0'), '/api/calm/namespaces/finos.agentic-sdlc/architectures/41/versions/1-1-0');
});

test('first publish creates the architecture, a new model is the next version, the same model is reused', async () => {
  const hub = await stub(); env(hub.url);
  try {
    const a = await publishArchitecture('{"v":1}');
    assert.deepEqual(a, { id: 41, version: '1.0.0', target: '/api/calm/namespaces/finos.agentic-sdlc/architectures/41/versions/1-0-0' });
    const b = await publishArchitecture('{"v":2}');
    assert.equal(b.version, '1.1.0');
    assert.deepEqual(await publishArchitecture('{"v":1}'), a);
    const posts = hub.calls.filter((c) => c.method === 'POST');
    assert.equal(posts[0].body.name, 'Trade Capture (governed)');
    assert.equal(posts[0].body.architectureJson, '{"v":1}');
    assert.equal(posts[1].url, '/api/calm/namespaces/finos.agentic-sdlc/architectures/41/versions/1.1.0');
  } finally { hub.close(); }
});

test('decorators are posted and reset deletes only what was created', async () => {
  const hub = await stub(); env(hub.url);
  try {
    await publishArchitecture('{"v":1}');
    assert.equal(await postDecorator({ 'unique-id': 'd1' }), 1);
    assert.equal(await postDecorator({ 'unique-id': 'd2' }), 2);
    await resetHub();
    const deletes = hub.calls.filter((c) => c.method === 'DELETE').map((c) => c.url);
    assert.deepEqual(deletes, ['/api/calm/namespaces/finos.agentic-sdlc/decorators/1', '/api/calm/namespaces/finos.agentic-sdlc/decorators/2', '/api/calm/namespaces/finos.agentic-sdlc/architectures/41']);
  } finally { hub.close(); }
});

test('a failing hub never throws', async () => {
  env('http://localhost:1');
  const r = await publishArchitecture('{"v":1}');
  assert.ok(r.error, 'publish reports the error');
  assert.ok((await postDecorator({ 'unique-id': 'd' })).error);
  await resetHub();
});

test('a corrupt state file does not make reset throw, and publishing still works', async () => {
  const hub = await stub(); env(hub.url);
  try {
    writeFileSync(process.env.GATEWAY_HUB_STATE, 'not json{');
    await resetHub();
    const a = await publishArchitecture('{"v":1}');
    assert.equal(a.id, 41);
    assert.equal(JSON.parse(readFileSync(process.env.GATEWAY_HUB_STATE, 'utf8')).architectureId, 41);
  } finally { hub.close(); }
});

test('a partial reset keeps only the ids whose delete failed', async () => {
  const hub = await stub({ failDelete: ['/api/calm/namespaces/finos.agentic-sdlc/decorators/2'] }); env(hub.url);
  try {
    await publishArchitecture('{"v":1}');
    await postDecorator({ 'unique-id': 'd1' });
    await postDecorator({ 'unique-id': 'd2' });
    await postDecorator({ 'unique-id': 'd3' });
    await resetHub();
    const deletes = hub.calls.filter((c) => c.method === 'DELETE').map((c) => c.url);
    assert.equal(deletes.length, 4, 'every delete is attempted');
    assert.deepEqual(JSON.parse(readFileSync(process.env.GATEWAY_HUB_STATE, 'utf8')), { architectureId: null, versions: {}, decorators: [2] });
  } finally { hub.close(); }
});

test('a create response without a Location id is an error and nothing is saved', async () => {
  const hub = await stub({ noArchLocation: true }); env(hub.url);
  try {
    const r = await publishArchitecture('{"v":1}');
    assert.ok(r && r.error, 'publish reports the error');
    let state = {};
    try { state = JSON.parse(readFileSync(process.env.GATEWAY_HUB_STATE, 'utf8')); } catch { /* no state file */ }
    assert.ok(!state.architectureId, 'no architectureId saved');
  } finally { hub.close(); }
});

test('a Hub that accepts but never answers times out with an error', async () => {
  const sockets = new Set();
  const server = createServer(() => { /* never responds */ });
  server.on('connection', (s) => sockets.add(s));
  await new Promise((r) => server.listen(0, r));
  env(`http://localhost:${server.address().port}`);
  process.env.CALM_HUB_TIMEOUT_MS = '500';
  const started = Date.now();
  try {
    const r = await publishArchitecture('{"v":1}');
    assert.ok(r && r.error, 'publish reports the error');
    assert.ok(Date.now() - started < 4000, `took ${Date.now() - started}ms`);
  } finally {
    delete process.env.CALM_HUB_TIMEOUT_MS;
    for (const s of sockets) s.destroy();
    server.close();
  }
});
