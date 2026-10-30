-- R106 (owner decisions of 30 October 2026; design Change Logs/CHANGE_NOTES_R106_CHAT_WRITES_2026-10-30.md D5-D10):
-- chat write proposals. The model proposes one exact command, the PWA shows a confirmation card built by the server,
-- and the chat service executes the command through the command service only after the Partner taps Confirm. This
-- table records each proposal and its exactly-once lifecycle; the command itself runs under the Partner's own token
-- in the command service (its journal, idempotency, audit and reconciliation are unchanged). Additive:
-- 1. Table public.pwa_chat_proposals (id = the command's requestId, thread, the proposing turn's user message,
--    Partner, kind, operation, the exact command JSON, the server-built card, state, times, attempts, outcome,
--    record link, cancel reason). Rows are never deleted or truncated (55000); a settled row never changes; only
--    the lifecycle columns change, along the allowed transitions, through the owner's functions.
-- 2. Five RPCs (SECURITY DEFINER, owned by mw_chat_owner_<env>, executable only by mw_chat_api_<env>):
--    pwa_chat_proposal_create_v1 (one per turn, cancels the thread's earlier pending proposals, 15 minutes),
--    pwa_chat_proposals_v1 (one proposal, or the thread's latest ones for the turn's recent actions),
--    pwa_chat_proposal_claim_v1 (pending -> executing once, under the row lock; any other state answers unchanged:
--    a command is posted at most once, an unknown or dead claim is only reconciled from the command journal),
--    pwa_chat_proposal_settle_v1 (executing/unknown -> done/failed/unknown),
--    pwa_chat_proposal_cancel_v1 (explicit cancel, or every pending one superseded by a new message).
--    Proposing, reading and claiming need Partners."AI Reviewer" (42501 reviewer_required); settling and the
--    superseding cancel do not, so a known outcome is always recorded.
-- 3. pwa_chat_message_json_v1 (the API message shape) gains "proposal" on assistant rows (the proposal of the
--    turn's user message, or null), replaced in place as the chat owner (exact-count replace, V94/V106 pattern), so
--    pwa_chat_messages_v1, pwa_chat_message_v1 and the turn RPCs return it.
-- 4. The chat owner reads Partners."AI Reviewer" (column grant). The SQL-tool role mw_chat_read_<env> gets nothing:
--    a Partner's commands are not readable through the other Partner's sql_query.
-- No existing table, column, business row or trigger changes; the integrity and calculation triggers stay enabled.
-- On Cloud SQL the runner is not a superuser: temporary authority on mw_chat_owner_<env> only
-- (owner-authority-cli.mjs prepare --owner mw_chat_owner_<env>, then restore); the preflight names every missing
-- authority first. Rollback: the chat_commands switch off; V118 is additive and stays.

-- 1. Preflight. Fails closed with the complete list of problems.
DO $preflight$
DECLARE suffix text; chat_owner text; role_name text; signature text; problems text[]:='{}';
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 chat_owner:='mw_chat_owner_'||suffix;
 FOREACH role_name IN ARRAY ARRAY[chat_owner,'mw_chat_api_'||suffix,'mw_chat_read_'||suffix] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) THEN
   problems:=problems||format('role %s is missing or unsafe',role_name); END IF;
 END LOOP;
 IF to_regclass('public.pwa_chat_messages') IS NULL OR to_regclass('public.pwa_chat_threads') IS NULL THEN
  problems:=problems||'V104 tables pwa_chat_threads and pwa_chat_messages are missing'::text;
 ELSIF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.pwa_chat_messages'::regclass)<>chat_owner THEN
  problems:=problems||format('pwa_chat_messages is not owned by %s',chat_owner); END IF;
 IF to_regclass('public.pwa_chat_proposals') IS NOT NULL OR to_regprocedure('public.pwa_chat_proposal_create_v1(jsonb,uuid,jsonb)') IS NOT NULL THEN
  problems:=problems||'the chat proposal objects already exist'::text; END IF;
 FOREACH signature IN ARRAY ARRAY['public.pwa_chat_message_json_v1(public.pwa_chat_messages)','public.pwa_chat_actor_v1(jsonb)','public.pwa_chat_iso_v1(timestamptz)'] LOOP
  IF to_regprocedure(signature) IS NULL THEN problems:=problems||format('%s is missing (V104 first)',signature);
  ELSIF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure(signature))<>chat_owner THEN problems:=problems||format('%s is not owned by %s',signature,chat_owner); END IF;
 END LOOP;
 IF to_regclass('public."Partners"') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public."Partners"'::regclass AND attname='AI Reviewer' AND NOT attisdropped) THEN
  problems:=problems||'public."Partners"."AI Reviewer" is missing'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  IF NOT has_schema_privilege(current_user,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public',current_user); END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=chat_owner) THEN
   IF NOT pg_has_role(current_user,chat_owner,'SET') THEN problems:=problems||format('%s cannot SET ROLE %s (temporary maintenance membership required for ALTER ... OWNER)',current_user,chat_owner); END IF;
   IF NOT has_schema_privilege(chat_owner,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public (grant temporarily)',chat_owner); END IF;
  END IF;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V118 preflight: %', array_to_string(problems,'; '); END IF;
END $preflight$;

-- 2. The proposal record (D6). id is the command's requestId (UUID v4 from the chat service).
CREATE TABLE public.pwa_chat_proposals (
 id uuid PRIMARY KEY CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
 thread_id uuid NOT NULL REFERENCES public.pwa_chat_threads(id),
 message_id uuid NOT NULL REFERENCES public.pwa_chat_messages(id),
 partner_id text NOT NULL CHECK (length(partner_id) BETWEEN 1 AND 256),
 kind text NOT NULL CHECK (kind IN ('operation','payment')),
 operation text NOT NULL CHECK (operation ~ '^[a-z-]+\.[a-z-]+$' AND length(operation)<=64),
 command text NOT NULL CHECK (octet_length(command) BETWEEN 2 AND 65536),
 card jsonb NOT NULL CHECK (jsonb_typeof(card)='object' AND octet_length(card::text)<=65536),
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','executing','done','failed','expired','cancelled','unknown')),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 expires_at timestamptz NOT NULL,
 claimed_at timestamptz,
 settled_at timestamptz,
 attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 1000),
 outcome jsonb CHECK (outcome IS NULL OR (jsonb_typeof(outcome)='object' AND octet_length(outcome::text)<=65536)),
 record jsonb CHECK (record IS NULL OR (jsonb_typeof(record)='object' AND octet_length(record::text)<=4096)),
 cancel_reason text CHECK (cancel_reason IN ('superseded','cancelled')),
 CHECK (expires_at>created_at),
 CHECK ((state='cancelled')=(cancel_reason IS NOT NULL)),
 CHECK ((state IN ('done','failed','expired','cancelled'))=(settled_at IS NOT NULL)),
 CHECK (state IN ('pending','cancelled','expired') OR claimed_at IS NOT NULL)
);
CREATE INDEX pwa_chat_proposals_thread ON public.pwa_chat_proposals(thread_id,created_at DESC);
CREATE INDEX pwa_chat_proposals_message ON public.pwa_chat_proposals(message_id);
COMMENT ON TABLE public.pwa_chat_proposals IS 'mw-access:governance partner chat write proposals (card and exactly-once lifecycle); fixed chat RPCs only';

-- 3. Immutability: nothing is deleted or truncated; a settled row never changes; otherwise only the lifecycle
-- columns change, along the allowed transitions (pending -> executing|expired|cancelled; executing -> done|failed|
-- unknown; unknown -> done|failed|unknown): nothing returns to executing, so a claim never repeats.
CREATE FUNCTION public.pwa_chat_proposal_guard_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE lifecycle text[]:=ARRAY['state','claimed_at','settled_at','attempts','outcome','record','cancel_reason'];
BEGIN
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-lifecycle)=(to_jsonb(OLD)-lifecycle)
  AND ((OLD.state='pending' AND NEW.state IN ('executing','expired','cancelled'))
   OR (OLD.state IN ('executing','unknown') AND NEW.state IN ('done','failed','unknown'))) THEN RETURN NEW; END IF;
 RAISE EXCEPTION '% on % is not allowed (chat proposal lifecycle)',TG_OP,TG_TABLE_NAME USING ERRCODE='55000';
