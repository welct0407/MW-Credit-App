-- R095 payer names (owner request of 24 October 2026; Archie's design in the R095 change note, "Payer name matching",
-- Revision 2). Edited in place before any environment applied it (flyway head 110 on loan_manager_dev and loan_manager_prod,
-- checked read-only on 24 October 2026). public."Borrowers"."Communication Name" becomes the borrower's payer names: one
-- per line, line 1 the borrower, later lines people who pay for them (at most 5), `?` one unknown letter.
-- 1. Every existing value is cleared (its old purpose is dropped). The V97 row-change trigger records each cleared row.
-- 2. pwa_submit_agent_receipt_v1 accepts schemaVersion 7 and 8 (8 = 7 plus payerLines after bankReference: null or
--    {before, after}); pwa_agent_receipt_status_v1 reads both. 7 is dropped in a later release.
-- 3. pwa_submit_selected_charges_v1 accepts 3 to 8 (8 = 7 plus payerLines after transferTime, Bank Transfer only); 3 to 7
--    stay accepted for queued offline commands. pwa_effective_payment_plan_v2 treats 8 like 6 and 7 (explicit plan).
-- The callers compare names (payer_name parity modules); the database only applies the change. In the sub-block of the
-- Payments insert (the borrower row is already locked FOR UPDATE) both submit functions run
--   UPDATE "Borrowers" SET "Communication Name"=after WHERE "Row ID"=borrower
--    AND coalesce("Communication Name",'') IS NOT DISTINCT FROM coalesce(before,'')
-- so drift since the caller read the column skips the learning (the payment still posts), a rejected outcome rolls it
-- back, a replay of the same requestId returns the recorded status without a second write, and another payerLines under
-- the same requestId is a conflict (the canonical text differs). The names are not a financial fact: readback and the
-- status match ignore them.
-- No new table, column, role or grant; only the column comment changes. CREATE OR REPLACE keeps each function's owner
-- and privileges (V79-V96, V89); PUBLIC EXECUTE is revoked again and the self-check below proves owners and access.

DO $preflight$
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
END $preflight$;

CREATE TEMP TABLE v111_acl ON COMMIT DROP AS
 SELECT p.oid::regprocedure::text AS routine,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl::text,'') AS acl
 FROM pg_proc p WHERE p.oid IN ('public.pwa_submit_agent_receipt_v1(text)'::regprocedure,'public.pwa_agent_receipt_status_v1(uuid,text,text)'::regprocedure,
  'public.pwa_submit_selected_charges_v1(text)'::regprocedure,'public.pwa_effective_payment_plan_v2(text)'::regprocedure);

-- 1. The old values go; the column states its new meaning (read by the chat schema digest and the data dictionary).
UPDATE public."Borrowers" SET "Communication Name"=NULL WHERE "Communication Name" IS NOT NULL;
COMMENT ON COLUMN public."Borrowers"."Communication Name" IS 'Payer names on slips, one per line (max 5): line 1 the borrower, later lines people who pay for them; ? is one unknown letter. Learned from posted slips; editable.';

