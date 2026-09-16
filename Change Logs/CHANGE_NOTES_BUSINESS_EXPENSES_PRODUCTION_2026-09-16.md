# Business expenses production promotion — 16 September 2026

Status: production promotion in progress with explicit owner authorization: “ok promote to production”. Scope is the exact DEV-tested V15/V16 business-expense implementation and saved AppSheet refinements from commits e75a5fd and 88df80b. No development financial data, synthetic fixtures or Looker changes are included.

## Rollback and release gate

Chrome current editor confirmed the before-edit production rollback versions: **OLTP 3.000108** and **OLAP 1.100090**, both deployed and using the existing production apps. Production Flyway is V14 with only immutable V15/V16 pending; development validates at V16. A fresh normalized production schema exactly matches the reviewed development V14 pre-release schema.

Private database rollback: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/business-expenses-production-20260916/production-before.dump`, SHA-256 `756FCA2BAF1FD17A8EC2F1F3F6E8CEB95CD05F2CC10C774BC91E2837E44D1D60`. A disposable local restore passed for all 14 business-table fingerprints and normalized public/assessment_lab schema. The dump includes business data, database objects and Flyway history; instance settings, Cloud SQL cron configuration, global roles and credentials are outside its scope. Private-backup off-device coverage is unverified.

Production source bindings, current bot states/destinations and cross-app links must be preserved. The SQL migration creates no historical referral rebates. Production verification must remain read-only except the approved DDL/backfill and AppSheet configuration; do not seed DEV fixtures or force notifications.

Final migration/app versions, reconciliation, documentation, commit and push are pending.
