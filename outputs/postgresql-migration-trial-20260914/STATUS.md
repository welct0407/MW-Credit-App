# PostgreSQL migration trial

14 September 2026. In progress; no migrated apps yet.

- Source baselines verified: OLTP 3.000064, OLAP 1.100041. Production untouched.
- Empty loan_manager_prod database on the POC instance deleted as requested. Name to be reused on new instance.
- New instance draft appsheet-pg-prod-20260914: Enterprise PostgreSQL 18, db-f1-micro, single zone, Singapore, 10 GB HDD (lowest storage rate offered). SSL-only, backups/PITR/deletion protection retained; Query Insights disabled. Password not entered; not submitted.
- Owner approved policy override. Project-only sql.restrictPublicIp Not enforced saved and verified; refreshed creation form shows Public IP ON and Private IP OFF. No proxy provisioned. Parent policy unchanged.
- Pending: owner password entry/submission, full paired app/shared-database copies, migration, correctness and feature testing, detailed cutover change register. HDD reduces storage cost but is slower than SSD; performance findings must identify this sizing.

Exact-case keys/Refs must remain text/varchar. Copying native AppSheet databases may regenerate their Row IDs; retain the copy as a matched app/database pair and verify mapping before SQL transfer. Both SQL apps must consume the same migrated shared tables. Native user settings/process state tables require separate treatment from business data. No current migration correctness or performance result is claimed.

Authoritative history: Change Logs/CHANGE_NOTES_POSTGRESQL_MIGRATION_TRIAL_2026-09-14.md.