END $$;
CREATE TRIGGER pwa_chat_proposals_guard BEFORE UPDATE OR DELETE ON public.pwa_chat_proposals FOR EACH ROW EXECUTE FUNCTION public.pwa_chat_proposal_guard_v1();
CREATE TRIGGER pwa_chat_proposals_truncate BEFORE TRUNCATE ON public.pwa_chat_proposals FOR EACH STATEMENT EXECUTE FUNCTION public.pwa_chat_proposal_guard_v1();

-- 4. The API proposal shape (D9): the raw command is never returned; outcome is the code and the journal's recordedAt
-- (CWR-07: the Done card's time). A pending proposal past expires_at reads as expired (the claim writes it).
CREATE FUNCTION public.pwa_chat_proposal_json_v1(p public.pwa_chat_proposals) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('id',p.id,'threadId',p.thread_id,'messageId',p.message_id,'kind',p.kind,'operation',p.operation,
  'state',CASE WHEN p.state='pending' AND p.expires_at<=clock_timestamp() THEN 'expired' ELSE p.state END,
  'card',p.card,'expiresAt',public.pwa_chat_iso_v1(p.expires_at),'createdAt',public.pwa_chat_iso_v1(p.created_at),
  'settledAt',public.pwa_chat_iso_v1(p.settled_at),
  'outcome',CASE WHEN p.outcome IS NULL THEN NULL ELSE jsonb_build_object('code',coalesce(p.outcome->'code','null'::jsonb),'recordedAt',coalesce(p.outcome->'recordedAt','null'::jsonb)) END,
  'record',p.record)
$$;

-- 5. API RPCs.
-- proposal = {id, messageId, kind, operation, command, card}: messageId is the thread's running turn (a user message
-- claimed under 5 minutes ago without a reply); one proposal per claim of that turn (23505 one_proposal_per_turn);
-- the command is the exact JSON object the chat service will send, whose requestId is the proposal id.
CREATE FUNCTION public.pwa_chat_proposal_create_v1(actor jsonb,thread uuid,proposal jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); t public.pwa_chat_threads; u public.pwa_chat_messages; p public.pwa_chat_proposals; command_value jsonb; created timestamptz;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public."Partners" x WHERE x."Row ID"=partner AND x."AI Reviewer" IS TRUE) THEN RAISE EXCEPTION 'reviewer_required' USING ERRCODE='42501'; END IF;
 IF proposal IS NULL OR jsonb_typeof(proposal)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(proposal) key) IS DISTINCT FROM ARRAY['card','command','id','kind','messageId','operation']::text[]
  OR jsonb_typeof(proposal->'id') IS DISTINCT FROM 'string' OR proposal->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  OR jsonb_typeof(proposal->'messageId') IS DISTINCT FROM 'string' OR proposal->>'messageId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  OR proposal->>'kind' NOT IN ('operation','payment') OR jsonb_typeof(proposal->'operation') IS DISTINCT FROM 'string'
  OR jsonb_typeof(proposal->'command') IS DISTINCT FROM 'string' OR octet_length(proposal->>'command') NOT BETWEEN 2 AND 65536
  OR jsonb_typeof(proposal->'card') IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 BEGIN command_value:=(proposal->>'command')::jsonb; EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END;
 IF jsonb_typeof(command_value)<>'object' OR command_value->>'requestId' IS DISTINCT FROM proposal->>'id' THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 SELECT * INTO t FROM public.pwa_chat_threads x WHERE x.id=thread AND x.partner_id=partner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 SELECT m.* INTO u FROM public.pwa_chat_messages m WHERE m.id=(proposal->>'messageId')::uuid AND m.thread_id=t.id AND m.role='user'
  AND m.claimed_at>clock_timestamp()-interval '5 minutes' AND NOT EXISTS(SELECT 1 FROM public.pwa_chat_messages r WHERE r.thread_id=m.thread_id AND r.seq=m.seq+1)
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.pwa_chat_proposals x WHERE x.message_id=u.id AND x.created_at>=u.claimed_at) THEN RAISE EXCEPTION 'one_proposal_per_turn' USING ERRCODE='23505'; END IF;
 -- A new proposal replaces the thread's earlier pending ones (D9); one past its expiry is recorded as expired.
 UPDATE public.pwa_chat_proposals x SET state=CASE WHEN x.expires_at<=clock_timestamp() THEN 'expired' ELSE 'cancelled' END,
  cancel_reason=CASE WHEN x.expires_at<=clock_timestamp() THEN NULL ELSE 'superseded' END,settled_at=clock_timestamp()
 WHERE x.thread_id=t.id AND x.state='pending';
 -- clock_timestamp(): created after the claim of its turn (the one-per-turn rule compares the two).
 created:=clock_timestamp();
 INSERT INTO public.pwa_chat_proposals(id,thread_id,message_id,partner_id,kind,operation,command,card,created_at,expires_at)
 VALUES((proposal->>'id')::uuid,t.id,u.id,partner,proposal->>'kind',proposal->>'operation',proposal->>'command',proposal->'card',created,created+interval '15 minutes')
 RETURNING * INTO p;
 RETURN public.pwa_chat_proposal_json_v1(p);
