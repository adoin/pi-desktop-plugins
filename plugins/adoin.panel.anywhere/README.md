# Agents Anywhere

Plugin ID: **adoin.panel.anywhere**. Version: **2.0.0**.

Connect the selected Pi Desktop workspace to the current Agents Anywhere
Connector protocol. Discover sessions, create/send messages, synchronize text
replies and status, interrupt turns, and reconnect with durable request dedup.
Publication approval and host redirect verification remain separate from the
version label; this package does not claim complete historical compatibility.

## Panel

The panel has three bilingual, keyboard-accessible tabs:

- **Status**: connection/runtime readiness, shared workspace/session metrics and
  instructions for adding the Pi runtime in Anywhere.
- **Connections**: connection credentials, local CLI parser, password-encrypted
  persistence and separate connection/workspace-sharing consent.
- **Events**: sanitized event history and a diagnostic report suitable for sharing.

The last selected tab is restored on reopen. Only an allowlisted tab identifier
is stored in renderer localStorage; credentials are never stored there. Blocked
or invalid tab storage falls back safely. Appearance follows the host's
light/dark theme and language, with a responsive layout and host-owned titlebar.

## Migration from pi.agents-anywhere

The ID change creates a **new plugin identity**, not an in-place update to the
old one. Disable/disconnect the old plugin before connecting this plugin to the
same Connector ID. Keep your existing Anywhere device and configured Pi instance;
you do not need to delete or recreate them.

Host plugin-private settings, encrypted credentials, mappings and receipts from
`pi.agents-anywhere` do **not** automatically migrate to `adoin.panel.anywhere`.
This plugin does not read another plugin's private data. Enter the original
Connector ID/token once and save them under this identity. A password alone
cannot recover a token from a different plugin's store. Review any previously
uncertain sends locally before resubmitting them across this migration.
Subsequent updates using the new ID should be installed over this plugin rather
than uninstalling first; uninstall may delete plugin data.

## Connect and share

Use PI-Desktop 0.15.9+ with the declared APIs and explicitly grant its permissions.
Open the intended local workspace and configure a usable Pi model. In Connections,
paste the Anywhere connection command and parse it, or fill the origin, Connector
ID and token. Pasted commands are parsed as data, never executed.

Review the destination and check connection consent. Separately opt into sharing
before connecting if remote chat is wanted. This uploads workspace paths, titles,
user/assistant text, model identifiers and status, and allows remote prompts and
interruption under the sessions' existing local tool permissions. No sharing
consent is restored automatically after restart.

In Anywhere Web/desktop device settings, add **Pi Desktop** from Available to add,
save its empty config and enable it. Discovery alone does not configure an Agent.
The server persists active instances and starts them after transport reconnect.
Check Runtime running and Sharing ready before testing a conversation. Newly
created sessions require a native Ask-mode confirmation before their first prompt;
denial can leave a blank session, never an automatically started task. Tool
approvals remain local. Do not run two Connectors with the same identity.

Closing the panel does not disconnect an explicitly started background connection.
Disconnect stops synchronization and remote control, but does not abort an already
accepted Pi turn. Use Interrupt or the local Pi session to stop a turn.

## Remember a connection

Connect saves the origin, Connector ID and protocol in plugin-private settings.
To retain the token too, select **Encrypt and remember the entered token** and set
a strong unique password (12–1024 characters). After restart, the fields restore;
select **Use saved encrypted token**, enter that password and confirm connection
and sharing again. The plaintext token is not returned to the panel on unlock.
There is no startup auto-connect or saved unlock password.

Encryption uses asynchronous scrypt (N=32768, r=8, p=1) and AES-256-GCM with random
salt/nonce. Authenticated metadata binds the ciphertext to origin/profile/ID.
This protects a settings file at rest, not a compromised running host; weak
passwords permit offline guessing. There is no OS-keychain API claim. Forgetting
the password cannot be reversed: explicitly Forget saved connection, then enter
the original or newly issued token. Forget disconnects and clears connection
settings only, not session mappings. A metadata-only save retains an encrypted
token only for the same identity; changing identity discards the old envelope.

## Scope and limits

Current source contract: Agents Anywhere
`873f4ae93bb3d3fa6c30f189410f394ef57cf15e`. Authentication and ingest use the
`/api/v2/connector` HTTP endpoints; custom RPC uses its Bearer WebSocket endpoint.
There is no JSON-RPC impersonation or automatic protocol downgrade.

Every host operation rechecks the captured workspace. Equivalent native path
spellings are accepted; remote workspace switching, imported/read-only native
sessions and other project paths are excluded. Discovery pages contain at most
100 sessions. Polling synchronizes up to ten sessions per pass, scheduled three
seconds after completion. Explicit history sync reads at most ten pages of 100
messages, limited to 16,000 characters per item. Empty text-only records, tool
output, attachments and nested tool messages are omitted. `complete:false`
updates never erase unrelated older history. Previously uploaded empty records
are not automatically deleted.

Scoped identity mappings and accepted/pending operation receipts prevent replay
of delivered create/send requests. Unknown outcomes refuse automatic retry; inspect
the native session before submitting again. Bounds: 16 server/workspace scopes,
200 mappings and 1,000 receipts per scope, without unsafe automatic eviction.

Not supported: remote approvals, steering, attachments, arbitrary commands,
permission or existing-session model changes, archive, workspace switching,
fine-grained token streaming and legacy compatibility. Disabled capabilities
are reported truthfully. Legacy v0.1.7 cannot register native `pi` on its stock
server and remains disabled.

## Permissions, destinations and data

| Permission | Use |
| --- | --- |
| `ui.panel`, `ui.view` | Panel and docked entry |
| `net.fetch`, `net.websocket` | Authentication, text/status ingest, RPC and heartbeat |
| `background.service` | Explicitly started connection remains resident |
| `desktop.control` | Read/create/configure sessions, prompt, status and abort |
| `models.list` | Configured model identifiers/labels, never provider credentials |

The only shipped allowlisted hostname is **web.agents-anywhere.com**. Self-hosted
support awaits a suitable future host API; parsing a custom URL grants no network
access. URLs must have no path, query, fragment or userinfo. No wildcard grants,
raw-network bypass or remote plaintext HTTP are used.

Host redirect limitation: the inspected fetch gateway follows redirects while
retaining headers and exposes no opt-out. The plugin cannot alone prove
same-origin/TLS-only forwarding. Use trusted direct, non-redirecting endpoints;
production approval remains subject to host security verification.

`anywhereConnectionV1` stores public connection metadata and optional encrypted
token. `anywhereSessionBindingsV1` stores scoped IDs, hashes and operation receipts.
Passwords, plaintext tokens, pasted commands and transcripts are not persisted.
Logs are bounded and memory-only; diagnostic reports omit credentials, Connector
IDs, workspace names and transcript text. Original host/remote errors are not
forwarded. For `workspace_changed`, reconnect with fresh consent; for uncertain
send outcomes, inspect Pi locally first.

## Verification and release review

From the repository root: `node --test tests/agents-anywhere*.test.mjs`.
Tests cover real crypto, mocked-host full chat/persistence, negative paths,
renderer interaction, and loopback transport. They are not production credential
or installed-host acceptance tests. See `docs/agents-anywhere-release-2.0.0.md`
for this version's results, artifact hash, source/package review and publication
status; older protocol evidence remains in the historical review documents.

Risk tier: **High**. Two independent human maintainer approvals and complete
source/package review are required before publication. Automated checks and the
removal of a prerelease label do not replace these approvals.