-- 2. The agent receipt command (whole body; changes marked R095).
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
BEGIN
 environment:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR session_user<>('mw-credit-app-command-'||environment||'@clever-oasis-508610-n7.iam') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Command session required'; END IF;
 IF $1 IS NULL OR octet_length($1)>16384 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid agent receipt command'; END IF;
 BEGIN
  e:=$1::jsonb;c:=e->'command';a:=e->'actor';x:=c->'archiveEvidence';
  -- R095: schemaVersion 8 = 7 plus payerLines after bankReference (an object or null); 7 stays accepted.
  IF c->'schemaVersion'='8'::jsonb THEN command_keys:=ARRAY['schemaVersion','requestId','environment','reviewId','mode','borrowerId','cashAccountId','amountReceived','paymentDate','transferTime','bankReference','payerLines','proposalSha256','archiveEvidence']; END IF;
  IF jsonb_typeof(e)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(e) key)<>ARRAY['actor','command','contractVersion','receipt'] OR e->'contractVersion'<>'1'::jsonb OR e->'receipt'<>'null'::jsonb
   OR jsonb_typeof(c)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c) key)<>(SELECT array_agg(key ORDER BY key) FROM unnest(command_keys) key)
   OR jsonb_typeof(a)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(a) key)<>(SELECT array_agg(key ORDER BY key) FROM unnest(actor_keys) key)
   OR jsonb_typeof(x)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(x) key)<>(SELECT array_agg(key ORDER BY key) FROM unnest(evidence_keys) key)
   OR c->'schemaVersion' NOT IN ('7'::jsonb,'8'::jsonb) OR (c->>'environment')<>environment OR (c->>'mode') NOT IN ('automatic','reviewed') THEN RAISE EXCEPTION 'shape'; END IF;
  FOREACH k IN ARRAY text_keys LOOP
   IF jsonb_typeof(c->k)<>'string' THEN RAISE EXCEPTION 'type'; END IF;
   v:=(c->>k);IF octet_length(v) NOT BETWEEN 1 AND 256 OR btrim(v)='' OR v~E'[\\r\\n]' OR (k<>'bankReference' AND v<>btrim(v)) THEN RAISE EXCEPTION 'text'; END IF;
  END LOOP;
  IF c->'schemaVersion'='8'::jsonb AND c->'payerLines'<>'null'::jsonb THEN
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
  -- R095: learn the payer lines (row locked above) only while the column still equals what the agent read; drift skips it
  -- (the payment still posts). A rejected outcome rolls this sub-block back; a replay returns before reaching it.
  IF payer_after IS NOT NULL THEN
   UPDATE public."Borrowers" SET "Communication Name"=payer_after WHERE "Row ID"=(c->>'borrowerId') AND coalesce("Communication Name",'') IS NOT DISTINCT FROM coalesce(payer_before,'');
  END IF;
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
END $_$;

REVOKE ALL ON FUNCTION public.pwa_submit_agent_receipt_v1(text) FROM PUBLIC;

-- The status reads both agent versions.
DO $$DECLARE definition text;old text:=$old$p.canonical_json::jsonb#>>'{command,schemaVersion}'='7';$old$;
 new text:=$new$p.canonical_json::jsonb#>>'{command,schemaVersion}' IN ('7','8');$new$;
