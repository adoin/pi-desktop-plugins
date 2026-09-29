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

## Visual refresh follow-up: 2.0.0-alpha.2

The user requested a less monochrome panel. This update changes only the
renderer presentation, version/readme/changelog and related tests/artifacts;
network logic, capabilities and permissions are unchanged. It adds coordinated
teal light/dark palettes with indigo and warm accents, a local inline decorative
SVG, status-colored indicators with text retained, metric cards, input/button
hierarchy, focus rings, narrow-layout rules and reduced-motion support. No
external fonts, images or dependencies were introduced.

BrowserPreview succeeded for this follow-up. Dark English and light Chinese
full-page screenshots were inspected. A 360px body-width check found no
horizontal overflow, and computed online/error/connecting colors were distinct.
The browser's CDP allowlist refused viewport emulation, so the body-width check
is not represented as actual mobile-device testing. The preview has no plugin
bridge and showed the expected bridge-unavailable message; no credentials or
Cloud connections were used. Reduced motion and state-to-style bindings have
automated coverage; the complete live host/Cloud acceptance remains pending.

Verification: 37/37 targeted plugin/panel-contract checks passed. Full suite:
215 tests, 209 passed, the same 6 baseline failures. Scoped security preflight:
0 blockers, 10 manual-review signals. Full package preflight: the same 342
pre-existing blockers and no new Anywhere blocker. PluginPack validation passed
with the previously documented static-scan/high-risk warnings. The new 12-file
store-only package was compared byte-for-byte with source and checked for unsafe
entries; unrelated catalog entries were verified unchanged.

Artifact: `packages/pi.agents-anywhere-2.0.0-alpha.2.piplug`, 71,103 bytes.
SHA-256: `910392bda8d92f54cb5a4045d6a1140358a5f0d0601d3b9b0762dadc6ba434a0`.
Generated catalog hash and size match. This local feature-branch checkpoint
does not waive any of the Cloud, legacy, redirect-security or maintainer-approval
gates above and has not been pushed or published.

## Diagnostic follow-up: 2.0.0-alpha.3

The user reported a connection failure with an empty event list. No actual
failure trace was available, so this update does not claim to fix its root cause.
Source inspection confirmed the existing onPanelInvoke calling convention, but
identified an observability gap: pre-network validation and panel/host failures
did not populate the Connector-only event list.

The renderer now maintains an independent bounded event buffer with an HTML
initialization fallback, script-ready event, host-call failures, six-second call
deadline, native form-invalid events and a manually copyable diagnostic report.
The report remains available while status calls are pending or rejected. Repeated
poll errors are coalesced for ten seconds. The backend logs load, received Connect
and configuration rejection, and classifies transport errors by AUTH/WS/RPC/send/
heartbeat stage without returning exception bodies. The report includes explicit
panel/backend versions and bridge availability, but not connector ID, token,
command text or arbitrary backend detail. Logs remain in memory only; no new
permissions, clipboard API, file writes, telemetry or network destinations.

The call deadline does not cancel a host operation already delivered. No mutating
call is replayed automatically; the UI/README warn against repeated Connect after
a timeout. Host permission failures remain fail-closed. Error categories are
diagnostic evidence, not a claim that a specific DNS/TLS/proxy problem was proven.

Verification: 43/43 targeted checks passed, including missing bridge, bridge
timeout, rejected Connect, form validation, safe report generation and transport
classification. A real file-page BrowserPreview without pluginBridge displayed
Chinese bridge-unavailable events; the diagnostic report generated and selected
successfully. This is not evidence about the user's installed plugin connection.
Full suite: 221 tests, 215 passed, the same 6 baseline failures. Scoped security:
0 blockers, 10 review signals; full package security: the same 342 pre-existing
blockers and no new Anywhere blocker. Existing publication gates remain pending.

PluginPack succeeded with its previously recorded warnings. The 13-file stored
archive was compared byte-for-byte with source, checked for unsafe entries and
matched to the generated catalog; unrelated catalog entries were unchanged.
Artifact: `packages/pi.agents-anywhere-2.0.0-alpha.3.piplug`, 81,667 bytes.
SHA-256: `33266a3cd0160fd8338d35f04921da4b05fed111e1f0f95a8d1d5575f373b294`.
No real credentials were read, no Cloud connection attempted, and nothing pushed
or published. Next step: install/reload alpha.3, attempt one connection, then
generate and share only the sanitized diagnostic report.

