-- V102 (R089): monitoring.pwa_ops_health_v1() at the migration head, in a disposable loopback cluster. One
-- rolled-back transaction with synthetic rows: header (postgres's pinned STABLE definer, no PUBLIC EXECUTE, no
-- DEV grant), the definer's column-level reads (the Cloud SQL path, where postgres is no superuser), every count
-- and age against deltas from the baseline, the V94 job states, and a non-superuser caller that reaches the
-- counts through the function only.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE missing text;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal') OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'Disposable loopback database required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='monitoring.pwa_ops_health_v1()'::regprocedure
  AND prosecdef AND provolatile='s' AND pg_get_userbyid(proowner)='postgres' AND 'search_path=pg_catalog, public'=ANY(proconfig)) THEN
  RAISE EXCEPTION 'V102: ops health RPC header drift'; END IF;
 IF has_function_privilege('public','monitoring.pwa_ops_health_v1()','EXECUTE')
  OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='monitoring.pwa_ops_health_v1()'::regprocedure AND a.grantee<>p.proowner) THEN
  RAISE EXCEPTION 'V102: DEV must hold no EXECUTE grant beyond the owner'; END IF;
 IF obj_description('monitoring.pwa_ops_health_v1()'::regprocedure,'pg_proc') NOT LIKE 'mw-access:monitoring %' THEN RAISE EXCEPTION 'V102: comment drift'; END IF;
 -- The definer's explicit column grants (attacl): a superuser in CI reads anyway, so the ACL itself is checked.
 SELECT string_agg(format('%s.%s',t,c),', ') INTO missing FROM (VALUES
   ('pwa_notification_deliveries','state'),('pwa_notification_deliveries','created_at'),('pwa_notification_deliveries','completed_at'),
   ('pwa_notification_deliveries','send_started_at'),('pwa_push_subscriptions','enabled'),('pwa_push_subscriptions','expires_at'),
   ('pwa_job_runs','job_name'),('pwa_job_runs','state'),('pwa_job_runs','business_date'),('pwa_job_runs','started_at'),('pwa_job_runs','completed_at')) v(t,c)
  WHERE NOT EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x
   WHERE a.attrelid=format('public.%I',t)::regclass AND a.attname=c AND x.grantee='postgres'::regrole AND x.privilege_type='SELECT');
 IF missing IS NOT NULL THEN RAISE EXCEPTION 'V102: definer column grants missing: %',missing; END IF;
 -- Nothing beyond those columns: no endpoint, key, recipient or table-wide read for the definer.
 IF EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x
   WHERE a.attrelid IN ('public.pwa_notification_deliveries'::regclass,'public.pwa_push_subscriptions'::regclass,'public.pwa_job_runs'::regclass)
   AND x.grantee='postgres'::regrole AND a.attname NOT IN ('state','created_at','completed_at','send_started_at','enabled','expires_at','job_name','business_date','started_at'))
  OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) x WHERE c.oid IN ('public.pwa_notification_deliveries'::regclass,'public.pwa_push_subscriptions'::regclass,'public.pwa_job_runs'::regclass)
   AND x.grantee='postgres'::regrole) THEN
  RAISE EXCEPTION 'V102: the definer must read exactly its columns'; END IF;
END $$;

CREATE TEMP TABLE oh_base ON COMMIT DROP AS SELECT * FROM monitoring.pwa_ops_health_v1();
GRANT SELECT ON oh_base TO PUBLIC;
DO $$
DECLARE c record; e uuid; s uuid; n integer:=0;
BEGIN
 FOR c IN SELECT * FROM (VALUES
   ('pending-old','pending',interval '2 days',NULL::interval,NULL::interval),
   ('retry','retry',interval '10 minutes',NULL,NULL),
   ('sent-recent','sent',interval '1 hour',interval '30 seconds',interval '31 seconds'),
   ('sent-old','sent',interval '3 days',interval '2 days',interval '2 days'),
   ('dead-recent','dead',interval '3 hours',interval '2 hours',interval '2 hours'),
   ('uncertain-recent','uncertain',interval '3 hours',interval '1 hour',interval '1 hour'),
   ('dead-old','dead',interval '4 days',interval '3 days',interval '3 days'),
   ('cancelled','cancelled',interval '1 hour',interval '50 minutes',NULL)) v(name,state,created,completed,started) LOOP
  n:=n+1;
  INSERT INTO public.pwa_notification_events(dedupe_key,event_type,source_kind,source_id,source_version)
  VALUES('OH-'||c.name,'loan.created','loan','OH-L-'||c.name,'v1') RETURNING event_id INTO e;
  INSERT INTO public.pwa_push_subscriptions(issuer,subject,partner_id,endpoint_hash,endpoint,p256dh,auth,enabled,expires_at)
  VALUES('https://securetoken.google.com/clever-oasis-508610-n7','oh-'||c.name,'OH-P',encode(sha256(convert_to('oh-'||c.name,'UTF8')),'hex'),
   'https://fcm.googleapis.com/fcm/send/oh-'||c.name,'synthetic','synthetic',c.name<>'cancelled',CASE WHEN c.name='retry' THEN clock_timestamp()-interval '1 day' END)
  RETURNING subscription_id INTO s;
  INSERT INTO public.pwa_notification_deliveries(event_id,channel,destination_key,recipient_partner_id,subscription_id,subscription_version,state,created_at,completed_at,send_started_at)
  VALUES(e,'web-push',encode(sha256(convert_to('oh-'||c.name,'UTF8')),'hex'),'OH-P',s,1,c.state,statement_timestamp()-c.created,statement_timestamp()-c.completed,statement_timestamp()-c.started);
 END LOOP;
 IF n<>8 THEN RAISE EXCEPTION 'fixture rows missing'; END IF;
 -- V94 contract: pending until the single completing UPDATE; the newest run's state is reported.
 INSERT INTO public.pwa_job_runs(job_name,business_date,scope_key,state,started_at,completed_at,result_count) VALUES
  ('daily-charges',DATE '2999-01-01','daily','completed',statement_timestamp()-interval '10 hours',statement_timestamp()-interval '9 hours',3),
  ('daily-charges',DATE '2999-01-02','daily','pending',statement_timestamp()-interval '1 minute',NULL,NULL),
  ('recent-analytics',DATE '2999-01-02','hour:09','completed',statement_timestamp()-interval '42 minutes',statement_timestamp()-interval '41 minutes',1);
