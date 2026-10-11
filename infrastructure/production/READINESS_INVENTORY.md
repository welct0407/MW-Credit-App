# Phase 3 infrastructure inventory — 11 October 2026

Current target: owner-selected existing project clever-oasis-508610-n7 /737787224638 with shared default Firebase Google authentication. New shared-project production resources remain unapplied. The separate unbilled project219146337993 and partial state are parked. Earlier sections below are dated evidence; the final shared-project revision and README govern the current proposal.

Historical initial read-only observation (superseded by the partial attempt and target revision below). App starting commit `24532742bd65a9fbf2bd53810b35e68100b5c3db`; canonical management instructions read from `9e037c98ac902c82d161d32e03d4be416ad7f6b8`, because the local management checkout had moved to another commit. Current owner acceptance and Phase 3 authorization supersede that checkpoint's pending-acceptance wording.

## Retained target and DEV baseline

| Item | Observed identity/configuration |
| --- | --- |
| Data/DEV project | `clever-oasis-508610-n7`, number `737787224638` |
| Organization | `594773370606` |
| Existing billing association | Enabled, `0125EC-78CB0F-A74AAD`; no new association made |
| Shared SQL | `clever-oasis-508610-n7:asia-southeast1:appsheet-pg-prod-20260914`; PostgreSQL18, `db-f1-micro`, ZONAL,10GB |
| SQL configuration | `max_connections=200`; IAM database authentication on; backups and PITR enabled; pg_cron enabled against `loan_manager_prod`, Asia/Bangkok, one concurrent job |
| Existing databases | DEV `loan_manager_dev`; retained PROD `loan_manager_prod`; no DB change or new instance |
| Receipt bucket | `mw-payment-receipts-prod-508610-n7`; external retained dependency |
| DEV reader/command | `mw-credit-app-read-dev-00016-k4l` / `mw-credit-app-command-dev-00017-q5n` |
| Other Cloud Run services listed | Readiness `mw-credit-app-api-dev-00004-zn4`; retained `mw-grafana-events-00015-qcs`; no MW Credit production runtime in this project's bounded service list |
| DEV backend | Existing versioned bucket `mw-credit-app-tfstate-737787224638`, prefixes `development`, `development-dns` and bootstrap; production must not share these authorities |
| Auth configuration | Existing default-project authorized domains: `clever-oasis-508610-n7.firebaseapp.com`, `mw-credit-app-dev-737787224638.web.app`, `dev-lm.mw-credit.com`; returned multiTenant object empty |
| DEV delivery | WIF condition pins numeric repository/owner, main ref and development environment. Existing deploy identity has project-level Hosting admin; a second site in this project is not a delivery isolation boundary |

The connection ceiling and machine tier do not establish available headroom. Current aggregate demand, peak connections, CPU/memory, retry bursts and other consumers must inform the later production budget. No limit changes are justified by this inventory. Enabled backups/PITR are configuration evidence, not a completed restore/recovery exercise.

## Selected direction and unresolved target binding

Owner selected a **new** application GCP/Firebase project under the existing organization/billing and hostname **lm.mw-credit.com**. Proposed project ID: **mw-credit-app-prod-20261011** (proposal only). Read-only project lookup returned permission-denied-or-missing, so global availability is **not established**, no number is known, and nothing is created/reserved. Existing accessible projects named `prod` or `Production-mp` were not selected or inspected as targets.

Public DNS A/AAAA/CNAME lookups for the selected hostname returned NXDOMAIN at this check. This does not prove absence of a private/unpublished Cloudflare record and does not authorize DNS changes. Exact Hosting site, certificate records, state bucket, project number, auth issuer/audience and runtime identities must be bound from the authorized created target; no guessed values belong in promotion evidence.

Identity Platform config read succeeded using the existing project as the per-request quota project; tenant-list attempts returned INVALID_PROJECT_ID. No tenant-list completeness claim is made. The selected separate-project design does not depend on treating that error as evidence of zero tenants.

## Prepared repository scope

`main.tf` is disabled by default and owns only future empty identities, secret containers and an artifact repository when explicitly enabled. It does not own the retained SQL instance, databases, bucket or existing DEV addresses. `tests/inert.tftest.hcl` independently checks zero default resources, rejection of the existing project, and the bounded enabled resource count using mock providers. Local formatting, validation and all three mock tests passed. Provider working data was outside Git; backend initialization was disabled.

Cross-project SQL/IAM and receipt-prefix feasibility and proposed principal boundaries are in [README](README.md). The separate [bootstrap proposal](../production-bootstrap/README.md) now owns the proposed new project/billing association, Storage API and protected state bucket; it remains disabled/unapplied and its three mocked checks passed. Organization policy admission, actual billing/project creation, dedicated state migration, other API enablement, cross-project IAM/SQL grants, production runtime/auth/Hosting configuration, protected promotion, monitoring and recovery remain subsequent concrete plans. No production apply is authorized by the current preparation batch.

