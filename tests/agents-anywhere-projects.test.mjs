import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
const require = createRequire(import.meta.url);
const { ProjectSelection, ProjectSessions } = require('../plugins/adoin.panel.anywhere/src/projects');
const { PiBridge } = require('../plugins/adoin.panel.anywhere/src/pi-bridge');
const scope = { runtime: 'pi', runtimeId: 'rti_projects' };
const context = () => ({ profile: 'current', serverUrl: 'https://selfhost.example', connectorId: 'conn_projects', connectorToken: randomUUID() });
const root = path.resolve('project-fixture');
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const state = { settings: {}, calls: [], notifications: [], running: new Map(), current: path.join(root, 'other'), hooks: {}, requests: [] };
  state.projects = [1, 2, 3].map(id => ({ id, path: path.join(root, `project-${id}`), name: `Project ${id}` }));
  state.sessions = state.projects.map(p => ({ id: `s${p.id}`, projectPath: p.path, title: `Chat ${p.id}`, mode: 'agent', permissionMode: 'ask', providerId: 'p', modelId: 'm', messages: [{ id: `u${p.id}`, role: 'user', content: `Question ${p.id}` }] }));
  const pi = {
    events: new EventEmitter(),
    workspace: { get: async () => ({ path: state.current, name: 'Current' }) },
    models: { list: async () => [{ key: 'p/m', providerId: 'p', modelId: 'm', label: 'Model', isDefault: true }] },
    plugin: { getSettings: async () => structuredClone(state.settings), setSettings: async patch => Object.assign(state.settings, structuredClone(patch)) },
    commands: { register: async () => {}, unregister: async () => {} }, services: { register: async () => {}, unregister: async () => {} },
    desktop: {
      listOperations: async () => ['project/list','session/list','session/get','session/create','session/configure','agent/prompt','agent/abort','agent/getStatus'].map(id => ({ id })),
      invoke: async input => {
        state.calls.push(input); if (state.hooks[input.operation]) return state.hooks[input.operation](input);
        const [arg, config] = input.args;
        switch (input.operation) {
          case 'project/list': return { projects: structuredClone(state.projects) };
          case 'session/list': return { sessions: state.sessions.map(({ messages, ...s }) => s) };
          case 'session/get': return { session: structuredClone(state.sessions.find(s => s.id === arg.id)) };
          case 'session/create': { const session = { ...arg, id: randomUUID(), messages: [] }; state.sessions.push(session); return { session }; }
          case 'session/configure': { assert.equal(input.confirm, true); const s = state.sessions.find(s => s.id === arg); Object.assign(s, config); return { session: s }; }
          case 'agent/getStatus': return { status: { isRunning: state.running.has(arg), currentTurnId: state.running.get(arg) } };
          case 'agent/prompt': { state.running.set(arg.sessionId, 'turn'); state.sessions.find(s => s.id === arg.sessionId).messages.push({ id: arg.messageId, role: 'user', content: arg.content }); return { accepted: true, turnId: 'turn' }; }
          case 'agent/abort': { const ok = state.running.get(arg.sessionId) === arg.turnId; if (ok) state.running.delete(arg.sessionId); return { ok }; }
          default: throw new Error('Unexpected fixture operation');
        }
      }
    },
    net: { getCapabilities: async () => ({ fetchRedirectModes: ['error'] }), fetch: async input => { state.requests.push(input); return { status: 200, bodyText: JSON.stringify({ accessToken: randomUUID(), expiresIn: 900 }) }; }, websocket: { connect: async () => ({ socketId: 'socket' }), send: async () => {}, close: async () => {} } }
  };
  const config = context();
  const make = async (ids = ['1','2']) => {
    const selection = new ProjectSelection(pi); await selection.load(config);
    const projects = await selection.resolve(config, ids);
    const service = new ProjectSessions(pi, projects, config, async (method, params) => state.notifications.push({ method, params }));
    await service.initialize(); service.activate(scope.runtimeId); return { service, selection, projects };
  };
  return { pi, state, config, make };
}

test('project selection persists per origin/connector, excludes added or moved projects, and needs a fresh inventory', async () => {
  const f = fixture(), s = new ProjectSelection(f.pi);
  assert.deepEqual((await s.load(f.config)).selectedProjectIds, []);
  const projects = await s.resolve(f.config, ['1','2']); await s.save(f.config, projects, true);
  const reload = new ProjectSelection(f.pi); assert.deepEqual((await reload.load(f.config)).selectedProjectIds, ['1','2']);
  f.state.projects[1].path = path.join(root, 'moved'); f.state.projects.push({ id: 4, path: path.join(root,'new'), name:'New' });
  await assert.rejects(reload.resolve(f.config, ['2']), { code:'project_selection_changed' });
  assert.deepEqual((await reload.load(f.config)).selectedProjectIds, ['1']);
  assert.deepEqual((await reload.load({ ...f.config, serverUrl:'https://other.example' })).selectedProjectIds, []);
  await assert.rejects(reload.resolve(f.config, ['1']), { code:'project_selection_changed' });
  assert.ok(!JSON.stringify(f.state.settings).includes(f.config.connectorToken));
});

