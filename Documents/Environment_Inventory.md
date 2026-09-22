# Environment inventory

## Metabase platform preparation — 22 September 2026

Railway project **MW Credit Metabase** (`c8e57452-36dc-41f1-8d00-856b521a96c7`) hosts a new Metabase trial platform at <https://metabase-production-ca3f.up.railway.app>. Its separate Railway PostgreSQL application database stores Metabase configuration. The Railway environment is named `production`; it is **not connected to the loan PROD database**. Existing Looker reports and AppSheet/Cloud SQL configuration are unchanged.

Metabase is pinned to v0.63.18.1; its PostgreSQL application database is 16.15. A 384 MB Java heap allows startup under the trial's 1 GB service limit. Java and reporting timezones are `Asia/Bangkok`; `/api/health` returned `ok`. Owner administrator setup is complete, telemetry is disabled, and the **Loan Reports** collection is prepared. A bundled sample chart executed successfully after the pinned deployment became Active. The reporting-source connection remains pending. Limited Trial networking/capacity, missing backup/recovery setup and data-source credential encryption prevent claiming live-reporting readiness. Exact service/volume identities, setup state and recovery limitations are in the [platform setup log](../Change%20Logs/CHANGE_NOTES_METABASE_RAILWAY_2026-09-22.md).

## AppSheet and Cloud SQL checkpoint

Latest recorded checkpoint: **22 September 2026**, from [R015 production evidence](../outputs/r015-20260922/production-report.md) and [DEV database consolidation evidence](../outputs/dev-db-consolidation-20260920/verification.json). Current PROD is R015 (SQL/agent only; app definitions retain R014). Unaffected application facts retain their recorded evidence.

## App identities and bindings

| Environment | App | App ID | Live version | SQL connection | SQL tables / views |
| --- | --- | --- | --- | --- | --- |
| Production OLTP | Loan Manager ผู้จัดการสินเชื่อ | 93844270-6aa5-420b-a960-bcdf08abd357 | 3.000245 (R014) | database-2 | 18 |
| Production OLAP | Loan Business Insights | e74dd368-654f-44d7-bccf-83cf361d1cdb | 1.100194 (R014) | database-2 | 19 |
| Development OLTP replacement | MW-OLTP-DEV-20260919 | 500b27b6-884a-41e8-a9ec-df801b0110ad | 1.000075 (R014) | database-3 | 18 |
| Development OLAP replacement | MW-OLAP-DEV-20260919 | 9f3422be-bc87-4a5a-a42a-67528ee80393 | 1.000031 (R014) | database-3 | 19 |

All four canonical apps are recorded Deployed. Internal names:

| App | Internal name | Theme color |
| --- | --- | --- |
| PROD OLTP | LoanManager-975338008-26-08-07 | #d81b60 |
| PROD OLAP | LoanBusinessInsights-975338008 | #0abab5 |
| DEV OLTP | MW-OLTP-DEV-20260919-578763613 | #e8710a |
| DEV OLAP | MW-OLAP-DEV-20260919-578763613 | #1e88e5 |

R011 OLTP/OLAP RC1, RC2 and RC3 were deleted on 21 September 2026 by explicit owner direction after release closure. Exact editor URLs for all six returned AppSheet 404 / `Home/NotFound`; their recorded IDs are historical evidence only. Use PROD saved versions and the release database backup for recovery. [Retirement evidence](../outputs/r011-20260920/production/rc-retirement.md).

Both R014 RC1 apps were deleted on 21 September 2026 by explicit owner direction after release closure. Exact editor URLs returned AppSheet 404 / Home/NotFound. Recorded RC IDs and versions are historical evidence only; recovery uses PROD saved versions and the retained database/runtime backups. See [retirement evidence](../outputs/r014-20260921/rc-retirement.md).

Owner-directed operational change, 21 September: production OLTP and OLAP inbound APIs are enabled for the Debian integration agent. OLTP retains its existing key; OLAP has a separate protected key. Both keys are outside Git. DEV APIs are unchanged. This configuration is explicitly outside the release process. Do not assume API Enable survives App Upgrade; check both production API switches and bounded probes after upgrades. [Operational record](../Change%20Logs/CHANGE_NOTES_PRODUCTION_API_ACCESS_2026-09-21.md).

