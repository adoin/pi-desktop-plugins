'use strict';
const manifest = require('./manifest.json');
const { Connector } = require('./src/connector');
const { SafeError, fail, validateConfig, parseCommand } = require('./src/config');
const { PROFILES } = require('./src/profiles');
const { PiBridge } = require('./src/pi-bridge');
const { SessionService } = require('./src/sessions');
const { ConnectionStore } = require('./src/connection-store');
const { requireSafeFetch } = require('./src/safe-fetch');
const { ProjectSelection, ProjectSessions } = require('./src/projects');
const { LocalConnection } = require('./src/local-connection');
const path = require('node:path');
const RESTORE = Symbol('startup-scope');
const samePath = (a, b) => typeof a === 'string' && typeof b === 'string' && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
let local = null, autoReconnectError = null;
let pendingDisconnect = Promise.resolve();
let projectSelection = null;
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
function status() { return { ...client.status(), savedConnection: saved?.public() || null, savedConnectionError: savedError, localCredentialSupported: process.platform === 'win32', localConnection: local?.public() || { available: false, autoConnect: false }, autoReconnectError }; }

async function onLoad() {
  client = new Connector(pi); saved = new ConnectionStore(pi); savedError = null;
  local = new LocalConnection(pi); autoReconnectError = null;
  projectSelection = new ProjectSelection(pi);
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
  const vault = local, epoch = setupEpoch;
  pendingLoad = (async () => {
    try {
      await vault.load();
      if (client !== owner || epoch !== setupEpoch || !vault.public().autoConnect || savedError) return;
      const restored = await vault.unlock(storage.public());
      if (client !== owner || epoch !== setupEpoch) return;
      try {
        await onPanelInvoke('anywhere.connect', { ...restored.config, consent: true, shareSessions: restored.scope.shareSessions, useProjects: restored.scope.useProjects, projectIds: restored.scope.projects.map(p => p.id), [RESTORE]: restored.scope });
      } finally {
        // Release this temporary reference; the live Connector retains its token for reauth.
        restored.config.connectorToken = '';
      }
    } catch (error) {
      if (client === owner) autoReconnectError = error instanceof SafeError ? error.code : 'local_storage_failed';
    }
  })();
  await pendingLoad;
}
async function onUnload() {
  stop(); client = null; saved = null; savedError = null;
  projectSelection = null; local = null;
  // Let the host finish an in-flight settings write/KDF before a new instance loads.
  await Promise.allSettled([pendingOperation, pendingLoad, pendingDisconnect]);
  await Promise.allSettled([pi.commands.unregister(COMMAND), pi.services.unregister(SERVICE)]);
}
async function disconnect() {
  stop();
  const vault = local;
  await pendingOperation;
  await vault?.disable();
  autoReconnectError = null;
}
async function onPanelInvoke(channel, payload) {
  try {
    if (!client) fail('UNAVAILABLE', 'Plugin is not active.');
    switch (channel) {
      case 'anywhere.status': return status();
      case 'anywhere.parse': return parseCommand(payload?.command);
      case 'anywhere.disconnect': {
        const stopping = disconnect();
        pendingDisconnect = Promise.allSettled([pendingDisconnect, stopping]);
        await stopping;
        return client ? status() : null;
      }
      case 'anywhere.projects': {
        if (connectionBusy) fail('persistence_busy', 'Wait for the current connection operation.');
        const config = validateConfig({ ...payload, consent: true, connectorToken: 'project-list-placeholder' }, manifest.net.domains, PROFILES, manifest.permissions);
        const finish = beginOperation(), owner = client, selection = projectSelection;
        try {
          const result = await selection.load(config);
          if (client !== owner) fail('UNAVAILABLE', 'Project list request was cancelled.');
          return result;
        } finally { finish(); }
      }
      case 'anywhere.forget': {
        if (connectionBusy) fail('persistence_busy', 'Wait for the current connection operation.');
        if (payload?.confirm !== true) fail('CONSENT_REQUIRED', 'Confirm forgetting the saved connection.');
        const finish = beginOperation();
        try {
          stop(); const owner = client;
          const cleared = await Promise.allSettled([local.forget(), saved.forget()]);
          const failed = cleared.find(result => result.status === 'rejected');
          if (failed) throw failed.reason;
          autoReconnectError = null;
          if (client !== owner) fail('UNAVAILABLE', 'Plugin is not active.');
          savedError = null; owner.publicConfig = { profile: 'current', serverUrl: 'https://web.agents-anywhere.com', connectorId: '' };
          return status();
        } finally { finish(); }
      }
      case 'anywhere.connect': {
        if (connectionBusy) fail('persistence_busy', 'Wait for the current connection operation.');
        client.log('connect_received');
        const useSaved = payload?.useSaved === true, useLocal = payload?.useLocal === true;
        if (useLocal && (useSaved || payload.rememberConnection === true)) fail('INVALID_CONFIG', 'Choose one credential source.');
        if (payload.autoReconnect === true && (useSaved || payload.rememberConnection === true)) fail('INVALID_CONFIG', 'Choose password encryption or local automatic reconnect.');
        if ((useLocal || payload.autoReconnect === true) && process.platform !== 'win32') fail('UNSUPPORTED', 'Windows-account encryption is unavailable on this platform.');
        for (const field of ['shareSessions', 'useSaved', 'rememberConnection', 'useProjects', 'useLocal', 'autoReconnect']) {
          if (payload?.[field] !== undefined && typeof payload[field] !== 'boolean') fail('INVALID_CONFIG', 'Connection consent flags must be booleans.');
        }
        if (useSaved && payload.rememberConnection === true) fail('INVALID_CONFIG', 'Choose saved credentials or save new credentials, not both.');
        if ((useSaved || payload.rememberConnection === true) && (typeof payload.vaultPassword !== 'string' || payload.vaultPassword.length < 12 || payload.vaultPassword.length > 1024)) fail('password_invalid', 'Use a password of 12–1024 characters.');
        let config = validateConfig({ ...payload, ...(useSaved || useLocal ? { connectorToken: 'saved-credential-placeholder' } : {}) }, manifest.net.domains, PROFILES, manifest.permissions);
        if (payload.useProjects === true && payload.shareSessions !== true) fail('CONSENT_REQUIRED', 'Confirm sharing the selected projects before connecting.');
        if (typeof pi.net?.fetch !== 'function' || typeof pi.net?.websocket?.connect !== 'function' || typeof pi.net?.websocket?.send !== 'function' || typeof pi.net?.websocket?.close !== 'function' || typeof pi.events?.on !== 'function' || typeof pi.events?.off !== 'function') {
          fail('UNSUPPORTED', 'Host network/event APIs are unavailable.');
        }
        if (savedError) fail(savedError, 'Saved connection needs local recovery. Forget it before saving a replacement.');
        const finish = beginOperation();
        stop(); const epoch = setupEpoch, owner = client, storage = saved;
        let sessions = null, projects = [], workspacePath = null;
        const vault = local;
        const selection = projectSelection;
        const guard = () => { if (epoch !== setupEpoch || client !== owner) fail('UNAVAILABLE', 'Connection setup was cancelled.'); };
        try {
          await requireSafeFetch(pi); guard();
          if (useLocal) {
            const restored = await vault.unlock(config); guard();
            config = validateConfig({ ...config, connectorToken: restored.config.connectorToken, consent: true }, manifest.net.domains, PROFILES, manifest.permissions);
          }
          if (useSaved) {
            const connectorToken = await storage.unlock(config, payload.vaultPassword); guard();
            config = validateConfig({ ...config, connectorToken, consent: true }, manifest.net.domains, PROFILES, manifest.permissions);
          }
          if (payload.shareSessions === true) {
            if (payload.useProjects === true) {
              if (payload[RESTORE]) {
                await selection.load(config); guard();
              }
              projects = await selection.resolve(config, payload.projectIds); guard();
              if (payload[RESTORE] && projects.some(p => !payload[RESTORE].projects.some(old => old.id === p.id && samePath(old.path, p.path)))) fail('project_selection_changed', 'Approved project moved.');
              sessions = new ProjectSessions(pi, projects, config, (method, params) => owner.notify(method, params), (event, detail) => owner.log(event, detail));
            } else {
              const workspace = await PiBridge.capture(pi); guard();
              if (payload[RESTORE] && !samePath(workspace.path, payload[RESTORE].workspacePath)) fail('workspace_changed', 'Approved workspace changed.');
              workspacePath = workspace.path;
              const bridge = new PiBridge(pi, workspace);
              sessions = new SessionService(pi, bridge, config, (method, params) => owner.notify(method, params), (event, detail) => owner.log(event, detail));
            }
            await sessions.initialize(); guard();
          }
          if (!payload[RESTORE]) {
            await storage.save(config, payload.rememberConnection === true ? payload.vaultPassword : undefined); guard();
            if (payload.useProjects !== undefined) { await selection.save(config, projects, payload.useProjects === true, guard); guard(); }
            if (payload.autoReconnect === true) {
              await vault.save(config, { shareSessions: payload.shareSessions === true, useProjects: payload.useProjects === true, workspacePath, projects: projects.map(({ id, path }) => ({ id, path })) }); guard();
            } else if (!useLocal) { await vault.forget(); guard(); }
            else { await vault.disable(); guard(); }
          }
          autoReconnectError = null;
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
