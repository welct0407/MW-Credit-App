# Page 7 implementation change notes — 2026-08-29

## Scope

- OLAP AppSheet app: `Loan Business Insights`
- Looker Studio report: `Loan Reports - Mobile`
- Requested page: `Borrower Insight & New Loan Assessment`
- Source design: `C:\Users\zhcyi\Downloads\Page 7 Design.docx`

## Rollback points recorded before editing

- AppSheet version: `1.000144`
- Looker Studio backup: `Loan Reports - Mobile - Backup 2026-08-29 pre-page-7`
- Looker Studio backup report ID: `319df387-b12d-4701-a6f8-54a3652486cc`
- Backup creation date: `2026-08-29`

## Change log

### AppSheet OLAP configuration

- Final AppSheet version after the change: `1.000147`.
- Added reporting virtual columns for historical payment timeliness, recent/lifetime borrower behaviour, default history, successful-loan history, and portfolio exposure/projection inputs.
- Added the new fields to the existing curated reporting slices:
  - `Reporting Borrowers`
  - `Reporting Charges`
  - `Reporting Loans`
- Added `Borrower Name` to `Reporting Charges` so the Page 7 borrower selector can filter the Charges-based payment-behaviour chart.
- No physical AppSheet database table, column, or financial record was created or changed.

### Looker Studio

- Added Page 7, `Borrower Insight`, with the heading `Borrower Insight & New Loan Assessment`.
- Added the `Proposed Loan Amount` parameter and borrower-level projection/status calculated fields.
- Added current-position scorecards, borrower selector, proposed-loan input, projected exposure, projected portfolio share, payment behaviour, loan amount history, borrower loan history, qualitative credit assessment, and retained the existing borrower risk monitor.
- The qualitative assessment table uses:
  - `Exposure Status`
  - `Concentration Status`
  - `Payment Behaviour Status`
  - `Recent Behaviour Status`
  - `Primary Warning`
  - `Default Count`
  - `Lifetime Default Loss`
- Widened the borrower history and qualitative assessment tables to the full reporting canvas.
- Removed five inherited Page 7 chart-level filter references that were invalid for the new data sources. The reusable report filters and the original `Risks` page were retained unchanged.
- The projected portfolio share is scaled to a whole-number percentage and labeled `Projected Portfolio Share (%)`.

## Checks performed

- AppSheet editor reported no configuration issues after saving the virtual-column and slice changes.
- Refreshed the Borrowers, Charges, and Loans Looker data sources and confirmed the new fields were available.
- Confirmed Page 7 in edit and view modes has no `Invalid filter`, `Invalid dimension`, or configuration error messages.
- Confirmed the original `Risks` page still has no filter or dimension errors after the Page 7 filter detachments.
- Smoke-tested the borrower selector: borrower-level scorecards changed from portfolio totals to the selected borrower.
- Smoke-tested the proposed-loan parameter with a synthetic amount: projected portfolio share changed from `48` to `55`, then the temporary input was reset to `0` and the report was reloaded to its neutral view.
- Visually checked the saved Page 7 layout and the full-width lower tables.

## Manual acceptance checklist

- Select several borrowers, including one with no prior loans, one with late/overdue charges, and one with closed/defaulted loans; confirm every Page 7 section follows the borrower selection.
- Enter proposed loan amounts at `0`, a normal amount, and a deliberately large amount; confirm projected exposure/share and the qualitative statuses respond as expected.
- Reconcile outstanding principal, active-loan count, overdue amount, interest earned, on-time/late history, default count, and default loss with the governed AppSheet records.
- Check the report on the intended mobile viewport and verify long status/warning text remains readable.
- Confirm viewer permissions and refresh timing with a normal report viewer account.

## Rollback

- AppSheet: restore version `1.000144` from **Manage > Versions > Version History**.
- Looker Studio: use `Loan Reports - Mobile - Backup 2026-08-29 pre-page-7` (report ID `319df387-b12d-4701-a6f8-54a3652486cc`) as the pre-change copy.
- These changes have not been treated as accepted or deployed; manual user acceptance is still required.

---

## Page 7 improvement pass — 2026-08-29

### Fresh rollback points recorded before the improvement pass