END $$;

-- One proposal (id given, lim null) with the service's internal claimedAt and attempts, or the thread's latest lim
-- (1..20) proposals newest first (id null).
CREATE FUNCTION public.pwa_chat_proposals_v1(actor jsonb,thread uuid,id uuid,lim integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); p public.pwa_chat_proposals;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public."Partners" x WHERE x."Row ID"=partner AND x."AI Reviewer" IS TRUE) THEN RAISE EXCEPTION 'reviewer_required' USING ERRCODE='42501'; END IF;
 IF (id IS NULL)=(lim IS NULL) OR (lim IS NOT NULL AND lim NOT BETWEEN 1 AND 20) THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pwa_chat_threads t WHERE t.id=thread AND t.partner_id=partner) THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 IF id IS NOT NULL THEN
  SELECT * INTO p FROM public.pwa_chat_proposals x WHERE x.id=$3 AND x.thread_id=thread AND x.partner_id=partner;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
  RETURN public.pwa_chat_proposal_json_v1(p)||jsonb_build_object('claimedAt',public.pwa_chat_iso_v1(p.claimed_at),'attempts',p.attempts);
 END IF;
 RETURN coalesce((SELECT jsonb_agg(public.pwa_chat_proposal_json_v1(z.y) ORDER BY (z.y).created_at DESC,(z.y).id DESC)
  FROM (SELECT y FROM public.pwa_chat_proposals y WHERE y.thread_id=thread AND y.partner_id=partner ORDER BY y.created_at DESC,y.id DESC LIMIT lim) z),'[]'::jsonb);
