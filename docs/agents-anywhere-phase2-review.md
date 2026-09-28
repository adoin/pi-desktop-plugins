# Agents Anywhere Phase 2 checkpoint and security record

Date: 2026-09-28. Branch: `feat/pi-agents-anywhere-v2`.
Plugin: `pi.agents-anywhere`, version `2.0.0-alpha.1`.
Status: **connection-preview implementation complete; Cloud acceptance pending;
not approved for publication**. Phases 3–7 are not implemented.

## Scope and data flow

The entry module registers a settings-panel command and a resident service. It
does not connect on load. A local panel connection request must include explicit
consent, a supported profile and a validated exact-host origin. Command paste is
parsed as data only. There is no shell execution, download/install, raw Node
networking, desktop-control gateway, session enumeration, transcript export or
filesystem access. `main.js` only delegates host networking to `src/connector.js`.

The configured long-lived credential goes to the chosen origin's auth endpoint
via `pi.net.fetch`; a fresh short-lived token goes in the WebSocket Authorization
header. Heartbeat and Runtime metadata/lifecycle responses go to that socket.
Only this single adapter can be started; no chat/task runs as a side effect.
Runtime/session/tool capabilities not implemented are explicitly disabled.

Credentials, settings and diagnostics are memory-only. The parser returns token
text only to the owning local panel that supplied it. Panel token/command fields
clear after accepted connection or page hide. The Connector drops credential
references on disconnect/unload or terminal auth/protocol failure. In-flight
host calls cannot be aborted through the documented plugin API; generation
fencing discards their late results and closes late socket handles. The host's
10-second requested network timeout bounds normal in-flight setup. JavaScript
string zeroization and crash-dump secrecy are not promised.

## Permission matrix

| Permission | Use | Gate / cleanup |
| --- | --- | --- |
| `ui.panel` | Detached settings panel | Registered command; unregister on unload |
| `ui.view` | Docked work-panel entry | Declared view, same renderer |
| `net.fetch` | Connector credential exchange | Exact manifest hostname, explicit local consent, sanitized response handling |
| `net.websocket` | RPC/heartbeats | Host-owned socket; bounded input and reply cache; close/remove listeners on disconnect |
| `background.service` | Keep explicitly started connection resident | Service stop disconnects; no auto-connect or persisted token |

Manifest network allowlist: only `web.agents-anywhere.com`. Self-hosted testing
requires an explicit exact-host manifest change and host reload/re-authorization;
no `*`, wildcard-based bypass, credential-bearing URL or remote plain HTTP.

Highest risk tier: **High** (network, credentials, background connection).
Two independent maintainer approvals: **pending**, not supplied by agent review.
No marketplace publication or git push is authorized/performed.

## Concrete host limitation

At PI host source baseline `b684e661797996db3ac64c3c5bdf5764a38fd522`,
`apps/desktop/electron/main/plugin-runtime.ts:5532–5552` follows redirects manually
with the original headers and checks destination against hostnames. The public
fetch API has no redirect opt-out. Same-origin and no-TLS-downgrade credential
confinement therefore cannot be enforced entirely by this plugin. The shipped
allowlist is a single exact host and the README warns to use trusted direct auth
endpoints, but **production credential-forwarding approval is blocked pending
host verification/fix**. Raw Node networking is not an acceptable workaround.

The conservative manifest minimum is 0.15.9, matching the inspected host source's
package version. API functions are checked at runtime; minimum-version metadata
alone is not proof of compatibility with a particular installed build. No
permission grant or successful activation after the manifest expansion is claimed.

## Upstream and dependency provenance

No runtime dependencies were downloaded or vendored. Connector/runtime code is
new JavaScript based on source-backed contracts in the Phase 1 notes. The only
copied assets are the repository's canonical `plugins/shared/appearance/renderer/`
adapters, byte-identical when checked. Node built-ins are used for input sizing;
there is no subprocess/native helper. Test-only loopback HTTP/TCP fixtures are
outside the package. Upstream schema/code redistribution licensing must still be
resolved before any future vendoring.

