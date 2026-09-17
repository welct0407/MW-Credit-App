# Environment inventory

Updated 18 September 2026 for R005 DEV implementation and GUI tests. Production/development are separate Cloud SQL instances. The development database retains the name loan_manager_prod because it was cloned; use instance/host, not the database name alone, to identify the environment. R005 DEV is V20, OLTP 1.000120 / OLAP 1.000120. Both editors show No issues found; deployment-check rerun and delivery verification remain unavailable, so R005 is Not ready. Production remains R004/V19.

## App identities and bindings

| Environment | App | App ID | Live version | SQL connection | SQL tables / views |
| --- | --- | --- | --- | --- | --- |
| Production OLTP | Loan Manager ผู้จัดการสินเชื่อ | 93844270-6aa5-420b-a960-bcdf08abd357 | 3.000156 | database-2 | 10 |
| Production OLAP | Loan Business Insights | e74dd368-654f-44d7-bccf-83cf361d1cdb | 1.100106 | database-2 | 13 |
| Development OLTP | Loan Manager — DEV | 65faacd8-2b0d-43bf-9e0a-58eb915dcf9b | 1.000120 | database-3 | 11 |
| Development OLAP | Loan Business Insights — DEV | 494cd013-0d9b-482f-9559-c9d83059de91 | 1.000120 | database-3 | 16 |

Both OLAP apps use the assessment view and have removed Calendar for V11 SQL analytics. The historical SQL Calendar objects remain outside AppSheet for recovery. Native internal tables are excluded from the SQL counts. Business Expenses is loaded in both environments: editable for manual entries in OLTP and read only in OLAP. A 16 September post-release audit found Business Expenses, borrower-referral and net-reporting gaps at production 3.000118 / 1.100098. R003 reconciled every listed AppSheet object at production 3.000121 / 1.100101; use the linked R001 audit and R003 report for the before/after evidence.

Cleanup on 15 September leaves exactly these four owned AppSheet apps and one AppSheet database, **Money database**, retained as historical reference. Three obsolete apps and five copied AppSheet databases were deleted with explicit owner confirmation. Both Cloud SQL instances were retained. Development display names changed; internal app names, UUIDs, source bindings, columns, actions and cross-app link expressions were verified unchanged. Details and deleted-object names are in [cleanup notes](../Change%20Logs/CHANGE_NOTES_APPSHEET_CLEANUP_2026-09-15.md). The old backup apps/databases are no longer available rollback targets.

## Cloud SQL

| Setting | Production | Development | Evidence |
| --- | --- | --- | --- |
| Project | clever-oasis-508610-n7 | clever-oasis-508610-n7 | Repository environment configuration |
| Instance | appsheet-pg-prod-20260914 | appsheet-pg-dev-20260915 | Environment configuration |
| Public host | 34.21.174.215 | 34.158.38.171 | Environment configuration; fresh successful connection |
| Database | loan_manager_prod | loan_manager_prod | Fresh SQL query |
| PostgreSQL | 18.6 | 18.6 | Fresh SQL query |
| max_connections | 100 | 50 | Fresh SQL query |
| Connection | Direct public IP, SSL required | Direct public IP, SSL required | SSL active on audit sessions; configured sslmode=require |
| Tier | db-f1-micro | db-f1-micro | Latest dated capacity/development logs; not a fresh Cloud Console inspection |
| Storage | 10 GB HDD, automatic increase | 10 GB HDD | Latest dated configuration logs |
| Access list | AppSheet 73 addresses plus authorized workstation /32 | Same recorded access scope | Flyway adoption log; no network change here |
| Flyway | V19 migrated and validated | V19 migrated and validated | R004 bilingual category and manual dropdown promoted after released R002/R003 |

Raising max_connections does not prove enough memory for that many active queries. The 50/100 values are current settings, not measured sustainable concurrency. Capacity changes require separate documentation and may restart the instance. The runtime's sslmode=require encrypts traffic; it is not hostname verification. No proxy is used.

