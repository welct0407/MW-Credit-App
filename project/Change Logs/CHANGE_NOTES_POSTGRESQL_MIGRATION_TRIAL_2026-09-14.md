# PostgreSQL migration trial — 14 September 2026

Status: isolated app/database copies created; PostgreSQL destination ready, data transfer and feature validation pending. No production app/data changes. Owner requested full OLTP/OLAP/shared-database copies, migration, thorough feature validation and detailed cutover changes. New target must support direct public-IP access with no proxy, minimum-cost sizing and the same POC password. Earlier sections below preserve provisioning history; the latest checkpoint supersedes their pending status.

## Baselines and scope

Live rendered app documentation captured before edits: OLTP 3.000064 (`93844270-6aa5-420b-a960-bcdf08abd357`), OLAP 1.100041 (`e74dd368-654f-44d7-bccf-83cf361d1cdb`). Both Runnable/Deployable Yes. Existing app configuration untouched; these are source baselines, not rollback versions of yet-uncreated copies. Raw configuration snapshots kept outside Git under C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\postgresql-migration-trial-20260914 because configuration can contain private constants. File names oltp-source-config.json and olap-source-config.json. Credential/private-file backup coverage not established.

OLTP appdoc counts 20 tables including native process state/output tables and user settings; these must not be mistaken for 20 operational SQL tables. OLAP counts 16 including native system tables. Detailed shared-table and feature inventory pending. New GUI only; no AppSheet API.

## Provisioning actions and correction

1. Inspected POC clone option. Google Cloud blocked public-IP cloning due to inherited organization policy.
2. Created empty logical database loan_manager_prod on existing appsheet-pg-test-20260914 as a proposed cheapest trial alternative. No app datasource authorized and no data migrated into it.
3. Owner clarified separate recreation with public IP and explicitly requested deletion of unused database/name reuse. Deleted loan_manager_prod. The delete dialog returned a generic error, but subsequent reload showed only appsheet_sync_poc/postgres, and the operations drawer confirmed deletion at 19:50:53 Bangkok. No repeat deletion attempted; original POC database retained.
4. Prepared new-instance form: appsheet-pg-prod-20260914, PostgreSQL 18, Enterprise Sandbox customized to db-f1-micro, Singapore, single zone, current minimum 10 GB SSD. Password blank; instance not submitted. Storage cost options and final configuration still require review. No proxy selected, provisioned or charged.
5. Normal creation also blocks public IP. Read effective project policy: legacy sql.restrictPublicIp Enforced via inheritance; newer sql.managed.restrictPublicIp inactive. The policy description states that existing public-IP instances are unaffected.
6. Prepared unsaved project-only override of sql.restrictPublicIp to Not enforced. Parent organization policy unchanged. Saving awaits explicit action-time confirmation required by browser-control policy for weakening a security restriction. No policy change has been applied.

## Rollback and remaining work

The only applied database change (empty DB creation) was reversed by the owner's deletion request. Discard the unsaved instance/policy forms to abandon provisioning. No application rollback needed. Source configuration baseline retained above. After policy approval, verify effective public-IP permission and create minimum-cost instance; password entry/submission requires owner handoff. Reuse loan_manager_prod as the database name on the new instance.

Then create complete isolated database and both app copies, confirm their versions and all connections before any test writes, isolate notifications/scheduled jobs, migrate with exact text/varchar keys/Refs, reconcile all shared consumers, test OLTP/OLAP thoroughly, and update both canonical model documents plus object-level cutover changes. No model documents changed at this checkpoint because no app model/copy or target schema exists. Only synthetic financial operations in copies; live cutover remains excluded.

Validation remains unperformed for the migration. Do not interpret the prior three-table POC as full loan-app acceptance. Production micro sizing is the owner's cost preference and still needs load testing; no SLA or performance guarantee claimed. Checkpoint files committed/pushed under the owner rule; private snapshots are not covered by Git.

## Approved policy change and password handoff

