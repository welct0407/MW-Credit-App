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
| The pull request's `Development checks` and integration-agent tests runs | PENDING: cited at closure |

## Not run
- The full Playwright and `mw-db-ci` suites: the pull request's CI is the one broad run.
- No DEV agent exists, so the agent half is verified only in PROD after promotion.

## Recovery
Agent: `deploy-runtime.py rollback --commit e4762c9d23ad0432de77883c39ae843c0866711c` (the R170 package); no unit changed, so nothing is reinstalled. PWA: redeploy the previous Hosting version (recorded in the Environment Inventory at promotion). No SQL or data change to undo.

## Open questions
None. The owner approved promotion on 17 November 2026: "go ahead with R171, push all the way to prod" and confirmed the PWA part in the same session ("add to R171, promote all").

## Remaining work
Pull request CI, merge; PROD promotion (agent deploy at revision 44, PWA Hosting DEV first then PROD with `MW_RELEASE_NUMBER=R171`) and read-back; tag; closure. Carried over: the `INSTAGRAM_*` dashboard words, and receipts answering 409 `selection_changed` at 00:01 Bangkok.
