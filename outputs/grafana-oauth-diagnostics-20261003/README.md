# OAuth callback diagnosis — 3 October 2026

**Authentication is unresolved.** The production callback returned generic 500s
at 07:47:19 and 07:49:15 UTC. The original handler discarded the exception and
logged only `request_failed`/500. [Bounded observations](failure-observations.json)
contain only timestamp, revision, fixed event and status—no request logs, raw
URLs, codes, cookies, tokens or private owner identifiers.

A fresh synthetic live authorization session reached Google's sign-in host with
normal TLS; that Google redirect was not followed. The actual Google library's
authorization-start function also passed locally. A synthetic complete provider
flow with all advertised OIDC/MCP scopes passed. These narrow the remaining fault
to processing the real response or finishing the provider interaction, but do
not identify its exact exception. The parent's unsupported-protocol browser
navigation has not been established as the same failure.

## Diagnostic-only deployment

The tested change adds fixed phase and allowlisted error-category events only.
Google exchange/verification failures return safe stage-specific 502 responses.
Exception text, response bodies, token material and URLs are never logged.
Identity, issuer/audience/nonce, signed interaction-cookie, single-use state,
PKCE, grant and callback restrictions are unchanged. Authentication is not claimed
fixed by this deployment.

- Application source pin: `93f07ae1` on the existing task branch/PR.
- Ready serving revision: **`mw-grafana-events-00004-cff`, 100% traffic**.
- Image: `sha256:6856cbfa15e5ec46d6c13dcfe0e66e4945a320ef82a9b1d9d380f1590a8ea27e`.
- The image is the only runtime template spec difference. Existing exact private
  owner pins were checked without publishing the subject. Owner remains enabled,
  five secret mounts remain version 1, callbacks deny all subscriptions,
  Scheduler remains absent and Grafana is untouched.
- TypeScript build and **19/19 affected OAuth/app/security tests passed**, including
  secret-sentinel non-disclosure, upstream rejection, verification failure,
  datastore failure categorization and the full advertised-scope flow.
- **13/13 public HTTPS checks passed** after the traffic switch. These check
  discovery, initiation and rejection guards, not Google consent or token exchange.
- [Before](before.json), [staged](staged.json), [final](after.json),
  [image](image.json), [HTTPS checks](https-acceptance.json).

For application rollback, route back to prior owner-enabled revision
`mw-grafana-events-00003-rdr`. For disabled-owner containment, the retained Ready
revision is `mw-grafana-events-00002-nrg`. Use the existing guarded adapter and
`run services update-traffic` with the selected exact revision at 100%.

The parent can now retry the existing private cloud plugin's secure Connect
flow. Read only fixed `oauth_*` event labels and status from stdout around that
retry. An exchange `invalid_client`, exchange `invalid_grant`, verification,
datastore or provider-interaction category will determine the next correction;
do not guess or rotate credentials based on the historical generic 500 alone.

## Cloud plugin source

The [existing package source](../grafana-owner-activation-20261003/mw-grafana-events/)
is reconciled to the parent's verified 0.1.1 cloud release and required app ID.
Both portable/legacy manifests retain the listing metadata/default prompt, point
to `.app.json`, and remove raw MCP connections. The source-only archive contains
all six files, including hidden compatibility files. No account plugin was
created or changed by this executor. Cloud listing readiness does not establish
successful authentication. R050 remains Open and event delivery remains inactive.
