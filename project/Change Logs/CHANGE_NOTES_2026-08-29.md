# Reporting slices change notes — 2026-08-29

## Scope

- OLAP AppSheet app: `Loan Business Insights`
- Looker Studio report: `Loan Reports - Mobile`
- Requested slices: `Reporting Statistics` and `Reporting Daily Analytics`

## Rollback points

- AppSheet version before editing: `1.000142`
- AppSheet version after editing: `1.000144`
- Looker Studio backup: `Loan Reports - Mobile - Backup 2026-08-29 pre-reporting-slices`
- Backup report ID: `801830b8-eb4e-4137-b405-c746b4f3ec61`
- Backup creation date: `2026-08-29`

## Planned change

- Create two read-only reporting slices containing only fields required by the live Looker Studio report.
- Reconnect the report's Statistics and Daily Analytics data sources to those slices.
- Verify all existing report pages and visuals after reconnection.

## Implemented changes

### Reporting Statistics

- Source: `Statistics`
- Update mode: read-only
- Dashboard fields: `Outstanding Principal`, `Active Loans`, `Realized Profit MTD`, `Projected Monthly Profit`, `Peak Cash Pool Date 30D`, `Expected Daily Interest`, `Total Cash Pool`, `Total Unsettled Profit`, `Expected Loan Account Balance`, `Top 3 Borrower Concentration`, `Amount Due Today`, `Amount Collected Today`, `Amount Outstanding Today`, and `Amount Collection Rate Today`.
- Calculated-field dependency: `Total Outstanding Principal` is required by Looker Studio's `Cash Pool Utilization` field.
- AppSheet-required fields: `_RowNumber` and key `Row ID`.

### Reporting Daily Analytics

- Source: `Daily Analytics`
- Update mode: read-only
- Dashboard fields: `Snapshot Date`, `Principal Issued`, `Principal Returned`, `Interest Received`, `Outstanding Principal EOD`, `Active Loans EOD`, `Active Borrowers EOD`, `Pending Charges EOD`, and `Daily Capital Yield`.
- AppSheet-required fields: `_RowNumber` and key `Row ID`.

### Looker Studio

- Reconnected the reusable `Loan Business Insights: Statistics` source to `Reporting Statistics`.
- Reconnected the reusable `Loan Business Insights: Daily Analytics` source to `Reporting Daily Analytics`.
- Preserved Looker Studio calculated fields, including the two label-safe principal fields and `Cash Pool Utilization`.

## Verification performed

- Confirmed both AppSheet slices saved as read-only with the expected columns.
- Confirmed the Daily Analytics source resolves to 13 fields: 10 connector fields plus 3 existing Looker calculated fields.
- Confirmed the Statistics source resolves to 18 fields: 16 connector fields plus 2 existing Looker calculated fields.
- Loaded all six current report pages: Overview, Cash, Borrowers, Performance, Risks, and Daily Collection.
- Found no data-set configuration, invalid-field, system, or connection errors.
- Confirmed representative scorecards still reconcile, including Total Cash Pool `100,000`, Outstanding Principal `64,000`, Available Cash `36,000`, Cash Pool Utilization `64%`, Top 3 Borrower Concentration `66%`, and Amount Collection Rate `30%`.

## Rollback

- AppSheet: restore version `1.000142` from Manage > Versions.
- Looker Studio: use backup report `Loan Reports - Mobile - Backup 2026-08-29 pre-reporting-slices` (report ID `801830b8-eb4e-4137-b405-c746b4f3ec61`) and reconnect or replace the original report if required.

## Change status

- Implementation and available browser verification complete; awaiting user manual acceptance testing.
