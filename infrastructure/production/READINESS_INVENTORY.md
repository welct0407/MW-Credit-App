# Phase 3 infrastructure inventory — 11 October 2026

## Current verified checkpoint

Owner-selected target is existing **My First Project**, `clever-oasis-508610-n7` / `737787224638`, with shared default Firebase Google sign-in. The authorized contained foundation is deployed. Hosting foundation delivery and recorded maintenance rollback/restoration are verified; canonical HTTPS is now active; owner GUI passed at05:06:12UTC on the stable fallback (see project/outputs/r052-phase3/production-foundation-delivery.json). No production business operations, SQL changes or receipt-storage authority were introduced.

| Asset | Verified current identity/status |
| --- | --- |
| PROD state | `mw-credit-app-prod-tfstate-737787224638`, separate `bootstrap`, `application`, `dns` prefixes; versioning, uniform access, public-access prevention, seven-day soft delete |
| Application state | `application/default.tfstate`, generation `1791694752120444`, lineage `f2536962-5280-6b41-f3a5-457f0c50608a`, serial6 |
| Bootstrap recovery | Private initial state retained; migration without force-copy preserved lineage `d0441ef2-2945-b3b6-1ced-dbc3286e568c`, serial1→2; no-change plan passed |
| PROD reader | `mw-credit-app-read-prod-00001-9rm`, Ready,100%; `https://mw-credit-app-read-prod-pvrgvyg3oq-as.a.run.app` |
| PROD command | `mw-credit-app-command-prod-00001-g9j`, Ready,100%; `https://mw-credit-app-command-prod-pvrgvyg3oq-as.a.run.app` |
| Runtime image | `asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:6cf9db0bfcf6861c8438ef9c713392c76874e0bce94a08c89cb90d35d37d1a1f` |
| Runtime identities | Separate `mw-credit-app-read-prod` and `mw-credit-app-command-prod` service accounts in the selected project |
| Owner identity | Trusted existing-default-user verification: enabled, verified email, Google provider, no tenant; independent PROD owner-identity secret version1; private value omitted |
| WebApp / Hosting | `1:737787224638:web:0ed0ba9555749c1cfbe76f` / `mw-credit-prod-737787224638` |
| DNS | DNS-only CNAME `lm.mw-credit.com` → `mw-credit-prod-737787224638.web.app`; current public readback matches. Firebase check at05:14:17UTC reports `HOST_ACTIVE`, `OWNERSHIP_ACTIVE`, `CERT_ACTIVE`; HTTPS returns200/no-store. Temporary managed certificate expires9January2027; HTTP challenge discovered matches desired. |
| DEV reader / command | Still Ready,100% `mw-credit-app-read-dev-00016-k4l` / `mw-credit-app-command-dev-00017-q5n`, unchanged image `af1dfc44737a082239c21431341e679aced741c18e51032d499a1ebcba1f904d` |

The sole consolidated CI `38112831074` passed product source `184d19945f8d75994f5b58b13b0fadbf7b3c8b57`. Runtime image inputs match its tested source. The post-F3 plan contains **zero resource actions**; detailed exit2 reflects only the computed Firebase DNS check timestamp output, not infrastructure drift. No timestamp-only refresh was applied.

Runtime limits are min0/max1 each, concurrency5, CPU1,512Mi,15-second timeout. Services run only the contained production entrypoint; they have owner-secret access and `firebaseauth.users.get`, with no SQL/GCS business grants. Service IAM grants only the separate PROD deployer `roles/run.developer`; no allUsers binding exists. Service-specific invoker-check disablement supports application Firebase authentication.

The owning DEV state added `lm.mw-credit.com` and the PROD fallback authorized domain while retaining all three existing domains and sign-in configuration. Only the DEV automated deployer's project Hosting-admin binding was removed after the human operator helper verified both sites. The DEV owning no-change plan passed. Public IdentityToolkit configuration requests with both PROD Referer values returned200 for project737787224638; this is functional admission, not authoritative API-key restriction metadata. The API Keys metadata API was disabled and was not enabled.

## Access and recovery limits

