# Agents Anywhere v2: Phase 1 protocol research and architecture decision

## 1. Scope and evidence baseline

Historical Phase 1 record. The later, user-authorized Phase 2 implementation
checkpoint is recorded in [the Phase 2 review](agents-anywhere-phase2-review.md).
Statements about not implementing below describe the original Phase 1 boundary.

Status: **Phase 1 research complete; implementation not started.** This is a design
record, not a release approval or a claim of successful Cloud connectivity.
Only this document is delivered. No plugin code, manifest, package, or catalog is
changed. Phase 2 requires a separate implementation step.

Sources inspected on 2026-09-28, pinned rather than inferred from old packages:

| Source | Revision | Purpose |
| --- | --- | --- |
| [Agents Anywhere][AA] | `873f4ae93bb3d3fa6c30f189410f394ef57cf15e` | Connector, Server, contracts, docs, Desktop Workbench, Web and Android |
| [PI-Desktop host][PI] | `b684e661797996db3ac64c3c5bdf5764a38fd522` | Published plugin specification and actual API/permission implementation |
| [Legacy plugin branch][OLD] | `d6f8a083e9f83ece9637fc16cbe0d6d0af955c1e` | `pi.agents-anywhere` 1.0.3 migration reference only |
| This marketplace repository | `c35605a5ed31bd4c899683d5fd0064bd632775cb` | AGENTS.md, CONTRIBUTING.md, SECURITY.md, tests and packaging policy |

Citation convention: `C/` means `connector/connector/` in [AA]; `S/` means
`server/agent_server/`; `H/` means `apps/desktop/electron/main/` in [PI]. Line
ranges refer to those pinned commits. Other paths are repository-relative to the
explicitly named source. GitHub tree links above allow navigation to every cited
file; replace `/tree/` with `/blob/` and append its path and `#L…` for a permalink.

The user-reported successful source Connector connection and old-package 405 are
inputs, not tests reproduced here. No credentials were requested, read, or used;
no live Cloud authentication, mobile session, or Docker deployment was attempted.
A source HEAD is not proof of the revision currently deployed in Cloud or installed
on this machine. Probe the installed host's operations and record its version in
Phase 2; do not assign a minimum engine version from guesswork.

## 2. Executive decision: A, with a deliberately small compatibility layer

**Select A: a native, self-contained PI plugin implementing the verified Connector
wire contract, with AA transport and Pi session operations separated by adapters.**
This is not a patch to the old WebSocket URL. It replaces authentication, framing,
runtime lifecycle, session identity, timeline serialization and recovery.

| Criterion | A: native plugin | B: reuse official Python Connector |
| --- | --- | --- |
| Official extension mechanism | Implement wire boundary; reuse schemas and conformance fixtures | Real in-process `RuntimeProvider` / `AgentRuntime` / `RuntimeHost` interfaces |
| Stock external adapter loading | Not needed | **Not present**: no entry-point loader, adapter-directory scan or install RPC |
| Integration work | Auth, WS, ingest, dispatch, lifecycle and projection | Custom Python launcher/provider or audited fork, plus authenticated Pi IPC bridge |
| Deployment | Bundled JS; no Python/uv | Python >=3.12, SDKs, native/binary dependencies and process management |
| Permission enforcement | Host `pi.net` and `pi.desktop` gateways | Must prevent subprocess egress/local tools from bypassing host policy |
| Drift | Higher wire maintenance; pinned fixtures and explicit unsupported errors | Lower transport drift; still maintain custom integration and Pi bridge |
| Marketplace fit | Best fit for self-contained package | Stock install-on-demand conflicts with repository security/distribution rules |

B was examined first, as requested. `C/runtimes/providers.py:3–10` registers only
Codex, Claude and Dsh. `C/server/client.py:63–96` accepts injected provider objects
and a runtime host, but also constructs local filesystem/terminal machinery.
`C/runtime_protocol/provider.py:22–98`, `protocol.py:26–237`, and
`supervisor.py:44–120` are genuine extension seams, **not** a public external
adapter loader. A custom launcher could use constructor injection without
modifying upstream files; it would still be custom executable integration, not
an unmodified stock Connector configuration.

`connector/pyproject.toml:6–23` unconditionally includes Claude/Codex SDKs, a Codex
CLI binary package, httpx, websockets, Pydantic, jsonschema, psutil and platform PTY
dependencies. `desktop-workbench/README.md:3–18,121–150` describes its own managed
Connector and `uv sync`; it is not a Pi adapter SDK. Do not share its connector
identity/config with a second Connector. PI's documented `pi.shell` exposes
`openExternal`, not a general supervised subprocess API
(`H/plugin-host-process.mjs:375–377`). Raw Node subprocess access is not a license
to bypass permission or installation policy.

Revisit B only if a supported external bridge and reviewed offline distribution
become available, or the user explicitly accepts a separately installed, pinned,
audited companion. Do not silently download/execute Python or a CLI. A requires
no such exception. Both designs remain high risk and require the two independent
maintainer approvals mandated by SECURITY.md before release.

Reuse priority: Server Pydantic wire models and generated
`contracts/protocol/1.0/schemas/` plus `contracts/runtime-control/2.0/schemas/`.
Do not treat Python internal dataclasses, generated Web types, or old README
examples as stronger evidence than serializers and server validators.
`contracts/protocol/1.0/README.md:3–28` identifies schema authority.
Upstream declares MIT in `README.en.md:151–153`, but no root LICENSE was found and
the Connector metadata does not supply its text. Resolve applicable license text,
copyright notices and dependency provenance before redistributing upstream code
or schema copies. No upstream code or schema files are vendored in this phase.

### 2.1 Added requirement: selectable current and legacy compatibility

