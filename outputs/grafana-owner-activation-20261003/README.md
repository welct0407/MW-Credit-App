# Owner-only authentication activation — 3 October 2026

**Current follow-up:** owner sign-in fails in the real callback flow. [Diagnostic revision 00004-cff](../grafana-oauth-diagnostics-20261003/README.md) is serving; authentication is not yet fixed. The package below is reconciled to the parent-verified 0.1.1 cloud binding.

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

## Private cloud plugin source reconciliation

The parent verified the existing private app registration and plugin release
`pluginrel_6ac0b48291e8819199551306c78a187f` (0.1.1). The required app binding is
`asdk_app_6ac0b2c350fc8191b08fbc67fca9696e`; plugin identity is unchanged.
Raw portable MCP configuration previously supplied a desktop-only connection.
The revised [source](mw-grafana-events/) and [archive](mw-grafana-events.zip) now
match the parent-approved cloud binding, preserving all listing metadata and
the default prompt. This executor did not change the account plugin.

The archive contains `.app.json`, `.mcp.json`, `.codex-plugin/plugin.json`,
`plugin.json`, `mcp.json` and `README.md` under one `mw-grafana-events/` directory.
Both MCP configurations have empty `mcpServers`; both manifests reference the
verified required app. See [package verification](plugin-package-verification.json)
for hashes/schema checks and [package README](mw-grafana-events/README.md) for
exact current behavior. The cloud listing/Apps 1/Connect checks are parent-supplied
evidence. Authentication and authenticated MCP acceptance remain unresolved.

Keep callback hosts empty, event subscriptions denied, Scheduler absent and
Grafana unchanged. R050 remains Open; PR 3 remains draft.
