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
| Byte: guidance line for non-whole-baht totals and overpaid charges; dictionary entry of the function | Both are in the merged tree (`7e108bc9`): the rules file carries the whole-baht guidance and the dictionary entry of `loan_close_calculation_v83(text,date,text)` carries the V101 filter; no separate test result was relayed |
| `npm run check:docs` (Dewey) | 0 failures, 0 warnings |
| Pull request #114 `Development checks` (head `37973612`), merged as `7e108bc9` | All checks passed, including the database groups `migrations`, `receiving`, `phase5` and `phase8`. The phase8 version-pin test was fixed in `37973612`; GitHub showed phase5 as in progress late although all its steps had succeeded |

## Not run
- No real Partner turn has used the wake link or the new payoff guidance yet; the turn timing is the follow-up in Development Changes.

## Recovery
- Database: V101 is forward-fix only (a V102, with owner approval). Shared migrations are immutable, and a backup restore would lose later writes and needs separate authorization; a migration that restores the V83 body would bring the bug back. Restore from the verified backup only for data damage, which V101 does not cause (no table, column, data or trigger change).
- Agent: `deploy-runtime.py rollback` from the freeze backup. The wake link alone: `systemctl disable --now mw-conversation-wake.path`; the 15 s timer keeps the cycle running.

## Open questions
None.

## Remaining work
- The first real PROD turn after R086, timed with `scripts/conversation-timing.py` (expect about 45 s against 64 s; one follow-up row in Development Changes).

## Promotion record

Release R086: agent and database migration V101, 21 October 2026 (UTC). Tag `R086` on `7e108bc9179a2524c838abe1955410b9262bf21a`.

- **Authority:** the owner's words this session: "go ahead with the wake link"; "go ahead with 1 and 2" (1 = fix the bot's payoff and paid-so-far guidance, 2 = fix the database payoff function); and "Check if any loan was closed with wrong amount since the bug exists". Owner acceptance was not given separately; it is recorded as the production instruction, as for R084 and R085.
- **Package:** pull request #114 (head `37973612`) merged as `7e108bc9`; all checks passed (Checks). Release file `release-r086-v101-7e108bc.json`.
- **DEV:** backup `dev-refresh-5b408dcecb224bd28d6e21750ca762b6` (sha256 `07b5c126…`, restore ok, 33 tables); V101 migrated 14:52:51Z. The runner's post-migrate permission check needed the documented owner-authority window (notify, jobs, journal and changes owners): opened 14:58:29Z, check 0 violations, restored 15:04:30Z (record `owner-authority-dev-prepare-475ffc6e-…`); validate ok 15:04:50Z. One extra no-op migrate ran by mistake (0 migrations executed). All 8 affected loans were correct on DEV; the other 19 were unchanged.
- **PROD database:** backup `prod-promotion-06cb1c6e82bd4e4485561e6a8c928fea` (sha256 `20d4b044…`, restore ok, 33 tables), copied to `promotion-packages/r086/`; connect preflight 15:09:08Z (0 DEV sessions), check pending exactly [101]; apply 15:09:48Z to 15:11:07Z; V101 installed 15:10:30.95Z; schema 101, validate ok. V101 file sha256 `f984edcb…`, Flyway checksum -93685251. Function owner and ACL unchanged (`postgres`; `mw_app_prod` execute). The 8 affected loans now quote the correct payoff (total before ฿46,210, after ฿31,510); the other quotable loans are unchanged, except one that moved because of a real ฿4,000 payment at 15:07:08Z.
- **Agent:** checkout updated to `7e108bc9`; freeze 15:12:41Z (`runtime-20261021T151241274491Z`); install (`mw-partner-conversation.service` changed, `mw-conversation-wake.path` new); activate 15:12:46Z to 15:12:50Z (probe `14c45274…`); the helper restarted the recognizer and `/healthz` is ok; wake path enabled 15:13:10Z. Proof: a touch at 15:13:11.623Z started the service at 15:13:11.659Z (35 ms), ok, 0 turns. `/ready` reports `7e108bc9`, 8 timers, no failed units.
- **Recovery:** V101 is forward-fix only (Recovery above). Agent: `systemctl disable --now mw-conversation-wake.path`, then `deploy-runtime.py rollback --commit 7e108bc9…` restores `6a3673e52657d8fe97a8ae2702fd1f4a08c5552a` from `runtime-20261021T151241274491Z`. Pins go to the [environment inventory](../project/Documents/Environment_Inventory.md).
- **Outcome:** applied and verified (migration, `/ready`, wake path start); the 8 loans can now be closed through Loan Close. The first real turn is the timing check.

### Closure pruning (release workflow, 21 October 2026)
- Deleted `Change Logs/CHANGE_NOTES_R083_FAST_STARTUP_2026-10-20.md` (R083 is outside the retention window of R086, R085 and R084); its tracker and Environment Inventory links now point to commit `7e108bc9`, where it still exists. The R083 row in Development Changes (owner confirmation already recorded in the tracker row) was deleted.
- The R086 Development Changes row became one follow-up row. R082's agent change notes stay (open R082 follow-up row; agent change notes are not pruned).
