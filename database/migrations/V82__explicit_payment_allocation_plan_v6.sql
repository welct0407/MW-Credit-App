-- Explicit v6 allocation plans. Retained V3-V5 canonical paths remain compatible.
CREATE OR REPLACE FUNCTION public.pwa_submit_selected_charges_v1(canonical_json text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 line jsonb;plan_text text;line_text text;plan_total numeric;balance record;
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
    OR jsonb_typeof(c)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c) key)<>(CASE WHEN c->'schemaVersion'='6'::jsonb THEN ARRAY['allocations','amountReceived','borrowerId','cashAccountId','notes','paymentDate','paymentMethod','receiptId','requestId','schemaVersion'] ELSE ARRAY['allocationMethod','amountReceived','borrowerId','cashAccountId','notes','paymentDate','paymentMethod','receiptId','requestId','schemaVersion','selectedChargeIds'] END)
    OR c->'schemaVersion' NOT IN ('3'::jsonb,'4'::jsonb,'5'::jsonb,'6'::jsonb) OR jsonb_typeof(a)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(a) key)<>ARRAY['issuer','loginEmail','partnerId','subject'] THEN RAISE EXCEPTION 'shape'; END IF;
  FOREACH k IN ARRAY ARRAY['requestId','borrowerId','cashAccountId','paymentDate','amountReceived','paymentMethod'] LOOP
   IF jsonb_typeof(c->k)<>'string' THEN RAISE EXCEPTION 'type'; END IF;
  END LOOP;
  IF c->>'requestId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'uuid'; END IF;
  request:=(c->>'requestId')::uuid;
  FOREACH k IN ARRAY ARRAY['borrowerId','cashAccountId'] LOOP
   v:=c->>k;IF octet_length(v) NOT BETWEEN 1 AND 256 OR v<>btrim(v,ws) OR v~E'[\\r\\n]' THEN RAISE EXCEPTION 'id';END IF;
  END LOOP;
  IF c->'schemaVersion'='6'::jsonb THEN
   IF jsonb_typeof(c->'allocations') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'allocations') NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'plan';END IF;
   ids:=ARRAY[]::text[];plan_text:='';plan_total:=0;
   FOR line IN SELECT value FROM jsonb_array_elements(c->'allocations') LOOP
    IF jsonb_typeof(line) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(line) key) IS DISTINCT FROM ARRAY['chargeDate','chargeId','expectedInterestRemaining','expectedPrincipalRemaining','interest','principal'] THEN RAISE EXCEPTION 'line';END IF;
    FOREACH k IN ARRAY ARRAY['chargeId','principal','interest','expectedPrincipalRemaining','expectedInterestRemaining','chargeDate'] LOOP
     IF jsonb_typeof(line->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'line type';END IF;
    END LOOP;
    v:=line->>'chargeId';IF octet_length(v) NOT BETWEEN 1 AND 256 OR v LIKE '%,%' OR translate(v,ws,'')<>v THEN RAISE EXCEPTION 'line id';END IF;ids:=array_append(ids,v);
    FOREACH k IN ARRAY ARRAY['principal','interest','expectedPrincipalRemaining','expectedInterestRemaining'] LOOP
     IF line->>k !~ '^(0|[1-9][0-9]{0,16})$' OR (line->>k)::numeric>92233720368547758 THEN RAISE EXCEPTION 'component';END IF;
    END LOOP;
    IF (line->>'principal')::numeric+(line->>'interest')::numeric<=0 OR (line->>'principal')::numeric>(line->>'expectedPrincipalRemaining')::numeric OR (line->>'interest')::numeric>(line->>'expectedInterestRemaining')::numeric THEN RAISE EXCEPTION 'line cap';END IF;
    v:=line->>'chargeDate';IF v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR v<'0001-01-01' OR to_char(v::date,'YYYY-MM-DD')<>v THEN RAISE EXCEPTION 'line day';END IF;
    plan_total:=plan_total+(line->>'principal')::numeric+(line->>'interest')::numeric;
    line_text:='{"chargeId":'||to_json(line->>'chargeId')::text||',"principal":'||to_json(line->>'principal')::text||',"interest":'||to_json(line->>'interest')::text||',"expectedPrincipalRemaining":'||to_json(line->>'expectedPrincipalRemaining')::text||',"expectedInterestRemaining":'||to_json(line->>'expectedInterestRemaining')::text||',"chargeDate":'||to_json(line->>'chargeDate')::text||'}';
    plan_text:=plan_text||CASE WHEN plan_text='' THEN '' ELSE ',' END||line_text;
   END LOOP;
   SELECT array_agg(x ORDER BY x COLLATE "C") INTO sorted_ids FROM (SELECT DISTINCT unnest(ids) x) q;
   IF ids IS DISTINCT FROM sorted_ids OR cardinality(ids)<>cardinality(sorted_ids) THEN RAISE EXCEPTION 'plan order';END IF;
   IF c->>'amountReceived' !~ '^[1-9][0-9]{0,16}$' OR (c->>'amountReceived')::numeric>92233720368547758 OR (c->>'amountReceived')::numeric<>plan_total OR c->>'paymentMethod' NOT IN ('Bank Transfer','Cash','Net-off at Disbursement') THEN RAISE EXCEPTION 'total';END IF;
  ELSE
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
  END IF;
  r:=e->'receipt';
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
  IF c->'schemaVersion'='6'::jsonb THEN
   command_text:='{"schemaVersion":6,"requestId":'||to_json(c->>'requestId')::text||',"borrowerId":'||to_json(c->>'borrowerId')::text||',"allocations":['||plan_text||'],"cashAccountId":'||to_json(c->>'cashAccountId')::text||',"paymentDate":'||to_json(c->>'paymentDate')::text||',"amountReceived":'||to_json(c->>'amountReceived')::text||',"paymentMethod":'||to_json(c->>'paymentMethod')::text||',"notes":'||notes_text||',"receiptId":'||receipt_id||'}';
  ELSE
  command_text:='{"schemaVersion":'||(c->>'schemaVersion')||',"requestId":'||to_json(c->>'requestId')::text||',"borrowerId":'||to_json(c->>'borrowerId')::text||',"selectedChargeIds":['||selection_text||'],"cashAccountId":'||to_json(c->>'cashAccountId')::text||',"paymentDate":'||to_json(c->>'paymentDate')::text||',"amountReceived":'||to_json(c->>'amountReceived')::text||',"paymentMethod":'||to_json(c->>'paymentMethod')::text||',"allocationMethod":'||to_json(c->>'allocationMethod')::text||',"notes":'||notes_text||',"receiptId":'||receipt_id||'}';
  END IF;
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
  IF c->'schemaVersion'='6'::jsonb THEN
   PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers"=c->>'borrowerId' ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
   PERFORM 1 FROM public."Charges" ch JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans" WHERE l."Ref Borrowers"=c->>'borrowerId' ORDER BY ch."Row ID" COLLATE "C" FOR UPDATE OF ch;
   IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(c->'allocations') AS entries(item)
    LEFT JOIN public."Charges" ch ON ch."Row ID"=entries.item->>'chargeId'
    LEFT JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans"
    LEFT JOIN (SELECT "Ref Charges" charge,sum("Principal Paid"::numeric) principal,sum("Interest Paid"::numeric) interest,count(*) FILTER(WHERE "Principal Paid" IS NULL OR "Interest Paid" IS NULL) invalid FROM public."Repayments" WHERE "Ref Charges"=ANY(ids) GROUP BY "Ref Charges") paid ON paid.charge=ch."Row ID"
    WHERE l."Ref Borrowers" IS DISTINCT FROM c->>'borrowerId' OR coalesce(paid.invalid,0)>0
     OR ch."Principal Due"::numeric-coalesce(paid.principal,0) IS DISTINCT FROM (entries.item->>'expectedPrincipalRemaining')::numeric
     OR ch."Interest Due"::numeric-coalesce(paid.interest,0) IS DISTINCT FROM (entries.item->>'expectedInterestRemaining')::numeric
     OR ch."Charge Date" IS DISTINCT FROM (entries.item->>'chargeDate')::date
   ) THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
   INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code)
   VALUES(request,1,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',canonical,hash,'posted',payment_key,NULL);
  END IF;
  INSERT INTO public."Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Payment Method","Allocation Method","Selected Charge IDs","Ref Target Charge","Created By","Notes","Uploaded Receipt")
   VALUES(payment_key,c->>'borrowerId',c->>'cashAccountId','Processing',(c->>'amountReceived')::numeric::money,day,c->>'paymentMethod',CASE WHEN c->'schemaVersion'='6'::jsonb THEN 'Selected Charges' ELSE c->>'allocationMethod' END,CASE WHEN c->'schemaVersion'='6'::jsonb OR c->>'allocationMethod'='Selected Charges' THEN array_to_string(ids,' , ') END,CASE WHEN c->>'allocationMethod'='Single Full' THEN ids[1] END,a->>'loginEmail',c->>'notes',r->>'storageReference');
  SELECT "Status","Amount Received"::numeric INTO posted_status,posted_amount FROM public."Payments" WHERE "Row ID"=payment_key;
  IF posted_status IS DISTINCT FROM 'Posted' OR posted_amount IS DISTINCT FROM (c->>'amountReceived')::numeric THEN RAISE EXCEPTION USING ERRCODE='XX000',MESSAGE='Unexpected posting result';END IF;
 EXCEPTION
  WHEN SQLSTATE 'P4C01' THEN outcome_value:='rejected';rejection:='invalid_date';
  WHEN SQLSTATE 'P4C02' THEN outcome_value:='rejected';rejection:='borrower_unavailable';
  WHEN SQLSTATE 'P4C03' THEN outcome_value:='rejected';rejection:='account_unavailable';
  WHEN SQLSTATE 'P4C05' THEN outcome_value:='rejected';rejection:='selection_unavailable';
  WHEN SQLSTATE 'P4C04' THEN outcome_value:='rejected';rejection:='selection_unavailable';
 END;
 IF c->'schemaVersion'<>'6'::jsonb OR outcome_value='rejected' THEN
 INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code)
 VALUES(request,1,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',canonical,hash,outcome_value,CASE WHEN outcome_value='posted' THEN payment_key ELSE NULL END,rejection);
 END IF;
 RETURN public.pwa_command_status_v1(request,a->>'issuer',a->>'subject');
END $$;
REVOKE ALL ON FUNCTION public.pwa_submit_selected_charges_v1(text) FROM PUBLIC;


ALTER FUNCTION public.pwa_submit_selected_charges_v1(text) OWNER TO mw_app_dev_journal_owner;
REVOKE ALL ON FUNCTION public.pwa_submit_selected_charges_v1(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.post_payment_legacy_v59(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE p public."Payments"%ROWTYPE; amount numeric; available numeric;
BEGIN
  IF EXISTS(SELECT 1 FROM public.pwa_payment_commands WHERE payment_id=p_id AND outcome='posted' AND canonical_json::jsonb->'command'->'schemaVersion'='6'::jsonb) THEN RAISE EXCEPTION 'Explicit PWA receipt cannot use legacy engine';END IF;
  SELECT * INTO STRICT p FROM public."Payments" WHERE "Row ID"=p_id;
  IF p."Status"='Posted' THEN RETURN; END IF;
  IF p."Status" IS DISTINCT FROM 'Processing' THEN
    RAISE EXCEPTION 'Payment must be Processing before posting';
  END IF;
  IF p."Allocation Method" IS NULL OR p."Allocation Method" NOT IN
    ('Single Full','Single Partial','Receive All','Lump Sum','First-day Auto','Loan Close','Selected Charges') THEN
    RAISE EXCEPTION 'Unsupported payment allocation method';
  END IF;
  amount:=p."Amount Received"::numeric;
  IF amount IS NULL OR amount<=0 OR amount<>trunc(amount) THEN
    RAISE EXCEPTION 'Payment requires a positive whole-baht amount';
  END IF;
  IF p."Payment Date" IS NULL OR p."Payment Date"> (statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date THEN
    RAISE EXCEPTION 'Payment date must be present and no later than today';
  END IF;
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=p."Ref Borrower" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment borrower does not exist'; END IF;
  -- The receipt BEFORE trigger acquires this same lock before INSERT. Re-read
  -- after acquisition for callers invoking the business function directly.
  SELECT * INTO STRICT p FROM public."Payments" WHERE "Row ID"=p_id FOR UPDATE;
  IF p."Status"='Posted' THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public."Payments" q WHERE q."Ref Borrower"=p."Ref Borrower"
    AND q."Row ID"<>p_id AND q."Status" IN ('Processing','Error')
    AND NOT coalesce(nullif(current_setting('payment_crud.parents',true),'')::jsonb ? q."Row ID",false)) THEN
    RAISE EXCEPTION 'Another receipt for this borrower requires reconciliation';
  END IF;
  IF EXISTS (SELECT 1 FROM public."Payment Allocations" WHERE "Ref Payment"=p_id)
    OR EXISTS (SELECT 1 FROM public."Repayments" WHERE "Ref Payment"=p_id) THEN
    RAISE EXCEPTION 'Existing receipt results require reconciliation; reallocation refused';
  END IF;
  PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers"=p."Ref Borrower"
    ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
  PERFORM 1 FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
    WHERE l."Ref Borrowers"=p."Ref Borrower" ORDER BY c."Row ID" COLLATE "C" FOR UPDATE OF c;
  IF p."Allocation Method" IN ('Single Full','Single Partial','First-day Auto','Loan Close') AND NOT EXISTS (
    SELECT 1 FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
    WHERE c."Row ID"=p."Ref Target Charge" AND l."Ref Borrowers"=p."Ref Borrower") THEN
    RAISE EXCEPTION 'Target charge must belong to the payment borrower';
  END IF;
  IF p."Allocation Method"='First-day Auto' AND NOT EXISTS (
    SELECT 1 FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
    WHERE c."Row ID"=p."Ref Target Charge" AND l."Auto Charge Enabled"
      AND l."Loan Type" IN ('ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน')
      AND c."Charge Date"=l."Loan Date" AND p."Payment Date"=l."Loan Date"
      AND p."Payment Method"='Net-off at Disbursement') THEN
    RAISE EXCEPTION 'First-day receipt must match an eligible loan-date net-off';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_charge_balances(p_id)
    WHERE principal IS NULL OR interest IS NULL OR principal<0 OR interest<0) THEN
    RAISE EXCEPTION 'Eligible charge has missing or negative components; reconcile first';
  END IF;
  IF p."Allocation Method"='Selected Charges' AND (
    (SELECT count(*) FROM public.payment_charge_balances(p_id)) <>
      cardinality(public.selected_charge_ids(p."Selected Charge IDs"))
    OR EXISTS(SELECT 1 FROM public.payment_charge_balances(p_id) WHERE principal+interest<=0)) THEN
    RAISE EXCEPTION 'Selected charges changed or are not eligible; refresh and review the full selection';
  END IF;
  SELECT coalesce(sum(principal+interest),0) INTO available FROM public.payment_charge_balances(p_id);
  IF amount>available OR (p."Allocation Method" IN ('Single Full','Receive All','First-day Auto','Loan Close','Selected Charges') AND amount<>available) THEN
    RAISE EXCEPTION 'Payment does not match the current eligible balance';
  END IF;
  WITH ordered AS (
    SELECT *,row_number() OVER w ord,
      coalesce(sum(principal+interest) OVER(ORDER BY charge_day DESC,charge COLLATE "C" DESC
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) previous
    FROM public.payment_charge_balances(p_id) WHERE principal+interest>0
    WINDOW w AS(ORDER BY charge_day DESC,charge COLLATE "C" DESC)
  ), plan AS (
    SELECT *,least(principal+interest,greatest(0,amount-previous)) allocated FROM ordered
  )
  INSERT INTO public."Payment Allocations"("Row ID","Ref Payment","Ref Charge","Charge Date Snapshot",
    "Charge Row Number Snapshot","Interest Remaining Snapshot","Principal Remaining Snapshot","Amount Remaining Snapshot",
    "Allocation Order","Allocated Interest","Allocated Principal","Allocated Amount","Created At")
  SELECT 'pc6:'||length(p_id)||':'||p_id||':'||charge,p_id,charge,charge_day,
    -ord::integer,interest::money,principal::money,(interest+principal)::money,
    ord::integer,least(interest,allocated)::money,(allocated-least(interest,allocated))::money,allocated::money,
    statement_timestamp() AT TIME ZONE 'Asia/Bangkok' FROM plan WHERE allocated>0;
  INSERT INTO public."Repayments"("Row ID","Payment Date","Principal Paid","Interest Paid","Notes",
    "Ref Loans","Ref Charges","Created By","Ref Payment","Ref Payment Allocation")
  SELECT a."Row ID",p."Payment Date",a."Allocated Principal",a."Allocated Interest",p."Notes",
    c."Ref Loans",a."Ref Charge",p."Created By",p_id,a."Row ID"
  FROM public."Payment Allocations" a JOIN public."Charges" c ON c."Row ID"=a."Ref Charge"
  WHERE a."Ref Payment"=p_id;
  IF amount IS DISTINCT FROM (SELECT sum("Allocated Amount"::numeric) FROM public."Payment Allocations" WHERE "Ref Payment"=p_id)
    OR amount IS DISTINCT FROM (SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric) FROM public."Repayments" WHERE "Ref Payment"=p_id) THEN
    RAISE EXCEPTION 'Payment ledger reconciliation failed';
  END IF;
  PERFORM public.close_payment_loans(p_id);
  UPDATE public."Payments" SET "Status"='Posted',"Processed At"=clock_timestamp() AT TIME ZONE 'Asia/Bangkok'
    WHERE "Row ID"=p_id;
END $function$;
CREATE OR REPLACE FUNCTION public.post_payment_explicit_v6(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE p public."Payments"%ROWTYPE; amount numeric; available numeric; command jsonb; projected jsonb; invalid_plan boolean;
BEGIN
  SELECT canonical_json::jsonb->'command' INTO command FROM public.pwa_payment_commands WHERE payment_id=p_id AND outcome='posted' AND canonical_json::jsonb->'command'->'schemaVersion'='6'::jsonb;
  IF command IS NULL THEN RAISE EXCEPTION 'PWA immutable plan required';END IF;
  SELECT * INTO STRICT p FROM public."Payments" WHERE "Row ID"=p_id;
  IF p."Status"='Posted' THEN RETURN; END IF;
  IF p."Status" IS DISTINCT FROM 'Processing' THEN
    RAISE EXCEPTION 'Payment must be Processing before posting';
  END IF;
  IF p."Allocation Method" IS NULL OR p."Allocation Method" NOT IN
    ('Single Full','Single Partial','Receive All','Lump Sum','First-day Auto','Loan Close','Selected Charges') THEN
    RAISE EXCEPTION 'Unsupported payment allocation method';
  END IF;
  amount:=p."Amount Received"::numeric;
  IF amount IS NULL OR amount<=0 OR amount<>trunc(amount) THEN
    RAISE EXCEPTION 'Payment requires a positive whole-baht amount';
  END IF;
  IF p."Payment Date" IS NULL OR p."Payment Date"> (statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date THEN
    RAISE EXCEPTION 'Payment date must be present and no later than today';
  END IF;
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=p."Ref Borrower" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment borrower does not exist'; END IF;
  -- The receipt BEFORE trigger acquires this same lock before INSERT. Re-read
  -- after acquisition for callers invoking the business function directly.
  SELECT * INTO STRICT p FROM public."Payments" WHERE "Row ID"=p_id FOR UPDATE;
  IF p."Status"='Posted' THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public."Payments" q WHERE q."Ref Borrower"=p."Ref Borrower"
    AND q."Row ID"<>p_id AND q."Status" IN ('Processing','Error')
    AND NOT coalesce(nullif(current_setting('payment_crud.parents',true),'')::jsonb ? q."Row ID",false)) THEN
    RAISE EXCEPTION 'Another receipt for this borrower requires reconciliation';
  END IF;
  IF EXISTS (SELECT 1 FROM public."Payment Allocations" WHERE "Ref Payment"=p_id)
    OR EXISTS (SELECT 1 FROM public."Repayments" WHERE "Ref Payment"=p_id) THEN
    RAISE EXCEPTION 'Existing receipt results require reconciliation; reallocation refused';
  END IF;
  PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers"=p."Ref Borrower"
    ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
  PERFORM 1 FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
    WHERE l."Ref Borrowers"=p."Ref Borrower" ORDER BY c."Row ID" COLLATE "C" FOR UPDATE OF c;
  IF p."Allocation Method" IS DISTINCT FROM 'Selected Charges' OR p."Ref Borrower" IS DISTINCT FROM command->>'borrowerId' OR p."Amount Received"::numeric IS DISTINCT FROM (command->>'amountReceived')::numeric THEN RAISE EXCEPTION 'Explicit allocation identity mismatch';END IF;
  -- One materialized projection provides both validation and insertion inputs.
  WITH lines AS MATERIALIZED (SELECT value line FROM jsonb_array_elements(command->'allocations')),
  paid AS MATERIALIZED (
   SELECT "Ref Charges" charge,sum("Principal Paid"::numeric) principal,sum("Interest Paid"::numeric) interest,count(*) FILTER(WHERE "Principal Paid" IS NULL OR "Interest Paid" IS NULL) invalid
   FROM public."Repayments" WHERE "Ref Charges" IN (SELECT line->>'chargeId' FROM lines) GROUP BY "Ref Charges"
  ), plan AS MATERIALIZED (
   SELECT line,c."Charge Date" AS day,l."Ref Borrowers" borrower,c."Principal Due"::numeric-coalesce(paid.principal,0) principal,c."Interest Due"::numeric-coalesce(paid.interest,0) interest,coalesce(paid.invalid,0) invalid,row_number() OVER(ORDER BY c."Charge Date" DESC,(line->>'chargeId') COLLATE "C" DESC) ord
   FROM lines LEFT JOIN public."Charges" c ON c."Row ID"=line->>'chargeId' LEFT JOIN public."Loans" l ON l."Row ID"=c."Ref Loans" LEFT JOIN paid ON paid.charge=c."Row ID"
  )
  SELECT jsonb_agg(jsonb_build_object('charge',line->>'chargeId','day',day,'principal',principal,'interest',interest,'paidPrincipal',(line->>'principal')::numeric,'paidInterest',(line->>'interest')::numeric,'ord',ord) ORDER BY ord),
   bool_or(borrower IS DISTINCT FROM p."Ref Borrower" OR invalid>0 OR day IS NULL OR principal IS NULL OR interest IS NULL OR principal<0 OR interest<0 OR principal<>trunc(principal) OR interest<>trunc(interest) OR (line->>'principal')::numeric>principal OR (line->>'interest')::numeric>interest)
  INTO projected,invalid_plan FROM plan;
  IF invalid_plan IS DISTINCT FROM false OR jsonb_array_length(projected)<>jsonb_array_length(command->'allocations') THEN RAISE EXCEPTION 'Explicit allocation exceeds current components';END IF;
  INSERT INTO public."Payment Allocations"("Row ID","Ref Payment","Ref Charge","Charge Date Snapshot","Charge Row Number Snapshot","Interest Remaining Snapshot","Principal Remaining Snapshot","Amount Remaining Snapshot","Allocation Order","Allocated Interest","Allocated Principal","Allocated Amount","Created At")
  SELECT 'pc6:'||length(p_id)||':'||p_id||':'||charge,p_id,charge,day,-ord,interest::money,principal::money,(principal+interest)::money,ord,"paidInterest"::money,"paidPrincipal"::money,("paidPrincipal"+"paidInterest")::money,statement_timestamp() AT TIME ZONE 'Asia/Bangkok'
  FROM jsonb_to_recordset(projected) AS x(charge text,day date,principal numeric,interest numeric,"paidPrincipal" numeric,"paidInterest" numeric,ord integer);
  INSERT INTO public."Repayments"("Row ID","Payment Date","Principal Paid","Interest Paid","Notes",
    "Ref Loans","Ref Charges","Created By","Ref Payment","Ref Payment Allocation")
  SELECT a."Row ID",p."Payment Date",a."Allocated Principal",a."Allocated Interest",p."Notes",
    c."Ref Loans",a."Ref Charge",p."Created By",p_id,a."Row ID"
  FROM public."Payment Allocations" a JOIN public."Charges" c ON c."Row ID"=a."Ref Charge"
  WHERE a."Ref Payment"=p_id;
  IF amount IS DISTINCT FROM (SELECT sum("Allocated Amount"::numeric) FROM public."Payment Allocations" WHERE "Ref Payment"=p_id)
    OR amount IS DISTINCT FROM (SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric) FROM public."Repayments" WHERE "Ref Payment"=p_id) THEN
    RAISE EXCEPTION 'Payment ledger reconciliation failed';
  END IF;
  PERFORM public.close_payment_loans(p_id);
  UPDATE public."Payments" SET "Status"='Posted',"Processed At"=clock_timestamp() AT TIME ZONE 'Asia/Bangkok'
    WHERE "Row ID"=p_id;
END $function$;

CREATE OR REPLACE FUNCTION public.post_payment(p_id text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.pwa_payment_commands WHERE payment_id=p_id AND outcome='posted' AND canonical_json::jsonb->'command'->'schemaVersion'='6'::jsonb) THEN
  PERFORM public.post_payment_explicit_v6(p_id);
 ELSE PERFORM public.post_payment_legacy_v59(p_id);END IF;
END $$;


-- Invoker guard: ordinary broad application writers cannot forge/recreate v6 receipts.
CREATE FUNCTION public.guard_pwa_explicit_payment_v6() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE envelope jsonb;c jsonb;ids text[];
BEGIN
 SELECT canonical_json::jsonb INTO envelope FROM public.pwa_payment_commands WHERE payment_id=NEW."Row ID" AND outcome='posted' AND canonical_json::jsonb->'command'->'schemaVersion'='6'::jsonb;
 IF envelope IS NULL THEN RETURN NEW;END IF;
 c:=envelope->'command';SELECT array_agg(value->>'chargeId' ORDER BY (value->>'chargeId') COLLATE "C") INTO ids FROM jsonb_array_elements(c->'allocations');
 IF TG_OP='INSERT' AND current_user<>'mw_app_dev_journal_owner' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Explicit command receipt must originate in governed submit';END IF;
 IF NEW."Ref Borrower" IS DISTINCT FROM c->>'borrowerId' OR NEW."Amount Received"::numeric IS DISTINCT FROM (c->>'amountReceived')::numeric OR NEW."Allocation Method" IS DISTINCT FROM 'Selected Charges' OR public.selected_charge_ids(NEW."Selected Charge IDs") IS DISTINCT FROM ids OR NEW."Ref Target Charge" IS NOT NULL OR NEW."Ref Target Loan" IS NOT NULL OR NEW."Created By" IS DISTINCT FROM envelope->'actor'->>'loginEmail' THEN RAISE EXCEPTION 'Immutable explicit allocation scope';END IF;
 IF TG_OP='INSERT' AND (NEW."Status" IS DISTINCT FROM 'Processing' OR NEW."Payment Date" IS DISTINCT FROM (c->>'paymentDate')::date OR NEW."Payment Method" IS DISTINCT FROM c->>'paymentMethod' OR NEW."Ref Received By Cash Account" IS DISTINCT FROM c->>'cashAccountId') THEN RAISE EXCEPTION 'Explicit command input mismatch';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_pwa_explicit_payment_v6() FROM PUBLIC;
CREATE TRIGGER a000_pwa_explicit_plan BEFORE INSERT OR UPDATE ON public."Payments" FOR EACH ROW EXECUTE FUNCTION public.guard_pwa_explicit_payment_v6();
