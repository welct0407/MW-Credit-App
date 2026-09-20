# R010 production release — Cash Account Statement and payment validation

Released 20 September 2026. The owner explicitly authorized moving R010 to production. SQL V27 was applied first, then frozen PROD-mapped **MW-OLTP-R010-RC2-578763613** version **1.000004** was App Upgraded into the existing production OLTP app. Production OLAP was not upgraded.

| Component | Before | Candidate | After |
| --- | --- | --- | --- |
| PostgreSQL | V26 | V27 at tested commit `5fa0b3dd2bbb00a600f3e12364d634814a65b321` | V27 validated |
| OLTP | 3.000232 | RC2 1.000004 | 3.000235 (upgrade 3.000234 plus automatic consistency check) |
| OLAP | 1.100183 | Unchanged | 1.100183 |

The immediately preceding OLTP 3.000232 user save was compared to 3.000231 through complete AppSheet application documentation. After normalizing the generated timestamp and version line, all 17,476 lines matched. It introduced no configuration drift and RC2 remained the integrated candidate.

## Database

- Pre-migration logical backup: private `prod-r010-before.dump`, SHA-256 `0B6D87E418F885882C58C854D6FE9E8319F85E6715D4B62F99129D0BE88BAA8B`. Restore rehearsal and normalized schema comparison passed; V27 migrated successfully in the restored copy.
- Tested private Flyway release manifest SHA-256: `9783574D1646C1870D626C08D4D427CC2F45285BB5ACFF27150D1220AA1BB1A4` for repository commit `5fa0b3dd2bbb00a600f3e12364d634814a65b321`.
- Production migrate and validate passed from V26 to V27 with exactly one migration.
- Read-only post-migration verification: 4 accounts, 2 context rows, 2 Partners, 38 statement rows and 60 daily-summary rows. Missing Login Email mappings, unknown transaction codes, duplicate keys, daily mismatches and incorrect nonblank uninitialized balances were all zero.
- No DEV fixture or zero-initialization record was copied. No production opening balance, payment, ledger row or notification was written for validation.

## Candidate and App Upgrade

The first copy, RC1, copied table data into Google Sheets and was rejected. It remains an unused contained draft and was never a promotion source. RC2 copied the definition without data. All 16 SQL-backed objects were rebound individually to production `database-2`; AppSheet-native tables remained native. Theme, folder, companion link and scheduled guard were applied before the initial deployment check.

RC2 passed definition, app-definition, data-structure, sign-in, update-mode and account-status deployment checks, then was set to Deployed and frozen at 1.000004. Its scheduled business guard allows only `MW-OLTP-DEV-20260919-578763613` and `LoanManager-975338008-26-08-07`, excluding both RC names.

Immediately before App Upgrade, production OLTP was 3.000232 and RC2 was 1.000004. App Upgrade recorded version 3.000234 at `2026-09-20T08:09:34.9688683Z`; AppSheet's automatic consistency check produced final version 3.000235 at `2026-09-20T08:09:42.2763286Z`.

## Production verification

- Production OLTP is Deployed and the editor reports **No issues found**.
- All 16 SQL-backed sources use `database-2`; 16 AppSheet system/process tables remain native. Exact mapping: [source validation](source-mapping-validation.json).
- Theme is light with Rubik 20 and selected primary color `#d81b60`; the production OLAP link is `LINKTOAPP("LoanBusinessInsights-975338008")`.
- The enabled daily-charge definition retained the canonical-name guard and daily 00:05 schedule. PROD is allowed and RC2 is excluded.
- The production app loaded and synced. Cash Statement opened from the menu with Controls, Transactions and Daily summary panels. The account selector exposed Lisa, Dad SCB, Dad TTB and Dad เงินสดในมือ. No account was selected and no row was edited.
- Production OLAP remained Deployed at owner-saved version 1.100183, loaded successfully and had zero editor issues. R010 made no OLAP definition change.

## Recovery and retained candidate

App rollback restores OLTP 3.000232. Additive V27 remains compatible with the prior app; removing it requires a reviewed higher migration. Database disaster recovery uses the verified private pre-migration dump and requires a write freeze plus reconciliation of later production writes.

RC2 is retained as the frozen release and recovery evidence with its canonical guard blocking scheduled business work. RC1 is retained as an unused contained draft. Neither RC was deleted or modified after freeze.

Actual Thai second-user and physical-device testing remain the recorded limitations. Existing R010 DEV behavioral tests were reused because the definition and dependencies were frozen. Production validation was intentionally read-only and did not force a notification or financial write.

