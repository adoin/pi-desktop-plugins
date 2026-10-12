# Agents Anywhere 2.2.2 — preserve scope on project refresh

Plugin: `adoin.panel.anywhere`; branch `feat/pi-agents-anywhere-v2`.

## Fix

Manual inventory loading previously called invalidateProjects and then applied
the saved useProjects flag, overwriting the user's current radio selection.
Separate initial saved-state restoration from a manual refresh. A manual refresh
preserves the chosen scope, and retains draft selections only when both ID and
path still match. New/moved/removed roots are not implicitly selected; a cleared
selection stays empty. The first manual inventory may restore valid saved IDs,
but never overwrites the chosen scope. Failed refresh clears unverified inventory
and keeps the selected scope. Closed panels and changed identities reject late
results. Fresh connection/sharing confirmation is still required after loading.

No backend, permissions, storage schema, Runtime provisioning or network behavior
changed. Existing saved choices still restore on initial panel recovery. Reviewed
the complete renderer diff and packed files against source; the change stores no
new data and introduces no dependencies. Existing High-risk publication review
requirements and two human maintainer approvals remain pending; no push or
marketplace submission was performed.

## Verification

- Panel tests: 36 passed, including new draft-scope/surviving-selection and failed
  refresh regressions; saved initial restoration tests remain passing.
- Targeted plugin plus panel-chrome tests: **198/198 passed**.
- Full repository tests: **370/376 passed**, six existing Windows gitlens/terminal
  failures remain. Scoped security preflight: **0 blockers, 16 review signals**.
- Full package audit: **342 existing other-package blockers**, none for this
  plugin. These repository-wide release gates are not waived.
- Renderer syntax and diff whitespace checks passed. PluginCheck passed.
- Package `packages/adoin.panel.anywhere-2.2.2.piplug`: **21 store-only entries,
  194,625 bytes**, SHA-256
  `9f4e36056e6d225ded397114a90437333a1bc8df73044ac89dc504a74b400c3e`.
- Verified exact entry set, source bytes, manifest, no symlink/path traversal and
  matching catalog hash/size. All backend modules match the prior commit;
  unrelated catalog entries are unchanged. No live server or installed-host
  acceptance run is claimed.

Install over the existing plugin without uninstalling. Choose Selected projects,
load/refresh the inventory, and verify the scope stays selected. Existing
credentials, tabs and saved server-specific project choices remain compatible.
