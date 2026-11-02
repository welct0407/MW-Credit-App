-- R112 Pay Forward Release 3 (owner: "start release 3, test it and promote to prod too", 2 November 2026; Archie's
-- design). V121 to V124 are applied and stay.
-- 1. The agent receipt command accepts schemaVersion 9 = 8 plus purpose {forward, principal:[{loanId, amount}], loans:
--    null} (the partner's numbered reply) and the plan's explicit allocations, materialize and principal entries in the
--    manual v10 shapes. Reviewed mode only, dated the business day. Under the borrower, loan and charge locks the server
--    recomputes pwa_pay_forward_plan_v1 for that purpose and requires the command to equal it (nothing uncovered, no loan
--    settled, every requested principal applied); drift is selection_unavailable (P4C05) and rolls back. The booking is
--    the shared writer pwa_apply_pay_forward_v1; the payment posts as 'Selected Charges' with its explicit plan
--    journalled before the insert (as v10). Commands 7 and 8 are unchanged (Lump Sum, 16384 bytes); only 9 may reach
--    65536 bytes. The V124 referral trigger pair stays around the payment insert.
-- 2. pwa_agent_receipt_status_v1 reports schemaVersion 9 rows (Selected Charges); pwa_effective_payment_plan_v2 gives an
--    agent row (the one with reviewId) the payment method it posts, Bank Transfer.
-- 3. Technical access change (accepted by the orchestrator, recorded by Dewey): the agent reporting role, where it exists
--    (PROD mw_integration_agent), may execute the read-only plan function and the forecast it calls, so the agent can
--    offer the options. The plan function stays revoked from PUBLIC and every other role but the application role.
-- Functions and two EXECUTE grants only; no table, column, constraint or trigger change. CREATE OR REPLACE and one
-- counted replacement keep owners, security and comments (self-check); only the two granted ACLs change, as intended.

DO $preflight$
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF obj_description('public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)'::regprocedure,'pg_proc') NOT LIKE 'mw-access:governance%'
  OR position('SET CONSTRAINTS public.referral_loan_closed IMMEDIATE' IN pg_get_functiondef('public.pwa_submit_agent_receipt_v1(text)'::regprocedure))=0
  OR to_regprocedure('public.pwa_pay_forward_plan_v1(text,numeric,date,jsonb)') IS NULL THEN RAISE EXCEPTION 'V125 preflight: V125 needs V121 to V124'; END IF;
END $preflight$;

CREATE TEMP TABLE v125_before ON COMMIT DROP AS
 SELECT p.oid::regprocedure::text AS routine,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl::text,'') AS acl,p.prosecdef AS definer,obj_description(p.oid,'pg_proc') AS comment
 FROM pg_proc p WHERE p.oid IN ('public.pwa_submit_agent_receipt_v1(text)'::regprocedure,'public.pwa_agent_receipt_status_v1(uuid,text,text)'::regprocedure,
  'public.pwa_effective_payment_plan_v2(text)'::regprocedure,'public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)'::regprocedure,
  'public.pwa_pay_forward_plan_v1(text,numeric,date,jsonb)'::regprocedure,'public.forecast_schedule_v1(jsonb,jsonb,date,date)'::regprocedure);

