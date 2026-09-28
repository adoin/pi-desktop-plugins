'use strict';
const manifest = require('./manifest.json');
const { Connector } = require('./src/connector');
const { SafeError, fail, validateConfig, parseCommand } = require('./src/config');
const { PROFILES } = require('./src/profiles');
let client = null;
const COMMAND = 'pi-agents-anywhere.open';
const SERVICE = 'anywhere-connection';

async function onLoad() {
  client = new Connector(pi);
  try {
    await pi.commands.register({ id: COMMAND, title: 'Agents Anywhere: Connection Settings / 连接设置', run: () => pi.ui.openPanel() });
    await pi.services.register({ id: SERVICE, start: async () => {}, stop: async () => { client?.disconnect(); } });
  } catch {
    client?.disconnect(); client = null;
    await Promise.allSettled([pi.commands.unregister(COMMAND), pi.services.unregister(SERVICE)]);
    throw new Error('Agents Anywhere requires panel, background service and network APIs from a compatible host.');
  }
}
async function onUnload() {
  client?.disconnect(); client = null;
  await Promise.allSettled([pi.commands.unregister(COMMAND), pi.services.unregister(SERVICE)]);
}
async function onPanelInvoke(channel, payload) {
  try {
    if (!client) fail('UNAVAILABLE', 'Plugin is not active.');
    switch (channel) {
      case 'anywhere.status': return client.status();
      case 'anywhere.parse': return parseCommand(payload?.command);
      case 'anywhere.disconnect': client.disconnect(); return client.status();
      case 'anywhere.connect': {
        client.log('connect_received');
        const config = validateConfig(payload, manifest.net.domains, PROFILES);
        if (typeof pi.net?.fetch !== 'function' || typeof pi.net?.websocket?.connect !== 'function' || typeof pi.net?.websocket?.send !== 'function' || typeof pi.net?.websocket?.close !== 'function' || typeof pi.events?.on !== 'function' || typeof pi.events?.off !== 'function') {
          fail('UNSUPPORTED', 'Host network/event APIs are unavailable.');
        }
        client.connect(config);
        return client.status();
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
