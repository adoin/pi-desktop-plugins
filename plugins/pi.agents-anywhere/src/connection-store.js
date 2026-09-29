'use strict';
const { randomBytes, scrypt, createCipheriv, createDecipheriv } = require('node:crypto');
const { fail, record, origin } = require('./config');
const KEY = 'anywhereConnectionV1';
const KDF = Object.freeze({ name: 'scrypt', N: 32768, r: 8, p: 1 });
const busy = new WeakSet();
const reject = code => fail(code, code);
const credential = value => typeof value === 'string' && value.length >= 1 && value.length <= 512 && !/[^A-Za-z0-9_.~-]/.test(value);
const exact = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
function identity(value) {
  if (!record(value) || !credential(value.profile) || value.profile.length > 128 || !credential(value.connectorId)) reject('saved_connection_invalid');
  try { if (origin(value.serverUrl) !== value.serverUrl) reject('saved_connection_invalid'); }
  catch { reject('saved_connection_invalid'); }
  return { profile: value.profile, serverUrl: value.serverUrl, connectorId: value.connectorId };
}
const same = (a, b) => a && b && ['profile', 'serverUrl', 'connectorId'].every(key => a[key] === b[key]);
function passwordCheck(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) reject('password_invalid');
}
function decode(value, min, max = min) {
  if (typeof value !== 'string' || value.length > 4 * Math.ceil(max / 3) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) reject('saved_connection_invalid');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length < min || bytes.length > max || bytes.toString('base64') !== value) reject('saved_connection_invalid');
  return bytes;
}
function validate(saved) {
  const keys = ['version', 'profile', 'serverUrl', 'connectorId'];
  if (record(saved) && Object.hasOwn(saved, 'envelope')) keys.push('envelope');
  if (!exact(saved, keys) || saved.version !== 1) reject('saved_connection_invalid');
  identity(saved);
  if (Object.hasOwn(saved, 'envelope')) {
    const e = saved.envelope;
    if (!exact(e, ['algorithm', 'kdf', 'salt', 'iv', 'tag', 'ciphertext']) || e.algorithm !== 'aes-256-gcm' || !exact(e.kdf, ['name', 'N', 'r', 'p']) || Object.keys(KDF).some(key => e.kdf[key] !== KDF[key])) reject('saved_connection_invalid');
    decode(e.salt, 16); decode(e.iv, 12); decode(e.tag, 16); decode(e.ciphertext, 1, 512);
  }
  return structuredClone(saved);
}
const aad = value => Buffer.from(JSON.stringify([1, value.profile, value.serverUrl, value.connectorId]), 'utf8');
const derive = (password, salt) => new Promise((resolve, reject) => {
  scrypt(password, salt, 32, { N: KDF.N, r: KDF.r, p: KDF.p, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
});
class ConnectionStore {
  #pi;
  #saved = null;
  #busy = false;
  constructor(pi) { this.#pi = pi; }
  async #run(task) {
    if (this.#busy || (record(this.#pi) && busy.has(this.#pi))) reject('persistence_busy');
    if (typeof this.#pi?.plugin?.getSettings !== 'function' || typeof this.#pi?.plugin?.setSettings !== 'function') reject('persistence_unavailable');
    this.#busy = true; busy.add(this.#pi);
    try { return await task(); }
    finally { this.#busy = false; busy.delete(this.#pi); }
  }
  async #write(saved) {
    try { await this.#pi.plugin.setSettings({ [KEY]: structuredClone(saved) }); }
    catch { reject('persistence_failed'); }
    this.#saved = saved;
  }
  async load() {
    return this.#run(async () => {
      this.#saved = null;
      let settings;
      try { settings = await this.#pi.plugin.getSettings(); }
      catch { reject('persistence_failed'); }
      const saved = settings?.[KEY];
      if (saved !== null && saved !== undefined) this.#saved = validate(saved);
    });
  }
  public() {
    if (!this.#saved) return null;
    return { ...identity(this.#saved), encrypted: Boolean(this.#saved.envelope) };
  }
  async save(config, password = undefined) {
    return this.#run(async () => {
      const next = { version: 1, ...identity(config) };
      if (!credential(config.connectorToken)) reject('saved_connection_invalid');
      if (password === undefined) {
        if (same(next, this.#saved) && this.#saved.envelope) next.envelope = structuredClone(this.#saved.envelope);
      } else {
        passwordCheck(password);
        let key;
        const plaintext = Buffer.from(config.connectorToken, 'utf8');
        try {
          const salt = randomBytes(16), iv = randomBytes(12);
          key = await derive(password, salt);
          const cipher = createCipheriv('aes-256-gcm', key, iv);
          cipher.setAAD(aad(next));
          const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
          next.envelope = { algorithm: 'aes-256-gcm', kdf: { ...KDF }, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
        } catch { reject('persistence_failed'); }
        finally { key?.fill(0); plaintext.fill(0); }
      }
      await this.#write(next);
    });
  }
  async unlock(selection, password) {
    return this.#run(async () => {
      if (!this.#saved) reject('saved_connection_missing');
      if (!same(selection, this.#saved)) reject('saved_connection_mismatch');
      if (!this.#saved.envelope) reject('saved_connection_missing');
      passwordCheck(password);
      const saved = validate(this.#saved), e = saved.envelope;
      let key, first, last, plaintext;
      try {
        key = await derive(password, decode(e.salt, 16));
        const decipher = createDecipheriv('aes-256-gcm', key, decode(e.iv, 12));
        decipher.setAAD(aad(saved)); decipher.setAuthTag(decode(e.tag, 16));
        first = decipher.update(decode(e.ciphertext, 1, 512));
        last = decipher.final();
        plaintext = Buffer.concat([first, last]);
        const token = plaintext.toString('utf8');
        if (!credential(token) || !Buffer.from(token, 'utf8').equals(plaintext)) reject('unlock_failed');
        return token;
      } catch { reject('unlock_failed'); }
      finally { key?.fill(0); first?.fill(0); last?.fill(0); plaintext?.fill(0); }
    });
  }
  async forget() { return this.#run(() => this.#write(null)); }
}
module.exports = { ConnectionStore };
