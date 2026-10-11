-- Forward-only replacement of the published V88 capture body. pg_get_functiondef
-- emits CREATE OR REPLACE and retains every current function setting, including
-- an already-enabled activation marker. The fixed body below changes only the
-- notification hint; owner, ACL, OID, mode and complete proconfig must not change.
DO $capture_forward$
DECLARE before_row record; after_row record; definition text; expected_body text;
 new_body text:=$capture_body$
DECLARE kind text; actor_email text; actor_id text; matches bigint; version text;
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_proc
  WHERE oid='public.pwa_capture_notification_v1()'::pg_catalog.regprocedure
  AND 'application_name=mw_pwa_capture_enabled_v1'=ANY(proconfig)
 ) THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='Payments' THEN
  IF NEW."Status" IS DISTINCT FROM 'Posted' OR (TG_OP='UPDATE' AND OLD."Status"='Posted') THEN RETURN NEW; END IF;
  kind:='payment.posted';actor_email:=nullif(lower(btrim(NEW."Created By")),'');version:='posted';
 ELSE
  IF TG_OP='INSERT' THEN kind:='loan.created';actor_email:=nullif(lower(btrim(NEW."Created By")),'');version:='created';
  ELSIF NEW."Loan Status"='ปิดยอดแล้ว' AND OLD."Loan Status" IS DISTINCT FROM 'ปิดยอดแล้ว' AND NEW."Ref Closing Payment" IS NULL THEN
   kind:='loan.closed';actor_email:=nullif(lower(btrim(NEW."Closed By")),'');
   -- The source UPDATE already holds the loan row lock, serializing close occurrences.
   SELECT 'closed:'||(count(*)+1)::text INTO version FROM public.pwa_notification_events WHERE source_kind='loan' AND source_id=NEW."Row ID" AND event_type='loan.closed';
  ELSE RETURN NEW; END IF;
 END IF;
 SELECT count(*),min("Row ID") INTO matches,actor_id FROM public."Partners" WHERE lower(btrim("Login Email"))=actor_email;
 IF matches<>1 THEN actor_id:=NULL; END IF;
 INSERT INTO public.pwa_notification_events(dedupe_key,event_type,source_kind,source_id,source_version,actor_partner_id,actor_login_email)
 VALUES(kind||':'||NEW."Row ID"||':'||version,kind,CASE WHEN TG_TABLE_NAME='Payments' THEN 'payment' ELSE 'loan' END,NEW."Row ID",version,actor_id,actor_email)
 ON CONFLICT(dedupe_key) DO NOTHING;
 RETURN NEW;
