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
| The pull request's `Development checks` and integration-agent tests runs | PENDING: cited at closure |

## Not run
- The full Playwright and `mw-db-ci` suites: the pull request's CI is the one broad run.
- No DEV agent exists, so the guess and its hit rate are verified only in PROD after promotion.

## Recovery
After deployment, per the agent change note: `deploy-runtime.py rollback --commit d7b467c039f70ee3c0253de972f3d1e4a585e75f` (the R169 package); no unit was changed, so nothing is reinstalled, and the guess keeps no state.

## Open questions
None. The owner approved promotion on 17 November 2026: "go with option 2. push all the way to prod".

## Remaining work
Pull request CI, merge; PROD promotion (Forge's agent deploy at revision 43; no unit install) and read-back of `effect.first_page` and the listing seconds after the next tap; tag; closure.
