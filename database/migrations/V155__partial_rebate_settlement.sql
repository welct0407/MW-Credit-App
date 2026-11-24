-- R184 partial rebate settlement and offset to the referrer's loan (owner request and authorization of 24 November 2026: the
-- new table pwa_rebate_settlement_allocations, the new column pwa_rebate_settlements.offset_payment_id, the two constraint
-- changes and the allocation backfill; Archie's design, decisions D1 to D14). V154 is applied and stays.
-- A settlement now pays an amount toward each rebate it names (not always the whole pending amount), and it either pays the
-- referrer (one cash movement out of Lisa, as before) or is offset to the referrer's own loan with the Loan Close offset
-- machinery (due charges first, then future charges to the 93-day horizon).
-- Objects:
--  1. Table pwa_rebate_settlement_allocations (owner postgres): one row per settlement and rebate, the whole-baht amount
--     applied. Insert and delete only, by the journal owner's command.
--  2. Column pwa_rebate_settlements.offset_payment_id (nullable, unique, FK to "Payments"): null = paid to the referrer; set =
--     the Referral Rebate Offset payment rs155:<settlement id> on the referrer. The method CHECK (same name) admits
--     'Referral Rebate Offset' exactly when the column is set.
--  3. Backfill (D3): one allocation per already-linked expense (amount = Amount less its close-time offset). Settlement rows,
--     expenses and the Cash Ledger are untouched.
--  4. Derived state, replaced in place (D2): pwa_rebate_pending_v1 = Amount - close-time offset - sum of allocations;
--     pwa_rebates_owed_v1 sums it. Loan Close owedTotal, the close projection and push v5 follow unpatched.
--  5. "Business Expenses"."Ref Rebate Settlement" now names the most recently recorded settlement that applied to the rebate
--     (D4); null exactly when the rebate has no allocation. calculate_business_expense: the link may move from one settlement
--     to another while pwa.rebate_settlement names the old or the new value (one counted patch).
--  6. pwa_rebate_offset_plan_v1(referrer, amount, day) (new, read only): eligibility, what is due, what the plan can take at
--     most and, for an amount, the covered amount, the lines and a planHash. The preview read and the command both call it.
--  7. pwa_apply_rebate_settlement_v1 (replaced in place): per-rebate lines with expectedPending, the destination, the offset
--     payment and its system.rebate-offset journal row (V124 pattern), result_json.rebateSettlement; delete in any order.
--     pwa_submit_operation_v2 accepts the new nine-key create shape beside the seven-key one (two counted patches).
--  8. The journal CHECK pwa_versioned_outcome admits rebateSettlement on rebate-settlement.create (one counted widening).
-- A change of the link's value is what the change log (pwa_track_row_change) records: it skips an UPDATE whose row did not
-- change, so when a settlement that is not the rebate's newest is deleted, the command clears the link and sets it again.
-- Preflight: V154 applied, no new object exists, every counted boundary occurs exactly once, the runner can replace each
-- routine and alter the two tables, the roles exist. Self-check: owner, ACL, security, volatility and configuration of every
-- replaced routine unchanged; exact ACLs of the new table and function; the CHECK texts; every settlement's allocations sum to
-- its amount; every referrer's owed total unchanged; the link null exactly when no allocation exists.
-- Rollback: a later migration restores the V154 bodies only while no partial or offset settlement exists; prefer a forward
-- fix. The table and the column stay.

DO $preflight$
DECLARE problems text[]:='{}'; r record; suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; definition text;
 b text;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF position('deleted' IN coalesce((SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid=to_regclass('public.pwa_chat_threads') AND conname='pwa_chat_threads_status_check'),''))=0
  OR to_regclass('public.pwa_rebate_settlements') IS NULL OR to_regprocedure('public.pwa_apply_rebate_settlement_v1(text)') IS NULL THEN
  RAISE EXCEPTION 'V155 preflight: V155 needs V154'; END IF;
 IF to_regclass('public.pwa_rebate_settlement_allocations') IS NOT NULL OR to_regprocedure('public.pwa_rebate_offset_plan_v1(text,numeric,date)') IS NOT NULL
  OR EXISTS(SELECT 1 FROM pg_attribute WHERE NOT attisdropped AND attnum>0 AND attname='offset_payment_id' AND attrelid='public.pwa_rebate_settlements'::regclass) THEN
  problems:=problems||'V155: a new object already exists'::text; END IF;
 IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.pwa_rebate_settlements'::regclass AND conname='pwa_rebate_settlements_payment_method_check')
   IS DISTINCT FROM $c$CHECK ((payment_method = ANY (ARRAY['Bank Transfer'::text, 'Cash'::text])))$c$ THEN
  problems:=problems||'V155: pwa_rebate_settlements_payment_method_check differs from V137'::text; END IF;
 -- The counted boundaries (the patches below repeat the count and fail on any other number).
 definition:=pg_get_functiondef('public.calculate_business_expense()'::regprocedure);
 IF position('R184' IN definition)>0 OR position(E'     OR (NEW."Ref Rebate Settlement" IS NOT NULL AND OLD."Ref Rebate Settlement" IS NOT NULL)\n' IN replace(definition,E'\r\n',E'\n'))=0 THEN
  problems:=problems||'V155: calculate_business_expense differs from V145'::text; END IF;
 definition:=pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure);
 FOREACH b IN ARRAY ARRAY[$b$ARRAY['bankReference','cashAccountId','expenseIds','notes','paymentMethod','referrerId','settlementDate'] THEN RAISE EXCEPTION 'settlement keys';END IF;$b$,
   $b$||',"bankReference":'||coalesce(to_json(i->>'bankReference')::text,'null')||',"notes":'||coalesce(to_json(i->>'notes')::text,'null')||'}';$b$] LOOP
  IF (length(definition)-length(replace(definition,b,'')))/length(b)<>1 THEN problems:=problems||'V155: pwa_submit_operation_v2 differs from V138 (rebate-settlement.create)'::text; END IF;
 END LOOP;
 IF position('R184' IN definition)>0 THEN problems:=problems||'V155: pwa_submit_operation_v2 is already patched'::text; END IF;
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint WHERE conname='pwa_versioned_outcome' AND conrelid='public.pwa_payment_commands'::regclass;
 b:=$b$'settlement'::text, 'rollover'::text]) = '{}'::jsonb)$b$;
 IF definition IS NULL OR (length(definition)-length(replace(definition,b,'')))/length(b)<>1 OR position('rebateSettlement' IN definition)>0 THEN
  problems:=problems||'V155: pwa_versioned_outcome differs from V138'::text; END IF;
 FOR r IN SELECT unnest(ARRAY['mw_app_'||suffix,'mw_app_'||suffix||'_journal_owner','mw_notify_owner_'||suffix]) AS role LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r.role) THEN problems:=problems||format('V155 needs the role %s',r.role); END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  -- Replacing a routine or altering a table needs its owner's authority (the owner window of the release: the journal owner).
  FOR r IN SELECT DISTINCT pg_get_userbyid(p.proowner) AS owner FROM pg_proc p WHERE p.oid IN ('public.calculate_business_expense()'::regprocedure,
    'public.pwa_rebate_pending_v1(text)'::regprocedure,'public.pwa_rebates_owed_v1(text)'::regprocedure,'public.pwa_apply_rebate_settlement_v1(text)'::regprocedure,
    'public.pwa_submit_operation_v2(text)'::regprocedure)
   UNION SELECT pg_get_userbyid(c.relowner) FROM pg_class c WHERE c.oid IN ('public.pwa_rebate_settlements'::regclass,'public.pwa_payment_commands'::regclass) LOOP
   IF NOT pg_has_role(current_user,r.owner,'USAGE') THEN problems:=problems||format('%s cannot replace routines or alter tables owned by %s (owner window required)',current_user,r.owner); END IF;
  END LOOP;
 END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V155 preflight: %',array_to_string(problems,'; '); END IF;
