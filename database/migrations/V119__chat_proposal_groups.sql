-- R106 D12 ("One card, Confirm all"; owner decision of 30 October 2026, after the DEV test where six requested charge
-- edits produced one proposal): a turn may propose a group of 1..20 changes, shown on one card and confirmed together.
-- Each line stays its own pwa_chat_proposals row (own request id, command, version, journal row and lifecycle, D6/D7);
-- the lines of a group share card.group = {id: the first line's id (the head), index, count, ...}.
-- Functions only (no table, column, grant, role or trigger change; V118 is applied on DEV and stays immutable):
-- 1. pwa_chat_proposal_create_v1 is replaced in place (same signature, owner, ACL and comment). It accepts the V118
--    single-line form unchanged (so the single-line service build still works against V119) or {group:[line, ...]}:
--    1..20 lines validated as one line is, the same messageId, distinct ids, card.group consistent with the order,
--    inserted in one transaction with one created_at and expires_at. The one-group-per-turn rule (23505) and the
--    supersede of the thread's earlier pending rows stay. The group form returns the lines as an array, in order.
-- 2. pwa_chat_message_json_v1 is re-patched in place (exact-count replace of the V118 text): an assistant message
--    carries "proposals", the lines of its turn's latest group ordered by card.group.index ([] when none), instead of
--    "proposal". Claim, settle, cancel and listing are unchanged.
-- On Cloud SQL the runner is not a superuser: temporary authority on mw_chat_owner_<env> only
-- (owner-authority-cli.mjs prepare --owner mw_chat_owner_<env>, then restore); the preflight names every missing
-- authority first. Rollback: the service build before D12 (single-line create form kept); V119 stays.

-- 1. Preflight. Fails closed with the complete list of problems.
DO $preflight$
DECLARE suffix text; chat_owner text; signature text; problems text[]:='{}';
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 chat_owner:='mw_chat_owner_'||suffix;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=chat_owner AND NOT rolcanlogin AND NOT rolsuper) THEN problems:=problems||format('role %s is missing or unsafe',chat_owner); END IF;
 IF to_regclass('public.pwa_chat_proposals') IS NULL THEN problems:=problems||'V118 table pwa_chat_proposals is missing'::text; END IF;
 FOREACH signature IN ARRAY ARRAY['public.pwa_chat_proposal_create_v1(jsonb,uuid,jsonb)','public.pwa_chat_message_json_v1(public.pwa_chat_messages)','public.pwa_chat_proposal_json_v1(public.pwa_chat_proposals)'] LOOP
  IF to_regprocedure(signature) IS NULL THEN problems:=problems||format('%s is missing (V118 first)',signature);
  ELSIF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure(signature))<>chat_owner THEN problems:=problems||format('%s is not owned by %s',signature,chat_owner); END IF;
 END LOOP;
 IF to_regprocedure('public.pwa_chat_message_json_v1(public.pwa_chat_messages)') IS NOT NULL
  AND strpos((SELECT prosrc FROM pg_proc WHERE oid='public.pwa_chat_message_json_v1(public.pwa_chat_messages)'::regprocedure),'jsonb_build_object(''proposal'',')=0 THEN
  problems:=problems||'pwa_chat_message_json_v1 does not carry the V118 proposal text'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname=chat_owner) THEN
  IF NOT pg_has_role(current_user,chat_owner,'SET') THEN problems:=problems||format('%s cannot SET ROLE %s (temporary maintenance membership required)',current_user,chat_owner); END IF;
  IF NOT has_schema_privilege(chat_owner,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public (grant temporarily)',chat_owner); END IF;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V119 preflight: %', array_to_string(problems,'; '); END IF;
END $preflight$;

-- 2. Both replacements as the chat owner, so owners, ACLs and comments are kept.
DO $chat$
DECLARE chat_owner text:='mw_chat_owner_'||CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; switched boolean:=false;
 old_text text:=$o$jsonb_build_object('proposal',coalesce((SELECT public.pwa_chat_proposal_json_v1(p)
  FROM public.pwa_chat_proposals p JOIN public.pwa_chat_messages q ON q.id=p.message_id WHERE q.thread_id=m.thread_id AND q.seq=m.seq-1 AND q.role='user'
  ORDER BY p.created_at DESC,p.id DESC LIMIT 1),'null'::jsonb))$o$;
 new_text text:=$n$jsonb_build_object('proposals',coalesce((SELECT jsonb_agg(public.pwa_chat_proposal_json_v1(p) ORDER BY coalesce((p.card->'group'->>'index')::integer,0),p.id)
  FROM public.pwa_chat_proposals p JOIN public.pwa_chat_messages q ON q.id=p.message_id WHERE q.thread_id=m.thread_id AND q.seq=m.seq-1 AND q.role='user'
  AND p.created_at=(SELECT max(r.created_at) FROM public.pwa_chat_proposals r WHERE r.message_id=q.id)),'[]'::jsonb))$n$;
 definition text; found integer;
BEGIN
 IF NOT pg_has_role(current_user,chat_owner,'USAGE') THEN EXECUTE format('SET LOCAL ROLE %I',chat_owner); switched:=true; END IF;
 definition:=pg_get_functiondef('public.pwa_chat_message_json_v1(public.pwa_chat_messages)'::regprocedure);
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 IF found<>1 THEN RAISE EXCEPTION 'V119: % occurrence(s) of the replaced text in pwa_chat_message_json_v1, expected 1',found; END IF;
 EXECUTE replace(definition,old_text,new_text);
 EXECUTE $fn$
CREATE OR REPLACE FUNCTION public.pwa_chat_proposal_create_v1(actor jsonb,thread uuid,proposal jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); t public.pwa_chat_threads; u public.pwa_chat_messages; p public.pwa_chat_proposals;
 lines jsonb; line jsonb; n integer; i integer:=0; head text; command_value jsonb; created timestamptz; result jsonb:='[]'::jsonb; grouped boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public."Partners" x WHERE x."Row ID"=partner AND x."AI Reviewer" IS TRUE) THEN RAISE EXCEPTION 'reviewer_required' USING ERRCODE='42501'; END IF;
 IF proposal IS NULL OR jsonb_typeof(proposal)<>'object' THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 -- D12: {group:[line, ...]} (1..20 lines) or the V118 single line.
 grouped:=(SELECT array_agg(key) FROM jsonb_object_keys(proposal) key)=ARRAY['group']::text[];
 lines:=CASE WHEN grouped THEN proposal->'group' ELSE jsonb_build_array(proposal) END;
 IF jsonb_typeof(lines)<>'array' OR jsonb_array_length(lines) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 n:=jsonb_array_length(lines);head:=lines->0->>'id';
 FOR line IN SELECT value FROM jsonb_array_elements(lines) LOOP
  IF jsonb_typeof(line)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(line) key) IS DISTINCT FROM ARRAY['card','command','id','kind','messageId','operation']::text[]
   OR jsonb_typeof(line->'id') IS DISTINCT FROM 'string' OR line->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   OR jsonb_typeof(line->'messageId') IS DISTINCT FROM 'string' OR line->>'messageId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   OR line->>'messageId' IS DISTINCT FROM lines->0->>'messageId'
   OR line->>'kind' NOT IN ('operation','payment') OR jsonb_typeof(line->'operation') IS DISTINCT FROM 'string'
   OR jsonb_typeof(line->'command') IS DISTINCT FROM 'string' OR octet_length(line->>'command') NOT BETWEEN 2 AND 65536
   OR jsonb_typeof(line->'card') IS DISTINCT FROM 'object'
   OR (grouped AND (jsonb_typeof(line->'card'->'group') IS DISTINCT FROM 'object' OR line->'card'->'group'->>'id' IS DISTINCT FROM head
    OR jsonb_typeof(line->'card'->'group'->'index') IS DISTINCT FROM 'number' OR (line->'card'->'group'->>'index')::numeric IS DISTINCT FROM i
    OR jsonb_typeof(line->'card'->'group'->'count') IS DISTINCT FROM 'number' OR (line->'card'->'group'->>'count')::numeric IS DISTINCT FROM n)) THEN
   RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  BEGIN command_value:=(line->>'command')::jsonb; EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END;
  IF jsonb_typeof(command_value)<>'object' OR command_value->>'requestId' IS DISTINCT FROM line->>'id' THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  i:=i+1;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(lines))<>n THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 SELECT * INTO t FROM public.pwa_chat_threads x WHERE x.id=thread AND x.partner_id=partner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 SELECT m.* INTO u FROM public.pwa_chat_messages m WHERE m.id=(lines->0->>'messageId')::uuid AND m.thread_id=t.id AND m.role='user'
  AND m.claimed_at>clock_timestamp()-interval '5 minutes' AND NOT EXISTS(SELECT 1 FROM public.pwa_chat_messages r WHERE r.thread_id=m.thread_id AND r.seq=m.seq+1)
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.pwa_chat_proposals x WHERE x.message_id=u.id AND x.created_at>=u.claimed_at) THEN RAISE EXCEPTION 'one_proposal_per_turn' USING ERRCODE='23505'; END IF;
 -- A new proposal replaces the thread's earlier pending ones (D9); one past its expiry is recorded as expired.
 UPDATE public.pwa_chat_proposals x SET state=CASE WHEN x.expires_at<=clock_timestamp() THEN 'expired' ELSE 'cancelled' END,
  cancel_reason=CASE WHEN x.expires_at<=clock_timestamp() THEN NULL ELSE 'superseded' END,settled_at=clock_timestamp()
 WHERE x.thread_id=t.id AND x.state='pending';
 -- clock_timestamp(): created after the claim of its turn (the one-per-turn rule compares the two); one time per group.
 created:=clock_timestamp();
 FOR line IN SELECT value FROM jsonb_array_elements(lines) WITH ORDINALITY ORDER BY ordinality LOOP
  INSERT INTO public.pwa_chat_proposals(id,thread_id,message_id,partner_id,kind,operation,command,card,created_at,expires_at)
  VALUES((line->>'id')::uuid,t.id,u.id,partner,line->>'kind',line->>'operation',line->>'command',line->'card',created,created+interval '15 minutes')
  RETURNING * INTO p;
  result:=result||jsonb_build_array(public.pwa_chat_proposal_json_v1(p));
 END LOOP;
 RETURN CASE WHEN grouped THEN result ELSE result->0 END;
