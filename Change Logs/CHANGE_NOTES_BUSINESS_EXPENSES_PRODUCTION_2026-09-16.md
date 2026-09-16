# Business expenses production promotion — 16 September 2026

Status: production promotion applied with explicit owner authorization: “ok promote to production”; **post-release AppSheet reconciliation failed on 16 September 2026 and a corrective release is required**. Scope was the DEV-tested V15/V16 business-expense implementation and saved AppSheet refinements from commits e75a5fd and 88df80b. No development financial data, synthetic fixtures or Looker changes were included.

## Rollback and release gate

Chrome current editor confirmed the before-edit production rollback versions: **OLTP 3.000108** and **OLAP 1.100090**, both deployed and using the existing production apps. Production Flyway is V14 with only immutable V15/V16 pending; development validates at V16. A fresh normalized production schema exactly matches the reviewed development V14 pre-release schema.

Private database rollback: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/business-expenses-production-20260916/production-before.dump`, SHA-256 `756FCA2BAF1FD17A8EC2F1F3F6E8CEB95CD05F2CC10C774BC91E2837E44D1D60`. A disposable local restore passed for all 14 business-table fingerprints and normalized public/assessment_lab schema. The dump includes business data, database objects and Flyway history; instance settings, Cloud SQL cron configuration, global roles and credentials are outside its scope. Private-backup off-device coverage is unverified.

Production source bindings, current bot states/destinations and cross-app links must be preserved. The SQL migration creates no historical referral rebates. Production verification must remain read-only except the approved DDL/backfill and AppSheet configuration; do not seed DEV fixtures or force notifications.

## Production result

- Flyway migrated production from **V14 to V16** and `validate` passed all 17 migrations with no invalid migrations.
- Production AppSheet was saved at **OLTP 3.000118** and **OLAP 1.100098**. The rollback versions remain OLTP 3.000108 and OLAP 1.100090, coordinated with the pre-release database dump.
- Final schema review corrected the regenerated Business Expenses key: `Row ID` is the sole Text key and `_RowNumber` is not a key. Reload verification showed the row-number warning cleared.
- OLTP now includes the Business Expenses deck, bilingual category choices, optional manual borrower/loan context, red positive-expense and green negative-offset formatting, Total Net Profit and the Income Statement MTD section after Outstanding Loans.
- OLAP loads Business Expenses read only, keeps the existing partner-card layout while sourcing Total Profit and Available to Settle from net values, validates settlements against net available balance, adds the same Income Statement MTD section and removes the extra expense fields from Cash Pool.
- Daily Analytics was rebuilt for 43 dates. Independent read-only reconciliation reported **0 net-field mismatches**. The production expense ledger contained **0 rows**, as required by the no-backfill rule.
- The latest SQL audit during release reported partner A gross/net profit 65,447 with settlements 30,960, and partner B gross/net profit 127,854 with settlements 84,510. Gross and net are equal only because no production expense existed at that audit point; allocated expenses will reduce both displayed partner values automatically.

## Checks and limitations

The current AppSheet editor and preview were used. Both app dashboards displayed Total Net Profit and the MTD income statement; expense values use the baht symbol. The OLAP Partner cards displayed the net-backed fields without changing the card layout. No production financial test row was created, no loan was closed for testing and no notification was forced. Referral creation, duplicate prevention and contribution-history recalculation therefore rely on the accepted DEV tests plus production schema/function/trigger validation until a real qualifying event occurs. Looker Studio was outside this requested release.

## Post-release correction to this record — 16 September 2026

A later mandatory object-by-object audit found that the production AppSheet state does not support several assertions above. The dashboards contain the net KPI sections, but production still has incorrect Referrer columns, missing borrower form/detail fields and OLAP referral VCs, unreconciled OLAP Business Expenses key/Ref metadata, missing expense format rules, incorrect expense/analytics formatting, a wrong Daily Analytics Business Expenses Ref, gross partner detail fields, the earlier settlement validation and missing Analytics Data net fields.

No live configuration was changed by the audit. Treat the production promotion as applied but incompletely reconciled. The authoritative discrepancy list is [the R001 AppSheet reconciliation report](../outputs/r001-appsheet-reconciliation-20260916/REPORT.md). A new corrective release and explicit production approval are required.

## Rollback

For AppSheet-only presentation problems, restore OLTP 3.000108 and OLAP 1.100090. For database or calculation problems, coordinate those app restores with restoring `production-before.dump` (or apply a reviewed higher Flyway forward fix); do not use Flyway repair, clean or checksum edits. Restoring the database discards legitimate production writes made after the backup and therefore requires a new owner-authorized recovery decision.