Owner explicitly instructed "set the policy and go ahead". Saved project-only sql.restrictPublicIp override to Not enforced; effective policy and saved-success message verified. Parent policy unchanged. Rollback: restore Inherit parent's policy on this project; existing public-IP instances will remain public because the constraint is non-retroactive.

Refreshed new-instance form verified Public IP checked and Private IP unchecked. Re-entered target appsheet-pg-prod-20260914, PostgreSQL 18 Enterprise, Singapore, single-zone, db-f1-micro. Selected minimum 10 GB HDD because owner requested cheapest configuration; SSD was offered at a higher storage rate. Backups/PITR/deletion protection and automatic storage increases remain at defaults; Query Insights off on micro. No proxy or private networking configured. No reliable final price loaded in the form at this checkpoint, so no new price quote claimed. Instance remains unsubmitted with blank postgres password field. Owner password entry and submission handoff required by browser-control rule; same existing POC admin password requested, no new secret generated/stored by the agent.

## Latest checkpoint: isolated copies and ready target

Owner entered the existing password and submitted. Instance creation completed at 20:16:34 Bangkok. Created loan_manager_prod on the new instance at 20:20:31; SQL Studio authenticated with the existing admin password and verified PostgreSQL 18.6 and zero public tables. Direct public IP 136.85.107.69:5432 verified; SSL-only enabled, mandatory client certificates disabled, private IP/Data API disabled. AppSheet network/login authorization is pending action-time confirmation for this new destination.

Created OLTP LoanMgr SQL Trial 20260914 (885b0121-c550-4dcd-acf5-630e478b49bc), data/file copying enabled, rollback 1.000002. Its native database copy was renamed Money SQL Trial 20260914 (GhFoIWUelX4UMyCCNLda80). The source and copy each show 12 tables, including Loan Assessment; earlier partial inventory of 11 was incomplete. All eight OLTP business Source IDs verified against this copy. Disabled Notification - New Loan Created, Notification - Loan Closed, Notification - Charge Received, and Generate Daily Charges; saved version 1.000003.

Created OLAP LoanInsights SQL TEST 20260914 (68e58980-ce5b-4a02-ae83-68905dde9f83), definition/file copy with data copying off to reuse the one shared copy. Rollback 1.000002. Disabled Refresh Daily Analytics Daily 2; Refresh Daily Analytics Daily and Daily Loan Analysis Export already disabled. Repointed all 12 business tables to the shared native trial database, explicitly selecting each matching qualifier because the source selector defaults to Charges. Saved version 1.000004. Calendar remains a separate read-only Google Sheets helper. No test record mutations performed. Both copies Runnable Yes, Deployable No; deployment checks, schema/formula comparison, data correctness, files and full feature tests pending.

Owner explicitly requested official migration tooling. Confirmed built-in Copy App to SQL supports PostgreSQL and Copy Data to New Source exists in the new editor. Use official transfer tooling, then reconcile inferred SQL types, exact text key casing, references, counts, file paths and both app consumers. It does not automatically create foreign keys or triggers. Sources: https://support.google.com/appsheet/answer/10107300?hl=en and https://support.google.com/appsheet/answer/10106309?hl=en.

Updated model overview and dictionary SQL Migration Trial tab together with verified source mappings and explicit pending validation status. Extended existing dictionary builder with --sql-trial; original worksheet values preserved and new records round-trip verified. Raw appdoc snapshots remain outside Git. Rollback copies to 1.000002 if needed, but restored OLAP points to production and must not be tested. Keep native copy as data rollback while SQL transfer is pending. No production cutover/acceptance, performance gains or downstream report validation claimed.

## Connection authorization and configuration comparison

Owner approved authorizing the migration connection on appsheet-pg-prod-20260914. Prepared 73 /32 network entries from Google's current published all-regions AppSheet list. Cloud SQL rejected saving them due to inherited sql.restrictAuthorizedNetworks. Applied project-only Not enforced override as required for the approved direct connection; saved-success message and effective status verified. The immediate subsequent network save still returned the old inherited restriction during propagation. Network save and AppSheet connector authorization remain pending. Parent organization unchanged. Rollback either project policy override by restoring inheritance; constraints are non-retroactive, so removing actual instance network entries/public access is a separate operation.

