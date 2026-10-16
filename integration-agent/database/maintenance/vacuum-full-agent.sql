-- DB-PERF-01 maintenance-window step (R064 W4). Operator session on mw_agent through the admin route, as a
-- principal that may SET ROLE mw_agent_owner. Not a Flyway/agent migration; never part of the runtime.
-- Run only after `scripts/agent-db-maintenance.py ... --apply` (audit-retention and null-archived-images)
-- has completed and its report is saved, and after a verified backup of mw_agent.
--
-- Locks: VACUUM FULL takes ACCESS EXCLUSIVE on each table while it rewrites it (reads and writes wait).
-- Stop every agent writer first (all mw-* timers, mw-instagram-webhook, mw-audit-relay) and start them after.
-- Disk: each rewrite needs free space for the new copy of that table plus its indexes
-- (largest today: audit.events ~0.85 GB); the instance has ~7.5 GB free. Freed space returns to the
-- filesystem but the Cloud SQL disk never shrinks; it is reused by all three databases.
-- WAL: roughly the rewritten size is written to WAL/PITR logs once.
--
--   psql -X -v ON_ERROR_STOP=1 -f integration-agent/database/maintenance/vacuum-full-agent.sql
-- Each VACUUM commits by itself (do not wrap in a transaction). Re-running is harmless.
\set ON_ERROR_STOP on
SELECT current_database() = 'mw_agent' AS on_agent_database \gset
\if :on_agent_database
\else
  \echo 'Refusing: not connected to mw_agent'
  \quit
\endif
SET ROLE mw_agent_owner;
SET lock_timeout = '10s';
SET statement_timeout = 0;
SELECT pg_database_size('mw_agent') AS before_bytes \gset
\timing on
VACUUM (FULL, ANALYZE) runtime.receipt_jobs;
VACUUM (FULL, ANALYZE) runtime.job_runs;
VACUUM (FULL, ANALYZE) runtime.operation_state;
VACUUM (FULL, ANALYZE) audit.operations;
VACUUM (FULL, ANALYZE) audit.events;
\timing off
SELECT :before_bytes AS before_bytes, pg_database_size('mw_agent') AS after_bytes,
       pg_size_pretty(:before_bytes - pg_database_size('mw_agent')) AS freed;