-- 1. The agent receipt command (whole body; changes marked R112).
CREATE OR REPLACE FUNCTION public.pwa_submit_agent_receipt_v1(canonical_json text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE e jsonb;c jsonb;a jsonb;x jsonb;k text;v text;canonical text;part text;hash text;request uuid;derived bytea;environment text;
 prior public.pwa_payment_commands%ROWTYPE;day date;matches integer;outcome_value text:='posted';rejection text;result jsonb;
 command_keys text[]:=ARRAY['schemaVersion','requestId','environment','reviewId','mode','borrowerId','cashAccountId','amountReceived','paymentDate','transferTime','bankReference','proposalSha256','archiveEvidence'];
 evidence_keys text[]:=ARRAY['receiptId','objectKey','generation','rawSha256','mimeType','sizeBytes','capturedAt'];
 actor_keys text[]:=ARRAY['issuer','subject','partnerId','loginEmail'];
 text_keys text[]:=ARRAY['requestId','environment','reviewId','mode','borrowerId','cashAccountId','amountReceived','paymentDate','transferTime','bankReference','proposalSha256'];
 -- R095 v8 payerLines {before, after}: the payer-lines change, written only while the column still equals `before`.
 payer_before text;payer_after text;
 -- R112 v9: the partner's purpose and the plan's explicit lines, booked charges and principal entries (v10 shapes).
 entry jsonb;line jsonb;ids text[]:=ARRAY[]::text[];sorted_ids text[];loans text[];plan jsonb;today date;plan_total numeric:=0;
 purpose_text text:='';plan_text text:='';materialize_text text:='';principal_text text:='';
 posted_status text;posted_amount numeric;
 ws text:=chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
BEGIN
 environment:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR session_user<>('mw-credit-app-command-'||environment||'@clever-oasis-508610-n7.iam') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Command session required'; END IF;
 -- R112: 65536 bytes for schemaVersion 9 only (checked below); 7 and 8 keep 16384.
 IF $1 IS NULL OR octet_length($1)>65536 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid agent receipt command'; END IF;
 BEGIN
  e:=$1::jsonb;c:=e->'command';a:=e->'actor';x:=c->'archiveEvidence';
  -- R095: schemaVersion 8 = 7 plus payerLines after bankReference (an object or null); 7 stays accepted.
  IF c->'schemaVersion'='8'::jsonb THEN command_keys:=ARRAY['schemaVersion','requestId','environment','reviewId','mode','borrowerId','cashAccountId','amountReceived','paymentDate','transferTime','bankReference','payerLines','proposalSha256','archiveEvidence']; END IF;
  -- R112: schemaVersion 9 = 8 plus purpose, allocations, materialize and principal after payerLines.
  IF c->'schemaVersion'='9'::jsonb THEN command_keys:=ARRAY['schemaVersion','requestId','environment','reviewId','mode','borrowerId','cashAccountId','amountReceived','paymentDate','transferTime','bankReference','payerLines','purpose','allocations','materialize','principal','proposalSha256','archiveEvidence']; END IF;
  IF octet_length($1)>16384 AND c->'schemaVersion' IS DISTINCT FROM '9'::jsonb THEN RAISE EXCEPTION 'size'; END IF;
  IF jsonb_typeof(e)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(e) key)<>ARRAY['actor','command','contractVersion','receipt'] OR e->'contractVersion'<>'1'::jsonb OR e->'receipt'<>'null'::jsonb
   OR jsonb_typeof(c)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c) key)<>(SELECT array_agg(key ORDER BY key) FROM unnest(command_keys) key)
   OR jsonb_typeof(a)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(a) key)<>(SELECT array_agg(key ORDER BY key) FROM unnest(actor_keys) key)
   OR jsonb_typeof(x)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(x) key)<>(SELECT array_agg(key ORDER BY key) FROM unnest(evidence_keys) key)
   OR c->'schemaVersion' NOT IN ('7'::jsonb,'8'::jsonb,'9'::jsonb) OR (c->>'environment')<>environment OR (c->>'mode') NOT IN ('automatic','reviewed') THEN RAISE EXCEPTION 'shape'; END IF;
  FOREACH k IN ARRAY text_keys LOOP
   IF jsonb_typeof(c->k)<>'string' THEN RAISE EXCEPTION 'type'; END IF;
   v:=(c->>k);IF octet_length(v) NOT BETWEEN 1 AND 256 OR btrim(v)='' OR v~E'[\\r\\n]' OR (k<>'bankReference' AND v<>btrim(v)) THEN RAISE EXCEPTION 'text'; END IF;
  END LOOP;
  IF c->'schemaVersion' IN ('8'::jsonb,'9'::jsonb) AND c->'payerLines'<>'null'::jsonb THEN
   IF jsonb_typeof(c->'payerLines')<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c->'payerLines') key)<>ARRAY['after','before']
    OR jsonb_typeof(c->'payerLines'->'after')<>'string' OR jsonb_typeof(c->'payerLines'->'before') NOT IN ('string','null') THEN RAISE EXCEPTION 'payer lines';END IF;
   payer_before:=c->'payerLines'->>'before';payer_after:=c->'payerLines'->>'after';
   IF octet_length(payer_after) NOT BETWEEN 1 AND 1000 OR payer_after=coalesce(payer_before,'') OR octet_length(coalesce(payer_before,''))>65536 OR NOT payer_after IS NFC NORMALIZED
    OR cardinality(string_to_array(payer_after,E'\n')) NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'payer lines';END IF;
   -- Each line is in payer_name.display form: no control, zero-width or non-space whitespace, single spaces, trimmed, 1..200 bytes.
   IF EXISTS(SELECT 1 FROM unnest(string_to_array(payer_after,E'\n')) payer_line WHERE octet_length(payer_line) NOT BETWEEN 1 AND 200 OR payer_line<>btrim(payer_line,' ')
    OR position('  ' IN payer_line)>0 OR payer_line~'[\x01-\x1f\x7f-\x9f\u00a0\u1680\u2000-\u200d\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]') THEN RAISE EXCEPTION 'payer lines';END IF;
  END IF;
  IF (c->>'amountReceived')!~'^[1-9][0-9]{0,16}$' OR ((c->>'amountReceived'))::numeric>92233720368547758 OR (c->>'proposalSha256')!~'^[a-f0-9]{64}$' OR (c->>'paymentDate')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (c->>'transferTime')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'values'; END IF;
  day:=((c->>'paymentDate'))::date;IF to_char(day,'YYYY-MM-DD')<>(c->>'paymentDate') THEN RAISE EXCEPTION 'date'; END IF;
  -- R112 v9: a partner's numbered reply (reviewed mode only). purpose {forward, principal (0 to 20 {loanId, amount},
  -- ordered by loanId), loans null}, forward or at least one principal entry; allocations (1 to 10000 lines ordered by
  -- chargeId, totalling the amount), materialize (0 to 200) and principal (0 to 20) as the manual v10 command.
  IF c->'schemaVersion'='9'::jsonb THEN
   IF (c->>'mode')<>'reviewed' OR jsonb_typeof(c->'purpose') IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c->'purpose') key) IS DISTINCT FROM ARRAY['forward','loans','principal']
    OR jsonb_typeof(c->'purpose'->'forward') IS DISTINCT FROM 'boolean' OR c->'purpose'->'loans' IS DISTINCT FROM 'null'::jsonb OR jsonb_typeof(c->'purpose'->'principal') IS DISTINCT FROM 'array'
    OR jsonb_array_length(c->'purpose'->'principal')>20 OR (c->'purpose'->'forward'='false'::jsonb AND jsonb_array_length(c->'purpose'->'principal')=0) THEN RAISE EXCEPTION 'purpose'; END IF;
   loans:=ARRAY[]::text[];
   FOR entry IN SELECT value FROM jsonb_array_elements(c->'purpose'->'principal') LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(entry) key) IS DISTINCT FROM ARRAY['amount','loanId']
     OR jsonb_typeof(entry->'loanId') IS DISTINCT FROM 'string' OR jsonb_typeof(entry->'amount') IS DISTINCT FROM 'string' OR entry->>'amount' !~ '^[1-9][0-9]{0,16}$' THEN RAISE EXCEPTION 'purpose entry'; END IF;
    v:=entry->>'loanId';IF octet_length(v) NOT BETWEEN 1 AND 256 OR v<>btrim(v,ws) OR v~E'[\\r\\n]' THEN RAISE EXCEPTION 'purpose loan'; END IF;
    loans:=array_append(loans,v);
    purpose_text:=purpose_text||CASE WHEN purpose_text='' THEN '' ELSE ',' END||'{"loanId":'||to_json(v)::text||',"amount":'||to_json(entry->>'amount')::text||'}';
   END LOOP;
   SELECT array_agg(y ORDER BY y COLLATE "C") INTO sorted_ids FROM (SELECT DISTINCT unnest(loans) y) q;
   IF loans IS DISTINCT FROM coalesce(sorted_ids,ARRAY[]::text[]) THEN RAISE EXCEPTION 'purpose order'; END IF;
   purpose_text:='{"forward":'||(c->'purpose'->>'forward')||',"principal":['||purpose_text||'],"loans":null}';
   IF jsonb_typeof(c->'allocations') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'allocations') NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'plan'; END IF;
   FOR line IN SELECT value FROM jsonb_array_elements(c->'allocations') LOOP
    IF jsonb_typeof(line) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(line) key) IS DISTINCT FROM ARRAY['chargeDate','chargeId','expectedInterestRemaining','expectedPrincipalRemaining','interest','principal'] THEN RAISE EXCEPTION 'line'; END IF;
    FOREACH k IN ARRAY ARRAY['chargeId','principal','interest','expectedPrincipalRemaining','expectedInterestRemaining','chargeDate'] LOOP
     IF jsonb_typeof(line->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'line type'; END IF;
    END LOOP;
    v:=line->>'chargeId';IF octet_length(v) NOT BETWEEN 1 AND 256 OR v LIKE '%,%' OR translate(v,ws,'')<>v THEN RAISE EXCEPTION 'line id'; END IF;ids:=array_append(ids,v);
    FOREACH k IN ARRAY ARRAY['principal','interest','expectedPrincipalRemaining','expectedInterestRemaining'] LOOP
     IF line->>k !~ '^(0|[1-9][0-9]{0,16})$' OR (line->>k)::numeric>92233720368547758 THEN RAISE EXCEPTION 'component'; END IF;
    END LOOP;
    IF (line->>'principal')::numeric+(line->>'interest')::numeric<=0 OR (line->>'principal')::numeric>(line->>'expectedPrincipalRemaining')::numeric OR (line->>'interest')::numeric>(line->>'expectedInterestRemaining')::numeric THEN RAISE EXCEPTION 'line cap'; END IF;
    v:=line->>'chargeDate';IF v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR v<'0001-01-01' OR to_char(v::date,'YYYY-MM-DD')<>v THEN RAISE EXCEPTION 'line day'; END IF;
    plan_total:=plan_total+(line->>'principal')::numeric+(line->>'interest')::numeric;
    plan_text:=plan_text||CASE WHEN plan_text='' THEN '' ELSE ',' END||'{"chargeId":'||to_json(line->>'chargeId')::text||',"principal":'||to_json(line->>'principal')::text||',"interest":'||to_json(line->>'interest')::text
     ||',"expectedPrincipalRemaining":'||to_json(line->>'expectedPrincipalRemaining')::text||',"expectedInterestRemaining":'||to_json(line->>'expectedInterestRemaining')::text||',"chargeDate":'||to_json(line->>'chargeDate')::text||'}';
   END LOOP;
   SELECT array_agg(y ORDER BY y COLLATE "C") INTO sorted_ids FROM (SELECT DISTINCT unnest(ids) y) q;
   IF ids IS DISTINCT FROM sorted_ids OR plan_total<>(c->>'amountReceived')::numeric THEN RAISE EXCEPTION 'plan order or total'; END IF;
   IF jsonb_typeof(c->'materialize') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'materialize')>200 THEN RAISE EXCEPTION 'materialize'; END IF;
   loans:=ARRAY[]::text[];
   FOR entry IN SELECT value FROM jsonb_array_elements(c->'materialize') LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(entry) key) IS DISTINCT FROM ARRAY['chargeDate','chargeId','interestDue','loanId','principalDue'] THEN RAISE EXCEPTION 'materialize entry'; END IF;
    FOREACH k IN ARRAY ARRAY['loanId','chargeId','chargeDate','principalDue','interestDue'] LOOP
     IF jsonb_typeof(entry->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'materialize type'; END IF;
    END LOOP;
    v:=entry->>'loanId';IF octet_length(v) NOT BETWEEN 1 AND 256 OR v<>btrim(v,ws) OR v~E'[\\r\\n]' THEN RAISE EXCEPTION 'materialize loan'; END IF;
    v:=entry->>'chargeDate';IF v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR v<'0001-01-01' OR to_char(v::date,'YYYY-MM-DD')<>v THEN RAISE EXCEPTION 'materialize day'; END IF;
    IF entry->>'chargeId' IS DISTINCT FROM 'cg8:'||length(entry->>'loanId')||':'||(entry->>'loanId')||':'||(entry->>'chargeDate') THEN RAISE EXCEPTION 'materialize key'; END IF;
    FOREACH k IN ARRAY ARRAY['principalDue','interestDue'] LOOP
     IF entry->>k !~ '^(0|[1-9][0-9]{0,16})$' OR (entry->>k)::numeric>92233720368547758 THEN RAISE EXCEPTION 'materialize component'; END IF;
    END LOOP;
    IF (entry->>'principalDue')::numeric+(entry->>'interestDue')::numeric<=0 THEN RAISE EXCEPTION 'materialize amount'; END IF;
    loans:=array_append(loans,entry->>'chargeId');
    materialize_text:=materialize_text||CASE WHEN materialize_text='' THEN '' ELSE ',' END||'{"loanId":'||to_json(entry->>'loanId')::text||',"chargeId":'||to_json(entry->>'chargeId')::text
     ||',"chargeDate":'||to_json(entry->>'chargeDate')::text||',"principalDue":'||to_json(entry->>'principalDue')::text||',"interestDue":'||to_json(entry->>'interestDue')::text||'}';
   END LOOP;
   SELECT array_agg(y ORDER BY y COLLATE "C") INTO sorted_ids FROM (SELECT DISTINCT unnest(loans) y) q;
   IF loans IS DISTINCT FROM coalesce(sorted_ids,ARRAY[]::text[]) THEN RAISE EXCEPTION 'materialize order'; END IF;
   IF jsonb_typeof(c->'principal') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'principal')>20 THEN RAISE EXCEPTION 'principal'; END IF;
   loans:=ARRAY[]::text[];
   FOR entry IN SELECT value FROM jsonb_array_elements(c->'principal') LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(entry) key) IS DISTINCT FROM ARRAY['accruedInterest','amount','chargeDate','chargeId','kind','loanId','principalDue'] THEN RAISE EXCEPTION 'principal entry'; END IF;
    FOREACH k IN ARRAY ARRAY['loanId','kind','chargeId','chargeDate','amount','accruedInterest','principalDue'] LOOP
     IF jsonb_typeof(entry->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'principal type'; END IF;
    END LOOP;
    v:=entry->>'loanId';IF octet_length(v) NOT BETWEEN 1 AND 256 OR v<>btrim(v,ws) OR v~E'[\\r\\n]' THEN RAISE EXCEPTION 'principal loan'; END IF;
    v:=entry->>'chargeId';IF octet_length(v) NOT BETWEEN 1 AND 256 OR v LIKE '%,%' OR translate(v,ws,'')<>v THEN RAISE EXCEPTION 'principal charge'; END IF;
    v:=entry->>'chargeDate';IF v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR v<'0001-01-01' OR to_char(v::date,'YYYY-MM-DD')<>v THEN RAISE EXCEPTION 'principal day'; END IF;
    FOREACH k IN ARRAY ARRAY['amount','accruedInterest','principalDue'] LOOP
     IF entry->>k !~ '^(0|[1-9][0-9]{0,16})$' OR (entry->>k)::numeric>92233720368547758 THEN RAISE EXCEPTION 'principal component'; END IF;
    END LOOP;
    IF entry->>'kind' NOT IN ('raise','book') THEN RAISE EXCEPTION 'principal kind'; END IF;
    loans:=array_append(loans,entry->>'loanId');
    principal_text:=principal_text||CASE WHEN principal_text='' THEN '' ELSE ',' END||'{"loanId":'||to_json(entry->>'loanId')::text||',"kind":'||to_json(entry->>'kind')::text
     ||',"chargeId":'||to_json(entry->>'chargeId')::text||',"chargeDate":'||to_json(entry->>'chargeDate')::text||',"amount":'||to_json(entry->>'amount')::text
     ||',"accruedInterest":'||to_json(entry->>'accruedInterest')::text||',"principalDue":'||to_json(entry->>'principalDue')::text||'}';
   END LOOP;
   SELECT array_agg(y ORDER BY y COLLATE "C") INTO sorted_ids FROM (SELECT DISTINCT unnest(loans) y) q;
   IF loans IS DISTINCT FROM coalesce(sorted_ids,ARRAY[]::text[]) THEN RAISE EXCEPTION 'principal order'; END IF;
  END IF;
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
   ELSIF k='payerLines' THEN part:=CASE WHEN payer_after IS NULL THEN 'null' ELSE '{"before":'||coalesce(to_json(payer_before)::text,'null')||',"after":'||to_json(payer_after)::text||'}' END;
   ELSIF k='purpose' THEN part:=purpose_text;
   ELSIF k='allocations' THEN part:='['||plan_text||']';
   ELSIF k='materialize' THEN part:='['||materialize_text||']';
   ELSIF k='principal' THEN part:='['||principal_text||']';
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
  -- R112 v9: the plan is the business day's (a slip of yesterday is invalid_date). Under the engine's borrower -> loans ->
  -- charges locks the server recomputes the pay-forward plan for this borrower, amount and purpose and requires the
  -- command's lines, booked charges and principal entries to equal it, with nothing uncovered, no loan settled and every
  -- requested principal applied; then the shared writer books it and the explicit plan is journalled before the payment
  -- is inserted (the posting guard reads it). Drift is selection_unavailable (P4C05) and this sub-block rolls back.
  IF c->'schemaVersion'='9'::jsonb THEN
   today:=(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date;
   IF day<>today THEN RAISE EXCEPTION USING ERRCODE='P4C01';END IF;
   PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers"=(c->>'borrowerId') ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
   PERFORM 1 FROM public."Charges" ch JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans" WHERE l."Ref Borrowers"=(c->>'borrowerId') ORDER BY ch."Row ID" COLLATE "C" FOR UPDATE OF ch;
   BEGIN
    plan:=public.pwa_pay_forward_plan_v1((c->>'borrowerId'),((c->>'amountReceived'))::numeric,today,c->'purpose');
   EXCEPTION WHEN SQLSTATE 'P0001' THEN RAISE EXCEPTION USING ERRCODE='P4C05';
   END;
   IF plan->'allocations' IS DISTINCT FROM c->'allocations' OR plan->'materialize' IS DISTINCT FROM c->'materialize' OR plan->>'uncovered' IS DISTINCT FROM '0' OR plan->'settles' IS DISTINCT FROM '[]'::jsonb
    OR jsonb_array_length(plan->'principal') IS DISTINCT FROM jsonb_array_length(c->'purpose'->'principal')
    OR (SELECT coalesce(jsonb_agg(jsonb_build_object('loanId',y->'loanId','kind',y->'kind','chargeId',y->'chargeId','chargeDate',y->'chargeDate','amount',y->'amount','accruedInterest',y->'accruedInterest','principalDue',y->'principalDue') ORDER BY y->>'loanId' COLLATE "C"),'[]'::jsonb)
     FROM jsonb_array_elements(plan->'principal') y) IS DISTINCT FROM c->'principal' THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
   PERFORM public.pwa_apply_pay_forward_v1(c->'principal',c->'materialize',today);
   IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(c->'allocations') AS entries(item)
    LEFT JOIN public."Charges" ch ON ch."Row ID"=entries.item->>'chargeId'
    LEFT JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans"
    LEFT JOIN (SELECT "Ref Charges" charge,sum("Principal Paid"::numeric) principal,sum("Interest Paid"::numeric) interest,count(*) FILTER(WHERE "Principal Paid" IS NULL OR "Interest Paid" IS NULL) invalid FROM public."Repayments" WHERE "Ref Charges"=ANY(ids) GROUP BY "Ref Charges") paid ON paid.charge=ch."Row ID"
    WHERE l."Ref Borrowers" IS DISTINCT FROM (c->>'borrowerId') OR coalesce(paid.invalid,0)>0
     OR ch."Principal Due"::numeric-coalesce(paid.principal,0) IS DISTINCT FROM (entries.item->>'expectedPrincipalRemaining')::numeric
     OR ch."Interest Due"::numeric-coalesce(paid.interest,0) IS DISTINCT FROM (entries.item->>'expectedInterestRemaining')::numeric
     OR ch."Charge Date" IS DISTINCT FROM (entries.item->>'chargeDate')::date
   ) THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
   INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code)
   VALUES(request,1,(a->>'issuer'),(a->>'subject'),(a->>'partnerId'),(a->>'loginEmail'),canonical,hash,'posted','pwa:'||request::text,NULL);
  END IF;
  SET CONSTRAINTS public.referral_loan_closed DEFERRED; -- R111 V124: fired below, once the payment is Posted.
  INSERT INTO public."Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Created At","Payment Method","Allocation Method","Selected Charge IDs","Bank Reference","Created By","Notes")
  VALUES('pwa:'||request::text,(c->>'borrowerId'),(c->>'cashAccountId'),'Processing',((c->>'amountReceived'))::numeric::money,day,((c->>'paymentDate')||' '||(c->>'transferTime')||':00')::timestamp,'Bank Transfer',
   CASE WHEN c->'schemaVersion'='9'::jsonb THEN 'Selected Charges' ELSE 'Lump Sum' END,CASE WHEN c->'schemaVersion'='9'::jsonb THEN array_to_string(ids,' , ') END,(c->>'bankReference'),(a->>'loginEmail'),
   CASE (c->>'mode') WHEN 'automatic' THEN 'Automatic Instagram receipt payment ' ELSE 'Approved Instagram receipt review ' END||'igr:'||left((c->>'reviewId'),48));
  -- R111 V124: a referred loan this receipt closed gets its rebate (and default offset) now, inside this command.
  SET CONSTRAINTS public.referral_loan_closed IMMEDIATE;
  SET CONSTRAINTS public.referral_loan_closed DEFERRED;
  -- R112 v9 (as R110 v10): the loan refresh recomputes Current Daily Interest from the frozen rate now; it must equal the
  -- plan's new daily amount that priced the booked forward charges.
  IF c->'schemaVersion'='9'::jsonb THEN
   SELECT "Status","Amount Received"::numeric INTO posted_status,posted_amount FROM public."Payments" WHERE "Row ID"='pwa:'||request::text;
   IF posted_status IS DISTINCT FROM 'Posted' OR posted_amount IS DISTINCT FROM ((c->>'amountReceived'))::numeric THEN RAISE EXCEPTION USING ERRCODE='XX000',MESSAGE='Unexpected receipt posting result';END IF;
   FOR entry IN SELECT value FROM jsonb_array_elements(plan->'principal') LOOP
    PERFORM public.vc_refresh_loan(entry->>'loanId');
    IF (SELECT "Current Daily Interest"::numeric FROM public."Loans" WHERE "Row ID"=entry->>'loanId') IS DISTINCT FROM (entry->>'dailyAfter')::numeric THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
   END LOOP;
  END IF;
  -- R095: learn the payer lines (row locked above) only while the column still equals what the agent read; drift skips it
  -- (the payment still posts). A rejected outcome rolls this sub-block back; a replay returns before reaching it.
  IF payer_after IS NOT NULL THEN
   UPDATE public."Borrowers" SET "Communication Name"=payer_after WHERE "Row ID"=(c->>'borrowerId') AND coalesce("Communication Name",'') IS NOT DISTINCT FROM coalesce(payer_before,'');
  END IF;
 EXCEPTION WHEN SQLSTATE 'P4C01' THEN outcome_value:='rejected';rejection:='invalid_date';
  WHEN SQLSTATE 'P4C02' THEN outcome_value:='rejected';rejection:='borrower_unavailable';
  WHEN SQLSTATE 'P4C03' THEN outcome_value:='rejected';rejection:='account_unavailable';
  WHEN SQLSTATE 'P4C05' THEN outcome_value:='rejected';rejection:='selection_unavailable';
  WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM<>'Payment does not match the current eligible balance' THEN RAISE;END IF;
   outcome_value:='rejected';rejection:='selection_unavailable';
 END;
 -- R112: a posted v9 command journalled its row inside the sub-block; every other outcome is journalled here.
 IF NOT EXISTS(SELECT 1 FROM public.pwa_payment_commands p WHERE p.request_id=request) THEN
  INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code)
  VALUES(request,1,(a->>'issuer'),(a->>'subject'),(a->>'partnerId'),(a->>'loginEmail'),canonical,hash,outcome_value,CASE WHEN outcome_value='posted' THEN 'pwa:'||request::text END,rejection);
 END IF;
 result:=public.pwa_agent_receipt_status_v1(request,(a->>'issuer'),(a->>'subject'));
 IF outcome_value='posted' AND result->'financialMatch' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION USING ERRCODE='XX000',MESSAGE='Unexpected receipt posting result';END IF;
 RETURN result;
