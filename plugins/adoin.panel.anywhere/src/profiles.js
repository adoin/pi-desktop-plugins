'use strict';
const PROFILES = Object.freeze({
  current: Object.freeze({ id: 'current', label: 'Current (default)', enabled: true, prefix: '/api/v2', baseline: '873f4ae93bb3d3fa6c30f189410f394ef57cf15e' }),
  legacy: Object.freeze({ id: 'legacy', label: 'Legacy v0.1.7 (Pi runtime unsupported)', enabled: false, prefix: '', baseline: '2f7cce16d6e14ea6d89279a2a74aee0b73d6ab48' }),
});
function endpoints(config) {
  const prefix = PROFILES[config.profile].prefix;
  return {
    auth: `${config.serverUrl}${prefix}/connector/auth`,
    ws: `${config.serverUrl.replace(/^http/, 'ws')}${prefix}/connector/ws`,
  };
}
module.exports = { PROFILES, endpoints };
