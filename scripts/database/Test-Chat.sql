-- V104 (R090): the chat tables and RPCs under the real roles, at the migration head, in a disposable loopback
-- cluster. One rolled-back transaction with synthetic Partners: idempotent thread create and the other Partner's
-- refusal, the turn claim (live claim 55006, completed re-POST, stale re-claim in place), completion (reply at
-- seq + 1, history continuing the highest epoch, tool calls and their summary, claim cleared, message_count,
-- last_message_at, the "New chat" title from the first line), a failed turn without history, the late completion
-- refused by UNIQUE (thread_id, seq), history conflicts, paging, the outcome read, per-Partner 404s, archive,
-- thread_full (54000), the append-only triggers (55000), the capability boundary (no EXECUTE without
-- mw_chat_api_dev; mw_chat_read_dev reads no chat table and calls no chat RPC) and the Cost page function.
-- G covers V105 (chat reply event, job status); H covers V106 (turn presence, the completion's detached flag); I covers
-- V108 (the Cost page's turn and usage reads).
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
-- G. V105 (R090 batch 2): the chat reply event, its eligibility and content, and the job status for the SQL tool.
CREATE ROLE v105_dispatch LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT mw_notify_dispatch_dev TO v105_dispatch WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
CREATE ROLE v105_notify_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT mw_notify_api_dev TO v105_notify_api WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
GRANT USAGE ON SCHEMA public TO v105_dispatch,v105_notify_api;
CREATE TEMP TABLE v105_case(name text PRIMARY KEY,id uuid) ON COMMIT DROP;
SELECT set_config('v105.title',(SELECT title FROM public.pwa_chat_threads WHERE id='11111111-1111-4111-8111-111111111111'),false);
-- The reply events name real user messages of thread t1 (the RPC checks the message belongs to the thread).
SELECT set_config('v105.ok',(SELECT id::text FROM public.pwa_chat_messages WHERE thread_id='11111111-1111-4111-8111-111111111111' AND role='user' ORDER BY seq LIMIT 1),false),
 set_config('v105.failed',(SELECT id::text FROM public.pwa_chat_messages WHERE thread_id='11111111-1111-4111-8111-111111111111' AND role='user' ORDER BY seq OFFSET 1 LIMIT 1),false);
DO $$ BEGIN IF coalesce(current_setting('v105.failed',true),'')='' OR current_setting('v105.ok')=current_setting('v105.failed') THEN RAISE EXCEPTION 'thread t1 needs two user messages'; END IF; END $$;
GRANT SELECT ON v105_case TO PUBLIC;
-- Subscriptions exist before the events (eligibility needs created_at <= occurred_at).
WITH s AS (
 INSERT INTO public.pwa_push_subscriptions(issuer,subject,partner_id,endpoint_hash,endpoint,p256dh,auth,created_at)
 SELECT 'https://securetoken.google.com/clever-oasis-508610-n7','sub-'||p,'CH-'||upper(p),encode(sha256(convert_to('v105-'||p,'UTF8')),'hex'),'https://fcm.googleapis.com/fcm/send/v105-'||p,'synthetic','synthetic',clock_timestamp()-interval '1 minute'
 FROM unnest(ARRAY['a','b']) p RETURNING partner_id,subscription_id)
INSERT INTO v105_case SELECT 'sub-'||partner_id,subscription_id FROM s;
SET SESSION AUTHORIZATION v104_chat_api;
DO $$
DECLARE a jsonb:=pg_temp.actor('a'); b jsonb:=pg_temp.actor('b'); t1 uuid:='11111111-1111-4111-8111-111111111111';
 ok uuid:=current_setting('v105.ok')::uuid; failed uuid:=current_setting('v105.failed')::uuid; elsewhere uuid:='c1111111-1111-4111-8111-111111111111';
BEGIN
 IF NOT public.pwa_notify_chat_reply_v1(a,t1,ok,'ok') THEN RAISE EXCEPTION 'first chat reply event not inserted'; END IF;
 IF public.pwa_notify_chat_reply_v1(a,t1,ok,'ok') THEN RAISE EXCEPTION 'repeated message inserted a second event'; END IF;
 IF NOT public.pwa_notify_chat_reply_v1(a,t1,failed,'failed') THEN RAISE EXCEPTION 'failed reply event not inserted'; END IF;
 PERFORM pg_temp.expect(format('SELECT public.pwa_notify_chat_reply_v1(%L::jsonb,%L::uuid,%L::uuid,''ok'')',b,t1,gen_random_uuid()),'42501','access_denied');
 -- The message must belong to the thread: another thread's message, or an unknown id, is refused.
 PERFORM pg_temp.expect(format('SELECT public.pwa_notify_chat_reply_v1(%L::jsonb,%L::uuid,%L::uuid,''ok'')',a,t1,elsewhere),'42501','access_denied');
 PERFORM pg_temp.expect(format('SELECT public.pwa_notify_chat_reply_v1(%L::jsonb,%L::uuid,%L::uuid,''ok'')',a,t1,gen_random_uuid()),'42501','access_denied');
 -- pwa_chat_thread_v1: the caller's own thread, the list's JSON; another Partner's thread is not found.
 IF public.pwa_chat_thread_v1(a,t1)->>'id'<>t1::text OR public.pwa_chat_thread_v1(a,t1)->>'title' IS NULL OR public.pwa_chat_thread_v1(a,t1)->>'model' IS NULL THEN RAISE EXCEPTION 'thread read'; END IF;
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_thread_v1(%L::jsonb,%L::uuid)',b,t1),'P0002','not_found');
 PERFORM pg_temp.expect(format('SELECT public.pwa_notify_chat_reply_v1(%L::jsonb,%L::uuid,%L::uuid,''done'')',a,t1,gen_random_uuid()),'P0001','invalid_request');
 PERFORM pg_temp.expect(format('SELECT public.pwa_notify_chat_reply_v1(%L::jsonb,%L::uuid,%L::uuid,''ok'')',jsonb_set(a,'{partnerId}','"CH-B"'),t1,gen_random_uuid()),'42501','access_denied');
 -- The API role writes no notification table directly and calls no other notification routine.
 PERFORM pg_temp.expect('SELECT count(*) FROM public.pwa_notification_events','42501');
 PERFORM pg_temp.expect(format('SELECT public.pwa_notify_target_v1(%L::jsonb,%L::uuid)',a,gen_random_uuid()),'42501');
END $$;
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION v104_chat_other;
SELECT pg_temp.expect(format('SELECT public.pwa_notify_chat_reply_v1(%L::jsonb,%L::uuid,%L::uuid,''ok'')',pg_temp.actor('a'),'11111111-1111-4111-8111-111111111111',gen_random_uuid()),'42501');
RESET SESSION AUTHORIZATION;
INSERT INTO v105_case SELECT CASE WHEN source_version LIKE 'ok:%' THEN 'event-ok' ELSE 'event-failed' END,event_id FROM public.pwa_notification_events WHERE event_type='chat.reply';
INSERT INTO public.pwa_notification_events(dedupe_key,event_type,source_kind,source_id,source_version,actor_partner_id,actor_login_email)
 VALUES('v105-business','payment.posted','payment','V105-P','posted','CH-A','ch-a@example.invalid');
INSERT INTO v105_case SELECT 'event-business',event_id FROM public.pwa_notification_events WHERE dedupe_key='v105-business';
DO $$
DECLARE ev record; c record; sub_a uuid:=(SELECT id FROM v105_case WHERE name='sub-CH-A'); sub_b uuid:=(SELECT id FROM v105_case WHERE name='sub-CH-B');
BEGIN
 SELECT * INTO STRICT ev FROM public.pwa_notification_events WHERE event_id=(SELECT id FROM v105_case WHERE name='event-ok');
 IF ev.source_kind<>'chat' OR ev.source_id<>'11111111-1111-4111-8111-111111111111' OR ev.source_version<>'ok:'||current_setting('v105.ok')
  OR ev.dedupe_key<>'chat.reply:'||current_setting('v105.ok') OR ev.actor_partner_id<>'CH-A' OR ev.actor_login_email<>'ch-a@example.invalid' THEN RAISE EXCEPTION 'chat reply event %',to_jsonb(ev); END IF;
 IF (SELECT count(*) FROM public.pwa_notification_events WHERE event_type='chat.reply')<>2 THEN RAISE EXCEPTION 'one chat event per message'; END IF;
 -- A chat reply goes to the asking Partner's own device; a business event still goes to the other Partner.
 FOR c IN SELECT * FROM (VALUES ('event-ok',sub_a,true),('event-ok',sub_b,false),('event-failed',sub_a,true),('event-business',sub_a,false),('event-business',sub_b,true)) v(name,sub,expected) LOOP
  IF public.pwa_notify_eligible_v1((SELECT id FROM v105_case WHERE name=c.name),c.sub) IS DISTINCT FROM c.expected THEN RAISE EXCEPTION 'eligibility of % for % must be %',c.name,c.sub,c.expected; END IF;
 END LOOP;
 -- The web-push preference governs chat pushes too.
 INSERT INTO public.pwa_notification_preferences(partner_id,channel,enabled,updated_at) VALUES('CH-A','web-push',false,clock_timestamp()-interval '2 minutes');
 IF public.pwa_notify_eligible_v1((SELECT id FROM v105_case WHERE name='event-ok'),sub_a) THEN RAISE EXCEPTION 'disabled preference still eligible'; END IF;
 DELETE FROM public.pwa_notification_preferences WHERE partner_id='CH-A';
 -- Leased deliveries for the content RPC: the asking Partner (Thai) for both outcomes, and the other Partner.
 INSERT INTO public.pwa_notification_deliveries(event_id,channel,destination_key,recipient_partner_id,subscription_id,subscription_version,state,lease_generation,lease_expires_at)
 SELECT (SELECT id FROM v105_case WHERE name=x.event),'web-push',encode(sha256(convert_to('v105-'||x.dest,'UTF8')),'hex'),x.recipient,x.sub,1,'leased',3,clock_timestamp()+interval '60 seconds'
 FROM (VALUES ('event-ok','a','CH-A',sub_a),('event-failed','a','CH-A',sub_a),('event-ok','b','CH-B',sub_b)) x(event,dest,recipient,sub);
 INSERT INTO v105_case SELECT 'delivery-'||e.source_version||'-'||d.recipient_partner_id,d.delivery_id FROM public.pwa_notification_deliveries d JOIN public.pwa_notification_events e USING(event_id) WHERE e.event_type='chat.reply';
END $$;
SET SESSION AUTHORIZATION v105_dispatch;
DO $$
DECLARE got text;
BEGIN
 SELECT string_agg(concat_ws('|',k.name,CASE WHEN r.found THEN 't' ELSE 'f' END,r.event_type,r.language,coalesce(r.borrower_name,'∅'),coalesce(r.amount::text,'∅')),';' ORDER BY k.name) INTO got
 FROM v105_case k CROSS JOIN LATERAL public.pwa_notify_content_v1(k.id,3) r WHERE k.name LIKE 'delivery-%';
 IF got IS DISTINCT FROM 'delivery-failed:'||current_setting('v105.failed')||'-CH-A|t|chat.reply:failed|th|'||current_setting('v105.title')||'|∅;'
  ||'delivery-ok:'||current_setting('v105.ok')||'-CH-A|t|chat.reply:ok|th|'||current_setting('v105.title')||'|∅;'
  ||'delivery-ok:'||current_setting('v105.ok')||'-CH-B|f|chat.reply:ok|en|∅|∅' THEN RAISE EXCEPTION 'chat content differs: %',got; END IF;
END $$;
RESET SESSION AUTHORIZATION;
-- History rows show what the device was meant to receive (R089): the same facts for the calling partner.
SET SESSION AUTHORIZATION v105_notify_api;
DO $$
DECLARE got text; ids uuid[]:=ARRAY[(SELECT id FROM v105_case WHERE name='event-ok'),(SELECT id FROM v105_case WHERE name='event-failed')];
BEGIN
 SELECT string_agg(concat_ws('|',r."eventType",CASE WHEN r.found THEN 't' ELSE 'f' END,r.language,coalesce(r."borrowerName",'∅'),coalesce(r.amount::text,'∅')),';' ORDER BY r."eventType") INTO got
 FROM public.pwa_notify_history_content_v1(pg_temp.actor('a'),ids) r;
 IF got IS DISTINCT FROM 'chat.reply:failed|t|th|'||current_setting('v105.title')||'|∅;chat.reply:ok|t|th|'||current_setting('v105.title')||'|∅' THEN RAISE EXCEPTION 'chat history content for the asker differs: %',got; END IF;
 -- The other Partner holds a delivery of the ok event only, and the thread is not theirs.
 SELECT string_agg(concat_ws('|',r."eventType",CASE WHEN r.found THEN 't' ELSE 'f' END,r.language,coalesce(r."borrowerName",'∅')),';') INTO got
 FROM public.pwa_notify_history_content_v1(pg_temp.actor('b'),ids) r;
 IF got IS DISTINCT FROM 'chat.reply:ok|f|en|∅' THEN RAISE EXCEPTION 'chat history content for the other partner differs: %',got; END IF;
END $$;
RESET SESSION AUTHORIZATION;
-- Job status: the SQL-tool role reads the job state through the function only; the API role cannot call it.
INSERT INTO public.pwa_job_runs(job_name,business_date,scope_key,state,started_at,completed_at,result_count,checkpoint) VALUES
 ('daily-charges',(clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date-1,'daily','completed',clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 day',12,'secret-checkpoint'),
 ('recent-analytics',(clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date-1,'hour:07','pending',NULL,NULL,NULL,NULL),
 ('daily-charges',(clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date-30,'daily','completed',clock_timestamp()-interval '30 days',clock_timestamp()-interval '30 days',3,NULL);
SET SESSION AUTHORIZATION "mw-credit-app-chat-dev@clever-oasis-508610-n7.iam";
SELECT pg_temp.expect('SELECT * FROM public.pwa_job_status_v1(7)','42501');
SET LOCAL ROLE mw_chat_read_dev;
DO $$
DECLARE got text;
BEGIN
 SELECT string_agg(concat_ws('|',job_name,business_date=(clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date-1,scope_key,state,completed_at IS NOT NULL,coalesce(result_count::text,'∅')),';') INTO got FROM public.pwa_job_status_v1(7);
 IF got IS DISTINCT FROM 'daily-charges|t|daily|completed|t|12;recent-analytics|t|hour:07|pending|f|∅' THEN RAISE EXCEPTION 'job status differs: %',got; END IF;
 IF (SELECT count(*) FROM public.pwa_job_status_v1(90))<>3 THEN RAISE EXCEPTION 'job status over 90 days'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p,unnest(p.proargnames) n WHERE p.oid='public.pwa_job_status_v1(integer)'::regprocedure AND n IN ('run_id','checkpoint')) THEN RAISE EXCEPTION 'job status exposes run ids or checkpoints'; END IF;
END $$;
SELECT pg_temp.expect('SELECT * FROM public.pwa_job_status_v1(0)','P0001','invalid_request');
SELECT pg_temp.expect('SELECT * FROM public.pwa_job_status_v1(91)','P0001','invalid_request');
SELECT pg_temp.expect('SELECT count(*) FROM public.pwa_job_runs','42501');
SELECT pg_temp.expect(format('SELECT public.pwa_notify_chat_reply_v1(%L::jsonb,%L::uuid,%L::uuid,''ok'')',pg_temp.actor('a'),'11111111-1111-4111-8111-111111111111',gen_random_uuid()),'42501');
SELECT pg_temp.expect(format('SELECT public.pwa_chat_thread_v1(%L::jsonb,%L::uuid)',pg_temp.actor('a'),'11111111-1111-4111-8111-111111111111'),'42501');
RESET ROLE;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 IF has_function_privilege('mw_chat_api_dev','public.pwa_job_status_v1(integer)','EXECUTE') OR has_function_privilege('mw_notify_api_dev','public.pwa_notify_chat_reply_v1(jsonb,uuid,uuid,text)','EXECUTE')
  OR has_function_privilege('mw_chat_read_dev','public.pwa_notify_chat_reply_v1(jsonb,uuid,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'V105 routines reach the wrong capability'; END IF;
END $$;

-- H. V106 (R090 batch 2c): the asking device's presence on its running turn (hidden beacon), read by the completion.
SET SESSION AUTHORIZATION v104_chat_api;
DO $$
DECLARE a jsonb:=pg_temp.actor('a'); b jsonb:=pg_temp.actor('b'); r jsonb; reply uuid; t1 uuid:='11111111-1111-4111-8111-111111111111'; t4 uuid:='44444444-4444-4444-8444-444444444444';
 d1 uuid:='d1111111-1111-4111-8111-111111111111'; d2 uuid:='d2222222-2222-4222-8222-222222222222'; d3 uuid:='d3333333-3333-4333-8333-333333333333';
 sql text:='SELECT public.pwa_chat_turn_presence_v1(%L::jsonb,%L::uuid,%L::uuid,%L::text)';
BEGIN
 PERFORM public.pwa_chat_thread_create_v1(a,jsonb_build_object('id',t4,'model','gemini-4-argon'));
 PERFORM pg_temp.expect(format(sql,a,t4,d1,'hidden'),'42501','not_found');
 PERFORM public.pwa_chat_turn_begin_v1(a,t4,jsonb_build_object('id',d1,'text','Leave me'));
 PERFORM pg_temp.expect(format(sql,a,t4,d1,'away'),'22023','invalid_request');
 PERFORM pg_temp.expect(format(sql,a,t4,d1,NULL),'22023','invalid_request');
 PERFORM pg_temp.expect(format(sql,b,t4,d1,'hidden'),'42501','not_found');
 PERFORM pg_temp.expect(format(sql,a,t1,d1,'hidden'),'42501','not_found');
 -- hidden and visible, each idempotent.
 IF public.pwa_chat_turn_presence_v1(a,t4,d1,'hidden')<>'{"state":"claimed","detached":true}' OR public.pwa_chat_turn_presence_v1(a,t4,d1,'hidden')<>'{"state":"claimed","detached":true}'
  OR public.pwa_chat_turn_presence_v1(a,t4,d1,'visible')<>'{"state":"claimed","detached":false}' OR public.pwa_chat_turn_presence_v1(a,t4,d1,'visible')<>'{"state":"claimed","detached":false}' THEN
  RAISE EXCEPTION 'presence hidden/visible'; END IF;
 IF public.pwa_chat_turn_presence_v1(a,t4,d1,'hidden')->>'detached'<>'true' THEN RAISE EXCEPTION 'hidden again'; END IF;
 -- The completion reports the detached flag with the reply; a later beacon finds the reply and changes nothing.
 r:=public.pwa_chat_turn_complete_v1(a,d1,pg_temp.assistant('ok'),pg_temp.history(0,0,1),'[]');
 IF r->'detached'<>'true'::jsonb OR (r->>'seq')::int<>2 OR r->>'role'<>'assistant' THEN RAISE EXCEPTION 'detached completion %',r; END IF;
 reply:=(r->>'id')::uuid;
 IF public.pwa_chat_turn_presence_v1(a,t4,d1,'visible')<>'{"state":"completed"}' OR public.pwa_chat_turn_presence_v1(a,t4,d1,'hidden')<>'{"state":"completed"}' THEN RAISE EXCEPTION 'presence after the reply'; END IF;
 IF public.pwa_chat_turn_presence_v1(a,t4,reply,'hidden')<>'{"state":"idle"}' THEN RAISE EXCEPTION 'presence on an assistant row'; END IF;
 IF public.pwa_chat_message_v1(a,t4,d1)#>'{user,detached}' IS NOT NULL OR public.pwa_chat_message_v1(a,t4,d1)#>'{assistant,detached}' IS NOT NULL THEN RAISE EXCEPTION 'the outcome read exposes no presence'; END IF;
 -- An attached turn completes with detached=false.
 PERFORM public.pwa_chat_turn_begin_v1(a,t4,jsonb_build_object('id',d2,'text','Stay'));
 r:=public.pwa_chat_turn_complete_v1(a,d2,pg_temp.assistant('failed','TURN_TIMEOUT'),NULL,'[]');
 IF r->'detached'<>'false'::jsonb OR r->>'status'<>'failed' THEN RAISE EXCEPTION 'attached completion %',r; END IF;
 -- A third turn left hidden (re-claimed below).
 PERFORM public.pwa_chat_turn_begin_v1(a,t4,jsonb_build_object('id',d3,'text','Come back'));
 IF public.pwa_chat_turn_presence_v1(a,t4,d3,'hidden')->>'detached'<>'true' THEN RAISE EXCEPTION 'hidden third turn'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
CREATE TEMP TABLE v106_mark ON COMMIT DROP AS SELECT detached_at FROM public.pwa_chat_messages WHERE id='d3333333-3333-4333-8333-333333333333';
GRANT SELECT ON v106_mark TO PUBLIC;
DO $$ BEGIN
 IF (SELECT string_agg(left(id::text,2)||':'||(detached_at IS NOT NULL)||':'||(claimed_at IS NOT NULL),',' ORDER BY seq) FROM public.pwa_chat_messages WHERE thread_id='44444444-4444-4444-8444-444444444444' AND role='user')
  IS DISTINCT FROM 'd1:true:false,d2:false:false,d3:true:true' THEN RAISE EXCEPTION 'detached_at kept as evidence on the user rows'; END IF;
 IF EXISTS(SELECT 1 FROM public.pwa_chat_messages WHERE role='assistant' AND detached_at IS NOT NULL) THEN RAISE EXCEPTION 'assistant rows carry no presence'; END IF;
END $$;
-- A repeated hidden beacon keeps the first mark.
SET SESSION AUTHORIZATION v104_chat_api;
SELECT public.pwa_chat_turn_presence_v1(pg_temp.actor('a'),'44444444-4444-4444-8444-444444444444','d3333333-3333-4333-8333-333333333333','hidden');
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 IF (SELECT detached_at FROM public.pwa_chat_messages WHERE id='d3333333-3333-4333-8333-333333333333') IS DISTINCT FROM (SELECT detached_at FROM v106_mark) THEN RAISE EXCEPTION 'repeated hidden moved the mark'; END IF;
END $$;
-- A stale claim re-claimed by a re-POST starts attached.
UPDATE public.pwa_chat_messages SET claimed_at=clock_timestamp()-interval '6 minutes' WHERE id='d3333333-3333-4333-8333-333333333333';
SET SESSION AUTHORIZATION v104_chat_api;
DO $$ BEGIN
 IF public.pwa_chat_turn_begin_v1(pg_temp.actor('a'),'44444444-4444-4444-8444-444444444444','{"id":"d3333333-3333-4333-8333-333333333333","text":"Come back"}')->>'state'<>'claimed' THEN RAISE EXCEPTION 're-claim'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 IF (SELECT detached_at IS NOT NULL OR claimed_at IS NULL FROM public.pwa_chat_messages WHERE id='d3333333-3333-4333-8333-333333333333') THEN RAISE EXCEPTION 're-claim must reset detached_at'; END IF;
END $$;
-- An unclaimed user row without a reply answers idle and is not marked.
UPDATE public.pwa_chat_messages SET claimed_at=NULL WHERE id='d3333333-3333-4333-8333-333333333333';
SET SESSION AUTHORIZATION v104_chat_api;
DO $$ BEGIN
 IF public.pwa_chat_turn_presence_v1(pg_temp.actor('a'),'44444444-4444-4444-8444-444444444444','d3333333-3333-4333-8333-333333333333','hidden')<>'{"state":"idle"}' THEN RAISE EXCEPTION 'idle presence'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 IF (SELECT detached_at FROM public.pwa_chat_messages WHERE id='d3333333-3333-4333-8333-333333333333') IS NOT NULL THEN RAISE EXCEPTION 'idle presence changed the row'; END IF;
END $$;
-- The widened trigger still refuses every other change, and the CHECK keeps presence off assistant rows.
SELECT pg_temp.expect($q$UPDATE public.pwa_chat_messages SET detached_at=now(),text='x' WHERE id='d1111111-1111-4111-8111-111111111111'$q$,'55000');
SELECT pg_temp.expect($q$UPDATE public.pwa_chat_messages SET status='failed' WHERE id='d1111111-1111-4111-8111-111111111111'$q$,'55000');
SELECT pg_temp.expect($q$UPDATE public.pwa_chat_messages SET detached_at=now() WHERE role='assistant'$q$,'55000');
SELECT pg_temp.expect($q$DELETE FROM public.pwa_chat_messages WHERE id='d1111111-1111-4111-8111-111111111111'$q$,'55000');
SELECT pg_temp.expect($q$INSERT INTO public.pwa_chat_messages(id,thread_id,seq,role,text,status,model,detached_at) VALUES(gen_random_uuid(),'44444444-4444-4444-8444-444444444444',99,'assistant','x','ok','gemini-4-argon',now())$q$,'23514');
-- The capability boundary: only the API role calls presence.
SET SESSION AUTHORIZATION v104_chat_other;
SELECT pg_temp.expect(format('SELECT public.pwa_chat_turn_presence_v1(%L::jsonb,%L::uuid,%L::uuid,''hidden'')',pg_temp.actor('a'),'44444444-4444-4444-8444-444444444444','d1111111-1111-4111-8111-111111111111'),'42501');
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 IF has_function_privilege('mw_chat_read_dev','public.pwa_chat_turn_presence_v1(jsonb,uuid,uuid,text)','EXECUTE') OR has_function_privilege('mw_notify_api_dev','public.pwa_chat_turn_presence_v1(jsonb,uuid,uuid,text)','EXECUTE')
  OR NOT has_function_privilege('mw_chat_api_dev','public.pwa_chat_turn_presence_v1(jsonb,uuid,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'V106 presence reaches the wrong capability'; END IF;
END $$;
-- I. V108 (R093): the Cost page's turn and usage reads. A thread on its own model (gemini-3.5-flash) holds an
-- answered turn with tool calls, a failed turn whose asker had left (detached), a pending claim and one more answered
-- turn, so the per-model usage and its medians are exact.
SET SESSION AUTHORIZATION v104_chat_api;
DO $$
DECLARE a jsonb:=pg_temp.actor('a'); t5 uuid:='55555555-5555-4555-8555-555555555555';
 e1 uuid:='e1111111-1111-4111-8111-111111111111'; e2 uuid:='e2222222-2222-4222-8222-222222222222';
 e3 uuid:='e3333333-3333-4333-8333-333333333333'; e4 uuid:='e4444444-4444-4444-8444-444444444444';
 reply jsonb:=jsonb_set(pg_temp.assistant('ok'),'{model}','"gemini-3.5-flash"');
BEGIN
 PERFORM public.pwa_chat_thread_create_v1(a,jsonb_build_object('id',t5,'model','gemini-3.5-flash'));
 PERFORM public.pwa_chat_turn_begin_v1(a,t5,jsonb_build_object('id',e1,'text','V108 answered'));
 PERFORM public.pwa_chat_turn_complete_v1(a,e1,reply||'{"rounds":1,"latencyMs":2000}',pg_temp.history(0,0,1),
  '[{"callId":"v1","round":1,"name":"sql_query","arguments":"{}","result":"{}","error":null,"ms":40},{"callId":"v2","round":1,"name":"loan_payoff","arguments":"{}","result":"{}","error":null,"ms":60}]');
 PERFORM public.pwa_chat_turn_begin_v1(a,t5,jsonb_build_object('id',e2,'text','V108 failed'));
 PERFORM public.pwa_chat_turn_presence_v1(a,t5,e2,'hidden');
 PERFORM public.pwa_chat_turn_complete_v1(a,e2,jsonb_set(pg_temp.assistant('failed','MODEL_TIMEOUT'),'{model}','"gemini-3.5-flash"')||'{"rounds":5,"latencyMs":30000}',NULL,'[]');
 PERFORM public.pwa_chat_turn_begin_v1(a,t5,jsonb_build_object('id',e3,'text','V108 third'));
 PERFORM public.pwa_chat_turn_complete_v1(a,e3,reply||'{"rounds":2,"latencyMs":9000}',pg_temp.history(0,1,1),'[]');
 PERFORM public.pwa_chat_turn_begin_v1(a,t5,jsonb_build_object('id',e4,'text','V108 pending'));
END $$;
RESET SESSION AUTHORIZATION;
DO $$
DECLARE r record; seen jsonb;
BEGIN
 SELECT jsonb_object_agg(question,to_jsonb(q)-'asked_at'-'question') INTO seen FROM monitoring.pwa_chat_recent_turns_v1(50) q WHERE question LIKE 'V108 %';
 IF seen->'V108 answered' IS DISTINCT FROM '{"status":"ok","error_code":null,"provider":"gemini","model":"gemini-3.5-flash","rounds":1,"attempts":3,"latency_ms":2000,
   "tool_calls":2,"tool_ms":100,"detached":false,"input_tokens":1200,"cached_tokens":600,"output_tokens":80,"thinking_tokens":40}'::jsonb
  OR seen->'V108 failed' IS DISTINCT FROM '{"status":"failed","error_code":"MODEL_TIMEOUT","provider":"gemini","model":"gemini-3.5-flash","rounds":5,"attempts":3,"latency_ms":30000,
   "tool_calls":0,"tool_ms":0,"detached":true,"input_tokens":1200,"cached_tokens":600,"output_tokens":80,"thinking_tokens":40}'::jsonb
  OR seen->'V108 pending' IS DISTINCT FROM '{"status":"pending","error_code":null,"provider":"gemini","model":null,"rounds":null,"attempts":null,"latency_ms":null,
   "tool_calls":null,"tool_ms":null,"detached":false,"input_tokens":null,"cached_tokens":null,"output_tokens":null,"thinking_tokens":null}'::jsonb
  OR seen->'V108 third'->>'latency_ms'<>'9000' THEN RAISE EXCEPTION 'V108 recent turns %',seen; END IF;
 -- The 1..50 clamp, as pwa_chat_recent_questions_v1.
 IF (SELECT count(*) FROM monitoring.pwa_chat_recent_turns_v1(0))<>1 OR (SELECT count(*) FROM monitoring.pwa_chat_recent_turns_v1(NULL))<>least(10,(SELECT count(*) FROM public.pwa_chat_messages WHERE role='user'))
  OR (SELECT count(*) FROM monitoring.pwa_chat_recent_turns_v1(1000))<>least(50,(SELECT count(*) FROM public.pwa_chat_messages WHERE role='user')) THEN
  RAISE EXCEPTION 'V108 recent turns order or limit'; END IF;
 SELECT * INTO STRICT r FROM monitoring.pwa_chat_usage_v1(NULL) WHERE model='gemini-3.5-flash';
 IF r.provider<>'gemini' OR r.turns<>3 OR r.failed<>1 OR r.input_tokens<>3600 OR r.cached_tokens<>1800 OR r.output_tokens<>240 OR r.thinking_tokens<>120
  OR r.median_latency_ms<>9000 OR r.median_rounds<>2 THEN RAISE EXCEPTION 'V108 usage %',to_jsonb(r); END IF;
 IF (SELECT sum(u.turns) FROM monitoring.pwa_chat_usage_v1(NULL) u)<>(SELECT count(*) FROM public.pwa_chat_messages WHERE role='assistant')
  OR EXISTS(SELECT 1 FROM monitoring.pwa_chat_usage_v1(clock_timestamp()+interval '1 day')) THEN RAISE EXCEPTION 'V108 usage window'; END IF;
 -- The Grafana reader's role executes both; the API, SQL-tool and PUBLIC roles execute neither.
 IF NOT has_function_privilege('mw_agent_dashboard','monitoring.pwa_chat_recent_turns_v1(integer)','EXECUTE') OR NOT has_function_privilege('mw_agent_dashboard','monitoring.pwa_chat_usage_v1(timestamptz)','EXECUTE')
  OR has_function_privilege('mw_chat_api_dev','monitoring.pwa_chat_recent_turns_v1(integer)','EXECUTE') OR has_function_privilege('mw_chat_api_dev','monitoring.pwa_chat_usage_v1(timestamptz)','EXECUTE')
  OR has_function_privilege('mw_chat_read_dev','monitoring.pwa_chat_recent_turns_v1(integer)','EXECUTE') OR has_function_privilege('mw_chat_read_dev','monitoring.pwa_chat_usage_v1(timestamptz)','EXECUTE')
  OR has_function_privilege('public','monitoring.pwa_chat_recent_turns_v1(integer)','EXECUTE') OR has_function_privilege('public','monitoring.pwa_chat_usage_v1(timestamptz)','EXECUTE') THEN
  RAISE EXCEPTION 'V108 functions reach the wrong roles'; END IF;
 -- The definer reads its extra columns by column grant (a superuser in CI reads anyway, so the ACL is checked), never the tables.
 IF (SELECT array_agg(format('%s.%s',a.attrelid::regclass,a.attname) ORDER BY format('%s.%s',a.attrelid::regclass,a.attname)) FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x
   WHERE a.attrelid IN ('public.pwa_chat_messages'::regclass,'public.pwa_chat_tool_calls'::regclass) AND x.grantee='postgres'::regrole AND x.privilege_type='SELECT'
    AND a.attname IN ('error_code','latency_ms','attempts','detached_at','message_id','ms','error'))
   IS DISTINCT FROM ARRAY['pwa_chat_messages.attempts','pwa_chat_messages.detached_at','pwa_chat_messages.error_code','pwa_chat_messages.latency_ms',
    'pwa_chat_tool_calls.error','pwa_chat_tool_calls.message_id','pwa_chat_tool_calls.ms']
  OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) x WHERE c.oid IN ('public.pwa_chat_messages'::regclass,'public.pwa_chat_tool_calls'::regclass) AND x.grantee='postgres'::regrole) THEN
  RAISE EXCEPTION 'V108 definer column grants'; END IF;
END $$;
-- As the dashboard role: both functions answer; the chat tables stay unreadable.
SET LOCAL ROLE mw_agent_dashboard;
DO $$ BEGIN
 IF (SELECT count(*) FROM monitoring.pwa_chat_recent_turns_v1(3))<>3 OR NOT EXISTS(SELECT 1 FROM monitoring.pwa_chat_usage_v1(NULL)) THEN RAISE EXCEPTION 'dashboard role reads'; END IF;
END $$;
SELECT pg_temp.expect('SELECT count(*) FROM public.pwa_chat_messages','42501');
SELECT pg_temp.expect('SELECT count(*) FROM public.pwa_chat_tool_calls','42501');
RESET ROLE;

-- J. V115 (R102): Claude model ids (claude-<family>-<major>[-<minor>]) on threads; date-suffixed and other ids refused.
SET SESSION AUTHORIZATION v104_chat_api;
DO $$
DECLARE a jsonb:=pg_temp.actor('a'); r jsonb; t6 uuid:='66666666-6666-4666-8666-666666666666'; t7 uuid:='77777777-7777-4777-8777-777777777777';
BEGIN
 r:=public.pwa_chat_thread_create_v1(a,jsonb_build_object('id',t6,'model','claude-opus-5-5'));
 IF r->>'created'<>'true' OR r#>>'{item,model}'<>'claude-opus-5-5' THEN RAISE EXCEPTION 'V115 claude thread %',r; END IF;
 r:=public.pwa_chat_thread_update_v1(a,t6,'{"model":"gemini-4-argon"}');
 r:=public.pwa_chat_thread_update_v1(a,t6,'{"model":"claude-opus-5"}');
 IF r#>>'{item,model}'<>'claude-opus-5' THEN RAISE EXCEPTION 'V115 update to claude %',r; END IF;
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_thread_create_v1(%L::jsonb,%L::jsonb)',a,jsonb_build_object('id',t7,'model','claude-opus-5-5-20260401')),'22023','invalid_request');
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_thread_create_v1(%L::jsonb,%L::jsonb)',a,jsonb_build_object('id',t7,'model','claude_opus_5_5')),'22023','invalid_request');
 PERFORM pg_temp.expect(format('SELECT public.pwa_chat_thread_update_v1(%L::jsonb,%L::uuid,%L::jsonb)',a,t6,'{"model":"claude-Opus-5"}'),'22023','invalid_request');
END $$;
RESET SESSION AUTHORIZATION;
SELECT pg_temp.expect($q$INSERT INTO public.pwa_chat_threads(id,partner_id,title,model) VALUES('88888888-8888-4888-8888-888888888888','CH-A','x','claude-opus-5-5-20260401')$q$,'23514');
SELECT 'Chat regression passed' AS result;
ROLLBACK;
