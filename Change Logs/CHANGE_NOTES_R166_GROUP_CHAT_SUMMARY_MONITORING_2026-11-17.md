# Change notes — Group chat summary statistics in Grafana (R166), 17 November 2026

## Purpose
Owner request of 17 November 2026: "add statistics on the performance of the chat summary agent in Grafana". The `group_chat_summary` service (R146, refresh requests since R165) has no panel of its own: how long a summary takes, how often it fails and how far behind it is can only be read from the audit tables.

## Changes
Owner decisions of 17 November 2026 (recorded as given):
- All seven candidate tiles on the `mw-agent` dashboard are accepted.
- The new backlog alert stays on for a permanently failing group; the owner clears it by hand.
- After Forge's read-only PROD pre-check on 17 November 2026 (one `runtime.group_chat_summary_state` row waiting about 48 hours with 13 attempts, last error `GROUP_NOT_FOUND`, in back-off; the other 38 rows clean; the R166 collector query on live data returned waiting 1, oldest wait 173034 s, groups in back-off 1) the owner decided "Clear it, then alert": the team clears that one entry during the R166 deployment with the documented [clearing step](../integration-agent/docs/OPERATIONS.md#clearing-a-permanently-failing-group-summary-r166), after the agent and collector deploy and before the Grafana alert is applied. Deployment order: agent at revision 40 and collector, clearing step, dashboards, alert rule.
- The team reviews design and user experience before PROD, and the owner approved going to PROD after that review: "go ahead with R166, and engage the team to review the design and user experience before pushing it to prod".

