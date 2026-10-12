import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
const require = createRequire(import.meta.url);
const { safeFetch } = require('../plugins/adoin.panel.anywhere/src/safe-fetch');
const { IngestTransport } = require('../plugins/adoin.panel.anywhere/src/ingest');
const { Connector } = require('../plugins/adoin.panel.anywhere/src/connector');
const capabilities = async () => ({ fetchRedirectModes: ['follow', 'manual', 'error'] });
const config = () => ({ profile: 'current', serverUrl: 'https://selfhost.example:8443', connectorId: 'conn_fixture', connectorToken: randomUUID() });

test('capability guard fails closed before every fetch and sanitizes host rejection', async () => {
  let calls = 0;
  const pi = { net: { fetch: async () => { calls++; } } };
  for (const getCapabilities of [undefined, async () => null, async () => ({ fetchRedirectModes: 'error' }), async () => ({ fetchRedirectModes: [] }), async () => { throw new Error('private'); }]) {
    pi.net.getCapabilities = getCapabilities;
    await assert.rejects(safeFetch(pi, { url: 'https://selfhost.example' }), e => e.code === 'REDIRECT_POLICY_UNAVAILABLE' && !e.message.includes('private'));
  }
  assert.equal(calls, 0);
  pi.net.getCapabilities = capabilities;
  pi.net.fetch = async input => { assert.equal(input.redirect, 'error'); throw { errorCode: 'REDIRECT_DISALLOWED', message: 'private token' }; };
  await assert.rejects(safeFetch(pi, { redirect: 'follow' }), e => e.code === 'REDIRECT_DISALLOWED' && !e.message.includes('private'));
});

test('HTTP loopback redirects never deliver credentials or payload to the target', async t => {
  let targetHits = 0; const requests = [];
  const target = createServer((req, res) => { targetHits++; res.end(); });
  const source = createServer((req, res) => { requests.push(req.url); res.writeHead(Number(req.url.slice(1)), { Location: `http://127.0.0.1:${target.address().port}/sink` }); res.end(); });
  for (const server of [target, source]) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await Promise.all([source, target].map(s => new Promise(resolve => s.close(resolve)))); });
  // Synthetic host broker models the 0.18.0 single-hop transport and error policy.
  const pi = { net: { getCapabilities: capabilities, fetch: async input => {
    assert.equal(input.redirect, 'error');
    const response = await fetch(input.url, { method: input.method, headers: input.headers, body: input.body, redirect: 'manual' });
    if (response.status >= 300 && response.status <= 399) { await response.body?.cancel(); throw Object.assign(new Error('Redirect refused'), { code: 'REDIRECT_DISALLOWED' }); }
    return { status: response.status, bodyText: await response.text() };
  } } };
  for (const status of [301, 302, 303, 307, 308]) await assert.rejects(safeFetch(pi, {
    url: `http://127.0.0.1:${source.address().port}/${status}`, method: 'POST', headers: { Authorization: `Bearer ${randomUUID()}` }, body: 'synthetic conversation'
  }), { code: 'REDIRECT_DISALLOWED' });
  assert.equal(requests.length, 5); assert.equal(targetHits, 0);
});

test('ingest and auth refresh use the selected origin and refuse redirects without retry', async () => {
  for (const refresh of [false, true]) {
    const c = config(), calls = [];
    const pi = { net: { getCapabilities: capabilities, fetch: async input => { calls.push(input); throw Object.assign(new Error('private'), { code: 'REDIRECT_DISALLOWED' }); } } };
    const ingest = new IngestTransport(pi, c, { accessToken: randomUUID(), expiresIn: refresh ? 1 : 900 });
    await assert.rejects(ingest.send('timeline.sync', {}), { code: 'REDIRECT_DISALLOWED' });
    assert.equal(calls.length, 1); assert.equal(calls[0].redirect, 'error');
    assert.equal(calls[0].url, `${c.serverUrl}/api/v2/connector/${refresh ? 'auth' : 'ingest'}`);
    ingest.close();
  }
});

test('ingest capability probe cannot send after closure', async () => {
  let release, calls = 0;
  const ingest = new IngestTransport({ net: { getCapabilities: () => new Promise(resolve => { release = resolve; }), fetch: async () => { calls++; } } }, config(), { accessToken: randomUUID(), expiresIn: 900 });
  const pending = ingest.send('timeline.sync', {}); ingest.close(); release({ fetchRedirectModes: ['error'] });
  await assert.rejects(pending, { code: 'sharing_inactive' }); assert.equal(calls, 0);
});

test('upload policy failure stops Connector and clears live credential references', async () => {
  const client = new Connector({ events: { off() {} }, net: { websocket: { close: async () => {} } } });
  client.want = true; client.config = config();
  client.sessions = { enabled: true };
  let closed = false;
  client.ingest = { send: async () => { throw Object.assign(new Error('private'), { code: 'REDIRECT_DISALLOWED' }); }, close() { closed = true; } };
  await assert.rejects(client.notify('timeline.sync', {}), { code: 'REDIRECT_DISALLOWED' });
  assert.equal(client.state, 'protocol_incompatible'); assert.equal(client.want, false); assert.equal(client.config, null); assert.equal(closed, true);
  assert.equal(client.timers.size, 0); assert.ok(client.logs.some(e => e.detail === 'INGEST:REDIRECT_DISALLOWED'));
});
