# Approved Grafana bridge bootstrap — 2 October 2026

Checkpoint: named resources verified; inert Cloud Run revision deployed and Ready; all three indexes READY and six TTL policies ACTIVE. Live HTTP checks remain proxy-blocked; domain ownership read now succeeds but the fixed service account has no verified domains, so mapping requires the existing human-owner route. No functional OAuth, secret entry, dispatch, Grafana cutover or DNS change.

## Source and authority

Isolated checkout `AppSheet-Loan-Project-grafana-deploy`, task branch `feat/grafana-mcp-events`, draft [PR 3](https://github.com/welct0407/AppSheet-Loan-Project/pull/3). Initial fetched pin `c4fd3f041235790703f732386b1e93b83f269e23`; original checkout preserved. The owner-approved bootstrap bundle and fixed service-account Owner grant are recorded in [the owning change log](../../Change%20Logs/CHANGE_NOTES_GRAFANA_MCP_BRIDGE_2026-10-02.md) and [bootstrap runbook](../../scripts/monitoring/grafana-mcp-bridge/deploy/OWNER_BOOTSTRAP.md). All live GCP and registry commands used `/workspace/.setup/cloud-gcloud` and its guarded Python/gcloud/Docker shims. No key creation, human login, impersonation or network-policy changes.

## Verified state

Project `clever-oasis-508610-n7`, number `737787224638`, organization `594773370606`, Singapore `asia-southeast1`. Fresh-task proof confirmed the fixed deployment identity, unconditional Owner binding, no impersonation, independent private-config recreation, successful bounded API reads and strict pinned-host IAP/SSH. The inherited configuration was unchanged across that proof; the hygiene check found zero runtime credentials/invocation residues. Catalog version `cecfgver_6abffb3c7c58819aa4e8702693deb002` was expected; actual catalog metadata was not exposed.

Read-only bootstrap preflight passed billing, project/Owner, organization invoker policy and visible collision checks. Approved resource APIs were enabled, with their automatically required dependencies. [Resource readback](resource-readback.json) verifies:

- Runtime `mw-grafana-events` and dispatcher `mw-grafana-dispatch` identities with the bootstrap marker.
- Docker repository `mw-monitoring`; Standard Native Firestore `mw-grafana-events` in Singapore, deletion protection enabled, PITR disabled.
- Runtime project role only `roles/datastore.user`, conditioned to `resource.name=="projects/clever-oasis-508610-n7/databases/mw-grafana-events"`; dispatcher has no project roles.
- Exactly five named empty secret containers with runtime accessor bindings and no dispatcher binding, including `mw-grafana-google-client-secret`.
- Three committed composite definitions, twelve field-index exemptions, six TTL policies. The earlier resource read captured `CREATING`; the later [Cloud Run/index/TTL readback](cloud-run-readback.json) confirms all three indexes `READY` and all six TTL policies `ACTIVE`. No pending asynchronous operation is reported by those state reads.
- Exact OAuth request-log exclusion on `_Default`. The successful resource bootstrap independently compared all unrelated sink fields/exclusions before and after.
- Scheduler job absent.

## Stops and corrections

[First resources run](resources.log) stopped at SDK 587 rejecting composite **list** `--collection-group`. After [partial ownership/configuration readback](partial-readback.json), [resume](resources-resume.log) reconciled the same resources without deletion/recreation. Source now uses the documented `--filter=COLLECTION_GROUP:GROUP` list syntax and tests that exact parser invocation before resource mutations. Create/field commands retain their collection-group selectors. [Google CLI reference](https://docs.cloud.google.com/sdk/gcloud/reference/firestore/indexes/composite/list).

[First inert run](inert.log) successfully built/pushed the pinned dependency-free non-root image, then stopped because `artifacts docker images describe` contacted `containeranalysis.googleapis.com` and received proxy `403 Forbidden`. That denied route is stopped; no Container Analysis result is claimed. A distinct allowed Artifact Registry **tag metadata** read succeeded and resolved `grafana-mcp-bootstrap:v1` to `sha256:d7e7c7b322c2497896239b5007d12f20e5d7c07cbad9e024e28cbf67098b4d26`. Source now resolves the exact tag/package to its immutable version through that metadata-only command and rejects missing, duplicate, foreign-package and malformed-digest results. [Tag command reference](https://docs.cloud.google.com/sdk/gcloud/reference/artifacts/docker/tags/list).

## Checks and remaining work

Focused bootstrap Python suite: 27 tests, 26 passed and one Windows-only test skipped on Linux. Inert endpoint regression passed. Guarded `check-sdk` passed against the actual SDK 587. Application/dependencies and inert image sources are unchanged. Corrected source was published at `8f97c7af864fb8cf3e31a305bc3dc45456f7e191` before deployment; [exact-head CI](https://github.com/welct0407/AppSheet-Loan-Project/actions/runs/37052535247) passed both Linux offline-security and Windows bootstrap jobs.

After successful source publication/CI, the [corrected inert phase](inert-corrected.log) completed. Actual service URL is `https://mw-grafana-events-pvrgvyg3oq-as.a.run.app`, revision `mw-grafana-events-00001-rnj`, `Ready=True`, 100% traffic. Artifact Registry tag metadata, configured image and resolved revision digest agree on `sha256:ac81052e56736854c7c3c937031db309c78d3f1da7fd58ceb3318c294bfa0154`. That fresh build/push digest supersedes the earlier first-attempt tag digest; both attempts used the unchanged pinned inert image source. Readback verifies the exact runtime identity, public ingress/invoker-check setting, min 0/max 2, 1 CPU/512 MiB, concurrency 20, timeout 300, `OWNER_ENABLED=false`, no mounted secrets and Scheduler absent.

The bounded [HTTP read](http-readback.json) to the exact `/health` endpoint stopped with curl exit 56, HTTP 000, `CONNECT tunnel failed, response 403`. No further service HTTP calls or alternate route were attempted. Local inert tests establish health-only code behavior; live health and sensitive-route responses remain unverified. Parent is seeking approval for exact service and `alerts.mw-credit.com` host access; no approval or network change is recorded here.

The guarded [domain phase](domain.log) stopped before mapping at `gcloud domains list-user-verified`: App Engine Admin API `appengine.googleapis.com` returned `SERVICE_DISABLED` for project number `737787224638`. The fixed service account's eligibility is **unverified**, not established as absent. No API was enabled for this check, no ownership was created/delegated, no mapping was attempted and no DNS resourceRecords were generated. The parent subsequently clarified that the original bootstrap approval covers this prerequisite API enablement. Only `appengine.googleapis.com` was enabled; [the operation](appengine-api-enable.log) completed successfully and [readback](appengine-api-readback.json) confirms ENABLED. The repeated [ownership read](domain-ownership-check.json) succeeded with `[]`. The current service account therefore has no verified domains and is not eligible for this mapping. [Current result](domain-result.json). No App Engine application, access grant or ownership delegation was created; no mapping/DNS records or Cloudflare changes. Mapping now stops for the existing human-owner route after that actor's Search Console ownership is independently verified. Project Owner alone is insufficient.

Keep all five secrets empty and Scheduler absent/inactive. Secure owner OAuth-client-secret entry, functional application/host acceptance and Grafana additive cutover remain separate future work.

`verify-resources.py` and `verify-service.py` are task-specific metadata-only checks; execute through adapter Python mode. `--partial` checks only the known partial-creation scope. Neither reads secret payloads. Evidence contains sanitized metadata only.

## Recovery

Retain partial resources and the protected database. Rerunning resources requires `--resume` after confirming ownership/configuration; never recreate/delete to clear a failure. An inert rerun refuses an unrelated service collision and preserves an existing marked service. The initial source pin and this task branch preserve code recovery. No secret/state keys exist to regenerate; existing Grafana IRM and business runtimes remain outside this bootstrap.
