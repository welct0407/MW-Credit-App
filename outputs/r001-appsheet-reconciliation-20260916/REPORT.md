# R001 AppSheet development-to-production reconciliation — 16 September 2026

## Result

**Failed. R001 is deployed, but its AppSheet configuration is not fully reconciled in production.** The production database/Flyway state was not changed or retested in this audit. The affected production versions remain OLTP **3.000118** and OLAP **1.100098**, both runnable/deployable and bound to `database-2`.

The earlier R001 AppSheet scopes reconcile. The failures are concentrated in the Business Expenses, borrower-referral and net-reporting promotion. The most visible confirmed defect is that production OLTP does not show Referrer in the borrower form, and production OLAP does not show Referrer or referral-rebate totals in borrower detail.

No production record, configuration or bot was changed. Runtime forms were opened read-only/unsaved and cancelled.

## Comparison basis

- R001 intended state: the checked-in assessment, payment, interval, monitored-job, materialization and business-expense release records, including the accepted business-expense refinements in commits `e75a5fd` and `88df80b`.
- Production: live current AppSheet app documentation, current editor and current runtime for OLTP `93844270-6aa5-420b-a960-bcdf08abd357` and OLAP `e74dd368-654f-44d7-bccf-83cf361d1cdb`.
- Development: live app documentation for OLTP `65faacd8-2b0d-43bf-9e0a-58eb915dcf9b` and OLAP `494cd013-0d9b-482f-9559-c9d83059de91`, used only for R001 objects. Current development includes R002, so R002 borrower-name, format-rule and later action differences were excluded.

## Scope result

| R001 AppSheet scope | Result | Evidence |
| --- | --- | --- |
| SQL Loan Assessment app configuration | Pass | Production OLAP uses `Loan Assessment SQL Lab View` on `database-2`; schema and the main/form/detail views match the R001 development definition. |
| Atomic payments, lump-sum close/default and charge processing | Pass | The 21 named R001 operational actions checked in production match the R001 development definitions; closing-payment, target-loan and charge-request fields and the affected loan/payment views match. |
| Interest Schedule Anchor Date | Pass | Present as Date in both apps, editable in OLTP and read-only in OLAP; affected views/actions match. |
| Monitored schedules and Calendar removal | Pass | Calendar is absent. OLTP `Generate Daily Charges` is enabled at 00:05 and the superseded first-day/payment bots are disabled. OLAP `Refresh Daily Analytics Daily` is enabled hourly and `Daily Loan Analysis Export` is disabled. |
| Materialized operational balances | Pass | All 24 R001 physical fields are present in both production apps, read-only, non-virtual and without App formulas. The four obsolete Payment Allocations calculated VCs are absent. |
| Business Expenses base access | Partial | The table exists on `database-2`; OLTP is `ADDS_AND_UPDATES`, OLAP is `READ_ONLY`; the production OLTP menu and seven-field form open. Metadata failures below remain. |
| Borrower referral configuration | **Fail** | Referrer is not configured or presented as released; OLAP referral VCs and reverse relationships are missing. |
| Expense/net reporting presentation and validation | **Fail** | Multiple schema, formatting, slice, detail-view and settlement-validation differences remain. |
| KPI dashboards | Pass with downstream gaps | Both production dashboards render Total Net Profit and Income Statement MTD. OLAP Analytics Data and partner detail do not contain the released net-field substitutions. |

## Unreconciled production objects

### R001-APP-01 — Referrer is not implemented correctly in either production app

- `Borrowers.Ref Referrer` is `LongText` in both production apps. R001 requires a Ref to `Borrowers.Row ID`.
- Production OLTP has no self-reference exclusion or bilingual Referrer display name.
- Production OLAP leaves the column statically editable instead of read-only.
- Production OLTP omits Ref Referrer from `Borrowers_Form`, `Borrowers_Detail`, `Visible Borrowers_Form` and `Visible Borrowers_Detail`.
- The live production OLTP Add Borrower form was opened and confirmed to contain no Referrer field; it was cancelled without saving.
- Production OLAP `Borrowers_Detail` omits Ref Referrer, Related Referral Expenses and Total Referral Rebate Earned. A live borrower detail was opened and confirmed to show none of those fields.
- Production OLAP does not contain the `Related Referral Expenses` and `Total Referral Rebate Earned` virtual columns.

