import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { ConnectionStore } = require('../plugins/adoin.panel.anywhere/src/connection-store');
const { SafeError } = require('../plugins/adoin.panel.anywhere/src/config');
const KEY = 'anywhereConnectionV1';
const config = () => ({ profile: 'current', serverUrl: 'https://example.com', connectorId: 'test-connector', connectorToken: randomBytes(32).toString('hex') });
const password = () => randomBytes(24).toString('hex');
function fixture() {
  const settings = { anywhereSessionBindingsV1: { version: 1, scopes: {} }, unrelated: true };
  const writes = [];
  const pi = { plugin: {
    async getSettings() { return structuredClone(settings); },
    async setSettings(patch) { writes.push(structuredClone(patch)); Object.assign(settings, structuredClone(patch)); }
  } };
  return { settings, writes, pi, store: new ConnectionStore(pi) };
}
const error = code => value => value instanceof SafeError && value.code === code && value.message === code;

test('encrypted roundtrip and reload expose only metadata, with fresh randomness and no cached password', async () => {
  const { store, pi, settings, writes } = fixture(), c = config(), p = password();
  await store.load(); assert.equal(store.public(), null);
  await store.save(c, p);
  const expected = { profile: c.profile, serverUrl: c.serverUrl, connectorId: c.connectorId, encrypted: true };
  assert.deepEqual(store.public(), expected);
  assert.equal(JSON.stringify(store), '{}');
  assert.ok(!JSON.stringify(settings).includes(c.connectorToken));
  assert.ok(!JSON.stringify(settings).includes(p));
  const first = structuredClone(settings[KEY].envelope);
  const reloaded = new ConnectionStore(pi); await reloaded.load();
  assert.equal(await reloaded.unlock(c, p), c.connectorToken);
  assert.deepEqual(reloaded.public(), expected);
  assert.equal(writes.length, 1);
  await assert.rejects(reloaded.unlock(c, password()), error('unlock_failed'));
  assert.equal(await reloaded.unlock(c, p), c.connectorToken);
  const exposed = reloaded.public(); exposed.profile = 'changed';
  assert.deepEqual(reloaded.public(), expected);
  await reloaded.save(c, p);
  assert.notEqual(settings[KEY].envelope.salt, first.salt);
  assert.notEqual(settings[KEY].envelope.iv, first.iv);
});

test('authenticated ciphertext and every identity field reject tampering', async () => {
  const { store, settings, pi } = fixture(), c = config(), p = password();
  await store.save(c, p); const saved = structuredClone(settings[KEY]);
  for (const field of ['ciphertext', 'tag', 'iv', 'salt']) {
    const altered = structuredClone(saved), bytes = Buffer.from(altered.envelope[field], 'base64');
    bytes[0] ^= 1; altered.envelope[field] = bytes.toString('base64'); settings[KEY] = altered;
    const other = new ConnectionStore(pi); await other.load();
    await assert.rejects(other.unlock(c, p), error('unlock_failed'));
  }
  for (const [field, value] of [['profile', 'other'], ['serverUrl', 'https://other.example'], ['connectorId', 'other']]) {
    settings[KEY] = { ...structuredClone(saved), [field]: value };
    const other = new ConnectionStore(pi); await other.load();
    await assert.rejects(other.unlock(c, p), error('saved_connection_mismatch'));
    await assert.rejects(other.unlock({ ...c, [field]: value }, p), error('unlock_failed'));
  }
});

test('metadata-only save preserves ciphertext exclusively for the identical identity', async () => {
  const { store, settings } = fixture(), c = config(), p = password();
  await store.save(c);
  assert.deepEqual(settings[KEY], { version: 1, profile: c.profile, serverUrl: c.serverUrl, connectorId: c.connectorId });
  await assert.rejects(store.unlock(c, p), error('saved_connection_missing'));
  for (const [field, value] of [['profile', 'other'], ['serverUrl', 'https://other.example'], ['connectorId', 'other']]) {
    await store.save(c, p); const envelope = structuredClone(settings[KEY].envelope);
    await store.save({ ...c, connectorToken: config().connectorToken });
    assert.deepEqual(settings[KEY].envelope, envelope);
    assert.equal(await store.unlock(c, p), c.connectorToken);
    await store.save({ ...c, [field]: value });
    assert.equal(store.public().encrypted, false);
    assert.equal(Object.hasOwn(settings[KEY], 'envelope'), false);
  }
});

test('forget patches only the connection key and clears memory', async () => {
  const { store, settings, writes } = fixture(), c = config();
  const mappings = structuredClone(settings.anywhereSessionBindingsV1);
  await store.save(c, password()); await store.forget();
  assert.deepEqual(writes.at(-1), { [KEY]: null });
  assert.deepEqual(settings.anywhereSessionBindingsV1, mappings);
  assert.equal(settings.unrelated, true); assert.equal(store.public(), null);
  await assert.rejects(store.unlock(c, password()), error('saved_connection_missing'));
});

