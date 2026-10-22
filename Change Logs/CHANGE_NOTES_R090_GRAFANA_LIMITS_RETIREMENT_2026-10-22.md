# Change notes — R090 Grafana tile limits, Metabase chart calls and old-dashboard retirement, 22 October 2026

## Purpose
Owner decisions after the R089 merge (22 October 2026): set the recommended limits on the stat fields that were neutral for lack of one; keep the Cost total neutral (the budget covers GCP only); fix the Metabase RAM error badge; retire the three previous dashboards now.

## Changes
- Limits (`project/scripts/monitoring/dashboards/lib.cjs` `LIMITS`, colour class `limit` beside `age`): Last turn age (Now 5) and Last send (Agent 5) orange after 7 days; Last notification (PWA 22) orange after 48 h; 401 session invalid (PWA 3) orange from 10 in the selected range; push Pending (Now 6, PWA 21) orange from 5. Reasons: Partner chat averages about one turn a day (30 replies since 21 September); 11 hours of collector history put the newest turn and send at up to 16 h old and the last push dispatch at up to 11 h; Pending was 0 in every sample; the log-based 401 metric has no history yet. Oldest pending keeps the 900 s alert value. No alert rule changes.
- Cost total: stays neutral (owner: the budget is GCP only); the guide records the reason.
- Metabase RAM error badge: the lifted CPU and RAM charts (Infrastructure 14, 15) sent four Railway GraphQL calls each, about ten Railway calls per Infrastructure load with the probes, and Railway's API rate limit failed one now and then. Each chart now sends one call (both services as GraphQL aliases, usage and limit in one `measurements` list, as the Now gauge already does), folded into one frame per timestamp with the same series names, so the dashed limit override still applies. Infrastructure Railway calls 11 → 5.
- Retirement: Performance (`mw-resource-performance`), Cost (`mw-resource-cost`) and PWA Platform (`mw-pwa-platform`) leave `baseline.auto.tfvars.json`; `main.tf` moves their three instances to the unprotected, empty `retired` resource so one apply destroys exactly them while `prevent_destroy` stays on every live dashboard. Their last JSON moves (unchanged) to `project/scripts/monitoring/dashboards/retired/`, the source `lift()` reads. Alert runbook links already point to `/d/mw-now`. `mw-public-status` (`cfz10a9eaokjkd`) drops `https://status.openai.com` from its allowed hosts (the last user was the retired Performance dashboard).
- Tests: `test_build_dashboards.cjs` checks the five limits and treats `limit` like `age`; its lifted-selector check uses Infrastructure 16 instead of 15; `test_dashboard_queries.py` checks one call per Metabase chart, its columns, the fold by timestamp and a Railway error.
- Records: `project/Documents/Resource_Monitoring.md`, `Resource_Monitoring_Dashboard_Guide.md` (colour policy, Infrastructure 14 to 16, previous-dashboard sections replaced by "Retired dashboards"), `Environment_Inventory.md`, `infrastructure/grafana/README.md`, `project/scripts/monitoring/README.md`, `integration-agent/docs/MONITORING_IMPLEMENTATION_HANDOVER.md` (with its own change note), `project/Documents/Rules/Grafana_Alert_Troubleshooting_Runbook.md` (row 5 link).

## Checks
| Command | Result |
| --- | --- |
| `node project/scripts/monitoring/build-dashboards.cjs --check` | Five files match the builder |
| `node project/scripts/monitoring/test_build_dashboards.cjs` | Passed (5 dashboards, 195 jq selectors compiled) |
| `python3 -B project/scripts/monitoring/test_dashboard_queries.py` | 62 tests OK |
| `terraform validate`, `terraform fmt -check` (offline copy of `infrastructure/grafana`) | Valid, formatted |
| Live `/api/ds/query` of the built Infrastructure 14 and 15 targets (6 h) | HTTP 200, one frame each with Metabase, Metabase limit, Postgres, Postgres limit; 73 rows |

## Not run
- The Grafana apply (plan, apply, read-back, no-change re-plan) and the live check of the five dashboards; recorded in this note after they run.
- The pull request's CI checks.

## Recovery
Revert this commit and apply: the three dashboards are recreated from the JSON under `dashboards/retired/` once their entries return to the map (or restore them from Grafana's Recently deleted), and the tiles return to neutral.

## Open questions
None.

## Remaining work
- After the apply: drop the `moved` blocks and the empty `retired` resource from `infrastructure/grafana/main.tf`; remove the retired builders (`Build-Dashboards.ps1`, `Build-EditorResources.ps1`, `Patch-CostDetailResource.ps1`, `pwa-platform-dashboard.cjs` and their tests) and unreferenced `.jq` files in a clean-up batch.
- Release Tracker R090 row: the R090 opening records are on the release branch, not yet on `main`; add this batch when they merge.
