# R048 — manual PROD implementation steps for owner review

**Executed after owner approval on 27–28 September 2026** against the canonical PROD apps, without App Upgrade. Final OLTP3.000257 / OLAP1.100208 / V53. [Actual ordered execution, checks, exception and rollback](../r048-loan-interest-production/README.md). The recipe below is retained as reviewed implementation evidence, not an instruction to rerun the completed migration. DEV evidence is [here](IMPLEMENTATION.md).

## 1. Record recovery and target identity

Record both current PROD restorable AppSheet versions. Obtain and verify a restorable PROD database backup before SQL/backfill. The expected database tuple is `appsheet-pg-prod-20260914 / 34.21.174.215 / loan_manager_prod`; do not use host alone to identify it. Confirm canonical PROD app IDs from the environment inventory and signed-in work account. DEV rollback was OLTP1.000125 / OLAP1.000042 / SQLV52; these are **not** PROD backup versions.

## 2. Apply SQL before regenerating either app

Use the reviewed immutable [V53 migration](../../database/migrations/V53__original_daily_interest_rate.sql), SHA256 `d76b2f62c3d8f18714f99d512334fe9427cdc61e5179554f19390c0bb4e6d774`. Do not add the column manually and then run V53, and do not alter the applied file.

V53 adds `public."Loans"."Original Daily Interest Rate"` as nullable integer, enforces nonnegative values, installs creation/backfill calculation and immutable update behavior, changes daily-loan principal adjustment, appends the field to `olap_loans_analytics`, and aligns `forecast_schedule_v1` / `reporting_forecast_inputs_v1`. Existing charge/receipt amounts are retained. The existing `vc_loan_row` trigger calls the replaced helper, so no AppSheet repayment action needs to set this rate or daily amount.

Use the existing Flyway runner so this remains recorded in schema history. Before execution inspect all pending migrations. Its production command requires a clean tested commit, the matching development migration manifest, actual approval and verified backup references:

```powershell
.\scripts\database\Invoke-Flyway.ps1 -Environment production -Command info
.\scripts\database\Invoke-Flyway.ps1 -Environment production -Command migrate -ReleaseFile <tested-manifest.json> -ApprovalReference <owner-review-reference> -BackupReference <verified-backup-reference>
.\scripts\database\Invoke-Flyway.ps1 -Environment production -Command validate
```

The placeholders are deliberately not executable authorization. The DEV review package is not a pinned PROD release manifest; generate that from the accepted clean commit with the existing `scripts/database/New-Release.ps1 -ValidationReference <accepted-DEV-evidence>` tooling when executing. This is the database runner's traceability requirement, separate from an App Upgrade process.

Check backfill coverage and investigate NULL values privately. The DEV pre-existing population was75/78, with three incomplete fixed-term records missing both Due Date and Fixed Interest. PROD counts may differ. Do not substitute zero for an unknown rate.

## 3. Regenerate Loans in both current AppSheet editors

- OLTP Loans source is physical `Loans`.
- OLAP Loans source is `olap_loans_analytics`.

Regenerate and save each. Keep `Row ID` as the actual key and existing source/update/filter settings. In DEV, regeneration appended the field to `R008 Loan Commands` (OLTP) and `Reporting Loans` (OLAP); inspect these generated memberships in PROD too. Save and resolve generated schema warnings.

## 4. Configure Original Daily Interest Rate in both apps

| Property | Value |
| --- | --- |
| Type | **Number**, not Percent; `1` means1% |
| Show | On |
| Editable | Off |
| Required | Off; incomplete historical terms can be blank |
| Reset on edit | Off |
| App formula | Empty |
| Display name expression | `"อัตราดอกเบี้ยรายวันเดิม (%) / Original Daily Interest (%)"` |
| Initial value in OLAP | Empty; SQL view supplies it |

Set OLTP **Initial value** to:

```appsheet
IF(
  [Principal Amount] > 0,
  IFS(
    AND([Loan Type] = "ดอกเบี้ยรายวัน", ISNOTBLANK([Current Daily Interest])),
    ROUND(100.0 * [Current Daily Interest] / [Principal Amount]),
    AND([Loan Type] = "กำหนดวันชำระ", ISNOTBLANK([Fixed Interest]), ISNOTBLANK([Loan Date]), ISNOTBLANK([Due Date]), [Due Date] >= [Loan Date]),
    ROUND(100.0 * [Fixed Interest] / (TOTALHOURS([Due Date] - [Loan Date]) / 24 + 1) / [Principal Amount]),
    AND([Loan Type] = "ผ่อนชำระรายวัน", ISNOTBLANK([Daily Payment Amount]), ISNOTBLANK([Loan Date]), ISNOTBLANK([Due Date]), [Due Date] >= [Loan Date]),
    ROUND(100.0 * (([Daily Payment Amount] * (TOTALHOURS([Due Date] - [Loan Date]) / 24 + 1)) - [Principal Amount]) / (TOTALHOURS([Due Date] - [Loan Date]) / 24 + 1) / [Principal Amount])
  ),
  NUMBER("")
)
```