test('invalid, duplicate, missing and unlisted projects fail before any session operation', async () => {
  const f = fixture(), s = new ProjectSelection(f.pi); await s.load(f.config);
  for (const ids of [[], ['1','1'], ['unknown'], [1], Array.from({length:33},(_,i)=>String(i))]) await assert.rejects(s.resolve(f.config, ids));
  assert.ok(f.state.calls.every(c => c.operation === 'project/list'));
  f.state.settings.anywhereProjectSelectionV1 = { version: 99, scopes: {} };
  await assert.rejects(s.load(f.config), { code:'project_selection_invalid' });
});

test('bulk discover publishes each actual cwd and paginates across selected projects only', async () => {
  const f = fixture(), { service } = await f.make();
  const first = await service.dispatch('session.discover', { ...scope, limit:1 });
  assert.equal(first.sessions[0].externalSessionId, 's1'); assert.equal(first.nextCursor, '1');
  const second = await service.dispatch('session.discover', { ...scope, limit:1, cursor:first.nextCursor });
  assert.equal(second.sessions[0].externalSessionId, 's2'); assert.equal(second.nextCursor, null);
  assert.deepEqual(f.state.notifications.map(n=>n.params.cwd), f.state.projects.slice(0,2).map(p=>p.path));
  const again = await service.dispatch('session.discover', scope);
  assert.equal(again.sessions[0].sessionId, first.sessions[0].sessionId);
  assert.ok(!JSON.stringify(f.state.notifications).includes('project-3'));
  service.stop();
});

test('send, reply sync, interrupt and create stay inside their selected project while current workspace changes', async () => {
  const f = fixture(), { service } = await f.make();
  const { sessions } = await service.dispatch('session.discover', scope);
  const b = sessions[1]; f.state.current = path.join(root,'unrelated');
  const params = { ...scope, sessionId:b.sessionId, externalSessionId:'s2', cwd:f.state.projects[1].path, content:'Second project', clientMessageId:'send2' };
  assert.equal((await service.dispatch('session.send_message',params,'req')).accepted,true);
  assert.equal((await service.dispatch('session.interrupt',{...scope,sessionId:b.sessionId})).interrupted,true);
  f.state.sessions[1].messages.push({ id:'reply2',role:'assistant',content:'Answer in second project' });
  await service.tick();
  assert.ok(f.state.notifications.some(n=>n.method==='timeline.sync' && n.params.externalSessionId==='s2' && n.params.items.some(i=>i.content.text==='Answer in second project')));
  await assert.rejects(service.dispatch('session.send_message',{...params,cwd:f.state.projects[0].path}),{code:'workspace_denied'});
  await assert.rejects(service.dispatch('session.send_message',{...scope,sessionId:'outside',externalSessionId:'s3',content:'No'}),{code:'session_unavailable'});
  await assert.rejects(service.dispatch('session.create',{...scope,sessionId:'new',content:'No cwd'},'new'),{code:'workspace_denied'});
  const created = await service.dispatch('session.create',{...scope,sessionId:'new',content:'New project two',cwd:f.state.projects[1].path},'new');
  assert.equal(f.state.sessions.find(s=>s.id===created.externalSessionId).projectPath,f.state.projects[1].path);
  service.pause(); service.activate(scope.runtimeId);
  assert.equal((await service.dispatch('session.send_message',params,'retry')).accepted,true);
  assert.equal(f.state.calls.filter(c=>c.operation==='agent/prompt' && c.args[0].sessionId==='s2').length,1);
  service.stop();
});

test('removed project or session moved outside its bound root cannot receive remote prompts', async () => {
  const f = fixture(), { service } = await f.make();
  const b = (await service.dispatch('session.discover',scope)).sessions[0];
  f.state.sessions[0].projectPath = f.state.projects[2].path;
  await assert.rejects(service.dispatch('session.send_message',{...scope,sessionId:b.sessionId,content:'No'},'x'),{code:'session_unavailable'});
  f.state.projects = f.state.projects.filter(p=>p.id!==1);
  await assert.rejects(service.dispatch('session.state',{...scope,sessionId:b.sessionId}),{code:'project_selection_changed'});
  assert.ok(!f.state.calls.some(c=>c.operation==='agent/prompt')); service.stop();
});

test('project mode retains cancellation fences and never invents sessions for empty projects', async () => {
  const f = fixture(); f.state.sessions=[]; const { service }=await f.make();
  assert.equal((await service.dispatch('session.discover',scope)).sessions.length,0);
  assert.equal(f.state.notifications.length,0); assert.ok(!f.state.calls.some(c=>c.operation==='session/create'));
  let release; f.state.hooks['project/list']=()=>new Promise(resolve=>{release=()=>resolve({projects:f.state.projects});});
  const pending=service.children[0].bridge.create({title:'Cancelled'});
  while(!release) await flush(); service.stop(); release();
  await assert.rejects(pending,{code:'sharing_inactive'}); assert.ok(!f.state.calls.some(c=>c.operation==='session/create'));
});

