# Environment inventory

Latest recorded checkpoint: **20 September 2026**, from [R010 DEV evidence](../outputs/r010-20260919/REPORT.md) and [R009 production evidence](../outputs/r009-20260919/production/REPORT.md). This documentation cleanup performs no fresh live audit. Current PROD is R009; R010 is DEV-only.

## App identities and bindings

| Environment | App | App ID | Live version | SQL connection | SQL tables / views |
| --- | --- | --- | --- | --- | --- |
| Production OLTP | Loan Manager ผู้จัดการสินเชื่อ | 93844270-6aa5-420b-a960-bcdf08abd357 | 3.000231 | database-2 | 13 |
| Production OLAP | Loan Business Insights | e74dd368-654f-44d7-bccf-83cf361d1cdb | 1.100181 | database-2 | 19 |
| Development OLTP replacement | MW-OLTP-DEV-20260919 | 500b27b6-884a-41e8-a9ec-df801b0110ad | 1.000036 (R010 ready for review) | database-3 | 13 |
| Development OLAP replacement | MW-OLAP-DEV-20260919 | 9f3422be-bc87-4a5a-a42a-67528ee80393 | 1.000015 | database-3 | 19 |

All four canonical apps are recorded Deployed. Internal names:

| App | Internal name | Theme color |
| --- | --- | --- |
| PROD OLTP | LoanManager-975338008-26-08-07 | #d81b60 |
| PROD OLAP | LoanBusinessInsights-975338008 | #0abab5 |
| DEV OLTP | MW-OLTP-DEV-20260919-578763613 | #e8710a |
| DEV OLAP | MW-OLAP-DEV-20260919-578763613 | #1e88e5 |

Companion links join the corresponding pair. DEV uses owner-only Partner delivery data and distinct login identities. Scheduled guards allow only the canonical DEV/PROD name of the corresponding role. See [policy](../AGENTS.md#2-architecture-and-ownership) and [guard procedure](Release_Workflow.md#scheduled-bot-execution-guard); these details are not a new delivery/execution test.

R009 RCs were deleted after owner-approved retirement; captured definitions and evidence remain in its [manifest](../outputs/r009-20260919/release-manifest.json). No live RC is recorded. The historical Money AppSheet database is not a write target. Superseded DEV/backup IDs are not recovery targets.

## Cloud SQL

| Setting | Production | Development | Evidence |
| --- | --- | --- | --- |
| Project | clever-oasis-508610-n7 | clever-oasis-508610-n7 | Repository environment configuration |
| Instance | appsheet-pg-prod-20260914 | appsheet-pg-dev-20260915 | Environment configuration |
| Public host | 34.21.174.215 | 34.158.38.171 | Environment configuration; recorded connection |
| Database | loan_manager_prod | loan_manager_prod | Recorded SQL evidence |
| PostgreSQL | 18.6 | 18.6 | Recorded SQL evidence |
| max_connections | 100 | 50 | Recorded SQL evidence |
| Connection | Direct public IP, SSL required | Direct public IP, SSL required | SSL recorded on prior audit sessions; configured sslmode=require |
| Tier | db-f1-micro | db-f1-micro | Latest dated capacity/development logs; not a fresh Cloud Console inspection |
| Storage | 10 GB HDD, automatic increase | 10 GB HDD | Latest dated configuration logs |
| Access list | AppSheet 73 addresses plus authorized workstation /32 | Same recorded access scope | Flyway adoption log; no network change here |
| Flyway | V26 migrated and validated (R009) | V26 migrated and tested (R009) | V25 adds Partner login identity; V26 aligns Effective Daily Interest Rate with outstanding principal. Exact V25/V26 promoted; no DEV data was copied. |

Host/instance, not the shared database name, establishes environment identity. Direct public-IP SSL is used; sslmode=require does not establish hostname verification. Credentials remain outside Git at the paths in the maintained environment configuration. Capacity/network facts retain their original observation dates in the [archive](archive/2026-09-20/Environment_Inventory.md); no new load/capacity or recovery coverage is asserted.

## Automation and limitations

AppSheet owns daily-charge and hourly-analytics scheduling; duplicate pg_cron financial jobs are paused. Intended enabled/retired states and RC guards follow the accepted release evidence. Daily Loan Analysis is a [dormant reference](reference/Daily_Loan_Analysis_Automation.md), not an active promotion dependency unless affected.

The last recorded common sync settings were caching/delta/Quick Sync/delayed sync Off, sync on start/automatic updates On (15 September). They are dated evidence, not a newly verified configuration. Full bot/settings history is archived; inspect only changed routes/settings or concrete problems.

R009 reported clear PROD editors, runtime/SQL checks and natural schedule observation. Physical-device receipt and actual second-user GUI testing remain declared limitations. R010 records DEV OLTP editor/form checks only. All three production cash-account openings remain uninitialized. Release-specific rollback/backup points belong in the release manifest/log, not a reusable old-version table here.
