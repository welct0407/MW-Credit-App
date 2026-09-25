# Resource monitoring dashboard — visual guide

Pending addition: a Payment processing group is specified in the [monitoring handover](https://github.com/welct0407/MW-Integration-Agent/blob/main/docs/MONITORING_IMPLEMENTATION_HANDOVER.md). It is not yet configured; the live visuals and alert behavior documented below remain unchanged. Update this guide when that implementation is saved and verified.

Last updated: **25 September 2026**. Covers the maintained Performance and Cost definitions, including compact status tiles and OpenAI incident hover details. This is the user guide; [Resource Monitoring](Resource_Monitoring.md) owns setup, access, collection, recovery and configuration details.

- [Open Performance](https://monitor.mw-credit.com/d/mw-resource-performance)
- [Open Cost](https://monitor.mw-credit.com/d/mw-resource-cost)

## Reading either page

Both pages display **Singapore time (UTC+8)**. The Performance/Cost links switch pages. The time picker chooses the displayed period; refresh requests new data. The saved Performance page currently uses the last three hours and one-minute refresh; its builder baseline and context-strip caption retain the original six-hour/two-minute defaults. Use the time picker and refresh selector as the active settings. Cost defaults to the current month and refreshes hourly. A refresh does not make provider data arrive sooner.

Performance's large CPU/RAM numbers show the **last available sample in the selected range**, not a period average or a guaranteed instantaneous reading. The small line behind each number is its history. Old samples can remain visible when a machine stops: VM-01 is not running 24x7, so its last number alone is not proof that it is currently online. Detailed charts show gaps rather than inventing zeroes. Hover over a chart for sample timestamps and series values; its legend may show the last non-null value and maximum over the selected period.

Availability lights describe current health at refresh time. They are not uptime percentages or incident history. Most depend on Debian telemetry; the external webhook and OpenAI provider checks do not. Historical date ranges can exclude recent Debian samples and produce Unknown; use a range ending at now for operational checks. OpenAI always retrieves the current published status, regardless of the selected historical range.

Percent/count/throughput labels generally use whole numbers. Fractional CPU cores, GB and money retain useful precision. A red reference line marks a documented capacity/configuration limit, not a universal warning threshold. Green CPU/RAM chart styling does not by itself certify healthy operation. Nine active Performance alert rules send mobile push through IRM; three of them evaluate multiple separately labeled tile conditions. Alerts do not alter chart values or add threshold lines.

## Performance — alerts linked to visuals

The following rules evaluate every two minutes with a rolling ten-minute query window ending at now. They are independent of the dashboard time picker and refresh. **Pending** means the condition must persist before a phone notification. The phone route was tested on 23 September 2026. [Operating alert reference](Resource_Monitoring.md#performance-alerts-and-phone-delivery-23-september-2026) covers ownership, no-data behavior and rollback.

| Visual IDs | Mobile alert condition | Pending | Interpretation |
|---|---|---|---|
| 51 | External webhook DEGRADED or DOWN (at least one fresh region failed) | 10 min | Requires all three regional reports within 12 minutes; stale or missing checks stay Unknown and do not page. |
| 52, 53, 56, 57, 60–67 | See the Debian component mapping below | 4 min | Each component has its own labeled alert instance; fresh Down or Degraded pages. Paused and Unknown do not. |
| 80–83 | Metabase platform, application DB, reporting DB and Charts | 4 min | Four separate instances in one rule; fresh Down or Degraded pages. Unknown, missing and stale telemetry do not trigger a new page. |
| 54, 55 | Published ChatGPT or Codex status DEGRADED or DOWN | 10 min | Separate alert instance per product; a non-operational component or active incident in its current product group pages. Unrecognized/missing source data stays Unknown. |
| 50, 34 | Cloud SQL backend count above **160** | 10 min | Early warning at 80% of configured 200. The red chart line still marks 200; reserved PostgreSQL slots lower ordinary-client capacity. |
| 4, 31 | Cloud SQL CPU above **85%** | 10 min | Five-minute mean; 85% is an operational warning, while the chart's 100% line is capacity. |
| 8, 32 | Cloud SQL `database/memory/components` **Usage** above **85%** | 10 min | Uses the Used component, not `database/memory/utilization` or Cache. |
| 7, 22 | Debian VM Ops Agent `memory/percent_used`, state `used`, above **85%** | 10 min | Used RAM only; other memory states are excluded. |
| 9, 42 | Railway Metabase used memory above **90% of its corresponding live limit** | 10 min | Uses `100 × MEMORY_USAGE_GB / MEMORY_LIMIT_GB`; allocation changes are reflected in the limit metric. |

The Debian-backed tile-to-component mapping is: 52 Tunnel → `tunnel`; 53 Tailscale → `tailscale_node`; 60 Ingress → `webhook_local`; 56 OLTP → `oltp`; 57 OLAP → `olap`; 61 Converse → `conversations`; 62 Receipts → `receipts`; 63 IG polling → `polling`; 64 Daily jobs → `daily_jobs`; 65 Database → `database`; 66 Audit relay → `audit_relay`; 67 Codex ready → `codex_ready`. Each is evaluated separately, even though one Grafana rule hosts all 12 instances. SQL connections (50) and OpenAI (54–55) and the external webhook (51) complete the 16 tile conditions. The superseded grouped four-component rule was deleted after its replacement was verified.

These values are alert thresholds, not newly configured subscription/resource limits. Azure VM-01 has no uptime push rule because it is intentionally not 24x7. An Unknown light or query error needs investigation but does not itself page. The external webhook, local ingress and other Debian components may all alert during one incident; their separate labels show which checks failed.

Panel IDs below are maintenance references, unique **within each page**. Names repeat in some detailed sections, so use the page, section and ID together.

## Performance — context and grouping

| ID | Visual | Meaning |
|---|---|---|
| 1 | Azure · GCP · Railway · SGT · 2m and status legend | Static context and light-color key. The text itself is not a monitoring signal. |
| 70 | CONNECTIVITY | Groups the public entry point and Debian network/receiver checks. |
| 71 | APPS & OPENAI | Groups the two AppSheet API probes and two published OpenAI service checks. |
| 72 | AGENT WORKFLOWS | Groups scheduled business-worker health on Debian. |
| 73 | DATA & RUNTIME | Groups SQL connections, database access, audit relay and local Codex readiness. |
| 74 | METABASE · PLATFORM | Platform and application database, right side of row 3. |
| 75 | METABASE · REPORTING | Reporting connection and custom Charts service, right side of row 4. |

These seven labels are vertically centered in slim strips. The values in the 20 small status/data tiles are horizontally centered beneath their labels. Component icons are Unicode pictograms, not official vendor logos. The four expandable detail headers identify Azure VM-01 (ID 10), the GCP Debian VM (20), shared Cloud SQL (30), and Railway production (40); they organize charts and do not report health themselves.

## Performance — CPU and RAM overview

The same four resources appear in matching columns, CPU first and RAM directly below.

| ID | Visual | What the number means | How to interpret it |
|---|---|---|---|
| 2 | Azure VM · CPU | Azure VM-01 Percentage CPU, averaged over each provider interval. | Percentage of VM CPU capacity; 100% is capacity. Inspect sustained load in the Azure detail chart. |
| 3 | GCP VM · CPU | CPU utilization of `vm-mw-credit-agent`, displayed as a percentage. | Debian VM compute load; 100% is the utilization reference. |
| 4 | Cloud SQL · CPU | CPU utilization of `appsheet-pg-prod-20260914`. | Instance-wide load shared by its databases, including DEV/PROD workloads; not one app's CPU. |
| 5 | Metabase · CPU cores | Railway Metabase CPU usage in cores. | **1.00 means one core**, not 1%. Compare with Metabase's live limit in the Railway CPU chart. |
| 6 | Azure VM · RAM used | `100 − Available Memory Percentage`. | Used percentage is derived from Azure's available-memory metric. The detailed Azure memory chart shows the opposite quantity: available memory. |
| 7 | GCP VM · RAM used | Ops Agent memory `percent_used`, filtered to the `used` state. | OS-reported used memory; inspect the detailed VM chart for trend. |
| 8 | Cloud SQL · RAM used | `database/memory/components`, component **Usage**, labeled Used. | Excludes the separately reported Cache and Free components. It does **not** use `database/memory/utilization`; that metric's former 100% reading was not proof of memory pressure. |
| 9 | Metabase · RAM used | `100 × MEMORY_USAGE_GB / MEMORY_LIMIT_GB`, using the corresponding latest limit at each usage sample. | Percentage of the service's Railway memory allocation. The detailed chart shows the GB quantities and changing limits. |

## Performance — status-light rules

| Light | State | Meaning |
|---|---|---|
| 🟢 | Healthy | The specific checks described below pass. This is limited to what each check tests. |
| 🟠 | Degraded | Partial failure, provider impairment, overdue worker completion or excessive runtime, depending on the component. |
| 🔴 | Down | A checked service/path failed or a required timer stopped. |
| 🔵 | Paused | A supported component's existing activation flag is disabled. It is intentionally inactive. |
| ⚪ | Unknown | Missing/stale telemetry, an unavailable check or query error. It is neither healthy nor necessarily down. |

Debian collects every two minutes. Reports older than **six minutes** become Unknown. A failed or stale query may also show Grafana's panel error indicator. If many Debian-backed lights become Unknown together, investigate Debian and its monitoring timer/export before assuming every business service failed independently. Monitoring does not depend on the intermittently running Azure VM.

### Connectivity

| ID | Tile | Check and interpretation |
|---|---|---|
| 51 | 🔗 Webhook | GCP checks `https://hooks.mw-credit.com/health` every five minutes from Singapore, Belgium and Oregon. Valid HTTPS, HTTP 200 and the expected receiver response are required. All three fresh results pass → Healthy; mixed pass/fail → Degraded; all fail → Down. Fewer than three recent results → Unknown, with a 12-minute freshness allowance. This tests public reachability without submitting a business webhook. |
| 52 | ☁ Tunnel | Debian's Cloudflare tunnel process and HA connection count. Active process with at least four connections → Healthy; one to three → Degraded; zero or inactive process → Down. Missing connection metrics → Unknown. This complements the external Webhook check. |
| 53 | 🛡 Tailscale | Debian reports Tailscale Running and its own node Online, with no health warnings. Warnings → Degraded; not Running/Online → Down. This is **node health**, not a connection test from another Tailscale device. |
| 60 | 📥 Ingress | Local receiver `/health` returns the expected response on Debian. Disabled receiver flag → Paused. It checks the local HTTP receiver, not public routing or successful processing of a real message. |

### Apps & OpenAI

| ID | Tile | Check and interpretation |
|---|---|---|
| 56 | 📱 OLTP API | Debian runs the existing authenticated, bounded, read-only production AppSheet API probe for OLTP. Passing proves that probe can authenticate/read; it does not prove browser login, all screens, sync or every workflow works. AppSheet integration disabled → Paused. |
| 57 | 📊 OLAP API | The equivalent separate probe for the production OLAP app using its own binding/key. Same limitations as OLTP; one app passing does not substitute for the other. |
| 54 | 💬 ChatGPT | Reads the current ChatGPT product group and matching active incidents from OpenAI's status website. Hover the centered light for the incident explanation; click/tap it to open the official incident or status page. It does not test this user's login, subscription or an actual conversation. |
| 55 | ⌘ Codex | Reads the current Codex product group and matching active incidents, with the same hover/click behavior. Independent of Debian; does not test this user's quota or model execution. Compare with **Codex ready**, which checks the local runtime instead. |

For both OpenAI tiles, no affected component or active incident → Healthy; a full/major outage → Down; another non-operational component or active incident → Degraded. Resolved/closed incidents are excluded. Missing groups, unrecognized component states, wrong website identity or an incomplete response → Unknown. Request errors show the error indicator; inspect it rather than assuming a provider outage.

Hover directly over the light to see a native browser tooltip: product/state, each active incident's title and stage, latest published explanation, update time in **SGT**, incident URL, and the last successful query's **Checked** time. Multiple incidents are separated by blank lines. Healthy reads **No active incident reported**; an affected component without a published incident says no explanation is available yet. Checked time is retrieval time, not the incident's update time. Refresh updates the content. This is current status, not the historical daily hover shown on OpenAI's website. Native tooltip styling/size depends on the browser; touch devices can tap the light for the official detail page instead of relying on hover. When several incidents exist, the click opens the newest incident and the hover lists them all.

### Agent workflows

These checks inspect timers, last process result and runtime. **An idle one-shot service is normal between scheduled runs.** Healthy does not mean it is continuously executing, that the business backlog is empty, or that every business output has been independently reconciled. Monitoring does not start the workers.

| ID | Tile | What is checked | Current overdue/runtime bounds |
|---|---|---|---|
| 61 | 🗨 Converse | Partner conversation worker timer and completion/result; disabled conversation flag → Paused. | Last completion within 3 minutes when idle; active run within 21 minutes. |
| 62 | 🧾 Receipts | Receipt-summary worker timer and completion/result; disabled receipt flag → Paused. | Last completion within 3 minutes when idle; active run within 21 minutes. |
| 63 | 📷 IG polling | Instagram group-chat scanner timer/result; hover shows last scan completion, observed Running/Idle and observation time in SGT. Disabled polling flag → Paused. | Runs five minutes after completion plus timer delay. Last completion within 10 minutes when idle; active run within 10 minutes. Timing updates about every two minutes and becomes Unknown after six minutes. |
| 64 | 📅 Daily jobs | Combined cash-statement and email-retry timers/results; disabled schedule flag → Paused. A failing member cannot be hidden by a healthy member. | Cash statement: 25 hours idle / 1 hour running. Email retry: 10 minutes idle / 10 minutes running. |

An inactive required timer or failed process result is Down. Exceeding these timing bounds is Degraded; unavailable unit state is Unknown. These are monitor tolerances, not a description of the actual job schedules. The daily first-run exception uses the existing collector's Bangkok clock; Singapore dashboard display does not reschedule jobs.

### Data & runtime

| ID | Tile | What it means |
|---|---|---|
| 50 | 🛢 SQL / 200 | Numeric connection count, not a light. Last interval-average backend count summed across the shared Cloud SQL instance. **200** is the configured `max_connections` limit verified on 22 September 2026; the number turns red at that limit. Reserved PostgreSQL slots reduce ordinary-client capacity, and averaged samples may hide brief peaks. The sparkline shows the selected-period trend. |
| 65 | 🗄 Database | Debian's Cloud SQL auth proxy is active and read-only `SELECT 1` succeeds against both agent-state and business-reporting database connections. This checks access, not query performance, data correctness or every database/table. |
| 66 | 📋 Audit relay | Audit-relay timer and last process result: up to 3 minutes idle or running. It does not establish that the audit/business backlog is empty. |
| 67 | ⚙ Codex ready | Local Codex executable responds and login-status succeeds using the configured runtime home. It sends no model prompt and proves neither inference success nor available quota. The disabled browser worker remains disabled. |

## Performance — detailed charts

### Azure · VM-01 · Southeast Asia

| ID | Visual | Interpretation and references |
|---|---|---|
| 11 | CPU utilization | CPU percentage history; 100% capacity reference. Same source as overview 2. |
| 12 | Available memory | Remaining available RAM as a percentage, unlike the Used overview. Lower means less available; exhaustion reference is **0%**. |
| 13 | Network transfer per interval | Received and sent **bytes per aggregation interval**, not bytes/second. Intervals: 5 minutes for ranges up to 2 days, 1 hour up to 14 days, 1 day beyond that. Changing range changes bucket size, so compare like-for-like intervals. No arbitrary network cap is drawn. |
| 14 | OS disk throughput | Read/write bytes per second. The 100 MB/s reference is the configured disk baseline, shared across reads and writes, not a separate allowance for each line. Burst/cache/VM behavior can affect effective throughput. |

### GCP · vm-mw-credit-agent · Singapore

| ID | Visual | Interpretation and references |
|---|---|---|
| 21 | CPU utilization | VM CPU percentage history and 100% capacity reference; same source as overview 3. |
| 22 | Used memory | Ops Agent used-memory percentage and 100% reference; same source as overview 7. |
| 23 | Network throughput | Received/sent byte counters converted to rates in bytes/second and summed across returned series. No directly comparable configured hard ceiling is shown. |
| 24 | Disk throughput | Read/write byte counters converted to bytes/second and summed across returned series. This is throughput, not disk fullness or latency; no arbitrary cap is shown. |

### GCP · Cloud SQL · appsheet-pg-prod-20260914

All four charts concern the **shared instance**, not an isolated DEV or PROD database.

| ID | Visual | Interpretation and references |
|---|---|---|
| 31 | CPU utilization | Instance CPU percentage history and 100% capacity reference. |
| 32 | Memory components | **Used, Cache and Free** percentages from `database/memory/components`. Used maps to the provider's case-sensitive Usage label. Cache is separate from Used; the components together describe memory allocation. The 100% line denotes total capacity, not an alarm that cache is harmful. |
| 33 | Storage utilization | Used storage as a percentage of current allocated disk. Allocation was 10 GB at inspection, with auto-resize enabled. The 100% reference is relative to current allocation, not a fixed lifetime storage budget. |
| 34 | Database connections · limit 200 | Interval-average backend count, summed across databases, with the configured instance-wide 200 reference. Reserved slots and short peaks matter; see overview 50. |

### Railway · MW Credit Metabase · production

| ID | Visual | Interpretation and references |
|---|---|---|
| 41 | CPU usage · cores | Metabase and Postgres CPU usage, plus each service's live `CPU_LIMIT` dashed series. Units are cores. Limits follow actual changes over time rather than a fixed shared assumption. |
| 42 | Memory usage · GB | Metabase and Postgres used memory plus their separate live `MEMORY_LIMIT_GB` dashed series. Compare each usage line with its matching service limit. |
| 43 | Persistent volume usage · GB | Railway Postgres volume usage and the verified 5 GB allocation reference. Metabase has no attached persistent volume and is omitted. This is persistent disk, not RAM and not GCP Cloud SQL storage. |

Fixed limits must be rechecked after configuration changes. Live Railway CPU/memory limit series update with provider telemetry. These charts do not imply that every resource has an enforced limit or that a subscription fee is a spending cap.

## Cost — scope and reading rules

Cost is delayed, provisional provider data. **No data is not zero spending.** The top overview converts all available costs to SGD; the detailed sections retain Azure/Railway USD and GCP SGD. There is no forecast. Azure/GCP follow the selected range; Railway always uses its current billing cycle. VM shutdown does not imply all associated storage/backup costs stop.

### SGD total, platform cards and stacked breakdown

The larger yellow total card sits on the left. Its three contributing platform cards sit across the right, above a shorter stacked bar. Matching blue/orange/purple colors connect each platform card to its bar segment. The overview retains its previous overall height; the bar is reduced from seven to three grid units to make room. Cards reuse the bar's converted results rather than issuing extra provider queries.

| ID | Visual | Meaning and use |
|---|---|---|
| 4 | TOTAL · SGD | Large yellow SGD number: sum of the three available platform amounts. Its subtitle says Available costs only; the coverage warning below explains that missing platform data makes the total incomplete. It is complete only when all platforms report; no common-period invoice reconciliation is implied. |
| 5 | Azure · SGD | Large blue SGD number for the two monitored Azure resource groups, converted from USD. Follows the selected date range. |
| 6 | GCP · SGD | Large orange net SGD amount after credits. No data stays unavailable, never a fabricated zero. Follows the selected date range. |
| 7 | Railway · SGD | Large purple SGD amount converted from workspace accrued USD usage. Follows Railway's billing cycle, not the date picker. |
| 2 | Platform breakdown · SGD | Compact horizontal stacked bar: **Azure** (blue), **GCP** (orange), **Railway** (purple). Azure's two monitored resource groups are added in USD then converted; GCP uses net SGD after credits; Railway's accrued workspace USD is converted. Numbers and matching platform colors appear in the cards above and hover values. Axes and the repeated legend are hidden to keep the short bar readable. Missing GCP contributes no visible segment and is not claimed to be zero. Negative net costs remain negative. |
| 3 | Conversion and coverage · missing platform means incomplete total | Shows **Subtotal (SGD)**, **SGD per USD**, the **FX reference date**, live GCP cost-row availability and the **Railway cycle in Singapore dates**. Check this before treating the bar/subtotal as complete. GCP Unavailable can mean first export is pending or no cost rows exist in the selected range. A query failure is shown by Grafana's error indicator; incomplete data must not be treated as a fully reconciled total. |

Conversion uses the latest daily **ECB USD/SGD reference rate via [Frankfurter](https://frankfurter.dev/)**, fetched on dashboard refresh. For example, at the 22 September 2026 verification, 1 USD = 1.2747 SGD. This example is dated; the table reports the rate/date actually used. USD amounts are multiplied by the rate at full precision and displayed to two decimals. It is an indicative current-reference conversion, not transaction-date FX, card fees or the final invoice settlement amount. Historical date-picker ranges still use the latest reference rate. Invalid rates, unexpected source currencies and FX older than seven days are rejected rather than silently converted.

**Period caveat:** the bar combines Azure/GCP selected-range costs with Railway's independently dated billing cycle. It is a consolidated view of reported amounts, not a reconciled common-calendar-period invoice. Changing the date picker changes Azure/GCP but not Railway; the coverage table keeps the Railway dates visible. The three original detail sections remain available for native-currency reconciliation.

| ID | Visual | Meaning |
|---|---|---|
| 1 | Cloud spending | Static guide to currencies, selected-date versus current-cycle behavior, provider delay and hourly refresh. |
| 10 | Azure section header | Groups costs for VM-related resources and backup. |
| 20 | GCP section header | Groups detailed billing export with credits shown separately. |
| 30 | Railway section header | Groups workspace usage for the current billing cycle. |

### Azure

Scope is provider ActualCost for **rg-mwcredit and rg-backup** in the configured subscription, not all subscription spending. Daily buckets retain Azure's UTC date and appear at 08:00 Singapore.

| ID | Visual | Meaning and use |
|---|---|---|
| 102 | Azure · selected-range cost | Sum of returned resource costs over the selected period, in USD. Includes eligible disks/network/monitoring/backup records, not only VM compute. |
| 103 | Azure · daily cost | Total by provider date. Use it to locate changes in daily spending; labels use whole dollars, while monetary summaries retain cents. |
| 104 | Azure · cost by resource (USD) | Selected-period totals grouped by returned resource name, sorted highest first. Identifies cost contributors. The query extracts the last segment of the resource ID; identically named resources can combine. |
| 101 | Azure · daily resource detail (USD) | Source table: Date, Resource, Cost and Currency. Supplies the other Azure cost visuals and lets you trace their totals to daily rows. It is not a final invoice. |

### GCP

The query reads the dedicated detailed billing export, restricted to project `clever-oasis-508610-n7`, and groups usage by Singapore date. **Net = Gross + Credits**, with credits normally negative.

The three GCP totals and detail-table monetary values display **S$** with two decimal places, matching the top SGD summary cards. Negative credits retain their minus sign (for example, `S$-6.61`). The display format does not change the exported amounts or convert GCP's already-SGD values again.

| ID | Visual | Meaning and use |
|---|---|---|
| 202 | GCP · before credits (SGD) | Gross usage cost before the credits included in the export. |
| 203 | GCP · credits (SGD) | Sum of exported credits, normally negative. This is not a remaining free-credit balance or available budget. |
| 204 | GCP · net cost (SGD) | Gross plus credits. Example: SGD 20 gross and SGD −5 credits gives SGD 15 net. |
| 205 | GCP export status | **Static explanatory text**, not a live exporter-health probe. Records the 22 September enablement date and explains initial No data. It must not be interpreted as proof that a delivery has just succeeded. |
| 201 | GCP · daily resource detail | Service, date, gross, credits, net, currency and resource detail. Missing resource attribution appears as Unallocated / service-level. Supplies the three totals above. |

At the 22 September setup verification, export was enabled and permissions were verified, but the first table had not arrived. That is dated evidence, not a fresh status claim by this guide. The dashboard discovers the export table automatically. Before delivery, it shows Awaiting first billing export / No data rather than zero. If records exist but data still fails, inspect the panel error. The query rejects incomplete/truncated results and has a 100 MB billed-query cap; a shorter range may be necessary. Exported costs are not a final reconciled invoice.

### Railway

Cost scope is **the workspace**, potentially broader than the Metabase/Postgres services shown on Performance. Changing the date picker does not turn these into historical-period totals.

| ID | Visual | Meaning and use |
|---|---|---|
| 302 | Railway · accrued resource usage | Workspace `customer.currentUsage` in USD for the current billing cycle. It is not the final payable bill. |
| 301 | Railway · billing period and accrued usage | Workspace, plan, usage USD, billing start/end and currency. Use the period dates to understand what the number covers. |
| 303 | How to read Railway cost | Explains cycle-based usage versus invoice treatment of plan fees, included usage, credits and adjustments; links to Railway usage. |

## Maintaining this guide

**Standing owner instruction:** update this guide in the same change batch whenever either resource dashboard changes. It is part of dashboard completion, not an optional follow-up.

For each added, removed, renamed, regrouped or materially reformatted visual, update its entry and panel ID. For metric/probe changes, update scope, formula, units, freshness, state mapping and limitations. Update verified fixed limits and their verification dates after relevant resource changes. Keep live-limit behavior distinct from fixed snapshots, static instructions distinct from live status, and dated observations distinct from current verification.

Compare coverage against the maintained definitions: currently **44 Performance visual panels plus 4 detail headers**, and **19 Cost visual panels plus 3 section headers**. Update these counts when the design changes. Preserve the operating reference as the authority for credentials/deployment/recovery rather than copying secrets or setup procedures here. Record changes and relevant checks in the existing monitoring change log, and publish intended documentation alongside the dashboard definition changes.

Sources for this guide: [dashboard builder](../scripts/monitoring/Build-Dashboards.ps1), [query helpers](../scripts/monitoring/Query.Helpers.ps1), [Debian health checks](../scripts/monitoring/debian-health.py), [saved dashboard definitions](../outputs/resource-monitoring-20260922/) and the [operating reference](Resource_Monitoring.md). This documentation update did not change or re-audit live services.

### IG polling completion hover (24 September 2026)

Panel 63 uses the numeric worker timing metric for its native mouse hover while retaining the centered label and traffic light. Last scan completion is the process exit time (including scans with no new images or failed runs); check the light for health. It is not the downstream Receipts worker completion or proof that a payment was posted. The separate Receipts worker keeps its existing 20-second interval. The scanner uses five minutes after completion, not fixed wall-clock five-minute slots. No next-run time is promised while a scan is running. Times are SGT; observation and normal dashboard refresh can lag the worker. Missing, mismatched or stale timing fields show Unavailable rather than an invented timestamp. Clicking the light opens Performance.

## Metabase traffic lights — panels 80–83

Twenty tiles fit into the existing two availability rows (ten per row). The four original groups each occupy eight grid columns with four compact tiles; Metabase occupies the rightmost eight columns across both rows, two wider tiles per row. Heights, centered traffic lights and CPU/RAM/detail sections stay unchanged.

| ID | Tile | Exact check | Limits and caveats |
|---|---|---|---|
| 80 | Platform | HTTPS `reports.mw-credit.com/livez`, HTTP 200 and JSON status ok. | Metabase liveness and public route. Does not check browser rendering or a user's session. |
| 81 | App DB | HTTPS `/readyz`, HTTP 200 and JSON status ok. | Metabase readiness includes the Railway application database connection. Also depends on platform/route availability; not an isolated PostgreSQL host probe. |
| 82 | Reporting DB | Uncached saved question 276 runs `SELECT 1 AS healthy` through Metabase source 2. | Confirms the configured Metabase → proxy → reporting database connection. Accepts HTTP 200/202 only with completed status and exactly `[[1]]`; does not certify every report's grants or business calculations. |
| 83 | Charts | HTTPS `charts.mw-credit.com` returns the expected chart shell; unauthenticated `/api/matrix` returns 401. | Confirms route/service and authentication guard. Does not retrieve borrower data, check the authenticated chart query, or certify browser rendering. Actual hostname is plural `charts`. |

Checks run concurrently from Debian about every two minutes. Green means the expected result within five seconds; amber means a passing probe took longer than five seconds; red means a failed/unexpected response or network timeout. Five seconds is an operational warning, not a provider limit. Probe credentials/rate failures (401/403/429) and unexpected probe errors are Unknown. Missing telemetry or telemetry older than six minutes is also Unknown. HTTP 202 for a completed Metabase query is normal. Hover shows the check, result category, HTTP code, duration and observed time in Singapore. Clicking opens the respective service.

The four Metabase tiles are covered by one additional alert rule. It evaluates each component separately every two minutes and sends firing/resolved notifications through the existing IRM phone route after a four-minute pending period. Missing/stale telemetry or an Unknown status does not start a new alert. A Debian outage makes these probes Unknown even if Metabase remains available; check rule health if telemetry stops. The established eight alert rules and their 16 tile conditions remain unchanged.
