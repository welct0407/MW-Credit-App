# AI Collection — Build 1 — 2026-09-07

**Acceptance — 7 September 2026:** User said the latest template looks good and confirmed it is exclusively the first message of the day; reminders must be simpler. Build 1 message-format review is accepted. Build 2 is now authorized; see `CHANGE_NOTES_AI_COLLECTION_BUILD_2_2026-09-07.md`. Earlier pending-acceptance entries below are historical. Daily initial-message scheduling remains unconfigured.

## Late-payment wording revision — 7 September 2026

User explicitly supplied late-payment terms and requested a template update and another send to the same friend. Updated `src/message_template.mjs` and `MESSAGE_FORMAT.md`: current-day amount, conditional existing overdue amount, then 16.00 deadline, 50฿ starting 16.01 and every hour, additional 500฿ across midnight, followed by the saved bank block. Added the authorized revision to `config.json` and `src/review_resend.mjs`. No fee was calculated or posted; this change affects message wording only. No AppSheet configuration/data or reporting object changed; historical app baseline remains 3.000011. Before-edit copies of the four affected files are in ignored `local/before-late-terms/`.

Fresh standalone production app sync confirmed Lisa's three unpaid charges totaling 900: current-day 600 and prior-day 300. Reserved revision `2026-09-07-late-payment-terms`, sent the exact generated message to verified Instagram username `__rxrisx__`, and confirmed the complete bubble, empty composer, and absence of Sending. Ledger status is SENT. User/friend acceptance remains pending. Verify message order and supplied penalty wording before accepting this revision. Restore the four local backup files to roll back the template; retain the ledger. Local rollback cannot retract the sent message. No financial-record or model-document rollback is applicable.

## Status and scope

First manual messaging cycle implemented and verified at the sender; awaiting user/friend acceptance. A single daily message was sent and logged, and the second reservation was blocked. Scheduled operation is not yet enabled; its time/timezone and unattended browser behavior remain to be settled after this verification gate. Later reminder and payment-recording builds have not started.

The user explicitly selected the existing production OLTP app for synthetic borrower **Lisa**, principal THB 3,000 and daily interest THB 300, then selected yesterday (6 September 2026) as the start date. Instagram test recipient is `__rxrisx__`; the user logged in personally. Sender profile shown in the UI was `tttlll8709`. Only this test conversation is in scope. The user explicitly allowed normal AppSheet notifications for Lisa and requested the borrower display name be kept short. All data entry used the standalone production `/start/93844270-6aa5-420b-a960-bcdf08abd357?platform=desktop` app, never the builder preview.

## Inspection and rollback point

- Production app `93844270-6aa5-420b-a960-bcdf08abd357`: Manage > Versions > Version History visibly confirmed **3.000011** on 7 September 2026, before any mutation. Save was disabled and app Deployed.
- AppSheet My Apps visibly lists `LoanMgr FULL BACKUP 20260906`. Its data contents have not been re-audited in this task.
- Local Git reference: `d39070da821650f629cb9b606651e2496c9212f5`. Existing uncommitted work, including both model documents, must be preserved.
- No Looker report changes planned; report backup is not applicable.
- App version restoration restores configuration, not financial rows. Record each synthetic row ID before further dependent writes. Do not delete or close synthetic financial records as an automatic cleanup step; use a separately agreed correction/cleanup procedure.

## Dependencies and effects

The current app uses Universal Payments, including first-day receipt processing. The new-loan bot was visibly enabled, with Adds on Loans and no condition. The user approved ordinary AppSheet notifications, so no bot switch, filter, configuration or schema was changed. Actual AppSheet push delivery was not independently verified. Synthetic rows contribute to OLAP snapshots and Looker totals; test identity is retained in loan/charge notes and this log. No report was edited or manually refreshed.

## Changes and checks so far

