# R013 promotion checklist

Template revision: 2026-09-21. **Single master:** `scripts/releases/templates/promotion-checklist.md`. Implementation detail: [Release Workflow](../../Documents/Rules/Release_Workflow.md); exceptions: [Recovery](../../Documents/Rules/Release_Recovery_Runbook.md).

## Continue here

- Scope: SQL-only promotion of immutable V30. Both AppSheet apps are Unchanged and no RC/App Upgrade is included.
- Dependencies: released R011 / PROD V29. R014 owns any future app change.
- Records: [manifest](release-manifest.json), [log](../../Change%20Logs/CHANGE_NOTES_R013_2026-09-21.md), [DEV tests](test-results.md).
- DEV readiness: complete at V30; exact tested package pinned at `aad17b642f38583f4dbaed8d9bfcfca2e482779d`.
- Production authorization: owner explicitly directed, “promote the DB change in R013 to production. don't promote apps.”
- Current state: Released to PROD at Flyway V30. PROD OLTP remains `3.000240` and PROD OLAP remains `1.100189`; no app definition was promoted.
- Documentation impact: Release Tracker, Environment Inventory, Development Changes, database README, release log/manifest and model records affected by promotion status.

## Activities

| ID | Stage | Status | Evidence / result |
| --- | --- | --- | --- |
| P01 | A Readiness | Done | R013 is SQL-only V30; OLTP/OLAP Unchanged. Owner accepted and authorized production DB promotion. |
| P10 | A Readiness | Reused | DEV SQL tests and final zero-issue app diagnostics remain valid; app definitions are excluded. |
| P06 | A Readiness | N/A | Scheduled guards unchanged; no app copy or upgrade. |
| P08 | A Readiness | N/A | No setup, source, recipient, login or routing change. |
| P04 | A Readiness | Done | V1–V30 chain and DEV behavior passed; package pinned with all migration hashes at `aad17b6`. |
| P13 | B Capture | Done | PROD database target is `appsheet-pg-prod-20260914` / `34.21.174.215` / `loan_manager_prod`; apps remain OLTP 3.000240 and OLAP 1.100189. |
| P14 | B Capture | N/A | SQL-only release; tested commit/Flyway manifest already pinned. No RC. |
| P22 | C SQL | Done | The maintained runner promoted V30 to `loan_manager_prod` from tested commit `aad17b642f38583f4dbaed8d9bfcfca2e482779d` using the pinned manifest. One migration completed in 199 ms at `2026-09-21T13:15:13.7062833+07:00`. Private backup `r013-production-before-20260921-131013.dump` passed isolated restore, normalized schema comparison and V30 rehearsal. |
| P25 | D RC | N/A | No RC or App Upgrade. |
| P18 | D RC | N/A | No app theme, links or recipient changes. |
| P28 | D RC | N/A | No external asset or access change. |
| P29 | D RC | N/A | No RC; guards unchanged. |
| P30 | D RC | N/A | No RC. |
| P33 | E Upgrade | N/A | No App Upgrade. |
| P37 | E Upgrade | N/A | Both apps explicitly excluded. |
| P39 | F Validate | Done | PROD OLTP and PROD OLAP both loaded and synced after migration. Their saved versions remain `3.000240` and `1.100189`; no copy, save, upgrade or definition edit was performed. |
| P41 | F Validate | Done | Flyway validation passed with 31 migrations and no warnings. All six `Test-R013ReceiptTime.sql` assertions passed in a rolled-back transaction; no R013 test payments remain. Readback confirmed `loan_manager_prod`, server `34.21.174.215`, V30, and the payment timestamp rule in `guard_cash_ledger`. |
| P38 | F Validate | N/A | No jobs paused and no cutover route. |
| P45 | G Close | Done | Closed the R013 model and dictionary rows as production current state and retained the minute-only timestamp rule. |
| P46 | G Close | Done | Updated the tracker, environment inventory, development-difference record, model overview, database README, release log, manifest, production report and this checklist. |
| P49 | G Close | N/A | No RC exists. |
| P48 | G Close | Done | Final release evidence is committed to `master`; the unique annotated `R013` tag identifies that evidence commit. Branch and tag publication are verified after creation. |
| P50 | G Close | Done | Closed R013 as a SQL-only release at PROD V30. PROD OLTP remains `3.000240`, PROD OLAP remains `1.100189`, and final tag is `R013`. |
| P51 | X Exception | N/A | No exception currently triggered. |

## Documentation impact and closure

| Document | Disposition | Updated section / evidence |
| --- | --- | --- |
| [Release Tracker](../../Documents/Release_Tracker.md) | Updated | Marks R013 Released as SQL-only and records PROD V30 with unchanged apps. |
| [Environment Inventory](../../Documents/Environment_Inventory.md) | Updated | Records PROD Flyway V30; app facts remain unchanged. |
| [Development Changes](../../Documents/Development_Changes.md) | Updated | Closes the R013 SQL difference and assigns later app changes to R014. |
| [database README](../../database/README.md) | Updated | Records DEV and PROD at V30 and reserves V31 as the next migration. |
| [Data dictionary](../../Documents/AppSheet_Data_Dictionary.xlsx) | Updated | Closes the R013 DEV-difference rows and records production state without changing unrelated workbook content. |
| [Model overview](../../Documents/AppSheet_Data_Model_Overview.md) | Updated | Promotes the R013 database rule to production current state. |

## Close

- Outcome / limitations / rollback: Released. PROD Flyway advanced from V29 to V30. The existing transaction timestamp accepts receipt-derived `payment_date + HH:mm`, stores seconds as zero, and retains the prior date-only fallback. Both production apps remain unchanged. Verified backup `r013-production-before-20260921-131013.dump` (SHA256 `58D9E1BA0DAB2FF1419C4D3411073CE10CD8FBECB7D4CE817124481B38FC2B0D`) is retained outside the repository for database recovery; no app rollback applies.
- Final evidence commit / R013 tag / remote verification: Published on `master` with unique annotated tag `R013`.
- RC retention: N/A; SQL-only release.