Passwords remain outside Git under Documents/ChatGPT/AppSheet-Loan-Project. Both environment configurations reference the existing external password file; values are never included here. Private credential/snapshot backup coverage is not established by Git or database backups. The production core release below freshly confirmed backup/PITR/deletion protection and tested a full logical restore.

### Core phases 1–6 production release — 15 September 2026

Production app rollback versions were OLTP 3.000080 and freshly observed OLAP 1.100056. A full logical backup restored successfully, with all 14 original table fingerprints matching. Production V6–V10 applied at 22:07:33 Bangkok. Normalized V10 hash: `242404152af2760a046b1e628e7a4df1e56a1a7230e90839f8192d8e05217bba`. Both production apps saved and synced, with business bindings/permissions and unrelated formulas preserved. No financial test transaction was submitted. Original financial records remain unchanged; the existing hourly analytics refresh changed its snapshot.

Production Cloud SQL flags saved/restarted 22:05:38–22:06:10 Bangkok: cloudsql.enable_pg_cron=on, cron.database_name=loan_manager_prod, cron.timezone=Asia/Bangkok, cron.max_running_jobs=1. Existing IAM authentication and max_connections=100 were preserved. The pg_cron loan-daily-charges job is now paused; OLTP AppSheet owns the 00:05 Bangkok schedule so failures appear in Automation Monitor. No instance tier/network/credential change. [production release](../outputs/core-promotion-20260915/REPORT.md) records the earlier phases 1–6 release.

Latest production checkpoint: **R004 / V19 / OLTP 3.000156 / OLAP 1.100106**. The bilingual referral category is available for manual entry and new automatic rebates; the approved existing backlog category was corrected without changing any other field. Both apps show no editor issues and runtime readback passed. R004 rollback is OLTP 3.000155 plus a reviewed SQL forward fix; a verified private V18 backup exists. [R004 evidence, exception and recovery](../Change%20Logs/CHANGE_NOTES_R004_2026-09-17.md). The SQL table counts above include R002's Loan Form Context and exclude native internal tables. Earlier R003 was V16 / 3.000121 / 1.100101; its historical [report](../outputs/r003-production-appsheet-reconciliation-20260916/REPORT.md) does not replace R004's rollback baseline.

Historical monitored-jobs checkpoint: **V11 / OLTP 3.000098 / OLAP 1.100081**. Rollback is OLTP 3.000094 / OLAP 1.100062 plus a private V10 logical backup whose 14 business tables and normalized schema restored locally. The hidden Statistics request exists in both apps. OLAP owns Recent/Full actions and hourly :00 refresh; Calendar, its views/actions and the duplicate bot are removed, and Daily Analytics is read only. The first natural hourly run completed at 01:00:04 Bangkok and all 43 dates reconcile with stable IDs. The first natural OLTP 00:05 run under AppSheet remains pending. [Production monitored-jobs evidence](../outputs/monitored-jobs-production-20260916/REPORT.md).

### Interval anchor verification — 15 September 2026 (historical pre-V6 checkpoint)

The following paragraph records the historical interval-release versions. Production V5 applied at 17:16 Bangkok from tested commit b816d7f, after a successful local restore of the production backup and a V4 drift check. Both V5 schema hashes match: `888c78ec92780065a545bad8947e9874718ca3bb1da7d7db839efa60feebe194`. Production sources remain database-2 and development database-3. Existing keys/Refs/slices/permissions/calculations and companion-app links are unchanged. Production 00:05 SE Asia daily generation remains enabled; development daily generation and OLAP scheduled/export bots remain disabled. The three previously owner-authorized Dev pushes retain their owner-only recipients. No bot run, notification or financial transaction was forced during production verification. Both production apps loaded/synced, and the unsaved daily-interest form displayed the optional blank anchor. Earlier inventory observations below retain their original scope and timestamps. See [interval change notes](../Change%20Logs/CHANGE_NOTES_INTERVAL_ANCHOR_2026-09-15.md).

### Lump-sum release — 15 September 2026 (historical release snapshot)

