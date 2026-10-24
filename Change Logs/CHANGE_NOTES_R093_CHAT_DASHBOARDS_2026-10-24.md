# Change notes — R093 chat on the Grafana dashboards, 24 October 2026

## Purpose
The in-app chat is the only Partner assistant (R091) but is nearly invisible on the dashboards: no health lane, no turn outcomes, and a Cost page that shows only the last 10 questions. This batch, from the owner's design decisions of 24 October 2026, puts the chat on Now, PWA & APIs, Infrastructure and Cost. It is the first batch of the Open release R093.

Owner decisions: Option A (the chat becomes a first-class service on the existing dashboards). Medians are coloured: model rounds green below 4 and orange from 4; turn time green below 30 s, orange from 30 s and red from 120 s; Last turn stays neutral (two people chat irregularly). The alerts `PWA API health failed` and `Cloud Run 5xx` are extended to the chat. The Cost page gets a month-to-date cost tile, which needs V108. DEV gets its own row on the PWA page. No replies-pushed metric. Housekeeping fixes ride along.

Team: Insight (I, Designer, Fable 5.1 at high effort, requested by the owner; design draft on the canvas https://claude.ai/artifact/HMTMSZAvCEuWUe11bfuCSW), Archie (A, resolutions), Byte (B, dashboards, SQL, collector), Forge (F, log metrics and apply), Echo (E) and Chase (C, checks).

## Changes
- **Dashboards** (`project/scripts/monitoring/dashboards/*.cjs`, generated into `infrastructure/grafana/dashboards/*.json`, `lib.cjs` shared helpers; Byte).
  - Now: a Chat API lane (1-J) in the PROD services timeline and a Chat tile (5: turns, failed, median turn time, time since the last turn); Push is back to 8 columns.
  - PWA & APIs: a `Service · chat` row (14, request count, p95 latency with the 300 s timeout line, instances) and an `In-app chat · turns` row (40 to 43: outcomes, turn time, a turns tile with median rounds and turn time) for PROD and DEV.
  - Infrastructure: the Cloud Run table covers ten services (chat added; Connections by DB and the layout below it move down).
  - Cost: row 49 renamed `In-app chat · usage and cost`; 50 last 10 questions (now with outcome, rounds and turn time); 51 this month (turns, failed, estimated cost in total and per question); 52 by model. One price rule (`priced()`) for all chat panels; an unpriced model shows No price instead of an understated cost.
- **Selectors** (`project/scripts/monitoring/`): `distribution-median.jq` (median of a log-based distribution over the range, null when there is no turn) and `last-count-age.jq` (age of the newest counted point, null when none), so an empty range shows None rather than a healthy zero.
- **V108** (`database/migrations/V108__pwa_chat_monitoring_reads.sql`, Byte): `monitoring.pwa_chat_recent_turns_v1(p_limit)` and `monitoring.pwa_chat_usage_v1(p_since)`, read functions only; no table or column. `EXECUTE` for `mw_agent_dashboard`; column grants through `mw_chat_owner_<env>` (owner window as V104). Not yet applied to DEV or PROD.
- **Tests and CI prerequisites**: `scripts/database/Test-Chat.sql` section I (turns and usage on a synthetic thread); `scripts/database/Test-AppRolePrerequisites.sql` creates `mw_agent_dashboard` when missing (guarded; the agent lab creates it first).
- **Schema digest** (`services/chat/assets/schema-digest.json`): rebuilt at migration 108. The prompt digest changes, so each thread starts one new history epoch on its next turn after the next chat image deploy; the deployed chat keeps the old digest until then.
- **Log-based metrics** (`infrastructure/{dev,production}/log-metrics.tf`, Forge): `mw_chat_turns_<env>` (counts by code and model), `mw_chat_turn_latency_<env>` and `mw_chat_turn_rounds_<env>` (distributions), from the chat service's `chat_turn` log; no question text. DEV applied 07:27:43Z to 07:27:56Z, plan 3 add, 0 change, 0 destroy, re-plan no changes. PROD not yet applied. Mocked tests extended (`tests/chat-service.tftest.hcl` in both roots).
- **Alerts** (`infrastructure/grafana/owned-services.tf.json`): `PWA API health failed` includes `pwa_api_chat_prod`; `Cloud Run 5xx` sums reader, command and chat. Not yet applied to Grafana.
- **Collector** (`project/scripts/monitoring/debian-health.py`): six `pwa_api_*` health components (adds `pwa_api_chat_prod` and `pwa_api_chat_dev`), 11 worker threads. The origins file `/etc/mw-resource-monitoring/pwa-api-origins.json` on the host gains the two chat origins at deploy; until both are deployed the chat lane shows Unknown and does not page. Not yet deployed.
- **Housekeeping**: stale text in `infrastructure/grafana/README.md` fixed.
- **Documents** (Dewey): `project/scripts/monitoring/README.md`, `database/README.md` (V108, the CI prerequisite, and V107 now says applied to PROD), `project/Documents/Resource_Monitoring.md` (the two rules), `project/Documents/Resource_Monitoring_Dashboard_Guide.md` (chat panels, alert table), `project/outputs/r090-pwa-chatbot/DESIGN.md` (5.4), `project/Documents/Development_Changes.md`, `project/Documents/Environment_Inventory.md` (DEV log metrics; PROD pending), this note.

## Checks
| Command | Result |
| --- | --- |
| lint | Pass (Byte) |
| typecheck | Pass (Byte) |
| build --check (dashboards) | Pass (Byte) |
| `test_build_dashboards.cjs` | Pass (Byte) |
| `test_dashboard_queries.py` | Pass, 69 OK (Byte) |
| `npm test` | Pass, 871 passed, 1 skipped (Byte) |
| Schema digest check | Pass, 4 of 4 (Byte) |
| `mw-db-ci` migrations | Pass, exit 0, head 108 (Byte) |
| `terraform fmt` and `validate` | Pass (Forge) |
| Terraform mocked tests | Pass, dev 27 of 27, prod 21 of 21 (Forge) |
| `test_debian_health.py` | Pass, 54 OK (Byte) |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (Dewey, documents as written) |
| Pull request `Development checks` | Pending |
| Echo (UX review of the regenerated JSON against the canvas) | No blocking findings; applied: orange 30 s line on PWA 42, PWA 44 six rows high, Cost 51 "Turns" and "Per turn" (then `build-dashboards --check`, `test_build_dashboards`, `test_dashboard_queries` 69 OK again) |
| Chase (adversarial review: V108 security, jq selectors on empty and sparse data, alert names against the collector, schema digest) | No blocking findings |

## Not run
Not exercised yet: V108 on DEV or PROD (no window yet), the PROD log metrics, the Grafana apply (dashboards and alerts), and the collector deploy; the new panels show data only after those and the next chat turns.

## Recovery
Git baseline `a23a8c3f`. Dashboards and alerts: Terraform apply of the previous Grafana JSON. Log metrics: remove the three resources per environment and apply (additive). V108: forward-only drop of the two functions (nothing else depends on them once the dashboard JSON is reverted). Collector: the backup `debian-health.before-R093-*.py` taken at deploy, and the origins file entries are inert extra keys. The schema digest follows the chat image rollback.

## Open questions
None.

## Remaining work
PR CI; Echo and Chase; DEV V108 window and the DEV Grafana view; then, under the owner's production instruction, the PROD log metrics, V108 window with backup, the Grafana apply, the collector deploy with the two chat origins, and the next chat image deploy (the new prompt digest). Carried from R091: the three dead VM keys and the agent's SELECT on the notification, push and jobs tables.