END $$;

-- Confirm (D7): under the row lock, pending -> executing (claimed, with the command, the only path to a POST); a
-- pending one past expiry -> expired; executing claimed under 3 minutes ago -> 55006 proposal_executing; any other
-- state answers unchanged with the claim fields ({claimed:false}): an unknown outcome or a dead instance's claim is
-- reconciled by the service from the command journal and is never posted again. Returns {claimed, proposal[, command]}.
CREATE FUNCTION public.pwa_chat_proposal_claim_v1(actor jsonb,thread uuid,id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); p public.pwa_chat_proposals;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public."Partners" x WHERE x."Row ID"=partner AND x."AI Reviewer" IS TRUE) THEN RAISE EXCEPTION 'reviewer_required' USING ERRCODE='42501'; END IF;
 SELECT x.* INTO p FROM public.pwa_chat_proposals x JOIN public.pwa_chat_threads t ON t.id=x.thread_id
 WHERE x.id=$3 AND x.thread_id=thread AND t.partner_id=partner AND x.partner_id=partner FOR UPDATE OF x;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 IF p.state='pending' AND p.expires_at<=clock_timestamp() THEN
  UPDATE public.pwa_chat_proposals x SET state='expired',settled_at=clock_timestamp() WHERE x.id=p.id RETURNING * INTO p;
 ELSIF p.state='pending' THEN
  UPDATE public.pwa_chat_proposals x SET state='executing',claimed_at=clock_timestamp(),attempts=x.attempts+1 WHERE x.id=p.id RETURNING * INTO p;
  RETURN jsonb_build_object('claimed',true,'proposal',public.pwa_chat_proposal_json_v1(p)||jsonb_build_object('claimedAt',public.pwa_chat_iso_v1(p.claimed_at),'attempts',p.attempts),'command',p.command);
 ELSIF p.state='executing' AND p.claimed_at>clock_timestamp()-interval '3 minutes' THEN
  RAISE EXCEPTION 'proposal_executing' USING ERRCODE='55006';
 END IF;
 RETURN jsonb_build_object('claimed',false,'proposal',public.pwa_chat_proposal_json_v1(p)||jsonb_build_object('claimedAt',public.pwa_chat_iso_v1(p.claimed_at),'attempts',p.attempts));