BEGIN
 SELECT pg_get_functiondef('public.pwa_agent_receipt_status_v1(uuid,text,text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'Unexpected agent receipt status filter';END IF;
 EXECUTE replace(definition,old,new);
END $$;

-- 3. The manual receiving command (whole body; changes marked R095).
CREATE OR REPLACE FUNCTION public.pwa_submit_selected_charges_v1(canonical_json text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE
 line jsonb;plan_text text;line_text text;plan_total numeric;balance record;
 e jsonb;c jsonb;a jsonb;r jsonb;v text;k text;canonical text;command_text text;actor_text text;receipt_text text;
 ids text[];sorted_ids text[];current_ids text[];current_amount numeric;selection_text text;notes_text text;receipt_id text;request uuid;hash text;day date;
 prior public.pwa_payment_commands%ROWTYPE;matches integer;outcome_value text:='posted';rejection text:=NULL;payment_key text;posted_status text;posted_amount numeric;slip_text text:='';
 payer_before text;payer_after text;
 -- JavaScript whitespace, used only for canonical transport validation, not ID normalization.
 ws text:=chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR NOT pg_has_role(session_user,CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END,'MEMBER') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Application session required';END IF;
 IF $1 IS NULL OR octet_length($1)>524288 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid canonical command'; END IF;
 BEGIN
  e:=$1::jsonb;c:=e->'command';a:=e->'actor';r:=e->'receipt';
  IF jsonb_typeof(e)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(e) key)<>ARRAY['actor','command','contractVersion','receipt'] OR e->'contractVersion'<>'1'::jsonb
    OR jsonb_typeof(c)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c) key)<>(CASE WHEN c->'schemaVersion'='6'::jsonb THEN ARRAY['allocations','amountReceived','borrowerId','cashAccountId','notes','paymentDate','paymentMethod','receiptId','requestId','schemaVersion'] WHEN c->'schemaVersion'='7'::jsonb THEN ARRAY['allocations','amountReceived','bankReference','borrowerId','cashAccountId','notes','paymentDate','paymentMethod','receiptId','requestId','schemaVersion','transferTime'] WHEN c->'schemaVersion'='8'::jsonb THEN ARRAY['allocations','amountReceived','bankReference','borrowerId','cashAccountId','notes','payerLines','paymentDate','paymentMethod','receiptId','requestId','schemaVersion','transferTime'] ELSE ARRAY['allocationMethod','amountReceived','borrowerId','cashAccountId','notes','paymentDate','paymentMethod','receiptId','requestId','schemaVersion','selectedChargeIds'] END)
    OR c->'schemaVersion' NOT IN ('3'::jsonb,'4'::jsonb,'5'::jsonb,'6'::jsonb,'7'::jsonb,'8'::jsonb) OR jsonb_typeof(a)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(a) key)<>ARRAY['issuer','loginEmail','partnerId','subject'] THEN RAISE EXCEPTION 'shape'; END IF;
  FOREACH k IN ARRAY ARRAY['requestId','borrowerId','cashAccountId','paymentDate','amountReceived','paymentMethod'] LOOP
   IF jsonb_typeof(c->k)<>'string' THEN RAISE EXCEPTION 'type'; END IF;
  END LOOP;
  IF c->>'requestId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'uuid'; END IF;
  request:=(c->>'requestId')::uuid;
  FOREACH k IN ARRAY ARRAY['borrowerId','cashAccountId'] LOOP
   v:=c->>k;IF octet_length(v) NOT BETWEEN 1 AND 256 OR v<>btrim(v,ws) OR v~E'[\\r\\n]' THEN RAISE EXCEPTION 'id';END IF;
  END LOOP;
  IF c->'schemaVersion' IN ('6'::jsonb,'7'::jsonb,'8'::jsonb) THEN
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
   -- R075 v7: optional slip bank reference (normalized) and transfer time (HH:MM), bank transfers only.
   -- R095 v8: v7 plus the optional payer-lines change {before, after}, bank transfers only.
   IF c->'schemaVersion' IN ('7'::jsonb,'8'::jsonb) THEN
    IF c->'bankReference'<>'null'::jsonb AND (jsonb_typeof(c->'bankReference')<>'string' OR c->>'bankReference' !~ '^[A-Z0-9]{6,100}$') THEN RAISE EXCEPTION 'reference';END IF;
    IF c->'transferTime'<>'null'::jsonb AND (jsonb_typeof(c->'transferTime')<>'string' OR c->>'transferTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN RAISE EXCEPTION 'transfer time';END IF;
    IF c->>'paymentMethod'<>'Bank Transfer' AND (c->'bankReference'<>'null'::jsonb OR c->'transferTime'<>'null'::jsonb) THEN RAISE EXCEPTION 'slip method';END IF;
    slip_text:=',"bankReference":'||CASE WHEN c->'bankReference'='null'::jsonb THEN 'null' ELSE to_json(c->>'bankReference')::text END||',"transferTime":'||CASE WHEN c->'transferTime'='null'::jsonb THEN 'null' ELSE to_json(c->>'transferTime')::text END;
    IF c->'schemaVersion'='8'::jsonb THEN
     IF c->'payerLines'<>'null'::jsonb THEN
      IF c->>'paymentMethod'<>'Bank Transfer' THEN RAISE EXCEPTION 'payer method';END IF;
      IF jsonb_typeof(c->'payerLines')<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c->'payerLines') key)<>ARRAY['after','before']
       OR jsonb_typeof(c->'payerLines'->'after')<>'string' OR jsonb_typeof(c->'payerLines'->'before') NOT IN ('string','null') THEN RAISE EXCEPTION 'payer lines';END IF;
      payer_before:=c->'payerLines'->>'before';payer_after:=c->'payerLines'->>'after';
      IF octet_length(payer_after) NOT BETWEEN 1 AND 1000 OR payer_after=coalesce(payer_before,'') OR octet_length(coalesce(payer_before,''))>65536 OR NOT payer_after IS NFC NORMALIZED
       OR cardinality(string_to_array(payer_after,E'\n')) NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'payer lines';END IF;
      -- Each line is in payer_name.display form: no control, zero-width or non-space whitespace, single spaces, trimmed, 1..200 bytes.
      IF EXISTS(SELECT 1 FROM unnest(string_to_array(payer_after,E'\n')) payer_line WHERE octet_length(payer_line) NOT BETWEEN 1 AND 200 OR payer_line<>btrim(payer_line,' ')
       OR position('  ' IN payer_line)>0 OR payer_line~'[\x01-\x1f\x7f-\x9f\u00a0\u1680\u2000-\u200d\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]') THEN RAISE EXCEPTION 'payer lines';END IF;
     END IF;
     slip_text:=slip_text||',"payerLines":'||CASE WHEN payer_after IS NULL THEN 'null' ELSE '{"before":'||coalesce(to_json(payer_before)::text,'null')||',"after":'||to_json(payer_after)::text||'}' END;
    END IF;
   END IF;
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
  IF c->'schemaVersion' IN ('6'::jsonb,'7'::jsonb,'8'::jsonb) THEN
   command_text:='{"schemaVersion":'||(c->>'schemaVersion')||',"requestId":'||to_json(c->>'requestId')::text||',"borrowerId":'||to_json(c->>'borrowerId')::text||',"allocations":['||plan_text||'],"cashAccountId":'||to_json(c->>'cashAccountId')::text||',"paymentDate":'||to_json(c->>'paymentDate')::text||',"amountReceived":'||to_json(c->>'amountReceived')::text||',"paymentMethod":'||to_json(c->>'paymentMethod')::text||',"notes":'||notes_text||',"receiptId":'||receipt_id||slip_text||'}';
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
  -- v7 follows the slip date: today or yesterday in Bangkok, as the agent receipt command; v3-v6 stay today-only.
  IF day<>(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AND NOT (c->'schemaVersion' IN ('7'::jsonb,'8'::jsonb) AND day=(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date-1) THEN RAISE EXCEPTION USING ERRCODE='P4C01';END IF;
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
  IF c->'schemaVersion' IN ('6'::jsonb,'7'::jsonb,'8'::jsonb) THEN
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
  INSERT INTO public."Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Payment Method","Allocation Method","Selected Charge IDs","Ref Target Charge","Created By","Notes","Uploaded Receipt","Bank Reference","Created At")
   VALUES(payment_key,c->>'borrowerId',c->>'cashAccountId','Processing',(c->>'amountReceived')::numeric::money,day,c->>'paymentMethod',CASE WHEN c->'schemaVersion' IN ('6'::jsonb,'7'::jsonb,'8'::jsonb) THEN 'Selected Charges' ELSE c->>'allocationMethod' END,CASE WHEN c->'schemaVersion' IN ('6'::jsonb,'7'::jsonb,'8'::jsonb) OR c->>'allocationMethod'='Selected Charges' THEN array_to_string(ids,' , ') END,CASE WHEN c->>'allocationMethod'='Single Full' THEN ids[1] END,a->>'loginEmail',c->>'notes',r->>'storageReference',
    CASE WHEN c->'schemaVersion' IN ('7'::jsonb,'8'::jsonb) THEN c->>'bankReference' END,
    -- Slip date and transfer time become Created At, as the agent receipt command writes it.
    CASE WHEN c->'schemaVersion' IN ('7'::jsonb,'8'::jsonb) AND c->>'transferTime' IS NOT NULL THEN ((c->>'paymentDate')||' '||(c->>'transferTime')||':00')::timestamp END);
  SELECT "Status","Amount Received"::numeric INTO posted_status,posted_amount FROM public."Payments" WHERE "Row ID"=payment_key;
  IF posted_status IS DISTINCT FROM 'Posted' OR posted_amount IS DISTINCT FROM (c->>'amountReceived')::numeric THEN RAISE EXCEPTION USING ERRCODE='XX000',MESSAGE='Unexpected posting result';END IF;
  -- R095 v8: learn the payer lines (row locked above) only while the column still equals what the form read; drift skips it.
  IF payer_after IS NOT NULL THEN
   UPDATE public."Borrowers" SET "Communication Name"=payer_after WHERE "Row ID"=c->>'borrowerId' AND coalesce("Communication Name",'') IS NOT DISTINCT FROM coalesce(payer_before,'');
  END IF;
 EXCEPTION
  WHEN SQLSTATE 'P4C01' THEN outcome_value:='rejected';rejection:='invalid_date';
  WHEN SQLSTATE 'P4C02' THEN outcome_value:='rejected';rejection:='borrower_unavailable';
  WHEN SQLSTATE 'P4C03' THEN outcome_value:='rejected';rejection:='account_unavailable';
  WHEN SQLSTATE 'P4C05' THEN outcome_value:='rejected';rejection:='selection_unavailable';
  WHEN SQLSTATE 'P4C04' THEN outcome_value:='rejected';rejection:='selection_unavailable';
 END;
 IF c->'schemaVersion' NOT IN ('6'::jsonb,'7'::jsonb,'8'::jsonb) OR outcome_value='rejected' THEN
 INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code)
 VALUES(request,1,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',canonical,hash,outcome_value,CASE WHEN outcome_value='posted' THEN payment_key ELSE NULL END,rejection);
 END IF;
 RETURN public.pwa_command_status_v1(request,a->>'issuer',a->>'subject');
END $_$;

REVOKE ALL ON FUNCTION public.pwa_submit_selected_charges_v1(text) FROM PUBLIC;

-- v8 manual commands carry the explicit plan exactly like v6 and v7.
DO $$DECLARE definition text;old text:=$old$j.canonical_json::jsonb#>>'{command,schemaVersion}' IN ('6','7') AND jsonb_typeof($old$;
 new text:=$new$j.canonical_json::jsonb#>>'{command,schemaVersion}' IN ('6','7','8') AND jsonb_typeof($new$;
BEGIN
 SELECT pg_get_functiondef('public.pwa_effective_payment_plan_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>2 THEN RAISE EXCEPTION 'Unexpected explicit provenance filter';END IF;
 EXECUTE replace(definition,old,new);
END $$;

-- Self-check: no stored payer name, owners and privileges unchanged, no PUBLIC EXECUTE, both versions in the bodies.
DO $check$
DECLARE bad text;
BEGIN
 IF EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Communication Name" IS NOT NULL) THEN RAISE EXCEPTION 'V111: an old value survived the clean-up'; END IF;
 SELECT string_agg(o.routine,', ') INTO bad FROM v111_acl o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR coalesce(p.proacl::text,'')<>o.acl;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V111 changed the owner or privileges of %',bad; END IF;
 IF has_function_privilege('public','public.pwa_submit_agent_receipt_v1(text)','EXECUTE') OR has_function_privilege('public','public.pwa_submit_selected_charges_v1(text)','EXECUTE')
  OR has_function_privilege('public','public.pwa_agent_receipt_status_v1(uuid,text,text)','EXECUTE') THEN RAISE EXCEPTION 'V111: PUBLIC must not execute the command functions'; END IF;
 IF position('payerLines' IN pg_get_functiondef('public.pwa_submit_agent_receipt_v1(text)'::regprocedure))=0
  OR position('payerLines' IN pg_get_functiondef('public.pwa_submit_selected_charges_v1(text)'::regprocedure))=0
  OR position($s$IN ('7','8')$s$ IN pg_get_functiondef('public.pwa_agent_receipt_status_v1(uuid,text,text)'::regprocedure))=0
  OR position($s$IN ('6','7','8')$s$ IN pg_get_functiondef('public.pwa_effective_payment_plan_v2(text)'::regprocedure))=0 THEN RAISE EXCEPTION 'V111: a function was not replaced'; END IF;
END $check$;
