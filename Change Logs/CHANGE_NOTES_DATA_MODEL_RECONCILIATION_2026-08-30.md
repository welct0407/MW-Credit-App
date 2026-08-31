# Data Model Reconciliation — 2026-08-30

## Summary

Reconciled the OLTP and OLAP AppSheet data-model definitions against the maintained Markdown overview and Excel data dictionary. No live AppSheet configuration was changed; this revision corrects and enriches the documentation only.

## Live baselines

| App | Version | App ID |
| --- | --- | --- |
| OLTP — Loan Manager ผู้จัดการสินเชื่อ | 2.200075 | `93844270-6aa5-420b-a960-bcdf08abd357` |
| OLAP — Loan Business Insights | 1.000148 | `e74dd368-654f-44d7-bccf-83cf361d1cdb` |

Reconciliation was performed on 30 August 2026 in Asia/Singapore.

## Reconciliation results

- Confirmed 11 loaded-table definitions across the two apps: 6 in OLTP and 11 in OLAP.
- Confirmed all 296 unioned physical and virtual columns, including names, kinds, types, availability, and per-table counts.
- Confirmed all 8 direct Ref relationships, their target tables, and their `Is a part of?` settings.
- Confirmed 12 live slices: 1 in OLTP and 11 in OLAP.
- Removed the obsolete documented OLTP `Payment Collection` slice and its 22 slice-column rows because the slice is not present in the live OLTP app.
- Added current Key, Label, Required, and PII flags to the Excel Columns inventory, including app-specific flag differences.
- Recorded app-specific formulas for four shared virtual columns:
  - `Borrowers[Return on Active Principal]`
  - `Borrowers[Daily Collection Status]`
  - `Loans[Expected Interest This Month]`
  - `Statistics[Profit Coverage of Outstanding Principal]`

## Documentation updated

- `Documents/AppSheet_Data_Model_Overview.md`
- `Documents/AppSheet_Data_Dictionary.xlsx`
- `Change Logs/CHANGE_NOTES_DATA_MODEL_RECONCILIATION_2026-08-30.md`

The workbook Change Log worksheet remains reserved for historical context. Markdown files in `Change Logs/` are the authoritative audit trail.

## Important live variance retained

The live OLTP and OLAP formulas for `Loans[Expected Interest This Month]` are not equivalent. OLTP includes accrued but uncharged daily interest; OLAP currently forecasts only the remaining days in the month. The documentation now records both formulas without changing either app.

## Verification

- Re-imported and inspected the completed workbook: 8 worksheets and 8 Excel tables.
- Confirmed final counts: 11 tables, 296 unioned columns, 8 relationships, and 12 slices.
- Confirmed the Slices table ends at row 16 and Slice Columns ends at row 323 after removing the retired slice.
- Scanned the workbook for common formula errors; none were found.
- Rendered and visually reviewed every worksheet after the update.

## Scope boundary

This reconciliation covered structural configuration visible in the AppSheet editors. It did not execute workflows or bots, inspect production records, validate row-level financial outcomes, or change security settings.
