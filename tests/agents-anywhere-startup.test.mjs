import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(new URL('../plugins/adoin.panel.anywhere/main.js', import.meta.url));
const { LocalConnection } = require('./src/local-connection');
const test = (name, fn) => nodeTest(name, { timeout: 15000, skip: process.platform !== 'win32' && 'Windows DPAPI only' }, fn);
const config = { profile: 'current', serverUrl: 'https://web.agents-anywhere.com', connectorId: 'conn_test', connectorToken: randomUUID() };
const root = path.resolve('approved');
const scope = { shareSessions: true, useProjects: false, workspacePath: root, projects: [] };
let connects = [];
class FakeConnector {
 constructor() { this.publicConfig = {}; this.logs = []; }
 log(event, detail) { this.logs.push({event,detail}); }
 disconnect() { this.sessions?.stop(); }
 connect(config, sessions) { this.sessions = sessions; connects.push({ config, sessions }); }
 status() { return { ...this.publicConfig, logs: this.logs, profiles: [] }; }
}
class FakeSessions {
 constructor(pi, bridge) { this.bridge = bridge; this.stopped = false; }
 async initialize() { await this.bridge.checkWorkspace(); }
 stop() { this.stopped = true; }
 pause() {}
}
for (const [file, value] of [['./src/connector', { Connector: FakeConnector }], ['./src/sessions', { SessionService: FakeSessions }]]) {
 const id = require.resolve(file); require.cache[id] = { id, filename: id, loaded: true, exports: value };
}
function host() {
 let settings = { anywhereConnectionV1: { version: 1, profile: config.profile, serverUrl: config.serverUrl, connectorId: config.connectorId } };
 const h = {
  plugin: { getSettings: async () => structuredClone(settings), setSettings: async p => { Object.assign(settings, structuredClone(p)); } },
  workspace: { get: async () => ({ path: h.root, name: 'approved' }) }, root,
  projects: [{ id: 1, path: root, name: 'approved' }],
  desktop: { invoke: async ({operation}) => { assert.equal(operation, 'project/list'); return { projects: h.projects }; } },
  commands: { register: async () => {}, unregister: async () => {} },
  services: { register: async def => { h.service = def; }, unregister: async () => {} },
  events: { on() {}, off() {} },
  net: { getCapabilities: async () => ({ fetchRedirectModes: ['error'] }), fetch() {}, websocket: { connect() {}, send() {}, close() {} } }
 };
 return h;
}
async function load(pi) {
 global.pi = pi; connects = [];
 delete require.cache[require.resolve('./main')];
 const plugin = require('./main'); await plugin.onLoad(); return plugin;
}
async function seed(pi, s = scope) { const store = new LocalConnection(pi); await store.load(); await store.save(config, s); }
const args = { ...config, consent: true, shareSessions: true, useProjects: false, autoReconnect: true };
test('manual opt-in persists encrypted token, restart restores original workspace only', async () => {
 const pi = host(), a = await load(pi);
 await a.onPanelInvoke('anywhere.connect', args);
 assert.equal(connects.length, 1);
 const state = await a.onPanelInvoke('anywhere.status');
 assert.deepEqual(state.localConnection, { available: true, autoConnect: true });
 assert.ok(!JSON.stringify(await pi.plugin.getSettings()).includes(config.connectorToken));
 const savedEnvelope = structuredClone((await pi.plugin.getSettings()).anywhereLocalConnectionV1);
 await a.onUnload(); const b = await load(pi);
 assert.deepEqual((await pi.plugin.getSettings()).anywhereLocalConnectionV1, savedEnvelope);
 assert.equal(connects.length, 1); assert.equal(connects[0].sessions.bridge.workspace.path, root);
 assert.ok(!JSON.stringify(await b.onPanelInvoke('anywhere.status')).includes(config.connectorToken));
 await b.onUnload();
});
test('changed workspace refuses startup with no network connect', async () => {
 const pi = host(); await seed(pi); pi.root = path.resolve('unapproved'); const p = await load(pi);
 assert.equal(connects.length, 0);
 assert.equal((await p.onPanelInvoke('anywhere.status')).autoReconnectError, 'workspace_changed');
 await p.onUnload();
});
test('selected project snapshot refuses moved path rather than expanding scope', async () => {
 const pi = host(); await seed(pi, { shareSessions: true, useProjects: true, workspacePath: null, projects: [{ id: '1', path: root }] });
 pi.projects[0].path = path.resolve('moved'); const p = await load(pi);
 assert.equal(connects.length, 0);
 assert.equal((await p.onPanelInvoke('anywhere.status')).autoReconnectError, 'project_selection_changed');
 await p.onUnload();
});
test('selected projects restore exact saved set, ignore newly added project', async () => {
 const pi = host(); await seed(pi, { shareSessions: true, useProjects: true, workspacePath: null, projects: [{ id: '1', path: root }] });
 pi.projects.push({ id: 2, path: path.resolve('new-project'), name: 'new' }); const p = await load(pi);
 assert.equal(connects.length, 1); assert.equal(connects[0].sessions.children.length, 1);
 assert.equal(connects[0].sessions.children[0].bridge.savedProjectId, '1'); await p.onUnload();
});
test('disconnect disables future startup; manual local unlock can reconnect without password', async () => {
 const pi = host(); await seed(pi); const a = await load(pi);
 await a.onPanelInvoke('anywhere.disconnect'); await a.onUnload(); const b = await load(pi);
 assert.equal(connects.length, 0);
 await b.onPanelInvoke('anywhere.connect', { ...args, connectorToken: '', useLocal: true });
 assert.equal(connects.length, 1);
 await b.onPanelInvoke('anywhere.forget', { confirm: true }); await b.onUnload(); const c = await load(pi);
 assert.equal(connects.length, 0); assert.deepEqual((await c.onPanelInvoke('anywhere.status')).localConnection, { available: false, autoConnect: false });
 await c.onUnload();
});
test('connection-only startup never initializes sharing', async () => {
 const pi = host(); await seed(pi, { shareSessions: false, useProjects: false, workspacePath: null, projects: [] }); const p = await load(pi);
 assert.equal(connects.length, 1); assert.equal(connects[0].sessions, null); await p.onUnload();
});
test('changed public origin cannot redirect saved credentials', async () => {
 const pi = host(); await seed(pi);
 await pi.plugin.setSettings({ anywhereConnectionV1: { version: 1, profile: config.profile, serverUrl: 'https://other.example', connectorId: config.connectorId } });
 const p = await load(pi); assert.equal(connects.length, 0);
 assert.equal((await p.onPanelInvoke('anywhere.status')).autoReconnectError, 'saved_connection_mismatch'); await p.onUnload();
});
test('metadata-only legacy startup does not connect', async () => {
 const p = await load(host()); assert.equal(connects.length, 0); await p.onUnload();
});
test('legacy password encrypted token still unlocks without enabling startup', async () => {
 const pi = host(), p = await load(pi);
 const vaultPassword = 'fake-test-password-123';
 await p.onPanelInvoke('anywhere.connect', { ...args, autoReconnect: false, rememberConnection: true, vaultPassword });
 await p.onUnload(); const b = await load(pi); assert.equal(connects.length, 0);
 await b.onPanelInvoke('anywhere.connect', { ...args, connectorToken: '', autoReconnect: false, useSaved: true, vaultPassword });
 assert.equal(connects.length, 1); assert.equal(connects[0].config.connectorToken, config.connectorToken); await b.onUnload();
});
test('disconnect during async save cancels connection and clears startup enable', async () => {
 const pi = host(), p = await load(pi);
 let enter, release;
 const entered = new Promise(r => { enter = r; }), gate = new Promise(r => { release = r; });
 const write = pi.plugin.setSettings;
 pi.plugin.setSettings = async partial => {
  if (partial.anywhereLocalConnectionV1?.autoConnect === true) { enter(); await gate; }
  return write(partial);
 };
 const connecting = p.onPanelInvoke('anywhere.connect', args);
 await entered;
 const rejected = assert.rejects(connecting, { code: 'UNAVAILABLE' });
 const stopping = p.onPanelInvoke('anywhere.disconnect'); release();
 await rejected; await stopping; assert.equal(connects.length, 0);
 assert.equal((await pi.plugin.getSettings()).anywhereLocalConnectionV1.autoConnect, false);
 await p.onUnload(); const b = await load(pi); assert.equal(connects.length, 0); await b.onUnload();
});
test('unload while local decryption is pending prevents startup connect', async () => {
 const pi = host(); await seed(pi); global.pi = pi; connects = [];
 delete require.cache[require.resolve('./main')]; const p = require('./main');
 const original = LocalConnection.prototype.unlock;
 let enter, release;
 const entered = new Promise(r => { enter = r; }), gate = new Promise(r => { release = r; });
 LocalConnection.prototype.unlock = async function(c) { enter(); await gate; return original.call(this,c); };
 try {
  const loading = p.onLoad(); await entered; const unloading = p.onUnload(); release();
  await loading; await unloading; assert.equal(connects.length, 0);
 } finally { LocalConnection.prototype.unlock = original; }
});
test('tampered ciphertext stops startup without network, forget recovers', async () => {
 const pi = host(); await seed(pi);
 const settings = await pi.plugin.getSettings();
 await pi.plugin.setSettings({ anywhereLocalConnectionV1: { ...settings.anywhereLocalConnectionV1, ciphertext: 'AAAA' } });
 const p = await load(pi); assert.equal(connects.length, 0);
 assert.equal((await p.onPanelInvoke('anywhere.status')).autoReconnectError, 'local_unlock_failed');
 await p.onPanelInvoke('anywhere.forget', {confirm:true});
 await p.onPanelInvoke('anywhere.connect', args); assert.equal(connects.length, 1); await p.onUnload();
});
test('host service stop on application shutdown preserves startup reconnect', async () => {
 const pi = host(); await seed(pi); const a = await load(pi);
 await pi.service.stop();
 assert.equal((await pi.plugin.getSettings()).anywhereLocalConnectionV1.autoConnect, true);
 await a.onUnload(); const b = await load(pi); assert.equal(connects.length, 1); await b.onUnload();
});
test('forget attempts password credential deletion even if local deletion fails', async () => {
 const pi = host(); await seed(pi); const p = await load(pi);
 const write = pi.plugin.setSettings; let passwordCleared = false;
 pi.plugin.setSettings = async partial => {
  if (Object.hasOwn(partial, 'anywhereLocalConnectionV1')) throw Error('fake write failure');
  if (partial.anywhereConnectionV1 === null) passwordCleared = true;
  return write(partial);
 };
 await assert.rejects(p.onPanelInvoke('anywhere.forget', {confirm:true}));
 assert.equal(passwordCleared, true); await p.onUnload();
});
test('failed scope setup preserves prior automatic restore setting', async () => {
 const pi = host(); await seed(pi); const p = await load(pi);
 pi.workspace.get = async () => { throw Error('fake unavailable'); };
 await assert.rejects(p.onPanelInvoke('anywhere.connect', args));
 assert.equal((await pi.plugin.getSettings()).anywhereLocalConnectionV1.autoConnect, true);
 await p.onUnload();
});

