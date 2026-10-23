-- R090 batch 2 (owner decisions of 23 October 2026, Archie's design B2): a chat reply becomes a push notification when
-- the asking device is no longer attached to the stream, and the chat SQL tool can read the state of the daily jobs.
-- No table, column, business row or trigger change.
-- 1. pwa_notification_events accepts event_type 'chat.reply' and source_kind 'chat' (CHECK constraints widened; names
--    read from pg_constraint).
-- 2. pwa_notify_chat_reply_v1(actor, thread, message, outcome): the chat service's one write into the notification
--    boundary, owned by mw_notify_owner_<env>, SECURITY DEFINER, executable only by mw_chat_api_<env>. The caller check
--    mirrors pwa_chat_actor_v1 (session_user inherits mw_chat_api_<env>; pwa_notify_actor_v1 checks the notification
--    API capability instead, which the chat user does not hold). One event per message (dedupe on the message id).
-- 3. The notify owner reads pwa_chat_threads (id, partner_id, title, status) and pwa_chat_messages (id, thread_id) by
--    column grant (the reply event's message must belong to its thread): the only cross-owner grants.
-- 4. pwa_notify_eligible_v1: a chat reply goes to the asking Partner's own subscriptions (every other type still goes to
--    the other Partner); everything else unchanged.
-- 5. pwa_notify_content_v1: a chat event's facts are the thread title (in the borrower-name slot) and the outcome, which
--    the result's event_type carries as 'chat.reply:ok' / 'chat.reply:failed' (same signature and result columns, so
--    owner, ACL and comment are kept); found=false when the thread is not the recipient's.
--    pwa_notify_history_content_v1 gets the same chat branch, so a history row shows what the device was meant to
--    receive (R089 rule).
-- 6. pwa_job_status_v1(days): read-only job state per business date for the chat SQL tool, owned by
--    mw_jobs_owner_<env>, SECURITY DEFINER, executable only by mw_chat_read_<env>; pwa_job_runs stays unreadable.
-- 7. pwa_chat_thread_v1(actor, id): one thread of the caller (the PWA opens a thread from a notification tap before
--    the list has it), owned by mw_chat_owner_<env> like the V104 RPCs, executable only by mw_chat_api_<env>.
-- On Cloud SQL the runner is not a superuser: the replaced and re-owned objects need temporary authority on
-- mw_notify_owner_<env>, mw_jobs_owner_<env> and mw_chat_owner_<env> (owner-authority-cli.mjs prepare --owner each,
-- then restore); the preflight names every missing authority first.

