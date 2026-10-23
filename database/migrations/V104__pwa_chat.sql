-- R090 (owner go-ahead 23 October 2026, design project/outputs/r090-pwa-chatbot/DESIGN.md §5; Archie resolutions in
-- Change Logs/CHANGE_NOTES_R090_PWA_CHATBOT_2026-10-23.md): the in-app chatbot's persistence. Additive: four new
-- tables (pwa_chat_threads, pwa_chat_messages, pwa_chat_history, pwa_chat_tool_calls), the fixed pwa_chat_*_v1 RPCs
-- of the chat service and monitoring.pwa_chat_recent_questions_v1 for the Cost page. No existing table, column,
-- routine, trigger or business row is touched.
-- Boundary (V88/V99/V103 pattern): the tables and RPCs belong to the closed NOLOGIN role mw_chat_owner_<env>; every
-- RPC is SECURITY DEFINER with a pinned search_path, resolves the caller's actor against "Partners" and checks the
-- capability (session_user inherits mw_chat_api_<env>), and is executable only by mw_chat_api_<env>. No role reads
-- or writes a chat table directly: the SQL tool's role mw_chat_read_<env> (operator grants outside Git, like the
-- agent role's; the operator must not grant it pwa_chat_*) holds nothing here, and PROD's R085 default privileges
-- for mw_integration_agent are revoked from every object created below. Tables are append-only where the design
-- says so (triggers raise 55000); thread rows change only through pwa_chat_thread_update_v1 and the turn RPCs.
-- Operator provisions the three closed roles before this migration (owner-authority-cli.mjs role; CI:
-- Test-AppRolePrerequisites.sql). On Cloud SQL the runner is not a superuser: ALTER TABLE/FUNCTION ... OWNER needs
-- temporary SET membership of mw_chat_owner_<env> and CREATE on public for it (owner-authority-cli.mjs prepare
-- --owner mw_chat_owner_<env>, then restore); the preflight names every missing authority first.

