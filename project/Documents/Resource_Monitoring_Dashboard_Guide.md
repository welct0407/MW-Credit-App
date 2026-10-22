# Resource monitoring dashboard — visual guide

Covers the five dashboards Now, PWA & APIs, Agent & Receipts, Infrastructure and Cost (R089), and the retired three (Performance, Cost, PWA Platform, retired 22 October 2026). [Resource Monitoring](Resource_Monitoring.md) owns setup, access, collection, alert rules and recovery; the [alert troubleshooting runbook](Rules/Grafana_Alert_Troubleshooting_Runbook.md) owns incident response. Definitions live in [`infrastructure/grafana/dashboards/`](../../infrastructure/grafana/dashboards/) and are built by [`project/scripts/monitoring/`](../scripts/monitoring/README.md) (deploy and rebuild steps: see the operating reference). Panel IDs are unique within each dashboard; use dashboard, group and ID together.

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

Conventions on all five (owner review, `8d77284`; fit pass `9ea0209`): a tile field shows its newest sample from the last 6 minutes (each field is read on its own, so one missing collector run does not blank the tile; a job age still needs its state from the same run); table columns have fixed widths on Infrastructure (Cloud Run scrolls sideways on a phone); timelines get a fixed label width from the longest lane name (PWA 20 lanes 'Notify · 1 min', 'Charges · 00:05', 'Analytics · hourly'), and `layout-model.cjs` checks every panel title (14 px, one line) and lane label at 1440 px (grid about 1024 px) and 390 px, which is why titles are short; the Scan last-run tile (Now 4, Agent 1) carries the newest completion within its 3 h window (`scan-completion.jq`); Now 19 reads the Metabase daily and weekly ages from the newest DAILY and WEEKLY snapshot; text is larger: stat names 16 px, values 32 px, multi-value tiles as name/value rows, gauges 16/22 px, tables medium, text tiles 20 px (Grafana cannot size timeline labels, legends and axes, table font or the alert list; `project/scripts/monitoring/layout-model.cjs` checks the layout at 1440 and 390 px). One-value tiles show the value only (Agent 13, Infrastructure 18, Cost 1, PWA 1). State timelines (Now 1 and 16, PWA 20, Agent 9 and 10) read from the hidden variable `lookback_from` (range start minus 20 minutes, refreshed when the time range changes), so every row starts at the left edge with the last state at or before the range start and nothing is drawn before the start or after now. There is no word for missing data: a row with no point shows an empty gap, and Unknown appears only when the collector itself reports state 4. A state older than the row's freshness limit (360 s collector, 720 s Cloud SQL and webhook, 300 s scheduler) ends at its last point plus the limit and leaves a gap up to now. Scheduled-job rows hold their last state for 2 min (every-minute jobs), 65 min (hourly) and 25 h (daily), through the hidden variables `lookback_hour` (80 min) and `lookback_day` (26 h) on PWA & APIs; for example the daily-charges row is empty until its 17:05Z run. Timeseries are unchanged because Grafana clips them. State timelines show one row per component and print the state word in the bar; Down is dark red (colour-blind safe, with the state word as the second cue); bar gauges are LCD style with the maximum at the documented limit and a red mark only at an alert value; a red or dashed line appears only for a documented limit or an alert value, so request-rate charts have none; panels are at least 6 grid units wide so a phone shows one panel per screen. Grid positions are x/y/w/h.

### Now (`mw-now`)

| ID | Panel | Shows | Notes |
| --- | --- | --- | --- |
| 1 (rows 1-A to 1-J) | PROD services · last 3 h | State timeline, one row each: 1-A Hosting `lm.mw-credit.com`; 1-B Reader API `/health`; 1-C Command API (worst of `/health`, `oltp`, `olap`); 1-D Notify worker (scheduler attempts from `mw_scheduler_attempts_prod`); 1-E Jobs worker; 1-F Cloud SQL `database/up`; 1-G Receipt recognizer; 1-H Agent receipt cycle; 1-I Partner conversation; 1-J Metabase | 0/0/16/11. Collector rows use the six-minute freshness rule; Paused (blue) is intentional |
| 2 | Firing alerts | Grafana alert list, folder MW Resource Monitoring Alerts: firing, pending, error and no data | Shows "No alerts" when quiet; no resolved history |
| 3 | Telemetry freshness | Age of the newest point of `database`, `pwa_hosting_prod`, `metabase_platform` and Cloud SQL CPU | Green under 360 s, grey "stale" otherwise; explains a wave of grey rows |
| 4 | Payments pipeline (each stage coloured by health: Scan by the IG polling state, with the time shown and a grey '—' when stale; Extraction waiting green, orange when the oldest waiting image is over 600 s; holds, unconfirmed postings and notification failures green at 0 and red above 0; reviews waiting or overdue orange when any review is overdue) | Six values: last scan (Bangkok time; the Scan tile reads only the completion-time row, which fixes an intermittent "—"), pending images, unnotified holds, pending reviews, unconfirmed postings, failed notifications | Same rules as the previous Performance panels 101 to 107 |
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
| 2 | API health | Unauthenticated `/health` of both services; PROD adds two authenticated probes on the PROD command service, 'Chat data · live' (`oltp`: live loan and payment data) and 'Chat data · reports' (`olap`: analytics and reports); each checks the conversation-API sign-in, the catalogue manifest version and one key-only read; the metric labels `oltp` and `olap` are unchanged | DEV has only the unauthenticated checks |
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
| 1 | Receipt pipeline · stages | The pipeline stage stats of Now 4, with the same health colours (scan reads only the completion-time row; pending images, unnotified holds, pending reviews, unconfirmed postings, failed notifications) | Stalled, unnotified holds, overdue reviews, unconfirmed postings and failed notifications above 0 are red; Paused does not page |
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
| 14 to 16 | Metabase CPU, Metabase RAM, Postgres volume | CPU cores against live `CPU_LIMIT`; memory GB against live limit (red dashed 90 %); Postgres volume (5 GB line) | CPU and RAM each send one Railway call for both services (R090), so Railway's API rate limit no longer fails one of the former four calls |
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
| 40 | Unchanged rules of reading | Short reading text (y 23, height 4) | References, not forecasts |
| 49, 50 | Partner chat · cost per question (row) · last 10 questions (R090) | The 10 latest answered Partner chat questions, newest first: time asked, question text, model, uncached input, cached input, output and thinking tokens of every round of the turn (tool calls included), and Cost (SGD) at the billed Vertex AI unit prices in `project/scripts/monitoring/model-prices.json` (Gemini 4 Argon S$5.11 input, S$0.26 cached, S$25.56 output and thinking per million tokens); the footer sums the listed questions | Read live from the agent database through Grafana PDC (`mw-agent-questions`, function `monitoring.recent_questions_v1`), not stored in Cloud Monitoring. "No usage record" = a Codex turn (subscription) or usage older than the 7-day audit retention or recorded before 21 October. The collapsed provider rows follow at y 41 to 43 |

