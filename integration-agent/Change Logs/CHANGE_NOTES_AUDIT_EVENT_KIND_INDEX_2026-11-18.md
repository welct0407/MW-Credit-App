# Change notes — audit event kind index (agent V14), 18 November 2026

## Purpose
The receipt health collector's acknowledged-notice lookup scanned the whole `audit.events` table every two minutes. It was the largest I/O consumer on the shared Cloud SQL instance and added to the CPU spikes behind the PWA statement timeouts. The owner asked for the index on 18 November 2026 ("Index the agent's audit event lookup").

## Changes
- Evidence, PROD `mw_agent`, read-only as the worker role on 18 November 2026: `audit.events` has 114,759 rows (129 MB table, 74 MB indexes), 22 event kinds and 2 rows of `optional_notification_acknowledged`. `EXPLAIN (ANALYZE, BUFFERS)` showed a sequential scan with 114,757 rows removed, 16,541 buffers (6,939 read from disk) and 63.8 ms. `pg_stat_statements` counted 18,161 calls, 98.8 million blocks read, and up to 6 s per call.
- Only one live query filters on `event_kind`: `receipt_health.acknowledged`. The V9 and V10 views that also did were dropped by V11.
- `integration-agent/database/migrations/V14__audit_event_kind_index.sql`: `CREATE INDEX events_kind_idx ON audit.events(event_kind)` as `mw_agent_owner`. No table, column, grant, trigger or data change.
- `integration-agent/tests/test_state_migration_postgres.py`:
  - new `test_v14_audit_event_kind_index` checks the index definition, its owner, that the lookup plan uses it, and that grants and the append-only trigger are unchanged;
  - the incremental V6, V8, V11 and V13 tests now expect V14 after V13;
  - the V13 test copies only versions up to V12 before applying;
- `integration-agent/tests/test_audit_retention_postgres.py`: the lab setup and the V5 index-adoption test now expect V14 last. The first PR run's `lab` job failed on these two V13 pins; I fixed them and reran the suite locally.
- `integration-agent/docs/POSTGRESQL_OPERATIONS.md`: new "Audit event kind index (agent V14)" section with the evidence, lock note, apply order and undo.
- Done directly by the orchestrator, the default for `integration-agent/` work. No UI or infrastructure change.

## Checks
| Command | Result |
| --- | --- |
| `python3 -m unittest tests.test_state_migration_postgres` on a disposable PostgreSQL 18 cluster (`MW_AGENT_FRESH_PG_DSN`, loopback port 15611) | 16 OK, 2 skipped (`CentralMigrationTests` needs the lab manifest) |
| Same suite with V14 removed | 4 failures and 1 error, as expected |
| Lab benchmark: 114,759 synthetic events (112 MB), 2 matching | Before V14: sequential scan, 14,345 buffers, 16.6 ms. After V14: `Index Scan using events_kind_idx`, 4 buffers, 0.007 ms |
| `ruff check --no-cache integration-agent` | Clean |
| `python3 -m unittest discover -s tests` (from `integration-agent/`) | 1,055 run, 80 skipped. One error: `test_receipt_qr` cannot import `zxingcpp`, which is not installed in this sandbox (CI installs it). Unrelated to this change. |
| CI `lab` suite run locally as `postgres` (`tests/lab/setup.sh` cluster plus a fresh PostgreSQL 18 on 15611, the eight lab modules) | 90 OK, after the retention-test fix |
| Pull request agent tests (`test`, `lab`) | First run: `lab` failed on the two retention-test pins (fixed); rerun pending |

## Not run
Nothing further. All eight lab modules ran locally (see Checks).

## Recovery
`DROP INDEX audit.events_kind_idx` as `mw_agent_owner`. The `deployment.schema_history` row for V14 stays. Before applying, take a verified `mw_agent` backup (`scripts/backup-agent-database.py`), as for every agent migration.

## Open questions
None.

## Remaining work
Apply V14 on PROD `mw_agent` in a deployment window: backup, `deploy-runtime.py freeze`, `agent-state-admin.py migrate`, `install`, `activate`. Then record it in the environment inventory's `mw_agent` row and confirm with `pg_stat_statements` that the lookup no longer scans.