-- 1. Preflight. Fails closed with the complete list of problems.
DO $preflight$
DECLARE suffix text; chat_owner text; role_name text; problems text[]:='{}';
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 chat_owner:='mw_chat_owner_'||suffix;
 FOREACH role_name IN ARRAY ARRAY[chat_owner,'mw_chat_api_'||suffix,'mw_chat_read_'||suffix] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) THEN
   problems:=problems||format('role %s is missing or unsafe (expected NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS)',role_name);
  ELSIF EXISTS(SELECT 1 FROM pg_auth_members WHERE member=role_name::regrole) THEN problems:=problems||format('%s must be a member of no role',role_name); END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=chat_owner)
  AND EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid=chat_owner::regrole AND member NOT IN (session_user::regrole,current_user::regrole)) THEN
  problems:=problems||format('%s must be granted to no role other than the migration runner',chat_owner); END IF;
 IF to_regclass('public."Partners"') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public."Partners"'::regclass AND attname='Login Email' AND NOT attisdropped) THEN
  problems:=problems||'public."Partners"."Login Email" is missing'::text; END IF;
 IF to_regclass('public.pwa_chat_threads') IS NOT NULL OR to_regprocedure('public.pwa_chat_turn_begin_v1(jsonb,uuid,jsonb)') IS NOT NULL THEN problems:=problems||'the chat objects already exist'::text; END IF;
 IF to_regnamespace('monitoring') IS NULL THEN
  IF NOT has_database_privilege(current_user,current_database(),'CREATE') THEN problems:=problems||format('%s lacks CREATE on the database (schema monitoring)',current_user); END IF;
 ELSIF NOT has_schema_privilege(current_user,'monitoring','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema monitoring',current_user); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  IF current_user<>'postgres' THEN problems:=problems||format('run as postgres (the monitoring function owner), not %s',current_user); END IF;
  IF NOT has_schema_privilege(current_user,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public',current_user); END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=chat_owner) THEN
   IF NOT pg_has_role(current_user,chat_owner,'SET') THEN problems:=problems||format('%s cannot SET ROLE %s (temporary maintenance membership required for ALTER ... OWNER)',current_user,chat_owner); END IF;
   IF NOT has_schema_privilege(chat_owner,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public (required by ALTER ... OWNER; grant temporarily)',chat_owner); END IF;
  END IF;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V104 preflight: %', array_to_string(problems,'; '); END IF;
END $preflight$;

-- 2. Tables (design §5.2). Ids are client UUID v4 except assistant messages (server gen_random_uuid()).
CREATE TABLE public.pwa_chat_threads (
 id uuid PRIMARY KEY CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
 partner_id text NOT NULL CHECK (length(partner_id) BETWEEN 1 AND 256),
 title text NOT NULL CHECK (octet_length(title) BETWEEN 1 AND 480),
 model text NOT NULL CHECK (model ~ '^gemini-[0-9]+(\.[0-9]+)?-[a-z0-9-]+$' AND length(model)<=64),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 last_message_at timestamptz,
 message_count integer NOT NULL DEFAULT 0 CHECK (message_count BETWEEN 0 AND 2000)
);
CREATE INDEX pwa_chat_threads_partner ON public.pwa_chat_threads(partner_id,status,last_message_at DESC);
CREATE TABLE public.pwa_chat_messages (
 id uuid PRIMARY KEY CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
 thread_id uuid NOT NULL REFERENCES public.pwa_chat_threads(id),
 seq integer NOT NULL CHECK (seq>=1),
 role text NOT NULL CHECK (role IN ('user','assistant')),
 text text NOT NULL CHECK (octet_length(text)<=16384),
 status text NOT NULL CHECK (status IN ('ok','failed')),
 model text, thinking_level text CHECK (thinking_level IN ('LOW','MEDIUM','HIGH','MAX')),
 rounds smallint CHECK (rounds>=0), attempts smallint CHECK (attempts>=0),
 prompt_tokens integer CHECK (prompt_tokens>=0), output_tokens integer CHECK (output_tokens>=0),
 thoughts_tokens integer CHECK (thoughts_tokens>=0), cached_tokens integer CHECK (cached_tokens>=0),
 latency_ms integer CHECK (latency_ms>=0),
 error_code text CHECK (error_code IN ('MODEL_UNAVAILABLE','MODEL_TIMEOUT','TOOL_ROUNDS_EXCEEDED','GROUNDING_EXCEEDED','TURN_TIMEOUT','PROMPT_BLOCKED','INTERNAL')),
 claimed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 UNIQUE (thread_id,seq),
 CHECK ((role='user')=(model IS NULL)),
 CHECK (role='assistant' OR (thinking_level IS NULL AND rounds IS NULL AND attempts IS NULL AND prompt_tokens IS NULL AND output_tokens IS NULL
  AND thoughts_tokens IS NULL AND cached_tokens IS NULL AND latency_ms IS NULL AND error_code IS NULL AND status='ok')),
 CHECK (role='user' OR claimed_at IS NULL),
 CHECK ((status='failed')=(error_code IS NOT NULL))
);
CREATE TABLE public.pwa_chat_history (
 thread_id uuid NOT NULL REFERENCES public.pwa_chat_threads(id),
 epoch integer NOT NULL CHECK (epoch>=0), seq integer NOT NULL CHECK (seq>=0),
 message_id uuid NOT NULL REFERENCES public.pwa_chat_messages(id),
 role text NOT NULL CHECK (role IN ('user','model')),
 content text NOT NULL CHECK (octet_length(content)<=1048576),
 prompt_sha256 text NOT NULL CHECK (prompt_sha256 ~ '^[0-9a-f]{64}$'),
 input_tokens integer CHECK (input_tokens>=0),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY (thread_id,epoch,seq)
);
CREATE INDEX pwa_chat_history_message ON public.pwa_chat_history(message_id);
CREATE TABLE public.pwa_chat_tool_calls (
 message_id uuid NOT NULL REFERENCES public.pwa_chat_messages(id),
 call_id text NOT NULL CHECK (octet_length(call_id) BETWEEN 1 AND 256),
 round smallint NOT NULL CHECK (round>=1), name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
 arguments text NOT NULL CHECK (octet_length(arguments)<=16384),
 result text CHECK (octet_length(result)<=262144), error text CHECK (octet_length(error)<=4096), ms integer CHECK (ms>=0),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY (message_id,call_id)
);
COMMENT ON TABLE public.pwa_chat_threads IS 'mw-access:governance partner chat threads; fixed chat RPCs only';
COMMENT ON TABLE public.pwa_chat_messages IS 'mw-access:governance partner chat messages and turn usage; append-only, fixed chat RPCs only';
COMMENT ON TABLE public.pwa_chat_history IS 'mw-access:governance partner chat model replay journal; append-only, fixed chat RPCs only';
COMMENT ON TABLE public.pwa_chat_tool_calls IS 'mw-access:governance partner chat tool-call journal; append-only, fixed chat RPCs only';

-- 3. Immutability: threads keep id, partner and creation; messages change only claimed_at of a user row; history
-- and tool calls are append-only; nothing is deleted or truncated.
CREATE FUNCTION public.pwa_chat_immutable_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME='pwa_chat_threads' THEN
   IF NEW.id=OLD.id AND NEW.partner_id=OLD.partner_id AND NEW.created_at=OLD.created_at THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME='pwa_chat_messages' THEN
   IF OLD.role='user' AND (to_jsonb(NEW)-'claimed_at')=(to_jsonb(OLD)-'claimed_at') THEN RETURN NEW; END IF;
  END IF;
 END IF;
 RAISE EXCEPTION '% on % is not allowed (append-only chat journal)',TG_OP,TG_TABLE_NAME USING ERRCODE='55000';
END $$;
CREATE TRIGGER pwa_chat_threads_guard BEFORE UPDATE OR DELETE ON public.pwa_chat_threads FOR EACH ROW EXECUTE FUNCTION public.pwa_chat_immutable_v1();
CREATE TRIGGER pwa_chat_messages_guard BEFORE UPDATE OR DELETE ON public.pwa_chat_messages FOR EACH ROW EXECUTE FUNCTION public.pwa_chat_immutable_v1();
CREATE TRIGGER pwa_chat_history_guard BEFORE UPDATE OR DELETE ON public.pwa_chat_history FOR EACH ROW EXECUTE FUNCTION public.pwa_chat_immutable_v1();
CREATE TRIGGER pwa_chat_tool_calls_guard BEFORE UPDATE OR DELETE ON public.pwa_chat_tool_calls FOR EACH ROW EXECUTE FUNCTION public.pwa_chat_immutable_v1();
CREATE TRIGGER pwa_chat_threads_truncate BEFORE TRUNCATE ON public.pwa_chat_threads FOR EACH STATEMENT EXECUTE FUNCTION public.pwa_chat_immutable_v1();
CREATE TRIGGER pwa_chat_messages_truncate BEFORE TRUNCATE ON public.pwa_chat_messages FOR EACH STATEMENT EXECUTE FUNCTION public.pwa_chat_immutable_v1();
CREATE TRIGGER pwa_chat_history_truncate BEFORE TRUNCATE ON public.pwa_chat_history FOR EACH STATEMENT EXECUTE FUNCTION public.pwa_chat_immutable_v1();
CREATE TRIGGER pwa_chat_tool_calls_truncate BEFORE TRUNCATE ON public.pwa_chat_tool_calls FOR EACH STATEMENT EXECUTE FUNCTION public.pwa_chat_immutable_v1();

-- 4. Private helpers (owner only). The actor check: the definer runs as the chat owner, the session user inherits
-- the API capability and is no member of the owner; actor = {issuer, subject, partnerId, loginEmail} of
-- canonicalActor, re-resolved against "Partners" (one trimmed lower-case "Login Email" = partnerId).
CREATE FUNCTION public.pwa_chat_actor_v1(actor jsonb) RETURNS text
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE suffix text; partner text; matches bigint;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 IF current_user<>'mw_chat_owner_'||suffix OR NOT pg_has_role(session_user,'mw_chat_api_'||suffix,'USAGE') OR pg_has_role(session_user,'mw_chat_owner_'||suffix,'MEMBER') THEN
  RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 IF actor IS NULL OR jsonb_typeof(actor)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(actor) key) IS DISTINCT FROM ARRAY['issuer','loginEmail','partnerId','subject']::text[]
  OR EXISTS(SELECT 1 FROM jsonb_each(actor) e WHERE jsonb_typeof(e.value)<>'string')
  OR actor->>'issuer'<>'https://securetoken.google.com/clever-oasis-508610-n7'
  OR coalesce(length(actor->>'subject'),0) NOT BETWEEN 1 AND 128 OR coalesce(length(actor->>'partnerId'),0) NOT BETWEEN 1 AND 256
  OR coalesce(length(actor->>'loginEmail'),0) NOT BETWEEN 1 AND 320 OR actor->>'loginEmail'<>lower(btrim(actor->>'loginEmail')) THEN
  RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 SELECT count(*),min("Row ID") INTO matches,partner FROM public."Partners" WHERE lower(btrim("Login Email"))=actor->>'loginEmail';
 IF matches<>1 OR partner IS DISTINCT FROM actor->>'partnerId' THEN RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 RETURN partner;
END $$;

CREATE FUNCTION public.pwa_chat_iso_v1(t timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,public AS $$ SELECT to_char(t AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;

CREATE FUNCTION public.pwa_chat_thread_json_v1(t public.pwa_chat_threads) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('id',t.id,'title',t.title,'model',t.model,'status',t.status,'createdAt',public.pwa_chat_iso_v1(t.created_at),
  'lastMessageAt',public.pwa_chat_iso_v1(t.last_message_at),'messageCount',t.message_count)
$$;

-- The API message shape: user rows are 'pending' while claimed (under 5 minutes) and 'failed' when the claim went
-- stale without a reply; assistant rows carry usage, the tool summary (name, count) and errorCode.
CREATE FUNCTION public.pwa_chat_message_json_v1(m public.pwa_chat_messages) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_strip_nulls(jsonb_build_object('id',m.id,'seq',m.seq,'role',m.role,'text',m.text,
  'status',CASE WHEN m.role='user' AND m.claimed_at IS NOT NULL THEN CASE WHEN m.claimed_at>clock_timestamp()-interval '5 minutes' THEN 'pending' ELSE 'failed' END ELSE m.status END,
  'model',m.model,'createdAt',public.pwa_chat_iso_v1(m.created_at),
  'usage',CASE WHEN m.role='assistant' THEN jsonb_build_object('promptTokens',coalesce(m.prompt_tokens,0),'outputTokens',coalesce(m.output_tokens,0),
   'thoughtsTokens',coalesce(m.thoughts_tokens,0),'cachedTokens',coalesce(m.cached_tokens,0),'rounds',coalesce(m.rounds,0),'latencyMs',coalesce(m.latency_ms,0)) END,
  'tools',CASE WHEN m.role='assistant' THEN (SELECT jsonb_agg(jsonb_build_object('name',x.name,'count',x.n) ORDER BY x.first_round,x.name)
   FROM (SELECT c.name,count(*) AS n,min(c.round) AS first_round FROM public.pwa_chat_tool_calls c WHERE c.message_id=m.id GROUP BY c.name) x) END,
  'errorCode',m.error_code))
$$;

-- 5. API RPCs (design §5.3; Archie resolution 12).
CREATE FUNCTION public.pwa_chat_models_default_v1(actor jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_chat_actor_v1(actor);
BEGIN
 RETURN (SELECT t.model FROM public.pwa_chat_threads t WHERE t.partner_id=partner ORDER BY t.updated_at DESC,t.id DESC LIMIT 1);
END $$;

-- One page (lim+1 rows: the extra row tells the caller another page exists), newest activity first; the cursor is
-- the sortAt of the page's last row (a thread without messages sorts by its creation).
CREATE FUNCTION public.pwa_chat_threads_v1(actor jsonb,status text,before timestamptz,lim integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_chat_actor_v1(actor);
BEGIN
 IF status IS NULL OR status NOT IN ('active','archived') OR lim IS NULL OR lim NOT BETWEEN 1 AND 50 OR (before IS NOT NULL AND NOT isfinite(before)) THEN
  RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 RETURN coalesce((SELECT jsonb_agg(public.pwa_chat_thread_json_v1(x.t)||jsonb_build_object('sortAt',to_char(x.sort_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY x.sort_at DESC,(x.t).id DESC)
  FROM (SELECT t,coalesce(t.last_message_at,t.created_at) AS sort_at FROM public.pwa_chat_threads t
   WHERE t.partner_id=partner AND t.status=$2 AND (before IS NULL OR coalesce(t.last_message_at,t.created_at)<before)
   ORDER BY coalesce(t.last_message_at,t.created_at) DESC,t.id DESC LIMIT lim+1) x),'[]'::jsonb);
END $$;

-- Idempotent create: the same id by the same Partner answers the existing row; another Partner's id is refused
-- with SQLSTATE 42501 and message not_found (the API answers 404: no existence leak).
CREATE FUNCTION public.pwa_chat_thread_create_v1(actor jsonb,thread jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); row_value public.pwa_chat_threads; thread_id uuid; title_value text;
BEGIN
 IF thread IS NULL OR jsonb_typeof(thread)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(thread) k WHERE k NOT IN ('id','model','title'))
  OR jsonb_typeof(thread->'id') IS DISTINCT FROM 'string' OR thread->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  OR jsonb_typeof(thread->'model') IS DISTINCT FROM 'string' OR thread->>'model' !~ '^gemini-[0-9]+(\.[0-9]+)?-[a-z0-9-]+$' OR length(thread->>'model')>64
  OR (thread ? 'title' AND jsonb_typeof(thread->'title')<>'null' AND (jsonb_typeof(thread->'title')<>'string' OR length(thread->>'title') NOT BETWEEN 1 AND 120 OR thread->>'title'<>btrim(thread->>'title') OR thread->>'title' ~ '[[:cntrl:]]')) THEN
  RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 thread_id:=(thread->>'id')::uuid;title_value:=coalesce(nullif(thread->>'title',''),'New chat');
 INSERT INTO public.pwa_chat_threads(id,partner_id,title,model) VALUES(thread_id,partner,title_value,thread->>'model') ON CONFLICT (id) DO NOTHING RETURNING * INTO row_value;
 IF FOUND THEN RETURN jsonb_build_object('created',true,'item',public.pwa_chat_thread_json_v1(row_value)); END IF;
 SELECT * INTO row_value FROM public.pwa_chat_threads t WHERE t.id=thread_id;
 IF row_value.partner_id IS DISTINCT FROM partner THEN RAISE EXCEPTION 'not_found' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('created',false,'item',public.pwa_chat_thread_json_v1(row_value));
END $$;

CREATE FUNCTION public.pwa_chat_thread_update_v1(actor jsonb,id uuid,patch jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); row_value public.pwa_chat_threads;
BEGIN
 IF patch IS NULL OR jsonb_typeof(patch)<>'object' OR NOT EXISTS(SELECT 1 FROM jsonb_object_keys(patch)) OR EXISTS(SELECT 1 FROM jsonb_object_keys(patch) k WHERE k NOT IN ('title','model','status'))
  OR (patch ? 'title' AND (jsonb_typeof(patch->'title')<>'string' OR length(patch->>'title') NOT BETWEEN 1 AND 120 OR patch->>'title'<>btrim(patch->>'title') OR patch->>'title' ~ '[[:cntrl:]]'))
  OR (patch ? 'model' AND (jsonb_typeof(patch->'model')<>'string' OR patch->>'model' !~ '^gemini-[0-9]+(\.[0-9]+)?-[a-z0-9-]+$' OR length(patch->>'model')>64))
  OR (patch ? 'status' AND (jsonb_typeof(patch->'status')<>'string' OR patch->>'status' NOT IN ('active','archived'))) THEN
  RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 UPDATE public.pwa_chat_threads t SET title=coalesce(patch->>'title',t.title),model=coalesce(patch->>'model',t.model),status=coalesce(patch->>'status',t.status),updated_at=clock_timestamp()
 WHERE t.id=$2 AND t.partner_id=partner RETURNING * INTO row_value;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 RETURN public.pwa_chat_thread_json_v1(row_value);
END $$;

-- One page of messages (lim+1 rows, newest first; the caller shows them oldest first).
CREATE FUNCTION public.pwa_chat_messages_v1(actor jsonb,thread uuid,before integer,lim integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_chat_actor_v1(actor);
BEGIN
 IF lim IS NULL OR lim NOT BETWEEN 1 AND 50 OR (before IS NOT NULL AND before<1) THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pwa_chat_threads t WHERE t.id=thread AND t.partner_id=partner) THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 RETURN coalesce((SELECT jsonb_agg(public.pwa_chat_message_json_v1(x.m) ORDER BY (x.m).seq DESC)
  FROM (SELECT m FROM public.pwa_chat_messages m WHERE m.thread_id=thread AND (before IS NULL OR m.seq<before) ORDER BY m.seq DESC LIMIT lim+1) x),'[]'::jsonb);
END $$;

-- The outcome of one turn: the user message and its reply (seq + 1), or null while none exists.
CREATE FUNCTION public.pwa_chat_message_v1(actor jsonb,thread uuid,message uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); u public.pwa_chat_messages; a public.pwa_chat_messages;
BEGIN
 SELECT m.* INTO u FROM public.pwa_chat_messages m JOIN public.pwa_chat_threads t ON t.id=m.thread_id
 WHERE m.id=message AND m.thread_id=thread AND m.role='user' AND t.partner_id=partner;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO a FROM public.pwa_chat_messages m WHERE m.thread_id=u.thread_id AND m.seq=u.seq+1 AND m.role='assistant';
 RETURN jsonb_build_object('user',public.pwa_chat_message_json_v1(u),'assistant',CASE WHEN a.id IS NULL THEN 'null'::jsonb ELSE public.pwa_chat_message_json_v1(a) END);
END $$;

-- Claims a turn. message = {id, text}. A thread with a user row claimed under 5 minutes ago (and no reply) raises
-- 55006 turn_in_progress; the same id after its reply answers completed; a stale claim is re-claimed in place.
-- A new user row takes the next seq after every row and every reserved reply slot (user seq + 1). Returns the
-- thread, the Partner's language, the rows of the highest history epoch and up to 200 completed exchanges.
CREATE FUNCTION public.pwa_chat_turn_begin_v1(actor jsonb,thread uuid,message jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); t public.pwa_chat_threads; u public.pwa_chat_messages; a public.pwa_chat_messages;
 message_id uuid; next_seq integer; top_epoch integer; history_rows jsonb; seed jsonb; partner_language text;
BEGIN
 IF message IS NULL OR jsonb_typeof(message)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(message) key) IS DISTINCT FROM ARRAY['id','text']::text[]
  OR jsonb_typeof(message->'id')<>'string' OR message->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  OR jsonb_typeof(message->'text')<>'string' OR length(message->>'text') NOT BETWEEN 1 AND 4000 OR octet_length(message->>'text')>16384 THEN
  RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 message_id:=(message->>'id')::uuid;
 SELECT * INTO t FROM public.pwa_chat_threads x WHERE x.id=thread AND x.partner_id=partner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO u FROM public.pwa_chat_messages m WHERE m.id=message_id;
 IF FOUND THEN
  IF u.thread_id<>t.id OR u.role<>'user' THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
  IF u.text<>message->>'text' THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  SELECT * INTO a FROM public.pwa_chat_messages m WHERE m.thread_id=t.id AND m.seq=u.seq+1 AND m.role='assistant';
  IF FOUND THEN RETURN jsonb_build_object('state','completed','user',public.pwa_chat_message_json_v1(u),'assistant',public.pwa_chat_message_json_v1(a)); END IF;
  IF EXISTS(SELECT 1 FROM public.pwa_chat_messages m WHERE m.thread_id=t.id AND m.role='user' AND m.claimed_at>clock_timestamp()-interval '5 minutes') THEN
   RAISE EXCEPTION 'turn_in_progress' USING ERRCODE='55006'; END IF;
  UPDATE public.pwa_chat_messages m SET claimed_at=clock_timestamp() WHERE m.id=u.id RETURNING * INTO u;
 ELSE
  IF t.status<>'active' THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.pwa_chat_messages m WHERE m.thread_id=t.id AND m.role='user' AND m.claimed_at>clock_timestamp()-interval '5 minutes') THEN
   RAISE EXCEPTION 'turn_in_progress' USING ERRCODE='55006'; END IF;
  IF t.message_count+2>2000 THEN RAISE EXCEPTION 'thread_full' USING ERRCODE='54000'; END IF;
  SELECT coalesce(max(CASE WHEN m.role='user' THEN m.seq+1 ELSE m.seq END),0)+1 INTO next_seq FROM public.pwa_chat_messages m WHERE m.thread_id=t.id;
  INSERT INTO public.pwa_chat_messages(id,thread_id,seq,role,text,status,claimed_at) VALUES(message_id,t.id,next_seq,'user',message->>'text','ok',clock_timestamp()) RETURNING * INTO u;
  UPDATE public.pwa_chat_threads x SET message_count=x.message_count+1 WHERE x.id=t.id RETURNING * INTO t;
 END IF;
 SELECT max(h.epoch) INTO top_epoch FROM public.pwa_chat_history h WHERE h.thread_id=t.id;
 SELECT jsonb_agg(jsonb_build_object('seq',h.seq,'role',h.role,'content',h.content,'prompt_sha256',h.prompt_sha256,'input_tokens',h.input_tokens) ORDER BY h.seq)
  INTO history_rows FROM public.pwa_chat_history h WHERE h.thread_id=t.id AND h.epoch=top_epoch;
 SELECT coalesce(jsonb_agg(x.e ORDER BY x.seq),'[]'::jsonb) INTO seed FROM (
  SELECT q.seq,jsonb_build_object('userText',q.text,'userAt',public.pwa_chat_iso_v1(q.created_at),'assistantText',r.text,'assistantStatus',r.status,'assistantAt',public.pwa_chat_iso_v1(r.created_at)) AS e
  FROM public.pwa_chat_messages q JOIN public.pwa_chat_messages r ON r.thread_id=q.thread_id AND r.seq=q.seq+1 AND r.role='assistant'
  WHERE q.thread_id=t.id AND q.role='user' AND q.id<>u.id ORDER BY q.seq DESC LIMIT 200) x;
 SELECT p."Language Preference" INTO partner_language FROM public."Partners" p WHERE p."Row ID"=partner;
 RETURN jsonb_build_object('state','claimed','message',jsonb_build_object('id',u.id,'seq',u.seq,'createdAt',public.pwa_chat_iso_v1(u.created_at)),
  'thread',jsonb_build_object('id',t.id,'model',t.model,'title',t.title,'messageCount',t.message_count),'partnerLanguage',partner_language,
  'history',CASE WHEN history_rows IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('epoch',top_epoch,'rows',history_rows) END,'seed',seed);
END $$;

-- Completes a turn in one transaction: the reply at seq = user seq + 1 (a late completion after a re-claim fails on
-- UNIQUE (thread_id, seq)), the history rows of a finished turn (none for a failed one; epoch and seq must
-- continue the highest epoch or open the next), the tool-call rows, the claim cleared, message_count and
-- last_message_at, and the "New chat" placeholder title replaced by the first line of the first message.
CREATE FUNCTION public.pwa_chat_turn_complete_v1(actor jsonb,message_id uuid,assistant jsonb,history jsonb,tool_calls jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); t public.pwa_chat_threads; u public.pwa_chat_messages; a public.pwa_chat_messages;
 top_epoch integer; top_seq integer; item jsonb; offset_value integer:=0; total integer; first_line text; n text;
BEGIN
 SELECT m.* INTO u FROM public.pwa_chat_messages m JOIN public.pwa_chat_threads x ON x.id=m.thread_id WHERE m.id=message_id AND m.role='user' AND x.partner_id=partner;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO t FROM public.pwa_chat_threads x WHERE x.id=u.thread_id FOR UPDATE;
 IF assistant IS NULL OR jsonb_typeof(assistant)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(assistant) key) IS DISTINCT FROM
   ARRAY['attempts','cachedTokens','errorCode','latencyMs','model','outputTokens','promptTokens','rounds','status','text','thinkingLevel','thoughtsTokens']::text[]
  OR assistant->>'status' NOT IN ('ok','failed') OR jsonb_typeof(assistant->'text')<>'string' OR jsonb_typeof(assistant->'model')<>'string'
  OR ((assistant->>'status')='ok')<>(jsonb_typeof(assistant->'errorCode')='null')
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['attempts','cachedTokens','latencyMs','outputTokens','promptTokens','rounds','thoughtsTokens']) k
   WHERE jsonb_typeof(assistant->k)<>'number' OR (assistant->>k)::numeric<0 OR (assistant->>k)::numeric<>trunc((assistant->>k)::numeric) OR (assistant->>k)::numeric>2147483647)
  OR (assistant->>'status'='ok' AND history IS NULL) OR (assistant->>'status'='failed' AND history IS NOT NULL AND jsonb_typeof(history)<>'null')
  OR tool_calls IS NULL OR jsonb_typeof(tool_calls)<>'array' OR jsonb_array_length(tool_calls)>1000 THEN
  RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 INSERT INTO public.pwa_chat_messages(id,thread_id,seq,role,text,status,model,thinking_level,rounds,attempts,prompt_tokens,output_tokens,thoughts_tokens,cached_tokens,latency_ms,error_code)
 VALUES(gen_random_uuid(),u.thread_id,u.seq+1,'assistant',assistant->>'text',assistant->>'status',assistant->>'model',assistant->>'thinkingLevel',
  least((assistant->>'rounds')::integer,32767),least((assistant->>'attempts')::integer,32767),(assistant->>'promptTokens')::integer,(assistant->>'outputTokens')::integer,
  (assistant->>'thoughtsTokens')::integer,(assistant->>'cachedTokens')::integer,(assistant->>'latencyMs')::integer,assistant->>'errorCode') RETURNING * INTO a;
 IF assistant->>'status'='ok' THEN
  IF jsonb_typeof(history)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(history) key) IS DISTINCT FROM ARRAY['epoch','inputTokens','messages','promptSha256','seq']::text[]
   OR jsonb_typeof(history->'epoch')<>'number' OR jsonb_typeof(history->'seq')<>'number' OR jsonb_typeof(history->'messages')<>'array' OR jsonb_array_length(history->'messages')<1
   OR coalesce(history->>'promptSha256','') !~ '^[0-9a-f]{64}$' OR jsonb_typeof(history->'inputTokens') NOT IN ('number','null') THEN
   RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  SELECT max(h.epoch) INTO top_epoch FROM public.pwa_chat_history h WHERE h.thread_id=u.thread_id;
  SELECT max(h.seq) INTO top_seq FROM public.pwa_chat_history h WHERE h.thread_id=u.thread_id AND h.epoch=top_epoch;
  IF NOT ((top_epoch IS NULL AND (history->>'epoch')::integer=0 AND (history->>'seq')::integer=0)
   OR ((history->>'epoch')::integer=top_epoch AND (history->>'seq')::integer=top_seq+1)
   OR ((history->>'epoch')::integer=top_epoch+1 AND (history->>'seq')::integer=0)) THEN
   RAISE EXCEPTION 'history_conflict' USING ERRCODE='40001'; END IF;
  total:=jsonb_array_length(history->'messages');
  FOR item IN SELECT value FROM jsonb_array_elements(history->'messages') LOOP
   IF jsonb_typeof(item)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(item) key) IS DISTINCT FROM ARRAY['content','role']::text[]
    OR item->>'role' NOT IN ('user','model') OR jsonb_typeof(item->'content')<>'string' THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
   INSERT INTO public.pwa_chat_history(thread_id,epoch,seq,message_id,role,content,prompt_sha256,input_tokens)
   VALUES(u.thread_id,(history->>'epoch')::integer,(history->>'seq')::integer+offset_value,u.id,item->>'role',item->>'content',history->>'promptSha256',
    CASE WHEN offset_value=total-1 THEN (history->>'inputTokens')::integer END);
   offset_value:=offset_value+1;
  END LOOP;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(tool_calls) LOOP
  IF jsonb_typeof(item)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(item) key) IS DISTINCT FROM ARRAY['arguments','callId','error','ms','name','result','round']::text[]
   OR jsonb_typeof(item->'callId')<>'string' OR jsonb_typeof(item->'name')<>'string' OR jsonb_typeof(item->'arguments')<>'string' OR jsonb_typeof(item->'round')<>'number'
   OR jsonb_typeof(item->'result') NOT IN ('string','null') OR jsonb_typeof(item->'error') NOT IN ('string','null') OR jsonb_typeof(item->'ms') NOT IN ('number','null') THEN
   RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  INSERT INTO public.pwa_chat_tool_calls(message_id,call_id,round,name,arguments,result,error,ms)
  VALUES(a.id,item->>'callId',(item->>'round')::smallint,item->>'name',item->>'arguments',item->>'result',item->>'error',(item->>'ms')::integer);
 END LOOP;
 UPDATE public.pwa_chat_messages m SET claimed_at=NULL WHERE m.id=u.id AND m.claimed_at IS NOT NULL;
 first_line:=left(btrim(split_part(btrim(u.text,E' \t\r\n'),E'\n',1),E' \t\r'),120);
 n:=CASE WHEN t.title='New chat' AND first_line<>'' AND first_line !~ '[[:cntrl:]]' THEN first_line ELSE t.title END;
 UPDATE public.pwa_chat_threads x SET message_count=x.message_count+1,last_message_at=clock_timestamp(),title=n WHERE x.id=t.id;
 RETURN public.pwa_chat_message_json_v1(a);
