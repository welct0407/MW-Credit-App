# R010 — OLTP GUI validation for predictable payment rejections

## Scope and status

Reserved 19 September 2026; implementation completed 20 September 2026. Status: **Ready for review**. The owner requested implementation in DEV OLTP of the first error-prevention proposal: reject predictable invalid user operations in the AppSheet GUI so users receive a form or action message instead of a later synchronization error.

The affected paths are direct payment entry, correction of cash account/cash holder on a Posted payment, and R008 quick-payment commands for Receive All, Receive Full and Loan Close. The database constraints remain the final integrity layer.

## Implemented DEV controls

- `Payments[Ref Borrower]`, `[Amount Received]` and `[Payment Date]` are required on new rows. Existing borrower concurrency, amount eligibility/whole-baht and no-future-date rules retain their logic and now show bilingual error text. `[Ref Received By Cash Account]` shows a bilingual active-account error.
- `Payments[Notes]` compares the edited Posted receipt with `_THISROW_BEFORE`. A receiving-account or derived-holder correction requires nonblank Notes that differ from the prior Notes and preserve the prior text as a prefix. The first LOOKUP-based draft falsely marked unchanged Posted receipts invalid; current-GUI testing found it and the rule was corrected before readiness.
- `Charges[Payment Request Cash Account]` offers active accounts only when `[Amount Remaining] > 0`; `Borrowers[...]` uses `[Todays Amount Remaining] > 0`; `Loans[...]` requires an open daily-interest loan, Auto Charge enabled, a valid nonfuture Loan Date, a nonnegative Current Daily Interest and positive Outstanding Principal. Each field has a bilingual rejection message and visible balance/prerequisite description.
- Existing Required_If expressions for the three one-field R008 command forms and the existing direct-payment Valid_If expressions remain in place. No bot, action, view, slice, table, SQL object or notification route changed.

## Baseline and rollback

- Starting Git commit: `ca79639667343a598a369d9cef84441d9bfb785f`; working tree clean.
- DEV OLTP: `MW-OLTP-DEV-20260919-578763613` (`500b27b6-884a-41e8-a9ec-df801b0110ad`), saved version **1.000033**, Deployed, editor diagnostics **No issues found**. Version **1.000033** is the recorded restorable rollback point before R010 edits.
- DEV OLAP remains **1.000015**. SQL remains Flyway **V26**. No database schema/data change is planned for this GUI-only batch.
- PROD remains R009 at OLTP **3.000231**, OLAP **1.100181**, SQL **V26**. No RC or PROD action is authorized by this development request.

AppSheet rollback restores DEV OLTP version 1.000033 if needed. Repository rollback uses a scoped revert of R010 commits while preserving later unrelated work. App rollback does not undo accepted data writes; all R010 runtime forms were cancelled or discarded and produced no financial write.

## Verification and evidence

- Saved/reloaded DEV OLTP version **1.000036**; editor diagnostics: **No issues found**; app remains Deployed.
- New blank receipt: Save stayed in `Payments Form` and displayed required-field messages for Ref Borrower and Amount Received. Cancelled; no row written.
- Unchanged Posted receipt: opened without the custom correction error after the `_THISROW_BEFORE` fix.
- Posted receipt account changed Dad → Lisa without changing Notes: Save stayed in the form and displayed the bilingual appended-reason error. The form was discarded; no row or ledger change was written.
- Quick-command zero/ineligible guards were independently read back from the saved editor. A live stale-race write was intentionally not manufactured; the command account list becomes empty and its visible field supplies the message when the current row is ineligible.
- The production model overview, DEV differences, environment inventory and workbook `Dev Differences` rows 2790–2811 are updated. Workbook export/reimport readback and rendered review passed.
- Implementation checkpoint: `eba6f4571fe86cbf3aa584c323e547933a8636fc`.

[Report](../outputs/r010-20260919/REPORT.md), [tests](../outputs/r010-20260919/TESTS.md), [saved readback](../outputs/r010-20260919/dev-saved-readback.json), [manifest](../outputs/r010-20260919/release-manifest.json).

## Readiness and remaining work

**Ready for review.** DEV acceptance, RC creation and production authorization are not recorded. Normal promotion requires an integrated PROD-mapped immutable R010 RC and the current App Upgrade workflow. PROD and SQL remain unchanged.
