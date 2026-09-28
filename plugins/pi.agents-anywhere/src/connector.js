'use strict';
const { SafeError, record } = require('./config');
const { PROFILES, endpoints } = require('./profiles');
const { RuntimeAdapter, METHODS } = require('./runtime');

class Connector {
  constructor(pi, options = {}) {
    this.pi = pi;
    this.setTimer = options.setTimeout || setTimeout;
    this.clearTimer = options.clearTimeout || clearTimeout;
    this.random = options.random || Math.random;
    this.platform = options.platform || process.platform;
    this.runtime = new RuntimeAdapter();
    this.state = 'unconfigured'; this.logs = []; this.generation = 0;
    this.publicConfig = { profile: 'current', serverUrl: 'https://web.agents-anywhere.com', connectorId: '' };
    this.listeners = []; this.timers = new Set(); this.socketId = null;
    this.config = null; this.want = false; this.attempts = 0;
  }
  log(event, detail = '') {
    this.logs.unshift({ time: new Date().toISOString(), event, detail });
    this.logs.length = Math.min(80, this.logs.length);
  }
  status() {
    return { state: this.state, ...this.publicConfig, runtime: this.runtime.status(),
      profiles: Object.values(PROFILES).map(({ id, label, enabled, baseline }) => ({ id, label, enabled, baseline })),
      compatibility: { current: PROFILES.current.baseline, legacy: PROFILES.legacy.baseline },
      logs: this.logs.map(item => ({ ...item })),
    };
  }
  timer(fn, ms) {
    const id = this.setTimer(() => { this.timers.delete(id); fn(); }, ms);
    this.timers.add(id); return id;
  }
  cancelTimer(id) { this.clearTimer(id); this.timers.delete(id); }
  close(socketId) {
    if (socketId) Promise.resolve().then(() => this.pi.net.websocket.close({ socketId, code: 1000 })).catch(() => {});
  }
  clearTransport() {
    for (const id of this.timers) this.clearTimer(id);
    this.timers.clear();
    for (const [event, listener] of this.listeners) { try { this.pi.events.off(event, listener); } catch {} }
    this.listeners = [];
    this.close(this.socketId); this.socketId = null; this.runtime.reset();
  }
  disconnect() {
    this.want = false; this.config = null; this.generation++; this.clearTransport();
    this.state = 'disconnected'; this.log('disconnected');
  }
  connect(config) {
    this.disconnect();
    this.config = { ...config }; this.want = true; this.attempts = 0;
    this.publicConfig = { profile: config.profile, serverUrl: config.serverUrl, connectorId: config.connectorId };
    this.state = 'connecting';
    this.opening = this.open();
  }
  alive(generation) { return this.want && this.generation === generation; }
  fail(generation, state, retry, detail = '') {
    if (!this.alive(generation)) return;
    this.generation++; this.clearTransport(); this.state = state; this.log(state, detail);
    if (!retry) { this.want = false; this.config = null; return; }
    const delay = Math.min(30000, 3000 * (2 ** Math.min(this.attempts++, 4))) + Math.floor(this.random() * 1000);
    this.log('retry_scheduled', `${delay}ms`);
    this.timer(() => { if (this.want) { this.state = 'reconnecting'; this.opening = this.open(); } }, delay);
  }
  async open() {
    if (!this.want || !this.config) return;
    const generation = ++this.generation;
    const config = this.config;
    const urls = endpoints(config);
    const replies = new Map(); let inFlight = 0, pending = new Map(), openingSocket = true;
    const transportError = error => {
      const code = error?.code ?? error?.data?.errorCode;
      const denied = ['PERMISSION_DENIED', 'UNSUPPORTED', 'DOMAIN_NOT_ALLOWED'].includes(code);
      this.fail(generation, denied ? 'protocol_incompatible' : 'network_error', !denied, denied ? 'HOST_API_OR_PERMISSION_UNAVAILABLE' : 'HOST_NETWORK_ERROR');
    };
    const send = async payload => {
      if (!this.alive(generation) || !this.socketId) return;
      await this.pi.net.websocket.send({ socketId: this.socketId, data: JSON.stringify(payload) });
    };
    let discoveryTimer;
    const processFrame = async event => {
      if (!this.alive(generation) || event.socketId !== this.socketId) return;
      if (typeof event.data !== 'string' || Buffer.byteLength(event.data, 'utf8') > 65536) {
        this.fail(generation, 'protocol_incompatible', false, 'FRAME_LIMIT'); return;
      }
      let frame;
      try { frame = JSON.parse(event.data); } catch { this.fail(generation, 'protocol_incompatible', false, 'INVALID_JSON'); return; }
      if (!record(frame) || frame.type !== 'request' || Object.hasOwn(frame, 'jsonrpc') || typeof frame.id !== 'string' || !frame.id || frame.id.length > 128 || typeof frame.method !== 'string' || frame.method.length > 128) {
        this.fail(generation, 'protocol_incompatible', false, 'INVALID_RPC_FRAME'); return;
      }
      if (inFlight >= 16) { this.fail(generation, 'protocol_incompatible', false, 'REQUEST_LIMIT'); return; }
      inFlight++;
      try {
        const signature = JSON.stringify([frame.method, frame.params]);
        let response;
        const cached = replies.get(frame.id);
        if (cached) {
          if (cached.signature !== signature) { this.fail(generation, 'protocol_incompatible', false, 'RPC_ID_REUSED'); return; }
          response = cached.response;
        } else {
          try {
            if (!record(frame.params)) throw new SafeError('invalid_params', 'RPC params must be an object.');
            response = { id: frame.id, type: 'response', ok: true, result: this.runtime.dispatch(frame.method, frame.params) };
          } catch (error) {
            response = { id: frame.id, type: 'response', ok: false, error: error instanceof SafeError ? { code: error.code, message: error.message } : { code: 'internal_error', message: 'Runtime operation failed.' } };
          }
          replies.set(frame.id, { signature, response });
          if (replies.size > 64) replies.delete(replies.keys().next().value);
        }
        await send(response);
        if (!this.alive(generation)) return;
        this.log('rpc', `${METHODS.has(frame.method) ? frame.method : 'unsupported_method'}:${response.ok ? 'ok' : response.error.code}`);
        if (frame.method === 'runtime.discover' && response.ok) {
          this.cancelTimer(discoveryTimer); this.state = 'online'; this.attempts = 0;
        }
      } catch (error) { transportError(error); }
      finally { inFlight--; }
    };
    const handle = (kind, event) => {
      if (!this.alive(generation)) return;
      if (typeof event?.socketId !== 'string') return;
      if (openingSocket) {
        if (typeof event?.socketId !== 'string') return;
        if (!pending.has(event.socketId)) {
          // The host permits at most four sockets. Old socket traffic must not
          // consume the new socket's early-event budget.
          if (pending.size >= 4) pending.delete(pending.keys().next().value);
          pending.set(event.socketId, { items: [], overflow: false });
        }
        const bucket = pending.get(event.socketId);
        if (bucket.items.length >= 32 || (typeof event.data === 'string' && Buffer.byteLength(event.data, 'utf8') > 65536)) { bucket.overflow = true; return; }
        bucket.items.push([kind, event]); return;
      }
      if (event.socketId !== this.socketId) return;
      if (kind === 'message') { void processFrame(event); return; }
      if (kind === 'error') { transportError(null); return; }
      const code = Number.isInteger(event.code) ? event.code : 0;
      const fatal = code === 4001 && /connector/i.test(event.reason || '') && /invalid|revoked|deleted|credential/i.test(event.reason || '');
      this.fail(generation, fatal ? 'authentication_failed' : code === 4409 ? 'ownership_conflict' : 'reconnecting', !fatal && code !== 4409, `WS_CLOSE_${code}`);
    };
    try {
      this.log('protocol', `${config.profile}:${PROFILES[config.profile].baseline}`);
      this.log('auth_request', urls.auth);
      const result = await this.pi.net.fetch({ url: urls.auth, method: 'POST', headers: { Authorization: `Connector ${config.connectorId}:${config.connectorToken}` }, timeoutMs: 10000 });
      if (!this.alive(generation)) return;
      if (!Number.isInteger(result?.status)) { this.fail(generation, 'protocol_incompatible', false, 'INVALID_HTTP_RESPONSE'); return; }
      this.log('auth_http', String(result.status));
      if (result.status === 401 || result.status === 403) { this.fail(generation, 'authentication_failed', false, `HTTP_${result.status}`); return; }
      if (result.status >= 400 && result.status < 500 && result.status !== 429) { this.fail(generation, 'protocol_incompatible', false, `HTTP_${result.status}`); return; }
      if (result.status === 429 || result.status >= 500) { this.fail(generation, 'network_error', true, `HTTP_${result.status}`); return; }
      if (result.status !== 200 || typeof result.bodyText !== 'string' || result.bodyText.length > 16384) { this.fail(generation, 'protocol_incompatible', false, 'INVALID_AUTH_RESPONSE'); return; }
      let auth;
      try { auth = JSON.parse(result.bodyText); } catch { this.fail(generation, 'protocol_incompatible', false, 'INVALID_AUTH_JSON'); return; }
      if (!record(auth) || typeof auth.accessToken !== 'string' || !/^[\x21-\x7e]{1,8192}$/.test(auth.accessToken) || !Number.isFinite(auth.expiresIn) || auth.expiresIn <= 0) {
        this.fail(generation, 'protocol_incompatible', false, 'INVALID_AUTH_FIELDS'); return;
      }
      for (const kind of ['message', 'close', 'error']) {
        const event = `net:websocket:${kind}`, listener = data => handle(kind, data);
        this.pi.events.on(event, listener); this.listeners.push([event, listener]);
      }
      this.log('websocket_connect', urls.ws);
      const connection = await this.pi.net.websocket.connect({ url: urls.ws, headers: { Authorization: `Bearer ${auth.accessToken}`, 'X-Device-OS': this.platform === 'win32' ? 'windows' : this.platform === 'darwin' ? 'macos' : 'linux' }, timeoutMs: 10000 });
      auth = null;
      if (!this.alive(generation)) { this.close(connection?.socketId); return; }
      if (typeof connection?.socketId !== 'string' || !connection.socketId) { this.fail(generation, 'protocol_incompatible', false, 'INVALID_SOCKET_HANDLE'); return; }
      this.socketId = connection.socketId; openingSocket = false;
      this.log('websocket_open', 'Awaiting runtime discovery; phone visibility is not yet verified.');
      discoveryTimer = this.timer(() => this.fail(generation, 'protocol_incompatible', false, 'RUNTIME_DISCOVERY_TIMEOUT'), 30000);
      const early = pending.get(this.socketId); pending.clear();
      if (early?.overflow) { this.fail(generation, 'protocol_incompatible', false, 'EARLY_EVENT_LIMIT'); return; }
      for (const [kind, event] of early?.items || []) handle(kind, event);
      const heartbeat = async () => {
        if (!this.alive(generation)) return;
        try {
          await send({ type: 'notification', method: 'connector.heartbeat', params: {} });
          if (this.alive(generation)) this.timer(() => { void heartbeat(); }, 20000);
        } catch (error) { transportError(error); }
      };
      await heartbeat();
    } catch (error) { transportError(error); }
  }
}
module.exports = { Connector };
