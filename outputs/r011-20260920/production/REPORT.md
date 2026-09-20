# R011 production report

Released 21 September 2026. The owner explicitly directed that all R012 scope be merged into R011 and authorized R011 production promotion.

## Result

- PostgreSQL production advanced from Flyway V27 to V29 using the tested immutable V28/V29 migrations.
- Production OLAP retained UUID `e74dd368-654f-44d7-bccf-83cf361d1cdb` / internal name `LoanBusinessInsights-975338008` and finished Deployed/editor-clear at **1.100189**.
- Production OLTP retained UUID `93844270-6aa5-420b-a960-bcdf08abd357` / internal name `LoanManager-975338008-26-08-07` and finished Deployed/editor-clear at **3.000240**.
- R012 was not a separate product release. Its Cash Ledger Recent scope is included in R011 and its reservation is retired.

## Recovery and SQL

Immediately before migration, production was V27 / OLTP 3.000237 / OLAP 1.100183. Private backup `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r010-20260919/r011-production-before-20260921-0055.dump` has SHA256 `F4AA1D1F73982E05B57CF3CE1D8442D3C8070E2F764C5CECE7FCF3146B17BF2C`; catalogue restore and normalized schema comparison passed, and the candidate migrations were rehearsed. V28 adds nullable `Borrowers.Borrower Note`; V29 adds nullable `Cash Accounts.Alternative Account Number`. No backfill or production financial row was written. Post-migration Flyway validation passed with 30 migrations recorded (including baseline/history row numbering).

The tested package was pinned at commit `d8642d06d6bd39f0f168282b990bbc79721af3f6`. The corrected private runner manifest SHA256 is `8AEE4B26AC33835A5E9B242965B3B17CA6916A41DC06323ABCF6B8AFD1F2D511`.

## Candidate and App Upgrade

RC1 copies were rejected because AppSheet's default copy-data switches had remained selected; they were never used for promotion. RC2 was recreated definition-only with both data-copy options explicitly off, fully rebound/audited against PROD, given the corresponding PROD themes and companion links, guard-checked, deployment-checked and frozen. The first OLAP upgrade exposed that App Upgrade also copies the source display name. Promotion stopped before OLTP upgrade.

Corrected RC3 apps were then created as definition-only copies of the PROD-mapped RC2 definitions with both data-copy options off. Exact PROD display names were saved, inherited mappings/links/themes and canonical guards were rechecked, and both passed initial deployment checks with no editor issues:

| App | Frozen RC3 | UUID | PROD before | PROD final |
| --- | --- | --- | --- | --- |
| OLAP | `MW-OLAP-R011-RC3-578763613` 1.000005 | `2aa8074e-7376-44a7-a46a-e1c597618f4b` | 1.100183; interim RC2 upgrade 1.100186 | 1.100189 |
| OLTP | `MW-OLTP-R011-RC3-578763613` 1.000005 | `ba1c0e84-fba3-435c-8b4b-68653e34dea5` | 3.000237 | 3.000240 |

The initial OLAP RC2 upgrade changed only the copied definition/display name in the existing PROD identity and was immediately superseded by the corrected RC3 upgrade. No financial data operation or notification occurred during either upgrade.

## Production validation

- Both apps remain Deployed, saved and editor-clear; original PROD UUIDs/internal names and exact user-facing display names are retained.
- All 16 OLTP and 19 OLAP SQL objects remain on PROD `database-2`; exact object mapping is in [source mapping](source-mapping-validation.json).
- OLTP and OLAP schedule guards allow their canonical DEV and PROD internal names only; RC2/RC3 names are excluded. Prior server-side allow/exclude proof was reused.
- OLAP `Cash Position` loaded. `Cash Ledger Recent` displayed Movement Date, 24-hour time, borrower/payer, movement/amount, holder/account routing, payment/loan/source/note/creator context on representative current production rows.
- OLTP borrower list loaded. The blank borrower form exposed Thai-first bilingual labels including `ชื่อภาษาอังกฤษ / English Name`; the form was cancelled without a write.
- No production financial test write, forced notification or forced scheduled job was performed. Physical-device/offline, separate Partner-login and concurrent-edit checks remain unmeasured.

## Rollback

App rollback points are OLTP 3.000237 and OLAP 1.100183. The additive nullable V28/V29 schema is backward-compatible and should normally be retained during app rollback; database restore requires explicit later-write review. Frozen Deployed RC3 definitions are retained as recovery evidence, with scheduled business execution excluded by the canonical guards.