## Local parser follow-up: 2.0.0-alpha.4

The user reported that a valid self-hosted CLI command did not fill its ID/token
fields. A synthetic equivalent reproduced successful parsing in the existing
pure parser; the supplied real credential was not used. Appending commentary
directly to the token reproduced an expected validation rejection, but this was
not assumed to be the user's actual cause. The concrete UI weakness was that
Parse unnecessarily depended on a working panel-to-plugin call and its busy queue.

The parser now lives in `src/connection-input.js`, shared by the renderer and
backend. Local parsing needs no bridge, network, host status or domain grant;
it still rejects ambiguous/invalid input and does not execute pasted text.
Parse remains available during a stalled status read but not during a mutating
connection action. Backend connection validation still enforces exact domains,
consent and profile availability. The manifest allowlist was not expanded.
An unlisted self-hosted origin can now fill the fields but cannot connect until
explicitly added to the manifest and re-authorized by the user.

Verification: 46/46 targeted checks passed, including actual shared-parser
execution in renderer tests, no-bridge/stalled-status extraction, commentary
rejection, no partial updates and continued domain denial. BrowserPreview with
no pluginBridge successfully populated origin/ID/token from a synthetic command,
cleared the command and reset consent. Only booleans were returned; generated
test fields were then cleared. No connection to the user's server was attempted.

Full suite: 224 tests, 218 passed, same 6 baseline failures. Scoped security:
0 blockers, 11 manual-review signals; full package check: same 342 pre-existing
blockers, none for Anywhere. PluginPack passed with previously documented
warnings. All 14 stored package entries match source bytes and have no unsafe
paths/symlinks; catalog hash/size match, unrelated catalog entries unchanged.
Artifact: `packages/pi.agents-anywhere-2.0.0-alpha.4.piplug`, 83,626 bytes.
SHA-256: `ed926fa29eec4b1e10aa19ef3ef8a34b58cf6593953838a7dd1ff7314b1a4371`.
The disclosed credential should be revoked/rotated by its owner. It was not
stored in project files or used for authentication. Existing release gates are
unchanged; this update has not been pushed or published.

## Runtime revision fix: 2.0.0-alpha.5

The user demonstrated Cloud device online and Pi runtime discovery, followed by
the plugin's combined config validation error. Source evidence establishes a
concrete defect: `server/agent_server/services/device_runtimes.py:741–746,1008–1019`
at AA commit `873f4ae93bb3d3fa6c30f189410f394ef57cf15e` sends configRevision derived
from the runtime updatedAt timestamp in milliseconds, not the schema revision.
The plugin wrongly required exactly 1. Upstream Connector supervisor.py:572–580,
675–681 accepts nonnegative safe integer config revisions independently of schema.

Alpha.5 accepts that range, preserves the applied revision in runtime.config,
retains schema revision 1 and independent capability revisions, and resets config
revision with the runtime instance. Name, empty-config and single-instance checks
remain enforced. Invalid requests do not change the active config. Distinct safe
validation messages replace the ambiguous combined error. Permissions, domains
and session capability scope are unchanged; no credentials were used.

48/48 targeted plugin/panel tests passed, including timestamp/max-safe-integer
revisions, validation/start/stop/config/reset, invalid types/ranges/names/configs,
and loopback HTTP/WS runtime startup with a timestamp-shaped server request.
Full suite: 226 tests, 220 passed, same 6 baseline failures. Scoped security:
0 blockers, 11 manual-review signals. Full package audit: same 342 pre-existing
blockers, none for Anywhere. PluginPack passed with the recorded permission/static
scan warnings. All 14 stored entries match source bytes; no unsafe paths/symlinks.
Generated catalog size/hash match and unrelated entries are unchanged.

Artifact: `packages/pi.agents-anywhere-2.0.0-alpha.5.piplug`, 84,403 bytes.
SHA-256: `807b403165c50684c4b7909a424cb78f835886ae95171a083834340d70355484`.
Install/reload alpha.5, reconnect, and retry enabling Pi Desktop if the old error
remains. Cloud startup after the fix still requires user retest; the user's
online screenshot is not represented as an agent-run Cloud acceptance test.
Existing publication/maintainer gates remain; no push or publication performed.
