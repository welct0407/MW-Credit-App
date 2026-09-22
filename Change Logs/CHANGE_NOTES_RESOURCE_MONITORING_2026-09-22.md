# Centralized resource monitoring — 22 September 2026

## Scope and authority

Owner requested implementation of Grafana Cloud monitoring for Azure VM, GCP VM/Cloud SQL and Railway, with separate performance and cost pages. This is infrastructure monitoring, not an AppSheet definition or business database promotion.

Starting Git commit: `a0e2d394a251bb155e73f667c672785b7bf30e48`. Existing R016 reporting/model edits are unrelated and must remain untouched.

## Baseline and rollback

- Grafana stack: `olivecrab1199.grafana.net`, work account. Existing data sources are Grafana-managed defaults; existing dashboards are vendor-provided. New monitoring assets will use distinct names/UIDs. Rollback removes only the new assets and dedicated access.
- Azure: tenant `9e29c895-606a-420b-acc2-1c24375df4d9`; VM `VM-01`, resource group `RG-MWCREDIT`, subscription `50f792fa-803e-4280-833d-1fe60fef5293`, Southeast Asia. User completed sign-in as requested.
- GCP: project `clever-oasis-508610-n7`; VM `vm-mw-credit-agent`, zone `asia-southeast1-a`; Cloud SQL target remains the shared `appsheet-pg-prod-20260914` instance. Monitoring/BigQuery APIs already enabled. No BigQuery datasets returned at baseline.
- Railway: existing MW Credit Metabase project `c8e57452-36dc-41f1-8d00-856b521a96c7`; production environment `df3ba125-0d62-446a-b4d8-5196780982c9`. An unrelated staged service change was visible; it must not be deployed by this task.
- Credentials and private recovery records: `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\resource-monitoring`. No credential recovery coverage claimed merely from this folder.

## Decisions and changes

- Owner approved temporary Grafana setup access. Created `mw-resource-monitoring-setup`, numerical ID 18, Editor plus Data Sources Creator/Reader/Writer. Token `setup-20260922-1day` expires 23 September; revoke after setup.
- Owner approved a project-scoped temporary GCP service-account key-creation policy exception, one dedicated monitoring key, and immediate restoration of enforcement. Dedicated identity is limited to monitoring and the billing dataset.
- Preserve native billing currencies and distinguish credits, accrued usage and forecasts. Missing data must not be shown as zero.
- Created Azure `mw-grafana-monitoring` app/service principal with Monitoring Reader on RG-MWCREDIT and Cost Management Reader on RG-MWCREDIT/RG-BACKUP. Created one-year secret privately. No workload restart or configuration change.
- Created GCP dedicated monitoring service account, project Monitoring Viewer/BigQuery Job User roles and reader access to `mw_cloud_billing` in US. Enabled detailed Cloud Billing export to this dataset. Both legacy and managed service-account key-creation constraints were restored to inherited enforced state after the approved key creation.
- Owner approved Railway `mw-grafana-monitoring` workspace token, including its write capability. Only read queries are used. Existing staged service change was not deployed.
- Created three Infinity backend data sources, with provider-specific allowed hosts and credentials in Grafana encrypted settings. Data-source UIDs and precise coverage are recorded in [Resource_Monitoring.md](../Documents/Resource_Monitoring.md).
- Published `MW Resources · Performance` (24 panels) and `MW Resources · Cost` (16 panels) in folder `mw-resource-monitoring`. Five-minute performance refresh; hourly costs; Bangkok timezone; navigation links between pages. Queries run directly against provider APIs. No new alert delivery or subscriptions.
- Added maintained initialization, query, build, verification and publication scripts under `scripts/monitoring`; sanitized JSON definitions/checks under `outputs/resource-monitoring-20260922`; operating/recovery reference under `Documents/Resource_Monitoring.md`. No AppSheet model/dictionary change, business DB migration or product release number applies.

## Rollback details

