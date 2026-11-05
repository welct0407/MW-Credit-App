# Change notes — R128 loan close through Instagram and slip recognition on Loan Close, 5 November 2026

## Purpose
Owner instruction, 5 November 2026: "If payment could close the loan, give me the option to respond to close the loan through ig. I want to avoid manual work. In addition, when uploading the receipt in close loan page, there's no scanning and recognition … Add it similar to payment receiving page. Engage team … Move to dev, test and promote to prod". Status: In development (not merged, deployed or tagged). The integration agent half is in the [agent change note](../integration-agent/Change%20Logs/CHANGE_NOTES_R128_IG_LOAN_CLOSE_2026-11-05.md).

## Changes
Scope:
- **Close through Instagram.** When a slip exactly matches today's loan payoff and the new catalogue switch `loan_close_execution_enabled` is on, the reviewer request becomes "Loan close approval requested". An approved request makes the agent post a contract-2 `loan.close` operation through three new command-service routes. Without the switch (default off, turned on at PROD after deployment) a payoff slip stays a manual Loan Close as before.
- **V136.** `loan.close` accepts optional `bankReference` and `transferTime`, written to the Payments `"Bank Reference"` and `"Created At"` columns, so slip evidence and duplicate detection work for closes (the same fields manual command v7 already carries).
- **Slip recognition on Loan Close.** The PWA Loan Close page recognizes an uploaded slip like Receive payment (R075, R076) through the existing recognition endpoint.

Design decisions (Archie):
- No new table or column. V136 is functions only.
- The agent uses the same OIDC policy as the receipt routes and the existing validation path (`pwa_submit_operation_v2`, `pwa_apply_loan_close_v2`); no new write path.
- Idempotency: `requestId` is derived from `['mw-credit-agent-loan-close-v1', env, reviewId]`, so a retry or a second approval cannot close twice.
- The quote is read before posting. If it changed since the request was sent the review ends `STALE` and nothing is posted.
- The referral rebate follows the PWA default path: offset when the referrer has an open loan with coverage, the previous path if there is one, otherwise expense. The DM states the path.
- Requests sent before the deploy stay manual; the change applies only to requests created after the agent is updated.
- Slip recognition on Loan Close fills the account and notes the amount only (match or mismatch, no amount fill, because the payoff is computed); the slip date is not used.
- Behaviour added by Byte beyond the brief: the agent also checks that the `rebatePath` and the rebate amount are unchanged before posting; a slip without a bank reference or transfer time gets the manual close request; a 404 or 422 on the re-quote ends STALE (`LOAN_CLOSE_QUOTE_CHANGED`) while a transport fault retries; a 401 or 403 is retried after 15 minutes like receipt payments; the posted DM splits the rebate into its offset and pay-out parts; the agent readback counts Late Charge Paid for all payments.
- PWA upload: when online, Loan Close now uploads the slip at once, even with the offline queue on, so it can be scanned; offline, or when the upload fails, the slip is kept locally and sent unread with the close, as before.
- Deferred: the pay-forward note "Remainder settles … record in the app" stays manual (a different write path).

Files and objects (Byte to confirm names and counts at the final commit):
- `database/migrations/V136__loan_close_slip_reference.sql` (functions only; no table, column, grant or trigger change; V135 stays): `pwa_submit_operation_v2` accepts optional `bankReference` (1 to 256 bytes, not blank, no CR or LF) and `transferTime` (HH:MM) on `loan.close`, each only when present (the `rebatePath` pattern, so a command saved by an older PWA stays valid), and either needs `paymentMethod` Bank Transfer; `pwa_apply_loan_close_v2` writes `"Bank Reference"` and `"Created At"` (paymentDate and transferTime) on the closing payment, else null as before, so the receipt image links after posting as for an agent payment. Preflight needs V135; the self-check confirms owner, ACL, security, volatility, configuration and comment are unchanged. `database/current/public-functions.sql` is regenerated. Rollback is a later migration restoring the V135 bodies (a command with the new keys would then be refused).
- Command service: `services/agent-receipts/contract.mjs` and `runtime.mjs` (the three routes `GET /internal/agent/loan-closes/quote/{loanId}`, `POST /internal/agent/loan-closes` and `GET /internal/agent/loan-closes/{requestId}`; contract 2, reviewed-only, same OIDC policy as `receipt-payments`), `services/payment-command/store.mjs` (`readLoanCloseQuote`) and `services/contracts/operation-command.mjs` (the PWA `loan.close` accepts the two optional keys, Bank Transfer only). `services/chat/assets/schema-digest.json` is regenerated at V136, so the chat image changes and starts a new chat history epoch, as in R119 and R120.
- PWA: `apps/pwa/src/LoanClose.tsx`, new `apps/pwa/src/close-recognition.ts` and `live-style.css`: account fill, amount match and mismatch note, already-recorded reference, new Bank reference field; Echo LC-UX-1 to LC-UX-9.
- Agent (see the agent note): `review_proposal.py`, `review_cycle.py`, `review_execution.py`, `receipt_api.py`, `partner_review.py`, `config.py`, `cli.py`, `scripts/deploy-runtime.py`, catalogue revision 36, Echo AG-13 to AG-23.
- Tests: `scripts/database/Test-AgentLoanClose.sql` (wired into `Test-StatementBatch.sql`), `tests/unit/close-recognition.test.mjs`, `tests/unit/agent-receipt-command.test.mjs`, `integration-agent/tests/test_review_close.py`.
- Deployment order (Archie and Byte): V136 and the command service first, then Hosting, then the agent code and the switch, because a server without V136 refuses the new keys.
- Docs: Release Tracker and Development Changes (R128 rows), Solution Design, PWA Data Model Overview, the Data Dictionary agent API definition, `integration-agent/docs/PARTNER_REVIEW.md`, `OPERATIONS.md` and `RECEIPTS.md`; `database/README.md` (V136 paragraph), `integration-agent/SERVICE_CATALOGUE.md` (revision 36 link) and `integration-agent/README.md`; the PostgreSQL routine definitions follow the V136 apply (see Remaining work).