END $$;

-- 6. Cost page read model (design §5.4): the last n questions (1..50) with the reply's model, status and token
-- totals, the shape of the agent's monitoring.recent_questions_v1 (input_tokens include the cached part).
CREATE SCHEMA IF NOT EXISTS monitoring;
CREATE FUNCTION monitoring.pwa_chat_recent_questions_v1(p_limit integer DEFAULT 10)
RETURNS TABLE(asked_at timestamptz,question text,status text,provider text,model text,rounds integer,
 input_tokens bigint,cached_tokens bigint,output_tokens bigint,thinking_tokens bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT q.created_at,left(q.text,1000),coalesce(r.status,CASE WHEN q.claimed_at>clock_timestamp()-interval '5 minutes' THEN 'pending' ELSE 'unanswered' END),
  'gemini'::text,r.model,r.rounds::integer,r.prompt_tokens::bigint,r.cached_tokens::bigint,r.output_tokens::bigint,r.thoughts_tokens::bigint
 FROM (SELECT m.thread_id,m.seq,m.text,m.created_at,m.claimed_at FROM public.pwa_chat_messages m WHERE m.role='user'
  ORDER BY m.created_at DESC,m.seq DESC LIMIT least(greatest(coalesce(p_limit,10),1),50)) q
 LEFT JOIN public.pwa_chat_messages r ON r.thread_id=q.thread_id AND r.seq=q.seq+1 AND r.role='assistant'
 ORDER BY q.created_at DESC,q.seq DESC
$$;

-- 7. ACL and ownership (grants and comments while the runner still owns the objects, then the owner change).
DO $ownership$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 chat_owner text; api text; reader text; signature text; relation_name text; runner text:=current_user; superuser boolean;
 api_functions text[]:=ARRAY['public.pwa_chat_models_default_v1(jsonb)','public.pwa_chat_threads_v1(jsonb,text,timestamptz,integer)',
  'public.pwa_chat_thread_create_v1(jsonb,jsonb)','public.pwa_chat_thread_update_v1(jsonb,uuid,jsonb)','public.pwa_chat_messages_v1(jsonb,uuid,integer,integer)',
  'public.pwa_chat_message_v1(jsonb,uuid,uuid)','public.pwa_chat_turn_begin_v1(jsonb,uuid,jsonb)','public.pwa_chat_turn_complete_v1(jsonb,uuid,jsonb,jsonb,jsonb)'];
 private_functions text[]:=ARRAY['public.pwa_chat_actor_v1(jsonb)','public.pwa_chat_iso_v1(timestamptz)','public.pwa_chat_thread_json_v1(public.pwa_chat_threads)',
  'public.pwa_chat_message_json_v1(public.pwa_chat_messages)','public.pwa_chat_immutable_v1()'];
 tables text[]:=ARRAY['pwa_chat_threads','pwa_chat_messages','pwa_chat_history','pwa_chat_tool_calls'];
BEGIN
 chat_owner:='mw_chat_owner_'||suffix;api:='mw_chat_api_'||suffix;reader:='mw_chat_read_'||suffix;
 SELECT rolsuper INTO superuser FROM pg_roles WHERE rolname=current_user;
 EXECUTE format('GRANT USAGE ON SCHEMA public TO %I,%I',chat_owner,api);
 EXECUTE format('GRANT SELECT ("Row ID","Login Email","Language Preference") ON public."Partners" TO %I',chat_owner);
 FOREACH relation_name IN ARRAY tables LOOP
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,%I,%I',relation_name,api,reader);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent') THEN EXECUTE format('REVOKE ALL ON public.%I FROM mw_integration_agent',relation_name); END IF;
  EXECUTE format('ALTER TABLE public.%I OWNER TO %I',relation_name,chat_owner);
 END LOOP;
 FOREACH signature IN ARRAY api_functions||private_functions LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',signature::regprocedure);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent') THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM mw_integration_agent',signature::regprocedure); END IF;
  EXECUTE format('COMMENT ON FUNCTION %s IS %L',signature::regprocedure,'mw-access:governance fixed chat boundary; explicit capability only');
 END LOOP;
 FOREACH signature IN ARRAY api_functions LOOP EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',signature::regprocedure,api); END LOOP;
 FOREACH signature IN ARRAY api_functions||private_functions LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO %I',signature::regprocedure,chat_owner); END LOOP;
 -- The monitoring definer (postgres) reads exactly its columns, granted by (or as) the table owner (V102 pattern).
 REVOKE ALL ON FUNCTION monitoring.pwa_chat_recent_questions_v1(integer) FROM PUBLIC;
 COMMENT ON FUNCTION monitoring.pwa_chat_recent_questions_v1(integer) IS 'mw-access:monitoring last partner chat questions and token counts for the Cost page; explicit capability only';
 IF superuser OR pg_has_role(runner,chat_owner,'USAGE') THEN
  EXECUTE format('GRANT SELECT (id, thread_id, seq, role, text, status, model, rounds, prompt_tokens, cached_tokens, output_tokens, thoughts_tokens, claimed_at, created_at) ON public.pwa_chat_messages TO %I',runner);
 ELSE
  EXECUTE format('SET ROLE %I',chat_owner);
  EXECUTE format('GRANT SELECT (id, thread_id, seq, role, text, status, model, rounds, prompt_tokens, cached_tokens, output_tokens, thoughts_tokens, claimed_at, created_at) ON public.pwa_chat_messages TO %I',runner);
  RESET ROLE;
 END IF;
 -- The Grafana reader's role (agent bootstrap, cluster-wide) when present; the Cost page switches to it in phase 3.
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_agent_dashboard') THEN
  GRANT USAGE ON SCHEMA monitoring TO mw_agent_dashboard;
  GRANT EXECUTE ON FUNCTION monitoring.pwa_chat_recent_questions_v1(integer) TO mw_agent_dashboard;
 END IF;
