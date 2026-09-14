Latest: all 12 native Money tables use PostgreSQL in trial version 1.000007. Calendar remains on Google Sheets. Data/read/display verification passed; write workflows, performance and owner acceptance pending. See MASTER_TABLE_MIGRATION.md.

Latest: all 12 native-table snapshots are in SQL. Borrowers, Loans, Partners and Statistics use SQL in trial version 1.000006. See MASTER_TABLE_MIGRATION.md. Earlier status entries below are historical.

# PostgreSQL migration trial

Latest: Statistics manual copy and SQL binding passed in trial version 1.000004. One exact row; eight dashboard metrics match. Full migration remains incomplete. See STATISTICS_MANUAL_COPY.md.

Latest: fresh instance ready; documented direct copy reproduced incomplete transfer (13 empty SQL tables, original app bindings). Migration blocked. See RESTART_RESULT.md.
14 September 2026. Failed trial cleaned up: three copied apps, native database copy, and both Cloud SQL instances deleted. Fresh instance draft awaits owner password entry/submission. No migration success claimed. Earlier entries below are historical; latest cleanup section supersedes them.

- Source baselines verified: OLTP 3.000064, OLAP 1.100041. Production untouched.
- Empty loan_manager_prod database on the POC instance deleted as requested. Name to be reused on new instance.
- New instance draft appsheet-pg-prod-20260914: Enterprise PostgreSQL 18, db-f1-micro, single zone, Singapore, 10 GB HDD (lowest storage rate offered). SSL-only, backups/PITR/deletion protection retained; Query Insights disabled. Password not entered; not submitted.
- Owner approved policy override. Project-only sql.restrictPublicIp Not enforced saved and verified; refreshed creation form shows Public IP ON and Private IP OFF. No proxy provisioned. Parent policy unchanged.
- Pending: owner password entry/submission, full paired app/shared-database copies, migration, correctness and feature testing, detailed cutover change register. HDD reduces storage cost but is slower than SSD; performance findings must identify this sizing.

Exact-case keys/Refs must remain text/varchar. Copying native AppSheet databases may regenerate their Row IDs; retain the copy as a matched app/database pair and verify mapping before SQL transfer. Both SQL apps must consume the same migrated shared tables. Native user settings/process state tables require separate treatment from business data. No current migration correctness or performance result is claimed.

Authoritative history: Change Logs/CHANGE_NOTES_POSTGRESQL_MIGRATION_TRIAL_2026-09-14.md.

OLTP native full copy created: LoanMgr SQL Trial 20260914, app 885b0121-c550-4dcd-acf5-630e478b49bc, initial rollback 1.000002. Source app/data/file copy options enabled. Connection/row reconciliation pending; copied notifications and scheduled generation to be disabled before testing.


## Official migration route and OLAP copy (2026-09-14)
- Owner requested official migration tooling. Confirmed AppSheet Copy App to SQL supports PostgreSQL and Copy Data to New Source is present in the new editor. Use the official route; validate inferred types, exact text keys/Refs, row counts and files. No SQL triggers or foreign-key constraints are generated automatically.
- OLAP definition/file clone: LoanInsights SQL TEST 20260914, ID 68e58980-ce5b-4a02-ae83-68905dde9f83, initial rollback 1.000002. Data copy off intentionally: repoint to the single shared native trial database before testing. Source production connections still present at this checkpoint; no test writes performed.
- Source: https://support.google.com/appsheet/answer/10107300?hl=en and https://support.google.com/appsheet/answer/10106309?hl=en

## Ready destination and isolated copies
- Target creation completed 20:16:34 Bangkok. loan_manager_prod created 20:20:31. PostgreSQL 18.6, zero public tables verified via SQL Studio. Public IP 136.85.107.69:5432, SSL-only.
- OLTP clone 1.000003: all eight business table Source IDs verified against GhFoIWUelX4UMyCCNLda80. Four notification/schedule bots disabled.
- OLAP clone 1.000004: all 12 native business tables now use that same copy. Calendar is separate read-only Google Sheets helper. All three OLAP bots disabled.
- Source/copy rendered column properties compare exactly for 196 OLTP and 359 OLAP columns; data and feature tests remain pending. Both clones Runnable Yes, Deployable No.
- Owner approved new-instance AppSheet connection. Prepared all 73 official AppSheet /32 IP addresses. Initial save blocked by inherited sql.restrictAuthorizedNetworks. Applied project-only Not enforced override to enable approved direct access. Effective policy verified; Cloud SQL save still seeing old restriction during propagation. Network list not yet saved successfully.
- Canonical overview and dictionary SQL Migration Trial tab updated. Full data/feature/SQL validation pending.


## Cleanup ordered by owner — 14 September 2026

This section supersedes the preceding migration checkpoint. The owner rejected the failed attempt and confirmed deletion of all three migration-copy apps, the native database copy, and both Cloud SQL instances (including disabling deletion protection).

