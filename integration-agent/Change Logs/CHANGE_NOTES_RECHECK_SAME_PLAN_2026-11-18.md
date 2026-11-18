# Change notes — recheck of an unchanged plan gets a new review (R173), 18 November 2026

## Purpose
Owner request, 18 November 2026: "yes, go with option 1", then "push all the way to to prod, and requeue the request" and "and engage the team to work on it". This note covers the agent fix; the release record is the [root note](../../Change%20Logs/CHANGE_NOTES_R173_RECHECK_SAME_PLAN_2026-11-18.md). PROD promotion is approved.

## Changes
- Evidence (Forge, Grafana, 18 November 2026): the Receipts health panel was degraded from 09:06Z (`receipt_pipeline` status 2, `stalled_jobs` 1, every other count 0). One borrower sent two slips: 1,200 at 15:57:58 Bangkok, auto-posted at 15:58:16, and 500 at 15:59:05, which became a Pay-forward-options review (`7ac51e…`, request accepted at 15:59:29). The reviewer replied `recheck` at 16:04:03 (`RECHECK_QUEUED`, reconsideration row 16:04:09, RECHECK result notice 16:04:16). The re-plan gave the identical proposal, so `ReviewStore.reserve` derived the id of the review it had just superseded; the insert was ignored, the request notice was already accepted so nothing was sent, and job `0ad5ed87…` sat in `REVIEW_REQUESTED` with no review. The reviewer's reply at 16:07:09 was answered `ALREADY_DECIDED`. No payment was attempted and unconfirmed postings stay 0.
- Agent: `ReviewStore.reserve` in `partner_review.py` now takes the next generation's id (`ReviewStore.next_key`) when the id derived from the proposal belongs to another job's row, that is, to a review renamed `<job>:superseded:<id>`; a first review keeps its id and reserving again stays idempotent. The job therefore gets a new PENDING review and a new request notice. If the reserved row is not the job's, `reserve` raises `REVIEW_RESERVATION_FAILED` instead of returning a foreign review (the job would otherwise wait in `REVIEW_REQUESTED` with no review). The corrected-request text already exists, so no user-facing text changes. Catalogue revision 45, services unchanged; `R173_REVISIONS` = (44, 45) in `scripts/deploy-runtime.py`. No unit, setting, SQL, migration, collector or dashboard change.
- Recovery after deploy (Forge): run `receipt-reconsider` for job `0ad5ed87…`; the reviewers then get a corrected request. No payment, no financial write outside the normal approved path.
- Team: Archie and Echo not applicable (design settled; no user-facing text change). Byte checks, Chase review and Forge promotion: results below.
- Code and tests (Byte, not edited here): `integration-agent/src/mw_integration_agent/partner_review.py`, `tests/test_partner_review_options.py`, `tests/test_review_cycle.py`, `tests/test_postgres_state.py`, `service-catalogue.json`, `scripts/deploy-runtime.py`.
- Docs: `SERVICE_CATALOGUE.md`, `docs/PARTNER_REVIEW.md`, `README.md`.

## Checks
| Command | Result |
| --- | --- |
| Orchestrator (06fb556): affected modules | 269 OK |
| Orchestrator: full agent discover | One error: `test_receipt_qr` (`zxingcpp` missing locally, pre-existing) |
| Orchestrator: `ruff check` | Pass |
| Orchestrator: PostgreSQL lab (`tests/lab/setup.sh`, disposable cluster) | 78 OK, 13 skipped |
| Byte: checks | PENDING |
| Chase: review | PENDING |
| `npm run check:docs` | 0 failures, 0 warnings |
| The pull request's `Development checks` and integration-agent tests runs | PENDING: cited at closure |

## Not run
- The full Playwright and `mw-db-ci` suites: the pull request's CI is the one broad run.
- No DEV agent exists, so the agent fix is verified only in PROD after promotion.

## Recovery
Agent: `deploy-runtime.py rollback` to the R172 package (the commit is recorded in the Environment Inventory at promotion); no unit changed, so nothing is reinstalled. No SQL or data change to undo; the new review row and corrected request, if created, stay as ordinary records.

## Open questions
None. The owner approved promotion on 18 November 2026: "yes, go with option 1", then "push all the way to to prod, and requeue the request" and "and engage the team to work on it".

## Remaining work
Byte checks, Chase review, pull request CI, merge; PROD promotion (agent deploy at revision 45) and read-back; `receipt-reconsider` for the stuck job and confirmation that the reviewers received the corrected request and `stalled_jobs` returned to 0; tag; closure.
