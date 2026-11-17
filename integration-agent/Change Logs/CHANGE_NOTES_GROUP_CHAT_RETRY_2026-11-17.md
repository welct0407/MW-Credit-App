# Change notes — group chat Instagram timeout and retry (R171), 17 November 2026

## Purpose
Owner request, 17 November 2026: "go ahead with R171, push all the way to prod". This note covers the agent part; the PWA part is in the [root note](../../Change%20Logs/CHANGE_NOTES_R171_GROUP_CHAT_RETRY_DESKTOP_SYNC_2026-11-17.md). PROD promotion is approved.

## Changes
- Evidence: Forge's read of PROD since 14:04Z: every Instagram listing failure (1 of 6 summariser 25 x 100 listings and 2 of 186 poll 100 x 20 listings) was a non-4xx `InstagramAPIError` at 30.5 to 30.7 s, while successes took at most 9.1 s; timings scale with the number of conversations per page; the owner's refresh tap for the Gun group at 17:39Z failed this way and was recorded only as `GROUP_SUMMARY_FAILED`; the `first_page` counters stayed 0.
- Agent: (1) The summary cycle's Instagram client uses a 15 s read timeout (`SUMMARY_READ_TIMEOUT`); the poll, `--mark-all` and `--dry-run` keep 40 s. (2) One retry per run on a response of 500 or above or a transport failure, never on a 4xx, and only within the run budget; the effect gains `retries`. (3) First-page counting: `skipped` is counted before the request, and the new `failed` counts a first-page request that failed. (4) Fixed error codes `INSTAGRAM_HTTP_<status>[_<graph code>]`, `INSTAGRAM_TIMEOUT` and `INSTAGRAM_UNREACHABLE` replace the bare `GROUP_SUMMARY_FAILED` for Instagram failures; the dashboard shows them as "Other error" until a dashboard batch adds the words (carried over). A lighter listing (fewer messages per conversation) was considered and dropped, because the timings scale with conversations per page, not messages. No unit, setting, secret or table change. Catalogue revision 44, services unchanged; `R171_REVISIONS` = (43, 44).
- Byte's deviation: `instagram.py` gains `InstagramUnavailable` (a `ConfigurationError` subclass with `timed_out` and an identical message) so transport failures map to codes; six test harnesses were given the new import as a phone.
- Read-back list at promotion: agent catalogue 44, and on the first PROD run with work `effect.retries`, the `INSTAGRAM_*` codes and `first_page.failed`; PWA Hosting to DEV first with a desktop check, then PROD Hosting (`MW_RELEASE_NUMBER=R171`).
- Code and tests (Byte, not edited here): `src/mw_integration_agent/group_chat_summary.py`, `instagram.py`, `tests/`, `service-catalogue.json`, `scripts/deploy-runtime.py`.
- Docs: `SERVICE_CATALOGUE.md`, `docs/CONVERSATION_POLL.md`, `README.md`.

