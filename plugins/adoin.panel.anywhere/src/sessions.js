'use strict';
const { randomUUID } = require('node:crypto');
const { fail, record } = require('./config');
const { SessionStore, hash } = require('./session-store');
const SESSION_METHODS = new Set(['session.discover', 'session.create', 'session.send_message', 'session.interrupt', 'session.sync', 'session.state', 'session.capabilities', 'session.notices', 'session.selections.update', 'session.commands', 'runtime.modelCatalog', 'runtime.permissionCatalog', 'runtime.commands']);
const DISABLED = ['session.steer', 'session.interaction.approval', 'session.commands', 'session.command.execute', 'runtime.attachment', 'catalog.permission', 'catalog.effort'];
function id(value, name = 'sessionId') { if (typeof value !== 'string' || !value.trim() || value.length > 512 || /[\x00-\x1f\x7f]/.test(value)) fail('invalid_params', `${name} must be a bounded identifier.`); return value; }
class SessionService {
  constructor(pi, bridge, context, notify, log = () => {}) {
    this.pi = pi; this.bridge = bridge; this.notify = notify; this.log = log;
    this.context = Object.freeze({ profile: context.profile, serverUrl: context.serverUrl, connectorId: context.connectorId });
    this.store = new SessionStore(pi, this.context, bridge.workspace);
    this.enabled = true; this.runtimeId = null; this.epoch = 0; this.locks = new Set(); this.syncs = new Map();
    this.itemVersions = new Map(); this.sent = new Map(); this.turnReasons = new Map(); this.sessionCount = 0; this.lastSyncAt = null; this.ready = false;
  }
  async initialize() { await this.bridge.initialize(); await this.store.load(); }
  activate(runtimeId) { if (this.ready && this.runtimeId === runtimeId) return; this.bridge.invalidate?.(); this.runtimeId = runtimeId; this.epoch++; this.ready = this.enabled; this.sent.clear(); this.syncs.clear(); }
  pause() { this.bridge.invalidate?.(); this.epoch++; this.runtimeId = null; this.ready = false; this.sent.clear(); this.syncs.clear(); }
  stop() { this.enabled = false; this.pause(); }
  status() { return { enabled: this.enabled, workspaceName: this.bridge.workspace.name, sessionCount: this.sessionCount, lastSyncAt: this.lastSyncAt, ready: this.ready }; }
  guard(epoch = this.epoch) { if (!this.enabled || !this.runtimeId || epoch !== this.epoch) fail('sharing_inactive', 'Session sharing is not active for this connection.'); }
  scope() { return { runtime: 'pi', runtimeId: this.runtimeId }; }
  endTurn(event) {
    if (event && typeof event.sessionId === 'string' && ['completed', 'aborted', 'error'].includes(event.reason)) {
      this.turnReasons.set(event.sessionId, { turnId: event.turnId, reason: event.reason });
      if (this.turnReasons.size > 200) this.turnReasons.delete(this.turnReasons.keys().next().value);
    }
  }
  async binding(params) {
    this.guard(); const epoch = this.epoch; const aaId = id(params.sessionId);
    let b = this.store.binding(this.runtimeId, aaId);
    if (b && params.externalSessionId && params.externalSessionId !== b.piId) fail('session_identity_conflict', 'Native session ID does not match the stored binding.');
    if (!b) {
      const piId = id(params.externalSessionId, 'externalSessionId');
      await this.bridge.get(piId); this.guard(epoch);
      b = await this.store.bind(this.runtimeId, aaId, piId, () => { this.guard(epoch); this.checkBinding?.(piId, aaId); });
    }
    await this.bridge.get(b.piId); this.guard(epoch); return b;
  }
  meta(b, session) {
    return { sessionId: b.aaId, externalSessionId: b.piId, runtime: 'pi', runtimeId: b.runtimeId, title: typeof session.title === 'string' ? session.title.slice(0, 256) : 'Pi session', cwd: this.bridge.workspace.path, orderingTime: session.updatedAt || session.createdAt || null, metadata: {} };
  }
  async publish(method, params, epoch = this.epoch) { this.guard(epoch); await this.notify(method, params); this.guard(epoch); }
  async discover(params = {}) {
    this.guard(); const epoch = this.epoch; const list = await this.bridge.list(); this.guard(epoch);
    const limit = params.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail('invalid_params', 'Session limit must be between 1 and 100.');
    const cursor = params.cursor ?? '';
    if (cursor !== '' && (typeof cursor !== 'string' || !/^\d{1,8}$/.test(cursor))) fail('invalid_params', 'Discovery cursor must be a bounded numeric offset.');
    const offset = cursor === '' ? 0 : Number(cursor);
    const sessions = [];
    for (const s of list.slice(offset, offset + limit)) {
      this.guard(epoch);
      let b = this.store.native(this.runtimeId, s.id);
      if (!b) {
        const namespace = this.runtimeId === 'pi' ? this.context.connectorId : `${this.context.connectorId}:pi:${this.runtimeId}`;
        const aaId = `sess_pi_${hash(`${namespace}:pi:${s.id}`).slice(0, 24)}`;
        b = await this.store.bind(this.runtimeId, aaId, s.id, () => { this.guard(epoch); this.checkBinding?.(s.id, aaId); });
      }
      const meta = this.meta(b, s); sessions.push(meta);
      await this.publish('session.meta.upsert', { ...meta, lastActivityAt: meta.orderingTime }, epoch);
    }
    this.sessionCount = list.length; return { ...this.scope(), sessions, nextCursor: offset + limit < list.length ? String(offset + limit) : null };
  }
  capabilitySet(sessionId, running = false) {
    const scope = this.scope(); const capabilities = [
      ['session.send_message', true, !running], ['session.interrupt', true, running], ['catalog.model', true, true],
      ...DISABLED.map(name => [name, false, false]),
    ].map(([capabilityId, supported, available]) => ({ capabilityId, version: '1', scope: sessionId ? 'session' : 'runtime', ...scope, ...(sessionId ? { sessionId } : {}), supported, available: supported && available && this.ready, allowed: supported && this.enabled, ...(!supported ? { unavailableReason: 'Not supported by the safe Pi bridge.' } : {}), metadata: {} }));
    return { ...scope, revision: Date.now(), ...(sessionId ? { sessionId } : {}), capabilities, metadata: {} };
  }
  async state(b, detail, native) {
    let state = native.isRunning ? (native.pendingToolConfirmations > 0 ? 'waiting_approval' : 'running') : 'idle';
    const assistants = (detail.messages || []).filter(m => m.role === 'assistant'); const last = assistants.at(-1);
    const ended = this.turnReasons.get(b.piId);
    const reason = ended && (!native.currentTurnId || ended.turnId === native.currentTurnId) ? ended : null;
    let statusReason = native.pendingToolConfirmations > 0 ? 'Approve the pending tool locally in Pi Desktop.' : null;
    if (!native.isRunning && (last?.status === 'error' || reason?.reason === 'error')) { state = 'error'; statusReason = 'Pi reported an error. Inspect the local session.'; }
    else if (!native.isRunning && (last?.status === 'aborted' || reason?.reason === 'aborted')) statusReason = 'Task interrupted.';
    return { ...this.scope(), sessionId: b.aaId, externalSessionId: b.piId, status: state, selections: { model: detail.providerId && detail.modelId ? `${detail.providerId}/${detail.modelId}` : null }, statusReason, error: state === 'error' ? { code: 'pi_turn_error', message: 'Pi reported an error; see the local session.' } : null, metadata: {} };
  }
  timeline(b, detail) {
    const items = []; const base = Number.isSafeInteger(detail.messageStart) ? detail.messageStart : 0;
    for (const [index, m] of (detail.messages || []).entries()) {
      if (!['user', 'assistant'].includes(m.role) || m.parentToolCallId || typeof m.content !== 'string' || typeof m.id !== 'string') continue;
      const content = { kind: 'markdown', text: m.content.slice(0, 16000), format: 'markdown' };
      // Android projects blank non-assistant messages as unknown timeline items.
      // This text-only bridge cannot represent attachment-only or empty records.
      if (!content.text.trim()) continue;
      const status = ({ streaming: 'running', error: 'failed', aborted: 'interrupted' })[m.status] || 'done';
      const contentHash = hash(JSON.stringify([content, status])); const itemId = `pi_${hash(`${b.aaId}:${m.id}`).slice(0, 32)}`;
      const previous = this.itemVersions.get(itemId); const revision = previous?.hash === contentHash ? previous.revision : Math.max(Date.now(), (previous?.revision || 0) + 1);
      this.itemVersions.set(itemId, { hash: contentHash, revision });
      if (this.itemVersions.size > 10000) this.itemVersions.delete(this.itemVersions.keys().next().value);
      const receipt = this.store.data.receipts.find(r => r.piId === b.piId && r.messageId === m.id);
      items.push({ id: itemId, sessionId: b.aaId, type: 'message', status, role: m.role, content, source: { runtime: 'pi', sessionId: b.piId, itemId: m.id, ...(receipt?.clientMessageId ? { clientMessageId: receipt.clientMessageId } : {}) }, orderSeq: base + index + 1, revision, contentHash, ...(typeof m.createdAt === 'string' ? { createdAt: m.createdAt } : {}) });
    }
    return items;
  }
  async syncBinding(b, history = false) {
    this.guard(); const key = `${b.runtimeId}:${b.aaId}`;
    const epoch = this.epoch;
    const active = this.syncs.get(key);
    if (active) {
      if (!history || active.history) return active.task;
      await active.task; this.guard(epoch);
      return this.syncBinding(b, true);
    }
    const task = (async () => {
      let detail = await this.bridge.get(b.piId); this.guard(epoch);
      const latest = detail; const meta = this.meta(b, detail);
      await this.publish('session.meta.upsert', { ...meta, lastActivityAt: meta.orderingTime }, epoch);
      for (let page = 0; page < (history ? 10 : 1); page++) {
        const items = this.timeline(b, detail);
        // Bounded chunks and complete:false never erase history outside this window.
        for (let offset = 0; offset < items.length; offset += 8) {
          const chunk = items.slice(offset, offset + 8); const fingerprint = hash(JSON.stringify(chunk));
          const chunkKey = `${key}:${chunk.map(item => item.id).join(',')}`;
          if (!history && this.sent.get(chunkKey) === fingerprint) continue;
          await this.publish('timeline.sync', { ...this.scope(), sessionId: b.aaId, externalSessionId: b.piId, items: chunk, complete: false, metadata: {} }, epoch);
          this.sent.set(chunkKey, fingerprint); if (this.sent.size > 2000) this.sent.delete(this.sent.keys().next().value);
        }
        if (!history || page === 9 || !detail.hasMoreBefore || !Number.isInteger(detail.messageStart) || detail.messageStart <= 0) break;
        const before = detail.messageStart;
        detail = await this.bridge.get(b.piId, { messageBefore: before }); this.guard(epoch);
        if (!Number.isInteger(detail.messageStart) || detail.messageStart >= before) fail('host_response_invalid', 'Transcript pagination did not advance.');
      }
      const native = await this.bridge.status(b.piId); this.guard(epoch);
      const state = await this.state(b, latest, native);
      await this.publish('session.state.updated', state, epoch);
      await this.publish('runtime.capability.updated', this.capabilitySet(b.aaId, native.isRunning), epoch);
      this.lastSyncAt = new Date().toISOString(); return state;
    })();
    const activeTask = { task, history }; this.syncs.set(key, activeTask);
    try { return await task; } finally { if (this.syncs.get(key) === activeTask) this.syncs.delete(key); }
  }
  async tick() {
    if (!this.enabled || !this.runtimeId) return;
    const epoch = this.epoch;
    const { sessions, nextCursor } = await this.discover({ limit: 10, cursor: this.pollCursor ?? '' }); this.guard(epoch);
    // Page through the full inventory so older bound conversations remain live.
    for (const s of sessions) {
      this.guard(epoch); const b = this.store.binding(this.runtimeId, s.sessionId);
      try { await this.syncBinding(b); } catch (error) { if (['workspace_changed', 'project_selection_changed', 'projects_unavailable'].includes(error?.code) || !this.ready) throw error; this.log('session_sync_failed'); }
    }
    this.pollCursor = nextCursor;
  }
  async modelCatalog() {
    const epoch = this.epoch; const models = await this.bridge.models(); this.guard(epoch);
    return { ...this.scope(), catalog: { ...this.scope(), revision: Date.now(), models: models.map(m => ({ id: `${m.providerId}/${m.modelId}`, selectionId: m.key, displayName: m.label, description: null, default: m.isDefault === true, reasoningItems: [], metadata: { enabled: true } })) } };
  }
  validateTurn(params) {
    if (typeof params.content !== 'string' || !params.content.trim() || params.content.length > 32000) fail('invalid_params', 'Message content must contain 1–32000 characters.');
    if (params.cwd != null && !this.bridge.matchesWorkspace(params.cwd)) fail('workspace_denied', 'Remote workspace switching is not allowed.');
    for (const field of ['attachments', 'timelineAttachments']) if (params[field] != null && (!Array.isArray(params[field]) || params[field].length)) fail('unsupported', 'Attachments are not supported.');
    if (params.runtimeOptions != null && (!record(params.runtimeOptions) || Object.keys(params.runtimeOptions).length)) fail('unsupported', 'Runtime options are not supported.');
    if (params.selections?.model != null && (typeof params.selections.model !== 'string' || params.selections.model.length > 1024)) fail('invalid_params', 'Model selection must be a bounded identifier.');
    if (params.selections != null && (!record(params.selections) || Object.keys(params.selections).some(key => key !== 'model'))) fail('unsupported', 'Remote permission and effort changes are not supported.');
    if (params.clientMessageId != null) id(params.clientMessageId, 'clientMessageId');
  }
  async turn(method, params, requestId) {
    this.guard(); const epoch = this.epoch; this.validateTurn(params);
    const aaId = id(params.sessionId); const runtimeId = this.runtimeId;
    const create = method === 'session.create'; const b = create ? this.store.binding(runtimeId, aaId) : await this.binding(params);
    this.guard(epoch);
    const lock = b?.piId || aaId;
    if (this.locks.has(lock)) fail('session_busy', 'Another session operation is in progress.');
    const key = hash(`${runtimeId}:${aaId}:${create ? 'create' : id(params.clientMessageId || requestId, 'requestId')}`);
    this.locks.add(lock);
    let reserved = false, mutationStarted = false;
    try {
      const digest = hash(JSON.stringify([method, params.content, params.title || '', params.selections || {}]));
      const receipt = await this.store.receipt(key, digest, () => this.guard(epoch));
      reserved = !receipt.duplicate; this.guard(epoch);
      if (receipt.duplicate) return receipt.result;
      if (create && b) fail('session_identity_conflict', 'This platform session is already bound; send a message instead of creating it again.');
      let binding = b;
      if (create && !binding) {
        mutationStarted = true;
        const created = await this.bridge.create({ title: typeof params.title === 'string' ? params.title.slice(0, 256) : 'Anywhere session', modelKey: params.selections?.model });
        binding = await this.store.bind(runtimeId, aaId, created.id, () => this.checkBinding?.(created.id, aaId, runtimeId)); this.guard(epoch);
      }
      const detail = await this.bridge.get(binding.piId); this.guard(epoch);
      if (!create && params.selections?.model) {
        const models = await this.bridge.models(); this.guard(epoch);
        const selected = models.find(m => m.key === params.selections.model);
        if (!selected || selected.providerId !== detail.providerId || selected.modelId !== detail.modelId) fail('unsupported', 'Change an existing session model locally in Pi Desktop.');
      }
      const status = await this.bridge.status(binding.piId); this.guard(epoch);
      if (status.isRunning) fail('session_busy', 'Wait for the current Pi turn to finish.');
      const messageId = randomUUID();
      await this.store.change(data => { const r = data.receipts.find(r => r.key === key); r.piId = binding.piId; r.messageId = messageId; if (params.clientMessageId) r.clientMessageId = params.clientMessageId; }, () => this.guard(epoch));
      this.guard(epoch); this.turnReasons.delete(binding.piId);
      mutationStarted = true;
      const accepted = await this.bridge.prompt(binding.piId, params.content, messageId);
      const result = { runtime: 'pi', runtimeId, sessionId: aaId, externalSessionId: binding.piId, accepted: accepted.accepted };
      await this.store.change(data => { const r = data.receipts.find(r => r.key === key); r.turnId = accepted.turnId; });
      await this.store.finish(key, result);
      if (this.epoch === epoch && this.ready) void this.syncBinding(binding).catch(() => this.log('session_sync_failed'));
      return result;
    } catch (error) {
      // Only a proven pre-mutation failure is safe to retry with the same ID.
      if (reserved && !mutationStarted) await this.store.change(data => { data.receipts = data.receipts.filter(r => r.key !== key); });
      throw error;
    } finally { this.locks.delete(lock); }
  }
  async dispatch(method, params, requestId) {
    this.guard();
    if (params.runtime !== 'pi' || (params.runtimeId ?? params.runtime) !== this.runtimeId) fail('invalid_params', 'Unknown runtime instance.');
    if (method === 'session.discover') return this.discover(params);
    if (method === 'runtime.modelCatalog') return this.modelCatalog();
    if (method === 'runtime.permissionCatalog') return { ...this.scope(), catalog: { ...this.scope(), revision: Date.now(), permissions: [] } };
    if (method === 'runtime.commands') return { ...this.scope(), commands: [] };
    if (['session.create', 'session.send_message'].includes(method)) return this.turn(method, params, requestId);
    const epoch = this.epoch; const b = await this.binding(params); this.guard(epoch);
    if (method === 'session.notices') return { ...this.scope(), notices: [] };
    if (method === 'session.commands') return { ...this.scope(), commands: [] };
    if (method === 'session.sync') {
      void this.syncBinding(b, true).catch(() => this.log('session_sync_failed'));
      return { ...this.scope(), accepted: true, background: true, sessionId: b.aaId, externalSessionId: b.piId };
    }
    if (method === 'session.interrupt') {
      const status = await this.bridge.status(b.piId); this.guard(epoch);
      if (!status.isRunning || !status.currentTurnId) return { ...this.scope(), ok: true, interrupted: false };
      const result = await this.bridge.abort(b.piId, status.currentTurnId); this.guard(epoch);
      if (result.ok) this.turnReasons.set(b.piId, { turnId: status.currentTurnId, reason: 'aborted' });
      return { ...this.scope(), ok: result.ok, interrupted: result.ok };
    }
    const detail = await this.bridge.get(b.piId); const native = await this.bridge.status(b.piId); this.guard(epoch);
    if (method === 'session.capabilities') return { ...this.scope(), capabilitySet: this.capabilitySet(b.aaId, native.isRunning) };
    if (method === 'session.state') return { ...this.scope(), state: await this.state(b, detail, native) };
    if (method === 'session.selections.update') fail('unsupported', 'Change session model and permission selections locally in Pi Desktop.');
    fail('method_not_found', 'Unsupported session operation.');
  }
}
module.exports = { SessionService, SESSION_METHODS };
