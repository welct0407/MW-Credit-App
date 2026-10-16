-- Owner-authorized R015 operator-managed grants, separate from Flyway history.
-- Run only after business V33 has passed DEV tests and after scoped production execution
-- is authorized. Permissions are not substitutes for current reviewer approval.
BEGIN;
DO $$ BEGIN
 IF current_setting('mw_design.execution_approved',true) IS DISTINCT FROM 'agent-postgresql-20260922-v1'
    OR current_database() NOT IN ('loan_manager_dev','loan_manager_prod') THEN
  RAISE EXCEPTION 'Wrong business target or unapproved design execution';
 END IF;
END $$;
GRANT USAGE ON SCHEMA agent_audit TO mw_reviewer_dml,mw_agent_relay,mw_agent_auditor;
GRANT EXECUTE ON FUNCTION agent_audit.begin_operation(uuid,text,text,text,text,jsonb,text) TO mw_reviewer_dml;
GRANT SELECT ON agent_audit.commits,agent_audit.row_changes TO mw_reviewer_dml,mw_agent_relay,mw_agent_auditor;
GRANT SELECT ON agent_audit.exports TO mw_agent_relay,mw_agent_auditor;
GRANT INSERT ON agent_audit.exports TO mw_agent_relay;
-- No direct INSERT into commits/row_changes: fixed function and row triggers own them.
-- No DELETE/UPDATE/TRUNCATE on audit tables, or ownership/trigger privileges.
-- Reviewer DELETE is retired (owner decision, 16 October 2026; PROD revoke executed by ops):
-- no DELETE on the eight source tables. The only DELETE, on "Cash Ledger", is granted by
-- configure-reviewer-dml.py for the cash_source_changed trigger.
-- Do not grant DELETE on Partners, Cash Accounts, Cash Holders, allocations,
-- migration history, derived reports, runtime state, or audit history.
-- Retain the previously reviewed INSERT/UPDATE and trigger-dependency grants.
-- Public defaults may allow CONNECT to other databases: verify CONNECT for the
-- relay/auditor against the intended business DB separately, without changing
-- PUBLIC privileges on the shared instance. Use explicit scoped grants if needed.
COMMIT;
