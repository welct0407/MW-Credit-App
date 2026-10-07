# Development and infrastructure

Established 7 October 2026. Infrastructure is managed in this repository; shared SQL migrations and promotion tooling are now owned here under database/. Overall release coordination remains in AppSheet-Loan-Project.

## Resources

| Component | Development resource |
| --- | --- |
| Google project | clever-oasis-508610-n7 (737787224638) |
| Region | asia-southeast1 |
| Cloud Run | mw-credit-app-api-dev; IAM protected; zero minimum/two maximum instances |
| Firebase Hosting | mw-credit-app-dev-737787224638 |
| Artifact Registry | asia-southeast1/mw-credit-app |
| Runtime service account | mw-credit-app-dev@clever-oasis-508610-n7.iam.gserviceaccount.com |
| Build / deploy identities | mw-credit-app-build / mw-credit-app-deploy in the same project |
| Existing SQL instance | appsheet-pg-prod-20260914 |
| Development database | loan_manager_dev |
| Existing receipt bucket | mw-payment-receipts-prod-508610-n7 |
| New storage prefix | mw-credit-app/dev/ |
| Secret Manager | mw-credit-app-dev-vapid |
| Terraform state bucket | mw-credit-app-tfstate-737787224638; versioned; prefixes bootstrap and development |
| Cloud Build source bucket | mw-credit-app-builds-737787224638; 14-day source cleanup |

The existing SQL instance, GCS receipt bucket, AppSheet apps, Metabase, Grafana and business schedulers are retained. Terraform manages additive identities/bindings and an IAM database login, not the shared instance or receipt bucket. Initial infrastructure setup added no business table privileges or schema migrations. Checkpoint 2A subsequently added nine exact DEV-only column SELECT grants for the dedicated reader; see the read-service guide. The runtime checks its exact DEV database/instance/prefix before starting; PostgreSQL grants must be designed and verified with the first business API.

## Credentials

Cloud Run uses its attached service account and automatic IAM database authentication. GitHub delivery uses Workload Identity Federation: numeric repository/owner IDs, main branch and development environment are required. No service-account keys or database passwords are needed for the new runtime or delivery path.

Secret Manager holds the VAPID private key. Terraform creates only the container and IAM; the payload is generated with `node scripts/initialize-secrets.mjs` and sent through stdin. Existing versions are preserved. Never print or export secret values into this repository. Push delivery itself is not yet implemented.

Existing services retain their existing credential arrangements; infrastructure setup did not rotate their credentials. Future integration credentials belong in separate Secret Manager secrets with access granted only to the relevant runtime.

Human tooling reuses the existing gcloud sign-in and Git Credential Manager. It does not copy their authentication stores. Private Terraform working data, plans and recovery files on VM-01 are under:
`C:/Users/MWCredit/Documents/ChatGPT/MW-Credit-App/terraform`.
Plans/state include sensitive OAuth provider payloads read from Secret Manager; never publish them. Secret Manager storage does not keep those payloads out of Terraform state/plan.

## Installed VM-01 tooling

Dot-source `scripts/Enter-Dev.ps1` in each shell. It selects Node 24.21.0 / npm 11.19.0, Terraform 1.16.5 and GitHub CLI 2.102.0 under the user's LocalAppData MWCredit/tools folder, and reuses gcloud, PostgreSQL 18.6 and Flyway 13.6.0. Official archive SHA256 checks were verified for the new installations. Playwright Chromium is installed in the user cache. Repository dependencies use the root package lock.

Docker builds run in Cloud Build or GitHub Actions; local Docker is not required. Do not run the shared Flyway runner against a database merely to test tool installation. Shared schema changes follow [the canonical database procedure](../database/README.md).

For another workstation, install the versions pinned in .nvmrc and Terraform required_version, use its supported gcloud authentication, run npm ci and npx playwright install chromium, and adapt the local paths in Enter-Dev.ps1. The PowerShell helper is VM-01 specific.

## Terraform

```powershell
./scripts/Invoke-Terraform.ps1 -Stack dev -Command init
./scripts/Invoke-Terraform.ps1 -Stack dev -Command validate
./scripts/Invoke-Terraform.ps1 -Stack dev -Command plan
# Review the plan before applying its exact saved file:
./scripts/Invoke-Terraform.ps1 -Stack dev -Command apply
```