END $$
$fn$;
 IF switched THEN RESET ROLE; END IF;
END $chat$;
RESET ROLE;

-- 3. Self-check: both routines carry D12, and every chat routine is still the chat owner's pinned function with the
-- boundary comment, definers executable only by the API role (V118 rule: 22 routines, 15 API RPCs).
DO $check$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; chat_owner text; api text; bad text;
BEGIN
 chat_owner:='mw_chat_owner_'||suffix;api:='mw_chat_api_'||suffix;
 IF strpos((SELECT prosrc FROM pg_proc WHERE oid='public.pwa_chat_message_json_v1(public.pwa_chat_messages)'::regprocedure),'jsonb_build_object(''proposals'',')=0
  OR strpos((SELECT prosrc FROM pg_proc WHERE oid='public.pwa_chat_message_json_v1(public.pwa_chat_messages)'::regprocedure),'jsonb_build_object(''proposal'',')>0
  OR strpos((SELECT prosrc FROM pg_proc WHERE oid='public.pwa_chat_proposal_create_v1(jsonb,uuid,jsonb)'::regprocedure),'grouped:=')=0 THEN
  RAISE EXCEPTION 'V119: the message JSON and the create routine must carry the group changes'; END IF;
 SELECT string_agg(p.oid::regprocedure::text,', ') INTO bad FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'pwa\_chat\_%'
  AND (pg_get_userbyid(p.proowner)<>chat_owner OR NOT ('search_path=pg_catalog, public'=ANY(p.proconfig))
   OR (p.proname IN ('pwa_chat_models_default_v1','pwa_chat_threads_v1','pwa_chat_thread_create_v1','pwa_chat_thread_update_v1','pwa_chat_messages_v1','pwa_chat_message_v1',
    'pwa_chat_turn_begin_v1','pwa_chat_turn_complete_v1','pwa_chat_thread_v1','pwa_chat_turn_presence_v1','pwa_chat_proposal_create_v1','pwa_chat_proposals_v1',
    'pwa_chat_proposal_claim_v1','pwa_chat_proposal_settle_v1','pwa_chat_proposal_cancel_v1'))<>p.prosecdef
   OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM 'mw-access:governance fixed chat boundary; explicit capability only'
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' AND a.grantee<>p.proowner
    AND NOT (a.grantee=api::regrole AND p.prosecdef)));
 IF bad IS NOT NULL OR (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'pwa\_chat\_%')<>22
  OR (SELECT count(*) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'pwa\_chat\_%' AND has_function_privilege(api,p.oid,'EXECUTE'))<>15 THEN
  RAISE EXCEPTION 'V119: chat routines must be the chat owner''s pinned functions, definers executable only by %: %',api,coalesce(bad,'count'); END IF;
END $check$;
