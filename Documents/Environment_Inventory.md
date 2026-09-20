# Environment inventory

Latest recorded checkpoint: **21 September 2026**, from the [R012 DEV evidence](../outputs/r012-20260921/test-results.md), [DEV database consolidation evidence](../outputs/dev-db-consolidation-20260920/verification.json) and [R010 production evidence](../outputs/r010-20260919/production/REPORT.md). Current PROD is R010. Unaffected application facts retain their recorded evidence.

## App identities and bindings

| Environment | App | App ID | Live version | SQL connection | SQL tables / views |
| --- | --- | --- | --- | --- | --- |
| Production OLTP | Loan Manager ผู้จัดการสินเชื่อ | 93844270-6aa5-420b-a960-bcdf08abd357 | 3.000237 | database-2 | 16 |
| Production OLAP | Loan Business Insights | e74dd368-654f-44d7-bccf-83cf361d1cdb | 1.100183 (unchanged by R010) | database-2 | 19 |
| Development OLTP replacement | MW-OLTP-DEV-20260919 | 500b27b6-884a-41e8-a9ec-df801b0110ad | 1.000059 (R011 DEV) | database-3 | 16 |
| Development OLAP replacement | MW-OLAP-DEV-20260919 | 9f3422be-bc87-4a5a-a42a-67528ee80393 | 1.000019 (R012 DEV) | database-3 | 19 |

All four canonical apps are recorded Deployed. Internal names:

| App | Internal name | Theme color |
| --- | --- | --- |
| PROD OLTP | LoanManager-975338008-26-08-07 | #d81b60 |
| PROD OLAP | LoanBusinessInsights-975338008 | #0abab5 |
| DEV OLTP | MW-OLTP-DEV-20260919-578763613 | #e8710a |
| DEV OLAP | MW-OLAP-DEV-20260919-578763613 | #1e88e5 |

Production OLTP inbound AppSheet API access is enabled as of version 3.000237 for the Linux integration agent's bounded Find requests. The existing enabled application access key is stored outside Git; no replacement key was created. Production OLAP API access was not changed.

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
| Flyway | V27 migrated and validated (R010) | V28 migrated and validated (R011 DEV) | DEV adds optional Borrowers.Borrower Note; intended Partner delivery data and omitted `pg_cron` differences remain. |

The full instance/host/database tuple establishes environment identity; host or instance alone no longer distinguishes DEV from PROD. Direct public-IP SSL is used; sslmode=require does not establish hostname verification. Credentials remain outside Git at the paths in the maintained environment configuration. After the consolidated DEV database and natural scheduler run were verified, the owner authorized deletion of former instance `appsheet-pg-dev-20260915`. Cloud SQL completed deletion on 20 September 2026, released public IP `34.158.38.171`, and retained no backups or final backup for that instance. The verified private former-DEV logical dump remains outside Git as recovery evidence.

The on-demand Cloud SQL backup at **2026-09-20 19:32 Bangkok** completed before the instance flag change. Private custom-format PROD-source and former-DEV rollback dumps were created and SHA-256 recorded outside Git. `loan_manager_dev` was restored from the PROD snapshot with 22 public tables, 13 views, 162 constraints, 48 indexes, 71 functions, 177 trigger entries and Flyway V27/27 successful history rows. All 21 application-table row counts match the snapshot; 20 fingerprints match, and `Partners` is the sole intended difference after its delivery addresses were set to the owner while two distinct Login Email identities were preserved. PROD retains `pg_cron`; DEV intentionally omits it because the shared instance flag points cron metadata to `loan_manager_prod` and AppSheet owns DEV schedules.

## Automation and limitations

R012 DEV checkpoint: OLAP 1.000019 is Deployed with green saved-state editor diagnostics. `Cash Position` retains its dashboard composition; `Cash Ledger Recent` now shows `Movement Date`, 24-hour `Movement Time`, resolved `Ref Borrower`, payment/loan/source/note/creator context and both cash-account references. Current desktop preview confirmed representative payment rows display borrower names and `hh:mm` values. No data row, SQL object, automation, recipient route or production definition changed. See [R012 evidence](../outputs/r012-20260921/test-results.md).

R011 DEV checkpoint: OLTP 1.000059 and OLAP 1.000018 are Deployed with green saved-state editor diagnostics. Collection note persistence, required English Name validation and the six Thai-first bilingual labels in the new-borrower form passed current desktop GUI checks. Both apps now evaluate all 116 system-text localizations from the signed-in Partner's `Language Preference`, using the platform English label for `English` and Thai otherwise; exact saved-expression readback passed with zero mismatches. See [R011 evidence](../outputs/r011-20260920/test-results.md); production remains R010.

AppSheet owns daily-charge and hourly-analytics scheduling; duplicate pg_cron financial jobs are paused. Intended enabled/retired states and RC guards follow the accepted release evidence. Daily Loan Analysis is a [dormant reference](reference/Daily_Loan_Analysis_Automation.md), not an active promotion dependency unless affected.

The last recorded common sync settings were caching/delta/Quick Sync/delayed sync Off, sync on start/automatic updates On (15 September). They are dated evidence, not a newly verified configuration. Full bot/settings history is archived; inspect only changed routes/settings or concrete problems.

R010 records clear PROD editors, deployed apps, statement runtime/SQL checks and frozen guard/mapping evidence. The database consolidation verified both DEV runtime apps load/sync and both current editors remain Deployed with no displayed warning/error text. Physical-device receipt and actual second-user GUI testing remain declared limitations. The former five-account DEV zero-initialization fixture was replaced by the requested PROD data refresh; its [verification](../outputs/r010-20260919/cash-statement/ZERO_INITIALIZATION.md) is historical evidence, not current DEV state. Production has four cash accounts; this maintenance changed no production financial row. Release-specific rollback/backup points belong in the relevant evidence, not a reusable old-version table here.
