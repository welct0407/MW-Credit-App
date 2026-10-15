# R003 — Production AppSheet reconciliation correction — 16 September 2026

Status: **Released.** The owner explicitly instructed: “fix all the gaps in prod”. R003 corrected every failed AppSheet object in the R001 reconciliation report. It did not change PostgreSQL schema/data, Looker Studio, notification recipients or production financial records.

## Scope and versions

- Production OLTP `93844270-6aa5-420b-a960-bcdf08abd357`: **3.000118 → 3.000121**.
- Production OLAP `e74dd368-654f-44d7-bccf-83cf361d1cdb`: **1.100098 → 1.100101**.
- Flyway remains **V16**. Both apps remain on `database-2` and are runnable/deployable.
- Rollback points recorded before editing: OLTP **3.000118**, OLAP **1.100098**.
- R002 development-only changes were excluded.

## Corrections

- Converted `Borrowers.Ref Referrer` to the intended self-Ref in both apps, with bilingual display name, OLTP self-reference exclusion and OLAP read-only behavior.
- Added Referrer to all four OLTP base/slice borrower form/detail views. Added Referrer, Related Referral Expenses and Total Referral Rebate Earned to OLAP borrower detail.
- Reconciled OLAP Business Expenses: `_RowNumber` is not a key; hidden Text `Row ID` is the sole key; borrower/loan columns are Refs; money is baht Price with zero decimals; partner shares are Percent; the unintended reverse Daily Analytics relationship is absent.
- Restored the two generated borrower expense lists and the loan reverse list, plus their required borrower/loan slice memberships.
- Restored OLTP Amount validation for nonzero whole-baht values and notes on negative offsets. Reconciled all expense price/percent types and the OLTP deck's automatic primary header.
- Retained the two already-correct OLTP amount-color rules. Added the genuinely missing OLAP rules: positive Amount red `#C62828`, negative Amount green `#2E7D32`.
- Converted OLAP `Daily Analytics.Business Expenses` to physical whole-baht Price and reconciled Net Profit / Net Unsettled Profit EOD formatting and all four affected analytics slices.
- Replaced gross partner detail fields with `Net Profit Earned` and `Net Available to Settle`, using the released bilingual labels.
- Applied the edit-safe `Settlements.Amount` validation that excludes the current row and permits an unchanged existing reservation.
- Added Total Business Expenses, Net Profit, Expenses MTD and Net Profit MTD to Analytics Data in the released order.

## Verification

- Reloaded saved app documentation after the final saves. OLTP **3.000121** and OLAP **1.100101** report Runnable **Yes** and Deployable **Yes**.
- Compared all corrected schema properties with the R001 development definitions. All selected properties match; the only serialization difference is an empty settlement error-message string in production versus null in development, with identical validation behavior.
- All four OLTP borrower view orders match development and include Ref Referrer. The Business Expenses deck configuration matches development.
- OLAP Borrowers_Detail, Partners_Detail and Analytics Data column orders match development.
- All four OLAP borrower slices and all four Daily Analytics slices match development. Reporting Loans contains Related Business Expenses; its pre-existing Charge Generation Request / Related Payments ordering difference is outside R001 and was preserved.
- Generated relationships are present: two borrower expense reverse lists and Loans.Related Business Expenses. `Business Expenses.Related Daily Analytics` is absent.
- Production OLAP contains 48 format rules, including the two expense rules with exact R001 conditions, target and colors. OLTP's two equivalent rules remain enabled.
- Current production OLTP synced and opened the unsaved Visible Borrowers form with `ผู้แนะนำ / Referrer`; the obsolete Related Loans control was absent. The form was cancelled.
- Current production OLAP synced and rendered Analytics Data with Total Business Expenses, Total Net Profit, Expenses MTD and Net Income in the released order.
- No production record was saved, no bot was executed and no notification was forced. Bot definitions, destinations, source bindings and cross-app links were not edited.

## Documentation

Updated the release tracker, R001 audit resolution, business-expense production record, environment inventory, data-model overview and detailed data dictionary. The dictionary now records the production app versions, Business Expenses/referral/net fields and relationships, affected slice memberships and R003 reconciliation status. Its XLSX export round-tripped all sheets and the formula-error scan passed.

Detailed evidence: [R003 report](../outputs/r003-production-appsheet-reconciliation-20260916/REPORT.md).

## Remaining limitations

No production financial fixture was created. SQL referral creation, duplicate prevention, expense allocation and settlement enforcement rely on the accepted development tests and the unchanged V16 database release. Mobile/offline behavior, notification delivery and Looker Studio were outside this AppSheet-only correction.

## Rollback

Restore OLTP **3.000118** and/or OLAP **1.100098** if the corresponding R003 AppSheet save causes a problem. R003 has no database change, so ordinary R003 rollback must not restore the older R001 database dump or discard later production data.
