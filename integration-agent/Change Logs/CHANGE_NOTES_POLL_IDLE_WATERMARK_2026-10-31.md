# Change notes — conversation poll keeps an idle group's watermark, 31 October 2026

## Purpose
Owner request of 31 October 2026 ("review the cloud sql db size … is the size still keep growing?", then "Go ahead"): stop the conversation poll from writing about 29,000 audit operations a day into `mw_agent` when nothing new arrived.

## Changes
- Readback (read-only, `codex-cloud-read` through `scripts/database/cloud-db-tunnel.sh`, 31 October 2026 16:17Z, instance `mw-credit-pg-20261017`): `mw_agent` 539 MB (435 MB after the 17 October rewrite), `loan_manager_prod` 21 MB, `loan_manager_dev` 22 MB; instance data 573 MB on 18 October to 643 MB. The 7-day audit retention ran every night from 16 to 30 October (17 `audit-retention` CONFIG operations, `VACUUM (ANALYZE)` each time). About 30,000 operations a day are written since 21 October; 29,094 of the last 24 hours were `journal PROCESS` rows for `INSERT OR REPLACE INTO conversation_poll_state`, about 24 per `conversation-poll` run at the one-minute cadence from R082. Each such write also made every poll run effectful, so no run was an idle heartbeat.
- `src/mw_integration_agent/conversation_poll.py` `capture_conversation`: the watermark is written only when the run captured a new message, on the group's first check, or when the found window fills the first 20-message page (after a same-day backfill). Everything newer than a kept watermark was captured by the run that wrote it, so the re-read window stays within the first page; message IDs dedupe the overlap as before.
- `tests/test_conversation_poll.py`: idle rescans (60 s, 1 h, 1 day) write no watermark and a later message is still captured once; an empty group records its watermark once; a full first page of already captured messages advances it.
- Docs: `docs/CONVERSATION_POLL.md` (watermark rule), `docs/POSTGRESQL_OPERATIONS.md` (readback and expected effect under the heartbeat section).

## Checks
| Command | Result |
| --- | --- |
| `PYTHONPATH=src python3 -m unittest tests.test_conversation_poll` (in `integration-agent/`) | 30 OK; the two new idle tests fail on the previous code |
| `PYTHONPATH=src python3 -m unittest discover -s tests` | 570 run; 22 errors (database-driver imports, no locked venv in the cloud session) and the `test_server` startup failure, the same as on `HEAD` without the change; CI runs the full suite |
| `ruff check --no-cache` on the two changed files | Clean |

## Not run
- The PostgreSQL lab suites (no locked venv in the cloud session): the change only skips one journal statement, no SQL or translation changed; CI's Agent tests cover them.

## Recovery
Revert the commit and redeploy the previous package with `deploy-runtime.py rollback`. No schema, configuration or data change; existing watermarks stay valid for either version.

## Open questions
None.

## Remaining work
- Deploy the merged commit to `vm-mw-credit-agent` and record it here and in the environment inventory.
- After a week, confirm the daily `audit-retention` deletions and `mw_agent` live rows fell to roughly a tenth.
