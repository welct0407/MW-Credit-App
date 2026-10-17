-- R069 W4 optional follow-up (owner decision 17 October 2026): idle agent cycles record a heartbeat only.
-- Immutable after application.
SET LOCAL ROLE mw_agent_owner;

-- One mutable row per service (runtime, not audit). audit.job() upserts it RUNNING at start under the
-- service advisory lock and fences the single owner on it: a RUNNING row whose owner process is alive
-- (or on another host) refuses a second run; a provably dead local owner is retired. The JOB operation,
-- its events and its runtime.job_runs row are written lazily: in the first child operation's transaction
-- (materialised=true, last_effect_at), or at exit when the run failed or was interrupted. A run that did
-- nothing only updates last_finished_at/consecutive_noop here, so the 8,000+ daily no-op JOB trees are gone.
-- operation_id/run_key are fixed at start, so whoever materialises the run (the owner or the process that
-- retires it) writes the same operation. The V3 unique RUNNING job run still holds for materialised runs.
CREATE TABLE runtime.service_heartbeats (
 service_name text PRIMARY KEY CHECK (btrim(service_name)<>''),
 operation_id uuid NOT NULL,
 run_key text NOT NULL CHECK (btrim(run_key)<>''),
 owner jsonb NOT NULL CHECK (jsonb_typeof(owner)='object'),      -- host, pid, start_token of the owning process
 process_generation uuid NOT NULL,
 code_version text NOT NULL,
 state text NOT NULL CHECK (state IN ('RUNNING','COMPLETED','FAILED','INTERRUPTED')),
 last_started_at timestamptz NOT NULL,
 last_finished_at timestamptz,
 last_outcome text CHECK (last_outcome IN ('COMPLETED','FAILED','INTERRUPTED')),
 exit_code integer,
 consecutive_noop bigint NOT NULL DEFAULT 0 CHECK (consecutive_noop>=0),
 last_effect_at timestamptz,
 materialised boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

GRANT SELECT,INSERT,UPDATE ON runtime.service_heartbeats TO mw_agent_worker;
GRANT SELECT ON runtime.service_heartbeats TO mw_agent_retention,mw_agent_auditor;
-- No worker DELETE; the relay does not read it.