Existing vendor dashboards/data sources and provider resources were preserved. Initial source inventory and later before-update dashboard snapshots are stored privately. Rollback removes only the two new dashboards, three dedicated sources and dedicated provider access, and disables this detailed export if unwanted. Preserve exported billing records unless separately authorized to delete them. Existing GCP organization policy inheritance was restored, not replaced with an organization-wide change.

The initialization scripts refuse existing credentials/identities rather than rotate or overwrite them. Live dashboard updates capture private baseline JSON. Credential backups are outside Git; no off-device credential recovery coverage is claimed.

## Verification and status

- All 22 retained unique performance queries returned HTTP 200 and real samples (72/73 points over six hours). Two exploratory ephemeral-disk queries returned no rows and were excluded from the final dashboard; their original check evidence remains labeled by panel name.
- Azure cost returned 98 RG-MWCREDIT and 12 RG-BACKUP rows. UI total reconciled to the combined raw query total. Shared dashboard queries feed the cost summary/chart/resource table without repeated source requests for each visualization.
- Railway cost returned one row, and the UI rendered current accrued USD usage and billing-cycle dates. Source API GraphQL errors are handled explicitly.
- GCP BigQuery query succeeded with the pending-export row and null amounts. UI verified **Awaiting first billing export** and **No data** totals, not zero. Populated-export cost reconciliation remains pending Google's initial delivery; no live GCP cost total is claimed. The dashboard discovers the table automatically when it appears.
- Current Grafana UI verified all four performance sections, cost summaries/table fields, correct units and navigation. Saved final dashboard versions/panel counts were read back; evidence is `verification-summary.json`. Azure provider throttling occurred during early probing; subsequent live queries and GUI rendering succeeded, with a dedicated ClientType header and hourly cost refresh.
- Temporary Grafana setup token was revoked; HTTP 401 verified using the old token. Setup service account was also disabled. Runtime provider credentials remain dedicated to the data sources. Evidence: `setup-access-cleanup.json`.
- PowerShell parser checks passed. Generated dashboard definitions contain no secrets. Repository publication is the final closure step; only this task's scripts, documentation and sanitized definitions/checks are included. Unrelated R016 work is preserved.

**Status:** dashboards published and live performance/Azure/Railway data verified; GCP cost export connected, awaiting first provider delivery. No further owner action is required for the automatic first load, but actual GCP amounts cannot be reconciled before records exist.

## Owner refinements — 22 September 2026

Baseline: commit `c843fb46badf48ef21fd201a2ffa5261072b5574`. Full pre-refinement Grafana v2 resources were captured from the authenticated code editor to the private monitoring folder (`performance-before-refinement-v2.json`, `cost-before-refinement-v2.json`) before editing. These are the dashboard rollback points; unrelated R016 changes remain untouched.

- Added four memory charts directly beneath the four CPU overview cards. Removed unnecessary decimals from percentage/count/throughput and daily cost chart labels; retained useful fractional core/GB precision and cents in monetary totals/tables.
- Added verified reference lines: 100% utilization, Cloud SQL max_connections=200, Azure OS disk baseline 100 MB/s, Railway Postgres volume 5 GB, and live Railway CPU/memory limit series. Recorded baseline-versus-hard-limit caveats and auto-resizing Cloud SQL storage in the operating reference. No invented spending/network limits or workload configuration changes.
- Set both dashboards to Asia/Singapore and GCP billing day grouping to Singapore. Set the work user timezone preference to Singapore and personal home dashboard to Performance (previously both Default).
- Investigated GCP billing: detailed export is enabled for the intended US dataset, Google billing exporter has OWNER access and monitoring identity has READER access. Both table inventory and INFORMATION_SCHEMA show zero export tables. This is pending first delivery, not a missing query permission. Google documents that initial multi-region backfill can take up to five days; actual GCP amounts remain unverified until delivered.
- Owner selected monitor.mw-credit.com. Added its DNS-only Cloudflare CNAME to olivecrab1199.grafana.net (TTL Auto), then configured the Grafana Cloud instance URL. DNS resolution, managed HTTPS, sign-in and authenticated dashboard loading were verified. Root URL opens Performance for the work user; both pages retain navigation links. Rollback restores the old Grafana instance URL before deleting only the new CNAME; profile preferences can be reset to Default.
- Updated maintained dashboard generation, added conversion to the current Grafana v2 editor resource, and saved sanitized definitions plus refinement-verification.json. Applied dashboard changes through the authenticated UI; no new Grafana credentials were created and the old setup token/service account remain revoked/disabled.

