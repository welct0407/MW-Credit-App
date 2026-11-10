# Change notes — manual expenses pending payment (R140), 10 November 2026

## Purpose
Owner request of 10 November 2026: "for expenses, if it's referral expenses created automatically through loan closure, the payment could be in pending status. but when i create expense manually, there's no such option. ... allow me to create manual expenses that is pending for payment. test it in Dev and let me review." A manual expense can now be recorded as pending payment, with no cash movement until it is paid.

## Changes
- Design (Archie): no new column. A manual expense is pending when Source Type is `Manual`, Amount is above 0, `"Ref Paid By Cash Holder"` and `"Ref Paid By Cash Account"` are both null and it is no `r005_cash_cutover_sources` row. It writes no Cash Ledger row. Paying it is an edit (`expense.update`) with a paying account: a System ledger row dated on the Expense Date, not the actual pay date (owner trade-off to review; a "Paid Date" column would be a follow-up). Setting the account back to null returns it to pending and removes the row.
- SQL (Byte): `database/migrations/V142__pending_manual_expense.sql` replaces in place `pwa_apply_expense_v2`, `guard_source_cash_holder`, `guard_source_cash_account` and `guard_opening_included_source`, comments the two payer columns and grants nothing: `mw_app_<env>` already reads `r005_cash_cutover_sources` (app-role policy; DEV reconcile, PROD recorded ACL), and the preflight refuses a provisioned app role without that read. `database/current/public-functions.sql` is rebuilt.
- Read service (Byte): `paymentState` and `pendingAmount` on expense records (`services/business/expenses.mjs`, `rebate-state.mjs`); `expensesPayable` on the cash position (`services/business/management-position.mjs`); the expense command contract (`services/contracts/expense-command.mjs`).
- Chat (Byte): command catalogue and schema digest assets, and the proposal line "Pending payment - no cash movement" (`services/chat/proposals.mjs`, `apps/pwa/src/chat/chat-text.ts`).
- PWA (Byte, UX codes EXP-PEND-1 to 9 from Echo): Payment choice (Paid now, Pending payment) on the expense form, list chip, detail "Not paid yet", "Mark as paid" button, Dashboard "Expenses payable" (`apps/pwa/src/ExpenseRecords.tsx`, `ManagementPosition.tsx`, `OfflineViewedRecord.tsx`, `viewed-snapshot.ts`, `live-style.css`). EXP-PEND-7 is the paid chip after a later payment; EXP-PEND-10 to 12 (a separate pay form and undo) are not implemented; pay by editing.
- Tests (Byte): `scripts/database/Test-BusinessExpenses.sql`, `Test-OpeningIncludedCrud.sql`, `tests/integration/pending-expense-independent.test.mjs`, `tests/integration/Run-UnifiedReceiving.ps1`, and unit tests for the command contract, display read, chat proposals and chat PWA.
- Records (Dewey): Data Dictionary routine definitions for the four routines (`systems/postgresql/routines/`, source definitions from V142, applied with the dictionary tool; the PROD capture follows the PROD apply) and the two payer column comments in `systems/postgresql/relations/business-expenses.yaml`; `database/README.md` (V142), `project/Documents/PWA_Data_Model_Overview.md` (Expenses), `project/Documents/Solution_Design.md` (R140 paragraph), `project/Documents/Release_Tracker.md` (R140 scope, Open), `project/Documents/Development_Changes.md`. The `r005_cash_cutover_sources` relation entry already lists `mw_app_prod` SELECT from the PROD capture and is unchanged.
- Commits: `1b8c692` (batch), `de86092` (phase5 F10-C01 expects the pinned-schema 422 for a null account), `86a5371` (V142 grants nothing; preflight guard), `8822f0c` (Echo EXP-PEND-13 list chip colour, 14 button underline, 15 Mark as paid form title with scroll and focus, 16 disabled Pending option styling).