END $$;

-- settlement = {state: done|failed|unknown, outcome: object|null, record: object|null}. Only an executing or unknown
-- proposal changes; a settled one answers as it is (a second settler cannot overwrite the first outcome).
CREATE FUNCTION public.pwa_chat_proposal_settle_v1(actor jsonb,thread uuid,id uuid,settlement jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); p public.pwa_chat_proposals;
BEGIN
 IF settlement IS NULL OR jsonb_typeof(settlement)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(settlement) key) IS DISTINCT FROM ARRAY['outcome','record','state']::text[]
  OR settlement->>'state' NOT IN ('done','failed','unknown') OR jsonb_typeof(settlement->'outcome') NOT IN ('object','null') OR jsonb_typeof(settlement->'record') NOT IN ('object','null')
  OR (settlement->>'state' IN ('done','failed') AND jsonb_typeof(settlement->'outcome')<>'object') OR (settlement->>'state'<>'done' AND jsonb_typeof(settlement->'record')<>'null') THEN
  RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 SELECT x.* INTO p FROM public.pwa_chat_proposals x JOIN public.pwa_chat_threads t ON t.id=x.thread_id
 WHERE x.id=$3 AND x.thread_id=thread AND t.partner_id=partner AND x.partner_id=partner FOR UPDATE OF x;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 IF p.state IN ('executing','unknown') THEN
  UPDATE public.pwa_chat_proposals x SET state=settlement->>'state',outcome=CASE WHEN jsonb_typeof(settlement->'outcome')='object' THEN settlement->'outcome' END,
   record=CASE WHEN jsonb_typeof(settlement->'record')='object' THEN settlement->'record' END,
   settled_at=CASE WHEN settlement->>'state' IN ('done','failed') THEN clock_timestamp() END
  WHERE x.id=p.id RETURNING * INTO p;
 END IF;
 RETURN public.pwa_chat_proposal_json_v1(p)||jsonb_build_object('claimedAt',public.pwa_chat_iso_v1(p.claimed_at),'attempts',p.attempts);
END $$;

