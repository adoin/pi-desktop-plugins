'use strict';
const { fail } = require('./config');
const { transportCode } = require('./diagnostics');

// Older hosts silently ignore unknown fetch options. Probe before sending secrets.
async function requireSafeFetch(pi) {
  let capabilities;
  try { capabilities = await pi.net.getCapabilities(); }
  catch { fail('REDIRECT_POLICY_UNAVAILABLE', 'PI-Desktop 0.18.0+ with fetch redirect:error support is required.'); }
  if (!Array.isArray(capabilities?.fetchRedirectModes) || !capabilities.fetchRedirectModes.includes('error')) {
    fail('REDIRECT_POLICY_UNAVAILABLE', 'The host cannot guarantee that requests will not follow redirects.');
  }
}
async function safeFetch(pi, input, guard = () => {}) {
  guard(); await requireSafeFetch(pi); guard();
  let response;
  try { response = await pi.net.fetch({ ...input, redirect: 'error' }); }
  catch (error) {
    guard();
    if (transportCode(error) === 'REDIRECT_DISALLOWED') fail('REDIRECT_DISALLOWED', 'Server redirected the request. Use its direct, non-redirecting origin.');
    throw error;
  }
  guard();
  // Defensive handling for a broker that advertises support but returns 3xx.
  if (response?.status >= 300 && response.status <= 399) fail('REDIRECT_DISALLOWED', 'Server redirected the request. Use its direct, non-redirecting origin.');
  return response;
}
module.exports = { requireSafeFetch, safeFetch };
