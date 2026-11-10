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

## Checks
| Command | Result |
| --- | --- |
| Byte's local checks | To be filled |
| Chase's verification | To be filled |
| CI, pull request head | To be filled |
| DEV deployment and test | To be filled, see DEV deployment evidence |
| `python3 project/scripts/dictionary/dictionary.py validate` | Pass after the five dictionary updates (Dewey) |
| `npm run check:docs` | See the final check below |

## DEV deployment evidence
To be filled by Forge after the DEV deployment (Flyway, images, Terraform, smoke) and Chase's functional test.

## Not run
To be filled. No PROD action and no financial write in this batch; DEV only until the owner's review and instruction.

## Recovery
Git baseline: the commit before this batch (`b669c0d`). V142 is not applied yet. Once applied, a later migration restores the V141 bodies; pending rows created meanwhile must be paid or deleted first. Image and Hosting rollback by settings generation, to be recorded with the DEV deployment.

## Open questions
- The cash movement of a later payment is dated on the Expense Date, not the day it is paid. Is that acceptable, or should a "Paid Date" column follow?

## Remaining work
Chase's verification, push and CI, DEV deployment and test, the owner's review in DEV, then promotion only on the owner's instruction.
