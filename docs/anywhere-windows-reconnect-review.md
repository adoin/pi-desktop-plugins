# Windows reconnect: security review notes

Status: source-only proposal for `adoin.panel.anywhere` on
`feat/pi-agents-anywhere-v2`. Not a release or maintainer approval. Version
remains 2.2.2; no catalog or distribution artifact is included.

## Capability and data flow

Highest risk: **High** (credentials, process execution, background network and
optional remote session access). Two independent maintainers must review the
source and a fresh package before release. Reviewers: not yet assigned.

| Entry | Input | Destination / capability | Consent and bounds | Cleanup |
| --- | --- | --- | --- | --- |
| Connect with local reconnect | Validated token, origin/profile/Connector ID and selected sharing scope | DPAPI CurrentUser ciphertext in plugin-private `anywhereLocalConnectionV1` via existing plugin settings API | Explicit checkbox, connection consent and separate sharing consent; local mode Windows-only; no plaintext fallback | Forget patches both connection credential keys to null; no session mappings removed |
| Local encryption/decryption | Bounded UTF-8 JSON or ciphertext | Built-in Windows PowerShell and .NET ProtectedData, anonymous Base64 stdin/stdout pipes | Fixed encoded script; no token in argv, script, logs or temporary files; 5-second timeout and bounded output | Child process exits or is killed on timeout/output overflow |
| Plugin startup | Previously opted-in encrypted credentials and scope | Existing Connector and SessionService APIs; original selected server only | Identity must match public metadata; current workspace path or exact selected project IDs/paths must still match; no newly added projects; default remains offline | Unload/service stop disconnects; shutdown preserves opt-in |
| Manual Disconnect | Existing connection | Stops network and serializes disabling of next startup restore | Explicit panel action; cancels pending setup before waiting for writes | Keeps ciphertext for optional manual local unlock |
| Status/panel | Public metadata, availability flags and fixed error codes | Local renderer | Never returns decrypted token or full saved scope | Inputs cleared by existing action/pagehide handlers |

No permissions are added. Existing permissions remain exactly:
`ui.panel`, `ui.view`, `net.fetch`, `net.websocket`, `background.service`,
`desktop.control`, `models.list`, `net.anyHost`.

Network and desktop calls still use the existing permission-gated host APIs.
This does not change Ask mode, session tool permissions, redirect refusal, TLS
verification, or the existing authentication flow. No startup task, registry
entry, operating-system service, remote code or new dependency is installed.
PowerShell is resolved from the Windows system directory; no binary is bundled.

## Threat model and limits

- DPAPI protects data at rest for the current Windows user. It does not protect
  against programs already running as that user or a compromised account.
- The encrypted payload binds token, identity and approved scope. Changing
  public identity cannot redirect a saved token to another server.
- A moved/deleted selected project or changed current workspace prevents restore.
  Connection-only approval never initializes sharing.
- Disconnect disables startup restore; ordinary host shutdown does not. A failed
  settings write is surfaced as an error rather than reporting success.
- Revocation here does not erase backups or revoke a token at its issuing server.
- Existing password-encrypted credentials remain usable on other platforms.

## Verification

Automated regression coverage includes real Windows DPAPI round trips, Unicode
paths, corruption, identity mismatch, opt-in and legacy offline defaults, exact
project scope, newly added/moved projects, changed workspaces, manual disconnect,
forget, concurrent writes, shutdown, cancellation during decrypt/save, and
password-storage compatibility. Tests use generated credentials and in-memory
settings only. A dedicated Windows CI job exercises DPAPI; non-Windows tests
verify fail-closed behavior and ordinary password/metadata connections.

Local commands:

```text
node --test tests/agents-anywhere*.test.mjs
node --test tests/*.test.mjs tests/*.test.js plugins/*/test/*.test.mjs
python -m unittest discover -s tests -p 'test_*.py' -v
python scripts/security_audit.py plugins/adoin.panel.anywhere
python scripts/security_audit.py --check-packages
```

PI PluginCheck and PluginPack were also run. The temporary store-only verification
package was inspected entry by entry against source, not committed or published.
It is not the existing distribution package. A version bump, fresh release
package, generated catalog and both maintainer approvals remain release work.

The complete repository suite has 13 unrelated failures on this Windows host;
the unchanged base reproduces all 13. Python helper tests pass (16 tests).
A clean LF checkout of the unchanged base fails package audit on two existing
Anywhere appearance adapter files. Windows CRLF checkout adds byte-mismatch
noise across other packages. Source-only targeted audit has zero blockers;
manual-review signals are not approvals. See the PR for final command results.

Real server authentication, a real PI-Desktop restart using a user token, and
maintainer source/package approval have not been established by these tests.