test('strict persisted schema rejects unknown keys, algorithms, KDF costs and malformed bounded base64', async () => {
  const { store, settings } = fixture(); await store.save(config(), password());
  const saved = structuredClone(settings[KEY]);
  const changes = [
    s => { s.version = 2; }, s => { s.connectorToken = 'unexpected'; },
    s => { s.envelope.algorithm = 'aes-256-cbc'; }, s => { s.envelope.extra = true; },
    s => { s.envelope.kdf.name = 'pbkdf2'; }, s => { s.envelope.kdf.N = 1048576; },
    s => { s.envelope.kdf.r = 9; }, s => { s.envelope.kdf.p = 2; },
    s => { s.envelope.kdf.maxmem = 1; }, s => { s.envelope = null; },
    s => { s.serverUrl += '/'; }, s => { s.profile = ''; },
    ...['salt', 'iv', 'tag', 'ciphertext'].flatMap(field => [
      s => { s.envelope[field] = '!'; }, s => { s.envelope[field] = ''; },
      s => { s.envelope[field] = 'A'.repeat(4096); },
      s => { s.envelope[field] += '\n'; }
    ])
  ];
  for (const change of changes) {
    settings[KEY] = structuredClone(saved); change(settings[KEY]);
    await assert.rejects(store.load(), error('saved_connection_invalid'));
    assert.equal(store.public(), null);
  }
  for (const invalid of [false, [], 'invalid', { version: 1 }]) {
    settings[KEY] = invalid; await assert.rejects(store.load(), error('saved_connection_invalid'));
  }
});

test('password and config limits are enforced before persistence', async () => {
  const { store, writes } = fixture(), c = config();
  for (const p of [null, 123, '', 'x'.repeat(11), 'x'.repeat(1025)]) await assert.rejects(store.save(c, p), error('password_invalid'));
  for (const change of [{ profile: 'x'.repeat(129) }, { connectorId: 'x'.repeat(513) }, { connectorToken: 'x'.repeat(513) }, { connectorToken: '' }, { connectorToken: 'has spaces' }, { serverUrl: 'https://example.com/' }, { serverUrl: 'x'.repeat(2049) }]) {
    await assert.rejects(store.save({ ...c, ...change }), error('saved_connection_invalid'));
  }
  assert.equal(writes.length, 0);
  for (const length of [12, 1024]) {
    const p = 'x'.repeat(length), bounded = { ...c, connectorToken: 'x'.repeat(512) };
    await store.save(bounded, p); assert.equal(await store.unlock(bounded, p), bounded.connectorToken);
    await assert.rejects(store.unlock(bounded, null), error('password_invalid'));
  }
});

test('missing APIs and host failures use fixed safe errors and failed writes retain state', async () => {
  for (const pi of [undefined, {}, { plugin: {} }, { plugin: { getSettings() {} } }]) {
    const store = new ConnectionStore(pi);
    for (const invoke of [() => store.load(), () => store.save(config()), () => store.unlock(config(), password()), () => store.forget()]) await assert.rejects(invoke(), error('persistence_unavailable'));
  }
  const { store, pi } = fixture(), c = config(); await store.save(c);
  const before = store.public();
  pi.plugin.setSettings = async () => { throw new SafeError('secret', c.connectorToken); };
  await assert.rejects(store.save({ ...c, profile: 'other' }), error('persistence_failed'));
  await assert.rejects(store.forget(), error('persistence_failed'));
  assert.deepEqual(store.public(), before);
  pi.plugin.getSettings = async () => { throw new Error(c.connectorToken); };
  await assert.rejects(store.load(), error('persistence_failed')); assert.equal(store.public(), null);
});

test('bounded busy guard rejects overlapping operations including load and releases after failure', async () => {
  const { store, pi } = fixture(), c = config(), p = password();
  for (const start of [() => store.save(c, p), () => store.unlock(c, p)]) {
    const pending = start();
    for (const invoke of [() => store.save(c), () => store.unlock(c, p), () => store.forget(), () => store.load(), () => new ConnectionStore(pi).load()]) await assert.rejects(invoke(), error('persistence_busy'));
    await pending;
  }
  let release;
  pi.plugin.getSettings = () => new Promise(resolve => { release = resolve; });
  const pending = store.load();
  await assert.rejects(store.forget(), error('persistence_busy'));
  release({}); await pending;
  await assert.rejects(store.unlock(c, p), error('saved_connection_missing'));
  await store.save(c);
  const write = pi.plugin.setSettings;
  pi.plugin.setSettings = () => new Promise(resolve => { release = resolve; });
  const forgetting = store.forget();
  await assert.rejects(store.load(), error('persistence_busy'));
  release(); await forgetting;
  pi.plugin.setSettings = write; await store.save(c);
});
