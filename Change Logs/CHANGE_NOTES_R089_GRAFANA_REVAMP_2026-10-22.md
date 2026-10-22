# Change notes — R089 Grafana revamp, 22 October 2026

## Purpose
Replace the three live Grafana dashboards (Performance, Cost, PWA Platform) with five new ones built for the current product, add the telemetry and alert rules they need, and repoint every record that names the old dashboards. The owner's R089 production instruction of 22 October 2026 covers IAM, log-based metrics, migration V102 (DEV then PROD), the collector deploy, the dashboards and the paused PWA 2m group.

## Changes
- Dashboards `mw-now`, `mw-pwa`, `mw-agent`, `mw-infra`, `mw-cost` in folder MW Resource Monitoring: tag `mw-credit`, link bar, time zone Asia/Bangkok, built by `project/scripts/monitoring/build-dashboards.cjs` into `infrastructure/grafana/dashboards/`. The old three stay until owner-instructed retirement (not before 14 days after cutover).
- Home dashboard: `mw-now` set through Terraform `grafana_organization_preferences` (`home_dashboard_uid`), not a manual UI step, so `monitor.mw-credit.com` lands on Now. The CNAME to `olivecrab1199.grafana.net` is unchanged because a DNS record cannot carry a dashboard path.
- Alerts (`infrastructure/grafana/owned-services.tf.json`): group PWA 2m (12 rules, applied paused); webhook rule `efz3jiz9qmhhce` reads the Singapore checker series only; runbook annotation `https://monitor.mw-credit.com/d/mw-now`; new datasource `mw-public-gcp-status`. The Grafana-to-Dots bridge gets no panel.
- Telemetry: collector additions in `project/scripts/monitoring/debian-health.py`; migration `database/migrations/V102__monitoring_ops_health.sql` (`monitoring.pwa_ops_health_v1()`, `pg_stat_statements` grant); log-based metrics in `infrastructure/prod` and `infrastructure/dev`; IAM for the VM identity in `infrastructure/ecosystem-debian`.
- Records: `project/Documents/Resource_Monitoring.md`, `Resource_Monitoring_Dashboard_Guide.md` (rewritten per dashboard, row and ID; old sections kept under "Previous dashboards"), `Rules/Grafana_Alert_Troubleshooting_Runbook.md` (time zone, links, section 4.7), `Environment_Inventory.md`, `Development_Changes.md`, `Release_Tracker.md`, `project/scripts/monitoring/README.md`, `infrastructure/grafana/README.md`.

### Design changes from the approved design
1. Cloud Scheduler `attempt_count` does not exist in the project, so scheduler attempts come from log-based metric `mw_scheduler_attempts_<env>`. All log-based metrics carry `_prod` or `_dev` suffixes because the project is shared.
2. PWA & APIs has no service dropdown or repeat: four static service rows with per-service timeout and instance lines, and the `env` variable only.
3. Scheduled jobs have no failed state (V94), so the rule is renamed "MW | Scheduled job overdue" and uses ages only.
4. The push rule pages on oldest pending above 15 minutes only; `failed_24h` is a panel colour, because expired subscriptions are normal churn.
5. Result codes need no services change (the existing `read_request` and `command_request` records carry them). Recognition outcome adds one `warning` field to the existing `command_request` record: a small services change, DEV then PROD.
6. Cost: the daily stack is split into GCP in SGD (budget line from the dashboard constant `gcp_budget_sgd`, empty until ALL-COST-01) and Azure plus Railway in USD. No Billing Budgets IAM in R089.
7. Link bar: five explicit links; the time range is not carried between dashboards.
8. UX: Down is dark red for colour-blind safety, timelines print state words, the capacity gauges are merged into two panels, and OpenAI plus Google Cloud status are one "Provider status" stat.
9. The status datasource 60 s cache is dropped (Terraform cannot set it).
10. The home dashboard is Terraform `grafana_organization_preferences` (`home_dashboard_uid` `mw-now`), not a manual UI step.

