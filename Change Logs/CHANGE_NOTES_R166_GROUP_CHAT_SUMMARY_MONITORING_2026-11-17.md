# Change notes — Group chat summary statistics in Grafana (R166), 17 November 2026

## Purpose
Owner request of 17 November 2026: "add statistics on the performance of the chat summary agent in Grafana". The `group_chat_summary` service (R146, refresh requests since R165) has no panel of its own: how long a summary takes, how often it fails and how far behind it is can only be read from the audit tables.

## Changes
Owner decisions of 17 November 2026 (recorded as given):
- All seven candidate tiles on the `mw-agent` dashboard are accepted.
- The new backlog alert stays on for a permanently failing group; the owner clears it by hand.
- The team reviews design and user experience before PROD, and the owner approved going to PROD after that review: "go ahead with R166, and engage the team to review the design and user experience before pushing it to prod".

Scope:
- Integration agent (catalogue revision 40, no agent migration): each `group_chat_summary` run records its effect in `runtime.job_runs.summary` (also the job-completed event) on every non-idle run, including a failed run that exits 2: `due`, `summarised`, `failed`, `deferred`, `outcomes` (`stored`, `unchanged`, `superseded`, `cleared`), `errors` (fixed code to count), `waits` and `refresh`; idle, already-running, dry-run and `--mark-all` runs write none. The refresh requests served are included. No keys, ids or chat text, as in R146. `deploy-runtime.py` gets `R166_REVISIONS` (39, 40); the services are unchanged.
- Collector (`project/scripts/monitoring/debian-health.py`): `worker_timing{component="group_chat_summary"}` (provider, model, last run age and duration, waiting, oldest wait, groups in back-off, last error time and up to three codes, 24-hour outcomes, waits and refresh figures; counts 0 and durations -1 when empty), `health{group_chat_summary}` (lane only) and `worker_timing{group_chat_summary_call}` (the slowest model call since a stored cursor, each call once). The full field list is in `project/Documents/Resource_Monitoring.md`. The five queries run in separate savepoints under the 8 s timeout.
- Dashboard `mw-agent` (Agent & Receipts): new row 25 "Group chat summary · mw-group-chat-summary on Debian" with the row header 25 and tiles 26 to 33 (last run, waiting, failures, outcomes 24 h, delay 24 h, model, refresh 24 h, model time) and a new lane "Group chat" in panel 9, Agent workers and timers (workers row y 52, panel 9 y 53, connectivity row y 63). `DASHBOARD_RELEASE` is `R166`, so the release tag changes on all five dashboard JSON files; only `mw-agent` gains panels. Error codes are shown in words (`GROUP_CHAT_ERRORS`, `group-chat-error.jq`).
- Fixes after Echo's rendered review (UX-CSMON-10, 11 and 12): `last_error:<CODE>` carries the code's rank (1 = most frequent) instead of always 1; tile 28 shows "<most frequent code in words> +N · <age>" (no "ago"; words at most 15 characters, for example "Bad model reply"; an unknown code reads "Other error") in the text-tile size (20 px values, including In back-off); the quiet-day None and None · 24 h on Run took, Delay Median and Longest, and Refresh Taps, Median wait and Longest wait are transparent, with grey only for a missing value (No report); Paused and nothing-waiting send `oldest_wait_seconds` -1 (None), and the alert still does not page on -1.
- Empty model-time charts (Echo, tested in Grafana 12.2.1): tile 33 and Recognizer tile 8 gain a `seriesToRows` plus `organize` transformation (legend names "Model call" and "Extraction" kept), so a range with no calls shows the panel's no-value text instead of blank axes; a build test asserts both.
- Alert rule "MW | Group chat summary backlog": uid `mw-group-chat-backlog`, group Performance 2m, contact point MW Performance IRM, `severity=page`: fresh `oldest_wait_seconds` above 1,200 s, pending 5 minutes, no-data and error policy KeepLast; Paused, stale or missing evaluate as 0 and do not page.
- No new table, column, grant, IAM, datasource, secret or infrastructure change. There is no DEV Grafana and no DEV agent, so CI is the only check before PROD.

