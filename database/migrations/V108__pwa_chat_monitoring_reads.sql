-- R093 (owner decision 24 October 2026, Option A: the in-app chat on the Grafana dashboards; Archie's resolutions in
-- the R093 change note): two read functions for the Cost page's chat row, read through Grafana PDC by the login
-- mw_grafana_reader (member of mw_agent_dashboard). Read-only and additive: no table, column, trigger, routine of the
-- chat boundary or business row changes. monitoring.pwa_chat_recent_questions_v1 (V104) stays as it is (migrations
-- are immutable); the Cost page reads the two new functions instead.
-- 1. monitoring.pwa_chat_recent_turns_v1(p_limit): the last n questions (1..50, as V104) with the reply's outcome
--    (status, error_code), model, rounds, attempts, turn time, tool calls and their time, whether the asking device
--    had left the turn (detached, from the user row's V106 detached_at) and the token totals.
-- 2. monitoring.pwa_chat_usage_v1(p_since): one row per provider and model of the assistant rows created since
--    p_since (default: the start of the current month in Asia/Bangkok): turns, failed turns, token totals and the
--    median turn time and rounds (percentile_cont 0.5).
-- Both as V104 §6-7: owner postgres (the runner), LANGUAGE sql STABLE SECURITY DEFINER with a pinned search_path, no
-- PUBLIC EXECUTE, EXECUTE for mw_agent_dashboard when it exists (cluster-wide agent bootstrap role), the definer
-- reading exactly the extra columns it needs through column grants made by (or as) the table owner
-- mw_chat_owner_<env>: pwa_chat_messages (error_code, latency_ms, attempts, detached_at) and pwa_chat_tool_calls
-- (message_id, ms, error), beside V104's grant. On Cloud SQL the runner is not a superuser: run as postgres with
-- temporary SET membership of mw_chat_owner_<env> (owner-authority-cli.mjs prepare --owner mw_chat_owner_<env>, then
-- restore); the preflight names every missing authority first.

-- 1. Preflight. Fails closed with the complete list of problems.
DO $preflight$
DECLARE suffix text; chat_owner text; problems text[]:='{}';
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 chat_owner:='mw_chat_owner_'||suffix;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=chat_owner AND NOT rolcanlogin AND NOT rolsuper) THEN problems:=problems||format('role %s is missing or unsafe',chat_owner); END IF;
 IF to_regprocedure('monitoring.pwa_chat_recent_questions_v1(integer)') IS NULL THEN problems:=problems||'V104 monitoring.pwa_chat_recent_questions_v1 is missing'::text; END IF;
 IF to_regclass('public.pwa_chat_messages') IS NULL OR to_regclass('public.pwa_chat_tool_calls') IS NULL THEN
  problems:=problems||'V104 tables pwa_chat_messages and pwa_chat_tool_calls are required'::text;
 ELSE
  IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.pwa_chat_messages'::regclass)<>chat_owner
   OR (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.pwa_chat_tool_calls'::regclass)<>chat_owner THEN
   problems:=problems||format('pwa_chat_messages and pwa_chat_tool_calls must be owned by %s',chat_owner); END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.pwa_chat_messages'::regclass AND attname='detached_at' AND NOT attisdropped) THEN
   problems:=problems||'V106 column pwa_chat_messages.detached_at is missing'::text; END IF;
 END IF;
 IF to_regprocedure('monitoring.pwa_chat_recent_turns_v1(integer)') IS NOT NULL OR to_regprocedure('monitoring.pwa_chat_usage_v1(timestamptz)') IS NOT NULL THEN
  problems:=problems||'the V108 functions already exist'::text; END IF;
 IF to_regnamespace('monitoring') IS NOT NULL AND NOT has_schema_privilege(current_user,'monitoring','CREATE') THEN
  problems:=problems||format('%s lacks CREATE on schema monitoring',current_user); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  IF current_user<>'postgres' THEN problems:=problems||format('run as postgres (the monitoring function owner), not %s',current_user); END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=chat_owner) AND NOT pg_has_role(current_user,chat_owner,'USAGE') AND NOT pg_has_role(current_user,chat_owner,'SET') THEN
   problems:=problems||format('%s cannot SET ROLE %s (temporary maintenance membership required for the column grants)',current_user,chat_owner); END IF;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V108 preflight: %', array_to_string(problems,'; '); END IF;
END $preflight$;

