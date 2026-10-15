# Cloud SQL PostgreSQL proof of concept

Status, 14 September 2026: infrastructure and new-GUI AppSheet three-table proof complete, including UUID-case/Ref checks. Owner acceptance pending. Loan migration and performance comparison remain pending; no loan performance gain established. Production unchanged. Results: POC_TEST_REPORT.md.

## Authorized sequence

1. Provision isolated Cloud SQL PostgreSQL — completed.
2. New AppSheet app updates one source row, triggering an update and an insert in two other tables. Verify all three after the originating sync — passed with full sync; rollback/recovery and key casing passed.
3. Make another isolated loan-app/database copy, migrate and reconcile configuration/workflows after connector correctness passes.
4. Compare storage-only performance, then separately evaluate SQL receipt processing.
5. Plan production migration and rollback for owner review. No cutover authorized.

## Verified environment

Project clever-oasis-508610-n7 (My First Project), instance appsheet-pg-test-20260914, database appsheet_sync_poc. Creation completed 18:05:32 Bangkok; database created 18:06:28 on 14 September 2026. PostgreSQL 18.6 Enterprise, asia-southeast1-c Singapore, db-f1-micro, one shared vCPU, 628.74 MB RAM, 10 GB SSD/autogrow, single zone. Backups, PITR and deletion protection enabled. Query Insights disabled at this size. This is connectivity POC sizing, not validated loan-workload sizing.

Endpoint 34.158.52.84:5432. Connection name clever-oasis-508610-n7:asia-southeast1:appsheet-pg-test-20260914. SSL-only enabled, trusted client certificates not mandatory. Data API/private IP off. IAM authentication flag and Knowledge Catalog integration observed as defaults; no IAM database user created. Compute Engine and Cloud SQL Admin APIs enabled during setup. AppSheet app API remains off; testing is UI-only in the new GUI.

Owner explicitly approved restricted login creation, external credential storage, AppSheet server allowlisting and AppSheet authorization. All 73 published all-region AppSheet IPs were added individually as /32 entries. Update completed 18:16:51 Bangkok; reload confirmed all persisted with no unsaved entries. No unrestricted CIDR. Source: https://support.google.com/appsheet/answer/10104492?hl=en (checked 14 September 2026). Singapore DB placement does not establish AppSheet APAC residency.

Console estimate $0.02/hour rounded compute/storage (~$14.60/730h), backup/traffic extra. Display currency unconfirmed. Trial showed $381.35/90 days; paid account not activated.

## Schema and access

Standalone synthetic objects only, no production consumers. Exact DDL: scripts/cloud-sql-poc-schema.sql.

- poc_source: immutable varchar(64) primary key; integer input_value and nonnegative revision. Seed SYNC-001 starts at zero.
- poc_projection: source key FK/PK; integer applied_revision; bigint derived_value.
- poc_events: varchar(100) PK; source_id FK; integer revision/input_value; bigint derived_value; unique(source_id, revision).

AFTER UPDATE trigger doubles source input into projection and inserts an event atomically. Changed input must advance revision by exactly one; identical repeat is a no-op. Negative input raises an exception after downstream writes to test rollback. SECURITY DEFINER function, owner postgres, fixed pg_catalog search_path, fully qualified tables, PUBLIC execute revoked.

appsheet_poc has CONNECT, public schema USAGE, SELECT on the three tables, UPDATE only on source input_value/revision. No superuser, createdb, createrole, bypassrls, replication or inherited roles. LOGIN enabled; owner set password and saved it externally; AppSheet authentication succeeded. Access script: scripts/cloud-sql-poc-access.sql. Scoped permission tests used temporary membership rolled back with the test transaction.

AppSheet account Enterprise Plus. PostgreSQL/Require SSL datasource database-1 (30882513) authorized after restarting an expired-cookie authorization flow. New app SQL Sync POC TEST 20260914 (374d4905-1439-41ff-8257-e952beb8f3ee), initial rollback 1.000003, final 1.000008. Both canonical model documents updated with separate POC inventory. Existing OLTP/OLAP/Looker unchanged.

## Executed connector acceptance

Created new-GUI POC app, source updates only and downstream read-only. Input10/rev1, unchanged save, input7/rev2, negative input/rev3 rejection, recovery11/rev3, uppercase13/rev1 and mixed-case17/rev1 executed. Successful downstream values appeared after originating sync without another sync. SQL rollback passed, while the rejected change remained pending in the client until discarded. Restricted column-update compatibility passed. Ref and reverse-related navigation passed after loading version 1.000008. Review POC_TEST_REPORT.md for evidence and limitations.

Engine timings in ENGINE_TEST_RESULTS.md are not AppSheet latency measurements.

## Migration and benchmark controls

Before loan migration capture current OLTP/OLAP versions and shared consumers. Preserve keys, references, types, defaults, permissions, slices and formulas. Isolate notifications/scheduled bots. Partner management stays OLAP-owned. Review direct export/report impacts without an unrelated report audit.

Compare separate control/SQL copies with identical synthetic fixtures and unchanged business logic. Measure save-to-visible-posted and normal sync in repeated interleaved runs, reporting median/range/slow cases. SQL receipt processing is a separate candidate: all six allocation methods, ordering, exact/partial balances, invalid input, duplicate/retry, concurrency and rollback.

Production plan includes acceptance, reconciliation, write pause, final copy, switching both apps, verification and rollback accounting for new SQL writes. A connection switch back is insufficient after new production writes. Cutover needs owner approval.

## Credentials and rollback

Admin file: C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\cloud-sql-poc-postgres-password.txt (owner saved, authentication verified). Restricted file: C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\cloud-sql-poc-appsheet-password.txt (owner saved, AppSheet connection verified). No secrets under Git. Credential backup coverage unknown.

Existing production apps/databases unchanged; no production version restore applies. POC app rollback versions are 1.000003 and 1.000007 (pre-Ref). Disconnect via ALTER ROLE appsheet_poc NOLOGIN; check current consumers before removing database-1 or the 73 AppSheet network entries. Check backup/deletion protection before destroying this isolated instance/database; no deletion performed. App restoration does not restore SQL data. Do not blindly replay schema or role creation scripts against existing objects.

UUID case requirement: preserve all source keys and referencing values exactly as text/varchar; do not cast existing identifiers to PostgreSQL uuid or normalize their case. Before migration compare exact key/Ref strings, test for case-fold collisions, duplicate keys and orphan references. Uppercase and mixed-case UUID-shaped synthetic fixture writes, SQL propagation, parent Ref and reverse relationships passed. Full loan migration verification remains pending.