-- 1. Preflight. Fails closed with the complete list of problems.
DO $preflight$
DECLARE suffix text; notify_owner text; jobs_owner text; chat_owner text; role_name text; owner_role text; problems text[]:='{}';
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 notify_owner:='mw_notify_owner_'||suffix; jobs_owner:='mw_jobs_owner_'||suffix; chat_owner:='mw_chat_owner_'||suffix;
 FOREACH role_name IN ARRAY ARRAY[notify_owner,jobs_owner,chat_owner,'mw_chat_api_'||suffix,'mw_chat_read_'||suffix] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) THEN
   problems:=problems||format('role %s is missing or unsafe',role_name); END IF;
 END LOOP;
 IF to_regclass('public.pwa_notification_events') IS NULL OR to_regclass('public.pwa_job_runs') IS NULL OR to_regclass('public.pwa_chat_threads') IS NULL THEN
  problems:=problems||'V86/V104 tables are missing'::text;
 ELSE
  IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.pwa_notification_events'::regclass)<>notify_owner THEN problems:=problems||format('pwa_notification_events is not owned by %s',notify_owner); END IF;
  IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.pwa_job_runs'::regclass)<>jobs_owner THEN problems:=problems||format('pwa_job_runs is not owned by %s',jobs_owner); END IF;
  IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.pwa_chat_threads'::regclass)<>chat_owner THEN problems:=problems||format('pwa_chat_threads is not owned by %s',chat_owner); END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid='public.pwa_notification_events'::regclass AND contype='c' AND pg_get_constraintdef(oid) ~ 'event_type')<>1
   OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.pwa_notification_events'::regclass AND contype='c' AND pg_get_constraintdef(oid) ~ 'source_kind')<>1 THEN
   problems:=problems||'pwa_notification_events must have exactly one event_type and one source_kind CHECK'::text; END IF;
 END IF;
 IF to_regprocedure('public.pwa_notify_eligible_v1(uuid,uuid)') IS NULL OR to_regprocedure('public.pwa_notify_content_v1(uuid,bigint)') IS NULL THEN
  problems:=problems||'V88/V100 notification routines are missing'::text;
 ELSIF EXISTS(SELECT 1 FROM pg_proc WHERE oid IN ('public.pwa_notify_eligible_v1(uuid,uuid)'::regprocedure,'public.pwa_notify_content_v1(uuid,bigint)'::regprocedure) AND pg_get_userbyid(proowner)<>notify_owner) THEN
  problems:=problems||format('pwa_notify_eligible_v1 and pwa_notify_content_v1 must be owned by %s',notify_owner); END IF;
 IF to_regprocedure('public.pwa_notify_chat_reply_v1(jsonb,uuid,uuid,text)') IS NOT NULL OR to_regprocedure('public.pwa_job_status_v1(integer)') IS NOT NULL OR to_regprocedure('public.pwa_chat_thread_v1(jsonb,uuid)') IS NOT NULL THEN
  problems:=problems||'the V105 routines already exist'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  IF NOT has_schema_privilege(current_user,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public',current_user); END IF;
  -- Each owner: ALTER TABLE/FUNCTION ... OWNER and CREATE OR REPLACE run as an inheriting member or under SET ROLE,
  -- and both need CREATE on public for the owner.
  FOREACH owner_role IN ARRAY ARRAY[notify_owner,jobs_owner,chat_owner] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=owner_role) THEN CONTINUE; END IF;
   IF NOT pg_has_role(current_user,owner_role,'SET') THEN problems:=problems||format('%s cannot SET ROLE %s (temporary maintenance membership required)',current_user,owner_role); END IF;
   IF NOT has_schema_privilege(owner_role,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public (grant temporarily)',owner_role); END IF;
  END LOOP;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V105 preflight: %', array_to_string(problems,'; '); END IF;
END $preflight$;

-- 2. Event type and source kind (the notify owner owns the table).
DO $events$
DECLARE notify_owner text:='mw_notify_owner_'||CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; switched boolean:=false; name text;
BEGIN
 IF NOT pg_has_role(current_user,notify_owner,'USAGE') THEN EXECUTE format('SET LOCAL ROLE %I',notify_owner); switched:=true; END IF;
 FOR name IN SELECT conname FROM pg_constraint WHERE conrelid='public.pwa_notification_events'::regclass AND contype='c' AND pg_get_constraintdef(oid) ~ '(event_type|source_kind)' AND pg_get_constraintdef(oid) !~ 'length' LOOP
  EXECUTE format('ALTER TABLE public.pwa_notification_events DROP CONSTRAINT %I',name);
 END LOOP;
 ALTER TABLE public.pwa_notification_events ADD CONSTRAINT pwa_notification_events_event_type_check CHECK(event_type IN ('loan.created','loan.closed','payment.posted','chat.reply'));
 ALTER TABLE public.pwa_notification_events ADD CONSTRAINT pwa_notification_events_source_kind_check CHECK(source_kind IN ('loan','payment','chat'));
 IF switched THEN RESET ROLE; END IF;
END $events$;
RESET ROLE;

-- 3. The only cross-owner grants: the notify owner reads four thread columns and two message columns (granted as the chat owner).
DO $threads$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; chat_owner text; notify_owner text; switched boolean:=false;
BEGIN
 chat_owner:='mw_chat_owner_'||suffix; notify_owner:='mw_notify_owner_'||suffix;
 IF NOT pg_has_role(current_user,chat_owner,'USAGE') THEN EXECUTE format('SET LOCAL ROLE %I',chat_owner); switched:=true; END IF;
 EXECUTE format('GRANT SELECT (id, partner_id, title, status) ON public.pwa_chat_threads TO %I',notify_owner);
 EXECUTE format('GRANT SELECT (id, thread_id) ON public.pwa_chat_messages TO %I',notify_owner);
 IF switched THEN RESET ROLE; END IF;
END $threads$;
RESET ROLE;

-- 4. The chat service's reply event. outcome 'ok' or 'failed'; the thread must be the caller's (42501 otherwise).
-- Returns true when the event was inserted, false for a repeated message id.
CREATE FUNCTION public.pwa_notify_chat_reply_v1(actor jsonb,thread uuid,message uuid,outcome text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE suffix text; partner text; matches bigint; inserted boolean;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 IF current_user<>'mw_notify_owner_'||suffix OR NOT pg_has_role(session_user,'mw_chat_api_'||suffix,'USAGE') OR pg_has_role(session_user,'mw_notify_owner_'||suffix,'MEMBER') THEN
  RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 IF actor IS NULL OR jsonb_typeof(actor)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(actor) key) IS DISTINCT FROM ARRAY['issuer','loginEmail','partnerId','subject']::text[]
  OR EXISTS(SELECT 1 FROM jsonb_each(actor) e WHERE jsonb_typeof(e.value)<>'string')
  OR actor->>'issuer'<>'https://securetoken.google.com/clever-oasis-508610-n7'
  OR coalesce(length(actor->>'subject'),0) NOT BETWEEN 1 AND 128 OR coalesce(length(actor->>'partnerId'),0) NOT BETWEEN 1 AND 256
  OR coalesce(length(actor->>'loginEmail'),0) NOT BETWEEN 1 AND 320 OR actor->>'loginEmail'<>lower(btrim(actor->>'loginEmail')) THEN
  RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 SELECT count(*),min("Row ID") INTO matches,partner FROM public."Partners" WHERE lower(btrim("Login Email"))=actor->>'loginEmail';
 IF matches<>1 OR partner IS DISTINCT FROM actor->>'partnerId' THEN RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 IF thread IS NULL OR message IS NULL OR outcome IS NULL OR outcome NOT IN ('ok','failed') THEN RAISE EXCEPTION 'invalid_request'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pwa_chat_threads t WHERE t.id=thread AND t.partner_id=partner) THEN RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pwa_chat_messages m WHERE m.id=message AND m.thread_id=thread) THEN RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 INSERT INTO public.pwa_notification_events(dedupe_key,event_type,source_kind,source_id,source_version,actor_partner_id,actor_login_email)
 VALUES('chat.reply:'||message::text,'chat.reply','chat',thread::text,outcome||':'||message::text,partner,actor->>'loginEmail')
 ON CONFLICT(dedupe_key) DO NOTHING;
 inserted:=FOUND;
 IF inserted THEN PERFORM pg_catalog.pg_notify('mw_pwa_notifications_v1',''); END IF;
 RETURN inserted;
