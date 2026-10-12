# Agents Anywhere 2.2.1 — sharing scope and runtime guidance

Plugin: `adoin.panel.anywhere`. Branch: `feat/pi-agents-anywhere-v2`.
Package: `packages/adoin.panel.anywhere-2.2.1.piplug`.

## Changes

Replace the visible batch checkbox with an explicit Current workspace / Selected
saved projects radio choice. Selecting an individual project or Select all sets
the project scope automatically, but never grants connection or sharing consent.
Current-workspace mode labels the saved selection as inactive and excludes its
IDs from the connect payload. A hidden legacy useProjects input is retained only
as renderer state for the unchanged boolean backend contract. Identity edits,
password clearing, selection restoration and pagehide cleanup remain intact.

Reorder the form into credentials, scope, sharing consent and connection consent.
Use a neutral sharing disclosure referring to the chosen scope rather than
incorrectly saying current workspace in batch mode. The connect action now says
Connect / apply sharing and explains that changes need reconnect to take effect.

A readiness banner outside all tab panels distinguishes offline, network failure,
online with no running runtime, connection-only mode, sharing not ready, awaiting
first status synchronization and active status synchronization. A running socket
or completed local sync does not claim the remote project's visibility/count.
Navigation buttons switch local tabs only; no new external-link permission.

## Can the runtime be created automatically?

Not with the existing Connector credential. Upstream Agents Anywhere source
`bef37b420c91c9b8d101e00684e3b8574d99db5e`:

- `server/agent_server/api/connector_runtimes.py:130-149` exposes creation at
  `POST /connectors/{connector_id}/runtimes`, depending on `current_user_id`.
- `server/agent_server/deps.py:151-175` requires a user access token and validates
  it with `verify_user_access_token`.

The plugin has no user-login flow and does not read browser cookies or impersonate
user authorization with a Connector token. The banner directs the user to enable
an existing Pi Desktop instance, or add/save/enable one if never configured.
Normally a configured active instance is restored by the server on reconnect.
Automatic first-time creation would require a supported onboarding API or a
separately authorized user-login feature, neither included in this UI fix.

## Review and checks

Read SECURITY.md and reviewed the renderer changes, tests and packed content.
All backend files (`main.js` and `src/*.js`) are unchanged compared to 2.2.0,
verified byte-equivalent after line-ending normalization. Permissions, storage
keys, endpoints, encryption, consent requirements and the host minimum remain
unchanged. No dependencies or remote assets were introduced. Highest risk remains
High; two independent human maintainer approvals are still required for public
release. Existing full-repository release blockers are not waived.

- Targeted plugin plus panel-chrome tests: **196/196 passed**.
- Full repository: **368/374 passed**, the same six unrelated Windows gitlens
  and terminal path/helper/PATH failures.
- Panel tests cover explicit radio state, Select all/individual scope changes,
  no implicit consent, current-workspace payload ignoring retained project IDs,
  identity resets, and cross-tab runtime/start/first-sync readiness states.
- BrowserPreview with synthetic host/project data verified visible runtime setup
  guidance in Connections, two selected projects after Select all, matching radio
  scope, hidden legacy checkbox, both consent boxes unchecked, banner outside
  tab panels and no overflow at 360px. No real account/project data was used.
- Syntax checks and diff whitespace checks passed. PluginCheck passed (21 files).
- Scoped audit: **0 blockers, 16 manual-review signals**. Full package audit:
  **342 pre-existing other-package blockers**, none for this plugin.
- PluginPack artifact: **21 store-only entries, 193,743 bytes**.
  SHA-256: `8af201fbf717459eb14b580a828e4b1213dab954b5fbc7325004afe68a0f5638`.
  Exact entries, manifest, source bytes, no symlink/path traversal and catalog
  hash/size match were verified. Other catalog entries are unchanged.

Install over 2.2.0 without uninstalling. Existing saved choices and encrypted
credentials stay under the same ID. No remote push or marketplace submission
was performed for this maintenance update. Real installed-host acceptance remains
for the user's environment; source/synthetic checks are not a live server test.