SQL remains authoritative at insert and freezes the saved rate. The form expression supplies a read-only preview. All loan durations here are inclusive (`Due Date − Loan Date +1`). For daily loans, original average daily interest is the entry daily amount; fixed loans use total fixed interest/days; installment loans use `(daily payment × days − principal)/days`.

## 5. Replace Loan Key app formulas

OLTP:

```appsheet
CONCATENATE([Borrower Name TE], "-", TEXT([Principal Amount]), "-", TEXT([Loan Date], "DD/MM"), "-", IF(ISBLANK([Original Daily Interest Rate]), "Unavailable", CONCATENATE([Original Daily Interest Rate], "%")))
```

OLAP:

```appsheet
CONCATENATE([Borrower Name], "-", TEXT([Principal Amount]), "-", TEXT([Loan Date], "DD/MM"), "-", IF(ISBLANK([Original Daily Interest Rate]), "Unavailable", CONCATENATE([Original Daily Interest Rate], "%")))
```

Loan Key is a display label; preserve Row ID and all Ref relationships. Leave Effective Daily Interest Rate available for its separate analytics meaning.

## 6. Change OLTP Current Daily Interest rules

Editable_If:

```appsheet
NOT(IN([Row ID], Loans[Row ID]))
```

Valid_If:

```appsheet
OR([Loan Type] <> "ดอกเบี้ยรายวัน", [Current Daily Interest] > 0, AND([Current Daily Interest] = 0, IN([Row ID], Loans[Row ID]), ISNOTBLANK([Original Daily Interest Rate])))
```

Keep the existing daily-loan Show_If and Required_If. Daily amount can be entered on creation; saved loans use the server-calculated amount. This replaces the prior dependence on editable Loan Arrangement text. Existing loans' daily amounts do not change during backfill. A later principal change applies `ROUND(outstanding × rate /100)` in whole baht, including0% and payoff.

## 7. Display the field in loan views

Insert **Original Daily Interest Rate immediately after Current Daily Interest** in:

1. OLTP `Loans_Form`.
2. OLTP `Loans_Detail`.
3. OLAP `Loans_Detail`.

Preserve all other column order and deck settings. Main and related-loan cards already use the Loan Key label and therefore show the stored percentage through that label. Field label explicitly identifies percentage units; Number renders no decimal digits.

## 8. Review PROD-bound report consumers separately

DEV V53 already aligns forecast calculations with the rounded original rate. Metabase itself is PROD-bound and was not edited in this task. Existing readable Loan Key SQL consumers still use Effective Daily Interest Rate: Forecast watchlist question360, Borrower Detail questions303/305/306/307/308 maintained in `scripts/metabase/RefineBorrowerDetail.mjs`, and target-loan/target-charge keys in Payments question317 maintained in `BorrowerReceiptDetail.mjs`.

If bringing report labels into the same convention, first back up the affected saved definitions/report and inspect their current SQL. Keep joins, population, other measures, filters and layout. Replace only the key's suffix, for the applicable alias (`k`, `tl` or `cl`):

```sql
coalesce(alias."Original Daily Interest Rate"::text || '%', 'Unavailable')
```

The old suffix formats `alias."Effective Daily Interest Rate" *100`; the new integer must **not** be multiplied by100. This report step is a later PROD publication, not a claimed DEV delivery. Do not replay historical whole-page publishers to change one label. The retired Looker Studio/export paths require no update.

## 9. Verify and record

Save both apps; require zero editor warnings/errors and successful load/sync. Record exact final versions. Check readonly field visibility, missing-rate label, unchanged Ref navigation and Loan Key suffix. Reuse DEV behavior evidence: 1000 principal /5 daily stores1%; receipt205 leaves800 principal and8/day; payoff800 leaves0/day while rate stays1%. Fixed150 over10 days and installment115 over10 days preview2%. The SQL suite also covers saved creation, boundaries below/at0.5%, stale writes and forecast use.

Do not create financial test records or force notifications in PROD without separate scoped authorization. After actual execution, reconcile canonical dictionary values and close only this DEV difference with actual results; do not mark R048 Released merely because these instructions exist.

## Recovery

App restore alone does not revert SQL, backfill or repayments. Prefer a reviewed higher migration for targeted SQL recovery. Full restore requires coordinating all intervening production writes against the verified backup. Do not drop the field while either app/report depends on it, edit V53, repair checksums or replay financial records. The original DEV backup and restored-data invariance evidence are linked from the implementation record.