Both stacks use the versioned remote GCS backend. The bootstrap bucket has already been created and local state migrated. Do not repeat the initial local bootstrap or create competing state. The helper obtains a temporary access token and removes it afterwards. Terraform manages service settings; application image changes are deliberately ignored and owned by artifact delivery.

## Build and delivery

CI runs TypeScript/build, six configuration guard tests, desktop/mobile browser checks, dependency audit and Terraform formatting/validation. Manual Deploy development builds an immutable image, updates the new service, calls its private readiness endpoint and publishes the synthetic Hosting site through the official Firebase REST API. It runs only from main and the development environment.

The hosting deployer uploads gzip files by content hash, finalizes a version and creates a release. No Firebase CLI or persistent Firebase token is required. The public site contains no borrower/customer data; the API remains IAM protected. Checkpoint 2A now implements owner-only Firebase Google authentication and a separate DEV Borrowers read service; the original readiness API stays IAM-protected. Live owner validation remains pending.

Local commands:

```powershell
npm ci
npm run check
npm run test:e2e
npm audit --audit-level=moderate
```

## Verification and rollback

The initial Cloud Build a7e25d62-8461-4a2d-bc6e-b34ca2c6eefb succeeded. Live /readyz verified the exact DEV database identity using a read-only query, accessed the managed secret without returning its value, and wrote/read/deleted a synthetic object in the dedicated health prefix. It does not test financial posting or table permissions.

For an application rollback, redeploy a previously verified Artifact Registry digest to the new Cloud Run service and restore the prior Firebase Hosting version. Keep the old AppSheet apps serving their existing users. This does not undo SQL/financial writes. No such writes were made during setup.

For infrastructure recovery, review versioned GCS state and Git configuration together. Do not blindly restore old state or run terraform destroy: shared project bindings and the SQL IAM login must be assessed first. Secret, state bucket, Firebase project and Cloud Run deletion guards are intentional. Preserve Secret Manager versions; never regenerate a lost key as if it were recovery.

## Next application work

Complete checkpoint 2A real owner sign-in/read and UID pinning, then continue separately accepted business slices. Add governed Metabase/Grafana integration when application endpoints and metrics exist. Mobile posting requires online confirmation; offline viewing/drafts remain in scope. No duplicate business job scheduler, production API or cutover has been activated.

## Completed delivery evidence

[CI 37584672421](https://github.com/welct0407/MW-Credit-App/actions/runs/37584672421) and [deployment 37584673770](https://github.com/welct0407/MW-Credit-App/actions/runs/37584673770) both passed for source fa9679f. GitHub used OIDC throughout; its development environment permits main only. The private readiness probe verifies database, storage and secrets before Hosting publication. Both Terraform stacks returned no-change plans. See [sanitized verification](../outputs/infrastructure-20261007/verification.json). Anonymous API requests returned HTTP 403; the public synthetic page returned HTTP 200. Development infrastructure is ready; the next scope is application authentication and business functionality.

Database tooling ownership moved here on 7 October 2026. Enter-Dev.ps1 selects current-account copies under C:/Users/ideaadmin/AppData/Local/MWCredit/database-tools because PostgreSQL restricted subprocesses cannot read the prior account’s private tool directory. The local V1–V77 disposable rebuild, no-op rerun and checksum-rejection checks passed. See [database ownership](../database/OWNERSHIP.md).

## Read/access checkpoint 1B

The local preview implements a tested synthetic read/access contract before live integration. Its scenario controls simulate access outcomes; they do not sign in or verify tokens. The current Cloud Run health/readiness server remains unchanged. See the [read/access change record](../Change%20Logs/CHANGE_NOTES_R052_READ_ACCESS_CONTRACTS_2026-10-07.md) and project checkpoint design for implementation status and limits.

## Checkpoint 2A deployment

Separate read service: https://mw-credit-app-read-dev-pvrgvyg3oq-as.a.run.app. The owner explicitly approved service-only Firebase application authentication after domain-restricted sharing rejected allUsers membership. Terraform applied only invoker_iam_disabled false to true; organization policies and the old API are unchanged. [Read-service details](Development_Read_Service.md). The persistent owner-identity secret container is empty until real owner login; tracked mode remains email-bootstrap. Hosting live publication and owner validation remain pending.
