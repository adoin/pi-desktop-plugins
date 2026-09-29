import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PiBridge } = require('../plugins/adoin.panel.anywhere/src/pi-bridge');
const { SafeError } = require('../plugins/adoin.panel.anywhere/src/config');
const root = path.resolve('bridge-fixture');
const operations = ['session/list', 'session/get', 'session/create', 'session/configure', 'agent/prompt', 'agent/abort', 'agent/getStatus'];
const safeCode = code => error => error instanceof SafeError && error.code === code && !error.message.includes('PRIVATE');

async function fixture() {
  const state = {
    workspace: { path: root, name: 'Fixture', projectId: 'project' }, calls: [],
    sessions: [{ id: 'session', title: 'Title', projectPath: root, mode: 'agent', permissionMode: 'ask', secret: 'PRIVATE' }],
    models: [
      { key: 'first', providerId: 'provider-a', modelId: 'model-a', label: 'First', isDefault: false, secret: 'PRIVATE' },
      { key: 'default', providerId: 'provider-b', modelId: 'model-b', label: 'Default', isDefault: true },
    ],
    handlers: {}, operations: operations.map(id => ({ id, description: id, risk: 'safe' })),
  };
  const pi = {
    workspace: { get: async () => state.workspace },
    models: { list: async () => state.models },
    desktop: {
      listOperations: async () => state.operations,
      invoke: async input => {
        state.calls.push(input);
        if (state.handlers[input.operation]) return state.handlers[input.operation](input);
        switch (input.operation) {
          case 'session/list': return { sessions: state.sessions };
          case 'session/get': return { session: { ...state.sessions.find(item => item.id === input.args[0].id), messages: [{ role: 'user', content: 'hello' }], messageStart: 4, hasMoreBefore: true } };
          case 'session/create': return { session: { ...input.args[0], id: 'created' } };
          case 'session/configure': return { session: { id: input.args[0], projectPath: root, ...input.args[1] } };
          case 'agent/getStatus': return { status: { isRunning: false } };
          case 'agent/prompt': return { accepted: true, turnId: 'turn', secret: 'PRIVATE' };
          case 'agent/abort': return { ok: input.args[0].turnId === 'turn' };
          default: throw new Error('PRIVATE unexpected operation');
        }
      },
    },
  };
  const captured = await PiBridge.capture(pi);
  const bridge = new PiBridge(pi, captured);
  return { bridge, pi, state, captured };
}

test('capture is local and initialization requires exact operation metadata and model API', async () => {
  const { bridge, pi, state, captured } = await fixture();
  assert.deepEqual(captured, state.workspace);
  await bridge.initialize();
  for (const missing of operations) {
    state.operations = operations.filter(id => id !== missing).map(id => ({ id }));
    await assert.rejects(bridge.initialize(), safeCode('host_api_unavailable'));
  }
  state.operations = operations;
  await assert.rejects(bridge.initialize(), safeCode('host_api_unavailable'));
  state.operations = operations.map(id => ({ id }));
  pi.models.list = undefined;
  await assert.rejects(bridge.initialize(), safeCode('host_api_unavailable'));
  assert.deepEqual(state.calls, []);
  for (const value of ['', 'relative', 'https://example.test/project']) {
    state.workspace = { path: value };
    await assert.rejects(PiBridge.capture(pi), safeCode('workspace_unavailable'));
  }
});

test('all operations stop on workspace change; canonical equivalent paths remain authorized', async () => {
  const { bridge, state } = await fixture();
  state.workspace.path = path.join(root, 'child', '..');
  await bridge.list();
  if (process.platform === 'win32') {
    state.workspace.path = root.toUpperCase();
    await bridge.list();
  }
  state.calls.length = 0;
  state.workspace.path = `${root}-other`;
  for (const action of [() => bridge.initialize(), () => bridge.list(), () => bridge.get('session'), () => bridge.status('session'), () => bridge.models(), () => bridge.create({ title: 'New' }), () => bridge.prompt('session', 'hello', 'message'), () => bridge.abort('session', 'turn')]) {
    await assert.rejects(action(), safeCode('workspace_changed'));
  }
  assert.deepEqual(state.calls, []);
});

