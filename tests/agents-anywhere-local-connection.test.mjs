import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(new URL('../plugins/adoin.panel.anywhere/main.js', import.meta.url));
const { LocalConnection, protect, unprotect } = require('./src/local-connection');

nodeTest('non-Windows local encryption fails closed without a plaintext fallback', { skip: process.platform === 'win32' }, async () => {
  assert.throws(() => protect(randomUUID()), { code: 'local_storage_failed' });
  assert.throws(() => unprotect('AAAA'), { code: 'local_unlock_failed' });
  const pi = host(), store = new LocalConnection(pi);
  await store.load();
  await assert.rejects(store.save(config, scope), { code: 'local_storage_failed' });
  assert.deepEqual(await pi.plugin.getSettings(), {});
});

nodeTest('malformed local envelopes are refused and failed writes retain prior state', async () => {
  const pi = host(), store = new LocalConnection(pi);
  for (const value of [{}, { version: 1, autoConnect: true, ciphertext: '!' }, { version: 1, autoConnect: 'true', ciphertext: 'AAAA' }]) {
    await pi.plugin.setSettings({ anywhereLocalConnectionV1: value });
    await assert.rejects(store.load(), { code: 'local_storage_failed' });
    assert.deepEqual(store.public(), { available: false, autoConnect: false });
  }
  await pi.plugin.setSettings({ anywhereLocalConnectionV1: { version: 1, autoConnect: true, ciphertext: 'AAAA' } });
  await store.load();
  pi.plugin.setSettings = async () => { throw Error('fixture storage denied'); };
  await assert.rejects(store.disable(), { code: 'local_storage_failed' });
  assert.deepEqual(store.public(), { available: true, autoConnect: true });
});
const test = (name, fn) => nodeTest(name, { skip: process.platform !== 'win32' && 'Windows DPAPI only' }, fn);
const config = { profile: 'current', serverUrl: 'https://web.agents-anywhere.com', connectorId: 'conn_test', connectorToken: randomUUID() };
nodeTest('local credential API is present', () => assert.equal(typeof LocalConnection, 'function'));
const scope = { shareSessions: true, useProjects: false, workspacePath: path.resolve('approved'), projects: [] };
const host = () => { let settings = {}; return { plugin: { getSettings: async () => structuredClone(settings), setSettings: async partial => { Object.assign(settings, structuredClone(partial)); } } }; };
test('real Windows DPAPI round trip and corrupt ciphertext rejection', async () => {
  assert.equal(typeof protect, 'function');
  const cipher = await protect('fake-secret');
  assert.ok(!cipher.includes('fake-secret'));
  assert.equal(await unprotect(cipher), 'fake-secret');
  await assert.rejects(unprotect('AAAA'), { code: 'local_unlock_failed' });
});
test('local store survives fresh instance, binds identity, contains no plaintext token', async () => {
  assert.equal(typeof LocalConnection, 'function');
  const pi = host(), a = new LocalConnection(pi);
  await a.load(); await a.save(config, scope);
  const stored = JSON.stringify(await pi.plugin.getSettings());
  assert.ok(!stored.includes(config.connectorToken));
  assert.ok(!stored.includes(scope.workspacePath));
  const b = new LocalConnection(pi); await b.load();
  assert.deepEqual(b.public(), { available: true, autoConnect: true });
  assert.deepEqual(await b.unlock(config), { config, scope });
  await assert.rejects(b.unlock({ ...config, serverUrl: 'https://different.example' }), { code: 'saved_connection_mismatch' });
  assert.ok(!JSON.stringify(b.public()).includes(config.connectorToken));
});
test('disconnect disables startup but retains token; forget deletes it', async () => {
  assert.equal(typeof LocalConnection, 'function');
  const pi = host(), a = new LocalConnection(pi); await a.load(); await a.save(config, scope);
  await a.disable(); const b = new LocalConnection(pi); await b.load();
  assert.deepEqual(b.public(), { available: true, autoConnect: false });
  assert.equal((await b.unlock(config)).config.connectorToken, config.connectorToken);
  await b.forget(); const c = new LocalConnection(pi); await c.load();
  assert.deepEqual(c.public(), { available: false, autoConnect: false });
  await assert.rejects(c.unlock(config), { code: 'saved_connection_missing' });
});
test('Windows encryption preserves Chinese workspace paths and titles', async () => {
  const value = JSON.stringify({ path: 'D:/中文项目/工作区', name: '远程连接' });
  assert.equal(await unprotect(await protect(value)), value);
});
test('concurrent disconnect and forget cannot resurrect encrypted credentials', async () => {
  const pi = host(), store = new LocalConnection(pi); await store.load(); await store.save(config, scope);
  const write = pi.plugin.setSettings; let enter, release;
  const entered = new Promise(r => { enter = r; }), gate = new Promise(r => { release = r; });
  pi.plugin.setSettings = async partial => {
    if (partial.anywhereLocalConnectionV1?.autoConnect === false) { enter(); await gate; }
    return write(partial);
  };
  const stopping = store.disable(); await entered;
  const forgetting = store.forget(); release(); await stopping; await forgetting;
  assert.equal((await pi.plugin.getSettings()).anywhereLocalConnectionV1, null);
  assert.equal(store.public().available, false);
});
