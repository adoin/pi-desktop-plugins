import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const main = require('../plugins/adoin.panel.anywhere/main');
const flush = () => new Promise(resolve => setImmediate(resolve));
async function fixture(t) {
  const previous = globalThis.pi;
  const state = { settings: { unrelated: 'keep', anywhereSessionBindingsV1: { fixture: true } }, requests: [], write: null };
  globalThis.pi = {
    plugin: { getSettings: async () => structuredClone(state.settings), setSettings: async patch => { if (state.write) await state.write(); Object.assign(state.settings, structuredClone(patch)); } },
    commands: { register: async () => {}, unregister: async () => {} }, services: { register: async () => {}, unregister: async () => {} }, ui: { openPanel: async () => {} },
    events: new EventEmitter(),
    net: { getCapabilities: async () => ({ fetchRedirectModes: ['error'] }), fetch: async input => { assert.equal(input.redirect, 'error'); state.requests.push(input); return { status: 200, bodyText: JSON.stringify({ accessToken: randomUUID(), expiresIn: 900 }) }; }, websocket: { connect: async () => ({ socketId: 'fixture' }), send: async () => {}, close: async () => {} } },
  };
  await main.onLoad();
  t.after(async () => { await main.onUnload(); globalThis.pi = previous; });
  const config = { profile: 'current', serverUrl: 'https://web.agents-anywhere.com', connectorId: 'conn_saved', connectorToken: randomUUID(), consent: true, shareSessions: false };
  return { state, config, password: randomUUID() };
}

test('encrypted connection survives reload without auto-connect, secret exposure or auto-sharing', async t => {
  const f = await fixture(t);
  assert.equal(f.state.requests.length, 0);
  const response = await main.onPanelInvoke('anywhere.connect', { ...f.config, rememberConnection: true, vaultPassword: f.password });
  assert.equal(response.savedConnection.encrypted, true);
  await flush(); assert.equal(f.state.requests[0].headers.Authorization, `Connector ${f.config.connectorId}:${f.config.connectorToken}`);
  for (const secret of [f.config.connectorToken, f.password]) { assert.ok(!JSON.stringify(response).includes(secret)); assert.ok(!JSON.stringify(f.state.settings).includes(secret)); }
  await main.onUnload(); const count = f.state.requests.length; await main.onLoad();
  const restored = await main.onPanelInvoke('anywhere.status');
  assert.equal(restored.connectorId, f.config.connectorId); assert.equal(restored.state, 'unconfigured'); assert.equal(restored.sharing.enabled, false); assert.equal(f.state.requests.length, count);
  const input = { ...f.config, connectorToken: '', useSaved: true, vaultPassword: f.password };
  await assert.rejects(main.onPanelInvoke('anywhere.connect', { ...input, consent: false }), { code: 'CONSENT_REQUIRED' });
  await assert.rejects(main.onPanelInvoke('anywhere.connect', { ...input, vaultPassword: randomUUID() }), { code: 'unlock_failed' });
  assert.equal(f.state.requests.length, count);
  await main.onPanelInvoke('anywhere.connect', input); await flush();
  assert.equal(f.state.requests.at(-1).headers.Authorization, `Connector ${f.config.connectorId}:${f.config.connectorToken}`);
  assert.equal((await main.onPanelInvoke('anywhere.status')).sharing.enabled, false);
});

test('saving metadata alone never stores token and changing selection cannot reuse encrypted credentials', async t => {
  const f = await fixture(t);
  await main.onPanelInvoke('anywhere.connect', f.config); await main.onPanelInvoke('anywhere.disconnect');
  assert.equal((await main.onPanelInvoke('anywhere.status')).savedConnection.encrypted, false);
  assert.ok(!JSON.stringify(f.state.settings).includes(f.config.connectorToken));
  await main.onPanelInvoke('anywhere.connect', { ...f.config, rememberConnection: true, vaultPassword: f.password });
  await main.onPanelInvoke('anywhere.disconnect'); const count = f.state.requests.length;
  await assert.rejects(main.onPanelInvoke('anywhere.connect', { ...f.config, connectorId: 'conn_other', useSaved: true, vaultPassword: f.password }), { code: 'saved_connection_mismatch' });
  await assert.rejects(main.onPanelInvoke('anywhere.connect', { ...f.config, serverUrl: 'https://self-hosted.example', useSaved: true, vaultPassword: f.password }), { code: 'saved_connection_mismatch' });
  assert.equal(f.state.requests.length, count);
});

