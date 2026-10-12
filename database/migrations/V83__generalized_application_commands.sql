-- R052 Phase 5: evolve the existing immutable journal; no second table.
ALTER TABLE public.pwa_payment_commands ADD COLUMN result_json jsonb;
DO $$DECLARE row record; BEGIN
 FOR row IN SELECT conname FROM pg_constraint WHERE conrelid='public.pwa_payment_commands'::regclass AND contype='c' AND (pg_get_constraintdef(oid) LIKE '%contract_version%' OR pg_get_constraintdef(oid) LIKE '%outcome%' OR pg_get_constraintdef(oid) LIKE '%contractVersion%') LOOP
  EXECUTE format('ALTER TABLE public.pwa_payment_commands DROP CONSTRAINT %I',row.conname);
 END LOOP;
END $$;
ALTER TABLE public.pwa_payment_commands
 ADD CONSTRAINT pwa_contract_versions CHECK(contract_version IN(1,2)),
 ADD CONSTRAINT pwa_versioned_outcome CHECK((
 (contract_version=1 AND result_json IS NULL AND ((outcome='posted' AND payment_id='pwa:'||request_id::text AND rejection_code IS NULL) OR(outcome='rejected' AND payment_id IS NULL AND rejection_code IN('invalid_date','borrower_unavailable','account_unavailable','selection_unavailable'))))
 OR(contract_version=2 AND payment_id IS NULL AND ((outcome='applied' AND rejection_code IS NULL AND jsonb_typeof(result_json)='object' AND octet_length(result_json::text)<=524288 AND result_json ?& ARRAY['operation','targetType','targetId','paymentId','plan','predecessorRequestId'] AND result_json-ARRAY['operation','targetType','targetId','paymentId','plan','predecessorRequestId','sourceCreatedBy']='{}'::jsonb AND (NOT result_json ? 'sourceCreatedBy' OR jsonb_typeof(result_json->'sourceCreatedBy') IN('string','null')) AND result_json->>'operation'=canonical_json::jsonb#>>'{command,operation}' AND result_json->>'targetType'=canonical_json::jsonb#>>'{command,targetType}' AND result_json->>'targetId'=canonical_json::jsonb#>>'{command,targetId}') OR(outcome='rejected' AND result_json IS NULL AND rejection_code IN('source_conflict','not_found','invalid_reference','borrower_name_exists','dependency_conflict','insufficient_funds','plan_changed','invalid_date','account_unavailable','record_requires_reconciliation'))))) IS TRUE),
 ADD CONSTRAINT pwa_versioned_envelope CHECK((jsonb_typeof(canonical_json::jsonb)='object'
 AND canonical_json::jsonb->>'contractVersion'=contract_version::text
 AND CASE WHEN contract_version=1 THEN canonical_json::jsonb#>>'{command,requestId}' ELSE canonical_json::jsonb->>'requestId' END=request_id::text
 AND canonical_json::jsonb#>>'{actor,issuer}'=actor_issuer AND canonical_json::jsonb#>>'{actor,subject}'=actor_subject
 AND canonical_json::jsonb#>>'{actor,partnerId}'=actor_partner_id AND canonical_json::jsonb#>>'{actor,loginEmail}'=actor_login_email) IS TRUE);
CREATE INDEX pwa_operation_target_v2 ON public.pwa_payment_commands((canonical_json::jsonb#>>'{command,operation}'),(canonical_json::jsonb#>>'{command,targetType}'),(canonical_json::jsonb#>>'{command,targetId}'),recorded_at,request_id) WHERE contract_version=2;
CREATE UNIQUE INDEX pwa_operation_successor_v2 ON public.pwa_payment_commands((canonical_json::jsonb#>>'{command,targetId}'),(coalesce(canonical_json::jsonb#>>'{command,predecessorRequestId}',''))) WHERE contract_version=2 AND outcome='applied' AND canonical_json::jsonb#>>'{command,operation}'='payment.correct';
CREATE INDEX pwa_operation_actor_v2 ON public.pwa_payment_commands(actor_issuer,actor_subject,recorded_at,request_id) WHERE contract_version=2;

CREATE FUNCTION public.pwa_borrower_version_v2(id text) RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object('id',b."Row ID",'createdDate',b."Creation Date",'aiCollectionEnabled',b."AI Collection Enabled",'name',b."Borrower Name",'description',b."Description",'communicationName',b."Communication Name",'instagramUsername',b."Instagram Username",'city',b."City",'workingLocation',b."Working Location",'address',b."Address",'hidden',b."Hidden Flag",'referrerId',b."Ref Referrer",'preferredReceivingAccountId',b."Ref Preferred Receiving Cash Account",'note',b."Borrower Note" )::text,'UTF8')),'hex') FROM public."Borrowers" b WHERE b."Row ID"=$1;
$$;

CREATE FUNCTION public.pwa_operation_status_v2(request_id uuid,actor_issuer text,actor_subject text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.pwa_payment_commands%ROWTYPE;
BEGIN
 IF current_database() NOT IN('loan_manager_dev','payment_rehearsal') OR NOT pg_has_role(session_user,'mw_app_dev','MEMBER') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Application session required';END IF;
 SELECT * INTO r FROM public.pwa_payment_commands p WHERE p.request_id=$1 AND p.contract_version=2 AND p.actor_issuer=$2 AND p.actor_subject=$3;
 IF NOT FOUND THEN RETURN jsonb_build_object('kind','unresolved');END IF;
 IF (SELECT count(*) FROM public."Partners" WHERE lower(btrim("Login Email"))=r.actor_login_email)<>1 OR NOT EXISTS(SELECT 1 FROM public."Partners" WHERE "Row ID"=r.actor_partner_id AND lower(btrim("Login Email"))=r.actor_login_email) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current actor mapping required';END IF;
 RETURN jsonb_build_object('kind','recorded','originalOutcome',jsonb_build_object('status',r.outcome,'code',r.rejection_code,'result',r.result_json,'recordedAt',to_char(r.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
END $$;
ALTER FUNCTION public.pwa_operation_status_v2(uuid,text,text) OWNER TO mw_app_dev_journal_owner;
REVOKE ALL ON FUNCTION public.pwa_operation_status_v2(uuid,text,text) FROM PUBLIC;

CREATE FUNCTION public.pwa_submit_operation_v2(canonical_json text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE e jsonb;a jsonb;c jsonb;i jsonb;old public.pwa_payment_commands%ROWTYPE;request uuid;target text;op text;expected text;canonical text;input_text text;receipt_text text;r jsonb;actor_text text;command_text text;k text;v text;rejection text;result_value jsonb;keys text[];source_version text;
BEGIN
 IF current_database() NOT IN('loan_manager_dev','payment_rehearsal') OR NOT pg_has_role(session_user,'mw_app_dev','MEMBER') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Application session required';END IF;
 PERFORM set_config('pwa.native_inverse_request','',true);
 IF $1 IS NULL OR octet_length($1)>524288 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid operation';END IF;
 BEGIN
 e:=$1::jsonb;a:=e->'actor';c:=e->'command';i:=c->'inputs';
 IF jsonb_typeof(e) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(e) key) IS DISTINCT FROM ARRAY['actor','command','contractVersion','receipt','requestId'] OR e->'contractVersion'<>'2'::jsonb THEN RAISE EXCEPTION 'shape';END IF;
 IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c) key) IS DISTINCT FROM ARRAY['expectedVersion','inputs','operation','predecessorRequestId','schemaVersion','targetId','targetType'] OR c->'schemaVersion'<>'1'::jsonb OR c->>'targetType' IS DISTINCT FROM split_part(c->>'operation','.',1) THEN RAISE EXCEPTION 'command';END IF;
 IF e->>'requestId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'id';END IF;request:=(e->>'requestId')::uuid;
 target:=c->>'targetId';op:=c->>'operation';expected:=c->>'expectedVersion';
 IF jsonb_typeof(c->'targetId') IS DISTINCT FROM 'string' OR octet_length(target) NOT BETWEEN 1 AND 256 OR target~'[[:cntrl:]]' OR op NOT IN('borrower.create','borrower.update','borrower.delete','loan.create','loan.update','loan.delete','loan.default','loan.undo-default','loan.generate-charge','loan.close','charge.create','charge.update','charge.delete','payment.correct','payment.delete','payment.move-interest','expense.create','expense.update','expense.delete','preference.update') THEN RAISE EXCEPTION 'target';END IF;
 IF split_part(op,'.',1)='payment' THEN IF c->'predecessorRequestId'<>'null'::jsonb AND (jsonb_typeof(c->'predecessorRequestId') IS DISTINCT FROM 'string' OR c->>'predecessorRequestId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$') THEN RAISE EXCEPTION 'predecessor';END IF;ELSIF c->'predecessorRequestId'<>'null'::jsonb THEN RAISE EXCEPTION 'predecessor';END IF;
 IF op IN('borrower.create','loan.create','charge.create','expense.create') THEN IF c->'expectedVersion'<>'null'::jsonb OR target !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'create';END IF;
 ELSE IF jsonb_typeof(c->'expectedVersion') IS DISTINCT FROM 'string' OR expected !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'version';END IF;END IF;
 IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(a) key) IS DISTINCT FROM ARRAY['issuer','loginEmail','partnerId','subject'] THEN RAISE EXCEPTION 'actor';END IF;
 FOREACH k IN ARRAY ARRAY['issuer','subject','partnerId','loginEmail'] LOOP v:=a->>k;IF jsonb_typeof(a->k) IS DISTINCT FROM 'string' OR btrim(v)='' OR v~'[[:cntrl:]]' OR octet_length(v)>(CASE k WHEN 'issuer' THEN 1024 WHEN 'subject' THEN 128 WHEN 'partnerId' THEN 256 ELSE 320 END) THEN RAISE EXCEPTION 'actor';END IF;END LOOP;
 IF a->>'loginEmail'<>lower(btrim(a->>'loginEmail')) OR a->>'partnerId'<>btrim(a->>'partnerId') THEN RAISE EXCEPTION 'actor';END IF;
 actor_text:='{"issuer":'||to_json(a->>'issuer')::text||',"subject":'||to_json(a->>'subject')::text||',"partnerId":'||to_json(a->>'partnerId')::text||',"loginEmail":'||to_json(a->>'loginEmail')::text||'}';
 r:=e->'receipt';receipt_text:='null';
 IF r IS DISTINCT FROM 'null'::jsonb THEN
  IF op NOT IN('loan.close','payment.correct') OR jsonb_typeof(r) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(r) key) IS DISTINCT FROM ARRAY['mimeType','receiptId','sha256','sizeBytes','storageReference'] THEN RAISE EXCEPTION 'receipt';END IF;
  IF jsonb_typeof(r->'receiptId') IS DISTINCT FROM 'string' OR r->>'receiptId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR jsonb_typeof(r->'sha256') IS DISTINCT FROM 'string' OR r->>'sha256'!~'^[a-f0-9]{64}$' OR r->>'mimeType' NOT IN('image/png','image/jpeg') OR jsonb_typeof(r->'sizeBytes') IS DISTINCT FROM 'number' OR r->>'sizeBytes'!~'^[1-9][0-9]*$' OR (r->>'sizeBytes')::numeric>5242880 OR jsonb_typeof(r->'storageReference') IS DISTINCT FROM 'string' OR octet_length(r->>'storageReference') NOT BETWEEN 1 AND 2048 OR r->>'storageReference'~'[\r\n]' THEN RAISE EXCEPTION 'receipt';END IF;
  receipt_text:='{"receiptId":'||to_json(r->>'receiptId')::text||',"sha256":'||to_json(r->>'sha256')::text||',"mimeType":'||to_json(r->>'mimeType')::text||',"sizeBytes":'||(r->>'sizeBytes')||',"storageReference":'||to_json(r->>'storageReference')::text||'}';
 END IF;
 IF jsonb_typeof(i) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'inputs';END IF;
 IF op='preference.update' THEN
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['language','statementAccountId','statementDate'] OR jsonb_typeof(i->'language') IS DISTINCT FROM 'string' OR i->>'language' NOT IN('English','ไทย') OR jsonb_typeof(i->'statementAccountId') NOT IN('string','null') OR jsonb_typeof(i->'statementDate') NOT IN('string','null') THEN RAISE EXCEPTION 'preference fields';END IF;
 IF i->'statementAccountId'<>'null'::jsonb AND (octet_length(i->>'statementAccountId') NOT BETWEEN 1 AND 256 OR i->>'statementAccountId'~'[[:cntrl:]]') THEN RAISE EXCEPTION 'preference account';END IF;
 IF i->'statementDate'<>'null'::jsonb AND (i->>'statementDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'statementDate')::date)::text<>i->>'statementDate') THEN RAISE EXCEPTION 'preference date';END IF;
 input_text:='{"language":'||to_json(i->>'language')::text||',"statementAccountId":'||coalesce(to_json(i->>'statementAccountId')::text,'null')||',"statementDate":'||coalesce(to_json(i->>'statementDate')::text,'null')||'}';
 ELSIF op IN('expense.create','expense.update') THEN
 keys:=ARRAY['expenseDate','category','amount','payeeName','relatedBorrowerId','relatedLoanId','notes','paidByAccountId'];
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM unnest(keys) key) THEN RAISE EXCEPTION 'expense keys';END IF;
 input_text:='{';FOREACH k IN ARRAY keys LOOP
 IF jsonb_typeof(i->k) NOT IN('string','null') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION 'expense field';END IF;
 IF k IN('expenseDate','category','amount') AND jsonb_typeof(i->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'expense required';END IF;
 IF k IN('relatedBorrowerId','relatedLoanId','paidByAccountId') AND i->k<>'null'::jsonb AND (octet_length(i->>k) NOT BETWEEN 1 AND 256 OR i->>k~'[[:cntrl:]]') THEN RAISE EXCEPTION 'expense reference';END IF;
 input_text:=input_text||CASE WHEN input_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||coalesce(to_json(i->>k)::text,'null');END LOOP;input_text:=input_text||'}';
 IF i->>'expenseDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'expenseDate')::date)::text<>i->>'expenseDate' OR btrim(i->>'category')='' OR i->>'amount'!~'^-?[1-9][0-9]*$' OR abs((i->>'amount')::numeric)>92233720368547758 THEN RAISE EXCEPTION 'expense input';END IF;
 ELSIF op='payment.correct' THEN input_text:=public.pwa_payment_correction_text_v2(i);IF (i->>'receiptMode'='replace') IS DISTINCT FROM (r<>'null'::jsonb) THEN RAISE EXCEPTION 'receipt mode';END IF;
 ELSIF op='payment.move-interest' THEN IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['allocationId','targetChargeId'] THEN RAISE EXCEPTION 'move keys';END IF;FOREACH k IN ARRAY ARRAY['allocationId','targetChargeId'] LOOP IF jsonb_typeof(i->k) IS DISTINCT FROM 'string' OR octet_length(i->>k) NOT BETWEEN 1 AND 256 OR i->>k~'[[:cntrl:]]' THEN RAISE EXCEPTION 'move reference';END IF;END LOOP;input_text:='{"allocationId":'||to_json(i->>'allocationId')::text||',"targetChargeId":'||to_json(i->>'targetChargeId')::text||'}';
 ELSIF op IN('loan.create','loan.update') THEN
 keys:=ARRAY['borrowerId','loanDate','principal','transferFee','disbursingAccountId','type','dueDate','dailyPayment','fixedInterest','currentDailyInterest','paymentInterval','arrangement','autoChargeEnabled'];
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM unnest(keys) key) THEN RAISE EXCEPTION 'loan keys';END IF;
 input_text:='{';FOREACH k IN ARRAY keys LOOP
  IF k='autoChargeEnabled' THEN IF jsonb_typeof(i->k) NOT IN('boolean','null') THEN RAISE EXCEPTION 'loan boolean';END IF;
  ELSIF k='paymentInterval' THEN IF i->k<>'null'::jsonb AND (jsonb_typeof(i->k)<>'number' OR i->>k!~'^[1-9][0-9]*$' OR (i->>k)::numeric>2147483647) THEN RAISE EXCEPTION 'loan interval';END IF;
  ELSE
   IF jsonb_typeof(i->k) NOT IN('string','null') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION 'loan text';END IF;
   IF k IN('principal','transferFee','dailyPayment','fixedInterest','currentDailyInterest') AND i->k<>'null'::jsonb AND (i->>k!~'^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' OR (i->>k)::numeric>92233720368547758.07) THEN RAISE EXCEPTION 'loan amount';END IF;
   IF k='type' AND i->k<>'null'::jsonb AND i->>k NOT IN('กำหนดวันชำระ','ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน') THEN RAISE EXCEPTION 'loan type';END IF;
   IF k IN('loanDate','dueDate') AND i->k<>'null'::jsonb AND (i->>k!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>k)::date)::text<>i->>k) THEN RAISE EXCEPTION 'loan date';END IF;
   IF k IN('borrowerId','disbursingAccountId') AND ((op='loan.create' AND i->k='null'::jsonb) OR (i->k<>'null'::jsonb AND (octet_length(i->>k) NOT BETWEEN 1 AND 256 OR i->>k~'[[:cntrl:]]'))) THEN RAISE EXCEPTION 'loan reference';END IF;
  END IF;
  input_text:=input_text||CASE WHEN input_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||CASE WHEN i->k='null'::jsonb THEN 'null' WHEN k IN('autoChargeEnabled','paymentInterval') THEN (i->k)::text ELSE to_json(i->>k)::text END;
 END LOOP;input_text:=input_text||'}';
 IF op='loan.create' AND ((i->>'principal')::numeric IS NULL OR (i->>'principal')::numeric<=0 OR i->>'loanDate' IS NULL OR i->>'type' IS NULL OR i->>'type' NOT IN('กำหนดวันชำระ','ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน')) THEN RAISE EXCEPTION 'loan required';END IF;
 ELSIF op IN('charge.create','charge.update') THEN
 keys:=ARRAY['loanId','chargeDate','principalDue','interestDue','notes'];
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM unnest(keys) key) THEN RAISE EXCEPTION 'charge keys';END IF;
 input_text:='{';FOREACH k IN ARRAY keys LOOP
 IF (k='notes' AND jsonb_typeof(i->k) NOT IN('string','null')) OR (k<>'notes' AND jsonb_typeof(i->k) IS DISTINCT FROM 'string') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION 'charge input';END IF;
 input_text:=input_text||CASE WHEN input_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||coalesce(to_json(i->>k)::text,'null');
 END LOOP;input_text:=input_text||'}';
 IF octet_length(i->>'loanId') NOT BETWEEN 1 AND 256 OR i->>'loanId'~'[[:cntrl:]]' OR i->>'chargeDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'chargeDate')::date)::text<>i->>'chargeDate' OR i->>'principalDue'!~'^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' OR i->>'interestDue'!~'^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' OR abs((i->>'principalDue')::numeric)>92233720368547758.07 OR abs((i->>'interestDue')::numeric)>92233720368547758.07 THEN RAISE EXCEPTION 'charge input';END IF;
 ELSIF op='loan.close' THEN
 keys:=ARRAY['paymentDate','cashAccountId','paymentMethod','notes','expectedAmount','expectedPlanHash'];
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM unnest(keys) key) THEN RAISE EXCEPTION 'close keys';END IF;
 input_text:='{';FOREACH k IN ARRAY keys LOOP
  IF (k='notes' AND jsonb_typeof(i->k) NOT IN('string','null')) OR (k<>'notes' AND jsonb_typeof(i->k) IS DISTINCT FROM 'string') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION 'close input';END IF;
  input_text:=input_text||CASE WHEN input_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||coalesce(to_json(i->>k)::text,'null');
 END LOOP;input_text:=input_text||'}';
 IF i->>'paymentDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'paymentDate')::date)::text<>i->>'paymentDate' OR octet_length(i->>'cashAccountId') NOT BETWEEN 1 AND 256 OR i->>'cashAccountId'~'[[:cntrl:]]' OR i->>'paymentMethod' NOT IN('Bank Transfer','Cash','Net-off at Disbursement') OR i->>'expectedAmount'!~'^[1-9][0-9]*$' OR (i->>'expectedAmount')::numeric>92233720368547758 OR i->>'expectedPlanHash'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'close input';END IF;
 ELSIF op IN('loan.default','loan.generate-charge') THEN
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['businessDate'] OR jsonb_typeof(i->'businessDate') IS DISTINCT FROM 'string' OR i->>'businessDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'businessDate')::date)::text<>i->>'businessDate' THEN RAISE EXCEPTION 'business date';END IF;
 input_text:='{"businessDate":'||to_json(i->>'businessDate')::text||'}';
 ELSIF op IN('borrower.delete','loan.delete','loan.undo-default','charge.delete','payment.delete','expense.delete') THEN IF i<>'{}'::jsonb THEN RAISE EXCEPTION 'delete';END IF;input_text:='{}';
 ELSE
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['address','city','communicationName','description','hidden','instagramUsername','name','note','preferredReceivingAccountId','referrerId','workingLocation'] THEN RAISE EXCEPTION 'inputs';END IF;
 input_text:='{';FOREACH k IN ARRAY ARRAY['name','description','communicationName','instagramUsername','city','workingLocation','address','hidden','referrerId','preferredReceivingAccountId','note'] LOOP
  IF k='hidden' THEN IF jsonb_typeof(i->k) NOT IN('boolean','null') THEN RAISE EXCEPTION 'boolean';END IF;
  ELSE IF jsonb_typeof(i->k) NOT IN('string','null') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION 'text';END IF;
  IF k IN('referrerId','preferredReceivingAccountId') AND i->k<>'null'::jsonb AND (octet_length(i->>k) NOT BETWEEN 1 AND 256 OR i->>k~'[[:cntrl:]]') THEN RAISE EXCEPTION 'ref';END IF;END IF;
  input_text:=input_text||CASE WHEN input_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||CASE WHEN i->k='null'::jsonb THEN 'null' WHEN k='hidden' THEN (i->k)::text ELSE to_json(i->>k)::text END;
 END LOOP;input_text:=input_text||'}';END IF;
 command_text:='{"schemaVersion":1,"operation":'||to_json(op)::text||',"targetType":'||to_json(split_part(op,'.',1))::text||',"targetId":'||to_json(target)::text||',"expectedVersion":'||coalesce(to_json(expected)::text,'null')||',"predecessorRequestId":'||coalesce(to_json(c->>'predecessorRequestId')::text,'null')||',"inputs":'||input_text||'}';
 canonical:='{"contractVersion":2,"requestId":'||to_json(request::text)::text||',"actor":'||actor_text||',"command":'||command_text||',"receipt":'||receipt_text||'}';
 IF canonical IS DISTINCT FROM $1 THEN RAISE EXCEPTION 'noncanonical';END IF;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid canonical operation';END;
 IF (SELECT count(*) FROM public."Partners" WHERE lower(btrim("Login Email"))=a->>'loginEmail')<>1 OR NOT EXISTS(SELECT 1 FROM public."Partners" WHERE "Row ID"=a->>'partnerId' AND lower(btrim("Login Email"))=a->>'loginEmail') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current actor mapping required';END IF;
 IF op='preference.update' AND target IS DISTINCT FROM a->>'partnerId' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Own preferences required';END IF;
 PERFORM pg_advisory_xact_lock(1347895619,hashtext(request::text));
 SELECT * INTO old FROM public.pwa_payment_commands p WHERE p.request_id=request;
 IF FOUND THEN
  IF old.contract_version<>2 OR old.canonical_json<>$1 OR old.actor_issuer<>a->>'issuer' OR old.actor_subject<>a->>'subject' THEN RETURN jsonb_build_object('kind','conflict');END IF;
  RETURN public.pwa_operation_status_v2(request,a->>'issuer',a->>'subject');
 END IF;
 BEGIN
 IF op='preference.update' THEN result_value:=public.pwa_apply_preference_v2($1);ELSIF split_part(op,'.',1)='expense' THEN result_value:=public.pwa_apply_expense_v2($1);ELSIF split_part(op,'.',1)='payment' THEN result_value:=public.pwa_apply_payment_v2($1);ELSIF op='loan.create' THEN result_value:=public.pwa_apply_loan_create_v2($1);ELSIF op='loan.close' THEN result_value:=public.pwa_apply_loan_close_v2($1);ELSIF split_part(op,'.',1)='loan' THEN result_value:=public.pwa_apply_loan_source_v2($1);ELSIF split_part(op,'.',1)='charge' THEN result_value:=public.pwa_apply_charge_v2($1);ELSE
 PERFORM pg_advisory_xact_lock(hashtextextended('borrower:'||target,0));
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=target FOR UPDATE;
 source_version:=public.pwa_borrower_version_v2(target);
 IF op='borrower.create' AND source_version IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF op<>'borrower.create' AND source_version IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 IF op<>'borrower.create' AND source_version IS DISTINCT FROM expected THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF op<>'borrower.delete' THEN
  IF nullif(btrim(i->>'name'),'') IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('borrower-name:'||lower(btrim(i->>'name')),0));
   IF EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID"<>target AND lower(btrim("Borrower Name"))=lower(btrim(i->>'name'))) THEN RAISE EXCEPTION USING ERRCODE='P5B03';END IF;
  END IF;
  IF i->>'referrerId'=target OR (i->>'referrerId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID"=i->>'referrerId')) THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
  IF i->>'preferredReceivingAccountId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."Cash Accounts" ca JOIN public."Cash Holders" ch ON ch."Row ID"=ca."Ref Cash Holder" WHERE ca."Row ID"=i->>'preferredReceivingAccountId' AND ca."Active" IS TRUE AND ch."Active" IS TRUE) THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 END IF;
 -- Only this explicit source-write block translates known source constraints.
 BEGIN
 IF op='borrower.create' THEN
 INSERT INTO public."Borrowers"("Row ID","Borrower Name","Description","Communication Name","Instagram Username","City","Working Location","Address","Hidden Flag","Ref Referrer","Ref Preferred Receiving Cash Account","Borrower Note","Creation Date") VALUES(target,i->>'name',i->>'description',i->>'communicationName',i->>'instagramUsername',i->>'city',i->>'workingLocation',i->>'address',(i->>'hidden')::boolean,i->>'referrerId',i->>'preferredReceivingAccountId',i->>'note',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date);
 ELSIF op='borrower.update' THEN UPDATE public."Borrowers" SET "Borrower Name"=i->>'name',"Description"=i->>'description',"Communication Name"=i->>'communicationName',"Instagram Username"=i->>'instagramUsername',"City"=i->>'city',"Working Location"=i->>'workingLocation',"Address"=i->>'address',"Hidden Flag"=(i->>'hidden')::boolean,"Ref Referrer"=i->>'referrerId',"Ref Preferred Receiving Cash Account"=i->>'preferredReceivingAccountId',"Borrower Note"=i->>'note' WHERE "Row ID"=target;
 ELSE DELETE FROM public."Borrowers" WHERE "Row ID"=target;END IF;
 EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B05';WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION USING ERRCODE='P5B06';END;
 result_value:=jsonb_build_object('operation',op,'targetType','borrower','targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL);
 END IF;
 EXCEPTION WHEN SQLSTATE 'P5B01' THEN rejection:='source_conflict';WHEN SQLSTATE 'P5B02' THEN rejection:='not_found';WHEN SQLSTATE 'P5B03' THEN rejection:='borrower_name_exists';WHEN SQLSTATE 'P5B04' THEN rejection:='invalid_reference';WHEN SQLSTATE 'P5B05' THEN rejection:='dependency_conflict';WHEN SQLSTATE 'P5B06' THEN rejection:='record_requires_reconciliation';WHEN SQLSTATE 'P5B07' THEN rejection:='account_unavailable';WHEN SQLSTATE 'P5B08' THEN rejection:='invalid_date';WHEN SQLSTATE 'P5B09' THEN rejection:='plan_changed';END;
 IF NOT EXISTS(SELECT 1 FROM public.pwa_payment_commands WHERE request_id=request) THEN
 INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code,result_json)
 VALUES(request,2,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',$1,encode(sha256(convert_to($1,'UTF8')),'hex'),CASE WHEN rejection IS NULL THEN 'applied' ELSE 'rejected' END,NULL,rejection,CASE WHEN rejection IS NULL THEN result_value ELSE NULL END);END IF;
 RETURN public.pwa_operation_status_v2(request,a->>'issuer',a->>'subject');
END $$;
ALTER FUNCTION public.pwa_submit_operation_v2(text) OWNER TO mw_app_dev_journal_owner;
REVOKE ALL ON FUNCTION public.pwa_submit_operation_v2(text) FROM PUBLIC;
-- Historical receipt status must never reinterpret a general operation outcome.
DO $$DECLARE definition text;BEGIN
 SELECT pg_get_functiondef('public.pwa_command_status_v1(uuid,text,text)'::regprocedure) INTO definition;
 IF strpos(definition,'p.request_id=$1 AND p.actor_issuer=$2')=0 THEN RAISE EXCEPTION 'Unexpected retained status definition';END IF;
 EXECUTE replace(definition,'p.request_id=$1 AND p.actor_issuer=$2','p.request_id=$1 AND p.contract_version=1 AND p.actor_issuer=$2');
END $$;

-- Shared first-day calculation. No source writes or caller-selected posting origin.
-- Both native loan insertion and the protected operation wrapper consume these values.
CREATE FUNCTION public.first_day_components_v83(l public."Loans")
RETURNS TABLE(principal numeric,interest numeric)
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE days integer;
BEGIN
 IF NOT coalesce(l."Auto Charge Enabled",false) OR NOT coalesce((
   (l."Loan Type"='ดอกเบี้ยรายวัน' AND l."Current Daily Interest"::numeric>0) OR
   (l."Loan Type"='ผ่อนชำระรายวัน' AND l."Daily Payment Amount"::numeric>0)),false) THEN RETURN;END IF;
 IF l."Loan Date" IS NULL THEN RAISE EXCEPTION 'First-day charge requires Loan Date';END IF;
 principal:=0;
 IF l."Loan Type"='ผ่อนชำระรายวัน' THEN
  days:=l."Due Date"-l."Loan Date"+1;
  IF days IS NULL OR days<=0 OR l."Principal Amount" IS NULL OR l."Principal Amount"::numeric<0 THEN
   RAISE EXCEPTION 'Invalid installment principal or inclusive loan term';
  END IF;
  principal:=floor(l."Principal Amount"::numeric/days)+CASE WHEN mod(l."Principal Amount"::numeric,days)>0 THEN 1 ELSE 0 END;
  interest:=l."Daily Payment Amount"::numeric-principal+coalesce(l."Transfer Fee"::numeric,0);
 ELSE interest:=l."Current Daily Interest"::numeric+coalesce(l."Transfer Fee"::numeric,0);
 END IF;
 IF interest IS NULL OR interest<0 THEN RAISE EXCEPTION 'Invalid first-day interest component';END IF;
 RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.create_first_day_charge(p_loan text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE l public."Loans"%ROWTYPE; principal numeric:=0; interest numeric; days integer;
BEGIN
  SELECT * INTO STRICT l FROM public."Loans" WHERE "Row ID"=p_loan;
  IF NOT coalesce(l."Auto Charge Enabled",false) OR NOT coalesce((
    (l."Loan Type"='ดอกเบี้ยรายวัน' AND l."Current Daily Interest"::numeric>0) OR
    (l."Loan Type"='ผ่อนชำระรายวัน' AND l."Daily Payment Amount"::numeric>0)),false) THEN RETURN; END IF;
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=l."Ref Borrowers" FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"=p_loan AND "Charge Date"=l."Loan Date") THEN RETURN; END IF;
  IF l."Loan Date" IS NULL THEN RAISE EXCEPTION 'First-day charge requires Loan Date'; END IF;
  SELECT parts.principal,parts.interest INTO STRICT principal,interest
    FROM public.first_day_components_v83(l) parts;
  INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
    VALUES('fd6:'||p_loan,p_loan,l."Loan Date",principal::money,interest::money);
END $$;


-- Indexed immutable origin and linked correction-head lookup; source fields never choose an engine.
CREATE UNIQUE INDEX pwa_operation_receipt_v2 ON public.pwa_payment_commands((result_json->>'paymentId'))
 WHERE contract_version=2 AND outcome='applied' AND canonical_json::jsonb#>>'{command,operation}' IN('loan.create','loan.close','charge.create');
CREATE FUNCTION public.pwa_effective_payment_plan_v2(p_id text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE r public.pwa_payment_commands%ROWTYPE; revision public.pwa_payment_commands%ROWTYPE;
 origin uuid; head uuid; source_creator text; origin_actor jsonb; correction_actor jsonb; plan jsonb; c jsonb; matches integer; visited uuid[];
BEGIN
 SELECT count(*) INTO matches FROM public.pwa_payment_commands j WHERE
  (j.contract_version=1 AND j.payment_id=p_id AND j.outcome='posted' AND j.canonical_json::jsonb#>>'{command,schemaVersion}'='6') OR
  (j.contract_version=2 AND j.outcome='applied' AND j.result_json->>'paymentId'=p_id AND j.canonical_json::jsonb#>>'{command,operation}' IN('loan.create','loan.close','charge.create'));
 IF matches=0 THEN RETURN NULL;END IF;
 IF matches<>1 THEN RAISE EXCEPTION 'Ambiguous payment provenance';END IF;
 SELECT * INTO STRICT r FROM public.pwa_payment_commands j WHERE
  (j.contract_version=1 AND j.payment_id=p_id AND j.outcome='posted' AND j.canonical_json::jsonb#>>'{command,schemaVersion}'='6') OR
  (j.contract_version=2 AND j.outcome='applied' AND j.result_json->>'paymentId'=p_id AND j.canonical_json::jsonb#>>'{command,operation}' IN('loan.create','loan.close','charge.create'));
 origin:=r.request_id;head:=origin;visited:=ARRAY[head];origin_actor:=r.canonical_json::jsonb->'actor';source_creator:=CASE WHEN r.result_json ? 'sourceCreatedBy' THEN r.result_json->>'sourceCreatedBy' ELSE origin_actor->>'loginEmail' END;
 IF r.contract_version=1 THEN
  c:=r.canonical_json::jsonb->'command';
  plan:=jsonb_build_object('borrowerId',c->'borrowerId','amountReceived',c->'amountReceived','allocations',c->'allocations','allocationMethod','Selected Charges','targetChargeId',NULL,'targetLoanId',NULL,'cashAccountId',c->'cashAccountId','paymentDate',c->'paymentDate','paymentMethod',c->'paymentMethod');
 ELSE plan:=r.result_json->'plan';END IF;
 LOOP
  SELECT count(*) INTO matches FROM public.pwa_payment_commands j WHERE j.contract_version=2 AND j.outcome='applied'
   AND j.canonical_json::jsonb#>>'{command,operation}'='payment.correct'
   AND j.canonical_json::jsonb#>>'{command,targetType}'='payment' AND j.canonical_json::jsonb#>>'{command,targetId}'=p_id
   AND j.canonical_json::jsonb#>>'{command,predecessorRequestId}'=head::text;
  EXIT WHEN matches=0;
  IF matches<>1 OR cardinality(visited)>=10000 THEN RAISE EXCEPTION 'Invalid payment revision lineage';END IF;
  SELECT * INTO STRICT revision FROM public.pwa_payment_commands j WHERE j.contract_version=2 AND j.outcome='applied'
   AND j.canonical_json::jsonb#>>'{command,operation}'='payment.correct'
   AND j.canonical_json::jsonb#>>'{command,targetType}'='payment' AND j.canonical_json::jsonb#>>'{command,targetId}'=p_id
   AND j.canonical_json::jsonb#>>'{command,predecessorRequestId}'=head::text;
  IF revision.request_id=ANY(visited) OR revision.result_json->>'paymentId' IS DISTINCT FROM p_id THEN RAISE EXCEPTION 'Invalid payment revision identity';END IF;
  head:=revision.request_id;visited:=array_append(visited,head);correction_actor:=revision.canonical_json::jsonb->'actor';plan:=revision.result_json->'plan';
 END LOOP;
 IF (SELECT count(*) FROM public.pwa_payment_commands j WHERE j.contract_version=2 AND j.outcome='applied' AND j.canonical_json::jsonb#>>'{command,operation}'='payment.correct' AND j.canonical_json::jsonb#>>'{command,targetType}'='payment' AND j.canonical_json::jsonb#>>'{command,targetId}'=p_id)<>cardinality(visited)-1 THEN RAISE EXCEPTION 'Disconnected payment revision lineage';END IF;
 IF jsonb_typeof(plan) IS DISTINCT FROM 'object' OR jsonb_typeof(plan->'allocations') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Missing payment provenance plan';END IF;
 RETURN jsonb_build_object('sourceCreatedBy',source_creator,'originActor',origin_actor,'correctionActor',correction_actor,'plan',plan,'originRequestId',origin,'effectivePlanRequestId',head);
END $$;
-- Preserve the legacy implementation, changing only its existing wrong-origin entry guard.
DO $$DECLARE definition text;old text:='EXISTS(SELECT 1 FROM public.pwa_payment_commands WHERE payment_id=p_id AND outcome=''posted'' AND canonical_json::jsonb->''command''->''schemaVersion''=''6''::jsonb)';BEGIN
 SELECT pg_get_functiondef('public.post_payment_legacy_v59(text)'::regprocedure) INTO definition;
 IF strpos(definition,old)=0 THEN RAISE EXCEPTION 'Unexpected legacy origin guard';END IF;
 EXECUTE replace(definition,old,'public.pwa_effective_payment_plan_v2(p_id) IS NOT NULL');
END $$;
CREATE OR REPLACE FUNCTION public.post_payment(p_id text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$BEGIN
 IF public.pwa_effective_payment_plan_v2(p_id) IS NOT NULL THEN PERFORM public.post_payment_explicit_v6(p_id);
 ELSE PERFORM public.post_payment_legacy_v59(p_id);END IF;
END $$;
DO $$DECLARE definition text;old text;BEGIN
 SELECT pg_get_functiondef('public.post_payment_explicit_v6(text)'::regprocedure) INTO definition;
 old:='SELECT canonical_json::jsonb->''command'' INTO command FROM public.pwa_payment_commands WHERE payment_id=p_id AND outcome=''posted'' AND canonical_json::jsonb->''command''->''schemaVersion''=''6''::jsonb;';
 IF strpos(definition,old)=0 THEN RAISE EXCEPTION 'Unexpected explicit origin lookup';END IF;
 definition:=replace(definition,old,'SELECT public.pwa_effective_payment_plan_v2(p_id)->''plan'' INTO command;');
 old:='p."Allocation Method" IS DISTINCT FROM ''Selected Charges''';
 IF strpos(definition,old)=0 THEN RAISE EXCEPTION 'Unexpected explicit method guard';END IF;
 definition:=replace(definition,old,'p."Allocation Method" IS DISTINCT FROM command->>''allocationMethod''');
 EXECUTE definition;
END $$;
CREATE OR REPLACE FUNCTION public.guard_pwa_explicit_payment_v6() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE provenance jsonb;c jsonb;ids text[];
BEGIN
 provenance:=public.pwa_effective_payment_plan_v2(NEW."Row ID");IF provenance IS NULL THEN RETURN NEW;END IF;
 c:=provenance->'plan';SELECT array_agg(value->>'chargeId' ORDER BY (value->>'chargeId') COLLATE "C") INTO ids FROM jsonb_array_elements(c->'allocations');
 IF TG_OP='INSERT' AND current_user<>'mw_app_dev_journal_owner' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Explicit command receipt must originate in governed submit';END IF;
 IF NEW."Ref Borrower" IS DISTINCT FROM c->>'borrowerId' OR NEW."Amount Received"::numeric IS DISTINCT FROM (c->>'amountReceived')::numeric OR NEW."Allocation Method" IS DISTINCT FROM c->>'allocationMethod'
  OR NEW."Ref Target Charge" IS DISTINCT FROM c->>'targetChargeId' OR NEW."Ref Target Loan" IS DISTINCT FROM c->>'targetLoanId'
  OR NEW."Created By" IS DISTINCT FROM provenance->>'sourceCreatedBy'
  OR (c->>'allocationMethod'='Selected Charges' AND public.selected_charge_ids(NEW."Selected Charge IDs") IS DISTINCT FROM ids)
  OR (c->>'allocationMethod'<>'Selected Charges' AND NEW."Selected Charge IDs" IS NOT NULL) THEN RAISE EXCEPTION 'Immutable explicit allocation scope';END IF;
 IF TG_OP='INSERT' AND (NEW."Status" IS DISTINCT FROM 'Processing' OR NEW."Payment Date" IS DISTINCT FROM (c->>'paymentDate')::date OR NEW."Payment Method" IS DISTINCT FROM c->>'paymentMethod' OR NEW."Ref Received By Cash Account" IS DISTINCT FROM c->>'cashAccountId') THEN RAISE EXCEPTION 'Explicit command input mismatch';END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION public.pwa_apply_loan_create_v2(canonical text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE e jsonb:=canonical::jsonb;i jsonb:=e#>'{command,inputs}';a jsonb:=e->'actor';target text:=e#>>'{command,targetId}';
 l public."Loans"%ROWTYPE;component record;payment text;charge text;plan jsonb;result_value jsonb;actual public."Payments"%ROWTYPE;
BEGIN
 IF current_user<>'mw_app_dev_journal_owner' OR e#>>'{command,operation}'<>'loan.create' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Governed operation required';END IF;
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=i->>'borrowerId' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('loan:'||target,0));
 IF EXISTS(SELECT 1 FROM public."Loans" WHERE "Row ID"=target) THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Cash Accounts" ca JOIN public."Cash Holders" ch ON ch."Row ID"=ca."Ref Cash Holder" WHERE ca."Row ID"=i->>'disbursingAccountId' AND ca."Active" IS TRUE AND ch."Active" IS TRUE AND ch."Row ID"='ch:lisa') THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
 l:=jsonb_populate_record(NULL::public."Loans",jsonb_build_object('Row ID',target,'Ref Borrowers',i->'borrowerId','Loan Date',i->'loanDate','Principal Amount',i->'principal','Transfer Fee',i->'transferFee','Ref Disbursed From Cash Account',i->'disbursingAccountId','Loan Type',i->'type','Due Date',i->'dueDate','Daily Payment Amount',i->'dailyPayment','Fixed Interest',i->'fixedInterest','Current Daily Interest',i->'currentDailyInterest','Interest Payment Interval',i->'paymentInterval','Loan Arrangement',i->'arrangement','Auto Charge Enabled',i->'autoChargeEnabled','Created By',a->'loginEmail','Loan Status','ยังไม่ปิดยอด','Defaulted',false));
 SELECT * INTO component FROM public.first_day_components_v83(l);
 IF FOUND AND component.principal+component.interest>0 THEN
  IF component.principal<>trunc(component.principal) OR component.interest<>trunc(component.interest) THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
  charge:='fd6:'||target;payment:='fd6:'||charge;
  plan:=jsonb_build_object('borrowerId',l."Ref Borrowers",'amountReceived',(component.principal+component.interest)::bigint::text,
   'allocations',jsonb_build_array(jsonb_build_object('chargeId',charge,'principal',component.principal::bigint::text,'interest',component.interest::bigint::text,'expectedPrincipalRemaining',component.principal::bigint::text,'expectedInterestRemaining',component.interest::bigint::text,'chargeDate',l."Loan Date"::text)),
   'allocationMethod','First-day Auto','targetChargeId',charge,'targetLoanId',NULL,'cashAccountId',coalesce(l."Ref Disbursed From Cash Account",public.default_cash_account('ch:lisa')),'paymentDate',l."Loan Date"::text,'paymentMethod','Net-off at Disbursement');
 END IF;
 result_value:=jsonb_build_object('operation','loan.create','targetType','loan','targetId',target,'paymentId',payment,'plan',plan,'predecessorRequestId',NULL,'sourceCreatedBy',CASE WHEN payment IS NOT NULL THEN l."Created By" ELSE NULL END);
 -- This row and every triggered effect share the caller's savepoint and outer transaction.
 INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code,result_json)
 VALUES((e->>'requestId')::uuid,2,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',canonical,encode(sha256(convert_to(canonical,'UTF8')),'hex'),'applied',NULL,NULL,result_value);
 INSERT INTO public."Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Transfer Fee","Ref Disbursed From Cash Account","Loan Type","Due Date","Daily Payment Amount","Fixed Interest","Current Daily Interest","Interest Payment Interval","Loan Arrangement","Auto Charge Enabled","Created By","Loan Status","Defaulted")
 VALUES(l."Row ID",l."Ref Borrowers",l."Loan Date",l."Principal Amount",l."Transfer Fee",l."Ref Disbursed From Cash Account",l."Loan Type",l."Due Date",l."Daily Payment Amount",l."Fixed Interest",l."Current Daily Interest",l."Interest Payment Interval",l."Loan Arrangement",l."Auto Charge Enabled",l."Created By",l."Loan Status",false);
 IF payment IS NOT NULL THEN
  SELECT * INTO actual FROM public."Payments" WHERE "Row ID"=payment;
  IF NOT FOUND OR actual."Status" IS DISTINCT FROM 'Posted' OR actual."Amount Received"::numeric IS DISTINCT FROM component.principal+component.interest
   OR (SELECT count(*) FROM public."Payment Allocations" WHERE "Ref Payment"=payment)<>1
   OR NOT EXISTS(SELECT 1 FROM public."Payment Allocations" WHERE "Ref Payment"=payment AND "Ref Charge"=charge AND "Allocated Principal"::numeric=component.principal AND "Allocated Interest"::numeric=component.interest) THEN RAISE EXCEPTION 'First-day effect does not match immutable operation plan';END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"='fd6:fd6:'||target) THEN RAISE EXCEPTION 'Unexpected first-day receipt';END IF;
 END IF;
 RETURN result_value;
END $$;
REVOKE ALL ON FUNCTION public.pwa_apply_loan_create_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pwa_apply_loan_create_v2(text) TO mw_app_dev_journal_owner;
-- Native First-day receipt INSERT leaves account derivation to the existing later BEFORE trigger.
DO $$DECLARE definition text;old text;BEGIN
 SELECT pg_get_functiondef('public.guard_pwa_explicit_payment_v6()'::regprocedure) INTO definition;
 old:='NEW."Ref Received By Cash Account" IS DISTINCT FROM c->>''cashAccountId''';
 IF strpos(definition,old)=0 THEN RAISE EXCEPTION 'Unexpected provenance account guard';END IF;
 definition:=replace(definition,old,'(NEW."Ref Received By Cash Account" IS DISTINCT FROM c->>''cashAccountId'' AND NOT(c->>''allocationMethod''=''First-day Auto'' AND NEW."Ref Received By Cash Account" IS NULL))');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.post_payment_explicit_v6(text)'::regprocedure) INTO definition;
 old:='-- One materialized projection provides both validation and insertion inputs.';
 IF strpos(definition,old)=0 THEN RAISE EXCEPTION 'Unexpected explicit projection';END IF;
 definition:=replace(definition,old,'IF p."Allocation Method"=''First-day Auto'' AND p."Ref Received By Cash Account" IS DISTINCT FROM command->>''cashAccountId'' THEN RAISE EXCEPTION ''First-day resolved account differs from immutable plan'';END IF;'||chr(10)||old);
 EXECUTE definition;
END $$;

CREATE FUNCTION public.pwa_loan_version_v2(id text) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object('source',to_jsonb(l),
  'charges',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c."Row ID" COLLATE "C"),'[]'::jsonb) FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID"),
  'repayments',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r."Row ID" COLLATE "C"),'[]'::jsonb) FROM public."Repayments" r WHERE r."Ref Loans"=l."Row ID"))::text,'UTF8')),'hex')
 FROM public."Loans" l WHERE l."Row ID"=$1;
$$;
CREATE FUNCTION public.pwa_apply_loan_source_v2(canonical text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE e jsonb:=canonical::jsonb;i jsonb:=e#>'{command,inputs}';a jsonb:=e->'actor';target text:=e#>>'{command,targetId}';op text:=e#>>'{command,operation}';
 parent text;l public."Loans"%ROWTYPE;message text;
BEGIN
 IF current_user<>'mw_app_dev_journal_owner' OR op NOT IN('loan.update','loan.delete','loan.default','loan.undo-default','loan.generate-charge') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Governed operation required';END IF;
 SELECT "Ref Borrowers" INTO parent FROM public."Loans" WHERE "Row ID"=target;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=parent OR (op='loan.update' AND "Row ID"=i->>'borrowerId') ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
 IF op='loan.update' AND NOT EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID"=i->>'borrowerId') THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 SELECT * INTO l FROM public."Loans" WHERE "Row ID"=target FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 IF l."Ref Borrowers" IS DISTINCT FROM parent THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 PERFORM 1 FROM public."Charges" WHERE "Ref Loans"=target ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
 IF public.pwa_loan_version_v2(target) IS DISTINCT FROM e#>>'{command,expectedVersion}' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF op IN('loan.default','loan.generate-charge') AND (i->>'businessDate')::date IS DISTINCT FROM (statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;

 BEGIN
 CASE op
 WHEN 'loan.delete' THEN DELETE FROM public."Loans" WHERE "Row ID"=target;
 WHEN 'loan.default' THEN UPDATE public."Loans" SET "Defaulted"=true,"Close Date"=(i->>'businessDate')::date,"Closed By"=a->>'loginEmail' WHERE "Row ID"=target;
 WHEN 'loan.undo-default' THEN UPDATE public."Loans" SET "Defaulted"=false WHERE "Row ID"=target;
 WHEN 'loan.generate-charge' THEN UPDATE public."Loans" SET "Charge Generation Request"=(i->>'businessDate')||'|'||(e->>'requestId') WHERE "Row ID"=target;
 WHEN 'loan.update' THEN UPDATE public."Loans" SET "Ref Borrowers"=i->>'borrowerId',"Loan Date"=(i->>'loanDate')::date,"Principal Amount"=(i->>'principal')::numeric::money,"Transfer Fee"=(i->>'transferFee')::numeric::money,"Ref Disbursed From Cash Account"=i->>'disbursingAccountId',"Loan Type"=i->>'type',"Due Date"=(i->>'dueDate')::date,"Daily Payment Amount"=(i->>'dailyPayment')::numeric::money,"Fixed Interest"=(i->>'fixedInterest')::numeric::money,"Current Daily Interest"=(i->>'currentDailyInterest')::numeric::money,"Interest Payment Interval"=(i->>'paymentInterval')::integer,"Loan Arrangement"=i->>'arrangement',"Auto Charge Enabled"=(i->>'autoChargeEnabled')::boolean WHERE "Row ID"=target;
 END CASE;
 EXCEPTION
 WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B05';
 WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  IF message=ANY(ARRAY['Undo Default before deleting this loan','Loan has receipts; delete or reassign those receipts first','Loan has receipts for its original borrower; reassign them first','Related expense borrower must be corrected before moving this loan']) THEN RAISE EXCEPTION USING ERRCODE='P5B05';END IF;
  IF message=ANY(ARRAY[
   'Loan principal must cover its posted principal and recorded principal charges','Undo default before changing loan inputs','Original daily interest rate unavailable; review original loan terms before principal repayment','Original daily interest rate unavailable; review original loan terms before daily conversion','Automatic daily conversion requires a loan date and positive interest payment interval',
   'Default requires an open auto-enabled nondefaulted loan','Resolve processing or error payments before default','Default requires outstanding principal','Charge components require reconciliation before default','A paid charge today prevents Default Loan',
   'Default loss posting no longer matches; reconcile its components before undo','Default charge has no original component evidence; reconcile before undo','Default charge evidence is malformed; reconcile before undo','Default charge changed since write-off; reconcile before undo'
  ]) THEN RAISE EXCEPTION USING ERRCODE='P5B06';ELSE RAISE;END IF;
 END;
 RETURN jsonb_build_object('operation',op,'targetType','loan','targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy',NULL);
END $$;
REVOKE ALL ON FUNCTION public.pwa_apply_loan_source_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pwa_apply_loan_source_v2(text) TO mw_app_dev_journal_owner;

-- One read-only close calculation is shared by preview and governed preparation.
-- The hash excludes UI account/tender/notes but binds all financial source state.
CREATE FUNCTION public.loan_close_calculation_v83(p_loan text,p_day date,p_exclude_payment text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE l public."Loans"%ROWTYPE; outstanding numeric;scheduled numeric;missing numeric;interest numeric:=0;
 target text;today_count integer;latest date;mutation jsonb:='null'::jsonb;lines jsonb;total numeric;context jsonb;
BEGIN
 SELECT * INTO l FROM public."Loans" WHERE "Row ID"=p_loan;
 IF NOT FOUND THEN RAISE EXCEPTION 'Target loan must belong to the payment borrower';END IF;
 IF p_exclude_payment IS NOT NULL AND l."Ref Closing Payment"=p_exclude_payment AND l."Defaulted" IS NOT TRUE THEN l."Loan Status":='ยังไม่ปิดยอด';END IF;
 IF l."Loan Status" IS DISTINCT FROM 'ยังไม่ปิดยอด' OR l."Loan Type" IS DISTINCT FROM 'ดอกเบี้ยรายวัน' OR NOT coalesce(l."Auto Charge Enabled",false) THEN RAISE EXCEPTION 'Loan Close requires an open auto-enabled daily-interest loan';END IF;
 IF l."Loan Date" IS NULL OR l."Loan Date">p_day OR l."Current Daily Interest" IS NULL OR l."Current Daily Interest"::numeric<0 OR l."Principal Amount" IS NULL THEN RAISE EXCEPTION 'Loan Close requires valid loan date, principal and daily interest';END IF;
 IF EXISTS(SELECT 1 FROM public."Charges" c LEFT JOIN LATERAL(SELECT coalesce(sum(r."Principal Paid"::numeric),0) p,coalesce(sum(r."Interest Paid"::numeric),0) i FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID" AND r."Ref Payment" IS DISTINCT FROM p_exclude_payment) paid ON true WHERE c."Ref Loans"=p_loan AND(c."Principal Due" IS NULL OR c."Interest Due" IS NULL OR c."Principal Due"::numeric<paid.p OR c."Interest Due"::numeric<paid.i)) THEN RAISE EXCEPTION 'Loan charge components require reconciliation before closing';END IF;
 SELECT l."Principal Amount"::numeric-coalesce(sum("Principal Paid"::numeric),0) INTO outstanding FROM public."Repayments" WHERE "Ref Loans"=p_loan AND "Ref Payment" IS DISTINCT FROM p_exclude_payment;
 IF outstanding IS NULL OR outstanding<=0 THEN RAISE EXCEPTION 'Loan has no outstanding principal to close';END IF;
 SELECT coalesce(sum(c."Principal Due"::numeric-(SELECT coalesce(sum(r."Principal Paid"::numeric),0) FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID" AND r."Ref Payment" IS DISTINCT FROM p_exclude_payment)),0) INTO scheduled FROM public."Charges" c WHERE c."Ref Loans"=p_loan;
 missing:=outstanding-scheduled;
 IF missing<0 THEN RAISE EXCEPTION 'Principal already due exceeds outstanding loan principal';END IF;
 SELECT count(*),min("Row ID") INTO today_count,target FROM public."Charges" WHERE "Ref Loans"=p_loan AND "Charge Date"=p_day;
 IF today_count>1 THEN RAISE EXCEPTION 'Multiple charges today require reconciliation before closing';END IF;
 IF today_count=0 THEN
  SELECT max("Charge Date") INTO latest FROM public."Charges" WHERE "Ref Loans"=p_loan;
  interest:=l."Current Daily Interest"::numeric*greatest(0,p_day-coalesce(latest,l."Loan Date"));
  IF missing+interest>0 THEN
   target:='lc7:'||length(p_loan)||':'||p_loan||':'||p_day::text;
   mutation:=jsonb_build_object('kind','insert','chargeId',target,'principal',missing::text,'interest',interest::text);
  END IF;
 ELSIF missing>0 THEN mutation:=jsonb_build_object('kind','increase','chargeId',target,'principal',missing::text,'interest','0');END IF;
 IF target IS NULL THEN SELECT "Row ID" INTO target FROM public."Charges" WHERE "Ref Loans"=p_loan ORDER BY "Charge Date" DESC,"Row ID" COLLATE "C" DESC LIMIT 1;END IF;
 WITH paid AS(SELECT r."Ref Charges" id,sum(r."Principal Paid"::numeric) p,sum(r."Interest Paid"::numeric) i FROM public."Repayments" r WHERE r."Ref Loans"=p_loan AND r."Ref Payment" IS DISTINCT FROM p_exclude_payment GROUP BY r."Ref Charges"),
 projected AS(SELECT c."Row ID" id,c."Charge Date" AS charge_day,c."Principal Due"::numeric-coalesce(paid.p,0)+CASE WHEN mutation->>'kind'='increase' AND c."Row ID"=target THEN missing ELSE 0 END p,c."Interest Due"::numeric-coalesce(paid.i,0) i FROM public."Charges" c LEFT JOIN paid ON paid.id=c."Row ID" WHERE c."Ref Loans"=p_loan
 UNION ALL SELECT target,p_day,missing,interest WHERE mutation->>'kind'='insert')
 SELECT coalesce(jsonb_agg(jsonb_build_object('chargeId',id,'principal',trim_scale(p)::text,'interest',trim_scale(i)::text,'expectedPrincipalRemaining',trim_scale(p)::text,'expectedInterestRemaining',trim_scale(i)::text,'chargeDate',charge_day::text) ORDER BY id COLLATE "C") FILTER(WHERE p+i>0),'[]'::jsonb),sum(p+i) INTO lines,total FROM projected;
 IF total IS NULL OR total<=0 OR total<>trunc(total) THEN RAISE EXCEPTION 'Final receipt must be a positive whole-baht amount';END IF;
 context:=jsonb_build_object('sourceVersion',public.pwa_loan_version_v2(p_loan),'excludedPayment',p_exclude_payment,'businessDate',p_day::text,'borrowerId',l."Ref Borrowers",'amount',trim_scale(total)::text,'allocations',lines,'targetChargeId',target,'targetLoanId',p_loan,'mutation',mutation);
 IF p_exclude_payment IS NULL THEN context:=context-'excludedPayment';END IF;
 RETURN context||jsonb_build_object('planHash',encode(sha256(convert_to(context::text,'UTF8')),'hex'));
END $$;

CREATE FUNCTION public.loan_close_calculation_v83(p_loan text,p_day date) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$ SELECT public.loan_close_calculation_v83($1,$2,NULL); $$;

CREATE FUNCTION public.apply_loan_close_calculation_v83(p_loan text,p_day date,p_expected text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE parent text;calculation jsonb;m jsonb;
BEGIN
 SELECT "Ref Borrowers" INTO parent FROM public."Loans" WHERE "Row ID"=p_loan;
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=parent FOR UPDATE;
 PERFORM 1 FROM public."Loans" WHERE "Row ID"=p_loan FOR UPDATE;
 PERFORM 1 FROM public."Charges" WHERE "Ref Loans"=p_loan ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
 calculation:=public.loan_close_calculation_v83(p_loan,p_day);
 IF p_expected IS NOT NULL AND calculation->>'planHash' IS DISTINCT FROM p_expected THEN RAISE EXCEPTION USING ERRCODE='P5B09',MESSAGE='Close plan changed';END IF;
 m:=calculation->'mutation';
 IF m->>'kind'='insert' THEN INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes") VALUES(m->>'chargeId',p_loan,p_day,(m->>'principal')::numeric::money,(m->>'interest')::numeric::money,'Final charge prepared by Loan Close');
 ELSIF m->>'kind'='increase' THEN UPDATE public."Charges" SET "Principal Due"=("Principal Due"::numeric+(m->>'principal')::numeric)::money WHERE "Row ID"=m->>'chargeId';END IF;
 RETURN calculation;
END $$;
REVOKE ALL ON FUNCTION public.apply_loan_close_calculation_v83(text,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_loan_close_calculation_v83(text,date,text) TO mw_app_dev;
-- Preserve native entry/reentry checks; share calculation per approved Phase5 plan lines50/133.
DO $$DECLARE definition text;start_at integer;end_at integer;BEGIN
 SELECT pg_get_functiondef('public.prepare_loan_close()'::regprocedure) INTO definition;
 start_at:=strpos(definition,'  IF l."Loan Status" IS DISTINCT FROM');end_at:=strpos(definition,'  NEW."Ref Target Charge":=target;');
 IF start_at=0 OR end_at<=start_at THEN RAISE EXCEPTION 'Unexpected retained close preparation';END IF;
 definition:=replace(definition,'scheduled numeric; missing numeric; total numeric;','scheduled numeric; missing numeric; total numeric; calculation jsonb;');
 start_at:=strpos(definition,'  IF l."Loan Status" IS DISTINCT FROM');end_at:=strpos(definition,'  NEW."Ref Target Charge":=target;');
 definition:=left(definition,start_at-1)||'  calculation:=public.apply_loan_close_calculation_v83(l."Row ID",today,NULL);'||chr(10)||'  target:=calculation->>''targetChargeId''; total:=(calculation->>''amount'')::numeric;'||chr(10)||substr(definition,end_at);
 EXECUTE definition;
END $$;

CREATE FUNCTION public.pwa_apply_loan_close_v2(canonical text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE e jsonb:=canonical::jsonb;i jsonb:=e#>'{command,inputs}';a jsonb:=e->'actor';target text:=e#>>'{command,targetId}';
 parent text;day date:=(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date;calculation jsonb;plan jsonb;result_value jsonb;payment text:='pwa:'||(e->>'requestId');message text;actual public."Payments"%ROWTYPE;
BEGIN
 IF current_user<>'mw_app_dev_journal_owner' OR e#>>'{command,operation}'<>'loan.close' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Governed operation required';END IF;
 SELECT "Ref Borrowers" INTO parent FROM public."Loans" WHERE "Row ID"=target;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=parent FOR UPDATE;
 PERFORM 1 FROM public."Loans" WHERE "Row ID"=target FOR UPDATE;
 PERFORM 1 FROM public."Charges" WHERE "Ref Loans"=target ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
 IF public.pwa_loan_version_v2(target) IS DISTINCT FROM e#>>'{command,expectedVersion}' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF (i->>'paymentDate')::date IS DISTINCT FROM day THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Cash Accounts" ca JOIN public."Cash Holders" ch ON ch."Row ID"=ca."Ref Cash Holder" WHERE ca."Row ID"=i->>'cashAccountId' AND ca."Active" IS TRUE AND ch."Active" IS TRUE) THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
 BEGIN calculation:=public.loan_close_calculation_v83(target,day);
 EXCEPTION WHEN SQLSTATE 'P0001' THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  IF message=ANY(ARRAY['Loan Close requires an open auto-enabled daily-interest loan','Loan Close requires valid loan date, principal and daily interest','Loan charge components require reconciliation before closing','Loan has no outstanding principal to close','Principal already due exceeds outstanding loan principal','Multiple charges today require reconciliation before closing','Final receipt must be a positive whole-baht amount']) THEN RAISE EXCEPTION USING ERRCODE='P5B06';ELSE RAISE;END IF;
 END;
 IF calculation->>'planHash' IS DISTINCT FROM i->>'expectedPlanHash' OR calculation->>'amount' IS DISTINCT FROM i->>'expectedAmount' THEN RAISE EXCEPTION USING ERRCODE='P5B09';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(calculation->'allocations') line WHERE line->>'principal'!~'^(0|[1-9][0-9]*)$' OR line->>'interest'!~'^(0|[1-9][0-9]*)$' OR line->>'chargeDate' IS NULL) THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 PERFORM public.apply_loan_close_calculation_v83(target,day,i->>'expectedPlanHash');
 plan:=jsonb_build_object('borrowerId',parent,'amountReceived',calculation->>'amount','allocations',calculation->'allocations','allocationMethod','Loan Close','targetChargeId',calculation->>'targetChargeId','targetLoanId',target,'cashAccountId',i->>'cashAccountId','paymentDate',day::text,'paymentMethod',i->>'paymentMethod');
 result_value:=jsonb_build_object('operation','loan.close','targetType','loan','targetId',target,'paymentId',payment,'plan',plan,'predecessorRequestId',NULL,'sourceCreatedBy',a->>'loginEmail');
 INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code,result_json)
 VALUES((e->>'requestId')::uuid,2,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',canonical,encode(sha256(convert_to(canonical,'UTF8')),'hex'),'applied',NULL,NULL,result_value);
 INSERT INTO public."Payments"("Row ID","Ref Borrower","Payment Date","Amount Received","Payment Method","Allocation Method","Ref Target Charge","Ref Target Loan","Ref Received By Cash Account","Notes","Uploaded Receipt","Created By","Status")
 VALUES(payment,parent,day,(calculation->>'amount')::numeric::money,i->>'paymentMethod','Loan Close',calculation->>'targetChargeId',target,i->>'cashAccountId',i->>'notes',e#>>'{receipt,storageReference}',a->>'loginEmail','Processing');
 SELECT * INTO actual FROM public."Payments" WHERE "Row ID"=payment;
 IF NOT FOUND OR actual."Status" IS DISTINCT FROM 'Posted' OR actual."Amount Received"::numeric IS DISTINCT FROM (calculation->>'amount')::numeric THEN RAISE EXCEPTION 'Close receipt differs from immutable plan';END IF;
 RETURN result_value;
END $$;
REVOKE ALL ON FUNCTION public.pwa_apply_loan_close_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pwa_apply_loan_close_v2(text) TO mw_app_dev_journal_owner;

CREATE FUNCTION public.pwa_charge_version_v2(id text) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object('source',to_jsonb(c),'loan',to_jsonb(l),
 'repayments',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r."Row ID" COLLATE "C"),'[]'::jsonb) FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID"),
 'allocations',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a."Row ID" COLLATE "C"),'[]'::jsonb) FROM public."Payment Allocations" a WHERE a."Ref Charge"=c."Row ID"))::text,'UTF8')),'hex') FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans" WHERE c."Row ID"=$1;
$$;
CREATE FUNCTION public.pwa_apply_charge_v2(canonical text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE e jsonb:=canonical::jsonb;i jsonb:=e#>'{command,inputs}';a jsonb:=e->'actor';target text:=e#>>'{command,targetId}';op text:=e#>>'{command,operation}';old_loan text;new_loan text;l public."Loans"%ROWTYPE;payment text;plan jsonb;result_value jsonb;p numeric;interest numeric;message text;
BEGIN
 IF current_user<>'mw_app_dev_journal_owner' OR op NOT IN('charge.create','charge.update','charge.delete') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Governed operation required';END IF;
 SELECT "Ref Loans" INTO old_loan FROM public."Charges" WHERE "Row ID"=target;new_loan:=CASE WHEN op='charge.delete' THEN old_loan ELSE i->>'loanId' END;
 IF op<>'charge.create' AND old_loan IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID" IN(SELECT "Ref Borrowers" FROM public."Loans" WHERE "Row ID" IN(old_loan,new_loan)) ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
 PERFORM 1 FROM public."Loans" WHERE "Row ID" IN(old_loan,new_loan) ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
 SELECT * INTO l FROM public."Loans" WHERE "Row ID"=new_loan;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('charge:'||target,0));
 PERFORM 1 FROM public."Charges" WHERE "Row ID"=target FOR UPDATE;
 IF op='charge.create' AND FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF op<>'charge.create' AND public.pwa_charge_version_v2(target) IS DISTINCT FROM e#>>'{command,expectedVersion}' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF op<>'charge.delete' THEN
  p:=(i->>'principalDue')::numeric;interest:=(i->>'interestDue')::numeric;
  IF p<0 OR (p=0 AND interest=0 AND NOT(op='charge.update' AND EXISTS(SELECT 1 FROM public."Payment Allocations" pa JOIN public."Payments" pay ON pay."Row ID"=pa."Ref Payment" WHERE pa."Ref Charge"=target AND pay."Status"='Posted') AND NOT EXISTS(SELECT 1 FROM public."Payment Allocations" WHERE "Ref Charge"=target AND "Allocated Amount"::numeric<>0) AND NOT EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Charges"=target AND "Principal Paid"::numeric+"Interest Paid"::numeric<>0))) THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 END IF;
 IF op='charge.create' AND coalesce(l."Auto Charge Enabled",false) AND l."Loan Type" IN('ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน') AND (i->>'chargeDate')::date=l."Loan Date" AND p+interest>0 AND NOT EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Charges"=target) AND NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Ref Target Charge"=target AND "Allocation Method"='First-day Auto') THEN
  IF p<>trunc(p) OR interest<>trunc(interest) OR interest<0 THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
  payment:='fd6:'||target;
  plan:=jsonb_build_object('borrowerId',l."Ref Borrowers",'amountReceived',trim_scale(p+interest)::text,'allocations',jsonb_build_array(jsonb_build_object('chargeId',target,'principal',trim_scale(p)::text,'interest',trim_scale(interest)::text,'expectedPrincipalRemaining',trim_scale(p)::text,'expectedInterestRemaining',trim_scale(interest)::text,'chargeDate',i->>'chargeDate')),'allocationMethod','First-day Auto','targetChargeId',target,'targetLoanId',NULL,'cashAccountId',coalesce(l."Ref Disbursed From Cash Account",public.default_cash_account('ch:lisa')),'paymentDate',l."Loan Date"::text,'paymentMethod','Net-off at Disbursement');
 END IF;
 result_value:=jsonb_build_object('operation',op,'targetType','charge','targetId',target,'paymentId',payment,'plan',plan,'predecessorRequestId',NULL,'sourceCreatedBy',CASE WHEN payment IS NOT NULL THEN l."Created By" ELSE NULL END);
 IF payment IS NOT NULL THEN INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code,result_json) VALUES((e->>'requestId')::uuid,2,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',canonical,encode(sha256(convert_to(canonical,'UTF8')),'hex'),'applied',NULL,NULL,result_value);END IF;
 BEGIN
 CASE op WHEN 'charge.create' THEN INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes") VALUES(target,new_loan,(i->>'chargeDate')::date,p::money,interest::money,i->>'notes');
 WHEN 'charge.update' THEN UPDATE public."Charges" SET "Ref Loans"=new_loan,"Charge Date"=(i->>'chargeDate')::date,"Principal Due"=p::money,"Interest Due"=interest::money,"Notes"=i->>'notes' WHERE "Row ID"=target;
 WHEN 'charge.delete' THEN DELETE FROM public."Charges" WHERE "Row ID"=target;END CASE;
 EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B05';
 WHEN SQLSTATE 'P0001' THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
 IF message IN('Charge has receipts; reassign or delete those receipts first','Charge has receipts on its original loan; reassign them first') THEN RAISE EXCEPTION USING ERRCODE='P5B05';
 ELSIF message='Charge amount cannot be less than its posted component payments' THEN RAISE EXCEPTION USING ERRCODE='P5B06';ELSE RAISE;END IF;
 END;
 IF payment IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"=payment AND "Status"='Posted' AND "Amount Received"::numeric=p+interest AND "Created By" IS NOT DISTINCT FROM l."Created By") THEN RAISE EXCEPTION 'First-day charge receipt differs from immutable plan';END IF;
 RETURN result_value;
END $$;
REVOKE ALL ON FUNCTION public.pwa_apply_charge_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pwa_apply_charge_v2(text) TO mw_app_dev_journal_owner;

-- Correction CAS includes the complete source and governed borrower dependencies.
CREATE FUNCTION public.pwa_payment_version_v2(id text) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object(
  'source',to_jsonb(p),
  'loans',coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l."Row ID" COLLATE "C") FROM public."Loans" l WHERE l."Ref Borrowers"=p."Ref Borrower"),'[]'),
  'charges',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c."Row ID" COLLATE "C") FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans" WHERE l."Ref Borrowers"=p."Ref Borrower"),'[]'),
  'repayments',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r."Row ID" COLLATE "C") FROM public."Repayments" r JOIN public."Loans" l ON l."Row ID"=r."Ref Loans" WHERE l."Ref Borrowers"=p."Ref Borrower"),'[]'),
  'allocations',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a."Row ID" COLLATE "C") FROM public."Payment Allocations" a WHERE a."Ref Payment"=p."Row ID"),'[]'),
  'cash',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c."Row ID" COLLATE "C") FROM public."Cash Ledger" c WHERE c."Ref Payment"=p."Row ID"),'[]'),
  'revisionHead',(SELECT j.request_id FROM public.pwa_payment_commands j WHERE j.contract_version=2 AND j.outcome='applied' AND j.canonical_json::jsonb#>>'{command,operation}'='payment.correct' AND j.canonical_json::jsonb#>>'{command,targetId}'=p."Row ID" AND NOT EXISTS(SELECT 1 FROM public.pwa_payment_commands successor WHERE successor.contract_version=2 AND successor.outcome='applied' AND successor.canonical_json::jsonb#>>'{command,operation}'='payment.correct' AND successor.canonical_json::jsonb#>>'{command,targetId}'=p."Row ID" AND successor.canonical_json::jsonb#>>'{command,predecessorRequestId}'=j.request_id::text))
 )::text,'UTF8')),'hex') FROM public."Payments" p WHERE p."Row ID"=$1;
