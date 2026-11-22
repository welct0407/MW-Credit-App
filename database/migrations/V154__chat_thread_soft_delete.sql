-- R182 (22 November 2026, owner request: "Delete" in the chat thread list): a chat thread can be deleted from the app.
-- Soft delete only: the V104 triggers refuse DELETE and TRUNCATE on the chat journal, and proposals, history, tool calls
-- and notification events reference the thread, so the row stays and its status becomes 'deleted'. updated_at is the
-- deletion time. No new table, column, function, grant, role, trigger or data change; existing rows satisfy the CHECK.
-- 1. pwa_chat_threads.status: the CHECK pwa_chat_threads_status_check is replaced (same name) and accepts 'deleted'.
-- 2. Six RPCs are patched in place, as the chat owner, from their current definitions (exact-count replace, V115
--    pattern), so owners, ACLs, security, configuration and comments are kept:
--    pwa_chat_thread_update_v1(jsonb,uuid,jsonb): accepts {"status":"deleted"} only as the sole key. It locks the
--     thread row first. A deleted thread answers a repeated delete unchanged (idempotent) and not_found (P0002) to any
--     other patch, so it cannot be restored. A delete is refused with turn_in_progress (55006) while a turn claim is
--     under 5 minutes old; it cancels the thread's pending proposals (pwa_chat_proposal_cancel_v1(...,NULL,
--     'superseded')) and is then refused with proposal_executing (55006) when a proposal of the thread is executing or
--     unknown (its card is how an unknown outcome is reconciled; the refusal rolls the cancellation back). The check
--     runs after the cancellation on purpose: a confirm that claimed a pending line first holds its row lock, the
--     cancellation waits for it, and the check then sees the claimed line.
--    pwa_chat_thread_v1(jsonb,uuid), pwa_chat_messages_v1(jsonb,uuid,integer,integer),
--     pwa_chat_message_v1(jsonb,uuid,uuid) and pwa_chat_turn_begin_v1(jsonb,uuid,jsonb): a deleted thread is
--     not_found (P0002) on every read path and for a new or repeated turn.
--    pwa_chat_models_default_v1(jsonb): deleted threads are ignored when choosing the default model (updated_at is
--     now also the deletion time, so deleting an old chat must not change the model of the next new chat).
-- Unchanged: pwa_chat_threads_v1 (it lists 'active' or 'archived' only, so a deleted thread is on neither list), every
-- other chat routine, the notification history text and the V108 monitoring reads.
-- Known and accepted: a turn that runs past its 5-minute claim can still commit its reply into a deleted thread; the
-- reply stays unreachable through the thread and message reads. The proposal read, claim, settle and cancel routines,
-- turn presence, the reply notification and an idempotent create with a deleted id still find the row (only terminal
-- proposals remain on it).
-- On Cloud SQL the runner is not a superuser: temporary authority on mw_chat_owner_<env> only
-- (owner-authority-cli.mjs prepare --owner mw_chat_owner_<env>, then restore); the preflight names every missing
-- authority first. Rollback: the service build before this change (it never sends 'deleted'); a later migration
-- restores the two-value CHECK once no deleted thread exists, or keeps the rows hidden.

-- The exact fragments replaced (old) and their replacements (new); the preflight, the patch and the self-check share them.
CREATE TEMP TABLE v154_patch(signature text NOT NULL,step integer NOT NULL,old text NOT NULL,new text NOT NULL,PRIMARY KEY(signature,step)) ON COMMIT DROP;
INSERT INTO v154_patch VALUES
('public.pwa_chat_thread_v1(jsonb,uuid)',1,
 $old$FROM public.pwa_chat_threads t WHERE t.id=$2 AND t.partner_id=partner;$old$,
 $new$FROM public.pwa_chat_threads t WHERE t.id=$2 AND t.partner_id=partner AND t.status<>'deleted';$new$),
('public.pwa_chat_messages_v1(jsonb,uuid,integer,integer)',1,
 $old$FROM public.pwa_chat_threads t WHERE t.id=thread AND t.partner_id=partner) THEN$old$,
 $new$FROM public.pwa_chat_threads t WHERE t.id=thread AND t.partner_id=partner AND t.status<>'deleted') THEN$new$),
('public.pwa_chat_message_v1(jsonb,uuid,uuid)',1,
 $old$WHERE m.id=message AND m.thread_id=thread AND m.role='user' AND t.partner_id=partner;$old$,
 $new$WHERE m.id=message AND m.thread_id=thread AND m.role='user' AND t.partner_id=partner AND t.status<>'deleted';$new$),
('public.pwa_chat_models_default_v1(jsonb)',1,
 $old$FROM public.pwa_chat_threads t WHERE t.partner_id=partner ORDER BY t.updated_at DESC,t.id DESC LIMIT 1$old$,
 $new$FROM public.pwa_chat_threads t WHERE t.partner_id=partner AND t.status<>'deleted' ORDER BY t.updated_at DESC,t.id DESC LIMIT 1$new$),
