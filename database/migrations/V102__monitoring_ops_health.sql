-- R089 (Grafana revamp, design section B): one read-only monitoring RPC for the Debian collector, so the PWA
-- push and scheduled-job health reach the dashboards and alerts as counts, ages and states only. Additive: no
-- table, column, data or trigger change; no business routine is touched.
-- monitoring.pwa_ops_health_v1() returns one row from public.pwa_notification_deliveries,
-- public.pwa_push_subscriptions and public.pwa_job_runs: pending deliveries (pending and retry) and the oldest
-- one's age, sent in 24 h, failed in 24 h (dead and uncertain), active subscriptions, the age of the newest
-- dispatch, and for daily-charges and recent-analytics the newest completed_at and the newest run's state
-- (V94 contract: pending or completed). No identifier, endpoint, key or business value leaves the database.
-- SECURITY DEFINER owned by postgres with search_path pinned, STABLE, EXECUTE revoked from PUBLIC. The definer
-- reads exactly the columns it needs through column-level SELECT (the V99 pattern): the three tables belong to
-- the closed owners mw_notify_owner_<env> and mw_jobs_owner_<env> (V88), and on Cloud SQL postgres is not a
-- superuser, so it holds no implicit read. A non-superuser runner grants as an inheriting member of each owner or
-- under SET ROLE (owner-authority-cli.mjs prepare --owner mw_notify_owner_<env> --owner mw_jobs_owner_<env>, then
-- restore); the preflight names every missing authority first.
-- PROD only: EXECUTE and USAGE on schema monitoring for the collector's reporting role mw_integration_agent, and
-- column-level SELECT (queryid, calls, total_exec_time) on monitoring.pg_stat_statements (created by V93 in schema
-- monitoring by the runner, so the runner owns the view), each guarded by IF EXISTS on the role and the view; the
-- statement text is not granted. DEV keeps the function with no extra grant.

-- 1. Preflight. Fails closed with the complete list of problems.
DO $preflight$
DECLARE suffix text; owner_name text; problems text[]:='{}';
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 IF current_user<>'postgres' THEN problems:=problems||format('run as postgres (the function owner), not %s',current_user); END IF;
 FOREACH owner_name IN ARRAY ARRAY['mw_notify_owner_'||suffix,'mw_jobs_owner_'||suffix] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=owner_name) THEN problems:=problems||format('role %s is missing',owner_name); END IF;
 END LOOP;
 IF to_regclass('public.pwa_notification_deliveries') IS NULL OR to_regclass('public.pwa_push_subscriptions') IS NULL OR to_regclass('public.pwa_job_runs') IS NULL THEN
  problems:=problems||'V86 notification and job tables are missing'::text;
 ELSE
  IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.pwa_notification_deliveries'::regclass)<>'mw_notify_owner_'||suffix
   OR (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.pwa_push_subscriptions'::regclass)<>'mw_notify_owner_'||suffix THEN
   problems:=problems||format('notification tables are not owned by mw_notify_owner_%s',suffix); END IF;
  IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.pwa_job_runs'::regclass)<>'mw_jobs_owner_'||suffix THEN
   problems:=problems||format('public.pwa_job_runs is not owned by mw_jobs_owner_%s',suffix); END IF;
  IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.pwa_job_runs'::regclass AND contype='c' AND pg_get_constraintdef(oid) ~ 'leased|uncertain|failed') THEN
   problems:=problems||'public.pwa_job_runs predates the V94 pending/completed contract'::text; END IF;
 END IF;
 IF to_regprocedure('monitoring.pwa_ops_health_v1()') IS NOT NULL THEN problems:=problems||'monitoring.pwa_ops_health_v1() already exists'::text; END IF;
 IF to_regnamespace('monitoring') IS NULL THEN
  IF NOT has_database_privilege(current_user,current_database(),'CREATE') THEN problems:=problems||format('%s lacks CREATE on the database (schema monitoring)',current_user); END IF;
 ELSIF NOT has_schema_privilege(current_user,'monitoring','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema monitoring',current_user); END IF;
 -- V93: the view is created with the extension by the runner; only its owner (or a superuser) can grant on it here.
 IF to_regclass('monitoring.pg_stat_statements') IS NOT NULL AND current_database()='loan_manager_prod'
  AND NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper)
  AND (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=to_regclass('monitoring.pg_stat_statements'))<>current_user THEN
  problems:=problems||'monitoring.pg_stat_statements is not owned by the runner (V93)'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  FOREACH owner_name IN ARRAY ARRAY['mw_notify_owner_'||suffix,'mw_jobs_owner_'||suffix] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=owner_name) AND NOT pg_has_role(current_user,owner_name,'USAGE') AND NOT pg_has_role(current_user,owner_name,'SET') THEN
    problems:=problems||format('%s holds neither inherited nor SET authority on %s (temporary maintenance membership required for the column grants)',current_user,owner_name); END IF;
  END LOOP;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V102 preflight: %', array_to_string(problems,'; '); END IF;
END $preflight$;

CREATE SCHEMA IF NOT EXISTS monitoring;