END $preflight$;

-- Snapshot of every routine this migration replaces in place: owner, effective ACL, security, volatility and configuration.
CREATE TEMP TABLE v155_routines ON COMMIT DROP AS
 SELECT r.name AS routine,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl,acldefault('f',p.proowner)) AS effective,
  p.prosecdef AS definer,p.provolatile AS volatile,p.proconfig AS config,obj_description(p.oid,'pg_proc') AS comment
 FROM unnest(ARRAY['public.calculate_business_expense()','public.pwa_rebate_pending_v1(text)','public.pwa_rebates_owed_v1(text)',
  'public.pwa_apply_rebate_settlement_v1(text)','public.pwa_submit_operation_v2(text)']) r(name) JOIN pg_proc p ON p.oid=r.name::regprocedure;
-- What every referrer is owed and what every rebate has pending, by the V137 rule, before anything changes (D3).
CREATE TEMP TABLE v155_owed ON COMMIT DROP AS
 SELECT p.payee,public.pwa_rebates_owed_v1(p.payee) AS owed FROM (SELECT DISTINCT "Ref Payee Borrower" AS payee FROM public."Business Expenses" WHERE "Source Type"='Referral Rebate' AND "Ref Payee Borrower" IS NOT NULL) p;
CREATE TEMP TABLE v155_pending ON COMMIT DROP AS
 SELECT x."Row ID" AS id,public.pwa_rebate_pending_v1(x."Row ID") AS pending FROM public."Business Expenses" x WHERE x."Source Type"='Referral Rebate';
CREATE TEMP TABLE v155_settlements ON COMMIT DROP AS SELECT md5(coalesce(string_agg(to_jsonb(s)::text,'|' ORDER BY s.id COLLATE "C"),'')) AS rows_md5,count(*) AS n FROM public.pwa_rebate_settlements s;
CREATE TEMP TABLE v155_ledger ON COMMIT DROP AS SELECT md5(coalesce(string_agg(to_jsonb(c)::text,'|' ORDER BY c."Row ID" COLLATE "C"),'')) AS rows_md5 FROM public."Cash Ledger" c WHERE c."Source Type"='Rebate Settlement';

-- 1. The allocations (D1).
CREATE TABLE public.pwa_rebate_settlement_allocations (
 settlement_id text NOT NULL REFERENCES public.pwa_rebate_settlements(id),
 expense_id text NOT NULL REFERENCES public."Business Expenses"("Row ID"),
 amount numeric NOT NULL CHECK (amount>0 AND amount<'Infinity'::numeric AND amount=trunc(amount)),
 PRIMARY KEY (settlement_id,expense_id)
);
CREATE INDEX pwa_rebate_settlement_allocations_expense ON public.pwa_rebate_settlement_allocations(expense_id);
COMMENT ON TABLE public.pwa_rebate_settlement_allocations IS 'R184: the amount one rebate settlement applied to one referral rebate expense (REFERRAL_REBATE_V3). A rebate''s pending amount is its Amount less its close-time offset less the sum of its rows here. Inserted and deleted only by pwa_apply_rebate_settlement_v1; never updated.';
COMMENT ON COLUMN public.pwa_rebate_settlement_allocations.settlement_id IS 'R184: the settlement.';
COMMENT ON COLUMN public.pwa_rebate_settlement_allocations.expense_id IS 'R184: the referral rebate expense it paid toward.';
COMMENT ON COLUMN public.pwa_rebate_settlement_allocations.amount IS 'R184: whole baht applied, above zero, at most what was pending when the settlement was recorded.';

-- 2. The offset link and the method rule (same constraint name).
ALTER TABLE public.pwa_rebate_settlements ADD COLUMN offset_payment_id text UNIQUE REFERENCES public."Payments"("Row ID");
COMMENT ON COLUMN public.pwa_rebate_settlements.offset_payment_id IS 'R184: null when the settlement was paid to the referrer; else the Referral Rebate Offset payment (rs155:<id>) it posted on the referrer''s own loan.';
ALTER TABLE public.pwa_rebate_settlements DROP CONSTRAINT pwa_rebate_settlements_payment_method_check,
 ADD CONSTRAINT pwa_rebate_settlements_payment_method_check CHECK ((offset_payment_id IS NULL AND payment_method IN ('Bank Transfer','Cash')) OR (offset_payment_id IS NOT NULL AND payment_method='Referral Rebate Offset'));
COMMENT ON TABLE public.pwa_rebate_settlements IS 'R129/R184: one referral rebate settlement of one referrer: the amounts in pwa_rebate_settlement_allocations, paid by Lisa in one cash movement on settlement_date, or offset to the referrer''s own loan (offset_payment_id). Written only by pwa_apply_rebate_settlement_v1; immutable (delete and record again).';
COMMENT ON COLUMN public.pwa_rebate_settlements.amount IS 'R129/R184: whole baht, the sum of its rows in pwa_rebate_settlement_allocations.';
COMMENT ON COLUMN public.pwa_rebate_settlements.paid_by_cash_account IS 'R129/R184: an active account of ch:lisa, checked by the apply function; Lisa''s default account for an offset (its receipt returns to the same account).';
COMMENT ON COLUMN public.pwa_rebate_settlements.settlement_date IS 'R129/R184: the cash movement date; not in the future (Bangkok business date), not before the newest close date of the rebates it pays; today for an offset.';
COMMENT ON COLUMN public."Business Expenses"."Ref Rebate Settlement" IS 'R129/R184: the most recently recorded settlement that applied an amount to this referral rebate (REFERRAL_REBATE_V3); null exactly when no settlement did (pending in full, offset-only and legacy rows, other expenses). Set, moved and cleared by the settlement command only.';

-- 3. Backfill (D3): each settled rebate was paid in full, its Amount less its close-time offset.
INSERT INTO public.pwa_rebate_settlement_allocations(settlement_id,expense_id,amount)
 SELECT x."Ref Rebate Settlement",x."Row ID",x."Amount"::numeric-coalesce(o."Amount Received"::numeric,0)
 FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment" WHERE x."Ref Rebate Settlement" IS NOT NULL;

-- 4. Derived state (D2): one rule for the reads, the push, Loan Close, the settlement and the tests.
CREATE OR REPLACE FUNCTION public.pwa_rebate_pending_v1(p_expense text) RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT CASE WHEN x."Rule Version"='REFERRAL_REBATE_V3'
   THEN greatest(x."Amount"::numeric-coalesce(o."Amount Received"::numeric,0)
    -coalesce((SELECT sum(a.amount) FROM public.pwa_rebate_settlement_allocations a WHERE a.expense_id=x."Row ID"),0),0) ELSE 0 END -- R184
 FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment"
 WHERE x."Row ID"=p_expense AND x."Source Type"='Referral Rebate';
