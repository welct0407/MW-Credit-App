# Centralized resource monitoring

Operating reference for Grafana Cloud stack `olivecrab1199` (work account). Panel-level meaning is in the [Dashboard visual guide](Resource_Monitoring_Dashboard_Guide.md); incident response is in the [alert troubleshooting runbook](Rules/Grafana_Alert_Troubleshooting_Runbook.md); the alert event bridge is in [Grafana MCP Events bridge](Grafana_MCP_Events_Bridge.md). Deployment pins are in the [Environment Inventory](Environment_Inventory.md).

## What is monitored and where it runs

| Area | Source | Runs on |
| --- | --- | --- |
| Azure VM-01, GCP Debian VM and shared Cloud SQL, Railway Metabase/Postgres: performance and cost | Provider APIs queried live by Grafana Infinity data sources `mw-azure-monitoring`, `mw-gcp-monitoring`, `mw-railway-monitoring` | Grafana Cloud (no time series copied into Grafana storage; provider retention applies) |
| Debian service health, native API probes, receipt pipeline, Metabase probes, bridge telemetry, PWA Hosting checks | `project/scripts/monitoring/debian-health.py`, run every two minutes by `mw-resource-health.timer` as `mwagent`; exports numeric states to `custom.googleapis.com/mw_resource_monitoring/*` through the VM's Monitoring Metric Writer role | Debian VM `vm-mw-credit-agent`, `/opt/mw-resource-monitoring/` |
| Public webhook | Google Cloud uptime check `mw-webhook-external-health-ySLl0784KgI` (`GET https://hooks.mw-credit.com/instagram`, expects HTTPS, 403 and body `Forbidden`, every 5 minutes from Singapore, Belgium and Oregon); in Terraform (`infrastructure/ecosystem-debian`) | Google Cloud |
| OpenAI status | Credential-free Infinity source `mw-public-status` (`cfz10a9eaokjkd`), `https://status.openai.com`; selector `scripts/monitoring/openai-status.jq` | Grafana Cloud |
| USD/SGD conversion | Credential-free Infinity source `mw-public-fx` (`efz19dcu6cwzka`), `https://api.frankfurter.dev` | Grafana Cloud |
| Cloud Run PWA services | `mw-gcp-monitoring` aggregate queries (PWA Platform dashboard) | Grafana Cloud |

VM-01 is not available 24x7 and is not a monitoring dependency. The webhook check and OpenAI queries do not depend on either VM; other Debian-local lights become Unknown if Debian stops reporting. Native API probes use `native-api-probe --scope oltp|olap` (metric labels `oltp`/`olap` are kept for alert compatibility). No AppSheet probe remains.

## Dashboards and access

Hostname **monitor.mw-credit.com** (Cloudflare DNS-only CNAME to `olivecrab1199.grafana.net`, instance URL set in the Cloud Portal; revert the instance URL before removing the CNAME). Grafana sign-in applies. Folder **MW Resource Monitoring**; times display in Asia/Singapore.