END $_$;

-- 2a. The agent's status read knows schemaVersion 9 (Selected Charges); 7 and 8 stay Lump Sum.
CREATE OR REPLACE FUNCTION public.pwa_agent_receipt_status_v1(request_id uuid, actor_issuer text, actor_subject text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE r public.pwa_payment_commands%ROWTYPE; c jsonb; matched boolean; environment text;
BEGIN
 environment:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR session_user<>('mw-credit-app-command-'||environment||'@clever-oasis-508610-n7.iam') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Command session required'; END IF;
 SELECT * INTO r FROM public.pwa_payment_commands p WHERE p.request_id=$1 AND p.actor_issuer=$2 AND p.actor_subject=$3 AND p.canonical_json::jsonb#>>'{command,schemaVersion}' IN ('7','8','9') AND p.canonical_json::jsonb->'command' ? 'reviewId';
 IF NOT FOUND THEN RETURN jsonb_build_object('kind','unresolved'); END IF;
 c:=r.canonical_json::jsonb->'command';
 SELECT EXISTS(SELECT 1 FROM public."Payments" p WHERE p."Row ID"=r.payment_id AND p."Status"='Posted'
  AND p."Ref Borrower"=(c->>'borrowerId') AND p."Ref Received By Cash Account"=(c->>'cashAccountId')
  AND p."Amount Received"::numeric=((c->>'amountReceived'))::numeric AND p."Payment Date"=((c->>'paymentDate'))::date
  AND p."Created By"=r.actor_login_email AND p."Payment Method"='Bank Transfer' AND p."Allocation Method"=CASE WHEN c->>'schemaVersion'='9' THEN 'Selected Charges' ELSE 'Lump Sum' END
  AND p."Bank Reference"=(c->>'bankReference') AND to_char(p."Created At",'YYYY-MM-DD HH24:MI')=(c->>'paymentDate')||' '||(c->>'transferTime')
  AND (SELECT coalesce(sum(x."Principal Paid"::numeric+x."Interest Paid"::numeric),0) FROM public."Repayments" x WHERE x."Ref Payment"=p."Row ID")=((c->>'amountReceived'))::numeric) INTO matched;
 RETURN jsonb_build_object('kind','recorded','reviewId',(c->>'reviewId'),'financialMatch',CASE WHEN r.outcome='posted' THEN matched ELSE NULL END,
  'originalOutcome',jsonb_build_object('status',r.outcome,'paymentId',r.payment_id,'code',r.rejection_code,'recordedAt',to_char(r.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
END $_$;

-- 2b. The explicit plan of an agent v9 row carries the method its payment posts with (one counted replacement).
DO $plan$
DECLARE definition text;
 old text:=$o$'paymentDate',c->'paymentDate','paymentMethod',c->'paymentMethod');$o$;
 new text:=$n$'paymentDate',c->'paymentDate','paymentMethod',CASE WHEN c ? 'reviewId' THEN to_jsonb('Bank Transfer'::text) ELSE c->'paymentMethod' END);$n$;
BEGIN
 SELECT pg_get_functiondef('public.pwa_effective_payment_plan_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'V125: unexpected payment provenance';END IF;
 EXECUTE replace(definition,old,new);
END $plan$;

-- 3. The agent reporting role (where it exists) reads the plan the agent offers; nothing else gains access.
DO $acl$
DECLARE app text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent') THEN
  GRANT EXECUTE ON FUNCTION public.pwa_pay_forward_plan_v1(text,numeric,date,jsonb),public.forecast_schedule_v1(jsonb,jsonb,date,date) TO mw_integration_agent;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) x WHERE p.oid='public.pwa_pay_forward_plan_v1(text,numeric,date,jsonb)'::regprocedure
   AND x.grantee<>p.proowner AND (x.grantee=0 OR pg_get_userbyid(x.grantee) NOT IN (app,'mw_integration_agent'))) THEN RAISE EXCEPTION 'V125: the plan function has an unexpected grantee'; END IF;
END $acl$;

-- Self-check: owners, security and comments unchanged; ACLs unchanged except the two intended grants; the changes are in.
DO $check$
DECLARE bad text; agent boolean:=EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent');
BEGIN
 SELECT string_agg(o.routine,', ') INTO bad FROM v125_before o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR p.prosecdef<>o.definer OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM o.comment
   OR (p.oid NOT IN ('public.pwa_pay_forward_plan_v1(text,numeric,date,jsonb)'::regprocedure,'public.forecast_schedule_v1(jsonb,jsonb,date,date)'::regprocedure) AND coalesce(p.proacl::text,'')<>o.acl)
   OR (p.oid IN ('public.pwa_pay_forward_plan_v1(text,numeric,date,jsonb)'::regprocedure,'public.forecast_schedule_v1(jsonb,jsonb,date,date)'::regprocedure) AND EXISTS(
    (SELECT x.grantee,x.privilege_type FROM pg_proc q CROSS JOIN LATERAL aclexplode(q.proacl) x WHERE q.oid=p.oid AND NOT (agent AND pg_get_userbyid(x.grantee)='mw_integration_agent'))
    EXCEPT (SELECT x.grantee,x.privilege_type FROM aclexplode(nullif(o.acl,'')::aclitem[]) x)));
 IF bad IS NOT NULL OR (SELECT count(*) FROM v125_before)<>6 THEN RAISE EXCEPTION 'V125 changed the owner, privileges, security or comment of %',coalesce(bad,'an unexpected function set'); END IF;
 IF agent AND NOT (has_function_privilege('mw_integration_agent','public.pwa_pay_forward_plan_v1(text,numeric,date,jsonb)','EXECUTE')
   AND has_function_privilege('mw_integration_agent','public.forecast_schedule_v1(jsonb,jsonb,date,date)','EXECUTE')) THEN RAISE EXCEPTION 'V125: the agent reporting role must execute the plan and the forecast'; END IF;
 IF has_function_privilege('public','public.pwa_pay_forward_plan_v1(text,numeric,date,jsonb)','EXECUTE') OR has_function_privilege('public','public.pwa_submit_agent_receipt_v1(text)','EXECUTE')
  OR (agent AND (has_function_privilege('mw_integration_agent','public.pwa_submit_agent_receipt_v1(text)','EXECUTE') OR has_function_privilege('mw_integration_agent','public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)','EXECUTE'))) THEN
  RAISE EXCEPTION 'V125: the command and the booking helper must stay closed'; END IF;
 IF position($s$IN ('7'::jsonb,'8'::jsonb,'9'::jsonb)$s$ IN pg_get_functiondef('public.pwa_submit_agent_receipt_v1(text)'::regprocedure))=0
  OR position('SET CONSTRAINTS public.referral_loan_closed IMMEDIATE' IN pg_get_functiondef('public.pwa_submit_agent_receipt_v1(text)'::regprocedure))=0
  OR position($s$IN ('7','8','9')$s$ IN pg_get_functiondef('public.pwa_agent_receipt_status_v1(uuid,text,text)'::regprocedure))=0
  OR position($s$CASE WHEN c ? 'reviewId' THEN to_jsonb('Bank Transfer'::text)$s$ IN pg_get_functiondef('public.pwa_effective_payment_plan_v2(text)'::regprocedure))=0 THEN RAISE EXCEPTION 'V125: a function was not replaced'; END IF;
END $check$;
