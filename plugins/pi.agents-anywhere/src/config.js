'use strict';

class SafeError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new SafeError(code, message); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function origin(value) {
  if (typeof value !== 'string' || value.length > 2048) fail('INVALID_CONFIG', 'A valid server origin is required.');
  const raw = value.trim();
  if (/[\x00-\x20\x7f\\]/.test(raw)) fail('INVALID_CONFIG', 'Server URL contains invalid characters.');
  let url;
  try { url = new URL(raw); } catch { fail('INVALID_CONFIG', 'Use an explicit https:// server origin.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !/^\/*$/.test(url.pathname)) {
    fail('INVALID_CONFIG', 'Use an HTTP(S) origin without credentials, path, query or fragment; omit /api/v2.');
  }
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    fail('INSECURE_ORIGIN', 'Plain HTTP is allowed only for loopback development.');
  }
  return url.origin;
}

function credential(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.~-]{1,512}$/.test(value)) {
    fail('INVALID_CONFIG', `${label} must be a bounded credential without spaces or control characters.`);
  }
  return value;
}

function validateConfig(input, domains, profiles) {
  if (!record(input) || input.consent !== true) fail('CONSENT_REQUIRED', 'Confirm the selected server connection locally.');
  const serverUrl = origin(input.serverUrl);
  const host = new URL(serverUrl).hostname;
  // Exact hosts only, even if a locally edited manifest contains a wildcard.
  if (!domains.includes(host)) fail('DOMAIN_NOT_ALLOWED', 'Server hostname must be explicitly declared in manifest.net.domains and re-authorized.');
  const profile = input.profile ?? 'current';
  if (!profiles[profile]?.enabled || !Object.hasOwn(profiles, profile)) fail('PROFILE_UNAVAILABLE', 'This protocol profile has not been verified.');
  return { serverUrl, profile, connectorId: credential(input.connectorId, 'Connector ID'), connectorToken: credential(input.connectorToken, 'Connector token') };
}

function parseCommand(command) {
  if (typeof command !== 'string' || command.length > 8192 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(command)) {
    fail('INVALID_COMMAND', 'Command text is invalid or too large.');
  }
  const text = command.replace(/(?:`|\\|\^)\r?\n/g, ' ');
  const words = [];
  let word = '', quote = null, started = false;
  for (const char of text) {
    if (quote) { if (char === quote) quote = null; else word += char; started = true; }
    else if (char === '"' || char === "'") { quote = char; started = true; }
    else if (/\s/.test(char)) { if (started) { words.push(word); word = ''; started = false; } }
    else { word += char; started = true; }
  }
  if (quote) fail('INVALID_COMMAND', 'Unclosed quote in command.');
  if (started) words.push(word);
  const names = { '--server-url': 'serverUrl', '--connector-id': 'connectorId', '--connector-token': 'connectorToken' };
  const result = {};
  for (let i = 0; i < words.length; i++) {
    const equal = words[i].indexOf('=');
    const key = equal < 0 ? words[i] : words[i].slice(0, equal);
    if (!Object.hasOwn(names, key)) continue;
    if (Object.hasOwn(result, names[key])) fail('INVALID_COMMAND', 'Duplicate connection flag.');
    const value = equal < 0 ? words[++i] : words[i].slice(equal + 1);
    if (!value || value.startsWith('--')) fail('INVALID_COMMAND', 'Missing connection flag value.');
    result[names[key]] = value;
  }
  result.serverUrl = origin(result.serverUrl);
  result.connectorId = credential(result.connectorId, 'Connector ID');
  result.connectorToken = credential(result.connectorToken, 'Connector token');
  return result;
}
module.exports = { SafeError, fail, record, origin, validateConfig, parseCommand };
