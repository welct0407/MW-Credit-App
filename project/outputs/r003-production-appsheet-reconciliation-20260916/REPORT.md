# R003 production AppSheet reconciliation — 16 September 2026

## Result

**Passed.** Corrective release R003 resolved every AppSheet gap listed by the R001 development-to-production audit.

Production is now OLTP **3.000121** and OLAP **1.100101**, both runnable/deployable on `database-2`. Flyway remains **V16**. No database schema/data, financial record, notification recipient or Looker Studio object changed.

## Authorization and rollback

The owner authorized the production correction with: “fix all the gaps in prod”. Before editing, the recorded AppSheet rollback points were OLTP **3.000118** and OLAP **1.100098**.

## Reconciliation checklist

| R001 discrepancy | R003 result | Verification |
| --- | --- | --- |
| Referrer metadata and borrower views | Pass | Both apps use Ref to Borrowers.Row ID. OLTP has the self-reference exclusion and all four borrower form/detail views include Referrer. OLAP is read-only and borrower detail includes Referrer plus both referral-rebate VCs. |
| OLAP Business Expenses regeneration metadata | Pass | Row ID is the sole hidden Text key; `_RowNumber` is not a key; three relationship fields are Refs. Generated borrower/loan lists and required slices are present. The unintended Related Daily Analytics reverse column is absent. |
| Expense validation and numeric formatting | Pass | OLTP Amount uses the released nonzero/whole-baht/negative-note validation. Price fields use baht/zero decimals and partner shares use Percent. The OLTP deck uses automatic primary header. |
| Expense color rules | Pass | OLTP's existing equivalent rules were retained. OLAP now has the two missing rules with `[Amount] > 0` / red `#C62828` and `[Amount] < 0` / green `#2E7D32`, targeting Amount. |
| Daily Analytics expense relationship/format | Pass | Business Expenses is physical Price, not Ref. It and both net fields use baht/zero decimals and are present in all four released analytics slices. |
| Net partner and settlement presentation | Pass | Partner detail uses Net Profit Earned and Net Available to Settle in the released order/labels. Settlement Amount has the edit-safe net-availability validation. |
| Analytics Data net fields | Pass | Total Business Expenses, Net Profit, Expenses MTD and Net Profit MTD appear in the released order. |

## Saved-definition comparison

- OLTP selected column properties match development for Ref Referrer and all R001 Business Expenses price/percent/source fields.
- OLTP Borrowers_Form, Borrowers_Detail, Visible Borrowers_Form and Visible Borrowers_Detail match development column order; all contain Ref Referrer.
- OLTP Business Expenses deck configuration matches development.
- OLAP selected column properties match development for borrower/referral fields, Business Expenses keys/Refs/types, Daily Analytics net fields, partner labels and Statistics fields.
- `Settlements.Amount` has the same Valid_If as development. Production serializes a cleared error message as an empty string while development serializes null; behavior is the same.
- OLAP Borrowers_Detail, Partners_Detail and Analytics Data match development column order.
- Four borrower slices and four Daily Analytics slices match development exactly. Reporting Loans contains the required Related Business Expenses; its unrelated pre-existing ordering difference was preserved.
- OLAP has 48 format rules, matching development count after the two R001 expense rules were added.

## Current-GUI entry points

- Production OLTP synced. The unsaved Visible Borrowers form displayed `ผู้แนะนำ / Referrer` and did not display the obsolete Related Loans control. It was cancelled without saving.
- Production OLAP synced. Analytics Data rendered Total Business Expenses, Total Net Profit, Expenses MTD and Net Income in the saved order with baht whole-unit display.
- No production financial test row, bot run or notification was created.

## Documentation evidence

The detailed data dictionary was updated through the maintained Artifact Tool script. All sheets round-tripped through XLSX export; the error scan found no spreadsheet formula errors. Rendered verification images and `dictionary-verification.json` are stored beside this report.

## Limitations

No production financial fixture was created. Database calculation/trigger behavior remains supported by the accepted V16 development and release evidence. Mobile/offline use, device notification delivery and Looker Studio were not retested because R003 changed only AppSheet configuration.

## Recovery

Restore OLTP **3.000118** and/or OLAP **1.100098** for an AppSheet-only rollback. Do not restore the older R001 database dump for ordinary R003 recovery; R003 did not change the database.
