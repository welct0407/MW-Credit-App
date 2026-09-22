# Centralized resource monitoring

Configured 22 September 2026 in Grafana Cloud stack `olivecrab1199`, using the work account.

- [Performance](https://olivecrab1199.grafana.net/d/mw-resource-performance): Azure VM, GCP VM/Cloud SQL and Railway service metrics; default last six hours, five-minute refresh.
- [Cost](https://olivecrab1199.grafana.net/d/mw-resource-cost): Azure resource costs, GCP gross/credits/net, Railway current-cycle accrued resource usage; default month to date, hourly refresh.

Both pages are in **MW Resource Monitoring**, link to each other and display times in Asia/Bangkok. Provider retention applies: these dashboards query provider APIs directly and do not copy time series into Grafana Cloud metrics storage. Panels load as they enter the viewport. No notification channels or new alerts were created.

## Coverage and calculation

| Source | Resources and scope | Performance | Cost |
|---|---|---|---|
| Azure | IDEA Prod Subscription `50f792fa-803e-4280-833d-1fe60fef5293`; VM-01 in RG-MWCREDIT | CPU, available memory, network bytes per aggregation interval, OS disk throughput | ActualCost for `rg-mwcredit` and `rg-backup`, including retained disks, networking, monitoring and VM backup; USD |
| GCP | Project `clever-oasis-508610-n7`; `vm-mw-credit-agent` and shared `appsheet-pg-prod-20260914` | VM CPU/used memory/network/disk throughput; SQL CPU/memory/storage/connection count | Detailed Cloud Billing export to `mw_cloud_billing` (US), filtered to this project; SGD; gross plus negative credits equals net |
| Railway | `welct0407's Projects`; MW Credit Metabase project, production environment; Metabase and Postgres services | CPU cores, memory GB, persistent volume GB | Workspace `customer.currentUsage`, USD, current billing cycle regardless of dashboard date picker |

Azure daily buckets retain the provider's UTC date (shown at 07:00 Bangkok); GCP groups usage by Bangkok date. Azure/GCP follow the selected range. Currency totals remain separate. Railway resource usage excludes the invoice treatment of plan fees, included usage, credits and adjustments. There is no fabricated forecast or mixed-currency grand total. Missing values remain unavailable.

GCP detailed billing export was enabled on 22 September. Its first records were still pending at implementation verification. The query discovers the export table automatically; before it exists the detail table returns **Awaiting first billing export**, and totals show **No data**. Actual GCP cost reconciliation remains pending first delivery. Queries reject truncation, incomplete BigQuery jobs and GraphQL errors rather than silently showing partial totals. BigQuery billing queries have a 100 MB billed cap; shorten the time range if this cap is reached.

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