### R001-APP-02 — OLAP Business Expenses regenerated metadata was not reconciled

- `_RowNumber` is the production OLAP key; `Row ID` is LongText, visible and not a key. R001 requires hidden Text `Row ID` as the sole key.
- `Ref Payee Borrower`, `Ref Related Borrower` and `Ref Related Loan` are LongText instead of Refs.
- The two generated borrower expense reverse lists are absent from the OLAP Borrowers schema and from four borrower slices: Borrowers with Outstanding Loans, Profit Contribution 30D, Reporting Borrowers and Todays Collection Board.
- `Reporting Loans` omits Related Business Expenses.
- The invalid key/Ref interpretation generated an unintended `Business Expenses.Related Daily Analytics` reverse column.

### R001-APP-03 — Expense field rules and formatting are incomplete

- Production OLTP `Business Expenses.Amount` has no R001 nonzero/whole-baht/negative-note validation and displays `$` with two decimals instead of `฿` with zero decimals.
- Gross Profit Basis, Partner A Expense and Partner B Expense also use `$`/two decimals in production; partner shares are Decimal instead of Percent in both production apps.
- Production OLAP expense and net-analytics money fields retain `$`/two-decimal formatting.
- The positive-red and negative-green Business Expenses format rules are absent from both production apps.
- The OLTP Business Expenses deck uses Expense Category as the primary header; the accepted R001 refinement uses automatic primary header.

### R001-APP-04 — Daily Analytics has a wrong production relationship

- Production OLAP `Daily Analytics.Business Expenses` is a Ref to Business Expenses keyed through `_RowNumber`. R001 requires a physical whole-baht Price field.
- `Daily Analytics.Net Profit` and `Net Unsettled Profit EOD` exist, but their production formatting remains `$` with two decimals rather than `฿` with zero decimals.

### R001-APP-05 — Net partner and settlement presentation did not reach the final R001 state

- `Partners_Detail` still shows gross `Total Profit Earned` and `Available to Settle`; R001 requires the same display positions to use `Net Profit Earned` and `Net Available to Settle`.
- The net partner VCs exist, but their released bilingual display labels are absent.
- `Settlements.Amount` uses the earlier simple check against Net Available to Settle. It lacks the accepted edit-safe validation that excludes the current settlement and allows an unchanged existing reservation.
- `Analytics Data` omits Total Business Expenses, Net Profit, Expenses MTD and Net Profit MTD, although the underlying Statistics fields exist.

## Production entry-point checks

- OLTP Dashboard synced and displayed Total Net Profit and Income Statement MTD.
- OLAP Dashboard synced and displayed Total Net Profit, Income Statement MTD, Net Unsettled Profit and Net Expected Loan Account Balance.
- OLTP Borrowers list loaded; Add Borrower opened without Referrer and was cancelled.
- OLAP Borrowers list and a borrower detail loaded; Referrer and referral-rebate fields were absent.
- OLTP Business Expenses menu and form loaded with Expense Date, Expense Category, Amount, Payee Name and optional related borrower/loan fields; the form was cancelled.
- No production save, financial test write, bot execution or notification was triggered.

## Release decision and required follow-up

R001 must remain recorded as released because its SQL and app versions are already in production, but its post-release reconciliation status is **failed**. Do not treat the business-expense/referral AppSheet portion as accepted production parity.

A corrective release must use a new release number, preserve current production data and bots, record fresh OLTP/OLAP rollback versions, compare every listed object against the intended R001 definition, and repeat the current-GUI entry-point checks before it can be marked reconciled. Production correction still requires explicit owner approval under `AGENTS.md`.