test('current-workspace mode still rejects switching the active workspace', async () => {
  const f=fixture(); const bridge=new PiBridge(f.pi,{path:f.state.current,name:'Current'});
  f.state.current=f.state.projects[0].path; await assert.rejects(bridge.list(),{code:'workspace_changed'});
});

test('panel project inventory is local, requires sharing consent, and saves confirmed IDs for reload', async t => {
  const f=fixture(), previous=globalThis.pi; globalThis.pi=f.pi;
  const main=require('../plugins/adoin.panel.anywhere/main'); await main.onLoad();
  t.after(async()=>{await main.onUnload();globalThis.pi=previous;});
  const inventory=await main.onPanelInvoke('anywhere.projects',f.config);
  assert.equal(inventory.projects.length,3); assert.equal(f.state.requests.length,0);
  await assert.rejects(main.onPanelInvoke('anywhere.connect',{...f.config,consent:true,useProjects:true,projectIds:['1','2'],shareSessions:false}),{code:'CONSENT_REQUIRED'});
  const result=await main.onPanelInvoke('anywhere.connect',{...f.config,consent:true,useProjects:true,projectIds:['1','2'],shareSessions:true});
  assert.equal(result.sharing.projectCount,2); assert.equal(result.sharing.enabled,true);
  await main.onUnload(); await main.onLoad();
  const restored=await main.onPanelInvoke('anywhere.projects',f.config); assert.deepEqual(restored.selectedProjectIds,['1','2']);
  assert.equal((await main.onPanelInvoke('anywhere.status')).sharing.enabled,false);
});

test('concurrent unbound state requests cannot bind the same AA identity in two projects', async () => {
  const f=fixture(), {service}=await f.make();
  const first=service.dispatch('session.state',{...scope,sessionId:'shared-id',externalSessionId:'s1'});
  await assert.rejects(service.dispatch('session.state',{...scope,sessionId:'shared-id',externalSessionId:'s2'}),{code:'session_busy'});
  await first;
  await assert.rejects(service.dispatch('session.state',{...scope,sessionId:'shared-id',externalSessionId:'s2'}),{code:'session_identity_conflict'});
  assert.equal(service.children.filter(c=>c.store.binding(scope.runtimeId,'shared-id')).length,1); service.stop();
});

test('moving a discovered session between selected roots refuses rediscovery without duplicate bindings', async () => {
  const f=fixture(), {service}=await f.make(); await service.dispatch('session.discover',scope);
  f.state.sessions[0].projectPath=f.state.projects[1].path;
  await assert.rejects(service.dispatch('session.discover',scope),{code:'project_selection_changed'});
  assert.equal(service.children.filter(c=>c.store.native(scope.runtimeId,'s1')).length,1); service.stop();
});

test('queued binding writes and delayed selection saves are cancelled before persistence', async () => {
  const f=fixture(), {service,selection,projects}=await f.make();
  let release; const get=f.pi.plugin.getSettings;
  f.pi.plugin.getSettings=()=>new Promise(resolve=>{release=async()=>resolve(await get());});
  const pending=service.children[0].store.bind(scope.runtimeId,'queued','s1',()=>service.guard());
  const behind=service.children[1].store.bind(scope.runtimeId,'behind','s2',()=>service.guard());
  const rejected1=assert.rejects(pending,{code:'sharing_inactive'}), rejected2=assert.rejects(behind,{code:'sharing_inactive'});
  while(!release) await flush(); service.stop(); await release(); await Promise.all([rejected1,rejected2]);
  assert.equal(f.state.settings.anywhereSessionBindingsV1,undefined);
  let active=true; release=null;
  const saving=selection.save(f.config,projects,true,()=>{if(!active) throw Object.assign(new Error('Cancelled'),{code:'cancelled'});});
  const rejected3=assert.rejects(saving,{code:'cancelled'});
  while(!release) await flush(); active=false; await release(); await rejected3;
  assert.equal(f.state.settings.anywhereProjectSelectionV1,undefined);
});

test('duplicate runtime start is harmless and create/discover races cannot persist a cross-project alias', async () => {
  const f=fixture(), {service}=await f.make();
  const epoch=service.epoch; service.activate(scope.runtimeId); assert.equal(service.epoch,epoch);
  const {hash}=require('../plugins/adoin.panel.anywhere/src/session-store');
  const aaId=`sess_pi_${hash(`${f.config.connectorId}:pi:${scope.runtimeId}:pi:s1`).slice(0,24)}`;
  let release;
  f.state.hooks['session/create']=input=>new Promise(resolve=>{release=()=>{const s={...input.args[0],id:'racing-new',messages:[]};f.state.sessions.push(s);resolve({session:s});};});
  const creating=service.dispatch('session.create',{...scope,sessionId:aaId,cwd:f.state.projects[1].path,content:'Race'},'race');
  const rejected=assert.rejects(creating,{code:'session_identity_conflict'});
  while(!release) await flush(); await service.dispatch('session.discover',scope); release(); await rejected;
  assert.equal(service.children.filter(c=>c.store.binding(scope.runtimeId,aaId)).length,1);
  assert.ok(!f.state.calls.some(c=>c.operation==='agent/prompt')); service.stop();
});
