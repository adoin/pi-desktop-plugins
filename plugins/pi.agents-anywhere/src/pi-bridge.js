'use strict';
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { SafeError, fail, record } = require('./config');

const OPERATIONS = ['session/list', 'session/get', 'session/create', 'session/configure', 'agent/prompt', 'agent/abort', 'agent/getStatus'];
const HOST_MESSAGE = 'The host operation could not be completed.';
const text = (value, max = 256) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
function canonical(value) {
  if (!text(value, 32768) || !path.isAbsolute(value)) return null;
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
async function host(action) {
  try { return await action(); }
  catch (error) {
    if (error instanceof SafeError) throw error;
    fail('host_operation_failed', HOST_MESSAGE);
  }
}
function malformed() { fail('host_operation_failed', HOST_MESSAGE); }
function summary(session) {
  const result = { id: session.id };
  for (const key of ['title', 'projectPath', 'providerId', 'modelId', 'permissionMode', 'mode', 'createdAt', 'updatedAt', 'messageCount']) {
    if (typeof session[key] === 'string' || (typeof session[key] === 'number' && Number.isFinite(session[key]))) result[key] = session[key];
  }
  return result;
}
function validId(id) {
  if (!text(id)) fail('invalid_params', 'A bounded nonempty identifier is required.');
}

class PiBridge {
  constructor(pi, workspace) {
    this.pi = pi;
    if (!record(workspace) || !canonical(workspace.path)) fail('workspace_unavailable', 'Select a local workspace first.');
    this.workspace = Object.freeze({ ...workspace });
    this.boundPath = canonical(workspace.path);
    this.epoch = 0; this.context = new AsyncLocalStorage();
  }

  static async capture(pi) {
    const workspace = await host(() => pi.workspace.get());
    if (!record(workspace) || !canonical(workspace.path)) fail('workspace_unavailable', 'Select a local workspace first.');
    return {
      path: workspace.path,
      name: text(workspace.name) ? workspace.name : path.basename(workspace.path),
      ...(text(workspace.projectId) ? { projectId: workspace.projectId } : {}),
    };
  }

  invalidate() { this.epoch++; }
  guard() { if (this.context.getStore() !== undefined && this.context.getStore() !== this.epoch) fail('sharing_inactive', 'Session sharing was cancelled during the host operation.'); }
  async checkWorkspace() {
    this.guard();
    const current = await host(() => this.pi.workspace.get());
    this.guard();
    if (!record(current) || canonical(current.path) !== this.boundPath) {
      fail('workspace_changed', 'The selected workspace has changed. Reconnect locally before continuing.');
    }
  }

  async invoke(operation, args, confirm = false) {
    await this.checkWorkspace();
    const result = await host(() => this.pi.desktop.invoke({ operation, args, ...(confirm ? { confirm: true } : {}) }));
    await this.checkWorkspace();
    return result;
  }

  async initialize() {
    await this.checkWorkspace();
    if (typeof this.pi.desktop?.listOperations !== 'function' || typeof this.pi.desktop?.invoke !== 'function' || typeof this.pi.models?.list !== 'function') {
      fail('host_api_unavailable', 'Required host APIs are unavailable.');
    }
    let operations;
    try { operations = await this.pi.desktop.listOperations(); }
    catch { fail('host_api_unavailable', 'Required host APIs are unavailable.'); }
    if (!Array.isArray(operations) || !OPERATIONS.every(id => operations.some(operation => record(operation) && operation.id === id))) {
      fail('host_api_unavailable', 'Required host APIs are unavailable.');
    }
    await this.checkWorkspace();
  }

  allowed(session) {
    return record(session) && text(session.id) && !session.id.startsWith('native-pi:') &&
      !['native', 'native-pi'].includes(session.source) && canonical(session.projectPath) === this.boundPath &&
      !session.readOnlyReason && session.capabilities?.readOnly !== true && session.capabilities?.canPrompt !== false;
  }

  async list() {
    const result = await this.invoke('session/list', []);
    if (!record(result) || !Array.isArray(result.sessions)) malformed();
    return result.sessions.filter(session => this.allowed(session)).map(summary);
  }

  async authorize(id) {
    validId(id);
    if (!(await this.list()).some(session => session.id === id)) fail('session_unavailable', 'The session is not available in the selected workspace.');
  }

  async get(id, { messageLimit = 100, messageBefore, contentLimit = 16000 } = {}) {
    await this.authorize(id);
    if (!Number.isInteger(messageLimit) || messageLimit < 1 || messageLimit > 100 ||
        !Number.isInteger(contentLimit) || contentLimit < 1 || contentLimit > 16000 ||
        (messageBefore !== undefined && (!Number.isSafeInteger(messageBefore) || messageBefore < 0))) {
      fail('invalid_params', 'Invalid message window.');
    }
    const result = await this.invoke('session/get', [{ id, messageLimit, contentLimit, ...(messageBefore === undefined ? {} : { messageBefore }) }]);
    if (!record(result) || !this.allowed(result.session) || result.session.id !== id ||
        !Array.isArray(result.session.messages) || !result.session.messages.every(message => record(message) && typeof message.content === 'string')) malformed();
    return result.session;
  }

  async status(id) {
    await this.authorize(id);
    const result = await this.invoke('agent/getStatus', [id]);
    if (!record(result) || !record(result.status) || typeof result.status.isRunning !== 'boolean') malformed();
    return result.status;
  }

  async models() {
    await this.checkWorkspace();
    const result = await host(() => this.pi.models.list());
    await this.checkWorkspace();
    if (!Array.isArray(result)) malformed();
    return result.filter(model => record(model) && ['key', 'providerId', 'modelId', 'label'].every(key => text(model[key], 1024)))
      .slice(0, 200).map(({ key, providerId, modelId, label, isDefault }) => ({ key, providerId, modelId, label, isDefault: isDefault === true }));
  }

  async create({ title, modelKey } = {}) {
    await this.checkWorkspace();
    if (!text(title, 256) || (modelKey !== undefined && !text(modelKey, 1024))) fail('invalid_params', 'A title of at most 256 characters and a valid model key are required.');
    const models = await this.models();
    const model = modelKey === undefined ? models.find(item => item.isDefault) || models[0] : models.find(item => item.key === modelKey);
    if (!model) fail('model_unavailable', 'Select an available configured model.');
    const created = await this.invoke('session/create', [{ title, mode: 'agent', projectPath: this.workspace.path, providerId: model.providerId, modelId: model.modelId, thinkingLevel: 'off' }]);
    if (!record(created) || !this.allowed(created.session)) malformed();
    const id = created.session.id;
    let configured;
    try {
      configured = await this.invoke('session/configure', [id, { mode: 'agent', permissionMode: 'ask' }], true);
      if (!record(configured) || !this.allowed(configured.session) || configured.session.id !== id || configured.session.permissionMode !== 'ask') malformed();
    } catch (error) {
      if (error instanceof SafeError && ['workspace_changed', 'sharing_inactive'].includes(error.code)) throw error;
      const denied = new SafeError('creation_permission_denied', 'Session permission confirmation was not completed. A blank session may remain.');
      denied.sessionId = id;
      throw denied;
    }
    return summary(configured.session);
  }

  async prompt(id, content, messageId) {
    await this.checkWorkspace();
    if (typeof content !== 'string' || !content.trim() || content.length > 32000) fail('invalid_params', 'Prompt content must contain 1 to 32000 characters.');
    validId(messageId);
    await this.get(id);
    const result = await this.invoke('agent/prompt', [{ sessionId: id, content, messageId }]);
    if (!record(result) || result.accepted !== true || !text(result.turnId)) malformed();
    return { accepted: true, turnId: result.turnId };
  }

  async abort(id, turnId) {
    await this.checkWorkspace();
    validId(turnId);
    await this.get(id);
    const result = await this.invoke('agent/abort', [{ sessionId: id, turnId }]);
    if (!record(result) || typeof result.ok !== 'boolean') malformed();
    return { ok: result.ok };
  }
}
// Carry one cancellation generation across nested awaits without sharing mutable
// per-request state between concurrent status reads and mutations.
for (const name of ['initialize', 'list', 'get', 'status', 'models', 'create', 'prompt', 'abort']) {
  const implementation = PiBridge.prototype[name];
  PiBridge.prototype[name] = function (...args) {
    const epoch = this.context.getStore() ?? this.epoch;
    return this.context.run(epoch, () => implementation.apply(this, args));
  };
}
module.exports = { PiBridge };
