# Approved Grafana bridge bootstrap — 2 October 2026

Checkpoint: named resources verified; inert image pushed; Cloud Run deployment pending the corrected source publication/CI. No functional OAuth, secret entry, dispatch, Grafana cutover or DNS change.

## Source and authority

Isolated checkout `AppSheet-Loan-Project-grafana-deploy`, task branch `feat/grafana-mcp-events`, draft [PR 3](https://github.com/welct0407/AppSheet-Loan-Project/pull/3). Initial fetched pin `c4fd3f041235790703f732386b1e93b83f269e23`; original checkout preserved. The owner-approved bootstrap bundle and fixed service-account Owner grant are recorded in [the owning change log](../../Change%20Logs/CHANGE_NOTES_GRAFANA_MCP_BRIDGE_2026-10-02.md) and [bootstrap runbook](../../scripts/monitoring/grafana-mcp-bridge/deploy/OWNER_BOOTSTRAP.md). All live commands used `/workspace/.setup/cloud-gcloud` and its guarded Python/gcloud/Docker shims. No key creation, human login, impersonation or network-policy changes.

## Verified state

Project `clever-oasis-508610-n7`, number `737787224638`, organization `594773370606`, Singapore `asia-southeast1`. Fresh-task proof confirmed the fixed deployment identity, unconditional Owner binding, no impersonation, independent private-config recreation, successful bounded API reads and strict pinned-host IAP/SSH. The inherited configuration was unchanged across that proof; the hygiene check found zero runtime credentials/invocation residues. Catalog version `cecfgver_6abffb3c7c58819aa4e8702693deb002` was expected; actual catalog metadata was not exposed.

Read-only bootstrap preflight passed billing, project/Owner, organization invoker policy and visible collision checks. Approved resource APIs were enabled, with their automatically required dependencies. [Resource readback](resource-readback.json) verifies:

- Runtime `mw-grafana-events` and dispatcher `mw-grafana-dispatch` identities with the bootstrap marker.
- Docker repository `mw-monitoring`; Standard Native Firestore `mw-grafana-events` in Singapore, deletion protection enabled, PITR disabled.
- Runtime project role only `roles/datastore.user`, conditioned to `resource.name=="projects/clever-oasis-508610-n7/databases/mw-grafana-events"`; dispatcher has no project roles.
- Exactly five named empty secret containers with runtime accessor bindings and no dispatcher binding, including `mw-grafana-google-client-secret`.
- Three committed composite definitions, twelve field-index exemptions, six TTL policies. Indexes/TTL were still `CREATING` at the recorded read; operation IDs were not captured. Completion is an outstanding readback, not an established result.
- Exact OAuth request-log exclusion on `_Default`. The successful resource bootstrap independently compared all unrelated sink fields/exclusions before and after.
- Scheduler job absent.

## Stops and corrections

[First resources run](resources.log) stopped at SDK 587 rejecting composite **list** `--collection-group`. After [partial ownership/configuration readback](partial-readback.json), [resume](resources-resume.log) reconciled the same resources without deletion/recreation. Source now uses the documented `--filter=COLLECTION_GROUP:GROUP` list syntax and tests that exact parser invocation before resource mutations. Create/field commands retain their collection-group selectors. [Google CLI reference](https://docs.cloud.google.com/sdk/gcloud/reference/firestore/indexes/composite/list).

[First inert run](inert.log) successfully built/pushed the pinned dependency-free non-root image, then stopped because `artifacts docker images describe` contacted `containeranalysis.googleapis.com` and received proxy `403 Forbidden`. That denied route is stopped; no Container Analysis result is claimed. A distinct allowed Artifact Registry **tag metadata** read succeeded and resolved `grafana-mcp-bootstrap:v1` to `sha256:d7e7c7b322c2497896239b5007d12f20e5d7c07cbad9e024e28cbf67098b4d26`. Source now resolves the exact tag/package to its immutable version through that metadata-only command and rejects missing, duplicate, foreign-package and malformed-digest results. [Tag command reference](https://docs.cloud.google.com/sdk/gcloud/reference/artifacts/docker/tags/list).

## Checks and remaining work

Focused bootstrap Python suite: 27 tests, 26 passed and one Windows-only test skipped on Linux. Inert endpoint regression passed. Guarded `check-sdk` passed against the actual SDK 587. Application/dependencies and inert image sources are unchanged; their passing source-pin CI is reused pending relevant CI on the correction commit.

Next: verify correction publication/CI, run the guarded inert phase, verify immutable image/Cloud Run settings and bounded health/sensitive-route behavior, then read asynchronous index/TTL status. Domain mapping must independently prove actor ownership; project Owner alone is insufficient. Return actual mapping records only after an authorized successful mapping; Cloudflare edits remain manual. Secure owner OAuth-client-secret entry and functional application/host acceptance remain separate. Keep secrets empty and Scheduler absent/inactive.

`verify-resources.py` is a task-specific metadata-only check; execute through adapter Python mode. `--partial` checks only the known partial-creation scope. It never reads secret payloads. Evidence contains sanitized metadata only.

## Recovery

Retain partial resources and the protected database. Rerunning resources requires `--resume` after confirming ownership/configuration; never recreate/delete to clear a failure. An inert rerun refuses an unrelated service collision and preserves an existing marked service. The initial source pin and this task branch preserve code recovery. No secret/state keys exist to regenerate; existing Grafana IRM and business runtimes remain outside this bootstrap.
