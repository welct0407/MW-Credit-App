# Change notes — R128 agent loan close through Instagram, 5 November 2026

## Purpose
Owner instruction, 5 November 2026: "If payment could close the loan, give me the option to respond to close the loan through ig. I want to avoid manual work … Engage team … Move to dev, test and promote to prod". A slip that exactly matches today's loan payoff ended `MANUAL_REQUIRED` (`LOAN_CLOSE_REQUIRED`). The agent can now close the loan after the reviewer approves. This is the agent half of release R128; the SQL (V136), command routes and PWA are in the [root change note](../../Change%20Logs/CHANGE_NOTES_R128_IG_LOAN_CLOSE_AND_CLOSE_SCAN_2026-11-05.md).

## Changes
- **Switch.** `config.py`: `loan_close_execution_enabled` (boolean, default false, absent means off; <PENDING Byte: dependencies the configuration refuses without>). Off, a payoff slip behaves as before.
- **Request (Echo AG-13 to AG-23).** With the switch on and the slip an exact match for today's payoff, the reviewer DM reads "Loan close approval requested" and states the payoff and the referral rebate path (offset, previous path or expense). <PENDING Echo: final wording and numbering.>
- **Approval and posting.** An approved review re-reads `GET /internal/agent/loan-closes/quote/{loanId}`; if the quote changed since the request the review ends `STALE` and nothing is posted. Otherwise the agent posts a contract-2 `loan.close` with `POST /internal/agent/loan-closes`, carrying the slip's bank reference and transfer time (V136), and reads the result with `GET /internal/agent/loan-closes/{requestId}`. The `requestId` is derived from `['mw-credit-agent-loan-close-v1', env, reviewId]`, so a retry is idempotent; an unknown outcome is reconciled by status only and never re-sent. The server validates through `pwa_submit_operation_v2` and `pwa_apply_loan_close_v2`.
- **Result.** The posted DM says "Loan closed". <PENDING Echo: exact text.>
- **Before the deploy.** A request sent before the agent update stays manual: approving it records `MANUAL_REQUIRED` as before.
- **Readback.** The agent's readback now counts Late Charge Paid, which fixes a latent R118 gap (a paid late charge was not counted).
- **Deferred.** The pay-forward note "Remainder settles … record in the app" stays manual (a different write path).
- **Catalogue revision 36.** `partner_receipt_review` gains the new switch; no service is added or removed. `deploy-runtime.py` must accept the live revision 35 to candidate 36 change. <PENDING Byte: files, modules and tests.>
- Docs: `docs/PARTNER_REVIEW.md`, `docs/OPERATIONS.md`, `docs/RECEIPTS.md`, Solution Design, the Data Dictionary agent API definition, Release Tracker and Development Changes.

## Checks
| Command | Result |
| --- | --- |
| `<PENDING Byte: ruff and unit tests as run in integration-agent/>` | Pending |
| `<PENDING Chase: review>` | Pending |
| `<PENDING: agent CI test and lab run and head commit>` | Pending |
| `npm run check:docs` (Dewey) | <PENDING> |

## Not run
Live Instagram: there is no DEV agent, so the first real loan close in PROD is the acceptance. <PENDING: other skipped checks.> A skipped check is not a pass.

## Recovery
Set `loan_close_execution_enabled` to false (configuration only, no restart of other services; <PENDING Forge: backup file name>) and a payoff slip is manual again. For the code: revert the commit of the R128 pull request (baseline R127 `5f3bcaf`, agent code `ebc1e3e8`); on the VM `deploy-runtime.py rollback --commit <deployed>` restores the previous runtime from the freeze directory. A loan already closed is not undone by either step; use the Loan Close correction path in the app.

## Open questions
None.

## Remaining work
- Owner acceptance in PROD: the first real "Loan close approval requested" exchange.
- The pay-forward "Remainder settles" note stays manual (deferred).

## DEV promotion record
There is no DEV agent. Evidence: <PENDING: agent CI `test` and `lab`, Byte's unit tests and Chase's review.>

## PROD promotion record (Forge, 5 November 2026, UTC)
<PENDING Forge: agent steps on `vm-mw-credit-agent` after V136, the command image and Hosting are in PROD: package, baseline, checkout, dry run, freeze, install, activate, switch on, readback, smoke, rollback, not deployed. No secret value or borrower data appears here.>

### Limitations
<PENDING>

### Tag record
See the root note.

### Closure and prune record
See the root note.
