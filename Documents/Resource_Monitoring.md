# Centralized resource monitoring

For an explanation of every visual on both pages, see the maintained [Dashboard visual guide](Resource_Monitoring_Dashboard_Guide.md). Update that guide with every dashboard change; this document owns operational setup/access/recovery details.

Configured 22 September 2026 in Grafana Cloud stack `olivecrab1199`, using the work account.

Friendly hostname: **monitor.mw-credit.com**. Cloudflare DNS-only CNAME points to `olivecrab1199.grafana.net`; Grafana's instance URL is configured as `https://monitor.mw-credit.com`, with provider-managed HTTPS. Grafana authentication still applies. The work account has Performance as its personal home dashboard, so the root hostname opens it after sign-in; the user timezone preference is also Singapore. Reverting the domain requires restoring the original instance URL in the Cloud Portal before removing the dedicated CNAME.

- [Performance](https://monitor.mw-credit.com/d/mw-resource-performance): Azure VM, GCP VM/Cloud SQL and Railway metrics plus availability; default last six hours, two-minute refresh.
- [Cost](https://monitor.mw-credit.com/d/mw-resource-cost): Azure resource costs, GCP gross/credits/net, Railway current-cycle accrued resource usage; default month to date, hourly refresh.

Both pages are in **MW Resource Monitoring**, link to each other and display times in Asia/Singapore. Provider retention applies: these dashboards query provider APIs directly and do not copy time series into Grafana Cloud metrics storage. Panels load as they enter the viewport. No notification channels or new alerts were created.

The overview has four rows: CPU cards, matching RAM cards, connectivity/provider/application cards, then Debian service cards. RAM cards use large single percentages with CPU-style sparklines. Cloud SQL's overview uses only `database/memory/components` Usage (displayed as Used); its detailed chart retains Usage, Cache and Free. Live labels are case-sensitive and values already use 0–100 percentages. Metabase's RAM card divides used RAM by its corresponding live Railway memory limit. The previous SQL utilization metric is not used; its 100% reading did not establish memory pressure. Percentage/count/throughput labels use whole numbers; fractional core/GB charts retain useful precision. Currency totals and tables retain cents; the daily cost chart uses whole-dollar labels.

## Availability rows

The 16 overview tiles are arranged in four visibly labeled groups across two rows:

- **Connectivity:** public webhook, Cloudflare tunnel, Tailscale node, local ingress.
- **Apps & OpenAI:** production OLTP/OLAP API probes, published ChatGPT/Codex status.
- **Agent workflows:** conversation worker, receipt worker, Instagram polling, daily jobs.
- **Data & runtime:** SQL connections (configured limit 200), database access, audit relay, local Codex readiness.

Each tile has one label with a component icon. Status lights replace repeated UP text: green healthy, orange degraded, red down, blue paused, white unknown. The compact context strip contains the legend; the SQL tile remains a numeric count and turns red at 200. Icons are Unicode pictograms, not official vendor logos. The header and group strips use one grid unit with vertically centered static stat labels; tiles use three units instead of five (40% shorter), with 36 px status lights. CPU/RAM summaries and detailed performance charts retain their existing meaning.

- Debian runs the dedicated `mw-resource-health.timer` every two minutes, using `/opt/mw-resource-monitoring/debian-health.py` with the existing integration-agent virtual environment and `mwagent` identity. It exports only numeric states to `custom.googleapis.com/mw_resource_monitoring/health` through the existing VM identity's Monitoring Metric Writer permission. It starts no business workers and sends no test messages or model prompts. Business schedules/activation flags are unchanged.
- States are DOWN (0), UP (1), DEGRADED (2), PAUSED (3), UNKNOWN (4). Missing reports or reports older than six minutes return UNKNOWN at query time. Timer checks use recent successful completion and a maximum run duration; a normally inactive one-shot service is healthy between runs. A failed member cannot be hidden by a healthy member in a grouped card.
- Database health checks the proxy and read-only `SELECT 1` in the separate agent-state and business reporting databases. AppSheet checks use the existing bounded Find-only probe with each app's own key, and do not certify browser load/sync. Codex readiness checks executable/login state only; it does not prove model inference or available quota. The disabled app GUI executor stays disabled. Audit relay health checks its timer/result, not a claim of zero pending business work.
- Tailscale checks Debian's Running/Online state and local health warnings, as selected by the owner. It is not an external peer reachability test. Tunnel health checks the local process and Cloudflare HA connection metric: four connections healthy, fewer degraded, zero down.
- Google Cloud uptime check `mw-webhook-external-health-ySLl0784KgI` independently checks `https://hooks.mw-credit.com/health` every five minutes from Singapore, Belgium and Oregon. It validates HTTPS, HTTP 200 and the expected response body. All three recent checks must pass for UP; mixed results are DEGRADED, all failures DOWN, and missing/stale checker reports UNKNOWN. It does not submit a webhook business event. Saved configuration: `webhook-uptime-check.json`.
- OpenAI status comes directly from its public summary API via credential-free Infinity source `mw-public-status` (`cfz10a9eaokjkd`), restricted to `https://status.openai.com`. ChatGPT aggregates the feed's available login/search/uploads/voice/deep-research/agent/desktop components; Codex aggregates Web/API/CLI/VS Code. Missing expected components return UNKNOWN. These are published provider reports, not tests of this account/session, and the feed does not expose every ChatGPT function separately.
- The initial OpenAI UNKNOWN/error display was caused by the already-open dashboard not resolving the newly created data source. Reloading refreshed that source cache; both provider cards subsequently returned healthy. A later UNKNOWN must still be investigated using the panel error or missing-component result rather than assumed to have the same cause.
- Availability selectors test freshness against current time even if the dashboard range is historical; a historical range cannot turn stale data green. A refresh is required to update the display. Query errors show UNKNOWN with Grafana's error indicator. No new notifications or alert policies were installed.

VM-01 is not available 24x7 and is **not** a monitoring dependency. Its provisional external-probe script and scoped publisher role were removed; no scheduled task was installed. The external webhook check and OpenAI queries are independent of both VMs. Other Debian-local cards become UNKNOWN if Debian stops reporting.

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

Azure daily buckets retain the provider's UTC date (shown at 08:00 Singapore); GCP groups usage by Singapore date. Azure/GCP follow the selected range. Native-currency detail totals remain separate. The top stacked overview converts Azure/Railway USD using the latest daily ECB USD/SGD reference from Frankfurter and combines them with GCP net SGD. Its legend shows platform amounts, and its coverage table shows the reported subtotal, rate/date, missing GCP and Railway cycle dates. This combines provider periods rather than claiming a common-period invoice. Missing GCP remains null, not zero; the subtotal is incomplete until all sources are available. FX older than seven days and unexpected currencies are rejected. Historical selections use latest-reference FX, not transaction-date FX. Railway usage excludes invoice treatment of plan fees, included usage, credits and adjustments. There is no forecast.

GCP detailed billing export was enabled on 22 September. Its first records were still pending at implementation verification. The query discovers the export table automatically; before it exists the detail table returns **Awaiting first billing export**, and totals show **No data**. Actual GCP cost reconciliation remains pending first delivery. Queries reject truncation, incomplete BigQuery jobs and GraphQL errors rather than silently showing partial totals. BigQuery billing queries have a 100 MB billed cap; shorten the time range if this cap is reached.

The follow-up inspection verified **Detailed usage cost: Enabled** in the Cloud Billing console, the exact destination project/dataset, `billing-export-bigquery@system.gserviceaccount.com` OWNER access and the monitoring account's READER access. BigQuery still reported zero export tables. No missing configuration was found. Google's [export documentation](https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery) says initial multi-region backfill can take up to five days before current usage is visible. Enabling standard/pricing exports is not required by this dashboard.

## Access and maintenance

The SGD overview adds credential-free Infinity source `mw-public-fx` (`efz19dcu6cwzka`), restricted to `https://api.frankfurter.dev`. It requests only public USD/SGD reference data; no cloud costs or provider credentials are sent to that service. Its sanitized definition is `outputs/resource-monitoring-20260922/public-fx-source.json`. FX is queried on the hourly cost-dashboard refresh. The coverage panel reuses the overview query results. The overview itself makes additional aggregate reads of the existing cost providers; avoid repeated manual cost refreshes because Azure throttling still applies. Restore private `cost-before-sgd-v2.json` for this overview's rollback; remove the FX source only after no panels reference it.

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
