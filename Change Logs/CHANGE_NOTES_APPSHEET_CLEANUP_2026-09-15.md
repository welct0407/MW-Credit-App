# AppSheet app/database cleanup — 2026-09-15

Owner requested retaining only two production and two development apps, preserving original Money database, deleting obsolete AppSheet copies, and giving development apps proper names. Owner confirmed deletion of the exact three apps and five databases listed below at the deletion step.

Keep: production app IDs 93844270-6aa5-420b-a960-bcdf08abd357 and e74dd368-654f-44d7-bccf-83cf361d1cdb; development app IDs 65faacd8-2b0d-43bf-9e0a-58eb915dcf9b and 494cd013-0d9b-482f-9559-c9d83059de91; original Money database; both Cloud SQL instances and their contents.

Delete apps: SQL Sync POC TEST 20260914, LoanMgr Perf TEST 20260912, LoanMgr FULL BACKUP 20260906.

Delete AppSheet databases: Money BACKUP Borrower Cleanup 20260913, Money Perf TEST 20260912, Money Restructure Backup 20260908, Money Collection Backup 20260908, Money FULL BACKUP 20260906.

Development display names: Loan Manager — DEV; Loan Business Insights — DEV. Rollback versions confirmed in the current editor before changes: OLTP 1.000011 and OLAP 1.000025. Saved versions are OLTP 1.000012 and OLAP 1.000026. Existing before snapshots are in the private documentation-reconciliation folder; after snapshots are in the private appsheet-cleanup-20260915 folder.

Status: all three approved apps and five approved AppSheet databases deleted. The owned inventory shows exactly four apps and one AppSheet database (Money database, 12 tables). Neither Cloud SQL instance was changed.

Verification: fresh appdoc definitions for both renamed apps differ from the previous saved definitions only in Short Name and Version. All 21 development SQL bindings remain database-3; every column, Ref, slice, view and action is unchanged. Internal app names and cross-app LINKTOAPP expressions are unchanged, so no navigation expression rewrite is required. `scripts/appsheet-cleanup-verification.mjs` passed; evidence is in `outputs/appsheet-cleanup-20260915/`. No schema regeneration, financial write, bot run or production configuration change was performed.

Documentation updated: Environment Inventory, Development Changes and documentation index. The data dictionary's business schema/rules/differences remain valid and unchanged; the rename is display metadata only. Historical logs, captured definitions and reports retain their original app names and versions. Current names/versions are resolved through Environment Inventory.

New-GUI check: Loan Manager — DEV opened successfully; its Open Reporting App shortcut opened Loan Business Insights — DEV, which showed sync complete. The Open Operations App shortcut returned to Loan Manager — DEV. The final Chrome tab shows Owned (4). Minimal navigation evidence excludes URL query/session parameters. No financial inputs were changed during these checks.

Rollback: restore the prior development display names or recorded app versions if necessary. Deleted historical copies are no longer available rollback targets. Permanent database deletion has no verified self-service rollback; do not suggest that an archived schema document restores their data. Original Money reference data and current production/development PostgreSQL data were preserved.

Owner review: confirm the four names in the AppSheet app list. No financial transaction test is required for this display-name-only change. Repository commit/push follows standing authorization; actual remote publication is recorded in Git.
