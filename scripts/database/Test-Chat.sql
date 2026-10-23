-- V104 (R090): the chat tables and RPCs under the real roles, at the migration head, in a disposable loopback
-- cluster. One rolled-back transaction with synthetic Partners: idempotent thread create and the other Partner's
-- refusal, the turn claim (live claim 55006, completed re-POST, stale re-claim in place), completion (reply at
-- seq + 1, history continuing the highest epoch, tool calls and their summary, claim cleared, message_count,
-- last_message_at, the "New chat" title from the first line), a failed turn without history, the late completion
-- refused by UNIQUE (thread_id, seq), history conflicts, paging, the outcome read, per-Partner 404s, archive,
-- thread_full (54000), the append-only triggers (55000), the capability boundary (no EXECUTE without
-- mw_chat_api_dev; mw_chat_read_dev reads no chat table and calls no chat RPC) and the Cost page function.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal') OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'Disposable loopback database required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.pwa_chat_turn_begin_v1(jsonb,uuid,jsonb)'::regprocedure
  AND prosecdef AND pg_get_userbyid(proowner)='mw_chat_owner_dev' AND 'search_path=pg_catalog, public'=ANY(proconfig)) THEN
  RAISE EXCEPTION 'V104: chat RPC ownership/security drift'; END IF;
END $$;
INSERT INTO "Partners"("Row ID","Partner Role","Partner Name","Login Email","Email","Language Preference") VALUES
 ('CH-A','A','Chat A','ch-a@example.invalid','ch-a@example.invalid','ไทย'),
 ('CH-B','B','Chat B','ch-b@example.invalid','ch-b@example.invalid','English');
