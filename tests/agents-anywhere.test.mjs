import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const root = '../plugins/pi.agents-anywhere/';
const { origin, parseCommand, validateConfig } = require(`${root}src/config.js`);
const { PROFILES, endpoints } = require(`${root}src/profiles.js`);
const { Connector } = require(`${root}src/connector.js`);
const { RuntimeAdapter } = require(`${root}src/runtime.js`);
const manifest = require(`${root}manifest.json`);
const secret = () => randomUUID();
const config = () => ({ serverUrl: 'https://web.agents-anywhere.com', profile: 'current', connectorId: 'conn_fixture', connectorToken: secret(), consent: true });
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(overrides = {}) {
  const events = new EventEmitter(), timers = new Map(), requests = [], sockets = [], sent = [], closed = [];
  let next = 1;
  const accessToken = secret();
  const pi = { events, net: {
    fetch: async input => { requests.push(input); return overrides.fetch ? overrides.fetch(input) : { status: 200, bodyText: JSON.stringify({ accessToken, expiresIn: 900 }) }; },
    websocket: {
      connect: async input => { sockets.push(input); return overrides.connect ? overrides.connect(input, events) : { socketId: `socket-${sockets.length}` }; },
      send: async input => { sent.push(JSON.parse(input.data)); if (overrides.send) return overrides.send(input); },
      close: async input => { closed.push(input.socketId); },
    },
  } };
  const client = new Connector(pi, { random: () => 0, platform: 'win32', setTimeout: (fn, ms) => { const id = next++; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id) });
  return { client, pi, events, timers, requests, sockets, sent, closed, accessToken,
    rpc: async (method, params = {}, id = randomUUID(), socketId = client.socketId) => { events.emit('net:websocket:message', { socketId, data: JSON.stringify({ type: 'request', method, params, id }) }); await flush(); return sent.findLast(item => item.id === id); },
    fire: async ms => { const entry = [...timers].find(([, timer]) => timer.ms === ms); assert.ok(entry, `timer ${ms}`); timers.delete(entry[0]); entry[1].fn(); await flush(); },
  };
}

