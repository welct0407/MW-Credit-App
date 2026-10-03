# Contained Grafana bridge application deployment — 3 October 2026

Owner approval at 04:38:18 UTC authorized application deployment on the existing service, with owner access disabled and callback delivery denied. The subsequent recovery handoff explicitly authorized the traffic switch and inert rollback if acceptance failed. **Application runtime/metadata acceptance passed; real OAuth, host connection and end-to-end alerts remain inactive/unverified.** R050 remains Open.

## Actual deployment and recovery

Project `clever-oasis-508610-n7` (`737787224638`), region `asia-southeast1`, existing service `mw-grafana-events`, canonical origin `https://alerts.mw-credit.com`.

- Application source/dependencies are unchanged from `70c05ab8949da1d49e027ef8efffd6d29cf4c324`. Published build/test corrections are at `49efd3345657f0fcd4057c469f4661ee2251b423` on the existing `feat/grafana-mcp-events` / draft PR 3.
- Immutable image: `asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-monitoring/grafana-mcp-bridge@sha256:a6cc1bb7bec5fe088f6da3ea30e38f74657be15f8c4a2e72d0a242e63267c9e6` ([registry pin](image.json)). Digest resolved through Artifact Registry tag metadata; no Container Analysis/provenance claim.
- Revision `mw-grafana-events-00002-nrg` is Ready and serves **100% traffic**; all readiness conditions became True at approximately **04:57:38 UTC**. [Final sanitized service readback](service-final.json).
- Rollback revision `mw-grafana-events-00001-rnj` is retained with its original inert image `sha256:ac81052e56736854c7c3c937031db309c78d3f1da7fd58ceb3318c294bfa0154`. [Retained revision](rollback-retained.json).
- `OWNER_ENABLED=false`; `CALLBACK_HOSTS` has an empty/unset value, interpreted by the source as `[]` and deny-all. Only the five dedicated secrets are mounted, each pinned to version **1**. [Mount readback](mounted-secrets.json). No agent accessed or printed payloads. Successful application startup demonstrates its configuration/provider accepted the mounted data; it does not prove future Google login or HMAC interoperability.
- Approved runtime identity, public ingress/application authentication, 1 CPU/512 MiB, concurrency 20, timeout 300 seconds, min 0/max 2 remain in place. Existing service-level max 5 is also preserved. [Before](service-before.json) / [after](service-final.json).

The first build stalled and was stopped at its dependency-install boundary. Passing standard proxy arguments alone still failed. The successful supported-adapter build mapped the existing proxy hostname to its host-resolved address and supplied the existing public environment trust certificate through an optional BuildKit mount. This mount applies only to dependency installation; it is absent from image layers/runtime trust. TLS verification remained enabled. No saved network policy, daemon settings or environment startup files were changed.

The initial **no-traffic** deploy completed but its script then failed parsing adapter-redacted full-service JSON containing secret-volume metadata. No traffic mutation followed that failure. Narrow reads reconciled staged revision `00002-nrg`; recovery switched traffic to that same revision without rebuilding or redeploying. No duplicate application revision was created. No acceptance failure required rollback.

## Verification and provenance

