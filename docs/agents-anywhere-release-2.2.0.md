# Agents Anywhere 2.2.0 — batch project sharing

Plugin: `adoin.panel.anywhere`, feature branch `feat/pi-agents-anywhere-v2`.
Package: `packages/adoin.panel.anywhere-2.2.0.piplug`.

## Behavior and protocol evidence

Connections now offers a locally loaded saved-project list, individual selection,
select-all and clear, plus an explicit batch-mode checkbox. Selection is persisted
per profile/server origin/Connector ID. Reopening a panel with saved connection
metadata reloads the local inventory and restores only matching IDs and paths.
New/moved projects are not selected automatically. Connection and sharing consent
are never restored automatically, and there is no startup auto-connect.

Pi v0.18.0 (`0c0902b25f0cc22a00fabbf98dee35f499f149cf`) exposes `project/list`
through desktop.control. `ipc/workspace-ipc.ts` forwards it to `projects.list`;
shared `ProjectRecord` is numeric id, path, name and local metadata. The plugin
returns only stringified id, path and name to its own panel; no directory scan.

Anywhere automatically creates/associates projects from real session cwd in
`session.meta.upsert` -> `upsert_connector_session` ->
`_ensure_project_for_workspace`. Verified in the pinned protocol baseline
`873f4ae93bb3d3fa6c30f189410f394ef57cf15e` and current upstream
`bef37b420c91c9b8d101e00684e3b8574d99db5e`, in
`server/agent_server/services/connector_notifications.py` and
`infra/repositories/{sessions,projects}.py`. There is no independent Connector
project-registration operation for an empty project. The plugin does not invent
sessions or use user-only management endpoints; empty projects appear only once
a real eligible session exists. Server project labels may be derived from paths.

## Data flow and permissions

Risk: **High**, unchanged permission set from 2.1.0. This expands sharing scope
only through a separate local opt-in and explicit selected project set.

| Entry | Data / action | Boundary |
| --- | --- | --- |
| anywhere.projects | Local saved project inventory to owning panel | desktop.control project/list; no server request or session export |
| Confirmed Connect | Selected project IDs resolved to fresh paths | Prior displayed inventory must match live id/path; 1–32 unique roots |
| Each project bridge | Read/create/prompt/abort sessions | Before/after host operations verify selected project still exists at approved path; native/readonly exclusion unchanged |
| Project router | Shared runtime, separate root stores | Bound AA identity wins; external ID cannot override; create cwd must identify an approved root |
| Ingest | Selected roots' paths, titles and user/assistant text | Existing explicit sharing, safe redirect:error fetch and encrypted origin-bound credentials |
| Saved choices | id/path snapshots under anywhereProjectSelectionV1 | Up to 16 connection scopes; no tokens/transcripts; new inventory entries never automatically included |
| Unload/disconnect | Revoke sharing, fence queued pre-mutation writes | Delivered host operations cannot be undone; accepted-operation receipts intentionally retained |

The existing single-current-workspace mode is unchanged. Batch mode does not
require the selected project to be the currently open workspace; this behavior
is explicitly disclosed in the install notes. Selection changes apply on
reconnect. Disconnect stops active sharing immediately, not accepted agent turns.
Deselecting a project does not erase already uploaded remote history.

The panel lists at most 200 projects; selecting all when over 32 fails visibly
rather than silently choosing a subset. Polling visits up to four roots per pass,
ten sessions per root, round robin. Session store capacity increases from 16 to
64 root/server scopes without changing its format or evicting receipts. Each
root retains the previous 200 binding / 1,000 receipt limits. Discovery responses
remain paged at 100 sessions globally.

## Review fixes

Read SECURITY.md and inspected the source/data-flow changes and packed artifact.
One bounded independent agent review found four actionable issues, all fixed:

- Unbound session reads could race to bind one AA ID in two projects: serialize
  binding-producing requests and recheck cross-root identities inside the shared
  persistence queue. A create/discover race also has coverage.
- Queued pre-mutation binding writes could persist after stop: guards run when
  the queue starts and after reading settings, before writing. Post-mutation
  outcome receipts remain durable to prevent duplicate execution.
- Selection save could write after a cancelled connection: pass the connection
  generation guard into the save operation across its settings read.
- A session moved between approved roots could create conflicting bindings:
  refuse the new binding before persistence and request local selection review.
  Automatic history migration is not attempted.

Repeated runtime starts are idempotent. Two independent human maintainer approvals
are still required for public release; agent review is not approval. No remote
push or marketplace submission was requested/performed in this task.

## Verification and artifact

- Targeted plugin tests plus panel chrome: **193/193 passed**.
- Full repository tests: **365/371 passed**; the same six baseline Windows
  gitlens/terminal failures remain unrelated and unchanged.
- Project tests exercise persisted origin-scoped choices, added/moved/removed
  projects, invalid selection, global discovery pagination, correct cwd upload,
  send/reply/interrupt/create/dedup, unselected-session rejection, active-workspace
  independence, empty projects, cancellation, concurrent bindings and local panel
  inventory/connect/reload. Existing single-workspace and self-host tests pass.
- Panel tests cover selection controls, limits, payloads, fresh consent,
  identity-change invalidation, privacy, pagehide and automatic restore.
- BrowserPreview with two synthetic projects: both selected after Select all,
  count 2/2, both consent boxes unchecked, no horizontal overflow at 360px. No
  real user project paths or credentials were used in that preview.
- JavaScript syntax and whitespace checks passed. PluginCheck passed (21 files).
- Scoped security audit: **0 blockers, 16 manual-review signals**. Full package
  audit: **342 pre-existing other-package blockers**, none for this plugin.
- Artifact: **21 source-identical store-only files, 185,847 bytes**.
  SHA-256: `87273ea0a07251dd648d5fcecb5b7cc172675dada17754df9b7be8daf422beda`.
  Exact entry set, no symlink/path traversal, manifest and all source bytes were
  verified. Catalog rebuilt (26 entries) with matching size/hash and unrelated
  entries unchanged. Temporary pack output was removed after copying the package.

Install over 2.1.0, load projects, select the desired roots, enable batch mode,
confirm sharing and reconnect. Wait for the polling passes or refresh Anywhere's
session inventory. Real server acceptance remains for the user's environment;
passing synthetic tests is not represented as an installed-host integration run.
