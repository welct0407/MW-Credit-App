# Change notes — conversation wake link and Loan Close payoff fix (R086), 21 October 2026

## Purpose
The first real R085 turn waited 19.5 s of its 64 s between capture and start, so the owner approved a wake link ("go ahead with the wake link"). Reviewing a payoff answer then found that the database payoff function dropped repayments without a payment link; the owner approved fixing the bot's payoff and paid-so-far guidance and the database function ("go ahead with 1 and 2") and asked to check whether any loan was closed with a wrong amount ("Check if any loan was closed with wrong amount since the bug exists").

## Changes
Wake link (Byte; agent only):
- `server.py`, `receipt_wake.py`: after a committed capture of a message the conversation cycle may answer, the receiver touches `state/conversation-wake`. Not touched for image-only, reply, command, unsigned or redelivered captures. A wake failure never fails the delivery.
- `systemd/mw-conversation-wake.path` (new): `PathChanged` on that file starts `mw-partner-conversation.service`. The service gains `StartLimitIntervalSec=0`, because a burst of path starts would otherwise hit the default start limit (5 per 10 s) and fail the path unit.
- `cli.py`: the cycle reruns, up to 2 extra passes, when the wake file changed during the run or when a pass handled a turn (one turn per pass), so a question captured mid-run is not left for the timer. The 15 s timer stays as the fallback; the conversation poll does not capture conversation messages.
- `scripts/deploy-shared-receipt-api.py`: `mw-conversation-wake.path` joins the path units that the helper pauses, records, resumes and installs.
- Tests: `test_receipt_wake.py`, `test_server.py`, `test_systemd_units.py`, `test_deploy_runtime.py`, `test_deploy_shared_receipt_api.py`, `test_conversation_parallel.py`.

Bug and fix (database):
- Bug: `loan_close_calculation_v83` (V83, installed on PROD 11 October 2026 at 20:57:22Z) filtered repayments with `"Ref Payment" IS DISTINCT FROM p_exclude_payment`. With no exclusion that is `NULL IS DISTINCT FROM NULL`, which is false, so every repayment without a payment link (the legacy rows) was dropped: its charge looked unpaid again and the outstanding principal looked higher. Both close paths use it (the PWA `loan.close` and `prepare_loan_close`); the correction path, which excludes a non-null payment, does not.
- Effect today: 8 open loans are quoted too high, by about ฿14,700 in total. The other loans have automatic charges off (Loan Close is not available) or have no unlinked repayments. The per-loan list is not kept in Git because it names borrowers.
- Fix: `database/migrations/V101__loan_close_counts_unlinked_repayments.sql` replaces the function in place, using `(p_exclude_payment IS NULL OR "Ref Payment" IS DISTINCT FROM p_exclude_payment)` in its 4 filters. Same signature, result shape, grants and volatility. `database/current/public-functions.sql` is regenerated; `scripts/database/Test-AtomicLoanClose.sql` has a new case. After deployment, a PWA close preview opened earlier shows "Close plan changed" once.
- Audit (read-only, PROD):
  - 16 Loan Closes ever. The 15 before V83 were correct (the old code counted all repayments). The 1 after V83 (14 October, ฿1,300) was correct and has no unlinked repayments; it closed at principal ฿0.
  - 0 overcollected, 0 refused, 0 double-paid charges. No repayment has both `"Ref Payment"` and `"Ref Charges"` NULL, and no loan has `"Outstanding Principal"` below 0 (Forge).
  - Byte's reproduction: a close is refused when the unlinked repayments carry `"Ref Charges"`, and overcollects (leaving principal below 0) when `"Ref Charges"` is also NULL. Every unlinked repayment on the 8 affected loans carries `"Ref Charges"`, so a close today is refused ("Payment does not match the current eligible balance") and rolls back. No money was or would be overcollected; the effect is that those 8 loans cannot be closed through Loan Close until V101 is live.
- Interim advice to the owner: do not Loan Close those 8 loans until V101 is live.