$$;
REVOKE ALL ON FUNCTION public.pwa_payment_version_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pwa_payment_version_v2(text) TO mw_app_dev;

-- Internal cleanup context is not payment provenance; only a protected staged revision permits native cleanup.
CREATE FUNCTION public.pwa_native_inverse_permitted_v2(payment text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT current_user='mw_app_dev_journal_owner'
 AND nullif(current_setting('pwa.native_inverse_request',true),'') IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.pwa_payment_commands j WHERE j.request_id::text=current_setting('pwa.native_inverse_request',true)
  AND j.contract_version=2 AND j.outcome='applied' AND j.canonical_json::jsonb#>>'{command,operation}'='payment.correct'
  AND j.canonical_json::jsonb#>>'{command,targetId}'=$1
  AND j.actor_partner_id=(SELECT "Row ID" FROM public."Partners" WHERE lower(btrim("Login Email"))=j.actor_login_email)
  AND NOT EXISTS(SELECT 1 FROM public.pwa_payment_commands successor WHERE successor.contract_version=2 AND successor.outcome='applied' AND successor.canonical_json::jsonb#>>'{command,operation}'='payment.correct' AND successor.canonical_json::jsonb#>>'{command,targetId}'=$1 AND successor.canonical_json::jsonb#>>'{command,predecessorRequestId}'=j.request_id::text));
$$;
REVOKE ALL ON FUNCTION public.pwa_native_inverse_permitted_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pwa_native_inverse_permitted_v2(text) TO mw_app_dev;

CREATE FUNCTION public.payment_crud_prepare_core_v83(p_old public."Payments",p_new public."Payments",operation text) RETURNS public."Payments"
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
#variable_conflict use_column
DECLARE b text; l public."Loans"%ROWTYPE; context_before text; owned jsonb; parents_before text:=current_setting('payment_crud.parents',true); cleanup_before text:=current_setting('payment_crud.id',true); actual public."Payments"%ROWTYPE;
BEGIN
 IF pg_trigger_depth()=0 AND NOT public.pwa_native_inverse_permitted_v2(p_old."Row ID") THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Protected correction context required';END IF;
 SELECT * INTO actual FROM public."Payments" WHERE "Row ID"=p_old."Row ID" FOR UPDATE;
 IF NOT FOUND OR to_jsonb(actual) IS DISTINCT FROM to_jsonb(p_old) THEN RAISE EXCEPTION USING ERRCODE='P5B01',MESSAGE='Source changed';END IF;
 IF NOT pg_try_advisory_xact_lock(9162026,2) THEN RAISE EXCEPTION 'Cash pool is busy; retry'; END IF;
 FOR b IN SELECT DISTINCT k COLLATE "C" FROM unnest(ARRAY[p_old."Ref Borrower",CASE WHEN operation='UPDATE' THEN p_new."Ref Borrower" END]) k
  WHERE k IS NOT NULL ORDER BY k COLLATE "C" LOOP
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=b FOR UPDATE NOWAIT;
 END LOOP;
 -- Loan Close prepared charges remain separately editable booked obligations.
 PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers" IN (p_old."Ref Borrower",CASE WHEN operation='UPDATE' THEN p_new."Ref Borrower" END)
  ORDER BY "Row ID" COLLATE "C" FOR UPDATE NOWAIT;
 PERFORM 1 FROM public."Charges" WHERE "Ref Loans" IN (SELECT "Row ID" FROM public."Loans"
  WHERE "Ref Borrowers" IN (p_old."Ref Borrower",CASE WHEN operation='UPDATE' THEN p_new."Ref Borrower" END))
  ORDER BY "Row ID" COLLATE "C" FOR UPDATE NOWAIT;
 PERFORM 1 FROM public."Payment Allocations" WHERE "Ref Payment"=p_old."Row ID" ORDER BY "Row ID" COLLATE "C" FOR UPDATE NOWAIT;
 PERFORM 1 FROM public."Repayments" WHERE "Ref Payment"=p_old."Row ID" ORDER BY "Row ID" COLLATE "C" FOR UPDATE NOWAIT;
 PERFORM 1 FROM public."Cash Ledger" WHERE "Ref Payment"=p_old."Row ID" ORDER BY "Row ID" COLLATE "C" FOR UPDATE NOWAIT;
 IF EXISTS(SELECT 1 FROM public."Repayments" r JOIN public."Loans" l ON l."Row ID"=r."Ref Loans"
  WHERE r."Ref Payment"=p_old."Row ID" AND l."Defaulted" IS TRUE) THEN
  RAISE EXCEPTION 'Payment has a later loan default/write-off; reconcile that default first'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO owned FROM public."Loans" x WHERE x."Row ID" IN
  (SELECT "Ref Loans" FROM public."Repayments" WHERE "Ref Payment"=p_old."Row ID");
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(owned) j WHERE j->>'Loan Status'='ปิดยอดแล้ว' AND j->>'Ref Closing Payment' IS NULL) THEN
  RAISE EXCEPTION 'Manually closed loan must be reopened explicitly before its receipt changes'; END IF;
 PERFORM set_config('payment_crud.parents',
  (coalesce(nullif(current_setting('payment_crud.parents',true),'')::jsonb,'{}')||jsonb_build_object(p_old."Row ID",owned))::text,true);
 context_before:=current_setting('payment_crud.id',true);
 PERFORM set_config('payment_crud.id',p_old."Row ID",true);
 -- A payment-controlled closure is reversible. Manually closed/defaulted loans
 -- are not inferred from balances and are never silently reopened.
 FOR l IN SELECT x.* FROM public."Loans" x WHERE x."Ref Closing Payment" IS NOT NULL
  AND (x."Ref Closing Payment"=p_old."Row ID" OR x."Row ID" IN
   (SELECT "Ref Loans" FROM public."Repayments" WHERE "Ref Payment"=p_old."Row ID"))
  ORDER BY x."Row ID" COLLATE "C" LOOP
  IF l."Defaulted" IS TRUE THEN RAISE EXCEPTION 'Defaulted loan requires explicit default reconciliation'; END IF;
  DELETE FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"='Business Expense'
   AND "Ref Business Expense" IN (SELECT "Row ID" FROM public."Business Expenses"
    WHERE "Ref Related Loan"=l."Row ID" AND "Source Type"='Referral Rebate');
  DELETE FROM public."Business Expenses" WHERE "Ref Related Loan"=l."Row ID" AND "Source Type"='Referral Rebate';
  -- Only the receipt which owns the closure is reopened before reposting.
  -- A later receipt's closure is checked against final balances in finish().
  IF l."Ref Closing Payment"=p_old."Row ID" THEN
   UPDATE public."Loans" SET "Loan Status"='ยังไม่ปิดยอด',"Ref Closing Payment"=NULL,"Close Date"=NULL,"Closed By"=NULL
    WHERE "Row ID"=l."Row ID";
  END IF;
 END LOOP;
 DELETE FROM public."Repayments" WHERE "Ref Payment"=p_old."Row ID";
 DELETE FROM public."Payment Allocations" WHERE "Ref Payment"=p_old."Row ID";
 IF operation='DELETE' THEN
  DELETE FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"='Payment' AND "Ref Payment"=p_old."Row ID";
 ELSE
  p_new."Status":='Processing'; p_new."Processed At":=NULL;
 END IF;
 PERFORM set_config('payment_crud.id',coalesce(context_before,''),true);
 IF operation='DELETE' THEN RETURN p_old; END IF;
 RETURN p_new;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('payment_crud.id',coalesce(cleanup_before,''),true);
 PERFORM set_config('payment_crud.parents',coalesce(parents_before,''),true);RAISE;
END $$;

CREATE FUNCTION public.payment_crud_finish_core_v83(p_old public."Payments",p_new public."Payments",operation text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
#variable_conflict use_column
DECLARE d date; first_day date; last_day date; previous jsonb; l public."Loans"%ROWTYPE; prior_context text; cleanup_before text:=current_setting('payment_crud.id',true); parents_before text:=current_setting('payment_crud.parents',true);
BEGIN
 IF pg_trigger_depth()=0 AND NOT public.pwa_native_inverse_permitted_v2(p_old."Row ID") THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Protected correction context required';END IF;
 IF operation='UPDATE' THEN
  IF EXISTS(SELECT 1 FROM public."Repayments" r JOIN public."Loans" l ON l."Row ID"=r."Ref Loans"
   WHERE r."Ref Payment"=p_new."Row ID" AND l."Defaulted" IS TRUE) THEN
   RAISE EXCEPTION 'Corrected payment has a default dependency; undo default first'; END IF;
  d:=least(p_old."Payment Date",p_new."Payment Date");
 ELSE d:=p_old."Payment Date";
 END IF;
 prior_context:=current_setting('payment_crud.id',true);
 PERFORM set_config('payment_crud.id',p_old."Row ID",true);
 FOR previous IN SELECT value FROM jsonb_array_elements(coalesce(nullif(current_setting('payment_crud.parents',true),'')::jsonb->p_old."Row ID",'[]')) LOOP
  SELECT * INTO l FROM public."Loans" WHERE "Row ID"=previous->>'Row ID';
  IF l."Ref Closing Payment" IS NOT NULL AND (l."Principal Amount"::numeric>
    (SELECT coalesce(sum("Principal Paid"::numeric),0) FROM public."Repayments" WHERE "Ref Loans"=l."Row ID")
    OR EXISTS(SELECT 1 FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND c."Principal Due"::numeric+c."Interest Due"::numeric>
     (SELECT coalesce(sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric),0) FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID"))) THEN
   UPDATE public."Loans" SET "Loan Status"='ยังไม่ปิดยอด',"Ref Closing Payment"=NULL,"Close Date"=NULL,"Closed By"=NULL
    WHERE "Row ID"=l."Row ID";
  ELSIF l."Ref Closing Payment" IS NOT NULL THEN
   -- If the original closing receipt still closes this loan, retain its actual
   -- closure date/actor; rebuilding derived rows is not a new closure event.
   IF l."Ref Closing Payment"=previous->>'Ref Closing Payment' AND l."Ref Closing Payment"<>p_old."Row ID" THEN
    UPDATE public."Loans" SET "Close Date"=(previous->>'Close Date')::date,"Closed By"=previous->>'Closed By'
     WHERE "Row ID"=l."Row ID";
   END IF;
   PERFORM public.create_referral_rebate(l."Row ID");
  END IF;
 END LOOP;
 PERFORM set_config('payment_crud.parents',(coalesce(nullif(current_setting('payment_crud.parents',true),'')::jsonb,'{}')-p_old."Row ID")::text,true);
 PERFORM set_config('payment_crud.id',coalesce(prior_context,''),true);
 PERFORM public.request_business_history(d);
 RETURN;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('payment_crud.id',coalesce(cleanup_before,''),true);
 PERFORM set_config('payment_crud.parents',coalesce(parents_before,''),true);RAISE;
END $$;

CREATE OR REPLACE FUNCTION public.payment_crud_prepare() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW."Row ID" IS DISTINCT FROM OLD."Row ID" THEN RAISE EXCEPTION 'Payment key cannot be changed';END IF;
 IF TG_OP='UPDATE' AND public.payment_inputs(NEW) IS NOT DISTINCT FROM public.payment_inputs(OLD) THEN RETURN NEW;END IF;
 RETURN public.payment_crud_prepare_core_v83(OLD,CASE WHEN TG_OP='UPDATE' THEN NEW ELSE OLD END,TG_OP);
END $$;
CREATE OR REPLACE FUNCTION public.payment_crud_finish() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' AND public.payment_inputs(NEW) IS NOT DISTINCT FROM public.payment_inputs(OLD) AND NEW."Ref Received By Cash Account" IS NOT DISTINCT FROM OLD."Ref Received By Cash Account" THEN RETURN NULL;END IF;
 PERFORM public.payment_crud_finish_core_v83(OLD,CASE WHEN TG_OP='UPDATE' THEN NEW ELSE OLD END,TG_OP);RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.payment_crud_prepare_core_v83(public."Payments",public."Payments",text),public.payment_crud_finish_core_v83(public."Payments",public."Payments",text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payment_crud_prepare_core_v83(public."Payments",public."Payments",text),public.payment_crud_finish_core_v83(public."Payments",public."Payments",text) TO mw_app_dev;
DO $$DECLARE definition text;BEGIN
 definition:=pg_get_functiondef('public.lump_sum_child_guard()'::regprocedure);
 definition:=replace(definition,'pg_trigger_depth()>=2 AND OLD."Ref Payment"=nullif(current_setting(''payment_crud.id'',true),'''')','(pg_trigger_depth()>=2 OR public.pwa_native_inverse_permitted_v2(OLD."Ref Payment")) AND OLD."Ref Payment"=nullif(current_setting(''payment_crud.id'',true),'''')');
 EXECUTE definition;
END $$;

CREATE FUNCTION public.pwa_payment_head_v2(id text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE head uuid;candidate uuid;total integer;
BEGIN
 SELECT request_id INTO head FROM public.pwa_payment_commands WHERE contract_version=1 AND outcome='posted' AND payment_id=$1;
 IF head IS NULL THEN SELECT request_id INTO head FROM public.pwa_payment_commands WHERE contract_version=2 AND outcome='applied' AND result_json->>'paymentId'=$1 AND canonical_json::jsonb#>>'{command,operation}' IN('loan.create','loan.close','charge.create');END IF;
 LOOP
 SELECT count(*) INTO total FROM public.pwa_payment_commands WHERE contract_version=2 AND outcome='applied' AND canonical_json::jsonb#>>'{command,operation}'='payment.correct' AND canonical_json::jsonb#>>'{command,targetId}'=$1 AND canonical_json::jsonb#>>'{command,predecessorRequestId}' IS NOT DISTINCT FROM head::text;
 IF total=0 THEN EXIT;END IF;IF total<>1 THEN RAISE EXCEPTION 'Invalid correction lineage';END IF;
 SELECT request_id INTO candidate FROM public.pwa_payment_commands WHERE contract_version=2 AND outcome='applied' AND canonical_json::jsonb#>>'{command,operation}'='payment.correct' AND canonical_json::jsonb#>>'{command,targetId}'=$1 AND canonical_json::jsonb#>>'{command,predecessorRequestId}' IS NOT DISTINCT FROM head::text;
 IF candidate=head THEN RAISE EXCEPTION 'Invalid correction lineage';END IF;head:=candidate;
 END LOOP;RETURN head;
END $$;
REVOKE ALL ON FUNCTION public.pwa_payment_head_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pwa_payment_head_v2(text) TO mw_app_dev;

CREATE FUNCTION public.pwa_payment_correction_text_v2(i jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE fields jsonb;keys text[];k text;value text;field_text text:='{';array_text text:='[';line_text text;line jsonb;last_id text;total numeric:=0;amount numeric;counted integer:=0;
BEGIN
 IF jsonb_typeof(i) IS DISTINCT FROM 'object' OR ((SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['fields','kind','receiptMode'] AND NOT(i->>'kind'='pwa-plan' AND (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key)=ARRAY['closePreparationHash','fields','kind','receiptMode'])) OR i->>'kind' NOT IN('pwa-plan','legacy-source') OR i->>'receiptMode' NOT IN('preserve','replace','remove') THEN RAISE EXCEPTION 'Invalid correction';END IF;
 IF i ? 'closePreparationHash' AND (jsonb_typeof(i->'closePreparationHash') NOT IN('null','string') OR (i->'closePreparationHash'<>'null'::jsonb AND i->>'closePreparationHash'!~'^[a-f0-9]{64}$')) THEN RAISE EXCEPTION 'Invalid close preparation hash';END IF;
 fields:=i->'fields';keys:=ARRAY['borrowerId','amountReceived','paymentDate','paymentMethod','cashAccountId','notes','allocationMethod','targetChargeId','targetLoanId']||ARRAY[CASE WHEN i->>'kind'='pwa-plan' THEN 'allocations' ELSE 'selectedChargeIds' END];
 IF jsonb_typeof(fields) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(fields) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM unnest(keys) key) THEN RAISE EXCEPTION 'Invalid correction fields';END IF;
 FOREACH k IN ARRAY keys[1:9] LOOP
 value:=fields->>k;
 IF k IN('notes','targetChargeId','targetLoanId') THEN IF jsonb_typeof(fields->k) NOT IN('string','null') THEN RAISE EXCEPTION 'Invalid nullable field';END IF;
 ELSE IF jsonb_typeof(fields->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid field';END IF;END IF;
 IF octet_length(value)>65536 THEN RAISE EXCEPTION 'Field too long';END IF;
 IF k IN('borrowerId','cashAccountId','targetChargeId','targetLoanId') AND value IS NOT NULL AND (octet_length(value) NOT BETWEEN 1 AND 256 OR value~'[[:cntrl:]]' OR value<>btrim(value)) THEN RAISE EXCEPTION 'Invalid reference';END IF;
 field_text:=field_text||CASE WHEN field_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||coalesce(to_json(value)::text,'null');
 END LOOP;
 IF fields->>'amountReceived'!~'^[1-9][0-9]*$' OR (fields->>'amountReceived')::numeric>92233720368547758 OR fields->>'paymentDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((fields->>'paymentDate')::date)::text<>fields->>'paymentDate' OR fields->>'paymentMethod' NOT IN('Bank Transfer','Cash','Net-off at Disbursement') OR fields->>'allocationMethod' NOT IN('Single Full','Single Partial','Receive All','Lump Sum','First-day Auto','Loan Close','Selected Charges') THEN RAISE EXCEPTION 'Invalid financial input';END IF;
 amount:=(fields->>'amountReceived')::numeric;
 IF i->>'kind'='pwa-plan' THEN
 IF fields->>'allocationMethod' NOT IN('Selected Charges','First-day Auto','Loan Close') OR jsonb_typeof(fields->'allocations') IS DISTINCT FROM 'array' OR jsonb_array_length(fields->'allocations') NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Invalid plan';END IF;
 FOR line IN SELECT element.value FROM jsonb_array_elements(fields->'allocations') AS element LOOP
 IF jsonb_typeof(line) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(line) key) IS DISTINCT FROM ARRAY['chargeDate','chargeId','expectedInterestRemaining','expectedPrincipalRemaining','interest','principal'] THEN RAISE EXCEPTION 'Invalid plan line';END IF;
 value:=line->>'chargeId';IF jsonb_typeof(line->'chargeId') IS DISTINCT FROM 'string' OR octet_length(value) NOT BETWEEN 1 AND 256 OR value~'[[:space:],[:cntrl:]]' OR (last_id IS NOT NULL AND value COLLATE "C"<=last_id COLLATE "C") THEN RAISE EXCEPTION 'Invalid plan ordering';END IF;last_id:=value;
 line_text:='{';FOREACH k IN ARRAY ARRAY['chargeId','principal','interest','expectedPrincipalRemaining','expectedInterestRemaining','chargeDate'] LOOP
 IF jsonb_typeof(line->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid plan type';END IF;
 IF k IN('principal','interest','expectedPrincipalRemaining','expectedInterestRemaining') AND (line->>k!~'^(0|[1-9][0-9]*)$' OR (line->>k)::numeric>92233720368547758) THEN RAISE EXCEPTION 'Invalid plan amount';END IF;
 line_text:=line_text||CASE WHEN line_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||to_json(line->>k)::text;END LOOP;
 IF line->>'chargeDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((line->>'chargeDate')::date)::text<>line->>'chargeDate' OR (line->>'principal')::numeric+(line->>'interest')::numeric<=0 OR (line->>'principal')::numeric>(line->>'expectedPrincipalRemaining')::numeric OR (line->>'interest')::numeric>(line->>'expectedInterestRemaining')::numeric THEN RAISE EXCEPTION 'Invalid plan line';END IF;
 total:=total+(line->>'principal')::numeric+(line->>'interest')::numeric;array_text:=array_text||CASE WHEN array_text='[' THEN '' ELSE ',' END||line_text||'}';END LOOP;
 IF total<>amount THEN RAISE EXCEPTION 'Plan sum mismatch';END IF;
 field_text:=field_text||',"allocations":'||array_text||']}';
 ELSE
 IF fields->'selectedChargeIds'='null'::jsonb THEN array_text:='null';ELSE
 IF jsonb_typeof(fields->'selectedChargeIds') IS DISTINCT FROM 'array' OR jsonb_array_length(fields->'selectedChargeIds') NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Invalid selection';END IF;
 FOR line IN SELECT element.value FROM jsonb_array_elements(fields->'selectedChargeIds') AS element LOOP
 value:=line#>>'{}';IF jsonb_typeof(line) IS DISTINCT FROM 'string' OR octet_length(value) NOT BETWEEN 1 AND 256 OR value~'[[:space:],[:cntrl:]]' OR (last_id IS NOT NULL AND value COLLATE "C"<=last_id COLLATE "C") THEN RAISE EXCEPTION 'Invalid selection';END IF;last_id:=value;array_text:=array_text||CASE WHEN array_text='[' THEN '' ELSE ',' END||to_json(value)::text;END LOOP;array_text:=array_text||']';END IF;
 field_text:=field_text||',"selectedChargeIds":'||array_text||'}';END IF;
 RETURN '{"kind":'||to_json(i->>'kind')::text||',"fields":'||field_text||',"receiptMode":'||to_json(i->>'receiptMode')::text||CASE WHEN i ? 'closePreparationHash' THEN ',"closePreparationHash":'||coalesce(to_json(i->>'closePreparationHash')::text,'null') ELSE '' END||'}';
END $$;
REVOKE ALL ON FUNCTION public.pwa_payment_correction_text_v2(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pwa_payment_correction_text_v2(jsonb) TO mw_app_dev;

CREATE FUNCTION public.pwa_plan_effects_v83(lines jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$ SELECT coalesce(jsonb_agg(value-ARRAY['expectedPrincipalRemaining','expectedInterestRemaining'] ORDER BY (value->>'chargeId') COLLATE "C"),'[]'::jsonb) FROM jsonb_array_elements(lines); $$;

CREATE FUNCTION public.pwa_apply_payment_v2(canonical text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE e jsonb:=canonical::jsonb;c jsonb:=e->'command';i jsonb:=c->'inputs';f jsonb:=i->'fields';a jsonb:=e->'actor';target text:=c->>'targetId';op text:=c->>'operation';old public."Payments"%ROWTYPE;desired public."Payments"%ROWTYPE;actual public."Payments"%ROWTYPE;provenance jsonb;head uuid;plan jsonb;result_value jsonb;ids text;explicit_inverse boolean:=false;explicit_finish boolean:=false;message text;borrower text;close_calculation jsonb;enter_close boolean:=false;repost boolean:=false;destination public."Loans"%ROWTYPE;
BEGIN
 IF current_user<>'mw_app_dev_journal_owner' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Governed operation required';END IF;
 IF NOT pg_try_advisory_xact_lock(9162026,2) THEN RAISE EXCEPTION 'Cash pool is busy; retry';END IF;
 SELECT * INTO old FROM public."Payments" WHERE "Row ID"=target;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 FOR borrower IN SELECT DISTINCT value COLLATE "C" FROM unnest(ARRAY[old."Ref Borrower",f->>'borrowerId']) value WHERE value IS NOT NULL ORDER BY value COLLATE "C" LOOP PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=borrower FOR UPDATE;END LOOP;
 PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers" IN(old."Ref Borrower",f->>'borrowerId') ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
 PERFORM 1 FROM public."Charges" WHERE "Ref Loans" IN(SELECT "Row ID" FROM public."Loans" WHERE "Ref Borrowers" IN(old."Ref Borrower",f->>'borrowerId')) ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
 SELECT * INTO old FROM public."Payments" WHERE "Row ID"=target FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 IF public.pwa_payment_version_v2(target) IS DISTINCT FROM c->>'expectedVersion' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 head:=public.pwa_payment_head_v2(target);IF head::text IS DISTINCT FROM c->>'predecessorRequestId' THEN RAISE EXCEPTION USING ERRCODE='P5B09';END IF;
 provenance:=public.pwa_effective_payment_plan_v2(target);
 IF op='payment.correct' THEN
 IF (provenance IS NOT NULL) IS DISTINCT FROM (i->>'kind'='pwa-plan') THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 IF (f->>'paymentDate')::date>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID"=f->>'borrowerId') THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Cash Accounts" ca JOIN public."Cash Holders" h ON h."Row ID"=ca."Ref Cash Holder" WHERE ca."Row ID"=f->>'cashAccountId' AND ca."Active" IS TRUE AND h."Active" IS TRUE) THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
 IF provenance IS NOT NULL THEN
 enter_close:=f->>'allocationMethod'='Loan Close' AND (old."Allocation Method" IS DISTINCT FROM 'Loan Close' OR old."Ref Target Loan" IS DISTINCT FROM f->>'targetLoanId');
 IF enter_close THEN
  IF (f->>'paymentDate')::date<>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date OR i->>'closePreparationHash' IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
  SELECT * INTO destination FROM public."Loans" WHERE "Row ID"=f->>'targetLoanId';
  IF NOT FOUND OR destination."Ref Borrowers" IS DISTINCT FROM f->>'borrowerId' OR destination."Defaulted" IS TRUE OR (destination."Loan Status"<>'ยังไม่ปิดยอด' AND destination."Ref Closing Payment" IS DISTINCT FROM target) THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
  BEGIN close_calculation:=public.loan_close_calculation_v83(f->>'targetLoanId',(f->>'paymentDate')::date,target);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;IF message IN('Loan Close requires an open auto-enabled daily-interest loan','Loan Close requires valid loan date, principal and daily interest','Loan charge components require reconciliation before closing','Loan has no outstanding principal to close','Principal already due exceeds outstanding loan principal','Multiple charges today require reconciliation before closing','Final receipt must be a positive whole-baht amount') THEN RAISE EXCEPTION USING ERRCODE='P5B06';ELSE RAISE;END IF;END;
  IF close_calculation->>'planHash' IS DISTINCT FROM i->>'closePreparationHash' OR close_calculation->'allocations' IS DISTINCT FROM f->'allocations' OR close_calculation->>'amount' IS DISTINCT FROM f->>'amountReceived' OR close_calculation->>'targetChargeId' IS DISTINCT FROM f->>'targetChargeId' THEN RAISE EXCEPTION USING ERRCODE='P5B09';END IF;
 ELSE
  IF i->>'closePreparationHash' IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P5B09';END IF;
 IF EXISTS(WITH lines AS(SELECT value line FROM jsonb_array_elements(f->'allocations')),paid AS(SELECT "Ref Charges" id,sum("Principal Paid"::numeric) p,sum("Interest Paid"::numeric) i FROM public."Repayments" WHERE "Ref Payment" IS DISTINCT FROM target GROUP BY "Ref Charges") SELECT 1 FROM lines LEFT JOIN public."Charges" ch ON ch."Row ID"=line->>'chargeId' LEFT JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans" LEFT JOIN paid ON paid.id=ch."Row ID" WHERE ch."Row ID" IS NULL OR l."Ref Borrowers" IS DISTINCT FROM f->>'borrowerId' OR ch."Charge Date" IS DISTINCT FROM (line->>'chargeDate')::date OR ch."Principal Due"::numeric-coalesce(paid.p,0) IS DISTINCT FROM (line->>'expectedPrincipalRemaining')::numeric OR ch."Interest Due"::numeric-coalesce(paid.i,0) IS DISTINCT FROM (line->>'expectedInterestRemaining')::numeric OR (line->>'principal')::numeric>ch."Principal Due"::numeric-coalesce(paid.p,0) OR (line->>'interest')::numeric>ch."Interest Due"::numeric-coalesce(paid.i,0)) THEN RAISE EXCEPTION USING ERRCODE='P5B09';END IF;
 END IF;
 plan:=jsonb_build_object('borrowerId',f->'borrowerId','amountReceived',f->'amountReceived','allocations',f->'allocations','allocationMethod',f->'allocationMethod','targetChargeId',f->'targetChargeId','targetLoanId',f->'targetLoanId','cashAccountId',f->'cashAccountId','paymentDate',f->'paymentDate','paymentMethod',f->'paymentMethod');
 SELECT string_agg(value->>'chargeId',',' ORDER BY (value->>'chargeId') COLLATE "C") INTO ids FROM jsonb_array_elements(f->'allocations');
 IF f->>'allocationMethod'<>'Selected Charges' THEN ids:=NULL;END IF;
 ELSE SELECT string_agg(value#>>'{}',',' ORDER BY (value#>>'{}') COLLATE "C") INTO ids FROM jsonb_array_elements(CASE WHEN f->'selectedChargeIds'='null'::jsonb THEN '[]'::jsonb ELSE f->'selectedChargeIds' END);END IF;
 desired:=jsonb_populate_record(old,jsonb_build_object('Ref Borrower',f->'borrowerId','Amount Received',f->'amountReceived','Payment Date',f->'paymentDate','Payment Method',f->'paymentMethod','Ref Received By Cash Account',f->'cashAccountId','Notes',f->'notes','Allocation Method',f->'allocationMethod','Ref Target Charge',f->'targetChargeId','Ref Target Loan',f->'targetLoanId','Selected Charge IDs',ids,'Uploaded Receipt',CASE i->>'receiptMode' WHEN 'preserve' THEN old."Uploaded Receipt" WHEN 'replace' THEN e#>>'{receipt,storageReference}' ELSE NULL END));
 repost:=provenance IS NOT NULL AND (public.payment_inputs(desired) IS DISTINCT FROM public.payment_inputs(old) OR public.pwa_plan_effects_v83(provenance#>'{plan,allocations}') IS DISTINCT FROM public.pwa_plan_effects_v83(f->'allocations'));
 IF provenance IS NOT NULL THEN
  IF f->>'allocationMethod'='Selected Charges' AND (f->>'targetChargeId' IS NOT NULL OR f->>'targetLoanId' IS NOT NULL) THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
  IF repost AND f->>'allocationMethod'='First-day Auto' THEN
   SELECT l.* INTO destination FROM public."Charges" ch JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans" WHERE ch."Row ID"=f->>'targetChargeId' AND ch."Charge Date"=l."Loan Date";
   IF NOT FOUND OR destination."Ref Borrowers" IS DISTINCT FROM f->>'borrowerId' OR destination."Loan Type" NOT IN('ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน') OR destination."Auto Charge Enabled" IS NOT TRUE OR destination."Defaulted" IS TRUE OR destination."Loan Date" IS DISTINCT FROM (f->>'paymentDate')::date OR f->>'paymentMethod'<>'Net-off at Disbursement' OR f->>'targetLoanId' IS NOT NULL OR jsonb_array_length(f->'allocations')<>1 OR f#>>'{allocations,0,chargeId}' IS DISTINCT FROM f->>'targetChargeId' OR (f#>>'{allocations,0,principal}')::numeric<>(f#>>'{allocations,0,expectedPrincipalRemaining}')::numeric OR (f#>>'{allocations,0,interest}')::numeric<>(f#>>'{allocations,0,expectedInterestRemaining}')::numeric THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
   IF public.cash_account_holder(f->>'cashAccountId',true)<>'ch:lisa' THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
  ELSIF repost AND f->>'allocationMethod'='Loan Close' AND NOT enter_close THEN
   IF NOT EXISTS(SELECT 1 FROM public."Loans" WHERE "Row ID"=f->>'targetLoanId' AND "Ref Borrowers"=f->>'borrowerId') OR NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Row ID"=f->>'targetChargeId' AND "Ref Loans"=f->>'targetLoanId') THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
   IF EXISTS(WITH paid AS(SELECT "Ref Charges" id,sum("Principal Paid"::numeric) p,sum("Interest Paid"::numeric) i FROM public."Repayments" WHERE "Ref Payment" IS DISTINCT FROM target GROUP BY "Ref Charges"),lines AS(SELECT value FROM jsonb_array_elements(f->'allocations')) SELECT 1 FROM public."Charges" ch LEFT JOIN paid ON paid.id=ch."Row ID" FULL JOIN lines ON lines.value->>'chargeId'=ch."Row ID" WHERE (ch."Ref Loans"=f->>'targetLoanId' OR lines.value IS NOT NULL) AND (ch."Ref Loans" IS DISTINCT FROM f->>'targetLoanId' OR (ch."Principal Due"::numeric-coalesce(paid.p,0)>0 OR ch."Interest Due"::numeric-coalesce(paid.i,0)>0) AND (lines.value IS NULL OR (lines.value->>'principal')::numeric IS DISTINCT FROM ch."Principal Due"::numeric-coalesce(paid.p,0) OR (lines.value->>'interest')::numeric IS DISTINCT FROM ch."Interest Due"::numeric-coalesce(paid.i,0)))) THEN RAISE EXCEPTION USING ERRCODE='P5B09';END IF;
  END IF;
 END IF;
 explicit_inverse:=provenance IS NOT NULL AND public.payment_inputs(desired)=public.payment_inputs(old) AND public.pwa_plan_effects_v83(provenance#>'{plan,allocations}') IS DISTINCT FROM public.pwa_plan_effects_v83(f->'allocations');
 explicit_finish:=explicit_inverse AND desired."Ref Received By Cash Account" IS NOT DISTINCT FROM old."Ref Received By Cash Account";
 END IF;
 result_value:=jsonb_build_object('operation',op,'targetType','payment','targetId',target,'paymentId',CASE WHEN op='payment.correct' THEN target ELSE NULL END,'plan',plan,'predecessorRequestId',head,'sourceCreatedBy',CASE WHEN op='payment.correct' THEN old."Created By" ELSE NULL END);
 INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code,result_json) VALUES((e->>'requestId')::uuid,2,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',canonical,encode(sha256(convert_to(canonical,'UTF8')),'hex'),'applied',NULL,NULL,result_value);
 BEGIN
 IF op='payment.delete' THEN UPDATE public."Payments" SET "Delete Requested"=true WHERE "Row ID"=target;
 ELSIF op='payment.move-interest' THEN
 IF provenance IS NOT NULL OR old."Allocation Method" IS DISTINCT FROM 'Lump Sum' THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 UPDATE public."Payment Allocations" SET "Ref Charge"=i->>'targetChargeId' WHERE "Row ID"=i->>'allocationId' AND "Ref Payment"=target;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 ELSE
 IF explicit_inverse THEN
 PERFORM set_config('pwa.native_inverse_request',e->>'requestId',true);
 desired:=public.payment_crud_prepare_core_v83(old,desired,'UPDATE');END IF;
 UPDATE public."Payments" SET "Ref Borrower"=desired."Ref Borrower","Amount Received"=desired."Amount Received","Payment Date"=desired."Payment Date","Payment Method"=desired."Payment Method","Ref Received By Cash Account"=desired."Ref Received By Cash Account","Notes"=desired."Notes","Allocation Method"=desired."Allocation Method","Ref Target Charge"=desired."Ref Target Charge","Ref Target Loan"=desired."Ref Target Loan","Selected Charge IDs"=desired."Selected Charge IDs","Uploaded Receipt"=desired."Uploaded Receipt","Status"=desired."Status","Processed At"=desired."Processed At" WHERE "Row ID"=target;
 SELECT * INTO actual FROM public."Payments" WHERE "Row ID"=target;
 IF actual."Status" IS DISTINCT FROM 'Posted' OR actual."Posted Amount"::numeric IS DISTINCT FROM (f->>'amountReceived')::numeric THEN RAISE EXCEPTION 'Correction did not post exact requested amount';END IF;
 IF explicit_finish THEN PERFORM public.payment_crud_finish_core_v83(old,actual,'UPDATE');END IF;
 PERFORM set_config('pwa.native_inverse_request','',true);
 END IF;
 EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B05';WHEN SQLSTATE 'P0001' THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
 IF op='payment.move-interest' AND message='Interest move requires an eligible charge on the same open loan' THEN RAISE EXCEPTION USING ERRCODE='P5B04';
 ELSIF op='payment.move-interest' AND message='Target charge capacity conflict' THEN RAISE EXCEPTION USING ERRCODE='P5B09';
 ELSIF op='payment.move-interest' AND message IN('Only a posted Lump Sum whole-interest allocation can move','Change receipt amounts through Payments; allocation move only changes Ref Charge') THEN RAISE EXCEPTION USING ERRCODE='P5B06';
 ELSIF message IN('Payment has a later loan default/write-off; reconcile that default first','Manually closed loan must be reopened explicitly before its receipt changes','Corrected payment has a default dependency; undo default first') THEN RAISE EXCEPTION USING ERRCODE='P5B05';ELSE RAISE;END IF;END;
 RETURN result_value;
EXCEPTION WHEN OTHERS THEN PERFORM set_config('pwa.native_inverse_request','',true);RAISE;
END $$;
REVOKE ALL ON FUNCTION public.pwa_apply_payment_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pwa_apply_payment_v2(text) TO mw_app_dev_journal_owner;

CREATE FUNCTION public.pwa_expense_version_v2(id text) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object('source',to_jsonb(e),'ledger',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c."Row ID" COLLATE "C") FROM public."Cash Ledger" c WHERE c."Ref Business Expense"=e."Row ID"),'[]'))::text,'UTF8')),'hex') FROM public."Business Expenses" e WHERE e."Row ID"=$1;
$$;
REVOKE ALL ON FUNCTION public.pwa_expense_version_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pwa_expense_version_v2(text) TO mw_app_dev;
CREATE FUNCTION public.pwa_apply_expense_v2(canonical text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE e jsonb:=canonical::jsonb;c jsonb:=e->'command';i jsonb:=c->'inputs';a jsonb:=e->'actor';op text:=c->>'operation';target text:=c->>'targetId';old public."Business Expenses"%ROWTYPE;holder text;message text;categories text[]:=ARRAY['Collection Cost / ค่าใช้จ่ายติดตามหนี้','Transportation / ค่าเดินทาง','Bank / Transfer Fee / ค่าธรรมเนียมธนาคารและโอนเงิน','Software / Subscription / ค่าซอฟต์แวร์และสมาชิก','Other / อื่น ๆ','Referral Rebate / เงินคืนค่าแนะนำลูกค้า'];
BEGIN
 IF current_user<>'mw_app_dev_journal_owner' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Governed operation required';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('expense:'||target,0));
 SELECT * INTO old FROM public."Business Expenses" WHERE "Row ID"=target FOR UPDATE;
 IF op='expense.create' THEN IF FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 ELSE IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;IF public.pwa_expense_version_v2(target) IS DISTINCT FROM c->>'expectedVersion' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;IF old."Source Type" IS DISTINCT FROM 'Manual' THEN RAISE EXCEPTION USING ERRCODE='P5B05';END IF;END IF;
 IF op<>'expense.delete' THEN
 IF (op='expense.create' OR i->>'category' IS DISTINCT FROM old."Expense Category") AND NOT (i->>'category'=ANY(categories)) THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 IF (i->>'amount')::numeric<0 AND nullif(btrim(i->>'notes'),'') IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 IF i->>'relatedBorrowerId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID"=i->>'relatedBorrowerId') THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 IF i->>'relatedLoanId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."Loans" WHERE "Row ID"=i->>'relatedLoanId' AND (i->>'relatedBorrowerId' IS NULL OR "Ref Borrowers"=i->>'relatedBorrowerId')) THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 IF op='expense.update' AND i->>'paidByAccountId' IS NOT DISTINCT FROM old."Ref Paid By Cash Account" THEN holder:=old."Ref Paid By Cash Holder";
 ELSIF i->>'paidByAccountId' IS NOT NULL THEN
 SELECT ca."Ref Cash Holder" INTO holder FROM public."Cash Accounts" ca JOIN public."Cash Holders" h ON h."Row ID"=ca."Ref Cash Holder" WHERE ca."Row ID"=i->>'paidByAccountId' AND ca."Active" IS TRUE AND h."Active" IS TRUE AND h."Row ID" IN('ch:dad','ch:lisa','ch:tommy');IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
 END IF;
 IF op='expense.create' AND (i->>'amount')::numeric>0 AND holder IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
 END IF;
 BEGIN
 IF op='expense.create' THEN INSERT INTO public."Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Payee Name","Ref Related Borrower","Ref Related Loan","Notes","Ref Paid By Cash Account","Ref Paid By Cash Holder","Source Type","Created By") VALUES(target,(i->>'expenseDate')::date,i->>'category',(i->>'amount')::numeric::money,i->>'payeeName',i->>'relatedBorrowerId',i->>'relatedLoanId',i->>'notes',i->>'paidByAccountId',holder,'Manual',a->>'loginEmail');
 ELSIF op='expense.update' THEN UPDATE public."Business Expenses" SET "Expense Date"=(i->>'expenseDate')::date,"Expense Category"=i->>'category',"Amount"=(i->>'amount')::numeric::money,"Payee Name"=i->>'payeeName',"Ref Related Borrower"=i->>'relatedBorrowerId',"Ref Related Loan"=i->>'relatedLoanId',"Notes"=i->>'notes',"Ref Paid By Cash Account"=i->>'paidByAccountId',"Ref Paid By Cash Holder"=holder WHERE "Row ID"=target;
 ELSE DELETE FROM public."Business Expenses" WHERE "Row ID"=target;END IF;
 EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B05';WHEN SQLSTATE 'P0001' THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
 IF message='Correct linked reimbursement before changing expense away from a positive Tommy-paid expense' THEN RAISE EXCEPTION USING ERRCODE='P5B05';ELSIF message='Related loan does not belong to related borrower' THEN RAISE EXCEPTION USING ERRCODE='P5B04';ELSIF message IN('Expense allocation requires a positive A/B contribution pool on its allocation date','A negative manual adjustment requires an explanatory note') THEN RAISE EXCEPTION USING ERRCODE='P5B06';ELSE RAISE;END IF;END;
 RETURN jsonb_build_object('operation',op,'targetType','expense','targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy',NULL);
END $$;
REVOKE ALL ON FUNCTION public.pwa_apply_expense_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pwa_apply_expense_v2(text) TO mw_app_dev_journal_owner;

CREATE FUNCTION public.pwa_preference_version_v2(id text) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object('partnerId',p."Row ID",'language',p."Language Preference",'context',to_jsonb(c))::text,'UTF8')),'hex') FROM public."Partners" p LEFT JOIN public."Cash Statement Context" c ON c."Ref Partner"=p."Row ID" WHERE p."Row ID"=$1;
$$;
CREATE FUNCTION public.pwa_apply_preference_v2(canonical text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE e jsonb:=canonical::jsonb;c jsonb:=e->'command';i jsonb:=c->'inputs';target text:=c->>'targetId';today date:=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date;
BEGIN
 IF current_user<>'mw_app_dev_journal_owner' OR target IS DISTINCT FROM e#>>'{actor,partnerId}' OR c->>'operation'<>'preference.update' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Own preferences required';END IF;
 PERFORM 1 FROM public."Partners" WHERE "Row ID"=target FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 PERFORM 1 FROM public."Cash Statement Context" WHERE "Ref Partner"=target FOR UPDATE;
 IF public.pwa_preference_version_v2(target) IS DISTINCT FROM c->>'expectedVersion' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF i->>'statementAccountId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."Cash Accounts" WHERE "Row ID"=i->>'statementAccountId' AND "Active" IS TRUE) THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 IF i->>'statementDate' IS NOT NULL AND (i->>'statementDate')::date NOT BETWEEN today-14 AND today THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
 UPDATE public."Partners" SET "Language Preference"=i->>'language' WHERE "Row ID"=target;
 INSERT INTO public."Cash Statement Context"("Ref Partner","Ref Cash Account","Statement Date") VALUES(target,i->>'statementAccountId',(i->>'statementDate')::date) ON CONFLICT("Ref Partner") DO UPDATE SET "Ref Cash Account"=EXCLUDED."Ref Cash Account","Statement Date"=EXCLUDED."Statement Date";
 RETURN jsonb_build_object('operation','preference.update','targetType','preference','targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy',NULL);
END $$;
REVOKE ALL ON FUNCTION public.pwa_preference_version_v2(text),public.pwa_apply_preference_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pwa_preference_version_v2(text) TO mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_apply_preference_v2(text) TO mw_app_dev_journal_owner;