### Colour policy for stat fields (all 78, commit `88e5f43`)

| Kind of field | Colour rule | Examples |
| --- | --- | --- |
| State | The state colours (Healthy green, Degraded orange, Down dark red, Paused blue, Unknown grey) | Timelines, service and provider state |
| Problem now | Red above 0 | Failed jobs, unnotified holds, unconfirmed postings, notification failures |
| Attention over a period | Orange above 0 | Review overdue, push oldest pending over 900 s, job ages past their limit (Failed stays red), Agent poll age over 600 s, Cloud SQL backup age over 30 h, PWA 3 503 session check, body timeout and 5xx, Agent 7 timed out |
| Normal work or volume | Neutral | Counts of requests, turns, extractions, recognitions (PWA 30 bars) |
| Normal work with an owner-set limit (R090) | Green below, orange from the limit | Push pending 5 (Now 6, PWA 21), 401 session invalid 10 in the range (PWA 3) |
| Age with a documented limit | Green, orange past the limit, grey when stale | Scan time, Extraction waiting (600 s); owner-set limits (R090): Last turn age and Last send 7 days (Now 5, Agent 5), Last notification 48 h (PWA 22) |
| Money | Neutral | Cost tiles |
| Information | Neutral | Versions, models, providers |

Fixed state fills (commit `447eb1e`), readable with white text in both themes: OK `#2E7D32` (4.8:1), Degraded `#A65200` (5.2:1), Down dark red (5.7:1 light, 7.1:1 dark), Paused dark blue (5.6:1 light, 7.1:1 dark), Unknown `#6E7079` (4.6:1). They apply to stat backgrounds, coloured table cells (the Cloud Run CPU and Memory cells now have coloured backgrounds) and timeline lanes, and lifted tiles map to the same shades; the build test enforces at least 4.5:1 in both themes. Cost 8 GCP budget and the provider and model text tiles (PWA 33, Agent 12, Agent 15) have no fill. Agent 7 Unreadable and Agent 3 Grounding rejections are attention counts (green 0, orange above 0); PWA 3 'None' is green (the 401 count stays neutral). Now 19 keeps a fixed list of six backup rows, and a failed Railway read shows Metabase daily and weekly as '—' (Unknown). Cloud Run billable time shows one decimal.

The R090 limits (owner decision, 22 October 2026, team recommendation) colour fields that have no alert value: Partner chat averages about one turn a day, so a week without a turn or a reply is the signal; a push goes out on most days, so two days without one is unusual; a sign-out (401) is normal, ten in the selected range (24 h by default) is not; a push is normally delivered within the minute, so five waiting is a backlog (Oldest pending keeps the 900 s alert value). The Cost total stays neutral: the budget covers GCP only (owner decision, 22 October 2026).

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

## Retired dashboards

Performance (`mw-resource-performance`, last version 41), Cost (`mw-resource-cost`, 15) and PWA Platform (`mw-pwa-platform`, 2) were retired on the owner's instruction of 22 October 2026 (R090) and deleted from Grafana by the guarded Terraform destroy. Their last deployed JSON stays in [`project/scripts/monitoring/dashboards/retired/`](../scripts/monitoring/dashboards/retired/), the source the builder copies proven panels from; their panel inventories are in Git history before that batch. The alert rules and their runbook links already pointed to Now.

## Maintaining this guide

Update this guide in the same batch as any dashboard change: add, remove or rename the row and ID in the matching table, and update source, units, freshness, state mapping and limits. Compare against the current saved definitions in `infrastructure/grafana/dashboards/`, not an earlier builder baseline. Keep fixed limits (dated) separate from live-limit series, and static text separate from live status.