## Checks
| Command | Result |
| --- | --- |
| `npm run check:docs` | [EVIDENCE: result and commit] |
| `node project/scripts/monitoring/test_build_dashboards.cjs` and the jq selector tests | [EVIDENCE: Byte, commit or CI run] |
| `python3 scripts/grafana/manage.py plan --secret-version 1` | plan-001 (sha `4a7db5c5…`) applied `mw-cost`, datasource `mw-public-gcp-status`, rule group PWA 2m (12 rules, all paused) and the Performance 2m update (10 rules, runbook `/d/mw-now`, webhook rule on `apac-singapore` only). Its other four dashboards and the home preference failed with a Terraform "inconsistent result" because the working tree held uncommitted dashboard edits. They were applied through plan-001b (sha `ba7c375f054d06832666555abc9973793958ee0310bfa81e92f7e1820ccf3ca4`, built from a clean export of `e05785e`, 5 added, values identical to plan-001's entries), covered by the orchestrator's decision to apply plan-001 as committed. Re-plan from `e05785e`: no changes |
| Saved-plan applies and readback | All five dashboards version 1 (folder `mw-resource-monitoring`, Asia/Bangkok, tag `mw-credit`): `mw-now` 12 panels, `mw-pwa` 27, `mw-agent` 18, `mw-infra` 19, `mw-cost` 12. Home preference `mw-now`: the home endpoint redirects to `/d/mw-now/…` and the root URL opens Now for a signed-in user; CNAME unchanged. Railway datasource untouched |
| Infrastructure applies from sha-guarded saved plans | `ecosystem-debian` `b7c3229c…` (3 added: custom role `mwSnapshotViewer`, bindings of `roles/cloudsql.viewer` and `mwSnapshotViewer` to the VM identity), DEV `670d4fd7…` and production `012356fa…` (4 log metrics each); re-plan no change after each. Eight descriptors under `logging.googleapis.com/user/`: `mw_api_result_codes_{prod,dev}` (label `code`), `mw_recognition_outcome_{prod,dev}` (label `warning`), `mw_recognition_route_latency_{prod,dev}` (distribution), `mw_scheduler_attempts_{prod,dev}` (labels `status`, `http_status`) |
| V102 DEV then PROD through the guarded runner | Not yet run (batch 2 in progress). [EVIDENCE: backup reference, readback of function owner and ACL] |
| Collector deploy and new series in Metrics Explorer | Not yet deployed (batch 2 in progress). [EVIDENCE: Byte] |
| Live acceptance by Chase (24 h render, stale handling, phone layout, PWA 2m Normal while paused, webhook Singapore Healthy, cost reconciliation, final plans no-change) | Pending [EVIDENCE: Chase, Echo] |

## Not run
No live notification is forced and no test notification is sent. [EVIDENCE: anything skipped]

Limitation, Railway credentials (the Railway datasource was untouched by the apply and refreshed without error in the plan; its panels still fail on the revoked token): Railway revoked every Public API token at 04:17 UTC on 22 October 2026 (security disclosure). The Grafana datasource `mw-railway-monitoring` (workspace token `mw-grafana-monitoring`, held only in the datasource's encrypted field) and the Debian PITR check token (`/etc/mw-resource-monitoring/railway-pitr-token.txt`) are presumed dead. From that time the Railway-backed panels (Metabase CPU and memory, Postgres volume, Railway cost, the PITR probe and the Metabase backup ages) error or go stale, on the new dashboards and the old ones alike, so they cannot be accepted in R089. Replacing the tokens belongs to the separate Railway incident session and awaits owner approval. The Metabase API-key probe does not depend on Railway. R089 did not change any Railway credential.

## Recovery
Revert the Git commit and apply the saved previous Grafana plan; the old three dashboards are untouched, so Performance remains usable. Pause the PWA 2m group to stop its alerts. Restore the previous `debian-health.py` kept beside the new one in `/opt/mw-resource-monitoring/`. Restore the home dashboard preference to Performance if needed. V102 recovery is the PROD promotion backup [EVIDENCE: backup reference]; the function is additive.

## Open questions
None for the owner at drafting. Open evidence items from the design: the Singapore `checker_location` value, the `num_backends` database label name, whether the result codes are already logged structured, the `pg_stat_statements` grant against V93, and the GCP budget (ALL-COST-01).

## Remaining work
Live evidence above; unpause the PWA 2m group after 24 hours without a false firing; retirement of the old three dashboards on the owner's instruction (not before 14 days after cutover).