| Dashboard | UID | Default view |
| --- | --- | --- |
| [Performance](https://monitor.mw-credit.com/d/mw-resource-performance) (home dashboard for the work account) | `mw-resource-performance` | Last 3 hours, 1-minute refresh |
| [Cost](https://monitor.mw-credit.com/d/mw-resource-cost) | `mw-resource-cost` | Month to date, hourly refresh |
| [PWA Platform](https://monitor.mw-credit.com/d/mw-pwa-platform) | `mw-pwa-platform` | Last 24 hours ending 2 minutes ago, 2-minute refresh |

Rebuild and deploy: definitions are in [`infrastructure/grafana/dashboards/`](../../infrastructure/grafana/dashboards/) (Terraform, runner `scripts/grafana/manage.py`, see [`infrastructure/grafana/README.md`](../../infrastructure/grafana/README.md)); builders and query helpers are in [`project/scripts/monitoring/`](../scripts/monitoring/README.md) (`Build-Dashboards.ps1`, `pwa-platform-dashboard.cjs`). Capture a fresh private backup and compare the live resource before any change; update the visual guide in the same batch. Older generated JSON in [`outputs/resource-monitoring-20260922`](../outputs/resource-monitoring-20260922/) is recovery evidence, not the live definition.

## Availability collector

- States: DOWN 0, UP 1, DEGRADED 2, PAUSED 3, UNKNOWN 4. A report older than six minutes is UNKNOWN at query time. A failed member cannot be hidden by a healthy member in a grouped light. Selectors test freshness against the current time even for a historical range.
- The collector starts no business workers and sends no test messages or model prompts. Business schedules and activation flags are unchanged.
- Database health: proxy active and read-only `SELECT 1` against the agent-state and reporting databases. Native probes do not certify every browser workflow. Codex readiness checks executable and login state only. Tailscale checks the node's Running/Online state, not peer reachability. Tunnel health needs four Cloudflare HA connections (fewer is degraded, zero is down).
- Audit relay: required timer, latest completed outcome and bounded backlog or central-intent inspection. RUNNING cannot clear a completed failure. Missing completion, inspection failure or an intent older than 30 seconds is Down; completion, run duration or backlog age above 180 seconds is Degraded.
- Hosting: public canonical checks of `dev-lm.mw-credit.com` and `lm.mw-credit.com` (components `pwa_hosting_dev`, `pwa_hosting_prod`): fixed bounds, no redirects, no credentials, 10 s per environment. The timer starts 120 s after the previous unit becomes inactive; its 180 s timeout is unchanged.
- IG polling also exports `worker_timing` (`status`, `running`, `last_completion`; zero means unavailable). Not an alert label.
- Infrastructure Uptime uses `cloud_sql_prod` status and uptime through `worker_timing` on a read-only reporting connection. Failed, stale or missing observations are Unknown.

### Metabase probes

`metabase_probes.py` exports `custom.googleapis.com/mw_resource_monitoring/metabase_probe` with components `metabase_platform`, `metabase_appdb`, `metabase_reporting`, `metabase_charts`, `metabase_pitr` (fields `status`, `http_code`, `duration_ms`; PITR adds `last_archived`, `backup_sets`, `archive_age_seconds`). Four HTTP probes run concurrently with 15 s timeouts, no redirects, user agent `MW-Resource-Monitor/1.0`. No secrets, bodies or business rows are exported.

- Reporting probe: saved question 276 in collection 9 through a dedicated non-admin Metabase API key (ID 4, group 6, read-only on collection 9). Debian holds the key at `/etc/mw-resource-monitoring/metabase-probe-key.txt` (root:mwagent 0640). Rotate by revoking key 4 and replacing only this file. Do not replay the retained source initialization helper.
- PITR: `metabase_pitr.py` runs Railway's `postgres pitr status` read-only over Railway SSH about every two minutes. Project-scoped token at `/etc/mw-resource-monitoring/railway-pitr-token.txt` (root:mwagent 0640), SSH key under `/var/lib/mw-integration-agent/.ssh/` (public half registered in Railway as `mw-debian-pitr-health`; Railway SSH keys are workspace-wide), CLI pinned under `/opt/mw-resource-monitoring/railway`. To retire it, remove the collector's PITR import, revoke the token and SSH key, and delete only these private files.
- Daily and Weekly backup lights query Railway's scheduled volume-backup list directly, filtered by schedule ID, so a manual snapshot never counts.

### Receipt pipeline

The collector imports the worker's read-only `receipt_health.inspect` and exports `custom.googleapis.com/mw_resource_monitoring/receipt_pipeline` (INT64 gauge, label `field`, 14 validated fields). Import, database or schema failure exports status Down and `inspection_failed=1`. Disabled receipt processing exports Paused. No borrower, account, amount, reference, URL or credential is exported. The field `ingress_review_open` is exported but has no card or alert yet. Selectors: `receipt-pipeline.jq`, `receipt-trend.jq`, `debian-alert.jq`; patch `payment-dashboard.js`. Stage definitions are in the visual guide; the implementation handover is [MONITORING_IMPLEMENTATION_HANDOVER.md](../../integration-agent/docs/MONITORING_IMPLEMENTATION_HANDOVER.md).

## Performance alerts and phone delivery (23 September 2026)

Ten Grafana-managed rules in folder **MW Resource Monitoring Alerts**, group **Performance 2m**, evaluate every two minutes and send firing and resolved notifications to contact point **MW Performance IRM**. The contact point feeds the IRM integration **MW Performance Monitoring**, whose default route triggers **MW owner mobile push** to the owner. No on-call schedule, SMS or external messenger exists. Four rules evaluate several labelled instances; together with the webhook and SQL rules they cover all 23 availability and data tiles. Azure VM-01 uptime has no rule (not 24x7); Cost has no push rules.

| Rule | Fires when | Pending |
|---|---|---|
| Webhook external health impaired (`efz3jiz9qmhhce`) | At least one of three fresh regions fails (DEGRADED or DOWN); fewer than three fresh reports stay silent | 10 min |
| Debian component unhealthy (`afz3o5cmmfabkb`) | One instance for each of 12 components (`tunnel`, `tailscale_node`, `webhook_local`, `oltp`, `olap`, `conversations`, `receipts`, `polling`, `daily_jobs`, `database`, `audit_relay`, `codex_ready`): fresh DOWN or DEGRADED; receipts and polling also page on missing, stale (>6 min), future (>2 min), invalid or Unknown; no-data and query errors alert. Fresh Paused does not page | 4 min |
| Metabase component unhealthy (`ffzb4act1o0zka`) | Five instances (Platform, App DB, Reporting DB, Charts, PITR); fresh DOWN or DEGRADED. Unknown, missing and stale do not page. Selector `metabase-alert.jq` | 4 min |
| Metabase scheduled backup unhealthy (`mw-metabase-backup-health`) | Daily and Weekly instances; missing schedule or overdue scheduled snapshot, with first-run grace | 4 min |
| OpenAI product status impaired (`efz3obf98zksga`) | ChatGPT and Codex instances; non-operational component or matching active incident. Invalid or missing data makes the tile Unknown and does not page | 10 min |
| Cloud SQL connection pressure | Five-minute backend count above **160** of `max_connections` 200 | 10 min |
| Cloud SQL CPU sustained high | Five-minute mean CPU above **85%** | 10 min |
| Cloud SQL used memory high | Five-minute mean `database/memory/components` Usage above **85%** | 10 min |
| Debian VM used memory high | Five-minute mean Ops Agent `memory/percent_used`, state `used`, above **85%** | 10 min |
| Metabase Railway memory pressure | `100 × MEMORY_USAGE_GB / latest MEMORY_LIMIT_GB` above **90%** | 10 min |

- The 80/85/90% values are operational warnings, not provider limits, and are not drawn on charts. Only stable component labels and binary impairment values enter alert queries; incident text and timestamps never become labels.
- No-data and error policy: the Debian rule uses **Alerting**; the other nine use **KeepLast**. A prolonged monitoring outage can therefore leave the last state unchanged. Check rule health and Unknown tiles when telemetry is missing.
- One incident can fire the webhook, local ingress and other Debian rules together; the component label tells them apart.
- An additive HMAC webhook in the same contact point feeds the [bridge](Grafana_MCP_Events_Bridge.md), filtered to these ten exact names and to firing and resolved. Original IRM delivery is retained.
- Edit or pause rules in [Alert rules](https://monitor.mw-credit.com/alerting/list), the contact point in [Notification configuration](https://monitor.mw-credit.com/alerting/notifications), the route in [IRM](https://monitor.mw-credit.com/a/grafana-irm-app/integrations). Rule configuration is maintained through the adopted Terraform and code path. To roll back only the Metabase extension, pause `ffzb4act1o0zka`. To remove alerting entirely, pause or delete all ten rules, then the contact point, IRM integration and escalation chain if unreferenced; leave dashboards and data sources.
- Owner reports that Dots receives Grafana alerts for the whole monitored ecosystem. Response, bounded recovery and reporting are in the [runbook](Rules/Grafana_Alert_Troubleshooting_Runbook.md#recovery-authority). Delivery is not verified here.

## Receipt processing versus optional notification health — 2 October 2026

Since worker revision 25, optional result-notification failures are separate from processing health. The Notification failures card keeps `failed_notifications`; required review delivery, unnotified holds, stalled intake and uncertain posting still degrade processing. Green Receipts does not show that every confirmation was delivered. The builder and the [canonical alert description](../scripts/monitoring/README.md#receipt-notification-health-correction--2-october-2026) reflect this policy. Known gap: the live alert description and panel text have not been aligned yet. Queries, thresholds and routing are unchanged.

## Verified limits

| Limit | Value | Notes |
| --- | --- | --- |
| Cloud SQL `max_connections` | 200 | Instance-wide; reserved slots reduce ordinary-client capacity. Chart line and SQL tile turn red at 200 |
| Cloud SQL storage | Percent of current allocation (10 GB, auto-resize on) | 100% is not a lifetime budget |
| Railway CPU and memory | Live `CPU_LIMIT` and `MEMORY_LIMIT_GB` series | Metabase about 2 cores / 2 GB; Postgres 1 core / 0.5 GB at last inspection |
| Railway Postgres volume | 5000 MB | Metabase has no persistent volume |
| Azure OS disk throughput | 100 MB/s baseline, shared by reads and writes | Reference line only; ignores burst and cache |
| Bridge Grafana ingress | 50 alerts and 256 KiB per request | See bridge document |
| Billing queries | 100 MB billed cap per BigQuery query | Shorten the range if reached |

Fixed references are configuration snapshots; update them when the settings change. Other network and disk-throughput charts have no comparable hard ceiling, so none is drawn. Subscription fees and credits are not spending limits.

## Coverage and cost calculation

| Source | Scope | Performance | Cost |
|---|---|---|---|
| Azure | IDEA Prod Subscription `50f792fa-803e-4280-833d-1fe60fef5293`; VM-01 in RG-MWCREDIT | CPU, available memory, network bytes per interval, OS disk throughput | ActualCost for `rg-mwcredit` and `rg-backup`; USD |
| GCP | Project `clever-oasis-508610-n7`; `vm-mw-credit-agent`, `mw-credit-pg-20261017` | VM CPU, used memory, network, disk; SQL CPU, memory, storage, connections | Detailed billing export in `mw_cloud_billing` (US) filtered to this project; SGD; gross plus negative credits equals net |
| Railway | `welct0407's Projects`, MW Credit Metabase project, production | CPU cores, memory GB, volume GB | Workspace `customer.currentUsage`, USD, current billing cycle regardless of the date picker |

- Azure daily buckets keep the provider's UTC date (08:00 Singapore); GCP groups by Singapore date. The top SGD overview converts Azure and Railway USD with the latest ECB USD/SGD reference from Frankfurter and adds GCP net SGD. It combines provider periods and is not a common-period invoice. Missing GCP stays null; the subtotal is incomplete until all sources report. FX older than seven days or unexpected currencies are rejected. There is no forecast.
- Railway usage excludes invoice treatment of plan fees, included usage, credits and adjustments. Railway rates in the selectors come from [published pricing](https://docs.railway.com/pricing/plans), last checked 25 September 2026; recheck after pricing changes.
- GCP billing export was enabled 22 September. Before the table exists the detail table shows **Awaiting first billing export**. Queries reject truncation, incomplete BigQuery jobs and GraphQL errors. Avoid repeated manual cost refreshes because Azure throttles.

## Credentials and access

Credentials never enter Git. Keep recovery exports in the current user's established private location; follow the owning access procedure before retrieving or rotating anything. All three data sources use Infinity's backend parser, encrypted credentials and allowed-host restrictions.

- Azure app `mw-grafana-monitoring` (app ID `c285a10c-5054-4f79-928f-46d7488b3f46`): Monitoring Reader on RG-MWCREDIT, Cost Management Reader on RG-MWCREDIT and RG-BACKUP. Its one-year secret was created 22 September 2026; rotate before September 2027 and update Grafana's encrypted field.
- GCP service account `mw-grafana-monitoring@clever-oasis-508610-n7.iam.gserviceaccount.com`: Monitoring Viewer and BigQuery Job User on the project, reader on the billing dataset. Rotating its key needs the scoped key-creation policy procedure.
- Railway `mw-grafana-monitoring` workspace token: Railway offers no read-only toggle at workspace scope. Queries are read-only but the credential can write; restrict Grafana access to trusted users. Canonical copy: Secret Manager `mw-railway-grafana-monitoring-token` (version 1, 22 October 2026, after Railway revoked all API tokens in incident QH8L8B3E). Rotate by adding a secret version, then setting datasource `mw-railway-monitoring` field `bearerToken` through the Grafana API; Terraform ignores that field.
- Railway PITR project token: canonical copy Secret Manager `mw-railway-pitr-token` (version 1, created through the Railway API with the workspace token). Rotate by adding a version and replacing `/etc/mw-resource-monitoring/railway-pitr-token.txt`. If PITR reports `signup_required`, the workspace SSH key is missing: re-register `/var/lib/mw-integration-agent/.ssh/id_ed25519.pub` with the pinned CLI (`railway ssh keys add --workspace <id> --name mw-debian-pitr-health`, using the workspace token).
- Retained VM-01 control identity `grafana-vm-control` and Infinity source `mw-azure-vm-control` (`cfz1i3v9ruk1sb`; one-year secret created 23 September 2026) are not used by any dashboard. Read the Azure controller record before use or retirement.
- Grafana provisioning uses Secret Manager `mw-grafana-provisioning-token` (version 1, no expiry) and `mw-grafana-contact-integrations` (version 1) through the `infrastructure/grafana` roots; secret payloads stay outside Terraform and Git.

## Recovery

Restore the reviewed prior definition through `infrastructure/grafana` with the existing folder and data-source UIDs, after capturing a fresh private backup and comparing affected resources. Routine rollback restores the affected definition or configuration; retiring monitoring resources, revoking provider roles or disabling the billing export needs explicit scope. Preserve billing records, vendor dashboards, existing agents and alerts, business databases and unrelated Railway services. Collector rollback: restore the previous `debian-health.py` kept beside it in `/opt/mw-resource-monitoring/` (for example `debian-health.before-r063w3-iam-20261016.py`), keeping `mwagent` permissions. Do not replay identity initialization against existing identities or keys.

## Known gaps

- Eight additional bridge alerts are not created; Grafana revamp is deferred by the owner.
- The `ingress_review_open` and `webhook_code_version` values have no card.
- Final Cost code-export equality for panel 110 was not verifiable.
- Live alert and panel text for the 2 October receipt-notification policy is still to be aligned.
- Automatic subscription renewal for the bridge is unproven (see bridge document).
- Dashboard checks on desktop, iPhone and iPad were configuration reviews, not device validation.
