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
Nothing is skipped. Not checked: owner acceptance of R177 and R178 is pending.

## Recovery
Git baseline `main` `b130a1d1`; revert the commit and apply the Grafana plan again. No database, agent or image change.

## Open questions
None.

## Applied
Grafana apply on 20 November 2026 07:46:06Z to 07:46:18Z with `--plan-sha256 65c2e5f0…523a5b`: plan 0 add, 5 change, 0 destroy; re-plan no changes. Dashboard versions `mw-agent` 21, `mw-now` 21, `mw-pwa` 21, `mw-infra` 19, `mw-cost` 25, all release R178. Panel 34 `timeFrom` 30d (its query still returns 61 days from 21 September); panel 35 unchanged (65% of 300). Tag `R178` (annotated, object `0cd09234`) on `a9a6b77b` by the Release tag workflow, which published the GitHub Release. No agent, database or datasource change; recovery is a reviewed Grafana plan from the R177 dashboard files.

## Closure records (Dewey)
- Environment inventory: the Grafana R178 row; component versions regenerated (`render --write`, `render --check`).
- Pruned at closure (Open R179 plus the three newest Released: R178, R177, R176): `Change Logs/CHANGE_NOTES_R175_DB_TIMEOUTS_2026-11-18.md`, `Change Logs/CHANGE_NOTES_R175_PARTNER_MESSAGES_2026-11-18.md` and `integration-agent/Change Logs/CHANGE_NOTES_PARTNER_MESSAGES_2026-11-18.md`, with their links repointed to permalinks at `a9a6b77b`; the R175 follow-up row of the open development changes is removed. Also deleted as evidence nothing current cites after that: `project/outputs/dictionary-r175-20261118/`.
- Drift (`drift --env prod`): 0 drift, 7 unverified (credentialed facts such as the agent, schema, Grafana tags and notify and jobs were not observed in this session; the public facts match). The Grafana facts are recorded in the applied section above.

## Remaining work
Owner acceptance of R177 and R178, written into the next release's closure pull request.
