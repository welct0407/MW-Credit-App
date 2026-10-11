# Production project and state bootstrap proposal

Prepared after the owner selected a **new** application project under organization `594773370606`, billing account `0125EC-78CB0F-A74AAD`, and future hostname `lm.mw-credit.com`. Selection is not permission to create or attach billing. Proposed project ID `mw-credit-app-prod-20261011` is not reserved; the read-only lookup could not distinguish nonexistent from inaccessible. No project number is invented.

Default `bootstrap_authorized=false` produces no resources. The proposed enabled plan owns exactly:

1. One protected new project, including the selected organization/billing association, without a default VPC.
2. Its Storage API enablement, retained on removal.
3. A private state bucket named using the actual returned project number, in Asia Southeast1, with uniform access, public access prevention, versioning, seven-day soft delete, no force deletion and Terraform prevent-destroy.

This creates no user service account, SQL user/role, shared-project IAM grant, runtime, authentication provider, secret, artifact repository, Hosting site, domain or DNS record. The separate `../production` root owns its later optional foundation. No production business activation is included.

## Approval and execution sequence

Before live planning, inspect the acting identity's project-creation authority under the selected organization and billing-association authority on the selected account. These read-only checks and preparing the actual saved plan are covered by Phase 3 preparation authority; they do not require a new owner confirmation. They do not authorize expanding permissions. Evaluate current organization policies; a failure is a stop on creation, not grounds to relax them. Prepare and review the actual saved plan first, then request owner approval scoped to its proposed project, billing association, Storage API and state bucket. Apply only the approved plan after hash verification. A mocked test is not a live cloud plan or permission proof; a successful plan alone does not prove creation permissions or organization-policy admission.

Follow the existing DEV bootstrap's local-to-GCS migration pattern, but never reuse its bucket, state or prefix:

1. Use a new private external `TF_DATA_DIR`, for example `C:/Users/MWCredit/Documents/ChatGPT/MW-Credit-App/terraform/production-bootstrap-data`. Initialize this partial local backend with explicit **absolute** private `path` and `workspace_dir` arguments outside every repository. Never run backend initialization without them. Save plans and logs in that private directory too. Do not use the existing DEV helper.
2. Run the enabled proposal plan only with the reviewed target and verified credentials. Check precisely three additions, no changes/deletions, project/billing identity and bucket recovery settings. Apply only with explicit owner approval; preserve the local state/backup until migration is verified.
3. Record actual project ID/number and bucket name from successful outputs. Replace this root's `backend "local" {}` with `backend "gcs" {}` in a reviewed follow-up, then `init -migrate-state` with private backend configuration for the **new** bucket and prefix `bootstrap`. Never use `-force-copy` to conceal a competing state. Capture original state lineage/serial privately, verify the remote state has the same lineage and resources, and require a no-change plan. Only then mark remote migration complete. Publish that backend change with sanitized evidence.
4. Initialize the separate production foundation root against the same new production-only state bucket under prefix `application`, with a separately reviewed provisioner. DEV build/deploy identities and previews receive no state access. Preserve operator/admin recovery access; do not grant the application runtime/deployer state permissions. Review inherited project IAM before considering isolation verified.
5. Keep private initial state recovery until remote versioning and an operator readback are verified. Document a Phase9 state-version recovery exercise; never blindly restore old state, destroy the project/bucket or regenerate identity secrets. No retention rule deletes older object versions in this proposal.

The bootstrap's initial local state is intentional and temporary. Cloud creation, backend migration, later foundation provisioning and runtime/business activation are distinct checkpoints. A failed creation or migration must retain private recovery and be reconciled before retrying, not duplicated into another state.

## Local checks

Use an external provider directory with `init -backend=false`, then `validate` and `test`. Mock-provider tests check the inert default, exact three-resource proposal, state protections and rejection of the existing data project. They make no cloud calls or live mutations. A real saved plan and scoped approval remain prerequisites for provisioning.
