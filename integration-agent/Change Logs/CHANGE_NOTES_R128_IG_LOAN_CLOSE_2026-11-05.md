# Change notes — R128 agent loan close through Instagram, 5 November 2026

## Purpose
Owner instruction, 5 November 2026: "If payment could close the loan, give me the option to respond to close the loan through ig. I want to avoid manual work … Engage team … Move to dev, test and promote to prod". A slip that exactly matches today's loan payoff ended `MANUAL_REQUIRED` (`LOAN_CLOSE_REQUIRED`). The agent can now close the loan after the reviewer approves. This is the agent half of release R128; the SQL (V136), command routes and PWA are in the [root change note](../../Change%20Logs/CHANGE_NOTES_R128_IG_LOAN_CLOSE_AND_CLOSE_SCAN_2026-11-05.md).

## Changes
- **Switch.** `config.py`: `loan_close_execution_enabled` (boolean, default false, absent means off; true needs `partner_review_execution_enabled` and `receipt_payment_api_enabled`, otherwise the configuration is refused; `mw-integration-agent check` reports it as `loan_close_execution`; `config.example.json` carries it off). Off, a payoff slip behaves as before.
- **Request (Echo AG-13 to AG-23).** With the switch on and the slip an exact match for today's payoff, the reviewer DM reads "Loan close approval requested" and states the closing amount's parts and the referral rebate path (offset, previous path or expense). The usual approval words (Yes, Approve, Approved, อนุมัติ) close the loan. The proposal is made only when the server quote (`GET /internal/agent/loan-closes/quote/{loanId}`: version, business day, amount, plan hash, rebate) equals the slip amount today; a slip without a bank reference or transfer time gets the manual close request. Echo passed AG-13 to AG-23 by reading the DM texts in code. AG-17 (transfer-from-account) is deferred: there is no data for it without a server change; the AG-19 "paid through" date is skipped (optional).
- **Approval and posting.** An approved review re-reads `GET /internal/agent/loan-closes/quote/{loanId}`; if the plan hash, version, rebate path or rebate amount changed since the request, or the re-quote answers 404 or 422, the review ends `STALE` (`LOAN_CLOSE_QUOTE_CHANGED`) and nothing is posted; a transport fault retries, and a 401 or 403 is NotSent and retried after 15 minutes like receipt payments. The day must still be the slip's. Otherwise the agent posts a contract-2 `loan.close` with `POST /internal/agent/loan-closes`, carrying the slip's bank reference and transfer time (V136), and reads the result with `GET /internal/agent/loan-closes/{requestId}`. The `requestId` is derived from `['mw-credit-agent-loan-close-v1', env, reviewId]`, so a retry is idempotent; an unknown outcome is reconciled by status only and never re-sent. The server validates through `pwa_submit_operation_v2` and `pwa_apply_loan_close_v2`.
- **Failure lines (Echo AG-20a, AG-20b).** The close-failure line is used only for the change, day-passed and rejected reasons. A neutral line is used for the switch off and for the new STALE detail `LOAN_CLOSE_QUOTE_UNAVAILABLE`, which a quote 404 now gives (a 422 stays `LOAN_CLOSE_QUOTE_CHANGED`). With the switch off after an approval the review stays `MANUAL_REQUIRED`.
- **Result.** The posted DM says "Loan closed" and splits the rebate into its offset and pay-out parts.
- **Before the deploy.** A request sent before the agent update stays manual: approving it records `MANUAL_REQUIRED` as before.
- **Readback.** The agent's readback now counts Late Charge Paid for all payments, which fixes a latent R118 gap (a paid late charge was not counted).
- **Deferred.** The pay-forward note "Remainder settles … record in the app" stays manual (a different write path).
- **Catalogue revision 36.** `partner_receipt_review` gains the new switch; no service is added or removed. `scripts/deploy-runtime.py` accepts the live revision 35 to candidate 36 change only when services and switches are unchanged, and keeps the live switch value. Files: `review_proposal.py`, `review_cycle.py`, `review_execution.py`, `receipt_api.py`, `partner_review.py`, `config.py`, `cli.py`, `config.example.json`, `service-catalogue.json`; tests `tests/test_review_close.py` (new), `test_config.py`, `test_deploy_runtime.py`, `test_receipt_recognition.py`.
- Docs: `docs/PARTNER_REVIEW.md`, `docs/OPERATIONS.md`, `docs/RECEIPTS.md`, Solution Design, the Data Dictionary agent API definition, Release Tracker and Development Changes.