Relevant verification: generated JSON and PowerShell syntax checks, successful Grafana saves, live four-memory layout/real samples, whole-number labels, Singapore +08 display, Cloud SQL 200-connection reference, live Railway limits, cost amounts retaining cents and custom-domain landing. No AppSheet model/dictionary or business schema change applies. Initial verification-summary.json remains dated evidence of the original publication; refinement-verification.json records this batch. GCP populated-export reconciliation is the sole provider-data dependency still pending.

## Cloud SQL memory metric correction — 22 September 2026

Owner requested replacing the misleading utilization metric with memory components. Starting commit `683efcf90251a529dba1aec47afbb50e1ec725c4`; current live dashboard captured privately as `performance-before-components-v2.json` before mutation. Restore that JSON through the authenticated editor for rollback.

Changed only performance panel 8 (overview) and panel 32 (Cloud SQL detail) live: `cloudsql.googleapis.com/database/memory/components`, filtered separately to the observed case-sensitive component labels Usage, Cache and Free. Usage is labeled Used. Values are already percentages, so both panels use a 0–100 scale, whole-number labels, distinct orange/blue/green lines and a compact legend. The 100% reference denotes capacity, not a pressure alarm. The previous utilization metric and misleading Used interpretation are removed. Singapore timezone and other panels are preserved.

Verified all three generated filtered queries against the live provider: one series per component and six aligned samples each in the checked 30-minute window; values sum to 100%. Grafana save succeeded and both charts rendered all three component lines. PowerShell syntax and JSON configuration checks passed. Maintained generator, sanitized performance definitions, operating reference and `memory-components-verification.json` updated. No provider configuration, credentials, cost dashboard, AppSheet model or unrelated R016 changes.

## Four-row overview and service availability — 22 September 2026

Owner approved the CPU-style RAM cards, row 3 connectivity/provider/AppSheet availability, and row 4 Debian component health. Baseline `2ffdc8553720be0102095e162bb9c758098b2071`; private live rollback capture `performance-before-availability-v2.json`. Cost definitions had formatting-only working-tree differences at entry; no cost behavior was changed. Runtime monitoring is installed separately from the integration-agent package.

- Row 2 now shows four large RAM percentages/sparklines. SQL uses the Usage component only; its detailed components chart remains. Railway uses time-matched used/limit memory percentages.
- Row 3: connection count with 200 limit, external webhook, Cloudflare tunnel, Tailscale node, published ChatGPT/Codex status, OLTP/OLAP read-only API health. Row 4: local ingress, conversation/receipt/poll workers, daily jobs, database, audit relay and local Codex readiness.
- Added `/opt/mw-resource-monitoring/debian-health.py` and dedicated systemd service/timer, running as existing mwagent with its existing Python environment. Every two minutes it reads service state/results, local health/connector status, existing configuration flags, read-only database probes, local Codex login state and bounded production AppSheet Find probes. Only numeric health is exported using existing GCP VM Metric Writer permission. No private records or credential values are exported. No business job, message, inference prompt, production data write or activation-flag change was triggered.
- Added GCP external HTTPS uptime check `mw-webhook-external-health-ySLl0784KgI`: five minutes, three regions, expected status/body/TLS. Added credential-free `mw-public-status` Infinity source `cfz10a9eaokjkd`, allowed host only status.openai.com. Old temporary Grafana setup credentials remain revoked; changes used authenticated UI.
- Owner clarified VM-01 is not 24x7 and selected Debian Tailscale node health. Removed provisional Azure external-probe script and exact scoped Metric Publisher role created during setup. No Azure scheduled task was created. No ongoing monitoring depends on VM-01. The provisional custom-metric batch remains historical Azure telemetry, unused by the dashboard.
- UP/DOWN/DEGRADED/PAUSED/UNKNOWN map to numeric 1/0/2/3/4. Debian telemetry older than six minutes becomes UNKNOWN; external webhook requires all three recent checker reports (12-minute freshness allowance for five-minute probes/ingestion). Group aggregation preserves failures. Disabled application flags map to PAUSED. Timer idle state alone does not imply failure. Two-minute dashboard refresh is explicitly included in allowed refresh intervals.