- LoanMgr SQL Trial 20260914 (885b0121-c550-4dcd-acf5-630e478b49bc), LoanInsights SQL TEST 20260914 (68e58980-ce5b-4a02-ae83-68905dde9f83), and LoanInsights PG TEST 20260914 (de4894fc-3108-497c-b872-020a1b2d57c9) deleted; all absent from refreshed My Apps. PG copy rollback version before deletion was 1.000002.
- Money SQL Trial 20260914 (GhFoIWUelX4UMyCCNLda80) deleted; absent from active database list. AppSheet dialog states deleted databases can be restored from My Account > Database Info.
- Cloud SQL appsheet-pg-prod-20260914 deletion completed. appsheet-pg-test-20260914 deletion submitted, completion verification pending at this checkpoint. Retain-backups and final-backup options disabled for requested cleanup; deletion dialog explicitly includes existing backups.
- Production OLTP/OLAP and Money database remain in their active lists. Earlier performance test copies and backups were excluded. The separate SQL Sync POC app and database-1/database-2 account connections still exist but their deleted backends cannot serve them. Credentials remain outside Git; not erased. Project policy overrides remain recorded and unchanged by resource cleanup.

### Correction of failed migration record
The approved connection was successfully authorized as database-2 (30884713), SSL required, existing postgres account, after all 73 published AppSheet /32 addresses were saved. Copy App to SQL created 13 empty tables but did not switch the app connections. A read-only count query found zero rows in every table. Subsequent table-copy retry failed with relation-not-found naming the copied app. One empty Borrowers table was renamed _trial_empty_Borrowers_20260914 before the retry; instance deletion removes both empty versions. This does not establish the root cause of the failed app copy. No successful data migration or PostgreSQL performance result is claimed.

For restart, follow https://support.google.com/appsheet/answer/10107300?hl=en: copy the app to the existing PostgreSQL source with both data and file copying enabled. Verify the dialog settings, copy completion, actual source connections, populated row counts, exact text keys/Refs, and app behavior before claiming success. Do not treat the appearance of empty SQL tables as completion or substitute unverified manual reconnection.

Rollback: production needs no rollback. Deleted cloud instances/data are not a usable rollback point. Earlier clone version numbers are historical only. Rebuild the trial from the original source apps and database. SQL feature/correctness/performance validation remains unperformed.


### Cleanup completion and fresh draft
Both Cloud SQL operations now explicitly show Deleted: appsheet-pg-test-20260914 and appsheet-pg-prod-20260914. All six confirmed cleanup objects are removed from active service. POC test evidence is historical; its SQL backend no longer exists. Source production apps and database remain unchanged.

A fresh, unsubmitted appsheet-pg-prod-20260914 creation form is prepared: Enterprise PostgreSQL 18, db-f1-micro (1 shared vCPU / 0.614 GB), Singapore, single zone, 10 GB HDD, public IP on, private IP/Data API off, SSL-only, Query Insights off. Password field empty; user handoff required for credential entry and submission. No new instance exists yet.

Documentation checked: AppSheet Copy an existing app to an SQL database (10107300), Use data from PostgreSQL (10106598), and Migrate apps between SQL databases (10106310). The general copy article describes cloud-storage/spreadsheet sources and does not explicitly promise this particular native AppSheet Database source will transfer successfully; do not claim native-specific support or a root cause without evidence. PostgreSQL cloning uses public schema. Confirm both copy options in the new GUI, then verify tables contain data and the copied app uses SQL. Preserve key strings and their case; validate inferred SQL types and files.


## Fresh restart result — 14 September 2026
Replacement appsheet-pg-prod-20260914 is Runnable at 34.21.174.215; loan_manager_prod created and verified empty before copying. Approved network list and SSL database-2 connection restored and verified. Direct documented copy of original OLAP 1.100041 produced LoanInsights PG Trial 20260914 (494cd013-0d9b-482f-9559-c9d83059de91), rollback 1.000002, current 1.000003 after disabling its remaining active schedule. Both visible copied bots disabled. The 13 SQL tables contain zero rows; copied app remains on original Money/Calendar sources. Copy-time PostgreSQL logs reject a relation named after the app. Cause unverified; migration blocked, no workaround attempted. See outputs/postgresql-migration-trial-20260914/RESTART_RESULT.md and its evidence files. Original apps/data unchanged. Data/feature/performance/cutover work pending.


## Authorized Statistics manual-copy trial — passed
Owner requested manual copying of Statistics and source rebinding. Copied its one MAIN row with exact existing text key into empty public.Statistics using SQL Studio, then selected that SQL table through the new editor in LoanInsights PG Trial 20260914. App 494cd013-0d9b-482f-9559-c9d83059de91: rollback 1.000003, saved 1.000004. Source database-2 / path Statistics / provider ID Table=public.Statistics__Statistics. SQL row count and exact matches both 1. All 374 compared rendered column configurations unchanged, including 39 Statistics columns. New desktop sync completed without visible error; eight dashboard metrics matched the original. Only Statistics uses SQL; other original sources remain, bots disabled, production untouched. No full migration, write-back or performance acceptance claimed. Details and rollback: outputs/postgresql-migration-trial-20260914/STATISTICS_MANUAL_COPY.md. Owner acceptance pending.
