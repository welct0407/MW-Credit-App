-- R090 batch 2c (Archie's design D1-D7; owner approval of 23 October 2026 for the one new column): the asking device
-- reports leaving a running chat turn, and the completion reads that report inside its own transaction. Cloud Run's
-- HTTP/1.1 front end never propagated the client's close to the container, so the V105 rule "the stream is gone"
-- could not fire; the PWA now sends a hidden beacon, stored on the user row.
-- 1. pwa_chat_messages.detached_at timestamptz (nullable, user rows only: CHECK (role='user' OR detached_at IS NULL)).
-- 2. pwa_chat_immutable_v1: a user row may change claimed_at and detached_at (was claimed_at only); everything else
--    stays append-only. Replaced as the chat owner from its current text (exact-count replace, V94 pattern).
-- 3. pwa_chat_turn_begin_v1: a (re-)claim of a stale turn resets detached_at (a new row starts with NULL).
-- 4. pwa_chat_turn_complete_v1: locks the user row FOR UPDATE after the thread and returns the reply JSON plus
--    "detached" (the row's detached_at at commit time). The service records the chat.reply event only when detached
--    is true and the request was a stream.
-- 5. pwa_chat_turn_presence_v1(actor, thread, message, state): 'hidden' sets detached_at, 'visible' clears it, both
--    idempotent; another Partner's (or an unknown) message raises not_found/42501; an unclaimed row answers
--    {state:'idle'}, an answered one {state:'completed'}, both without a change. Owned by mw_chat_owner_<env>,
--    SECURITY DEFINER, executable only by mw_chat_api_<env>, like the V104 RPCs.
-- No notification routine, other table or business row changes; the integrity triggers stay enabled.
-- On Cloud SQL the runner is not a superuser: temporary authority on mw_chat_owner_<env> only
-- (owner-authority-cli.mjs prepare --owner mw_chat_owner_<env>, then restore); the preflight names every missing
-- authority first.

-- 1. Preflight. Fails closed with the complete list of problems.
DO $preflight$
DECLARE suffix text; chat_owner text; role_name text; signature text; problems text[]:='{}';
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 chat_owner:='mw_chat_owner_'||suffix;
 FOREACH role_name IN ARRAY ARRAY[chat_owner,'mw_chat_api_'||suffix] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) THEN
   problems:=problems||format('role %s is missing or unsafe',role_name); END IF;
 END LOOP;
 IF to_regclass('public.pwa_chat_messages') IS NULL THEN
  problems:=problems||'V104 table pwa_chat_messages is missing'::text;
 ELSE
  IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.pwa_chat_messages'::regclass)<>chat_owner THEN problems:=problems||format('pwa_chat_messages is not owned by %s',chat_owner); END IF;
  IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.pwa_chat_messages'::regclass AND attname='detached_at') THEN problems:=problems||'pwa_chat_messages.detached_at already exists'::text; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.pwa_chat_messages'::regclass AND tgname='pwa_chat_messages_guard' AND tgenabled='O') THEN
   problems:=problems||'trigger pwa_chat_messages_guard is missing or not enabled'::text; END IF;
 END IF;
 FOREACH signature IN ARRAY ARRAY['public.pwa_chat_immutable_v1()','public.pwa_chat_turn_begin_v1(jsonb,uuid,jsonb)','public.pwa_chat_turn_complete_v1(jsonb,uuid,jsonb,jsonb,jsonb)','public.pwa_chat_thread_v1(jsonb,uuid)'] LOOP
  IF to_regprocedure(signature) IS NULL THEN problems:=problems||format('%s is missing (V104/V105 first)',signature);
  ELSIF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure(signature))<>chat_owner THEN problems:=problems||format('%s is not owned by %s',signature,chat_owner); END IF;
 END LOOP;
 IF to_regprocedure('public.pwa_chat_turn_presence_v1(jsonb,uuid,uuid,text)') IS NOT NULL THEN problems:=problems||'pwa_chat_turn_presence_v1 already exists'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  IF NOT has_schema_privilege(current_user,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public',current_user); END IF;
  -- ALTER TABLE, CREATE OR REPLACE and ALTER FUNCTION ... OWNER run as an inheriting member or under SET ROLE, and
  -- need CREATE on public for the owner.
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=chat_owner) THEN
   IF NOT pg_has_role(current_user,chat_owner,'SET') THEN problems:=problems||format('%s cannot SET ROLE %s (temporary maintenance membership required)',current_user,chat_owner); END IF;
   IF NOT has_schema_privilege(chat_owner,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public (grant temporarily)',chat_owner); END IF;
  END IF;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V106 preflight: %', array_to_string(problems,'; '); END IF;
END $preflight$;

-- 2. The column, the widened immutability rule, the claim reset and the completion's detached flag (as the chat owner,
-- so owners, ACLs and comments of the replaced routines are kept).
DO $chat$
DECLARE chat_owner text:='mw_chat_owner_'||CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; switched boolean:=false;
 site record; definition text; found integer;
