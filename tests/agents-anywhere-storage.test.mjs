import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { SessionStore, hash } = require('../plugins/adoin.panel.anywhere/src/session-store.js');
const KEY = 'anywhereSessionBindingsV1';
const context = { profile: 'current', serverUrl: 'https://synthetic.invalid', connectorId: 'synthetic-connector' };
function fixture() {
  let settings = { unrelated: 'preserved' }, writes = 0, denied = false;
  const pi = { plugin: {
    getSettings: async () => { await Promise.resolve(); return structuredClone(settings); },
    setSettings: async patch => { await Promise.resolve(); if (denied) throw new Error('Synthetic permission denied'); settings = { ...settings, ...structuredClone(patch) }; writes++; },
  } };
  const store = (c = context, path = '/synthetic/workspace') => new SessionStore(pi, c, { path });
  return { store, get settings() { return settings; }, set settings(value) { settings = value; }, get writes() { return writes; }, set denied(value) { denied = value; } };
}
const rejects = (promise, code) => assert.rejects(promise, { code });
const binding = { runtimeId: 'runtime', aaId: 'remote', piId: 'native' };
const empty = () => ({ bindings: [], receipts: [] });
function seed(f, s, data) { f.settings = { [KEY]: { version: 1, scopes: { [s.key]: data } } }; }

test('hash and scope identity are deterministic and separate every namespace dimension', async () => {
  assert.equal(hash('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(hash(42), hash('42'));
  const f = fixture(), stores = [f.store(), f.store({ ...context, profile: 'other' }), f.store({ ...context, serverUrl: 'https://other.invalid' }), f.store({ ...context, connectorId: 'other' }), f.store(context, '/other')];
  assert.equal(f.store().key, stores[0].key);
  assert.equal(new Set(stores.map(s => s.key)).size, 5);
  await Promise.all(stores.map((s, i) => s.bind('runtime', 'remote', `native-${i}`)));
  await Promise.all(stores.map(s => s.load()));
  stores.forEach((s, i) => assert.equal(s.binding('runtime', 'remote').piId, `native-${i}`));
  assert.equal(Object.keys(f.settings[KEY].scopes).length, 5);
  assert.equal(f.settings.unrelated, 'preserved');
});

test('bindings load, lookup, runtime separation, idempotence and conflicts', async () => {
  const f = fixture(), s = f.store(); await s.load();
  assert.equal(s.binding('runtime', 'remote'), undefined);
  assert.deepEqual(await s.bind('runtime', 'remote', 'native'), binding);
  assert.deepEqual(await s.bind('runtime', 'remote', 'native'), binding);
  await rejects(s.bind('runtime', 'remote', 'wrong'), 'session_identity_conflict');
  await s.bind('other-runtime', 'remote', 'other-native');
  const reloaded = f.store(); await reloaded.load();
  assert.deepEqual(reloaded.native('runtime', 'native'), binding);
  assert.equal(reloaded.native('other-runtime', 'native'), undefined);
  assert.equal(reloaded.data.bindings.length, 2);
  f.settings[KEY].scopes[s.key].bindings[0].piId = 'external-change';
  assert.equal(reloaded.binding('runtime', 'remote').piId, 'native', 'loaded state is detached');
});

test('concurrent updates across instances preserve all writes and serialize conflicts', async () => {
  const f = fixture(), a = f.store(), b = f.store();
  await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? a : b).bind('runtime', `remote-${i}`, `native-${i}`)));
  await a.load(); assert.equal(a.data.bindings.length, 40);
  const outcomes = await Promise.allSettled([a.bind('runtime', 'race', 'one'), b.bind('runtime', 'race', 'two')]);
  assert.equal(outcomes[0].status, 'fulfilled');
  assert.equal(outcomes[1].reason.code, 'session_identity_conflict');
  await b.bind('runtime', 'after-conflict', 'ok');
  await a.load(); assert.equal(a.data.bindings.length, 42);
});

test('durable receipts fail closed on pending or changed content and deduplicate done results', async () => {
  const f = fixture(), a = f.store(), b = f.store();
  const outcomes = await Promise.allSettled([a.receipt('request', 'digest'), b.receipt('request', 'digest')]);
  assert.deepEqual(outcomes[0].value, { duplicate: false });
  assert.equal(outcomes[1].reason.code, 'operation_outcome_unknown');
  await rejects(b.receipt('request', 'changed'), 'duplicate_request_conflict');
  await rejects(a.finish('missing', {}), 'mapping_invalid');
  await a.finish('request', { sessionId: 'native' });
  const reloaded = f.store(); await reloaded.load();
  assert.deepEqual(await reloaded.receipt('request', 'digest'), { duplicate: true, result: { sessionId: 'native' } });
  await rejects(reloaded.receipt('request', 'changed'), 'duplicate_request_conflict');
});

