# Change notes — R093 chat on the Grafana dashboards, 24 October 2026

## Purpose
The in-app chat is the only Partner assistant (R091) but is nearly invisible on the dashboards: no health lane, no turn outcomes, and a Cost page that shows only the last 10 questions. This batch, from the owner's design decisions of 24 October 2026, puts the chat on Now, PWA & APIs, Infrastructure and Cost. It is the whole of release R093.

Owner decisions: Option A (the chat becomes a first-class service on the existing dashboards). Medians are coloured: model rounds green below 4 and orange from 4; turn time green below 30 s, orange from 30 s and red from 120 s; Last turn stays neutral (two people chat irregularly). The alerts `PWA API health failed` and `Cloud Run 5xx` are extended to the chat. The Cost page gets a month-to-date cost tile, which needs V108. DEV gets its own row on the PWA page. No replies-pushed metric. Housekeeping fixes ride along.

Team: Insight (I, Designer, Fable 5.1 at high effort, requested by the owner; design draft on the canvas https://claude.ai/artifact/HMTMSZAvCEuWUe11bfuCSW), Archie (A, resolutions), Byte (B, dashboards, SQL, collector), Forge (F, log metrics and apply), Echo (E) and Chase (C, checks).

## Changes
- **Dashboards** (`project/scripts/monitoring/dashboards/*.cjs`, generated into `infrastructure/grafana/dashboards/*.json`, `lib.cjs` shared helpers; Byte).
  - Now: a Chat API lane (1-J) in the PROD services timeline and a Chat tile (5: turns, failed, median turn time, time since the last turn); Push is back to 8 columns.
  - PWA & APIs: a `Service · chat` row (14, request count, p95 latency with the 300 s timeout line, instances) and an `In-app chat · turns` row (40 to 43: outcomes, turn time, a turns tile with median rounds and turn time) for PROD and DEV.
  - Infrastructure: the Cloud Run table covers ten services (chat added; Connections by DB and the layout below it move down).
  - Cost: row 49 renamed `In-app chat · usage and cost`; 50 last 10 questions (now with outcome, rounds and turn time); 51 this month (turns, failed, estimated cost in total and per question); 52 by model. One price rule (`priced()`) for all chat panels; an unpriced model shows No price instead of an understated cost.
- **Selectors** (`project/scripts/monitoring/`): `distribution-median.jq` (median of a log-based distribution over the range, null when there is no turn) and `last-count-age.jq` (age of the newest counted point, null when none), so an empty range shows None rather than a healthy zero.
- **V108** (`database/migrations/V108__pwa_chat_monitoring_reads.sql`, Byte): `monitoring.pwa_chat_recent_turns_v1(p_limit)` and `monitoring.pwa_chat_usage_v1(p_since)`, read functions only; no table or column. `EXECUTE` for `mw_agent_dashboard`; column grants through `mw_chat_owner_<env>` (owner window as V104). Applied to DEV and PROD on 24 October 2026 (Promotion record).
- **Tests and CI prerequisites**: `scripts/database/Test-Chat.sql` section I (turns and usage on a synthetic thread); `scripts/database/Test-AppRolePrerequisites.sql` creates `mw_agent_dashboard` when missing (guarded; the agent lab creates it first).
- **Schema digest** (`services/chat/assets/schema-digest.json`): rebuilt at migration 108. The prompt digest changes, so each thread starts one new history epoch on its next turn after the next chat image deploy; the deployed chat keeps the old digest until then.
- **Log-based metrics** (`infrastructure/{dev,production}/log-metrics.tf`, Forge): `mw_chat_turns_<env>` (counts by code and model), `mw_chat_turn_latency_<env>` and `mw_chat_turn_rounds_<env>` (distributions), from the chat service's `chat_turn` log; no question text. DEV applied 07:27:43Z to 07:27:56Z, plan 3 add, 0 change, 0 destroy, re-plan no changes. PROD applied 10:00:05Z to 10:00:20Z the same day. Mocked tests extended (`tests/chat-service.tftest.hcl` in both roots).
- **Alerts** (`infrastructure/grafana/owned-services.tf.json`): `PWA API health failed` includes `pwa_api_chat_prod`; `Cloud Run 5xx` sums reader, command and chat. Applied to Grafana on 24 October 2026.
- **Collector** (`project/scripts/monitoring/debian-health.py`): six `pwa_api_*` health components (adds `pwa_api_chat_prod` and `pwa_api_chat_dev`), 11 worker threads. The origins file `/etc/mw-resource-monitoring/pwa-api-origins.json` on the host gains the two chat origins at deploy; until both are deployed the chat lane shows Unknown and does not page. Deployed 24 October 2026 (Promotion record).
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
| Pull request `Development checks` (PR #141) | Pass, run 40075467123 |
| Database migrations (PR #141) | Pass, run 40075449480 |
| Echo (UX review of the regenerated JSON against the canvas) | No blocking findings; applied: orange 30 s line on PWA 42, PWA 44 six rows high, Cost 51 "Turns" and "Per turn" (then `build-dashboards --check`, `test_build_dashboards`, `test_dashboard_queries` 69 OK again) |
| Chase (adversarial review: V108 security, jq selectors on empty and sparse data, alert names against the collector, schema digest) | No blocking findings |

## Not run
The next chat image deploy (it carries the schema digest at migration 108) was not part of the owner's approval. The Now Chat tile stays empty until the next chat turn.

## Recovery
Git baseline `a23a8c3f`. Dashboards and alerts: Terraform apply of the previous Grafana JSON. Log metrics: remove the three resources per environment and apply (additive). V108: the PROD backup `prod-promotion-bbf525fb481d47038240be57ea202885` at V107, or a forward drop of the two functions (nothing else depends on them once the dashboard JSON is reverted). Collector: the host backups `debian-health.before-R093-20261024.py` and `pwa-api-origins.before-R093-20261024.json`. The schema digest follows the chat image rollback.

## Open questions
None.

## Remaining work
R094: redeploy the chat image so it carries the schema digest at migration 108 (one new history epoch per thread; the deployed chat keeps the old digest until then). Carried from R091 to R094: the three dead VM configuration keys and the agent's SELECT on the notification, push and jobs tables.

## Promotion record

[Template](../project/scripts/releases/templates/promotion-checklist.md), revision 14 October 2026. Recovery: [Release recovery runbook](../project/Documents/Rules/Release_Recovery_Runbook.md). Deployment pins are only in the [Environment inventory](../project/Documents/Environment_Inventory.md).

### Continue here
- Outcome/scope and affected components: R093 is Released to DEV and PROD (24 October 2026): the in-app chat on the Now, PWA & APIs, Infrastructure and Cost dashboards, with V108 (two monitoring read functions), the PROD chat log metrics, two extended alert rules and the collector's six health components. No application image, Hosting or Cloud Run change.
- State and next action or actual blocker: applied and verified. Tag `R093` on `4c80ffde`; next: the R094 items in Remaining work.
- Source/artifact/configuration pins; runner manifest link: source `4c80ffde` (PR #141; baseline R092 `a23a8c3f`). PROD manifest `release-r093-prod.json`, backup, plans, versions and hashes are in the Environment inventory.
- Existing owner authority and any explicit hands-on checkpoint: the owner's instruction "Yes" of 24 October 2026, to the proposal to merge and to apply V108 to DEV and PROD, the PROD log metrics, the collector and Grafana. It covers the backup, the standard owner windows and the records. It did not cover a forced notification, job or financial write; none happened.
- Previous deployed baseline and recovery: PROD at V107, previous dashboard versions `mw-now` 14, `mw-pwa` 13, `mw-infra` 11, `mw-cost` 13, the previous collector files on the host (backups in the inventory). Rollback in Recovery above.
- Scope freeze/next-number handoff: R093 Frozen and R094 opened with the counter at R095 in the [tracker](../project/Documents/Release_Tracker.md); R093 is now Released there.
- Checks: PR #141 `Development checks` run 40075467123 and `Database migrations` run 40075449480, both green; the rest in Checks above.

### Promotion
| Step | Completion evidence |
| --- | --- |
| Scope, target, authority and usable recovery confirmed | Owner instruction above; targets verified by Forge (`mw-credit-pg-20261017`, `loan_manager_prod`, `vm-mw-credit-agent`); previous dashboard versions and host files captured |
| Required affected checks passed or explicit owner deferral recorded | CI runs above; Echo and Chase rows; no deferral |
| Tested package captured; tracker freeze/handoff published | `4c80ffde` merged to `main`; freeze published with R094 opened; PROD release manifest sha256 `1219c4d6…16b7` |
| Changed components deployed in dependency order | DEV V108 09:45:01Z; collector 09:54:24Z; PROD backup and V108 09:57:54Z (backup `prod-promotion-bbf525fb…`, restore passed); PROD log metrics 10:00:05Z to 10:00:20Z (plan 3/0/0); Grafana 10:02:32Z to 10:02:49Z (plan 0/5/0), re-plans no changes |
| Version/environment and affected PROD smoke verified once | V108 readback 108 rows, head 108; first collector run all six `pwa_api_*` = 1; Grafana versions read back, PWA 2m 11 rules none paused, no alerts firing, Cost chat panels return rows |
| Actual outcome/changed owning facts recorded; intended publication and final tag verified | Inventory, tracker, Development Changes, `database/README.md` and this note; tag `R093` on `4c80ffde` (Release tag workflow, 24 October 2026) |

SQL: V108 was the only pending migration from V107, applied under the release manifest by the guarded runner. Infrastructure: the reviewed plans with their actual applies. Notification and jobs: unchanged; nothing forced.

### Deviations and limitations
1. DEV V108 ran through `Invoke-Flyway.ps1 -Environment development -Command migrate`, because `Invoke-CloudFlyway.py` is PROD-only.
2. The PROD owner-window restore needed the production gate arguments; the first try was refused before it ran.
3. DEV had no backup (additive functions only).
4. Limitation: the Now Chat tile is empty until the next chat turn (log metrics start at 10:00Z); the new schema digest takes effect with the next chat image deploy (R094).

### Close
- Outcome: applied and verified in DEV and PROD.
- Recovery reference: Continue here and the Recovery section above.
- Changed documents, if any: Environment inventory (V108 rows, PROD log metrics, host monitor, Grafana), Release Tracker, Development Changes, `database/README.md`, and links repointed for the pruning below.
- Published evidence/tag: tag `R093` on `4c80ffde` (Release tag workflow, 24 October 2026).
- Outstanding owner action, if any: none.

### Closure pruning (release workflow, 24 October 2026)
- Inbound links repointed first to the commit permalink of `4c80ffde` (the last commit where the targets exist): `project/Documents/Development_Changes.md`, `Release_Tracker.md`, `Environment_Inventory.md`, `Solution_Design.md`, and the three integration-agent notes that cited them.
- Change notes deleted (R090 left the retention window of R093, R092 and R091): `CHANGE_NOTES_R090_PWA_CHATBOT_2026-10-23.md`, `CHANGE_NOTES_R090_PWA_CHATBOT_DESIGN_2026-10-23.md`, `CHANGE_NOTES_R090_QUESTION_COST_2026-10-22.md` and `CHANGE_NOTES_R090_GRAFANA_LIMITS_RETIREMENT_2026-10-22.md` (all under `Change Logs/`).
- Development Changes: the R093 row is replaced by one R093 follow-up row.
- Design `project/outputs/r090-pwa-chatbot/DESIGN.md` is kept: the tracker and Development Changes cite it.
- Evidence deleted: `project/outputs/collection-monitor-design-20260924/DESIGN.md` (warned as uncited; its one inbound link in `project/outputs/r025-20260924/README.md` repointed to the `4c80ffde` permalink first).
