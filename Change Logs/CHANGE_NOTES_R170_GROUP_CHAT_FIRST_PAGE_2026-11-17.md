# Change notes — R170 group chat first-page guess, 17 November 2026

## Purpose
Owner request, 17 November 2026: "go with option 2. push all the way to prod". Integration agent only; the detail is in the [agent change note](../integration-agent/Change%20Logs/CHANGE_NOTES_GROUP_CHAT_FIRST_PAGE_2026-11-17.md). PROD promotion is approved.

## Changes
- Evidence: owner's first R169 tap in PROD (16:58:58Z to 16:59:13Z): the wake path started the run 9 ms after the wake file; tap to run start 8 s; the run took 14.6 s, of which the listing took 14.0 s with 2 Instagram calls, because the group was not among the 5 most recent conversations (a first-page miss, then the 25 pass); the outcome was unchanged, so no model call; tap to report about 23 s (R168: about 65 s, 40 s to run start plus a 24.8 s run).
- Design: `first_page_likely(db, wanted, now)` reads `conversation_poll_messages` (every polled message of eligible groups, including short ones and slips) and is true only if every wanted group has a row, the oldest of their latest messages is within `RECENT_SECONDS` (3600 s), and at most `FIRST_PAGE_RANK_MAX` (4) distinct conversations have messages at or after it. Otherwise the run skips the 5-conversation page and goes straight to the 25 pass.
- Effect: `first_page: {hit, miss, skipped}` counts. Catalogue revision 43, services unchanged; `R170_REVISIONS` = (42, 43). No unit change and no hand install.
- Correction: `refresh.seconds` (and `refresh_median_seconds`, `refresh_max_seconds`, `refresh_late_24h` and the dashboard's refresh waits) measure tap to run start, not tap to report. The R169 figure "40 s tap to report" was tap to run start (R168 tap to report was about 65 s). R169's notes, the catalogue, the tracker, the R168 agent note and the monitoring pages are corrected.
- Byte's deviations: a failing predicate query returns false (the R168 read); runs with no poll record skip the first page (the R169 listing tests were given poll records; two older tests now expect one limit-25 request); first-page counting when an earlier group's listing raises.
- Read-back list for Forge at promotion: catalogue 43; after a run, `effect.first_page` and `instagram_calls`; the first PROD predicate completes (the run is not `skipped` every time).
- Docs: `integration-agent/SERVICE_CATALOGUE.md`, `integration-agent/docs/CONVERSATION_POLL.md`, `integration-agent/README.md`, `project/Documents/Resource_Monitoring.md` (new effect field and the tap-to-run-start correction), `project/Documents/Resource_Monitoring_Dashboard_Guide.md`, `project/Documents/Release_Tracker.md` and `project/Documents/Development_Changes.md`.

## Checks
| Command | Result |
| --- | --- |
| Byte: full suite (in `integration-agent/`, base `598ffbd`, uncommitted) | 1027 run, 77 skipped, 1 error: `test_receipt_qr` (`zxingcpp` is missing locally); not caused by this batch |
| Byte: `ruff check --no-cache .` | Pass |
| Byte: PostgreSQL lab (disposable cluster), three PostgreSQL modules | 69 OK, 23 skipped, including a new `first_page_likely` test in `test_postgres_state.py` |
| Chase: adversarial review and `test_group_chat_summary test_deploy_runtime test_conversation_poll test_config` | Pass, no blocking defects. 215 run, 1 sandbox error (`psycopg` missing for a password-projector test); ruff pass. PostgreSQL safety: outside a `with db:` block each journal statement runs in its own transaction on an autocommit connection, so a failing predicate rolls back only itself (safe while it is not called inside a journal transaction). The SQL is correct on both databases (`event_time` in epoch seconds, double precision). Cost: `conversation_poll_messages` has only the `message_id` primary key and no pruning, so the predicate scans it once per non-idle run; acceptable now, watch its growth (follow-up: an `event_time` index needs an agent migration, not in R170). |
| `npm run check:docs` | 0 failures, 0 warnings (Chase, same tree) |
| PROD promotion and read-back | Pass: see the PROD promotion record below |
| `Development checks` run 44137472776 and integration-agent tests run 44137472711 on the tested head `7e190fd` | Success (PR #351; merged as `e4762c9d`, tree identical) |
| Release tag | `R170` on `e4762c9d` (Release tag run 44139293877) |

## Not run
- The full Playwright and `mw-db-ci` suites: the pull request's CI is the one broad run.
- No DEV agent exists, so the guess and its hit rate are verified only in PROD after promotion.

## Recovery
After deployment, per the agent change note: `deploy-runtime.py rollback --commit d7b467c039f70ee3c0253de972f3d1e4a585e75f` (the R169 package); no unit was changed, so nothing is reinstalled, and the guess keeps no state.

## Open questions
None. The owner approved promotion on 17 November 2026: "go with option 2. push all the way to prod".

## Remaining work
Owner acceptance; read `effect.first_page` and the listing seconds at the first run with work (check the group is not `skipped` every time). Everything else (pull request CI, merge, PROD promotion, tag, closure) is done.

## PROD promotion record (Forge, 17 November 2026 UTC)
Authority: owner, 17 November 2026, "go with option 2. push all the way to prod". Package `main` `e4762c9d23ad0432de77883c39ae843c0866711c` (merge of PR #351; tree `4318dd0b` identical to the tested head `7e190fd`; `Development checks` 44137472776 and the agent tests 44137472711, both success). Baseline R169 `d7b467c0`, catalogue 42. Target `vm-mw-credit-agent` (project `clever-oasis-508610-n7`, zone `asia-southeast1-a`), state database `mw_agent` on `mw-credit-pg-20261017`. Integration agent only: no SQL, no agent migration, no unit file, no Cloud Run, Hosting, Terraform, IAM, Grafana, collector or secret change.

| Step | Result |
| --- | --- |
| Baseline (17:33:15Z) | `/ready` true at R169 `d7b467c0`, catalogue 42; `mw-group-chat-refresh-wake.path` and `mw-group-chat-refresh-watch.timer` enabled and active |
| Agent | `update-from-github` `d7b467c0` to `e4762c9d`, clean; dry-run: only `group_chat_summary.py` differs, no unit change, ancestry ancestor; the pause list now includes the watcher timer and the wake path. Temporary root-only `/root/r170-op` (`postgres` through the 5432 proxy, password on stdin from Secret Manager, never printed) created 17:33:31Z, shredded 17:33:47Z. Freeze `--release R170` 17:33:35Z to 17:33:39Z, backup `runtime-20261117T173336102896Z` (metadata sha256 `5c237bbe0e2383edf9e259f399d73c63f13bc5aff3aaf494842d86af42461e3a`); install to 17:33:43Z (no unit changed); activate to 17:33:47Z, probe `38d5db9e-838a-45d5-9c08-ace66c0ca119`, all nine triggers resumed (including `mw-group-chat-refresh-watch.timer` and `mw-group-chat-refresh-wake.path`); `mw-chat-relay` restarted 17:33:56Z. `/ready` true at R170 `e4762c9d` (started 17:33:45Z); recognizer (8790) and relay (8791) `/healthz` R170; catalogue 42 to 43 |
| Timers | Wake path and watcher timer still enabled and active after the freeze and resume (no re-enable needed); watcher `OnUnitInactiveUSec=15s`, summary timer `1min`; both firing (for example 17:36:44Z and 17:36:09Z) |
| Verification (to 17:36:57Z) | No `job_runs` row other than COMPLETED since the freeze; summary heartbeat COMPLETED, exit 0; 0 groups waiting; no warning-level journal lines apart from the known `systemd-ssh-generator` lines. Collector run 17:36:54Z exported (`webhook_code_version` `e4762c9d`, `code_version_match` 1, `group_chat_summary` health 1) |
| First run with work | Not yet observed (all runs idle; none forced). At the first one, check that `effect.first_page` is present and not only `skipped`; if it is `skipped`, check read-only whether the group had a poll message in the last hour |

Drift (Forge, read-only, before the tag): `drift --env all --observed <private drift-observed.json> --strict` reported drift 1 and unverified 4 (exit 1). The drift is the expected one: PROD agent observed R170 `e4762c9d` (catalogue 43) against the last tag's R169; it matches once `R170` is tagged. Notify and jobs R159 `5b887d09` (jobs by the shared image digest) in DEV and PROD; unverified: schema (DEV and PROD), Grafana dashboards and Metabase reports (no credentialed read; R170 changes none of them). All other components match.

Rollback (if needed): `sudo python3 integration-agent/scripts/deploy-runtime.py rollback --commit d7b467c039f70ee3c0253de972f3d1e4a585e75f` (may need the same temporary operator file), then restart `mw-chat-relay`; the R169 watcher and wake path stay as they are.

Private evidence: `gs://mw-credit-operator-private-737787224638/promotion-packages/r170/` (6 objects: dry-run, freeze, install and activate outputs, the observed facts and the drift output).

Tag record: `R170` on `e4762c9d23ad0432de77883c39ae843c0866711c`, created by Release tag run 44139293877 (success, 17:39Z), which also published the GitHub Release.

Component versions at this release (`component-versions.mjs derive --release R170 --commit R170`): the integration agent changed in R170 (revision 43); every other component keeps its earlier release (PWA, read, command, chat and schema R165; notify and jobs R159; Grafana dashboards R167; Metabase reports R144).

Drift after the tag: re-run by Dewey with public facts only (`node scripts/promotion/component-versions.mjs drift --env all`): drift 0, unverified 11 (every credentialed fact, as no observed file was supplied). Forge's pre-tag run with the credentialed facts gave drift 1, the PROD agent at R170 against the last tag's R169, which the tag clears; its unverified schema, Grafana and Metabase are untouched by R170. The credentialed run was not repeated after the tag.

Not yet observed: `effect.first_page` on a run with work (all runs idle after the deploy). Follow-up for a later release, not in R170: `conversation_poll_messages` has only the `message_id` primary key, no `event_time` index and no pruning, so the predicate scans it once per non-idle run; an index needs an agent migration. Owner acceptance is pending.

Closure: the tag exists; the freeze pin, this record, the tag record and the prune are published in the R170 closure pull request. Pruned (outside the window of Open plus the three newest Released releases): the R167 change note `Change Logs/CHANGE_NOTES_R167_STATE_MAP_FIX_2026-11-17.md`; its links now point to commit `e4762c9d`.