Documents updated (Dewey):
- `project/Documents/Release_Tracker.md` and `project/Documents/Development_Changes.md`: the R166 scope and outstanding work.
- `project/Documents/Resource_Monitoring_Dashboard_Guide.md`: row 25, the panel 9 lane, the colour rules and the alert table (the owner's standing rule that every dashboard update updates the guide).
- `project/Documents/Resource_Monitoring.md`: the new alert rule and the collector series.
- `project/scripts/monitoring/README.md`: the collector additions and `DASHBOARD_RELEASE`.
- `integration-agent/SERVICE_CATALOGUE.md` (revision 40 paragraph), `integration-agent/README.md` and `integration-agent/docs/OPERATIONS.md`.
- Not changed: the Data Dictionary (no SQL object or API changes), the Environment Inventory (no deployment yet; the Grafana dashboards component moves from R144 at closure).

Files (Byte, uncommitted on base `5d8d6783`): integration agent `cli.py`, `group_chat_summary.py`, `service-catalogue.json`, `scripts/deploy-runtime.py`, tests `test_group_chat_summary.py`, `test_deploy_runtime.py`, `test_config.py`, `test_receipt_recognition.py`; `project/scripts/monitoring/` `debian-health.py`, `test_debian_health.py`, `dashboards/agent.cjs`, `dashboards/lib.cjs`, `ops-health.jq`, `group-chat-error.jq` (new), `test_build_dashboards.cjs`, `test_dashboard_queries.py`; `infrastructure/grafana/dashboards/mw-{agent,now,pwa,infra,cost}.json`; `infrastructure/grafana/owned-services.tf.json`.

Data rules: no borrower data, chat text or secrets are recorded here.

## Checks
| Command | Result |
| --- | --- |
| `python -m unittest discover -s tests` (integration agent; base `5d8d6783`, uncommitted tree) | 999 run; only `test_receipt_qr` fails on the import (zxingcpp missing in the container); the targeted suites pass (Byte) |
| `ruff check` (integration agent) | Pass (Byte) |
| `test_debian_health.py` | 90 OK (Byte) |
| The five collector queries on a disposable PostgreSQL 18 | OK (Byte) |
| `npm run test:monitoring` | Pass (Byte) |
| `terraform fmt -check` and `validate` | Pass (Byte) |
| `npm run lint` | Pass (Byte) |
| `npm test` | 1398 pass (Byte) |
| Chase's R166 verification (base `5d8d6783`, uncommitted tree) | Pass, no defects. Collector SQL on a PostgreSQL 18 lab built from agent migrations V1 to V13: savepoint isolation, the 8 s timeout, read-only, the cursor never re-emits or skips a call. Agent effect: content and when it is written. Alert expression: 1201 fires; 1200, 0, -1, stale and none do not. jq selectors, and the deploy order both ways. Notes: groups in back-off count toward the oldest wait (owner decision); worst-case collector run 56 s against `TimeoutStartSec` 180 s; the 24-hour tiles show None until 24 hours of agent records exist |
| Echo's rendered review (real Grafana 12.2.1 locally with TestData sample data; busy, quiet and paused states at 1440 and 390 px) | Findings UX-CSMON-10, 11 and 12 were fixed by Byte (see Changes) and confirmed in Echo's re-render, which found no new issue; the height deviation was confirmed by Echo; the empty-chart transformation was tested by Echo and added by Byte (`npm run test:monitoring` and `npm run lint` pass). Not reviewed: the light theme and the live Infinity/jq output. The owner's PROD approval is conditional on this review |
| Byte's re-checks after the fixes | `npm run test:monitoring` pass; `GroupChatSelectors` 4 OK; `test_debian_health` OK; `npm run lint` pass |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (Dewey, work tree) |
| `Development checks` run on the pull request head | Pending: the run id is added after the push |

## Not run
Not run by Byte: the full Playwright and `mw-db-ci` suites (left to the pull request's CI); `test_receipt_qr` (zxingcpp missing). Not reviewed by Echo: the light theme and the live Infinity/jq output; they are read back in PROD. No DEV Grafana and no DEV agent, so the dashboard, the alert rule and the collector are verified live only in PROD after promotion.

## Recovery
Before deployment, revert the commit. Dashboards roll back by redeploying the previous `mw-agent` JSON; the alert rule by pausing or removing it in Alert rules (the other rules are unaffected); the agent by `deploy-runtime.py rollback --commit <previous>`; the collector by restoring the previous `debian-health.py`. No SQL, so no backup is needed.

## Open questions
None.

## Remaining work
Byte's final panel IDs and field names; Chase's evidence; the design and UX review; the PROD promotion under the owner's approval, its record, the tag and the closure.
