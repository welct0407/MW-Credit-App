-- Compatible v5 payment-method enum; v3/v4 canonical bytes and replay remain unchanged.
-- R052 Phase 4: compatible v3/v4 receiving command contract. V78/V79 unchanged.
CREATE OR REPLACE FUNCTION public.pwa_submit_selected_charges_v1(canonical_json text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 e jsonb;c jsonb;a jsonb;r jsonb;v text;k text;canonical text;command_text text;actor_text text;receipt_text text;
 ids text[];sorted_ids text[];current_ids text[];current_amount numeric;selection_text text;notes_text text;receipt_id text;request uuid;hash text;day date;
 prior public.pwa_payment_commands%ROWTYPE;matches integer;outcome_value text:='posted';rejection text:=NULL;payment_key text;posted_status text;posted_amount numeric;
 -- JavaScript whitespace, used only for canonical transport validation, not ID normalization.
 ws text:=chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal') OR NOT pg_has_role(session_user,'mw_app_dev','MEMBER') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Application session required';END IF;
 IF $1 IS NULL OR octet_length($1)>524288 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid canonical command'; END IF;
 BEGIN
  e:=$1::jsonb;c:=e->'command';a:=e->'actor';r:=e->'receipt';
  IF jsonb_typeof(e)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(e) key)<>ARRAY['actor','command','contractVersion','receipt'] OR e->'contractVersion'<>'1'::jsonb
    OR jsonb_typeof(c)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c) key)<>ARRAY['allocationMethod','amountReceived','borrowerId','cashAccountId','notes','paymentDate','paymentMethod','receiptId','requestId','schemaVersion','selectedChargeIds']
    OR c->'schemaVersion' NOT IN ('3'::jsonb,'4'::jsonb,'5'::jsonb) OR jsonb_typeof(a)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(a) key)<>ARRAY['issuer','loginEmail','partnerId','subject'] THEN RAISE EXCEPTION 'shape'; END IF;
  FOREACH k IN ARRAY ARRAY['requestId','borrowerId','cashAccountId','paymentDate','amountReceived','paymentMethod','allocationMethod'] LOOP
   IF jsonb_typeof(c->k)<>'string' THEN RAISE EXCEPTION 'type'; END IF;
  END LOOP;
  IF c->>'requestId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'uuid'; END IF;
  request:=(c->>'requestId')::uuid;
  FOREACH k IN ARRAY ARRAY['borrowerId','cashAccountId'] LOOP
   v:=c->>k;IF octet_length(v) NOT BETWEEN 1 AND 256 OR v<>btrim(v,ws) OR v~E'[\\r\\n]' THEN RAISE EXCEPTION 'id';END IF;
  END LOOP;
  IF jsonb_typeof(c->'selectedChargeIds')<>'array' OR jsonb_array_length(c->'selectedChargeIds') NOT BETWEEN 1 AND (CASE WHEN c->'schemaVersion' IN ('4'::jsonb,'5'::jsonb) THEN 10000 ELSE 100 END) THEN RAISE EXCEPTION 'selection';END IF;
  ids:=ARRAY[]::text[];
  FOR r IN SELECT value FROM jsonb_array_elements(c->'selectedChargeIds') LOOP
   IF jsonb_typeof(r)<>'string' THEN RAISE EXCEPTION 'selection type';END IF;
   v:=r#>>'{}';IF octet_length(v) NOT BETWEEN 1 AND 256 OR v LIKE '%,%' OR translate(v,ws,'')<>v THEN RAISE EXCEPTION 'selection id';END IF;
   ids:=array_append(ids,v);
  END LOOP;
  r:=e->'receipt';
  SELECT array_agg(x ORDER BY x COLLATE "C") INTO sorted_ids FROM (SELECT DISTINCT unnest(ids) x) q;
  IF cardinality(sorted_ids)<>cardinality(ids) OR sorted_ids<>ids THEN RAISE EXCEPTION 'selection order';END IF;
  SELECT string_agg(to_json(x)::text,',' ORDER BY x COLLATE "C") INTO selection_text FROM unnest(ids) x;
  IF c->>'amountReceived' !~ '^[1-9][0-9]{0,16}$' OR (c->>'amountReceived')::numeric>92233720368547758 OR (c->>'paymentMethod' NOT IN ('Bank Transfer','Cash','Net-off at Disbursement') OR (c->'schemaVersion'<>'5'::jsonb AND c->>'paymentMethod'<>'Bank Transfer')) OR (c->>'allocationMethod' NOT IN ('Selected Charges','Single Full','Receive All') OR (c->'schemaVersion'='3'::jsonb AND c->>'allocationMethod'<>'Selected Charges') OR (c->>'allocationMethod'='Single Full' AND cardinality(ids)<>1)) THEN RAISE EXCEPTION 'amount or method';END IF;
  v:=c->>'paymentDate';IF v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR v<'0001-01-01' THEN RAISE EXCEPTION 'date';END IF;
  day:=v::date;IF to_char(day,'YYYY-MM-DD')<>v THEN RAISE EXCEPTION 'date';END IF;
  IF c->'notes'='null'::jsonb THEN notes_text:='null';
  ELSIF jsonb_typeof(c->'notes')='string' AND octet_length(c->>'notes') BETWEEN 1 AND 65536 THEN notes_text:=to_json(c->>'notes')::text;
  ELSE RAISE EXCEPTION 'notes';END IF;
  FOREACH k IN ARRAY ARRAY['issuer','subject','partnerId','loginEmail'] LOOP
   IF jsonb_typeof(a->k)<>'string' THEN RAISE EXCEPTION 'actor type';END IF;
   v:=a->>k;IF btrim(v,ws)='' OR v~E'[\\r\\n]' OR octet_length(v)>(CASE k WHEN 'issuer' THEN 1024 WHEN 'subject' THEN 128 WHEN 'partnerId' THEN 256 ELSE 320 END) THEN RAISE EXCEPTION 'actor';END IF;
  END LOOP;
  IF a->>'partnerId'<>btrim(a->>'partnerId',ws) OR a->>'loginEmail'<>lower(btrim(a->>'loginEmail',ws)) THEN RAISE EXCEPTION 'actor normalization';END IF;
  IF r='null'::jsonb THEN
   IF c->'receiptId'<>'null'::jsonb THEN RAISE EXCEPTION 'receipt binding';END IF;receipt_text:='null';receipt_id:='null';
  ELSE
   IF jsonb_typeof(r)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(r) key)<>ARRAY['mimeType','receiptId','sha256','sizeBytes','storageReference'] THEN RAISE EXCEPTION 'receipt shape';END IF;
   FOREACH k IN ARRAY ARRAY['receiptId','sha256','mimeType','storageReference'] LOOP IF jsonb_typeof(r->k)<>'string' THEN RAISE EXCEPTION 'receipt type';END IF;END LOOP;
   IF r->>'receiptId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR c->'receiptId'<>r->'receiptId' OR r->>'sha256' !~ '^[0-9a-f]{64}$' OR r->>'mimeType' NOT IN ('image/png','image/jpeg') OR jsonb_typeof(r->'sizeBytes')<>'number' OR r->>'sizeBytes' !~ '^[1-9][0-9]*$' OR (r->>'sizeBytes')::numeric>5242880 OR octet_length(r->>'storageReference') NOT BETWEEN 1 AND 2048 OR btrim(r->>'storageReference',ws)='' OR r->>'storageReference'~E'[\\r\\n]' THEN RAISE EXCEPTION 'receipt';END IF;
   receipt_id:=to_json(r->>'receiptId')::text;
   receipt_text:='{"receiptId":'||receipt_id||',"sha256":'||to_json(r->>'sha256')::text||',"mimeType":'||to_json(r->>'mimeType')::text||',"sizeBytes":'||(r->>'sizeBytes')||',"storageReference":'||to_json(r->>'storageReference')::text||'}';
  END IF;
  command_text:='{"schemaVersion":'||(c->>'schemaVersion')||',"requestId":'||to_json(c->>'requestId')::text||',"borrowerId":'||to_json(c->>'borrowerId')::text||',"selectedChargeIds":['||selection_text||'],"cashAccountId":'||to_json(c->>'cashAccountId')::text||',"paymentDate":'||to_json(c->>'paymentDate')::text||',"amountReceived":'||to_json(c->>'amountReceived')::text||',"paymentMethod":'||to_json(c->>'paymentMethod')::text||',"allocationMethod":'||to_json(c->>'allocationMethod')::text||',"notes":'||notes_text||',"receiptId":'||receipt_id||'}';
  actor_text:='{"issuer":'||to_json(a->>'issuer')::text||',"subject":'||to_json(a->>'subject')::text||',"partnerId":'||to_json(a->>'partnerId')::text||',"loginEmail":'||to_json(a->>'loginEmail')::text||'}';
  canonical:='{"contractVersion":1,"command":'||command_text||',"actor":'||actor_text||',"receipt":'||receipt_text||'}';
  IF canonical IS DISTINCT FROM $1 THEN RAISE EXCEPTION 'noncanonical';END IF;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid canonical command';
 END;
 hash:=encode(sha256(convert_to(canonical,'UTF8')),'hex');
 SELECT count(*) INTO matches FROM public."Partners" WHERE lower(btrim("Login Email"))=a->>'loginEmail';
 IF matches<>1 OR NOT EXISTS(SELECT 1 FROM public."Partners" WHERE "Row ID"=a->>'partnerId' AND lower(btrim("Login Email"))=a->>'loginEmail') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current actor mapping required';END IF;
 PERFORM pg_advisory_xact_lock(1347895619,hashtext(request::text));
 SELECT * INTO prior FROM public.pwa_payment_commands p WHERE p.request_id=request;
 IF FOUND THEN
  IF prior.canonical_json<>canonical OR prior.payload_sha256<>hash THEN RETURN jsonb_build_object('kind','conflict');END IF;
  RETURN public.pwa_command_status_v1(request,a->>'issuer',a->>'subject');
 END IF;
 payment_key:='pwa:'||request::text;
 BEGIN
  IF day<>(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date THEN RAISE EXCEPTION USING ERRCODE='P4C01';END IF;
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=c->>'borrowerId' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4C02';END IF;
  IF NOT EXISTS(SELECT 1 FROM public."Cash Accounts" ca JOIN public."Cash Holders" ch ON ch."Row ID"=ca."Ref Cash Holder" WHERE ca."Row ID"=c->>'cashAccountId' AND ca."Active" AND ch."Active") THEN RAISE EXCEPTION USING ERRCODE='P4C03';END IF;
  PERFORM public.cash_account_holder(c->>'cashAccountId',true);
  IF c->>'allocationMethod'='Receive All' THEN
   -- Match the engine's borrower -> loans -> charges lock order. Revalidate the
   -- reviewed complete due set before inserting the governed Processing receipt.
   PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers"=c->>'borrowerId' ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
   PERFORM 1 FROM public."Charges" ch JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans"
    WHERE l."Ref Borrowers"=c->>'borrowerId' ORDER BY ch."Row ID" COLLATE "C" FOR UPDATE OF ch;
   SELECT array_agg(ch."Row ID" ORDER BY ch."Row ID" COLLATE "C"),sum(ch."Amount Remaining") INTO current_ids,current_amount
    FROM public."Charges" ch JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans"
    WHERE l."Ref Borrowers"=c->>'borrowerId' AND ch."Charge Date"<=day AND ch."Amount Remaining">0;
   IF current_ids IS DISTINCT FROM ids OR current_amount IS DISTINCT FROM (c->>'amountReceived')::numeric THEN
    RAISE EXCEPTION USING ERRCODE='P4C04';
   END IF;
  END IF;
  INSERT INTO public."Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Payment Method","Allocation Method","Selected Charge IDs","Ref Target Charge","Created By","Notes","Uploaded Receipt")
   VALUES(payment_key,c->>'borrowerId',c->>'cashAccountId','Processing',(c->>'amountReceived')::numeric::money,day,c->>'paymentMethod',c->>'allocationMethod',CASE WHEN c->>'allocationMethod'='Selected Charges' THEN array_to_string(ids,' , ') END,CASE WHEN c->>'allocationMethod'='Single Full' THEN ids[1] END,a->>'loginEmail',c->>'notes',r->>'storageReference');
  SELECT "Status","Amount Received"::numeric INTO posted_status,posted_amount FROM public."Payments" WHERE "Row ID"=payment_key;
  IF posted_status IS DISTINCT FROM 'Posted' OR posted_amount IS DISTINCT FROM (c->>'amountReceived')::numeric THEN RAISE EXCEPTION USING ERRCODE='XX000',MESSAGE='Unexpected posting result';END IF;
 EXCEPTION
  WHEN SQLSTATE 'P4C01' THEN outcome_value:='rejected';rejection:='invalid_date';
  WHEN SQLSTATE 'P4C02' THEN outcome_value:='rejected';rejection:='borrower_unavailable';
  WHEN SQLSTATE 'P4C03' THEN outcome_value:='rejected';rejection:='account_unavailable';
  WHEN SQLSTATE 'P4C04' THEN outcome_value:='rejected';rejection:='selection_unavailable';
 END;
 INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code)
 VALUES(request,1,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',canonical,hash,outcome_value,CASE WHEN outcome_value='posted' THEN payment_key ELSE NULL END,rejection);
 RETURN public.pwa_command_status_v1(request,a->>'issuer',a->>'subject');
END $$;
REVOKE ALL ON FUNCTION public.pwa_submit_selected_charges_v1(text) FROM PUBLIC;


ALTER FUNCTION public.pwa_submit_selected_charges_v1(text) OWNER TO mw_app_dev_journal_owner;
REVOKE ALL ON FUNCTION public.pwa_submit_selected_charges_v1(text) FROM PUBLIC;
