-- R102 (27 October 2026): the in-app chat may store threads on Claude models served through the VM chat relay
-- (services/chat/claude.mjs). V104 limited the thread model to gemini-* in three places; each now also accepts
-- claude-<family>-<major>[-<minor>] (claude-opus-5-5), the same pattern as services/chat/config.mjs MODEL_ID and the
-- Terraform chat_models validation. Date-suffixed ids (claude-opus-5-5-20260401) stay refused.
-- 1. pwa_chat_threads.model: the CHECK pwa_chat_threads_model_check is replaced (same name, same 64-character bound).
-- 2. pwa_chat_thread_create_v1 and pwa_chat_thread_update_v1: the model regex is replaced in place, as the chat owner,
--    from the current definitions (exact-count replace, V94/V106 pattern), so owners, ACLs and comments are kept.
-- No new table or column, no grant, data or trigger change; existing rows (all gemini-*) satisfy the new CHECK.
-- On Cloud SQL the runner is not a superuser: temporary authority on mw_chat_owner_<env> only
-- (owner-authority-cli.mjs prepare --owner mw_chat_owner_<env>, then restore); the preflight names every missing
-- authority first. Rollback: a later migration restores the gemini-only pattern once no claude-* thread exists.

-- 1. Preflight. Fails closed with the complete list of problems.
DO $preflight$
DECLARE suffix text; chat_owner text; signature text; problems text[]:='{}';
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 chat_owner:='mw_chat_owner_'||suffix;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=chat_owner AND NOT rolcanlogin AND NOT rolsuper) THEN problems:=problems||format('role %s is missing or unsafe',chat_owner); END IF;
 IF to_regclass('public.pwa_chat_threads') IS NULL THEN problems:=problems||'V104 table pwa_chat_threads is missing'::text;
 ELSE
  IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.pwa_chat_threads'::regclass)<>chat_owner THEN problems:=problems||format('pwa_chat_threads is not owned by %s',chat_owner); END IF;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.pwa_chat_threads'::regclass AND conname='pwa_chat_threads_model_check')
   IS DISTINCT FROM 'CHECK (((model ~ ''^gemini-[0-9]+(\.[0-9]+)?-[a-z0-9-]+$''::text) AND (length(model) <= 64)))' THEN
   problems:=problems||'pwa_chat_threads_model_check is not the V104 definition'::text; END IF;
 END IF;
 FOREACH signature IN ARRAY ARRAY['public.pwa_chat_thread_create_v1(jsonb,jsonb)','public.pwa_chat_thread_update_v1(jsonb,uuid,jsonb)'] LOOP
  IF to_regprocedure(signature) IS NULL THEN problems:=problems||format('%s is missing (V104 first)',signature);
  ELSIF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure(signature))<>chat_owner THEN problems:=problems||format('%s is not owned by %s',signature,chat_owner); END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname=chat_owner) THEN
  IF NOT pg_has_role(current_user,chat_owner,'SET') THEN problems:=problems||format('%s cannot SET ROLE %s (temporary maintenance membership required)',current_user,chat_owner); END IF;
  IF NOT has_schema_privilege(chat_owner,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public (grant temporarily)',chat_owner); END IF;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V115 preflight: %', array_to_string(problems,'; '); END IF;
END $preflight$;

-- 2. The widened CHECK and the two RPC patterns, as the chat owner.
DO $chat$
DECLARE chat_owner text:='mw_chat_owner_'||CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; switched boolean:=false;
 old_pattern text:='''^gemini-[0-9]+(\.[0-9]+)?-[a-z0-9-]+$''';
 new_pattern text:='''^(gemini-[0-9]+(\.[0-9]+)?-[a-z0-9-]+|claude-[a-z]+-[0-9]+(-[0-9]+)?)$''';
 f text; definition text; found integer;
BEGIN
 IF NOT pg_has_role(current_user,chat_owner,'USAGE') THEN EXECUTE format('SET LOCAL ROLE %I',chat_owner); switched:=true; END IF;
 ALTER TABLE public.pwa_chat_threads DROP CONSTRAINT pwa_chat_threads_model_check;
 EXECUTE format('ALTER TABLE public.pwa_chat_threads ADD CONSTRAINT pwa_chat_threads_model_check CHECK (model ~ %s AND length(model)<=64)',new_pattern);
 FOREACH f IN ARRAY ARRAY['public.pwa_chat_thread_create_v1(jsonb,jsonb)','public.pwa_chat_thread_update_v1(jsonb,uuid,jsonb)'] LOOP
  definition:=pg_get_functiondef(f::regprocedure);
  found:=(length(definition)-length(replace(definition,old_pattern,'')))/length(old_pattern);
  IF found<>1 THEN RAISE EXCEPTION 'V115: % occurrence(s) of the model pattern in %, expected 1',found,f; END IF;
  EXECUTE replace(definition,old_pattern,new_pattern);
 END LOOP;
 IF switched THEN RESET ROLE; END IF;
END $chat$;
RESET ROLE;

-- 3. Self-check: the CHECK and both routines carry the new pattern; owners, definer flags, pinned search_path,
-- comments and the API-only EXECUTE are unchanged.
DO $check$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; chat_owner text; api text; bad text;
BEGIN
 chat_owner:='mw_chat_owner_'||suffix;api:='mw_chat_api_'||suffix;
 IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.pwa_chat_threads'::regclass AND conname='pwa_chat_threads_model_check')
  IS DISTINCT FROM 'CHECK (((model ~ ''^(gemini-[0-9]+(\.[0-9]+)?-[a-z0-9-]+|claude-[a-z]+-[0-9]+(-[0-9]+)?)$''::text) AND (length(model) <= 64)))' THEN
  RAISE EXCEPTION 'V115: pwa_chat_threads_model_check must accept gemini-* and claude-* model ids'; END IF;
 SELECT string_agg(p.oid::regprocedure::text,', ') INTO bad FROM pg_proc p
 WHERE p.oid IN ('public.pwa_chat_thread_create_v1(jsonb,jsonb)'::regprocedure,'public.pwa_chat_thread_update_v1(jsonb,uuid,jsonb)'::regprocedure)
  -- strpos, not LIKE: the pattern holds a backslash, LIKE's escape character.
  AND (strpos(p.prosrc,'''^(gemini-[0-9]+(\.[0-9]+)?-[a-z0-9-]+|claude-[a-z]+-[0-9]+(-[0-9]+)?)$''')=0 OR strpos(p.prosrc,'''^gemini-')>0
   OR pg_get_userbyid(p.proowner)<>chat_owner OR NOT p.prosecdef OR NOT ('search_path=pg_catalog, public'=ANY(p.proconfig))
   OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM 'mw-access:governance fixed chat boundary; explicit capability only'
   OR NOT has_function_privilege(api,p.oid,'EXECUTE')
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' AND a.grantee<>p.proowner AND a.grantee<>api::regrole));
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V115: replaced chat routines drifted: %',bad; END IF;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'pwa\_chat\_%')<>15 THEN
  RAISE EXCEPTION 'V115: the chat routine count changed'; END IF;
END $check$;