The user requested support for both current and legacy Agents Anywhere, with
the current protocol selected by default. This is a planned compatibility
requirement, **not a claim that either mode has been implemented or tested**.

Provide a visible protocol selector in the connection settings:
`Current (default)` and `Legacy`. Show the selected mode beside connection
status. Use a selector rather than an ambiguous unlabeled switch, and document
the exact supported Server/Connector revision range for each option. Keep
manual configuration and command-paste input available in both modes; parsing
an old-looking command must not silently select a protocol.

Implement separate current/legacy transport and wire adapters behind the same
Pi bridge. Each adapter owns its verified URL rules, authentication, framing,
runtime/session serialization, capabilities and reconnect behavior. Do not
scatter legacy conditionals through the Pi session layer. All modes retain the
same local consent, domain allowlist, credential redaction and permission gates.

Changing mode requires an explicit local action: stop reconnect/heartbeat,
close the old socket, fence stale callbacks, settle pending requests as failed
or outcome-unknown, clear the access-token cache, and then reconnect using the
selected adapter. Never replay pending create/send operations after switching.
Scope persisted mapping and synchronization state by protocol profile in
addition to origin, connector and runtime identity; switching is not automatic
session migration. Reuse long-lived credentials only for the locally confirmed
origin and only where the verified historical auth contract permits it.

Do not automatically fall back on 401, 404, 405, timeout or malformed frames.
Such errors do not identify a historical protocol and must not trigger silent
security downgrade. Show an actionable diagnostic and leave selection to the user.

Legacy compatibility remains a research gate: pin the intended historical
official Server/Connector release, verify its complete contract from source,
and test against that release before enabling or advertising the Legacy option.
The old Pi plugin 1.0.3 is not a protocol specification, and its assumed
`/connector/v2/rpc` endpoint is not evidence of a supported historical endpoint.
Until the historical target is established, record Legacy as planned/unverified
rather than expose a switch that only changes the URL. Add conformance tests
for each mode and transition tests for reconnect, in-flight mutations, stale
callbacks, mapping isolation and secret handling. Current-mode Cloud acceptance
and historical-mode acceptance must be reported separately.

## 3. Origins, namespace and authentication

### 3.1 Actual URL behavior (including inconsistencies)

The API prefix is **`/api/v2`**. Routers are mounted there in
`S/app.py:335–356`; `docs/api/namespace.md:24–71` specifies an origin without that
prefix. The observed Cloud origin is `https://web.agents-anywhere.com`, but the
plugin must read `--server-url` and not freeze that domain as protocol identity.
Cloud and self-hosted use the same namespace; Next.js proxies `/api/v2/*`
(`web-next/next.config.ts:3–46`). Reverse proxies must preserve HTTP and WS routes.

There is not one uniform upstream normalizer:

- CLI/config paths strip trailing slashes only (`C/core/config.py:45–72`,
  `C/cli.py:263–281`). They do not validate a clean origin.
- Pairing trims input, accepts explicit HTTP(S), and probes bare addresses over
  HTTPS then HTTP at `/api/v2/health`; any status <500 counts as a response
  (`C/server/pairing.py:10–41`). Do not adopt its silent HTTP downgrade for secrets.
- `api_v2_url(origin,path)` uses `urljoin(origin + "/", prefixedPath.lstrip("/"))`.
  `ws_url` replaces the entire path, removes query/fragment, and uses `wss` only
  for HTTPS (`C/server/urls.py:6–27`).

Direct execution of those upstream helpers confirmed:

| Input | Auth URL | WS URL |
| --- | --- | --- |
| `https://web.agents-anywhere.com` | `https://web.agents-anywhere.com/api/v2/connector/auth` | `wss://web.agents-anywhere.com/api/v2/connector/ws` |
| `http://127.0.0.1:8000` | `http://127.0.0.1:8000/api/v2/connector/auth` | `ws://127.0.0.1:8000/api/v2/connector/ws` |
| `https://example.test/api/v2` | `https://example.test/api/v2/api/v2/connector/auth` | `wss://example.test/api/v2/connector/ws` |
| `https://example.test/subpath` | `https://example.test/subpath/api/v2/connector/auth` | `wss://example.test/api/v2/connector/ws` |

Design: parse an explicit HTTP(S) origin, trim whitespace/trailing `/`, reject
userinfo, query, fragment and non-root paths with actionable diagnostics. Reject
bare hosts rather than guess a scheme. Suggest correcting `/api/v2` explicitly;
do not silently rewrite a possibly intentional proxy prefix. Permit loopback HTTP
for local testing; non-loopback plaintext requires a separate explicit risk
choice and is not the default. No permissive TLS fallback.

### 3.2 Credential provisioning is separate from connection

User-authenticated `POST /api/v2/connectors` creates the connector record using
`name`, `connectorKind` (default `cli`), optional UUID `installationId`; its
response contains `connector`, `connectorToken`, `tokenPrefix`
(`S/api/connectors.py:59–84`, `S/core/models.py:93–123`). Pairing is another path:
`/api/v2/pairing/start`, `/api/v2/pairing/poll` eventually return the config bundle
(`C/server/pairing.py:44–73`).

The minimum Pi plugin consumes an existing connector ID/token from the mobile
command or manual input. Auth does not create a device; do not invent a
`connector.register` call. Parse command text as data, never execute it. Require
unambiguous values for `--server-url`, `--connector-id`, `--connector-token`;
support quotes, `--flag=value`, and line continuations, but reject conflicting
duplicate flags, control characters, malformed values and oversized input.

### 3.3 Auth exchange

```http
POST /api/v2/connector/auth
Authorization: Connector <connectorId>:<connectorToken>
```

No JSON body is sent by the official implementation. Result:

```json
{"accessToken":"<opaque short-lived token>","expiresIn":900}
```

`C/server/auth.py:38–83`; `S/api/connector_ingress.py:409–423,929–958`;
`S/core/models.py:612–614`; `S/core/auth.py:12–56`. Treat the access token as
opaque, not as a JWT. Scheme parsing is case-sensitive; the credential string
splits on the first colon. Tokens bind to the active connector credential hash;
rotation/revocation invalidates old credentials and derived access tokens.

Auth 401 is fatal in the official Connector. Other HTTP failures enter retry.
The cache refreshes with a 60-second expiry skew; every WS reconnect forces fresh
auth. Ingest retries once with refreshed auth after 401. Never place credentials
in endpoint queries, diagnostics, fixtures, HTML attributes, or command output.

The reported legacy `POST /connector/auth` 405 is consistent with the current
namespace change and a configured static-site GET/HEAD catch-all
(`S/app.py:358–420`). Without that fallback, a missing route may instead be 404.
This is a source-backed explanation, not a reproduced Cloud trace. Do not change
POST to GET or report bad credentials merely because a removed route returns 405.
Tests using unprefixed paths may be misleading: `server/tests/conftest.py:56–107`
automatically adds `/api/v2`.

## 4. WebSocket, RPC, heartbeat and reconnect

### 4.1 Admission and presence

```http
GET /api/v2/connector/ws
Authorization: Bearer <accessToken>
X-Device-OS: windows
```

The library supplies normal Upgrade headers. OS alternatives are `macos` and
`linux`. No `X-Connector-Version`, `X-Device-Name`, explicit subprotocol, token
query, or initial auth frame is used by current startup
(`C/server/client.py:245–305`, `C/server/urls.py:36–41`).

Server admission validates the existing connector, claims its connection lease,
records OS/activity, accepts the socket, marks it ready and publishes presence
(`S/api/connector_ingress.py:519–605,713–720`). A successful auth response or local
`send()` does not prove device presence or runtime registration. Server readiness
and the connection lease determine online status
(`S/services/connector_presence.py:12–24`). Duplicate connectors are not safe
multi-client sharing; use one owner per connector identity.

### 4.2 Framing: not JSON-RPC 2.0

One JSON object per WS message. The custom protocol is called RPC in source,
but **does not use the `jsonrpc` field**. IDs are strings:

```json
{"id":"rpc_example","type":"request","method":"runtime.discover","params":{}}
```

```json
{"id":"rpc_example","type":"response","ok":true,"result":{"runtimeTypes":[]}}
```

```json
{"id":"rpc_example","type":"response","ok":false,"error":{"code":"error_code","message":"Explanation"}}
```

```json
{"type":"notification","method":"connector.heartbeat","params":{}}
```

The empty discovery result above illustrates framing, not a Pi descriptor.
`S/infra/connector_rpc.py:441–513`, `C/server/rpc.py:141–148,248–279` and
`S/api/connector_ingress.py:911–926` define the actual exchange. Requests can run
concurrently and responses arrive out of order. Dispatch by string ID, not queue
position. Bound payloads/concurrency, reject unknown methods safely, and avoid
raw request/error logging. Do not reuse legacy numeric JSON-RPC error assumptions.

### 4.3 Timing and failures

| Fact | Official behavior |
| --- | --- |
| Application heartbeat | `connector.heartbeat` notification, `{}`, immediately and every 20 seconds |
| Activity timeout | Server default 60 seconds; every received JSON message refreshes lease |
| Reconnect | Fixed 3-second default; fresh auth on reconnect |
| Auth HTTP 401 | Stop retrying; credentials need correction |
| Admission 1008 | Invalid/revoked access token; may surface as failed HTTP upgrade before accept; reconnect refreshes token |
| 4409 | Connector already connected / ownership lost during admission |
| 1012 | Established lease loss or heartbeat timeout |
| 4001 | Fatal only when reason identifies invalid/revoked/deleted connector credentials |

Sources: `C/core/config.py:17–20`, `C/server/client.py:139–204,383–386,520–528`,
`S/api/connector_ingress.py:554–575`, `S/infra/connector_rpc.py:50–64,309–345`.
Do not confuse WS control ping/pong with application heartbeat.

Design improvement, not claimed upstream behavior: capped exponential retry with
jitter for transient faults, no competing reconnect timers, connection-generation
fencing, request deadlines, cancellable shutdown, and explicit authentication,
protocol, network and ownership-conflict diagnostics. User disconnect/unload must
invalidate callbacks and stop retry. Never automatically resend an uncertain
mutating RPC as though it were a read.

### 4.4 HTTP notification ingest

`timeline.sync` is HTTP-ingested; failed, oversized or disconnected WS notifications
can use ingest (`C/server/client.py:59,346–371`):

```http
POST /api/v2/connector/ingest
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{"notifications":[{"method":"timeline.sync","params":{"sessionId":"<AA ID>","runtime":"pi","runtimeId":"<instance ID>","externalSessionId":"<Pi ID>","items":[],"complete":false,"metadata":{}}}]}
```

Response includes `accepted`, `rejected`, `serverTime`. Inspect per-item rejection;
HTTP 2xx alone is not delivery success (`C/server/ingest.py:140–226`,
`S/core/models.py:617–637`). Preserve stable timeline IDs across retry. Do not claim
exactly-once transport or replay arbitrary side effects.

## 5. Runtime discovery, instance lifecycle and version axes

Actual connection startup asynchronously asks **`runtime.discover {}`** and expects
`{runtimeTypes:[...]}` (`S/services/device_runtimes.py:250–299`,
`C/server/runtime_rpc.py:271–283`). The Connector does not register a runtime by
sending the old `runtime.discover` notification with `{runtimes:[...]}`.