BEGIN
 IF NOT pg_has_role(current_user,chat_owner,'USAGE') THEN EXECUTE format('SET LOCAL ROLE %I',chat_owner); switched:=true; END IF;
 ALTER TABLE public.pwa_chat_messages ADD COLUMN detached_at timestamptz;
 ALTER TABLE public.pwa_chat_messages ADD CONSTRAINT pwa_chat_messages_detached_check CHECK (role='user' OR detached_at IS NULL);
 COMMENT ON COLUMN public.pwa_chat_messages.detached_at IS 'When the asking device left the running turn (hidden beacon); user rows only, cleared on return and on re-claim';
 -- Exact-count replace of the current definitions (V94 pattern): everything else stays as V104 wrote it.
 FOR site IN SELECT * FROM (VALUES
  ('public.pwa_chat_immutable_v1()',
   $o$(to_jsonb(NEW)-'claimed_at')=(to_jsonb(OLD)-'claimed_at')$o$,
   $n$(to_jsonb(NEW)-'claimed_at'-'detached_at')=(to_jsonb(OLD)-'claimed_at'-'detached_at')$n$),
  ('public.pwa_chat_turn_begin_v1(jsonb,uuid,jsonb)',
   $o$SET claimed_at=clock_timestamp() WHERE m.id=u.id$o$,
   $n$SET claimed_at=clock_timestamp(),detached_at=NULL WHERE m.id=u.id$n$),
  ('public.pwa_chat_turn_complete_v1(jsonb,uuid,jsonb,jsonb,jsonb)',
   $o$SELECT * INTO t FROM public.pwa_chat_threads x WHERE x.id=u.thread_id FOR UPDATE;$o$,
   -- Thread first, then the user row (turn_begin's order): a presence beacon either committed before this lock (and
   -- is read here) or waits and then finds the reply.
   $n$SELECT * INTO t FROM public.pwa_chat_threads x WHERE x.id=u.thread_id FOR UPDATE;
 SELECT m.* INTO u FROM public.pwa_chat_messages m WHERE m.id=u.id FOR UPDATE;$n$),
  ('public.pwa_chat_turn_complete_v1(jsonb,uuid,jsonb,jsonb,jsonb)',
   $o$RETURN public.pwa_chat_message_json_v1(a);$o$,
   $n$RETURN public.pwa_chat_message_json_v1(a)||jsonb_build_object('detached',u.detached_at IS NOT NULL);$n$)
 ) AS s(f,old_text,new_text) LOOP
  definition:=pg_get_functiondef(site.f::regprocedure);
  found:=(length(definition)-length(replace(definition,site.old_text,'')))/length(site.old_text);
  IF found<>1 THEN RAISE EXCEPTION 'V106: % occurrence(s) of the replaced text in %, expected 1',found,site.f; END IF;
  EXECUTE replace(definition,site.old_text,site.new_text);
 END LOOP;
 IF switched THEN RESET ROLE; END IF;
END $chat$;
RESET ROLE;

-- 3. Presence of the asking device for one running turn. Returns {state:'claimed', detached} after the change, or
-- {state:'idle'|'completed'} without one.
CREATE FUNCTION public.pwa_chat_turn_presence_v1(actor jsonb,thread uuid,message uuid,state text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); u public.pwa_chat_messages;
BEGIN
 IF thread IS NULL OR message IS NULL OR state IS NULL OR state NOT IN ('hidden','visible') THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 -- The user row is locked like the completion locks it: whichever runs second sees the other's result.
 SELECT m.* INTO u FROM public.pwa_chat_messages m JOIN public.pwa_chat_threads t ON t.id=m.thread_id
 WHERE m.id=message AND m.thread_id=thread AND t.partner_id=partner FOR UPDATE OF m;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='42501'; END IF;
 IF u.role<>'user' THEN RETURN jsonb_build_object('state','idle'); END IF;
 IF EXISTS(SELECT 1 FROM public.pwa_chat_messages m WHERE m.thread_id=u.thread_id AND m.seq=u.seq+1 AND m.role='assistant') THEN
  RETURN jsonb_build_object('state','completed'); END IF;
 IF u.claimed_at IS NULL THEN RETURN jsonb_build_object('state','idle'); END IF;
 IF state='hidden' AND u.detached_at IS NULL THEN
  UPDATE public.pwa_chat_messages m SET detached_at=clock_timestamp() WHERE m.id=u.id RETURNING * INTO u;
 ELSIF state='visible' AND u.detached_at IS NOT NULL THEN
  UPDATE public.pwa_chat_messages m SET detached_at=NULL WHERE m.id=u.id RETURNING * INTO u;
 END IF;
 RETURN jsonb_build_object('state','claimed','detached',u.detached_at IS NOT NULL);
END $$;