Production OLTP **3.000074**, Dev OLTP **1.000019**, both databases **Flyway V4**. OLAP versions remain production **1.100051** and development **1.000027**. The [release report](../outputs/lumpsum-promotion-20260915/REPORT.md) supersedes the historical V3 design and notification limitation.

PostgreSQL prepares positive allocations and matching repayments atomically, newest eligible charge first with immutable-key ties and interest before principal. Existing AppSheet actions finalize the receipt and close paid loans, producing the existing notification events. Processing remains visible if finalization fails; prepared receipts cannot allocate twice and block another lump-sum receipt until reconciled. SQL validates the final Posted transition. Seven indexes, three functions and four triggers reuse existing tables and columns; no queue or new business field exists. New ls2: children retain negative Allocation Order in Charge Row Number Snapshot. Historical rows retain their prior interpretation.

The receipt event and group both use `[Status] = "Processing"`. Three allocation actions skip Lump Sum; two reconcile assignments select Posted/NOW() for Lump Sum and preserve original other-method expressions. [Exact action expressions](../outputs/lumpsum-promotion-20260915/action-expressions.json) are promotion evidence. Both apps read the same ledger, sources remain isolated (production database-2, Dev database-3), and no schema regeneration, Ref, slice or business-column change is required.

Production notification events, templates and recipient expressions are retained. The owner explicitly authorized the three Dev push bots with `LIST("welct0407@mw-credit.com")` as their sole recipient expression. Other Dev scheduled/export bots remain disabled. Dev Payment Received and Loan Closed runs completed in AppSheet; device receipt is not independently confirmed. New-GUI Dev receipt allocation, finalization, closure and OLAP readback passed. V4 SQL regression and concurrency passed. Earlier V3 speed measurements remain historical; no new V4/production speed percentage is claimed. Offline multi-device recovery, scheduled exports and Looker remain unverified.

Rollback points: Dev OLTP **1.000014**, production OLTP **3.000071**, OLAP unchanged. Production logical backup was restored successfully with all 14 business tables matching. Reconcile prepared receipts before fallback; use a higher migration to disable the processor and restore original action expressions, retaining ledger history and guards. App rollback alone does not undo SQL changes.

## Verification coverage

Latest development checkpoint: **V14 / OLTP 1.000061 / OLAP 1.000064**. VC phases 1–4 are implemented and agent-verified; the owner accepted promotion on 16 September. Mobile/offline feedback remains unverified. Rollback apps are 1.000048 / 1.000052 plus verified private V11 database backup; coordinate SQL/app recovery. [Evidence](../outputs/vc-materialization-20260916/REPORT.md). Both apps are deployed to allow scheduled events. AppSheet daily charge schedule is enabled at 00:05 Bangkok; development pg_cron is paused. OLAP analytics is enabled hourly at :00, with a first natural successful run at 00:00:05 on 16 September. Calendar is absent from the app; historical SQL objects remain. Both Statistics schemas and all OLAP slices reconcile. Manual/bot refresh preserves keys; all 42 original dates matched independent old-expression calculations. Audit History Alerts are enabled, but the owner received no test error email. See [monitored jobs](../outputs/monitored-jobs-20260915/REPORT.md). The V10 paragraphs below are historical checkpoints, superseded by this paragraph for development.

V10 checkpoint: OLTP 1.000042 and OLAP 1.000040. Current editor/appdoc comparisons and current OLTP/OLAP default-loan financial readback passed. The owner subsequently accepted implementation through the phases 1–6 production request; separate phase-6 device push confirmation was not recorded. At that checkpoint the normalized business schema equaled the independent V10 rebuild (`242404152af2760a046b1e628e7a4df1e56a1a7230e90839f8192d8e05217bba`) and production V10. The [Default Loan report](../outputs/default-loan-20260915/REPORT.md) retains its historical development test evidence and 1.000039 rollback versions.