test('list filters exact scope, native and read-only sessions and strips extra fields', async () => {
  const { bridge, state } = await fixture();
  const base = state.sessions[0];
  state.sessions.push(...[
    { id: 'other', projectPath: `${root}-other` }, { id: 'child', projectPath: path.join(root, 'child') },
    { id: 'native-pi:123' }, { id: 'source', source: 'native-pi' },
    { id: 'readonly', readOnlyReason: 'Unavailable' }, { id: 'caps', capabilities: { canPrompt: false } },
    { id: 'caps-ro', capabilities: { readOnly: true } }, { id: '' }, { id: undefined },
  ].map(item => ({ ...base, ...item })));
  assert.deepEqual(await bridge.list(), [{ id: 'session', title: 'Title', projectPath: root, permissionMode: 'ask', mode: 'agent' }]);
  for (const id of ['other', 'child', 'native-pi:123', 'source', 'readonly', 'caps', 'unknown']) {
    await assert.rejects(bridge.get(id), safeCode('session_unavailable'));
  }
  assert.ok(state.calls.every(call => call.operation === 'session/list'));
  state.sessions = Array.from({ length: 110 }, (_, i) => ({ ...base, id: `s${i}` }));
  assert.equal((await bridge.list()).length, 110);
  assert.equal((await bridge.get('s109')).id, 's109');
});

test('get preserves detail offsets and flags; status uses the authorized ID', async () => {
  const { bridge, state } = await fixture();
  const result = await bridge.get('session', { messageLimit: 5, messageBefore: 10, contentLimit: 200 });
  assert.equal(result.messageStart, 4);
  assert.equal(result.hasMoreBefore, true);
  assert.equal(result.messages[0].content, 'hello');
  assert.deepEqual(state.calls.at(-1), { operation: 'session/get', args: [{ id: 'session', messageLimit: 5, messageBefore: 10, contentLimit: 200 }] });
  assert.deepEqual(await bridge.status('session'), { isRunning: false });
  assert.deepEqual(state.calls.at(-1), { operation: 'agent/getStatus', args: ['session'] });
  state.handlers['session/get'] = () => ({ session: { id: 'session', projectPath: `${root}-other`, messages: [] } });
  await assert.rejects(bridge.prompt('session', 'hello', 'message'), safeCode('host_operation_failed'));
  assert.ok(!state.calls.some(call => call.operation === 'agent/prompt'));
});

test('models use configured list only, whitelist fields, and cap output', async () => {
  const { bridge, state } = await fixture();
  assert.deepEqual((await bridge.models())[0], { key: 'first', providerId: 'provider-a', modelId: 'model-a', label: 'First', isDefault: false });
  state.models.push({ key: 'bad', providerId: null, modelId: 'm', label: 'Bad' });
  assert.equal((await bridge.models()).length, 2);
  state.models = Array.from({ length: 210 }, () => state.models[0]);
  assert.equal((await bridge.models()).length, 200);
  assert.deepEqual(state.calls, []);
});

test('create binds selected/default/first model and requires native ask confirmation without prompting', async () => {
  for (const choice of ['first', undefined, 'fallback']) {
    const { bridge, state } = await fixture();
    if (choice === 'fallback') state.models.forEach(model => { model.isDefault = false; });
    const modelKey = choice === 'first' ? choice : undefined;
    const result = await bridge.create({ title: 'New', modelKey });
    const suffix = choice === undefined ? 'b' : 'a';
    assert.deepEqual(state.calls, [
      { operation: 'session/create', args: [{ title: 'New', mode: 'agent', projectPath: root, providerId: `provider-${suffix}`, modelId: `model-${suffix}`, thinkingLevel: 'off' }] },
      { operation: 'session/configure', args: ['created', { mode: 'agent', permissionMode: 'ask' }], confirm: true },
    ]);
    assert.equal(result.permissionMode, 'ask');
    await assert.rejects(bridge.create({ title: 'New', modelKey: 'unknown' }), safeCode('model_unavailable'));
    await assert.rejects(bridge.create({ title: 'x'.repeat(257) }), safeCode('invalid_params'));
    assert.equal(state.calls.length, 2);
  }
});

