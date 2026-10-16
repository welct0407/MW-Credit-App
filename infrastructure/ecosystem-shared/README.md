# R057 ecosystem adoption: shared

Shared DEV/PROD SQL instance and receipt bucket metadata only. Never manage database users/content or receipt objects here. The API-unset maintenance window remains externally managed through the precise lifecycle exception.

Terraform 1.16.5 and the committed provider lockfile pin the reviewed implementation. The existing protected GCS backend bucket is `mw-credit-app-tfstate-737787224638` with the unique `ecosystem-shared` prefix. Use the existing GCP operator authentication for backend access; Azure roots additionally use the established Azure CLI account. Keep credentials, TF_DATA_DIR, saved plans and diagnostic output outside every repository.

Initialize this root with its pinned lockfile, then review an ordinary refreshed plan. The retained import blocks document exact identities and are idempotent once imported. All resources have `prevent_destroy`. Future configuration changes need their own scoped authorization; adoption does not authorize restart, replacement, resizing, credential rotation or business-data changes.

Recovery from ownership mistakes is a reviewed Terraform state ownership correction using the versioned protected backend, never `terraform destroy` or cloud deletion. Preserve existing remote objects and other state prefixes. See [sanitized adoption evidence](../../project/outputs/infrastructure-adoption-r057/import-results.json) for exact addresses, import IDs, saved-plan hashes and post-import results. Private saved plans/diagnostics are retained until review on 20 October 2026.

## AppSheet retirement (14 October 2026 Bangkok)

Owner-authorized retirement removed the73 AppSheet-only authorized networks. The sole retained public allowlist is the existing Flyway workstation; native Cloud SQL connectors/IAM and all other instance settings are preserved. Receipt bucket unchanged. The pinned Google provider attempted to resend the API-unset maintenance window and SQL rejected day0. A narrow SQL Admin PATCH applied only settingsVersion plus authorizedNetworks, omitting the window; live readback changed only networks/version/etag and refreshed Terraform plan has no changes. Do not invent a maintenance day to work around this provider limitation. [Evidence](../../project/outputs/r057-appsheet-retirement/network-retirement-evidence.json).

## Database flags (R064 Wave 4, prepared 16 October 2026, not applied)

`owned.tf` now removes the four `pg_cron` flags (`cloudsql.enable_pg_cron`, `cron.database_name`, `cron.max_running_jobs`, `cron.timezone`; no scheduler uses them and `cron.database_name` named PROD) and lowers `max_connections` from 200 to 50 (DB-PERF-03). Cloud SQL has no `shared_preload_libraries` flag, and it already preloads `pg_stat_statements`; V93 only creates the extension (schema `monitoring`), so DB-PERF-04 needs no flag and no restart. Remaining flags: `cloudsql.iam_authentication=on` and `max_connections=50`.

- The refreshed plan changes only `database_flags` in place (0 add, 1 change, 0 destroy); nothing else drifted.
- Every changed flag needs a restart. Applying restarts the shared instance, so `loan_manager_prod`, `loan_manager_dev` and `mw_agent` are all unavailable for about 1 to 5 minutes. In-flight commands can end with an unknown outcome and must be reconciled before any retry.
- Expect the R057 maintenance-window 400 from provider 8.6.0 (it changes nothing). The documented exception is the narrow `gcloud sql instances patch ... --database-flags=cloudsql.iam_authentication=on,max_connections=50`, then a refreshed plan that shows no changes.
- Evidence behind 50: daily peak `num_backends` is 12 to 13 since AppSheet retired on 14 October (the earlier 50 to 106 peaks were AppSheet connections). The configured worst case is about 39 of the roughly 47 usable. Revisit before raising Cloud Run caps or reactivating any connector.
- Needs a separate owner go with an on-demand backup first. Not authorized yet.