Development Cloud SQL flags saved/restarted at 20:35:07 Bangkok: cloudsql.enable_pg_cron=on, cron.database_name=loan_manager_prod, cron.timezone=Asia/Bangkok, cron.max_running_jobs=1; existing cloudsql.iam_authentication=on and max_connections=50 preserved. Actual pg_cron extension 1.6.7 uses background workers. Session TimeZone remains UTC. The earlier active-job checkpoint is superseded: development pg_cron is paused and AppSheet Generate Daily Charges is enabled at 00:05 Bangkok. Temporary job 2 was removed; CG8GUI borrowers remain hidden and loan auto-charge disabled.

| Area | Latest evidence | Status / limitation |
| --- | --- | --- |
| Four AppSheet definitions | 15 Sep 12:17–12:20 Bangkok, read-only appdoc | Tables, columns, Refs, slices, actions and views captured; versions above |
| PostgreSQL schema | 15 Sep fresh exports and catalog queries | Both normalized schemas equal V1 SHA256 0edda94ee69bbcfe1e2b8bf5bad16f7dbbd46af7289a9700bff280b49ea20d38 |
| Runtime settings | Fresh SQL queries recorded in output JSON | PostgreSQL 18.6, SSL, production 100/development 50 |
| Database application objects | Fresh catalogs | 14 base tables + 2 views + 6 functions + 10 triggers + 13 validated FKs; plus Flyway metadata |
| Cloud tier/network/backups | Dated micro/development/Flyway change logs | Recorded latest configuration; not freshly checked in Console |
| Development smoke tests | Development instance verification, 15 Sep | Concurrent sync and assessment edit/readback passed earlier; not repeated here |
| Production financial lifecycle | PostgreSQL migration/cutover logs | Historical test evidence; no new production test transaction |
| Bot enablement | Current editor, all four apps | 20 bot states recorded below; scheduled execution/delivery not tested |
| Sync toggles | Current editor, all four apps | All six settings recorded below; no settings changed |
| Looker / export delivery | Existing design documents | Not freshly checked; no claim of current report or notification delivery |

The browser's full accessibility extraction timed out on the large appdoc; bounded DOM reads of the rendered documentation succeeded for all four apps. Sync settings and bot enablement were read in the current editor. This was read-only configuration capture, not legacy-GUI testing.

## Current sync settings

| App | Server caching | Delta sync | Quick sync | Sync on start | Delayed sync | Automatic updates |
| --- | --- | --- | --- | --- | --- | --- |
| production-oltp | Off | Off | Off | On | Off | On |
| production-olap | Off | Off | Off | On | Off | On |
| development-oltp | Off | Off | Off | On | Off | On |
| development-olap | Off | Off | Off | On | Off | On |

All four settings rows incorporate the earlier [PostgreSQL sync-options change](../Change%20Logs/CHANGE_NOTES_POSTGRESQL_SYNC_OPTIONS_2026-09-15.md); production OLTP 3.000071 is its recorded saved version, not a fresh full-model capture here. Production OLAP was additionally observed during assessment promotion. No toggle was changed by the lump-sum task. Full post-write readback fetched the SQL-created children in Dev OLTP, and Dev OLAP loaded the matching shared ledger. Other users' changes still require a fresh sync; automatic updates do not guarantee immediate cross-app visibility.

## Current bot enablement

Rows below reflect the production V11 promotion at OLTP 3.000098 / OLAP 1.100081 and accepted development V11 at OLTP 1.000048 / OLAP 1.000050. Transactional financial work runs in SQL; the two enabled processing schedules submit monitored AppSheet requests. Development notification bots remain owner-only.