## Checks
| Command | Result |
| --- | --- |
| Byte: agent suite (in `integration-agent/`, base `6d117a1`, uncommitted) | 1037 run, 77 skipped, 1 error: `test_receipt_qr` (`zxingcpp` is missing locally); not caused by this batch |
| Byte: `ruff check` | Pass |
| Chase: review and `group_chat_summary`, `instagram_transport`, `conversation_poll`, `deploy_runtime`, `config` tests | Pass, no blocking defects. 236 run, 1 sandbox error (`psycopg` missing); ruff pass. Reviewed: `InstagramUnavailable` keeps every `ConfigurationError`, `isinstance` and `str` path identical (poll); one retry per run, 5xx or transport failure only, within the budget; codes are text-free; read timeout 15 s on the cycle and 40 s for `--mark-all` and `--dry-run`. |
| `npm run check:docs` | 0 failures, 0 warnings |
| PROD promotion and read-back | Pass: see the PROD deployment record below |
| `Development checks` run 44150958332 on the tested head `bf838f6` and integration-agent tests run 44146457912 | Success. Development checks green after one re-run of e2e shard 3 (a pre-existing mobile rollover flake that also fails on main; explained on PR #353); the agent tests run was green and reused. Earlier runs 44146458061 and 44149839833 failed and were fixed (UX-HSYNC-03 dropped; a timing-sensitive unit test made deterministic). The notification-transport VAPID-key flake is a pre-existing main issue. |
| Release tag | `R171` on `89bb33d8` (Release tag run 44158890567) |

## Not run
- The full Playwright and `mw-db-ci` suites: the pull request's CI is the one broad run.
- No DEV agent exists, so the agent half is verified only in PROD after promotion.

## Recovery
Agent: `deploy-runtime.py rollback --commit e4762c9d23ad0432de77883c39ae843c0866711c` (the R170 package); no unit changed, so nothing is reinstalled. PWA: redeploy the previous Hosting version (recorded in the Environment Inventory at promotion). No SQL or data change to undo.

## Open questions
None. The owner approved promotion on 17 November 2026: "go ahead with R171, push all the way to prod" and confirmed the PWA part in the same session ("add to R171, promote all").

## Remaining work
Owner acceptance; read `effect.retries`, `first_page` and the `INSTAGRAM_*` codes at the first PROD run with work; confirm the hidden-window sync on the owner's Windows Chrome. Everything else (pull request CI, merge, PROD promotion, tag, closure) is done.

## PROD deployment record (Forge, 17 November 2026 UTC)
Authority: owner, 17 November 2026, "go ahead with R171, push all the way to prod". Package `main` `89bb33d8a8e789157490ba47f7a4bc548e9236ab` (PR #353; tree identical to the tested head `bf838f6`; `Development checks` 44150958332 and the agent tests 44146457912), from R170 `e4762c9d`, catalogue 43. Host `vm-mw-credit-agent` (project `clever-oasis-508610-n7`, zone `asia-southeast1-a`), state database `mw_agent` on `mw-credit-pg-20261017`. No agent migration, unit, setting, secret or switch change.

| Step | Result |
| --- | --- |
| Baseline (19:09:00Z) | `/ready` true at R170 `e4762c9d`, catalogue 43; wake path, watcher timer, summary timer and poll timer active |
| Deploy | `update-from-github` to `89bb33d8`, clean; dry-run: only `group_chat_summary.py` and `instagram.py` differ, no unit change, ancestry ancestor, nine triggers in the pause list. Temporary root-only `/root/r171-op` (`postgres` through the 5432 proxy, password on stdin from Secret Manager, never printed) created 19:09:18Z, shredded 19:09:42Z. Freeze `--release R171` 19:09:23Z to 19:09:30Z (backup `runtime-20261117T190923536632Z`, metadata sha256 `698838f8833faf8372c6a505c35cb3d7638f13ab31118d8687d26aaf2c88b72c`); install to 19:09:34Z (no unit changed); activate to 19:09:39Z (probe `9fd1a9cf-58fe-4616-9938-90bf292c7d12`), all nine triggers resumed; `mw-chat-relay` restarted 19:09:39Z |
| Read-back | `/ready` true at R171 `89bb33d8` (started 19:09:36Z); recognizer (8790) and relay (8791) `/healthz` R171; catalogue 43 to 44; wake path and watcher timer enabled and active, summary timer 1 min, watcher 15 s |
| Poll (instagram.py changed) | 13 `conversation-poll` runs to 19:25:40Z, all COMPLETED; heartbeat COMPLETED, exit 0; 13 Instagram reads, none failed; collector `polling` health 1 |
| Verification | Every job run since the activation COMPLETED (poll 13, cash-statement email retry 4); no warning-level `mw-*` journal line (only the known `systemd-ssh-generator` lines); 0 groups waiting; collector run 19:25:07Z exported (`webhook_code_version` `89bb33d8`, `code_version_match` 1, `group_chat_summary` health 1) |
| First run with work | Not yet observed (all summary runs idle; none forced). At the first one, read `effect.retries`, `first_page` (including `failed`) and any `INSTAGRAM_*` code |

Rollback: `sudo python3 integration-agent/scripts/deploy-runtime.py rollback --commit e4762c9d23ad0432de77883c39ae843c0866711c` (may need the same temporary operator file), restart `mw-chat-relay`. Full release record, including the PWA: the [root R171 change note](../../Change%20Logs/CHANGE_NOTES_R171_GROUP_CHAT_RETRY_DESKTOP_SYNC_2026-11-17.md#prod-promotion-record-forge-17-november-2026-utc). Private evidence: `gs://mw-credit-operator-private-737787224638/promotion-packages/r171/` (`agent-*.json`).

Tag record: `R171` on `89bb33d8a8e789157490ba47f7a4bc548e9236ab`, created by Release tag run 44158890567 (success, 19:28Z), which also published the GitHub Release.

Component versions at this release (`component-versions.mjs derive --release R171 --commit R171`): the PWA frontend and the integration agent (revision 44) changed in R171; every other component keeps its earlier release (read, command, chat and schema R165; notify and jobs R159; Grafana dashboards R167; Metabase reports R144).

Drift after the tag: re-run by Dewey with public facts only (`node scripts/promotion/component-versions.mjs drift --env all`): drift 0, unverified 11 (every credentialed fact, as no observed file was supplied; the public PWA, read, command and chat builds match R171, R165, R165 and R165). Forge's pre-tag run with the credentialed facts gave drift 2 (the PROD PWA at R171 and the PROD agent at R171 against the last tags R165 and R170), which the tag clears; its unverified Grafana and Metabase are untouched by R171. The credentialed run was not repeated after the tag.

Not yet observed: `effect.retries`, `effect.first_page` and the `INSTAGRAM_*` codes on a run with work, and the hidden-window sync on the owner's real Windows Chrome. Carry-overs (not fixed in R171): receipts answer 409 `selection_changed` at 00:01 Bangkok; the `INSTAGRAM_*` words for the dashboard (the next dashboard batch); `conversation_poll_messages` has no `event_time` index and no pruning (an index needs an agent migration; a candidate for a later release); the loan-rollover e2e flake (wait for the saved draft instead of 700 ms); the notification-transport VAPID-key flake (regenerate until 32 bytes). Owner acceptance is pending.

Closure: the tag exists; the freeze pin, this record, the tag record and the prune are published in the R171 closure pull request. Pruned (outside the window of Open plus the three newest Released releases): the R168 change notes `Change Logs/CHANGE_NOTES_R168_GROUP_CHAT_LATENCY_2026-11-17.md` and `integration-agent/Change Logs/CHANGE_NOTES_GROUP_CHAT_LATENCY_2026-11-17.md`; their links now point to commit `89bb33d8`.