$$;
COMMENT ON FUNCTION public.pwa_rebate_pending_v1(text) IS 'R129/R184: the pending (unpaid) amount of a referral rebate expense: REFERRAL_REBATE_V3, Amount less its close-time offset payment less the amounts settlements applied to it (pwa_rebate_settlement_allocations); 0 for offset-only, paid and legacy rows; null for an unknown or non-referral expense. Read only.';
CREATE OR REPLACE FUNCTION public.pwa_rebates_owed_v1(p_referrer text) RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT coalesce(sum(greatest(x."Amount"::numeric-coalesce(o."Amount Received"::numeric,0)
   -coalesce((SELECT sum(a.amount) FROM public.pwa_rebate_settlement_allocations a WHERE a.expense_id=x."Row ID"),0),0)),0) -- R184
 FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment"
 WHERE x."Ref Payee Borrower"=p_referrer AND x."Source Type"='Referral Rebate' AND x."Rule Version"='REFERRAL_REBATE_V3';
$$;

-- 5. The offset plan of a settlement (D6): the Loan Close offset's own plan (pwa_pay_forward_plan_v1, forward only), so "offset"
-- has one meaning. Without an amount: eligibility (the Loan Close hasOpenLoan rule), what is due now and the most the plan can
-- take. With an amount: also the covered amount, the plan's allocations and bookings, the lines a page shows and a planHash.
-- A schedule the plan refuses (P0001) is not offered. Read only, invoker rights.
CREATE FUNCTION public.pwa_rebate_offset_plan_v1(p_referrer text, p_amount numeric, p_day date) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE top numeric:=999999999999; purpose jsonb:='{"forward":true,"principal":[],"loans":null}'::jsonb; capacity jsonb; plan jsonb;
 available boolean; due numeric:=0; most numeric:=0; covered numeric; lines jsonb; result jsonb;
BEGIN
 IF p_referrer IS NULL OR p_day IS NULL OR (p_amount IS NOT NULL AND (p_amount<=0 OR p_amount<>trunc(p_amount) OR p_amount>top)) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid rebate offset request'; END IF;
 available:=EXISTS(SELECT 1 FROM public."Loans" x WHERE x."Ref Borrowers"=p_referrer AND x."Loan Status"='ยังไม่ปิดยอด' AND NOT coalesce(x."Defaulted",false));
 IF available THEN
  BEGIN
   capacity:=public.pwa_pay_forward_plan_v1(p_referrer,top,p_day,purpose);
   most:=top-(capacity->>'uncovered')::numeric; due:=least((capacity->>'dueTotal')::numeric,most);
   IF p_amount IS NOT NULL THEN plan:=public.pwa_pay_forward_plan_v1(p_referrer,p_amount,p_day,purpose); END IF;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN available:=false; most:=0; due:=0; plan:=NULL;
  END;
  IF most<=0 THEN available:=false; plan:=NULL; END IF;
 END IF;
 result:=jsonb_build_object('available',available,'dueAmount',trunc(due)::text,'maxAmount',trunc(most)::text);
 IF p_amount IS NULL THEN RETURN result; END IF;
 IF plan IS NULL THEN
  RETURN result||jsonb_build_object('amount',trunc(p_amount)::text,'covered','0','planHash',NULL,'allocations','[]'::jsonb,'materialize','[]'::jsonb,'paidThrough','{}'::jsonb,'lines','[]'::jsonb);
 END IF;
 covered:=p_amount-(plan->>'uncovered')::numeric;
 SELECT coalesce(jsonb_agg(jsonb_build_object('chargeId',a.value->>'chargeId','loanId',coalesce(c."Ref Loans",m.value->>'loanId'),'chargeDate',a.value->>'chargeDate',
    'principal',a.value->>'principal','interest',a.value->>'interest','lateCharge',a.value->>'lateCharge',
    'amount',trunc((a.value->>'principal')::numeric+(a.value->>'interest')::numeric+(a.value->>'lateCharge')::numeric)::text,
    'remaining',trunc((a.value->>'expectedPrincipalRemaining')::numeric+(a.value->>'expectedInterestRemaining')::numeric+(a.value->>'expectedLateChargeRemaining')::numeric)::text,
    'due',(a.value->>'chargeDate')::date<=p_day,'booked',m.value IS NOT NULL) ORDER BY (a.value->>'chargeDate')::date,(a.value->>'chargeId') COLLATE "C"),'[]'::jsonb)
  INTO lines FROM jsonb_array_elements(plan->'allocations') a LEFT JOIN public."Charges" c ON c."Row ID"=a.value->>'chargeId'
   LEFT JOIN jsonb_array_elements(plan->'materialize') m ON m.value->>'chargeId'=a.value->>'chargeId';
 RETURN result||jsonb_build_object('amount',trunc(p_amount)::text,'covered',trunc(covered)::text,
  'planHash',encode(sha256(convert_to(jsonb_build_object('referrerId',p_referrer,'amount',trunc(p_amount)::text,'day',to_char(p_day,'YYYY-MM-DD'),'covered',trunc(covered)::text,
    'allocations',plan->'allocations','materialize',plan->'materialize')::text,'UTF8')),'hex'),
  'allocations',plan->'allocations','materialize',plan->'materialize','paidThrough',plan->'paidThrough','lines',lines);
END $$;
COMMENT ON FUNCTION public.pwa_rebate_offset_plan_v1(text,numeric,date) IS 'R184: the offset of a rebate settlement to the referrer''s own loan, the Loan Close offset plan (pwa_pay_forward_plan_v1, forward only: due charges first, then future charges to the 93-day horizon): available (an open, not defaulted loan the plan can pay), dueAmount, maxAmount and, for an amount, covered, lines and planHash. Shown by Pay rebates and recomputed by rebate-settlement.create. Read only.';

-- Exact, counted replacements in a routine's current definition (V137/V138 method): every boundary must occur exactly once,
-- else the migration fails; bodies first created from a CRLF file keep CRLF line ends and are matched as written.
CREATE FUNCTION pg_temp.v155_patch(routine text, edits text[]) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE definition text:=pg_get_functiondef(routine::regprocedure); k integer; o text; n text;
BEGIN
 IF position('R184' IN definition)>0 THEN RAISE EXCEPTION 'V155: % is already patched',routine; END IF;
 FOR k IN 1..array_length(edits,1)/2 LOOP
  o:=edits[2*k-1];n:=edits[2*k];
  IF position(o IN definition)=0 AND position(E'\n' IN o)>0 THEN o:=replace(o,E'\n',E'\r\n');n:=replace(n,E'\n',E'\r\n'); END IF;
  IF (length(definition)-length(replace(definition,o,'')))/length(o)<>1 THEN RAISE EXCEPTION 'V155: unexpected % boundary %',routine,k; END IF;
  definition:=replace(definition,o,n);
 END LOOP;
 IF position('R184' IN definition)=0 THEN RAISE EXCEPTION 'V155: % patch carries no R184 marker',routine; END IF;
 EXECUTE definition;
END $patch$;