test('manifest pins preview version, exact minimal permissions and bilingual install disclosures', () => {
  assert.equal(manifest.id, 'pi.agents-anywhere'); assert.equal(manifest.version, '2.0.0-alpha.1');
  assert.deepEqual(manifest.permissions, ['ui.panel', 'ui.view', 'net.fetch', 'net.websocket', 'background.service']);
  assert.deepEqual(manifest.net.domains, ['web.agents-anywhere.com']);
  for (const locale of ['en', 'zh-CN']) { for (const key of ['name', 'description', 'safetyNotes']) assert.ok(manifest.i18n[locale][key]); assert.ok(manifest.ui.title[locale]); }
});
test('URL normalization rejects prefixes, insecure remote origins and credential-bearing URLs', () => {
  assert.equal(origin(' https://web.agents-anywhere.com/// '), 'https://web.agents-anywhere.com');
  assert.equal(origin('http://127.0.0.1:8000'), 'http://127.0.0.1:8000');
  for (const value of ['example.com', 'https://example.com/api/v2', 'https://a:b@example.com', 'https://example.com?a=b', 'https://example.com/#x', 'ftp://example.com', 'http://example.com', 'https://example.com\\x']) assert.throws(() => origin(value));
  assert.deepEqual(endpoints(config()), { auth: 'https://web.agents-anywhere.com/api/v2/connector/auth', ws: 'wss://web.agents-anywhere.com/api/v2/connector/ws' });
});
test('command parser supports quoting, equals and continuations without executing text', () => {
  const token = secret();
  const parsed = parseCommand(`uvx anywhere-cli start --server-url="https://web.agents-anywhere.com/" \`\n --connector-id 'conn_fixture' --connector-token=${token}`);
  assert.deepEqual(parsed, { serverUrl: 'https://web.agents-anywhere.com', connectorId: 'conn_fixture', connectorToken: token });
  for (const value of [`--server-url https://web.agents-anywhere.com --connector-id conn_fixture --connector-token ${token} --connector-id other`, '--server-url "unfinished', '--connector-token', 'x'.repeat(8193), '--server-url https://web.agents-anywhere.com --connector-id conn_fixture --connector-token "x\ny"']) assert.throws(() => parseCommand(value));
});
test('consent, exact domain and enabled profile are mandatory', () => {
  assert.equal(validateConfig(config(), manifest.net.domains, PROFILES).profile, 'current');
  for (const patch of [{ consent: false }, { serverUrl: 'https://evil.example' }, { profile: 'unknown' }, { profile: '__proto__' }, { connectorToken: 'bad\r\nheader' }]) assert.throws(() => validateConfig({ ...config(), ...patch }, manifest.net.domains, PROFILES));
  if (!PROFILES.legacy.enabled) assert.throws(() => validateConfig({ ...config(), profile: 'legacy' }, manifest.net.domains, PROFILES));
  assert.throws(() => validateConfig(config(), ['*.agents-anywhere.com'], PROFILES));
});
test('runtime descriptor is explicit, config is empty, single instance and all chat capabilities false', () => {
  const runtime = new RuntimeAdapter(); const scope = { runtime: 'pi', runtimeId: 'rti_fixture' };
  const type = runtime.dispatch('runtime.discover', {}).runtimeTypes[0];
  assert.equal(type.runtimeType, 'pi'); assert.equal(type.instancePolicy, 'single'); assert.equal(type.maxInstances, 1);
  assert.equal(type.configSchema.schema.additionalProperties, false);
  assert.equal(runtime.dispatch('runtime.config', scope).running, false);
  assert.throws(() => runtime.dispatch('runtime.start', { ...scope, name: 'Pi', config: { shell: 'bad' }, configRevision: 1 }));
  assert.throws(() => runtime.dispatch('runtime.start', { ...scope, name: 'Pi', config: {}, configRevision: 2 }));
  assert.equal(runtime.dispatch('runtime.start', { ...scope, name: 'Pi', config: {}, configRevision: 1 }).status, 'running');
  assert.equal(runtime.dispatch('runtime.config', scope).config.revision, 1);
  assert.ok(runtime.dispatch('runtime.capabilities', scope).capabilitySet.capabilities.every(item => !item.supported && !item.available && !item.allowed));
  assert.throws(() => runtime.dispatch('runtime.start', { ...scope, runtimeId: 'rti_other', name: 'Pi', config: {}, configRevision: 1 }));
  assert.throws(() => runtime.dispatch('session.send_message', { ...scope, content: 'No side effects' }), { code: 'method_not_found' });
  assert.equal(runtime.dispatch('runtime.stop', scope).status, 'stopped');
  assert.throws(() => runtime.dispatch('runtime.capabilities', scope));
});
test('auth uses Connector header, WS uses Bearer and online waits for discovery response', async () => {
  const f = fixture(), c = config(); f.client.connect(c); await f.client.opening;
  assert.equal(f.requests[0].headers.Authorization, `Connector ${c.connectorId}:${c.connectorToken}`);
  assert.equal(f.requests[0].method, 'POST'); assert.equal(f.requests[0].body, undefined);
  assert.equal(f.sockets[0].headers.Authorization, `Bearer ${f.accessToken}`);
  assert.equal(f.sockets[0].headers['X-Device-OS'], 'windows');
  assert.equal(f.sockets[0].headers['X-Connector-Version'], undefined);
  assert.equal(f.client.state, 'connecting');
  assert.deepEqual(f.sent[0], { type: 'notification', method: 'connector.heartbeat', params: {} });
  const reply = await f.rpc('runtime.discover');
  assert.equal(reply.type, 'response'); assert.equal(reply.ok, true); assert.equal(reply.jsonrpc, undefined);
  assert.equal(f.client.state, 'online'); assert.equal(f.client.runtime.discovered, true);
  assert.equal([...f.timers.values()].some(timer => timer.ms === 30000), false);
  assert.ok(!JSON.stringify(f.client.status()).includes(c.connectorToken)); assert.ok(!JSON.stringify(f.client.status()).includes(f.accessToken));
  f.client.disconnect(); await flush(); assert.equal(f.closed.length, 1); assert.equal(f.timers.size, 0); assert.equal(f.events.eventNames().length, 0); assert.equal(f.client.config, null);
});
test('early discovery arriving before socket handle is returned is not lost', async () => {
  const f = fixture({ connect: async (_, events) => { events.emit('net:websocket:message', { socketId: 'early', data: JSON.stringify({ type: 'request', id: 'first', method: 'runtime.discover', params: {} }) }); return { socketId: 'early' }; } });
  f.client.connect(config()); await f.client.opening; await flush(); assert.equal(f.client.state, 'online'); f.client.disconnect();
});
for (const [status, state, retry] of [[401, 'authentication_failed', false], [403, 'authentication_failed', false], [404, 'protocol_incompatible', false], [405, 'protocol_incompatible', false], [429, 'network_error', true], [503, 'network_error', true]]) {
  test(`HTTP ${status} is classified without downgrade or secret logging`, async () => {
    const token = secret(); const f = fixture({ fetch: async () => ({ status, bodyText: token }) }); f.client.connect(config()); await f.client.opening;
    assert.equal(f.client.state, state); assert.equal(f.timers.size > 0, retry); assert.equal(f.sockets.length, 0);
    assert.equal(f.client.publicConfig.profile, 'current'); assert.ok(!JSON.stringify(f.client.status()).includes(token)); f.client.disconnect();
  });
}
test('malformed auth, frame, legacy JSON-RPC and discovery timeout fail closed', async () => {
  for (const bodyText of ['html', '{}', '{"accessToken":"x","expiresIn":0}', 'x'.repeat(17000)]) {
    const f = fixture({ fetch: async () => ({ status: 200, bodyText }) }); f.client.connect(config()); await f.client.opening; assert.equal(f.client.state, 'protocol_incompatible'); assert.equal(f.sockets.length, 0);
  }
  for (const data of ['{', '[]', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'runtime.discover' }), 'x'.repeat(65537)]) {
    const f = fixture(); f.client.connect(config()); await f.client.opening; f.events.emit('net:websocket:message', { socketId: f.client.socketId, data }); await flush(); assert.equal(f.client.state, 'protocol_incompatible'); assert.equal(f.timers.size, 0);
  }
  const f = fixture(); f.client.connect(config()); await f.client.opening; await f.fire(30000); assert.equal(f.client.state, 'protocol_incompatible'); assert.equal(f.client.config, null);
});
test('unknown RPC is safe; repeated IDs are idempotent and changed payload is refused', async () => {
  const f = fixture(); f.client.connect(config()); await f.client.opening; await f.rpc('runtime.discover');
  const token = secret(); const reply = await f.rpc(token, {}, 'unknown'); assert.equal(reply.error.code, 'method_not_found'); assert.ok(!JSON.stringify(f.client.status()).includes(token));
  const params = { runtime: 'pi', runtimeId: 'rti_fixture', name: 'Pi', config: {}, configRevision: 1 };
  await f.rpc('runtime.start', params, 'start'); const revision = f.client.runtime.revision;
  await f.rpc('runtime.start', params, 'start'); assert.equal(f.client.runtime.revision, revision);
  await f.rpc('runtime.stop', { runtime: 'pi', runtimeId: 'rti_fixture' }, 'start'); assert.equal(f.client.state, 'protocol_incompatible');
});
test('transient close reauthenticates; stale socket events and cancelled retry do nothing', async () => {
  const f = fixture(); f.client.connect(config()); await f.client.opening; await f.rpc('runtime.discover');
  const old = f.client.socketId; const stale = f.events.listeners('net:websocket:message')[0];
  f.events.emit('net:websocket:close', { socketId: old, code: 1008, reason: 'expired' });
  assert.equal(f.client.state, 'reconnecting'); await f.fire(3000); await f.client.opening;
  assert.equal(f.requests.length, 2); assert.equal(f.sockets.length, 2);
  stale({ socketId: old, data: 'bad' }); assert.notEqual(f.client.state, 'protocol_incompatible');
  f.events.emit('net:websocket:close', { socketId: f.client.socketId, code: 1012 });
  f.client.disconnect(); assert.equal(f.timers.size, 0); await flush(); assert.equal(f.requests.length, 2);
});
test('revoked credential and duplicate connector stop retry and clear credentials', async () => {
  for (const [code, reason, state] of [[4001, 'connector credentials revoked', 'authentication_failed'], [4409, 'already connected', 'ownership_conflict']]) {
    const f = fixture(); f.client.connect(config()); await f.client.opening;
    f.events.emit('net:websocket:close', { socketId: f.client.socketId, code, reason });
    assert.equal(f.client.state, state); assert.equal(f.timers.size, 0); assert.equal(f.client.config, null);
  }
});
test('disconnect during auth prevents a WS connection; late WS handle is closed', async () => {
  let resolveAuth; const f = fixture({ fetch: () => new Promise(resolve => { resolveAuth = resolve; }) });
  f.client.connect(config()); const opening = f.client.opening; f.client.disconnect();
  resolveAuth({ status: 200, bodyText: JSON.stringify({ accessToken: secret(), expiresIn: 900 }) }); await opening; assert.equal(f.sockets.length, 0);
  let resolveSocket; const s = fixture({ connect: () => new Promise(resolve => { resolveSocket = resolve; }) });
  s.client.connect(config()); await flush(); const wait = s.client.opening; s.client.disconnect(); resolveSocket({ socketId: 'late' }); await wait; await flush();
  assert.deepEqual(s.closed, ['late']); assert.equal(s.events.eventNames().length, 0); assert.equal(s.timers.size, 0);
});
test('permission denial is terminal and network exceptions are never echoed', async () => {
  const token = secret(); const f = fixture({ fetch: async () => { throw Object.assign(new Error(token), { code: 'PERMISSION_DENIED' }); } });
  f.client.connect(config()); await f.client.opening; assert.equal(f.client.state, 'protocol_incompatible'); assert.equal(f.timers.size, 0); assert.ok(!JSON.stringify(f.client.status()).includes(token));
});
test('plugin load is offline; consent is required and unload unregisters all resources', async () => {
  const f = fixture(), commands = new Map(), services = new Map();
  const previous = globalThis.pi;
  globalThis.pi = { ...f.pi, commands: { register: async item => commands.set(item.id, item), unregister: async id => commands.delete(id) }, services: { register: async item => services.set(item.id, item), unregister: async id => services.delete(id) }, ui: { openPanel: async () => {} } };
  const main = require(`${root}main.js`);
  try {
    await main.onLoad(); assert.equal(f.requests.length, 0); assert.equal((await main.onPanelInvoke('anywhere.status')).state, 'unconfigured');
    await assert.rejects(main.onPanelInvoke('anywhere.connect', { ...config(), consent: false }), { code: 'CONSENT_REQUIRED' });
    await assert.rejects(main.onPanelInvoke('session.send_message', {}), { code: 'UNSUPPORTED' });
    await main.onUnload(); assert.equal(commands.size, 0); assert.equal(services.size, 0);
  } finally { globalThis.pi = previous; }
});