END $$;

-- 5. Job state per business date for the chat SQL tool. No run ids, no checkpoints; at most 500 rows.
CREATE FUNCTION public.pwa_job_status_v1(days integer)
RETURNS TABLE(job_name text,business_date date,scope_key text,state text,started_at timestamptz,completed_at timestamptz,result_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF days IS NULL OR days NOT BETWEEN 1 AND 90 THEN RAISE EXCEPTION 'invalid_request'; END IF;
 RETURN QUERY SELECT j.job_name,j.business_date,j.scope_key,j.state,j.started_at,j.completed_at,j.result_count
 FROM public.pwa_job_runs j
 WHERE j.business_date>=(clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date-days
 ORDER BY j.business_date DESC,j.job_name,j.scope_key LIMIT 500;
END $$;

-- 5b. One thread of the caller (same JSON as the list), or not_found.
CREATE FUNCTION public.pwa_chat_thread_v1(actor jsonb,id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); value jsonb;
BEGIN
 IF id IS NULL THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 SELECT public.pwa_chat_thread_json_v1(t) INTO value FROM public.pwa_chat_threads t WHERE t.id=$2 AND t.partner_id=partner;
 IF value IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 RETURN value;
END $$;

-- 6. ACLs and comments while the runner owns the new routines, then the owners.
DO $ownership$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; notify_owner text; jobs_owner text;
BEGIN
 notify_owner:='mw_notify_owner_'||suffix; jobs_owner:='mw_jobs_owner_'||suffix;
 REVOKE ALL ON FUNCTION public.pwa_chat_thread_v1(jsonb,uuid) FROM PUBLIC;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent') THEN REVOKE ALL ON FUNCTION public.pwa_chat_thread_v1(jsonb,uuid) FROM mw_integration_agent; END IF;
 COMMENT ON FUNCTION public.pwa_chat_thread_v1(jsonb,uuid) IS 'mw-access:governance fixed chat boundary; explicit capability only';
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_chat_thread_v1(jsonb,uuid) TO %I','mw_chat_api_'||suffix);
 EXECUTE format('ALTER FUNCTION public.pwa_chat_thread_v1(jsonb,uuid) OWNER TO %I','mw_chat_owner_'||suffix);
 REVOKE ALL ON FUNCTION public.pwa_notify_chat_reply_v1(jsonb,uuid,uuid,text) FROM PUBLIC;
 REVOKE ALL ON FUNCTION public.pwa_job_status_v1(integer) FROM PUBLIC;
 -- PROD's R085 default privileges for the agent role reach routines the runner creates in public.
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent') THEN
  REVOKE ALL ON FUNCTION public.pwa_notify_chat_reply_v1(jsonb,uuid,uuid,text) FROM mw_integration_agent;
  REVOKE ALL ON FUNCTION public.pwa_job_status_v1(integer) FROM mw_integration_agent;
 END IF;
 COMMENT ON FUNCTION public.pwa_notify_chat_reply_v1(jsonb,uuid,uuid,text) IS 'mw-access:governance fixed notification boundary; explicit capability only';
 COMMENT ON FUNCTION public.pwa_job_status_v1(integer) IS 'mw-access:governance read-only job status for the chat SQL tool';
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_notify_chat_reply_v1(jsonb,uuid,uuid,text) TO %I','mw_chat_api_'||suffix);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_job_status_v1(integer) TO %I','mw_chat_read_'||suffix);
 EXECUTE format('ALTER FUNCTION public.pwa_notify_chat_reply_v1(jsonb,uuid,uuid,text) OWNER TO %I',notify_owner);
 EXECUTE format('ALTER FUNCTION public.pwa_job_status_v1(integer) OWNER TO %I',jobs_owner);
END $ownership$;

-- 7. Eligibility and content, replaced as the notify owner so owner, ACL and comment are kept.
DO $replace$
DECLARE notify_owner text:='mw_notify_owner_'||CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; switched boolean:=false;
 definition text; old_test text:='AND s.partner_id<>e.actor_partner_id'; found integer;
BEGIN
 IF NOT pg_has_role(current_user,notify_owner,'USAGE') THEN EXECUTE format('SET LOCAL ROLE %I',notify_owner); switched:=true; END IF;
 -- Exact-count replace of the actor test in the current definition (V94 pattern): everything else stays as V88 wrote it.
 definition:=pg_get_functiondef('public.pwa_notify_eligible_v1(uuid,uuid)'::regprocedure);
 found:=(length(definition)-length(replace(definition,old_test,'')))/length(old_test);
 IF found<>1 THEN RAISE EXCEPTION 'V105: % occurrence(s) of the actor test in pwa_notify_eligible_v1, expected 1',found; END IF;
 EXECUTE replace(definition,old_test,$t$AND CASE WHEN e.event_type='chat.reply' THEN s.partner_id=e.actor_partner_id ELSE s.partner_id<>e.actor_partner_id END$t$);
 EXECUTE $create$
CREATE OR REPLACE FUNCTION public.pwa_notify_content_v1(delivery uuid,generation bigint)
RETURNS TABLE(found boolean,event_type text,language text,borrower_name text,amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 RETURN QUERY SELECT src.source_found,
  -- A chat reply carries its outcome ('chat.reply:ok' / 'chat.reply:failed', from source_version 'ok:<message>').
  CASE WHEN e.event_type='chat.reply' THEN 'chat.reply:'||split_part(e.source_version,':',1) ELSE e.event_type END,
  CASE WHEN recipient."Language Preference"='ไทย' THEN 'th' ELSE 'en' END::text,
  -- Chat: the thread title. Thai: the Thai name. English: the English name only ("Description"); none when blank.
  CASE WHEN e.source_kind='chat' THEN src.source_title WHEN recipient."Language Preference"='ไทย' THEN b."Borrower Name" ELSE nullif(btrim(b."Description",E' \t\r\n\f\v'),'') END,
  src.source_amount
 FROM public.pwa_notification_deliveries d JOIN public.pwa_notification_events e ON e.event_id=d.event_id
 LEFT JOIN public."Partners" recipient ON recipient."Row ID"=d.recipient_partner_id
 LEFT JOIN LATERAL (
  SELECT true AS source_found,p."Ref Borrower" AS borrower_id,p."Amount Received"::numeric AS source_amount,NULL::text AS source_title FROM public."Payments" p WHERE e.source_kind='payment' AND p."Row ID"=e.source_id
  UNION ALL
  SELECT true,l."Ref Borrowers",l."Principal Amount"::numeric,NULL::text FROM public."Loans" l WHERE e.source_kind='loan' AND l."Row ID"=e.source_id
  UNION ALL
  SELECT true,NULL::text,NULL::numeric,t.title FROM public.pwa_chat_threads t WHERE e.source_kind='chat' AND t.id::text=e.source_id AND t.partner_id=d.recipient_partner_id
 ) source_row ON true
 CROSS JOIN LATERAL (SELECT coalesce(source_row.source_found,false) AS source_found,source_row.borrower_id,source_row.source_amount,source_row.source_title) src
 LEFT JOIN public."Borrowers" b ON b."Row ID"=src.borrower_id
 WHERE d.delivery_id=$1 AND d.lease_generation=$2 AND d.state='leased' AND d.lease_expires_at>clock_timestamp();
END $$
$create$;
 -- History: the V103 body with the same chat branch, the calling partner as the recipient.
 EXECUTE $create$
CREATE OR REPLACE FUNCTION public.pwa_notify_history_content_v1(actor jsonb,events uuid[])
RETURNS TABLE("eventId" uuid,found boolean,"eventType" text,language text,"borrowerName" text,amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_notify_actor_v1(actor);
BEGIN
 IF events IS NULL OR cardinality(events)>26 THEN RAISE EXCEPTION 'invalid_request'; END IF;
 RETURN QUERY SELECT e.event_id,src.source_found,
  CASE WHEN e.event_type='chat.reply' THEN 'chat.reply:'||split_part(e.source_version,':',1) ELSE e.event_type END,
  CASE WHEN recipient."Language Preference"='ไทย' THEN 'th' ELSE 'en' END::text,
  CASE WHEN e.source_kind='chat' THEN src.source_title WHEN recipient."Language Preference"='ไทย' THEN b."Borrower Name" ELSE nullif(btrim(b."Description",E' \t\r\n\f\v'),'') END,
  src.source_amount
 FROM public.pwa_notification_events e
 LEFT JOIN public."Partners" recipient ON recipient."Row ID"=partner
 LEFT JOIN LATERAL (
  SELECT true AS source_found,p."Ref Borrower" AS borrower_id,p."Amount Received"::numeric AS source_amount,NULL::text AS source_title FROM public."Payments" p WHERE e.source_kind='payment' AND p."Row ID"=e.source_id
  UNION ALL
  SELECT true,l."Ref Borrowers",l."Principal Amount"::numeric,NULL::text FROM public."Loans" l WHERE e.source_kind='loan' AND l."Row ID"=e.source_id
  UNION ALL
  SELECT true,NULL::text,NULL::numeric,t.title FROM public.pwa_chat_threads t WHERE e.source_kind='chat' AND t.id::text=e.source_id AND t.partner_id=partner
 ) source_row ON true
 CROSS JOIN LATERAL (SELECT coalesce(source_row.source_found,false) AS source_found,source_row.borrower_id,source_row.source_amount,source_row.source_title) src
 LEFT JOIN public."Borrowers" b ON b."Row ID"=src.borrower_id
 WHERE e.event_id=ANY(events) AND EXISTS(SELECT 1 FROM public.pwa_notification_deliveries d WHERE d.event_id=e.event_id AND d.recipient_partner_id=partner);
END $$
$create$;
 IF switched THEN RESET ROLE; END IF;
END $replace$;
RESET ROLE;

-- 8. Self-check: owners, definer mode, pinned search_path, comments, exactly the intended grantees and grants.
DO $check$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; notify_owner text; jobs_owner text; api text; reader text; dispatcher text;
BEGIN
 notify_owner:='mw_notify_owner_'||suffix; jobs_owner:='mw_jobs_owner_'||suffix; api:='mw_chat_api_'||suffix; reader:='mw_chat_read_'||suffix; dispatcher:='mw_notify_dispatch_'||suffix;
 IF NOT (SELECT prosecdef AND pg_get_userbyid(proowner)=notify_owner AND 'search_path=pg_catalog, public'=ANY(proconfig) FROM pg_proc WHERE oid='public.pwa_notify_chat_reply_v1(jsonb,uuid,uuid,text)'::regprocedure)
  OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.pwa_notify_chat_reply_v1(jsonb,uuid,uuid,text)'::regprocedure AND a.privilege_type='EXECUTE' AND a.grantee NOT IN (p.proowner,api::regrole))
  OR NOT has_function_privilege(api,'public.pwa_notify_chat_reply_v1(jsonb,uuid,uuid,text)','EXECUTE')
  OR obj_description('public.pwa_notify_chat_reply_v1(jsonb,uuid,uuid,text)'::regprocedure,'pg_proc') IS DISTINCT FROM 'mw-access:governance fixed notification boundary; explicit capability only' THEN
  RAISE EXCEPTION 'V105: pwa_notify_chat_reply_v1 must be the notify owner''s pinned definer executable only by %',api; END IF;
 IF NOT (SELECT prosecdef AND provolatile='s' AND pg_get_userbyid(proowner)=jobs_owner AND 'search_path=pg_catalog, public'=ANY(proconfig) FROM pg_proc WHERE oid='public.pwa_job_status_v1(integer)'::regprocedure)
  OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.pwa_job_status_v1(integer)'::regprocedure AND a.privilege_type='EXECUTE' AND a.grantee NOT IN (p.proowner,reader::regrole))
  OR NOT has_function_privilege(reader,'public.pwa_job_status_v1(integer)','EXECUTE') OR has_table_privilege(reader,'public.pwa_job_runs','SELECT')
  OR obj_description('public.pwa_job_status_v1(integer)'::regprocedure,'pg_proc') IS DISTINCT FROM 'mw-access:governance read-only job status for the chat SQL tool' THEN
  RAISE EXCEPTION 'V105: pwa_job_status_v1 must be the jobs owner''s pinned STABLE definer executable only by %',reader; END IF;
 IF NOT (SELECT prosecdef AND pg_get_userbyid(proowner)='mw_chat_owner_'||suffix AND 'search_path=pg_catalog, public'=ANY(proconfig) FROM pg_proc WHERE oid='public.pwa_chat_thread_v1(jsonb,uuid)'::regprocedure)
  OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.pwa_chat_thread_v1(jsonb,uuid)'::regprocedure AND a.privilege_type='EXECUTE' AND a.grantee NOT IN (p.proowner,api::regrole))
  OR obj_description('public.pwa_chat_thread_v1(jsonb,uuid)'::regprocedure,'pg_proc') IS DISTINCT FROM 'mw-access:governance fixed chat boundary; explicit capability only' THEN
  RAISE EXCEPTION 'V105: pwa_chat_thread_v1 must be the chat owner''s pinned definer executable only by %',api; END IF;
 IF (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE a.attrelid='public.pwa_chat_messages'::regclass AND x.grantee=notify_owner::regrole)
   IS DISTINCT FROM ARRAY['id','thread_id'] OR has_table_privilege(notify_owner,'public.pwa_chat_messages','SELECT') THEN
  RAISE EXCEPTION 'V105: % must read exactly pwa_chat_messages (id, thread_id) by column grant',notify_owner; END IF;
 IF NOT (SELECT bool_and(has_column_privilege(notify_owner,'public.pwa_chat_threads',c,'SELECT')) FROM unnest(ARRAY['id','partner_id','title','status']) c)
  OR (SELECT count(*) FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE a.attrelid='public.pwa_chat_threads'::regclass AND x.grantee=notify_owner::regrole)<>4
  OR has_table_privilege(notify_owner,'public.pwa_chat_threads','SELECT') THEN
  RAISE EXCEPTION 'V105: % must read exactly pwa_chat_threads (id, partner_id, title, status) by column grant',notify_owner; END IF;
 IF NOT (SELECT prosecdef AND pg_get_userbyid(proowner)=notify_owner AND 'search_path=pg_catalog, public'=ANY(proconfig) AND prosrc LIKE '%pwa_chat_threads%' FROM pg_proc WHERE oid='public.pwa_notify_content_v1(uuid,bigint)'::regprocedure)
  OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.pwa_notify_content_v1(uuid,bigint)'::regprocedure AND a.privilege_type='EXECUTE' AND a.grantee NOT IN (p.proowner,dispatcher::regrole))
  OR NOT (SELECT pg_get_userbyid(proowner)=notify_owner AND prosrc LIKE '%chat.reply%' FROM pg_proc WHERE oid='public.pwa_notify_eligible_v1(uuid,uuid)'::regprocedure)
  OR NOT (SELECT prosecdef AND pg_get_userbyid(proowner)=notify_owner AND 'search_path=pg_catalog, public'=ANY(proconfig) AND prosrc LIKE '%pwa_chat_threads%' FROM pg_proc WHERE oid='public.pwa_notify_history_content_v1(jsonb,uuid[])'::regprocedure)
  OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.pwa_notify_history_content_v1(jsonb,uuid[])'::regprocedure AND a.privilege_type='EXECUTE' AND a.grantee NOT IN (p.proowner,('mw_notify_api_'||suffix)::regrole)) THEN
  RAISE EXCEPTION 'V105: content, history content and eligibility must stay the notify owner''s routines with their V88/V100/V103 ACLs'; END IF;
 IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.pwa_notification_events'::regclass AND conname='pwa_notification_events_event_type_check') NOT LIKE '%chat.reply%'
  OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.pwa_notification_events'::regclass AND contype='c' AND pg_get_constraintdef(oid) ~ '(event_type|source_kind)' AND pg_get_constraintdef(oid) !~ 'length')<>2 THEN
  RAISE EXCEPTION 'V105: pwa_notification_events must carry exactly the widened event_type and source_kind checks'; END IF;
END $check$;
