# Centralized resource monitoring

Configured 22 September 2026 in Grafana Cloud stack `olivecrab1199`, using the work account.

Friendly hostname: **monitor.mw-credit.com**. Cloudflare DNS-only CNAME points to `olivecrab1199.grafana.net`; Grafana's instance URL is configured as `https://monitor.mw-credit.com`, with provider-managed HTTPS. Grafana authentication still applies. The work account has Performance as its personal home dashboard, so the root hostname opens it after sign-in; the user timezone preference is also Singapore. Reverting the domain requires restoring the original instance URL in the Cloud Portal before removing the dedicated CNAME.

- [Performance](https://monitor.mw-credit.com/d/mw-resource-performance): Azure VM, GCP VM/Cloud SQL and Railway service metrics; default last six hours, five-minute refresh.
- [Cost](https://monitor.mw-credit.com/d/mw-resource-cost): Azure resource costs, GCP gross/credits/net, Railway current-cycle accrued resource usage; default month to date, hourly refresh.

Both pages are in **MW Resource Monitoring**, link to each other and display times in Asia/Singapore. Provider retention applies: these dashboards query provider APIs directly and do not copy time series into Grafana Cloud metrics storage. Panels load as they enter the viewport. No notification channels or new alerts were created.

The performance overview has four CPU cards followed by matching Azure VM, GCP VM, Cloud SQL and Metabase memory charts. Percentage/count/throughput labels use whole numbers; fractional core/GB charts retain useful precision. Currency totals and tables retain cents; the daily cost chart uses whole-dollar labels.

## Verified limits (22 September 2026)

Red dashed lines mark capacity or configured limits, not invented warning thresholds. Percent utilization charts mark 100%; Azure available memory has its exhaustion reference at 0%. Cloud SQL's instance-wide `max_connections` is **200**; reserved PostgreSQL slots reduce availability for ordinary clients. Cloud SQL storage utilization is relative to its current allocation (10 GB at inspection), with storage auto-resize enabled; 100% is not a fixed lifetime storage budget.

Railway CPU and memory charts query **CPU_LIMIT** and **MEMORY_LIMIT_GB**, so limit changes appear at their actual times. At inspection Metabase was 2 cores / approximately 2 GB, and Postgres 1 core / approximately 0.5 GB. Postgres's attached volume is 5000 MB (5 GB); Metabase has no attached persistent volume, so it is omitted from the volume chart. Azure OS disk's configured baseline throughput is 100 MB/s, shared across reads/writes; the reference line is not a separate allowance per series and does not model burst/cache/VM effects.

Fixed references (Cloud SQL connection flag, disk baseline and volume allocation) are verified configuration snapshots. Update them if those settings change. Other network/GCP disk throughput charts have no directly comparable configured hard ceiling exposed by these queries; no arbitrary limit is drawn. Subscription fees/included credits are not hard spending limits.

## Coverage and calculation

| Source | Resources and scope | Performance | Cost |
|---|---|---|---|
| Azure | IDEA Prod Subscription `50f792fa-803e-4280-833d-1fe60fef5293`; VM-01 in RG-MWCREDIT | CPU, available memory, network bytes per aggregation interval, OS disk throughput | ActualCost for `rg-mwcredit` and `rg-backup`, including retained disks, networking, monitoring and VM backup; USD |
| GCP | Project `clever-oasis-508610-n7`; `vm-mw-credit-agent` and shared `appsheet-pg-prod-20260914` | VM CPU/used memory/network/disk throughput; SQL CPU/memory/storage/connection count | Detailed Cloud Billing export to `mw_cloud_billing` (US), filtered to this project; SGD; gross plus negative credits equals net |
| Railway | `welct0407's Projects`; MW Credit Metabase project, production environment; Metabase and Postgres services | CPU cores, memory GB, persistent volume GB | Workspace `customer.currentUsage`, USD, current billing cycle regardless of dashboard date picker |

Azure daily buckets retain the provider's UTC date (shown at 08:00 Singapore); GCP groups usage by Singapore date. Azure/GCP follow the selected range. Currency totals remain separate. Railway resource usage excludes the invoice treatment of plan fees, included usage, credits and adjustments. There is no fabricated forecast or mixed-currency grand total. Missing values remain unavailable.

GCP detailed billing export was enabled on 22 September. Its first records were still pending at implementation verification. The query discovers the export table automatically; before it exists the detail table returns **Awaiting first billing export**, and totals show **No data**. Actual GCP cost reconciliation remains pending first delivery. Queries reject truncation, incomplete BigQuery jobs and GraphQL errors rather than silently showing partial totals. BigQuery billing queries have a 100 MB billed cap; shorten the time range if this cap is reached.

The follow-up inspection verified **Detailed usage cost: Enabled** in the Cloud Billing console, the exact destination project/dataset, `billing-export-bigquery@system.gserviceaccount.com` OWNER access and the monitoring account's READER access. BigQuery still reported zero export tables. No missing configuration was found. Google's [export documentation](https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery) says initial multi-region backfill can take up to five days before current usage is visible. Enabling standard/pricing exports is not required by this dashboard.

## Access and maintenance

All three data sources use the installed Infinity plugin's backend parser and encrypted credentials. Their allowed destination hosts are restricted to the corresponding provider APIs. UIDs: `mw-azure-monitoring`, `mw-gcp-monitoring`, `mw-railway-monitoring`.

- Azure app `mw-grafana-monitoring`, app ID `c285a10c-5054-4f79-928f-46d7488b3f46`: Monitoring Reader on RG-MWCREDIT, Cost Management Reader on RG-MWCREDIT and RG-BACKUP. Its one-year secret was created 22 September 2026; rotate before September 2027 and update Grafana's encrypted field.
- GCP service account `mw-grafana-monitoring@clever-oasis-508610-n7.iam.gserviceaccount.com`: Monitoring Viewer and BigQuery Job User on the project, reader on the dedicated billing dataset. Both key-creation constraints (`iam.disableServiceAccountKeyCreation` and `iam.managed.disableServiceAccountKeyCreation`) were restored to inherited enforced state immediately after the approved key creation. Existing key remains usable. Rotation needs the same scoped policy procedure/authority.
- Railway `mw-grafana-monitoring` workspace token: owner explicitly approved its workspace scope, including the fact Railway does not offer a read-only toggle there. Dashboard queries are read-only; the credential itself can write. Restrict Grafana access to trusted users. Allowed-host controls restrict destinations, not GraphQL operations.
- Temporary Grafana setup account: `mw-resource-monitoring-setup`, ID 18; one-day setup token. This account is for provisioning only, not runtime data-source authentication; revoking it does not stop dashboards. See change log for cleanup verification.

Private credentials/recovery records are under `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\resource-monitoring`, outside Git. Git publication covers definitions and scripts only, not credential recovery. No plan upgrade was purchased. Existing Grafana trial status was displayed during setup; continued account availability remains controlled by its plan.

## Rebuild and recovery

Maintained scripts: [scripts/monitoring](../scripts/monitoring/README.md). Generated dashboard JSON and sanitized query checks: [outputs/resource-monitoring-20260922](../outputs/resource-monitoring-20260922/). Change record: [CHANGE_NOTES_RESOURCE_MONITORING_2026-09-22](../Change%20Logs/CHANGE_NOTES_RESOURCE_MONITORING_2026-09-22.md).

For dashboard recovery, import the saved JSON into the same folder with the three existing data-source UIDs. For full recovery, restore private provider credentials separately and recreate only the dedicated data sources. Do not rerun identity initialization against existing identities/keys. Before intentional updates, capture current dashboard definitions; `Publish-Dashboards.ps1 -Update` does this privately.

Rollback removes the two new dashboards and three dedicated data sources, revokes the dedicated provider credentials/roles, and disables this billing export if no longer wanted. Preserve billing export records unless deletion is separately intended. Do not touch vendor dashboards, existing provider agents/alerts, AppSheet definitions, business databases or Railway staged service changes.