Scope:
- Integration agent (catalogue revision 40, no agent migration): each `group_chat_summary` run records its effect in `runtime.job_runs.summary` (also the job-completed event) on every non-idle run, including a failed run that exits 2: `due`, `summarised`, `failed`, `deferred`, `outcomes` (`stored`, `unchanged`, `superseded`, `cleared`), `errors` (fixed code to count), `waits` and `refresh`; idle, already-running, dry-run and `--mark-all` runs write none. The refresh requests served are included. No keys, ids or chat text, as in R146. `deploy-runtime.py` gets `R166_REVISIONS` (39, 40); the services are unchanged.
- Collector (`project/scripts/monitoring/debian-health.py`): `worker_timing{component="group_chat_summary"}` (provider, model, last run age and duration, waiting, oldest wait, groups in back-off, last error time and up to three codes, 24-hour outcomes, waits and refresh figures; counts 0 and durations -1 when empty), `health{group_chat_summary}` (lane only) and `worker_timing{group_chat_summary_call}` (the slowest model call since a stored cursor, each call once). The full field list is in `project/Documents/Resource_Monitoring.md`. The five queries run in separate savepoints under the 8 s timeout.
- Dashboard `mw-agent` (Agent & Receipts): new row 25 "Group chat summary · mw-group-chat-summary on Debian" with the row header 25 and tiles 26 to 33 (last run, waiting, failures, outcomes 24 h, delay 24 h, model, refresh 24 h, model time) and a new lane "Group chat" in panel 9, Agent workers and timers (workers row y 52, panel 9 y 53, connectivity row y 63). `DASHBOARD_RELEASE` is `R166`, so the release tag changes on all five dashboard JSON files; only `mw-agent` gains panels. `mw-now`, `mw-infra` and `mw-pwa` change by more than the tag, because the shared collector-fields selector gains the signed option (a no-op for their existing fields); `mw-cost` is tag-only. Error codes are shown in words (`GROUP_CHAT_ERRORS`, `group-chat-error.jq`).
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
| Echo's rendered review (real Grafana 12.2.1 locally with TestData sample data; busy, quiet and paused states at 1440 and 390 px) | Findings UX-CSMON-10, 11 and 12 were fixed by Byte (see Changes) and confirmed in Echo's re-render, which found no new issue; the height deviation was confirmed by Echo; the empty-chart transformation was tested by Echo and added by Byte (`npm run test:monitoring` and `npm run lint` pass). First CI run on `a76535f6`: the agent `lab` job failed in `tests.test_postgres_state` (two assertions, plus a third that would have failed next, still expected `due()` pairs; `due()` now also returns `changed_at`). The four assertions now compare the first two values; the lab suite run here against a disposable cluster from `integration-agent/tests/lab/setup.sh`: 43 tests OK. Not reviewed: the light theme and the live Infinity/jq output. The owner's PROD approval is conditional on this review |
| Byte's re-checks after the fixes | `npm run test:monitoring` pass; `GroupChatSelectors` 4 OK; `test_debian_health` OK; `npm run lint` pass |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (Dewey, work tree) |
| `Development checks` run [44062082675](https://github.com/welct0407/MW-Credit-App/actions/runs/44062082675) on `073e46a1` | Success (lint and Terraform reused from run 44061709317); the integration-agent tests run [44062082679](https://github.com/welct0407/MW-Credit-App/actions/runs/44062082679) also passed. The package tree `2482808e` (PR #343) is identical to the tested head |
| PROD promotion and read-back | Pass: see the PROD promotion record below |
| Release tag | `R166` on `2482808e` (Release tag run 44065241301, success; the same run published the GitHub Release) |

## Not run
Not run by Byte: the full Playwright and `mw-db-ci` suites (left to the pull request's CI); `test_receipt_qr` (zxingcpp missing). Not reviewed by Echo: the light theme and the live Infinity/jq output; they are read back in PROD. No DEV Grafana and no DEV agent, so the dashboard, the alert rule and the collector are verified live only in PROD after promotion.

Audit note (Forge's correction): per-run audit records exist under the service name `group-chat-summary` (with a hyphen). In the PROD pre-check, 24 hours had 26 runs, 22 `group_chat_summary_model`, 22 `group_chat_summary_post` and 1 `group_chat_summary_refresh_post` events. `runtime.job_runs.summary` has no effect key until the R166 agent is deployed, so the 24-hour tiles read None until then.

## Recovery
Before deployment, revert the commit. Dashboards roll back by redeploying the previous `mw-agent` JSON; the alert rule by pausing or removing it in Alert rules (the other rules are unaffected); the agent by `deploy-runtime.py rollback --commit <previous>`; the collector by restoring the previous `debian-health.py`. No SQL, so no backup is needed.

## Open questions
None.

## Remaining work
Byte's final panel IDs and field names; Chase's evidence; the design and UX review; owner acceptance.

## PROD promotion record (Forge, 17 November 2026 UTC)
Authority: the owner's PROD approval of 17 November 2026 after the team's design and user experience review, "go ahead with R166, and engage the team to review the design and user experience before pushing it to prod", and the decision "Clear it, then alert". Package `main` `2482808e1016bcddf0d27b9e45358b772dfc929b` (PR #343); the package tree is identical to the tested head `073e46a1`. Baseline R165 `907650de`. Freeze 10:12:25Z. No SQL, no Cloud Run, Hosting, IAM, datasource or secret change.

| Step | Result |
| --- | --- |
| CI | `Development checks` 44062082675 on `073e46a1` (lint and Terraform reused from 44061709317) and the agent tests 44062082679 |
| Baseline | Agent `/ready` R165 `907650de`, catalogue 39; collector `debian-health.py` sha256 `d24ba62e…`; the five dashboards tagged `release:R144`; the Grafana baseline plan from `5d8d6783` showed no change (check-baseline passed 10:16Z) |
| Pre-check | 1 of 39 groups waiting, oldest 172,965 s, 13 attempts, `GROUP_NOT_FOUND` |
| Agent | `update-from-github` `907650de` to `2482808e`, clean; dry-run: only `cli.py` and `group_chat_summary.py` differ, no unit change, ancestry ancestor; the temporary `/root/r166-op` created 10:12:59Z and shredded 10:13:10Z; freeze `--release R166` 10:12:59Z, backup `runtime-20261117T101259203904Z` (metadata sha256 `9b21b107e7f43ae094ac504be94aa2f3d99cb2318ec0f0f08578b200f14dda2a`); install 10:13:02Z; activate 10:13:06Z to 10:13:10Z, probe `a877f87c-ea86-4208-92f5-e23a4327cb48`; `mw-chat-relay` restarted 10:13:20Z; `/ready` true at R166 `2482808e`, the recognizer and relay `healthz` R166; catalogue 39 to 40, switches identical |
| Collector | Only `debian-health.py` differs; backup `/opt/mw-resource-monitoring/debian-health.before-R166-20261117.py` (sha256 `d24ba62e…`); installed 10:15:46Z, sha256 `4ec7368aea98df4a22d2ff7a65c784b982f219c8981829e7cbfabbb370b156b1`; daemon-reload; first run 10:17:35Z exported all 20 fields, model call 9 s, health lane 2 (the stuck group) |
| Clearing | The documented step as `mwagent` / `mw_agent_worker`, one transaction: the SELECT returned exactly 1 row (13 attempts, `GROUP_NOT_FOUND`, about 173,706 s); `UPDATE 1` committed 2026-11-17T10:19:34Z; key `9a3146a07f817fe27b0f892cde54150a`; code `GROUP_NOT_FOUND`; all 39 rows kept. Afterwards 0 waiting at 10:19:50Z; collector runs 10:19:41Z and 10:21:47Z: waiting 0, oldest wait -1, back-off 0, health 1 |
| Grafana | `manage.py --secret-version 1` from a clean worktree at `2482808e`; saved plan 0 add, 6 change, 0 destroy (sha256 `f55e4913d24f384538a429d0289c2e5e7890e08e432ca0211af9682f7d688ead`): five dashboards (spec only, UID and folder unchanged) and the Performance group adds only the new rule, the 9 existing unchanged; applied 10:22:31Z to 10:22:47Z; re-plan no changes; all five tagged `release:R166`, `mw-agent` and `mw-now` at version 17, 9 group-chat panels on `mw-agent`; the rule first evaluated Normal at 10:26:30Z; all 21 rules inactive |
| Verification | 20 fields at two-minute points; health 2, then 1, then 1; the summary runs since activation were idle; no error-priority journal lines |
| Tag | `R166` on `2482808e`, Release tag run 44065241301 (success; the same run published the GitHub Release) |

Not yet observed: a `job_runs.summary.effect` record (it is written only by a run with work).

Rollback: Grafana, apply the saved plan from `5d8d6783` (or pause the rule); collector, copy the backup back; agent, `deploy-runtime.py rollback --commit 907650de4a928392e76805503724dd607828c2db` and restart the relay. The clearing is not reverted.

Private evidence: `gs://mw-credit-operator-private-737787224638/promotion-packages/r166/` (10 objects).

Drift (Forge, read-only, after the tag): `node scripts/promotion/component-versions.mjs drift --env all --observed <private drift-observed.json> --strict` reported drift 0 and unverified 1 (exit 2): `metabase-reports` R144, because the credentialed read was not supplied. Matches: DEV PWA, read, command and chat R165 (`b67a4aa7`), notify and jobs R159, schema 150; PROD PWA, read, command and chat R165 (`907650de`), notify and jobs R159, schema 150, agent R166 (`2482808e`), Grafana dashboards R166. Before the tag the result was drift 2 (agent R166 and Grafana R166, expected).

Component versions at this release (`component-versions.mjs derive --release R166 --commit R166`): Integration agent (revision 40) and Grafana dashboards changed in R166; every other component keeps its earlier release.

Closure: the tag exists; the freeze pin, this record, the tag record and the prune are published in the R166 closure pull request. Pruned: the R163 change note (`CHANGE_NOTES_R163_COLLECTION_SYNC_QUIET_RETRY_2026-11-16.md`, outside the window of Open plus the three newest Released releases); its links now point to commit `2482808e`.
