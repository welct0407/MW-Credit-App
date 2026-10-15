# OLAP Accrued-Interest Dependency Repair — 2026-08-30

## Status

Implemented and saved in AppSheet. The editor reports no issues and the embedded OLAP Analytics preview loads. User runtime testing remains pending.

## Incident and cause

The prior OLTP-to-OLAP alignment copied the `Loans[Expected Interest This Month]` formula into OLAP without copying its OLTP-only `Accrued Interest` dependency. OLAP became non-runnable because the formula referenced a column that did not exist in the target app.

The prior validation compared only VCs already present in both apps. That method could confirm configuration equality for the intersection, but it could not detect missing formula dependencies. It also treated a clean shared-VC comparison as sufficient without confirming that the target app preview was runnable.

## AppSheet versions and rollback point

| App | Version | Role |
| --- | --- | --- |
| Loan Manager ผู้จัดการสินเชื่อ | 2.200075 | OLTP source baseline; unchanged |
| Loan Business Insights | 1.000148 | Last known runnable OLAP version before the original alignment; safe rollback target |
| Loan Business Insights | 1.000150 | OLAP state immediately before the repair; retained for audit but not suitable for rollback |
| Loan Business Insights | 1.000151 | OLAP version after the repair |

OLAP App ID: `e74dd368-654f-44d7-bccf-83cf361d1cdb`.

## Dependency analysis

The complete OLTP dependency path is:

`Loans[Related Charges]` → `Loans[Last Interest Charge Date]` → `Loans[Accrued Interest Days]` → `Loans[Accrued Interest]` → `Loans[Expected Interest This Month]`

The physical inputs `Loan Date`, `Loan Type`, and `Current Daily Interest`, plus the `Related Charges` reverse-reference VC, already existed in OLAP and required no change.

## OLAP changes

Added these VCs to `Loans` in dependency order, matching OLTP configuration:

1. `Last Interest Charge Date`
   - Type: `Date`
   - Formula: `MAX([Related Charges][Charge Date])`
   - Searchable: enabled
2. `Accrued Interest Days`
   - Type: `Number`
   - Formula: `IF( ISBLANK([Last Interest Charge Date]), TOTALHOURS(TODAY() - [Loan Date])/24, TOTALHOURS(TODAY() - [Last Interest Charge Date])/24)`
3. `Accrued Interest`
   - Type: `Price`
   - Formula: `IF( [Loan Type] = "ดอกเบี้ยรายวัน", [Current Daily Interest] * [Accrued Interest Days], 0)`
   - Show_If: `[Loan Type] = "ดอกเบี้ยรายวัน"`

No OLTP definitions or production rows were changed.

## Documentation updated

- `Documents/AppSheet_Data_Model_Overview.md`
- `Documents/AppSheet_Data_Dictionary.xlsx`
- `Change Logs/CHANGE_NOTES_OLAP_SHARED_VC_ALIGNMENT_2026-08-30.md`
- `Change Logs/CHANGE_NOTES_OLAP_ACCRUED_INTEREST_DEPENDENCY_REPAIR_2026-08-30.md`

## Checks performed

- Confirmed the live OLAP error: `Expected Interest This Month` could not find `Accrued Interest` in `Loans`.
- Traced the complete dependency chain from the OLTP definitions.
- Confirmed all prerequisite physical inputs and `Related Charges` already existed in OLAP.
- Compared the three new OLAP VCs field by field with OLTP before save; no differences remained.
- Saved OLAP as version 1.000151.
- Confirmed AppSheet reported `No issues found` after save.
- Confirmed the embedded OLAP Analytics dashboard loaded with KPI values instead of the non-runnable error.
- Recompared all 81 VCs now shared by the apps across type, formula, Show/Show_If, key, label, editable, required, initial value, display name, description, searchable, scannable, NFC, and PII settings; zero differences remained.
- Re-imported, scanned, rendered, and visually reviewed the updated Excel dictionary.

## Manual testing required

1. Open or sync OLAP from a normal user session and confirm it loads without a definition error.
2. Open a daily-interest loan with no related Charge and confirm `Accrued Interest Days` uses `Loan Date`.
3. Open a daily-interest loan with related Charges and confirm the latest Charge Date is used.
4. Confirm `Accrued Interest` equals Current Daily Interest multiplied by Accrued Interest Days.
5. Confirm `Expected Interest This Month` combines accrued interest with the remaining-month forecast without double counting.
6. Check a fixed-term loan and confirm the accrued-interest branch remains zero.
7. Reconcile Forecast Remaining Interest and Projected Monthly Profit against representative OLTP records.

## Rollback instructions

If the repair causes a regression, restore OLAP version 1.000148 rather than version 1.000150, which is non-runnable. Then update this log and both data-model documents to record the restored version and the corrected formula strategy.