test('receipt identities are isolated by scope', async () => {
  const f = fixture(), a = f.store(), b = f.store(context, '/other');
  assert.deepEqual(await a.receipt('same', 'one'), { duplicate: false });
  assert.deepEqual(await b.receipt('same', 'two'), { duplicate: false });
});

for (const [name, envelope] of Object.entries({ null: null, array: [], version: { version: 2, scopes: {} }, scopes: { version: 1, scopes: [] } })) {
  test(`invalid envelope (${name}) blocks load and writes`, async () => {
    const f = fixture(), s = f.store(); f.settings = { [KEY]: envelope };
    await rejects(s.load(), 'mapping_invalid');
    await rejects(s.bind('runtime', 'remote', 'native'), 'mapping_invalid');
    assert.equal(f.writes, 0);
  });
}
const malformed = [null, [], {}, { bindings: [], receipts: null }, { bindings: [null], receipts: [] },
  { bindings: [{ ...binding, aaId: '' }], receipts: [] }, { bindings: [{ ...binding, piId: 'x'.repeat(513) }], receipts: [] },
  { bindings: [], receipts: [{ key: 'x', digest: 'y', status: 'unknown' }] }, { bindings: [], receipts: [{ key: 1, digest: 'y', status: 'done' }] },
  { bindings: Array(201).fill(binding), receipts: [] }, { bindings: [], receipts: Array(1001).fill({ key: 'x', digest: 'y', status: 'done' }) }];
for (const [i, data] of malformed.entries()) {
  test(`malformed saved scope ${i} blocks load and post-load changes without writes`, async () => {
    const f = fixture(), s = f.store(); await s.load(); seed(f, s, data);
    await rejects(s.load(), 'mapping_invalid');
    await rejects(s.bind('runtime', 'new', 'native'), 'mapping_invalid');
    assert.equal(f.writes, 0);
  });
}

test('invalid API input cannot persist state that load would reject', async () => {
  const f = fixture(), s = f.store();
  for (const value of ['', null, 42, 'x'.repeat(513)]) await rejects(s.bind('runtime', value, 'native'), 'mapping_invalid');
  await rejects(s.receipt(42, 'digest'), 'mapping_invalid');
  await rejects(s.receipt('request', null), 'mapping_invalid');
  assert.equal(f.writes, 0);
  await s.bind('runtime', 'remote', 'native');
});

test('mapping, receipt and scope limits preserve existing entries', async () => {
  const f = fixture(), s = f.store();
  seed(f, s, { bindings: Array.from({ length: 200 }, (_, i) => ({ ...binding, aaId: `remote-${i}` })), receipts: [] });
  await rejects(s.bind('runtime', 'overflow', 'native'), 'mapping_limit');
  await s.bind('runtime', 'remote-0', 'native');
  seed(f, s, { bindings: [], receipts: Array.from({ length: 1000 }, (_, i) => ({ key: `request-${i}`, digest: 'digest', status: 'done', result: i })) });
  await rejects(s.receipt('overflow', 'digest'), 'mapping_limit');
  assert.deepEqual(await s.receipt('request-0', 'digest'), { duplicate: true, result: 0 });
  f.settings = { [KEY]: { version: 1, scopes: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`scope-${i}`, empty()])) } };
  await rejects(s.bind('runtime', 'remote', 'native'), 'mapping_limit');
  delete f.settings[KEY].scopes['scope-0'];
  await s.bind('runtime', 'remote', 'native');
  await s.bind('runtime', 'second', 'native-second');
  assert.equal(Object.keys(f.settings[KEY].scopes).length, 16);
});

test('failed persistence leaves memory unchanged and does not poison the shared queue', async () => {
  const f = fixture(), a = f.store(), b = f.store(); f.denied = true;
  await assert.rejects(a.bind('runtime', 'remote', 'native'), /Synthetic permission denied/);
  assert.deepEqual(a.data, empty()); assert.equal(f.writes, 0);
  f.denied = false; await b.bind('runtime', 'remote', 'native'); await a.load();
  assert.deepEqual(a.binding('runtime', 'remote'), binding);
});

test('removed scopes are not resurrected by stale instances or repeated load', async () => {
  const f = fixture(), a = f.store(), b = f.store();
  await a.bind('runtime', 'remote', 'native'); await b.load();
  delete f.settings[KEY].scopes[a.key];
  await a.load(); assert.deepEqual(a.data, empty());
  await b.bind('runtime', 'new', 'new-native');
  await a.load(); assert.equal(a.binding('runtime', 'remote'), undefined);
  assert.equal(a.data.bindings.length, 1);
});