-- 6. The V15 expense trigger (D4): the link names the rebate's newest settlement, so it is set, moved to another settlement
-- or cleared, always while pwa.rebate_settlement names the old or the new value. The split stays as booked (unchanged rule).
SELECT pg_temp.v155_patch('public.calculate_business_expense()',ARRAY[
 $o$   -- R129: "Ref Rebate Settlement" is set (to the new value) or cleared (the old value) only while pwa.rebate_settlement
   -- names that settlement (pwa_apply_rebate_settlement_v1), never moved from one settlement to another, never on a manual row.
   IF NEW."Ref Rebate Settlement" IS DISTINCT FROM OLD."Ref Rebate Settlement" AND (OLD."Source Type" IS DISTINCT FROM 'Referral Rebate'
     OR (NEW."Ref Rebate Settlement" IS NOT NULL AND OLD."Ref Rebate Settlement" IS NOT NULL)
     OR nullif(current_setting('pwa.rebate_settlement',true),'') IS DISTINCT FROM coalesce(NEW."Ref Rebate Settlement",OLD."Ref Rebate Settlement")) THEN$o$,
 $n$   -- R129/R184: "Ref Rebate Settlement" (the rebate's most recently recorded settlement) is set, moved or cleared only
   -- while pwa.rebate_settlement names its old or its new value (pwa_apply_rebate_settlement_v1), never on a manual row.
   IF NEW."Ref Rebate Settlement" IS DISTINCT FROM OLD."Ref Rebate Settlement" AND (OLD."Source Type" IS DISTINCT FROM 'Referral Rebate'
     OR nullif(current_setting('pwa.rebate_settlement',true),'') IS NULL
     OR NOT (current_setting('pwa.rebate_settlement',true) IS NOT DISTINCT FROM NEW."Ref Rebate Settlement"
      OR current_setting('pwa.rebate_settlement',true) IS NOT DISTINCT FROM OLD."Ref Rebate Settlement")) THEN$n$]);

-- 7. The command's inputs: the new shape (D5: per-rebate lines, the destination and, for an offset, the plan hash) beside the
-- seven-key shape of V137, which stays accepted (an un-updated phone: whole pending, paid to the referrer). The second edit
-- is applied first, so its boundary is counted before the new block adds a similar line.
SELECT pg_temp.v155_patch('public.pwa_submit_operation_v2(text)',ARRAY[
 $o$||',"bankReference":'||coalesce(to_json(i->>'bankReference')::text,'null')||',"notes":'||coalesce(to_json(i->>'notes')::text,'null')||'}';$o$,
 $n$||',"bankReference":'||coalesce(to_json(i->>'bankReference')::text,'null')||',"notes":'||coalesce(to_json(i->>'notes')::text,'null')||'}'; END IF;$n$,
 $o$ IF (SELECT array_agg(key ORDER BY key COLLATE "C") FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['bankReference','cashAccountId','expenseIds','notes','paymentMethod','referrerId','settlementDate'] THEN RAISE EXCEPTION 'settlement keys';END IF;$o$,
 $n$ IF i ? 'allocations' THEN
 -- R184: 1 to 200 lines {expenseId, amount, expectedPending} ascending by expense id (whole-baht strings of at least 1), the
 -- destination ('referrer': Lisa's account, method, optional bank reference; 'offset': those three null and the plan hash).
 IF (SELECT array_agg(key ORDER BY key COLLATE "C") FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['allocations','bankReference','cashAccountId','destination','expectedPlanHash','notes','paymentMethod','referrerId','settlementDate'] THEN RAISE EXCEPTION 'settlement keys';END IF;
 IF jsonb_typeof(i->'referrerId') IS DISTINCT FROM 'string' OR octet_length(i->>'referrerId') NOT BETWEEN 1 AND 256 OR i->>'referrerId'~'[[:cntrl:]]'
  OR jsonb_typeof(i->'destination') IS DISTINCT FROM 'string' OR i->>'destination' NOT IN('referrer','offset')
  OR jsonb_typeof(i->'settlementDate') IS DISTINCT FROM 'string' OR i->>'settlementDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'settlementDate')::date)::text<>i->>'settlementDate'
  OR jsonb_typeof(i->'notes') NOT IN('string','null') OR coalesce(octet_length(i->>'notes'),0)>65536
  OR jsonb_typeof(i->'cashAccountId') NOT IN('string','null') OR jsonb_typeof(i->'paymentMethod') NOT IN('string','null') OR jsonb_typeof(i->'bankReference') NOT IN('string','null') OR jsonb_typeof(i->'expectedPlanHash') NOT IN('string','null')
  OR jsonb_typeof(i->'allocations') IS DISTINCT FROM 'array' OR jsonb_array_length(i->'allocations') NOT BETWEEN 1 AND 200
 THEN RAISE EXCEPTION 'settlement input';END IF;
 IF i->>'destination'='offset' THEN
  IF i->'cashAccountId'<>'null'::jsonb OR i->'paymentMethod'<>'null'::jsonb OR i->'bankReference'<>'null'::jsonb OR i->>'expectedPlanHash' IS NULL OR i->>'expectedPlanHash'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'settlement offset';END IF;
 ELSIF i->>'cashAccountId' IS NULL OR octet_length(i->>'cashAccountId') NOT BETWEEN 1 AND 256 OR i->>'cashAccountId'~'[[:cntrl:]]'
  OR i->>'paymentMethod' IS NULL OR i->>'paymentMethod' NOT IN('Bank Transfer','Cash') OR i->'expectedPlanHash'<>'null'::jsonb
  OR (i->'bankReference'<>'null'::jsonb AND (octet_length(i->>'bankReference') NOT BETWEEN 1 AND 256 OR btrim(i->>'bankReference')='' OR i->>'bankReference'~'[\r\n]' OR i->>'paymentMethod'<>'Bank Transfer'))
 THEN RAISE EXCEPTION 'settlement payment';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(i->'allocations') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object') THEN RAISE EXCEPTION 'settlement line';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(i->'allocations') x WHERE (SELECT array_agg(key ORDER BY key COLLATE "C") FROM jsonb_object_keys(x) key) IS DISTINCT FROM ARRAY['amount','expectedPending','expenseId']
   OR jsonb_typeof(x->'expenseId') IS DISTINCT FROM 'string' OR octet_length(x->>'expenseId') NOT BETWEEN 1 AND 256 OR x->>'expenseId'~'[[:cntrl:]]'
   OR jsonb_typeof(x->'amount') IS DISTINCT FROM 'string' OR x->>'amount'!~'^[1-9][0-9]{0,11}$' OR jsonb_typeof(x->'expectedPending') IS DISTINCT FROM 'string' OR x->>'expectedPending'!~'^[1-9][0-9]{0,11}$')
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(i->'allocations') WITH ORDINALITY x(v,n) JOIN jsonb_array_elements(i->'allocations') WITH ORDINALITY y(v,n) ON y.n=x.n+1 WHERE NOT ((x.v->>'expenseId') COLLATE "C"<(y.v->>'expenseId') COLLATE "C"))
 THEN RAISE EXCEPTION 'settlement line';END IF;
 input_text:='{"referrerId":'||to_json(i->>'referrerId')::text||',"destination":'||to_json(i->>'destination')::text||',"allocations":['
  ||(SELECT string_agg('{"expenseId":'||to_json(x.v->>'expenseId')::text||',"amount":'||to_json(x.v->>'amount')::text||',"expectedPending":'||to_json(x.v->>'expectedPending')::text||'}',',' ORDER BY x.n) FROM jsonb_array_elements(i->'allocations') WITH ORDINALITY x(v,n))
  ||'],"settlementDate":'||to_json(i->>'settlementDate')::text||',"cashAccountId":'||coalesce(to_json(i->>'cashAccountId')::text,'null')||',"paymentMethod":'||coalesce(to_json(i->>'paymentMethod')::text,'null')
  ||',"bankReference":'||coalesce(to_json(i->>'bankReference')::text,'null')||',"notes":'||coalesce(to_json(i->>'notes')::text,'null')||',"expectedPlanHash":'||coalesce(to_json(i->>'expectedPlanHash')::text,'null')||'}';
 ELSE
 IF (SELECT array_agg(key ORDER BY key COLLATE "C") FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['bankReference','cashAccountId','expenseIds','notes','paymentMethod','referrerId','settlementDate'] THEN RAISE EXCEPTION 'settlement keys';END IF;$n$]);

-- 8. The settlement command (journal owner only, invoker rights), whole body.
CREATE OR REPLACE FUNCTION public.pwa_apply_rebate_settlement_v1(canonical text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE e jsonb:=canonical::jsonb;c jsonb:=e->'command';i jsonb:=c->'inputs';a jsonb:=e->'actor';op text:=c->>'operation';target text:=c->>'targetId';
 day date:=(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date;s public.pwa_rebate_settlements%ROWTYPE;ids text[];referrer text;total numeric;
 settle_date date;newest date;changed integer;creator text;
 -- R184: the destination, the lines, the offset plan and payment, and the stored outcome.
 destination text;lines jsonb;account text;method text;plan jsonb;offset_id text;offset_plan jsonb;h text;request uuid;system_canonical text;
 actual public."Payments"%ROWTYPE;charge_ids text;message text;detail jsonb;rec record;
BEGIN
 IF (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END)
  OR op NOT IN('rebate-settlement.create','rebate-settlement.delete') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Governed operation required';END IF;
 IF op='rebate-settlement.create' THEN
  referrer:=i->>'referrerId';settle_date:=(i->>'settlementDate')::date;creator:=a->>'loginEmail';destination:=coalesce(i->>'destination','referrer');
  IF i ? 'allocations' THEN
   lines:=i->'allocations';
   SELECT array_agg(x.v->>'expenseId' ORDER BY x.n) INTO ids FROM jsonb_array_elements(lines) WITH ORDINALITY x(v,n);
  ELSE
   SELECT array_agg(x.v ORDER BY x.n) INTO ids FROM jsonb_array_elements_text(i->'expenseIds') WITH ORDINALITY x(v,n);
  END IF;
  -- Locks: the referrer (the lock Loan Close takes), for an offset the referrer's borrower row, loans and charges (the Loan
  -- Close order), then the chosen expenses in key order.
  PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('borrower',referrer));
  IF destination='offset' THEN
   PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=referrer FOR UPDATE;
   PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers"=referrer ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
   PERFORM 1 FROM public."Charges" ch JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans" WHERE l."Ref Borrowers"=referrer ORDER BY ch."Row ID" COLLATE "C" FOR UPDATE OF ch;
  END IF;
  PERFORM 1 FROM public."Business Expenses" WHERE "Row ID"=ANY(ids) ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
  -- The seven-key shape pays each named rebate's whole pending amount, read under the locks.
  IF lines IS NULL THEN
   SELECT jsonb_agg(jsonb_build_object('expenseId',u.v,'amount',coalesce(public.pwa_rebate_pending_v1(u.v),0)::text,'expectedPending',coalesce(public.pwa_rebate_pending_v1(u.v),0)::text) ORDER BY u.n)
    INTO lines FROM unnest(ids) WITH ORDINALITY u(v,n);
  END IF;
  IF EXISTS(SELECT 1 FROM public.pwa_rebate_settlements WHERE id=target) THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
  IF NOT EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID"=referrer) THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
  IF destination='offset' THEN
   -- D7: the settlement leaves Lisa's default account and the offset receipt returns to it.
   account:=public.default_cash_account('ch:lisa');method:='Referral Rebate Offset';
   IF account IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
   -- D9: an offset posts a payment today.
   IF settle_date IS DISTINCT FROM day THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
  ELSE
   account:=i->>'cashAccountId';method:=i->>'paymentMethod';
   IF NOT EXISTS(SELECT 1 FROM public."Cash Accounts" ca JOIN public."Cash Holders" ch ON ch."Row ID"=ca."Ref Cash Holder"
     WHERE ca."Row ID"=account AND ca."Ref Cash Holder"='ch:lisa' AND ca."Active" IS TRUE AND ch."Active" IS TRUE) THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
   SELECT max(coalesce(l."Close Date",x2."Expense Date")) INTO newest FROM public."Business Expenses" x2 LEFT JOIN public."Loans" l ON l."Row ID"=x2."Ref Related Loan" WHERE x2."Row ID"=ANY(ids);
   IF settle_date>day OR settle_date<newest THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
  END IF;
  -- Every line is a V3 rebate of this referrer, pays a whole amount of at least 1 and at most what is pending, and states the
  -- pending amount the caller read (a stale list, a legacy row, another payee's, a paid or offset-only one is refused).
  IF (SELECT count(*) FROM jsonb_array_elements(lines) ln JOIN public."Business Expenses" x2 ON x2."Row ID"=ln->>'expenseId'
    WHERE x2."Source Type"='Referral Rebate' AND x2."Rule Version"='REFERRAL_REBATE_V3' AND x2."Ref Payee Borrower"=referrer
     AND (ln->>'amount')::numeric>=1 AND (ln->>'amount')::numeric=trunc((ln->>'amount')::numeric)
     AND (ln->>'amount')::numeric<=public.pwa_rebate_pending_v1(x2."Row ID") AND (ln->>'expectedPending')::numeric=public.pwa_rebate_pending_v1(x2."Row ID"))<>cardinality(ids) THEN
   RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
  SELECT sum((ln->>'amount')::numeric) INTO total FROM jsonb_array_elements(lines) ln;
  IF destination='offset' THEN
   -- D6: the plan the page showed, recomputed under the locks; another plan, or one that takes less, is plan_changed.
   plan:=public.pwa_rebate_offset_plan_v1(referrer,total,day);
   IF (plan->>'available')::boolean IS NOT TRUE OR plan->>'planHash' IS DISTINCT FROM i->>'expectedPlanHash' OR (plan->>'covered')::numeric IS DISTINCT FROM total THEN RAISE EXCEPTION USING ERRCODE='P5B09';END IF;
   offset_id:='rs155:'||target;
   offset_plan:=jsonb_build_object('borrowerId',referrer,'amountReceived',trunc(total)::text,'allocations',plan->'allocations','allocationMethod','Selected Charges',
    'targetChargeId',NULL,'targetLoanId',NULL,'cashAccountId',account,'paymentDate',day::text,'paymentMethod','Referral Rebate Offset');
   -- The V124 journal row of an offset payment (one documented derivation of its request id), so the payment's plan
   -- resolves through pwa_effective_payment_plan_v2 unpatched.
   h:=md5('mw-credit-rebate-offset-v1:'||offset_id);
   request:=(substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-'||substr('89ab',(get_byte(decode(substr(h,17,2),'hex'),0)%4)+1,1)||substr(h,18,3)||'-'||substr(h,21,12))::uuid;
   system_canonical:=jsonb_build_object('contractVersion',2,'requestId',request::text,
    'actor',jsonb_build_object('issuer','SQL','subject','rebate-settlement','partnerId','SQL:rebate-settlement','loginEmail',creator),
    'command',jsonb_build_object('operation','system.rebate-offset','targetType','rebate-settlement','targetId',target))::text;
   INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code,result_json)
   VALUES(request,2,'SQL','rebate-settlement','SQL:rebate-settlement',creator,system_canonical,encode(sha256(convert_to(system_canonical,'UTF8')),'hex'),'applied',NULL,NULL,
    jsonb_build_object('operation','system.rebate-offset','targetType','rebate-settlement','targetId',target,'paymentId',offset_id,'plan',offset_plan,'predecessorRequestId',NULL,'sourceCreatedBy',creator));
   BEGIN
    PERFORM public.pwa_apply_pay_forward_v1('[]'::jsonb,plan->'materialize',day);
   EXCEPTION WHEN SQLSTATE 'P4C05' THEN RAISE EXCEPTION USING ERRCODE='P5B09';
   END;
   SELECT string_agg(value->>'chargeId',' , ' ORDER BY (value->>'chargeId') COLLATE "C") INTO charge_ids FROM jsonb_array_elements(plan->'allocations');
   SET CONSTRAINTS public.referral_loan_closed DEFERRED; -- the V124 pattern: fired below, once the payment is Posted
   INSERT INTO public."Payments"("Row ID","Ref Borrower","Payment Date","Amount Received","Payment Method","Allocation Method","Selected Charge IDs","Ref Received By Cash Account","Notes","Created By","Status")
    VALUES(offset_id,referrer,day,total::money,'Referral Rebate Offset','Selected Charges',charge_ids,account,'Rebate settlement',creator,'Processing');
   SELECT * INTO actual FROM public."Payments" WHERE "Row ID"=offset_id;
   IF NOT FOUND OR actual."Status" IS DISTINCT FROM 'Posted' OR actual."Amount Received"::numeric IS DISTINCT FROM total THEN RAISE EXCEPTION 'Rebate settlement offset differs from its plan';END IF;
   -- A loan of the referrer this offset paid off gets its own rebate (and default offset) now, inside this command, as
   -- an ordinary payment that closes a referred loan does (pwa_submit_selected_charges_v1).
   SET CONSTRAINTS public.referral_loan_closed IMMEDIATE;
   SET CONSTRAINTS public.referral_loan_closed DEFERRED;
  END IF;
  -- created_at is the recording order of a rebate's settlements (D4), so it is the clock, not the transaction start.
  INSERT INTO public.pwa_rebate_settlements(id,payee_borrower_id,settlement_date,amount,paid_by_cash_holder,paid_by_cash_account,payment_method,bank_reference,notes,created_by,created_at,offset_payment_id)
   VALUES(target,referrer,settle_date,total,'ch:lisa',account,method,i->>'bankReference',i->>'notes',creator,clock_timestamp(),offset_id);
  INSERT INTO public.pwa_rebate_settlement_allocations(settlement_id,expense_id,amount)
   SELECT target,ln->>'expenseId',(ln->>'amount')::numeric FROM jsonb_array_elements(lines) ln;
  -- This settlement is now the newest of every rebate it paid.
  PERFORM set_config('pwa.rebate_settlement',target,true);
  UPDATE public."Business Expenses" SET "Ref Rebate Settlement"=target WHERE "Row ID"=ANY(ids);
  GET DIAGNOSTICS changed=ROW_COUNT;
  PERFORM set_config('pwa.rebate_settlement','',true);
  IF changed<>cardinality(ids) OR (SELECT count(*) FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"='Rebate Settlement' AND "Ref Rebate Settlement"=target
    AND "Movement Type"='Rebate Settlement' AND "Amount"=total AND "Movement Date"=settle_date AND "Ref From Cash Holder"='ch:lisa' AND "Ref From Cash Account"=account)<>1 THEN
   RAISE EXCEPTION 'Rebate settlement cash entry differs from the settlement';
  END IF;
  -- D7: an offset nets to zero on Lisa's account (the settlement out, the offset receipt in, same day and amount).
  IF offset_id IS NOT NULL AND (SELECT count(*) FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"='Payment' AND "Ref Payment"=offset_id
    AND "Amount"=total AND "Movement Date"=settle_date AND "Ref To Cash Account"=account)<>1 THEN
   RAISE EXCEPTION 'Rebate settlement offset receipt differs from the settlement';
  END IF;
  -- D13: the outcome, exact under the referrer lock and identical on replay.
  detail:=jsonb_build_object('destination',destination,'amount',trunc(total)::text,'owedAfter',trunc(public.pwa_rebates_owed_v1(referrer))::text,'offsetPaymentId',offset_id,
   'lines',(SELECT jsonb_agg(jsonb_build_object('expenseId',x.v->>'expenseId','amount',trunc((x.v->>'amount')::numeric)::text,'pendingAfter',trunc(public.pwa_rebate_pending_v1(x.v->>'expenseId'))::text) ORDER BY x.n)
    FROM jsonb_array_elements(lines) WITH ORDINALITY x(v,n)));
 ELSE
  SELECT payee_borrower_id,offset_payment_id INTO referrer,offset_id FROM public.pwa_rebate_settlements WHERE id=target;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
  PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('borrower',referrer));
  IF offset_id IS NOT NULL THEN
   PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=referrer FOR UPDATE;
   PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers"=referrer ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
   PERFORM 1 FROM public."Charges" ch JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans" WHERE l."Ref Borrowers"=referrer ORDER BY ch."Row ID" COLLATE "C" FOR UPDATE OF ch;
  END IF;
  SELECT * INTO s FROM public.pwa_rebate_settlements WHERE id=target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
  SELECT coalesce(array_agg(al.expense_id ORDER BY al.expense_id COLLATE "C"),ARRAY[]::text[]) INTO ids FROM public.pwa_rebate_settlement_allocations al WHERE al.settlement_id=target;
  PERFORM 1 FROM public."Business Expenses" WHERE "Row ID"=ANY(ids) ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
  IF public.pwa_rebate_settlement_version_v1(target) IS DISTINCT FROM c->>'expectedVersion' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
  creator:=s.created_by;offset_id:=s.offset_payment_id;
  -- D10: its amounts return to pending (any settlement, in any order); each rebate's link becomes its newest remaining
  -- settlement, or null. A link whose value stays is cleared and set again, so the expense row is recorded as changed (the
  -- change log skips an UPDATE that changes nothing, and the rebate's derived pending amount did change).
  DELETE FROM public.pwa_rebate_settlement_allocations WHERE settlement_id=target;
  FOR rec IN SELECT b."Row ID" AS id,b."Ref Rebate Settlement" AS link,(SELECT al.settlement_id FROM public.pwa_rebate_settlement_allocations al JOIN public.pwa_rebate_settlements st ON st.id=al.settlement_id
     WHERE al.expense_id=b."Row ID" ORDER BY st.created_at DESC,st.id COLLATE "C" DESC LIMIT 1) AS latest
    FROM public."Business Expenses" b WHERE b."Row ID"=ANY(ids) ORDER BY b."Row ID" COLLATE "C" LOOP
   PERFORM set_config('pwa.rebate_settlement',coalesce(rec.link,rec.latest,target),true);
   IF rec.link IS NOT DISTINCT FROM rec.latest AND rec.link IS NOT NULL THEN
    UPDATE public."Business Expenses" SET "Ref Rebate Settlement"=NULL WHERE "Row ID"=rec.id;
   END IF;
   IF rec.latest IS NOT NULL THEN PERFORM set_config('pwa.rebate_settlement',rec.latest,true);END IF;
   UPDATE public."Business Expenses" SET "Ref Rebate Settlement"=rec.latest WHERE "Row ID"=rec.id;
  END LOOP;
  PERFORM set_config('pwa.rebate_settlement','',true);
  -- The settlement and (its delete trigger) its cash entry go.
  DELETE FROM public.pwa_rebate_settlements WHERE id=target;
  IF EXISTS(SELECT 1 FROM public."Cash Ledger" WHERE "Ref Rebate Settlement"=target OR ("Source Type"='Rebate Settlement' AND "Source Key"='REBATESETTLEMENT:'||target)) THEN
   RAISE EXCEPTION 'Rebate settlement cash entry was not removed';
  END IF;
  -- An offset's payment goes through the receipt engine under payment_crud.offset: repayments and its cash entry go, its
  -- charges become unpaid, booked future charges stay (R111 D4), a loan it closed reopens. What the engine refuses (a later
  -- default or manual close of the referrer's loan, a settled rebate of a loan it closed) is a dependency conflict.
  IF offset_id IS NOT NULL THEN
   BEGIN
    PERFORM set_config('payment_crud.offset',offset_id,true);
    DELETE FROM public."Payments" WHERE "Row ID"=offset_id;
    PERFORM set_config('payment_crud.offset','',true);
   EXCEPTION WHEN foreign_key_violation THEN PERFORM set_config('payment_crud.offset','',true);RAISE EXCEPTION USING ERRCODE='P5B05';
    WHEN SQLSTATE 'P0001' THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;PERFORM set_config('payment_crud.offset','',true);
     IF message IN('Payment has a later loan default/write-off; reconcile that default first','Manually closed loan must be reopened explicitly before its receipt changes','Corrected payment has a default dependency; undo default first',
      'Remove through the closing payment','Remove through the closing payment: delete it and close again','Remove the settlement first','Defaulted loan requires explicit default reconciliation') THEN RAISE EXCEPTION USING ERRCODE='P5B05';ELSE RAISE;END IF;
   END;
   IF EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"=offset_id) OR EXISTS(SELECT 1 FROM public."Cash Ledger" WHERE "Ref Payment"=offset_id) THEN
    RAISE EXCEPTION 'Rebate settlement offset payment was not removed';
   END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('operation',op,'targetType','rebate-settlement','targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy',creator)
  ||CASE WHEN detail IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('rebateSettlement',detail) END;
END $$;
COMMENT ON FUNCTION public.pwa_apply_rebate_settlement_v1(text) IS 'mw-access:governance R129/R184 rebate-settlement.create (per-rebate amounts, paid to the referrer or offset to the referrer''s loan) and .delete for pwa_submit_operation_v2; journal owner only.';

-- 9. The journal admits the settlement's outcome (one counted widening of pwa_versioned_outcome; every other rule is
-- unchanged and existing rows are revalidated).
DO $journal$
DECLARE definition text;
 o1 text:=$o$'settlement'::text, 'rollover'::text]) = '{}'::jsonb)$o$;
 n1 text:=$n$'settlement'::text, 'rollover'::text, 'rebateSettlement'::text]) = '{}'::jsonb) AND ((NOT (result_json ? 'rebateSettlement'::text)) OR (((result_json ->> 'operation'::text) = 'rebate-settlement.create'::text) AND (jsonb_typeof((result_json -> 'rebateSettlement'::text)) = 'object'::text)))$n$;
