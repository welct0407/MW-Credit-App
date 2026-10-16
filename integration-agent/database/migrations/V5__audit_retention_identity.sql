-- R064 W4 central database migration (DB-PERF-01, owner decisions 17 October 2026: 7-day routine
-- audit retention, run daily by the VM identity); immutable after application.
-- Role mw_agent_retention comes from bootstrap.sql (mw_agent_owner has NOCREATEROLE, so a migration
-- cannot create it). On an instance bootstrapped before this version, create it as postgres with the
-- bootstrap statement first; this migration refuses to run without it.
SET LOCAL ROLE mw_agent_owner;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='mw_agent_retention') THEN
  RAISE EXCEPTION 'V5 requires role mw_agent_retention: create it as postgres first (database/setup/bootstrap.sql)';
 END IF;
END $$;

-- Referencing columns V1 left unindexed. Without them every deleted event or operation seq-scans the
-- referencing table for the foreign-key check (one 2,000-tree batch ran more than 9 minutes in the lab).
CREATE INDEX operation_state_last_event_idx ON runtime.operation_state(last_event_id);
CREATE INDEX job_runs_operation_idx ON runtime.job_runs(operation_id);

-- One batch of whole routine operation trees, deleted as the table owner. The caller (agent-db-maintenance.py)
-- exports and verifies the trees first and passes their root ids; every safety rule is checked again here,
-- independently of the export: the cutoff is at least 7 days old, every root exists and is a root, and the
-- whole tree is older than the cutoff, routine (READ/JOB/PROCESS/HEALTH only: nothing that sent, wrote
-- business data or imported), keyed by a random uuid4 (no deterministic replay key, none of the replay-
-- guarding services), terminal, with no running or unfinished job. Any violation raises and nothing is deleted.
-- The statement-level append-only triggers are disabled and re-enabled inside this one transaction, so no
-- other session ever sees them off. Returns the deleted row counts for the caller to compare with its export.
CREATE FUNCTION audit.purge_routine_trees(p_roots uuid[], p_cutoff timestamptz)
 RETURNS TABLE(deleted_job_runs bigint, deleted_operation_states bigint, deleted_events bigint, deleted_operations bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 v_roots uuid[];
 v_ops uuid[];
 v_bad uuid;
BEGIN
 IF p_cutoff IS NULL OR p_cutoff > clock_timestamp() - interval '7 days' THEN
  RAISE EXCEPTION 'retention cutoff must be at least 7 days old (got %)', p_cutoff;
 END IF;
 SELECT array_agg(DISTINCT r) INTO v_roots FROM unnest(p_roots) AS r;
 deleted_job_runs:=0; deleted_operation_states:=0; deleted_events:=0; deleted_operations:=0;
 IF v_roots IS NULL THEN RETURN NEXT; RETURN; END IF;
 IF cardinality(v_roots) > 2000 THEN RAISE EXCEPTION 'at most 2000 roots per batch (got %)', cardinality(v_roots); END IF;
 SELECT r INTO v_bad FROM unnest(v_roots) AS r
  WHERE NOT EXISTS (SELECT 1 FROM audit.operations o WHERE o.operation_id=r AND o.parent_operation_id IS NULL) LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'not an existing root operation: %', v_bad; END IF;
 WITH RECURSIVE tree(operation_id) AS (
  SELECT r FROM unnest(v_roots) AS r
  UNION ALL SELECT c.operation_id FROM audit.operations c JOIN tree t ON c.parent_operation_id=t.operation_id)
 SELECT array_agg(operation_id) INTO v_ops FROM tree;
 SELECT o.operation_id INTO v_bad FROM audit.operations o LEFT JOIN runtime.operation_state s USING(operation_id)
  WHERE o.operation_id=ANY(v_ops)
    AND (o.created_at >= p_cutoff
      OR o.action NOT IN ('READ','JOB','PROCESS','HEALTH')
      OR o.idempotency_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR o.service_name IN ('ingress','reviewer_dml','statement_snapshot','legacy_import')
      OR s.operation_id IS NULL
      OR s.state NOT IN ('COMPLETED','FAILED','DENIED','CANCELLED','ROLLED_BACK')) LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'operation % is protected or not eligible (effect, replay key, service, state or age)', v_bad; END IF;
 SELECT e.operation_id INTO v_bad FROM audit.events e WHERE e.operation_id=ANY(v_ops) AND e.recorded_at >= p_cutoff LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'operation % has an event newer than the cutoff', v_bad; END IF;
 SELECT j.operation_id INTO v_bad FROM runtime.job_runs j WHERE j.operation_id=ANY(v_ops)
  AND (j.state='RUNNING' OR j.finished_at IS NULL OR j.finished_at >= p_cutoff) LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'operation % has a running or recent job run', v_bad; END IF;
 SET LOCAL lock_timeout='5s';
 -- Agent writers take audit.operations before audit.events; lock in that order before the trigger DDL
 -- (SHARE ROW EXCLUSIVE, which ALTER TABLE ... TRIGGER needs) so a batch cannot deadlock with them.
 LOCK TABLE audit.operations, audit.events IN SHARE ROW EXCLUSIVE MODE;
 ALTER TABLE audit.operations DISABLE TRIGGER operations_append_only;
 ALTER TABLE audit.events DISABLE TRIGGER events_append_only;
 DELETE FROM runtime.job_runs WHERE operation_id=ANY(v_ops);
 GET DIAGNOSTICS deleted_job_runs=ROW_COUNT;
 DELETE FROM runtime.operation_state WHERE operation_id=ANY(v_ops);
 GET DIAGNOSTICS deleted_operation_states=ROW_COUNT;
 DELETE FROM audit.events WHERE operation_id=ANY(v_ops);
 GET DIAGNOSTICS deleted_events=ROW_COUNT;
 DELETE FROM audit.operations WHERE operation_id=ANY(v_ops);
 GET DIAGNOSTICS deleted_operations=ROW_COUNT;
 ALTER TABLE audit.events ENABLE TRIGGER events_append_only;
 ALTER TABLE audit.operations ENABLE TRIGGER operations_append_only;
 RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION audit.purge_routine_trees(uuid[],timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.purge_routine_trees(uuid[],timestamptz) TO mw_agent_retention;

-- The retention identity: read the four tables to plan and export, insert its own CONFIG record,
-- VACUUM (ANALYZE) afterwards (MAINTAIN, PostgreSQL 17+), temp tables for the plan. No UPDATE, no DELETE,
-- no owner membership: deletes happen only through the function above.
GRANT CONNECT,TEMPORARY ON DATABASE mw_agent TO mw_agent_retention;
GRANT USAGE ON SCHEMA audit,runtime TO mw_agent_retention;
GRANT SELECT ON audit.operations,audit.events,runtime.operation_state,runtime.job_runs,runtime.service_control TO mw_agent_retention;
GRANT INSERT ON audit.operations,audit.events,runtime.operation_state TO mw_agent_retention;
GRANT MAINTAIN ON audit.operations,audit.events,runtime.operation_state,runtime.job_runs TO mw_agent_retention;