## Checks
| Command | Result |
| --- | --- |
| `PYTHONPATH=src python3 -m unittest discover -s tests` and `ruff` in `integration-agent/` (Byte, uncommitted tree on `3b8ee37`) | 787 pass, 70 skipped; ruff pass |
| `Test-AgentLoanClose.sql` and `Test-StatementBatch.sql` on a disposable V136 cluster (Byte) | Pass |
| Byte fix batch after Chase and Echo (`partner_review.py`, `receipt_api.py`, `review_proposal.py`, `review_cycle.py`, `test_review_close.py`) | 789 OK, ruff clean |
| Chase verification on `4d513ad`: cross-language request id (Python and Node equal; applied, then replay, then status recorded; Bank Reference and Created At written); real `readLoanCloseQuote` (planHash and sourceVersion equal `loan_close_calculation_v83`; closed loan 422, unknown loan 404); 4 parallel resubmits returned `applied` as replays, a different payload conflict, one payment only; agent 787 OK, 70 skipped | PASS (before the fix batch) |
| Echo DM texts read in code, AG-13..23 | Pass after AG-20a and AG-20b |
| Agent CI `test` and `lab` (Agent tests run 41987096724, PR #249 head `832d908`) | Pass |
| `npm run check:docs` (Dewey) | Pass, 0 failures |

## Not run
Live Instagram: there is no DEV agent, so the first real loan close in PROD is the acceptance. Also not run: a real-PostgreSQL proof of a referral-rebate close through the agent actor (mocks only; the SQL path is the same as the PWA's). The pull request CI covers the wide suites. A skipped check is not a pass.

## Recovery
Set `loan_close_execution_enabled` to false (configuration only, no restart of other services; `sudo python3 integration-agent/scripts/config-only-change.py restore --tag r128-loan-close` restores `/root/config.json.pre-r128-loan-close`) and a payoff slip is manual again. For the code: revert the commit of the R128 pull request (baseline R127 `5f3bcaf`, agent code `ebc1e3e8`); on the VM `deploy-runtime.py rollback --commit <deployed>` restores the previous runtime from the freeze directory. A loan already closed is not undone by either step; use the Loan Close correction path in the app.

## Open questions
None.

## Remaining work
- Owner acceptance in PROD: the first real "Loan close approval requested" exchange.
- The pay-forward "Remainder settles" note stays manual (deferred).

## DEV promotion record (Forge, 5 November 2026, UTC)
There is no DEV agent (the VM serves PROD slips only), so no agent code was deployed for DEV. Evidence before PROD: Byte's unit tests (789 OK), Chase's review (PASS on `4d513ad`) and the agent CI `test` and `lab` (Agent tests run 41987096724 on PR #249 head `832d908`, green). The command service side the agent calls (`/internal/agent/loan-closes`, its status and `/internal/agent/loan-closes/quote/…`) is on DEV in image `720d7cb6…` with V136; on DEV the agent API is off by design, so those routes answer 404 to every caller, which the DEV smoke confirmed. See the [application DEV promotion record](../../Change%20Logs/CHANGE_NOTES_R128_IG_LOAN_CLOSE_AND_CLOSE_SCAN_2026-11-05.md#dev-promotion-record-forge-5-november-2026-utc).

## PROD promotion record (Forge, 5 November 2026, UTC)
Authority: the owner's instruction "Move to dev, test and promote to prod" (5 November 2026), including the agent code and `loan_close_execution_enabled` on. Target: project `clever-oasis-508610-n7`, `vm-mw-credit-agent` (`asia-southeast1-a`). Run after V136, the command image and Hosting were live in PROD (see the [application PROD promotion record](../../Change%20Logs/CHANGE_NOTES_R128_IG_LOAN_CLOSE_AND_CLOSE_SCAN_2026-11-05.md#prod-promotion-record-forge-5-november-2026-utc)). No forced DM, payment or test close. No secret value or borrower data appears here.

| Step | Result |
| --- | --- |
| Package | `aaad6a87ea04eb6545036177e9ac1cb5de403a9e` (merge of PR #249, tree equal to `832d908`; Agent tests run 41987096724 green) |
| Baseline | Checkout and live `code_version` `ebc1e3e8` (R127); catalogue revision 35; `loan_close_execution_enabled` absent (off); `partner_review_execution_enabled` and `receipt_payment_api_enabled` true |
| Checkout and dry run | `update-from-github.sh` fast-forward to `aaad6a8`, clean; dry run: 7 changed modules (`cli.py`, `config.py`, `partner_review.py`, `receipt_api.py`, `review_cycle.py`, `review_execution.py`, `review_proposal.py`), no unit change, agent schema through V11 with no drift, ancestry `ancestor` |
| Freeze | 08:15:47Z; rollback `/var/lib/mw-integration-agent/rollback/runtime-20261105T081547693417Z` (metadata sha256 `e0eee013…4b96`) |
| Install | 08:15:54Z to 08:15:59Z; no file removed, no unit change |
| Activate | 08:15:59Z to 08:16:03Z, probe `2fb9e2c5-7272-4efd-af83-11d82049dbcd`; catalogue revision 35 to 36 (the R128 rule: services and switches unchanged); six triggers resumed |
| Switch on | `config-only-change.py apply --tag r128-loan-close` 08:17:12Z to 08:17:19Z: the one key `loan_close_execution_enabled` set to true (backup `/root/config.json.pre-r128-loan-close`), `check` true, receiver ready, recognizer and chat relay `/healthz` ok, eight triggers started, no problems |
| Readback (08:17:49Z) | `receiver-ready`: ready on `aaad6a8` (started 08:17:15Z); `check`: ok with `loan_close_execution` true, `pay_forward_options` true, `generic_sending`, `processing` and `writes` false; catalogue revision 36 |
| Smoke (to 08:20:26Z) | 9 receipt cycles with `failures` [] and `notification_failures` []; no error-priority journal entries since 08:16Z; no failed units. No forced DM, payment or close |
| Not deployed | SQL on `mw_agent`, migrations, units, Cloud Run (done separately), Hosting (done separately), Terraform |
| Rollback | Switch only: `sudo python3 integration-agent/scripts/config-only-change.py restore --tag r128-loan-close`. Code: `sudo python3 integration-agent/scripts/deploy-runtime.py rollback --commit aaad6a87ea04eb6545036177e9ac1cb5de403a9e` restores `ebc1e3e8` and revision 35 |

Deviation, as in R127: the deploy engine needed an `mw_agent` operator connection file. A temporary root-only folder `/root/r128-op` (`postgres` through the 5432 proxy, password on stdin from Secret Manager, never printed) held it and the candidate config; all were shredded at 08:17:49Z. A first `config-only-change.py apply` at 08:16:34Z stopped before any change (its input file had not been written: a shell quoting error); nothing was backed up or installed.

### Limitations
- PROD acceptance is pending: the first real "Loan close approval requested" exchange and the agent's close posting. Live Instagram was not exercised.

### Tag record
Tag `R128` on `aaad6a87ea04eb6545036177e9ac1cb5de403a9e`; see the [root note](../../Change%20Logs/CHANGE_NOTES_R128_IG_LOAN_CLOSE_AND_CLOSE_SCAN_2026-11-05.md#tag-record).

### Closure and prune record
See the [root note](../../Change%20Logs/CHANGE_NOTES_R128_IG_LOAN_CLOSE_AND_CLOSE_SCAN_2026-11-05.md#closure-and-prune-record).
