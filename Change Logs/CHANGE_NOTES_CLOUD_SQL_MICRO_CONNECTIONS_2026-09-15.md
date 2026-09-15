# Production micro tier with 100 connections — 2026-09-15

## Scope and authorization

Owner requested returning production `appsheet-pg-prod-20260914` to the smallest tier with `max_connections=100`. Codex prepared the form and left Save to the owner, preserving their earlier submission preference. Owner confirmed clicking Save.

## Rollback and change

- Rollback configuration: `db-g1-small`, 1.7 GB RAM, automatic max_connections (last live value 50), cloudsql.iam_authentication=on.
- Requested configuration: `db-f1-micro`, 0.614 GB RAM, explicit max_connections=100; IAM flag retained.
- Console shows public IP and address unchanged, 10 GB HDD with automatic increase, PostgreSQL 18.6 Enterprise, Singapore single zone, automated backups/PITR/deletion protection enabled. SSL-only was preserved in the prepared form.
- No AppSheet definitions, financial data, schema, credentials or network access were changed by this task. Consumers include OLTP/OLAP and any test apps still connected to this instance. Another session is working independently; its changes are outside this task.
- Rollback: coordinate a restart, restore db-g1-small and remove the explicit max_connections override. No rollback has been executed.

## Documentation and verification

Google documents max_connections as configurable, with memory-based defaults of 25 for tiny and 50 for small instances, and a restart requirement: https://docs.cloud.google.com/sql/docs/postgres/flags#postgres-m . Raising the limit does not establish that 100 simultaneously active queries fit in micro-tier memory.

Owner-submitted update completed September 15, 11:41:11–11:53:38 Bangkok (12 minutes 27 seconds operation duration, not a measured outage duration). Console shows machine 628.74 MB and max_connections=100.

Post-completion Cloud SQL Studio authentication and read-only query succeeded. Live PostgreSQL results: max_connections=100, superuser_reserved_connections=3, reserved_connections=0, ordinary_connection_slots=97, current_client_connections=11 at the verification instant. Server start: 2026-09-15T04:51:53.436952Z. The requested change is applied and its runtime connection limit verified. App workload performance and memory headroom have not been load-tested.

Read-only verification query: `outputs/cloud-sql-upsize-20260915/VERIFY_CONNECTION_LIMITS.sql`.
AppSheet sync and sustained workload behavior remain to be checked; no load test or production transaction is authorized by this verification step. Data-model documents do not require changes for capacity-only configuration.
