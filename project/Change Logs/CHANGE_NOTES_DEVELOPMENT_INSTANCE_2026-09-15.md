# Separate development database — 15 September 2026

Owner requested a separate development instance to isolate AppSheet development connections from production. Google Cloud Clone current state was submitted at 10:19:43 Bangkok from appsheet-pg-prod-20260914 to appsheet-pg-dev-20260915 in project clever-oasis-508610-n7. Clone completed at 10:56:24 Bangkok. The historical checkpoint below describes the earlier pending state; the completion section supersedes it.

The clone is an independent database copy, not a replica. Google documents that data, users/passwords, connectivity, machine/storage configuration and database flags are copied; it receives a new IP address. Console confirms PostgreSQL 18.6, Enterprise, 1 shared vCPU/628.74 MB, 10 GB HDD, single zone in asia-southeast1, public IP enabled. No proxy or paid machine upgrade was selected. Source production configuration is unchanged.

Intended consumers: LoanInsights PG Trial 20260914 and LoanMgr PG Test 20260914. Production apps must retain database-2 on the production instance. AppSheet connection setup and test-app source switching are pending; provisioning alone does not isolate their connections.

Rollback: keep original production instance and data source intact. Capture current test-app versions before changing bindings. No source tables or production data should be deleted. This task requires updated overview/dictionary when app bindings change and successful test app sync verification before isolation is reported complete.

Reference: https://docs.cloud.google.com/sql/docs/postgres/clone-instance

## Provisioning checkpoint — not complete

AppSheet SSL test succeeded after PostgreSQL first started, and the new account source was saved as **database-3**, authorization ID **30899069**, server **34.158.38.171**, database **loan_manager_prod**, existing postgres identity and password. Production **database-2 / 30884713** was not edited. This duplicates existing authorized AppSheet access to the owner's independent development copy; no new recipient, password, network range or privilege was added.

Read-only AppSheet discovery listed assessment_lab/public schemas and 14 public tables, including Loan Assessment SQL Lab. Google then performed further shutdown/startup work; subsequent schema discovery stalled. The new automated backup completed at **10:43:15 Bangkok**, but Clone remained unfinished after more than 35 minutes. Logs show fast shutdown requests at 10:32:10, 10:45:04 and 10:51:16, as well as archive retries. These logs do not establish the cause or prove idle AppSheet sessions caused the delay. Production was separately shown Available/Runnable.

A Borrowers binding was prepared in the copied OLAP editor but **not saved**; Undo returned Save to disabled. No app version or saved binding changed. Full instance readiness, SQL checks, all 21 test-app bindings, app sync checks and connection isolation remain **pending Google clone completion**. No performance gain or full recovery is claimed. No real borrower/financial records were changed.

Next steps: confirm clone completion; authenticate Studio on the development instance; run VERIFY_DEVELOPMENT.sql; switch all 13 SQL sources in OLAP test and all eight in OLTP test to database-3 using new editor Source Path/browse, preserving existing physical table/view names; compare definitions to private before snapshots; verify both new-GUI syncs and isolated assessment write/readback. Leave production apps on database-2 and copied schedule/export/notification bots disabled. Then update overview and dictionary using the prepared script and record final app versions. The dictionary builder refuses final editing unless bindings and sync verification are explicitly recorded.

Recovery materials: private appdoc snapshots and startup logs under the external credential/data folder's development-instance-20260915 subdirectory. Repository contains only redacted operational notes, a read-only verification SQL artifact, a documentation helper and a dictionary preview. No credentials or borrower records are included. The database's completed backup does not establish backup coverage for private credential/evidence files.

Manual acceptance after completion: sync both test apps, navigate borrower/loan views, and edit/save assessment inputs to confirm results return from the development database. Production users should continue using their original apps. Do not use copies for development writes until all bindings are verified isolated.

Pre-change rollback versions verified in current editor/app documentation: test OLTP 1.000009, test OLAP 1.000023. Full configuration snapshots saved outside Git in Documents/ChatGPT/AppSheet-Loan-Project/development-instance-20260915. New public IP assigned: 34.158.38.171. Console confirms 73 inherited AppSheet authorized networks and SSL-only enabled. Initial AppSheet connection test failed while cloning was still in progress; no test app binding has changed. Scheduled/export/notification bots verified disabled in both copies; OLTP transactional test bots remain enabled.

## Completion and verification — 15 September 2026

Retained the completed clone as subsequently requested; no delete/recreate was performed. Development uses database-3 at 34.158.38.171 / loan_manager_prod. Original production app bindings and database-2 were not changed by this task. The owner separately upsized production in another task; this task only read production for comparison.

