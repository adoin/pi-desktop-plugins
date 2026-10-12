'use strict';
const path = require('node:path');
const { fail, record } = require('./config');
const { hash } = require('./session-store');
const { PiBridge } = require('./pi-bridge');
const { SessionService } = require('./sessions');
const KEY = 'anywhereProjectSelectionV1';
const normalized = value => { const p = path.resolve(value); return process.platform === 'win32' ? p.toLowerCase() : p; };
const scopeKey = c => hash(JSON.stringify([c.profile, c.serverUrl, c.connectorId]));
class ProjectSelection {
  constructor(pi) { this.pi = pi; this.inventory = null; }
  async load(config) {
    const projects = (await PiBridge.projects(this.pi)).slice(0, 200);
    const settings = await this.pi.plugin.getSettings();
    const all = settings?.[KEY];
    if (all != null && (!record(all) || all.version !== 1 || !record(all.scopes))) fail('project_selection_invalid', 'Stored project selections are invalid.');
    const saved = all?.scopes[scopeKey(config)];
    if (saved != null && (!record(saved) || typeof saved.useProjects !== 'boolean' || !Array.isArray(saved.projects) || saved.projects.length > 32 || saved.projects.some(p => !record(p) || typeof p.id !== 'string' || typeof p.path !== 'string'))) fail('project_selection_invalid', 'Stored project selections are invalid.');
    this.inventory = { key: scopeKey(config), projects };
    return { projects, useProjects: saved?.useProjects === true, selectedProjectIds: projects.filter(p => saved?.projects.some(s => s.id === p.id && normalized(s.path) === normalized(p.path))).map(p => p.id) };
  }
  async resolve(config, ids) {
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 32 || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) fail('project_selection_invalid', 'Choose between 1 and 32 saved projects.');
    if (this.inventory?.key !== scopeKey(config)) fail('project_selection_changed', 'Reload the local project list for this connection.');
    const current = await PiBridge.projects(this.pi);
    const result = ids.map(id => {
      const approved = this.inventory.projects.find(p => p.id === id);
      const live = current.find(p => p.id === id);
      if (!approved || !live || normalized(approved.path) !== normalized(live.path)) fail('project_selection_changed', 'A selected project changed. Reload the local project list.');
      return live;
    });
    if (new Set(result.map(p => normalized(p.path))).size !== result.length) fail('project_selection_invalid', 'Select only one project record per directory.');
    return result;
  }
  async save(config, projects, useProjects, guard = () => {}) {
    guard(); const settings = await this.pi.plugin.getSettings(); guard(); const all = settings?.[KEY];
    if (all != null && (!record(all) || all.version !== 1 || !record(all.scopes))) fail('project_selection_invalid', 'Stored project selections are invalid.');
    const scopes = { ...(all?.scopes || {}) }; const key = scopeKey(config);
    if (!Object.hasOwn(scopes, key) && Object.keys(scopes).length >= 16) fail('mapping_limit', 'Project selection scope limit reached.');
    scopes[key] = { useProjects, projects: projects.map(({ id, path }) => ({ id, path })) };
    await this.pi.plugin.setSettings({ [KEY]: { version: 1, scopes } });
  }
}

