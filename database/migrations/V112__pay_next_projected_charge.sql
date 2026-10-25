-- R101 pay the next charge early (owner decisions of 25 October 2026; plan "Pay the next charge early", Archie's design
-- corrections D1-D6). In Receive payment every open automatic daily-interest or daily-installment loan of the borrower may
-- offer its one next scheduled charge; a payment books that charge and pays it in one step. Fixed due-date loans
-- (กำหนดวันชำระ) offer none, so early payoff stays in Loan Close.
-- 1. New read function pwa_next_projected_charge_v1(borrower, day): per eligible loan the next scheduled date and amounts.
--    The forecast (forecast_schedule_v1, inputs built as reporting_forecast_inputs_v1 builds them for that day) gives only the
--    next date and the gate (any Exception or Notice row skips the loan); the amounts use generate_loan_charge's own
--    arithmetic, so a booking equals the offer. Eligible: open, not defaulted, Auto Charge Enabled, Loan Date on or before the
--    day, no recorded charge after the day (one charge ahead, and generation stays in schedule order), and for a
--    daily-interest loan no recorded charge with unpaid principal (the forecast would re-price interest the generator does not).
--    The key is the generator's, cg8:<length>:<loan>:<date>, so the schedule never duplicates a booked charge.
--    SECURITY INVOKER with a pinned search_path: the caller reads with its own privileges, as the upcoming-charge views
--    (which also call forecast_schedule_v1) are read; EXECUTE goes to mw_app_<env> only (the command role and, through its
--    membership, the journal owner's submit). mw_app_<env> also gets EXECUTE on forecast_schedule_v1 (a pure calculation
--    over the inputs it is given), which the DEV capability policy already grants; in PROD it is the only grant path.
-- 2. pwa_submit_selected_charges_v1 accepts 3 to 9 (9 = 8 plus materialize after payerLines: 1 to 100 entries
--    {loanId, chargeId, chargeDate, principalDue, interestDue}, one per loan, ordered by chargeId COLLATE "C", each paid by
--    one allocation line expecting the whole projected charge). Under the borrower -> loans -> charges locks each entry is
--    booked with generate_loan_charge only while it is still that loan's next projected charge after today with the same
--    amounts, and the inserted row must equal the entry; otherwise the outcome is selection_unavailable (P4C05) and the
--    sub-block rolls back every booked charge. A generator refusal (P0001) is selection_unavailable too; lock and deadlock
--    errors stay uncaught (command_busy). Posting, cash ledger, journal and replay are unchanged; the stored plan holds the
--    real charge id, so corrections, deletion and plan readers need no change (a deleted payment leaves the booked charge).
-- 3. pwa_effective_payment_plan_v2 treats 9 like 6 to 8 (explicit plan), so v9 never posts through the legacy engine.
-- No new table, column or role; the one widened grant is forecast_schedule_v1 EXECUTE to mw_app_<env>. CREATE OR REPLACE keeps each replaced function's owner and privileges; the self-check below
-- proves them and the new function's ACL (owner plus mw_app_<env> EXECUTE; no PUBLIC or default-privilege grantee).

DO $preflight$
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END) THEN RAISE EXCEPTION 'V112 needs the application role'; END IF;
END $preflight$;

CREATE TEMP TABLE v112_acl ON COMMIT DROP AS
 SELECT p.oid::regprocedure::text AS routine,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl::text,'') AS acl
 FROM pg_proc p WHERE p.oid IN ('public.pwa_submit_selected_charges_v1(text)'::regprocedure,'public.pwa_effective_payment_plan_v2(text)'::regprocedure);

-- 1. The next projected charge of each eligible loan of a borrower (read only).
CREATE FUNCTION public.pwa_next_projected_charge_v1(p_borrower text,p_day date)
 RETURNS TABLE(loan_id text,charge_id text,charge_date date,principal_due numeric,interest_due numeric)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE l public."Loans"%ROWTYPE; loan jsonb; charges jsonb; blocked boolean; d date; latest date; days integer; elapsed integer; remainder numeric; p numeric; i numeric;
