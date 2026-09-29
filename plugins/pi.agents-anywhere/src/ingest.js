'use strict';
const { fail, record } = require('./config');
const METHODS = new Set(['timeline.sync', 'session.meta.upsert', 'session.state.updated', 'runtime.capability.updated', 'runtime.catalog.updated']);
class IngestTransport {
  constructor(pi, config, auth, log = () => {}) {
    this.pi = pi; this.config = { ...config }; this.token = auth.accessToken;
    this.expires = Date.now() + Math.max(0, auth.expiresIn - 60) * 1000;
    this.log = log; this.closed = false; this.refreshing = null;
  }
  close() { this.closed = true; this.config = null; this.token = null; }
  guard() { if (this.closed) fail('sharing_inactive', 'Connection ended before synchronization.'); }
  async refresh() {
    this.guard(); if (this.refreshing) return this.refreshing;
    const operation = (async () => {
      const c = this.config;
      const result = await this.pi.net.fetch({ url: `${c.serverUrl}/api/v2/connector/auth`, method: 'POST', headers: { Authorization: `Connector ${c.connectorId}:${c.connectorToken}` }, timeoutMs: 10000 });
      this.guard(); this.log('auth_http', String(Number.isInteger(result?.status) ? result.status : 0));
      if (result?.status !== 200 || typeof result.bodyText !== 'string' || result.bodyText.length > 16384) fail('ingest_auth_failed', 'Could not refresh synchronization credentials.');
      let auth; try { auth = JSON.parse(result.bodyText); } catch { fail('ingest_auth_failed', 'Invalid synchronization authentication response.'); }
      if (!record(auth) || typeof auth.accessToken !== 'string' || !/^[\x21-\x7e]{1,8192}$/.test(auth.accessToken) || !Number.isFinite(auth.expiresIn) || auth.expiresIn <= 0) fail('ingest_auth_failed', 'Invalid synchronization credentials.');
      this.token = auth.accessToken; this.expires = Date.now() + Math.max(0, auth.expiresIn - 60) * 1000;
    })();
    this.refreshing = operation;
    try { await operation; } finally { if (this.refreshing === operation) this.refreshing = null; }
  }
  async send(method, params) {
    this.guard(); if (!METHODS.has(method)) fail('unsupported', 'Unsupported notification type.');
    const body = JSON.stringify({ notifications: [{ method, params }] });
    if (Buffer.byteLength(body, 'utf8') > 900000) fail('payload_limit', 'Synchronization payload exceeds its safe limit.');
    if (Date.now() >= this.expires) await this.refresh();
    for (let attempt = 0; attempt < 2; attempt++) {
      this.guard();
      const result = await this.pi.net.fetch({ url: `${this.config.serverUrl}/api/v2/connector/ingest`, method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' }, body, timeoutMs: 15000 });
      this.guard();
      if (result?.status === 401 && attempt === 0) { await this.refresh(); continue; }
      if (result?.status !== 200 || typeof result.bodyText !== 'string' || result.bodyText.length > 65536) { this.log('ingest_failed', Number.isInteger(result?.status) ? `HTTP_${result.status}` : 'INVALID_RESPONSE'); fail('ingest_failed', 'Server did not accept synchronization.'); }
      let receipt; try { receipt = JSON.parse(result.bodyText); } catch { fail('ingest_failed', 'Invalid ingest response.'); }
      if (receipt?.accepted !== 1 || !Array.isArray(receipt.rejected) || receipt.rejected.length) { this.log('ingest_failed', 'NOTIFICATION_REJECTED'); fail('ingest_rejected', 'Server rejected the notification schema or binding.'); }
      return;
    }
  }
}
module.exports = { IngestTransport };
