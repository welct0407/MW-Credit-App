# Change notes — R174 reconsider supersedes only an undecided review, 18 November 2026

## Purpose
Owner request, 18 November 2026, after the coordinator explained Chase's R173 finding: "yes, fix it now with the team and push to prod". Second owner request in the same release, 18 November 2026: "also allow response "No" as equivalent to "Reject"". Agent detail is in the [agent change note](../integration-agent/Change%20Logs/CHANGE_NOTES_RECONSIDER_STATE_GUARD_2026-11-18.md). PROD promotion is approved.

## Changes
- Evidence (Chase, R173 review, low): `receipt_reconsider.requeue`, shared by `receipt-reconsider` and the poll's held-slip recheck (`receipt_recheck.recheck_held`), checked the review's state before its transaction but superseded it with `WHERE id=?` only. This was unreachable in PROD because every writer holds `receipt-worker.lock`, but since R173 a superseded approved or posting review would let `ReviewStore.reserve` create a new review generation with a new payment request id.
- Agent: `requeue` now guards its own writes inside the transaction. (1) The review is superseded only while it still belongs to the job and is PENDING, STALE or EXPIRED (exactly one row), otherwise `DECIDED_REVIEW_CANNOT_BE_REOPENED`. (2) The job moves only from the status that was read and only if one shared `eligible(job)` check, also used by `run`, accepts it, otherwise `RECONSIDERATION_NOT_ELIGIBLE`. Either error rolls the whole transaction back: no `receipt_reconsiderations` row, no review change, no job change. (3) `recheck_held` counts either error as `held_skipped` and continues with the other jobs; any other error still raises. Catalogue revision 46, services unchanged; `R174_REVISIONS` = (45, 46) in `scripts/deploy-runtime.py`. No unit, setting, secret, SQL, migration, message text, collector or dashboard change.
- Agent (second part, Byte's commit `5cc3b5e3`): `partner_review.REJECT` gains `no`, so on a Pay-forward options request the exact word "No" (any case, surrounding space ignored) rejects like "Reject"; "No thanks" and any other text still re-asks (`OPTIONS_REQUIRED`). Hold replies already accepted "no" and the plain approval request already rejects any non-approval reply, so only the options request changes. No Thai word is added and no message text changes (the request still says "Reject to drop."; the wording is R175). No catalogue bump: still revision 46. Code and tests: `partner_review.py`, `tests/test_partner_review_options.py` (`test_r174_no_is_reject`).
- Team: Archie and Echo not applicable (no design or user-facing text change; Echo's Instagram message review is for R175). Byte's checks, Chase's review, pull request CI and Forge's promotion: results below.
- Code and tests (Byte, commit `8c1e6e50`, not edited here): `integration-agent/src/mw_integration_agent/receipt_reconsider.py`, `receipt_recheck.py`, `partner_review.py` (`5cc3b5e3`), `tests/test_receipt_reconsider.py`, `tests/test_receipt_recheck.py`, `tests/test_postgres_state.py`, `service-catalogue.json`, `scripts/deploy-runtime.py`.
- Docs: `integration-agent/SERVICE_CATALOGUE.md`, `integration-agent/docs/PARTNER_REVIEW.md`, `integration-agent/docs/CONVERSATION_POLL.md`, `integration-agent/README.md`, `project/Documents/Release_Tracker.md` and `project/Documents/Development_Changes.md`.

## Checks
| Command | Result |
| --- | --- |
| Byte (`8c1e6e50`): `ruff check` | Pass |
| Byte: 502 focused tests | OK (37 lab skips) |
| Byte: the new tests against the old `requeue` | Fail as intended (6 failures, 6 errors) |
| Byte: PostgreSQL lab | 79 OK, 13 skipped |
| Chase: adversarial review, R173 recovery reproduction and a SQLite rollback probe (scratch scripts) at `8c1e6e50` | Pass, no blocking findings. Recovery: `receipt-reconsider` on the R173 stuck shape still queues, and one cycle gives one new PENDING review and a corrected request, `stalled_jobs` 0, no payment. Rollback: an APPROVED review (with and without `fresh_extraction`) raises `DECIDED_REVIEW_CANNOT_BE_REOPENED` and a job moved to POSTED raises `RECONSIDERATION_NOT_ELIGIBLE`, each leaving job, review and `receipt_reconsiderations` unchanged; the happy path is unchanged. The poll's held pass still releases the worker lock and writes its snapshot when a job is skipped. PostgreSQL rollback read in `state.py` (psycopg transaction) and covered by Byte's lab case. No message text changed |
| Chase: read-only adversarial review of `5cc3b5e3` (No as Reject) | Pass, no findings. `partner_review.REJECT` is read only by the options branch of `decide`; "no" is not a recheck word, not a numbered choice and not an approval; "Not" and "No thanks" still re-ask; plain approval requests and the `Review` command classification (`hold_reply.REJECT`) are unchanged; a rejected options review gets the existing ❌ result notice and no payment. Informational: "No" is final, like "Reject" |
| `npm run check:docs` | 0 failures, 0 warnings |
| `Development checks` run 44307353371 and integration-agent tests run 44307353318 on the tested head `2c75d1a5` (PR #360) | Success; merged as `a2d43604`, tree identical |
| PROD promotion and read-back | Pass: see the PROD promotion record |
| Release tag | `R174` on `a2d43604` (Release tag run 44308591082) |

## Not run
- The full Playwright and `mw-db-ci` suites: the pull request's CI is the one broad run.
- No DEV agent exists, so the fix was verified in PROD only after promotion. The guard is unreachable in PROD today (every writer holds `receipt-worker.lock`), so the read-back checked revision, health and a clean cycle, not a forced rejection; neither the guard nor "No" was exercised in PROD.

## Recovery
Agent: `deploy-runtime.py rollback --commit 9b111eb9d03537d52189523d7b41ad4465a0aa73` (the R173 package), then restart `mw-chat-relay`; no unit changed, so nothing is reinstalled. No SQL or data change to undo.

## Open questions
None. The owner approved promotion on 18 November 2026: "yes, fix it now with the team and push to prod", and asked for "No" as Reject in the same release.

## Remaining work
Owner acceptance. Everything else (pull request CI, merge, promotion, read-back, tag, closure) is done. R175 (message wording and reply handling) is opened in the closure pull request.

## PROD promotion record (Forge, 18 November 2026 UTC)
Authority: owner, 18 November 2026, "yes, fix it now with the team and push to prod". Package `main` `a2d436049bd0e1989f63437e47211d65c7880d00` (merge of PR #360; tree identical to the tested head `2c75d1a5`; `Development checks` run 44307353371 and agent tests run 44307353318, both success). Baseline and rollback target R173 `9b111eb9`, catalogue 45. Target `vm-mw-credit-agent`, state `mw_agent` on `mw-credit-pg-20261017`. Agent only: no SQL, agent migration, unit, setting, secret, Cloud Run, Hosting, Terraform, IAM, Grafana or collector change.

| Step | Result |
| --- | --- |
| Baseline (12:51:41Z) | `/ready` true at R173 `9b111eb9`, catalogue 45; recognizer and relay ok; 12 timers and 2 paths active |
| Update | `update-from-github` `9b111eb9` to `a2d43604` done 12:51:46Z, clean. A temporary root-only operator file (postgres through the 5432 proxy, password from Secret Manager on stdin, never printed) existed 12:51:58Z to 12:52:39Z and was shredded |
| Dry run (12:52:02Z) | Only `partner_review.py`, `receipt_recheck.py` and `receipt_reconsider.py` differ; no unit change; ancestry ancestor; schema V13 applied; nine triggers paused |
| Freeze, install, activate | Freeze `--release R174` 12:52:14.479Z to 12:52:19.716Z, backup `runtime-20261118T125214678298Z` (metadata sha256 `548eda4554133f391f6883799fee284d5cff1aaa99d2a1998eecc15d88203121`); install to 12:52:24.060Z (no unit changed); activate to 12:52:28.161Z, probe `b41f4559-2301-493a-b22c-7c55e872249f`, nine triggers resumed; `mw-chat-relay` restarted 12:52:28.278Z |
| Read-back | `/ready` true at R174 `a2d43604` (started 12:52:25.80Z), catalogue 46; recognizer and relay `/healthz` R174; all units active; job runs to 12:54:40Z COMPLETED; no warning journal lines. Collector 12:52:32Z fell inside the restart window (receipts 0, polling 0, expected); at 12:54:39Z `webhook_code_version` `a2d43604`, `code_version_match` 1, all health 1, `receipt_pipeline` status 1, `stalled_jobs` 0, `pending_reviews` 0 |

Not exercised in PROD (needs a reviewer action): the guard and "No" as Reject. Rollback: `deploy-runtime.py rollback --commit 9b111eb9d03537d52189523d7b41ad4465a0aa73`, then restart `mw-chat-relay`. Private evidence: `gs://mw-credit-operator-private-737787224638/promotion-packages/r174/` (agent-dry.json, agent-deploy.log, agent-readback.json; not in Git).

Tag record: `R174` on `a2d436049bd0e1989f63437e47211d65c7880d00`, created by Release tag run 44308591082 (which publishes the GitHub Release).

Component versions at this release (`component-versions.mjs render --write`): the integration agent changed in R174 (revision 46); every other component keeps its earlier release (PWA frontend and Grafana dashboards R172; read, command, chat and schema R165; notify and jobs R159; Metabase reports R144).

Drift after the tag (public facts only, `node scripts/promotion/component-versions.mjs drift --env all`): drift 0, unverified 11 (every credentialed fact, as no observed file was supplied). Forge's collector read at 12:54:39Z matched the agent at `a2d43604`.

Closure: the tag exists; the freeze pin, this record, the tag record and the prune are published in the R174 closure pull request. Pruned (outside the window of Open plus the three newest Released releases, R174, R173 and R172): the R171 change notes `Change Logs/CHANGE_NOTES_R171_GROUP_CHAT_RETRY_DESKTOP_SYNC_2026-11-17.md` and `integration-agent/Change Logs/CHANGE_NOTES_GROUP_CHAT_RETRY_2026-11-17.md` (their links now point to commit `a2d43604`).
