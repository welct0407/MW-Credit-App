# Resource monitoring dashboard — visual guide

Covers the five dashboards Now, PWA & APIs, Agent & Receipts, Infrastructure and Cost (R089), then the three previous dashboards (Performance, Cost, PWA Platform) that stay until retirement. [Resource Monitoring](Resource_Monitoring.md) owns setup, access, collection, alert rules and recovery; the [alert troubleshooting runbook](Rules/Grafana_Alert_Troubleshooting_Runbook.md) owns incident response. Definitions live in [`infrastructure/grafana/dashboards/`](../../infrastructure/grafana/dashboards/) and are built by [`project/scripts/monitoring/`](../scripts/monitoring/README.md) (deploy and rebuild steps: see the operating reference). Panel IDs are unique within each dashboard; use dashboard, group and ID together.

- [Now](https://monitor.mw-credit.com/d/mw-now) · [PWA & APIs](https://monitor.mw-credit.com/d/mw-pwa) · [Agent & Receipts](https://monitor.mw-credit.com/d/mw-agent) · [Infrastructure](https://monitor.mw-credit.com/d/mw-infra) · [Cost](https://monitor.mw-credit.com/d/mw-cost)

## Reading the dashboards

- Times are Asia/Bangkok (UTC+7) on the five dashboards; the previous Performance and Cost dashboards still show Singapore (UTC+8). Refresh requests new data; it does not make provider data arrive sooner. Defaults are in the operating reference.
- Large CPU/RAM numbers show the last available sample in the selected range, not an average. VM-01 is not 24x7, so a stale last number does not prove it is online. Charts show gaps, never invented zeroes.
- Availability lights show health at refresh time, not uptime percentages or history. Most use Debian telemetry (reports older than six minutes are Unknown); the webhook and OpenAI lights do not. Use a range ending now; a historical range can turn a light Unknown. OpenAI always reads current status.
- Percent, count and throughput labels use whole numbers; cores, GB and money keep precision. A red reference line marks a documented capacity or configuration limit, not a warning threshold. Alerts add no chart lines.
- Cost data is delayed and provisional; **no data is not zero spending**.

| Light | State | Meaning |
| --- | --- | --- |
| Green | Healthy | The specific checks pass, limited to what each check tests |
| Orange | Degraded | Partial failure, provider impairment, overdue completion or excessive runtime |
| Red (dark red on the five current dashboards) | Down | A checked path failed or a required timer stopped |
| Blue | Paused | The component's activation flag is disabled (intentional) |
| White | Unknown | Missing or stale telemetry, unavailable check or query error |

If many Debian-backed lights go Unknown together, investigate Debian and its monitoring timer before assuming each service failed.

## Dashboard set (R089)

Five dashboards in folder MW Resource Monitoring, all tagged `mw-credit`, all with a link bar of five explicit links to the others (the time range is not carried between dashboards) and time zone Asia/Bangkok. Now is the home dashboard for the work account (Terraform `grafana_organization_preferences`, `home_dashboard_uid` `mw-now`). Panel IDs restart at 1 in each dashboard; the rows below name dashboard, panel ID and what the panel reads. Group rows are plain headers, not collapsible, except where stated. Every panel has a title.

| Dashboard | UID | Default view | Reads |
| --- | --- | --- | --- |
| [Now](https://monitor.mw-credit.com/d/mw-now) (home) | `mw-now` | Last 3 hours ending now, 1-minute refresh | PROD only: whether everything works, what is firing, headroom |
| [PWA & APIs](https://monitor.mw-credit.com/d/mw-pwa) | `mw-pwa` | Last 24 hours ending 2 minutes ago, 2-minute refresh | Hosting, four Cloud Run services per environment, schedulers, push, recognition route |
| [Agent & Receipts](https://monitor.mw-credit.com/d/mw-agent) | `mw-agent` | Last 6 hours ending now, 1-minute refresh | Receipt pipeline, Partner conversation, recognizer, workers and timers, connectivity |
| [Infrastructure](https://monitor.mw-credit.com/d/mw-infra) | `mw-infra` | Last 24 hours ending now, 5-minute refresh | Cloud SQL, Cloud Run table (full width), Debian VM, Metabase on Railway, collapsed Azure VM-01 |
| [Cost](https://monitor.mw-credit.com/d/mw-cost) | `mw-cost` | Month to date, 1-hour refresh | Azure, GCP and Railway cost in SGD |

Conventions on all five (owner review, `8d77284`; fit pass `9ea0209`): timelines get a fixed label width from the longest lane name (PWA 20 lanes 'Notify · 1 min', 'Charges · 00:05', 'Analytics · hourly'), and `layout-model.cjs` checks every panel title (14 px, one line) and lane label at 1440 px (grid about 1024 px) and 390 px, which is why titles are short; the Scan last-run tile (Now 4, Agent 1) carries the newest completion within its 3 h window (`scan-completion.jq`); Now 19 reads the Metabase daily and weekly ages from the newest DAILY and WEEKLY snapshot; text is larger: stat names 16 px, values 32 px, multi-value tiles as name/value rows, gauges 16/22 px, tables medium, text tiles 20 px (Grafana cannot size timeline labels, legends and axes, table font or the alert list; `project/scripts/monitoring/layout-model.cjs` checks the layout at 1440 and 390 px). One-value tiles show the value only (Agent 13, Infrastructure 18, Cost 1, PWA 1). State timelines (Now 1 and 16, PWA 20, Agent 9 and 10) read from the hidden variable `lookback_from` (range start minus 20 minutes, refreshed when the time range changes), so every row starts at the left edge with the last state at or before the range start and nothing is drawn before the start or after now. There is no word for missing data: a row with no point shows an empty gap, and Unknown appears only when the collector itself reports state 4. A state older than the row's freshness limit (360 s collector, 720 s Cloud SQL and webhook, 300 s scheduler) ends at its last point plus the limit and leaves a gap up to now. Scheduled-job rows hold their last state for 2 min (every-minute jobs), 65 min (hourly) and 25 h (daily), through the hidden variables `lookback_hour` (80 min) and `lookback_day` (26 h) on PWA & APIs; for example the daily-charges row is empty until its 17:05Z run. Timeseries are unchanged because Grafana clips them. State timelines show one row per component and print the state word in the bar; Down is dark red (colour-blind safe, with the state word as the second cue); bar gauges are LCD style with the maximum at the documented limit and a red mark only at an alert value; a red or dashed line appears only for a documented limit or an alert value, so request-rate charts have none; panels are at least 6 grid units wide so a phone shows one panel per screen. Grid positions are x/y/w/h.

### Now (`mw-now`)

| ID | Panel | Shows | Notes |
| --- | --- | --- | --- |
| 1 (rows 1-A to 1-J) | PROD services · last 3 h | State timeline, one row each: 1-A Hosting `lm.mw-credit.com`; 1-B Reader API `/health`; 1-C Command API (worst of `/health`, `oltp`, `olap`); 1-D Notify worker (scheduler attempts from `mw_scheduler_attempts_prod`); 1-E Jobs worker; 1-F Cloud SQL `database/up`; 1-G Receipt recognizer; 1-H Agent receipt cycle; 1-I Partner conversation; 1-J Metabase | 0/0/16/11. Collector rows use the six-minute freshness rule; Paused (blue) is intentional |
| 2 | Firing alerts | Grafana alert list, folder MW Resource Monitoring Alerts: firing, pending, error and no data | Shows "No alerts" when quiet; no resolved history |
| 3 | Telemetry freshness | Age of the newest point of `database`, `pwa_hosting_prod`, `metabase_platform` and Cloud SQL CPU | Green under 360 s, grey "stale" otherwise; explains a wave of grey rows |
| 4 | Payments pipeline | Six values: last scan (Bangkok time; the Scan tile reads only the completion-time row, which fixes an intermittent "—"), pending images, unnotified holds, pending reviews, unconfirmed postings, failed notifications | Same rules as the previous Performance panels 101 to 107 |
| 5 | Partner chat | Four tiles: Undelivered (READY, FAILED, UNKNOWN_WRITE or INTERRUPTED over 5 minutes), Stuck (RUNNING over 15 minutes), Last turn (state), Last turn age | QUEUED is the normal delivered end state of a turn, so there is no queue tile. Alert: stalled conversation (Stuck or Undelivered at 1 or more) |
| 6 | Push | Pending, oldest pending, failed and Sent · 24 h (delivered in 24 h) | PROD only; alert: push delivery backlog |
| 7 | Scheduled jobs | Age of the newest completed run of Notify job · last run, daily charges and recent analytics (jobs have no failed state, V94) | Alert: scheduled job overdue |
| 8 | Cloud SQL capacity | Four LCD bar gauges: CPU (red 85 %), RAM used (85 %), connections (max 200, red 160), disk (red 80 %) | Alerts: Cloud SQL connections, CPU, memory and disk |
| 9 | Hosts and services | Four LCD bar gauges: Debian VM RAM (red 85 %), Metabase RAM (90 %), command instances (max 2, no red), reader p95 over 5 min (max 15 000 ms, no red) | Shows "idle" without requests |
| 16 | Edge · last 3 h | State timeline: webhook (Singapore checker only), tunnel, Tailscale, ingress, database, audit relay | The uptime check keeps three regions; only the Singapore series is read |
| 17 | Provider status | Railway and Google Cloud status; one stat, current status only (OpenAI is no longer on the new dashboards): Railway from the Instatus feed `https://railway.instatus.com/summary.json` (0 Outage for a major outage; 2 Incident open for an active incident or HASISSUES; 3 Maintenance for maintenance in progress or UNDERMAINTENANCE; 1 No incident for UP; otherwise 4 Feed unreadable), and open Google Cloud incidents touching Cloud Run, Cloud SQL, Vertex AI, Cloud Scheduler, Cloud Monitoring or Firebase Hosting in asia-southeast1 or global | Google Cloud: 1 none, 2 open incident, 4 feed unreadable |
| 19 | Backups and recovery points | Six rows: Cloud SQL backup, Debian snapshot, PITR archive, Audit retention, Metabase daily, Metabase weekly: age and state | Alerts: Cloud SQL backup overdue, Debian snapshot overdue |

Not on Now by design: DEV, Azure VM-01, Codex readiness, the bridge, request charts and raw-data tables.

### PWA & APIs (`mw-pwa`)

Variable: `env` (prod or dev, default prod) is hidden; the PROD and DEV links after Cost switch it. The hidden `lookback_from`, `lookback_hour` and `lookback_day` feed the timeline rows. There is no service dropdown. The previous PWA Platform copies are replaced by `env`, and the four Cloud Run services (read, command, notify, jobs) are static rows. The business-database panels (21, 22) read PROD only and show "PROD only" for DEV.

| ID | Panel | Shows | Notes |
| --- | --- | --- | --- |
| 1 | Hosting · ${env} | Canonical Hosting health, version marker and entry reference | One vantage (Debian), not login or multi-region |
| 2 | API health | Unauthenticated `/health` of both services; PROD adds the authenticated `oltp` and `olap` probes | DEV has only the unauthenticated checks |
| 3 | Sign-in and request errors · 24 h | Counts of `session_invalid`, `session_check_unavailable`, `body_timeout` and Cloud Run 5xx | Counts only, no user identity; read from the existing request records, no services change |
| 10 to 13 (static rows, with 101 to 103, 111 to 113, 121 to 123, 131 to 133; the third panel of each row is titled '<service> · instances, CPU, RAM') | Service rows: reader, command, notify, jobs | The three panels of each row: requests per 5 min (all blue solid, 4xx orange dashed, 5xx red dotted); p95 latency with a red dashed request-timeout line (reader 15 s, command 55 s, workers 120 s); instances, CPU % and memory % with a grey dashed maximum-instances line, each drawn with that service's own value | Request charts have no threshold; idle is neither Down nor Healthy |
| 19 (row), 20 | Cloud Scheduler attempts · 24 h | State timeline for the notifications, daily-charges and recent-analytics jobs, from the log-based metric `mw_scheduler_attempts_<env>` (Cloud Monitoring has no `attempt_count` metric in this project) | DEV jobs are paused and show grey |
| 21 | Push delivery | Pending (pending plus retry), failed (dead plus uncertain) and Sent · 24 h (delivered in 24 h) | PROD only; failed above 0 colours the value orange but does not page (expired subscriptions are normal churn) |
| 22 | Job freshness | Age of the newest completed run per job (no failed state), plus the row 'Last notification sent' (age of the last push dispatch) | PROD only |
| 29 (row), 30 | Recognitions · 24 h (one bar gauge per outcome; 'Clean' for none) | Count per outcome by the `warning` field: none, `amount_unreadable`, `amount_fractional`, `account_unmatched`, `account_ambiguous`, `slip_not_confirmed`, other | Log-based counter `mw_recognition_outcome_<env>`; no slip content |
| 31 | Recognition route p95 · 24 h | Latency of the receipt recognition route | Red dashed at 45 s (route budget); the PWA deadline is 60 s |
| 32 | Recognizer service | Service state only (health) | Links to Agent & Receipts |
| 33 | Recognizer model | Provider with model, for example 'Gemini · gemini-3.5-flash-lite' (collector field `model:<id>`) | |

HTTP metrics do not prove job-boundary completion, push provider acceptance or device delivery; use 20, 21 and 22 for those.

### Agent & Receipts (`mw-agent`)

Everything is Debian-backed except the webhook check and the two public status feeds. The 12 Debian alert components keep their metric labels.

| ID | Panel | Shows | Notes |
| --- | --- | --- | --- |
| 1 | Receipt pipeline · stages | The pipeline stage stats of Now 4 (scan reads only the completion-time row; pending images, unnotified holds, pending reviews, unconfirmed postings, failed notifications) | Stalled, unnotified holds, overdue reviews, unconfirmed postings and failed notifications above 0 are red; Paused does not page |
| 2 | Receipts · queue over time | Receipt queue trend | Lines break at gaps over 6 minutes |
| 14 | Receipts · ingress reviews | `ingress_review_open`; above 0 is orange | Closes the former known gap for the card |
| 6 | Recognizer · service | Health and restart age | Paused (blue) when recognition is disabled |
| 12 | Recognizer · model | Provider with model, for example 'Gemini · gemini-3.5-flash-lite' | From the collector field `model:<id>` |
| 7 | Recognizer · extractions 24 h | Extractions, valid, timeouts and unreadable | Counts from the agent audit schema, no content |
| 8 | Recognizer · extraction time | Duration of the newest extraction per run | Red dashed at 25 s (per-attempt bound) |
| 3 | Conversation · turns 24 h | Turns, verified, failed and review counts, taken from the turn result (not the queue state) | A 24 h count of 0 with no new Partner message is normal |
| 4 | Conversation · turn duration | Seconds (one decimal), rounds and provider for each completed turn | One point per collector run at most; no reference line |
| 5 | Conversation · loop health | Poll age and state, wake path, timer | Alert: stalled conversation |
| 15 | Conversation · model | Provider and model of the Partner conversation | |
| 9 | Agent workers and timers | State timeline: receipts, conversations, conversation poll state, polling, daily jobs, audit relay, audit retention | Holds last state 2 min, 65 min or 25 h by job cadence |
| 10 | Connectivity · edge and data | State timeline: webhook (Singapore), tunnel, Tailscale, ingress, database, Codex readiness | |
| 11 | Providers · status | Railway and Google Cloud status; same stat as Now 17 (nine rows) | Feeds have no history, so a stat |
| 13 | Connectivity · code version | 1 when the receiver's code version matches the deployed commit prefix | Closes the former known gap for `webhook_code_version` |

Rows by component: Receipt pipeline (20: panels 1, 2, 14), Receipt recognizer (21: 6, 12, 7, 8), Partner conversation (22: 3, 4, 5, 15), Agent workers and timers (23: 9), Connectivity and providers (24: 10, 11, 13).

The bridge tiles of the previous row 5 (121 to 127) are not carried over; the Grafana-to-Dots bridge is being decommissioned and has no panel.

### Infrastructure (`mw-infra`)

Four expanded rows and one collapsed row. Every chart draws a documented limit or an alert value as a dashed line.

| ID | Panel | Shows | Limit / threshold |
| --- | --- | --- | --- |
| 1 | Cloud SQL CPU | Instance-wide CPU | Red dashed 85 % |
| 2 | Cloud SQL memory | Usage, cache, free | Red dashed 85 % on Used |
| 3 | Cloud SQL disk | Disk utilisation (replaces the previous storage panel 33) | Red dashed 80 %; auto-resize noted |
| 4 | SQL connections | Backend count against the limit of 200 | 200 line, red dashed 160 |
| 5 | Backups and restore points | Last automated backup age and status, log retention, Debian snapshot age; table headers 'Age, Last run, Type, PITR' | Second row of the layout (y 7) with 6 to 8: Backups, Instance facts, Top statement, Connections by DB |
| 6 | Instance facts | Tier, storage type and `max_connections` (dated snapshots), uptime | The only static text |
| 7 | Connections by DB | Backends per database | No threshold |
| 8 | Top statement | Share of total execution time and calls per minute of the top statement | Statement text stays on the VM; shows "not granted" until the grant exists |
| 9 | Cloud Run · eight services (width 16 beside Connections by DB, y 12, height 10; names such as 'command · prod', coloured text cells) | Instances, p95 CPU and memory over 15 minutes, billable instance time, maximum instances | Over 80 % orange |
| 10 to 12 | Debian VM CPU, memory, network | CPU, used memory (red dashed 85 %), network | |
| 13, 18 | Debian VM disk (height 7); Debian VM uptime | 13 disk throughput; 18 uptime (VM start) | Infrastructure legends are lists below each chart with full series names |
| 14 to 16 | Metabase CPU, Metabase RAM, Postgres volume | CPU cores against live `CPU_LIMIT`; memory GB against live limit (red dashed 90 %); Postgres volume (5 GB line) | |
| 17 | Metabase probes (full width) | One row each: platform, app DB, reporting DB, charts, PITR, daily and weekly backup | Same selectors as the previous panels 80 to 86 |
| 20 (collapsed row) with 21 to 24 | Azure VM-01 | The previous Azure panels 11 to 14, unchanged, as children 21 to 24 (23 is titled 'VM-01 · Network transfer') | No 24x7 expectation, no alert |

### Cost (`mw-cost`)

Time zone Asia/Bangkok for display; provider day rules are unchanged (Azure UTC days, GCP Singapore date, Railway current billing cycle). No forecast. Cost data is delayed and provisional.

| ID | Panel | Shows | Notes |
| --- | --- | --- | --- |
| 1 | Total · this month | Sum of available provider costs in SGD; it hosts the shared queries A to E behind the provider tiles (the former Coverage and FX panel 5 is removed). Top row: TOTAL, Azure, GCP, Railway (y 0, height 4, width 6 each) | "Available costs only"; Railway prior month is "cycle only" |
| 2 to 4 | Azure, GCP, Railway | Provider month-to-date stats | |
| 9 | Last month, same day | Prior month to the same day of the month (y 4) | Reference, not a forecast |
| 8 | GCP budget | Live from the Cloud Billing Budget API: `Budget-GCP`, 20 SGD monthly, account-wide (covers every project on the billing account, including `cs-project-xwidnnhn`); needs `roles/billing.viewer` for the Grafana service account | Cell text 'S$20.00 / month · Budget-GCP · whole billing account' |
| 6 | Daily cost · this month | One stacked SGD chart that follows the date picker (month to date; daily bars are placed at Singapore noon): Azure blue and GCP orange, GCP net from BigQuery filtered to `clever-oasis-508610-n7`. Railway is left out because its estimate starts mid-month | The line 'GCP budget (billing account) / day' is the live budget ÷ days in the month. Not like-for-like: GCP cost is project-only, the budget covers the whole billing account |
| 7 | GCP by service · net | Billing export grouped by service, net of credits (month to date); columns reordered, 'Monitoring and Logging' is one service name | 100 MB billed-query cap |
| 10, 20, 30 (collapsed rows) | Azure, GCP, Railway | The previous Cost detail panels unchanged, with their old child IDs | Rates checked 25 September 2026 stay in the description |
| 40 | Unchanged rules of reading | Short reading text (y 23, height 4); the collapsed provider rows follow at y 29 to 31 | References, not forecasts |

### Alerts linked to the new dashboards

The nine remaining Performance 2m rules keep their names, labels and conditions (the OpenAI product status rule `efz3obf98zksga` was removed on 22 October 2026 on the owner's decision, commit `11be21c`, apply pending); the webhook rule now reads the Singapore checker series only. The group PWA 2m (twelve rules, applied paused, then unpaused after 24 hours without a false firing) is in the [operating alert reference](Resource_Monitoring.md#pwa-2m-alert-group-r089); each rule's query is the selector of its Now panel reduced to a 0/1 value, so panel and rule cannot disagree.

| Rule | Now panel | Depth dashboard |
| --- | --- | --- |
| PWA Hosting PROD unreachable | 1-A | PWA & APIs 1 |
| PWA API health failed | 1-B, 1-C | PWA & APIs 2 |
| Cloud Run 5xx | 1-B, 1-C | PWA & APIs 3, 10 to 13 |
| Notification scheduler failing | 1-D | PWA & APIs 20 |
| Scheduled job overdue | 1-E, 7 | PWA & APIs 22 |
| Push delivery backlog (oldest pending over 15 min only) | 6 | PWA & APIs 21 |
| Receipt recognizer unhealthy | 1-G | Agent & Receipts 6 |
| Partner conversation stalled | 1-I, 5 | Agent & Receipts 3 to 5 |
| Cloud SQL down | 1-F | Infrastructure 1 to 4 |
| Cloud SQL disk high | 8 | Infrastructure 3 |
| Cloud SQL backup overdue | 19 | Infrastructure 5 |
| Debian snapshot overdue | 19 | Infrastructure 5 |

## Previous dashboards — kept until retirement

Performance (`mw-resource-performance`, version 41), Cost (`mw-resource-cost`, version 15) and PWA Platform (`mw-pwa-platform`, version 2) are unchanged and stay in the folder for at least 14 days after the cutover. They are retired only on the owner's explicit instruction, which removes the sections below. Performance and Cost still display Singapore time. Do not use them for new links.

## Performance — alerts linked to visuals

Nine rules (the OpenAI product status rule was removed on 22 October 2026, commit `11be21c`) evaluate every two minutes over a rolling ten-minute window ending now, independent of the time picker. Thresholds, labels and no-data policy are in the [operating alert reference](Resource_Monitoring.md#performance-alerts-and-phone-delivery-23-september-2026).

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
| Azure | 101 | Daily detail (USD) (new Cost title 'Azure · daily detail (USD)') | Date, resource, cost, currency, newest first | As 102 | Source table for the others |
| Azure | 110 | Running hours by day (new Cost title 'VM-01 · running hours by day') | Daily hours from `VmAvailabilityMetric` minute averages, gray unknown hours, hover coverage; Singapore day boundaries | Azure Monitor | Lower bound, not billable runtime; ranges over 31 days rejected; Azure keeps 93 days |
| GCP | 202 | Before credits (SGD) | Gross usage | BigQuery billing export (`mw_cloud_billing`) | Net = gross + credits |
| GCP | 203 | Credits (SGD) | Sum of exported credits, normally negative; not a remaining balance | As 202 | None |
| GCP | 204 | Net cost (SGD) | Gross plus credits | As 202 | None |
| GCP | 205 | Export status | Static text, not a live exporter probe | None | Data can lag |
| GCP | 207 | By resource (SGD) | Net by service and resource, largest first; Unallocated when unattributed | As 202 | Fully credited rows show S$0.00 |
| GCP | 206 | Daily cost (SGD) (new Cost title 'GCP · daily cost (SGD)'; gross, credits and net) | Gross, credits and net by Singapore date | As 202 | Recent days can lag |
| GCP | 201 | Daily resource detail | Service, date, gross, credits, net, resource, newest first | As 202 | Source table; 100 MB billed-query cap |
| Railway | 302 | Accrued usage (new Cost title 'Railway · accrued usage') | Workspace `customer.currentUsage` in USD | Railway GraphQL | Not the payable bill |
| Railway | 301 | Billing period (new Cost title 'Railway · billing period') | Workspace, plan, usage, cycle dates | As 302 | None |
| Railway | 303 | How to read Railway cost | Static explanation | None | None |
| Railway | 304 | Resources (USD est.) (new Cost title 'Railway · resources (USD est.)') | Current-cycle estimate per service from usage units at published rates (CPU $0.0004632 per vCPU-minute, RAM $0.0002316 per GB-minute, volume $0.0000036 per GB-minute, egress $0.05 per GB) | `railway-resource-cost.jq` | Rates checked 25 September 2026; differs from 302 |
| Railway | 305 | Daily estimate (USD) (new Cost title 'Railway · daily estimate (USD)'; compute and volume) | Hourly CPU, RAM and volume samples times rates, by Singapore date, current cycle only | `railway-daily-estimate.jq` | Excludes egress, plan fees, credits and unsampled intervals; does not reconcile to 302 |

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
