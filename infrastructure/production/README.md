# Production foundation preparation

This is an inert, separately owned Phase 3 root. The owner selected a new production application project under the existing organization/billing and `lm.mw-credit.com`; that design choice authorizes no provisioning. Required project ID/number and region have no defaults; the existing DEV/data project is rejected. `foundation_authorized=false` creates nothing. Mock-provider tests use synthetic identifiers only.

The proposed enabled foundation contains four empty execution identities, four empty Secret Manager containers and one artifact repository. It grants no IAM roles, creates no secret payloads, registers no SQL user, deploys no runtime, configures no Firebase authentication/Hosting, and changes no DNS. API enablement and the new project/state bucket must be separately prepared and authorized first. This limited root is not a production deployment package or a completed Phase 3.

Project creation and state recovery are owned by the separate [production bootstrap proposal](../production-bootstrap/README.md). The application project-number validator checks format/exclusion only; actual ID/number correspondence must be read back from the authorized bootstrap. All proposed service accounts, secrets and the registry have prevent-destroy protection. Once created, do not turn `foundation_authorized` back to false as cleanup; resource removal requires a separate recovery-aware owner decision and reviewed configuration change.

## State and execution

Use a dedicated production GCS backend in the selected application project, with its own bucket/prefix, IAM, versioning and recovery policy. Supply backend configuration privately; never reuse `development`, `development-dns`, or the DEV bucket. Set `TF_DATA_DIR` to a separate private production directory outside every repository. Plans, state, provider working data and credentials stay there. Do not use `scripts/Invoke-Terraform.ps1` for this root: that helper intentionally targets DEV/bootstrap and their private activation files.

For local mock validation only, use `terraform init -backend=false`, `terraform validate` and `terraform test` with an external `TF_DATA_DIR`. Tests do not contact cloud resources. Do not attach this root to a live backend or apply it under preparation authorization.

## Proposed least-privilege boundaries

| Principal | Proposed future authority | Explicit exclusions |
| --- | --- | --- |
| PROD reader | Own auth user-status lookup; shared-project Cloud SQL Client/Instance User plus separately reviewed PROD database SELECT role | DEV identity/secret access, SQL writes, receipt storage |
| PROD command | Own auth lookup; reviewed PROD SQL command role; exact approved PROD receipt prefixes | DEV data, bucket list/delete/overwrite, arbitrary SQL, business activation during foundation |
| PROD builder | Write application artifact repository; exact build-source bucket; build logging | Deployment, retained SQL/GCS, auth secrets |
| PROD deployer | Reviewed Cloud Run/Hosting release operations and actAs on exact runtime accounts; protected production OIDC subject | IAM administration, DEV resources, SQL grants, secret payload reads, infrastructure mutation |

No grant in this table is implemented by the preparation root. Cross-project SQL is supported by enabling the Cloud SQL Admin API in both projects and granting the application service accounts appropriate connection roles in the instance project; IAM login registration and SQL privileges are distinct reviewed steps. See [Cloud Run to Cloud SQL](https://docs.cloud.google.com/sql/docs/postgres/connect-run). Retained receipt access can be granted to the new principal on the existing bucket, using exact object-prefix conditions and a get/create-only custom role. A prefix condition cannot safely restrict object listing, so do not grant list. See [Storage IAM](https://docs.cloud.google.com/storage/docs/access-control/iam) and [service account resource access](https://docs.cloud.google.com/iam/docs/service-account-overview).

Existing organization policies, service perimeters, API availability and cross-project IAM admission must be checked against the final selected project before live planning. This documents supported architecture, not verified access for an uncreated target.

## Required next decisions and evidence

1. Finalize the new application project ID and review creation/billing/state plans for scoped authorization. Existing projects whose display name contains “prod” are not selected by inference. The selected hostname is `lm.mw-credit.com`; DNS changes remain separately unapplied.
2. Prepare dedicated state/recovery, identity/OIDC, API enablement, Firebase auth and Hosting configuration; keep DEV issuer/audience and delivery authority outside the new project.
3. Implement and independently test explicit production server issuer/audience, membership and contained-command policy before runtime creation. Current DEV servers cannot be relabeled as production.
4. Establish capacity from measured shared SQL demand and connection headroom, then review pool, instance and timeout budgets. Current `max_connections=200` is a configured ceiling, not available capacity or permission to increase limits.
5. Prepare exact immutable artifact promotion and rollback, storage-prefix/SQL grants, monitoring and recovery evidence. Obtain scoped approval on the resulting concrete plans before mutations.
