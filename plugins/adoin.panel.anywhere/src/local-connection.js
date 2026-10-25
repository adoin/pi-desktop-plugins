'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const { fail, record } = require('./config');
const KEY = 'anywhereLocalConnectionV1';
const MAX = 131072;
// Fixed script only. Secrets travel through anonymous pipes, never argv or files.
function crypt(value, decrypt) {
  const code = decrypt ? 'local_unlock_failed' : 'local_storage_failed';
  if (process.platform !== 'win32' || typeof value !== 'string' || !value || Buffer.byteLength(value) > MAX) fail(code, code);
  const script = `$ErrorActionPreference='Stop'; try { Add-Type -AssemblyName System.Security; $s=[Console]::In.ReadToEnd(); $e=[Text.Encoding]::UTF8.GetBytes('adoin.panel.anywhere.local.v1'); ${decrypt
    ? "$b=[Convert]::FromBase64String($s); $r=[Security.Cryptography.ProtectedData]::Unprotect($b,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))"
    : "$b=[Convert]::FromBase64String($s); $r=[Security.Cryptography.ProtectedData]::Protect($b,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))"} } catch { exit 1 }`;
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise((resolve, reject) => {
    const error = () => { try { fail(code, code); } catch (e) { reject(e); } };
    let child, timer, output = [], size = 0, done = false;
    const finish = (ok) => {
      if (done) return; done = true; clearTimeout(timer);
      if (ok && size) { const text = Buffer.concat(output).toString('ascii'); resolve(decrypt ? Buffer.from(text, 'base64').toString('utf8') : text); } else error();
      output = [];
    };
    try {
      child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      timer = setTimeout(() => { child.kill(); finish(false); }, 5000);
      child.on('error', () => finish(false));
      child.stdin.on('error', () => finish(false));
      child.stdout.on('data', chunk => { size += chunk.length; if (size > MAX) { child.kill(); finish(false); } else output.push(chunk); });
      child.on('close', code => finish(code === 0));
      child.stdin.end(decrypt ? value : Buffer.from(value, 'utf8').toString('base64'), 'ascii');
    } catch { child?.kill(); finish(false); }
  });
}
const protect = value => crypt(value, false);
const unprotect = value => crypt(value, true);
const identity = c => JSON.stringify([c?.profile, c?.serverUrl, c?.connectorId]);
function validate(value) {
  if (!record(value) || value.version !== 1 || typeof value.autoConnect !== 'boolean' || typeof value.ciphertext !== 'string' || !value.ciphertext || value.ciphertext.length > MAX || !/^[A-Za-z0-9+/]+=*$/.test(value.ciphertext)) fail('local_storage_failed', 'local_storage_failed');
  return structuredClone(value);
}
function scopeCheck(scope) {
  if (!record(scope) || typeof scope.shareSessions !== 'boolean' || typeof scope.useProjects !== 'boolean' || !Array.isArray(scope.projects) || scope.projects.length > 32) fail('local_unlock_failed', 'local_unlock_failed');
  if (scope.shareSessions && scope.useProjects && (!scope.projects.length || scope.projects.some(p => !record(p) || typeof p.id !== 'string' || typeof p.path !== 'string' || !path.isAbsolute(p.path)))) fail('local_unlock_failed', 'local_unlock_failed');
  if (scope.shareSessions && !scope.useProjects && (typeof scope.workspacePath !== 'string' || !path.isAbsolute(scope.workspacePath))) fail('local_unlock_failed', 'local_unlock_failed');
}
class LocalConnection {
  constructor(pi) { this.pi = pi; this.saved = null; this.writes = Promise.resolve(); }
  async load() {
    this.saved = null;
    const settings = await this.pi.plugin.getSettings();
    if (settings?.[KEY] != null) this.saved = validate(settings[KEY]);
  }
  public() { return { available: Boolean(this.saved), autoConnect: this.saved?.autoConnect === true }; }
  async write(value) {
    const nextWrite = this.writes.then(async () => {
      const next = typeof value === 'function' ? value() : value;
      if (next === undefined) return;
      try { await this.pi.plugin.setSettings({ [KEY]: next }); }
      catch { fail('local_storage_failed', 'local_storage_failed'); }
      this.saved = next;
    });
    this.writes = nextWrite.catch(() => {});
    return nextWrite;
  }
  async save(config, scope) {
    scopeCheck(scope);
    const data = JSON.stringify({ version: 1, config, scope });
    const ciphertext = await protect(data);
    await this.write({ version: 1, autoConnect: true, ciphertext });
  }
  async unlock(selection) {
    if (!this.saved) fail('saved_connection_missing', 'saved_connection_missing');
    let data;
    try { data = JSON.parse(await unprotect(validate(this.saved).ciphertext)); }
    catch { fail('local_unlock_failed', 'local_unlock_failed'); }
    if (!record(data) || data.version !== 1 || !record(data.config)) fail('local_unlock_failed', 'local_unlock_failed');
    scopeCheck(data.scope);
    if (identity(data.config) !== identity(selection)) fail('saved_connection_mismatch', 'saved_connection_mismatch');
    return { config: data.config, scope: data.scope };
  }
  async disable() { await this.write(() => this.saved ? { ...this.saved, autoConnect: false } : undefined); }
  async forget() { await this.write(null); }
}
module.exports = { LocalConnection, protect, unprotect };