## Payee follow-up (f123135)
Owner, 10 November 2026: "The payee can be some existing borrower, like referrers, or someone else like Dad." Byte, commit `f123135`.
- SQL: `database/migrations/V143__manual_expense_payee_borrower.sql` replaces `pwa_submit_operation_v2` (optional last key `payeeBorrowerId` on `expense.create` and `expense.update`; the canonical form includes it only when sent) and `pwa_apply_expense_v2` (a borrower given must exist, else P5B04, and `payeeName` must be null; the row links `"Ref Payee Borrower"` and snapshots the borrower name into `"Payee Name"`; null means a typed name and no link; absent means create has no link and update keeps the link unless the name changes; Manual rows only, a referral rebate is P5B05). It comments `"Payee Name"` and `"Ref Payee Borrower"`. A borrower delete while payee is still refused (P5B05). No table, column or grant.
- Reads: borrower details `expensesOwedAmount` and `expensesOwedCount` (pending manual expenses paid to that borrower, separate from rebates owed); borrower search `isReferrer`.
- Chat: optional `payeeBorrowerId`, the card shows the borrower name; earlier 8-key proposals stay valid.
- PWA (Echo EXP-PEND-18 to 25): one Payee field that searches borrowers (Referrer tag) or offers "Use ..." as a typed name; it never fills Related Borrower; list tile shows "ค้างจ่าย" with the payee; detail has one Payee row; review screen; the borrower page shows "Expenses owed" and the amount and item count when above 0.
- Behaviour change: a referral rebate's detail now shows the borrower's live name as payee, not the captured `"Payee Name"`.
- Records (Dewey): dictionary text of `pwa_submit_operation_v2` and `pwa_apply_expense_v2` and the two payee column comments in `business-expenses.yaml` (source definitions; the PROD capture follows the PROD apply); `database/README.md` (V143), `PWA_Data_Model_Overview.md`, `Solution_Design.md`, `Release_Tracker.md`, `Development_Changes.md`.
- Tests (Byte, local): migrations, phase5 and receiving groups pass; `npm test` 1277 pass; biome, `tsc` and build pass; Playwright expense and referrer specs 58 pass. CI and the DEV deployment are recorded below.
- Follow-ups: EXP-PEND-25 (make the borrower-page line tappable), with EXP-PEND-17.

## Checks
| Command | Result |
| --- | --- |
| Byte's local checks | Pass, as reported before each push |
| Chase's DEV functional test | Pass, see DEV deployment evidence |
| Echo's DEV UX check | Pass for EXP-PEND-1, 2, 3, 5, 6, 8, 9; 13 to 16 fixed in `8822f0c` |
| CI, `86a5371`: `Development checks` | Pass, run 42859475473 |
| CI, `86a5371`: `Agent tests` | Pass, run 42859476226 |
| CI, `86a5371`: `Database migrations` push run 42859457634 | Four rebuild groups passed; the guards failed only on the push-diff step (V142 edited since the previous push, so it is added against main and unapplied); explained in a pull request comment |
| CI, `86a5371`: `Database migrations` dispatched run 42864647539 | Pass, guards passed |
| CI, `8822f0c` | Pass: `Development checks` run 42868639160 (check, lint, three Chromium e2e shards and three iPhone WebKit e2e shards; terraform not selected); PWA only, so `Database migrations` not triggered |
| CI, `f123135`: `Database migrations` run 42888498687 | Pass, all jobs (guards and four groups) |
| CI, `f123135`: `Development checks` | Pass |
| CI, `d622826`: `Development checks` run 42892384471 | Pass |
| CI, `d622826`: `Database migrations` run 42892374657 | Pass |
| V143 DEV deployment and test | Pass, see DEV deployment evidence |
| Earlier CI failures, fixed | phase5 on `1b8c692` (run 42856801410), fixed by `de86092`; migrations on `de86092` (run 42857508827, ACL drift from the grant), fixed by `86a5371` |
| `dictionary.py validate` | Pass after the five dictionary updates (Dewey) |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (Dewey) |