CREATE FUNCTION pg_temp.actor(p text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('issuer','https://securetoken.google.com/clever-oasis-508610-n7','subject','sub-'||p,'partnerId','CH-'||upper(p),'loginEmail','ch-'||p||'@example.invalid') $$;
-- Expects one SQLSTATE (and message, when given) from a statement.
CREATE FUNCTION pg_temp.expect(statement text,state text,message text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 EXECUTE statement;
 RAISE EXCEPTION 'expected % from: %',state,statement USING ERRCODE='P0004';
EXCEPTION WHEN OTHERS THEN
 IF SQLSTATE='P0004' THEN RAISE; END IF;
 IF SQLSTATE<>state OR (message IS NOT NULL AND SQLERRM<>message) THEN RAISE EXCEPTION 'expected % % from %, got % %',state,coalesce(message,''),statement,SQLSTATE,SQLERRM; END IF;
END $$;
CREATE FUNCTION pg_temp.assistant(status text,code text DEFAULT NULL) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('status',status,'text',CASE WHEN status='ok' THEN 'Due now: ฿1,000' ELSE 'ดำเนินการไม่สำเร็จ กรุณาตรวจสอบในแอปก่อนส่งคำขออีกครั้ง' END,
  'model','gemini-4-argon','thinkingLevel','MEDIUM','rounds',2,'attempts',3,'promptTokens',1200,'outputTokens',80,'thoughtsTokens',40,'cachedTokens',600,'latencyMs',4321,'errorCode',code) $$;
CREATE FUNCTION pg_temp.history(epoch integer,seq integer,n integer) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('epoch',epoch,'seq',seq,'promptSha256',repeat('a',64),'inputTokens',1500,
  'messages',(SELECT jsonb_agg(jsonb_build_object('role',CASE WHEN i%2=0 THEN 'user' ELSE 'model' END,'content','[{"text":"part '||i||'"}]') ORDER BY i) FROM generate_series(0,n-1) i)) $$;
GRANT EXECUTE ON FUNCTION pg_temp.actor(text),pg_temp.expect(text,text,text),pg_temp.assistant(text,text),pg_temp.history(integer,integer,integer) TO PUBLIC;
CREATE ROLE v104_chat_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT mw_chat_api_dev TO v104_chat_api WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
CREATE ROLE v104_chat_other LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO v104_chat_api,v104_chat_other;

-- A. Threads, turns and completion as the API capability.
SET SESSION AUTHORIZATION v104_chat_api;
DO $$
DECLARE a jsonb:=pg_temp.actor('a'); b jsonb:=pg_temp.actor('b'); r jsonb; t1 uuid:='11111111-1111-4111-8111-111111111111'; t2 uuid:='22222222-2222-4222-8222-222222222222';
 m1 uuid:='a1111111-1111-4111-8111-111111111111'; m2 uuid:='a2222222-2222-4222-8222-222222222222'; m3 uuid:='a3333333-3333-4333-8333-333333333333'; m4 uuid:='a4444444-4444-4444-8444-444444444444';
 calls jsonb:='[{"callId":"c1","round":1,"name":"read_records","arguments":"{}","result":"{}","error":null,"ms":12},{"callId":"c2","round":1,"name":"sql_query","arguments":"{}","result":null,"error":"SQL_ERROR 42703: x","ms":5},{"callId":"c3","round":2,"name":"read_records","arguments":"{}","result":"{}","error":null,"ms":7}]';
BEGIN
 IF public.pwa_chat_models_default_v1(a) IS NOT NULL THEN RAISE EXCEPTION 'no thread yet: default must be null'; END IF;
 r:=public.pwa_chat_thread_create_v1(a,jsonb_build_object('id',t1,'model','gemini-4-argon'));
 IF r->>'created'<>'true' OR r#>>'{item,title}'<>'New chat' OR r#>>'{item,status}'<>'active' OR (r#>>'{item,messageCount}')::int<>0 OR r#>'{item,lastMessageAt}'<>'null'::jsonb THEN RAISE EXCEPTION 'create %',r; END IF;
 r:=public.pwa_chat_thread_create_v1(a,jsonb_build_object('id',t1,'model','gemini-3.8-flash','title','ignored'));
 IF r->>'created'<>'false' OR r#>>'{item,model}'<>'gemini-4-argon' THEN RAISE EXCEPTION 'idempotent create %',r; END IF;
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_thread_create_v1(%L::jsonb,%L::jsonb)',b,jsonb_build_object('id',t1,'model','gemini-4-argon')),'42501','not_found');
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_thread_create_v1(%L::jsonb,%L::jsonb)',a,jsonb_build_object('id',t2,'model','claude-x')),'22023','invalid_request');
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_thread_create_v1(%L::jsonb,%L::jsonb)',a,jsonb_build_object('id',t2,'model','gemini-4-argon','title',E'a\nb')),'22023','invalid_request');
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_thread_create_v1(%L::jsonb,%L::jsonb)',jsonb_set(a,'{partnerId}','"CH-B"'),jsonb_build_object('id',t2,'model','gemini-4-argon')),'42501','access_denied');
 r:=public.pwa_chat_thread_create_v1(a,jsonb_build_object('id',t2,'model','gemini-3.8-flash','title','Second'));
 IF public.pwa_chat_models_default_v1(a)<>'gemini-3.8-flash' THEN RAISE EXCEPTION 'default model is the last choice'; END IF;

 -- Claim, live-claim refusal, completion.
 r:=public.pwa_chat_turn_begin_v1(a,t1,jsonb_build_object('id',m1,'text',E'  What is due today?\nfor everyone'));
 IF r->>'state'<>'claimed' OR (r#>>'{message,seq}')::int<>1 OR r->'history'<>'null'::jsonb OR r->'seed'<>'[]'::jsonb OR r->>'partnerLanguage'<>'ไทย'
  OR r#>>'{thread,model}'<>'gemini-4-argon' OR (r#>>'{thread,messageCount}')::int<>1 THEN RAISE EXCEPTION 'claim %',r; END IF;
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_turn_begin_v1(%L::jsonb,%L::uuid,%L::jsonb)',a,t1,jsonb_build_object('id',m2,'text','next')),'55006','turn_in_progress');
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_turn_begin_v1(%L::jsonb,%L::uuid,%L::jsonb)',a,t1,jsonb_build_object('id',m1,'text',E'  What is due today?\nfor everyone')),'55006','turn_in_progress');
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_turn_begin_v1(%L::jsonb,%L::uuid,%L::jsonb)',a,t1,jsonb_build_object('id',m1,'text','changed')),'22023','invalid_request');
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_turn_begin_v1(%L::jsonb,%L::uuid,%L::jsonb)',b,t1,jsonb_build_object('id',m2,'text','next')),'P0002','not_found');
 IF (public.pwa_chat_message_v1(a,t1,m1)#>>'{user,status}')<>'pending' OR public.pwa_chat_message_v1(a,t1,m1)->'assistant'<>'null'::jsonb THEN RAISE EXCEPTION 'pending outcome'; END IF;
 r:=public.pwa_chat_turn_complete_v1(a,m1,pg_temp.assistant('ok'),pg_temp.history(0,0,3),calls);
 IF (r->>'seq')::int<>2 OR r->>'role'<>'assistant' OR r->>'status'<>'ok' OR r->>'model'<>'gemini-4-argon' OR r->'errorCode' IS NOT NULL
  OR r->'usage'<>'{"rounds":2,"latencyMs":4321,"outputTokens":80,"cachedTokens":600,"promptTokens":1200,"thoughtsTokens":40}'::jsonb
  OR r->'tools'<>'[{"name":"read_records","count":2},{"name":"sql_query","count":1}]'::jsonb THEN RAISE EXCEPTION 'complete %',r; END IF;
 r:=public.pwa_chat_turn_begin_v1(a,t1,jsonb_build_object('id',m1,'text',E'  What is due today?\nfor everyone'));
 IF r->>'state'<>'completed' OR r#>>'{user,id}'<>m1::text OR r#>>'{user,status}'<>'ok' OR (r#>>'{assistant,seq}')::int<>2 THEN RAISE EXCEPTION 're-POST after completion %',r; END IF;

 -- Next turn replays the highest epoch and seeds without the current message; a failed turn writes no history.
 r:=public.pwa_chat_turn_begin_v1(a,t1,jsonb_build_object('id',m2,'text','And tomorrow?'));
 IF (r#>>'{message,seq}')::int<>3 OR (r#>>'{history,epoch}')::int<>0 OR jsonb_array_length(r#>'{history,rows}')<>3 OR r#>>'{history,rows,2,content}'<>'[{"text":"part 2"}]'
  OR (r#>>'{history,rows,2,input_tokens}')::int<>1500 OR r#>'{history,rows,0,input_tokens}'<>'null'::jsonb OR jsonb_array_length(r->'seed')<>1
  OR r#>>'{seed,0,userText}'<>E'  What is due today?\nfor everyone' OR r#>>'{seed,0,assistantStatus}'<>'ok' OR r#>>'{seed,0,assistantText}'<>'Due now: ฿1,000' THEN RAISE EXCEPTION 'second claim %',r; END IF;
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_turn_complete_v1(%L::jsonb,%L::uuid,%L::jsonb,%L::jsonb,%L::jsonb)',a,m2,pg_temp.assistant('failed','TURN_TIMEOUT'),pg_temp.history(0,3,1),'[]'),'22023','invalid_request');
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_turn_complete_v1(%L::jsonb,%L::uuid,%L::jsonb,%L::jsonb,%L::jsonb)',a,m2,pg_temp.assistant('ok'),pg_temp.history(0,5,1),'[]'),'40001','history_conflict');
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_turn_complete_v1(%L::jsonb,%L::uuid,%L::jsonb,%L::jsonb,%L::jsonb)',a,m2,pg_temp.assistant('ok'),pg_temp.history(2,0,1),'[]'),'40001','history_conflict');
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_turn_complete_v1(%L::jsonb,%L::uuid,%L::jsonb,%L::jsonb,%L::jsonb)',b,m2,pg_temp.assistant('failed','TURN_TIMEOUT'),'null','[]'),'P0002','not_found');
 r:=public.pwa_chat_turn_complete_v1(a,m2,pg_temp.assistant('failed','TURN_TIMEOUT'),NULL,'[{"callId":"gemini-1-0","round":1,"name":"sql_query","arguments":"{}","result":null,"error":"TOOL_TIMEOUT","ms":null}]');
 IF (r->>'seq')::int<>4 OR r->>'status'<>'failed' OR r->>'errorCode'<>'TURN_TIMEOUT' OR r->>'text'<>'ดำเนินการไม่สำเร็จ กรุณาตรวจสอบในแอปก่อนส่งคำขออีกครั้ง' THEN RAISE EXCEPTION 'failed complete %',r; END IF;
 -- The late completion of the same turn (after a re-claim elsewhere) fails on UNIQUE (thread_id, seq).
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_turn_complete_v1(%L::jsonb,%L::uuid,%L::jsonb,%L::jsonb,%L::jsonb)',a,m2,pg_temp.assistant('ok'),pg_temp.history(0,3,1),'[]'),'23505');

 -- New epoch rows start at seq 0; paging and the outcome read.
 r:=public.pwa_chat_turn_begin_v1(a,t1,jsonb_build_object('id',m3,'text','Third'));
 IF (r#>>'{message,seq}')::int<>5 OR jsonb_array_length(r->'seed')<>2 OR r#>>'{seed,1,assistantStatus}'<>'failed' OR jsonb_array_length(r#>'{history,rows}')<>3 THEN RAISE EXCEPTION 'third claim %',r; END IF;
 r:=public.pwa_chat_turn_complete_v1(a,m3,pg_temp.assistant('ok'),pg_temp.history(1,0,2),'[]');
 r:=public.pwa_chat_messages_v1(a,t1,NULL,2);
 IF jsonb_array_length(r)<>3 OR (r#>>'{0,seq}')::int<>6 OR (r#>>'{2,seq}')::int<>4 THEN RAISE EXCEPTION 'page %',r; END IF;
 r:=public.pwa_chat_messages_v1(a,t1,4,50);
 IF jsonb_array_length(r)<>3 OR (r#>>'{0,seq}')::int<>3 OR r#>'{2,usage}' IS NOT NULL OR r#>>'{2,role}'<>'user' THEN RAISE EXCEPTION 'older page %',r; END IF;
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_messages_v1(%L::jsonb,%L::uuid,NULL,2)',b,t1),'P0002','not_found');
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_messages_v1(%L::jsonb,%L::uuid,NULL,51)',a,t1),'22023','invalid_request');
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_message_v1(%L::jsonb,%L::uuid,%L::uuid)',b,t1,m1),'P0002','not_found');
 r:=public.pwa_chat_message_v1(a,t1,m2);
 IF r#>>'{assistant,status}'<>'failed' OR r#>>'{user,status}'<>'ok' THEN RAISE EXCEPTION 'outcome %',r; END IF;
 r:=public.pwa_chat_turn_begin_v1(a,t1,jsonb_build_object('id',m4,'text','Fourth'));
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_turn_begin_v1(%L::jsonb,%L::uuid,%L::jsonb)',a,t1,jsonb_build_object('id','a5555555-5555-4555-8555-555555555555','text','Fifth')),'55006','turn_in_progress');
END $$;
RESET SESSION AUTHORIZATION;
-- B. Stale claims (claimed_at moved back by the test owner): a new message claims; the stale one is re-claimed in place.
UPDATE public.pwa_chat_messages SET claimed_at=clock_timestamp()-interval '6 minutes' WHERE id='a4444444-4444-4444-8444-444444444444';
SET SESSION AUTHORIZATION v104_chat_api;
DO $$
DECLARE a jsonb:=pg_temp.actor('a'); r jsonb; t1 uuid:='11111111-1111-4111-8111-111111111111'; t2 uuid:='22222222-2222-4222-8222-222222222222'; m4 uuid:='a4444444-4444-4444-8444-444444444444'; m5 uuid:='a5555555-5555-4555-8555-555555555555';
BEGIN
 r:=public.pwa_chat_message_v1(a,t1,m4);
 IF r#>>'{user,status}'<>'failed' OR r->'assistant'<>'null'::jsonb THEN RAISE EXCEPTION 'stale outcome %',r; END IF;
 r:=public.pwa_chat_turn_begin_v1(a,t1,jsonb_build_object('id',m5,'text','Fifth'));
 IF (r#>>'{message,seq}')::int<>9 THEN RAISE EXCEPTION 'seq after a reserved reply slot %',r; END IF;
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_turn_begin_v1(%L::jsonb,%L::uuid,%L::jsonb)',a,t1,jsonb_build_object('id',m4,'text','Fourth')),'55006','turn_in_progress');
 PERFORM public.pwa_chat_turn_complete_v1(a,m5,pg_temp.assistant('ok'),pg_temp.history(1,2,2),'[]');
 r:=public.pwa_chat_turn_begin_v1(a,t1,jsonb_build_object('id',m4,'text','Fourth'));
 IF r->>'state'<>'claimed' OR (r#>>'{message,seq}')::int<>7 THEN RAISE EXCEPTION 're-claim in place %',r; END IF;
 r:=public.pwa_chat_turn_complete_v1(a,m4,pg_temp.assistant('ok'),pg_temp.history(1,4,2),'[]');
 IF (r->>'seq')::int<>8 THEN RAISE EXCEPTION 'reply slot of a re-claimed turn %',r; END IF;
 -- Title, counters, listing, archive.
 r:=(SELECT public.pwa_chat_threads_v1(a,'active',NULL,50));
 IF jsonb_array_length(r)<>2 OR r#>>'{0,id}'<>t1::text OR r#>>'{0,title}'<>'What is due today?' OR (r#>>'{0,messageCount}')::int<>10 OR r#>'{0,lastMessageAt}'='null'::jsonb THEN RAISE EXCEPTION 'threads %',r; END IF;
 IF jsonb_array_length(public.pwa_chat_threads_v1(a,'active',(r#>>'{0,sortAt}')::timestamptz,1))<>1 THEN RAISE EXCEPTION 'thread cursor'; END IF;
 IF public.pwa_chat_threads_v1(pg_temp.actor('b'),'active',NULL,50)<>'[]'::jsonb THEN RAISE EXCEPTION 'other partner sees no thread'; END IF;
 r:=public.pwa_chat_thread_update_v1(a,t2,'{"status":"archived","title":"Renamed"}');
 IF r->>'status'<>'archived' OR r->>'title'<>'Renamed' THEN RAISE EXCEPTION 'update %',r; END IF;
 IF jsonb_array_length(public.pwa_chat_threads_v1(a,'archived',NULL,10))<>1 THEN RAISE EXCEPTION 'archived list'; END IF;
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_turn_begin_v1(%L::jsonb,%L::uuid,%L::jsonb)',a,t2,jsonb_build_object('id','b1111111-1111-4111-8111-111111111111','text','x')),'22023','invalid_request');
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_thread_update_v1(%L::jsonb,%L::uuid,%L::jsonb)',pg_temp.actor('b'),t2,'{"title":"x"}'),'P0002','not_found');
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_thread_update_v1(%L::jsonb,%L::uuid,%L::jsonb)',a,t2,'{"color":"x"}'),'22023','invalid_request');
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_thread_update_v1(%L::jsonb,%L::uuid,%L::jsonb)',a,t2,'{}'),'22023','invalid_request');
 -- The capability cannot touch a table directly.
 PERFORM pg_temp.expect('SELECT count(*) FROM public.pwa_chat_messages','42501');
 PERFORM pg_temp.expect('UPDATE public.pwa_chat_threads SET title=''x''','42501');
END $$;
RESET SESSION AUTHORIZATION;
DO $$
DECLARE h record;
BEGIN
 IF (SELECT string_agg(epoch||':'||seq||':'||role||':'||coalesce(input_tokens::text,'-'),',' ORDER BY epoch,seq) FROM public.pwa_chat_history)
  <>'0:0:user:-,0:1:model:-,0:2:user:1500,1:0:user:-,1:1:model:1500,1:2:user:-,1:3:model:1500,1:4:user:-,1:5:model:1500' THEN
  RAISE EXCEPTION 'history rows %',(SELECT string_agg(epoch||':'||seq,',' ORDER BY epoch,seq) FROM public.pwa_chat_history); END IF;
 IF EXISTS(SELECT 1 FROM public.pwa_chat_history WHERE message_id='a2222222-2222-4222-8222-222222222222') THEN RAISE EXCEPTION 'failed turn wrote history'; END IF;
 IF EXISTS(SELECT 1 FROM public.pwa_chat_messages WHERE claimed_at IS NOT NULL) THEN RAISE EXCEPTION 'claims must be cleared'; END IF;
 IF (SELECT count(*) FROM public.pwa_chat_tool_calls)<>4 THEN RAISE EXCEPTION 'tool calls kept for ok and failed turns'; END IF;
END $$;
-- C. Title cut at 120 characters on the first line; thread_full at 2,000 messages.
SET SESSION AUTHORIZATION v104_chat_api;
DO $$
DECLARE a jsonb:=pg_temp.actor('a'); r jsonb; t3 uuid:='33333333-3333-4333-8333-333333333333'; m uuid:='c1111111-1111-4111-8111-111111111111';
BEGIN
 PERFORM public.pwa_chat_thread_create_v1(a,jsonb_build_object('id',t3,'model','gemini-3.5-flash'));
 PERFORM public.pwa_chat_turn_begin_v1(a,t3,jsonb_build_object('id',m,'text',repeat('ก',130)||E'\nsecond line'));
 PERFORM public.pwa_chat_turn_complete_v1(a,m,pg_temp.assistant('ok'),pg_temp.history(0,0,1),'[]');
 r:=(SELECT x FROM jsonb_array_elements(public.pwa_chat_threads_v1(a,'active',NULL,50)) x WHERE x->>'id'=t3::text);
 IF r->>'title'<>repeat('ก',120) THEN RAISE EXCEPTION 'title cut %',r->>'title'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
UPDATE public.pwa_chat_threads SET message_count=1999 WHERE id='33333333-3333-4333-8333-333333333333';
SET SESSION AUTHORIZATION v104_chat_api;
SELECT pg_temp.expect(format('SELECT public.pwa_chat_turn_begin_v1(%L::jsonb,%L::uuid,%L::jsonb)',pg_temp.actor('a'),'33333333-3333-4333-8333-333333333333','{"id":"c2222222-2222-4222-8222-222222222222","text":"x"}'),'54000','thread_full');
RESET SESSION AUTHORIZATION;

-- D. Append-only triggers, even for the owner.
SELECT pg_temp.expect($q$UPDATE public.pwa_chat_messages SET text='x' WHERE seq=1$q$,'55000');
SELECT pg_temp.expect($q$UPDATE public.pwa_chat_messages SET claimed_at=now() WHERE role='assistant'$q$,'55000');
SELECT pg_temp.expect($q$DELETE FROM public.pwa_chat_messages$q$,'55000');
SELECT pg_temp.expect($q$UPDATE public.pwa_chat_history SET content='[]'$q$,'55000');
SELECT pg_temp.expect($q$DELETE FROM public.pwa_chat_history$q$,'55000');
SELECT pg_temp.expect($q$UPDATE public.pwa_chat_tool_calls SET ms=1$q$,'55000');
SELECT pg_temp.expect($q$DELETE FROM public.pwa_chat_tool_calls$q$,'55000');
SELECT pg_temp.expect($q$DELETE FROM public.pwa_chat_threads$q$,'55000');
SELECT pg_temp.expect($q$UPDATE public.pwa_chat_threads SET partner_id='CH-B'$q$,'55000');
SELECT pg_temp.expect($q$TRUNCATE public.pwa_chat_tool_calls$q$,'55000');
SELECT pg_temp.expect($q$TRUNCATE public.pwa_chat_threads CASCADE$q$,'55000');

-- E. Capability boundary: no EXECUTE without the API role; the SQL-tool role reads no chat table and calls no chat RPC.
SET SESSION AUTHORIZATION v104_chat_other;
SELECT pg_temp.expect(format('SELECT public.pwa_chat_threads_v1(%L::jsonb,''active'',NULL,10)',pg_temp.actor('a')),'42501');
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION "mw-credit-app-chat-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN
 IF jsonb_array_length(public.pwa_chat_threads_v1(pg_temp.actor('a'),'active',NULL,10))<>2 THEN RAISE EXCEPTION 'chat user lists through the API role'; END IF;
END $$;
SET LOCAL ROLE mw_chat_read_dev;
SELECT pg_temp.expect('SELECT count(*) FROM public.pwa_chat_messages','42501');
SELECT pg_temp.expect('SELECT count(*) FROM public.pwa_chat_threads','42501');
SELECT pg_temp.expect('SELECT count(*) FROM public.pwa_chat_history','42501');
SELECT pg_temp.expect('SELECT count(*) FROM public.pwa_chat_tool_calls','42501');
SELECT pg_temp.expect(format('SELECT public.pwa_chat_threads_v1(%L::jsonb,''active'',NULL,10)',pg_temp.actor('a')),'42501');
SELECT pg_temp.expect(format('SELECT public.pwa_chat_messages_v1(%L::jsonb,%L::uuid,NULL,10)',pg_temp.actor('b'),'11111111-1111-4111-8111-111111111111'),'42501');
RESET ROLE;
RESET SESSION AUTHORIZATION;

-- F. Cost page: the last n questions, newest first, with the reply's model and token counts.
DO $$
DECLARE q record; n integer:=0;
BEGIN
 FOR q IN SELECT * FROM monitoring.pwa_chat_recent_questions_v1(3) LOOP
  n:=n+1;
  IF q.provider<>'gemini' OR q.status NOT IN ('ok','failed') OR q.model<>'gemini-4-argon' OR q.input_tokens<>1200 OR q.cached_tokens<>600 OR q.output_tokens<>80 OR q.thinking_tokens<>40 OR q.rounds<>2 THEN
   RAISE EXCEPTION 'cost row %',to_jsonb(q); END IF;
 END LOOP;
 IF n<>3 OR (SELECT count(*) FROM monitoring.pwa_chat_recent_questions_v1(100))<>6 OR (SELECT count(*) FROM monitoring.pwa_chat_recent_questions_v1(NULL))<>6 THEN RAISE EXCEPTION 'cost row count'; END IF;
 IF has_function_privilege('mw_chat_api_dev','monitoring.pwa_chat_recent_questions_v1(integer)','EXECUTE') OR has_function_privilege('public','monitoring.pwa_chat_recent_questions_v1(integer)','EXECUTE') THEN
  RAISE EXCEPTION 'cost function must not be executable by the API role or PUBLIC'; END IF;
END $$;
SELECT 'Chat regression passed' AS result;
ROLLBACK;
