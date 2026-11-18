# Change notes — R174 reconsider supersedes only an undecided review, 18 November 2026

## Purpose
Owner request, 18 November 2026, after the coordinator explained Chase's R173 finding: "yes, fix it now with the team and push to prod". Agent detail is in the [agent change note](../integration-agent/Change%20Logs/CHANGE_NOTES_RECONSIDER_STATE_GUARD_2026-11-18.md). PROD promotion is approved.

## Changes
- Evidence (Chase, R173 review, low): `receipt_reconsider.requeue`, shared by `receipt-reconsider` and the poll's held-slip recheck (`receipt_recheck.recheck_held`), checked the review's state before its transaction but superseded it with `WHERE id=?` only. This was unreachable in PROD because every writer holds `receipt-worker.lock`, but since R173 a superseded approved or posting review would let `ReviewStore.reserve` create a new review generation with a new payment request id.
- Agent: `requeue` now guards its own writes inside the transaction. (1) The review is superseded only while it still belongs to the job and is PENDING, STALE or EXPIRED (exactly one row), otherwise `DECIDED_REVIEW_CANNOT_BE_REOPENED`. (2) The job moves only from the status that was read and only if one shared `eligible(job)` check, also used by `run`, accepts it, otherwise `RECONSIDERATION_NOT_ELIGIBLE`. Either error rolls the whole transaction back: no `receipt_reconsiderations` row, no review change, no job change. (3) `recheck_held` counts either error as `held_skipped` and continues with the other jobs; any other error still raises. Catalogue revision 46, services unchanged; `R174_REVISIONS` = (45, 46) in `scripts/deploy-runtime.py`. No unit, setting, secret, SQL, migration, message text, collector or dashboard change.
- Team: Archie and Echo not applicable (no design or user-facing text change; Echo's Instagram message review is for R175). Byte's checks, Chase's review, pull request CI and Forge's promotion: results below.
- Code and tests (Byte, commit `8c1e6e50`, not edited here): `integration-agent/src/mw_integration_agent/receipt_reconsider.py`, `receipt_recheck.py`, `tests/test_receipt_reconsider.py`, `tests/test_receipt_recheck.py`, `tests/test_postgres_state.py`, `service-catalogue.json`, `scripts/deploy-runtime.py`.
- Docs: `integration-agent/SERVICE_CATALOGUE.md`, `integration-agent/docs/PARTNER_REVIEW.md`, `integration-agent/docs/CONVERSATION_POLL.md`, `integration-agent/README.md`, `project/Documents/Release_Tracker.md` and `project/Documents/Development_Changes.md`.

## Checks
| Command | Result |
| --- | --- |
| Byte (`8c1e6e50`): `ruff check` | Pass |
| Byte: 502 focused tests | OK (37 lab skips) |
| Byte: the new tests against the old `requeue` | Fail as intended (6 failures, 6 errors) |
| Byte: PostgreSQL lab | 79 OK, 13 skipped |
| Chase: adversarial review, R173 recovery reproduction and a SQLite rollback probe (scratch scripts) at `8c1e6e50` | Pass, no blocking findings. Recovery: `receipt-reconsider` on the R173 stuck shape still queues, and one cycle gives one new PENDING review and a corrected request, `stalled_jobs` 0, no payment. Rollback: an APPROVED review (with and without `fresh_extraction`) raises `DECIDED_REVIEW_CANNOT_BE_REOPENED` and a job moved to POSTED raises `RECONSIDERATION_NOT_ELIGIBLE`, each leaving job, review and `receipt_reconsiderations` unchanged; the happy path is unchanged. The poll's held pass still releases the worker lock and writes its snapshot when a job is skipped. PostgreSQL rollback read in `state.py` (psycopg transaction) and covered by Byte's lab case. No message text changed |
| `npm run check:docs` | 0 failures, 0 warnings |
| The pull request's `Development checks` and integration-agent tests runs | PENDING: cited at closure |

## Not run
- The full Playwright and `mw-db-ci` suites: the pull request's CI is the one broad run.
- No DEV agent exists, so the fix is verified in PROD only after promotion. The guard is unreachable in PROD today (every writer holds `receipt-worker.lock`), so the read-back checks revision, health and a clean cycle, not a forced rejection.

## Recovery
Agent: `deploy-runtime.py rollback --commit 9b111eb9d03537d52189523d7b41ad4465a0aa73` (the R173 package), then restart `mw-chat-relay`; no unit changed, so nothing is reinstalled. No SQL or data change to undo.

## Open questions
None. The owner approved promotion on 18 November 2026: "yes, fix it now with the team and push to prod".

## Remaining work
Chase's review, pull request CI, merge; PROD promotion (agent deploy at revision 46) and read-back; tag; closure.
