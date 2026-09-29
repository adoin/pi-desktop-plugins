# Agents Anywhere — workspace chat beta

Version: **2.0.0-beta.1**. Basic chat implementation for the current official
Connector protocol. This is a local development/acceptance build, **not a
production-approved or fully compatible v2 release**. Offline integration tests
are not proof of live Cloud/mobile acceptance.

## Setup and acceptance

1. Install the beta package or reload this dev directory in PI-Desktop 0.15.9+
   and explicitly approve its declared permissions, including `desktop.control`
   and `models.list`. Required host API availability is checked at connection.
2. Open the intended local workspace and configure a usable Pi model. Review
   existing session permissions before sharing: remote prompts use those same
   permissions, including any locally configured automatic tool execution.
3. Open the plugin panel. Paste the Anywhere connection command and parse it,
   or enter the origin, Connector ID and token manually. Parsing is local data
   processing only; no command is ever executed. Do not paste secrets in chat.
4. Review the destination, check connection consent and separately check
   workspace-session sharing, then Connect. Sharing includes workspace paths,
   titles, user/assistant text, model identifiers and status. Without this
   second opt-in, only the connection/runtime preview is enabled.
5. In Anywhere Web/desktop **device settings**, add a **Pi Desktop** runtime
   instance, save its empty configuration and enable it. Type discovery does
   not create an instance. Existing active instances are persisted by the
   server and reconciled through `runtime.start` after reconnect.
6. Check **Runtime running**, **Sharing ready**, workspace and session count in
   the panel. In Anywhere, open a discovered Pi session or create one with a
   configured model. New sessions require a native Pi confirmation to set Ask
   mode before the first prompt; denial may leave a blank session, never a
   silently started task. Tool approvals remain local.
7. Verify a text prompt and Pi reply in both clients; test a second message,
   running/idle or local-approval status, and interrupt a running turn. Briefly
   disconnect the transport and verify instance recovery and no duplicate
   prompts after reconnect. Switching local workspaces must stop sharing.

Credentials are memory-only and cleared from panel fields on accepted Connect.
Disconnect/unload clears the connection's credential references; restart requires
local re-entry. Closing the panel does **not** stop the opted-in background
connection. Disconnect stops synchronization/remote control but does **not**
abort an already accepted Pi turn. Use Interrupt or the local session to stop it.
Do not run two Connectors using the same identity.

## Implemented behavior

- Current source contract pinned to Agents Anywhere
  `873f4ae93bb3d3fa6c30f189410f394ef57cf15e`: Connector authentication,
  Bearer WebSocket RPC, 20-second heartbeat, bounded reconnect/backoff,
  runtime schema/config validation and one active Pi runtime instance.
- Workspace-scoped native Pi session discovery, model catalog, create/send and
  turn-ID-scoped interrupt. Every host operation rechecks the selected workspace.
  Native imported/read-only sessions and other project paths are excluded.
- HTTP `/api/v2/connector/ingest` uploads metadata, user/assistant text and
  state/capability updates. Authenticated requests refresh an expired token and
  retry a rejected authentication once. No remote error body is logged.
- Polling every three seconds when active (up to ten sessions per pass, round
  robin). This is bounded durable-message synchronization, **not token streaming**.
  Discovery pages contain at most 100 eligible workspace sessions and expose a
  continuation cursor; polling traverses the inventory. Explicit
  history sync reads at most ten pages of 100 messages; text is limited to 16,000
  characters per item. `complete:false` never replaces unrelated history.
  Tool output, attachments and nested tool messages are not exported.
- Stable per-session message IDs and persistent scoped identity/operation
  receipts prevent replay of accepted create/send requests after reconnect or
  plugin reload. Unknown delivery outcomes fail closed rather than resend.
  Up to 16 server/workspace scopes, 200 mappings and 1,000 receipts per scope
  are retained; no automatic eviction silently weakens deduplication.
- English/Chinese teal light/dark panel, separate sharing opt-in, local command
  parser and sanitized diagnostic report that also works without a host bridge.

Not supported: remote approvals, steering, attachments, commands, permission or
existing-session model changes, archive, workspace switching, fine-grained
streaming, and legacy compatibility. Disabled capabilities are reported as such.
A local tool approval may require returning to Pi Desktop; it is not a hang or a
remote approval bypass.

## Permissions and data

| Permission | Purpose |
| --- | --- |
| `ui.panel`, `ui.view` | Settings panel and docked view |
| `net.fetch`, `net.websocket` | Credential exchange, text/state ingest, RPC and heartbeat |
| `background.service` | Keep an explicitly started connection resident |
| `desktop.control` | Enumerate/read/create/configure Pi sessions, prompt, status and abort |
| `models.list` | Read configured model identifiers/labels, never provider credentials |

Only IDs, hashes, mapping scope and accepted-operation receipts persist in plugin
settings (`anywhereSessionBindingsV1`). Tokens, commands and transcript text do
not. Do not manually remove receipts to retry an uncertain operation: inspect
its native Pi session first. Automatic migration from the old plugin's token
files or mappings is not attempted. Retain old non-secret settings manually and
disable the previous Connector before testing.

## Cloud, self-hosted and legacy

Default origin and the **only shipped allowlisted hostname**:
`https://web.agents-anywhere.com`. URLs must have no path, query, fragment or
userinfo. Self-hosted use needs an explicit exact-host manifest edit followed by
reload and host permission approval; parsing a self-hosted command does not
authorize it. No bare `*`, broad wildcard, raw-network bypass or remote plain
HTTP. Loopback HTTP is for isolated development only.

**Host redirect limitation:** inspected `pi.net.fetch` follows redirects while
retaining headers and exposes no redirect opt-out. Hostname allowlisting alone
cannot prove same-origin/TLS-only forwarding. Use trusted direct non-redirecting
auth/ingest endpoints. Production release remains blocked pending host security
verification/fix, particularly with multiple allowed domains.

The visible Legacy v0.1.7 selector remains disabled: the stock server accepts
only codex, claude, opencode and acp, not native `pi`, and uses a different
lifecycle. Historical baseline is `2f7cce16d6e14ea6d89279a2a74aee0b73d6ab48`
(Connector metadata 0.1.7.2). There is no impersonation or silent downgrade.

## Diagnostics and recovery

Use **Generate diagnostic report**, select it and copy with Ctrl+C. It reports
panel/plugin versions and allowlisted event codes, not credentials, Connector
IDs, workspace names or transcript text. Logs stay in memory. Socket online,
runtime discovered, runtime running and sharing ready are separate states.

Authentication/ownership failures stop reconnect; transient connection failures
back off. Runtime recovery waits for the server's saved active instance. For
`workspace_changed`, select the intended workspace and reconnect with fresh
consent. For `operation_outcome_unknown`, inspect the Pi conversation before
submitting a new message. Native creation confirmation denial can leave a blank
session; review it locally instead of repeatedly creating copies. A panel timeout
does not undo a host request already delivered: inspect status before retrying.

## Verification and publication gates

Run `node --test tests/agents-anywhere*.test.mjs` in the marketplace repository.
Tests cover a fake-host complete chat chain plus real loopback connection wire
exchange and negative paths. They do not use production credentials or certify
the deployed server/installed host. See `docs/agents-anywhere-phase2-review.md`
for results, provenance and review details.

Risk tier: **High**. Complete source/package review and two independent human
maintainer approvals are required before publication. Those approvals, real
Cloud chat acceptance, self-hosted authorization and legacy support are not
implied by this package. Nothing is pushed or published by building it locally.
