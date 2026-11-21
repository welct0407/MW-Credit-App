# Change notes — R180 yesterday's receipt breakdown card, 21 November 2026

## Purpose
Owner request of 21 November 2026: "In next release, replace this card in Grafana with previous day statistics, percentage and count for each category". The owner then authorized PROD ("Move to prod when ready"), which covers the live Grafana apply after the merge.

## Changes
- Panel 35 on `mw-agent`: "Receipts · last 30 days" becomes "Receipts · yesterday", a horizontal LCD bar gauge (name above the bar, value as text, 0 to 100 %, no decimals) with five rows in panel 34's order and colours: First-time right, After review, By hand in the app and Rejected or held (each bar the % of genuine slips, the count in the label) and a neutral 100 % bar "Genuine slips, <date>" with the total and the date.
- Data: the previous Bangkok day from `monitoring.receipt_ftr_daily_v1()` through `mw-agent-receipts`, unpivoted in SQL with a hidden sort column; an empty day shows "No genuine slips yesterday". The date sits in the last bar instead of a variable (no extra query, cannot go stale). Echo's UX-R180-01 to 09 applied.
- `DASHBOARD_RELEASE` R180; dashboards regenerated (`project/scripts/monitoring/dashboards/`, `infrastructure/grafana/dashboards/`; Byte, `c2854947`).
- Documents: `project/Documents/Release_Tracker.md`, `project/Documents/Resource_Monitoring_Dashboard_Guide.md`, `project/scripts/monitoring/README.md`.

## Checks
| Command | Result |
| --- | --- |
| `build-dashboards.cjs --check` | Pass (Byte, `c2854947`) |
| `node project/scripts/monitoring/test_build_dashboards.cjs`, including the 1440 px and 390 px fit | Pass (Byte, `c2854947`) |
| `test_dashboard_queries.py` | OK (Byte, `c2854947`) |
| Live read-only query for 20 November | 16 genuine slips: 12 (75%), 1 (6%), 1 (6%), 2 (13%) (Byte) |
| `npm run check:docs` | 0 failures (Dewey) |

## Not run
The live Grafana apply and read-back are not done yet; they follow the merge and are recorded in the R180 closure pull request.

## Recovery
Git baseline `main` `f361c4e4` (R179 closure); revert the commit and apply the Grafana plan again. No agent, database or datasource change.

## Open questions
None.

## Remaining work
Grafana apply and read-back (Forge), then the R180 closure; owner acceptance of R177 to R180.
