# Change notes — R173 recheck of an unchanged plan gets a new review, 18 November 2026

## Purpose
Owner request, 18 November 2026: after the stuck receipt was reported, "yes, go with option 1", then "push all the way to to prod, and requeue the request" and "and engage the team to work on it". Agent detail is in the [agent change note](../integration-agent/Change%20Logs/CHANGE_NOTES_RECHECK_SAME_PLAN_2026-11-18.md). PROD promotion is approved.

## Changes
- Evidence (Forge, Grafana, 18 November 2026): the Receipts health panel was degraded from 09:06Z (`receipt_pipeline` status 2, `stalled_jobs` 1, every other count 0). One borrower sent two slips: 1,200 at 15:57:58 Bangkok, auto-posted at 15:58:16, and 500 at 15:59:05, which became a Pay-forward-options review (`7ac51e…`, request accepted at 15:59:29). The reviewer replied `recheck` at 16:04:03 (`RECHECK_QUEUED`, reconsideration row 16:04:09, RECHECK result notice 16:04:16). The re-plan gave the identical proposal, so `ReviewStore.reserve` derived the id of the review it had just superseded; the insert was ignored, the request notice was already accepted so nothing was sent, and job `0ad5ed87…` sat in `REVIEW_REQUESTED` with no review. The reviewer's reply at 16:07:09 was answered `ALREADY_DECIDED`. No payment was attempted and unconfirmed postings stay 0.
- Agent: `ReviewStore.reserve` in `partner_review.py` now takes the next generation's id (`ReviewStore.next_key`) when the id derived from the proposal belongs to another job's row, that is, to a review renamed `<job>:superseded:<id>`; a first review keeps its id and reserving again stays idempotent. The job therefore gets a new PENDING review and a new request notice. If the reserved row is not the job's, `reserve` raises `REVIEW_RESERVATION_FAILED` instead of returning a foreign review (the job would otherwise wait in `REVIEW_REQUESTED` with no review). The corrected-request text already exists, so no user-facing text changes. Catalogue revision 45, services unchanged; `R173_REVISIONS` = (44, 45) in `scripts/deploy-runtime.py`. No unit, setting, SQL, migration, collector or dashboard change.
- Recovery after deploy (Forge): run `receipt-reconsider` for job `0ad5ed87…`; the reviewers then get a corrected request. No payment, no financial write outside the normal approved path.
- Team: Archie and Echo not applicable (design settled; no user-facing text change). Byte checks, Chase review and Forge promotion: results below.
- Code and tests (Byte, not edited here): `integration-agent/src/mw_integration_agent/partner_review.py`, `tests/test_partner_review_options.py`, `tests/test_review_cycle.py`, `tests/test_postgres_state.py`, `service-catalogue.json`, `scripts/deploy-runtime.py`.
- Docs: `integration-agent/SERVICE_CATALOGUE.md`, `integration-agent/docs/PARTNER_REVIEW.md`, `integration-agent/README.md`, `project/Documents/Release_Tracker.md` and `project/Documents/Development_Changes.md`.