BEGIN
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint WHERE conname='pwa_versioned_outcome' AND conrelid='public.pwa_payment_commands'::regclass;
 IF definition IS NULL OR (length(definition)-length(replace(definition,o1,'')))/length(o1)<>1 THEN RAISE EXCEPTION 'V155: unexpected pwa_versioned_outcome';END IF;
 ALTER TABLE public.pwa_payment_commands DROP CONSTRAINT pwa_versioned_outcome;
 EXECUTE 'ALTER TABLE public.pwa_payment_commands ADD CONSTRAINT pwa_versioned_outcome '||replace(definition,o1,n1);
END $journal$;

-- 10. Access. The allocations: SELECT for the application role (read routes), SELECT, INSERT and DELETE for the journal owner
-- (the command; no UPDATE: rows never change), two columns for the notify owner (push v5 calls the pending rules); PROD's
-- default grants removed. The plan: the application role (the journal owner is a member).
DO $acl$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; app text; journal text; notify_owner text; grantee text;
BEGIN
 app:='mw_app_'||suffix; journal:=app||'_journal_owner'; notify_owner:='mw_notify_owner_'||suffix;
 REVOKE ALL ON public.pwa_rebate_settlement_allocations FROM PUBLIC;
 FOR grantee IN SELECT DISTINCT pg_get_userbyid(a.grantee) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
   WHERE c.oid='public.pwa_rebate_settlement_allocations'::regclass AND a.grantee<>0 AND a.grantee<>c.relowner LOOP
  EXECUTE format('REVOKE ALL ON public.pwa_rebate_settlement_allocations FROM %I',grantee);
 END LOOP;
 EXECUTE format('GRANT SELECT ON public.pwa_rebate_settlement_allocations TO %I',app);
 EXECUTE format('GRANT SELECT,INSERT,DELETE ON public.pwa_rebate_settlement_allocations TO %I',journal);
 EXECUTE format('GRANT SELECT (expense_id,amount) ON public.pwa_rebate_settlement_allocations TO %I',notify_owner);
 REVOKE ALL ON FUNCTION public.pwa_rebate_offset_plan_v1(text,numeric,date) FROM PUBLIC;
 FOR grantee IN SELECT DISTINCT pg_get_userbyid(a.grantee) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE p.oid='public.pwa_rebate_offset_plan_v1(text,numeric,date)'::regprocedure AND a.grantee<>0 AND a.grantee<>p.proowner LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.pwa_rebate_offset_plan_v1(text,numeric,date) FROM %I',grantee);
 END LOOP;
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_rebate_offset_plan_v1(text,numeric,date) TO %I',app);
END $acl$;