test('forget requires confirmation and retains session mappings and unrelated settings', async t => {
  const f = await fixture(t);
  await main.onPanelInvoke('anywhere.connect', { ...f.config, rememberConnection: true, vaultPassword: f.password });
  await assert.rejects(main.onPanelInvoke('anywhere.forget', {}), { code: 'CONSENT_REQUIRED' });
  const result = await main.onPanelInvoke('anywhere.forget', { confirm: true });
  assert.equal(result.savedConnection, null); assert.equal(result.state, 'disconnected');
  assert.deepEqual(f.state.settings.anywhereSessionBindingsV1, { fixture: true }); assert.equal(f.state.settings.unrelated, 'keep');
  await main.onUnload(); await main.onLoad(); assert.equal((await main.onPanelInvoke('anywhere.status')).savedConnection, null);
});

test('invalid encryption choice never silently falls back to metadata-only or starts networking', async t => {
  const f = await fixture(t);
  for (const patch of [{ rememberConnection: true }, { rememberConnection: true, vaultPassword: 'short' }, { useSaved: true, vaultPassword: '' }]) {
    await assert.rejects(main.onPanelInvoke('anywhere.connect', { ...f.config, ...patch }), { code: 'password_invalid' });
  }
  await assert.rejects(main.onPanelInvoke('anywhere.connect', { ...f.config, useSaved: true, rememberConnection: true, vaultPassword: f.password }), { code: 'INVALID_CONFIG' });
  assert.equal(f.state.requests.length, 0); assert.equal(f.state.settings.anywhereConnectionV1, undefined);
});

test('disconnect during persistence fences connection and concurrent mutations are refused', async t => {
  const f = await fixture(t); let release;
  f.state.write = () => new Promise(resolve => { release = resolve; });
  const pending = main.onPanelInvoke('anywhere.connect', f.config);
  while (!release) await flush();
  await assert.rejects(main.onPanelInvoke('anywhere.connect', f.config), { code: 'persistence_busy' });
  await assert.rejects(main.onPanelInvoke('anywhere.forget', { confirm: true }), { code: 'persistence_busy' });
  const rejected = assert.rejects(pending, { code: 'UNAVAILABLE' });
  const stopping = main.onPanelInvoke('anywhere.disconnect'); release();
  await rejected; await stopping; assert.equal(f.state.requests.length, 0);
});

test('unload drains a pending save so reload restores without a permanent busy error', async t => {
  const f = await fixture(t); let release, unloaded = false;
  f.state.write = () => new Promise(resolve => { release = resolve; });
  const pending = main.onPanelInvoke('anywhere.connect', { ...f.config, rememberConnection: true, vaultPassword: f.password });
  const rejected = assert.rejects(pending, { code: 'UNAVAILABLE' });
  while (!release) await flush();
  const unloading = main.onUnload().then(() => { unloaded = true; });
  await flush(); assert.equal(unloaded, false); release();
  await Promise.all([rejected, unloading]); f.state.write = null;
  await main.onLoad(); const restored = await main.onPanelInvoke('anywhere.status');
  assert.equal(restored.savedConnectionError, null); assert.equal(restored.savedConnection.encrypted, true);
  assert.equal(f.state.requests.length, 0);
  await main.onPanelInvoke('anywhere.connect', { ...f.config, connectorToken: '', useSaved: true, vaultPassword: f.password });
  await flush(); assert.equal(f.state.requests.length, 1);
});

test('self-hosted encrypted credentials restore only for the exact chosen origin', async t => {
  const f = await fixture(t);
  const c = { ...f.config, serverUrl: 'https://selfhost.example:8443' };
  await main.onPanelInvoke('anywhere.connect', { ...c, rememberConnection: true, vaultPassword: f.password }); await flush();
  assert.equal(f.state.requests.at(-1).url, `${c.serverUrl}/api/v2/connector/auth`);
  await main.onUnload(); await main.onLoad();
  const status = await main.onPanelInvoke('anywhere.status'); assert.equal(status.serverUrl, c.serverUrl); assert.equal(status.savedConnection.encrypted, true);
  const before = f.state.requests.length;
  await assert.rejects(main.onPanelInvoke('anywhere.connect', { ...c, serverUrl: 'https://selfhost.example:9443', useSaved: true, vaultPassword: f.password }), { code: 'saved_connection_mismatch' });
  assert.equal(f.state.requests.length, before);
  await main.onPanelInvoke('anywhere.connect', { ...c, connectorToken: '', useSaved: true, vaultPassword: f.password }); await flush();
  assert.equal(f.state.requests.at(-1).url, `${c.serverUrl}/api/v2/connector/auth`);
});

test('missing safe-fetch capability blocks persistence and network before connecting', async t => {
  const f = await fixture(t); delete globalThis.pi.net.getCapabilities;
  await assert.rejects(main.onPanelInvoke('anywhere.connect', { ...f.config, rememberConnection: true, vaultPassword: f.password }), { code: 'REDIRECT_POLICY_UNAVAILABLE' });
  assert.equal(f.state.requests.length, 0); assert.equal(f.state.settings.anywhereConnectionV1, undefined);
});