## Actual bootstrap plan prepared, not applied

The acting identity `welct0407@mw-credit.com` passed read-only permission checks for organization project creation (`resourcemanager.projects.create`), organization/policy reads, billing account read and `billing.resourceAssociations.create`. This is bounded permission evidence, not proof that all creation-time policies, quota or project-ID availability will pass. Effective organization policies enforce public access prevention and uniform bucket access, matching the proposal; allowed-policy-member domains are restricted to the existing customer. No IAM/policy changes were made.

An actual enabled Terraform saved plan was prepared with explicit private local state/workspace paths and a separate provider directory. Its SHA256 is `5685b7bf353eecf897517f27b0a2283529e4726da1e067a96589480f3230f878`. It contains exactly three creates: `google_project.application[0]`, `google_project_service.storage[0]`, and `google_storage_bucket.state[0]`; no updates or deletes. Target is proposed project `mw-credit-app-prod-20261011`, organization `594773370606`, billing `0125EC-78CB0F-A74AAD`, no default network. Bucket uses the computed new project number, Asia Southeast1, versioning, uniform access, enforced public-access prevention, force-destroy false and604800-second soft delete. Project number/bucket final name remain computed, not claimed created.

Saved plan and execution metadata are private under `C:/Users/MWCredit/Documents/ChatGPT/MW-Credit-App/terraform/production-bootstrap-live-preparation`; no state, plan or provider data is inside the repository. Root reviews this concrete plan before requesting scoped owner apply approval. **No apply, project creation, billing association or API enablement has occurred.**

## Authorized bootstrap attempt — partial outcome

The owner subsequently explicitly authorized the reviewed bootstrap apply and migration to its new state bucket. Plan/source hashes and acting identity were rechecked, and the exact plan was applied once from app baseline `1dc61115632a8f2b377f36051cc60630542b6aa6`.

**Project creation succeeded:** `mw-credit-app-prod-20261011`, actual number `219146337993`, ACTIVE under organization `594773370606`. **Billing association failed:** Google returned HTTP400 QuotaFailure, “Cloud billing quota exceeded,” for `0125EC-78CB0F-A74AAD`. Readback confirms billing disabled and no billing account attached. Storage API/state bucket creation and backend migration were not reached. This is partial application, not completed bootstrap or production readiness.

Private local state serial2, lineage `3b5ad514-f8ab-5f45-96fa-61bf3e1686b5`, contains the one project resource, marked tainted after the interrupted creation sequence. The recovery copy `bootstrap-partial-billing-quota.tfstate` has SHA256 `22037b2f971b9070aaafae299b2e1719e7baa879c199b56b4510c669dad8f1fb`; original state and available backup remain private. The API verified project number is authoritative; the partial provider state has not yet refreshed it.

No retry, deletion, replacement, policy relaxation, billing-account substitution or state mutation was attempted. The old creation plan must not be reused. After the billing blocker is resolved, reconcile this same existing project with the preserved state using a reviewed recovery procedure and prepare a fresh plan; do not delete/recreate it to hide partial failure. Backend migration remains pending until the protected bucket exists. Independent preparation may use the now-verified project ID/number, while all dependent provisioning stays blocked.

## Current owner-selected shared-project revision

Production target is now existing My First Project clever-oasis-508610-n7 /737787224638 with active existing billing. The unbilled new project219146337993 and tainted private state remain parked. No further billing, project or state mutation is authorized. The superseding owner decision shares existing default Firebase Google authentication (no tenant/new provider), with separate PROD identities/site/state/artifacts and no duplicate existing Firebase/default-auth ownership. All new same-project resources remain uncreated; see README for operator-only Hosting, pending DEV automated Hosting permission removal and verified shared-default owner pin prerequisites. The earlier new-project plan and initial9-resource foundation are historical, not current apply candidates.



Final affected local checks:5 application+2 newstate mocktests pass. Actual read-only plans were saved externally: statebucket1createSHA690183679b2b269fe61745d4307ba4d72307dbad62c7da495815b4eb8b422da5; F1privatewrapper18createsSHAb1830c50d84017c67ed8269686ba64cd157280f84dd493a9ca206b8e2eb217f2. Noapply. F1wrapperaddresses require a fresh final-root plan after newstateexists. ProposedHosting site mw-credit-prod-737787224638 is withinlengthbounds butavailabilityunverified. WIFimmutableprefix readback confirmedbyD; actualissuedproductiontoken andenvironmentprotection remainunverified.