Prepared SSL-required AppSheet Postgres form using the existing postgres login and password for temporary migration DDL/data-copy access. No new password generated. This admin connector is not an accepted final runtime privilege design; review runtime permissions before cutover. It has not yet been authorized. SQL Studio existing-password authentication succeeded.

Added scripts/postgresql-trial-compare-config.mjs. Rendered AppSheet column-property comparison found no differences or additional columns across 196 OLTP columns in eight business schemas and 359 OLAP columns in 13 business/helper schemas. Native process-state/output schemas excluded intentionally. This checks column configuration, not record values, actions/bot behavior or full app correctness. Output clone-column-comparison.json contains only non-sensitive object names and comparison results.


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


## Full native-table copy and three master bindings — 14 September 2026
Copied and independently verified 1,934 rows across the 11 remaining native AppSheet tables, covering 18,427 physical field values. Together with Statistics, SQL now contains all 12 native tables' snapshots (1,935 rows). Calendar remains on Google Sheets. LoanInsights PG Trial 20260914 (494cd013-0d9b-482f-9559-c9d83059de91) now uses database-2 for Borrowers, Loans, Partners and Statistics; all other app bindings remain original. App rollback 1.000004; API enabled with explicit confirmation in 1.000005; three bindings saved as 1.000006. All 374 rendered column configurations, slices, views and actions unchanged. Master app read-back and eight new-desktop dashboard metrics matched. No production changes, financial write tests, full migration acceptance or performance claim. Details, dependencies, security scope and rollback: outputs/postgresql-migration-trial-20260914/MASTER_TABLE_MIGRATION.md. Owner review pending.


## Remaining native sources switched — 14 September 2026
Owner extended the task to switch the remaining copied tables. Saved trial version 1.000007, rollback 1.000006. All 12 native Money tables now use database-2; only Calendar remains on its original read-only Google Sheets source. Compared 46,283 AppSheet business/calculated fields across 1,934 rows; all values and related-record membership matched. Provider _RowNumber changed for 201 Charges and 144 Repayments; three Related Charges lists and one Related Repayments list reordered without membership changes. All 374 rendered column definitions, views, slices, actions and permissions retained. New desktop sync, five view smoke checks, and eight dashboard metric comparisons passed. API remains enabled as authorized; scripts use Find only. No production changes or write/automation/performance acceptance. See outputs/postgresql-migration-trial-20260914/MASTER_TABLE_MIGRATION.md and full-app-verification.json. Owner review pending.


## PostgreSQL foreign keys — 14 September 2026
Added 13 validated PostgreSQL foreign keys matching the 13 stored Ref relationships in copied OLAP version 1.000007. Database loan_manager_prod is the future production database; existing production apps remain on Money until cutover. ON DELETE/UPDATE NO ACTION, NOT DEFERRABLE; no cascades, no new columns or indexes. Converted 1,010 empty references to NULL (Payments.Ref Target Charge 114; Repayments.Ref Payment 448; Repayments.Ref Payment Allocation 448). Eight BEFORE INSERT/UPDATE triggers and one function normalize only empty Ref text to NULL, preserving AppSheet blank semantics. Nonblank identifiers/case unchanged. All 91 rollback-only SQL checks passed, all eight affected-table normalized fingerprints unchanged, and all 11 copied-app table comparisons passed. New desktop sync and eight dashboard metrics passed. No AppSheet edits (version remains 1.000007). App write/bot/concurrent/offline workflows and original OLTP against SQL remain untested; owner acceptance pending.
Details and SQL rollback: outputs/postgresql-migration-trial-20260914/FOREIGN_KEYS.md and fk-rollback.sql. No Looker changes.

Owner reconsidered constraint policy after installation. Further database changes paused; no rollback requested or executed. Existing native AppSheet Database enforcement equivalence is not established. SQL foreign keys and normalizers remain installed pending owner direction.