('public.pwa_chat_turn_begin_v1(jsonb,uuid,jsonb)',1,
 $old$FROM public.pwa_chat_threads x WHERE x.id=thread AND x.partner_id=partner FOR UPDATE;$old$,
 $new$FROM public.pwa_chat_threads x WHERE x.id=thread AND x.partner_id=partner AND x.status<>'deleted' FOR UPDATE;$new$),
('public.pwa_chat_thread_update_v1(jsonb,uuid,jsonb)',1,
 $old$patch->>'status' NOT IN ('active','archived'))) THEN$old$,
 $new$patch->>'status' NOT IN ('active','archived','deleted')
   OR (patch->>'status'='deleted' AND (SELECT count(*) FROM jsonb_object_keys(patch))<>1))) THEN$new$),
('public.pwa_chat_thread_update_v1(jsonb,uuid,jsonb)',2,
 $old$ UPDATE public.pwa_chat_threads t SET title=$old$,
 $new$ -- V154 (R182): soft delete. The row is locked first; a deleted thread is gone for every patch but a repeated delete.
 SELECT * INTO row_value FROM public.pwa_chat_threads t WHERE t.id=$2 AND t.partner_id=partner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 IF row_value.status='deleted' THEN
  IF patch->>'status' IS DISTINCT FROM 'deleted' THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
  RETURN public.pwa_chat_thread_json_v1(row_value);
 END IF;
 IF patch->>'status'='deleted' THEN
  IF EXISTS(SELECT 1 FROM public.pwa_chat_messages m WHERE m.thread_id=row_value.id AND m.role='user' AND m.claimed_at>clock_timestamp()-interval '5 minutes') THEN
   RAISE EXCEPTION 'turn_in_progress' USING ERRCODE='55006'; END IF;
  -- Pending proposals are cancelled first: a concurrent confirm that claimed one holds its row lock, so the check
  -- below runs after that claim is visible. An executing or unknown one keeps the thread (its card reconciles it).
  PERFORM public.pwa_chat_proposal_cancel_v1(actor,row_value.id,NULL,'superseded');
  IF EXISTS(SELECT 1 FROM public.pwa_chat_proposals x WHERE x.thread_id=row_value.id AND x.state IN ('executing','unknown')) THEN
   RAISE EXCEPTION 'proposal_executing' USING ERRCODE='55006'; END IF;
 END IF;
 UPDATE public.pwa_chat_threads t SET title=$new$);

-- 1. Preflight. Fails closed with the complete list of problems.
DO $preflight$
DECLARE suffix text; chat_owner text; item record; definition text; found integer; problems text[]:='{}';
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 chat_owner:='mw_chat_owner_'||suffix;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=chat_owner AND NOT rolcanlogin AND NOT rolsuper) THEN problems:=problems||format('role %s is missing or unsafe',chat_owner); END IF;
 IF to_regclass('public.pwa_chat_threads') IS NULL THEN problems:=problems||'V104 table pwa_chat_threads is missing'::text;
 ELSE
  IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.pwa_chat_threads'::regclass)<>chat_owner THEN problems:=problems||format('pwa_chat_threads is not owned by %s',chat_owner); END IF;
  -- The constraint name is PostgreSQL's default for the V104 column CHECK; name and definition are both asserted.
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.pwa_chat_threads'::regclass AND conname='pwa_chat_threads_status_check')
   IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''active''::text, ''archived''::text])))' THEN
   problems:=problems||'pwa_chat_threads_status_check is not the V104 definition'::text; END IF;
  IF (SELECT count(*) FROM pg_constraint c WHERE c.conrelid='public.pwa_chat_threads'::regclass AND c.contype='c'
   AND EXISTS(SELECT 1 FROM unnest(c.conkey) k JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k WHERE a.attname='status'))<>1 THEN
   problems:=problems||'pwa_chat_threads must carry exactly one CHECK on status'::text; END IF;
 END IF;
 IF to_regprocedure('public.pwa_chat_proposal_cancel_v1(jsonb,uuid,uuid,text)') IS NULL THEN problems:=problems||'pwa_chat_proposal_cancel_v1 is missing (V118 first)'::text; END IF;
 FOR item IN SELECT signature,step,old FROM v154_patch ORDER BY signature,step LOOP
  IF to_regprocedure(item.signature) IS NULL THEN problems:=problems||format('%s is missing (V104/V105 first)',item.signature);
  ELSE
   IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure(item.signature))<>chat_owner THEN problems:=problems||format('%s is not owned by %s',item.signature,chat_owner); END IF;
   definition:=pg_get_functiondef(to_regprocedure(item.signature));
   found:=(length(definition)-length(replace(definition,item.old,'')))/length(item.old);
   IF found<>1 THEN problems:=problems||format('%s: %s occurrence(s) of patch %s, expected 1',item.signature,found,item.step); END IF;
   IF strpos(definition,'''deleted''')>0 THEN problems:=problems||format('%s already mentions deleted',item.signature); END IF;
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname=chat_owner) THEN
  IF NOT pg_has_role(current_user,chat_owner,'SET') THEN problems:=problems||format('%s cannot SET ROLE %s (temporary maintenance membership required)',current_user,chat_owner); END IF;
  IF NOT has_schema_privilege(chat_owner,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public (grant temporarily)',chat_owner); END IF;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V154 preflight: %', array_to_string(problems,'; '); END IF;
END $preflight$;

-- Every chat routine before the change (the self-check compares everything but the six patched bodies).
CREATE TEMP TABLE v154_routine ON COMMIT DROP AS
 SELECT p.oid,p.oid::regprocedure::text AS signature,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl,acldefault('f',p.proowner))::text AS effective,p.prosecdef AS definer,
  p.provolatile AS volatile,p.proconfig AS config,obj_description(p.oid,'pg_proc') AS comment,p.prosrc AS body
 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'pwa\_chat\_%';