A descriptor is strictly validated by `S/core/device_runtime.py:39–125`:

```text
runtimeType, displayName, description, available, reason,
recommended, recommendationRank, implementationType, configSchema,
capabilities: {<discovery flag>: boolean}, metadata,
instancePolicy: "single" | "multiple", maxInstances
```

Nullable fields are still required where the Pydantic model has no default.
An unavailable type requires a reason; `single` requires `maxInstances:1`.
`configSchema`, when supplied, contains `revision`, `schema`, `uiSchema`,
`defaults`, `metadata`. Types are extensible validated lowercase keys (not a fixed
Codex/Claude enum), max 64 characters and not `rti_`-prefixed. Instance IDs are
legacy type IDs or `rti_[A-Za-z0-9_-]+`, max 128
(`C/runtime_protocol/instance_models.py:11–89`, `S/core/runtime_identity.py`).
Proposed type is `pi`; use the Server-assigned/configured runtime instance ID,
not a hard-coded universal ID.

Discovery of a type is separate from configuring/starting an instance. Implement
these current control methods before claiming an operational runtime:

| Method | Parameters / result |
| --- | --- |
| `runtime.discover` | `{}` -> `{runtimeTypes}` |
| `runtime.configSchema` | scope -> `{configSchema}` |
| `runtime.config` | scope -> `{running,config,runtimeId}` |
| `runtime.validateConfig` | scope + `name,config,configRevision` -> `{valid:true,runtimeId}` |
| `runtime.start` | scope + `name,config,configRevision` -> `{runtimeId,status,error?}` |
| `runtime.stop` | scope -> `{runtimeId,status:"stopped"}` |
| `runtime.capabilities` | scope -> `{capabilitySet}` |
| `runtime.modelCatalog`, `runtime.permissionCatalog`, `runtime.commands` | scoped catalogs or honest unsupported/empty results as allowed by each contract |

Scope is `{runtime,runtimeId}`; results add those fields. See
`C/server/runtime_rpc.py:93–185,308–356`, `runtime_rpc_params.py:212–256`.
Stopping the adapter must not shut down Pi itself or delete sessions.

**Version distinction:** REST namespace v2, Runtime Control 2.0, event protocol
1.0, Connector package version, and plugin version are separate axes.
`ProtocolHandshakeRequest`, `protocolVersions` and supported `"1.0"` constants
exist in `C/server/protocol.py:10–14,58–61`, but the live dispatcher/startup does
not require that handshake (`C/server/runtime_rpc.py:54–78`, `dispatch.py:26–31`).
Do not invent version negotiation or send the old hard-coded version header.
Detect incompatible shapes/missing methods explicitly and report the pinned
compatibility baseline. An old connector-wide HTTP capabilities endpoint returns
410 (`S/api/connectors.py:106–133`).

The Connector also emits revisioned `protocol.capabilitiesUpdated` with
`{revision,capabilities:[{capabilityId,scope,runtime,supported,available,allowed}]}`.
Its startup helper still filters known names (`codex`, `claude`, `dsh`, `opencode`,
`acp`), so do **not** impersonate Codex to advertise Pi. Use the current scoped
runtime/session capability contract below; prove `pi` discovery and usability
against the target Cloud and clients in Phase 2. That older helper is not a
registration acknowledgement (`C/server/capabilities.py:5–74`).

## 6. Session protocol and mapping

### 6.1 Implemented upstream dispatch surface

The current runtime dispatcher includes `session.discover`, `session.create`,
`session.sync`, `session.state`, `session.capabilities`, `session.notices`,
`session.selections.update`, `session.commands`, `session.command.execute`,
`interaction.respond`, `session.send_message`, `session.steer`,
`session.interrupt` (`C/server/runtime_rpc.py:54–78`). All scoped calls include
`runtime`; omitted `runtimeId` defaults to that type, so named instances must
supply the actual ID.

| RPC | Important inputs | Result / semantics |
| --- | --- | --- |
| `session.discover` | scope, `limit` default 100, `cursor?`, `force` default true | `{sessions,nextCursor:null}` in current handler; each item has AA/native IDs, title, cwd, orderingTime, metadata and optional sourceState |
| `session.create` | scope, Server's `sessionId`, `content`, optional title/cwd/selections/attachments/clientMessageId/runtimeOptions | Create **and start**; retain Server's AA ID and bind the new native ID |
| `session.send_message` | scope, `sessionId`, `externalSessionId?`, `content`, optional cwd/selections/attachments/clientMessageId | Runtime operation result, not merely a fabricated `{success:true}` |
| `session.sync` | scope, IDs, `limit?` | Immediate `{accepted:true,background:true,sessionId,externalSessionId}`; snapshot arrives separately |
| `session.state` | scope, IDs | `{state:null|{sessionId,runtime,runtimeId?,externalSessionId,status,selections,statusReason,error,metadata}}` |
| `session.interrupt` | scope, `sessionId`, `reason?` | Adapter receives AA ID, not an external ID; map before cancelling |

Sources: `C/server/runtime_rpc_params.py:281–419`, `runtime_turn_rpc.py:24–148`,
`runtime_session_rpc.py:21–154`, `runtime_rpc_payloads.py:81–101,192–233,339–357`.
Successful operation results flatten runtime data; `ok:true` is not universally
included. Runtime turn IDs are removed from server-bound operation payloads.
A polling runtime's background sync reads a snapshot, sends `timeline.sync`, then
state and notices. An event runtime instead owns `resynchronize` ordering.
Do not answer `session.sync` with a fake inline transcript.

### 6.2 Durable identity design (proposed Pi behavior)

Never equate these identifiers:

```text
connectorId        = device/connector ownership boundary
runtime            = provider type (pi)
runtimeId          = configured runtime instance
sessionId          = Agents Anywhere platform session ID
externalSessionId  = Pi durable session ID
turnId             = Pi-local turn correlation, not a public AA session ID
```

Upstream discovered-session convention (`C/runtimes/session_identity.py:6–21`):

```text
sessionId = "sess_" + runtime + "_" +
  sha256(UTF8(session_namespace + ":" + runtime + ":" + externalSessionId))[:24]
```

Namespace is connector ID for legacy type identity, otherwise includes type,
instance ID and optionally a source-key digest
(`C/runtime_protocol/instance_binding.py:183–220`). Use the equivalent bound
namespace, not just the Pi ID. For remotely created sessions the Server already
supplies its AA ID: persist that mapping and reuse it when discovery later sees
the same native session. Never replace it with a second hashed AA identity.

Persist a versioned, non-secret mapping keyed by
`(serverOrigin,connectorId,runtimeId,AA sessionId)`, with native Pi ID, local
host-installation identity, project/workspace binding, export consent, tombstone,
last durable transcript position, timeline IDs/revisions and pending operation
correlation. Maintain reverse lookup within the same scope; reject mismatched
external IDs. Plugin-private files are not host authorization.

On Pi restart, reconcile with authoritative host sessions before accepting
mutations. On Connector reconnect, reauthenticate and reconcile runtime config,
mappings and snapshots. Never automatically replay an uncertain create/send;
persist request/clientMessageId correlation and surface ambiguous outcomes.
Serialize mutations per Pi session, account for simultaneous local/mobile turns,
and bind cancel to the intended active turn where possible. A removed/archived
session becomes unavailable/tombstoned, not transparently recreated. Workspace
switching must not rebind old IDs to a new root. Start with one explicitly enabled
instance and user-selected export scope; multiple workspaces/instances are later
work, not a false capability claim.

## 7. Capabilities, timeline and approvals

### 7.1 Honest capability contract

Runtime/session capability RPC returns `{capabilitySet}`. The set has
`runtime,runtimeId?,revision,sessionId?,connectorId?,metadata,capabilities`; each
entry contains `capabilityId,version,scope,runtime`, optional scoped IDs,
`supported,available,allowed,unavailableReason?,metadata`.
The notification is `runtime.capability.updated` with the **set directly** as
params (`C/server/runtime_rpc_payloads.py:134–171`, `runtime_host.py:175–203`).

Known UI IDs include:
`session.send_message`, `session.interrupt`, `session.steer`,
`session.interaction.approval`, `session.commands`, `session.command.execute`,
`runtime.attachment`, `runtime.config`, `catalog.model`, `catalog.permission`,
`catalog.effort`. UI enablement requires **supported AND available AND allowed**
(`web-next/src/components/session/capabilities.ts:3–47`; Android
`feature/sessiondetail/SessionRuntimeState.kt:8–140` under its Java source root).
Discovery flags such as `startTurn` are a different representation.

Initially declare only capabilities actually implemented and exercised. During
Phase 2, discovery/online is not evidence that chat works. Do not reuse `chat`,
`thinking_stream`, `tool_approvals`, or `workspace_inspection` from 1.0.3. No steer,
approval, attachment, shell, filesystem browsing or permission-mode mutation in
the minimum implementation. Expose catalogs only after mapping and validation;
never offer an Auto/allow-all permission option to make remote operations work.

### 7.2 Connector timeline projection

`timeline.sync` params: `{sessionId,runtime,runtimeId?,externalSessionId?,items,
complete,metadata}`. `timeline.itemUpsert`: `{sessionId,runtime?,runtimeId?,item}`.
A serialized item contains:

```text
id, sessionId, type, status, role?, content,
source: {runtime?,runtimeType?,runtimeId?,sessionId?,itemId,itemType?,
         event?,derivedKey?,clientMessageId?},
orderSeq, revision, contentHash
```

Example content is `{kind:"markdown",text:"reply",format:"markdown"}`. Nested
`source.sessionId` is native identity, not the outer AA ID. Use stable IDs and
upserts rather than duplicating assistant text on every poll. Do not call a
truncated window complete or erase history on a partial sync. The host serializer
filters internal `turn.start` / `turn.end` items and strips runtime turn IDs;
internal models are not wire permission to emit them
(`C/server/runtime_host.py:245–300,406–437`, `runtime_rpc_payloads.py:178–201`).

Other notifications: `session.meta.upsert`, `session.state.updated`,
`notice.upsert`, `runtime.catalog.updated`. State carries IDs, status,
statusReason/error, selections, metadata; catalog notification uses
`{runtime,runtimeId,catalogType:"model"|"permission",catalog}`
(`C/server/runtime_host.py:96–143,205–308`).

Pi MVP projection: user message, running status, durable final assistant reply,
completed/error/aborted state. Poll authoritative transcript/status; use turn-end
notifications only as refresh hints. Preserve failure and interruption distinctly.
Do not announce assistant/reasoning/tool deltas without a public event feed.

### 7.3 Server-to-client events are another layer

Official Web/Android receive `{protocolVersion:"1.0",eventId,sessionId,sequence,
cursor:"seq:N",emittedAt,type,payload}`. This is **not** the Connector WS frame.
Event types include `timeline.item_created`, `timeline.item_updated`,
`timeline.snapshot`, `runtime.state.updated`, `runtime.notice.updated`,
`runtime.notice.snapshot`, `runtime.capability.updated`, `runtime.catalog.updated`.
Their payloads use `{item}`, `{items}`, `{state}`, `{notice}`, `{notices}`,
`{capabilitySet}`, and client-facing catalogs respectively.