END $ownership$;

-- 8. Self-check: owner, definer mode, pinned search_path, boundary comments and exactly the intended grantees.
DO $check$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; chat_owner text; api text; bad text;
BEGIN
 chat_owner:='mw_chat_owner_'||suffix;api:='mw_chat_api_'||suffix;
 SELECT string_agg(p.oid::regprocedure::text,', ') INTO bad FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'pwa\_chat\_%'
  AND (pg_get_userbyid(p.proowner)<>chat_owner OR NOT ('search_path=pg_catalog, public'=ANY(p.proconfig))
   OR (p.proname IN ('pwa_chat_models_default_v1','pwa_chat_threads_v1','pwa_chat_thread_create_v1','pwa_chat_thread_update_v1','pwa_chat_messages_v1','pwa_chat_message_v1','pwa_chat_turn_begin_v1','pwa_chat_turn_complete_v1'))<>p.prosecdef
   OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM 'mw-access:governance fixed chat boundary; explicit capability only'
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' AND a.grantee<>p.proowner
    AND NOT (a.grantee=api::regrole AND p.prosecdef)));
 IF bad IS NOT NULL OR (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'pwa\_chat\_%')<>13 THEN
  RAISE EXCEPTION 'V104: chat routines must be the chat owner''s pinned functions, definers executable only by %: %',api,coalesce(bad,'count'); END IF;
 SELECT string_agg(c.relname,', ') INTO bad FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname LIKE 'pwa\_chat\_%' AND c.relkind='r'
  AND (pg_get_userbyid(c.relowner)<>chat_owner OR EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner));
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V104: chat tables must be owned by % with no other table grant: %',chat_owner,bad; END IF;
 IF NOT (SELECT prosecdef AND provolatile='s' AND pg_get_userbyid(proowner)='postgres' AND 'search_path=pg_catalog, public'=ANY(proconfig)
   FROM pg_proc WHERE oid='monitoring.pwa_chat_recent_questions_v1(integer)'::regprocedure)
  OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='monitoring.pwa_chat_recent_questions_v1(integer)'::regprocedure
   AND a.privilege_type='EXECUTE' AND a.grantee<>p.proowner AND pg_get_userbyid(a.grantee)<>'mw_agent_dashboard') THEN
  RAISE EXCEPTION 'V104: monitoring.pwa_chat_recent_questions_v1 must be postgres''s pinned STABLE definer executable only by the dashboard role'; END IF;
END $check$;
