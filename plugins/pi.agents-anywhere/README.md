# Agents Anywhere — connection preview

Version: **2.0.0-alpha.4**. Development-only Phase 2 checkpoint, not a full remote
chat release. Cloud/device visibility has **not** been verified with real
credentials. Do not interpret the alpha package or passing tests as release
approval.

The alpha.4 parser runs entirely in the panel using the same pure input module
as the backend. Parsing works without a host bridge, during a stalled status
request, and for syntactically valid self-hosted origins. It never executes the
command or makes a connection. Copy only the command, not commentary appended
to the token. Successful extraction clears the pasted command and resets consent.
Connection still requires an available backend, explicit consent and the exact
manifest-domain grant; successful parsing is not network authorization.

The alpha.3 diagnostic update makes failures before networking visible. Open
Connection events, choose **Generate diagnostic report**, then copy the selected
report with Ctrl+C. It works even if the panel cannot contact the plugin process.
The report includes panel/backend versions, bridge availability and bounded
sanitized events, but no connector ID, token or pasted command. Logs remain in
memory only and are lost when the corresponding panel/plugin is closed/reloaded.

`panel_ready` confirms the script ran; `bridge_failure` identifies a missing,
denied or timed-out host call; `connect_received` confirms the backend received
Connect; `configuration_rejected` means no network request was attempted.
Transport details distinguish `AUTH`, `WS_CONNECT`, `WS_EVENT`, `RPC_SEND` and
`HEARTBEAT` stages with fixed categories such as DNS_FAILURE, TLS_FAILURE and
TIMEOUT. These are diagnostic classifications, not a proven root cause. A bridge
timeout does not cancel a host operation already delivered: inspect status and
avoid repeatedly submitting Connect. No mutation is retried by the panel.

If the event list remains at the bilingual "Panel initializing" placeholder,
the script has not initialized; reload the plugin and check host loading errors.

The alpha.2 visual refresh adds coordinated teal light/dark palettes, semantic
status colors, responsive cards, keyboard focus styling and reduced-motion
support. English/Chinese behavior, protocol scope and permissions are unchanged.

## Implemented scope

- Default current protocol pinned to official Agents Anywhere commit
  `873f4ae93bb3d3fa6c30f189410f394ef57cf15e`: `/api/v2/connector/auth`,
  Bearer WebSocket `/api/v2/connector/ws`, custom request/response/notification
  envelopes (not JSON-RPC 2.0), 20-second heartbeats and bounded retry.
- Runtime discovery, configuration schema/validation, start/stop and truthful
  disabled session/tool capabilities. This starts an adapter, not a Pi task.
- Bilingual panel and docked work-panel view. Paste a mobile CLI command or enter
  fields manually; pasted text is parsed, never executed.
- Explicit consent, memory-only credentials, no automatic connection on load,
  sanitized diagnostics, and cleanup on disconnect/unload.

Not implemented: existing-session discovery, create/send/interrupt, transcript
sync/ingest, streaming, remote approvals, archive and workspace switching. There
is no `desktop.control` permission and no session/file access in this preview.

## Current versus legacy

The selector defaults to **Current**. **Legacy v0.1.7** is visible but disabled:
its stock Server restricts runtime names to codex, claude, opencode and acp, so it
cannot accept native `pi` session identity. Its initial capabilities report and
lifecycle are also different; removing `/api/v2` is not sufficient.

Historical baseline: official tag `v0.1.7`, commit
`2f7cce16d6e14ea6d89279a2a74aee0b73d6ab48` (Connector metadata `0.1.7.2`).
No runtime impersonation or automatic fallback is implemented. An incompatible
Server gets a diagnostic, not a silent downgrade. Enabling Legacy requires a
separately reviewed compatible identity/server-extension design and historical
end-to-end tests. This is not yet dual-protocol compatibility.

## Local testing

Use a compatible PI-Desktop host (source baseline version 0.15.9; runtime API
availability is checked). After changing manifest permissions, explicitly reload
and approve the development plugin in **Plugins**. No permission is self-granted.

Open **Agents Anywhere: Connection Settings** or the docked view. Paste the
mobile command, parse, review the origin and connector identity, then check the
connection consent and choose Connect. Never put real tokens in issues, chat
logs, screenshots or source files. The panel clears command/token fields after
accepted connection; reconnect credentials remain in plugin memory until
Disconnect, terminal auth/protocol failure or unload. Restart requires entering
the credentials again. Closing the panel does not disconnect the explicitly
started background connection.

The state `Online (discovery answered)` means the Connector socket is open and a
valid runtime discovery request has been answered. It does not prove that the
phone received it or that chat works. Runtime discovered and runtime running are
separate facts. Check device and runtime visibility from the actual mobile/Web
client during acceptance. Do not run another Connector with the same identity.

## Cloud and self-hosted

Default origin: `https://web.agents-anywhere.com`. Supply an explicit origin,
without `/api/v2`, other path, query, fragment or userinfo. No HTTPS downgrade.

The shipped manifest declares only `web.agents-anywhere.com`. A self-hosted dev
installation requires replacing the declared hostname with the chosen exact host
and explicitly reloading/re-authorizing the plugin. Do not add `*` or broad
wildcards; the plugin requires exact hostname matching even if the manifest is
edited. Plain HTTP is accepted only for localhost/127.0.0.1/[::1] development.
Non-loopback self-hosted servers require HTTPS. Endpoints follow the selected
profile and origin; arbitrary reverse-proxy subpaths are not supported.

**Host redirect limitation:** the inspected `pi.net.fetch` API follows redirects
and does not expose a no-redirect control. Its gateway checks declared hosts but
reuses headers. This plugin cannot promise same-origin/TLS-only credential
forwarding after a server redirect. Use a trusted, direct, non-redirecting auth
endpoint. Verify/fix the host's origin-and-scheme credential handling before a
production release, especially with multiple domains. Do not bypass this via raw
Node networking.

## Diagnostics

Authentication failure stops retry; wrong endpoint/shape becomes protocol
incompatible. Transient network/5xx/429 failure schedules capped backoff with
jitter. Duplicate connector ownership stops retry so two owners do not fight.
Disconnect removes listeners/timers and fences late requests/socket handles.

Status retains up to 80 sanitized events: selected protocol baseline, auth/WS
endpoint, HTTP status, known RPC method/result, retry delay and WS close code.
Remote error bodies/reasons, Authorization headers, auth responses, pasted
commands and arbitrary method names are never displayed or logged. The panel
shows only recognized bounded diagnostic details. Logs are memory-only.

## Migration from 1.0.3

This alpha is **not** a feature-complete upgrade. Back up non-secret connection
settings manually if needed, disable the old plugin/Connector and install/load
the new dev plugin only for testing. Re-enter credentials locally; no automatic
migration reads old plain storage or token files. The old `/connector/v2/rpc`,
JSON-RPC 2.0 frames and fake capabilities are not reused. There are no session
mapping migrations yet because this preview does not export sessions.

## Verification and release gates

Run `node --test tests/agents-anywhere.test.mjs` from the marketplace root.
See `docs/agents-anywhere-protocol-notes.md` and
`docs/agents-anywhere-phase2-review.md` there for source evidence, test results,
security review and remaining blockers. This plugin is high risk because it uses
network credentials and a background connection; two independent maintainer
approvals plus complete source/package review are required before publication.
No approval, Cloud test, legacy success or host permission grant is implied by
this README.