// Each approved root retains its own bridge, persistent mapping and mutation locks.
// Runtime identity remains a single Pi instance; only session routing is multiplexed.
class ProjectSessions {
  mutations = new Set();
  constructor(pi, projects, config, notify, log) {
    this.children = projects.map(p => new SessionService(pi, new PiBridge(pi, { path: p.path, name: p.name }, { savedProjectId: p.id }), config, notify, log));
    for (const child of this.children) child.checkBinding = (piId, aaId, runtimeId = this.runtimeId) => {
      for (const other of this.children) {
        if (other === child) continue;
        if (other.store.native(runtimeId, piId)) fail('project_selection_changed', 'A session moved between approved projects. Review project selection locally.');
        if (other.store.binding(runtimeId, aaId)) fail('session_identity_conflict', 'Session identity belongs to another project.');
      }
    };
    this.enabled = true; this.ready = false; this.runtimeId = null; this.epoch = 0; this.pollIndex = 0;
  }
  async initialize() { for (const child of this.children) { if (!this.enabled) fail('sharing_inactive', 'Sharing stopped.'); await child.initialize(); } }
  activate(id) { if (this.ready && this.runtimeId === id) return; this.runtimeId = id; this.ready = this.enabled; this.epoch++; for (const c of this.children) c.activate(id); }
  pause() { this.epoch++; this.ready = false; this.runtimeId = null; for (const c of this.children) c.pause(); }
  stop() { this.enabled = false; this.pause(); for (const c of this.children) c.stop(); }
  guard(epoch = this.epoch) { if (!this.enabled || !this.ready || epoch !== this.epoch) fail('sharing_inactive', 'Project sharing is not active.'); }
  status() {
    const states = this.children.map(c => c.status());
    return { enabled: this.enabled, ready: this.ready, projectCount: states.length, workspaceName: states.map(s => s.workspaceName).join(', ').slice(0, 160), sessionCount: states.reduce((n, s) => n + s.sessionCount, 0), lastSyncAt: states.map(s => s.lastSyncAt).filter(Boolean).sort().at(-1) || null };
  }
  capabilitySet(...args) { return this.children[0].capabilitySet(...args); }
  endTurn(event) { for (const c of this.children) c.endTurn(event); }
  async tick() {
    if (!this.ready || !this.enabled) return;
    const epoch = this.epoch;
    for (let i = 0; i < Math.min(4, this.children.length); i++) {
      this.guard(epoch); await this.children[this.pollIndex++ % this.children.length].tick(); this.guard(epoch);
    }
  }
  async discover(params) {
    this.guard(); const epoch = this.epoch, runtimeId = this.runtimeId;
    const limit = params.limit ?? 100, cursor = params.cursor ?? '';
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (cursor !== '' && (typeof cursor !== 'string' || !/^\d{1,8}$/.test(cursor)))) fail('invalid_params', 'Invalid discovery window.');
    let skip = Number(cursor || 0), total = 0; const sessions = [];
    for (const child of this.children) {
      const available = await child.bridge.list(); this.guard(epoch); total += available.length;
      if (skip >= available.length) { skip -= available.length; continue; }
      if (sessions.length >= limit) continue;
      const page = await child.discover({ limit: limit - sessions.length, cursor: String(skip) }); this.guard(epoch);
      sessions.push(...page.sessions); skip = 0;
    }
    const next = Number(cursor || 0) + sessions.length;
    return { runtime: 'pi', runtimeId, sessions, nextCursor: next < total ? String(next) : null };
  }
  async dispatch(method, params, requestId) {
    if (!method.startsWith('session.') || method === 'session.discover') return this.route(method, params, requestId);
    const key = params.sessionId;
    if (this.mutations.has(key)) fail('session_busy', 'Another operation for this session is in progress.');
    this.mutations.add(key);
    try { return await this.route(method, params, requestId); } finally { this.mutations.delete(key); }
  }
  async route(method, params, requestId) {
    this.guard(); const epoch = this.epoch;
    if (params.runtime !== 'pi' || (params.runtimeId ?? params.runtime) !== this.runtimeId) fail('invalid_params', 'Unknown runtime instance.');
    if (method === 'session.discover') return this.discover(params);
    if (method.startsWith('runtime.')) return this.children[0].dispatch(method, params, requestId);
    // Prefer existing AA bindings; an external ID can never override a binding.
    const bound = this.children.filter(c => c.store.binding(this.runtimeId, params.sessionId));
    if (bound.length > 1) fail('session_identity_conflict', 'Session has conflicting project bindings.');
    let child = bound[0];
    if (!child && method === 'session.create') {
      const matches = this.children.filter(c => params.cwd != null && c.bridge.matchesWorkspace(params.cwd));
      child = matches.length === 1 ? matches[0] : (params.cwd == null && this.children.length === 1 ? this.children[0] : null);
      if (!child) fail('workspace_denied', 'Select one of the locally approved project directories for the new session.');
    }
    if (!child && typeof params.externalSessionId === 'string') {
      for (const c of this.children) {
        const list = await c.bridge.list(); this.guard(epoch);
        if (list.some(s => s.id === params.externalSessionId)) { child = c; break; }
      }
    }
    this.guard(epoch);
    if (!child) fail('session_unavailable', 'Session is not in a selected project.');
    return child.dispatch(method, params, requestId);
  }
}
module.exports = { ProjectSelection, ProjectSessions };
