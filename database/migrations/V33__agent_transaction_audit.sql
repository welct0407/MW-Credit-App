-- R015 internal transaction audit. No AppSheet data source or business row changes.
-- Provision mw_business_audit_owner and migration membership separately before applying.
CREATE SCHEMA agent_audit AUTHORIZATION mw_business_audit_owner;
SET LOCAL ROLE mw_business_audit_owner;
REVOKE ALL ON SCHEMA agent_audit FROM PUBLIC;

-- Inserted FIRST in the business transaction. Only externally visible after
-- commit, so existence from a separate connection is proof of that commit.
-- This is not an exact commit timestamp and does not prove AppSheet bot effects.
CREATE TABLE agent_audit.commits (
 operation_id uuid PRIMARY KEY,
 database_txid xid8 NOT NULL DEFAULT pg_current_xact_id() UNIQUE,
 database_name name NOT NULL DEFAULT current_database(),
 reviewer_id text NOT NULL CHECK(btrim(reviewer_id)<>''),
 reviewer_login text NOT NULL CHECK(btrim(reviewer_login)<>''),
 plan_sha256 text NOT NULL CHECK(plan_sha256 ~ '^[0-9a-f]{64}$'),
 request_reason text NOT NULL CHECK(btrim(request_reason)<>''),
 direct_targets jsonb NOT NULL CHECK(jsonb_typeof(direct_targets)='array'),
 code_version text NOT NULL,
 recorded_in_transaction_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 database_session_role name NOT NULL DEFAULT session_user,
 UNIQUE(operation_id,database_txid)
);
CREATE TABLE agent_audit.row_changes (
 change_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 operation_id uuid NOT NULL,
 database_txid xid8 NOT NULL DEFAULT pg_current_xact_id(),
 schema_name name NOT NULL,
 table_name name NOT NULL,
 action text NOT NULL CHECK(action IN ('INSERT','UPDATE','DELETE')),
 row_key jsonb NOT NULL CHECK(jsonb_typeof(row_key)='object'),
 before_row jsonb,
 after_row jsonb,
 observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(operation_id,database_txid) REFERENCES agent_audit.commits(operation_id,database_txid),
 CHECK((action='INSERT' AND before_row IS NULL AND after_row IS NOT NULL)
    OR (action='UPDATE' AND before_row IS NOT NULL AND after_row IS NOT NULL)
    OR (action='DELETE' AND before_row IS NOT NULL AND after_row IS NULL))
);
CREATE INDEX row_changes_operation_idx ON agent_audit.row_changes(operation_id,change_id);
CREATE TABLE agent_audit.exports (
 operation_id uuid PRIMARY KEY REFERENCES agent_audit.commits(operation_id),
 central_completion_event_id uuid NOT NULL UNIQUE,
 exported_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION agent_audit.reject_rewrite() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Append-only transaction audit'; END $$;
CREATE TRIGGER commits_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON agent_audit.commits
 FOR EACH STATEMENT EXECUTE FUNCTION agent_audit.reject_rewrite();
CREATE TRIGGER row_changes_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON agent_audit.row_changes
 FOR EACH STATEMENT EXECUTE FUNCTION agent_audit.reject_rewrite();
CREATE TRIGGER exports_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON agent_audit.exports
 FOR EACH STATEMENT EXECUTE FUNCTION agent_audit.reject_rewrite();

-- Fixed HOST primitive only. Model tools never receive function/setting inputs.
-- Authentication is still checked against the current Partner master by the host
-- before dispatch and immediately before commit; these arguments are snapshots.
CREATE FUNCTION agent_audit.begin_operation(
 p_operation_id uuid,p_reviewer_id text,p_reviewer_login text,p_plan_sha256 text,
 p_request_reason text,p_direct_targets jsonb,p_code_version text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'mw_reviewer_dml' THEN RAISE EXCEPTION 'Dedicated reviewer connection required'; END IF;
 IF nullif(current_setting('mw_agent.operation_id',true),'') IS NOT NULL THEN
  RAISE EXCEPTION 'Only one operation per transaction';
 END IF;
 INSERT INTO agent_audit.commits(operation_id,reviewer_id,reviewer_login,plan_sha256,request_reason,direct_targets,code_version)
 VALUES(p_operation_id,p_reviewer_id,p_reviewer_login,p_plan_sha256,p_request_reason,p_direct_targets,p_code_version);
 PERFORM set_config('mw_agent.operation_id',p_operation_id::text,true);
END $$;

CREATE FUNCTION agent_audit.capture_change() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE operation uuid; old_value jsonb; new_value jsonb; key_value jsonb;
BEGIN
 -- AppSheet/shared database identities are not relabelled as agent DML.
 -- API calls have central host audits, with the attribution limits in SCHEMA.md.
 IF session_user<>'mw_reviewer_dml' THEN RETURN NULL; END IF;
 operation:=nullif(current_setting('mw_agent.operation_id',true),'')::uuid;
 IF operation IS NULL OR NOT EXISTS (
    SELECT 1 FROM agent_audit.commits c
    WHERE c.operation_id=operation AND c.database_txid=pg_current_xact_id()
      AND c.database_session_role=session_user) THEN
  RAISE EXCEPTION 'Reviewer DML requires its transaction audit marker';
 END IF;
 IF TG_OP<>'INSERT' THEN old_value:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN new_value:=to_jsonb(NEW); END IF;
 key_value:=coalesce(new_value,old_value)->'Row ID';
 IF key_value IS NULL OR key_value='null'::jsonb THEN RAISE EXCEPTION 'Audited table key unavailable'; END IF;
 INSERT INTO agent_audit.row_changes(operation_id,schema_name,table_name,action,row_key,before_row,after_row)
 VALUES(operation,TG_TABLE_SCHEMA,TG_TABLE_NAME,TG_OP,jsonb_build_object('Row ID',key_value),old_value,new_value);
 RETURN NULL;
END $$;
RESET ROLE;

-- Install as the existing business-table owner/migration principal. This adds
-- audit capture without replacing/disabling any existing business trigger.
-- Ten current resources include the trigger-owned Payment Allocations table.
-- Fail installation if a named table is missing. Recompute dependency coverage
-- before execution; reject DELETE when a cascade/trigger target is unaudited.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['Borrowers','Loans','Charges','Repayments','Payments',
   'Business Expenses','Settlements','Cash Ledger','Cash Pool Contributions','Payment Allocations'] LOOP
  EXECUTE format('CREATE TRIGGER mw_agent_capture AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION agent_audit.capture_change()',t);
 END LOOP;
END $$;
SET LOCAL ROLE mw_business_audit_owner;
-- Function creation and PUBLIC revocation are in this SAME transaction, so no
-- publicly executable function becomes visible at commit. Creation-time default
-- EXECUTE permits the business-table owner to attach triggers before revocation.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA agent_audit FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE mw_business_audit_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
RESET ROLE;