Companion links join the corresponding pair. DEV uses owner-only Partner delivery data and distinct login identities. Scheduled guards allow only the canonical DEV/PROD name of the corresponding role. See [policy](../AGENTS.md#2-architecture-and-ownership) and [guard procedure](Release_Workflow.md#scheduled-bot-execution-guard); these details are not a new delivery/execution test.

R010 OLTP RC2 `MW-OLTP-R010-RC2-578763613` (`4bb85573-773f-4495-9f69-6207697addea`, frozen at 1.000004) and unused RC1 `MW-OLTP-R010-RC1-578763613` (`d13b66da-d0eb-43ac-bc45-55b335400451`) were deleted on 20 September 2026 after owner-approved post-release retirement. They are retained only in release evidence and are not live recovery sources. R009 RCs were also deleted after owner-approved retirement. The historical Money AppSheet database is not a write target. Superseded DEV/backup IDs are not recovery targets.

## Cloud SQL

| Setting | Production | Development | Evidence |
| --- | --- | --- | --- |
| Project | clever-oasis-508610-n7 | clever-oasis-508610-n7 | Repository environment configuration |
| Instance | appsheet-pg-prod-20260914 | appsheet-pg-prod-20260914 | Live console and SQL verification |
| Public host | 34.21.174.215 | 34.21.174.215 | AppSheet source readback and SQL verification |
| Database | loan_manager_prod | loan_manager_dev | AppSheet source readback and SQL verification |
| PostgreSQL | 18.6 | 18.6 | Recorded SQL evidence |
| max_connections | 200 | 200 | Live SQL after the 20 September instance restart; shared instance-wide ceiling |
| Connection | Direct public IP, SSL required | Direct public IP, SSL required | Live SQL and AppSheet source readback |
| Tier | db-f1-micro | db-f1-micro | Shared instance; live console readback |
| Storage | 10 GB HDD, automatic increase | Shared 10 GB HDD, automatic increase | Shared instance; live console readback |
| Access list | AppSheet 73 addresses plus authorized workstation /32 | Same shared instance policy | No network-policy change |
| Flyway | V33 migrated and validated (R015) | V33 migrated and validated (R015) | Both include read-only Cash Dashboard, FIFO helper and Partners.AI Reviewer. Both preserve source payment time in new Payment ledger entries. Intended Partner delivery data and omitted DEV `pg_cron` differences remain. |

The full instance/host/database tuple establishes environment identity; host or instance alone no longer distinguishes DEV from PROD. Direct public-IP SSL is used; sslmode=require does not establish hostname verification. Credentials remain outside Git at the paths in the maintained environment configuration. After the consolidated DEV database and natural scheduler run were verified, the owner authorized deletion of former instance `appsheet-pg-dev-20260915`. Cloud SQL completed deletion on 20 September 2026, released public IP `34.158.38.171`, and retained no backups or final backup for that instance. The verified private former-DEV logical dump remains outside Git as recovery evidence.

The on-demand Cloud SQL backup at **2026-09-20 19:32 Bangkok** completed before the instance flag change. Private custom-format PROD-source and former-DEV rollback dumps were created and SHA-256 recorded outside Git. `loan_manager_dev` was restored from the PROD snapshot with 22 public tables, 13 views, 162 constraints, 48 indexes, 71 functions, 177 trigger entries and Flyway V27/27 successful history rows. All 21 application-table row counts match the snapshot; 20 fingerprints match, and `Partners` is the sole intended difference after its delivery addresses were set to the owner while two distinct Login Email identities were preserved. PROD retains `pg_cron`; DEV intentionally omits it because the shared instance flag points cron metadata to `loan_manager_prod` and AppSheet owns DEV schedules.

## Automation and limitations

R011 production checkpoint: PROD V29 / OLTP 3.000240 / OLAP 1.100189 are Deployed with zero editor issues. Production now includes the borrower note and form/localization changes, optional Cash Accounts alternative number, and the R012-originated Cash Ledger Recent detail under the single R011 release. `Cash Position` visibly showed 24-hour movement time, resolved borrower/payer and operational references on current rows. Both canonical guards allow only the matching DEV/PROD internal names and exclude RCs. See the [production report](../outputs/r011-20260920/production/REPORT.md), [source mapping](../outputs/r011-20260920/production/source-mapping-validation.json) and [Cash Ledger evidence](../outputs/r011-20260920/cash-ledger-recent/test-results.md).

AppSheet owns daily-charge and hourly-analytics scheduling; duplicate pg_cron financial jobs are paused. Intended enabled/retired states and RC guards follow the accepted release evidence. Daily Loan Analysis is a [dormant reference](reference/Daily_Loan_Analysis_Automation.md), not an active promotion dependency unless affected.

The last recorded common sync settings were caching/delta/Quick Sync/delayed sync Off, sync on start/automatic updates On (15 September). They are dated evidence, not a newly verified configuration. Full bot/settings history is archived; inspect only changed routes/settings or concrete problems.

R011 records clear PROD editors, deployed apps, load/sync entry-point checks and frozen guard/mapping evidence. Physical-device/offline, separate Partner-login and concurrent-edit testing remain declared limitations. The former five-account DEV zero-initialization fixture was replaced by the requested PROD data refresh; its [verification](../outputs/r010-20260919/cash-statement/ZERO_INITIALIZATION.md) is historical evidence, not current DEV state. Production has four cash accounts; R011 changed no production financial row. Release-specific rollback/backup points belong in the relevant evidence, not a reusable old-version table here.

R013 production checkpoint, 21 September: PROD V30 preserves source payment time in new ledger entries. Production apps were explicitly excluded and remain OLTP 3.000240 / OLAP 1.100189; both loaded and synced after migration. Hours/minutes display is unchanged. [Production report](../outputs/r013-20260921/production/REPORT.md).

R014 DEV checkpoint: V32 / OLTP 1.000075 / OLAP 1.000031, both saved editors show No issues found and remain Deployed. Account grouping and the eight signed/color-coded dashboard figures loaded in desktop and 360-pixel mobile preview. Exact partial settlement passed validation/reservation/cancellation checks. Four current DEV accounts are initialized. The synthetic ฿100 Pending test was audited to Cancelled with no cash-ledger effect; it remains DEV-only. No production change. [DEV report](../outputs/r014-20260921/REPORT.md).

R014 production checkpoint: V32 / OLTP 3.000245 / OLAP 1.100194, both Deployed and saved with zero editor issues. All 37 RC source mappings passed, changed production entry points loaded/synced, exact-amount settlement form and account picker passed without saving a financial row. Both existing API keys still authenticate. Scheduled guards allow PROD and exclude the now-retired RC names. [Production verification](../outputs/r014-20260921/production-report.md).

R014 AI Reviewer: Tommy selected and Lisa unselected in DEV and PROD. OLAP owns editing; OLTP imports the field read-only. The Debian reviewer restriction is installed with business code matching `83e1b56`; all 102 VM tests and the installed production master query passed. Existing four timers resumed. A real customer direct-reply event was not forced during promotion.

## R015 internal agent storage — 22 September 2026

The same Cloud SQL instance `appsheet-pg-prod-20260914`, project `clever-oasis-508610-n7`, host `34.21.174.215` now also hosts the separate `mw_agent` database. It is internal agent infrastructure, not another AppSheet environment. Central schema versions V1–V3 contain 29 audit/runtime/migration tables plus deployment history. All six agent journals and three frozen statement snapshots were migrated; Codex-owned session/auth files remain private on Debian.

Both business databases have V33 `agent_audit` (commits, row_changes, exports) and ten capture triggers for the dedicated reviewer role. Audit/runtime tables are not AppSheet data sources. The Debian proxy still uses `127.0.0.1:5432`; reporting, reviewer DML, central worker and relay use separate restricted logins. No instance/network/connection-limit setting changed. Cloud SQL automated backups and PITR are enabled. Private logical restores and schema/data fingerprints were verified; see the R015 report for recovery evidence.

The agent resumed on PostgreSQL at 13:58 Bangkok with original service cutoffs, two conversation bindings and model settings preserved. The new backend generation quarantines newly arriving pre-cutover events. All five original timers and ingress are active, plus the 30-second audit relay. AppSheet versions, themes, recipients and schedules above remain unchanged.