Clients obtain snapshot + eventCursor, connect, wait for `session.subscribed`,
then recover via `GET /api/v2/sessions/{id}/events?after=seq:N` while buffering live
events. Responses include `events,nextCursor,snapshotRequired`; there is no
`hasMore` field. Reconnect repeats recovery. Sequence gaps alone do not mandate
a snapshot; some live facts do not advance durable sequence. Keep item orderSeq,
item revision/hash, event sequence/cursor and eventId dedup separate.

Evidence: `contracts/protocol/1.0/schemas/event-envelope.schema.json:4–58`,
`event-recovery-response.schema.json:64–93`; `docs/api/realtime.md:86–108`;
`web-next/src/components/session-detail.tsx:1074–1124`; Android
`feature/sessiondetail/SessionDetailReducer.kt:14–98`. The plugin emits Connector
facts; it must not impersonate the Server's client event sequencing.

### 7.4 Approval protocol exists; Pi support remains disabled

AA approval is a `SessionNotice` (`type:"interaction"`,
`interactionType:"approval"`, `status:"open"`, `responseRequired:true`, explicit
blocking/actions/context), not an old `approval.respond` method. The client POSTs
`/api/v2/sessions/{id}/runtime/notices/{noticeId}/respond` with `{actionId,input?}`;
the Server checks `session.interaction.approval` and forwards
`interaction.respond {sessionId,runtime,runtimeId,noticeId,actionId,inputData?,
externalSessionId?}`. Concrete upstream actions are `approve` and `reject`
(`S/api/sessions.py:1477–1523`, `C/runtimes/claude/domain/approvals.py:36–72`).

Pi does expose dangerous `tool/resolvePermission`, but that alone is not safe
remote approval support. No public plugin feed/enumeration for pending tool
approval requests was established. Dangerous desktop operations require native
host confirmation even if the plugin passes `confirm:true`
(`H/mcp-control.ts:245`, `H/plugin-runtime.ts:4931–4972`). Do not synthesize
approval IDs, seize renderer-only events, toggle Auto, or bypass local consent.
Keep the capability false until a reviewed pending-request/correlation/expiry
API and decision path are available and tested end-to-end. Local approval may
still be needed while a remotely started task waits.

## 8. Pi-Desktop bridge: verified replacements and constraints

Current source and formal plugin spec, not legacy usage, establish this matrix:

| Need | Current API / evidence | Decision |
| --- | --- | --- |
| Workspace | `pi.workspace.get()`; `H/plugin-runtime.ts:4865–4875` | Supported; enriched project/roots may be present; not remote authorization |
| Operation discovery | `pi.desktop.listOperations()`; `H/plugin-runtime.ts:4877–4892` | Probe actual host before enabling actions |
| Existing sessions | `desktop.invoke({operation:"session/list",args:[]})` | Filter to locally approved export scope |
| Transcript | `session/get` with its formal input | Bounded, authoritative read for final reply/recovery |
| Create | `session/create`, then `agent/prompt` | Separate durable create from start; compensate/report partial failure, never duplicate blindly |
| Send | `agent/prompt` with `{sessionId,content}` | Returns `{accepted,turnId}`; retain local correlation |
| Interrupt | `agent/abort` with `{sessionId,turnId?}` | Cancel mapped intended turn, not a different current session |
| Status | `agent/getStatus`, args `[sessionId]` | Poll truth; do not equate socket online with running agent |
| Models | `pi.models.list()` | Only expose tested usable mappings; no arbitrary provider overrides |
| End notification | `session:turnEnded` | Source-defined refresh hint; not durable replay |
| Fine streaming | No public assistant/reasoning/tool delta feed established | Disabled; use snapshots and state |
| Archive | No equivalent safe remote archive established | Deferred; do not substitute delete |

Desktop operation catalog: `H/mcp-control.ts:203–219,599–715`;
`pi.desktop.invoke` enforcement: `H/plugin-runtime.ts:4894–5008`;
prompt/abort types: `packages/shared/src/types/agent.ts:11–79,119–122` in [PI].
The entire desktop gateway requires `desktop.control`. Build a strict local
operation allowlist; never forward arbitrary operation/args from remote input.
Do not pass remote `permissionMode`, truncation fields, host-only collaboration
IDs, filesystem attachments, or inherited permission authority unchecked.
Normal Pi session/tool permission checks still apply.

The task's legacy collaboration APIs **exist**, but are the wrong remote ingress:
`spawn` and `send` require an active host-authenticated Agent tool invocation
(`H/services/session-collaboration.ts:107–113,271–309`). A WS callback does not
possess that context. Do not spoof or borrow it. `list` returns a structured host
result, not the legacy assumption that the whole response is necessarily an
array. The newer `pi.session.list/get/listMessages` contract is ownership-scoped
for plugin-imported sessions and does not authorize arbitrary existing-session
access (`docs/spec/07-plugins/03-plugin-api.md:370–452`). Use the reviewed desktop
catalog for the requested existing Pi sessions.

`session:turnEnded` carries `{sessionId,turnId,reason:"completed"|"aborted"|"error"}`.
It is fire-and-forget, no ack/replay, and not a guarantee that all late tool writes
are flushed (`docs/spec/07-plugins/03-plugin-api.md:974–991`,
`H/services/plugin-services.ts:535–551`). The spec warns 0.14.8 did not ship it;
source presence is not installed-host verification. Unknown event subscriptions
do not fail, so function existence/subscription success does not prove delivery.
Use status/transcript reconciliation even when the event is available.