-- 2. The read model. One row, every value a count, an age in whole seconds, a timestamp or a fixed state word.
CREATE FUNCTION monitoring.pwa_ops_health_v1()
RETURNS TABLE(pending_deliveries bigint,oldest_pending_seconds bigint,delivered_24h bigint,failed_24h bigint,
 subscriptions_active bigint,last_dispatch_age_seconds bigint,
 daily_charges_last_completed_at timestamptz,daily_charges_last_state text,
 recent_analytics_last_completed_at timestamptz,recent_analytics_last_state text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 WITH clock AS (SELECT statement_timestamp() AS t),
 deliveries AS (
  SELECT count(*) FILTER (WHERE d.state IN ('pending','retry')) AS pending,
   min(d.created_at) FILTER (WHERE d.state IN ('pending','retry')) AS oldest_pending,
   count(*) FILTER (WHERE d.state='sent' AND d.completed_at>=(SELECT t FROM clock)-interval '24 hours') AS sent_24h,
   count(*) FILTER (WHERE d.state IN ('dead','uncertain') AND d.completed_at>=(SELECT t FROM clock)-interval '24 hours') AS failed_24h,
   max(greatest(d.completed_at,d.send_started_at)) AS last_dispatch
  FROM public.pwa_notification_deliveries d),
 jobs AS (
  SELECT j.job_name,
   max(j.completed_at) FILTER (WHERE j.state='completed') AS last_completed,
   (array_agg(j.state ORDER BY j.business_date DESC,j.started_at DESC NULLS LAST,j.completed_at DESC NULLS LAST))[1] AS last_state
  FROM public.pwa_job_runs j WHERE j.job_name IN ('daily-charges','recent-analytics') GROUP BY j.job_name)
 SELECT dl.pending,
  floor(extract(epoch FROM (SELECT t FROM clock)-dl.oldest_pending))::bigint,
  dl.sent_24h, dl.failed_24h,
  (SELECT count(*) FROM public.pwa_push_subscriptions s WHERE s.enabled AND (s.expires_at IS NULL OR s.expires_at>(SELECT t FROM clock))),
  floor(extract(epoch FROM (SELECT t FROM clock)-dl.last_dispatch))::bigint,
  (SELECT last_completed FROM jobs WHERE job_name='daily-charges'), (SELECT last_state FROM jobs WHERE job_name='daily-charges'),
  (SELECT last_completed FROM jobs WHERE job_name='recent-analytics'), (SELECT last_state FROM jobs WHERE job_name='recent-analytics')
 FROM deliveries dl
$$;

-- 3. ACL, the definer's column reads, and the PROD collector grants.
DO $acl$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 runner text:=current_user; superuser boolean; owner_name text; g record;
BEGIN
 SELECT rolsuper INTO superuser FROM pg_roles WHERE rolname=current_user;
 REVOKE ALL ON FUNCTION monitoring.pwa_ops_health_v1() FROM PUBLIC;
 COMMENT ON FUNCTION monitoring.pwa_ops_health_v1() IS 'mw-access:monitoring read-only push and job health counts for the Debian collector; explicit capability only';
 -- Exactly the columns the definer reads, granted by (or as) each table owner.
 FOR g IN SELECT * FROM (VALUES
   ('mw_notify_owner_'||suffix,'pwa_notification_deliveries','state, created_at, completed_at, send_started_at'),
   ('mw_notify_owner_'||suffix,'pwa_push_subscriptions','enabled, expires_at'),
   ('mw_jobs_owner_'||suffix,'pwa_job_runs','job_name, state, business_date, started_at, completed_at')) v(owner_name,relation_name,columns) LOOP
  IF superuser OR pg_has_role(runner,g.owner_name,'USAGE') THEN
   EXECUTE format('GRANT SELECT (%s) ON public.%I TO %I',g.columns,g.relation_name,runner);
  ELSE
   EXECUTE format('SET ROLE %I',g.owner_name);
   EXECUTE format('GRANT SELECT (%s) ON public.%I TO %I',g.columns,g.relation_name,runner);
   RESET ROLE;
  END IF;
 END LOOP;
 IF current_database()='loan_manager_prod' AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent') THEN
  GRANT USAGE ON SCHEMA monitoring TO mw_integration_agent;
  GRANT EXECUTE ON FUNCTION monitoring.pwa_ops_health_v1() TO mw_integration_agent;
  IF to_regclass('monitoring.pg_stat_statements') IS NOT NULL THEN
   GRANT SELECT (queryid, calls, total_exec_time) ON monitoring.pg_stat_statements TO mw_integration_agent;
  END IF;
 END IF;
 IF NOT (SELECT prosecdef AND provolatile='s' AND pg_get_userbyid(proowner)='postgres' AND 'search_path=pg_catalog, public'=ANY(proconfig)
   FROM pg_proc WHERE oid='monitoring.pwa_ops_health_v1()'::regprocedure)
  OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='monitoring.pwa_ops_health_v1()'::regprocedure
   AND a.privilege_type='EXECUTE' AND a.grantee<>p.proowner AND NOT (current_database()='loan_manager_prod' AND pg_get_userbyid(a.grantee)='mw_integration_agent')) THEN
  RAISE EXCEPTION 'V102: monitoring.pwa_ops_health_v1 must be postgres''s pinned STABLE definer executable only by the PROD collector role'; END IF;
END $acl$;