Selected DEV reader/command/build/deploy policy inspection found no direct grants on PROD state, owner secret, registry or services and no direct organization grants. Existing project grants are limited to SQL/auth, logging or deployment-status/service-consumption roles; selected accounts have no basic Owner/Editor/Viewer role. Bucket legacy project-role grants and organization group/domain membership remain shared-administration boundaries. Policy Troubleshooter was enabled through the existing DEV API-owner Terraform state using reviewed plan `3fca04ff9dd70d3d762d888605d7fef9b90626d17771c0f8fac2902ba2f487b1` (one create, no other changes). Two retained v3 rows for DEV reader against PROD state bucket (`storage.objects.list`, `storage.buckets.setIamPolicy`) report `CANNOT_ACCESS` / allow not granted. The broader matrix was stopped after unresponsive execution when the owner deferred further work; its results were not retained and are not claimed. That earlier access attempt was incomplete; no impersonation or secret/state payload access occurred. The resumed result below supersedes its limited coverage.

State and secret versions are recovery metadata, not a business-data restore test. Shared SQL remains `clever-oasis-508610-n7:asia-southeast1:mw-credit-pg-20261017`, separate `loan_manager_dev` / `loan_manager_prod` databases. Earlier read-only inventory found PostgreSQL18, `db-f1-micro`, ZONAL,10GB, max_connections200 and configured backups/PITR; this does not establish workload headroom or a tested restore. Receipt bucket `mw-payment-receipts-prod-508610-n7` remains externally owned and unchanged. Trusted human/project administrators remain a shared-project trust boundary.

Private plans, state, public-config capture and identity proof remain outside Git under the established project private Terraform directory. Pre-runtime exact service GETs returned404 at `2026-10-11T04:57:46.4815941Z`; DNS-before capture recorded zero matching records at `2026-10-11T04:40:28.0421541Z`. Hosting release list was empty before first delivery.

### Completed bounded access inspection

At `2026-10-11T10:42:21Z`, the four named DEV reader/command/build/deploy principals completed132 permission tuples:128 `CANNOT_ACCESS`, four `UNKNOWN_INFO`, zero API errors. The four unknowns are only `iam.serviceAccounts.getAccessToken` on the PROD deployer: Policy Troubleshooter cannot resolve the external workload-identity principalSet. Exact service-account policy has the sole relevant `roles/iam.workloadIdentityUser` grant to the production GitHub pool/repository principalSet; provider is GitHub OIDC with exact repository/owner/main/production subject, while inherited policies report not granted. The tested Google service-account identities are disjoint from that external principalSet. Those four rows use reviewed structural denial proof, not an invented analyzer denial.

[Sanitized matrix and policy/provider hashes](../../project/outputs/r052-phase3/effective-access-readiness.json) covers state read/write/delete/policy, owner-secret access/mutation/policy, registry data/mutation/policy, both service update/delete/policy, all four PROD identities' actAs/token/policy, and project Hosting update. This is point-in-time scoped evidence; it does not prove protected-main automation, business authorization or exclusion of trusted human administrators. No payload access, impersonation, grants or cloud mutations occurred in the resumed check.

### Current local recovery boundary

The old `MWCredit` Windows profile was subsequently removed. Its earlier local plans, activation files, backup evidence and parked-project state are not available in the current profile; the historical retention statements above describe the earlier checkpoint, not present recovery coverage. Existing human gcloud sign-in remains usable. Current metadata confirms unchanged PROD revisions/image, owner-secret reference version1, production federation and remote application-state generation `1791694752120444`.

Verified nonsecret foundation inputs were reconstructed under `C:/Users/ideaadmin/Documents/ChatGPT/MW-Credit-App/terraform/production-recovered-20261011`. Read-only plan SHA256 `21c07a4005cbcd5aed1ef7f15a3dc15e2d5bc7b56817c2aa450142fbd9bc4fc1` has **zero resource actions**; exit2 reflects only computed `enrollment_targets` output. It was not applied. This does not recover lost backups or secret payloads. The owner restored the established database-admin password file `C:/Users/ideaadmin/Documents/ChatGPT/AppSheet-Loan-Project/cloud-sql-poc-postgres-password.txt`; guarded read-only identity verification passed for postgres / loan_manager_dev / 34.21.174.215 with transaction_read_only=on. No password reset or credential generation occurred.

