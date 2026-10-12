import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PiBridge } = require('../plugins/adoin.panel.anywhere/src/pi-bridge');
const { SessionService } = require('../plugins/adoin.panel.anywhere/src/sessions');
const { Connector } = require('../plugins/adoin.panel.anywhere/src/connector');
const root = path.resolve('chat-fixture');
const scope = { runtime: 'pi', runtimeId: 'rti_fixture' };
const flush = () => new Promise(resolve => setImmediate(resolve));
async function fixture() {
  const state = { settings: {}, calls: [], notices: [], replies: [], timers: new Map(), sessions: new Map(), running: new Map(), workspace: root, sockets: 0, handlers: {} };
  const base = { id: 'existing', title: 'Existing', projectPath: root, providerId: 'provider', modelId: 'model', permissionMode: 'ask', mode: 'agent', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', messages: [] };
  state.sessions.set(base.id, base);
  const pi = {
    events: new EventEmitter(), workspace: { get: async () => ({ path: state.workspace, name: 'Fixture' }) },
    plugin: { getSettings: async () => structuredClone(state.settings), setSettings: async patch => { Object.assign(state.settings, structuredClone(patch)); } },
    models: { list: async () => [{ key: 'provider/model', providerId: 'provider', modelId: 'model', label: 'Fixture', isDefault: true }] },
    desktop: {
      listOperations: async () => ['session/list', 'session/get', 'session/create', 'session/configure', 'agent/prompt', 'agent/abort', 'agent/getStatus'].map(id => ({ id })),
      invoke: async input => {
        state.calls.push(input); const [arg, patch] = input.args;
        if (state.handlers[input.operation]) return state.handlers[input.operation](input);
        switch (input.operation) {
          case 'session/list': return { sessions: [...state.sessions.values()].map(({ messages, ...s }) => s) };
          case 'session/get': {
            const s = state.sessions.get(arg.id); const end = arg.messageBefore ?? s.messages.length; const start = Math.max(0, end - arg.messageLimit);
            return { session: { ...s, messages: s.messages.slice(start, end), messageStart: start, hasMoreBefore: start > 0 } };
          }
          case 'session/create': { const s = { ...base, ...arg, id: `created-${state.sessions.size}`, messages: [] }; state.sessions.set(s.id, s); return { session: s }; }
          case 'session/configure': assert.equal(input.confirm, true); Object.assign(state.sessions.get(arg), patch); return { session: state.sessions.get(arg) };
          case 'agent/getStatus': return { status: { isRunning: state.running.has(arg), currentTurnId: state.running.get(arg), pendingToolConfirmations: 0 } };
          case 'agent/prompt': {
            const turnId = randomUUID(); state.running.set(arg.sessionId, turnId);
            state.sessions.get(arg.sessionId).messages.push({ id: arg.messageId, role: 'user', content: arg.content, status: 'done' });
            return { accepted: true, turnId };
          }
          case 'agent/abort': { const ok = state.running.get(arg.sessionId) === arg.turnId; if (ok) state.running.delete(arg.sessionId); return { ok }; }
          default: throw new Error('Unexpected fixture operation');
        }
      },
    },
    net: {
      getCapabilities: async () => ({ fetchRedirectModes: ['error'] }),
      fetch: async input => {
        assert.equal(new URL(input.url).origin, 'https://selfhost.example:8443'); assert.equal(input.redirect, 'error');
        if (input.url.endsWith('/ingest')) { const { notifications } = JSON.parse(input.body); state.notices.push(...notifications); return { status: 200, bodyText: JSON.stringify({ accepted: notifications.length, rejected: [], serverTime: '2026-01-01T00:00:00Z' }) }; }
        return { status: 200, bodyText: JSON.stringify({ accessToken: randomUUID(), expiresIn: 900 }) };
      },
      websocket: { connect: async () => ({ socketId: `socket-${++state.sockets}` }), send: async input => state.replies.push(JSON.parse(input.data)), close: async () => {} },
    },
  };
  let timerId = 0;
  const client = new Connector(pi, { random: () => 0, setTimeout: (fn, ms) => { state.timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: id => state.timers.delete(id) });
  const context = { profile: 'current', serverUrl: 'https://selfhost.example:8443', connectorId: 'conn_fixture', connectorToken: randomUUID() };
  const makeService = async () => { const bridge = new PiBridge(pi, await PiBridge.capture(pi)); const service = new SessionService(pi, bridge, context, (method, params) => client.notify(method, params)); await service.initialize(); return service; };
  const service = await makeService(); client.connect(context, service); await client.opening;
  const rpc = async (method, params = {}, id = randomUUID()) => {
    pi.events.emit('net:websocket:message', { socketId: client.socketId, data: JSON.stringify({ type: 'request', method, params, id }) });
    for (let i = 0; i < 100; i++) { const result = state.replies.findLast(r => r.id === id); if (result) return result; await flush(); }
    assert.fail(`No response for ${method}`);
  };
  const start = async () => { assert.equal((await rpc('runtime.discover')).ok, true); assert.equal((await rpc('runtime.start', { ...scope, name: 'Pi', config: {}, configRevision: 1778000000000 })).ok, true); };
  await start();
  return { state, pi, client, service, rpc, start, makeService, context };
}

test('complete Connector chat chain: discover, create, send, reply/status ingest, interrupt and reconnect', async t => {
  const f = await fixture(); t.after(() => f.client.disconnect());
  const discovered = await f.rpc('session.discover', scope);
  assert.equal(discovered.ok, true); assert.equal(discovered.result.sessions.length, 1);
  const catalog = await f.rpc('runtime.modelCatalog', scope);
  assert.equal(catalog.result.catalog.models[0].selectionId, 'provider/model');
  const params = { ...scope, sessionId: 'aa-created', content: 'First message', clientMessageId: 'mobile-1', selections: { model: 'provider/model' } };
  assert.deepEqual(Object.keys(f.service.context).sort(), ['connectorId', 'profile', 'serverUrl']);
  assert.ok(!JSON.stringify(f.service.context).includes(f.context.connectorToken));
  const created = await f.rpc('session.create', params);
  assert.equal(created.ok, true); assert.equal(created.result.accepted, true);
  const nativeId = created.result.externalSessionId;
  const native = f.state.sessions.get(nativeId);
  assert.equal(native.permissionMode, 'ask'); assert.equal(native.messages.length, 1);
  f.state.running.delete(nativeId); native.messages.push({ id: 'answer-1', role: 'assistant', content: 'First answer', status: 'done' });
  await f.service.tick();
  const items = f.state.notices.filter(n => n.method === 'timeline.sync').flatMap(n => n.params.items);
  assert.ok(items.some(i => i.role === 'assistant' && i.content.text === 'First answer'));
  assert.ok(items.some(i => i.source.clientMessageId === 'mobile-1'));
  assert.ok(f.state.notices.some(n => n.method === 'session.state.updated' && n.params.sessionId === 'aa-created' && n.params.status === 'idle'));
  const followup = { ...scope, sessionId: 'aa-created', externalSessionId: nativeId, content: 'Second message', clientMessageId: 'mobile-2' };
  assert.equal((await f.rpc('session.send_message', followup)).ok, true);
  assert.equal((await f.rpc('session.interrupt', { ...scope, sessionId: 'aa-created' })).result.interrupted, true);
  assert.equal(f.state.running.has(nativeId), false);
  const prompts = f.state.calls.filter(c => c.operation === 'agent/prompt').length;
  f.pi.events.emit('net:websocket:close', { socketId: f.client.socketId, code: 1006 });
  assert.equal(f.service.ready, false);
  const retry = [...f.state.timers.values()].find(timer => timer.ms === 3000); assert.ok(retry); retry.fn(); await f.client.opening; await f.start();
  assert.equal((await f.rpc('session.send_message', followup)).ok, true);
  assert.equal((await f.rpc('session.create', params)).result.externalSessionId, nativeId);
  assert.equal(f.state.calls.filter(c => c.operation === 'agent/prompt').length, prompts);
  assert.equal(f.state.sessions.size, 2);
  await f.service.tick(); assert.equal(f.service.ready, true);
  assert.ok(!JSON.stringify(f.state.settings).includes('First message'));
  assert.ok(!JSON.stringify(f.state.settings).includes(f.context.connectorToken));
});

test('durable dedup survives service replacement and changed content is rejected', async t => {
  const f = await fixture(); t.after(() => f.client.disconnect());
  const params = { ...scope, sessionId: 'aa-new', content: 'Once', clientMessageId: 'one' };
  const first = await f.rpc('session.create', params); assert.equal(first.ok, true);
  const next = await f.makeService(); f.client.connect(f.context, next); await f.client.opening; await f.start();
  assert.deepEqual((await f.rpc('session.create', params)).result, first.result);
  assert.equal((await f.rpc('session.create', { ...params, content: 'Changed' })).error.code, 'duplicate_request_conflict');
  assert.equal(f.state.calls.filter(c => c.operation === 'agent/prompt').length, 1);
});

test('history sync is bounded, stable, text-only and never erases earlier pages', async t => {
  const f = await fixture(); t.after(() => f.client.disconnect());
  const messages = Array.from({ length: 205 }, (_, i) => ({ id: `m${i}`, role: i % 2 ? 'assistant' : 'user', content: `text ${i}`, status: 'done' }));
  messages.push({ id: 'tool', role: 'tool', content: 'private tool output' }, { id: 'nested', parentToolCallId: 'tool', role: 'assistant', content: 'nested' });
  f.state.sessions.get('existing').messages = messages;
  const discovered = await f.rpc('session.discover', scope); const aaId = discovered.result.sessions[0].sessionId;
  const b = f.service.store.binding(scope.runtimeId, aaId);
  await f.service.syncBinding(b, true);
  const syncs = f.state.notices.filter(n => n.method === 'timeline.sync'); const items = syncs.flatMap(n => n.params.items);
  assert.equal(items.length, 205); assert.equal(new Set(items.map(i => i.id)).size, 205);
  assert.ok(syncs.every(n => n.params.complete === false && n.params.items.length <= 8));
  assert.deepEqual(items.map(i => i.orderSeq).sort((a, b) => a - b), Array.from({ length: 205 }, (_, i) => i + 1));
  const before = f.service.timeline(b, { messages: [messages[0]], messageStart: 0 })[0];
  const same = f.service.timeline(b, { messages: [messages[0]], messageStart: 0 })[0]; assert.deepEqual(before, same);
  const changed = f.service.timeline(b, { messages: [{ ...messages[0], content: 'edited' }], messageStart: 0 })[0];
  assert.equal(changed.id, before.id); assert.ok(changed.revision > before.revision);
});

test('unsafe inputs, cross-workspace access and denied confirmation never prompt', async t => {
  const f = await fixture(); t.after(() => f.client.disconnect());
  const params = { ...scope, sessionId: 'blocked', content: 'hello' };
  for (const patch of [{ attachments: [{}] }, { runtimeOptions: { shell: 'no' } }, { selections: { permission: 'auto' } }, { cwd: `${root}-other` }, { content: '' }]) assert.equal((await f.rpc('session.create', { ...params, ...patch })).ok, false);
  f.state.handlers['session/configure'] = () => { throw new Error('private host text'); };
  const denied = await f.rpc('session.create', params); assert.equal(denied.error.code, 'creation_permission_denied');
  assert.equal((await f.rpc('session.create', params)).error.code, 'operation_outcome_unknown');
  assert.equal(f.state.sessions.size, 2);
  f.state.workspace = `${root}-other`;
  assert.equal((await f.rpc('session.discover', scope)).error.code, 'workspace_changed');
  assert.ok(!f.state.calls.some(c => c.operation === 'agent/prompt'));
  assert.ok(!JSON.stringify(f.state.replies).includes('private host text'));
});

test('busy preflight can retry safely, ambiguous prompt cannot replay, identities cannot switch', async t => {
  const f = await fixture(); t.after(() => f.client.disconnect());
  const params = { ...scope, sessionId: 'aa-existing', externalSessionId: 'existing', content: 'hello', clientMessageId: 'retry' };
  f.state.running.set('existing', 'local-turn');
  assert.equal((await f.rpc('session.send_message', params)).error.code, 'session_busy');
  f.state.running.delete('existing');
  f.state.handlers['agent/prompt'] = () => { throw new Error('delivery unknown'); };
  assert.equal((await f.rpc('session.send_message', params)).error.code, 'host_operation_failed');
  delete f.state.handlers['agent/prompt'];
  assert.equal((await f.rpc('session.send_message', params)).error.code, 'operation_outcome_unknown');
  assert.equal((await f.rpc('session.send_message', { ...params, externalSessionId: 'different' })).error.code, 'session_identity_conflict');
  assert.equal(f.state.calls.filter(c => c.operation === 'agent/prompt').length, 1);
});

test('disconnect during a pending create prevents configuration and prompt', async t => {
  const f = await fixture(); t.after(() => f.client.disconnect());
  let release;
  f.state.handlers['session/create'] = () => new Promise(resolve => { release = () => resolve({ session: { id: 'late', projectPath: root } }); });
  const pending = f.service.dispatch('session.create', { ...scope, sessionId: 'late-aa', content: 'hello' }, 'pending');
  while (!release) await flush(); f.client.disconnect(); release();
  await assert.rejects(pending, { code: 'sharing_inactive' });
  assert.ok(!f.state.calls.some(c => ['session/configure', 'agent/prompt'].includes(c.operation)));
});

test('history request overlapping a polling sync still publishes older pages', async t => {
  const f = await fixture(); t.after(() => f.client.disconnect());
  f.state.sessions.get('existing').messages = Array.from({ length: 150 }, (_, i) => ({ id: `m${i}`, role: 'user', content: `text ${i}` }));
  await f.service.discover(); const b = f.service.store.native(scope.runtimeId, 'existing');
  const notify = f.service.notify; let release;
  f.service.notify = async (method, params) => {
    if (method === 'timeline.sync' && !release) await new Promise(resolve => { release = resolve; });
    return notify(method, params);
  };
  const polling = f.service.syncBinding(b);
  while (!release) await flush();
  const history = f.service.syncBinding(b, true); release();
  await Promise.all([polling, history]);
  const items = f.state.notices.filter(n => n.method === 'timeline.sync').flatMap(n => n.params.items);
  assert.equal(new Set(items.map(i => i.id)).size, 150);
  assert.ok(items.some(i => i.content.text === 'text 0'));
});

test('discovery pagination does not revoke access to bound sessions beyond the first hundred', async t => {
  const f = await fixture(); t.after(() => f.client.disconnect());
  const original = f.state.sessions.get('existing');
  await f.service.store.bind(scope.runtimeId, 'old-bound', 'existing');
  f.state.sessions.clear();
  for (let i = 0; i < 100; i++) f.state.sessions.set(`new-${i}`, { ...original, id: `new-${i}`, messages: [] });
  f.state.sessions.set('existing', original);
  const page1 = (await f.rpc('session.discover', scope)).result;
  assert.equal(page1.sessions.length, 100); assert.equal(page1.nextCursor, '100');
  const page2 = (await f.rpc('session.discover', { ...scope, cursor: page1.nextCursor })).result;
  assert.equal(page2.sessions.length, 1); assert.equal(page2.nextCursor, null); assert.equal(page2.sessions[0].sessionId, 'old-bound');
  const params = { ...scope, sessionId: 'old-bound', content: 'Old conversation still works', clientMessageId: 'old-message' };
  assert.equal((await f.rpc('session.send_message', params)).ok, true);
  assert.equal((await f.rpc('session.interrupt', { ...scope, sessionId: 'old-bound' })).result.interrupted, true);
  f.service.pollCursor = '100'; await f.service.tick(); assert.equal(f.service.pollCursor, null);
  for (const cursor of [-1, 'bad', '9'.repeat(30)]) assert.equal((await f.rpc('session.discover', { ...scope, cursor })).error.code, 'invalid_params');
});

test('send accepts equivalent cwd spelling but rejects other directories before prompting', async t => {
  const f = await fixture(); t.after(() => f.client.disconnect());
  const params = { ...scope, sessionId: 'cwd-test', externalSessionId: 'existing', content: 'Equivalent workspace' };
  const equivalent = [root + path.sep, path.join(root, 'child', '..')];
  if (process.platform === 'win32') equivalent.push(root.replaceAll('\\', '/'), root.toUpperCase());
  for (const [i, cwd] of equivalent.entries()) {
    const response = await f.rpc('session.send_message', { ...params, cwd, clientMessageId: `cwd-${i}` });
    assert.equal(response.ok, true, JSON.stringify(response.error));
    f.state.running.delete('existing');
  }
  const count = f.state.calls.filter(c => c.operation === 'agent/prompt').length;
  for (const cwd of [path.dirname(root), root + '-other', path.join(root, 'child'), '.', 'child/..', '', 123, { path: root }]) {
    assert.equal((await f.rpc('session.send_message', { ...params, cwd, clientMessageId: randomUUID() })).error.code, 'workspace_denied');
  }
  assert.equal(f.state.calls.filter(c => c.operation === 'agent/prompt').length, count);
});

test('text projection omits blank messages that Android renders as unknown timeline items', async t => {
  const f = await fixture(); t.after(() => f.client.disconnect());
  const b = await f.service.store.bind(scope.runtimeId, 'empty-test', 'existing');
  const messages = [
    { id: 'empty-user', role: 'user', content: '' },
    { id: 'whitespace-user', role: 'user', content: ' \n\t' },
    { id: 'empty-assistant', role: 'assistant', content: '' },
    { id: 'clipped', role: 'user', content: ' '.repeat(16000) + 'later' },
    { id: 'user-text', role: 'user', content: 'hello' },
    { id: 'assistant-text', role: 'assistant', content: '**reply**' },
  ];
  const items = f.service.timeline(b, { messages, messageStart: 10 });
  assert.deepEqual(items.map(i => i.source.itemId), ['user-text', 'assistant-text']);
  assert.deepEqual(items.map(i => i.orderSeq), [15, 16]);
  assert.ok(items.every(i => i.type === 'message' && i.content.kind === 'markdown' && i.content.text.trim()));
});