test('unload drains an in-flight disconnect before startup can restore', async () => {
 const pi = host(); await seed(pi); const p = await load(pi);
 let enter, release, unloaded = false;
 const entered = new Promise(r => { enter = r; }), gate = new Promise(r => { release = r; });
 const write = pi.plugin.setSettings;
 pi.plugin.setSettings = async partial => {
  if (partial.anywhereLocalConnectionV1?.autoConnect === false) { enter(); await gate; }
  return write(partial);
 };
 const stopping = p.onPanelInvoke('anywhere.disconnect'); await entered;
 const unloading = p.onUnload().then(() => { unloaded = true; });
 await new Promise(r => setImmediate(r));
 const drainedTooEarly = unloaded;
 release(); await stopping; await unloading;
 assert.equal(drainedTooEarly, false);
 const b = await load(pi); assert.equal(connects.length, 0); await b.onUnload();
});

test('extra scope properties cannot override identity-checked startup credentials', async () => {
 const pi = host();
 const { protect } = require('./src/local-connection');
 const ciphertext = await protect(JSON.stringify({ version: 1, config, scope: { ...scope, serverUrl: 'https://unapproved.example' } }));
 await pi.plugin.setSettings({ anywhereLocalConnectionV1: { version: 1, autoConnect: true, ciphertext } });
 const p = await load(pi);
 try {
  assert.equal(connects.length, 1);
  assert.equal(connects[0].config.serverUrl, config.serverUrl);
  assert.equal(connects[0].config.connectorToken, config.connectorToken);
 } finally { await p.onUnload(); }
});

nodeTest('automatic reconnect refuses password-unlock mode before persistence', async () => {
 const pi = host(), p = await load(pi);
 try {
  await assert.rejects(p.onPanelInvoke('anywhere.connect', { ...args, useSaved: true, vaultPassword: randomUUID() }), { code: 'INVALID_CONFIG' });
  assert.equal(connects.length, 0);
  assert.equal((await pi.plugin.getSettings()).anywhereLocalConnectionV1, undefined);
 } finally { await p.onUnload(); }
});

nodeTest('non-Windows rejects automatic reconnect before scope or settings side effects', { skip: process.platform === 'win32' }, async () => {
 const pi = host(), p = await load(pi);
 pi.workspace.get = async () => { throw Error('scope must not be read'); };
 const before = await pi.plugin.getSettings();
 try {
  await assert.rejects(p.onPanelInvoke('anywhere.connect', args), { code: 'UNSUPPORTED' });
  assert.deepEqual(await pi.plugin.getSettings(), before);
  assert.equal(connects.length, 0);
 } finally { await p.onUnload(); }
});
