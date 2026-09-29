'use strict';
// Return a fixed category, never an exception message, URL, header or payload.
function transportCode(error) {
  const fields = [error?.code, error?.errorCode, error?.data?.errorCode, error?.cause?.code];
  const message = [typeof error === 'string' ? error : '', error?.message, error?.error?.message, error?.cause?.message].filter(value => typeof value === 'string').join(' ').slice(0, 8192);
  const values = `${fields.filter(value => typeof value === 'string').join(' ')} ${message}`;
  if (/PERMISSION_DENIED|EACCES|EPERM|permission (?:denied|not granted)/i.test(values)) return 'PERMISSION_DENIED';
  if (/DOMAIN_NOT_ALLOWED|not in manifest\.net\.domains|declares no manifest\.net\.domains/i.test(values)) return 'DOMAIN_NOT_ALLOWED';
  if (/UNSUPPORTED|host api not available/i.test(values)) return 'UNSUPPORTED';
  if (/ENOTFOUND|EAI_AGAIN|ERR_NAME_NOT_RESOLVED|getaddrinfo/i.test(values)) return 'DNS_FAILURE';
  if (/CERT_|ERR_TLS|SELF_SIGNED|certificate|SSL_ERROR/i.test(values)) return 'TLS_FAILURE';
  if (/ETIMEDOUT|TIMEOUT|timed out|timeout/i.test(values)) return 'TIMEOUT';
  if (/ECONNREFUSED|ERR_CONNECTION_REFUSED/i.test(values)) return 'CONNECTION_REFUSED';
  if (/ECONNRESET|EPIPE|ERR_CONNECTION_RESET/i.test(values)) return 'CONNECTION_RESET';
  if (/proxy|tunnel/i.test(values)) return 'PROXY_FAILURE';
  const upgrade = message.match(/(?:Unexpected server response|HTTP status|status code)\s*:?\s*(\d{3})\b/i);
  if (upgrade && +upgrade[1] >= 100 && +upgrade[1] <= 599) return `HTTP_${upgrade[1]}`;
  return 'HOST_NETWORK_ERROR';
}
module.exports = { transportCode };