Legacy differences beyond network protocol (`OLD/plugins/pi.agents-anywhere/`):
`main.js:329–375` assumes `pi.storage`, auto-connects, and registers persistent
callbacks without exported lifecycle cleanup. `views/panel.html:222–293` is useful
UX reference but assumes `window.pi.bus.send`; current panels use
`window.pluginBridge`. Rebuild lifecycle with `onLoad/onUnload`, unregister every
subscription/timer/service, and observe the 46px host chrome contract. Preserve
command paste + manual configuration as concepts, not copied API assumptions.

## 9. Credentials, domains, trust boundaries and diagnostics

No generic secure-storage API or `pi.storage` was found in the inspected public
plugin contract/runtime. Host-internal secrets APIs are **not** a plugin API.
Use memory-only connector/access tokens by default. `pi.plugin.getDataPath()` is
a documented private-data location, not an encryption guarantee. If later adding
persistent connector credentials, use a verified secure API if one ships;
otherwise require an explicit plaintext-storage choice with README/UI warning,
restricted file access, redaction and deletion behavior. Do not call plain files
secure storage. Do not write access tokens to persistent settings. Persist only
non-secret mappings by default. Upstream config's `0600` chmod does not establish
Windows ACL security (`C/core/config.py:82–103`).

Pi network policy is static manifest `net.domains`: hostnames only, no scheme,
port or path; `*.example.com` includes its base/subdomains; bare `*` is refused.
Empty/malformed list means no egress. Redirects are rechecked. WS uses the same
allowlist (`PI/docs/plugin-development.md:489–513`,
`docs/spec/07-plugins/03-plugin-api.md:731–746`,
`H/plugin-runtime.ts:3887–3944`). No reviewed dynamic-domain grant API was found.

Consequently arbitrary self-hosted domains are **not** automatically supported
by entering a URL. Cloud uses an explicitly declared exact origin host. A
self-hosted installation needs an explicitly reviewed manifest domain and user
reload/re-authorization (or a future formal dynamic grant). Do not edit the
manifest at runtime, use `*`, bypass via raw Node networking, or route through an
unrestricted subprocess. Ports/protocols are additionally validated by the plugin.
Credentials are bound to the configured origin; domain changes require new local
confirmation, not a redirect carrying Authorization to another server.

| Entry / data flow | Gate | Bounds and cleanup |
| --- | --- | --- |
| Local command paste -> parsed credentials -> configured AA origin | Explicit connect; net.fetch + net.websocket; manifest domain | Parse only; no shell; memory secrets; clear on disconnect/config change |
| Auth/WS/ingest -> Server | Validated origin and fresh auth | Redact headers/tokens and URLs; timeouts, payload limits, retry cancellation |
| Remote session read -> Pi -> AA | desktop.control plus local export opt-in | Only selected sessions/workspaces; bounded history; disclose transcript egress |
| Remote create/send/interrupt -> Pi | Fixed operation allowlist and scoped mapping | Per-session serialization, duplicate correlation, local permission system |
| Mapping/outbox -> plugin-private data | Documented private-data path; audited access | No tokens by default; versioning, atomic updates, bounded retention |
| Background connection/event handling | Reviewed lifecycle/background.service if used | Stop service/timers, close sockets and fence callbacks on unload |

Provisional permission surfaces for later implementation are ui.view, net.fetch,
net.websocket, desktop.control and background.service if a resident service is
used. Add only actually used storage permissions under the verified host model;
no blanket filesystem, shell, credential, clipboard or agent-tool permissions.
This is not a manifest change or final permission approval.

Log only sanitized connector/protocol baseline, Server origin/API base/WS endpoint,
auth outcome, runtime discovery/config/start outcome, session discovery counts,
reconnect reason, HTTP status, WS close code, RPC method/error code and bounded
message. Never log a pasted command, full token, Authorization header, arbitrary
RPC body or unsanitized exception. Upstream key-based RPC debug redaction does
not catch credentials embedded in ordinary strings
(`C/server/rpc.py:149–161,400–435`); do not inherit it as sufficient protection.

UI states: unconfigured, connecting, online, reconnecting, authentication failed,
protocol incompatible, network error; separately expose runtime ready/unavailable
and ownership conflicts. Device online is not proof of runtime start or chat.
Never show success merely because a notification was sent.

## 10. Verification performed and subsequent gates

### Phase 1 checks actually run

- Fetched the three source repositories into session scratch directories and
  recorded their commits. Git status showed clean research clones.
- Read local AGENTS.md, CONTRIBUTING.md and SECURITY.md; reviewed formal Pi
  plugin development/API specs and actual gateways, old plugin main/manifest and
  command/UI bridge references, and current AA server/connector/client contracts.
- Executed current upstream `urls.py` directly with Python stdlib `runpy`: four
  input origins, **eight assertions passed**, including Cloud/local endpoints and
  path-prefix mismatch behavior. No HTTP request was made by this check.
- Before creating this document, ran `node --test tests/*.test.mjs`: **182 tests,
  176 passed, 6 failed** on Windows / Node v24.15.0. Existing failures:
  `tests/gitlens.test.mjs:308,372` (Windows normalized/short-path equality);
  `tests/terminal.test.mjs:205` (POSIX path expectation), `:224,:317` (PTY helper
  timeouts), `:346` (login environment/PATH expectation).
- Before creating this document, ran
  `python scripts/security_audit.py --check-packages` using Python 3.13.3:
  **exit 1, 342 blockers**, all reported as packed bytes not matching current
  plugin source. These are existing repository/artifact failures, not security
  approval. No unrelated source or package was changed to hide them.
- No linter is configured for this repository workflow. Plugin pack/catalog
  rebuild and package SHA-256/size are **not applicable** to a documentation-only
  phase with no plugin artifact. Do not rebuild unrelated releases.

Full baseline outputs are in session scratch `phase1-tests.log` and
`phase1-security.log`; they are temporary diagnostics, not shipped project files.

