-- R106 D12 follow-up (owner report of 10 November 2026: a chat update of one borrower's payment plan needed more than
-- 20 lines): a turn may propose a group of 1..100 changes, shown on one card and confirmed together. V119 stays.
-- Function only (no table, column, grant, role, trigger or data change):
-- pwa_chat_proposal_create_v1(jsonb,uuid,jsonb) is replaced in place with the V119 body, its line limit raised from
-- 1..20 to 1..100. CREATE OR REPLACE as the chat owner keeps owner, ACL, security, configuration and comment; the
-- self-check proves them unchanged. Every other rule is the V119 one: the single-line form, one messageId, distinct ids,
-- card.group consistent with the order, one transaction with one created_at and expires_at, one group per turn (23505)
-- and the supersede of the thread's earlier pending rows.
-- On Cloud SQL the runner is not a superuser: temporary authority on mw_chat_owner_<env> only
-- (owner-authority-cli.mjs prepare --owner mw_chat_owner_<env>, then restore); the preflight names every missing
-- authority first. Rollback: the service build before this change (it sends at most 20 lines, which V141 accepts); a
-- later migration restores the 1..20 limit if needed.

-- 1. Preflight. Fails closed with the complete list of problems.
DO $preflight$
DECLARE suffix text; chat_owner text; problems text[]:='{}'; body text;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 chat_owner:='mw_chat_owner_'||suffix;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=chat_owner AND NOT rolcanlogin AND NOT rolsuper) THEN problems:=problems||format('role %s is missing or unsafe',chat_owner); END IF;
 IF to_regprocedure('public.pwa_chat_proposal_create_v1(jsonb,uuid,jsonb)') IS NULL THEN problems:=problems||'pwa_chat_proposal_create_v1 is missing (V118 first)'::text;
 ELSE
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.pwa_chat_proposal_create_v1(jsonb,uuid,jsonb)'::regprocedure)<>chat_owner THEN
   problems:=problems||format('pwa_chat_proposal_create_v1 is not owned by %s',chat_owner); END IF;
  body:=(SELECT prosrc FROM pg_proc WHERE oid='public.pwa_chat_proposal_create_v1(jsonb,uuid,jsonb)'::regprocedure);
  IF strpos(body,'grouped:=')=0 OR strpos(body,'jsonb_array_length(lines) NOT BETWEEN 1 AND 20 THEN')=0 THEN
   problems:=problems||'pwa_chat_proposal_create_v1 does not carry the V119 group body'::text; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname=chat_owner) THEN
  IF NOT pg_has_role(current_user,chat_owner,'SET') THEN problems:=problems||format('%s cannot SET ROLE %s (temporary maintenance membership required)',current_user,chat_owner); END IF;
  IF NOT has_schema_privilege(chat_owner,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public (grant temporarily)',chat_owner); END IF;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V141 preflight: %', array_to_string(problems,'; '); END IF;
END $preflight$;

CREATE TEMP TABLE v141_routine ON COMMIT DROP AS
 SELECT pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl,acldefault('f',p.proowner)) AS effective,p.prosecdef AS definer,p.provolatile AS volatile,
  p.proconfig AS config,obj_description(p.oid,'pg_proc') AS comment
 FROM pg_proc p WHERE p.oid='public.pwa_chat_proposal_create_v1(jsonb,uuid,jsonb)'::regprocedure;

-- 2. The replacement as the chat owner, so owner, ACL and comment are kept.
DO $chat$
DECLARE chat_owner text:='mw_chat_owner_'||CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; switched boolean:=false;
BEGIN
 IF NOT pg_has_role(current_user,chat_owner,'USAGE') THEN EXECUTE format('SET LOCAL ROLE %I',chat_owner); switched:=true; END IF;
 EXECUTE $fn$
CREATE OR REPLACE FUNCTION public.pwa_chat_proposal_create_v1(actor jsonb,thread uuid,proposal jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); t public.pwa_chat_threads; u public.pwa_chat_messages; p public.pwa_chat_proposals;
 lines jsonb; line jsonb; n integer; i integer:=0; head text; command_value jsonb; created timestamptz; result jsonb:='[]'::jsonb; grouped boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public."Partners" x WHERE x."Row ID"=partner AND x."AI Reviewer" IS TRUE) THEN RAISE EXCEPTION 'reviewer_required' USING ERRCODE='42501'; END IF;
 IF proposal IS NULL OR jsonb_typeof(proposal)<>'object' THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 -- D12 (V141: 1..100 lines): {group:[line, ...]} or the V118 single line.
 grouped:=(SELECT array_agg(key) FROM jsonb_object_keys(proposal) key)=ARRAY['group']::text[];
 lines:=CASE WHEN grouped THEN proposal->'group' ELSE jsonb_build_array(proposal) END;
 IF jsonb_typeof(lines)<>'array' OR jsonb_array_length(lines) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
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

-- 3. Self-check: the create routine carries the 1..100 limit with owner, ACL, security, volatility, configuration and
-- comment unchanged, and every chat routine is still the chat owner's pinned function with the boundary comment,
-- definers executable only by the API role (V119 rule: 22 routines, 15 API RPCs).
DO $check$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; chat_owner text; api text; bad text; body text;
BEGIN
 chat_owner:='mw_chat_owner_'||suffix;api:='mw_chat_api_'||suffix;
 body:=(SELECT prosrc FROM pg_proc WHERE oid='public.pwa_chat_proposal_create_v1(jsonb,uuid,jsonb)'::regprocedure);
 IF strpos(body,'jsonb_array_length(lines) NOT BETWEEN 1 AND 100 THEN')=0 OR strpos(body,'grouped:=')=0 THEN
  RAISE EXCEPTION 'V141: pwa_chat_proposal_create_v1 must carry the 1..100 group limit'; END IF;
 IF EXISTS(SELECT 1 FROM v141_routine o JOIN pg_proc p ON p.oid='public.pwa_chat_proposal_create_v1(jsonb,uuid,jsonb)'::regprocedure
  WHERE o.owner IS DISTINCT FROM pg_get_userbyid(p.proowner) OR o.effective::text IS DISTINCT FROM coalesce(p.proacl,acldefault('f',p.proowner))::text
   OR o.definer IS DISTINCT FROM p.prosecdef OR o.volatile IS DISTINCT FROM p.provolatile OR o.config IS DISTINCT FROM p.proconfig
   OR o.comment IS DISTINCT FROM obj_description(p.oid,'pg_proc')) OR (SELECT count(*) FROM v141_routine)<>1 THEN
  RAISE EXCEPTION 'V141: pwa_chat_proposal_create_v1 changed owner, ACL, security, volatility, configuration or comment'; END IF;
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
  RAISE EXCEPTION 'V141: chat routines must be the chat owner''s pinned functions, definers executable only by %: %',api,coalesce(bad,'count'); END IF;
END $check$;
