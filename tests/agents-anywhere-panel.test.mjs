import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
const source = readFileSync(new URL('../plugins/adoin.panel.anywhere/renderer/panel.js', import.meta.url), 'utf8');
const parserSource = readFileSync(new URL('../plugins/adoin.panel.anywhere/src/connection-input.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
class Element {
  constructor(value = '') { this.value = value; this.dataset = {}; this.disabled = false; this.checked = false; this.handlers = new Map(); this.children = []; this.textContent = ''; }
  addEventListener(event, fn) { this.handlers.set(event, fn); }
  emit(event, detail = {}) { const e = { preventDefault() { this.defaultPrevented = true; }, ...detail }; this.handlers.get(event)?.(e); return e; }
  setAttribute(name, value) { (this.attributes ??= {})[name] = value; }
  focus() { this.focused = true; }
  replaceChildren() { this.children = []; }
  appendChild(child) { this.children.push(child); }
}
function fixture(override, options = {}) {
  const ids = ['connect', 'disconnect', 'parse', 'refresh', 'diagnostics', 'report', 'consent', 'connection', 'profile', 'message', 'logs', 'state', 'discovered', 'running', 'serverUrl', 'connectorId', 'connectorToken', 'command'];
  ids.push('shareSessions', 'runtimeId', 'sharingEnabled', 'sharingReady', 'workspaceName', 'sessionCount', 'lastSyncAt', 'runtimeSetup');
  ids.push('useSaved', 'rememberConnection', 'vaultPassword', 'savedState', 'forgetConsent', 'forgetConnection');
  ids.push('useProjects', 'loadProjects', 'selectAllProjects', 'clearProjects', 'projectsList', 'projectsCount', 'projectsState');
  ids.push('scopeCurrent', 'scopeProjects', 'scopeHelp', 'readiness', 'readinessMessage', 'readinessAction');
  const tabs = ['status', 'connections', 'events'];
  ids.push(...tabs.flatMap(id => [`tab-${id}`, `panel-${id}`]));
  const nodes = Object.fromEntries(ids.map(id => [id, new Element()]));
  nodes.profile.value = 'current'; nodes.profile.options = [new Element('current'), new Element('legacy')];
  Object.defineProperty(nodes.profile, 'selectedOptions', { get: () => nodes.profile.options.filter(option => option.value === nodes.profile.value) });
  const fields = ['scopeCurrent', 'scopeProjects', 'useProjects', 'consent', 'shareSessions', 'profile', 'serverUrl', 'connectorId', 'connectorToken', 'command', 'useSaved', 'rememberConnection', 'vaultPassword', 'forgetConsent'].map(id => nodes[id]);
  nodes.connection.querySelectorAll = () => fields;
  const buttons = ['readinessAction', 'loadProjects', 'selectAllProjects', 'clearProjects', 'connect', 'disconnect', 'parse', 'refresh', 'diagnostics', 'forgetConnection', ...tabs.map(id => `tab-${id}`)].map(id => nodes[id]);
  for (const [index, id] of tabs.entries()) nodes[`tab-${id}`].dataset.i18n = ['tabStatus', 'tabConnections', 'tabEvents'][index];
  for (const id of ['connect', 'disconnect', 'parse', 'refresh']) nodes[id].dataset.i18n = id;
  nodes.runtimeSetup.dataset.i18n = 'runtimeSetup';
  const callbacks = new Map(), intervals = new Map(), deadlines = new Map(), calls = []; let deadlineId = 0;
  const status = { state: 'unconfigured', serverUrl: 'https://web.agents-anywhere.com', connectorId: '', profile: 'current', runtime: { discovered: false, running: false }, profiles: [{ id: 'current', enabled: true, label: 'Current', baseline: '' }, { id: 'legacy', enabled: false, label: 'Legacy', baseline: '' }], logs: [] };
  const window = { addEventListener: (event, fn) => callbacks.set(event, fn), pluginBridge: { invoke: async (method, args) => {
    calls.push({ method, args });
    if (override) { const custom = override(method, args); if (custom !== undefined) return custom; }
    if (method === 'anywhere.status') return status;
    if (method === 'anywhere.connect' || method === 'anywhere.disconnect') return status;
    throw new Error('Fixture method unavailable');
  } } };
  window.__appearance = { onLocaleChange: fn => callbacks.set('locale', fn), init: () => {} };
  const storage = options.storage ?? new Map();
  const writes = [];
  Object.defineProperty(window, 'localStorage', { get() {
    if (options.blockStorage) throw new Error('Storage blocked');
    return {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => { if (options.blockWrites) throw new Error('Quota exceeded'); writes.push([key, value]); storage.set(key, value); }
    };
  } });
  if (options.noBridge) delete window.pluginBridge;
  if (!options.noParser) runInNewContext(parserSource, { window, URL });
  if (options.parser) window.AnywhereInput = { parseCommand: options.parser };
  runInNewContext(source, { window, document: { documentElement: { lang: 'en' }, hidden: false, getElementById: id => nodes[id], createElement: () => new Element(), querySelectorAll: selector => selector === '[data-i18n]' ? [...buttons, nodes.runtimeSetup] : buttons }, setTimeout: (fn, ms) => { const id = ++deadlineId; deadlines.set(id, { fn, ms }); return id; }, clearTimeout: id => deadlines.delete(id), setInterval: fn => { intervals.set(1, fn); return 1; }, clearInterval: id => intervals.delete(id) });
  return { nodes, calls, status, callbacks, intervals, deadlines, storage, writes };
}
test('renderer blocks connect without consent, invalidates consent on edits and disables legacy', async () => {
  const f = fixture(); await flush(); const n = f.nodes;
  assert.equal(n.connect.disabled, true); assert.equal(n.profile.options[1].disabled, true);
  n.connection.emit('submit'); await flush(); assert.equal(f.calls.some(call => call.method === 'anywhere.connect'), false);
  n.consent.checked = true; n.consent.emit('change'); assert.equal(n.connect.disabled, false);
  n.serverUrl.value = 'https://other.example'; n.serverUrl.emit('input'); assert.equal(n.consent.checked, false); assert.equal(n.connect.disabled, true);
  n.profile.value = 'legacy'; n.consent.checked = true; n.connection.emit('submit'); await flush(); assert.equal(f.calls.some(call => call.method === 'anywhere.connect'), false);
  f.callbacks.get('pagehide')();
});
test('renderer clears credentials after connection and never echoes arbitrary exceptions', async () => {
  const f = fixture(); await flush(); const n = f.nodes;
  n.connectorToken.value = randomUUID(); n.command.value = 'private command'; n.consent.checked = true;
  n.connection.emit('submit'); await flush(); assert.equal(n.connectorToken.value, ''); assert.equal(n.command.value, ''); assert.equal(n.consent.checked, false);
  assert.equal(f.calls.filter(call => call.method === 'anywhere.connect').length, 1);
  f.callbacks.get('pagehide')(); assert.equal(f.intervals.size, 0);
  const secret = randomUUID(); const e = fixture(undefined, { parser: () => { throw new Error(secret); } }); await flush();
  e.nodes.command.value = 'invalid'; e.nodes.parse.emit('click'); await flush();
  assert.ok(!e.nodes.message.textContent.includes(secret)); assert.match(e.nodes.message.textContent, /request_failed/); e.callbacks.get('pagehide')();
});
test('pending connect cannot repopulate token after panel closure; bridge calls are serialized', async () => {
  let resolve;
  const f = fixture(method => method === 'anywhere.connect' ? new Promise(done => { resolve = done; }) : undefined);
  await flush(); f.nodes.connectorToken.value = randomUUID(); f.nodes.consent.checked = true; f.nodes.connection.emit('submit'); await flush();
  const before = f.calls.length; f.intervals.get(1)(); await flush(); assert.equal(f.calls.length, before);
  f.callbacks.get('pagehide')(); resolve({ connectorToken: randomUUID() }); await flush();
  assert.equal(f.nodes.connectorToken.value, ''); assert.equal(f.nodes.command.value, ''); assert.equal(f.intervals.size, 0);
  assert.equal(f.calls.length, before);
});
test('parsing fills local fields without selecting legacy or persisting secrets', async () => {
  const secret = `cxt_${randomUUID()}`; const f = fixture();
  await flush(); f.nodes.command.value = `uvx anywhere-cli start --server-url https://web.agents-anywhere.com --connector-id conn_fixture --connector-token ${secret}`; f.nodes.parse.emit('click'); await flush();
  assert.equal(f.nodes.connectorToken.value, secret); assert.equal(f.nodes.command.value, ''); assert.equal(f.nodes.profile.value, 'current'); assert.equal(f.nodes.consent.checked, false);
  f.nodes.serverUrl.value = 'https://chosen.example'; f.nodes.serverUrl.emit('input'); f.intervals.get(1)(); await flush(); assert.equal(f.nodes.serverUrl.value, 'https://chosen.example');
  f.callbacks.get('pagehide')(); assert.equal(f.nodes.connectorToken.value, '');
});

test('host locale changes translate controls, profiles, logs and known errors without changing input', async () => {
  const f = fixture();
  await flush();
  f.status.logs = [{ event: 'auth_http', detail: '401' }]; f.intervals.get(1)(); await flush();
  f.nodes.connectorToken.value = randomUUID(); const token = f.nodes.connectorToken.value;
  f.callbacks.get('locale')('zh-CN');
  assert.equal(f.nodes.connect.textContent, '连接／应用共享');
  assert.equal(f.nodes.profile.options[0].textContent, '新版（默认）');
  assert.match(f.nodes.profile.options[1].textContent, /不支持 Pi/);
  assert.ok(f.nodes.logs.children.some(node => /身份验证 HTTP 状态.*401/.test(node.textContent)));
  assert.equal(f.nodes.state.textContent, '未配置');
  f.nodes.command.value = '--server-url "unclosed'; f.nodes.parse.emit('click'); await flush();
  assert.match(f.nodes.message.textContent, /无法解析命令/);
  f.callbacks.get('locale')('en');
  assert.equal(f.nodes.connect.textContent, 'Connect / apply sharing');
  assert.equal(f.nodes.profile.options[0].textContent, 'Current (default)');
  assert.match(f.nodes.message.textContent, /Cannot parse the command/);
  assert.ok(f.nodes.logs.children.some(node => /Authentication HTTP status.*401/.test(node.textContent)));
  assert.equal(f.nodes.connectorToken.value, token); assert.equal(f.nodes.profile.value, 'current');
  assert.equal(f.nodes.profile.options[1].disabled, true); f.callbacks.get('pagehide')();
});
test('every visible translation key has matching English and Chinese entries', () => {
  const start = source.indexOf('  const words = '), end = source.indexOf('\n  const states = ');
  const dictionaries = runInNewContext(`${source.slice(start, end)}\nwords`);
  assert.deepEqual(Object.keys(dictionaries.en).sort(), Object.keys(dictionaries['zh-CN']).sort());
  const html = readFileSync(new URL('../plugins/adoin.panel.anywhere/renderer/index.html', import.meta.url), 'utf8');
  for (const [, key] of html.matchAll(/data-i18n="([^"]+)"/g)) assert.ok(dictionaries.en[key] && dictionaries['zh-CN'][key], key);
});

test('visual state attributes retain readable labels and reject unknown state styling', async () => {
  const f = fixture(); await flush();
  f.status.state = 'online'; f.status.runtime = { discovered: true, running: true };
  f.intervals.get(1)(); await flush();
  assert.equal(f.nodes.state.dataset.state, 'online'); assert.match(f.nodes.state.textContent, /Online/);
  assert.equal(f.nodes.running.dataset.active, 'true'); assert.equal(f.nodes.discovered.dataset.active, 'true');
  f.status.state = 'network_error'; f.intervals.get(1)(); await flush();
  assert.equal(f.nodes.state.dataset.state, 'network_error'); assert.match(f.nodes.state.textContent, /Network error/);
  f.status.state = 'untrusted value'; f.intervals.get(1)(); await flush();
  assert.equal(f.nodes.state.dataset.state, 'unknown'); f.callbacks.get('pagehide')();
});
test('panel styling supports both themes, narrow screens, focus and reduced motion', () => {
  const css = readFileSync(new URL('../plugins/adoin.panel.anywhere/renderer/panel.css', import.meta.url), 'utf8');
  assert.match(css, /data-theme="light"/); assert.match(css, /data-theme="dark"/);
  assert.match(css, /prefers-reduced-motion: reduce/); assert.match(css, /animation: none !important/);
  assert.match(css, /:focus-visible/); assert.match(css, /max-width: 480px/);
  assert.match(css, /data-state="online"/); assert.match(css, /data-state="network_error"/);
  assert.match(css, /var\(--pi-plugin-titlebar-height, 46px\)/);
  assert.doesNotMatch(css, /https?:\/\//);
});

test('missing bridge still produces local logs and a credential-free diagnostic report', async () => {
  const f = fixture(undefined, { noBridge: true }); await flush();
  assert.ok(f.nodes.logs.children.some(node => /Panel ready/.test(node.textContent)));
  assert.ok(f.nodes.logs.children.some(node => /bridge_unavailable/.test(node.textContent)));
  const secret = randomUUID(); f.nodes.connectorToken.value = secret; f.nodes.command.value = secret; f.nodes.connectorId.value = secret;
  f.nodes.diagnostics.emit('click');
  assert.match(f.nodes.report.value, /Bridge: missing/); assert.match(f.nodes.report.value, /anywhere.status:bridge_unavailable/);
  assert.ok(!f.nodes.report.value.includes(secret)); assert.equal(f.nodes.diagnostics.disabled, false);
  f.callbacks.get('pagehide')();
});
test('bridge timeout is logged and diagnostic export works while a request is pending', async () => {
  const f = fixture(method => method === 'anywhere.status' ? new Promise(() => {}) : undefined); await flush();
  assert.equal(f.nodes.diagnostics.disabled, false); f.nodes.diagnostics.emit('click'); assert.match(f.nodes.report.value, /panel_ready/);
  const timeout = [...f.deadlines.values()][0]; assert.equal(timeout.ms, 6000); timeout.fn(); await flush();
  assert.match(f.nodes.message.textContent, /bridge_timeout/);
  f.nodes.diagnostics.emit('click'); assert.match(f.nodes.report.value, /anywhere.status:bridge_timeout/);
  assert.equal(f.deadlines.size, 0); f.callbacks.get('pagehide')();
});
test('rejected connect and native invalid fields leave panel evidence without input values', async () => {
  const secret = randomUUID(); const f = fixture(method => { if (method === 'anywhere.connect') throw Object.assign(new Error(secret), { code: 'PERMISSION_DENIED' }); }); await flush();
  f.nodes.connectorToken.value = secret; f.nodes.consent.checked = true; f.nodes.connection.emit('submit'); await flush();
  f.nodes.connection.handlers.get('invalid')({ target: { id: 'connectorToken' } });
  f.nodes.diagnostics.emit('click'); assert.match(f.nodes.report.value, /anywhere.connect:permission_denied/);
  assert.match(f.nodes.report.value, /form_invalid: connectorToken/); assert.ok(!f.nodes.report.value.includes(secret));
  f.callbacks.get('pagehide')();
});
test('diagnostic reports preserve known network categories but omit arbitrary backend detail', async () => {
  const f = fixture(); await flush(); const secret = randomUUID();
  f.status.logs = [{ event: 'network_error', detail: 'WS_CONNECT:TLS_FAILURE' }, { event: 'network_error', detail: secret }, { event: 'auth_http', detail: '401' }];
  f.intervals.get(1)(); await flush(); f.nodes.diagnostics.emit('click');
  assert.match(f.nodes.report.value, /WS_CONNECT:TLS_FAILURE/); assert.match(f.nodes.report.value, /auth_http: 401/);
  assert.ok(!f.nodes.report.value.includes(secret)); f.callbacks.get('pagehide')();
});

test('self-hosted commands parse locally with no bridge or with stalled host status', async () => {
  for (const stalled of [false, true]) {
    const f = stalled ? fixture(method => method === 'anywhere.status' ? new Promise(() => {}) : undefined) : fixture(undefined, { noBridge: true });
    await flush();
    const token = `cxt_${randomUUID()}-_abc`; const id = `conn_${randomUUID()}`;
    f.nodes.command.value = `uvx anywhere-cli start --server-url https://anywhere.emssion.com --connector-id ${id} --connector-token ${token}`;
    assert.equal(f.nodes.parse.disabled, false); f.nodes.parse.emit('click'); await flush();
    assert.equal(f.nodes.serverUrl.value, 'https://anywhere.emssion.com'); assert.equal(f.nodes.connectorId.value, id); assert.equal(f.nodes.connectorToken.value, token);
    assert.equal(f.nodes.command.value, ''); assert.equal(f.nodes.consent.checked, false);
    assert.equal(f.calls.some(call => ['anywhere.parse', 'anywhere.connect'].includes(call.method)), false);
    f.nodes.diagnostics.emit('click'); assert.match(f.nodes.report.value, /command_parsed/);
    assert.ok(!f.nodes.report.value.includes(token)); assert.ok(!f.nodes.report.value.includes(id));
    f.callbacks.get('pagehide')(); f.nodes.parse.emit('click'); assert.equal(f.nodes.connectorToken.value, '');
  }
});
test('trailing commentary and missing local parser fail visibly without partial field updates', async () => {
  const f = fixture(); await flush(); const token = `cxt_${randomUUID()}`;
  f.nodes.connectorId.value = 'unchanged';
  f.nodes.command.value = `uvx anywhere-cli start --server-url https://anywhere.emssion.com --connector-id conn_fixture --connector-token ${token}附加说明`;
  f.nodes.parse.emit('click'); assert.equal(f.nodes.connectorId.value, 'unchanged'); assert.match(f.nodes.message.textContent, /invalid_config/);
  assert.equal(f.calls.some(call => call.method === 'anywhere.parse'), false); f.callbacks.get('pagehide')();
  const missing = fixture(undefined, { noParser: true }); await flush(); missing.nodes.parse.emit('click');
  assert.match(missing.nodes.message.textContent, /parser_unavailable/); missing.callbacks.get('pagehide')();
});

test('session sharing is separate opt-in, resets on all edits, parsing, connect and closure', async () => {
  const f = fixture(); await flush(); const n = f.nodes;
  assert.equal(n.shareSessions.checked, false);
  n.shareSessions.checked = true; n.connection.emit('submit'); await flush();
  assert.equal(f.calls.some(call => call.method === 'anywhere.connect'), false);
  for (const id of ['serverUrl', 'connectorId', 'connectorToken', 'profile', 'command']) {
    n.consent.checked = true; n.shareSessions.checked = true; n[id].emit('input');
    assert.equal(n.consent.checked, false, id); assert.equal(n.shareSessions.checked, false, id);
  }
  n.consent.checked = true; n.connection.emit('submit'); await flush();
  assert.equal(f.calls.find(call => call.method === 'anywhere.connect').args.shareSessions, false);
  n.consent.checked = true; n.shareSessions.checked = true; n.connection.emit('submit'); await flush();
  assert.equal(f.calls.filter(call => call.method === 'anywhere.connect').at(-1).args.shareSessions, true);
  assert.equal(n.shareSessions.checked, false);
  n.shareSessions.checked = true;
  n.command.value = `uvx anywhere-cli start --server-url https://web.agents-anywhere.com --connector-id conn_fixture --connector-token cxt_${randomUUID()}`;
  n.parse.emit('click'); assert.equal(n.shareSessions.checked, false);
  n.shareSessions.checked = true; f.callbacks.get('pagehide')(); assert.equal(n.shareSessions.checked, false);
});

test('sharing status and runtime instance are bounded, distinct and excluded from diagnostics', async () => {
  const f = fixture(); await flush(); const n = f.nodes;
  assert.equal(n.sharingReady.textContent, 'Unknown'); assert.equal(n.runtimeSetup.hidden, true);
  const privatePath = 'C:\\private\\workspace';
  f.status.pluginVersion = '2.2.0';
  f.status.state = 'online'; f.status.runtime = { discovered: true, running: false, runtimeId: 'instance-'.repeat(40) };
  f.status.sharing = { enabled: true, ready: false, workspaceName: '<workspace>'.repeat(40), workspacePath: privatePath, sessionCount: 3, lastSyncAt: '2026-01-01T00:00:00.000Z' };
  f.intervals.get(1)(); await flush();
  assert.equal(n.sharingEnabled.textContent, 'Yes'); assert.equal(n.sharingReady.textContent, 'No');
  assert.equal(n.sessionCount.textContent, '3'); assert.equal(n.lastSyncAt.textContent, '2026-01-01T00:00:00.000Z');
  assert.equal(n.workspaceName.textContent.length, 160); assert.equal(n.runtimeId.textContent.length, 160);
  assert.equal(n.workspaceName.children.length, 0); assert.equal(n.runtimeSetup.hidden, false);
  assert.match(n.runtimeSetup.textContent, /save its empty config, then enable it/);
  f.callbacks.get('locale')('zh-CN'); assert.match(n.runtimeSetup.textContent, /保存其空配置/);
  f.callbacks.get('locale')('en'); n.diagnostics.emit('click');
  assert.match(n.report.value, /Panel: 2\.2\.2\n/); assert.match(n.report.value, /Plugin: 2\.2\.0\n/);
  for (const privateValue of [privatePath, '<workspace>', 'instance-']) assert.ok(!n.report.value.includes(privateValue));
  f.status.runtime.running = true; f.status.sharing = { enabled: false, ready: true, workspaceName: 'not approved', sessionCount: -1, lastSyncAt: privatePath };
  f.intervals.get(1)(); await flush();
  assert.equal(n.runtimeSetup.hidden, true); assert.equal(n.sharingReady.textContent, 'Yes');
  assert.equal(n.workspaceName.textContent, '—'); assert.equal(n.sessionCount.textContent, 'Unknown'); assert.equal(n.lastSyncAt.textContent, '—');
  assert.ok(f.calls.every(call => call.method === 'anywhere.status'));
  f.callbacks.get('pagehide')();
});

test('encrypted saved connection restores fields without secrets or sharing consent', async () => {
  const publicSaved = { profile: 'current', serverUrl: 'https://web.agents-anywhere.com', connectorId: 'saved-id', encrypted: true };
  const f = fixture(method => method === 'anywhere.status' ? { ...publicSaved, savedConnection: publicSaved, profiles: [{ id: 'current', enabled: true }], logs: [] } : undefined);
  await flush(); const n = f.nodes;
  assert.equal(n.connectorId.value, 'saved-id'); assert.equal(n.useSaved.checked, true);
  assert.equal(n.connectorToken.value, ''); assert.equal(n.connectorToken.required, false);
  assert.equal(n.consent.checked, false); assert.equal(n.shareSessions.checked, false);
  n.vaultPassword.value = randomUUID(); n.serverUrl.emit('input');
  assert.equal(n.useSaved.checked, false); assert.equal(n.vaultPassword.value, ''); assert.equal(n.connectorToken.required, true);
  f.callbacks.get('pagehide')();
});

test('password is submitted only to connect, cleared on failure, and absent from diagnostics', async () => {
  let received; const password = randomUUID();
  const f = fixture((method, args) => {
    if (method === 'anywhere.connect') { received = { ...args }; throw Object.assign(new Error('private'), { code: 'unlock_failed' }); }
  });
  await flush(); const n = f.nodes;
  n.rememberConnection.checked = true; n.rememberConnection.emit('change');
  n.vaultPassword.value = password; n.consent.checked = true; n.connection.emit('submit'); await flush();
  assert.equal(received.vaultPassword, password); assert.equal(received.rememberConnection, true);
  assert.equal(n.vaultPassword.value, ''); assert.match(n.message.textContent, /unlock_failed/);
  n.diagnostics.emit('click'); assert.ok(!n.report.value.includes(password));
  n.vaultPassword.value = password; f.callbacks.get('pagehide')(); assert.equal(n.vaultPassword.value, '');
});

test('forget requires separate confirmation and clears only connection controls', async () => {
  const f = fixture(method => method === 'anywhere.forget' ? {} : undefined); await flush(); const n = f.nodes;
  n.forgetConnection.emit('click'); await flush(); assert.ok(!f.calls.some(c => c.method === 'anywhere.forget'));
  n.forgetConsent.checked = true; n.forgetConsent.emit('change'); assert.equal(n.forgetConnection.disabled, false);
  n.connectorToken.value = randomUUID(); n.vaultPassword.value = randomUUID(); n.forgetConnection.emit('click'); await flush();
  assert.equal(f.calls.find(c => c.method === 'anywhere.forget').args.confirm, true);
  assert.equal(n.vaultPassword.value, ''); assert.equal(n.connectorToken.value, ''); assert.equal(n.forgetConsent.checked, false);
  f.callbacks.get('pagehide')();
});

const tabKey = 'adoin.panel.anywhere.activeTab.v1';
function assertTab(f, selected) {
  for (const id of ['status', 'connections', 'events']) {
    assert.equal(f.nodes[`panel-${id}`].hidden, id !== selected);
    assert.equal(f.nodes[`tab-${id}`].attributes['aria-selected'], String(id === selected));
    assert.equal(f.nodes[`tab-${id}`].tabIndex, id === selected ? 0 : -1);
  }
}
test('tabs default to status, switch exclusively and persist only fixed navigation IDs across reopen', async () => {
  const f = fixture(); await flush(); assertTab(f, 'status'); assert.deepEqual(f.writes, []);
  const secret = randomUUID();
  for (const id of ['connectorToken', 'connectorId', 'command', 'vaultPassword']) f.nodes[id].value = secret;
  f.nodes.consent.checked = true; f.nodes.shareSessions.checked = true;
  for (const id of ['connections', 'events', 'status', 'events']) {
    f.nodes[`tab-${id}`].emit('click'); assertTab(f, id);
  }
  assert.equal(f.nodes.connectorToken.value, secret); assert.equal(f.nodes.consent.checked, true); assert.equal(f.nodes.shareSessions.checked, true);
  assert.deepEqual(f.writes, ['connections', 'events', 'status', 'events'].map(id => [tabKey, id]));
  f.callbacks.get('pagehide')();
  const reopened = fixture(undefined, { storage: f.storage }); await flush(); assertTab(reopened, 'events');
  assert.equal(reopened.nodes.connectorToken.value, ''); assert.equal(reopened.nodes.consent.checked, false);
  reopened.callbacks.get('pagehide')();
});
test('corrupt or blocked tab storage falls back safely; failed writes do not block navigation', async () => {
  for (const value of ['', 'STATUS', 'unknown', '__proto__', '{"tab":"events"}', 'events '.repeat(500)]) {
    const f = fixture(undefined, { storage: new Map([[tabKey, value]]) }); await flush(); assertTab(f, 'status');
    assert.deepEqual(f.writes, []); f.nodes['tab-events'].emit('click'); assertTab(f, 'events'); f.callbacks.get('pagehide')();
  }
  for (const options of [{ blockStorage: true }, { blockWrites: true }]) {
    const f = fixture(undefined, options); await flush(); assertTab(f, 'status');
    f.nodes['tab-connections'].emit('click'); assertTab(f, 'connections'); assert.deepEqual(f.writes, []);
    assert.equal(f.nodes.parse.disabled, false); f.callbacks.get('pagehide')();
  }
});
test('horizontal tabs support wrapped arrows, Home and End with roving focus during pending requests', async () => {
  const f = fixture(method => method === 'anywhere.status' ? new Promise(() => {}) : undefined); await flush();
  for (const [from, key, to] of [['status', 'ArrowLeft', 'events'], ['events', 'ArrowRight', 'status'], ['status', 'End', 'events'], ['events', 'Home', 'status'], ['status', 'ArrowRight', 'connections']]) {
    assert.equal(f.nodes[`tab-${from}`].disabled, false);
    assert.equal(f.nodes[`tab-${from}`].emit('keydown', { key }).defaultPrevented, true);
    assertTab(f, to); assert.equal(f.nodes[`tab-${to}`].focused, true);
  }
  assert.equal(f.nodes['tab-connections'].emit('keydown', { key: 'Tab' }).defaultPrevented, undefined);
  assert.equal(f.nodes['tab-connections'].emit('keydown', { key: 'Home', ctrlKey: true }).defaultPrevented, undefined);
  assertTab(f, 'connections');
  f.nodes['tab-events'].emit('click'); f.nodes.diagnostics.emit('click'); assert.match(f.nodes.report.value, /Panel: 2\.2\.2/);
  f.callbacks.get('locale')('zh-CN'); assertTab(f, 'events');
  assert.deepEqual(['status', 'connections', 'events'].map(id => f.nodes[`tab-${id}`].textContent), ['状态', '连接管理', '事件']);
  f.callbacks.get('pagehide')(); f.nodes['tab-status'].emit('click'); assertTab(f, 'events');
});
test('HTML exposes linked tabs and panels, preserves all controls and contains no Beta labels', () => {
  const html = readFileSync(new URL('../plugins/adoin.panel.anywhere/renderer/index.html', import.meta.url), 'utf8');
  assert.equal([...html.matchAll(/role="tablist"/g)].length, 1);
  assert.equal([...html.matchAll(/role="tabpanel"/g)].length, 3);
  for (const id of ['status', 'connections', 'events']) {
    assert.match(html, new RegExp(`id="tab-${id}"[^>]*role="tab"[^>]*aria-controls="panel-${id}"`));
    assert.match(html, new RegExp(`id="panel-${id}"[^>]*role="tabpanel"[^>]*aria-labelledby="tab-${id}"`));
  }
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of Object.keys(fixture().nodes)) assert.ok(ids.includes(id), id);
  assert.doesNotMatch(html, /beta/i);
  const dictionaries = runInNewContext(`${source.slice(source.indexOf('  const words = '), source.indexOf('\n  const states = '))}\nwords`);
  assert.doesNotMatch(JSON.stringify(dictionaries), /beta/i);
});

test('self-hosted origin editing revokes consent and redirect diagnostics remain sanitized', async () => {
  const f = fixture(); await flush(); const n = f.nodes;
  n.consent.checked = true; n.shareSessions.checked = true; n.useSaved.checked = true;
  n.serverUrl.value = 'https://selfhost.example:8443'; n.serverUrl.emit('input');
  assert.equal(n.consent.checked, false); assert.equal(n.shareSessions.checked, false); assert.equal(n.useSaved.checked, false);
  f.status.logs = [
    { event: 'protocol_incompatible', detail: 'AUTH:REDIRECT_DISALLOWED' },
    { event: 'protocol_incompatible', detail: 'INGEST:REDIRECT_POLICY_UNAVAILABLE' },
    { event: 'protocol_incompatible', detail: 'private header contents' }
  ];
  f.intervals.get(1)(); await flush(); n.diagnostics.emit('click');
  assert.match(n.report.value, /AUTH:REDIRECT_DISALLOWED/); assert.match(n.report.value, /INGEST:REDIRECT_POLICY_UNAVAILABLE/);
  assert.ok(!n.report.value.includes('private header contents'));
  f.callbacks.get('pagehide')();
});

const projectInventory = (count = 3) => ({
  projects: Array.from({ length: count }, (_, i) => ({ id: `project-${i}`, name: `<Private project ${i}>`, path: `C:/private/project-${i}` })),
  selectedProjectIds: ['project-1', 'removed-id'], useProjects: true
});
const projectBoxes = n => n.projectsList.children.map(label => label.children[0]);
test('projects load only explicitly, restore known IDs without consent, and never persist project data in browser storage', async () => {
  const inventory = projectInventory();
  const f = fixture(method => method === 'anywhere.projects' ? inventory : undefined); await flush(); const n = f.nodes;
  assert.equal(n.useProjects.checked, false); assert.ok(f.calls.every(c => c.method === 'anywhere.status'));
  n.consent.checked = true; n.shareSessions.checked = true; n.loadProjects.emit('click'); await flush();
  assert.equal(n.useProjects.checked, false); assert.deepEqual(projectBoxes(n).map(b => b.checked), [false, true, false]);
  assert.equal(n.consent.checked, false); assert.equal(n.shareSessions.checked, false);
  assert.match(n.projectsCount.textContent, /^1 \/ 3/);
  assert.deepEqual(Object.keys(f.calls.find(c => c.method === 'anywhere.projects').args).sort(), ['connectorId', 'profile', 'serverUrl']);
  assert.equal(n.projectsList.children[0].children[1].children[0].textContent, inventory.projects[0].name);
  assert.equal(n.projectsList.children[0].children[1].children[0].children.length, 0);
  n.diagnostics.emit('click'); assert.match(n.report.value, /bridge_request: anywhere.projects/);
  for (const p of inventory.projects) { assert.ok(!n.report.value.includes(p.name)); assert.ok(!n.report.value.includes(p.path)); }
  assert.deepEqual(f.writes, []);
  f.callbacks.get('pagehide')(); assert.equal(n.projectsList.children.length, 0); assert.equal(n.useProjects.checked, false);
});
test('bulk and individual project scope edits reset both grants; connect sends IDs only for project mode', async () => {
  const f = fixture(method => method === 'anywhere.projects' ? projectInventory() : undefined); await flush(); const n = f.nodes;
  n.loadProjects.emit('click'); await flush();
  n.consent.checked = true; n.shareSessions.checked = true; n.selectAllProjects.emit('click');
  assert.ok(projectBoxes(n).every(b => b.checked)); assert.equal(n.consent.checked, false); assert.equal(n.shareSessions.checked, false);
  n.consent.checked = true; n.connection.emit('submit'); await flush();
  let args = f.calls.filter(c => c.method === 'anywhere.connect').at(-1).args;
  assert.equal(args.useProjects, true); assert.equal(args.shareSessions, false); assert.deepEqual(Array.from(args.projectIds), ['project-0', 'project-1', 'project-2']);
  n.consent.checked = true; n.shareSessions.checked = true;
  const box = projectBoxes(n)[0]; box.checked = false; box.emit('change');
  assert.equal(n.consent.checked, false); assert.equal(n.shareSessions.checked, false);
  n.scopeCurrent.checked = true; n.scopeCurrent.emit('change'); n.consent.checked = true; n.connection.emit('submit'); await flush();
  args = f.calls.filter(c => c.method === 'anywhere.connect').at(-1).args;
  assert.equal(args.useProjects, false); assert.equal(args.projectIds.length, 0);
  n.consent.checked = true; n.shareSessions.checked = true; n.clearProjects.emit('click');
  assert.equal(n.consent.checked, false); assert.equal(n.shareSessions.checked, false); assert.ok(projectBoxes(n).every(b => !b.checked));
  n.scopeProjects.checked = true; n.scopeProjects.emit('change'); n.consent.checked = true;
  const before = f.calls.length; n.connection.emit('submit'); await flush();
  assert.equal(f.calls.length, before); assert.match(n.message.textContent, /project_selection_invalid/);
  f.callbacks.get('pagehide')();
});
test('identity edits and parser invalidate inventory, while token typing preserves project scope', async () => {
  const f = fixture(method => method === 'anywhere.projects' ? projectInventory() : undefined); await flush(); const n = f.nodes;
  for (const id of ['serverUrl', 'connectorId', 'profile', 'command']) {
    n.loadProjects.emit('click'); await flush(); n.consent.checked = true; n.shareSessions.checked = true; n[id].emit('input');
    assert.equal(n.useProjects.checked, false, id); assert.equal(n.projectsList.children.length, 0, id);
    assert.equal(n.scopeCurrent.checked, true, id); assert.equal(n.scopeProjects.checked, false, id);
    assert.equal(n.consent.checked, false); assert.equal(n.shareSessions.checked, false);
  }
  n.scopeProjects.checked = true; n.scopeProjects.emit('change'); n.loadProjects.emit('click'); await flush(); n.connectorToken.emit('input');
  assert.equal(n.useProjects.checked, true); assert.equal(projectBoxes(n)[1].checked, true);
  n.parse.emit('click'); assert.equal(n.useProjects.checked, false); assert.equal(n.projectsList.children.length, 0);
  f.callbacks.get('pagehide')();
});
test('project selection caps at 32, inventory caps at 200, and empty inventories are visible', async () => {
  let inventory = projectInventory(33); inventory.selectedProjectIds = [];
  const f = fixture(method => method === 'anywhere.projects' ? inventory : undefined); await flush(); const n = f.nodes;
  n.loadProjects.emit('click'); await flush(); n.selectAllProjects.emit('click');
  assert.match(n.message.textContent, /project_selection_invalid/); assert.ok(projectBoxes(n).every(b => !b.checked));
  for (const box of projectBoxes(n)) { box.checked = true; box.emit('change'); }
  assert.equal(projectBoxes(n).filter(b => b.checked).length, 32); assert.match(n.projectsCount.textContent, /^32 \/ 33/);
  inventory = projectInventory(201); n.loadProjects.emit('click'); await flush();
  assert.equal(n.projectsList.children.length, 0); assert.match(n.message.textContent, /projects_unavailable/);
  inventory = { projects: [], selectedProjectIds: [], useProjects: false }; n.loadProjects.emit('click'); await flush();
  assert.match(n.projectsState.textContent, /No saved projects/); assert.equal(n.selectAllProjects.disabled, true);
  f.callbacks.get('pagehide')();
});
test('project errors are bilingual fixed codes and late inventory cannot restore after pagehide', async () => {
  for (const code of ['project_selection_invalid', 'project_selection_changed', 'projects_unavailable']) {
    const f = fixture(method => { if (method === 'anywhere.projects') throw Object.assign(new Error('private path'), { code }); }); await flush();
    f.nodes.loadProjects.emit('click'); await flush(); assert.ok(f.nodes.message.textContent.includes(code));
    f.callbacks.get('locale')('zh-CN'); assert.match(f.nodes.message.textContent, /项目/);
    f.nodes.diagnostics.emit('click'); assert.ok(f.nodes.report.value.includes(`anywhere.projects:${code}`)); assert.ok(!f.nodes.report.value.includes('private path'));
    f.callbacks.get('pagehide')();
  }
  let resolve;
  const f = fixture(method => method === 'anywhere.projects' ? new Promise(done => { resolve = done; }) : undefined); await flush();
  f.nodes.loadProjects.emit('click'); await flush(); assert.match(f.nodes.projectsState.textContent, /Loading/);
  f.callbacks.get('pagehide')(); resolve(projectInventory()); await flush();
  assert.equal(f.nodes.projectsList.children.length, 0); assert.equal(f.nodes.useProjects.checked, false);
});

test('reloading never selects newly saved projects and explicit sharing reaches connect without names or paths', async () => {
  let inventory = projectInventory(2);
  const f = fixture(method => method === 'anywhere.projects' ? inventory : undefined); await flush(); const n = f.nodes;
  n.loadProjects.emit('click'); await flush();
  inventory = projectInventory(3); n.loadProjects.emit('click'); await flush();
  assert.deepEqual(projectBoxes(n).map(box => box.checked), [false, true, false]);
  assert.equal(n.consent.checked, false); assert.equal(n.shareSessions.checked, false);
  n.selectAllProjects.emit('click'); n.shareSessions.checked = true; n.consent.checked = true;
  n.connection.emit('submit'); await flush();
  const args = f.calls.find(call => call.method === 'anywhere.connect').args;
  assert.equal(args.shareSessions, true); assert.equal(args.useProjects, true);
  assert.deepEqual(Array.from(args.projectIds), ['project-0', 'project-1', 'project-2']);
  for (const p of inventory.projects) { assert.ok(!JSON.stringify(args).includes(p.name)); assert.ok(!JSON.stringify(args).includes(p.path)); }
  assert.equal(f.calls.filter(call => call.method === 'anywhere.connect').length, 1);
  f.callbacks.get('pagehide')();
  const html = readFileSync(new URL('../plugins/adoin.panel.anywhere/renderer/index.html', import.meta.url), 'utf8');
  assert.match(html, /class="badge">2\.2\.2</);
});

test('reopened saved connection restores project choices locally without granting sharing', async () => {
  const f = fixture(method => {
    if (method === 'anywhere.status') return { state:'unconfigured', serverUrl:'https://selfhost.example', connectorId:'conn_restore', profile:'current', savedConnection:{encrypted:true}, profiles:[{id:'current',enabled:true}], logs:[] };
    if (method === 'anywhere.projects') return { projects:[{id:'1',name:'Selected',path:'C:/selected'},{id:'2',name:'New',path:'C:/new'}],selectedProjectIds:['1'],useProjects:true };
  });
  await flush();
  assert.equal(f.nodes.useProjects.checked,true);
  assert.equal(f.nodes.projectsList.children[0].children[0].checked,true);
  assert.equal(f.nodes.projectsList.children[1].children[0].checked,false);
  assert.equal(f.nodes.consent.checked,false); assert.equal(f.nodes.shareSessions.checked,false);
  assert.ok(f.calls.every(c=>['anywhere.status','anywhere.projects'].includes(c.method)));
  f.callbacks.get('pagehide')();
});

test('visible scope radios and select all switch scope without granting either consent', async () => {
  const inventory = { ...projectInventory(), selectedProjectIds: [], useProjects: false };
  const f = fixture(method => method === 'anywhere.projects' ? inventory : undefined); await flush(); const n = f.nodes;
  assert.equal(n.scopeCurrent.checked, true); assert.equal(n.scopeProjects.checked, false);
  assert.equal(n.loadProjects.disabled, false);
  n.loadProjects.emit('click'); await flush();
  assert.equal(n.projectsList.dataset.inactive, 'true'); assert.match(n.scopeHelp.textContent, /inactive/);
  assert.equal(n.selectAllProjects.disabled, false); assert.ok(projectBoxes(n).every(box => !box.disabled));
  n.consent.checked = true; n.shareSessions.checked = true; n.selectAllProjects.emit('click');
  assert.equal(n.scopeCurrent.checked, false); assert.equal(n.scopeProjects.checked, true); assert.equal(n.useProjects.checked, true);
  assert.equal(n.consent.checked, false); assert.equal(n.shareSessions.checked, false);
  assert.equal(n.projectsList.dataset.inactive, 'false'); assert.ok(projectBoxes(n).every(box => box.checked));
  assert.ok(!f.calls.some(call => call.method === 'anywhere.connect'));
  n.scopeCurrent.checked = true; n.scopeCurrent.emit('change');
  assert.equal(n.scopeProjects.checked, false); assert.ok(projectBoxes(n).every(box => box.checked));
  n.consent.checked = true; n.connection.emit('submit'); await flush();
  const args = f.calls.find(call => call.method === 'anywhere.connect').args;
  assert.equal(args.useProjects, false); assert.equal(args.projectIds.length, 0); assert.equal(args.shareSessions, false);
  n.clearProjects.emit('click');
  const box = projectBoxes(n)[0]; n.consent.checked = true; n.shareSessions.checked = true; box.checked = true; box.emit('change');
  assert.equal(n.scopeProjects.checked, true); assert.equal(n.scopeCurrent.checked, false);
  assert.equal(n.consent.checked, false); assert.equal(n.shareSessions.checked, false);
  n.connectorToken.emit('input'); assert.equal(n.scopeProjects.checked, true); assert.equal(box.checked, true);
  f.callbacks.get('pagehide')();
});

test('readiness stays outside tabs and follows runtime.start through first sync without claiming remote visibility', async () => {
  const html = readFileSync(new URL('../plugins/adoin.panel.anywhere/renderer/index.html', import.meta.url), 'utf8');
  assert.match(html, /<\/nav>\s*<aside id="readiness"[\s\S]*?<\/aside>\s*<div id="panel-status"/);
  assert.equal([...html.matchAll(/id="runtimeSetup"/g)].length, 1);
  const f = fixture(); await flush(); const n = f.nodes;
  assert.match(n.readinessMessage.textContent, /Not connected/);
  n.readinessAction.emit('click'); assertTab(f, 'connections'); assert.equal(n['tab-connections'].focused, true);
  f.status.state = 'online'; f.status.runtime = { discovered: true, running: false }; f.status.sharing = { enabled: true, ready: false };
  f.intervals.get(1)(); await flush();
  for (const tab of ['status', 'connections', 'events']) {
    n[`tab-${tab}`].emit('click'); assertTab(f, tab);
    assert.equal(n.runtimeSetup.hidden, false); assert.equal(n.readinessMessage.hidden, true);
    assert.match(n.runtimeSetup.textContent, /Device connected.*Pi Desktop.*Available to add.*First setup only.*Connector token cannot create runtime/);
  }
  f.status.logs = [{ event: 'rpc', detail: 'runtime.start:ok' }];
  f.status.runtime.running = true; f.status.sharing.enabled = false;
  f.intervals.get(1)(); await flush();
  assert.equal(n.runtimeSetup.hidden, true); assert.equal(n.readinessMessage.hidden, false);
  assert.match(n.readinessMessage.textContent, /Connection only.*disabled/);
  assert.equal(n.readinessAction.dataset.tab, 'connections');
  f.status.sharing.enabled = true; f.intervals.get(1)(); await flush();
  assert.match(n.readinessMessage.textContent, /not ready/);
  f.status.sharing.ready = true; f.intervals.get(1)(); await flush();
  assert.match(n.readinessMessage.textContent, /awaiting first status sync/);
  f.status.sharing.lastSyncAt = '2026-01-01T00:00:00.000Z'; f.intervals.get(1)(); await flush();
  assert.match(n.readinessMessage.textContent, /sync active.*does not verify the remote project count/);
  f.callbacks.get('locale')('zh-CN'); assert.match(n.readinessMessage.textContent, /同步已活跃/);
  f.status.state = 'network_error'; f.intervals.get(1)(); await flush();
  assert.equal(n.readinessAction.hidden, false); assert.equal(n.readinessAction.dataset.tab, 'events');
  n.readinessAction.emit('click'); assertTab(f, 'events');
  assert.ok(f.calls.every(call => call.method === 'anywhere.status'));
  f.callbacks.get('pagehide')();
});

test('HTML has exactly two visible scope radios and separates scope, sharing and connection consent', () => {
  const html = readFileSync(new URL('../plugins/adoin.panel.anywhere/renderer/index.html', import.meta.url), 'utf8');
  assert.equal([...html.matchAll(/type="radio" name="sharingScope"/g)].length, 2);
  assert.match(html, /id="useProjects"[^>]*hidden[^>]*tabindex="-1"/);
  assert.ok(html.indexOf('id="scopeCurrent"') < html.indexOf('id="shareSessions"'));
  assert.ok(html.indexOf('id="shareSessions"') < html.indexOf('id="consent"'));
  assert.ok(html.indexOf('id="consent"') < html.indexOf('id="connect"'));
});

test('manual project refresh preserves draft scope and surviving selections instead of saved preferences', async () => {
  let inventory = projectInventory(); inventory.useProjects = false;
  const f = fixture(method => method === 'anywhere.projects' ? inventory : undefined); await flush(); const n = f.nodes;
  n.scopeProjects.checked = true; n.scopeProjects.emit('change'); n.loadProjects.emit('click'); await flush();
  assert.equal(n.scopeProjects.checked, true);
  n.selectAllProjects.emit('click');
  inventory = { projects: [{id:'project-0',name:'Same',path:'C:/private/project-0'}, {id:'project-1',name:'Moved',path:'C:/moved'}, {id:'new',name:'New',path:'C:/new'}], selectedProjectIds:['new'], useProjects:false };
  n.loadProjects.emit('click'); await flush();
  assert.equal(n.scopeProjects.checked, true); assert.deepEqual(projectBoxes(n).map(b => b.checked), [true,false,false]);
  n.clearProjects.emit('click'); n.loadProjects.emit('click'); await flush();
  assert.ok(projectBoxes(n).every(b => !b.checked));
  n.scopeCurrent.checked = true; n.scopeCurrent.emit('change'); inventory.useProjects = true;
  n.loadProjects.emit('click'); await flush(); assert.equal(n.scopeCurrent.checked, true);
  f.callbacks.get('pagehide')();
});

test('failed project refresh keeps selected-project scope but clears unverified inventory', async () => {
  const f = fixture(method => { if (method === 'anywhere.projects') throw new Error('Unavailable'); }); await flush(); const n = f.nodes;
  n.scopeProjects.checked = true; n.scopeProjects.emit('change'); n.loadProjects.emit('click'); await flush();
  assert.equal(n.scopeProjects.checked, true); assert.equal(n.projectsList.children.length, 0);
  assert.equal(n.consent.checked, false); assert.equal(n.shareSessions.checked, false); f.callbacks.get('pagehide')();
});