- Added this change log and `mw-ai-collection/`: `package.json`, `.gitignore`, `config.json`, `README.md`, `src/ledger.mjs`, `src/collection_runner.mjs`, and `test/ledger.test.mjs`. Runtime SQLite ledger and observed snapshot reside in ignored `state/` and `local/` directories.
- Borrower **Lisa**, Row ID `OnzYScuVbP2NtFo9uGlecU`, created after the production Borrowers search returned no Lisa. Borrower Name is exactly Lisa. Description was initially a long test marker, then cleared at the user's request. The existing app display expression still appends a trailing hyphen (`Lisa -`); this task did not modify that expression. Telephone remains blank.
- Loan `Ppr9smZetDv28ZnroJr6ac`: Loan Date 2026-09-06; Principal Amount 3000; Daily Interest; Current Daily Interest 300; Payment Interval 1; Transfer Fee 0; Active; test notes retained in Loan Arrangement. First-day charge `P0vZQY5SQv4G267Qkymun8` showed amount 300 and remaining 0. Loan detail showed interest/total received 300, principal received 0 and principal outstanding 3000. Child receipt/allocation/repayment IDs were not separately inspected in this build.
- Only the first-day charge was initially present because this loan was created after scheduled generation. Opened the existing, verified `Charges_Form` in the standalone production app and added charge `7xPiJWFlC833HSXcd9gQDt` for 2026-09-07, Ref Loans = Lisa's loan, Principal Due 0, Interest Due 300, with synthetic notes. No system-wide bot was run.
- After sync completed, Lisa's production Collection detail showed Not Paid, Todays Amount Due 300, Todays Amount Collected 0, Todays Amount Remaining 300 and exactly one collection charge dated 2026-09-07. Yesterday's charge was already paid, leaving no overdue amount for this test loan.
- Four local Node tests passed: persistent reservation across two SQLite connections, unknown-send retry block, wrong-identity/stale/invalid-facts rejection, and paid-borrower skip. This is not full simultaneous browser-execution testing.
- Reserved token `e38c50ca-6a32-441d-b9b8-2089f556e7c0` before sending. Verified exact target username in Instagram; sent the message below once. The sent bubble showed 5:20 PM; its Sending indicator cleared and composer was empty. Recorded SENT with UTC ledger timestamps. The next reservation returned BLOCKED_DUPLICATE with previousStatus SENT; no second browser send was attempted. Recipient receipt/read confirmation remains pending.
- Message text:

  > [ทดสอบระบบ — ไม่ต้องโอนเงินจริง]
  > คุณ Lisa คะ วันนี้มียอดชำระ 300 บาทค่ะ
  > สะดวกชำระประมาณกี่โมงคะ 😊

- No changes to `sources/`, model definitions, overview or data dictionary. Section 5.2 model documentation updates are not applicable because this task added test rows and local runner files only. Existing uncommitted model-document work was preserved.

## Manual verification required

Verify Lisa's principal 3000, daily interest 300, start 6 September, paid first-day charge and today's unpaid 300. Ask the friend to confirm one received message and review Thai wording. Review the stored audit record and synthetic contributions to reporting. The duplicate reservation was checked locally; recipient-side confirmation is still required. Scheduling, midnight, offline, simultaneous browser cycles and automated AppSheet extraction remain untested/unimplemented as described in the README. Choose daily sending time/timezone before enabling scheduled operation.

## Rollback instructions

No app configuration rollback is needed: editor configuration was not saved or changed. Stop the local runner and retain the ledger to preserve duplicate protection. Revert only this task's new local source files if needed; preserve existing unrelated work. Version 3.000011 is the recorded configuration baseline, but restoring it would not remove Lisa's synthetic data. Preserve all linked financial rows; obtain an agreed auditable correction/cleanup procedure before removing or closing test data. Do not cascade-delete Lisa as routine cleanup. An Instagram message cannot be undone by local rollback. Update this log after acceptance, scheduling or cleanup.

## Message format revision — 7 September 2026

User requested the exact mandatory/optional structure from **Draft daily collection messages**, task `01a066b1-e885-7d52-98f5-34812d9c7c18`, removal of the test heading, and a second send. Read that task's three user turns and final responses, its local standardization script, and the original payment-block screenshot. Required elements: polite greeting/current-day amount, 16.00 deadline/late-charge wording, and payment block. Overdue line is conditional; emojis optional. Removed the promise-time question from this daily template. The bank block is pending destination-specific inclusion/omission choice; actual bank details are not copied into shared source or this log.

Added `src/message_template.mjs`, `MESSAGE_FORMAT.md`, and `src/review_resend.mjs`; updated `src/ledger.mjs` and README. Before-edit backups of ledger source, README and this log are in ignored `mw-ai-collection/local/before-template-v2/`. No AppSheet configuration or financial record changed during this revision, so no new app/report backup is applicable. Four existing local ledger tests passed after the template change.

The authorized resend uses a fixed revision ID in a separate `review_resends` audit table, linked to the original SENT record. It does not erase the first message or bypass the normal daily duplicate key. At this checkpoint no revised message has been sent. Live production sync still showed Lisa due/remaining 300, collected 0, with the same single current-day charge. The Instagram thread shows the first message and a borrower test reply; conversation-response handling remains outside this build.

