# Change notes — R180 yesterday's receipt breakdown card, 21 November 2026

## Purpose
Owner request of 21 November 2026: "In next release, replace this card in Grafana with previous day statistics, percentage and count for each category". The owner then authorized PROD ("Move to prod when ready"), which covers the live Grafana apply after the merge.

## Changes
- Panel 35 on `mw-agent`: "Receipts · last 30 days" becomes "Receipts · yesterday", a horizontal LCD bar gauge (name above the bar, value as text, 0 to 100 %, no decimals) with five rows in panel 34's order and colours: First-time right, After review, By hand in the app and Rejected or held (each bar the % of genuine slips, the count in the label) and a neutral 100 % bar "Genuine slips, <date>" with the total and the date.
- Data: the previous Bangkok day from `monitoring.receipt_ftr_daily_v1()` through `mw-agent-receipts`, unpivoted in SQL with a hidden sort column; an empty day shows "No genuine slips yesterday". The date sits in the last bar instead of a variable (no extra query, cannot go stale). Echo's UX-R180-01 to 09 applied.
- `DASHBOARD_RELEASE` R180; dashboards regenerated (`project/scripts/monitoring/dashboards/`, `infrastructure/grafana/dashboards/`; Byte, `c2854947`).
- Correction (PR #376, `db39e3f6`): per-row colour through `rowsToFields`, with the prefix overrides kept, after the first apply rendered black bars.
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
Nothing is skipped. Owner acceptance followed on 21 November 2026.

## Recovery
Git baseline `main` `f361c4e4` (R179 closure); revert the commit and apply the Grafana plan again. No agent, database or datasource change.

## Open questions
None.

## Applied
Grafana apply on 21 November 2026 06:11:09Z to 06:11:23Z (plan `4fa2e015…3792`, 0 add, 5 change, 0 destroy): values and order verified, but the bars rendered black or transparent because the per-name overrides never matched. Correction PR #376 (`db39e3f6`) applied 06:18:24Z to 06:18:37Z (plan `2358896a…3251`, 0/1/0); re-plan clean; rendered with the right colours in light and dark. 20 November values: 12 (75%), 1 (6%), 1 (6%), 2 (13%) of 16 genuine slips. Dashboard versions `mw-agent` 23, `mw-now` 22, `mw-pwa` 22, `mw-infra` 20, `mw-cost` 26, all release R180. Tag `R180` (annotated, object `2725cb3d`) on `5825b2d6` by the Release tag workflow. No agent, database or datasource change; recovery is a reviewed Grafana plan from the R179 dashboard files.

## Closure records (Dewey)
- Environment inventory: the Grafana R180 row; component versions regenerated (`render --write`, `render --check`).
- Pruned at closure (Open R181 plus the three newest Released: R180, R179, R178): `integration-agent/Change Logs/CHANGE_NOTES_R177_RECEIPT_FIRST_TIME_RIGHT_2026-11-20.md`, with its links repointed to permalinks at `5825b2d6`; the R177 follow-up row of the open development changes is removed.
- Drift (`drift --env prod`): 0 drift, 7 unverified (credentialed facts were not observed in this session). The Grafana facts are in the applied section above.

## Remaining work
Owner-accepted on 21 November 2026 ("Yes accept all 4 releases", R177 to R180); recorded in a records-only pull request.
