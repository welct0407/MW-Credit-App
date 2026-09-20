# DEV database consolidation and connection-limit change — 2026-09-20

## Scope and purpose

The owner requested moving the active DEV PostgreSQL database from the separate DEV Cloud SQL instance into the production instance under a DEV-specific database name, refreshing DEV data from PROD during the move, and raising the production instance `max_connections` setting from 100 to 200 without changing infrastructure size. This is infrastructure and DEV-refresh maintenance, not a product release; no R-number or production AppSheet promotion applies.

## Rollback and recovery

- Starting Git commit: `35b2c74ba053d3782dbf9e2bce67d9c733425320`.
- On-demand Cloud SQL backup `3cf0661c-b7e6-423a-879d-aeef0231772e` completed at 19:32 Bangkok before the instance flag change. Automated backups, PITR and deletion protection remained enabled.
- Private custom-format dumps and TOC files are outside Git under `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/dev-db-consolidation-20260920-193337`.
- PROD-source dump SHA-256: `e8cae9a0ac9055aad6d3e37550de00f2567a75ad54c7df715a18d59e3594f40d`.
- Former-DEV rollback dump SHA-256: `09fc024b16b67b5efe42723b2e41e10cc4cd4eef3145b035e30ab86f3ec22c3d`.
- The verified former-DEV logical dump remains the recovery point after the owner subsequently authorized retirement of the former instance. Its hash and private location were rechecked immediately before deletion.
- App/database recovery now restores the preserved logical dump into a separately reviewed target or recreates `loan_manager_dev`; the deleted endpoint cannot be used as a direct rollback. Restoring the shared production instance backup would affect PROD and is reserved for an actual instance-level recovery decision.

## Live changes

- Created `loan_manager_dev` on `appsheet-pg-prod-20260914` / `34.21.174.215` with a database comment identifying it as DEV.
- Restored the full PROD application snapshot, including data, sequences and `public.flyway_schema_history`, using `--no-owner --no-acl --exit-on-error` and a reviewed TOC.
- Excluded six `pg_cron` TOC entries: extension/comment metadata, two cron table-data entries and two cron sequence states. The instance flag `cron.database_name=loan_manager_prod` remains unchanged; DEV scheduling is AppSheet-owned.
- Applied the guarded DEV Partner delivery override before AppSheet cutover. Both Partner rows retain distinct Login Email identities and deliver only to `welct0407@mw-credit.com`.
- Rebound AppSheet account source `database-3` to `34.21.174.215` / `loan_manager_dev` with Require SSL. PROD source `database-2` was not changed.
- Set the shared instance `max_connections` flag to 200. Cloud SQL restarted; the tier remains `db-f1-micro` with 1 vCPU and 628.74 MB displayed memory. All other flags, including IAM authentication and PROD pg_cron settings, were preserved.
- After the owner confirmed permanent deletion, disabled deletion protection and post-deletion backup retention on former instance `appsheet-pg-dev-20260915`, left final backup unchecked, and deleted the instance. This removed its database, Cloud SQL backups, storage and managed public IP `34.158.38.171`.

## Repository changes

- Updated `database/environments.json` and shared-target validation in `scripts/database/Common.ps1`.
- Centralized exact DEV/PROD instance/host/database guards and updated maintained read-only verification scripts for the shared-instance topology. Older release-specific fixture scripts remain fail-closed on the former host and must be deliberately reviewed before reuse; they were not mass-retargeted to a database sharing the PROD instance.
- Updated maintained documentation generators so a future run does not restore the former topology or connection-limit values.
- Updated `AGENTS.md`, the environment inventory, DEV differences, preparation guidance, refresh runbook and database procedure for the shared-instance/separate-database topology.
- Added sanitized verification evidence under `outputs/dev-db-consolidation-20260920/`.
- The data dictionary was not changed: application table names, columns, types, keys, Refs, expressions and the AppSheet source label `database-3` are unchanged. The environment inventory owns the endpoint change.

## Verification

- Both databases connect over required SSL after restart and report PostgreSQL 18.6 and `max_connections=200`.
- DEV has 22 public tables, 13 views, 162 constraints, 48 indexes, 71 functions, 177 trigger entries and 27 successful Flyway rows through V27, matching PROD application catalog counts.
- All 21 application-table row counts match the PROD snapshot. Twenty fingerprints match; `Partners` is the only difference, as intended for owner-only delivery. There are no unexpected fingerprint differences.
- `database-3` saved readback shows host `34.21.174.215`, database `loan_manager_dev` and Require SSL.
- DEV OLTP and OLAP both loaded and completed sync against the refreshed data. Their current editors are Deployed and displayed no warning/error text.
- The first natural post-cutover DEV OLAP `Refresh Daily Analytics Daily` run completed at **20:00:12 Bangkok**. Its DEV request token differs from the independently observed PROD token, and the two generated timestamps landed in `loan_manager_dev` and `loan_manager_prod` respectively.
- Flyway info/validate passed at V27; the guarded R009 recipient and R010 statement checks passed. Materialized reconciliation found zero mismatches across 956 charge rows and 74 loan rows.
- The legacy analytics formula verifier reports 43/47 matching dates after the natural run. PROD reports the same four mismatches, so this is a pre-existing analytics finding rather than migration drift; no financial data was altered to conceal it.
- Production application definitions and financial rows were not changed. The only PROD runtime impact was the authorized instance restart for the flag change.
- Cloud SQL reported **Deleted appsheet-pg-dev-20260915** at **21:40:43 Bangkok**. The instance list contains only `appsheet-pg-prod-20260914`; the Backups page contains only production backups. Both `loan_manager_dev` and `loan_manager_prod` remained reachable at Flyway V27 after deletion.

## Status and limitations

Completed and verified: database creation, PROD-to-DEV refresh, recipient isolation, AppSheet cutover, runtime load/sync, editor diagnostics, backup, connection-limit change, the first natural hourly DEV automation run and retirement of the former DEV instance and its related Cloud SQL resources.

The 200-connection setting is a ceiling, not evidence that the unchanged micro tier can sustain 200 active queries. No load test or memory-headroom benchmark was performed. Physical-device notification receipt and second-user testing were not repeated. The four existing legacy analytics formula mismatches remain an explicit data-quality limitation outside this infrastructure migration.
