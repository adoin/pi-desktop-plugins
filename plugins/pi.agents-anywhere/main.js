'use strict';
const manifest = require('./manifest.json');
const { Connector } = require('./src/connector');
const { SafeError, fail, validateConfig, parseCommand } = require('./src/config');
const { PROFILES } = require('./src/profiles');
const { PiBridge } = require('./src/pi-bridge');
const { SessionService } = require('./src/sessions');
let setupEpoch = 0;
function stop() { setupEpoch++; client?.disconnect(); }
let client = null;
const COMMAND = 'pi-agents-anywhere.open';
const SERVICE = 'anywhere-connection';

async function onLoad() {
  client = new Connector(pi);
  try {
    await pi.commands.register({ id: COMMAND, title: 'Agents Anywhere: Connection Settings / 连接设置', run: () => pi.ui.openPanel() });
    await pi.services.register({ id: SERVICE, start: async () => {}, stop: async () => { stop(); } });
  } catch {
    stop(); client = null;
    await Promise.allSettled([pi.commands.unregister(COMMAND), pi.services.unregister(SERVICE)]);
    throw new Error('Agents Anywhere requires panel, background service and network APIs from a compatible host.');
  }
}
async function onUnload() {
  stop(); client = null;
  await Promise.allSettled([pi.commands.unregister(COMMAND), pi.services.unregister(SERVICE)]);
}
async function onPanelInvoke(channel, payload) {
  try {
    if (!client) fail('UNAVAILABLE', 'Plugin is not active.');
    switch (channel) {
      case 'anywhere.status': return client.status();
      case 'anywhere.parse': return parseCommand(payload?.command);
      case 'anywhere.disconnect': stop(); return client.status();
      case 'anywhere.connect': {
        client.log('connect_received');
        const config = validateConfig(payload, manifest.net.domains, PROFILES);
        if (typeof pi.net?.fetch !== 'function' || typeof pi.net?.websocket?.connect !== 'function' || typeof pi.net?.websocket?.send !== 'function' || typeof pi.net?.websocket?.close !== 'function' || typeof pi.events?.on !== 'function' || typeof pi.events?.off !== 'function') {
          fail('UNSUPPORTED', 'Host network/event APIs are unavailable.');
        }
        if (payload.shareSessions !== undefined && typeof payload.shareSessions !== 'boolean') fail('INVALID_CONFIG', 'Session sharing consent must be a boolean.');
        stop(); const epoch = setupEpoch; const owner = client;
        let sessions = null;
        if (payload.shareSessions === true) {
          const workspace = await PiBridge.capture(pi);
          if (epoch !== setupEpoch || client !== owner) fail('UNAVAILABLE', 'Connection setup was cancelled.');
          const bridge = new PiBridge(pi, workspace);
          sessions = new SessionService(pi, bridge, config, (method, params) => owner.notify(method, params), (event, detail) => owner.log(event, detail));
          await sessions.initialize();
        }
        if (epoch !== setupEpoch || client !== owner) { sessions?.stop(); fail('UNAVAILABLE', 'Connection setup was cancelled.'); }
        owner.connect(config, sessions);
        return owner.status();
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
