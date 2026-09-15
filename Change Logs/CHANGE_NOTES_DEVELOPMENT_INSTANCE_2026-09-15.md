# Separate development database — 15 September 2026

Owner requested a separate development instance to isolate AppSheet development connections from production. Google Cloud Clone current state was submitted at 10:19:43 Bangkok from appsheet-pg-prod-20260914 to appsheet-pg-dev-20260915 in project clever-oasis-508610-n7. Provisioning is in progress.

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