Rollback of the template: restore backed-up ledger source and README, retain all send records, and stop invoking the review resend command. Restore log content only through a new dated status entry so the audit history remains intact. Sender-side verification of the revised message and the friend's review remain pending. The reference's 16.00 text is being reviewed after that time; no fee is calculated or posted by this messaging change.

### Bank details authorized and saved

The user expressly authorized including their supplied bank/account/name in this task and saving it for later editing. Created ignored `mw-ai-collection/local/payment_account.json` with the exact three supplied strings; added `src/payment_account.mjs` to load and validate nonempty single-line values. Both normal and review-resend commands now read this file at reservation time. No bank values are duplicated in this shared change log. `git check-ignore` confirmed the account file is excluded from Git. The original ledger and CLI sources were copied to `local/before-bank-file/` before editing. Four local ledger tests passed after wiring the account loader. No AppSheet or Looker object changed; existing configuration baseline remains the historical v3.000011 inspection.

The previously pending bank choice is resolved: include the supplied bank block. Revised send is being verified; preserve both original and revised audit records. Account edits affect future reservations only. Rollback: stop the runner, restore the three backed-up source files if required, and retain the account file/ledger for the user's future editing and audit. No financial data rollback is needed for this template-only follow-up.

**Revised send complete:** after a fresh standalone production sync confirmed Lisa's remaining 300 and collected 0, reserved `2026-09-07-user-request-format-v2`. Sent the greeting/300/16.00/late-charge sentence, reminder heading and the exact user-supplied bank block to `__rxrisx__`. No test heading, overdue line or promise-time question. Instagram displayed the revised bubble at **5:40 PM**; Sending cleared and composer was empty. Recorded SENT; a second revision reservation returned BLOCKED_DUPLICATE, previousStatus SENT. The original daily send record is unchanged. Account-file loading was exercised end-to-end and the composed/sent values matched the user's three supplied strings. Friend's review is pending; no later build or schedule started. Editable file link was opened in Codex for the user. This entry supersedes the prior pending-send checkpoints.

## Second Lisa loan and overdue-message scenario — 7 September 2026

The user requested a second synthetic Lisa loan created two days earlier, with its first day paid, its second day missed, and its third day due today. They then directed that the next Instagram message be written as the first ordinary collection message: no test header, correction, explanation, or other remark. This production-data mutation and send were explicitly authorized in the task. The existing production configuration rollback point remains version **3.000011**; no AppSheet configuration, schema, bot, slice, expression, or Looker object changed.

- Added active loan `53EQN4Aqp9EVpfYfHG4LTw` for borrower `OnzYScuVbP2NtFo9uGlecU` (Lisa): Loan Date 2026-09-05, Principal Amount 3000, Daily Interest 300, Payment Interval 1, Transfer Fee 0. The normal first-day mechanism ran, and the loan detail showed the first day's 300 received. The generated first-day child charge/payment IDs were not separately inspected.
- Added the missed 2026-09-06 interest charge `KXmTDYsDUkOZA1Qb78bxbw`, amount 300 and remaining 300, and the current 2026-09-07 interest charge `IImfSVl9iJsFeTeU3qQoYw`, amount 300 and remaining 300. The original loan's current charge `7xPiJWFlC833HSXcd9gQDt` remains due at 300.
- A completed sync in the standalone production app showed Lisa as Overdue with amount due 900, collected 0 and remaining 900. The three listed collection charges reconcile to current-day remaining 600 plus overdue remaining 300.
- Added revision `2026-09-07-second-loan-overdue` to the explicit-send allowlist and updated the ignored observation snapshot. Five local Node tests passed, including the message-template case for 600 current plus 300 overdue. No recurring schedule was created.
- Reserved the revision and sent one message to exact username `__rxrisx__`. It states Lisa's current-day amount of 600, the 16.00 deadline/late-charge wording, a separate overdue amount of 300, the reminder heading, and the exact bank block loaded from the ignored account file. This log intentionally omits the account values. Instagram displayed the complete message in the conversation; the composer was empty and no Sending indicator remained after 2.5 seconds. The audit ledger records the revision as SENT.

Manual acceptance remains pending. Verify the second loan dates and terms, first-day paid state, both unpaid charges, Lisa's 900 remaining total, and receipt of one clean message showing 600 today plus 300 overdue. The synthetic rows affect production operational and reporting totals while retained. Rollback requires an agreed auditable correction or cleanup of the linked loan, charge, and payment records; restoring app version 3.000011 does not remove data rows. Retain the message ledger because an Instagram send cannot be reversed locally.