END $capture_body$;
 signal_line text:=' IF FOUND THEN PERFORM pg_catalog.pg_notify(''mw_pwa_notifications_v1'',''''); END IF;'||chr(10);
BEGIN
 SELECT oid,proowner,proacl,proconfig,prosecdef,provolatile,proparallel,proisstrict,proleakproof,prosrc
 INTO STRICT before_row FROM pg_catalog.pg_proc WHERE oid='public.pwa_capture_notification_v1()'::regprocedure;
 IF before_row.proowner<>('mw_notify_owner_'||CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END)::regrole
  OR before_row.prosecdef IS DISTINCT FROM true THEN RAISE EXCEPTION 'Unexpected capture function ownership or mode';END IF;
 expected_body:=replace(new_body,' ON CONFLICT(dedupe_key) DO NOTHING;'||chr(10),' ON CONFLICT(dedupe_key) DO NOTHING;'||chr(10)||signal_line);
 IF before_row.prosrc IS DISTINCT FROM expected_body THEN RAISE EXCEPTION 'Unexpected V88 capture function body';END IF;
 SELECT pg_catalog.pg_get_functiondef(before_row.oid) INTO definition;
 IF (length(definition)-length(replace(definition,expected_body,'')))/length(expected_body)<>1
  OR definition NOT LIKE 'CREATE OR REPLACE FUNCTION public.pwa_capture_notification_v1()%'
 THEN RAISE EXCEPTION 'Unexpected capture replacement definition';END IF;
 EXECUTE replace(definition,expected_body,new_body);
 SELECT oid,proowner,proacl,proconfig,prosecdef,provolatile,proparallel,proisstrict,proleakproof,prosrc
 INTO STRICT after_row FROM pg_catalog.pg_proc WHERE oid=before_row.oid;
 IF (after_row.oid,after_row.proowner,after_row.proacl,after_row.proconfig,after_row.prosecdef,after_row.provolatile,after_row.proparallel,after_row.proisstrict,after_row.proleakproof)
  IS DISTINCT FROM (before_row.oid,before_row.proowner,before_row.proacl,before_row.proconfig,before_row.prosecdef,before_row.provolatile,before_row.proparallel,before_row.proisstrict,before_row.proleakproof)
  OR after_row.prosrc IS DISTINCT FROM new_body THEN RAISE EXCEPTION 'Capture replacement changed protected metadata';END IF;
END $capture_forward$;

-- R053: typed agent receipt adapter; no runtime activation or new data objects.
CREATE FUNCTION public.pwa_agent_receipt_status_v1(request_id uuid, actor_issuer text, actor_subject text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.pwa_payment_commands%ROWTYPE; c jsonb; matched boolean; environment text;
BEGIN
 environment:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR session_user<>('mw-credit-app-command-'||environment||'@clever-oasis-508610-n7.iam') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Command session required'; END IF;
 SELECT * INTO r FROM public.pwa_payment_commands p WHERE p.request_id=$1 AND p.actor_issuer=$2 AND p.actor_subject=$3 AND p.canonical_json::jsonb#>>'{command,schemaVersion}'='7';
 IF NOT FOUND THEN RETURN jsonb_build_object('kind','unresolved'); END IF;
 c:=r.canonical_json::jsonb->'command';
 SELECT EXISTS(SELECT 1 FROM public."Payments" p WHERE p."Row ID"=r.payment_id AND p."Status"='Posted'
  AND p."Ref Borrower"=(c->>'borrowerId') AND p."Ref Received By Cash Account"=(c->>'cashAccountId')
  AND p."Amount Received"::numeric=((c->>'amountReceived'))::numeric AND p."Payment Date"=((c->>'paymentDate'))::date
  AND p."Created By"=r.actor_login_email AND p."Payment Method"='Bank Transfer' AND p."Allocation Method"='Lump Sum'
  AND p."Bank Reference"=(c->>'bankReference') AND to_char(p."Created At",'YYYY-MM-DD HH24:MI')=(c->>'paymentDate')||' '||(c->>'transferTime')
  AND (SELECT coalesce(sum(x."Principal Paid"::numeric+x."Interest Paid"::numeric),0) FROM public."Repayments" x WHERE x."Ref Payment"=p."Row ID")=((c->>'amountReceived'))::numeric) INTO matched;
 RETURN jsonb_build_object('kind','recorded','reviewId',(c->>'reviewId'),'financialMatch',CASE WHEN r.outcome='posted' THEN matched ELSE NULL END,
  'originalOutcome',jsonb_build_object('status',r.outcome,'paymentId',r.payment_id,'code',r.rejection_code,'recordedAt',to_char(r.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
END $$;
REVOKE ALL ON FUNCTION public.pwa_agent_receipt_status_v1(uuid,text,text) FROM PUBLIC;

CREATE FUNCTION public.pwa_submit_agent_receipt_v1(canonical_json text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE e jsonb;c jsonb;a jsonb;x jsonb;k text;v text;canonical text;part text;hash text;request uuid;derived bytea;environment text;
 prior public.pwa_payment_commands%ROWTYPE;day date;matches integer;outcome_value text:='posted';rejection text;result jsonb;
 command_keys text[]:=ARRAY['schemaVersion','requestId','environment','reviewId','mode','borrowerId','cashAccountId','amountReceived','paymentDate','transferTime','bankReference','proposalSha256','archiveEvidence'];
 evidence_keys text[]:=ARRAY['receiptId','objectKey','generation','rawSha256','mimeType','sizeBytes','capturedAt'];
 actor_keys text[]:=ARRAY['issuer','subject','partnerId','loginEmail'];
BEGIN
 environment:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR session_user<>('mw-credit-app-command-'||environment||'@clever-oasis-508610-n7.iam') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Command session required'; END IF;
 IF $1 IS NULL OR octet_length($1)>16384 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid agent receipt command'; END IF;
 BEGIN
  e:=$1::jsonb;c:=e->'command';a:=e->'actor';x:=c->'archiveEvidence';
  IF jsonb_typeof(e)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(e) key)<>ARRAY['actor','command','contractVersion','receipt'] OR e->'contractVersion'<>'1'::jsonb OR e->'receipt'<>'null'::jsonb
   OR jsonb_typeof(c)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c) key)<>(SELECT array_agg(key ORDER BY key) FROM unnest(command_keys) key)
   OR jsonb_typeof(a)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(a) key)<>(SELECT array_agg(key ORDER BY key) FROM unnest(actor_keys) key)
   OR jsonb_typeof(x)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(x) key)<>(SELECT array_agg(key ORDER BY key) FROM unnest(evidence_keys) key)
   OR c->'schemaVersion'<>'7'::jsonb OR (c->>'environment')<>environment OR (c->>'mode') NOT IN ('automatic','reviewed') THEN RAISE EXCEPTION 'shape'; END IF;
  FOREACH k IN ARRAY command_keys[2:12] LOOP
   IF jsonb_typeof(c->k)<>'string' THEN RAISE EXCEPTION 'type'; END IF;
   v:=(c->>k);IF octet_length(v) NOT BETWEEN 1 AND 256 OR btrim(v)='' OR v~E'[\\r\\n]' OR (k<>'bankReference' AND v<>btrim(v)) THEN RAISE EXCEPTION 'text'; END IF;
  END LOOP;
  IF (c->>'amountReceived')!~'^[1-9][0-9]{0,16}$' OR ((c->>'amountReceived'))::numeric>92233720368547758 OR (c->>'proposalSha256')!~'^[a-f0-9]{64}$' OR (c->>'paymentDate')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (c->>'transferTime')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'values'; END IF;
  day:=((c->>'paymentDate'))::date;IF to_char(day,'YYYY-MM-DD')<>(c->>'paymentDate') THEN RAISE EXCEPTION 'date'; END IF;
  derived:=substring(sha256(convert_to('["mw-credit-agent-receipt-v1",'||to_json(environment)::text||','||to_json((c->>'reviewId'))::text||']','UTF8')) FROM 1 FOR 16);
  derived:=set_byte(derived,6,(get_byte(derived,6)&15)|64);derived:=set_byte(derived,8,(get_byte(derived,8)&63)|128);
  request:=encode(derived,'hex')::uuid;IF request::text<>(c->>'requestId') THEN RAISE EXCEPTION 'request identity'; END IF;
  FOREACH k IN ARRAY evidence_keys LOOP IF k<>'sizeBytes' AND jsonb_typeof(x->k)<>'string' THEN RAISE EXCEPTION 'evidence type'; END IF;END LOOP;
  IF (x->>'receiptId')!~'^[a-f0-9]{64}$' OR (x->>'rawSha256')!~'^[a-f0-9]{64}$' OR (x->>'generation')!~'^[1-9][0-9]{0,24}$'
   OR jsonb_typeof(x->'sizeBytes')<>'number' OR (x->>'sizeBytes')!~'^[1-9][0-9]*$' OR ((x->>'sizeBytes'))::numeric>12000000
   OR (x->>'capturedAt')!~'^[1-9][0-9]{0,11}(\.[0-9]{0,8}[1-9])?$' OR (x->>'mimeType') NOT IN ('image/jpeg','image/png','image/webp') THEN RAISE EXCEPTION 'evidence';END IF;
  v:='receipts/'||environment||'/'||to_char(to_timestamp(((x->>'capturedAt'))::double precision) AT TIME ZONE 'UTC','YYYY/MM/DD')||'/'||(x->>'receiptId')||'/'||(x->>'rawSha256')||CASE (x->>'mimeType') WHEN 'image/jpeg' THEN '.jpg' WHEN 'image/png' THEN '.png' ELSE '.webp' END;
  IF (x->>'objectKey')<>v THEN RAISE EXCEPTION 'object binding'; END IF;
  FOREACH k IN ARRAY actor_keys LOOP IF jsonb_typeof(a->k)<>'string' OR octet_length((a->>k)) NOT BETWEEN 1 AND 320 OR (a->>k)<>btrim((a->>k)) OR (a->>k)~E'[\\r\\n]' THEN RAISE EXCEPTION 'actor'; END IF;END LOOP;
  IF (a->>'issuer')<>'https://accounts.google.com' OR (a->>'subject')!~'^[0-9]{1,128}$' OR octet_length((a->>'partnerId'))>256 OR (a->>'loginEmail')<>lower((a->>'loginEmail')) THEN RAISE EXCEPTION 'actor'; END IF;
  canonical:='{"contractVersion":1,"command":{';
  FOREACH k IN ARRAY command_keys LOOP
   IF k='archiveEvidence' THEN
    part:='{';FOREACH v IN ARRAY evidence_keys LOOP part:=part||CASE WHEN part='{' THEN '' ELSE ',' END||to_json(v)::text||':'||(x->v)::text;END LOOP;part:=part||'}';
   ELSE part:=(c->k)::text; END IF;
   canonical:=canonical||CASE WHEN k='schemaVersion' THEN '' ELSE ',' END||to_json(k)::text||':'||part;
  END LOOP;
  canonical:=canonical||'},"actor":{';
  FOREACH k IN ARRAY actor_keys LOOP canonical:=canonical||CASE WHEN k='issuer' THEN '' ELSE ',' END||to_json(k)::text||':'||(a->k)::text;END LOOP;
  canonical:=canonical||'},"receipt":null}';IF canonical IS DISTINCT FROM $1 THEN RAISE EXCEPTION 'noncanonical';END IF;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid agent receipt command'; END;
 hash:=encode(sha256(convert_to(canonical,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(1347895619,hashtext(request::text));
 SELECT * INTO prior FROM public.pwa_payment_commands p WHERE p.request_id=request;
 IF FOUND THEN
  IF prior.canonical_json<>canonical OR prior.payload_sha256<>hash THEN RETURN jsonb_build_object('kind','conflict'); END IF;
  RETURN public.pwa_agent_receipt_status_v1(request,(a->>'issuer'),(a->>'subject'));
 END IF;
 SELECT count(*) INTO matches FROM public."Partners" WHERE lower(btrim("Login Email"))=(a->>'loginEmail');
 IF matches<>1 OR NOT EXISTS(SELECT 1 FROM public."Partners" WHERE "Row ID"=(a->>'partnerId') AND lower(btrim("Login Email"))=(a->>'loginEmail') AND ((c->>'mode')='automatic' OR ("AI Reviewer" IS TRUE AND "IG Integration Enabled" IS TRUE))) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current actor mapping required';END IF;
 BEGIN
  IF day NOT IN ((transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date,(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date-1) THEN RAISE EXCEPTION USING ERRCODE='P4C01';END IF;
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=(c->>'borrowerId') FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4C02';END IF;
  IF NOT EXISTS(SELECT 1 FROM public."Cash Accounts" ca JOIN public."Cash Holders" ch ON ch."Row ID"=ca."Ref Cash Holder" WHERE ca."Row ID"=(c->>'cashAccountId') AND ca."Active" AND ch."Active") THEN RAISE EXCEPTION USING ERRCODE='P4C03';END IF;
  PERFORM public.cash_account_holder((c->>'cashAccountId'),true);
  INSERT INTO public."Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Created At","Payment Method","Allocation Method","Bank Reference","Created By","Notes")
  VALUES('pwa:'||request::text,(c->>'borrowerId'),(c->>'cashAccountId'),'Processing',((c->>'amountReceived'))::numeric::money,day,((c->>'paymentDate')||' '||(c->>'transferTime')||':00')::timestamp,'Bank Transfer','Lump Sum',(c->>'bankReference'),(a->>'loginEmail'),CASE (c->>'mode') WHEN 'automatic' THEN 'Automatic Instagram receipt payment ' ELSE 'Approved Instagram receipt review ' END||'igr:'||left((c->>'reviewId'),48));
 EXCEPTION WHEN SQLSTATE 'P4C01' THEN outcome_value:='rejected';rejection:='invalid_date';
  WHEN SQLSTATE 'P4C02' THEN outcome_value:='rejected';rejection:='borrower_unavailable';
  WHEN SQLSTATE 'P4C03' THEN outcome_value:='rejected';rejection:='account_unavailable';
  WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM<>'Payment does not match the current eligible balance' THEN RAISE;END IF;
   outcome_value:='rejected';rejection:='selection_unavailable';
 END;
 INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code)
 VALUES(request,1,(a->>'issuer'),(a->>'subject'),(a->>'partnerId'),(a->>'loginEmail'),canonical,hash,outcome_value,CASE WHEN outcome_value='posted' THEN 'pwa:'||request::text END,rejection);
 result:=public.pwa_agent_receipt_status_v1(request,(a->>'issuer'),(a->>'subject'));
 IF outcome_value='posted' AND result->'financialMatch' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION USING ERRCODE='XX000',MESSAGE='Unexpected receipt posting result';END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.pwa_submit_agent_receipt_v1(text) FROM PUBLIC;
DO $$ DECLARE owner_role text; BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database';END IF;
 owner_role:=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END;
 EXECUTE format('ALTER FUNCTION public.pwa_submit_agent_receipt_v1(text) OWNER TO %I',owner_role);
 EXECUTE format('ALTER FUNCTION public.pwa_agent_receipt_status_v1(uuid,text,text) OWNER TO %I',owner_role);
END $$;
