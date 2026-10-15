# Production Cloud SQL resize — 2026-09-15

## Scope and authorization

Owner requested one-tier production instance upsize, then reserved final submission for themselves because another Codex session was using production. Codex prepared the form without saving; owner clicked Save. No development-instance changes were made.

Instance: `appsheet-pg-prod-20260914`, project `clever-oasis-508610-n7`.
Consumers: production OLTP and OLAP, plus their PostgreSQL test copies (last known bindings). This task did not change any AppSheet definition, binding, financial data, schema, or SQL flags.

## Change and rollback

- Recorded previous machine: `db-f1-micro`, shared core, 1 vCPU, 0.614 GB RAM.
- Prepared/applied machine: `db-g1-small`, shared core, 1 vCPU, 1.7 GB RAM.
- Preserved observed settings: PostgreSQL 18.6 Enterprise, Singapore single zone, 10 GB HDD with automatic increase, public IP, SSL-only mode, automated backups, PITR, deletion prevention and IAM authentication flag.
- Previous configuration is the rollback point: edit machine back to `db-f1-micro` after owner approval and coordination with active users. This requires another service interruption and reduces connection capacity.
- Before editing, overview showed automated backups/PITR enabled and a successful backup on September 14 at 21:13:35 Bangkok. No new backup or restore was performed by this task.

## Verified result

Cloud Console reports Update finished: September 15, 11:08:36–11:15:16 Bangkok (6 minutes 40 seconds operation duration; not a measured outage duration).
Post-update Cloud SQL Studio login to `loan_manager_prod` succeeded. The read-only query in `outputs/cloud-sql-upsize-20260915/VERIFY_CONNECTION_LIMITS.sql` returned:

| Setting | Before (previous verified check) | After (live SQL) |
|---|---:|---:|
| max_connections | 25 | 50 |
| superuser_reserved_connections | 3 | 3 |
| reserved_connections | 0 | 0 |
| Ordinary connection slots | 22 | 47 |

Client backend connections at the verification instant: 11. Server start timestamp: `2026-09-15T04:13:08.040338Z`. Login `postgres` rolconnlimit = -1; database `loan_manager_prod` datconnlimit = -1 (no additional per-role/per-database cap). These are instance-wide shared slots, not a per-app allowance. Background/internal client connections also consume capacity.

The total cap doubled; ordinary slots increased by 25 (approximately 114%). This does not establish a latency improvement or guarantee connection exhaustion cannot recur.

## Status and remaining checks

Resize complete and live connection limits verified. No connection-flag override was added. No AppSheet functional/load test was run in this task because another session was active on production; owner should sync OLTP and OLAP and confirm normal operations without ResourceExhausted/53300 errors. Sustained workload headroom is not yet measured. Pricing was not quoted or verified in this task. No data-model documentation update is required for this capacity-only change.
