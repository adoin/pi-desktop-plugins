# Agents Anywhere 2.1.0 — self-hosted origins

Plugin: `adoin.panel.anywhere`. Branch: `feat/pi-agents-anywhere-v2`.
Package: `packages/adoin.panel.anywhere-2.1.0.piplug`.

## Scope and implementation

This release adds user-confirmed self-hosted server origins through the official
`net.anyHost` permission, retaining the default official Cloud origin. It requires
PI-Desktop >=0.18.0 and positively detects `error` in
`pi.net.getCapabilities().fetchRedirectModes` before networking. The plugin never
assumes that an unknown fetch option is enforced by an older host.

New `src/safe-fetch.js` protects initial authentication, token refresh and session
ingest with `redirect: 'error'`. It probes before each fetch, invokes cancellation
guards across awaits, sanitizes redirect errors and defensively rejects returned
3xx responses. Capability absence/rejection, redirects and denied egress stop the
connection rather than retrying or silently falling back to official Cloud.

`main.js` checks capabilities before unlocking credentials, reading sessions or
saving a connection. `src/config.js` admits origins outside the exact manifest
list only when `net.anyHost` is declared; actual grants remain host-enforced.
HTTPS, origin-only syntax, credential validation, explicit consent and disabled
legacy profile checks are unchanged. Custom ports and HTTPS IP origins are
supported. Remote HTTP is refused; loopback HTTP remains development-only.
No raw networking, shell commands, added runtime dependencies or TLS bypass.

The renderer keeps the three tabs, saved selection and encrypted persistence UI.
It now explains arbitrary-host installation approval, trusted origin confirmation,
direct endpoints and fixed redirect errors. Changing a connection field still
revokes both local consents and saved-token selection. No user token or password
is newly exposed or persisted. The current origin is part of both encrypted-token
AAD and session-store scope; changing host or port cannot reuse a saved token.

## Verified upstream contract

Official release: v0.18.0, source commit
`0c0902b25f0cc22a00fabbf98dee35f499f149cf`.
Issue #1475 was resolved by PR #1483, merged 2026-10-09.

- `packages/plugin-sdk/src/index.ts`: fetch redirect modes and getCapabilities.
- `apps/desktop/electron/main/plugin-net-fetch.ts`: host-owned single-hop transport,
  error/manual modes, one timeout, no target visit in error mode.
- `apps/desktop/electron/main/plugin-runtime.ts`: routes default and injected
  transports through that policy and reads actual `net.anyHost` grant.
- `apps/desktop/electron/main/plugin-host-process.mjs`: exposes capability query.
- `apps/desktop/electron/main/plugin-websocket.ts`: uses ws without enabling its
  opt-in followRedirects setting; WebSocket remains host-owned.

The actual upstream v0.18.0 fetch module was run against local synthetic HTTP
servers: 301/302/303/307/308 were refused, manual returned the response, and the
redirect target received zero requests; injected transport was also single-hop.
The upstream full runtime test could not start in the sparse checkout because
workspace dependencies were not installed; it is not claimed as passing.
Repository tests use a synthetic host broker and real loopback HTTP in addition
to mocked protocol flows; they do not claim a real deployed self-hosted login.

## Capability and security review

Risk tier: **High**. New permission: `net.anyHost`; other permissions unchanged.
This is an install/update-time arbitrary-host grant, not a per-domain host prompt.
The existing exact default domain remains listed; there is no wildcard manifest
entry. The broader grant is necessary for arbitrary user-supplied self-hosted
origins and must be re-approved locally when updating/loading the dev plugin.

| Entry | Data and destination | Protection |
| --- | --- | --- |
| Connect | Connector credentials to selected origin /auth | Explicit local destination consent, HTTPS, capability check, redirect refusal |
| Token refresh | Same credentials to same origin /auth | Same safe fetch wrapper; no fallback or redirect retry |
| Ingest | Conversation text, metadata, state to selected origin /ingest | Separate sharing consent, scoped native sessions, safe fetch, bounded payload |
| WebSocket | Bearer credential and RPC to selected origin /ws | Host permission/egress broker and its non-following socket implementation |
| Saved connection | Encrypted token and public metadata locally | Existing password encryption, origin-bound AAD, fresh unlock/consent |
| Diagnostics | Fixed policy codes, selected endpoint and status | No Location header, raw error body, credentials or transcript |

Read SECURITY.md and inspected the full changed data flow and packed artifact.
One independent bounded agent review found no concrete source defects; this is
not either of the two required human maintainer approvals. The former HTTP
redirect blocker is addressed by released host enforcement and capability guards.
Trust in a user-selected server is still required. No actual self-hosted service
or real credential was contacted during development. Human approvals and deployed
acceptance remain pending before public release; no marketplace submission or
remote push was performed for this change.

## Verification

- Targeted tests plus panel chrome: **174/174 passed**.
- Full repository tests: **346/352 passed**, the same six baseline Windows
  gitlens path and terminal fixture/PATH failures.
- New coverage: custom origin/port and IPv6 acceptance, invalid origin/HTTP/consent
  rejection, host grant refusal, missing/malformed/rejected redirect capability,
  cancellation during probes, terminal redirect handling, safe auth refresh and
  ingest, encrypted reload and different-port isolation, diagnostic privacy.
- Complete simulated chat chain runs with a self-hosted HTTPS origin and asserts
  every HTTP request remains on it with redirect:error. Existing deduplication,
  create/send/reply/status/interrupt/reconnect and history tests remain passing.
- Real loopback broker regression verifies target receives zero requests for the
  five redirect statuses using synthetic credentials/body only.
- JavaScript syntax and git diff whitespace checks passed.
- BrowserPreview: 2.1.0, Chinese self-hosted label and new permission guidance,
  unchecked consent, preserved Connections tab, 360px with no horizontal overflow.
  This file preview does not validate installed-host permission dialogs.
- PluginCheck passed for 20 files. Unused-network warnings are due to main-only
  scanning; calls are in safe-fetch and connector modules. High-risk grants are
  explicitly disclosed.
- Scoped security audit: **0 blockers, 16 review signals**. The older audit script
  flags net.anyHost and net.websocket for host-policy review; both were checked
  against official host source. Full audit remains **342 existing other-package
  blockers**, none belonging to this plugin. Global release gates are not waived.
- PluginPack artifact: **20 store-only entries, 160,999 bytes**.
  SHA-256: `0d2e7696de59805079b29870191211551177e23d03042d57993173ac5caeb219`.
  Verified exact entry set, no symlink/traversal, manifest and all source bytes.
  Catalog rebuilt (26 entries) with matching hash/size; unrelated entries unchanged.

## User acceptance

Install over adoin.panel.anywhere 2.0.0 and approve net.anyHost. Keep existing
settings and devices. Enter a compatible self-hosted direct HTTPS origin and its
own credentials; confirm connection and sharing. Add/enable the Pi instance on
that server if not already configured. Verify discovery, text send/reply,
interrupt and reconnect. If a proxy redirects, configure a direct auth/ingest
route rather than disabling policy. Never append /api/v2 to the origin field.
