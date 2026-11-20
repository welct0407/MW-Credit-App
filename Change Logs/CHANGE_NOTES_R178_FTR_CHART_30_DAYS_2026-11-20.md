# Change notes — R178 first-time-right chart shows 30 days, 20 November 2026

## Purpose
Owner request of 20 November 2026: "Make the chart show last 30 days by default, not last 180 days". The request authorizes the live Grafana apply.

## Changes
- Panel 34 "Receipts · daily first-time right" on `mw-agent`: the time override goes from 180 days to 30 days (`project/scripts/monitoring/dashboards/`); no dashboard variable, because a dropdown for one panel was not worth it. The history from 21 September 2026 stays in `monitoring.receipt_ftr_daily_v1()`.
- `DASHBOARD_RELEASE` R178; dashboards regenerated (`infrastructure/grafana/dashboards/`).
- Documents: `project/Documents/Release_Tracker.md`, `project/Documents/Resource_Monitoring_Dashboard_Guide.md`, `project/scripts/monitoring/README.md`.

## Checks
| Command | Result |
| --- | --- |
| `node project/scripts/monitoring/test_build_dashboards.cjs` | Pass (Byte, `64ab3e2e`) |
| `test_dashboard_queries.py` | Pass (Byte, `64ab3e2e`) |
| `npm run check:docs` | 0 failures (Dewey) |

## Not run
The live Grafana apply and read-back are not done yet; they follow the merge and are recorded in the R178 closure pull request.

## Recovery
Git baseline `main` `b130a1d1`; revert the commit and apply the Grafana plan again. No database, agent or image change.

## Open questions
None.

## Remaining work
Grafana apply and read-back (Forge), then the R178 closure.