-- 2. The widened CHECK and the six patched RPCs, as the chat owner.
DO $chat$
DECLARE chat_owner text:='mw_chat_owner_'||CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; switched boolean:=false;
 patches jsonb; f text; item jsonb; definition text; found integer;
BEGIN
 -- The patch table is the runner's temporary table: it is read before the role changes.
 SELECT jsonb_agg(to_jsonb(x) ORDER BY x.signature,x.step) INTO patches FROM v154_patch x;
 IF NOT pg_has_role(current_user,chat_owner,'USAGE') THEN EXECUTE format('SET LOCAL ROLE %I',chat_owner); switched:=true; END IF;
 ALTER TABLE public.pwa_chat_threads DROP CONSTRAINT pwa_chat_threads_status_check;
 ALTER TABLE public.pwa_chat_threads ADD CONSTRAINT pwa_chat_threads_status_check CHECK (status IN ('active','archived','deleted'));
 FOR f IN SELECT DISTINCT value->>'signature' FROM jsonb_array_elements(patches) ORDER BY 1 LOOP
  definition:=pg_get_functiondef(f::regprocedure);
  FOR item IN SELECT value FROM jsonb_array_elements(patches) WITH ORDINALITY WHERE value->>'signature'=f ORDER BY ordinality LOOP
   found:=(length(definition)-length(replace(definition,item->>'old','')))/length(item->>'old');
   IF found<>1 THEN RAISE EXCEPTION 'V154: % occurrence(s) of patch % in %, expected 1',found,item->>'step',f; END IF;
   definition:=replace(definition,item->>'old',item->>'new');
  END LOOP;
  EXECUTE definition;
 END LOOP;
 IF switched THEN RESET ROLE; END IF;
END $chat$;
RESET ROLE;

-- 3. Self-check: the CHECK accepts the three values; the six routines carry exactly their patches and nothing else
-- changed (the body equals the old body with the fragments replaced); every chat routine keeps owner, ACL, security,
-- volatility, configuration and comment, and no routine was added or dropped (V141 rule: 22 routines, 15 API RPCs).
DO $check$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; api text; bad text;
BEGIN
 api:='mw_chat_api_'||suffix;
 IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.pwa_chat_threads'::regclass AND conname='pwa_chat_threads_status_check')
  IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''active''::text, ''archived''::text, ''deleted''::text])))' THEN
  RAISE EXCEPTION 'V154: pwa_chat_threads_status_check must accept active, archived and deleted'; END IF;
 SELECT string_agg(coalesce(o.signature,p.oid::regprocedure::text),', ') INTO bad
 FROM (SELECT * FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'pwa\_chat\_%') p FULL JOIN v154_routine o ON o.oid=p.oid
 WHERE p.oid IS NULL OR o.oid IS NULL OR o.owner IS DISTINCT FROM pg_get_userbyid(p.proowner) OR o.effective IS DISTINCT FROM coalesce(p.proacl,acldefault('f',p.proowner))::text
  OR o.definer IS DISTINCT FROM p.prosecdef OR o.volatile IS DISTINCT FROM p.provolatile OR o.config IS DISTINCT FROM p.proconfig
  OR o.comment IS DISTINCT FROM obj_description(p.oid,'pg_proc')
  OR p.prosrc IS DISTINCT FROM coalesce((SELECT replace(replace(o.body,a.old,a.new),coalesce(b.old,''),coalesce(b.new,''))
    FROM v154_patch a LEFT JOIN v154_patch b ON b.signature=a.signature AND b.step=2 WHERE to_regprocedure(a.signature)=o.oid AND a.step=1),o.body);
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V154: chat routines drifted: %',bad; END IF;
 IF (SELECT count(*) FROM pg_proc p JOIN v154_patch a ON to_regprocedure(a.signature)=p.oid AND a.step=1 WHERE strpos(p.prosrc,'''deleted''')>0)<>6
  OR (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'pwa\_chat\_%')<>22
  OR (SELECT count(*) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'pwa\_chat\_%' AND has_function_privilege(api,p.oid,'EXECUTE'))<>15 THEN
  RAISE EXCEPTION 'V154: six patched routines, 22 chat routines and 15 API RPCs expected'; END IF;
END $check$;