-- 4. ACL and comment while the runner owns the new routine, then the owner.
DO $ownership$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
BEGIN
 REVOKE ALL ON FUNCTION public.pwa_chat_turn_presence_v1(jsonb,uuid,uuid,text) FROM PUBLIC;
 -- PROD's R085 default privileges for the agent role reach routines the runner creates in public.
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent') THEN REVOKE ALL ON FUNCTION public.pwa_chat_turn_presence_v1(jsonb,uuid,uuid,text) FROM mw_integration_agent; END IF;
 COMMENT ON FUNCTION public.pwa_chat_turn_presence_v1(jsonb,uuid,uuid,text) IS 'mw-access:governance fixed chat boundary; explicit capability only';
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_chat_turn_presence_v1(jsonb,uuid,uuid,text) TO %I','mw_chat_api_'||suffix);
 EXECUTE format('ALTER FUNCTION public.pwa_chat_turn_presence_v1(jsonb,uuid,uuid,text) OWNER TO %I','mw_chat_owner_'||suffix);
END $ownership$;

-- 5. Self-check: the column and its CHECK, the replaced texts, enabled guards, and every chat routine the chat owner's
-- pinned function with the boundary comment, definers executable only by the API role (V104 rule, now 15 routines).
DO $check$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; chat_owner text; api text; bad text;
BEGIN
 chat_owner:='mw_chat_owner_'||suffix;api:='mw_chat_api_'||suffix;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.pwa_chat_messages'::regclass AND attname='detached_at' AND atttypid='timestamptz'::regtype AND NOT attnotnull AND NOT attisdropped AND attacl IS NULL)
  OR (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.pwa_chat_messages'::regclass AND conname='pwa_chat_messages_detached_check')
   IS DISTINCT FROM 'CHECK (((role = ''user''::text) OR (detached_at IS NULL)))' THEN
  RAISE EXCEPTION 'V106: pwa_chat_messages.detached_at must be a nullable, ungranted timestamptz limited to user rows'; END IF;
 IF (SELECT prosrc FROM pg_proc WHERE oid='public.pwa_chat_immutable_v1()'::regprocedure) NOT LIKE '%-''claimed_at''-''detached_at'')=(to_jsonb(OLD)-''claimed_at''-''detached_at'')%'
  OR (SELECT prosrc FROM pg_proc WHERE oid='public.pwa_chat_turn_begin_v1(jsonb,uuid,jsonb)'::regprocedure) NOT LIKE '%claimed_at=clock_timestamp(),detached_at=NULL%'
  OR (SELECT prosrc FROM pg_proc WHERE oid='public.pwa_chat_turn_complete_v1(jsonb,uuid,jsonb,jsonb,jsonb)'::regprocedure) NOT LIKE '%''detached'',u.detached_at IS NOT NULL%' THEN
  RAISE EXCEPTION 'V106: the immutability, claim and completion routines must carry the detached_at changes'; END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.pwa_chat_messages'::regclass AND tgname IN ('pwa_chat_messages_guard','pwa_chat_messages_truncate') AND tgenabled='O'
   AND tgfoid='public.pwa_chat_immutable_v1()'::regprocedure)<>2 THEN
  RAISE EXCEPTION 'V106: the pwa_chat_messages guard triggers must stay enabled on pwa_chat_immutable_v1'; END IF;
 SELECT string_agg(p.oid::regprocedure::text,', ') INTO bad FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'pwa\_chat\_%'
  AND (pg_get_userbyid(p.proowner)<>chat_owner OR NOT ('search_path=pg_catalog, public'=ANY(p.proconfig))
   OR (p.proname IN ('pwa_chat_models_default_v1','pwa_chat_threads_v1','pwa_chat_thread_create_v1','pwa_chat_thread_update_v1','pwa_chat_messages_v1','pwa_chat_message_v1',
    'pwa_chat_turn_begin_v1','pwa_chat_turn_complete_v1','pwa_chat_thread_v1','pwa_chat_turn_presence_v1'))<>p.prosecdef
   OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM 'mw-access:governance fixed chat boundary; explicit capability only'
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' AND a.grantee<>p.proowner
    AND NOT (a.grantee=api::regrole AND p.prosecdef)));
 IF bad IS NOT NULL OR (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'pwa\_chat\_%')<>15
  OR NOT has_function_privilege(api,'public.pwa_chat_turn_presence_v1(jsonb,uuid,uuid,text)','EXECUTE') THEN
  RAISE EXCEPTION 'V106: chat routines must be the chat owner''s pinned functions, definers executable only by %: %',api,coalesce(bad,'count or presence grant'); END IF;
 SELECT string_agg(c.relname,', ') INTO bad FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname LIKE 'pwa\_chat\_%' AND c.relkind='r'
  AND (pg_get_userbyid(c.relowner)<>chat_owner OR EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner));
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V106: chat tables must be owned by % with no other table grant: %',chat_owner,bad; END IF;
END $check$;
