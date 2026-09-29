'use strict';
const manifest = require('./manifest.json');
const { Connector } = require('./src/connector');
const { SafeError, fail, validateConfig, parseCommand } = require('./src/config');
const { PROFILES } = require('./src/profiles');
const { PiBridge } = require('./src/pi-bridge');
const { SessionService } = require('./src/sessions');
const { ConnectionStore } = require('./src/connection-store');
let setupEpoch = 0;
function stop() { setupEpoch++; client?.disconnect(); }
let client = null, saved = null, savedError = null, connectionBusy = false;
let pendingOperation = Promise.resolve(), pendingLoad = Promise.resolve();
function beginOperation() {
  connectionBusy = true;
  let finish;
  pendingOperation = new Promise(resolve => { finish = resolve; });
  return () => { connectionBusy = false; finish(); };
}
const COMMAND = 'adoin.panel.anywhere.open';
const SERVICE = 'adoin-panel-anywhere-connection';
function status() { return { ...client.status(), savedConnection: saved?.public() || null, savedConnectionError: savedError }; }

async function onLoad() {
  client = new Connector(pi); saved = new ConnectionStore(pi); savedError = null;
  try {
    await pi.commands.register({ id: COMMAND, title: 'Agents Anywhere: Connection Settings / 连接设置', run: () => pi.ui.openPanel() });
    await pi.services.register({ id: SERVICE, start: async () => {}, stop: async () => { stop(); } });
  } catch {
    stop(); client = null; saved = null;
    await Promise.allSettled([pi.commands.unregister(COMMAND), pi.services.unregister(SERVICE)]);
    throw new Error('Agents Anywhere requires panel, background service and network APIs from a compatible host.');
  }
  const owner = client, storage = saved;
  try {
    pendingLoad = storage.load(); await pendingLoad;
    if (client === owner && saved === storage && storage.public()) {
      const { profile, serverUrl, connectorId } = storage.public();
      owner.publicConfig = { profile, serverUrl, connectorId };
    }
  } catch (error) {
    if (client === owner) savedError = error instanceof SafeError ? error.code : 'persistence_failed';
  }
}
async function onUnload() {
  stop(); client = null; saved = null; savedError = null;
  // Let the host finish an in-flight settings write/KDF before a new instance loads.
  await Promise.allSettled([pendingOperation, pendingLoad]);
  await Promise.allSettled([pi.commands.unregister(COMMAND), pi.services.unregister(SERVICE)]);
}
async function onPanelInvoke(channel, payload) {
  try {
    if (!client) fail('UNAVAILABLE', 'Plugin is not active.');
    switch (channel) {
      case 'anywhere.status': return status();
      case 'anywhere.parse': return parseCommand(payload?.command);
      case 'anywhere.disconnect': stop(); return status();
      case 'anywhere.forget': {
        if (connectionBusy) fail('persistence_busy', 'Wait for the current connection operation.');
        if (payload?.confirm !== true) fail('CONSENT_REQUIRED', 'Confirm forgetting the saved connection.');
        const finish = beginOperation();
        try {
          stop(); const owner = client; await saved.forget();
          if (client !== owner) fail('UNAVAILABLE', 'Plugin is not active.');
          savedError = null; owner.publicConfig = { profile: 'current', serverUrl: 'https://web.agents-anywhere.com', connectorId: '' };
          return status();
        } finally { finish(); }
      }
      case 'anywhere.connect': {
        if (connectionBusy) fail('persistence_busy', 'Wait for the current connection operation.');
        client.log('connect_received');
        const useSaved = payload?.useSaved === true;
        for (const field of ['shareSessions', 'useSaved', 'rememberConnection']) {
          if (payload?.[field] !== undefined && typeof payload[field] !== 'boolean') fail('INVALID_CONFIG', 'Connection consent flags must be booleans.');
        }
        if (useSaved && payload.rememberConnection === true) fail('INVALID_CONFIG', 'Choose saved credentials or save new credentials, not both.');
        if ((useSaved || payload.rememberConnection === true) && (typeof payload.vaultPassword !== 'string' || payload.vaultPassword.length < 12 || payload.vaultPassword.length > 1024)) fail('password_invalid', 'Use a password of 12–1024 characters.');
        let config = validateConfig({ ...payload, ...(useSaved ? { connectorToken: 'saved-credential-placeholder' } : {}) }, manifest.net.domains, PROFILES);
        if (typeof pi.net?.fetch !== 'function' || typeof pi.net?.websocket?.connect !== 'function' || typeof pi.net?.websocket?.send !== 'function' || typeof pi.net?.websocket?.close !== 'function' || typeof pi.events?.on !== 'function' || typeof pi.events?.off !== 'function') {
          fail('UNSUPPORTED', 'Host network/event APIs are unavailable.');
        }
        if (savedError) fail(savedError, 'Saved connection needs local recovery. Forget it before saving a replacement.');
        const finish = beginOperation();
        stop(); const epoch = setupEpoch, owner = client, storage = saved;
        let sessions = null;
        const guard = () => { if (epoch !== setupEpoch || client !== owner) fail('UNAVAILABLE', 'Connection setup was cancelled.'); };
        try {
          if (useSaved) {
            const connectorToken = await storage.unlock(config, payload.vaultPassword); guard();
            config = validateConfig({ ...config, connectorToken, consent: true }, manifest.net.domains, PROFILES);
          }
          if (payload.shareSessions === true) {
            const workspace = await PiBridge.capture(pi); guard();
            const bridge = new PiBridge(pi, workspace);
            sessions = new SessionService(pi, bridge, config, (method, params) => owner.notify(method, params), (event, detail) => owner.log(event, detail));
            await sessions.initialize(); guard();
          }
          await storage.save(config, payload.rememberConnection === true ? payload.vaultPassword : undefined); guard();
          owner.connect(config, sessions);
          return status();
        } catch (error) { sessions?.stop(); throw error; }
        finally { config = null; finish(); }
      }
      default: fail('UNSUPPORTED', 'Unknown panel operation.');
    }
  } catch (error) {
    // Never forward arbitrary host/network errors: they may include credentials.
    if (['anywhere.connect', 'anywhere.parse'].includes(channel)) client?.log('configuration_rejected', error instanceof SafeError ? error.code : 'UNAVAILABLE');
    if (error instanceof SafeError) throw error;
    throw new SafeError('UNAVAILABLE', 'Operation failed. Check host permissions and the sanitized connection status.');
  }
}
module.exports = { onLoad, onUnload, onPanelInvoke };