| App | Bot | Enabled |
| --- | --- | --- |
| production-oltp | Notification - First-Day Charge | Yes |
| production-oltp | Create First-Day Charge | No |
| production-oltp | Generate Daily Charges | Yes, daily 00:05 Bangkok |
| production-oltp | Notification - New Loan Created | Yes |
| production-oltp | Notification - Loan Closed | Yes |
| production-oltp | Notification - Charge Received | Yes |
| production-oltp | Payments - Process Receipt | No |
| production-olap | Refresh Daily Analytics Daily | Yes, hourly :00 Bangkok |
| production-olap | Refresh Daily Analytics Daily 2 | Removed |
| production-olap | Daily Loan Analysis Export | No |
| development-oltp | Notification - First-Day Charge (repurposed Auto Receive First-Day Charge) | Yes, owner only |
| development-oltp | Create First-Day Charge | No |
| development-oltp | Generate Daily Charges | Yes, daily 00:05 Bangkok |
| development-oltp | Notification - New Loan Created | Yes, owner only |
| development-oltp | Notification - Loan Closed | Yes, owner only |
| development-oltp | Notification - Charge Received | Yes, owner only |
| development-oltp | Payments - Process Receipt | No |
| development-olap | Refresh Daily Analytics Daily | Yes, hourly :00 Bangkok |
| development-olap | Refresh Daily Analytics Daily 2 | Removed |
| development-olap | Daily Loan Analysis Export | No |

Daily Loan Analysis Export remains disabled in both OLAP apps. The duplicate Calendar bot is removed. Production OLTP retains four notification bots and adds the monitored daily SQL request; its superseded first-day/payment processing bots remain disabled. Development retains the same processing schedules with owner-only notification routing. Both pg_cron jobs are paused. The current production rollback is OLTP 3.000094 / OLAP 1.100062 with coordinated V10 database recovery.

## Evidence and rollback

[Reconciliation evidence](../outputs/documentation-reconciliation-20260915/verification.json), [production catalog](../outputs/documentation-reconciliation-20260915/production-database.json), [development catalog](../outputs/documentation-reconciliation-20260915/development-database.json), and [app definitions](../outputs/documentation-reconciliation-20260915/app-model.json) contain configuration only. Full private snapshots remain outside Git.

Documentation rollback point: Git commit 0a151318a0ddb2d6d3719eadc3979adb78446281 and the archived original workbook. No live app/database configuration changed in this task. Operational rollback must follow its own release log, not restore test apps to production sources blindly.


### Monitored jobs acceptance — 16 September 2026

Owner accepted development V11 / OLTP 1.000048 / OLAP 1.000050 after syncing and checking both apps. Natural hourly analytics at 00:00:05 and all 24 daily charge runs at 00:05:03 Bangkok completed. Error-email delivery remains unverified. [Development evidence and rollback](../outputs/monitored-jobs-20260915/REPORT.md).

Production V11 / OLTP 3.000098 / OLAP 1.100081 was promoted on 16 September. Manual Recent/Full refreshes and the first natural hourly run completed; all 43 dates reconcile and IDs remain stable. The first natural 00:05 charge run through AppSheet remains pending. [Production evidence and rollback](../outputs/monitored-jobs-production-20260916/REPORT.md).
## R002 development checkpoint — 16 September 2026

Latest R002 Dev versions: OLTP **1.000108**, OLAP **1.000096**, SQL **V18**, database-3 on development host 34.158.38.171. Full R002 rollback app versions: 1.000088 / 1.000090. UI refinement-only rollback: OLTP 1.000098; OLAP and V18 unchanged. Production is unchanged by R002. Four Dev notification bots remain disabled; owner-only notification policy is now permitted after route review, not an enablement claim. Existing essential SQL schedules remain enabled, superseded financial processing and export disabled. See [R002 change log](../Change%20Logs/CHANGE_NOTES_R002_2026-09-16.md) for backup, checks and acceptance limits. This checkpoint supersedes older Dev version and notification-state entries below.

## R002 production checkpoint — 16 September 2026

Production database-2 is at Flyway V18. Production OLTP 3.000135 and OLAP 1.100106 contain the released R002-P1 form guard, context import, borrower navigation and Collection native Ref correction while preserving the R003 app identities and production-local links. Pre-edit rollback versions are OLTP 3.000121 / OLAP 1.100101; the private V16 dump SHA-256 is `315af2048f70cdf26ed37d34a01b383f4da60bdf780e8b992375e4405a5ae7e7`. R002 changed no production bot enablement, schedule or recipient. The retired Borrower Name - Collection VC was deleted after owner confirmation; the live Collection detail and borrower Ref navigation passed afterward. [Evidence and rollback](../outputs/r002-production-20260916/REPORT.md).