All 13 OLAP SQL bindings were saved in 1.000024 and all eight OLTP bindings in 1.000010. Calendar retains OLAP Calendar SQL Lab; Loan Assessment retains Loan Assessment SQL Lab View. All other physical names remain the same. No schema regeneration. Full before/after appdoc comparisons found no column, formula, Ref, key, permission, slice, view or action changes at this step. AppSheet omitted the former table-level Data locale=en-US metadata during rebinding; column locales stayed unchanged. Dates, amounts and assessment results were checked in the new clients.

The copied cross-app shortcuts still targeted production. Changed only Open Loan Manager in test OLAP to LINKTOAPP("LoanMgrPGTest20260914-578763613"), and Open Loan Business Insights in test OLTP to LINKTOAPP("LoanInsightsPGTrial20260914-578763613"). Final versions: OLAP **1.000025**, OLTP **1.000011**. Compared saved definitions again; these two targets and versions were the only additional changes. No production shortcut was edited.

Database checks: 14 public tables, two views, six functions and ten enabled application triggers; zero invalid indexes, zero unvalidated constraints. All six function definition hashes and all ten trigger definitions match current production. All 13 foreign keys rejected invalid parent references in rollback-only tests; all eight normalization triggers converted empty references to NULL in rollback-only tests. Existing data has zero orphan references across the 13 constraints. The generated calendar returns 153 rows and the assessment view is updatable. A rollback-only view update to amount 3000 calculated October 12 and restored amount 2000 after rollback.

Current production comparison matched whole-row fingerprints for 13 of 14 tables, including all transactional/master tables. Daily Analytics has 42 rows on both sides but different content hashes; there is no captured clone-time production snapshot to attribute the difference. This is an independent development snapshot, not continuous replication. Do not call the current contents of all 14 tables identical to production.

### Capacity defect discovered and corrected in development

The clone inherited max_connections=25 on db-f1-micro. Initial OLAP assessment write/read sync failed with PostgreSQL 53300 during verification. Raised only development max_connections to **50** through Cloud SQL flags and accepted the required development restart. The instance returned Runnable and SQL confirmed 50. Machine, region, disk, public IP, TLS, allowlist, authentication and backup settings were preserved; no paid machine upgrade or proxy was added. Rollback is removing that explicit flag (default 25), which requires restart and can reintroduce the observed failure.

After restart, both new desktop clients completed sync, including a concurrent sync round. Assessment input 2000 → 3000 returned the October 12 result and current DB fingerprint; restoring 2000 returned October 6. SQL verified the actual input and calculated values in development. All temporary SQL test inserts were rolled back. No production financial writes. The original 2000 input was restored, while its development calculation timestamp was refreshed. These are functional checks, not a sustained load test or proof that the micro instance can run 50 busy sessions. Google documents connection defaults by memory and restart requirements: https://docs.cloud.google.com/sql/docs/postgres/flags.

Final new-GUI checks loaded borrower, loan and partner screens and followed both cross-app shortcuts successfully to the test pair. Final whole-row hashes match the development baseline for all 13 tables other than Loan Assessment SQL Lab, whose calculation timestamp was intentionally refreshed; this also verifies rollback-only test rows did not remain. No additional financial data changed during verification.

### Documentation, limitations and rollback

Updated Documents/AppSheet_Data_Model_Overview.md and Documents/AppSheet_Data_Dictionary.xlsx together. The new SQL Development worksheet records all 21 bindings; OLAP Assessment SQL identifies the development source and final version. Workbook rendered and visually checked; unrelated worksheets' values and export/reimport consistency verified. Updated status.json, verification.json and the reusable documentation script; trigger-verification.sql records the rollback-only checks. Private full appdocs, hashes and UI evidence remain outside Git; no borrower data or secrets are published.

Manual acceptance: sync both test apps; browse borrowers, loans and payment screens; change/save an assessment input and confirm fresh result; verify the cross-app shortcuts open the other test copy. This task did not rerun the complete loan lifecycle or live scheduled/notification delivery. No Looker changes; existing production reporting remains outside this development routing change. Owner acceptance pending.

App rollback versions: OLAP 1.000023 and OLTP 1.000009 before source switches; 1.000024 and 1.000010 before shortcut edits. Restoring the pre-switch versions reconnects test apps to production, so stop test writes first. To retain isolation, correct individual bindings on database-3 instead of restoring a production-connected version. Database initial automated backup completed 10:43:15 Bangkok; deletion protection, seven-day backups and PITR remain enabled. Private credential/evidence backup coverage is not established by database backups.