-- reason 'cancelled' with an id: the Partner's explicit cancel of one pending proposal (one past expiry becomes
-- expired; any other state answers unchanged). reason 'superseded' with id null: a new user message cancels every
-- pending proposal of the thread (D7); returns {cancelled: n}.
CREATE FUNCTION public.pwa_chat_proposal_cancel_v1(actor jsonb,thread uuid,id uuid,reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); p public.pwa_chat_proposals; n integer;
BEGIN
 IF reason IS NULL OR NOT ((reason='cancelled' AND id IS NOT NULL) OR (reason='superseded' AND id IS NULL)) THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pwa_chat_threads t WHERE t.id=thread AND t.partner_id=partner) THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 IF reason='superseded' THEN
  UPDATE public.pwa_chat_proposals x SET state=CASE WHEN x.expires_at<=clock_timestamp() THEN 'expired' ELSE 'cancelled' END,
   cancel_reason=CASE WHEN x.expires_at<=clock_timestamp() THEN NULL ELSE 'superseded' END,settled_at=clock_timestamp()
  WHERE x.thread_id=thread AND x.partner_id=partner AND x.state='pending';
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN jsonb_build_object('cancelled',n);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Partners" x WHERE x."Row ID"=partner AND x."AI Reviewer" IS TRUE) THEN RAISE EXCEPTION 'reviewer_required' USING ERRCODE='42501'; END IF;
 SELECT x.* INTO p FROM public.pwa_chat_proposals x WHERE x.id=$3 AND x.thread_id=thread AND x.partner_id=partner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 IF p.state='pending' THEN
  UPDATE public.pwa_chat_proposals x SET state=CASE WHEN x.expires_at<=clock_timestamp() THEN 'expired' ELSE 'cancelled' END,
   cancel_reason=CASE WHEN x.expires_at<=clock_timestamp() THEN NULL ELSE 'cancelled' END,settled_at=clock_timestamp()
  WHERE x.id=p.id RETURNING * INTO p;
 END IF;
 RETURN public.pwa_chat_proposal_json_v1(p);
END $$;

-- 6. ACL and ownership (grants and comments while the runner still owns the objects, then the owner change).
DO $ownership$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 chat_owner text; api text; reader text; signature text;
 api_functions text[]:=ARRAY['public.pwa_chat_proposal_create_v1(jsonb,uuid,jsonb)','public.pwa_chat_proposals_v1(jsonb,uuid,uuid,integer)',
  'public.pwa_chat_proposal_claim_v1(jsonb,uuid,uuid)','public.pwa_chat_proposal_settle_v1(jsonb,uuid,uuid,jsonb)','public.pwa_chat_proposal_cancel_v1(jsonb,uuid,uuid,text)'];
 private_functions text[]:=ARRAY['public.pwa_chat_proposal_json_v1(public.pwa_chat_proposals)','public.pwa_chat_proposal_guard_v1()'];
BEGIN
 chat_owner:='mw_chat_owner_'||suffix;api:='mw_chat_api_'||suffix;reader:='mw_chat_read_'||suffix;
 EXECUTE format('GRANT SELECT ("AI Reviewer") ON public."Partners" TO %I',chat_owner);
 EXECUTE format('REVOKE ALL ON public.pwa_chat_proposals FROM PUBLIC,%I,%I',api,reader);
 -- PROD's R085 default privileges for the agent role reach objects the runner creates in public.
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent') THEN REVOKE ALL ON public.pwa_chat_proposals FROM mw_integration_agent; END IF;
 EXECUTE format('ALTER TABLE public.pwa_chat_proposals OWNER TO %I',chat_owner);
 FOREACH signature IN ARRAY api_functions||private_functions LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',signature::regprocedure);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM mw_integration_agent',signature::regprocedure); END IF;
  EXECUTE format('COMMENT ON FUNCTION %s IS %L',signature::regprocedure,'mw-access:governance fixed chat boundary; explicit capability only');
 END LOOP;
 FOREACH signature IN ARRAY api_functions LOOP EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',signature::regprocedure,api); END LOOP;
 FOREACH signature IN ARRAY api_functions||private_functions LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO %I',signature::regprocedure,chat_owner); END LOOP;
END $ownership$;

