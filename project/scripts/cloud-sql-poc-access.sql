-- Dedicated synthetic POC only. Creates an initially disabled login.
-- Applied 2026-09-14. LOGIN was subsequently enabled; owner password entry pending.
-- Do not replay CREATE ROLE against the existing role.
BEGIN;
CREATE ROLE appsheet_poc NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE appsheet_sync_poc TO appsheet_poc;
GRANT USAGE ON SCHEMA public TO appsheet_poc;
GRANT SELECT ON public.poc_source, public.poc_projection, public.poc_events TO appsheet_poc;
GRANT UPDATE (input_value, revision) ON public.poc_source TO appsheet_poc;
COMMIT;

-- Separately executed after scoped permission tests on 2026-09-14:
ALTER ROLE appsheet_poc LOGIN;

SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
FROM pg_roles WHERE rolname='appsheet_poc';