## Checks
| Command | Result |
| --- | --- |
| Orchestrator (06fb556): affected modules | 269 OK |
| Orchestrator: full agent discover | One error: `test_receipt_qr` (`zxingcpp` missing locally, pre-existing) |
| Orchestrator: `ruff check` | Pass |
| Orchestrator: PostgreSQL lab (`tests/lab/setup.sh`, disposable cluster) | 78 OK, 13 skipped |
| Byte: `ruff check --no-cache .` and eight focused modules (`test_partner_review_options test_review_cycle test_receipt_health test_deploy_runtime test_config test_receipt_recognition test_group_chat_summary test_receipt_reconsider`) in `integration-agent/`, clean tree at `06fb556` | Pass: ruff clean; 388 run, OK. Review: no change needed; `REVIEW_RESERVATION_FAILED` is a cycle failure (the job stays VALIDATED and is retried), never a job waiting with no review |
| Chase: adversarial review and recovery reproduction (scratch script on the `test_review_cycle` harness: PROD shape, then the real `receipt_reconsider.run`, then one cycle) at `06fb556` | Pass, no blocking findings. Fixed code: one new PENDING review, one `review:<new id>` request starting with the corrected-request line, `stalled_jobs` 0, no payment submitted; pre-fix code: still stuck. Supersede happens only from PENDING, STALE or EXPIRED, so a new generation never bypasses an approved or posted review; request ids derive from the new review id only when the earlier one never posted. Low, pre-existing, not in R173: `receipt_reconsider.requeue` supersedes without a state guard inside its transaction (protected today by the worker lock). After `receipt-reconsider` on the stuck job, `prior_review_superseded` reads false (expected) |
| `npm run check:docs` | 0 failures, 0 warnings |
| `Development checks` run 44277161545 and integration-agent tests run 44277161507 on the tested head `b22813f` (PR #358) | Success; merged as `9b111eb9`, tree identical |
| PROD promotion and read-back | Pass: see the PROD promotion record |
| Release tag | `R173` on `9b111eb9` (Release tag run 44278709425) |

## Not run
- The full Playwright and `mw-db-ci` suites: the pull request's CI is the one broad run.
- No DEV agent exists, so the agent fix was verified only in PROD after promotion.

## Recovery
Agent: `deploy-runtime.py rollback --commit 89bb33d8a8e789157490ba47f7a4bc548e9236ab` (the R171 package; R172 did not change the agent), then restart `mw-chat-relay`; no unit changed, so nothing is reinstalled. No SQL or data change to undo; the new review and corrected request stay as ordinary records.

## Open questions
None. The owner approved promotion on 18 November 2026: "yes, go with option 1", then "push all the way to to prod, and requeue the request" and "and engage the team to work on it".

## Remaining work
Owner acceptance; the reviewer's decision on the new review. Everything else (pull request CI, merge, promotion, read-back, requeue, tag, closure) is done. Low follow-up (Chase, not in R173): `receipt_reconsider.requeue` supersedes without a state guard inside its transaction.

## PROD promotion record (Forge, 18 November 2026 UTC)
Authority: owner, 18 November 2026, "push all the way to prod, and requeue the request". Package `main` `9b111eb9d03537d52189523d7b41ad4465a0aa73` (merge of PR #358; tree identical to the tested head `b22813f`; `Development checks` run 44277161545 and agent tests run 44277161507, both success). Baseline R171 package `89bb33d8` (R172 did not change the agent), catalogue 44. Target `vm-mw-credit-agent` (project `clever-oasis-508610-n7`, `asia-southeast1-a`), state `mw_agent` on `mw-credit-pg-20261017`. Agent only: no SQL, agent migration, unit, setting, secret, Cloud Run, Hosting, Terraform, IAM, Grafana or collector change.

| Step | Result |
| --- | --- |
| Baseline (09:35:30Z) | `/ready` true at R171 `89bb33d8`, catalogue 44; recognizer and relay `/healthz` ok; all timers and both paths active |
| Update | `update-from-github` `89bb33d8` to `9b111eb9`, 09:38:24Z to 09:38:28Z, clean. A temporary root-only operator file (postgres through the 5432 proxy, password from Secret Manager on stdin, never printed) was created 09:38:38Z and shredded 09:39:32Z |
| Dry run (09:38:45Z) | Only `partner_review.py` differs, no unit change, ancestry ancestor, agent schema V13 applied, nine triggers paused |
| Freeze, install, activate | Freeze `--release R173` 09:38:54.34Z to 09:38:55.33Z, backup `runtime-20261118T093854520663Z` (metadata sha256 `577ff004a0867b8b5407754cacd89a3cbf547cd514ca6f53cf97e8cb39075b48`); install to 09:39:07Z (no unit changed); activate to 09:39:20Z, probe `a3886b9b-8d94-410b-be2e-9aeda3fbd622`, all nine triggers resumed; `mw-chat-relay` restarted 09:39:20Z |
| Read-back (09:39:32Z) | `/ready` true at R173 `9b111eb9` (started 09:39:17.94Z); recognizer and relay `/healthz` R173; catalogue 45; 12 timers, both paths, webhook, recognizer and relay active; job runs to 09:40:58Z all COMPLETED. Collector 09:42:07Z: `webhook_code_version` `9b111eb9`, `code_version_match` 1, `health.receipts` 1 (2 at 09:40:01Z), `receipt_pipeline` `stalled_jobs` 0, status 1, `pending_reviews` 1 |
| Requeue | `receipt-reconsider` of job `0ad5ed87…` as `mwagent` at 09:39:43.7Z: `RECONSIDERATION_QUEUED`, `prior_review_superseded` false (expected), reconsideration row 29. The next normal cycle created review `f2bc7b8d…` PENDING at 09:40:08.95Z (expires 2026-11-19 09:40:08Z); request notice ACCEPTED 09:40:15.89Z, body starting "Corrected request — replaces the earlier request"; no APPROVED, POSTING or POSTED state and no payment. Re-verified read-only by the orchestrator |

Rollback: `deploy-runtime.py rollback --commit 89bb33d8a8e789157490ba47f7a4bc548e9236ab`, then restart `mw-chat-relay`; the new review would stay PENDING. Private evidence: `gs://mw-credit-operator-private-737787224638/promotion-packages/r173/` (agent-freeze, -install, -activate, -reconsider and -post-dry JSON; not in Git).

Tag record: `R173` on `9b111eb9d03537d52189523d7b41ad4465a0aa73`, created by Release tag run 44278709425 (which publishes the GitHub Release).

Component versions at this release (`component-versions.mjs render --write`): the integration agent changed in R173 (revision 45); every other component keeps its earlier release (PWA frontend and Grafana dashboards R172; read, command, chat and schema R165; notify and jobs R159; Metabase reports R144).

Drift after the tag (public facts only, `node scripts/promotion/component-versions.mjs drift --env all`): drift 0, unverified 11 (every credentialed fact, as no observed file was supplied). Forge's collector read at 09:42:07Z matched the agent at `9b111eb9`.

Not yet observed: the reviewer's decision on review `f2bc7b8d…`. Owner acceptance is pending.

Closure: the tag exists; the freeze pin, this record, the tag record and the prune are published in the R173 closure pull request. Pruned (outside the window of Open plus the three newest Released releases, R173, R172 and R171): the R170 change notes `Change Logs/CHANGE_NOTES_R170_GROUP_CHAT_FIRST_PAGE_2026-11-17.md` and `integration-agent/Change Logs/CHANGE_NOTES_GROUP_CHAT_FIRST_PAGE_2026-11-17.md` (their links now point to commit `9b111eb9`).
