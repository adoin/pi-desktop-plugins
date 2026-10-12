'use strict';
const { SafeError, fail, origin, credential, parseCommand } = require('./connection-input');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateConfig(input, domains, profiles, permissions = []) {
  if (!record(input) || input.consent !== true) fail('CONSENT_REQUIRED', 'Confirm the selected server connection locally.');
  const serverUrl = origin(input.serverUrl);
  const host = new URL(serverUrl).hostname;
  // This is manifest intent, not a permission grant: the host still enforces approval.
  if (!domains.includes(host) && !permissions.includes('net.anyHost')) fail('DOMAIN_NOT_ALLOWED', 'Custom servers require the declared net.anyHost permission and host approval.');
  const profile = input.profile ?? 'current';
  if (!profiles[profile]?.enabled || !Object.hasOwn(profiles, profile)) fail('PROFILE_UNAVAILABLE', 'This protocol profile has not been verified.');
  return { serverUrl, profile, connectorId: credential(input.connectorId, 'Connector ID'), connectorToken: credential(input.connectorToken, 'Connector token') };
}
module.exports = { SafeError, fail, record, origin, validateConfig, parseCommand };
