'use strict';
const { createHash } = require('node:crypto');
const { fail, record } = require('./config');
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const KEY = 'anywhereSessionBindingsV1';
const queues = new WeakMap();
function validateData(saved) {
  if (!record(saved) || !Array.isArray(saved.bindings) || !Array.isArray(saved.receipts) || saved.bindings.length > 200 || saved.receipts.length > 1000) fail('mapping_invalid', 'Stored session mappings are invalid.');
  for (const b of saved.bindings) if (!record(b) || ![b.aaId, b.piId, b.runtimeId].every(v => typeof v === 'string' && v.length > 0 && v.length <= 512)) fail('mapping_invalid', 'Stored session mapping identity is invalid.');
  for (const r of saved.receipts) if (!record(r) || typeof r.key !== 'string' || typeof r.digest !== 'string' || !['pending', 'done'].includes(r.status)) fail('mapping_invalid', 'Stored operation receipt is invalid.');
}
class SessionStore {
  constructor(pi, context, workspace) {
    this.pi = pi;
    this.key = hash(JSON.stringify([context.profile, context.serverUrl, context.connectorId, workspace.path]));
    this.queue = Promise.resolve(); this.data = { bindings: [], receipts: [] };
  }
  async load() {
    const settings = await this.pi.plugin.getSettings();
    const all = settings?.[KEY];
    if (all !== undefined && (!record(all) || all.version !== 1 || !record(all.scopes))) fail('mapping_invalid', 'Stored session mappings require local recovery.');
    const saved = all?.scopes[this.key];
    if (saved !== undefined) {
      validateData(saved);
      this.data = structuredClone(saved);
    } else this.data = { bindings: [], receipts: [] };
  }
  change(update) {
    const task = (queues.get(this.pi) || Promise.resolve()).then(async () => {
      const settings = await this.pi.plugin.getSettings();
      const current = settings?.[KEY];
      if (current !== undefined && (!record(current) || current.version !== 1 || !record(current.scopes))) fail('mapping_invalid', 'Stored session mappings changed unexpectedly.');
      const scopes = { ...(current?.scopes || {}) };
      const next = structuredClone(Object.hasOwn(scopes, this.key) ? scopes[this.key] : { bindings: [], receipts: [] });
      validateData(next);
      const result = update(next);
      validateData(next);
      if (!Object.hasOwn(scopes, this.key) && Object.keys(scopes).length >= 16) fail('mapping_limit', 'Too many saved server/workspace bindings; local cleanup is required.');
      scopes[this.key] = next;
      await this.pi.plugin.setSettings({ [KEY]: { version: 1, scopes } });
      this.data = next;
      return result;
    });
    this.queue = task.catch(() => {}); queues.set(this.pi, this.queue); return task;
  }
  binding(runtimeId, aaId) { return this.data.bindings.find(b => b.runtimeId === runtimeId && b.aaId === aaId); }
  native(runtimeId, piId) { return this.data.bindings.find(b => b.runtimeId === runtimeId && b.piId === piId); }
  async bind(runtimeId, aaId, piId) {
    return this.change(data => {
      const old = data.bindings.find(b => b.runtimeId === runtimeId && b.aaId === aaId);
      if (old && old.piId !== piId) fail('session_identity_conflict', 'Session identity does not match the stored binding.');
      if (old) return old;
      if (data.bindings.length >= 200) fail('mapping_limit', 'Session mapping limit reached.');
      const binding = { runtimeId, aaId, piId }; data.bindings.push(binding); return binding;
    });
  }
  async receipt(key, digest) {
    return this.change(data => {
      const old = data.receipts.find(r => r.key === key);
      if (old) {
        if (old.digest !== digest) fail('duplicate_request_conflict', 'Request identity was reused with different content.');
        if (old.status !== 'done') fail('operation_outcome_unknown', 'An earlier operation may have been delivered. Check the Pi session before retrying.');
        return { duplicate: true, result: old.result };
      }
      if (data.receipts.length >= 1000) fail('mapping_limit', 'Operation receipt limit reached; local review is required before cleanup.');
      data.receipts.push({ key, digest, status: 'pending' }); return { duplicate: false };
    });
  }
  async finish(key, result) {
    return this.change(data => { const r = data.receipts.find(item => item.key === key); if (!r) fail('mapping_invalid', 'Missing operation receipt.'); r.status = 'done'; r.result = result; });
  }
}
module.exports = { SessionStore, hash };
