import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { IngestTransport } = require('../plugins/adoin.panel.anywhere/src/ingest.js');
// All credentials and responses are synthetic; no network requests leave this fixture.
const config = { serverUrl: 'https://synthetic.invalid', connectorId: 'synthetic-id', connectorToken: 'synthetic-connector-token' };
const auth = { accessToken: 'synthetic-access-token', expiresIn: 900 };
const response = value => ({ status: 200, bodyText: JSON.stringify(value) });
const accepted = () => response({ accepted: 1, rejected: [] });
const refreshed = () => response({ accessToken: 'synthetic-refreshed-token', expiresIn: 900 });
const rejects = (promise, code) => assert.rejects(promise, { code });
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function fixture(handler = () => accepted(), credentials = auth) {
  const calls = [], logs = [];
  const transport = new IngestTransport({ net: { getCapabilities: async () => ({ fetchRedirectModes: ['error'] }), fetch: async input => { assert.equal(input.redirect, 'error'); calls.push(input); return handler(input, calls.length); } } }, config, credentials, (...args) => logs.push(args));
  return { transport, calls, logs };
}
const methods = ['timeline.sync', 'session.meta.upsert', 'session.state.updated', 'runtime.capability.updated', 'runtime.catalog.updated'];
for (const method of methods) test(`sends ${method} using the bounded authenticated notification envelope`, async () => {
  const f = fixture(), params = { runtimeId: 'synthetic-runtime', nested: { text: 'hello' } };
  await f.transport.send(method, params);
  assert.deepEqual(f.calls, [{ url: `${config.serverUrl}/api/v2/connector/ingest`, method: 'POST', headers: { Authorization: `Bearer ${auth.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ notifications: [{ method, params }] }), timeoutMs: 15000, redirect: 'error' }]);
  assert.deepEqual(f.logs, []);
});

test('unsupported, oversized UTF-8 and unserializable payloads never reach the network', async () => {
  const f = fixture();
  for (const method of ['session.delete', '', '__proto__', null]) await rejects(f.transport.send(method, {}), 'unsupported');
  await rejects(f.transport.send('timeline.sync', { text: '😀'.repeat(225000) }), 'payload_limit');
  const circular = {}; circular.self = circular;
  await assert.rejects(f.transport.send('timeline.sync', circular), TypeError);
  await assert.rejects(f.transport.send('timeline.sync', { value: 1n }), TypeError);
  assert.equal(f.calls.length, 0);
});

test('payload byte limit includes the envelope and permits exactly 900000 bytes', async () => {
  const f = fixture(), method = 'timeline.sync';
  const overhead = Buffer.byteLength(JSON.stringify({ notifications: [{ method, params: { text: '' } }] }));
  await f.transport.send(method, { text: 'x'.repeat(900000 - overhead) });
  assert.equal(Buffer.byteLength(f.calls[0].body), 900000);
  await rejects(f.transport.send(method, { text: 'x'.repeat(900001 - overhead) }), 'payload_limit');
  assert.equal(f.calls.length, 1);
});

test('expired credentials refresh once for concurrent sends and use only the new bearer token', async () => {
  const gate = deferred();
  const f = fixture(input => input.url.endsWith('/auth') ? gate.promise : accepted(), { ...auth, expiresIn: 60 });
  const pending = [f.transport.send('timeline.sync', { id: 1 }), f.transport.send('timeline.sync', { id: 2 })];
  await new Promise(resolve => setImmediate(resolve)); assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0], { url: `${config.serverUrl}/api/v2/connector/auth`, method: 'POST', headers: { Authorization: `Connector ${config.connectorId}:${config.connectorToken}` }, timeoutMs: 10000, redirect: 'error' });
  gate.resolve(refreshed()); await Promise.all(pending);
  assert.equal(f.calls.length, 3);
  for (const call of f.calls.slice(1)) assert.equal(call.headers.Authorization, 'Bearer synthetic-refreshed-token');
  assert.equal(f.transport.refreshing, null);
  assert.ok(f.transport.expires > Date.now());
  assert.deepEqual(f.logs, [['auth_http', '200']]);
});

test('401 triggers one refresh and retries the identical serialized payload', async () => {
  const f = fixture((input, count) => count === 1 ? { status: 401, bodyText: 'synthetic-private-response' } : input.url.endsWith('/auth') ? refreshed() : accepted());
  await f.transport.send('timeline.sync', { text: 'synthetic-user-content' });
  assert.equal(f.calls.length, 3);
  assert.equal(f.calls[0].body, f.calls[2].body);
  assert.equal(f.calls[2].headers.Authorization, 'Bearer synthetic-refreshed-token');
  assert.deepEqual(f.logs, [['auth_http', '200']]);
});

test('repeated 401 stops after the single refresh retry', async () => {
  const f = fixture(input => input.url.endsWith('/auth') ? refreshed() : { status: 401, bodyText: 'synthetic-private-response' });
  await rejects(f.transport.send('timeline.sync', {}), 'ingest_failed');
  assert.equal(f.calls.length, 3);
  assert.deepEqual(f.logs, [['auth_http', '200'], ['ingest_failed', 'HTTP_401']]);
});

const invalidAuth = [undefined, { status: 403, bodyText: 'synthetic-private-response' }, { status: 200, bodyText: 1 }, { status: 200, bodyText: 'x'.repeat(16385) }, { status: 200, bodyText: '{' },
  ...[null, [], {}, { accessToken: '', expiresIn: 900 }, { accessToken: 'header\r\ninjection', expiresIn: 900 }, { accessToken: 'space token', expiresIn: 900 }, { accessToken: 'é', expiresIn: 900 }, { accessToken: 'x'.repeat(8193), expiresIn: 900 }, { accessToken: 'synthetic', expiresIn: 0 }, { accessToken: 'synthetic', expiresIn: -1 }, { accessToken: 'synthetic', expiresIn: '900' }].map(response)];
for (const [i, result] of invalidAuth.entries()) test(`invalid refresh response ${i} never sends ingest or replaces credentials`, async () => {
  const f = fixture(() => result, { ...auth, expiresIn: 0 });
  await rejects(f.transport.send('timeline.sync', {}), 'ingest_auth_failed');
  assert.equal(f.calls.length, 1); assert.equal(f.transport.token, auth.accessToken);
  assert.equal(f.transport.refreshing, null);
  assert.ok(!JSON.stringify(f.logs).includes('synthetic-private-response'));
});

const invalidIngest = [undefined, { status: 500, bodyText: 'synthetic-private-response' }, { status: '200', bodyText: '{}' }, { status: 200, bodyText: null }, { status: 200, bodyText: 'x'.repeat(65537) }, { status: 200, bodyText: '{' }];
for (const [i, result] of invalidIngest.entries()) test(`invalid ingest response ${i} fails without retries or response-body logging`, async () => {
  const f = fixture(() => result);
  await rejects(f.transport.send('timeline.sync', {}), 'ingest_failed');
  assert.equal(f.calls.length, 1);
  assert.ok(!JSON.stringify(f.logs).includes('synthetic-private-response'));
});
for (const [i, receipt] of [null, [], {}, { accepted: '1', rejected: [] }, { accepted: 0, rejected: [] }, { accepted: 2, rejected: [] }, { accepted: 1 }, { accepted: 1, rejected: ['synthetic-private-response'] }].entries()) test(`invalid receipt ${i} is rejected`, async () => {
  const f = fixture(() => response(receipt));
  await rejects(f.transport.send('timeline.sync', {}), 'ingest_rejected');
  assert.equal(f.calls.length, 1); assert.deepEqual(f.logs, [['ingest_failed', 'NOTIFICATION_REJECTED']]);
});

test('failed refresh is shared, clears its lock, and permits a later successful retry', async () => {
  const gate = deferred(); let recover = false;
  const f = fixture(input => input.url.endsWith('/auth') ? recover ? refreshed() : gate.promise : accepted(), { ...auth, expiresIn: 0 });
  const first = f.transport.send('timeline.sync', {}), second = f.transport.send('timeline.sync', {});
  const assertions = [assert.rejects(first, /Synthetic network failure/), assert.rejects(second, /Synthetic network failure/)];
  gate.reject(new Error('Synthetic network failure')); await Promise.all(assertions);
  assert.equal(f.calls.length, 1); assert.equal(f.transport.refreshing, null);
  recover = true; await f.transport.send('timeline.sync', {}); assert.equal(f.calls.length, 3);
});

test('network failure during ingest is not retried because delivery may have occurred', async () => {
  const f = fixture(() => { throw new Error('Synthetic timeout'); });
  await assert.rejects(f.transport.send('timeline.sync', {}), /Synthetic timeout/);
  assert.equal(f.calls.length, 1); assert.deepEqual(f.logs, []);
});

for (const phase of ['auth', 'send', '401-auth']) test(`close during ${phase} prevents late success, credential resurrection and further requests`, async () => {
  const gate = deferred(), entered = deferred();
  const f = fixture((input, count) => {
    if (phase === '401-auth' && count === 1) return { status: 401, bodyText: '' };
    entered.resolve(); return gate.promise;
  }, phase === 'auth' ? { ...auth, expiresIn: 0 } : auth);
  const pending = f.transport.send('timeline.sync', {});
  const rejected = rejects(pending, 'sharing_inactive');
  await entered.promise; f.transport.close(); f.transport.close();
  gate.resolve(phase === 'send' ? accepted() : refreshed()); await rejected;
  assert.equal(f.transport.token, null); assert.equal(f.transport.config, null);
  assert.equal(f.transport.refreshing, null);
  await rejects(f.transport.send('timeline.sync', {}), 'sharing_inactive');
  await rejects(f.transport.refresh(), 'sharing_inactive');
  assert.equal(f.calls.length, phase === '401-auth' ? 2 : 1);
  assert.deepEqual(f.logs, []);
});

test('close before use blocks all outbound traffic', async () => {
  const f = fixture(); f.transport.close();
  await rejects(f.transport.send('timeline.sync', {}), 'sharing_inactive');
  await rejects(f.transport.refresh(), 'sharing_inactive');
  assert.throws(() => f.transport.guard(), { code: 'sharing_inactive' });
  assert.equal(f.calls.length, 0);
});
