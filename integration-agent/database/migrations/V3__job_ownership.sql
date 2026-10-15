-- Durable single owner per current service; no connection held during network calls.
SET LOCAL ROLE mw_agent_owner;
CREATE UNIQUE INDEX job_runs_one_running ON runtime.job_runs(service_name) WHERE state='RUNNING';
