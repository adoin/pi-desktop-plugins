import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
const source = readFileSync(new URL('../plugins/pi.agents-anywhere/renderer/panel.js', import.meta.url), 'utf8');
const parserSource = readFileSync(new URL('../plugins/pi.agents-anywhere/src/connection-input.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
class Element {
  constructor(value = '') { this.value = value; this.dataset = {}; this.disabled = false; this.checked = false; this.handlers = new Map(); this.children = []; this.textContent = ''; }
  addEventListener(event, fn) { this.handlers.set(event, fn); }
  emit(event) { return this.handlers.get(event)?.({ preventDefault() {} }); }
  setAttribute() {}
  replaceChildren() { this.children = []; }
  appendChild(child) { this.children.push(child); }
}
function fixture(override, options = {}) {
  const ids = ['connect', 'disconnect', 'parse', 'refresh', 'diagnostics', 'report', 'consent', 'connection', 'profile', 'message', 'logs', 'state', 'discovered', 'running', 'serverUrl', 'connectorId', 'connectorToken', 'command'];
  const nodes = Object.fromEntries(ids.map(id => [id, new Element()]));
  nodes.profile.value = 'current'; nodes.profile.options = [new Element('current'), new Element('legacy')];
  Object.defineProperty(nodes.profile, 'selectedOptions', { get: () => nodes.profile.options.filter(option => option.value === nodes.profile.value) });
  const fields = ['consent', 'profile', 'serverUrl', 'connectorId', 'connectorToken', 'command'].map(id => nodes[id]);
  nodes.connection.querySelectorAll = () => fields;
  const buttons = ['connect', 'disconnect', 'parse', 'refresh'].map(id => nodes[id]);
  for (const id of ['connect', 'disconnect', 'parse', 'refresh']) nodes[id].dataset.i18n = id;
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
  if (options.noBridge) delete window.pluginBridge;
  if (!options.noParser) runInNewContext(parserSource, { window, URL });
  if (options.parser) window.AnywhereInput = { parseCommand: options.parser };
  runInNewContext(source, { window, document: { documentElement: { lang: 'en' }, hidden: false, getElementById: id => nodes[id], createElement: () => new Element(), querySelectorAll: () => buttons }, setTimeout: (fn, ms) => { const id = ++deadlineId; deadlines.set(id, { fn, ms }); return id; }, clearTimeout: id => deadlines.delete(id), setInterval: fn => { intervals.set(1, fn); return 1; }, clearInterval: id => intervals.delete(id) });
  return { nodes, calls, status, callbacks, intervals, deadlines };
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
  assert.equal(f.nodes.connect.textContent, '连接');
  assert.equal(f.nodes.profile.options[0].textContent, '新版（默认）');
  assert.match(f.nodes.profile.options[1].textContent, /不支持 Pi/);
  assert.ok(f.nodes.logs.children.some(node => /身份验证 HTTP 状态.*401/.test(node.textContent)));
  assert.equal(f.nodes.state.textContent, '未配置');
  f.nodes.command.value = '--server-url "unclosed'; f.nodes.parse.emit('click'); await flush();
  assert.match(f.nodes.message.textContent, /无法解析命令/);
  f.callbacks.get('locale')('en');
  assert.equal(f.nodes.connect.textContent, 'Connect');
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
  const html = readFileSync(new URL('../plugins/pi.agents-anywhere/renderer/index.html', import.meta.url), 'utf8');
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
  const css = readFileSync(new URL('../plugins/pi.agents-anywhere/renderer/panel.css', import.meta.url), 'utf8');
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