test('stale early-event saturation cannot terminate a replacement socket', async () => {
  const f = fixture({ connect: async (_, events) => {
    for (let i = 0; i < 40; i++) events.emit('net:websocket:message', { socketId: 'retired', data: '{}' });
    events.emit('net:websocket:message', { socketId: 'replacement', data: JSON.stringify({ type: 'request', id: 'new', method: 'runtime.discover', params: {} }) });
    return { socketId: 'replacement' };
  } });
  f.client.connect(config()); await f.client.opening; await flush();
  assert.equal(f.client.state, 'online'); f.client.disconnect();
});
test('early close and error are classified and clear listeners before retry', async () => {
  for (const kind of ['close', 'error']) {
    const f = fixture({ connect: async (_, events) => { events.emit(`net:websocket:${kind}`, { socketId: 'early', code: 1012 }); return { socketId: 'early' }; } });
    f.client.connect(config()); await f.client.opening; await flush();
    assert.equal(f.client.state, kind === 'close' ? 'reconnecting' : 'network_error');
    assert.equal(f.events.eventNames().length, 0); assert.deepEqual([...f.timers.values()].map(item => item.ms), [3000]);
    f.client.disconnect();
  }
});
test('failed discovery response never announces online and starts only one retry', async () => {
  const f = fixture({ send: async input => { if (JSON.parse(input.data).type === 'response') throw new Error(secret()); } });
  f.client.connect(config()); await f.client.opening; await f.rpc('runtime.discover');
  assert.equal(f.client.state, 'network_error'); assert.equal(f.client.runtime.discovered, false);
  assert.deepEqual([...f.timers.values()].map(item => item.ms), [3000]); f.client.disconnect();
});
test('active early buffer and concurrent request floods are bounded', async () => {
  const f = fixture({ connect: async (_, events) => { for (let i = 0; i < 33; i++) events.emit('net:websocket:message', { socketId: 'active', data: '{}' }); return { socketId: 'active' }; } });
  f.client.connect(config()); await f.client.opening; assert.equal(f.client.state, 'protocol_incompatible'); assert.equal(f.timers.size, 0);
  const pending = []; const s = fixture({ send: input => JSON.parse(input.data).type === 'response' ? new Promise(resolve => pending.push(resolve)) : undefined });
  s.client.connect(config()); await s.client.opening;
  for (let i = 0; i < 17; i++) s.events.emit('net:websocket:message', { socketId: s.client.socketId, data: JSON.stringify({ type: 'request', id: String(i), method: 'runtime.discover', params: {} }) });
  assert.equal(s.client.state, 'protocol_incompatible'); for (const resolve of pending) resolve(); await flush();
  assert.equal(s.client.state, 'protocol_incompatible'); assert.equal(s.timers.size, 0);
});