Current source contract: Agents Anywhere
`873f4ae93bb3d3fa6c30f189410f394ef57cf15e`.
Historical target: official `v0.1.7` tag,
`2f7cce16d6e14ea6d89279a2a74aee0b73d6ab48` (Connector metadata 0.1.7.2).
Legacy remains disabled because that stock server's closed runtime enum cannot
accept native `pi`; its lifecycle is also different. This is **not dual-protocol
support** and not a claim that a disabled selector fulfils that acceptance item.

## Review and fixes

One bounded independent agent code-review pass inspected the new plugin and
upstream Runtime model/dispatch evidence. It found stale previous-socket events
could overflow the replacement socket's early-event buffer, plus missing early
close/error, failed-send and renderer-boundary tests. The implementation now
buffers by socket ID with bounded per-socket queues; the discovered defect and
all requested negative paths have regression tests. No second broad review was
started. This pass is not either of the required human maintainer approvals and
did not provide production artifact sign-off.

## Checks performed

- `node --test tests/agents-anywhere*.test.mjs tests/panel-chrome.test.mjs`:
  **35/35 passed** (31 new plugin tests and 4 panel-contract tests).
- The transport test opens real loopback HTTP/TCP WebSocket connections using
  generated ephemeral credentials. It verifies Connector/Bearer headers,
  endpoints, heartbeat, early discovery, start and capabilities wire exchange.
  It uses a synthetic server/host bridge, **not** the official deployed Server
  or the installed Pi network broker.
- Tests cover malformed commands/URLs/auth/frames, consent/host/profile rejection,
  runtime scope/config revision, auth failures, retry, late callbacks, duplicate
  IDs, bounded floods, unload, logging privacy, and renderer closure/consent.
- English/Chinese UI keys have matching coverage. Tests verify live host-locale
  switching for controls, protocol options, log labels and known errors without
  changing credentials or selected profile. Command/service labels are bilingual.
- JavaScript syntax checks passed. Panel chrome opt-in/contract checks passed;
  its repository count increased from 19 to 20 for the new panel only.
- `PluginCheck` passed. Its two unused-network warnings result from its
  main.js-only usage scan; network calls are in `src/connector.js`. High-risk
  network permissions still require an explicit user grant.
- `python scripts/security_audit.py plugins/pi.agents-anywhere`:
  **0 blockers, 10 manual-review signals**. The script calls `net.websocket`
  unknown, whereas the inspected host spec/API explicitly supports it; this is
  a manual policy signal, not a reason to remove required permission.
- `PluginPack` succeeded: **12 files**, store-only archive.
  `packages/pi.agents-anywhere-2.0.0-alpha.1.piplug`: **64,479 bytes**;
  SHA-256: `46439ebeab51dc1d303d3d4c4ee6694249dc8fce37981123399215c14ae4f265`.
  Every packed file was compared byte-for-byte with source; no symlink/traversal
  entries. The entry list contains README, manifest, main, five renderer assets
  and four src modules only. No test fixtures or credentials are included.
- `python scripts/rebuild_catalog.py` succeeded (26 indexed plugins); the alpha's
  generated catalog hash/size match the package. This is a **local feature-branch
  artifact**, not a published marketplace release.
- Full `node --test tests/*.test.mjs`: **213 tests, 207 passed, 6 failed**.
  Remaining failures are the same pre-existing two gitlens Windows path tests
  and four terminal path/helper/PATH tests recorded in Phase 1.
- Full `python scripts/security_audit.py --check-packages`: **342 blockers**,
  all pre-existing other-package/source byte mismatches; none belongs to this
  plugin. The repository-wide release gate is not green and was not bypassed.
- BrowserPreview was requested, but browser snapshot returned
  `browser guest is not available`. Renderer behavior has mocked-DOM tests;
  actual layout, host-panel rendering and mobile visibility remain unverified.

## Next acceptance step

Locally reload/approve the dev plugin, enter the mobile connection command in its
own password-bearing panel (not chat), and verify current Cloud device online and
Pi Runtime visibility/start. Keep the auth endpoint direct and trusted given the
host redirect limitation. Record installed host/Server/client versions and
sanitized diagnostics only. After Phase 2 acceptance, implement session discovery
with a consented export scope and durable identity mapping before chat/control.
Do not claim completion of the user's full v2 task or old/new compatibility.
