(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const words = {
    en: {
      stage: 'Connection preview · No chat', status: 'Connection status', refresh: 'Refresh',
      discovered: 'Runtime discovered', running: 'Runtime running',
      visibility: 'An online socket does not prove device visibility in Cloud.',
      settings: 'Connection settings', command: 'Paste CLI command (parsed only, never executed)',
      parse: 'Parse command', origin: 'Server origin', connectorId: 'Connector ID', token: 'Connector token',
      profile: 'Protocol profile', current: 'Current', legacy: 'Legacy',
      consent: 'Allow connection to selected server. No sessions are shared in this preview.',
      connect: 'Connect', disconnect: 'Disconnect', boundaries: 'Preview boundaries',
      security: 'No automatic protocol downgrade. Tokens are not stored. Self-hosted servers require an explicit manifest host allowlist; wildcards are not supported.',
      verification: 'Current protocol is tested offline, not Cloud-proven. Legacy v0.1.7 cannot register Pi on its stock server and is disabled. No session sharing or chat yet.',
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
      domain_not_allowed: 'This hostname is not authorized. Update the exact manifest domain and reload with approval.',
      profile_unavailable: 'Legacy is not available: its stock server does not accept the Pi runtime.',
      unsupported: 'This operation or host API is unavailable. Check the required host version and permissions.',
      unavailable: 'The plugin or host is unavailable. Reload the plugin and review permissions.'
    },
    'zh-CN': {
      stage: '连接预览 · 不含聊天', status: '连接状态', refresh: '刷新', discovered: '已发现运行时', running: '运行时正在运行',
      visibility: '套接字在线不代表设备已在 Cloud 中可见。', settings: '连接设置', command: '粘贴 CLI 命令（仅解析，绝不执行）',
      parse: '解析命令', origin: '服务器源地址', connectorId: '连接器 ID', token: '连接器令牌', profile: '协议配置', current: '当前协议', legacy: '旧版协议',
      consent: '允许连接到所选服务器。此预览不会共享任何会话。', connect: '连接', disconnect: '断开连接', boundaries: '预览限制',
      security: '不会自动降级协议，也不会保存令牌。自托管服务器必须在清单中明确列入主机白名单，不支持通配符。',
      verification: '新版仅经过离线测试，尚未通过 Cloud 实测。旧版 v0.1.7 的原版服务端不接受 Pi Runtime，暂不可用。目前不共享会话、不提供聊天。',
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
      domain_not_allowed: '此主机名尚未授权。请修改清单中的精确域名，重新加载插件并授权。',
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
  const states = new Set(['unconfigured', 'connecting', 'online', 'reconnecting', 'authentication_failed', 'protocol_incompatible', 'network_error', 'disconnected', 'ownership_conflict']);
  const errorCodes = new Set(['authentication_failed', 'protocol_incompatible', 'network_error', 'ownership_conflict', 'request_failed', 'bridge_unavailable', 'bridge_timeout', 'permission_denied', 'not_found', 'invalid_response', 'consent_required', 'invalid_config', 'invalid_command', 'insecure_origin', 'domain_not_allowed', 'profile_unavailable', 'unsupported', 'unavailable']);
  errorCodes.add('parser_unavailable');
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
  const PANEL_VERSION = '2.0.0-alpha.4';
  const localLogs = [];
  const events = new Set(['panel_ready', 'bridge_request', 'bridge_failure', 'status_received', 'panel_error', 'form_invalid', 'plugin_loaded', 'connect_received', 'configuration_rejected', 'protocol', 'auth_request', 'auth_http', 'websocket_connect', 'websocket_open', 'rpc', 'retry_scheduled', ...states]);
  events.add('command_parse'); events.add('command_parsed');
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
    const allowed = /^(?:\d{1,5}(?:ms)?|\d+\.\d+\.\d+(?:-alpha\.\d+)?|WS_CLOSE_\d{1,4}|HTTP_\d{3}|(?:current|legacy):[a-f0-9]{40}|(?:runtime\.(?:discover|configSchema|config|validateConfig|start|stop|capabilities)|unsupported_method):(?:ok|invalid_params|runtime_conflict|runtime_not_found|runtime_not_running|method_not_found|internal_error)|(?:AUTH|WS_CONNECT|WS_EVENT|RPC_SEND|RPC|HEARTBEAT):(?:PERMISSION_DENIED|DOMAIN_NOT_ALLOWED|UNSUPPORTED|DNS_FAILURE|TLS_FAILURE|TIMEOUT|CONNECTION_REFUSED|CONNECTION_RESET|PROXY_FAILURE|HOST_NETWORK_ERROR|HTTP_\d{3}))$/;
    const bridge = value.match(/^(app\.getAppearance|anywhere\.(?:status|parse|connect|disconnect))(?::([a-z_]+))?$/);
    const field = event === 'form_invalid' && ['serverUrl', 'connectorId', 'connectorToken'].includes(value);
    const endpoint = ['auth_request', 'websocket_connect'].includes(event) && /^(?:https?|wss?):\/\/[A-Za-z0-9.:[\]-]+\/(?:api\/v2\/)?connector\/(?:auth|ws)$/.test(value);
    const detail = value.length <= 4096 && (fixed.has(value) || allowed.test(value) || (bridge && (!bridge[2] || errorCodes.has(bridge[2]))) || field || endpoint) ? value : '';
    return { time, event, detail, source };
  }
  function entries() {
    return [...localLogs.map(entry => safeEntry(entry, 'panel')), ...(Array.isArray(status?.logs) ? status.logs.slice(0, 80).map(entry => safeEntry(entry, 'plugin')) : [])].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 120);
  }
  function report() {
    const backend = typeof status?.pluginVersion === 'string' && /^\d+\.\d+\.\d+(?:-alpha\.\d+)?$/.test(status.pluginVersion) ? status.pluginVersion : 'unknown';
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
    $('parse').disabled = closed || editingLocked;
    // Keep status polling from disrupting typing; freeze fields only during user actions.
    $('connect').disabled = busy || closed || !$('consent').checked || !status ||
      !$('profile').selectedOptions[0] || $('profile').selectedOptions[0].disabled;
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
      connectorToken: $('connectorToken').value, profile: $('profile').value, consent: true
    };
    void action(async () => {
      message = '';
      const result = await invoke('anywhere.connect', args);
      if (result?.ok === false || result?.accepted === false) throw fail('request_failed');
      $('connectorToken').value = '';
      $('command').value = '';
      $('consent').checked = false;
      message = 'accepted';
      await refresh();
    }, true);
  });
  $('disconnect').addEventListener('click', () => action(async () => {
    message = '';
    await invoke('anywhere.disconnect', {});
    message = 'stopped';
    await refresh();
  }, true));
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
    $('consent').checked = false;
    controls();
  }, { once: true });
})();
