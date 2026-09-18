# R007 — OLAP SQL analytics optimization

Date: 18 September 2026. Status: DEV complete; **Ready subject to owner acceptance and scoped production authorization**.

## Continue here

Implementation is complete in DEV **SQL V22 / OLAP 1.000142 / unchanged OLTP 1.000134**, both Prototype. Production remains V21 / OLAP 1.100122 / OLTP 3.000173 and is not authorized for change. Revision 1 has 293 exact AppSheet targets, all independently verified. All-row parity is zero mismatches across 122 fields; relevant synthetic SQL, GUI and refresh checks pass. Median sync 14.641 → 4.608 seconds. Overview, dictionary, inventory and DEV difference records are updated. [Complete report](../outputs/r007-20260918/REPORT.md) and [frozen package / tested commit / Flyway manifest](../outputs/r007-20260918/FROZEN.md) hold the stable evidence. Next step is owner acceptance and scoped production authorization, then the documented promotion prerequisites. Do not replay DEV edits or modify V22.
## Scope and source

Source: `G:\My Drive\Loan Manager\Design Documents\R007_OLAP_SQL_Optimization_Design.md`. Five ordinary PostgreSQL analytics views; preserve exact current semantics and provider metadata; rebind OLAP Charges, Repayments, Loans and Borrowers; add hidden Portfolio Summary and Statistics dereferences while retaining refresh commands. No physical base-table caches, semantic corrections, OLTP changes or production writes.

## Rollback

Local files: starting commit bef621c088dadc42a8c6c6fa221e3353a558431c, no pre-existing uncommitted work. DEV OLAP restorable version 1.000129 confirmed in current version history. Private DEV backup `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r007-20260918/development-before.dump`, SHA-256 `134e9959ebbf7b62fa2af600ab9b2cdfeb981d53be5bfcb20525ebbe45db5654`. Restore succeeded and normalized application schemas match; public/assessment_lab and Flyway history included, Cloud SQL extension/settings excluded. Coordinate app source/formula rollback with SQL compatibility. Additive unused views can remain during app rollback; do not blindly restore a database over subsequent writes.

## Owner clarification

The owner first excluded OLAP's Every Hour Prototype execution warning, then explicitly answered **“Exclude both Prototype scheduling warnings”**, covering OLTP's existing Daily 00:05 warning. Final saved-state diagnostics show only these two messages. Keep both apps Prototype and preserve schedules; all other editor warnings/errors remain gated. This grants no production, notification or financial-write authorization.
## SQL implementation and evidence

- V22 creates the five specified views plus one shared Bangkok reporting-date function, with no base-table/trigger modifications or speculative indexes.
- [Saved pre-change contract](../outputs/r007-20260918/before-contract.json): exact 48 Borrower, 18 Loan, 10 Repayment, 6 Charge and 40 Statistics expressions and metadata. Full private app documentation and API rows remain outside Git.
- [Restored candidate parity](../outputs/r007-20260918/candidate-parity.json) and [live DEV SQL parity](../outputs/r007-20260918/sql-dev-parity.json): all 122 fields, zero mismatches against independently computed AppSheet baseline; keys/populations identical. As-of 18 September Bangkok. Row counts: Borrowers 64, Loans 108, Repayments 741, Charges 917, Statistics 1.
- Observed semantics retained: integer division for matrix equal share/on-time rates and reliability scores; rounded Decimal/Price/Percent column boundaries; empty-history date behavior; matrix uses prior ten days excluding today; borrower exposure denominator uses Borrowers, while portfolio outstanding uses Loans.
- `Test-Migrations.ps1 -TestSqlFile scripts/database/Test-R007.sql` passed: 22 migrations, second migrate no-op, checksum tampering rejected; synthetic future/due/overdue/partial/on-time/late charges, historical contribution/withdrawal rounding, rolling-date boundaries, collection priority, three loan types/installment day-by-day oracle, default forecast and timezone independence. Initial fixture used immediate deferred triggers during default update; corrected fixture deferral without changing application triggers. The runner reports baselineRebuildMatch=false when later migrations are present; this is not a V22 test failure.
- DEV migrate applied only V22; subsequent Flyway validate succeeded with no invalid migrations. PROD read-only info confirms V21; no production mutation.
- Private query plans captured locally and in DEV. Before/after end-to-end sync samples and measured limits are recorded in the report; median reduction 68.5%.

## App implementation and generated changes

All four source rebindings retain database-3, original keys/Refs and metadata. Regeneration automatically converted 82 same-name VCs into provider columns; their retained App formulas were removed and all final provider Read-Only flags checked. Eight remaining flags found by independent readback were corrected. Charges.Ref Collection Borrower is hidden Ref-to-Borrowers, without IsPartOf; Borrowers.Related Charges is hidden and Todays Collection Charges aliases it. Regeneration appended helpers to four Borrower slices and Reporting Charges; all five additions were removed to restore exact original membership/order.

Portfolio Summary is READ_ONLY with Row ID as Text key, Statistics ID as Text label and 40 hidden provider KPIs matching Statistics type/precision. The initially generated incorrect Total Profit key was corrected before validation. Its two generated ref-only views and reverse Related Statistics list are included in the final delta. Statistics stays editable on base Statistics; hidden Portfolio Summary Ref uses Row ID, and 40 heavy VCs dereference it. Five headers and both refresh actions remain. Repayments Row ID's provider fixed-definition/initial-value-editability flags changed on moving from a base table to a view; key value/type and read-only behavior did not.

The exact delta is derived from independent final saved documentation, supplemented by actual Storage Source Id readbacks. All 293 targets compare Verified. All original slices, views, actions and formatting rules match baseline; no automation, notification, export route or cross-app link was edited. App work saved across versions 1.000130–1.000142; final 1.000142 supersedes intermediate schema warnings/settings. Browser automation resets did not reload the editor or discard changes.

## Validation and closure

The linked report contains all-row parity, original-field/list preservation, synthetic boundaries, five query plans, current GUI checks and diagnostics. Recent refresh regenerated two dates; Full regenerated 45 with stable keys. Six stale snapshots were corrected by the unchanged refresh engine; the resulting peak metric change reconciles, all 45 dates pass the independent oracle, and 40 post-refresh Statistics fields match SQL. No financial transaction or notification was forced. GUI assessment was inspected only; its existing stale-result message was left intact, and no lending decision was submitted.

Both Prototype scheduling warnings are owner-excluded; no other editor issue remains. No DEV or PROD deployment check was run. Reporting slice contracts are unchanged; live Looker/export-delivery and mobile/offline performance were not measured. Owner acceptance and production authorization remain pending. Repository publication covers sanitized implementation/configuration/evidence, not private backups or financial captures.

## Changed files and recovery coverage

- `database/migrations/V22__olap_analytics_views.sql`: immutable SQL implementation.
- `scripts/r007-*.mjs`, `scripts/database/{Snapshot-R007,Test-R007Backup,Read-R007,Read-R007Refresh}.ps1`, `Test-R007.sql`: maintained capture, validation, delta and documentation tools; private rows/authentication stay outside Git.
- `outputs/r007-20260918/`: sanitized contract, exact delta/readback, comparisons, benchmarks, diagnostics, previews, report and freeze evidence.
- `Documents/{Release_Tracker,Environment_Inventory,Development_Changes,AppSheet_Data_Model_Overview}.md`, `AppSheet_Data_Dictionary.xlsx`, `database/README.md`: current DEV difference, unchanged PROD reference and release status.
- This log: decisions, implementation history, checks and rollback. Starting clean commit is recorded above. Publication commit/hash is recorded in the frozen package and final task response.