## DEV deployment evidence
Forge, 10 November 2026 (UTC). Package: `86a5371`; Hosting redeployed from `8822f0c`.
- Backup at V141: `dev-refresh-2c9f995e48d9414699d6b09983270e3f` (SHA-256 `275101b2...6766`, test restore passed, 39 tables matched).
- Owner window 17:25:32Z to 17:33:10Z. V142 applied 17:25:46Z, validate ok, schema 142. `has_table_privilege` for `mw_app_dev` on `r005_cash_cutover_sources` is true.
- Image: Cloud Build `e56496ec-6e30-4b07-abea-c52e33611d92`, digest `sha256:6a63242d9a880e4d31e693868a4a3ba62572322600d62b3c3981a293cf5105cd`.
- Terraform: plan 0 add, 3 change, 0 destroy (image only), applied 17:33:56Z to 17:34:32Z, clean re-plan; settings generation `1794332078823352` (previous `1794302647577685`). Revisions: read `00081-8qt`, command `00098-wlm`, chat `00050-lp9`. Notify and jobs unchanged.
- Hosting `a87e2d7e285d4aa0` (previous `d48809b344706a34`), build version `b67e48cb771c9068c5605b3c`. Smoke passed, no ERROR logs.
- Rollback: settings generation `1794302647577685`, Hosting `d48809b344706a34`. V142 stays: a later migration restores the V141 bodies after pending rows are paid or deleted; fallback is the V141 backup.
- Functional test (Chase, API and a Pixel 7 Chromium read-only browser): a pending 40 baht expense dated 2026-11-05 (row `6f28d9e2...`) read `paymentState` pending with no ledger row and `expensesPayable` 0 to 40; a replay was idempotent; an edit to 55 baht stayed pending; paying with `R052-4G-ACCOUNT` wrote one BUSINESS_EXPENSE ledger row of -55 dated 2026-11-05 and `expensesPayable` returned to 0. A paid-now 25 baht expense behaved as before, and returning it to pending removed its ledger row (deleted afterwards). Chat proposal `e813ec87...` carried the consequence `pending_payment` (not confirmed). Left for the owner: pending 120 baht `fdf1b7b2...` "R140 DEV test pending for owner review", and paid 55 baht `6f28d9e2...`.
- UX check (Echo, WebKit iPhone 17 Pro Max, Thai, stopped at the review screens): EXP-PEND-1, 2, 3, 5, 6, 8, 9 as recommended; 13 to 16 fixed in `8822f0c`. Follow-ups: EXP-PEND-17 (tap the Expenses payable line to open a pending-filtered list); deferred: 7, 10 to 12 (separate pay date, pay form, undo).
- Hosting redeploy from `8822f0c` (PWA only, EXP-PEND-13 to 16; Forge): build-version `23ce7aaa9f3ac044fbd4607b`, entry `/assets/index-DuLE99Pn.js`, deployed 17:48:32Z to 17:48:40Z as version `b38755a8e1a44367` (rollback `a87e2d7e285d4aa0`); services unchanged; smoke passed.
- Read latency after R140: a `GET /api/offline-dataset` 503 (9.7 s) and one `command_store_unavailable` statement timeout at 17:40:57Z to 17:41:06Z on command `00098-wlm` coincided with two simultaneous full offline syncs (Echo's WebKit and Chase's Chromium sessions). Sequential DEV reads afterwards (Chase, 5 each): expense list median 709 ms, detail 312 ms, cash position 301 ms, dashboard 444 ms, offline-dataset chunks 0.4 to 1.4 s, no errors. Local EXPLAIN ANALYZE with 6,000 expenses and 3,000 cutover rows (Byte): the cutover check is a primary-key index-only lookup or one hash anti-join; expense reads unchanged within noise, cash position +2.7 ms for `expensesPayable`. Not attributed to R140.

