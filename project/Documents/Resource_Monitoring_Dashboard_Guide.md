# Resource monitoring dashboard — visual guide

Covers the deployed Performance, Cost and PWA Platform dashboards. [Resource Monitoring](Resource_Monitoring.md) owns setup, access, collection, alert rules and recovery; the [alert troubleshooting runbook](Rules/Grafana_Alert_Troubleshooting_Runbook.md) owns incident response. Definitions live in [`infrastructure/grafana/dashboards/`](../../infrastructure/grafana/dashboards/) and are built by [`project/scripts/monitoring/`](../scripts/monitoring/README.md) (deploy and rebuild steps: see the operating reference). Panel IDs are unique within each dashboard; use dashboard, group and ID together.

- [Performance](https://monitor.mw-credit.com/d/mw-resource-performance) · [Cost](https://monitor.mw-credit.com/d/mw-resource-cost) · [PWA Platform](https://monitor.mw-credit.com/d/mw-pwa-platform)

## Reading the dashboards

- Times are Singapore (UTC+8). Refresh requests new data; it does not make provider data arrive sooner. Defaults are in the operating reference.
- Large CPU/RAM numbers show the last available sample in the selected range, not an average. VM-01 is not 24x7, so a stale last number does not prove it is online. Charts show gaps, never invented zeroes.
- Availability lights show health at refresh time, not uptime percentages or history. Most use Debian telemetry (reports older than six minutes are Unknown); the webhook and OpenAI lights do not. Use a range ending now; a historical range can turn a light Unknown. OpenAI always reads current status.
- Percent, count and throughput labels use whole numbers; cores, GB and money keep precision. A red reference line marks a documented capacity or configuration limit, not a warning threshold. Alerts add no chart lines.
- Cost data is delayed and provisional; **no data is not zero spending**.

| Light | State | Meaning |
| --- | --- | --- |
| Green | Healthy | The specific checks pass, limited to what each check tests |
| Orange | Degraded | Partial failure, provider impairment, overdue completion or excessive runtime |
| Red | Down | A checked path failed or a required timer stopped |
| Blue | Paused | The component's activation flag is disabled (intentional) |
| White | Unknown | Missing or stale telemetry, unavailable check or query error |

If many Debian-backed lights go Unknown together, investigate Debian and its monitoring timer before assuming each service failed.

## Performance — alerts linked to visuals

Ten rules evaluate every two minutes over a rolling ten-minute window ending now, independent of the time picker. Thresholds, labels and no-data policy are in the [operating alert reference](Resource_Monitoring.md#performance-alerts-and-phone-delivery-23-september-2026).

| Visual IDs | Alert condition | Pending |
|---|---|---|
| 51 | External webhook DEGRADED or DOWN (needs all three regional reports within 12 minutes; otherwise Unknown, no page) | 10 min |
| 52, 53, 56, 57, 60–67 | Debian component fresh Down or Degraded; receipts and polling also page on missing, stale or Unknown; Paused does not | 4 min |
| 80–83, 86 | Metabase Platform, App DB, Reporting DB, Charts, PITR fresh Down or Degraded | 4 min |
| 84, 85 | Metabase Daily or Weekly scheduled backup missing or overdue (first-run grace) | 4 min |
| 54, 55 | ChatGPT or Codex status DEGRADED or DOWN | 10 min |
| 50, 34 | Cloud SQL backend count above 160 (of 200) | 10 min |
| 4, 31 | Cloud SQL CPU above 85% (five-minute mean) | 10 min |
| 8, 32 | Cloud SQL memory components Usage above 85% | 10 min |
| 7, 22 | Debian VM `memory/percent_used` (state `used`) above 85% | 10 min |
| 9, 42 | Metabase memory above 90% of its live limit | 10 min |

Tile to Debian component: 52 `tunnel`; 53 `tailscale_node`; 60 `webhook_local`; 56 `oltp`; 57 `olap`; 61 `conversations`; 62 `receipts`; 63 `polling`; 64 `daily_jobs`; 65 `database`; 66 `audit_relay`; 67 `codex_ready`. Each is its own alert instance.

## Performance panel inventory

Layout: row 1 CPU cards, row 2 RAM cards, rows 3–4 the 23 availability and data tiles (groups Connectivity, Apps & OpenAI, Agent workflows, Data & runtime on the left; Metabase Live and Recovery on the right), then Payment processing, row 5 bridge/uptime, and four collapsible detail sections. Group headers (IDs 70–75, 1) and section headers (10, 20, 30, 40) carry labels only. Tile icons are Unicode pictograms.

| Group | ID | Panel | What it shows | Source / query family | Limit / threshold |
| --- | --- | --- | --- | --- | --- |
| Overview | 2 | Azure VM CPU | Percentage CPU of VM-01 | Azure Monitor | 100% capacity |
| Overview | 3 | GCP VM CPU | CPU utilization of `vm-mw-credit-agent` | Cloud Monitoring | 100% |
| Overview | 4 | Cloud SQL CPU | Instance-wide CPU, shared by DEV and PROD | Cloud Monitoring | 100%; alert 85% |
| Overview | 5 | Metabase CPU cores | Railway CPU in cores (1.00 is one core) | Railway GraphQL | Live `CPU_LIMIT` |
| Overview | 6 | Azure VM RAM used | `100 − Available Memory Percentage` | Azure Monitor | Detail chart 12 shows the opposite quantity |
| Overview | 7 | GCP VM RAM used | Ops Agent `percent_used`, state `used` | Cloud Monitoring | Alert 85% |
| Overview | 8 | Cloud SQL RAM used | `database/memory/components` Usage (not `memory/utilization`) | Cloud Monitoring | Alert 85% |
| Overview | 9 | Metabase RAM used | `100 × MEMORY_USAGE_GB / MEMORY_LIMIT_GB` at each sample | Railway GraphQL | Alert 90% |
| Connectivity | 51 | Webhook | Public `https://hooks.mw-credit.com/instagram` from Singapore, Belgium, Oregon: HTTPS, 403, body `Forbidden` | GCP uptime check | All 3 pass Healthy; mixed Degraded; all fail Down; fewer than 3 in 12 min Unknown |
| Connectivity | 52 | Tunnel | Debian Cloudflare tunnel process and HA connections | Debian collector | 4 connections Healthy; 1–3 Degraded; 0 or inactive Down |
| Connectivity | 53 | Tailscale | Debian node Running/Online, no health warnings | Debian collector | Warnings Degraded; not Running/Online Down; not a peer test |
| Connectivity | 60 | Ingress | Local receiver `/ready` 200 with `ready: true` and a `code_version` | Debian collector | Disabled flag Paused; not public routing |
| Apps & OpenAI | 56 | Native operational API | `native-api-probe --scope oltp`: catalogue plus one-row key-only Partners read | Debian collector | Disabled Paused; missing or stale Unknown; auth, environment or origin failure Down; no write |
| Apps & OpenAI | 57 | Native analytical API | Same probe for `olap`; one scope does not stand for the other | Debian collector | As 56 |
| Apps & OpenAI | 54 | ChatGPT | Product group and active incidents from OpenAI's status website; hover gives incident, SGT update and Checked time; click opens the incident | `mw-public-status` + `openai-status.jq` | No impact Healthy; major outage Down; other impact Degraded; bad data Unknown |
| Apps & OpenAI | 55 | Codex | Same for Codex; unrelated to **Codex ready** (67) | As 54 | As 54 |
| Agent workflows | 61 | Converse | Partner conversation worker timer and result | Debian collector | Idle completion within 3 min; running within 21 min |
| Agent workflows | 62 | Receipts | Receipt timer, result and read-only queue checks | Debian collector | Idle within 3 min; running within 10 min; queue rules below |
| Agent workflows | 63 | IG polling | Instagram scanner timer and result; hover shows last completion in SGT | Debian collector (`worker_timing`) | Idle within 10 min; running within 10 min; timing Unknown after 6 min |
| Agent workflows | 64 | Daily jobs | Cash-statement and email-retry timers combined | Debian collector | Cash statement 25 h idle / 1 h running; email retry 10 min / 10 min |
| Data & runtime | 50 | SQL / 200 | Interval-average backend count summed across the shared instance (number, not a light) | Cloud Monitoring | Red at 200; alert 160 |
| Data & runtime | 65 | Database | Debian proxy active and read-only `SELECT 1` on agent-state and reporting databases | Debian collector | Access only, not performance |
| Data & runtime | 66 | Audit relay | Required timer, latest outcome, bounded backlog and central-intent inspection | Debian collector | Down: no completion, inspection failure or intent over 30 s; Degraded: over 180 s |
| Data & runtime | 67 | Codex ready | Local Codex executable and login status | Debian collector | No inference or quota proof |
| Metabase Live | 80 | Platform | `reports.mw-credit.com/livez` 200 and status ok | Debian collector (`metabase_probe`) | Green within 5 s; amber slower; red failed; 401/403/429 Unknown |
| Metabase Live | 81 | App DB | `/readyz` 200 and status ok (includes Metabase application DB) | As 80 | As 80 |
| Metabase Live | 82 | Reporting DB | Uncached saved question 276 `SELECT 1` through source 2; 200/202 and exactly `[[1]]` | As 80 | As 80 |
| Metabase Live | 83 | Charts | `charts.mw-credit.com` shell returned; unauthenticated `/api/matrix` returns 401 | As 80 | As 80; no authenticated query |
| Metabase Recovery | 84 | Daily backup | Latest scheduled Railway volume snapshot; manual snapshots do not count; hover shows cron (UTC), snapshot (SGT), retention | Railway GraphQL | Green to 30 h, amber to 36 h, then red; no schedule red; pre-first-run Unknown up to 30 h |
| Metabase Recovery | 85 | Weekly backup | As 84 for the Weekly schedule | Railway GraphQL | Green to 8 d, amber to 9 d, then red; pre-first-run Unknown up to 8 d |
| Metabase Recovery | 86 | PITR archive | Railway Postgres PITR status over SSH (enabled, bucket, backup set, WAL coverage, archiver) | Debian collector (`metabase_pitr.py`) | Green archive within 30 min; amber 30–60 min; older or failed red; telemetry over 6 min Unknown |
| Azure VM-01 | 11 | CPU utilization | CPU history | Azure Monitor | 100% |
| Azure VM-01 | 12 | Available memory | Available RAM percentage | Azure Monitor | Exhaustion at 0% |
| Azure VM-01 | 13 | Network per interval | Bytes received and sent per aggregation interval, not per second (5 min up to 2 days, 1 h up to 14 days, then 1 day) | Azure Monitor | No cap drawn |
| Azure VM-01 | 14 | OS disk throughput | Read and write bytes per second | Azure Monitor | 100 MB/s shared baseline |
| GCP Debian VM | 21 | CPU utilization | VM CPU history | Cloud Monitoring | 100% |
| GCP Debian VM | 22 | Used memory | Ops Agent used percentage | Cloud Monitoring | 100%; alert 85% |
| GCP Debian VM | 23 | Network throughput | Received and sent bytes per second, summed | Cloud Monitoring | No cap drawn |
| GCP Debian VM | 24 | Disk throughput | Read and write bytes per second (not fullness or latency) | Cloud Monitoring | No cap drawn |
| Cloud SQL (shared) | 31 | CPU utilization | Instance CPU history | Cloud Monitoring | 100%; alert 85% |
| Cloud SQL (shared) | 32 | Memory components | Used, Cache and Free percentages (Used = provider label Usage) | Cloud Monitoring | 100% total; alert 85% on Used |
| Cloud SQL (shared) | 33 | Storage utilization | Used storage as a percentage of current allocation | Cloud Monitoring | 100% of allocation |
| Cloud SQL (shared) | 34 | Connections · limit 200 | Interval-average backend count across databases | Cloud Monitoring | 200 line; alert 160 |
| Railway (Metabase) | 41 | CPU usage · cores | Metabase and Postgres CPU with live `CPU_LIMIT` dashed series | Railway GraphQL | Live limits |
| Railway (Metabase) | 42 | Memory usage · GB | Used memory with live `MEMORY_LIMIT_GB` series | Railway GraphQL | Live limits; alert 90% |
| Railway (Metabase) | 43 | Persistent volume · GB | Postgres volume usage (Metabase has none) | Railway GraphQL | 5 GB allocation |
| Payment processing | 101 | 1 · Group scanning | Polling light plus last scan completion in SGT; empty scans count; not proof a payment posted | Debian collector (`worker_timing`) | Unavailable when timing is missing or older than 6 min |
| Payment processing | 102 | Pipeline health | Receipt workflow state; Degraded can mean an overdue review | Debian collector (`receipt_pipeline`) | Intentional Paused does not page |
| Payment processing | 103 | 2 · Receipt extraction | Images waiting, oldest wait, stalled work | As 102 | Stalled above 0 red |
| Payment processing | 104 | 3 · Validation | Ready to route, manual holds, unnotified holds | As 102 | Unnotified holds above 0 red |
| Payment processing | 105 | 4 · Reviewer decisions | Awaiting reply, overdue over 2 h; approval only by direct reply to the correlated IG request | As 102 | Overdue above 0 red |
| Payment processing | 106 | 5 · Payment posting | Awaiting posting, unconfirmed outcomes, retained POSTED total | As 102 | Unconfirmed above 0 red: reconcile, do not retry Add |
| Payment processing | 107 | 6 · Notification failures | Partner results, hold alerts and review requests undelivered over 5 min (counts may overlap) | As 102 | Above 0 red; optional result failures do not degrade Receipts |
| Payment processing | 108 | Queue length over time | Pending images, manual holds, awaiting review, unconfirmed posting | As 102 | Lines break at gaps over 6 min; history from 25 September |
| Bridge | 121 | Bridge availability | App and owner accessibility on a natural minute drain | Debian collector (bridge metrics) | Missing or stale Unknown |
| Bridge | 122 | Dispatch completion | Fresh natural dispatch completion; no events is not failure | As 121 | Stale Unknown |
| Bridge | 123 | Outbox age | Uncapped Firestore counts and oldest pending age | As 121 | Not the capped tool counts |
| Subscription · Auth · Delivery | 125 | Expected subscriptions | Exact monitored registration membership | As 121 | Unverified Unknown |
| Subscription · Auth · Delivery | 126 | Renewal / grant authority | Subscription and grant deadlines (not five-minute access tokens) | As 121 | Missing metadata Unknown |
| Subscription · Auth · Delivery | 127 | Delivery continuity | Retained failures and backlog | As 121 | Host acceptance is not owner-visible receipt |
| Infrastructure Uptime | 128 | Debian VM uptime | Latest Compute Engine start-uptime gauge | Cloud Monitoring via `worker_timing` | Not service availability |
| Infrastructure Uptime | 129 | Cloud SQL uptime | Time since PostgreSQL start on the shared instance; needs matching status and uptime samples | `worker_timing` (`cloud_sql_prod`) | Resets on restart or failover; over 6 min Unknown |

Receipt queue rules: stalled work is PENDING or VALIDATED over 10 minutes, REVIEW_REQUESTED without a proposal over 5 minutes, or APPROVED over 10 minutes; required hold or review delivery missing after 5 minutes is unhealthy; PENDING review over 2 hours is overdue; POSTING or UNKNOWN is unhealthy at once. Already-notified manual holds do not degrade health. Queue values must share the newest status sample; missing, invalid, paused, stale (over 6 min) or future (over 2 min) samples show Unavailable, never a healthy zero. Monitoring only observes; it never posts, approves, replays or clears work. A reviewer can reply **Reject** or **No** to a held-receipt notification to dismiss it.

## R051 row 5 and Azure daily availability chart — live verified

Row 5 holds three groups: **Grafana → Dots · Bridge** (header 120, tiles 121–123), **Subscription · Auth · Delivery** (header 124, tiles 125–127) and **Infrastructure Uptime** (header 130, tiles 128–129); their meaning is in the Performance inventory above. Uptime floors to whole minutes; missing, invalid or stale samples are Unknown.

Known gaps: renewal and grant labels are very small at about 1180 px; the 5 October registration recovery showed Healthy in the UI, but later automatic renewal is not proven. Cost panel 110 is described in the Cost inventory.

## Cost panel inventory

Scope: the top overview converts available costs to SGD (ECB USD/SGD via Frankfurter, latest reference, rejected if older than seven days); detail sections keep Azure and Railway USD and GCP SGD. Azure and GCP follow the date picker; Railway always uses its current billing cycle. Dashboard time is not a common invoice period. Totals are incomplete until all platforms report.

| Group | ID | Panel | What it shows | Source / query family | Limit / threshold |
| --- | --- | --- | --- | --- | --- |
| Overview | 4 | TOTAL · SGD | Sum of available platform amounts, subtitle "Available costs only" | Reuses panel 2 results | Incomplete when a platform is missing |
| Overview | 5 | Azure · SGD | Two monitored resource groups, converted | Azure Cost Management + FX | Follows date picker |
| Overview | 6 | GCP · SGD | Net SGD after credits; no data stays unavailable | BigQuery billing export | Follows date picker |
| Overview | 7 | Railway · SGD | Accrued workspace USD converted | Railway `customer.currentUsage` + FX | Billing cycle, not picker |
| Overview | 2 | Platform breakdown · SGD | Stacked bar: Azure blue, GCP orange, Railway purple | Azure, BigQuery, Railway, Frankfurter | Missing GCP shows no segment; negatives stay negative |
| Overview | 3 | Conversion and coverage | Subtotal, SGD per USD, FX date, GCP row availability, Railway cycle dates | As 2 | Check before trusting the total |
| Overview | 1, 10, 20, 30 | Cloud spending, section headers | Static guidance and grouping | None | None |
| Azure | 102 | Selected-range cost | USD sum of returned resource costs, not only VM compute | Cost Management ActualCost, `rg-mwcredit` and `rg-backup` | Not an invoice |
| Azure | 103 | Daily cost | Total by provider (UTC) date, whole-dollar labels | As 102 | None |
| Azure | 104 | Cost by resource (USD) | Totals by last segment of resource ID, highest first | As 102 | Identically named resources combine |
| Azure | 101 | Daily resource detail (USD) | Date, resource, cost, currency, newest first | As 102 | Source table for the others |
| Azure | 110 | Observed running and available hours | Daily hours from `VmAvailabilityMetric` minute averages, gray unknown hours, hover coverage; Singapore day boundaries | Azure Monitor | Lower bound, not billable runtime; ranges over 31 days rejected; Azure keeps 93 days |
| GCP | 202 | Before credits (SGD) | Gross usage | BigQuery billing export (`mw_cloud_billing`) | Net = gross + credits |
| GCP | 203 | Credits (SGD) | Sum of exported credits, normally negative; not a remaining balance | As 202 | None |
| GCP | 204 | Net cost (SGD) | Gross plus credits | As 202 | None |
| GCP | 205 | Export status | Static text, not a live exporter probe | None | Data can lag |
| GCP | 207 | By resource (SGD) | Net by service and resource, largest first; Unallocated when unattributed | As 202 | Fully credited rows show S$0.00 |
| GCP | 206 | Daily cost and credits (SGD) | Gross, credits and net by Singapore date | As 202 | Recent days can lag |
| GCP | 201 | Daily resource detail | Service, date, gross, credits, net, resource, newest first | As 202 | Source table; 100 MB billed-query cap |
| Railway | 302 | Accrued resource usage | Workspace `customer.currentUsage` in USD | Railway GraphQL | Not the payable bill |
| Railway | 301 | Billing period and accrued usage | Workspace, plan, usage, cycle dates | As 302 | None |
| Railway | 303 | How to read Railway cost | Static explanation | None | None |
| Railway | 304 | By resource (USD est.) | Current-cycle estimate per service from usage units at published rates (CPU $0.0004632 per vCPU-minute, RAM $0.0002316 per GB-minute, volume $0.0000036 per GB-minute, egress $0.05 per GB) | `railway-resource-cost.jq` | Rates checked 25 September 2026; differs from 302 |
| Railway | 305 | Estimated daily compute + volume (USD) | Hourly CPU, RAM and volume samples times rates, by Singapore date, current cycle only | `railway-daily-estimate.jq` | Excludes egress, plan fees, credits and unsampled intervals; does not reconcile to 302 |

Azure daily buckets show at 08:00 Singapore. A query failure shows Grafana's error indicator; never treat incomplete data as reconciled.

## R055 PWA Platform — deployed 13 October 2026

UID `mw-pwa-platform`, datasource `mw-gcp-monitoring`. DEV and PROD are separate rows with no cross-environment aggregation. Ranges default to the last 24 hours ending 2 minutes ago (60 s sampling, 120 s ingestion lag). No alert exists for this dashboard.

| Panel IDs | Group / panel | What it shows | Source / query family | Limit / threshold |
| --- | --- | --- | --- | --- |
| 1 | Scope and interpretation | Static text on lag, idle and coverage limits | None | Not a health signal |
| 2, 16 | PROD / DEV rows | Environment headers | None | None |
| 3, 17 | Canonical Hosting (Debian vantage) | `pwa_hosting_prod` / `pwa_hosting_dev`: environment title, root mount, entry reference, version marker; reachable 1, failed 0, missing or over 6 min 4 | Debian collector health metric | 10 s per environment; one vantage, not login or multi-region |
| 4–6, 18–20 | Reader | Requests per 5 min (all, 4xx, 5xx), request p95 (ms), instance peak | `run.googleapis.com/request_count`, `request_latencies`, `container/instance_count` | No invented thresholds; idle is neither Down nor Healthy |
| 7–9, 21–23 | Command | Same metrics; browser and machine traffic, not business outcomes | As above | As above |
| 10–12, 24–26 | Jobs | Same metrics; no last-successful-boundary freshness | As above | Job completion freshness unimplemented |
| 13–15, 27–29 | Notify | Same metrics; HTTP completion is not provider acceptance or device delivery | As above | Queue aggregates unimplemented |

Request counts are DELTA, aligned SUM over 300 s, reduced SUM across revisions (All blue solid, 4xx orange dashed, 5xx red dotted; 4xx can be intentional rejection). Latency uses ALIGN_SUM then REDUCE_PERCENTILE_95 (percentiles are not averaged). Instance count uses ALIGN_MAX then REDUCE_SUM, an upper envelope. Missing subset series stay missing. Queries fail visibly on permission errors or truncation. Native probes 56 and 57 stay on Performance.

## Maintaining this guide

Update this guide in the same batch as any dashboard change: add, remove or rename the row and ID in the matching table, and update source, units, freshness, state mapping and limits. Compare against the current saved definitions in `infrastructure/grafana/dashboards/`, not an earlier builder baseline. Keep fixed limits (dated) separate from live-limit series, and static text separate from live status.
