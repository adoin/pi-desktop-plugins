# Agents Anywhere 2.0.0 release record

Plugin: `adoin.panel.anywhere` (renamed from `pi.agents-anywhere`).
Branch: `feat/pi-agents-anywhere-v2`.
Package: `packages/adoin.panel.anywhere-2.0.0.piplug`.

## Changes

The panel now contains Status, Connections and Events tabs. The selected tab is
restored through `adoin.panel.anywhere.activeTab.v1` in renderer localStorage.
Only `status`, `connections` or `events` can be written/read; unavailable storage
and unexpected values fall back without breaking initialization. Tablist/tab/
tabpanel semantics, exclusive visibility, roving focus and arrow/Home/End
navigation are implemented. Credentials remain outside browser storage.

Visible prerelease badges and the version suffix were removed. The manifest ID,
source directory, open command, view/service identifiers, package and catalog use
the new identity. Host view/service identifiers use permitted hyphens; the plugin
ID and command retain the requested dotted namespace. Tests pin these contracts.

All source modules under `src/` were compared against the previous committed
plugin and are unchanged. `main.js` changes only registration identifiers. The
chat, workspace guard, encryption and consent behavior is unchanged. This
release does not broaden permissions, self-hosted allowlists or protocol support.

## Migration

A changed plugin ID is a new host identity. Disable/disconnect the old plugin
before starting the new one with the same Connector ID. Keep the existing
Anywhere device and configured Pi instance. Enter credentials once under the new
identity; the plugin does not read or migrate another plugin's private settings,
encrypted connection, mapping or receipt store. A password alone cannot access
the old encrypted token through the new plugin. Review uncertain prior sends
locally before resubmission. Later releases with this ID can update in place.

Existing user deletions of older packages and the untracked task brief were
preserved, not included in this release commit. Historical review documents keep
their original version/ID evidence; this document is the current release record.

## Security and provenance

Highest risk: **High**, unchanged network, credentials, background service and
native desktop/session control capabilities. The existing capability/data-flow
review remains in `agents-anywhere-phase2-review.md`. New UI state is limited to
an allowlisted navigation preference; no external assets, new dependencies,
remote executable code, shell commands or new outbound destinations were added.

The renderer diff and exact source/package file set were inspected. Previous
protocol/encryption modules are byte-equivalent after line-ending normalization.
Native Ask confirmation, fresh sharing consent, password encryption, sanitized
logs, cancellation fencing and domain restrictions retain their tests. This is
not a claim of a new live Cloud or installed-host acceptance run; the user
reported the prior basic chat chain appeared to work.

Two independent human maintainer approvals are **not recorded**. The inspected
host fetch redirect behavior still requires security verification before a
production release. Removing a prerelease label does not waive either gate.
No operator review finding is automatically accepted on the user's behalf.

## Verification

- Targeted tests plus panel chrome: **162/162 passed**.
- Full repository tests: **334/340 passed**; remaining six are the existing
  Windows gitlens path and terminal fixture/PATH failures.
- All plugin JavaScript syntax checks and `git diff --check` passed.
- `PluginCheck` passed for 19 files. Its main-entry-only scan reports unused
  network permissions even though `src/connector.js` and `src/ingest.js` use them.
- Scoped automatic security preflight: **0 blockers, 14 manual-review signals**.
- Full package preflight: **342 existing other-package/source blockers**; none
  for `adoin.panel.anywhere`. The repository-wide publication gate is not green.
- Official marketplace i18n gate: **0 fail, 18 review**. Reviews concern the
  deliberate bilingual plain-string command title, invariant brand/title text,
  and HTML startup/fallback copy backed by `data-i18n` and dynamically extended
  English/Chinese dictionaries. Runtime translation-key tests passed; no review
  signal is represented as operator approval.
- BrowserPreview: Chinese tab labels, exactly one visible panel, Connections
  restoration after page reload, empty token/password fields after reload,
  ArrowRight focus to Events, no visible Beta text, and no horizontal overflow
  in the 360px check. A full-page status screenshot was inspected. File preview
  has no real host bridge and therefore displays unknown host status.
- Package: **19 source-identical store-only entries, 154,982 bytes**.
  SHA-256: `ca8dbf0d6359f1315bdc667b5efe82acd0db2f8a9b3a97859cd5368c2f39c1e0`.
  Verified exact entry set, manifest, no symlink/path traversal and byte equality.
- Catalog rebuilt successfully with 26 plugins, replaces the old ID and matches
  the new package hash/size. Unrelated plugin entries are unchanged.

## Remote publication preparation

The user authorized pushing this feature branch and attempting marketplace
publication. Target repository: `adoin/pi-desktop-plugins`, remote `origin`.
No main-branch update, force-push, unrelated publication or tag is authorized.
An existing pushed commit SHA will be used as sourceRef rather than inventing a tag.

The supported marketplace `https://plugins.aiuo.net/mcp` was contacted and the
official `skill.md` and tool schemas were read. Initial initialization returned
401. Official device authorization subsequently succeeded; the credential was
stored in the documented user-private token file with an owner-only Windows ACL,
never in chat, workspace, package or scratch. `list_plugins` returned no owned
plugins; `list_repositories` initially returned no bindable repositories. The
GitHub App installation page was opened for the user to authorize only the source
repository. Binding is a user action and is not self-granted.

`create_plugin` creates and releases the first version in one operation, so it
must not be used as a no-op test. A market-side package/audit dry run can be used
while repository binding or manual approval is blocked. Actual push, dry-run and
publication outcomes are recorded in the final delivery report or a follow-up
section; preparation alone is not a published release.

## Final remote outcome

Code/package commit `43ac8fb5ed461a577765f1cb492075774c4c4e22`
(`feat(adoin.panel.anywhere): rename plugin and add persistent tabs`) was pushed
successfully to `origin/feat/pi-agents-anywhere-v2`. `git ls-remote` confirmed the
same SHA. Main remains `c35605a5ed31bd4c899683d5fd0064bd632775cb`.

The user completed GitHub App authorization; a subsequent `list_repositories`
confirmed `adoin/pi-desktop-plugins` is bindable. No other repository was used.
The authenticated market-side `pack_plugin` dry run used the pushed commit as
sourceRef and all 18 non-manifest source files plus complete original manifest
fields. It reported **0 blockers, 1 REVIEW, readable=true, readyToPublish=true**.
The REVIEW is `MAN013`: `net.websocket` requires host-policy review. That
permission is necessary and was not removed to evade review.

The marketplace reconstructs/repackages the manifest: its dry-run artifact is
**155,275 bytes**, SHA-256
`c989015c7edbc73daa18f83d1c2e5c82d93176790cd7e0f2e49788684cebb3b2`.
Decoded only in memory for inspection, every non-manifest file matches source
bytes and every manifest field matches the local manifest, with no added fields.
It is a separate serialization from the locally verified PluginPack artifact;
the local package/catalog hash above was not overwritten or misrepresented.

No `create_plugin` or `submit_version` mutation was invoked: those can release a
public version, while the repository's two independent maintainer approvals,
host redirect verification and global release gate remain unmet. The marketplace
technical readiness flag does not satisfy those policy requirements. No review
finding was accepted automatically. **The plugin is not published to the market**;
authentication, repository binding, pushed source and market preflight are ready
for a maintainer-approved release. No duplicate or waiting version was submitted.