Checks: 8 timer/group tests and 13 actual jq selector cases passed, including stale/missing data and failed external checks. All three public checker locations returned success. Real Debian exports include successful database, both AppSheet APIs, local Codex, Tailscale, tunnel and worker checks. Grafana rendered the four RAM statistics and new availability cards; OpenAI source resolves after dashboard reload. Saved dashboard definitions/refresh and final layout checked. Provider/Grafana query and script syntax checks passed. `availability-verification.json` records sanitized evidence.

Rollback restores the private dashboard capture; disables/removes only the new health timer/service/script; deletes the dedicated GCP uptime configuration and public source if unwanted. Existing business timers and provider access remain unchanged. Integration-agent operations documentation records the separate monitor. No AppSheet dictionary/schema/release change applies.

Limits: Tailscale is node health, not a peer-path test. AppSheet checks API access, not interactive load/sync. Codex readiness is local executable/login state, not a model response or quota test. ChatGPT uses the public feed's available components, which does not expose every function separately. Audit relay health verifies the process schedule/result, not an empty business backlog. No alerts/notifications were added.

## Compact grouped status overview — 22 September 2026

Owner requested a smaller header, traffic-light states, logical groups, component icons and removal of duplicate names. Baseline commit `477dd191607a43521f8c4b525e93e3d6f0b5585e`; private rollback resource `performance-before-polish-v2.json` captured from Grafana before editing. Restore that resource in Edit → Code for rollback.

- Replaced the three-unit title block with a one-unit context/legend strip. Native panel titles avoid Grafana text-body padding and HTML style sanitization. Initial markdown strips clipped; the temporary two-unit version was too tall and was superseded at the owner's request.
- Arranged all 16 tiles into four visible groups: Connectivity, Apps & OpenAI, Agent workflows, Data & runtime. Each component has one label and a distinct Unicode icon (not a vendor logo).
- Replaced UP/DOWN words with green/red/orange/blue/white lights and a shared legend. Missing/error data remains unknown. SQL remains a count with the verified 200-connection limit; the summary turns red at the limit.
- Shortened all 16 tiles from five to three grid units (40%), reduced status-light size to 36 px, and moved the detailed charts up to remove empty space.
- The earlier ChatGPT/Codex UNKNOWN display was the already-open dashboard failing to resolve the newly created public source. Reloading refreshed its source cache. Both showed healthy on this inspection; no change to provider queries or credentials was needed.

Scope: maintained builder, both sanitized performance JSON formats and operating reference. Cost files retain their pre-existing formatting-only working-tree state; no cost behavior, collector, business job, model, schema or credential changed. Singapore timezone and two-minute refresh retained. Validation: JSON generation, no-overlap layout check, Grafana saved-state visual inspection of all groups/tiles and live provider states. No new runtime tests are needed for this presentation-only batch. Final visual verification and publication recorded below.

Final verification: native strip titles render fully at the observed 1024 px browser width; all 16 compact tiles are visible, with 15 healthy status lights and a live SQL count. All 40 pre-existing panel query definitions are semantically unchanged. Grafana saves succeeded; no layout overlap. Owner's requested title/height corrections are included in this same batch.
