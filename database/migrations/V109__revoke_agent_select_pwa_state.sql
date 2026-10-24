-- R094 (owner instruction of 24 October 2026, "Proceed with R094 till it's in production"; Archie's decision 2): the
-- integration agent's last reads left by the retired Instagram Partner conversation. mw_integration_agent still holds
-- SELECT on the notification, push and jobs tables of loan_manager_prod: postgres created them (V86) under the
-- pre-R085 public "SELECT ON TABLES" default for the agent, and the owner change made their owners the grantors, so
-- R091's operator revoke as postgres could not reach them. No kept agent path reads them (receipts, cash statement
-- and the collector use their own functions and tables).
-- This migration revokes exactly that SELECT on public.pwa_notification_events, pwa_notification_preferences,
-- pwa_notification_deliveries and pwa_push_subscriptions (owner mw_notify_owner_<env>) and public.pwa_job_runs (owner
-- mw_jobs_owner_<env>) from mw_integration_agent, as the owners. Nothing else changes: no table, column, routine,
-- trigger or business row; pwa_row_changes, every other grant and every default privilege stay (the public default
-- is the cash statement's read path). A database without the role or without the grant (DEV) is a no-op.
-- On Cloud SQL the runner is not a superuser: run as postgres with temporary SET membership of the owner of each table
-- still granted (owner-authority-cli.mjs prepare --owner mw_notify_owner_<env> and --owner mw_jobs_owner_<env>, then
-- restore); the preflight names every missing authority first. Re-runnable: a second run finds nothing to revoke.

-- 1. Preflight. Fails closed with the complete list of problems.
DO $preflight$
DECLARE suffix text; t record; problems text[]:='{}';
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 FOR t IN SELECT * FROM (VALUES ('pwa_notification_events','mw_notify_owner_'||suffix),('pwa_notification_preferences','mw_notify_owner_'||suffix),
   ('pwa_notification_deliveries','mw_notify_owner_'||suffix),('pwa_push_subscriptions','mw_notify_owner_'||suffix),('pwa_job_runs','mw_jobs_owner_'||suffix)) v(name,owner) LOOP
  IF to_regclass(format('public.%I',t.name)) IS NULL THEN problems:=problems||format('table public.%s is missing',t.name);
  ELSIF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=format('public.%I',t.name)::regclass)<>t.owner THEN
   problems:=problems||format('public.%s is not owned by %s',t.name,t.owner);
  ELSIF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent') AND has_table_privilege('mw_integration_agent',format('public.%I',t.name),'SELECT')
   AND NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper)
   AND NOT pg_has_role(current_user,t.owner,'USAGE') AND NOT pg_has_role(current_user,t.owner,'SET') THEN
   problems:=problems||format('%s cannot SET ROLE %s to revoke the agent''s SELECT on public.%s (temporary maintenance membership required)',current_user,t.owner,t.name);
  END IF;
 END LOOP;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V109 preflight: %', array_to_string(problems,'; '); END IF;
END $preflight$;

-- 2. The revoke, per table where the agent still reads, as the table's owner (an inheriting member acts as it; else
-- SET LOCAL ROLE).
DO $revoke$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; t record; switched boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent') THEN RETURN; END IF;
 FOR t IN SELECT * FROM (VALUES ('pwa_notification_events','mw_notify_owner_'||suffix),('pwa_notification_preferences','mw_notify_owner_'||suffix),
   ('pwa_notification_deliveries','mw_notify_owner_'||suffix),('pwa_push_subscriptions','mw_notify_owner_'||suffix),('pwa_job_runs','mw_jobs_owner_'||suffix)) v(name,owner) LOOP
  CONTINUE WHEN NOT has_table_privilege('mw_integration_agent',format('public.%I',t.name),'SELECT');
  switched:=NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) AND NOT pg_has_role(current_user,t.owner,'USAGE');
  IF switched THEN EXECUTE format('SET LOCAL ROLE %I',t.owner); END IF;
  EXECUTE format('REVOKE SELECT ON public.%I FROM mw_integration_agent',t.name);
  IF switched THEN RESET ROLE; END IF;
 END LOOP;
END $revoke$;
RESET ROLE;

-- 3. Self-check: the agent reads none of the five tables, neither table-wide nor by column.
DO $check$
DECLARE bad text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent') THEN RETURN; END IF;
 SELECT string_agg(n,', ') INTO bad FROM unnest(ARRAY['pwa_notification_events','pwa_notification_preferences','pwa_notification_deliveries','pwa_push_subscriptions','pwa_job_runs']) n
 WHERE has_table_privilege('mw_integration_agent',format('public.%I',n),'SELECT') OR has_any_column_privilege('mw_integration_agent',format('public.%I',n),'SELECT');
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V109: mw_integration_agent still reads %',bad; END IF;
END $check$;