## Checks
| Command | Result |
| --- | --- |
| `npm run typecheck`; `npm run build` (Byte, uncommitted tree on `3b8ee37`) | Pass |
| `npm test` (Byte) | 1168 pass, 1 skip (needs a DB port; passed against the lab) |
| biome (Byte) | Clean |
| `PYTHONPATH=src python3 -m unittest discover -s tests` in `integration-agent/` and `ruff` (Byte) | 787 pass, 70 skipped; ruff pass |
| `Test-AgentLoanClose.sql` and the full `Test-StatementBatch.sql` on a disposable V136 cluster (Byte) | Pass |
| `Test-MigrationsCloud.py --sql-only` (Byte) | Pass (136 migrations) |
| `<PENDING Echo: AG-13..23, LC-UX-1..9 evidence>` | Pending |
| Chase review of the diff against Archie's plan | <PENDING Chase: evidence follows> |
| `<PENDING: pull request Development checks run and head commit>` | Pending |
| `npm run check:docs` (Dewey) | <PENDING: run after the final text> |

## Not run
<PENDING: filled after verification.> Expected: live Instagram (there is no DEV agent; the first real "Loan closed" exchange in PROD is the acceptance), WebKit. A skipped check is not a pass.

## Recovery
- Agent: set `loan_close_execution_enabled` to false (configuration only) or `deploy-runtime.py rollback --commit <deployed>`; the agent note has the detail.
- PWA and command service: Hosting and Cloud Run revisions are in the Environment Inventory once deployed; the previous R127 versions stay available. <PENDING Forge: prior revisions and Hosting version>
- V136: functions only and immutable; roll forward with a later migration restoring the V135 definitions of `pwa_submit_operation_v2` and `pwa_apply_loan_close_v2`. Backup reference: <PENDING Forge: verified backup at V135>.
- Git baseline: R127 `5f3bcaf`.

## Open questions
None.

## Remaining work
- Owner acceptance in PROD: the first real slip-matched loan close through Instagram, and the first Loan Close slip scan.
- The pay-forward "Remainder settles" note stays manual (deferred).
- After V136 is applied to PROD: refresh the PostgreSQL routine definitions for `pwa_submit_operation_v2` and `pwa_apply_loan_close_v2` through the dictionary helper, and put the DEV and PROD apply times into the `database/README.md` V136 paragraph.

## DEV promotion record
<PENDING Forge: V136 on `loan_manager_dev`, DEV command image, Hosting DEV, DEV evidence. There is no DEV agent.>

## PROD promotion record (Forge, 5 November 2026, UTC)
<PENDING Forge: authority (the owner's instruction above), freeze package, baseline R127, verified backup at V135, V136, command image (read and chat if the shared image changes), Hosting, agent code on `vm-mw-credit-agent` with `loan_close_execution_enabled` on, readback, smoke, rollback, not deployed. No secret value or borrower data appears here.>

### Limitations
<PENDING>

### Tag record
<PENDING: tag `R128` on the package commit, workflow run.>

### Closure and prune record
<PENDING: closure pull request contents and deletions (R125 leaves the three-release window at R128 closure; repoint its inbound links to a permalink first).>
