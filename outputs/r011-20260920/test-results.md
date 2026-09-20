# R011 DEV verification — 20 September 2026

Targets: DEV OLTP `500b27b6-884a-41e8-a9ec-df801b0110ad`, final 1.000057; DEV OLAP `9f3422be-bc87-4a5a-a42a-67528ee80393`, unchanged 1.000017. Database tuple: `appsheet-pg-prod-20260914` / `34.21.174.215` / `loan_manager_dev`.

| Check | Result / evidence |
| --- | --- |
| Affected live schema | Before: 23 physical borrower columns, no note; V27; three existing borrower triggers. After: 24 physical columns including nullable text Borrower Note; V28. `scripts/database/Inspect-R011.ps1` reads metadata/aggregate counts only. |
| Rollback | Private DEV dump completed; pg_restore catalogue read passed; SHA256 in release log. App rollback OLTP 1.000054. No full DB restore rehearsal claimed. |
| Migration chain | `Test-Migrations.ps1 -TestSqlFile scripts/database/Test-R011.sql`: 28 migrations built, validate passed, repeat migrate 0, checksum tampering rejected; PostgreSQL 18.6 / Flyway 13.6.0. `baselineRebuildMatch=False` is the runner's non-V1-only result, not a failed chain test. |
| Synthetic SQL | Old-style borrower insert without note succeeds; multiline note persists on only target borrower; no payment created; principal remains zero; existing OLAP borrower view reads fixture; note clear succeeds; all fixtures rolled back. |
| DEV migrate/validate | V27→V28, one migration, success true, no warnings; validationSuccessful true, no invalid migrations. |
| GUI note persistence | Current DEV desktop app: Collection → borrower detail → enter two-line synthetic R011 TEST note → blur/sync → reload. Both lines remain. Clear note and sync restores empty value. SQL aggregate confirms 0 nonblank notes after cleanup. No borrower identities or data exported into evidence. |
| GUI required English Name | Existing borrower Edit form shows required English Name. Clear only that input and press Save: Thai required-field message `จำเป็นต้องกรอกข้อมูลนี้`; form remains open. Cancel and return to detail. Database aggregate confirms 0 missing English Names among 31 borrowers. |
| Final layout | Final 1.000057 reloaded runtime: optional multiline note directly below Todays Amount Remaining and before Todays Collection Charges, inside borrower summary. Persistence test reused from 1.000056 because final save only reordered the same field. |
| Diagnostics | Final OLTP 1.000057 and OLAP 1.000017 saved editors show green check, no outstanding configuration warning/error indicators, Deployed. Schema regeneration slice-list warnings cleared on save. |
| OLAP | Current editor/preview loaded at unchanged 1.000017; Borrowers source olap_borrowers_analytics / database-3, read-only, 87 AppSheet columns. Existing SQL provider contract unchanged; no regeneration necessary. |
| Dictionary | Rows 2857–2862 in Dev Differences, all prior values/formulas preserved after export/import; affected render inspected. See dictionary/verification.json. |

Limitations: physical-device/mobile/offline and concurrent-user note edits not tested. No dated note history requested or implemented. Tests do not establish owner acceptance or production authorization. No new notification route or financial workflow was exercised.