### Implementation and release acceptance (not yet executed)

1. Phase 2: validate exact discovery descriptor/config/start/framing against a
   pinned Server; test `pi` rather than spoofing a known type. Probe real Pi
   operations and permissions, then use user-provided credentials for
   `https://web.agents-anywhere.com`; confirm both device online and Pi runtime
   visible from the actual phone/Web client. Do not stop at socket-open.
2. Phase 3: discover authorized existing Pi sessions; verify identity stability
   across Pi restart, Connector reconnect and project change. Reject cross-scope
   IDs, deleted sessions, corrupt mappings and unapproved workspace export.
3. Phases 4–5: send/create/interrupt and final reply/status reconciliation. Test
   local/mobile concurrency, duplicate clientMessageId, late reply, timeout after
   dispatch, cancel during a newer turn, and partial create/start failure.
4. Phase 6: add finer streaming only with a verified public Pi event source;
   retain stable item IDs, backpressure and snapshot recovery. Phase 7 remains
   blocked on safe approval request discovery/correlation and resolution.
5. Conformance fixtures: URL/parser edge cases, malformed/unknown frames and
   methods, auth refresh, runtime instance revisions/config rejection, honest
   capability gates, timeline shapes/hash/revision consistency, ingest partial
   rejection, reconnect fencing and no mutation replay. Include redaction tests
   for tokens embedded in strings and error URLs. No real secrets in fixtures.
6. Windows integration matrix: normal network, configured proxy, offline/restore,
   Server restart, Pi restart, phone reconnect, wrong/revoked token, wrong origin,
   incompatible protocol, duplicate connector, user disconnect, unload/reload,
   denied permissions and rejected remote action. Self-hosted Docker Compose
   testing is conditional on available runtime and explicitly granted domain.
7. Before release: resolve baseline test/security failures through their proper
   ownership, perform full source and packed-artifact review, obtain two
   independent maintainer approvals, verify dependency/license provenance,
   package/version/permissions/i18n, generated catalog hash and size. Publish
   only with explicit authorization.

### Remaining limitations and stopping boundary

The architecture and source-backed protocol are established, but **no connectivity
or plugin functionality is claimed**. Installed-host API availability, Cloud's
actual deployed compatibility, arbitrary self-hosted domain authorization,
secure persistent credentials, approval integration and fine-grained event access
remain explicit verification or API gates. General session control has a verified
source-level gateway alternative and is not declared blocked merely because the
old collaboration path is unsuitable. Existing repository test/artifact failures
remain release blockers outside this Phase 1 scope.

This work stops here: no plugin implementation, version bump, packing, catalog
edit, push, marketplace publication, or change to the user's task brief.

[AA]: https://github.com/anywhere-labs/Agents-Anywhere/tree/873f4ae93bb3d3fa6c30f189410f394ef57cf15e
[PI]: https://github.com/vastsa/pi-desktop/tree/b684e661797996db3ac64c3c5bdf5764a38fd522
[OLD]: https://github.com/mazongYY/pi-desktop-plugins/tree/d6f8a083e9f83ece9637fc16cbe0d6d0af955c1e

## 11. Follow-up: verified historical compatibility boundary

The official `v0.1.7` tag points to
`2f7cce16d6e14ea6d89279a2a74aee0b73d6ab48`; Connector package metadata there is
`anywhere-cli 0.1.7.2`. This is the pinned historical research target, not a claim
of historical PyPI artifact or deployed-server acceptance. GitHub release API
metadata was unavailable due to rate limiting; the tag/source was verified.

The `/api/v2` namespace was introduced by
`ecb90628e7e0d4e1876c2e45d32022483205ba79` on 2026-07-20; its parent is
`9a2547c5dd5b98410b3363df0b26352a9d9c2a50`. The Connector tree and Server
connector_ingress.py are unchanged between v0.1.7 and that parent. Namespace
migration is separate from later lifecycle and Runtime Control 2.0 changes.

| Area | Historical v0.1.7 behavior |
| --- | --- |
| Auth | POST `/connector/auth`, Connector header, no body; short-lived accessToken/expiresIn |
| WebSocket | `/connector/ws`, Bearer header and X-Device-OS; never the old Pi plugin's `/connector/v2/rpc` assumption |
| Framing | Same custom type/id/method/params and ok/result/error envelope family, not JSON-RPC 2.0 |
| Startup | Connector sends `connector.capabilitiesUpdated`; Server sends `capabilities.setActiveRuntimes {runtimes,revision}` |
| Lifecycle | `capabilities.scanRuntime`, `invalidateRuntime`, `setActiveRuntimes`, `forceResyncRuntime` |
| Sessions/control | `session.discover/create/sync`, `turn.start/interrupt`, `approval.resolve` |
| Notifications | `session.updated`, `timeline.sync`, `timeline.itemUpsert`, `approval.requested` |
| Identity | Runtime type only; no current named runtime instance contract |

Evidence at v0.1.7: `connector/connector/runtime.py:241–460,547–556,693–700,754–766`,
`connector/connector/protocol.py:8–26`,
`server/agent_server/api/connector_ingress.py:121–149,228–281,540–600`, and
`server/agent_server/core/models.py:8,435–473,517–575`.

**Concrete blocker:** historical `RuntimeName` is
`Literal["codex", "claude", "opencode", "acp"]`. Stock v0.1.7 session/timeline
validation does not accept native `pi`. A second transport adapter alone cannot
provide real compatibility. A reviewed server extension or explicit compatible
identity mapping is needed; neither has been implemented or accepted. The alpha
keeps Legacy visible but disabled, with this baseline and reason; it never
silently impersonates another runtime or claims dual-protocol support.
