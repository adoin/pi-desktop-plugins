'use strict';
const { fail, record } = require('./config');
const { SESSION_METHODS } = require('./sessions');
const METHODS = new Set(['runtime.discover', 'runtime.configSchema', 'runtime.config', 'runtime.validateConfig', 'runtime.start', 'runtime.stop', 'runtime.capabilities']);
const SCHEMA = { type: 'object', properties: {}, additionalProperties: false };
const DISABLED = ['session.send_message', 'session.interrupt', 'session.steer', 'session.interaction.approval', 'session.commands', 'session.command.execute', 'runtime.attachment', 'catalog.model', 'catalog.permission', 'catalog.effort'];
function schema() { return { revision: 1, schema: SCHEMA, uiSchema: null, defaults: {}, metadata: {} }; }
function only(params, keys) {
  if (!record(params) || Object.keys(params).some(key => !keys.includes(key))) fail('invalid_params', 'Unexpected runtime parameters.');
}
class RuntimeAdapter {
  constructor() { this.sessions = null; this.reset(); }
  reset() { this.sessions?.pause(); this.discovered = false; this.running = false; this.runtimeId = null; this.configRevision = null; this.revision = Date.now(); }
  status() { return { discovered: this.discovered, running: this.running, runtimeId: this.runtimeId }; }
  dispatch(method, params, requestId) {
    if (SESSION_METHODS.has(method)) {
      if (!this.running) fail('runtime_not_running', 'Start the Pi runtime instance first.');
      if (!this.sessions?.enabled) fail('sharing_disabled', 'Enable workspace session sharing locally in the Pi plugin.');
      return this.sessions.dispatch(method, params, requestId);
    }
    if (!METHODS.has(method)) fail('method_not_found', 'This runtime does not implement the requested method.');
    if (method === 'runtime.discover') {
      only(params, []);
      this.discovered = true;
      return { runtimeTypes: [{
        runtimeType: 'pi', displayName: 'Pi Desktop', description: 'Workspace-scoped Pi sessions; sharing requires local consent.',
        available: true, reason: null, recommended: false, recommendationRank: null,
        implementationType: null, configSchema: schema(),
        capabilities: { startTurn: !!this.sessions?.enabled, steerTurn: false, interruptTurn: !!this.sessions?.enabled, modelCatalog: !!this.sessions?.enabled, permissionCatalog: false },
        metadata: {}, instancePolicy: 'single', maxInstances: 1,
      }] };
    }
    const configuring = ['runtime.validateConfig', 'runtime.start'].includes(method);
    only(params, ['runtime', 'runtimeId', ...(configuring ? ['name', 'config', 'configRevision'] : [])]);
    const runtimeId = params.runtimeId ?? params.runtime;
    if (params.runtime !== 'pi' || typeof runtimeId !== 'string' || runtimeId.length > 128 || !(runtimeId === 'pi' || /^rti_[A-Za-z0-9_-]+$/.test(runtimeId))) {
      fail('invalid_params', 'Unknown runtime scope.');
    }
    const scope = { runtime: 'pi', runtimeId };
    if (configuring) {
      if (typeof params.name !== 'string' || !params.name.trim() || params.name.length > 128) fail('invalid_params', 'Runtime name must be a nonempty string of at most 128 characters.');
      // Config revisions are server-owned counters/timestamps, not schema revisions.
      if (!Number.isSafeInteger(params.configRevision) || params.configRevision < 0) fail('invalid_params', 'configRevision must be a nonnegative safe integer.');
      if (!record(params.config) || Object.keys(params.config).length) fail('invalid_params', 'This workspace-scoped runtime requires an empty configuration object.');
    }
    if (this.running && this.runtimeId !== runtimeId) fail('runtime_conflict', 'Only one runtime instance may be active.');
    switch (method) {
      case 'runtime.configSchema': return { ...scope, configSchema: { runtime: 'pi', ...schema() } };
      case 'runtime.validateConfig': return { ...scope, valid: true };
      case 'runtime.config': return { ...scope, running: this.running && this.runtimeId === runtimeId, config: this.runtimeId === runtimeId ? { ...scope, revision: this.configRevision, values: {}, schema: SCHEMA, uiSchema: null, metadata: {} } : null };
      case 'runtime.start':
        this.runtimeId = runtimeId; this.configRevision = params.configRevision; this.running = true; this.revision++;
        this.sessions?.activate(runtimeId);
        return { ...scope, status: 'running' };
      case 'runtime.stop':
        if (this.runtimeId !== runtimeId) fail('runtime_not_found', 'Runtime instance is not known.');
        this.running = false; this.revision++;
        this.sessions?.pause();
        return { ...scope, status: 'stopped' };
      case 'runtime.capabilities':
        if (!this.running || this.runtimeId !== runtimeId) fail('runtime_not_running', 'Start this runtime instance first.');
        if (this.sessions?.enabled) return { ...scope, capabilitySet: this.sessions.capabilitySet() };
        return { ...scope, capabilitySet: { ...scope, revision: this.revision, metadata: { phase: 2 }, capabilities: DISABLED.map(capabilityId => ({
          capabilityId, version: '1', scope: 'runtime', ...scope,
          supported: false, available: false, allowed: false,
          unavailableReason: 'Enable local session sharing; advanced capabilities remain unsupported.', metadata: {},
        })) } };
    }
  }
}
module.exports = { RuntimeAdapter, METHODS };
