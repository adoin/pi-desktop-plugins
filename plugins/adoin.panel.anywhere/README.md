# Agents Anywhere

Plugin ID: **adoin.panel.anywhere**. Version: **2.2.1**.

Connect the selected Pi Desktop workspace or saved projects to the current Agents Anywhere
Connector protocol. Discover sessions, create/send messages, synchronize text
replies and status, interrupt turns, and reconnect with durable request dedup.
Supports official Cloud and compatible self-hosted HTTPS origins. Publication
approval remains separate from the version label; legacy support is unchanged.

## Sharing scope

In Connections, choose **Current workspace** or **Selected projects**. Loading
projects does not enable sharing; choosing a project or Select all automatically
sets Selected projects scope. There is no separate batch-enable checkbox. Review
the scope, confirm connection and session sharing, then connect/apply the changes.
One confirmation covers the selected project set; no manual project creation is needed for
projects that already contain real Pi sessions. Pi's saved-project inventory is
read locally through `project/list`, not by scanning directories.

The panel shows at most 200 projects and permits 1–32 selected roots. Saved choices
are scoped to server/profile/Connector ID and pin both project ID and path. Opening
a panel with saved connection metadata automatically reloads the local inventory
and restores matching choices; new/moved projects stay unselected. Loading the
list does not connect, export sessions or grant consent. Selection changes take
effect only on reconnect; Disconnect revokes current sharing immediately.

Anywhere creates and associates projects from real `session.meta.upsert` records
and their `cwd`. Empty projects cannot be independently registered using the
Connector protocol: they appear after a real eligible session exists. No blank
session is created just to populate the project list. Remote project names may
be derived from directories rather than Pi's display labels.

Each selected root has its own bridge, mappings and deduplication receipts.
Batch mode continues when you switch the active Pi workspace, but validates that
each selected saved project still has its approved path before host operations.
Unselected roots and readonly/native imports remain inaccessible. With multiple
projects, creating a remote session requires a selected project cwd; an omitted
or unrelated directory is refused. Moving an already bound session between
selected projects is refused before conflicting mappings can be saved; review
and narrow the selection locally rather than automatically migrating history.

Polling visits up to four selected roots per pass (ten sessions per root), rotating
through the set. Initial project visibility may therefore take several polling
passes. Deselecting projects never deletes already uploaded remote history or
aborts accepted turns. Without batch mode, the existing current-workspace-only
behavior remains unchanged. Choices persist in `anywhereProjectSelectionV1` (up
to 16 server/Connector scopes); no token or transcript is stored in this setting.

## Runtime setup and readiness

The banner above all three tabs separates device connectivity from Runtime setup
and actual synchronization. An online device with no running instance still needs
one action in Anywhere: open the device, find Pi Desktop under Available to add,
add it, save the empty configuration and enable it. If already configured but
stopped, enable the existing instance rather than creating another. A configured
active instance is normally restored by the server after reconnect.

The plugin cannot create this instance using Connector credentials: upstream
`POST /connectors/{connector_id}/runtimes` depends on `current_user_id` and
`verify_user_access_token`, requiring a logged-in Anywhere user. No browser
cookies, user login tokens or credential impersonation are used by this plugin.
Automatic first-time provisioning would require an explicitly supported server
onboarding API or a separately authorized user-login flow; neither is added here.

The banner also distinguishes connection-only mode, sharing not ready, waiting
for first synchronization and active synchronization. A socket opening never
implies that projects have appeared on the remote client. Changing the selected
scope still requires reconnect/apply; disconnect to revoke sharing immediately.

## Self-hosted setup (2.1.0)

Upgrade PI-Desktop to **0.18.0 or later**, install this update over the existing
`adoin.panel.anywhere`, and approve the new **net.anyHost** permission in the host.
For a dev plugin, reload/re-authorize it rather than relying on hot reload for a
new permission. This host permission allows arbitrary hosts at install time;
there is no per-domain host prompt. The plugin still requires local confirmation
of the exact server you enter, plus separate workspace-sharing consent.

In Connections, enter the direct origin, for example `https://anywhere.example`
or `https://anywhere.example:8443`, and credentials issued by that server. Do not
append `/api/v2`, a reverse-proxy prefix, query or fragment. The same current
Connector protocol and `/api/v2/connector/{auth,ws,ingest}` endpoints must be
available. A custom hostname is not automatic compatibility with older servers.
Remote plaintext HTTP is rejected; HTTP loopback is for isolated development
only. Use a valid trusted TLS certificate; the plugin never disables TLS checks.

All authentication, token refresh and text/state upload requests specify
`redirect: "error"`. Before sending, the plugin requires `error` in
`pi.net.getCapabilities().fetchRedirectModes`; missing/failed capability checks
stop without network I/O. Server 3xx responses are terminal, not retried or
followed. Configure the reverse proxy to serve these endpoints directly and
support WebSocket upgrade on the chosen origin. No endpoint discovery probes
send credentials to other servers. Redirect errors are recorded as fixed codes,
never Location headers or response bodies.

Saved encrypted tokens and session mappings stay bound to the selected origin
(including port). Changing server requires its own credentials; an old saved
token cannot be unlocked for a different origin. One connection profile is
saved at a time. Upgrade preserves existing settings and tab choice; do not
uninstall first or delete the existing Anywhere device unnecessarily.

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

Use PI-Desktop 0.18.0+ with the declared APIs and explicitly grant its permissions.
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

Every host operation rechecks the captured workspace or explicitly selected saved
project. Equivalent native path spellings are accepted; unapproved roots, imported/read-only native
sessions and other project paths are excluded. Discovery pages contain at most
100 sessions. Current-workspace polling synchronizes up to ten sessions per pass, scheduled three
seconds after completion. Explicit history sync reads at most ten pages of 100
messages, limited to 16,000 characters per item. Empty text-only records, tool
output, attachments and nested tool messages are omitted. `complete:false`
updates never erase unrelated older history. Previously uploaded empty records
are not automatically deleted.

Scoped identity mappings and accepted/pending operation receipts prevent replay
of delivered create/send requests. Unknown outcomes refuse automatic retry; inspect
the native session before submitting again. Bounds: 64 server/workspace scopes,
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
| `net.anyHost` | Host-authorized access to user-confirmed self-hosted origins |
| `background.service` | Explicitly started connection remains resident |
| `desktop.control` | Read/create/configure sessions, prompt, status and abort |
| `models.list` | Configured model identifiers/labels, never provider credentials |

The default and explicitly listed hostname remains **web.agents-anywhere.com**.
The added, user-approved `net.anyHost` grant permits custom destinations through
the official host gateway. The host retains its cloud-metadata restrictions.
URLs must have no path, query, fragment or userinfo. No wildcard manifest entry,
raw-network bypass or remote plaintext HTTP is used.

The former redirect blocker is addressed by the host's released 0.18.0 fetch
policy and mandatory capability checks, not by trusting unknown fetch options.
HTTP requests never follow redirects, even on the same origin. WebSocket uses
the host broker, whose inspected implementation does not follow redirects.

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
or installed-host acceptance tests. See `docs/agents-anywhere-release-2.2.1.md`
for this version's results, artifact hash, source/package review and publication
status; older protocol evidence remains in the historical review documents.

Risk tier: **High**. Two independent human maintainer approvals and complete
source/package review are required before publication. Automated checks and the
removal of a prerelease label do not replace these approvals.
