(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const words = {
    en: {
      tabStatus: 'Status', tabConnections: 'Connections', tabEvents: 'Events', connectionSafety: 'Connection safety', status: 'Connection status', refresh: 'Refresh',
      discovered: 'Runtime discovered', running: 'Runtime running',
      visibility: 'An online socket does not prove device visibility in Cloud.',
      settings: 'Connection settings', command: 'Paste CLI command (parsed only, never executed)',
      parse: 'Parse command', origin: 'Server origin (official or self-hosted HTTPS, optional port)', connectorId: 'Connector ID', token: 'Connector token',
      profile: 'Protocol profile', current: 'Current', legacy: 'Legacy',
      consent: 'I trust the server origin entered above and allow sending my Connector credentials to it. Sessions are shared only if separately checked below.',
      shareSessions: 'Share current-workspace paths, titles, user/assistant text, model IDs and status with this server; allow remote create/send/interrupt under existing session permissions. New sessions require local Ask confirmation. Disconnect does not abort accepted turns.',
      runtimeId: 'Runtime instance ID', sharingEnabled: 'Session sharing allowed', sharingReady: 'Sharing ready', workspaceName: 'Approved workspace', sessionCount: 'Shared sessions', lastSyncAt: 'Last status sync',
      runtimeSetup: 'In Anywhere Web/desktop device settings, add the Pi runtime instance, save its empty config, then enable it. Discovery alone does not create an instance.',
      connect: 'Connect', disconnect: 'Disconnect', boundaries: 'Capabilities and limits',
      security: 'Requires PI-Desktop 0.18.0+. Approve net.anyHost when installing/updating; it is an arbitrary-host grant, not a per-domain prompt. Enter a trusted direct HTTPS origin without /api/v2 or proxy subpaths. Authentication and uploads refuse redirects; TLS checks remain enabled. No automatic connection after restart.',
      verification: 'Current protocol is tested offline, not Cloud-proven. Legacy v0.1.7 cannot register Pi on its stock server and is disabled. Once locally allowed: session inventory, create/send/interrupt, and final response status sync. Remote tool approval and fine-grained streaming are not supported; local tool permissions may wait for approval locally.',
      logs: 'Connection events', logPrivacy: 'Only recognized event codes and bounded diagnostic details are shown. Credentials and remote error bodies are excluded.',
      yes: 'Yes', no: 'No', unknown: 'Unknown', event: 'Event', empty: 'No events yet.',
      unconfigured: 'Unconfigured', connecting: 'Connecting', online: 'Online (discovery answered)', reconnecting: 'Reconnecting',
      authentication_failed: 'Authentication failed', protocol_incompatible: 'Protocol incompatible', network_error: 'Network error',
      disconnected: 'Disconnected', ownership_conflict: 'Ownership conflict',
      request_failed: 'Request failed. Check settings and try again.', bridge_unavailable: 'Open this panel in PI-Desktop.',
      invalid_response: 'Invalid response from the plugin.', consent_required: 'Confirm permission to connect first.',
      parsed: 'Command parsed. Review the settings before connecting.', accepted: 'Connection request accepted; token cleared.', stopped: 'Disconnect requested.'
      , profile_current: 'Current (default)', profile_legacy: 'Legacy v0.1.7 (Pi runtime unsupported)',
      protocol: 'Protocol baseline', auth_request: 'Authentication request', auth_http: 'Authentication HTTP status',
      websocket_connect: 'Connecting WebSocket', websocket_open: 'WebSocket opened', rpc: 'Runtime RPC', retry_scheduled: 'Retry scheduled',
      invalid_config: 'Check the server origin, connector ID and token. Do not include /api/v2 or other URL paths.',
      invalid_command: 'Cannot parse the command. Check quotes and provide each connection flag exactly once.',
      insecure_origin: 'Use HTTPS. Plain HTTP is supported only for loopback development.',
      domain_not_allowed: 'Custom servers require net.anyHost. Update/reload the plugin and approve the host permission.',
      redirect_policy_unavailable: 'This host cannot refuse redirects safely. Update PI-Desktop to 0.18.0+; no request was sent.',
      redirect_disallowed: 'Server redirect refused. Enter the direct HTTPS origin and configure auth/ingest endpoints not to redirect.',
      profile_unavailable: 'Legacy is not available: its stock server does not accept the Pi runtime.',
      unsupported: 'This operation or host API is unavailable. Check the required host version and permissions.',
      unavailable: 'The plugin or host is unavailable. Reload the plugin and review permissions.'
    },
    'zh-CN': {
      tabStatus: '状态', tabConnections: '连接管理', tabEvents: '事件', connectionSafety: '连接安全', status: '连接状态', refresh: '刷新', discovered: '已发现运行时', running: '运行时正在运行',
      visibility: '套接字在线不代表设备已在 Cloud 中可见。', settings: '连接设置', command: '粘贴 CLI 命令（仅解析，绝不执行）',
      parse: '解析命令', origin: '服务器源地址（官方或自部署 HTTPS，可含端口）', connectorId: '连接器 ID', token: '连接器令牌', profile: '协议配置', current: '当前协议', legacy: '旧版协议',
      consent: '我信任上方填写的服务器源地址，并允许向它发送连接器凭据。仅在下方另行勾选后才共享会话。', connect: '连接', disconnect: '断开连接', boundaries: '功能与限制',
      shareSessions: '向此服务器共享当前工作区路径、标题、用户及助手文字、模型标识和状态，并允许按会话现有权限远程创建、发送及中断。新会话需本地确认 Ask 模式。断开不会终止已接收的任务。',
      runtimeId: '运行时实例 ID', sharingEnabled: '已允许会话共享', sharingReady: '共享已就绪', workspaceName: '已授权工作区', sessionCount: '共享会话数', lastSyncAt: '上次状态同步',
      runtimeSetup: '在 Anywhere 网页端或桌面端的设备设置中添加 Pi 运行时实例，保存其空配置，然后启用。仅发现运行时不会创建实例。',
      security: '要求 PI-Desktop 0.18.0+。安装或更新时需批准 net.anyHost 任意主机权限，不会逐域名弹窗。请填写可信的直接 HTTPS 源地址，不含 /api/v2 或代理子路径。认证和上传拒绝重定向，保留 TLS 校验；重启后不会自动连接。',
      verification: '新版仅经过离线测试，尚未通过 Cloud 实测。旧版 v0.1.7 的原版服务端不接受 Pi Runtime，暂不可用。本地授权后支持会话列表、创建、发送、中断及最终回复状态同步。不支持远程工具审批或细粒度流式传输；本地工具权限可能需要在本地等待审批。',
      logs: '连接事件', logPrivacy: '只显示已知事件代码和受限诊断信息，不显示凭据或远端错误正文。',
      yes: '是', no: '否', unknown: '未知', event: '事件', empty: '暂无事件。',
      unconfigured: '未配置', connecting: '正在连接', online: '在线（已应答发现请求）', reconnecting: '正在重新连接',
      authentication_failed: '身份验证失败', protocol_incompatible: '协议不兼容', network_error: '网络错误', disconnected: '已断开', ownership_conflict: '所有权冲突',
      request_failed: '请求失败，请检查设置后重试。', bridge_unavailable: '请在 PI-Desktop 中打开此面板。',
      invalid_response: '插件返回了无效响应。', consent_required: '请先确认允许连接。',
      parsed: '命令已解析，请检查设置后再连接。', accepted: '连接请求已接受，令牌已清除。', stopped: '已请求断开连接。'
      , profile_current: '新版（默认）', profile_legacy: '旧版 v0.1.7（不支持 Pi 运行时）',
      protocol: '协议基线', auth_request: '发起身份验证', auth_http: '身份验证 HTTP 状态',
      websocket_connect: '正在连接 WebSocket', websocket_open: 'WebSocket 已打开', rpc: '运行时 RPC', retry_scheduled: '已安排重试',
      invalid_config: '请检查服务器源地址、连接器 ID 和令牌；地址不要包含 /api/v2 或其他路径。',
      invalid_command: '无法解析命令。请检查引号，并确保每个连接参数只出现一次。',
      insecure_origin: '请使用 HTTPS；明文 HTTP 仅允许本机回环地址用于开发。',
      domain_not_allowed: '自部署服务器需要 net.anyHost，请更新或重新加载插件并批准宿主权限。',
      redirect_policy_unavailable: '宿主缺少安全拒绝重定向能力，请升级至 PI-Desktop 0.18.0+；尚未发送请求。',
      redirect_disallowed: '已拒绝服务器重定向，请填写直接 HTTPS 源地址，并确保认证与上传端点不跳转。',
      profile_unavailable: '旧版暂不可用：其原版服务端不接受 Pi 运行时。',
      unsupported: '此操作或宿主 API 不可用，请检查宿主版本和插件权限。',
      unavailable: '插件或宿主暂不可用，请重新加载插件并检查权限。'
    }
  };
  Object.assign(words.en, {
    diagnostics: 'Generate diagnostic report', reportLabel: 'Diagnostic report (select and copy)',
    reportHint: 'Copy this report with Ctrl+C. No token, connector ID or pasted command is included. Logs last only for this panel/plugin run.',
    command_parse: 'Parsing locally', command_parsed: 'Connection fields extracted',
    parser_unavailable: 'Local parser did not load. Reload or reinstall this plugin package.',
    panel_ready: 'Panel ready', bridge_request: 'Calling plugin', bridge_failure: 'Panel-to-plugin call failed',
    status_received: 'Plugin status received', panel_error: 'Panel operation failed', form_invalid: 'Required form field is invalid',
    plugin_loaded: 'Plugin process loaded', connect_received: 'Plugin received connection request', configuration_rejected: 'Configuration rejected',
    bridge_timeout: 'Plugin communication timed out. Reload the plugin and review its permissions. Do not repeatedly submit the connection request.',
    permission_denied: 'The host denied permission. Reload the plugin and approve the declared permissions.',
    not_found: 'Plugin operation was not found. Check that the installed package and panel versions match.'
  });
  Object.assign(words['zh-CN'], {
    diagnostics: '生成诊断报告', reportLabel: '诊断报告（可全选复制）',
    reportHint: '按 Ctrl+C 复制报告。报告不含令牌、连接器 ID 或粘贴的命令。日志仅保留于本次面板/插件运行期间。',
    command_parse: '正在本地解析', command_parsed: '已提取连接参数',
    parser_unavailable: '本地解析器未加载，请重新加载或安装此插件包。',
    panel_ready: '面板已就绪', bridge_request: '正在调用插件', bridge_failure: '面板与插件通信失败',
    status_received: '已收到插件状态', panel_error: '面板操作失败', form_invalid: '必填字段格式不正确',
    plugin_loaded: '插件主进程已加载', connect_received: '插件已收到连接请求', configuration_rejected: '配置校验未通过',
    bridge_timeout: '插件通信超时，请重新加载插件并检查权限，不要连续重复提交连接请求。',
    permission_denied: '宿主拒绝了权限，请重新加载插件并授权已声明的权限。',
    not_found: '未找到插件操作，请检查安装包与面板是否为同一版本。'
  });
  const sessionErrors = {
    workspace_unavailable: ['Select a local workspace before sharing.', '共享前请先选择本地工作区。'],
    workspace_changed: ['Workspace changed. Reconnect locally to approve sharing again.', '工作区已改变，请在本地重新连接并授权共享。'],
    workspace_denied: ['Remote workspace switching is not allowed.', '不允许远程切换工作区。'],
    host_api_unavailable: ['Required Pi APIs are unavailable. Check host version and permissions.', '所需 Pi API 不可用，请检查宿主版本及权限。'],
    host_operation_failed: ['Pi operation failed. Inspect the local session and permissions.', 'Pi 操作失败，请检查本地会话及权限。'],
    host_response_invalid: ['Pi returned an invalid session response.', 'Pi 返回了无效会话数据。'],
    sharing_disabled: ['Enable workspace sharing locally and reconnect.', '请在本地启用工作区共享并重新连接。'],
    sharing_inactive: ['Sharing stopped or is waiting for its runtime instance.', '共享已停止或正在等待运行时实例。'],
    session_unavailable: ['Session is not available in the approved workspace.', '授权工作区中没有可用的目标会话。'],
    session_busy: ['Wait for the current session operation to finish.', '请等待当前会话操作结束。'],
    session_identity_conflict: ['Session identity conflicts with the saved binding.', '会话标识与已保存映射冲突。'],
    creation_permission_denied: ['Native confirmation was not completed; a blank session may remain.', '宿主确认未完成，可能留下空白会话。'],
    model_unavailable: ['Select an available configured Pi model.', '请选择 Pi 中已配置的可用模型。'],
    mapping_invalid: ['Saved mappings need local review; no automatic reset is performed.', '已保存映射需要本地检查，不会自动重置。'],
    mapping_limit: ['Saved mapping limit reached. Review local mappings before cleanup.', '已达映射存储上限，请检查本地映射后再清理。'],
    duplicate_request_conflict: ['A request ID was reused with different content.', '同一请求 ID 被用于不同内容。'],
    operation_outcome_unknown: ['Delivery is uncertain. Inspect Pi before submitting another message.', '发送结果不确定，请检查 Pi 会话后再提交消息。'],
    ingest_failed: ['Session upload failed; synchronization will retry.', '会话上传失败，将重试同步。'],
    ingest_rejected: ['Server rejected session updates. Check protocol compatibility.', '服务器拒绝了会话更新，请检查协议兼容性。']
  };
  for (const [code, [en, zh]] of Object.entries(sessionErrors)) { words.en[code] = en; words['zh-CN'][code] = zh; }
  Object.assign(words.en, { session_sync_failed: 'Session synchronization failed', sharing_stopped: 'Session sharing stopped', ingest_http: 'Session upload HTTP status', ingest_auth: 'Refreshing upload authentication' });
  Object.assign(words['zh-CN'], { session_sync_failed: '会话同步失败', sharing_stopped: '会话共享已停止', ingest_http: '会话上传 HTTP 状态', ingest_auth: '正在刷新上传认证' });
  const storageWords = {
    savedTitle: ['Saved connection', '保存连接'],
    savedHint: ['Address and ID are saved on Connect. Token encryption is optional; the password is never saved. Use a strong unique password. Upgrade in place; uninstall may remove plugin data.', '连接时保存地址和 ID；可选加密保存令牌，密码不保存。请使用独立强密码。请覆盖升级，卸载可能清除插件数据。'],
    useSaved: ['Use saved encrypted token', '使用已保存的加密令牌'],
    rememberConnection: ['Encrypt and remember the entered token', '加密并记住本次输入的令牌'],
    vaultPassword: ['Encryption / unlock password (at least 12 characters)', '加密／解锁密码（至少 12 个字符）'],
    forgetConsent: ['Disconnect and forget saved connection only; keep session mappings', '确认断开并忘记已保存连接，不清除会话映射'],
    forgetConnection: ['Forget saved connection', '忘记已保存连接'],
    savedEncrypted: ['Encrypted token saved. Enter your password and confirm connection/sharing again.', '已保存加密令牌。输入密码后重新确认连接和共享。'],
    savedMetadata: ['Address and ID saved; enter the original token to connect.', '已保存地址和 ID；连接时仍需输入原令牌。'],
    savedNone: ['No saved connection.', '尚无已保存连接。'],
    forgotten: ['Saved connection cleared. Session mappings retained.', '已清除保存的连接，会话映射保留。'],
    password_invalid: ['Use a password of 12–1024 characters.', '请使用 12～1024 个字符的密码。'],
    unlock_failed: ['Unable to unlock. Check your password; the encrypted token may be damaged.', '解锁失败，请检查密码；加密令牌也可能已损坏。'],
    saved_connection_invalid: ['Saved connection is invalid. Forget it locally before saving a replacement.', '保存的连接无效，请在本地忘记后重新保存。'],
    saved_connection_mismatch: ['Saved token belongs to a different address or Connector ID.', '保存的令牌与当前地址或连接器 ID 不匹配。'],
    saved_connection_missing: ['No encrypted token is saved.', '没有已保存的加密令牌。'],
    persistence_unavailable: ['Host plugin storage is unavailable.', '宿主插件存储不可用。'],
    persistence_failed: ['Unable to save connection. Check local plugin storage.', '无法保存连接，请检查本地插件存储。'],
    persistence_busy: ['Wait for the current save or unlock operation.', '请等待当前保存或解锁操作完成。']
  };
  for (const [code, [en, zh]] of Object.entries(storageWords)) { words.en[code] = en; words['zh-CN'][code] = zh; }
  const states = new Set(['unconfigured', 'connecting', 'online', 'reconnecting', 'authentication_failed', 'protocol_incompatible', 'network_error', 'disconnected', 'ownership_conflict']);
  const errorCodes = new Set(['authentication_failed', 'protocol_incompatible', 'network_error', 'ownership_conflict', 'request_failed', 'bridge_unavailable', 'bridge_timeout', 'permission_denied', 'not_found', 'invalid_response', 'consent_required', 'invalid_config', 'invalid_command', 'insecure_origin', 'domain_not_allowed', 'profile_unavailable', 'unsupported', 'unavailable']);
  errorCodes.add('redirect_policy_unavailable'); errorCodes.add('redirect_disallowed');
  errorCodes.add('parser_unavailable');
  for (const code of Object.keys(sessionErrors)) errorCodes.add(code);
  for (const code of ['password_invalid', 'unlock_failed', 'saved_connection_invalid', 'saved_connection_mismatch', 'saved_connection_missing', 'persistence_unavailable', 'persistence_failed', 'persistence_busy']) errorCodes.add(code);
  let locale = document.documentElement.lang === 'zh-CN' ? 'zh-CN' : 'en';
  let status = null;
  let firstStatus = true;
  let busy = false;
  let editingLocked = false;
  let closed = false;
  let message = '';
  let queue = Promise.resolve();
  const text = (key) => words[locale][key] || words[locale].unknown;
  const fail = (code) => Object.assign(new Error(code), { code });
  const PANEL_VERSION = '2.1.0';
  // Only these fixed navigation IDs may enter browser storage, never form data.
  const TAB_IDS = ['status', 'connections', 'events'];
  const TAB_STORAGE_KEY = 'adoin.panel.anywhere.activeTab.v1';
  function selectTab(id, { persist = false, focus = false } = {}) {
    const selected = TAB_IDS.includes(id) ? id : 'status';
    for (const tabId of TAB_IDS) {
      const active = tabId === selected;
      const tab = $(`tab-${tabId}`);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      $(`panel-${tabId}`).hidden = !active;
    }
    if (persist) {
      try { window.localStorage.setItem(TAB_STORAGE_KEY, selected); } catch { /* Storage is optional. */ }
    }
    if (focus) $(`tab-${selected}`).focus();
  }
  let restoredTab = 'status';
  try {
    const saved = window.localStorage.getItem(TAB_STORAGE_KEY);
    if (TAB_IDS.includes(saved)) restoredTab = saved;
  } catch { /* Disabled storage must not prevent panel initialization. */ }
  selectTab(restoredTab);
  TAB_IDS.forEach((id, index) => {
    const tab = $(`tab-${id}`);
    tab.addEventListener('click', () => { if (!closed) selectTab(id, { persist: true }); });
    tab.addEventListener('keydown', event => {
      if (closed || event.altKey || event.ctrlKey || event.metaKey) return;
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % TAB_IDS.length;
      else if (event.key === 'ArrowLeft') next = (index + TAB_IDS.length - 1) % TAB_IDS.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = TAB_IDS.length - 1;
      else return;
      event.preventDefault();
      selectTab(TAB_IDS[next], { persist: true, focus: true });
    });
  });
  const localLogs = [];
  const events = new Set(['panel_ready', 'bridge_request', 'bridge_failure', 'status_received', 'panel_error', 'form_invalid', 'plugin_loaded', 'connect_received', 'configuration_rejected', 'protocol', 'auth_request', 'auth_http', 'websocket_connect', 'websocket_open', 'rpc', 'retry_scheduled', ...states]);
  events.add('command_parse'); events.add('command_parsed');
  for (const code of ['session_sync_failed', 'sharing_stopped', 'ingest_http', 'ingest_auth']) events.add(code);
  function safeCode(error) {
    const code = error?.code ?? error?.errorCode ?? error?.data?.errorCode;
    if (typeof code === 'string' && errorCodes.has(code.toLowerCase())) return code.toLowerCase();
    const messageCode = typeof error?.message === 'string' ? error.message.match(/\b(PERMISSION_DENIED|UNSUPPORTED|UNAVAILABLE|NOT_FOUND)\b/)?.[1]?.toLowerCase() : '';
    return errorCodes.has(messageCode) ? messageCode : 'request_failed';
  }
  function localLog(event, detail = '') {
    if (closed) return;
    const previous = localLogs.find(entry => entry.event === event && entry.detail === detail);
    if (['bridge_failure', 'panel_error'].includes(event) && previous && Date.now() - Date.parse(previous.time) < 10000) return;
    localLogs.unshift({ time: new Date().toISOString(), event, detail, source: 'panel' });
    localLogs.length = Math.min(localLogs.length, 80);
    render();
  }
  function safeEntry(entry, source) {
    const event = events.has(entry?.event) ? entry.event : 'event';
    const time = typeof entry?.time === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.Z+-]{8,24}$/.test(entry.time) ? entry.time : '';
    const value = typeof entry?.detail === 'string' ? entry.detail : '';
    const fixed = new Set(['FRAME_LIMIT', 'INVALID_JSON', 'INVALID_RPC_FRAME', 'REQUEST_LIMIT', 'RPC_ID_REUSED', 'HOST_NETWORK_ERROR', 'HOST_API_OR_PERMISSION_UNAVAILABLE', 'INVALID_HTTP_RESPONSE', 'INVALID_AUTH_RESPONSE', 'INVALID_AUTH_JSON', 'INVALID_AUTH_FIELDS', 'INVALID_SOCKET_HANDLE', 'RUNTIME_DISCOVERY_TIMEOUT', 'EARLY_EVENT_LIMIT', 'VERSION_UNKNOWN', ...[...errorCodes].map(code => code.toUpperCase())]);
    const allowed = /^(?:\d{1,5}(?:ms)?|\d+\.\d+\.\d+(?:-(?:alpha|beta)\.\d+)?|WS_CLOSE_\d{1,4}|HTTP_\d{3}|(?:current|legacy):[a-f0-9]{40}|(?:runtime\.(?:discover|configSchema|config|validateConfig|start|stop|capabilities)|unsupported_method):(?:ok|invalid_params|runtime_conflict|runtime_not_found|runtime_not_running|method_not_found|internal_error)|(?:AUTH|INGEST|WS_CONNECT|WS_EVENT|RPC_SEND|RPC|HEARTBEAT):(?:REDIRECT_DISALLOWED|REDIRECT_POLICY_UNAVAILABLE|PERMISSION_DENIED|DOMAIN_NOT_ALLOWED|UNSUPPORTED|DNS_FAILURE|TLS_FAILURE|TIMEOUT|CONNECTION_REFUSED|CONNECTION_RESET|PROXY_FAILURE|HOST_NETWORK_ERROR|HTTP_\d{3}))$/;
    const bridge = value.match(/^(app\.getAppearance|anywhere\.(?:status|parse|connect|disconnect|forget))(?::([a-z_]+))?$/);
    const field = event === 'form_invalid' && ['serverUrl', 'connectorId', 'connectorToken'].includes(value);
    const endpoint = ['auth_request', 'websocket_connect'].includes(event) && /^(?:https?|wss?):\/\/[A-Za-z0-9.:[\]-]+\/(?:api\/v2\/)?connector\/(?:auth|ws)$/.test(value);
    const rpc = value.match(/^((?:session|runtime)\.[A-Za-z_.]+):([a-z_]+)$/);
    const sessionRpc = rpc && ['session.discover', 'session.create', 'session.send_message', 'session.interrupt', 'session.sync', 'session.state', 'session.capabilities', 'session.notices', 'session.selections.update', 'session.commands', 'runtime.modelCatalog', 'runtime.permissionCatalog', 'runtime.commands'].includes(rpc[1]) && (['ok', 'invalid_params', 'runtime_not_running', 'internal_error'].includes(rpc[2]) || errorCodes.has(rpc[2]));
    const detail = value.length <= 4096 && (fixed.has(value) || errorCodes.has(value) || value === 'WORKSPACE_OR_HOST_CHANGED' || allowed.test(value) || sessionRpc || (bridge && (!bridge[2] || errorCodes.has(bridge[2]))) || field || endpoint) ? value : '';
    return { time, event, detail, source };
  }
  function entries() {
    return [...localLogs.map(entry => safeEntry(entry, 'panel')), ...(Array.isArray(status?.logs) ? status.logs.slice(0, 80).map(entry => safeEntry(entry, 'plugin')) : [])].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 120);
  }
  function report() {
    const backend = typeof status?.pluginVersion === 'string' && /^\d+\.\d+\.\d+(?:-(?:alpha|beta)\.\d+)?$/.test(status.pluginVersion) ? status.pluginVersion : 'unknown';
    return [`Agents Anywhere diagnostic report`, `Panel: ${PANEL_VERSION}`, `Plugin: ${backend}`, `Bridge: ${typeof window.pluginBridge?.invoke === 'function' ? 'present' : 'missing'}`, `State: ${states.has(status?.state) ? status.state : 'unknown'}`, 'Credentials and command text excluded.', '', ...entries().map(entry => `${entry.time} [${entry.source}] ${entry.event}${entry.detail ? `: ${entry.detail}` : ''}`)].join('\n');
  }

  // Serialize all host calls, including the shared appearance adapter's pulls.
  function invoke(method, args = {}) {
    const next = queue.then(async () => {
      if (closed) throw fail('request_failed');
      if (method !== 'anywhere.status' && method !== 'app.getAppearance') localLog('bridge_request', method);
      let deadline;
      try {
        if (!window.pluginBridge?.invoke) throw fail('bridge_unavailable');
        return await Promise.race([
          Promise.resolve().then(() => window.pluginBridge.invoke(method, args)),
          new Promise((_, reject) => { deadline = setTimeout(() => reject(fail('bridge_timeout')), 6000); })
        ]);
      } catch (error) {
        const code = safeCode(error); localLog('bridge_failure', `${method}:${code}`); throw fail(code);
      } finally { clearTimeout(deadline); }
    });
    queue = next.catch(() => {});
    return next;
  }

  function controls() {
    document.querySelectorAll('button').forEach((button) => { button.disabled = busy || closed; });
    $('diagnostics').disabled = closed;
    // Navigation remains usable while polling or connecting, including diagnostics.
    for (const id of TAB_IDS) $(`tab-${id}`).disabled = closed;
    $('parse').disabled = closed || editingLocked;
    // Keep status polling from disrupting typing; freeze fields only during user actions.
    $('connect').disabled = busy || closed || !$('consent').checked || !status ||
      !$('profile').selectedOptions[0] || $('profile').selectedOptions[0].disabled;
    const useSaved = $('useSaved').checked;
    $('useSaved').disabled = busy || closed || status?.savedConnection?.encrypted !== true;
    $('rememberConnection').disabled = busy || closed || useSaved;
    $('connectorToken').required = !useSaved;
    $('connectorToken').disabled = editingLocked || closed || useSaved;
    $('vaultPassword').disabled = editingLocked || closed || (!useSaved && !$('rememberConnection').checked);
    $('vaultPassword').required = useSaved || $('rememberConnection').checked;
    $('forgetConnection').disabled = busy || closed || !$('forgetConsent').checked;
    $('connection').setAttribute('aria-busy', String(busy));
  }

  function render() {
    document.documentElement.lang = locale;
    document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = text(node.dataset.i18n); });
    $('state').textContent = text(states.has(status?.state) ? status.state : 'unknown');
    $('state').dataset.state = states.has(status?.state) ? status.state : 'unknown';
    for (const key of ['discovered', 'running']) {
      const value = status?.runtime?.[key];
      $(key).textContent = text(typeof value === 'boolean' ? (value ? 'yes' : 'no') : 'unknown');
      $(key).dataset.active = String(value === true);
    }
    const bounded = value => typeof value === 'string' && value.trim() ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160) : text('unknown');
    const sharing = status?.sharing;
    const values = {
      runtimeId: bounded(status?.runtime?.runtimeId),
      workspaceName: sharing?.enabled === true ? bounded(sharing.workspaceName) : '—',
      sessionCount: Number.isSafeInteger(sharing?.sessionCount) && sharing.sessionCount >= 0 ? String(sharing.sessionCount) : text('unknown'),
      lastSyncAt: typeof sharing?.lastSyncAt === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.Z+-]{8,24}$/.test(sharing.lastSyncAt) ? sharing.lastSyncAt : '—'
    };
    for (const [id, value] of Object.entries(values)) if ($(id)) $(id).textContent = value;
    for (const [id, value] of [['sharingEnabled', sharing?.enabled], ['sharingReady', sharing?.ready]]) {
      if (!$(id)) continue;
      $(id).textContent = text(typeof value === 'boolean' ? (value ? 'yes' : 'no') : 'unknown');
      $(id).dataset.active = String(value === true);
    }
    if ($('runtimeSetup')) $('runtimeSetup').hidden = !(status?.state === 'online' && !status?.runtime?.running);
    $('savedState').textContent = status?.savedConnectionError ? text(errorCodes.has(status.savedConnectionError) ? status.savedConnectionError : 'persistence_failed') : text(status?.savedConnection?.encrypted ? 'savedEncrypted' : status?.savedConnection ? 'savedMetadata' : 'savedNone');
    for (const option of $('profile').options) {
      const entry = status?.profiles?.find((item) => item?.id === option.value);
      option.disabled = !entry || entry.enabled !== true;
      const label = text(`profile_${option.value}`);
      const baseline = typeof entry?.baseline === 'string' && /^[a-f0-9]{40}$/.test(entry.baseline) ? entry.baseline.slice(0, 8) : '';
      option.textContent = baseline ? `${label} · ${baseline}` : label;
    }
    // Do not change the selected profile automatically, including on incompatibility.
    $('message').textContent = message ? `${text(message)} [${message}]` : '';
    $('logs').replaceChildren();
    const logs = entries();
    for (const entry of logs) {
      const item = document.createElement('li');
      item.textContent = `${entry.time ? `${entry.time} · ` : ''}${text(entry.event)}${entry.detail ? ` · ${entry.detail}` : ''}`;
      $('logs').appendChild(item);
    }
    if (!logs.length) {
      const item = document.createElement('li');
      item.textContent = text('empty');
      $('logs').appendChild(item);
    }
    controls();
  }

  async function refresh() {
    const result = await invoke('anywhere.status', {});
    if (closed) return;
    if (!result || typeof result !== 'object' || !Array.isArray(result.profiles)) throw fail('invalid_response');
    status = result;
    if (firstStatus) {
      firstStatus = false;
      localLog('status_received', typeof result.pluginVersion === 'string' ? result.pluginVersion : 'VERSION_UNKNOWN');
      if (typeof result.serverUrl === 'string' && !$('serverUrl').dataset.edited) $('serverUrl').value = result.serverUrl || 'https://web.agents-anywhere.com';
      if (typeof result.connectorId === 'string' && !$('connectorId').dataset.edited) $('connectorId').value = result.connectorId;
      if (['current', 'legacy'].includes(result.profile) && !$('profile').dataset.edited) $('profile').value = result.profile;
      if (result.savedConnection?.encrypted === true && !['serverUrl', 'connectorId', 'profile', 'connectorToken'].some(id => $(id).dataset.edited)) $('useSaved').checked = true;
    }
    render();
  }

  async function action(task, freeze = false) {
    if (busy || closed) return;
    busy = true;
    editingLocked = freeze;
    controls();
    const fields = [...$('connection').querySelectorAll('input, textarea, select')];
    if (freeze) fields.forEach((field) => { field.disabled = true; });
    try {
      await task();
    } catch (error) {
      message = safeCode(error);
      localLog('panel_error', message.toUpperCase());
    } finally {
      if (freeze) fields.forEach((field) => { field.disabled = false; });
      busy = false;
      editingLocked = false;
      if (!closed) render();
    }
  }

  $('consent').addEventListener('change', controls);
  $('connection').addEventListener('invalid', event => {
    const field = event.target?.id;
    localLog('form_invalid', ['serverUrl', 'connectorId', 'connectorToken'].includes(field) ? field : 'INVALID_CONFIG');
  }, true);
  $('diagnostics').addEventListener('click', () => {
    $('report').hidden = false; $('report').value = report(); $('report').focus?.(); $('report').select?.();
  });
  for (const id of ['serverUrl', 'connectorId', 'connectorToken', 'profile', 'command']) {
    $(id).addEventListener('input', () => {
      $(id).dataset.edited = 'true';
      $('consent').checked = false;
      if ($('shareSessions')) $('shareSessions').checked = false;
      $('useSaved').checked = false; $('rememberConnection').checked = false; $('vaultPassword').value = '';
      controls();
    });
  }
  $('parse').addEventListener('click', () => {
    if (closed || editingLocked) return;
    message = '';
    localLog('command_parse');
    try {
      if (typeof window.AnywhereInput?.parseCommand !== 'function') throw fail('parser_unavailable');
      const result = window.AnywhereInput.parseCommand($('command').value);
      for (const key of ['serverUrl', 'connectorId', 'connectorToken']) {
        $(key).value = result[key]; $(key).dataset.edited = 'true';
      }
      $('command').value = ''; $('consent').checked = false;
      if ($('shareSessions')) $('shareSessions').checked = false;
      $('useSaved').checked = false; $('rememberConnection').checked = false; $('vaultPassword').value = '';
      message = 'parsed'; localLog('command_parsed');
    } catch (error) {
      message = safeCode(error); localLog('panel_error', message.toUpperCase());
    }
    render();
  });
  $('connection').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!$('consent').checked || $('profile').selectedOptions[0]?.disabled) return;
    const args = {
      serverUrl: $('serverUrl').value.trim(), connectorId: $('connectorId').value.trim(),
      connectorToken: $('connectorToken').value, profile: $('profile').value, consent: true,
      shareSessions: $('shareSessions')?.checked === true,
      useSaved: $('useSaved').checked, rememberConnection: $('rememberConnection').checked,
      vaultPassword: $('vaultPassword').value
    };
    $('vaultPassword').value = '';
    void action(async () => {
      message = '';
      let result;
      try { result = await invoke('anywhere.connect', args); }
      finally { args.vaultPassword = ''; args.connectorToken = ''; }
      if (result?.ok === false || result?.accepted === false) throw fail('request_failed');
      $('connectorToken').value = '';
      $('command').value = '';
      $('consent').checked = false;
      if ($('shareSessions')) $('shareSessions').checked = false;
      message = 'accepted';
      await refresh();
      $('rememberConnection').checked = false;
      $('useSaved').checked = !closed && status?.savedConnection?.encrypted === true;
    }, true);
  });
  $('disconnect').addEventListener('click', () => action(async () => {
    message = '';
    await invoke('anywhere.disconnect', {});
    message = 'stopped';
    await refresh();
  }, true));
  for (const id of ['useSaved', 'rememberConnection']) $(id).addEventListener('change', () => {
    if ($(id).checked) $(id === 'useSaved' ? 'rememberConnection' : 'useSaved').checked = false;
    $('consent').checked = false; $('shareSessions').checked = false; $('vaultPassword').value = ''; controls();
  });
  $('forgetConsent').addEventListener('change', controls);
  $('forgetConnection').addEventListener('click', () => {
    if (!$('forgetConsent').checked) return;
    void action(async () => {
      await invoke('anywhere.forget', { confirm: true });
      for (const id of ['connectorId', 'connectorToken', 'command', 'vaultPassword']) $(id).value = '';
      for (const id of ['useSaved', 'rememberConnection', 'forgetConsent', 'consent', 'shareSessions']) $(id).checked = false;
      message = 'forgotten'; await refresh();
    }, true);
  });
  $('refresh').addEventListener('click', () => action(async () => { message = ''; await refresh(); }));

  const appearance = window.__appearance;
  appearance?.onLocaleChange((next) => {
    if (closed) return;
    locale = next === 'zh-CN' ? 'zh-CN' : 'en';
    render();
  });
  appearance?.init({
    invoke,
    on: (event, listener) => window.pluginBridge?.on?.(event, (value) => { if (!closed) listener(value); })
  });
  localLog('panel_ready', PANEL_VERSION);
  render();
  void action(refresh);
  const timer = setInterval(() => { if (!closed && !document.hidden) void action(refresh); }, 2000);
  window.addEventListener('pagehide', () => {
    closed = true;
    clearInterval(timer);
    $('connectorToken').value = '';
    $('command').value = '';
    $('vaultPassword').value = ''; $('useSaved').checked = false; $('rememberConnection').checked = false; $('forgetConsent').checked = false;
    $('consent').checked = false;
    if ($('shareSessions')) $('shareSessions').checked = false;
    controls();
  }, { once: true });
})();