-- 2. The last n questions with the reply's outcome and cost inputs (a superset of pwa_chat_recent_questions_v1).
CREATE FUNCTION monitoring.pwa_chat_recent_turns_v1(p_limit integer DEFAULT 10)
RETURNS TABLE(asked_at timestamptz,question text,status text,error_code text,provider text,model text,rounds integer,attempts integer,
 latency_ms integer,tool_calls integer,tool_ms bigint,detached boolean,input_tokens bigint,cached_tokens bigint,output_tokens bigint,thinking_tokens bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT q.created_at,left(q.text,1000),coalesce(r.status,CASE WHEN q.claimed_at>clock_timestamp()-interval '5 minutes' THEN 'pending' ELSE 'unanswered' END),
  r.error_code,'gemini'::text,r.model,r.rounds::integer,r.attempts::integer,r.latency_ms,
  CASE WHEN r.id IS NULL THEN NULL ELSE coalesce(t.calls,0)::integer END,CASE WHEN r.id IS NULL THEN NULL ELSE coalesce(t.ms,0) END,
  q.detached_at IS NOT NULL,r.prompt_tokens::bigint,r.cached_tokens::bigint,r.output_tokens::bigint,r.thoughts_tokens::bigint
 FROM (SELECT m.thread_id,m.seq,m.text,m.created_at,m.claimed_at,m.detached_at FROM public.pwa_chat_messages m WHERE m.role='user'
  ORDER BY m.created_at DESC,m.seq DESC LIMIT least(greatest(coalesce(p_limit,10),1),50)) q
 LEFT JOIN public.pwa_chat_messages r ON r.thread_id=q.thread_id AND r.seq=q.seq+1 AND r.role='assistant'
 LEFT JOIN LATERAL (SELECT count(*) AS calls,sum(c.ms)::bigint AS ms FROM public.pwa_chat_tool_calls c WHERE c.message_id=r.id) t ON true
 ORDER BY q.created_at DESC,q.seq DESC
$$;

-- 3. Usage per provider and model since a time (the Cost page passes the picker's month start).
CREATE FUNCTION monitoring.pwa_chat_usage_v1(p_since timestamptz)
RETURNS TABLE(provider text,model text,turns bigint,failed bigint,input_tokens bigint,cached_tokens bigint,output_tokens bigint,thinking_tokens bigint,
 median_latency_ms numeric,median_rounds numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT 'gemini'::text,r.model,count(*),count(*) FILTER (WHERE r.status='failed'),
  coalesce(sum(r.prompt_tokens),0)::bigint,coalesce(sum(r.cached_tokens),0)::bigint,coalesce(sum(r.output_tokens),0)::bigint,coalesce(sum(r.thoughts_tokens),0)::bigint,
  (percentile_cont(0.5) WITHIN GROUP (ORDER BY r.latency_ms))::numeric,(percentile_cont(0.5) WITHIN GROUP (ORDER BY r.rounds))::numeric
 FROM public.pwa_chat_messages r
 WHERE r.role='assistant' AND r.created_at>=coalesce(p_since,date_trunc('month',now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')
 GROUP BY r.model
 ORDER BY count(*) DESC,r.model
$$;

-- 4. ACL: no PUBLIC EXECUTE, the boundary comments, the definer's column grants (as or through the table owner, V104
-- §7) and EXECUTE for the Grafana reader's role when present.
DO $ownership$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; chat_owner text; runner text:=current_user; superuser boolean;
BEGIN
 chat_owner:='mw_chat_owner_'||suffix;
 SELECT rolsuper INTO superuser FROM pg_roles WHERE rolname=current_user;
 REVOKE ALL ON FUNCTION monitoring.pwa_chat_recent_turns_v1(integer) FROM PUBLIC;
 REVOKE ALL ON FUNCTION monitoring.pwa_chat_usage_v1(timestamptz) FROM PUBLIC;
 COMMENT ON FUNCTION monitoring.pwa_chat_recent_turns_v1(integer) IS 'mw-access:monitoring last in-app chat questions with outcome, timing and token counts for the Cost page; explicit capability only';
 COMMENT ON FUNCTION monitoring.pwa_chat_usage_v1(timestamptz) IS 'mw-access:monitoring in-app chat turns, failures, tokens and medians per model since a time for the Cost page; explicit capability only';
 IF superuser OR pg_has_role(runner,chat_owner,'USAGE') THEN
  EXECUTE format('GRANT SELECT (error_code, latency_ms, attempts, detached_at) ON public.pwa_chat_messages TO %I',runner);
  EXECUTE format('GRANT SELECT (message_id, ms, error) ON public.pwa_chat_tool_calls TO %I',runner);
 ELSE
  EXECUTE format('SET ROLE %I',chat_owner);
  EXECUTE format('GRANT SELECT (error_code, latency_ms, attempts, detached_at) ON public.pwa_chat_messages TO %I',runner);
  EXECUTE format('GRANT SELECT (message_id, ms, error) ON public.pwa_chat_tool_calls TO %I',runner);
  RESET ROLE;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_agent_dashboard') THEN
  GRANT USAGE ON SCHEMA monitoring TO mw_agent_dashboard;
  GRANT EXECUTE ON FUNCTION monitoring.pwa_chat_recent_turns_v1(integer),monitoring.pwa_chat_usage_v1(timestamptz) TO mw_agent_dashboard;
 END IF;
END $ownership$;

-- 5. Self-check: postgres's pinned STABLE definers with the boundary comment, executable only by the dashboard role.
DO $check$
DECLARE bad text;
BEGIN
 SELECT string_agg(p.oid::regprocedure::text,', ') INTO bad FROM pg_proc p
 WHERE p.oid IN ('monitoring.pwa_chat_recent_turns_v1(integer)'::regprocedure,'monitoring.pwa_chat_usage_v1(timestamptz)'::regprocedure)
  AND (NOT p.prosecdef OR p.provolatile<>'s' OR pg_get_userbyid(p.proowner)<>'postgres' OR NOT ('search_path=pg_catalog, public'=ANY(p.proconfig))
   OR obj_description(p.oid,'pg_proc') NOT LIKE 'mw-access:monitoring %'
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' AND a.grantee<>p.proowner
    AND pg_get_userbyid(a.grantee)<>'mw_agent_dashboard'));
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V108: % must be postgres''s pinned STABLE definers executable only by the dashboard role',bad; END IF;
 IF NOT (SELECT bool_and(has_column_privilege('postgres',t::regclass,c,'SELECT')) FROM (VALUES ('public.pwa_chat_messages','error_code'),('public.pwa_chat_messages','latency_ms'),
   ('public.pwa_chat_messages','attempts'),('public.pwa_chat_messages','detached_at'),('public.pwa_chat_tool_calls','message_id'),('public.pwa_chat_tool_calls','ms'),
   ('public.pwa_chat_tool_calls','error')) v(t,c)) THEN
  RAISE EXCEPTION 'V108: the definer (postgres) must read its columns of pwa_chat_messages and pwa_chat_tool_calls'; END IF;
END $check$;
