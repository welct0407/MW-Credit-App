# Infrastructure foundation — 7 October 2026

## Scope and authority

Owner requested a new repository and Terraform-managed development infrastructure, tools and credential management while reusing existing SQL/GCS and preserving old/new parallel operation. New private repository: welct0407/MW-Credit-App. No production financial writes, AppSheet cutover or business scheduler activation.

## Changes

Created Terraform bootstrap/dev stacks, Cloud Run and dedicated identities, Artifact Registry, versioned remote state, build-source storage, scoped existing-bucket access, Cloud SQL IAM login, Secret Manager container/version, GitHub OIDC federation, Firebase project activation on the existing GCP project and a new development Hosting site. Installed pinned Node/Terraform/GitHub tooling; reused gcloud/PostgreSQL/Flyway. Added React/TypeScript scaffold, guarded readiness API, build/test configuration and delivery workflows.

Credentials use IAM/OIDC and Secret Manager. Secret payload/state/plan/authentication files remain outside Git. Existing services were not reconfigured.

## Rollback and checks

This is the repository's first implementation checkpoint; existing shared services were inspected before additive configuration. Remote state versioning and Cloud Run deletion protection are enabled. See docs/Development.md for rollback boundaries.

Passed local build, six unit tests, two desktop/mobile browser tests, full npm vulnerability audit (zero findings), Terraform apply and final no-change plan. Live readiness confirmed DEV SQL connection, scoped synthetic GCS access/cleanup and managed secret access. Initial Firebase Hosting release succeeded.

Development infrastructure is ready. Final CI run 37584672421 and end-to-end delivery run 37584673770 both passed for source fa9679f. The private API rejects anonymous requests with HTTP 403; authenticated readiness passes. Sanitized revision/image evidence is in outputs/infrastructure-20261007/verification.json. Application functionality and production cutover remain separate work.

GitHub CI run 37583863169 passed. The first deployment was correctly rejected because GitHub uses an immutable OIDC subject containing numeric IDs; the Terraform condition was corrected to the verified immutable subject without widening repository, branch or environment access. Runtime environment guards now also execute at startup.

The second delivery run successfully authenticated and pushed the image, then revealed that gcloud image describe requests unrelated Container Analysis access. Delivery now uses Docker's pushed repository digest directly; no broader cloud permissions were added.

GitHub successfully deployed the API in run 37584371808. The probe's gcloud self-impersonation attempted an unnecessary second access-token grant; verification now calls generateIdToken directly with the existing scoped OpenID-token permission.