test('confirmation denial or wrong mode leaves only blank creation and a sanitized warning', async () => {
  for (const handler of [() => { throw new Error('PRIVATE native denial'); }, () => ({ session: { id: 'created', projectPath: root, permissionMode: 'auto' } })]) {
    const { bridge, state } = await fixture();
    state.handlers['session/configure'] = handler;
    await assert.rejects(bridge.create({ title: 'New' }), error => safeCode('creation_permission_denied')(error) && error.sessionId === 'created' && error.message.includes('blank session may remain'));
    assert.deepEqual(state.calls.map(call => call.operation), ['session/create', 'session/configure']);
  }
});

test('prompt and abort use exact args, never truncate or override permissions; stale abort stays false', async () => {
  const { bridge, state } = await fixture();
  assert.deepEqual(await bridge.prompt('session', 'hello\nworld', 'message'), { accepted: true, turnId: 'turn' });
  assert.deepEqual(state.calls.at(-1), { operation: 'agent/prompt', args: [{ sessionId: 'session', content: 'hello\nworld', messageId: 'message' }] });
  assert.deepEqual(await bridge.abort('session', 'turn'), { ok: true });
  assert.deepEqual(state.calls.at(-1), { operation: 'agent/abort', args: [{ sessionId: 'session', turnId: 'turn' }] });
  assert.deepEqual(await bridge.abort('session', 'stale'), { ok: false });
  const before = state.calls.length;
  for (const content of ['', ' ', 'x'.repeat(32001), { attachments: [] }]) await assert.rejects(bridge.prompt('session', content, 'message'), safeCode('invalid_params'));
  for (const turn of [undefined, '', 'x'.repeat(257)]) await assert.rejects(bridge.abort('session', turn), safeCode('invalid_params'));
  assert.equal(state.calls.length, before);
});

test('malformed host responses never imply acceptance', async () => {
  for (const [operation, result, action] of [
    ['session/list', [], bridge => bridge.list()],
    ['session/get', { session: null }, bridge => bridge.get('session')],
    ['session/get', { session: { id: 'session', projectPath: root, messages: [{ content: [] }] } }, bridge => bridge.get('session')],
    ['agent/getStatus', { isRunning: 'false' }, bridge => bridge.status('session')],
    ['session/create', { id: 'created' }, bridge => bridge.create({ title: 'New' })],
    ['agent/prompt', { accepted: false, turnId: 'turn' }, bridge => bridge.prompt('session', 'hello', 'message')],
    ['agent/prompt', { accepted: true }, bridge => bridge.prompt('session', 'hello', 'message')],
    ['agent/abort', {}, bridge => bridge.abort('session', 'turn')],
  ]) {
    const { bridge, state } = await fixture();
    state.handlers[operation] = () => result;
    await assert.rejects(action(bridge), safeCode('host_operation_failed'));
  }
  const { bridge, state } = await fixture();
  state.models = { models: [] };
  await assert.rejects(bridge.models(), safeCode('host_operation_failed'));
});

test('host exceptions are sanitized and workspace changes during reads prevent mutation', async () => {
  const { bridge, pi, state } = await fixture();
  state.handlers['session/list'] = () => { throw new Error('PRIVATE token'); };
  await assert.rejects(bridge.list(), safeCode('host_operation_failed'));
  const ownError = new SafeError('own', 'Safe message.');
  state.handlers['session/list'] = () => { throw ownError; };
  await assert.rejects(bridge.list(), error => error === ownError);
  state.handlers['session/list'] = () => {
    state.workspace.path = `${root}-other`;
    return { sessions: state.sessions };
  };
  await assert.rejects(bridge.prompt('session', 'hello', 'message'), safeCode('workspace_changed'));
  assert.ok(state.calls.every(call => call.operation === 'session/list'));
  pi.workspace.get = async () => { throw new Error('PRIVATE workspace'); };
  await assert.rejects(PiBridge.capture(pi), safeCode('host_operation_failed'));
});

test('invalidation fences a pending operation before a later host mutation', async () => {
  const { bridge, state } = await fixture();
  let release;
  state.handlers['session/list'] = () => new Promise(resolve => { release = () => resolve({ sessions: state.sessions }); });
  const pending = bridge.prompt('session', 'hello', 'message');
  while (!release) await new Promise(resolve => setImmediate(resolve));
  bridge.invalidate(); release();
  await assert.rejects(pending, safeCode('sharing_inactive'));
  assert.deepEqual(state.calls.map(call => call.operation), ['session/list']);
});