-- 7. Assistant rows carry the turn's proposal (D9), as the chat owner from the current definition (exact-count
-- replace), so the owner, ACL and comment of the helper are kept.
DO $chat$
DECLARE chat_owner text:='mw_chat_owner_'||CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; switched boolean:=false;
 old_text text:=$o$'errorCode',m.error_code))$o$;
 new_text text:=$n$'errorCode',m.error_code))||CASE WHEN m.role='assistant' THEN jsonb_build_object('proposal',coalesce((SELECT public.pwa_chat_proposal_json_v1(p)
  FROM public.pwa_chat_proposals p JOIN public.pwa_chat_messages q ON q.id=p.message_id WHERE q.thread_id=m.thread_id AND q.seq=m.seq-1 AND q.role='user'
  ORDER BY p.created_at DESC,p.id DESC LIMIT 1),'null'::jsonb)) ELSE '{}'::jsonb END$n$;
 definition text; found integer;
BEGIN
 IF NOT pg_has_role(current_user,chat_owner,'USAGE') THEN EXECUTE format('SET LOCAL ROLE %I',chat_owner); switched:=true; END IF;
 definition:=pg_get_functiondef('public.pwa_chat_message_json_v1(public.pwa_chat_messages)'::regprocedure);
 found:=(length(definition)-length(replace(definition,old_text,'')))/length(old_text);
 IF found<>1 THEN RAISE EXCEPTION 'V118: % occurrence(s) of the replaced text in pwa_chat_message_json_v1, expected 1',found; END IF;
 EXECUTE replace(definition,old_text,new_text);
 IF switched THEN RESET ROLE; END IF;
END $chat$;
RESET ROLE;

-- 8. Self-check: the table's owner, ACL, guards and CHECKs; every chat routine the chat owner's pinned function with
-- the boundary comment, definers executable only by the API role (now 22 routines, 15 API RPCs); the helper carries
-- the proposal; the chat owner reads exactly "AI Reviewer" more on Partners; the SQL-tool role holds nothing new.
DO $check$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; chat_owner text; api text; reader text; bad text;
BEGIN
 chat_owner:='mw_chat_owner_'||suffix;api:='mw_chat_api_'||suffix;reader:='mw_chat_read_'||suffix;
 IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.pwa_chat_proposals'::regclass)<>chat_owner
  OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='public.pwa_chat_proposals'::regclass AND a.grantee<>c.relowner)
  OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid='public.pwa_chat_proposals'::regclass AND a.attacl IS NOT NULL) THEN
  RAISE EXCEPTION 'V118: pwa_chat_proposals must be owned by % with no other grant',chat_owner; END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.pwa_chat_proposals'::regclass AND tgname IN ('pwa_chat_proposals_guard','pwa_chat_proposals_truncate') AND tgenabled='O'
   AND tgfoid='public.pwa_chat_proposal_guard_v1()'::regprocedure)<>2 THEN RAISE EXCEPTION 'V118: the proposal guard triggers must be enabled'; END IF;
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
  RAISE EXCEPTION 'V118: chat routines must be the chat owner''s pinned functions, definers executable only by %: %',api,coalesce(bad,'count'); END IF;
 IF strpos((SELECT prosrc FROM pg_proc WHERE oid='public.pwa_chat_message_json_v1(public.pwa_chat_messages)'::regprocedure),'pwa_chat_proposal_json_v1(p)')=0 THEN
  RAISE EXCEPTION 'V118: pwa_chat_message_json_v1 must carry the proposal'; END IF;
 IF NOT has_column_privilege(chat_owner,'public."Partners"','AI Reviewer','SELECT') OR has_table_privilege(chat_owner,'public."Partners"','SELECT')
  OR has_column_privilege(chat_owner,'public."Partners"','Partner Role','SELECT') THEN RAISE EXCEPTION 'V118: the chat owner must read Partners by column grant only'; END IF;
 IF has_table_privilege(reader,'public.pwa_chat_proposals','SELECT') OR has_table_privilege(api,'public.pwa_chat_proposals','SELECT')
  OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'pwa\_chat\_proposal%' AND has_function_privilege(reader,p.oid,'EXECUTE')) THEN
  RAISE EXCEPTION 'V118: the SQL-tool role must reach no proposal'; END IF;
END $check$;