### V143 and payee follow-up (Forge, Chase, Echo; 10 November 2026 UTC)
- Package `f123135`. Backup at V142: `dev-refresh-c7fe138f9a304de8ab2b4c6336ca06c8` (SHA-256 `f13896d0...1b0e`, restore test passed, 39 tables matched). Owner window 19:51:42Z to 19:59:19Z, including `mw_app_dev_journal_owner` (owns `pwa_submit_operation_v2`). V143 applied 19:51:57Z, validate ok, schema 143.
- Image: Cloud Build `7d5979fc-a73d-4598-8e68-4fd24caedd01`, digest `sha256:8f6cc65f3f01331823793d7b92ed2f3cb5aa4de04352be10667d7f4c378727de`. Terraform plan 0 add, 3 change, 0 destroy, applied 19:59:54Z to 20:00:42Z, generation `1794340849006810` (previous `1794332078823352`). Revisions: read `00082-qwm`, command `00099-kff`, chat `00051-5qf`. Hosting `3d9507907c6ff1ef`, build version `439b4bd3f85ad7466b59198d`. Smoke ok, no ERROR logs.
- Redeploy of `d622826` (Echo's EXP-PEND-26 to 29; Forge): image `f979e392-8045-48e4-b343-f09cc6c1287a`, digest `sha256:3253145209a6f2d12be4b624b8a20d0f74498faae2e91ee7d2d7a6db7fc1e71a`. Terraform 0/3/0 applied 20:21:04Z to 20:21:40Z, generation `1794342106741977` (previous `1794340849006810`). Revisions: read `00083-fvv`, command `00100-rxc`, chat `00052-q5n`. Hosting `a6461044acd84007`, build version `849de7bd69a1b750506d095c`. Smoke ok.
- Rollback: services generation `1794340849006810`, or `1794332078823352` for the pre-V143 image (only after a migration restoring the V142 bodies); Hosting `3d9507907c6ff1ef`; DEV backups at V142 (above) and V141.
- Functional test (Chase): a pending 60 baht expense with payee R120 Test Referrer (referrer) stored the link and the name snapshot, borrower `expensesOwed` went 0 to 60 with 1 item, and a replay was idempotent. Borrower search `isReferrer` was correct. An unknown id gave 422 `invalid_reference`; an id plus a name gave 400 `invalid_request`. An 8-key update kept the link (amount 65). Paying took owed back to 0. A typed payee "Dad (R140 DEV test)" for 90 baht was left pending. A throwaway borrower with a pending expense could not be deleted (422 `record_requires_reconciliation`, the borrower route's foreign key mapping) and was cleaned up afterwards. Browser: tile "ค้างจ่าย · payee", one Payee row with a link, and the borrower page "ค่าใช้จ่ายค้างจ่าย ฿45 · 1 รายการ".
- UX check (Echo, WebKit iPhone, Thai, read-only): EXP-PEND-18 to 25 as intended. Fixed in `d622826`: 26 typed-name row first with at most 8 results and Show more; 27 referrers first; 28 a chosen referrer labelled Referrer; 29 no trailing " -" in expense borrower labels (`services/business/expenses.mjs` only). A rebate payee now showing the borrower's live name was judged an improvement (an old rebate shows a renamed referrer's new name).
- Left in DEV for the owner: pending 45 baht `ac2b759e...` (payee R120 Test Referrer), 90 baht `86fb7b82...` (Dad (R140 DEV test)), 120 baht `fdf1b7b2...`; paid 65 baht `4888d101...` and 55 baht `6f28d9e2...`.

## Not run
No PROD action, authenticated PROD read or financial write. CI on `8822f0c` is pending. The WebKit service worker bypassed the read-only write block: one `POST /api/notifications/offline-dataset` reached the DEV command service per run, with no expense writes; the DEV test account's language is now Thai. Known DEV limit, not R140: an expense dated 2026-11-09 or later is refused with `record_requires_reconciliation` by the existing rule "Expense allocation requires a positive A/B contribution pool on its date", because DEV's contribution pool ends before 9 November; use a date on or before 8 November in DEV.

## Recovery
Git baseline: `b669c0d`, the commit before this batch. DEV image and Hosting: settings generation `1794302647577685` and Hosting `d48809b344706a34`. V142 is applied to DEV and stays; a later migration restores the V141 bodies, after pending rows created meanwhile are paid or deleted (the V141 guards refuse any update of a positive Manual expense without a payer). Fallback: the V141 backup.

## Open questions
- A pending expense paid later puts its cash movement on the Expense Date, not the pay date. Is that acceptable? A separate pay date needs a new column (follow-up only if the owner wants it).

## Remaining work
The owner's review in DEV; the cash-date decision; Echo's follow-ups EXP-PEND-17 and 25 (tappable payable and owed lines) and 7, 10 to 12 (pay date, pay form, undo; they depend on the pay-date decision) if wanted; CI result on `8822f0c`; promotion only on the owner's instruction. Before PROD, confirm `mw_app_prod` can SELECT `r005_cash_cutover_sources` (the V142 preflight refuses otherwise; the recorded PROD ACL lists it).