- AppSheet version: `1.000147`
- Looker Studio backup: `Loan Reports - Mobile - Backup 2026-08-29 pre-page-7-improvements`
- Looker Studio backup report ID: `de4ec0dc-556f-4337-b668-6e8b420d2de4`
- Backup creation date: `2026-08-29`

### Changes saved

- Final AppSheet version after this pass: `1.000148`.
- Corrected the `Overdue Amount` scorecard from `Total Interest Earned` to the governed `Overdue Amount` metric and removed its inappropriate `Last Late Payment Date` date-range dimension.
- Added the reusable Charges field `Payment Timing`, mapping `Historical Late = TRUE` to `Late` and all other rows to `On time`; reassigned the monthly payment-behaviour breakdown to this field.
- Added `Row ID` to `Borrower Loan History`, displayed as `Loan ID`, so loans issued on the same date remain separate records.
- Retitled the ambiguous `Loan Amount History` visual to `Borrower Outstanding Principal History (data required)` so the incomplete chart is not presented as a valid history.
- Converted the portfolio-share presentation to two titled donut visuals, `Current Portfolio Share` and `Proposed Portfolio Share`; the proposed calculation returns null until `Proposed Loan Amount` increases projected exposure.
- Added OLAP reporting helper virtual columns and exposed them through the curated reporting slices while testing connector-safe portfolio-share joins:
  - Borrowers: `Portfolio Share Join Key`
  - Daily Analytics: `Portfolio Share Join Key`, `Portfolio Slice`
  - Slices: `Reporting Borrowers`, `Reporting Daily Analytics`
- Refreshed the Borrowers and Daily Analytics Looker data-source schemas and removed superseded Looker-only helper fields with the same names.
- Repaired all stale blend field references after the schema refresh. The live Page 7 check no longer reports `Invalid dimension` or `System Error`.
- No physical AppSheet database table, physical column, or financial record was created or changed.

### Confirmed limitation / approval required

- The AppSheet Looker connector validates the two-row portfolio blend but does not materialize its synthetic cross-joined rows; therefore the two donut containers remain blank rather than displaying a misleading percentage.
- A correct continuous selected-borrower outstanding-principal history cannot be reconstructed from loan issue dates or current balances. The existing `Daily Analytics` table is portfolio/date grain and has no borrower dimension.
- The requested large qualitative-assessment guide could not be placed safely between existing responsive-layout groups without displacing or overlaying the retained `Borrower Risk Monitor`; no overlapping text box was left in the report.
- Completing these items requires explicit approval for two small governed physical reporting structures:
  - `Reporting Portfolio Share Helper`: exactly two static rows (`Selected borrower`, `Remaining`).
  - `Borrower Daily Analytics`: one row per borrower per snapshot date, including auditable outstanding principal EOD and generation metadata.

### Checks performed in this pass

- AppSheet reported no configuration issues after saving version `1.000148`.
- Refreshed affected Looker data sources and forced a report data refresh.
- Confirmed the live Page 7 has no invalid-dimension or system-error messages after field repair.
- Confirmed the payment-behaviour source exposes meaningful `On time` / `Late` labels.
- Confirmed the history table is configured with `Loan ID` as a dimension rather than a metric, preventing same-day aggregation.
- Confirmed no physical database changes were made.

### Manual acceptance checklist for this pass

- Select borrowers with and without overdue charges and reconcile `Overdue Amount` to the AppSheet borrower record.
- Confirm the payment-behaviour legend reads `On time` and `Late` and that counts reconcile with Charges.
- Confirm same-day loans appear as distinct `Loan ID` rows.
- Confirm all pre-existing Page 7 visuals and the retained `Borrower Risk Monitor` remain readable on the intended mobile viewport.
- After approval and implementation of the two reporting structures, test current/projected portfolio donuts at proposed amounts `0`, normal, and unusually large, and reconcile borrower daily principal to the loan/repayment ledger.

### Improvement-pass rollback

- AppSheet: restore version `1.000147` from **Manage > Versions > Version History**.
- Looker Studio: use `Loan Reports - Mobile - Backup 2026-08-29 pre-page-7-improvements` (report ID `de4ec0dc-556f-4337-b668-6e8b420d2de4`).