-- Self-check.
DO $check$
DECLARE bad text; suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; app text; journal text; notify_owner text; definition text;
BEGIN
 app:='mw_app_'||suffix; journal:=app||'_journal_owner'; notify_owner:='mw_notify_owner_'||suffix;
 SELECT string_agg(o.routine,', ') INTO bad FROM v155_routines o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR p.prosecdef<>o.definer OR p.provolatile<>o.volatile OR p.proconfig IS DISTINCT FROM o.config
   OR (o.routine IN ('public.calculate_business_expense()','public.pwa_submit_operation_v2(text)','public.pwa_rebates_owed_v1(text)') AND obj_description(p.oid,'pg_proc') IS DISTINCT FROM o.comment)
   OR (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY (a.grantee::text||':'||a.privilege_type) COLLATE "C") FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)
    IS DISTINCT FROM (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY (a.grantee::text||':'||a.privilege_type) COLLATE "C") FROM aclexplode(o.effective) a WHERE a.grantee<>p.proowner);
 IF bad IS NOT NULL OR (SELECT count(*) FROM v155_routines)<>5 THEN RAISE EXCEPTION 'V155 changed the owner, privileges, attributes or comment of %',coalesce(bad,'an unexpected routine set'); END IF;
 SELECT string_agg(r,', ') INTO bad FROM unnest(ARRAY['public.calculate_business_expense()','public.pwa_rebate_pending_v1(text)','public.pwa_rebates_owed_v1(text)',
   'public.pwa_apply_rebate_settlement_v1(text)','public.pwa_submit_operation_v2(text)']) r WHERE position('R184' IN pg_get_functiondef(r::regprocedure))=0;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V155: not patched: %',bad; END IF;
 IF obj_description('public.pwa_apply_rebate_settlement_v1(text)'::regprocedure,'pg_proc') NOT LIKE 'mw-access:governance%' THEN RAISE EXCEPTION 'V155: the command lost its governance comment'; END IF;
 -- The CHECK texts.
 IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.pwa_rebate_settlements'::regclass AND conname='pwa_rebate_settlements_payment_method_check' AND convalidated)
   IS DISTINCT FROM $c$CHECK ((((offset_payment_id IS NULL) AND (payment_method = ANY (ARRAY['Bank Transfer'::text, 'Cash'::text]))) OR ((offset_payment_id IS NOT NULL) AND (payment_method = 'Referral Rebate Offset'::text))))$c$ THEN
  RAISE EXCEPTION 'V155: pwa_rebate_settlements_payment_method_check differs from the design'; END IF;
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint WHERE conname='pwa_versioned_outcome' AND conrelid='public.pwa_payment_commands'::regclass AND convalidated;
 IF definition IS NULL OR position($c$'rollover'::text, 'rebateSettlement'::text]) = '{}'::jsonb)$c$ IN definition)=0
  OR position($c$((NOT (result_json ? 'rebateSettlement'::text)) OR (((result_json ->> 'operation'::text) = 'rebate-settlement.create'::text) AND (jsonb_typeof((result_json -> 'rebateSettlement'::text)) = 'object'::text)))$c$ IN definition)=0
  OR position($c$'record_requires_reconciliation'::text, 'rollover_ineligible'::text]$c$ IN definition)=0 THEN RAISE EXCEPTION 'V155: pwa_versioned_outcome differs from the design'; END IF;
 -- The new column and the table's keys.
 IF NOT EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) WHERE c.conrelid='public.pwa_rebate_settlements'::regclass AND c.contype='f'
   AND c.confrelid='public."Payments"'::regclass AND a.attname='offset_payment_id' AND c.confdeltype='a')
  OR NOT EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) WHERE c.conrelid='public.pwa_rebate_settlements'::regclass AND c.contype='u' AND a.attname='offset_payment_id' AND cardinality(c.conkey)=1)
  OR (SELECT count(*) FROM pg_constraint c WHERE c.conrelid='public.pwa_rebate_settlement_allocations'::regclass AND c.contype='f' AND c.confdeltype='a' AND c.confrelid IN ('public.pwa_rebate_settlements'::regclass,'public."Business Expenses"'::regclass))<>2
  OR NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.pwa_rebate_settlement_allocations'::regclass AND c.contype='p' AND cardinality(c.conkey)=2)
  OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.pwa_rebate_settlement_allocations'::regclass AND NOT tgisinternal) THEN RAISE EXCEPTION 'V155: the new table or column differs from the design'; END IF;
 -- Table ACL, exactly.
 IF (SELECT array_agg(pg_get_userbyid(a.grantee)||':'||a.privilege_type ORDER BY (pg_get_userbyid(a.grantee)||':'||a.privilege_type) COLLATE "C") FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
   WHERE c.oid='public.pwa_rebate_settlement_allocations'::regclass AND a.grantee<>c.relowner)
  IS DISTINCT FROM (SELECT array_agg(x ORDER BY x COLLATE "C") FROM unnest(ARRAY[app||':SELECT',journal||':DELETE',journal||':INSERT',journal||':SELECT']) x)
  OR (SELECT array_agg(a.attname::text ORDER BY a.attname::text COLLATE "C") FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE a.attrelid='public.pwa_rebate_settlement_allocations'::regclass AND x.grantee=notify_owner::regrole)
   IS DISTINCT FROM ARRAY['amount','expense_id'] THEN RAISE EXCEPTION 'V155: unexpected access to pwa_rebate_settlement_allocations'; END IF;
 -- The settlements keep their V137 access (the new column is covered by the existing table grants; none for the notify owner).
 IF (SELECT array_agg(a.attname::text ORDER BY a.attname::text COLLATE "C") FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE a.attrelid='public.pwa_rebate_settlements'::regclass AND x.grantee=notify_owner::regrole)
   IS DISTINCT FROM ARRAY['amount','id','payee_borrower_id','settlement_date'] THEN RAISE EXCEPTION 'V155: unexpected access to pwa_rebate_settlements'; END IF;
 -- The plan: the application role only, caller's rights, read only.
 IF (SELECT array_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END||':'||a.privilege_type) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.oid='public.pwa_rebate_offset_plan_v1(text,numeric,date)'::regprocedure AND a.grantee<>p.proowner) IS DISTINCT FROM ARRAY[app||':EXECUTE']
  OR (SELECT prosecdef OR provolatile<>'s' OR proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public'] FROM pg_proc WHERE oid='public.pwa_rebate_offset_plan_v1(text,numeric,date)'::regprocedure) THEN
  RAISE EXCEPTION 'V155: unexpected access to or attributes of pwa_rebate_offset_plan_v1'; END IF;
 -- D3: settlement rows and their cash entries untouched (the new column aside); every settlement's allocations sum to its
 -- amount; every rebate's pending amount and every referrer's owed total unchanged; the link null exactly when no allocation
 -- exists, and it names the rebate's only settlement.
 IF (SELECT md5(coalesce(string_agg((to_jsonb(s)-'offset_payment_id')::text,'|' ORDER BY s.id COLLATE "C"),''))||':'||count(*) FROM public.pwa_rebate_settlements s) IS DISTINCT FROM (SELECT rows_md5||':'||n FROM v155_settlements)
  OR EXISTS(SELECT 1 FROM public.pwa_rebate_settlements WHERE offset_payment_id IS NOT NULL)
  OR (SELECT md5(coalesce(string_agg(to_jsonb(c)::text,'|' ORDER BY c."Row ID" COLLATE "C"),'')) FROM public."Cash Ledger" c WHERE c."Source Type"='Rebate Settlement') IS DISTINCT FROM (SELECT rows_md5 FROM v155_ledger) THEN
  RAISE EXCEPTION 'V155: a settlement row or its cash entry changed'; END IF;
 SELECT string_agg(s.id,', ') INTO bad FROM public.pwa_rebate_settlements s WHERE s.amount IS DISTINCT FROM (SELECT sum(a.amount) FROM public.pwa_rebate_settlement_allocations a WHERE a.settlement_id=s.id);
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V155: the allocations of % do not sum to the settlement amount',bad; END IF;
 SELECT string_agg(o.payee,', ') INTO bad FROM v155_owed o WHERE public.pwa_rebates_owed_v1(o.payee) IS DISTINCT FROM o.owed;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V155: the owed total of % changed',bad; END IF;
 SELECT string_agg(o.id,', ') INTO bad FROM v155_pending o WHERE public.pwa_rebate_pending_v1(o.id) IS DISTINCT FROM o.pending;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V155: the pending amount of % changed',bad; END IF;
 SELECT string_agg(x."Row ID",', ') INTO bad FROM public."Business Expenses" x
  WHERE (x."Ref Rebate Settlement" IS NULL)<>NOT EXISTS(SELECT 1 FROM public.pwa_rebate_settlement_allocations a WHERE a.expense_id=x."Row ID")
   OR EXISTS(SELECT 1 FROM public.pwa_rebate_settlement_allocations a WHERE a.expense_id=x."Row ID" AND a.settlement_id IS DISTINCT FROM x."Ref Rebate Settlement");
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'V155: the settlement link of % differs from its allocations',bad; END IF;
END $check$;
