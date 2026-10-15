-- DESIGN ONLY: execute later through a dedicated mw_agent migration history.
BEGIN;
DO $$ BEGIN
 IF current_setting('mw_design.execution_approved',true) IS DISTINCT FROM 'agent-postgresql-20260922-v1'
    OR current_database()<>'mw_agent' THEN RAISE EXCEPTION 'Wrong target or unapproved design execution'; END IF;
END $$;
SET LOCAL ROLE mw_agent_owner;
CREATE SCHEMA audit AUTHORIZATION mw_agent_owner;
CREATE SCHEMA runtime AUTHORIZATION mw_agent_owner;
CREATE SCHEMA migration AUTHORIZATION mw_agent_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA audit,runtime,migration FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE mw_agent_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE audit.operations (
 operation_id uuid PRIMARY KEY,
 service_name text NOT NULL CHECK (btrim(service_name)<>''),
 idempotency_key text NOT NULL CHECK (btrim(idempotency_key)<>''),
 parent_operation_id uuid REFERENCES audit.operations(operation_id),
 environment text NOT NULL CHECK(environment IN ('production','development','test')),
 action text NOT NULL CHECK(action IN ('READ','INSERT','UPDATE','DELETE','SEND','PROCESS','AUTH','JOB','IMPORT','RECONCILE','CONFIG','HEALTH')),
 actor_kind text NOT NULL CHECK(actor_kind IN ('reviewer','partner','scheduler','system','operator','migration')),
 actor_id text,                         -- immutable Partner key or explicit service/operator identity
 actor_login text,                      -- snapshot, never an authority source
 message_id text,
 conversation_binding text,
 request_reference jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(request_reference)='object'),
 authorization jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(authorization)='object'),
 plan jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(plan)='object'),
 plan_sha256 text NOT NULL CHECK(plan_sha256 ~ '^[0-9a-f]{64}$'),
 code_version text NOT NULL,
 policy_version text NOT NULL,
 process_generation uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 writer_role name NOT NULL DEFAULT session_user,
 UNIQUE(service_name,idempotency_key)
);
CREATE INDEX operations_message_idx ON audit.operations(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX operations_actor_time_idx ON audit.operations(actor_id,created_at DESC);
CREATE INDEX operations_parent_idx ON audit.operations(parent_operation_id) WHERE parent_operation_id IS NOT NULL;

CREATE TABLE audit.events (
 event_id uuid PRIMARY KEY,             -- deterministic/reused on delivery retry
 operation_id uuid NOT NULL REFERENCES audit.operations(operation_id),
 operation_seq integer NOT NULL CHECK(operation_seq>0),
 event_kind text NOT NULL CHECK(btrim(event_kind)<>''),
 route text NOT NULL CHECK(route IN ('appsheet','postgres','instagram','email','codex','internal','migration')),
 occurred_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 target_database text,
 target_schema text,
 target_table text,
 record_keys jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(record_keys)='array'),
 payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(payload)='object'),
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
 writer_role name NOT NULL DEFAULT session_user,
 UNIQUE(operation_id,operation_seq)
);
CREATE INDEX events_recorded_idx ON audit.events(recorded_at);
CREATE INDEX events_target_idx ON audit.events(target_database,target_schema,target_table,recorded_at DESC);
-- No indiscriminate JSONB GIN indexes or partitioning at this initial scale.

CREATE FUNCTION audit.reject_rewrite() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Append-only audit: append a reconciliation event instead'; END $$;
CREATE TRIGGER operations_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON audit.operations
 FOR EACH STATEMENT EXECUTE FUNCTION audit.reject_rewrite();
CREATE TRIGGER events_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON audit.events
 FOR EACH STATEMENT EXECUTE FUNCTION audit.reject_rewrite();

CREATE TABLE runtime.operation_state (
 operation_id uuid PRIMARY KEY REFERENCES audit.operations(operation_id),
 state text NOT NULL CHECK(state IN ('PLANNED','AUTHORIZED','DISPATCHING','COMMITTED','VERIFIED','COMPLETED','DENIED','FAILED','UNKNOWN','ROLLED_BACK','CANCELLED')),
 blocking_scope text,                   -- e.g. reviewer-writes; receipt:<job>; notice:<id>:ig
 next_event_seq integer NOT NULL DEFAULT 1 CHECK(next_event_seq>0),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 last_event_id uuid REFERENCES audit.events(event_id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX operation_unknown_idx ON runtime.operation_state(blocking_scope) WHERE state IN ('DISPATCHING','UNKNOWN');

CREATE TABLE runtime.service_control (
 service_name text PRIMARY KEY,
 backend text NOT NULL CHECK(backend IN ('sqlite','postgres')),
 active_generation uuid NOT NULL,
 processing_enabled boolean NOT NULL DEFAULT false,
 writes_enabled boolean NOT NULL DEFAULT false,
 activated_at timestamptz,
 migration_boundary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(migration_boundary)='object'),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- This controls cooperating NEW workers. It cannot fence a legacy SQLite-only
-- binary: stopping/disabling that binary remains mandatory at cutover.

CREATE TABLE runtime.job_runs (
 run_id uuid PRIMARY KEY,
 operation_id uuid NOT NULL REFERENCES audit.operations(operation_id),
 service_name text NOT NULL,
 scheduled_key text,
 started_at timestamptz NOT NULL,
 finished_at timestamptz,
 state text NOT NULL CHECK(state IN ('RUNNING','COMPLETED','FAILED','INTERRUPTED')),
 summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(summary)='object')
);
CREATE INDEX job_runs_service_time_idx ON runtime.job_runs(service_name,started_at DESC);

CREATE TABLE migration.batches (
 batch_id uuid PRIMARY KEY,
 source_host text NOT NULL,
 source_code_version text NOT NULL,
 started_at timestamptz NOT NULL,
 verified_at timestamptz,
 state text NOT NULL CHECK(state IN ('PREPARED','IMPORTED','VERIFIED','ACTIVATED','ABORTED')),
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(evidence)='object')
);
CREATE TABLE migration.table_checks (
 batch_id uuid NOT NULL REFERENCES migration.batches(batch_id),
 source_file text NOT NULL,
 source_table text NOT NULL,
 target_table text NOT NULL,
 present boolean NOT NULL,
 source_rows bigint NOT NULL CHECK(source_rows>=0),
 target_rows bigint NOT NULL CHECK(target_rows>=0),
 source_sha256 text,
 target_sha256 text,
 status_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
 findings jsonb NOT NULL DEFAULT '[]'::jsonb,
 PRIMARY KEY(batch_id,source_file,source_table)
);

GRANT USAGE ON SCHEMA audit,runtime TO mw_agent_worker,mw_agent_relay;
GRANT SELECT,INSERT ON audit.operations,audit.events TO mw_agent_worker;
GRANT SELECT,INSERT ON audit.events TO mw_agent_relay;
GRANT SELECT ON audit.operations TO mw_agent_relay;
GRANT SELECT,INSERT,UPDATE ON runtime.operation_state,runtime.job_runs TO mw_agent_worker;
GRANT SELECT,UPDATE ON runtime.operation_state TO mw_agent_relay;
GRANT SELECT ON runtime.service_control TO mw_agent_worker,mw_agent_relay;
GRANT USAGE ON SCHEMA audit,runtime,migration TO mw_agent_auditor;
GRANT SELECT ON ALL TABLES IN SCHEMA audit,runtime,migration TO mw_agent_auditor;
REVOKE ALL ON FUNCTION audit.reject_rewrite() FROM PUBLIC;
COMMIT;
