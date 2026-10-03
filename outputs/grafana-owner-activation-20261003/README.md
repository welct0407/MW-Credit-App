# Owner-only authentication activation — 3 October 2026

The owner approved this authentication/private-connection stage at 06:26 UTC.
The parent separately supplied successful human-owner organization sink reads:
three sinks, only one aggregated `includeChildren` sink, filtered to Cloud Audit
logs rather than ordinary Cloud Run request logs. The project is directly under
the organization without folders; its OAuth request-log exclusion was previously
verified. These organization findings are **parent-supplied evidence**, not a new
organization read by this executor. The fixed service-account organization
permission denial remains an accurate historical result.

## Actual activation and verification

- Revision `mw-grafana-events-00003-rdr` is Ready and serves **100% traffic** at
  the canonical `https://alerts.mw-credit.com` origin. The supported fixed-account
  adapter resumed with its expected inherited SDK configuration.
- The only runtime template spec change is **`OWNER_ENABLED=false` to `true`**.
  Existing exact Google owner subject/email were privately compared; the subject
  is redacted from artifacts. The source continues to verify Google's signed ID
  token, exact audience/issuer/time, owner subject/email, verified email and nonce.
- Image remains the reviewed immutable digest
  `sha256:a6cc1bb7bec5fe088f6da3ea30e38f74657be15f8c4a2e72d0a242e63267c9e6`.
  Five dedicated secret mounts remain pinned to version **1**. No secret payload
  or access token was read or output.
- Empty callback hosts continue to deny all event subscriptions. Scheduler
  `mw-grafana-dispatch` remains absent; Grafana routing was not changed.
- [Before](before.json), [staged revision](staged.json), [final readback](after.json)
  and [sanitized summary](activation-summary.json) preserve the checks.
- [HTTPS acceptance](https-acceptance.json) passed **13/13**, using normal TLS:
  health, canonical discovery, unauthenticated MCP challenge, missing-code token
  rejection, invalid callback/session/method guards, valid authorization
  initiation, unsigned Grafana/unauthenticated dispatch and absent registration.
  No redirects were followed or cookies retained/sent. The valid initiation
  created one synthetic unauthenticated interaction for normal expiry/TTL cleanup;
  no Google login, consent, OAuth grant, access token or subscription was created.

The disabled-owner application revision `mw-grafana-events-00002-nrg` remains
Ready. For the scoped rollback, route traffic back using the existing adapter:

```sh
/workspace/.setup/cloud-gcloud gcloud -- run services update-traffic mw-grafana-events --region=asia-southeast1 --to-revisions=mw-grafana-events-00002-nrg=100
```

## Private plugin package for parent upload

[mw-grafana-events.zip](mw-grafana-events.zip) contains exactly:

```text
mw-grafana-events/README.md
mw-grafana-events/mcp.json
mw-grafana-events/plugin.json
```

[Package verification](plugin-package-verification.json) records archive size,
SHA-256, entries and successful validation against the official Agent Plugins
1.0 manifest/MCP schemas. [Manifest source](mw-grafana-events/plugin.json) uses the
private listing **MW Grafana Events**. [MCP source](mw-grafana-events/mcp.json)
declares only the verified `streamable-http` endpoint
`https://alerts.mw-credit.com/mcp`; it contains no authentication headers, app IDs,
secrets, owner identifiers or guessed callback destinations.

The parent must retrieve the published source/archive into **its own workspace**
before private upload. The child task's temporary path is not a shared path.
If rebuilding from source, ZIP the single `mw-grafana-events/` directory with
these three files. Upload through the supported private-plugin account flow
using the parent's actual local archive path. Then let the owner complete Google
consent in the host's secure connection flow. No account plugin was created by
this executor; no placeholder or duplicate plugin was created.

Authenticated live MCP discovery and read-only tool acceptance remain pending
that consent. Tool names `get_bridge_health` and `get_alert_event` were checked
against the source, not discovered using a live grant. Host callback metadata,
subscription/delivery checks and Scheduler/Grafana activation remain a separate
stage. No event callback is guessed or permitted here. R050 remains Open and
PR 3 remains draft.
