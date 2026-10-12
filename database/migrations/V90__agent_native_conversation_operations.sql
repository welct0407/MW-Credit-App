-- R053: narrowly typed machine operations over existing financial tables/journal.
-- No source table, column, trigger bypass, or agent SQL privilege is added.
CREATE FUNCTION public.pwa_submit_agent_operation_v1(canonical_json text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 e jsonb; a jsonb; c jsonb; i jsonb; k text; value text; request uuid; target text; op text;
 environment text; hash text; expected text; predecessor text; rejection text; result_value jsonb;
 prior public.pwa_payment_commands%ROWTYPE;
 allocation public."Payment Allocations"%ROWTYPE;
 payment public."Payments"%ROWTYPE;
 parents text[]; borrowers text[]; source_version text; keys text[];
 input_text text; actor_text text; command_text text; reconstructed text;
BEGIN
 environment:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 IF current_database() NOT IN('loan_manager_dev','payment_rehearsal','loan_manager_prod')
  OR session_user<>('mw-credit-app-command-'||environment||'@clever-oasis-508610-n7.iam') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Command session required';
 END IF;
 IF $1 IS NULL OR octet_length($1)>524288 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid native command';END IF;
 BEGIN
  e:=$1::jsonb;a:=e->'actor';c:=e->'command';i:=c->'inputs';
  IF jsonb_typeof(e) IS DISTINCT FROM 'object'
   OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(e) key) IS DISTINCT FROM ARRAY['actor','command','contractVersion','receipt','requestId']
   OR e->'contractVersion' IS DISTINCT FROM '2'::jsonb OR e->'receipt' IS DISTINCT FROM 'null'::jsonb
   OR jsonb_typeof(c) IS DISTINCT FROM 'object'
   OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c) key) IS DISTINCT FROM ARRAY['expectedVersion','inputs','operation','predecessorRequestId','schemaVersion','targetId','targetType']
   OR c->'schemaVersion' IS DISTINCT FROM '1'::jsonb
   OR jsonb_typeof(a) IS DISTINCT FROM 'object'
   OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(a) key) IS DISTINCT FROM ARRAY['issuer','loginEmail','partnerId','subject']
   OR jsonb_typeof(i) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'shape';END IF;
  FOREACH k IN ARRAY ARRAY['issuer','loginEmail','partnerId','subject'] LOOP
   IF jsonb_typeof(a->k) IS DISTINCT FROM 'string' OR octet_length(a->>k) NOT BETWEEN 1 AND 320
    OR a->>k<>btrim(a->>k) OR a->>k~'[[:cntrl:]]' THEN RAISE EXCEPTION 'actor';END IF;
  END LOOP;
  IF a->>'issuer'<>'https://accounts.google.com' OR a->>'subject'!~'^[0-9]{1,128}$'
   OR a->>'loginEmail'<>lower(a->>'loginEmail') OR position('@' IN a->>'loginEmail')<2 THEN RAISE EXCEPTION 'actor';END IF;
  IF jsonb_typeof(e->'requestId') IS DISTINCT FROM 'string' OR e->>'requestId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'request';END IF;
  request:=(e->>'requestId')::uuid;target:=c->>'targetId';op:=c->>'operation';expected:=c->>'expectedVersion';predecessor:=c->>'predecessorRequestId';
  IF jsonb_typeof(c->'operation') IS DISTINCT FROM 'string' OR op NOT IN('payment.create','payment.update-metadata','allocation.create','allocation.update','allocation.delete')
   OR c->>'targetType' IS DISTINCT FROM split_part(op,'.',1)
   OR jsonb_typeof(c->'targetId') IS DISTINCT FROM 'string' OR octet_length(target) NOT BETWEEN 1 AND 256 OR target~'[[:cntrl:]]' THEN RAISE EXCEPTION 'operation';END IF;
  IF op='payment.update-metadata' THEN
   IF jsonb_typeof(c->'predecessorRequestId') NOT IN('string','null') OR (predecessor IS NOT NULL AND predecessor!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$') THEN RAISE EXCEPTION 'predecessor';END IF;
  ELSIF c->'predecessorRequestId' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'predecessor';END IF;
  IF op IN('payment.create','allocation.create') THEN
   IF c->'expectedVersion' IS DISTINCT FROM 'null'::jsonb OR target!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'create';END IF;
  ELSIF jsonb_typeof(c->'expectedVersion') IS DISTINCT FROM 'string' OR expected!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'version';END IF;
  keys:=CASE WHEN op='payment.create' THEN ARRAY['borrowerId','amountReceived','paymentDate','createdAt','paymentMethod','allocationMethod','bankReference','notes','targetChargeId','targetLoanId','cashAccountId','cashHolderId']
   WHEN op='payment.update-metadata' THEN ARRAY['createdAt']
   WHEN op='allocation.delete' THEN ARRAY[]::text[]
   ELSE ARRAY['paymentId','chargeId','chargeDateSnapshot','chargeRowNumberSnapshot','interestRemainingSnapshot','principalRemainingSnapshot','amountRemainingSnapshot','allocationOrder','allocatedInterest','allocatedPrincipal','allocatedAmount','createdAt'] END;
  IF coalesce((SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key),ARRAY[]::text[])
   IS DISTINCT FROM coalesce((SELECT array_agg(key ORDER BY key) FROM unnest(keys) key),ARRAY[]::text[]) THEN RAISE EXCEPTION 'inputs';END IF;
  FOREACH k IN ARRAY keys LOOP
   IF jsonb_typeof(i->k) NOT IN('string','null') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION 'value';END IF;
   value:=i->>k;
   IF k IN('borrowerId','paymentId','chargeId','targetChargeId','targetLoanId','cashAccountId','cashHolderId') AND value IS NOT NULL
    AND (octet_length(value) NOT BETWEEN 1 AND 256 OR value~'[[:cntrl:]]' OR value<>btrim(value)) THEN RAISE EXCEPTION 'reference';END IF;
   IF k IN('amountReceived','interestRemainingSnapshot','principalRemainingSnapshot','amountRemainingSnapshot','allocatedInterest','allocatedPrincipal','allocatedAmount') AND value IS NOT NULL
    AND (value!~'^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' OR abs(value::numeric)>92233720368547758.07) THEN RAISE EXCEPTION 'amount';END IF;
   IF k IN('allocationOrder','chargeRowNumberSnapshot') AND value IS NOT NULL
    AND (value!~'^-?(0|[1-9][0-9]*)$' OR abs(value::numeric)>2147483647) THEN RAISE EXCEPTION 'integer';END IF;
   IF k IN('paymentDate','chargeDateSnapshot') AND value IS NOT NULL
    AND (value!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (value::date)::text<>value) THEN RAISE EXCEPTION 'date';END IF;
   IF k='createdAt' AND value IS NOT NULL THEN
    IF value!~'^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?$' THEN RAISE EXCEPTION 'timestamp';END IF;
    PERFORM value::timestamp;
    IF to_char(value::timestamp,'YYYY-MM-DD HH24:MI:SS')<>split_part(value,'.',1) THEN RAISE EXCEPTION 'timestamp rollover';END IF;
   END IF;
  END LOOP;
  IF op='payment.create' AND (i->>'borrowerId' IS NULL OR i->>'amountReceived' IS NULL OR i->>'amountReceived'!~'^[1-9][0-9]*$'
   OR i->>'paymentDate' IS NULL OR i->>'createdAt' IS NULL
   OR coalesce(i->>'paymentMethod','') NOT IN('Bank Transfer','Cash','Net-off at Disbursement')
   OR coalesce(i->>'allocationMethod','') NOT IN('Single Full','Single Partial','Receive All','Lump Sum','First-day Auto','Loan Close')) THEN RAISE EXCEPTION 'payment';END IF;
  IF op IN('allocation.create','allocation.update') AND (i->>'paymentId' IS NULL OR i->>'chargeId' IS NULL) THEN RAISE EXCEPTION 'allocation';END IF;
  input_text:='{';
  FOREACH k IN ARRAY keys LOOP
   input_text:=input_text||CASE WHEN input_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||coalesce(to_json(i->>k)::text,'null');
  END LOOP;input_text:=input_text||'}';
  actor_text:='{"issuer":'||to_json(a->>'issuer')::text||',"subject":'||to_json(a->>'subject')::text||',"partnerId":'||to_json(a->>'partnerId')::text||',"loginEmail":'||to_json(a->>'loginEmail')::text||'}';
  command_text:='{"schemaVersion":1,"operation":'||to_json(op)::text||',"targetType":'||to_json(split_part(op,'.',1))::text||',"targetId":'||to_json(target)::text||',"expectedVersion":'||coalesce(to_json(expected)::text,'null')||',"predecessorRequestId":'||coalesce(to_json(predecessor)::text,'null')||',"inputs":'||input_text||'}';
  reconstructed:='{"contractVersion":2,"requestId":'||to_json(request::text)::text||',"actor":'||actor_text||',"command":'||command_text||',"receipt":null}';
  IF reconstructed IS DISTINCT FROM $1 THEN RAISE EXCEPTION 'canonical bytes';END IF;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid native command';END;

 hash:=encode(sha256(convert_to($1,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(1347895619,hashtext(request::text));
 SELECT * INTO prior FROM public.pwa_payment_commands p WHERE p.request_id=request;
 IF FOUND THEN
  IF prior.canonical_json<>$1 OR prior.payload_sha256<>hash THEN RETURN jsonb_build_object('kind','conflict');END IF;
  RETURN public.pwa_operation_status_v2(request,a->>'issuer',a->>'subject');
 END IF;
 IF (SELECT count(*) FROM public."Partners" WHERE lower(btrim("Login Email"))=a->>'loginEmail')<>1
  OR NOT EXISTS(SELECT 1 FROM public."Partners" WHERE "Row ID"=a->>'partnerId' AND lower(btrim("Login Email"))=a->>'loginEmail'
   AND "IG Integration Enabled" IS TRUE AND "AI Reviewer" IS TRUE) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current reviewer required';
 END IF;
 BEGIN
  IF op IN('payment.create','allocation.create') AND EXISTS(
   SELECT 1 FROM public.pwa_payment_commands j WHERE j.contract_version=2 AND j.outcome='applied'
    AND j.canonical_json::jsonb#>>'{command,operation}'=op AND j.canonical_json::jsonb#>>'{command,targetId}'=target
  ) THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
  IF op='payment.create' THEN
   IF (i->>'paymentDate')::date>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
   PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=i->>'borrowerId' FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
   IF EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"=target) THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
   BEGIN
    INSERT INTO public."Payments"("Row ID","Ref Borrower","Amount Received","Payment Date","Created At","Payment Method","Allocation Method","Bank Reference","Notes","Ref Target Charge","Ref Target Loan","Ref Received By Cash Account","Ref Received By Cash Holder","Status","Created By")
    VALUES(target,i->>'borrowerId',(i->>'amountReceived')::numeric::money,(i->>'paymentDate')::date,(i->>'createdAt')::timestamp,i->>'paymentMethod',i->>'allocationMethod',i->>'bankReference',i->>'notes',i->>'targetChargeId',i->>'targetLoanId',i->>'cashAccountId',i->>'cashHolderId','Processing',a->>'loginEmail');
   EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B04';
    WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION USING ERRCODE='P5B06';
    WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'Payment does not match the current eligible balance' THEN RAISE;END IF;RAISE EXCEPTION USING ERRCODE='P5B06';
   END;
   SELECT * INTO STRICT payment FROM public."Payments" WHERE "Row ID"=target;
   IF payment."Status" IS DISTINCT FROM 'Posted' OR payment."Created By" IS DISTINCT FROM a->>'loginEmail'
    OR payment."Amount Received"::numeric IS DISTINCT FROM (i->>'amountReceived')::numeric
    OR payment."Payment Date" IS DISTINCT FROM (i->>'paymentDate')::date
    OR payment."Created At" IS DISTINCT FROM (i->>'createdAt')::timestamp
    OR payment."Bank Reference" IS DISTINCT FROM i->>'bankReference'
    OR (SELECT coalesce(sum("Allocated Amount"::numeric),0) FROM public."Payment Allocations" WHERE "Ref Payment"=target) IS DISTINCT FROM (i->>'amountReceived')::numeric
    OR (SELECT coalesce(sum("Principal Paid"::numeric+"Interest Paid"::numeric),0) FROM public."Repayments" WHERE "Ref Payment"=target) IS DISTINCT FROM (i->>'amountReceived')::numeric
    OR payment."Ref Received By Cash Holder" IS DISTINCT FROM public.cash_account_holder(payment."Ref Received By Cash Account",true) THEN
    RAISE EXCEPTION USING ERRCODE='XX000',MESSAGE='Unexpected native payment result';
   END IF;
  ELSIF op='payment.update-metadata' THEN
   SELECT * INTO payment FROM public."Payments" WHERE "Row ID"=target;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
   PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=payment."Ref Borrower" FOR UPDATE;
   PERFORM 1 FROM public."Payments" WHERE "Row ID"=target FOR UPDATE;
   IF public.pwa_payment_version_v2(target) IS DISTINCT FROM expected
    OR public.pwa_payment_head_v2(target)::text IS DISTINCT FROM predecessor THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
   UPDATE public."Payments" SET "Created At"=(i->>'createdAt')::timestamp WHERE "Row ID"=target;
  ELSE
   PERFORM pg_advisory_xact_lock(hashtextextended('allocation:'||target,0));
   SELECT * INTO allocation FROM public."Payment Allocations" WHERE "Row ID"=target;
   IF op='allocation.create' AND FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
   IF op<>'allocation.create' AND NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
   parents:=ARRAY[allocation."Ref Payment",i->>'paymentId'];
   SELECT array_agg(DISTINCT p."Ref Borrower") INTO borrowers FROM public."Payments" p WHERE p."Row ID"=ANY(parents);
   PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=ANY(borrowers) ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
   PERFORM 1 FROM public."Payments" WHERE "Row ID"=ANY(parents) ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
   IF EXISTS(SELECT 1 FROM unnest(parents) id WHERE id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."Payments" p WHERE p."Row ID"=id AND p."Status" IS DISTINCT FROM 'Posted' AND p."Ref Borrower"=ANY(borrowers))) THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
   PERFORM 1 FROM public."Charges" WHERE "Row ID" IN(allocation."Ref Charge",i->>'chargeId') ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
   SELECT encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') INTO source_version FROM public."Payment Allocations" x WHERE x."Row ID"=target FOR UPDATE;
   IF op<>'allocation.create' AND source_version IS DISTINCT FROM expected THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
   BEGIN
    IF op='allocation.delete' THEN DELETE FROM public."Payment Allocations" WHERE "Row ID"=target;
    ELSIF op='allocation.create' THEN
     INSERT INTO public."Payment Allocations"("Row ID","Ref Payment","Ref Charge","Charge Date Snapshot","Charge Row Number Snapshot","Interest Remaining Snapshot","Principal Remaining Snapshot","Amount Remaining Snapshot","Allocation Order","Allocated Interest","Allocated Principal","Allocated Amount","Created At")
     VALUES(target,i->>'paymentId',i->>'chargeId',(i->>'chargeDateSnapshot')::date,(i->>'chargeRowNumberSnapshot')::integer,(i->>'interestRemainingSnapshot')::numeric::money,(i->>'principalRemainingSnapshot')::numeric::money,(i->>'amountRemainingSnapshot')::numeric::money,(i->>'allocationOrder')::integer,(i->>'allocatedInterest')::numeric::money,(i->>'allocatedPrincipal')::numeric::money,(i->>'allocatedAmount')::numeric::money,(i->>'createdAt')::timestamp);
    ELSE
     UPDATE public."Payment Allocations" SET "Ref Payment"=i->>'paymentId',"Ref Charge"=i->>'chargeId',"Charge Date Snapshot"=(i->>'chargeDateSnapshot')::date,"Charge Row Number Snapshot"=(i->>'chargeRowNumberSnapshot')::integer,"Interest Remaining Snapshot"=(i->>'interestRemainingSnapshot')::numeric::money,"Principal Remaining Snapshot"=(i->>'principalRemainingSnapshot')::numeric::money,"Amount Remaining Snapshot"=(i->>'amountRemainingSnapshot')::numeric::money,"Allocation Order"=(i->>'allocationOrder')::integer,"Allocated Interest"=(i->>'allocatedInterest')::numeric::money,"Allocated Principal"=(i->>'allocatedPrincipal')::numeric::money,"Allocated Amount"=(i->>'allocatedAmount')::numeric::money,"Created At"=(i->>'createdAt')::timestamp WHERE "Row ID"=target;
    END IF;
   EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B05';WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION USING ERRCODE='P5B06';END;
  END IF;
  result_value:=jsonb_build_object('operation',op,'targetType',split_part(op,'.',1),'targetId',target,'paymentId',CASE WHEN op IN('payment.create','payment.update-metadata') THEN target ELSE NULL END,'plan',NULL,'predecessorRequestId',predecessor,'sourceCreatedBy',CASE WHEN op='payment.create' THEN a->>'loginEmail' WHEN op='payment.update-metadata' THEN payment."Created By" ELSE NULL END);
 EXCEPTION WHEN SQLSTATE 'P5B01' THEN rejection:='source_conflict';WHEN SQLSTATE 'P5B02' THEN rejection:='not_found';WHEN SQLSTATE 'P5B04' THEN rejection:='invalid_reference';WHEN SQLSTATE 'P5B05' THEN rejection:='dependency_conflict';WHEN SQLSTATE 'P5B06' THEN rejection:='record_requires_reconciliation';WHEN SQLSTATE 'P5B08' THEN rejection:='invalid_date';END;
 INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code,result_json)
 VALUES(request,2,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',$1,hash,CASE WHEN rejection IS NULL THEN 'applied' ELSE 'rejected' END,NULL,rejection,CASE WHEN rejection IS NULL THEN result_value ELSE NULL END);
 RETURN public.pwa_operation_status_v2(request,a->>'issuer',a->>'subject');
END $$;
REVOKE ALL ON FUNCTION public.pwa_submit_agent_operation_v1(text) FROM PUBLIC;
DO $$DECLARE owner_role text;command_role text;definition text;needle text:='IN(''loan.create'',''loan.close'',''charge.create'')';BEGIN
 owner_role:=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END;
 command_role:='mw-credit-app-command-'||CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END||'@clever-oasis-508610-n7.iam';
 EXECUTE format('ALTER FUNCTION public.pwa_submit_agent_operation_v1(text) OWNER TO %I',owner_role);
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=command_role) THEN EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_submit_agent_operation_v1(text) TO %I',command_role);END IF;
 definition:=pg_get_functiondef('public.pwa_payment_head_v2(text)'::regprocedure);
 IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Unexpected payment head definition';END IF;
 -- Preserve the existing owner, ACL and settings; only recognize the new legacy-source origin.
 EXECUTE replace(definition,needle,'IN(''loan.create'',''loan.close'',''charge.create'',''payment.create'')');
END $$;