BEGIN
 IF p_borrower IS NULL OR p_day IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Borrower and day required'; END IF;
 FOR l IN SELECT * FROM public."Loans" x WHERE x."Ref Borrowers"=p_borrower AND x."Loan Status"='ยังไม่ปิดยอด' AND NOT coalesce(x."Defaulted",false)
   AND coalesce(x."Auto Charge Enabled",false) AND x."Loan Type" IN ('ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน') AND x."Loan Date"<=p_day
   ORDER BY x."Row ID" COLLATE "C" LOOP
  -- One charge ahead: any recorded row after the day (paid or not), or an undated row, means no offer.
  IF EXISTS(SELECT 1 FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND (c."Charge Date" IS NULL OR c."Charge Date">p_day)) THEN CONTINUE; END IF;
  IF l."Loan Type"='ดอกเบี้ยรายวัน' AND EXISTS(SELECT 1 FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID"
    AND c."Principal Due"::numeric>coalesce((SELECT sum(r."Principal Paid"::numeric) FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID"),0)) THEN CONTINUE; END IF;
  -- Forecast inputs for this loan and day, as reporting_forecast_inputs_v1 builds them (V48, V53).
  SELECT jsonb_build_object('status',l."Loan Status",'defaulted',coalesce(l."Defaulted",false),'start',l."Loan Date",'close',l."Close Date",
    'balance',l."Principal Amount"::numeric-coalesce(sum(r."Principal Paid"::numeric) FILTER(WHERE r."Payment Date"<=p_day),0),'daily',l."Current Daily Interest"::numeric,'auto',l."Auto Charge Enabled",
    'interval',l."Interest Payment Interval",'anchor',l."Interest Schedule Anchor Date",'type',l."Loan Type",'due',l."Due Date",
    'arrangement',l."Loan Arrangement",'original',l."Principal Amount"::numeric,'payment',l."Daily Payment Amount"::numeric,'fixed',l."Fixed Interest"::numeric,
    'invalid',l."Loan Date" IS NULL OR l."Principal Amount" IS NULL OR NOT EXISTS(SELECT 1 FROM public."Borrowers" b WHERE b."Row ID"=l."Ref Borrowers")
     OR coalesce(bool_or(r."Payment Date" IS NULL OR r."Principal Paid" IS NULL OR r."Interest Paid" IS NULL OR r."Payment Date">p_day),false),
    'original_rate',l."Original Daily Interest Rate")
   INTO loan FROM public."Repayments" r WHERE r."Ref Loans"=l."Row ID";
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',c."Row ID",'date',c."Charge Date",'pdue',c."Principal Due"::numeric,'idue',c."Interest Due"::numeric,
    'ppaid',coalesce(paid.p,0),'ipaid',coalesce(paid.i,0),'invalid',coalesce(paid.invalid,false) OR c."Charge Date" IS NULL OR c."Principal Due" IS NULL OR c."Interest Due" IS NULL)),'[]'::jsonb)
   INTO charges FROM public."Charges" c
   LEFT JOIN LATERAL (SELECT sum(r."Principal Paid"::numeric) FILTER(WHERE r."Payment Date"<=p_day) p,sum(r."Interest Paid"::numeric) FILTER(WHERE r."Payment Date"<=p_day) i,
     bool_or(r."Payment Date" IS NULL OR r."Principal Paid" IS NULL OR r."Interest Paid" IS NULL OR r."Ref Loans" IS DISTINCT FROM c."Ref Loans") invalid
    FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID") paid ON true
   WHERE c."Ref Loans"=l."Row ID";
  -- The forecast gives the next date only; every row is read, so an Exception or Notice anywhere skips the loan.
  SELECT coalesce(bool_or(s.origin IN ('Exception','Notice')),false),min(s.due_date) FILTER(WHERE s.origin='Simulated' AND s.eligible AND s.due_date>p_day AND s.principal+s.interest>0)
   INTO blocked,d FROM public.forecast_schedule_v1(loan,charges,p_day,p_day+93) s;
  IF blocked OR d IS NULL THEN CONTINUE; END IF;
  -- The amounts are generate_loan_charge's own arithmetic for that date.
  IF l."Loan Type"='ดอกเบี้ยรายวัน' THEN
   SELECT max(c."Charge Date") INTO latest FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND c."Charge Date"<=d;
   p:=0;i:=l."Current Daily Interest"::numeric*greatest(0,d-coalesce(latest,l."Loan Date"));
  ELSE
   SELECT max(c."Charge Date") INTO latest FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID";
   IF latest IS NULL OR l."Due Date" IS NULL THEN CONTINUE; END IF;
   days:=l."Due Date"-l."Loan Date"+1;elapsed:=d-latest;
   IF days<=0 OR elapsed<=0 THEN CONTINUE; END IF;
   remainder:=mod(l."Principal Amount"::numeric,days);
   p:=floor(l."Principal Amount"::numeric/days)*elapsed+
     greatest(0,least(d-l."Loan Date"+1,remainder)-(latest-l."Loan Date"+1));
   i:=l."Daily Payment Amount"::numeric*elapsed-p;
  END IF;
  IF p IS NULL OR i IS NULL OR p<0 OR i<0 OR p+i<=0 OR p<>trunc(p) OR i<>trunc(i) THEN CONTINUE; END IF;
  loan_id:=l."Row ID";charge_date:=d;charge_id:='cg8:'||length(l."Row ID")||':'||l."Row ID"||':'||to_char(d,'YYYY-MM-DD');principal_due:=trunc(p);interest_due:=trunc(i);
  RETURN NEXT;
 END LOOP;
END $$;

COMMENT ON FUNCTION public.pwa_next_projected_charge_v1(text,date) IS 'R101: per eligible loan of the borrower, the next scheduled charge after the day (generator key and amounts), offered in Receive payment and booked by pwa_submit_selected_charges_v1 schemaVersion 9. Read only.';
REVOKE ALL ON FUNCTION public.pwa_next_projected_charge_v1(text,date) FROM PUBLIC;
-- A default privilege (PROD's mw_integration_agent EXECUTE ON ROUTINES) must not reach it either.
DO $acl$
DECLARE grantee text;
BEGIN
 FOR grantee IN SELECT DISTINCT pg_get_userbyid(a.grantee) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE p.oid='public.pwa_next_projected_charge_v1(text,date)'::regprocedure AND a.grantee<>0 AND a.grantee<>p.proowner LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.pwa_next_projected_charge_v1(text,date) FROM %I',grantee);
 END LOOP;
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_next_projected_charge_v1(text,date),public.forecast_schedule_v1(jsonb,jsonb,date,date) TO %I',CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END);
END $acl$;

-- 2. The manual receiving command (whole body; changes marked R101).
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
 -- R101 v9 materialize: the next projected charges this payment books before it is posted.
 entry jsonb;materialize_text text:='';loan_ids text[];materialize_ids text[];projected jsonb;booked text;
 -- JavaScript whitespace, used only for canonical transport validation, not ID normalization.
 ws text:=chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR NOT pg_has_role(session_user,CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END,'MEMBER') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Application session required';END IF;
 IF $1 IS NULL OR octet_length($1)>524288 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid canonical command'; END IF;
 BEGIN
  e:=$1::jsonb;c:=e->'command';a:=e->'actor';r:=e->'receipt';
  IF jsonb_typeof(e)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(e) key)<>ARRAY['actor','command','contractVersion','receipt'] OR e->'contractVersion'<>'1'::jsonb
    OR jsonb_typeof(c)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c) key)<>(CASE WHEN c->'schemaVersion'='6'::jsonb THEN ARRAY['allocations','amountReceived','borrowerId','cashAccountId','notes','paymentDate','paymentMethod','receiptId','requestId','schemaVersion'] WHEN c->'schemaVersion'='7'::jsonb THEN ARRAY['allocations','amountReceived','bankReference','borrowerId','cashAccountId','notes','paymentDate','paymentMethod','receiptId','requestId','schemaVersion','transferTime'] WHEN c->'schemaVersion'='8'::jsonb THEN ARRAY['allocations','amountReceived','bankReference','borrowerId','cashAccountId','notes','payerLines','paymentDate','paymentMethod','receiptId','requestId','schemaVersion','transferTime'] WHEN c->'schemaVersion'='9'::jsonb THEN ARRAY['allocations','amountReceived','bankReference','borrowerId','cashAccountId','materialize','notes','payerLines','paymentDate','paymentMethod','receiptId','requestId','schemaVersion','transferTime'] ELSE ARRAY['allocationMethod','amountReceived','borrowerId','cashAccountId','notes','paymentDate','paymentMethod','receiptId','requestId','schemaVersion','selectedChargeIds'] END)
    OR c->'schemaVersion' NOT IN ('3'::jsonb,'4'::jsonb,'5'::jsonb,'6'::jsonb,'7'::jsonb,'8'::jsonb,'9'::jsonb) OR jsonb_typeof(a)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(a) key)<>ARRAY['issuer','loginEmail','partnerId','subject'] THEN RAISE EXCEPTION 'shape'; END IF;
  FOREACH k IN ARRAY ARRAY['requestId','borrowerId','cashAccountId','paymentDate','amountReceived','paymentMethod'] LOOP
   IF jsonb_typeof(c->k)<>'string' THEN RAISE EXCEPTION 'type'; END IF;
  END LOOP;
  IF c->>'requestId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'uuid'; END IF;
  request:=(c->>'requestId')::uuid;
  FOREACH k IN ARRAY ARRAY['borrowerId','cashAccountId'] LOOP
   v:=c->>k;IF octet_length(v) NOT BETWEEN 1 AND 256 OR v<>btrim(v,ws) OR v~E'[\\r\\n]' THEN RAISE EXCEPTION 'id';END IF;
  END LOOP;
  IF c->'schemaVersion' IN ('6'::jsonb,'7'::jsonb,'8'::jsonb,'9'::jsonb) THEN
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
   -- R101 v9: v8 plus materialize, the next projected charges (one per loan) that allocation lines pay.
   IF c->'schemaVersion' IN ('7'::jsonb,'8'::jsonb,'9'::jsonb) THEN
    IF c->'bankReference'<>'null'::jsonb AND (jsonb_typeof(c->'bankReference')<>'string' OR c->>'bankReference' !~ '^[A-Z0-9]{6,100}$') THEN RAISE EXCEPTION 'reference';END IF;
    IF c->'transferTime'<>'null'::jsonb AND (jsonb_typeof(c->'transferTime')<>'string' OR c->>'transferTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN RAISE EXCEPTION 'transfer time';END IF;
    IF c->>'paymentMethod'<>'Bank Transfer' AND (c->'bankReference'<>'null'::jsonb OR c->'transferTime'<>'null'::jsonb) THEN RAISE EXCEPTION 'slip method';END IF;
    slip_text:=',"bankReference":'||CASE WHEN c->'bankReference'='null'::jsonb THEN 'null' ELSE to_json(c->>'bankReference')::text END||',"transferTime":'||CASE WHEN c->'transferTime'='null'::jsonb THEN 'null' ELSE to_json(c->>'transferTime')::text END;
    IF c->'schemaVersion' IN ('8'::jsonb,'9'::jsonb) THEN
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
    -- R101 v9: each entry {loanId, chargeId, chargeDate, principalDue, interestDue} names the generator key of the loan's next
    -- charge (cg8:<len>:<loan>:<date>) and is paid by exactly one allocation line expecting the whole projected charge.
    IF c->'schemaVersion'='9'::jsonb THEN
     IF jsonb_typeof(c->'materialize') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'materialize') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'materialize';END IF;
     loan_ids:=ARRAY[]::text[];materialize_ids:=ARRAY[]::text[];
     FOR entry IN SELECT value FROM jsonb_array_elements(c->'materialize') LOOP
      IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(entry) key) IS DISTINCT FROM ARRAY['chargeDate','chargeId','interestDue','loanId','principalDue'] THEN RAISE EXCEPTION 'materialize entry';END IF;
      FOREACH k IN ARRAY ARRAY['loanId','chargeId','chargeDate','principalDue','interestDue'] LOOP
       IF jsonb_typeof(entry->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'materialize type';END IF;
      END LOOP;
      v:=entry->>'loanId';IF octet_length(v) NOT BETWEEN 1 AND 256 OR v<>btrim(v,ws) OR v~E'[\\r\\n]' THEN RAISE EXCEPTION 'materialize loan';END IF;
      v:=entry->>'chargeDate';IF v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR v<'0001-01-01' OR to_char(v::date,'YYYY-MM-DD')<>v THEN RAISE EXCEPTION 'materialize day';END IF;
      IF entry->>'chargeId' IS DISTINCT FROM 'cg8:'||length(entry->>'loanId')||':'||(entry->>'loanId')||':'||(entry->>'chargeDate') THEN RAISE EXCEPTION 'materialize key';END IF;
      FOREACH k IN ARRAY ARRAY['principalDue','interestDue'] LOOP
       IF entry->>k !~ '^(0|[1-9][0-9]{0,16})$' OR (entry->>k)::numeric>92233720368547758 THEN RAISE EXCEPTION 'materialize component';END IF;
      END LOOP;
      IF (entry->>'principalDue')::numeric+(entry->>'interestDue')::numeric<=0 THEN RAISE EXCEPTION 'materialize amount';END IF;
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c->'allocations') lines(item) WHERE item->>'chargeId'=entry->>'chargeId' AND item->>'chargeDate'=entry->>'chargeDate'
        AND item->>'expectedPrincipalRemaining'=entry->>'principalDue' AND item->>'expectedInterestRemaining'=entry->>'interestDue') THEN RAISE EXCEPTION 'materialize line';END IF;
      loan_ids:=array_append(loan_ids,entry->>'loanId');materialize_ids:=array_append(materialize_ids,entry->>'chargeId');
      materialize_text:=materialize_text||CASE WHEN materialize_text='' THEN '' ELSE ',' END||'{"loanId":'||to_json(entry->>'loanId')::text||',"chargeId":'||to_json(entry->>'chargeId')::text
       ||',"chargeDate":'||to_json(entry->>'chargeDate')::text||',"principalDue":'||to_json(entry->>'principalDue')::text||',"interestDue":'||to_json(entry->>'interestDue')::text||'}';
     END LOOP;
     SELECT array_agg(x ORDER BY x COLLATE "C") INTO sorted_ids FROM (SELECT DISTINCT unnest(materialize_ids) x) q;
     IF materialize_ids IS DISTINCT FROM sorted_ids OR (SELECT count(DISTINCT x) FROM unnest(loan_ids) x)<>cardinality(loan_ids) THEN RAISE EXCEPTION 'materialize order';END IF;
     slip_text:=slip_text||',"materialize":['||materialize_text||']';
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
  IF c->'schemaVersion' IN ('6'::jsonb,'7'::jsonb,'8'::jsonb,'9'::jsonb) THEN
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
  -- v7 to v9 follow the slip date: today or yesterday in Bangkok, as the agent receipt command; v3-v6 stay today-only.
  IF day<>(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AND NOT (c->'schemaVersion' IN ('7'::jsonb,'8'::jsonb,'9'::jsonb) AND day=(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date-1) THEN RAISE EXCEPTION USING ERRCODE='P4C01';END IF;
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
  IF c->'schemaVersion' IN ('6'::jsonb,'7'::jsonb,'8'::jsonb,'9'::jsonb) THEN
   PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers"=c->>'borrowerId' ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
   PERFORM 1 FROM public."Charges" ch JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans" WHERE l."Ref Borrowers"=c->>'borrowerId' ORDER BY ch."Row ID" COLLATE "C" FOR UPDATE OF ch;
   -- R101 v9: under these locks, book each entry only while it is still that loan's next projected charge with the reviewed
   -- amounts, through the generator (same key, so the schedule never duplicates it). Drift or a refused generation rejects the
   -- command as selection_unavailable and this sub-block rolls every booked charge back.
   IF c->'schemaVersion'='9'::jsonb THEN
    SELECT jsonb_object_agg(p.loan_id,jsonb_build_object('chargeId',p.charge_id,'chargeDate',to_char(p.charge_date,'YYYY-MM-DD'),'principalDue',p.principal_due,'interestDue',p.interest_due)) INTO projected
     FROM public.pwa_next_projected_charge_v1(c->>'borrowerId',(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date) p;
    FOR entry IN SELECT value FROM jsonb_array_elements(c->'materialize') LOOP
     IF (entry->>'chargeDate')::date<=(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date OR projected->(entry->>'loanId') IS NULL OR projected->(entry->>'loanId')->>'chargeId' IS DISTINCT FROM entry->>'chargeId' OR projected->(entry->>'loanId')->>'chargeDate' IS DISTINCT FROM entry->>'chargeDate'
      OR (projected->(entry->>'loanId')->>'principalDue')::numeric IS DISTINCT FROM (entry->>'principalDue')::numeric OR (projected->(entry->>'loanId')->>'interestDue')::numeric IS DISTINCT FROM (entry->>'interestDue')::numeric THEN
      RAISE EXCEPTION USING ERRCODE='P4C05';
     END IF;
     BEGIN
      booked:=public.generate_loan_charge(entry->>'loanId',(entry->>'chargeDate')::date);
     EXCEPTION WHEN SQLSTATE 'P0001' THEN RAISE EXCEPTION USING ERRCODE='P4C05';
     END;
     IF booked IS DISTINCT FROM entry->>'chargeId' OR NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Row ID"=booked AND "Ref Loans"=entry->>'loanId' AND "Charge Date"=(entry->>'chargeDate')::date
       AND "Principal Due"::numeric=(entry->>'principalDue')::numeric AND "Interest Due"::numeric=(entry->>'interestDue')::numeric) THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
    END LOOP;
   END IF;
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
   VALUES(payment_key,c->>'borrowerId',c->>'cashAccountId','Processing',(c->>'amountReceived')::numeric::money,day,c->>'paymentMethod',CASE WHEN c->'schemaVersion' IN ('6'::jsonb,'7'::jsonb,'8'::jsonb,'9'::jsonb) THEN 'Selected Charges' ELSE c->>'allocationMethod' END,CASE WHEN c->'schemaVersion' IN ('6'::jsonb,'7'::jsonb,'8'::jsonb,'9'::jsonb) OR c->>'allocationMethod'='Selected Charges' THEN array_to_string(ids,' , ') END,CASE WHEN c->>'allocationMethod'='Single Full' THEN ids[1] END,a->>'loginEmail',c->>'notes',r->>'storageReference',
    CASE WHEN c->'schemaVersion' IN ('7'::jsonb,'8'::jsonb,'9'::jsonb) THEN c->>'bankReference' END,
    -- Slip date and transfer time become Created At, as the agent receipt command writes it.
    CASE WHEN c->'schemaVersion' IN ('7'::jsonb,'8'::jsonb,'9'::jsonb) AND c->>'transferTime' IS NOT NULL THEN ((c->>'paymentDate')||' '||(c->>'transferTime')||':00')::timestamp END);
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
 IF c->'schemaVersion' NOT IN ('6'::jsonb,'7'::jsonb,'8'::jsonb,'9'::jsonb) OR outcome_value='rejected' THEN
 INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code)
 VALUES(request,1,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',canonical,hash,outcome_value,CASE WHEN outcome_value='posted' THEN payment_key ELSE NULL END,rejection);
 END IF;
 RETURN public.pwa_command_status_v1(request,a->>'issuer',a->>'subject');
END $_$;

REVOKE ALL ON FUNCTION public.pwa_submit_selected_charges_v1(text) FROM PUBLIC;

-- 3. v9 manual commands carry the explicit plan exactly like v6 to v8.
DO $$DECLARE definition text;old text:=$old$j.canonical_json::jsonb#>>'{command,schemaVersion}' IN ('6','7','8') AND jsonb_typeof($old$;
 new text:=$new$j.canonical_json::jsonb#>>'{command,schemaVersion}' IN ('6','7','8','9') AND jsonb_typeof($new$;
BEGIN
 SELECT pg_get_functiondef('public.pwa_effective_payment_plan_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>2 THEN RAISE EXCEPTION 'Unexpected explicit provenance filter';END IF;
 EXECUTE replace(definition,old,new);
END $$;

-- Self-check: owners and privileges of the replaced functions unchanged, the new function's ACL exact, v9 in the bodies.
DO $check$
DECLARE bad text;app text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END;
BEGIN
 SELECT string_agg(o.routine,', ') INTO bad FROM v112_acl o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR coalesce(p.proacl::text,'')<>o.acl;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V112 changed the owner or privileges of %',bad; END IF;
 IF has_function_privilege('public','public.pwa_submit_selected_charges_v1(text)','EXECUTE') THEN RAISE EXCEPTION 'V112: PUBLIC must not execute the command function'; END IF;
 IF (SELECT array_agg(DISTINCT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END||':'||a.privilege_type)
   FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.pwa_next_projected_charge_v1(text,date)'::regprocedure AND a.grantee<>p.proowner)
   IS DISTINCT FROM ARRAY[app||':EXECUTE'] THEN RAISE EXCEPTION 'V112: unexpected access to pwa_next_projected_charge_v1'; END IF;
 IF NOT has_function_privilege(app,'public.forecast_schedule_v1(jsonb,jsonb,date,date)','EXECUTE') THEN RAISE EXCEPTION 'V112: the application role must execute forecast_schedule_v1'; END IF;
 IF (SELECT prosecdef FROM pg_proc WHERE oid='public.pwa_next_projected_charge_v1(text,date)'::regprocedure) THEN RAISE EXCEPTION 'V112: the read function runs with the caller''s rights'; END IF;
 IF position('materialize' IN pg_get_functiondef('public.pwa_submit_selected_charges_v1(text)'::regprocedure))=0
  OR position($s$IN ('6','7','8','9')$s$ IN pg_get_functiondef('public.pwa_effective_payment_plan_v2(text)'::regprocedure))=0 THEN RAISE EXCEPTION 'V112: a function was not replaced'; END IF;
END $check$;
