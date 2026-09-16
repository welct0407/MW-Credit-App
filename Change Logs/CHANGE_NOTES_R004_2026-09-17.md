# R004 — Bilingual referral rebate category

Reserved 17 September 2026. Candidate R004-P1. Status: DEV implementation and behavioral tests complete; promotion readiness blocked by configuration-export coverage pending owner decision. PROD unchanged.

Owner request authorizes DEV implementation/testing and direct PROD promotion of this scope, including updating the existing Nan backlog expense category.

Intended category: `Referral Rebate / เงินคืนค่าแนะนำลูกค้า`. Existing closure code stores `Referral Rebate` without Thai. Scope covers the SQL category literal, matching AppSheet category validation and the requested existing expense. Source Type remains the existing internal discriminator; calculations and eligibility are unchanged.

Consumers: OLTP owns closure/manual expense workflows; OLAP reads Business Expenses and referral totals. Review category validation and display in both apps. No report changes are planned.

The owner's follow-up also includes the category in the manual expense dropdown. This does not convert manual records to automatic rebates or change automatic eligibility, amounts, allocations or duplicate protection.

## Exact package and checklist

| ID | Object / property | Before | Frozen DEV / intended PROD | DEV | PROD |
| --- | --- | --- | --- | --- | --- |
| SQL-01 | public.create_referral_rebate(text), category literal | Referral Rebate, V18 | Exact [V19 migration](../database/migrations/V19__bilingual_referral_rebate_category.sql); bilingual category, no calculation/source changes | Verified V19 | Pending |
| SQL-02 | Existing manual English referral category backfill | One qualifying PROD row, amount 660, date 2026-09-16 | V19 UPDATE changes category only; source remains Manual | Restored-PROD rehearsal: exactly one correction, all noncategory expense fields preserved | Pending |
| APP-01 | OLTP Business Expenses.Expense Category.Type Qualifier.Valid_If | Exact before in [definition diff](../outputs/r004-20260917/definition-diff.json) | Exact ordered [target expression](../outputs/r004-20260917/category-valid-if.txt), no environment substitution | Verified 1.000110 | Pending; starting 3.000155 |
| APP-02 | OLAP Business Expenses.Expense Category and table permission | Text, no Valid_If, READ_ONLY | Unchanged; display stored bilingual value | Verified 1.000096, automatic and manual rows displayed | Pending; starting 1.100106 |
| ENV-01 | Bindings and companion links | DEV database-3 / PROD database-2 | Preserve each environment and app IDs in Environment_Inventory | Both-direction DEV navigation verified | Pending |
| COVER-01 | Complete saved configuration comparison | Rendered appdoc snapshots captured for both apps in both environments | No unaccounted changes | All 550 OLTP / 714 OLAP exported tables compared. Only OLTP version and APP-01 changed. App-level/bot settings absent from export prevent full coverage | Pending owner scoped exception |
| CHECK-01 | Editor diagnostics and deployment state | Current editor inspected | Zero warnings/errors; deployed state | Both show No issues found and deployed | Pending |

## Test evidence and consumers

- Isolated PostgreSQL `Test-Migrations.ps1 -TestSqlFile scripts/database/Test-BusinessExpenses.sql`: all 19 migrations succeeded, repeat migration applied zero, deliberately altered checksum rejected, expense regression passed. Rerun after adding the explicit bilingual-category assertion passed. Existing rounding, allocation, duplicate protection and immutability checks retained.
- `Test-R004Backup.ps1`: private PROD logical backup restored into isolated loopback PostgreSQL. Public/assessment_lab normalized schema matched. V19 rehearsal changed exactly one manual category and preserved every other expense field. Cloud SQL cron extension/settings are excluded from this local restore test.
- DEV `Invoke-R004Fixture.ps1`: synthetic fully paid loan generated rebate 10 through SQL payment/closure processing. GUI showed the bilingual automatic category. This was SQL-driven closure with GUI readback, not a GUI closure-action test.
- Current DEV OLTP GUI: selected the new dropdown choice and saved synthetic manual expense 10. SQL readback confirmed Source Type Manual and allocated amounts summing to 10. DEV OLAP synced and displayed both test records correctly with 6/4 allocations and no Add/Edit action. Retained synthetic identifiers use R004; borrowers hidden, autocharge false, collection disabled. No PROD fixture writes authorized or performed.
- Existing automatic English category remains valid for immutable historical rows. Manual category list preserves its five existing choices and appends the bilingual referral category. Manual rebate entry does not calculate the rebate amount automatically.
- Category is already present in OLTP expense form/deck/detail and OLAP read-only expense list/detail. No keys, references, columns, slices, form order, amount validation, permissions, notification definitions or financial calculations were intentionally changed. Gross/net reporting uses Amount and internal Source Type, not the displayed category. No Looker report edit or audit; no direct metric-grain change.
- Both DEV current editors show `No issues found` and deployed status. The deployed-page UI has no separate Run deployment check control. No hidden/dismissed diagnostics or prototype-state switch was used.
- Scope of desktop tests does not include other roles/devices/offline or notification delivery, none changed by R004.

Private snapshots and raw GUI evidence: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r004-20260917`. Sanitized exact diff and workbook verification are under `outputs/r004-20260917`. The spreadsheet update preserves all existing cell values and appends the missing category rule plus its difference record; reimport comparison and zero-error scan passed.

## Recovery, approval and promotion order

Starting app rollback versions: DEV OLTP 1.000109, OLAP 1.000096; PROD OLTP 3.000155, OLAP 1.100106. DEV and PROD pre-change normalized schema SHA256: `C043B8C83C4DDDBD3605EE9BE3B360E5F6145680CEF0943C8E8A946642071493` (V18).

Restored PROD backup: external `production-before.dump`, SHA256 `20E6BDD0DA32B4A65F1C5DCF03668FDCF9021B70F3E128A2B6EAB6B58D31C864`. Private credential backup coverage is not established by this database backup or repository push.

Owner authorized direct promotion after DEV testing and added manual-dropdown scope. Full export coverage exception was requested separately; no exception is assumed. Readiness: **Not ready** pending that coverage decision. Exact tested implementation commit and Flyway manifest will be pinned after package checks and before PROD writes.

Order: recheck PROD V18/schema and exact one-row backfill population; freeze clean tested commit and manifest; apply V19 via approved runner; save only APP-01 in current PROD editor; reload both app definitions, verify category and Nan record without changing any other fields; sync/open both apps, inspect manual dropdown then cancel without saving; recheck diagnostics and companion links. No scheduler pause is needed for a category-only transactional migration; no notifications or financial test action is forced.

Recovery: restore only APP-01 to its exact prior rule (or recorded OLTP version only if no intervening changes). SQL rollback requires a reviewed higher Flyway migration restoring the category literal and the specifically corrected manual row; never edit applied V19, disable integrity triggers, or restore a database over newer financial writes. Previously generated bilingual automatic rows remain immutable and must stay accepted by the app rule during rollback. A full database restore requires separate recovery authorization and reconciliation.