[Exact correction-pin CI](https://github.com/welct0407/AppSheet-Loan-Project/actions/runs/37097977073) passed Linux and Windows: bootstrap/seeding/helper mocks, application/security tests, dependency audit, pinned container builds and packaged offline runtime tests. A Windows failure at original pin `70c05ab` was the human helper test running against an unmocked Windows platform. The test now mocks Linux and separately proves non-Linux rejection before credential commands; the live Linux-only guard is unchanged. Local helper tests passed **10/10**. No live helper was run.

Fresh deployed HTTPS acceptance passed **12/12**, with normal TLS verification (`ssl_verify_result=0`), no credentials/cookies sent and no redirect following. [Check results](https-acceptance.json) / [request observations](https-observations.json):

| Check | Actual result |
| --- | --- |
| Health | 200, `status=ok` |
| Both protected-resource metadata routes | 200, exact canonical `/mcp` resource and `/oauth` authorization server |
| OAuth discovery | 200; exact issuer, CIMD true, RFC 9207 true, sole method `none`, S256, no DCR endpoint |
| Native CIMD fetch/validation | Accepted in the actual Cloud Run provider; intentionally invalid plain PKCE returned the pinned ChatGPT redirect with `error`, synthetic `state` and exact `iss`, without a code |
| Token / interaction / Google callback with owner disabled | 403 |
| MCP / dispatch / unsigned Grafana requests without authentication | 401 |
| DCR registration route | 404 |

The native CIMD test reaches provider `checkClient` before PKCE validation, using production `metadataFetch()` with its real DNS/HTTPS sender, pinned document/redirect validation and method intersection. There is no fixture injection in the deployed application. The early PKCE error avoids owner login/interaction/grant creation. No upstream Google identity/login call, token issuance, subscription, delivery challenge or notification was performed.

The earlier Codex-host document validator PASS and native DNS `EAI_AGAIN` remain dated local evidence ([local result](local-cimd-validation.json)); they are superseded **for Cloud Run retrieval** by the successful deployed native fetch above. The live document's plural methods include `none` and `private_key_jwt`; the bridge accepts only `none`. This follows the documented intersection for stable CIMD mode and RFC 9207: [official host authentication](https://developers.openai.com/plugins/build/auth). No JWKS fetch is needed for that selected method.

Live preflight reconfirmed the exact active deployment actor, project number, unconditional Owner binding, billing and invoker-policy allowance. Narrow affected checks confirmed the database-conditioned runtime role ([binding](runtime-project-bindings.json)), five enabled version-1 metadata/accessor bindings ([secret metadata](secret-metadata.json)), three READY indexes ([indexes](indexes.json)), six ACTIVE TTLs ([fields](fields.json)), and existing project OAuth request-log exclusion ([sinks](project-sinks.json)). Bridge Scheduler remains absent ([final list](scheduler-final.json)). No IAM/index/logging/Scheduler changes occurred.

## Single bounded runtime read — 3 October, 05:13 UTC

The approved one-attempt POST to canonical `/oauth/token/revocation` used the pinned public client, `token_type_hint=refresh_token` and a unique synthetic colon-bearing value impossible for the pinned provider to issue. It returned **HTTP 200, empty body, TLS verify result 0**. [Result](runtime-read-probe.json) / [fresh containment readback](runtime-read-containment.json).

Source-backed inference: provider `BaseModel.find()` awaits the durable adapter lookup outside its verification-error catch; the bridge adapter reads the configured named Firestore database with workload ADC. The absent-token branch returns without destroy/revoke/write. Local simulation previously confirmed 200 with three reads/zero writes, and propagated datastore denial as 500. Thus this live absence-path result establishes successful named-database reads under the deployed runtime identity. It does not count live API calls independently or prove writes/cross-database denial. No real token, login, grant, secret payload or subscription was used; no failed probe was retried. Owner remains disabled and callback hosts deny all subscriptions.

The cross-database empirical test is **not applicable to the current single-database inventory**. Preserve the exact database-conditioned `roles/datastore.user` binding and fixed runtime database configuration as scoping evidence, following [Google's per-database IAM guidance](https://docs.cloud.google.com/firestore/native/docs/manage-databases#configure_per-database_access_permissions). No extra database is needed. First separately authorized owner login can validate OAuth persistence; no synthetic write endpoint/deployment is required for this read acceptance.

## Remaining real-auth and event prerequisites

- Organization non-intercepting sink evidence remains pending before real OAuth. The project-scoped `--sink-filter=in_scope("ALL")` read succeeded and returned only `_Default`/`_Required`; that API scope includes ancestor intercepting sinks, not all non-intercepting ancestor sinks. The original organization-selector conflict was a local adapter/CLI limitation. A user-authorized exact read-only adapter exception passed 30 offline tests, then reached Google and returned `IAM_PERMISSION_DENIED` for `logging.sinks.list` on organization `594773370606`. No configurations were returned, so enabled `includeChildren` sinks and retention remain unknown. That route stopped without IAM/network expansion or bypass. [Exact result and bounded saved-environment reproduction](adapter-org-sink-fix/README.md).
- Runtime named-database reads now pass through the bounded absence probe above. Cross-database empirical denial is not applicable because there is no existing unrelated database; the exact conditional binding and fixed runtime database remain policy/configuration evidence. Runtime write persistence remains for the first separately approved owner-auth flow. No cross-database isolation claim is made.
- The owner subject was supplied as user-verified helper output and used only as private runtime config; it was not independently verified through a Google call and is redacted from these artifacts. Review actual Google web-client consent/callback and perform separately approved owner activation, host connection, login/token refresh/revocation and authenticated MCP acceptance.
- Keep callback hosts empty until exact host-provided callback metadata is verified through the approved setup. Subscription, secret handling, Scheduler/Grafana activation and signed synthetic end-to-end acceptance remain separate. Existing IRM/mobile delivery was not changed.

For rollback using the existing approved adapter:

```sh
/workspace/.setup/cloud-gcloud gcloud -- run services update-traffic mw-grafana-events --region=asia-southeast1 --to-revisions=mw-grafana-events-00001-rnj=100
```

No AppSheet, SQL, Azure worker, DNS, account access, production financial write or real notification change occurred. Deployment/metadata acceptance is not end-to-end alerts acceptance.