Bot guidance (Byte; `conversation_session.py`, `conversation_tools.py`, `assets/conversation-business-rules.md`, `assets/schema-digest.json`, `scripts/build-schema-digest.py`):
- Payoff of an open Daily Interest loan = outstanding principal + unpaid charge interest (Σ `"Interest Remaining"`) + interest since the last charge (daily interest × days from the latest `"Charge Date"`, or the loan date, to today; none when a charge is dated today). `loan_payoff` is only a cross-check in the same round: if it differs the bot reports the charge-balance figure and never shows two totals. The tool description says so too.
- Paid so far: the total is the loan facts' principal and interest received; the interest and principal split counts every `"Repayments"` row of the borrower's loans, with or without a payment link, except the default-loss row (`"Row ID"` LIKE `'df10:%'`).

Documentation (Dewey): `database/README.md` (V101 paragraph), `integration-agent/docs/PARTNER_CONVERSATIONS.md` (payoff formula, `loan_payoff` as cross-check, wake path, timer line), `integration-agent/docs/OPERATIONS.md` (the wake path unit in the freeze, stop and unit lists, and the one-time enable), `integration-agent/README.md`, `project/Documents/Development_Changes.md` (R086 row), `project/Documents/Release_Tracker.md`.

## Checks
| Command | Result |
| --- | --- |
| `ruff check` (Byte, tree on `df061021`) | Passed |
| `scripts/build-schema-digest.py --check` (Byte, same tree) | Exit 0 |
| Focused tests (Byte, same tree) | 209 OK |
| `python -m unittest discover -s tests` in `integration-agent/` (Byte, same tree) | 753 tests OK, 98 skipped (lab suites) |
| `mw-db-ci -Group migrations` (Byte, same tree, includes V101 and `Test-AtomicLoanClose.sql`) | Exit 0 |
| PROD Loan Close audit (Forge, read-only) | See Changes: no wrong amount collected |
| Chase review of the wake link | No lost message and no double turn. A path trigger during a run is caught by the rerun's mtime check; the process lock prevents overlap and `reserve` is idempotent; the cap is 3 passes per process, within `TimeoutStartSec` of 20 min; a capture needing both receipt and conversation touches both files; a failed touch or a redelivery falls back to the 15 s timer. On the first deploy the path unit is installed but not started, so `systemctl enable --now mw-conversation-wake.path` is needed (tested) |
| Chase review of the payoff guidance | The formula equals the function's arithmetic exactly. Small difference: the function refuses non-whole-baht totals and overpaid charges; Byte is adding a guidance line for that |
| Chase real-SQL test of V101 (throwaway V100 to V101 database, 4 synthetic loans) | Before V101 three loans were overquoted by 200, 1,100 and 600; after V101 all four equal the formula. The correction path (`p_exclude_payment` set) gives byte-identical output before and after; function attributes unchanged |
| Byte: guidance line for non-whole-baht totals and overpaid charges; dictionary entry of the function | Pending |
| `npm run check:docs` (Dewey) | 0 failures, 0 warnings |
| Pull request `Development checks` | Pending: CI run after the orchestrator pushes |

## Not run
- V101 is not applied in PROD or DEV and the agent code is not deployed; both need the owner's promotion instruction. Nothing was run against PROD data except the read-only audit.
- No real Partner turn has used the wake link or the new payoff guidance yet.
- The data dictionary entry of `loan_close_calculation_v83(text,date,text)` was not rebuilt when this note was first written; Byte is regenerating it (pending row above).

## Recovery
- Database: shared migrations are immutable, so V101 is reversed only by a later migration that restores the V83 function body; that would bring the bug back, so prefer a forward fix. Restore from the verified backup only for data damage, which V101 does not cause (no table, column, data or trigger change).
- Agent: `deploy-runtime.py rollback` from the freeze backup. The wake link alone: `systemctl disable --now mw-conversation-wake.path`; the 15 s timer keeps the cycle running.

## Open questions
None.

## Remaining work
- Byte's guidance line and the dictionary entry of `loan_close_calculation_v83` (rows above), a pull request with CI, and the owner's promotion instruction.
- Deployment plan, in this order: (1) V101 through the guarded migration with a verified backup; (2) the agent deploy with `deploy-runtime.py` (`freeze`, `install`, `activate`): the helper installs `mw-conversation-wake.path` but does not start it; (3) once after the first `activate`, run `systemctl enable --now mw-conversation-wake.path` on the VM, then check that it is `active (waiting)`; (4) one real turn, timed with `scripts/conversation-timing.py`. Until step 3 the 15 s timer carries every turn, so skipping it loses no message.
- After deployment: confirm the 8 loans quote the corrected payoff and time one real turn with `scripts/conversation-timing.py`.
