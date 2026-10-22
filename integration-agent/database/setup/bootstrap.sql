-- Owner-authorized R015 instance setup. Separate from central schema migrations.
-- Operator session on postgres in the verified Cloud SQL instance, outside a transaction.
-- Also usable in an isolated PostgreSQL 18 lab with identical database names.
-- This acknowledgement is an accident guard, NOT authorization by itself.
DO $$ BEGIN
 IF current_setting('mw_design.execution_approved',true) IS DISTINCT FROM 'agent-postgresql-20260922-v1'
    OR current_database()<>'postgres' THEN
  RAISE EXCEPTION 'Design only: read HANDOVER.md; require explicit execution instruction and postgres connection';
 END IF;
END $$;

-- Fail on collisions; never silently adopt a pre-existing role/database.
-- The deployment operator must be able to SET ROLE to the two owner roles.
-- NOLOGIN stays until private credentials and checks are ready. No passwords here.
CREATE ROLE mw_agent_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE mw_agent_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE ROLE mw_agent_relay NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE ROLE mw_agent_auditor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE ROLE mw_business_audit_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- R064 W4 (DB-PERF-01): audit-retention identity; central V5 grants it and requires it to exist.
-- On an instance bootstrapped before V5, create it as postgres with exactly this statement first.
CREATE ROLE mw_agent_retention NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
-- R090 (Cost page): may only call monitoring.recent_questions_v1() (V9 grants). On an instance bootstrapped
-- before V9, create it as postgres with exactly this statement and its two ALTER ROLE settings below first.
CREATE ROLE mw_agent_dashboard NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
-- Administrative migration principal only; NEVER grant these memberships to a worker.
GRANT mw_agent_owner,mw_business_audit_owner TO CURRENT_USER WITH INHERIT TRUE;

CREATE DATABASE mw_agent OWNER mw_agent_owner TEMPLATE template0 ENCODING 'UTF8';
REVOKE ALL ON DATABASE mw_agent FROM PUBLIC;
GRANT CONNECT ON DATABASE mw_agent TO mw_agent_worker,mw_agent_relay,mw_agent_auditor;
ALTER ROLE mw_agent_worker IN DATABASE mw_agent SET search_path=pg_catalog,runtime,audit;
ALTER ROLE mw_agent_relay IN DATABASE mw_agent SET search_path=pg_catalog,audit,runtime;
ALTER ROLE mw_agent_retention IN DATABASE mw_agent SET search_path=pg_catalog,audit,runtime;
ALTER ROLE mw_agent_auditor IN DATABASE mw_agent SET default_transaction_read_only=on;
ALTER ROLE mw_agent_dashboard IN DATABASE mw_agent SET default_transaction_read_only=on;
ALTER ROLE mw_agent_dashboard IN DATABASE mw_agent SET statement_timeout='10s';
ALTER ROLE mw_agent_worker IN DATABASE mw_agent SET statement_timeout='15s';
ALTER ROLE mw_agent_relay IN DATABASE mw_agent SET statement_timeout='15s';
ALTER ROLE mw_agent_worker IN DATABASE mw_agent SET lock_timeout='3s';
ALTER ROLE mw_agent_relay IN DATABASE mw_agent SET lock_timeout='3s';
ALTER ROLE mw_agent_worker IN DATABASE mw_agent SET idle_in_transaction_session_timeout='30s';
ALTER ROLE mw_agent_relay IN DATABASE mw_agent SET idle_in_transaction_session_timeout='30s';

-- Do not change PUBLIC privileges, connection ceilings, restart settings or
-- network policy in either existing loan database/at instance level here.
-- Reconnect to mw_agent before 01; schema files cannot create a database.
