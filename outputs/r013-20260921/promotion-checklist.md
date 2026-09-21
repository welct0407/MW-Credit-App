# R013 promotion checklist

Template revision: 2026-09-21. **Single master:** `scripts/releases/templates/promotion-checklist.md`. Implementation detail: [Release Workflow](../../Documents/Release_Workflow.md); exceptions: [Recovery](../../Documents/Release_Recovery_Runbook.md).

## Continue here

- Scope: SQL-only promotion of immutable V30. Both AppSheet apps are Unchanged and no RC/App Upgrade is included.
- Dependencies: released R011 / PROD V29. R014 owns any future app change.
- Records: [manifest](release-manifest.json), [log](../../Change%20Logs/CHANGE_NOTES_R013_2026-09-21.md), [DEV tests](test-results.md).
- DEV readiness: complete at V30; exact tested package pinned at `aad17b642f38583f4dbaed8d9bfcfca2e482779d`.
- Production authorization: owner explicitly directed, “promote the DB change in R013 to production. don't promote apps.”
- Current state: production is V29; backup/restore rehearsal and V30 candidate rehearsal passed; migration pending.
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
| P22 | C SQL | In progress | PROD V29 confirmed. Private backup `r013-production-before-20260921-131013.dump` SHA256 `58D9E1BA0DAB2FF1419C4D3411073CE10CD8FBECB7D4CE817124481B38FC2B0D`; isolated restore and normalized schema comparison passed; V30 candidate rehearsal passed. Exact-package migration pending. |
| P25 | D RC | N/A | No RC or App Upgrade. |
| P18 | D RC | N/A | No app theme, links or recipient changes. |
| P28 | D RC | N/A | No external asset or access change. |
| P29 | D RC | N/A | No RC; guards unchanged. |
| P30 | D RC | N/A | No RC. |
| P33 | E Upgrade | N/A | No App Upgrade. |
| P37 | E Upgrade | N/A | Both apps explicitly excluded. |
| P39 | F Validate | Pending | Confirm apps remain at recorded versions and representative cash statement loads after SQL migration. |
| P41 | F Validate | Pending | Run targeted rolled-back PROD SQL assertions for V30 and verify Flyway history. |
| P38 | F Validate | N/A | No jobs paused and no cutover route. |
| P45 | G Close | Pending | Close core records and affected release/model/database records. |
| P46 | G Close | Pending | Reconcile versions, authority, tests and recovery; close promoted DEV difference. |
| P49 | G Close | N/A | No RC exists. |
| P48 | G Close | Pending | Commit/push final evidence and publish unique annotated R013 tag. |
| P50 | G Close | Pending | Report Released after validation, documentation and publication. |
| P51 | X Exception | N/A | No exception currently triggered. |

## Documentation impact and closure

| Document | Disposition | Updated section / evidence |
| --- | --- | --- |
| [Release Tracker](../../Documents/Release_Tracker.md) | Pending | R013 release status. |
| [Environment Inventory](../../Documents/Environment_Inventory.md) | Pending | PROD V30; app versions unchanged. |
| [Development Changes](../../Documents/Development_Changes.md) | Pending | Close R013 SQL difference. |
| [database README](../../database/README.md) | Pending | Current DEV/PROD checkpoint. |
| [Data dictionary](../../Documents/AppSheet_Data_Dictionary.xlsx) | Pending | Promote R013 timestamp behavior rows; no app column change. |
| [Model overview](../../Documents/AppSheet_Data_Model_Overview.md) | Pending | Change R013 behavior from DEV-only to production. |

## Close

- Outcome / limitations / rollback: Pending.
- Final evidence commit / R013 tag / remote verification: Pending.
- RC retention: N/A; SQL-only release.