END $$;

DO $$
DECLARE b oh_base; r record;
BEGIN
 SELECT * INTO b FROM oh_base;
 SELECT * INTO STRICT r FROM monitoring.pwa_ops_health_v1();
 IF r.pending_deliveries-b.pending_deliveries<>2 THEN RAISE EXCEPTION 'pending counts pending and retry: % vs %',r.pending_deliveries,b.pending_deliveries; END IF;
 IF r.oldest_pending_seconds<172800 THEN RAISE EXCEPTION 'oldest pending age %',r.oldest_pending_seconds; END IF;
 IF r.delivered_24h-b.delivered_24h<>1 THEN RAISE EXCEPTION 'delivered in 24 h counts sent only, completed in 24 h'; END IF;
 IF r.failed_24h-b.failed_24h<>2 THEN RAISE EXCEPTION 'failed in 24 h counts dead and uncertain, completed in 24 h'; END IF;
 IF r.subscriptions_active-coalesce(b.subscriptions_active,0)<>6 THEN RAISE EXCEPTION 'active subscriptions exclude disabled and expired: %',r.subscriptions_active; END IF;
 IF r.last_dispatch_age_seconds IS NULL OR r.last_dispatch_age_seconds>90 THEN RAISE EXCEPTION 'last dispatch age %',r.last_dispatch_age_seconds; END IF;
 -- Fixture timestamps come from the earlier statement, so compare within a minute.
 IF r.daily_charges_last_state<>'pending' OR r.daily_charges_last_completed_at NOT BETWEEN statement_timestamp()-interval '9 hours 1 minute' AND statement_timestamp()-interval '9 hours'
  OR r.recent_analytics_last_state<>'completed' OR r.recent_analytics_last_completed_at NOT BETWEEN statement_timestamp()-interval '42 minutes' AND statement_timestamp()-interval '41 minutes' THEN
  RAISE EXCEPTION 'job freshness: % % % %',r.daily_charges_last_state,r.daily_charges_last_completed_at,r.recent_analytics_last_state,r.recent_analytics_last_completed_at; END IF;
END $$;

-- A non-superuser caller (the PROD collector shape) reads the counts through the function only.
CREATE ROLE v102_collector NOLOGIN NOINHERIT;
GRANT USAGE ON SCHEMA monitoring TO v102_collector;
GRANT EXECUTE ON FUNCTION monitoring.pwa_ops_health_v1() TO v102_collector;
SET ROLE v102_collector;
DO $$
DECLARE r record;
BEGIN
 SELECT * INTO STRICT r FROM monitoring.pwa_ops_health_v1();
 IF r.pending_deliveries IS NULL THEN RAISE EXCEPTION 'collector call returned no counts'; END IF;
 BEGIN PERFORM 1 FROM public.pwa_notification_deliveries LIMIT 1; RAISE EXCEPTION 'collector must not read deliveries directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM 1 FROM public.pwa_push_subscriptions LIMIT 1; RAISE EXCEPTION 'collector must not read subscriptions directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM 1 FROM public.pwa_job_runs LIMIT 1; RAISE EXCEPTION 'collector must not read job runs directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Without the grant the call is denied (EXECUTE is revoked from PUBLIC).
CREATE ROLE v102_stranger NOLOGIN NOINHERIT;
GRANT USAGE ON SCHEMA monitoring TO v102_stranger;
SET ROLE v102_stranger;
DO $$ BEGIN
 BEGIN PERFORM * FROM monitoring.pwa_ops_health_v1(); RAISE EXCEPTION 'stranger must not execute the ops health RPC';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- The PROD-only pg_stat_statements grant (V102 section 3) is exactly three numeric columns: replayed here on a
-- probe role (DEV itself gets no grant), it lands in attacl only, never as a view-level (relacl) grant and never
-- on the statement text.
DO $$
DECLARE cols text;
BEGIN
 IF to_regclass('monitoring.pg_stat_statements') IS NULL THEN RAISE NOTICE 'pg_stat_statements absent; column grant not replayed'; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) x WHERE c.oid=to_regclass('monitoring.pg_stat_statements')
   AND pg_get_userbyid(x.grantee) IN ('mw_integration_agent','v102_collector')) THEN RAISE EXCEPTION 'V102: no view-level grant expected in DEV'; END IF;
 CREATE ROLE v102_stats NOLOGIN NOINHERIT;
 GRANT SELECT (queryid, calls, total_exec_time) ON monitoring.pg_stat_statements TO v102_stats;
 SELECT string_agg(a.attname,',' ORDER BY a.attname) INTO cols FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x
  WHERE a.attrelid=to_regclass('monitoring.pg_stat_statements') AND x.grantee='v102_stats'::regrole AND x.privilege_type='SELECT';
 IF cols IS DISTINCT FROM 'calls,queryid,total_exec_time' OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) x
   WHERE c.oid=to_regclass('monitoring.pg_stat_statements') AND x.grantee='v102_stats'::regrole) THEN
  RAISE EXCEPTION 'V102: pg_stat_statements grant must be the three numeric columns only (got %)',cols; END IF;
END $$;
ROLLBACK;