Inactive business infrastructure/runtime/secret-reference/receipt-IAM definitions passed eight Terraform mock plans plus fmt/validate. All business gates default false; refreshed plan `c3fd88cfadaa6a60c984e0731e11d2d6edeca4c690d36c01191f8fbccee516af` has zero resource actions. Actual native receipt root is `appsheet/data/LoanManager_975338008_26_08_07/manual_receipts/prod/`; proposed command GET also covers `receipts/prod/`, CREATE only native `pwa/`, with no list/update/delete/reader grant. Runtime image, numeric capability/catalog secret versions and reviewed evidence pins remain prerequisites alongside SQL role isolation and promotion authority. No SQL users/grants, secrets, receipt permissions or business runtime were applied. `cloudbuild-business.yaml` is prepared; local extracted smoke passed, actual pinned-source container build remains pending.

## Prepared gates not yet applied

| Gate | Default | Proposes when enabled | Prerequisites |
| --- | --- | --- | --- |
| `chat_authorized` (R090, `chat-service.tf`) | `false` | `mw-credit-app-chat-prod` identity, Cloud SQL client/instance user, Vertex AI user, auth-status role, IAM DB user, capability-policy accessor, Cloud Run `mw-credit-app-chat-prod` (`services/chat/server.mjs`, 300 s, max 2) | Foundation, runtime and business gates; tested `business_image`; V104 applied with a verified backup; operator grants `mw_chat_api_prod`/`mw_chat_read_prod`; owner promotion instruction |
| `chat_commands.enabled` (R106, `chat-service.tf`) | `false` | Env `CHAT_COMMAND_URL` = the exact PROD command service URL on `mw-credit-app-chat-prod`; no IAM, secret, SQL grant, egress or Hosting change | `chat_authorized`; chat image that understands the variable; V118 applied with a verified backup; owner promotion instruction |

## Applied plan evidence

| Stage | Reviewed SHA256 / outcome |
| --- | --- |
| State bucket | `690183679b2b269fe61745d4307ba4d72307dbad62c7da495815b4eb8b422da5`; one create, migrated and verified |
| F1 | `257779406201b9f6639d8f393514c5bddbed9408f9b4872fc5a655f5fcd4a844`;18 resources created before Firebase quota-project context error |
| F1 completion | `99a6ec783488f18ae68f98b8c1fff43d5c694f88fff78474abb1563edff49fd9`; remaining WebApp/site/domain created after explicit provider quota project |
| DEV containment | `e617236be729aae6cf7fa3f381a1f30d09bbe5471fe6a535c8d563bcb2ee1833`; two-domain addition and one Hosting binding deletion, no-change verified |
| DNS | `71635f36e4389cf8f7722244348b58b93073b7b9b9c7c67c7ab8691aa7158a3f`; one CNAME create, verified |
| F3 | `3d9e5c6eda6b74a7882872ff8119fcb04f4c761fda95cece47c0804ba3a8bfc6`; eight creates after CI success, Ready100% readback |

## Historical target attempt — parked recovery

The earlier approved new-project attempt created `mw-credit-app-prod-20261011` / `219146337993` under organization594773370606, then billing association failed with HTTP400 `google.rpc.QuotaFailure`, subject `billingAccounts/0125EC-78CB0F-A74AAD`, description “Cloud billing quota exceeded.” No finer quota classification was supplied. Storage API/bucket creation and migration were not reached; the project remains unbilled and was not retried, deleted or reused.

Its private local state remains serial2, lineage `3b5ad514-f8ab-5f45-96fa-61bf3e1686b5`, one tainted project resource. Recovery copy SHA256 is `22037b2f971b9070aaafae299b2e1719e7baa879c199b56b4510c669dad8f1fb`. Old plan/state are parked and must not be replayed against the current target. Earlier separate-project and tenant proposals were superseded by the owner's shared-project/shared-default-auth decision; they are not current deployment instructions.
