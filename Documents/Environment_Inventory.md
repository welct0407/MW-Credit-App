# Environment inventory

Updated 15 September 2026. Production/development are separate Cloud SQL instances. The development database retains the name loan_manager_prod because it was cloned; use instance/host, not the database name alone, to identify the environment.

## App identities and bindings

| Environment | App | App ID | Live version | SQL connection | SQL tables / views |
| --- | --- | --- | --- | --- | --- |
| Production OLTP | Loan Manager ผู้จัดการสินเชื่อ | 93844270-6aa5-420b-a960-bcdf08abd357 | 3.000074 | database-2 | 8 |
| Production OLAP | Loan Business Insights | e74dd368-654f-44d7-bccf-83cf361d1cdb | 1.100051 | database-2 | 13 |
| Development OLTP | Loan Manager — DEV | 65faacd8-2b0d-43bf-9e0a-58eb915dcf9b | 1.000025 | database-3 | 8 |
| Development OLAP | Loan Business Insights — DEV | 494cd013-0d9b-482f-9559-c9d83059de91 | 1.000031 | database-3 | 13 |

Both OLAP apps use the SQL Calendar and assessment views after the authorized assessment promotion. Native internal tables are excluded from the SQL counts. There are 42 SQL bindings across the four apps. OLAP definitions were recaptured during promotion; unrelated app captures retain their original timestamps. The workbook records the exact logical-to-physical mapping.

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
| Flyway | V4 migrated and validated | V5 migrated and validated | V5 nullable interval anchor is development only; schemas intentionally differ |

Raising max_connections does not prove enough memory for that many active queries. The 50/100 values are current settings, not measured sustainable concurrency. Capacity changes require separate documentation and may restart the instance. The runtime's sslmode=require encrypts traffic; it is not hostname verification. No proxy is used.

Passwords remain outside Git under Documents/ChatGPT/AppSheet-Loan-Project. Both environment configurations reference the existing external password file; values are never included here. Private credential/snapshot backup coverage is not established by Git or database backups. Backup/PITR/deletion-protection settings were recorded in prior instance logs; no restore was tested by this documentation task.

### Interval anchor verification — 15 September 2026

Development versions above were freshly captured after Loans regeneration and schedule/form changes. Sources remain database-3, all existing keys/Refs/slices/permissions/calculations and companion-app links remain unchanged. Development Flyway V5 adds only Loans.Interest Schedule Anchor Date and its check constraint. Current-GUI synthetic generation, validation, duplicate prevention, unchanged accrual and OLAP readback passed. Daily generation and OLAP scheduled/export bots remain disabled; the three previously owner-authorized Dev pushes retain their sole owner recipient. No notification/export was intentionally triggered by these synthetic tests. Earlier inventory observations below retain their original scope and timestamps; they do not describe V5 schema equality with production. See [interval change notes](../Change%20Logs/CHANGE_NOTES_INTERVAL_ANCHOR_2026-09-15.md).

### Lump-sum release — 15 September 2026 (historical release snapshot)

Production OLTP **3.000074**, Dev OLTP **1.000019**, both databases **Flyway V4**. OLAP versions remain production **1.100051** and development **1.000027**. The [release report](../outputs/lumpsum-promotion-20260915/REPORT.md) supersedes the historical V3 design and notification limitation.

PostgreSQL prepares positive allocations and matching repayments atomically, newest eligible charge first with immutable-key ties and interest before principal. Existing AppSheet actions finalize the receipt and close paid loans, producing the existing notification events. Processing remains visible if finalization fails; prepared receipts cannot allocate twice and block another lump-sum receipt until reconciled. SQL validates the final Posted transition. Seven indexes, three functions and four triggers reuse existing tables and columns; no queue or new business field exists. New ls2: children retain negative Allocation Order in Charge Row Number Snapshot. Historical rows retain their prior interpretation.

The receipt event and group both use `[Status] = "Processing"`. Three allocation actions skip Lump Sum; two reconcile assignments select Posted/NOW() for Lump Sum and preserve original other-method expressions. [Exact action expressions](../outputs/lumpsum-promotion-20260915/action-expressions.json) are promotion evidence. Both apps read the same ledger, sources remain isolated (production database-2, Dev database-3), and no schema regeneration, Ref, slice or business-column change is required.

Production notification events, templates and recipient expressions are retained. The owner explicitly authorized the three Dev push bots with `LIST("welct0407@mw-credit.com")` as their sole recipient expression. Other Dev scheduled/export bots remain disabled. Dev Payment Received and Loan Closed runs completed in AppSheet; device receipt is not independently confirmed. New-GUI Dev receipt allocation, finalization, closure and OLAP readback passed. V4 SQL regression and concurrency passed. Earlier V3 speed measurements remain historical; no new V4/production speed percentage is claimed. Offline multi-device recovery, scheduled exports and Looker remain unverified.

Rollback points: Dev OLTP **1.000014**, production OLTP **3.000071**, OLAP unchanged. Production logical backup was restored successfully with all 14 business tables matching. Reconcile prepared receipts before fallback; use a higher migration to disable the processor and restore original action expressions, retaining ledger history and guards. App rollback alone does not undo SQL changes.

## Verification coverage

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

| App | Bot | Enabled |
| --- | --- | --- |
| production-oltp | Auto Receive First-Day Charge | Yes |
| production-oltp | Create First-Day Charge | Yes |
| production-oltp | Generate Daily Charges | Yes |
| production-oltp | Notification - New Loan Created | Yes |
| production-oltp | Notification - Loan Closed | Yes |
| production-oltp | Notification - Charge Received | Yes |
| production-oltp | Payments - Process Receipt | Yes |
| production-olap | Refresh Daily Analytics Daily | No |
| production-olap | Refresh Daily Analytics Daily 2 | Yes |
| production-olap | Daily Loan Analysis Export | No |
| development-oltp | Auto Receive First-Day Charge | Yes |
| development-oltp | Create First-Day Charge | Yes |
| development-oltp | Generate Daily Charges | No |
| development-oltp | Notification - New Loan Created | No |
| development-oltp | Notification - Loan Closed | No |
| development-oltp | Notification - Charge Received | No |
| development-oltp | Payments - Process Receipt | Yes |
| development-olap | Refresh Daily Analytics Daily | No |
| development-olap | Refresh Daily Analytics Daily 2 | No |
| development-olap | Daily Loan Analysis Export | No |

Production Daily Loan Analysis Export remains disabled. The production OLAP Refresh Daily Analytics Daily 2 bot is enabled; its predecessor is disabled. All three development OLAP bots are disabled. Production OLTP has all seven listed bots enabled; development retains three transactional bots and disables generation/notification bots. No bot was run or changed. Codex scheduler state and delivery acceptance remain unverified.

## Evidence and rollback

[Reconciliation evidence](../outputs/documentation-reconciliation-20260915/verification.json), [production catalog](../outputs/documentation-reconciliation-20260915/production-database.json), [development catalog](../outputs/documentation-reconciliation-20260915/development-database.json), and [app definitions](../outputs/documentation-reconciliation-20260915/app-model.json) contain configuration only. Full private snapshots remain outside Git.

Documentation rollback point: Git commit 0a151318a0ddb2d6d3719eadc3979adb78446281 and the archived original workbook. No live app/database configuration changed in this task. Operational rollback must follow its own release log, not restore test apps to production sources blindly.
