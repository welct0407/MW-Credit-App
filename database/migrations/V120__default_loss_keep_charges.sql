-- R109 Default Loan with a loss amount and kept charges (owner plan of 31 October / 1 November 2026; Archie's design).
-- Default Loan gains a loss amount and a "keep unpaid charges" switch. One governed operation, three outcomes:
--   1. full amount, keepCharges false: write off and close, exactly as before (charges written down to their paid
--      components with the originals in Notes, zero-cash loss pair for the outstanding principal, Defaulted, closed);
--   2. full amount, keepCharges true: the loss pair only; the charges stay collectable; outstanding 0, daily interest 0;
--      the loan stays open and accepts payments (the last payment closes it as usual); refused with no unpaid charge;
--   3. partial amount (keepCharges true required): the loss pair for the amount; outstanding and daily interest fall
--      (the V68 recompute from the frozen rate); repeatable once per loan per day.
-- Defaulted keeps its meaning (written off and closed). Default Loss Amount is the ledger sum of the loan's df10: pairs.
-- Functions and views only: no table, column, constraint, role, grant or trigger attachment change.
-- 1. Hand-off: pwa_apply_loan_source_v2 sets the transaction-local setting business_crud.default_request
--    {loan, op: post|undo, date, amount, keepCharges, actor} before its Loans UPDATE and clears it after; no new column.
--    keepCharges true raises "Default Loss Amount" by the amount (Defaulted untouched); false sets Defaulted, Close Date
--    and Closed By as before; Undo Default is the same UPDATE "Defaulted"=false as before, for both loan states.
-- 2. default_loan_transition reads and clears the request first (a request for another row is refused), then: undo
--    (request, or the legacy Defaulted true -> false) for an open or Defaulted loan; posting (request, or the legacy
--    ordinary-source Defaulted false -> true, amount = outstanding, keepCharges false); the Defaulted immutability block
--    unchanged; any other change of Default Loss Amount is accepted only when it equals the ledger sum. Every path that
--    posts or reverses re-derives Default Loss Amount from the ledger. Totals, outstanding and daily interest are left to
--    the trigger order (zz_vc_daily_interest, zz_vc_loan_row run after this trigger; Test-TriggerOrder.sql).
-- 3. post_loan_default(loan, date, actor, amount, keep) replaces the 3-argument function (same owner and ACL, proven
--    below): whole baht 1..outstanding (0 only to write off and close a fully lost loan), partial requires keep, keep
--    requires a daily-interest loan, a full amount that keeps charges requires an unpaid charge (else write off and close),
--    one posting per loan per day; the posting id is dated
--    df10:<length>:<loan>:<YYYY-MM-DD> on every path (legacy pairs keep their undated id); the write-down loop, with its
--    "A paid charge today prevents Default Loan" rule, runs only when keep is false.
-- 4. undo_loan_default reverses one event: a Defaulted loan its write-off (the posting key in the charges' evidence,
--    restoring the originals, and that day's pair when present); an open loan its latest pair (Charge Date, Row ID).
--    Each pair is verified on its own (zero cash, Principal = -Interest = amount > 0, one repayment).
-- 5. business_source_delete refuses a loan with any loss posting ("Undo Default before deleting this loan", P5B05).
-- 6. A default loss posting is not a charge of the schedule: generate_loan_charge, generate_due_charges,
--    loan_close_calculation_v83(text,date,text), forecast_schedule_v1, pwa_next_projected_charge_v1 and
--    pwa_next_bookable_charge_v1 ignore df10: rows when they look for today's or the latest charge (a loan with kept
--    charges keeps generating and forecasting at its reduced daily interest, and Loan Close never targets the posting).
--    Loans without a df10: row are unchanged (byte-identical plans and amounts).
-- 7. pwa_submit_operation_v2: loan.default inputs {businessDate, amount, keepCharges} (amount a whole-baht integer string
--    of at most 17 digits, 0 allowed; keepCharges a boolean), canonical order businessDate, amount, keepCharges. The
--    one-key form {businessDate} (requests saved by an earlier PWA build) stays valid: write off and close, as before.
--    pwa_apply_loan_source_v2 maps the new refusals to P5B06 (record_requires_reconciliation).
-- 8. Views (column lists unchanged except the appended portfolio column): olap_borrowers_analytics "Default Count" and
--    "Lifetime Default Loss" count every loan with a loss, and "Largest/Average Successful Loan" leave such loans out;
--    reporting_borrower_payment_health_v1 default_count and recorded_default_loss the same; olap_portfolio_summary
--    appends "Total Principal Loss" (sum of Default Loss Amount over every loan).
-- Text-patched functions are CREATE OR REPLACE'd from their current definition with exact, counted replacements (V116
-- method), which keeps each owner, ACL and attribute; the self-check below proves them. Rollback: a later migration
-- restores the V60/V72 bodies, the 3-argument post_loan_default and the V114/V41 view bodies (the appended column stays).

DO $preflight$
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF to_regprocedure('public.post_loan_default(public."Loans",date,text)') IS NULL OR to_regprocedure('public.pwa_next_bookable_charge_v1(text,date)') IS NULL
  OR to_regclass('public.pwa_chat_proposals') IS NULL THEN RAISE EXCEPTION 'V120 needs V119'; END IF;
END $preflight$;

CREATE TEMP TABLE v120_acl ON COMMIT DROP AS
 SELECT p.oid::regprocedure::text AS routine,p.proname::text AS name,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl::text,'') AS acl,
  coalesce(p.proacl,acldefault('f',p.proowner)) AS effective,p.provolatile,p.prosecdef,p.proconfig
 FROM pg_proc p WHERE p.oid IN ('public.pwa_submit_operation_v2(text)'::regprocedure,'public.pwa_apply_loan_source_v2(text)'::regprocedure,
  'public.loan_close_calculation_v83(text,date,text)'::regprocedure,'public.generate_loan_charge(text,date,boolean)'::regprocedure,
  'public.generate_due_charges(date,text[])'::regprocedure,'public.forecast_schedule_v1(jsonb,jsonb,date,date)'::regprocedure,
  'public.pwa_next_projected_charge_v1(text,date)'::regprocedure,'public.pwa_next_bookable_charge_v1(text,date)'::regprocedure,
  'public.default_loan_transition()'::regprocedure,'public.undo_loan_default(public."Loans")'::regprocedure,
  'public.business_source_delete()'::regprocedure,'public.post_loan_default(public."Loans",date,text)'::regprocedure);

-- 2. The Loans state transition: one entry for posting and undo, request first.
CREATE OR REPLACE FUNCTION public.default_loan_transition() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE req jsonb; keep boolean; loss_date date; actor text; amount numeric; ledger money;
BEGIN
  IF TG_OP='INSERT' THEN
    IF coalesce(NEW."Defaulted",false) THEN RAISE EXCEPTION 'Create the loan before confirming default'; END IF;
    RETURN NEW;
  END IF;
  -- R109 (V120): the request of pwa_apply_loan_source_v2, read and cleared once, so it never reaches another row or statement.
  BEGIN req:=nullif(current_setting('business_crud.default_request',true),'')::jsonb;
  EXCEPTION WHEN OTHERS THEN req:='{}'::jsonb; END;
  IF req IS NOT NULL THEN
    PERFORM set_config('business_crud.default_request','',true);
    IF jsonb_typeof(req) IS DISTINCT FROM 'object' OR req->>'loan' IS DISTINCT FROM OLD."Row ID" OR NEW."Row ID" IS DISTINCT FROM OLD."Row ID"
      OR req->>'op' IS NULL OR req->>'op' NOT IN ('post','undo') THEN
      RAISE EXCEPTION 'Default request does not match this loan';
    END IF;
  END IF;
  -- Undo Default: the request (an open loan with a loss, or a Defaulted loan), or the legacy Defaulted true -> false.
  IF req->>'op'='undo' OR (req IS NULL AND coalesce(OLD."Defaulted",false) AND NEW."Defaulted"=false) THEN
    IF NEW."Principal Amount" IS DISTINCT FROM OLD."Principal Amount" OR NEW."Ref Borrowers" IS DISTINCT FROM OLD."Ref Borrowers" THEN
      RAISE EXCEPTION 'Undo default before changing loan inputs'; END IF;
    IF NOT coalesce(OLD."Defaulted",false) AND OLD."Loan Status" IS DISTINCT FROM 'ยังไม่ปิดยอด' THEN
      RAISE EXCEPTION 'Undo Default requires an open or Defaulted loan'; END IF;
    PERFORM public.undo_loan_default(OLD);
    IF coalesce(OLD."Defaulted",false) THEN
      NEW."Defaulted":=false; NEW."Loan Status":='ยังไม่ปิดยอด'; NEW."Close Date":=NULL; NEW."Closed By":=NULL;
    ELSE
      NEW."Defaulted":=OLD."Defaulted"; NEW."Loan Status":=OLD."Loan Status"; NEW."Close Date":=OLD."Close Date"; NEW."Closed By":=OLD."Closed By";
    END IF;
    NEW."Default Loss Amount":=(SELECT nullif(coalesce(sum(c."Principal Due"::numeric),0),0)::money FROM public."Charges" c
      WHERE c."Ref Loans"=NEW."Row ID" AND starts_with(c."Row ID",'df10:'));
    RETURN NEW;
  END IF;
  -- Default Loan: the request, or the legacy ordinary-source Defaulted false -> true (whole outstanding, write off and close).
  IF req->>'op'='post' OR (req IS NULL AND NOT coalesce(OLD."Defaulted",false) AND coalesce(NEW."Defaulted",false)) THEN
    IF NEW."Principal Amount" IS DISTINCT FROM OLD."Principal Amount" OR NEW."Ref Borrowers" IS DISTINCT FROM OLD."Ref Borrowers"
      OR NEW."Auto Charge Enabled" IS DISTINCT FROM OLD."Auto Charge Enabled" THEN
      RAISE EXCEPTION 'Do not change loan inputs while confirming default';
    END IF;
    IF req IS NULL THEN
      keep:=false; loss_date:=NEW."Close Date"; actor:=NEW."Closed By";
    ELSE
      BEGIN keep:=(req->>'keepCharges')::boolean; loss_date:=(req->>'date')::date; actor:=req->>'actor'; amount:=(req->>'amount')::numeric;
      EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Default request does not match this loan'; END;
      IF keep IS NULL OR amount IS NULL OR (keep AND (coalesce(NEW."Defaulted",false) IS DISTINCT FROM coalesce(OLD."Defaulted",false)
          OR NEW."Loan Status" IS DISTINCT FROM OLD."Loan Status" OR NEW."Close Date" IS DISTINCT FROM OLD."Close Date" OR NEW."Closed By" IS DISTINCT FROM OLD."Closed By"))
        OR (NOT keep AND (NOT coalesce(NEW."Defaulted",false) OR NEW."Close Date" IS DISTINCT FROM loss_date OR NEW."Closed By" IS DISTINCT FROM actor)) THEN
        RAISE EXCEPTION 'Default request does not match this loan';
      END IF;
    END IF;
    PERFORM public.post_loan_default(OLD,loss_date,actor,amount,keep);
    IF NOT keep THEN NEW."Loan Status":='ปิดยอดแล้ว'; END IF;
    NEW."Default Loss Amount":=(SELECT nullif(coalesce(sum(c."Principal Due"::numeric),0),0)::money FROM public."Charges" c
      WHERE c."Ref Loans"=NEW."Row ID" AND starts_with(c."Row ID",'df10:'));
    RETURN NEW;
  END IF;
  IF coalesce(OLD."Defaulted",false) THEN
    IF NEW."Defaulted" IS DISTINCT FROM OLD."Defaulted" OR NEW."Default Loss Amount" IS DISTINCT FROM OLD."Default Loss Amount"
      OR NEW."Loan Status" IS DISTINCT FROM OLD."Loan Status" OR NEW."Close Date" IS DISTINCT FROM OLD."Close Date"
      OR NEW."Closed By" IS DISTINCT FROM OLD."Closed By" OR NEW."Principal Amount" IS DISTINCT FROM OLD."Principal Amount"
      OR NEW."Ref Borrowers" IS DISTINCT FROM OLD."Ref Borrowers" THEN
      RAISE EXCEPTION 'Recorded default is immutable; use a reviewed correction';
    END IF;
    RETURN NEW;
  END IF;
  -- Any other change of the column must equal the ledger (a reviewed fixture or repair seeds the pair first).
  IF NEW."Default Loss Amount" IS DISTINCT FROM OLD."Default Loss Amount" THEN
    ledger:=(SELECT nullif(coalesce(sum(c."Principal Due"::numeric),0),0)::money FROM public."Charges" c
      WHERE c."Ref Loans"=NEW."Row ID" AND starts_with(c."Row ID",'df10:'));
    IF NEW."Default Loss Amount" IS DISTINCT FROM ledger THEN
      RAISE EXCEPTION 'Default loss amount changes only through Default Loan or Undo Default';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- 3. The loss posting: amount and keep flag; dated id; write-down only when the charges are not kept.
DROP FUNCTION public.post_loan_default(public."Loans",date,text);
CREATE FUNCTION public.post_loan_default(p_loan public."Loans", p_date date, p_actor text, p_amount numeric, p_keep boolean)
RETURNS numeric LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE prior text:=current_setting('business_crud.default',true); outstanding numeric; amount numeric; c record; posting text;
BEGIN
  IF pg_trigger_depth()=0 THEN RAISE EXCEPTION 'Confirm default through the Loans state transition'; END IF;
  -- The originating Loans UPDATE already owns its row lock. Never wait for a
  -- borrower held by a payment/generator that could be waiting for this loan.
  BEGIN
    PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=p_loan."Ref Borrowers" FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RAISE EXCEPTION 'Default requires an existing borrower'; END IF;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'Borrower is busy; sync and retry Default Loan';
  END;
  IF p_date IS DISTINCT FROM (statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date
    OR nullif(btrim(p_actor),'') IS NULL THEN
    RAISE EXCEPTION 'Default requires today confirmation date and actor; sync and confirm again';
  END IF;
  IF p_loan."Loan Status" IS DISTINCT FROM 'ยังไม่ปิดยอด'
    OR coalesce(p_loan."Defaulted",false) OR NOT coalesce(p_loan."Auto Charge Enabled",false)
    OR p_loan."Principal Amount" IS NULL THEN
    RAISE EXCEPTION 'Default requires an open auto-enabled nondefaulted loan';
  END IF;
  IF p_keep IS NULL THEN RAISE EXCEPTION 'Default request does not match this loan'; END IF;
  -- R109: kept charges go on generating at the reduced daily interest, which only a daily-interest loan has.
  IF p_keep AND p_loan."Loan Type" IS DISTINCT FROM 'ดอกเบี้ยรายวัน' THEN
    RAISE EXCEPTION 'Keeping unpaid charges requires a daily-interest loan';
  END IF;
  IF EXISTS(SELECT 1 FROM public."Payments" WHERE "Ref Borrower"=p_loan."Ref Borrowers" AND "Status" IN ('Processing','Error')) THEN
    RAISE EXCEPTION 'Resolve processing or error payments before default';
  END IF;
  PERFORM 1 FROM public."Charges" WHERE "Ref Loans"=p_loan."Row ID" ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
  SELECT p_loan."Principal Amount"::numeric-coalesce(sum("Principal Paid"::numeric),0)
    INTO outstanding FROM public."Repayments" WHERE "Ref Loans"=p_loan."Row ID";
  -- A fully lost loan (outstanding 0 after an earlier posting) may still be written off and closed, with no new pair.
  IF outstanding<=0 AND (p_keep OR coalesce(p_loan."Default Loss Amount"::numeric,0)<=0 OR outstanding<0) THEN
    RAISE EXCEPTION 'Default requires outstanding principal'; END IF;
  amount:=coalesce(p_amount,outstanding);
  IF p_amount IS NOT NULL AND (amount<>trunc(amount) OR amount<0 OR amount>outstanding OR (amount=0 AND (p_keep OR outstanding>0))) THEN
    RAISE EXCEPTION 'Default loss amount must be a whole baht amount between 1 and the outstanding principal'; END IF;
  IF amount<outstanding AND NOT p_keep THEN RAISE EXCEPTION 'Partial default loss must keep unpaid charges'; END IF;
  -- R109 (Chase D1): a full loss that keeps charges needs an unpaid charge to keep; otherwise the loan would stay open at 0
  -- with nothing left to close it. Write off and close instead. A partial loss keeps its principal and stays allowed.
  IF p_keep AND amount>=outstanding AND NOT EXISTS(SELECT 1 FROM public."Charges" ch WHERE ch."Ref Loans"=p_loan."Row ID" AND NOT starts_with(ch."Row ID",'df10:')
    AND coalesce(ch."Principal Due"::numeric,0)+coalesce(ch."Interest Due"::numeric,0)
     >(SELECT coalesce(sum(coalesce(r."Principal Paid"::numeric,0)+coalesce(r."Interest Paid"::numeric,0)),0) FROM public."Repayments" r WHERE r."Ref Charges"=ch."Row ID")) THEN
    RAISE EXCEPTION 'A full default loss with no unpaid charge must write off and close'; END IF;
  posting:='df10:'||length(p_loan."Row ID")||':'||p_loan."Row ID"||':'||p_date::text;
  IF amount>0 AND (EXISTS(SELECT 1 FROM public."Charges" WHERE "Row ID"=posting) OR EXISTS(SELECT 1 FROM public."Repayments" WHERE "Row ID"=posting)) THEN
    RAISE EXCEPTION 'One default loss posting per loan per day'; END IF;
  PERFORM set_config('business_crud.default',p_loan."Row ID",true);
  IF NOT p_keep THEN
    FOR c IN SELECT ch.*,coalesce(r.p,0) AS paid_p,coalesce(r.i,0) AS paid_i
      FROM public."Charges" ch LEFT JOIN LATERAL
        (SELECT sum("Principal Paid"::numeric) p,sum("Interest Paid"::numeric) i
         FROM public."Repayments" WHERE "Ref Charges"=ch."Row ID") r ON true
      WHERE ch."Ref Loans"=p_loan."Row ID" AND NOT starts_with(ch."Row ID",'df10:') ORDER BY ch."Row ID" COLLATE "C"
    LOOP
      IF c."Principal Due" IS NULL OR c."Interest Due" IS NULL OR c.paid_p<0 OR c.paid_i<0
        OR c."Principal Due"::numeric<c.paid_p OR c."Interest Due"::numeric<c.paid_i THEN
        RAISE EXCEPTION 'Charge components require reconciliation before default';
      END IF;
      IF c."Charge Date"=p_date AND c.paid_p+c.paid_i<>0
        AND c."Principal Due"::numeric+c."Interest Due"::numeric<=c.paid_p+c.paid_i THEN
        RAISE EXCEPTION 'A paid charge today prevents Default Loan';
      END IF;
      -- Record all original components so later undo can prove completeness.
      UPDATE public."Charges" SET "Principal Due"=c.paid_p::money,"Interest Due"=c.paid_i::money,
        "Notes"=concat_ws(E'\n',nullif(c."Notes",''),'Default write-off '||jsonb_build_object(
          'posting',posting,'date',p_date,'actor',p_actor,
          'original_principal',c."Principal Due"::numeric,'original_interest',c."Interest Due"::numeric,
          'written_off_principal',c."Principal Due"::numeric-c.paid_p,
          'written_off_interest',c."Interest Due"::numeric-c.paid_i)::text)
        WHERE "Row ID"=c."Row ID";
    END LOOP;
  END IF;
  IF amount>0 THEN
    INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes")
      VALUES(posting,p_loan."Row ID",p_date,amount::money,(-amount)::money,
        CASE WHEN p_keep THEN 'Loan default - principal loss recorded, unpaid charges kept; zero cash'
         ELSE 'Loan default - outstanding principal recorded as loss; zero cash' END);
    INSERT INTO public."Repayments"("Row ID","Payment Date","Principal Paid","Interest Paid","Notes","Ref Loans","Ref Charges","Created By")
      VALUES(posting,p_date,amount::money,(-amount)::money,
        CASE WHEN p_keep THEN 'หนี้สูญเงินต้น - เก็บรายการเรียกเก็บค้างชำระไว้ติดตาม / Loan default - principal loss recorded, unpaid charges kept'
         ELSE 'หนี้สูญ - บันทึกเงินต้นคงเหลือเป็นขาดทุน / Loan default - outstanding principal recorded as loss' END,
        p_loan."Row ID",posting,p_actor);
  END IF;
  PERFORM set_config('business_crud.default',coalesce(prior,''),true);
  RETURN amount;
END $$;

-- 4. Undo one event: a Defaulted loan's write-off (with that day's pair), else an open loan's latest pair.
CREATE OR REPLACE FUNCTION public.undo_loan_default(p public."Loans") RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $_$
#variable_conflict use_column
DECLARE posting text; pair_count integer; c record; evidence jsonb; prefix text; prior text:=current_setting('business_crud.default',true);
BEGIN
 IF pg_trigger_depth()=0 THEN RAISE EXCEPTION 'Undo default through Loans.Defaulted'; END IF;
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=p."Ref Borrowers" FOR UPDATE NOWAIT;
 PERFORM 1 FROM public."Charges" WHERE "Ref Loans"=p."Row ID" ORDER BY "Row ID" COLLATE "C" FOR UPDATE NOWAIT;
 IF coalesce(p."Defaulted",false) THEN
  -- The write-off event: the posting key every written-down charge records (legacy write-offs carry the undated id).
  FOR c IN SELECT ch."Notes" FROM public."Charges" ch WHERE ch."Ref Loans"=p."Row ID" AND NOT starts_with(ch."Row ID",'df10:')
    AND coalesce(ch."Notes",'') LIKE '%Default write-off %' ORDER BY ch."Row ID" COLLATE "C" LOOP
   BEGIN evidence:=substring(c."Notes" from 'Default write-off (\{[^\n]*\})$')::jsonb;
   EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Default charge evidence is malformed; reconcile before undo'; END;
   IF evidence->>'posting' IS NULL OR (posting IS NOT NULL AND posting<>evidence->>'posting') THEN
    RAISE EXCEPTION 'Default charge changed since write-off; reconcile before undo'; END IF;
   posting:=evidence->>'posting';
  END LOOP;
 END IF;
 IF posting IS NULL THEN
  SELECT c."Row ID" INTO posting FROM public."Charges" c JOIN public."Repayments" r ON r."Row ID"=c."Row ID"
   WHERE c."Ref Loans"=p."Row ID" AND starts_with(c."Row ID",'df10:')
   ORDER BY c."Charge Date" DESC,c."Row ID" COLLATE "C" DESC LIMIT 1;
  IF posting IS NULL THEN
   IF coalesce(p."Defaulted",false) THEN RAISE EXCEPTION 'Default loss posting no longer matches; reconcile its components before undo'; END IF;
   RAISE EXCEPTION 'Undo Default requires a recorded default loss';
  END IF;
 END IF;
 -- Verify the event's pair on its own. Only a write-off of a fully lost loan (amount 0) has no pair of its own.
 SELECT count(*) INTO pair_count FROM public."Charges" WHERE "Row ID"=posting;
 IF pair_count>0 OR NOT coalesce(p."Defaulted",false) OR NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"=p."Row ID" AND starts_with("Row ID",'df10:')) THEN
  IF NOT EXISTS(SELECT 1 FROM public."Repayments" r JOIN public."Charges" c ON c."Row ID"=r."Ref Charges"
    WHERE r."Row ID"=posting AND c."Row ID"=posting AND r."Ref Loans"=p."Row ID" AND c."Ref Loans"=p."Row ID"
     AND r."Ref Payment" IS NULL AND c."Principal Due"::numeric>0 AND r."Principal Paid"=c."Principal Due"
     AND r."Interest Paid"::numeric=-c."Principal Due"::numeric AND c."Interest Due"::numeric=-c."Principal Due"::numeric)
   OR (SELECT count(*) FROM public."Repayments" WHERE "Ref Charges"=posting)<>1 THEN
   RAISE EXCEPTION 'Default loss posting no longer matches; reconcile its components before undo'; END IF;
 END IF;
 PERFORM set_config('business_crud.default',p."Row ID",true);
 DELETE FROM public."Repayments" WHERE "Row ID"=posting;
 DELETE FROM public."Charges" WHERE "Row ID"=posting;
 IF coalesce(p."Defaulted",false) THEN
  FOR c IN SELECT * FROM public."Charges" WHERE "Ref Loans"=p."Row ID" AND NOT starts_with("Row ID",'df10:') LOOP
   IF coalesce(c."Notes",'') NOT LIKE '%Default write-off %' THEN
    IF c."Principal Due"::numeric+c."Interest Due"::numeric>0 AND
     c."Principal Due"::numeric=(SELECT coalesce(sum("Principal Paid"::numeric),0) FROM public."Repayments" WHERE "Ref Charges"=c."Row ID") AND
     c."Interest Due"::numeric=(SELECT coalesce(sum("Interest Paid"::numeric),0) FROM public."Repayments" WHERE "Ref Charges"=c."Row ID") THEN CONTINUE; END IF;
    RAISE EXCEPTION 'Default charge has no original component evidence; reconcile before undo';
   END IF;
   prefix:=substring(c."Notes" from '(?s)^(.*)Default write-off \{[^\n]*\}$');
   BEGIN evidence:=substring(c."Notes" from 'Default write-off (\{[^\n]*\})$')::jsonb;
   EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Default charge evidence is malformed; reconcile before undo'; END;
   IF evidence IS NULL OR evidence->>'posting' IS DISTINCT FROM posting OR
    c."Principal Due"::numeric IS DISTINCT FROM (evidence->>'original_principal')::numeric-(evidence->>'written_off_principal')::numeric OR
    c."Interest Due"::numeric IS DISTINCT FROM (evidence->>'original_interest')::numeric-(evidence->>'written_off_interest')::numeric THEN
    RAISE EXCEPTION 'Default charge changed since write-off; reconcile before undo'; END IF;
   UPDATE public."Charges" SET "Principal Due"=(evidence->>'original_principal')::numeric::money,
    "Interest Due"=(evidence->>'original_interest')::numeric::money,"Notes"=nullif(regexp_replace(prefix,E'\n$',''),'')
    WHERE "Row ID"=c."Row ID";
  END LOOP;
 END IF;
 PERFORM set_config('business_crud.default',coalesce(prior,''),true);
END $_$;

-- 5. A loan with any loss posting is not deleted (also an open loan with kept charges).
CREATE OR REPLACE FUNCTION public.business_source_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE expected_source text:=CASE TG_TABLE_NAME WHEN 'Loans' THEN 'Loan' WHEN 'Business Expenses' THEN 'Business Expense' WHEN 'Settlements' THEN 'Settlement' END;
BEGIN
 IF TG_TABLE_NAME='Loans' THEN
  IF coalesce((to_jsonb(OLD)->>'Defaulted')::boolean,false)
   OR EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"=OLD."Row ID" AND starts_with("Row ID",'df10:')) THEN
   RAISE EXCEPTION 'Undo Default before deleting this loan'; END IF;
  IF EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Loans"=OLD."Row ID") THEN
   RAISE EXCEPTION 'Loan has receipts; delete or reassign those receipts first'; END IF;
  DELETE FROM public."Charges" WHERE "Ref Loans"=OLD."Row ID";
 END IF;
 DELETE FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"=expected_source
  AND "Source Key"=CASE expected_source WHEN 'Loan' THEN 'LOAN:' WHEN 'Business Expense' THEN 'EXPENSE:' WHEN 'Settlement' THEN 'SETTLEMENT:' END||OLD."Row ID";
 RETURN OLD;
END $$;

-- 6 and 7. Exact, counted replacements in the current definitions (V116 method).
DO $patch$
DECLARE routine text; definition text; k integer; edits text[][]; patches jsonb:=jsonb_build_array(
 jsonb_build_object('routine','public.generate_loan_charge(text,date,boolean)','edits',jsonb_build_array(
  jsonb_build_array($o$  SELECT min("Row ID") INTO existing FROM public."Charges"
    WHERE "Ref Loans"=p_loan AND "Charge Date"=p_business_date;$o$,
   $n$  -- R109 (V120): a default loss posting (df10:) is not a charge of the schedule.
  SELECT min("Row ID") INTO existing FROM public."Charges"
    WHERE "Ref Loans"=p_loan AND "Charge Date"=p_business_date AND NOT starts_with("Row ID",'df10:');$n$),
  jsonb_build_array($o$    SELECT max("Charge Date") INTO latest FROM public."Charges"
      WHERE "Ref Loans"=p_loan AND "Charge Date"<=p_business_date;$o$,
   $n$    SELECT max("Charge Date") INTO latest FROM public."Charges"
      WHERE "Ref Loans"=p_loan AND "Charge Date"<=p_business_date AND NOT starts_with("Row ID",'df10:');$n$))),
 jsonb_build_object('routine','public.generate_due_charges(date,text[])','edits',jsonb_build_array(
  jsonb_build_array($o$    IF EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"=l."Row ID" AND "Charge Date"=p_business_date) THEN CONTINUE; END IF;$o$,
   $n$    IF EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"=l."Row ID" AND "Charge Date"=p_business_date AND NOT starts_with("Row ID",'df10:')) THEN CONTINUE; END IF;$n$))),
 jsonb_build_object('routine','public.loan_close_calculation_v83(text,date,text)','edits',jsonb_build_array(
  jsonb_build_array($o$ SELECT max("Charge Date") INTO opening FROM public."Charges" WHERE "Ref Loans"=p_loan AND "Charge Date"<=p_day;$o$,
   $n$ -- R109 (V120): a default loss posting (df10:) is never today's, the latest or the target charge.
 SELECT max("Charge Date") INTO opening FROM public."Charges" WHERE "Ref Loans"=p_loan AND "Charge Date"<=p_day AND NOT starts_with("Row ID",'df10:');$n$),
  jsonb_build_array($o$ SELECT count(*),min("Row ID") INTO today_count,target FROM public."Charges" WHERE "Ref Loans"=p_loan AND "Charge Date"=p_day;$o$,
   $n$ SELECT count(*),min("Row ID") INTO today_count,target FROM public."Charges" WHERE "Ref Loans"=p_loan AND "Charge Date"=p_day AND NOT starts_with("Row ID",'df10:');$n$),
  jsonb_build_array($o$  SELECT max("Charge Date") INTO latest FROM public."Charges" WHERE "Ref Loans"=p_loan AND "Charge Date"<=p_day;$o$,
   $n$  SELECT max("Charge Date") INTO latest FROM public."Charges" WHERE "Ref Loans"=p_loan AND "Charge Date"<=p_day AND NOT starts_with("Row ID",'df10:');$n$),
  jsonb_build_array($o$ IF target IS NULL THEN SELECT "Row ID" INTO target FROM public."Charges" WHERE "Ref Loans"=p_loan ORDER BY$o$,
   $n$ IF target IS NULL THEN SELECT "Row ID" INTO target FROM public."Charges" WHERE "Ref Loans"=p_loan AND NOT starts_with("Row ID",'df10:') ORDER BY$n$))),
 jsonb_build_object('routine','public.forecast_schedule_v1(jsonb,jsonb,date,date)','edits',jsonb_build_array(
  jsonb_build_array($o$ IF t IS NULL OR e<t OR e>t+93 THEN RAISE EXCEPTION 'Forecast window invalid'; END IF;$o$,
   $n$ IF t IS NULL OR e<t OR e>t+93 THEN RAISE EXCEPTION 'Forecast window invalid'; END IF;
 -- R109 (V120): a default loss posting (df10:) is not an obligation; a loan with kept charges forecasts as an open loan.
 charges:=(SELECT coalesce(jsonb_agg(value),'[]'::jsonb) FROM jsonb_array_elements(coalesce(charges,'[]'::jsonb)) WHERE NOT starts_with(coalesce(value->>'id',''),'df10:'));$n$))),
 jsonb_build_object('routine','public.pwa_next_projected_charge_v1(text,date)','edits',jsonb_build_array(
  jsonb_build_array($o$   SELECT max(c."Charge Date") INTO latest FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND c."Charge Date"<=d;$o$,
   $n$   SELECT max(c."Charge Date") INTO latest FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND c."Charge Date"<=d AND NOT starts_with(c."Row ID",'df10:');$n$))),
 jsonb_build_object('routine','public.pwa_next_bookable_charge_v1(text,date)','edits',jsonb_build_array(
  jsonb_build_array($o$   SELECT max(c."Charge Date") INTO latest FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND c."Charge Date"<=d;$o$,
   $n$   SELECT max(c."Charge Date") INTO latest FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND c."Charge Date"<=d AND NOT starts_with(c."Row ID",'df10:');$n$))),
 jsonb_build_object('routine','public.pwa_submit_operation_v2(text)','edits',jsonb_build_array(
  jsonb_build_array($o$ ELSIF op IN('loan.default','loan.generate-charge') THEN$o$,
   $n$ ELSIF op='loan.default' AND (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['businessDate'] THEN
 -- R109 (V120): the loss amount (whole baht, 0 only for a fully lost loan, which SQL decides) and the keep-charges choice.
 -- The one-key form {businessDate} stays valid (requests saved by an earlier PWA): write off and close the whole principal.
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['amount','businessDate','keepCharges'] OR jsonb_typeof(i->'businessDate') IS DISTINCT FROM 'string' OR i->>'businessDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'businessDate')::date)::text<>i->>'businessDate' OR jsonb_typeof(i->'amount') IS DISTINCT FROM 'string' OR i->>'amount'!~'^(0|[1-9][0-9]{0,16})$' OR (i->>'amount')::numeric>92233720368547758 OR jsonb_typeof(i->'keepCharges') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'default input';END IF;
 input_text:='{"businessDate":'||to_json(i->>'businessDate')::text||',"amount":'||to_json(i->>'amount')::text||',"keepCharges":'||(i->'keepCharges')::text||'}';
 ELSIF op IN('loan.default','loan.generate-charge') THEN$n$))),
 jsonb_build_object('routine','public.pwa_apply_loan_source_v2(text)','edits',jsonb_build_array(
  jsonb_build_array($o$ WHEN 'loan.default' THEN UPDATE public."Loans" SET "Defaulted"=true,"Close Date"=(i->>'businessDate')::date,"Closed By"=a->>'loginEmail' WHERE "Row ID"=target;
 WHEN 'loan.undo-default' THEN UPDATE public."Loans" SET "Defaulted"=false WHERE "Row ID"=target;$o$,
   $n$ WHEN 'loan.default' THEN
  -- R109 (V120): the request carries the loss amount and keep-charges choice to default_loan_transition (no new column).
  -- The one-key form (no amount) is the ordinary write off and close of the whole outstanding principal, as before.
  IF i ? 'amount' THEN PERFORM set_config('business_crud.default_request',jsonb_build_object('loan',target,'op','post','date',i->>'businessDate','amount',i->>'amount','keepCharges',i->'keepCharges','actor',a->>'loginEmail')::text,true);END IF;
  IF (i->'keepCharges')='true'::jsonb THEN UPDATE public."Loans" SET "Default Loss Amount"=(coalesce("Default Loss Amount"::numeric,0)+(i->>'amount')::numeric)::money WHERE "Row ID"=target;
  ELSE UPDATE public."Loans" SET "Defaulted"=true,"Close Date"=(i->>'businessDate')::date,"Closed By"=a->>'loginEmail' WHERE "Row ID"=target;END IF;
  PERFORM set_config('business_crud.default_request','',true);
 WHEN 'loan.undo-default' THEN
  PERFORM set_config('business_crud.default_request',jsonb_build_object('loan',target,'op','undo','actor',a->>'loginEmail')::text,true);
  UPDATE public."Loans" SET "Defaulted"=false WHERE "Row ID"=target;
  PERFORM set_config('business_crud.default_request','',true);$n$),
  jsonb_build_array($o$'Default loss posting no longer matches; reconcile its components before undo','Default charge has no original component evidence; reconcile before undo','Default charge evidence is malformed; reconcile before undo','Default charge changed since write-off; reconcile before undo'
  ]) THEN$o$,
   $n$'Default loss posting no longer matches; reconcile its components before undo','Default charge has no original component evidence; reconcile before undo','Default charge evidence is malformed; reconcile before undo','Default charge changed since write-off; reconcile before undo',
   'Default loss amount must be a whole baht amount between 1 and the outstanding principal','Partial default loss must keep unpaid charges','One default loss posting per loan per day','Default loss amount changes only through Default Loan or Undo Default',
   'Undo Default requires a recorded default loss','Undo Default requires an open or Defaulted loan','Default request does not match this loan','Keeping unpaid charges requires a daily-interest loan','A full default loss with no unpaid charge must write off and close'
  ]) THEN$n$))));
 p jsonb; e jsonb; o text; n text;
BEGIN
 FOR p IN SELECT value FROM jsonb_array_elements(patches) LOOP
  routine:=p->>'routine';
  SELECT pg_get_functiondef(routine::regprocedure) INTO definition;
  IF position('R109 (V120)' IN definition)>0 THEN RAISE EXCEPTION 'V120: % already patched',routine; END IF;
  k:=0;
  FOR e IN SELECT value FROM jsonb_array_elements(p->'edits') LOOP
   k:=k+1;o:=e->>0;n:=e->>1;
   -- Bodies first created from a CRLF file (V83 and earlier) keep CRLF line ends; match them as written.
   IF position(o IN definition)=0 AND position(E'\n' IN o)>0 THEN o:=replace(o,E'\n',E'\r\n');n:=replace(n,E'\n',E'\r\n'); END IF;
   IF (length(definition)-length(replace(definition,o,'')))/length(o)<>1 THEN RAISE EXCEPTION 'V120: unexpected % boundary %',routine,k; END IF;
   definition:=replace(definition,o,n);
  END LOOP;
  EXECUTE definition;
 END LOOP;
END $patch$;

-- 8. Views: every loan with a loss counts as a default; the portfolio summary appends the lifetime principal loss.
-- olap_borrowers_analytics (the V114 body): "Default Count", "Lifetime Default Loss", and the two successful-loan figures.
CREATE OR REPLACE VIEW public.olap_borrowers_analytics AS
SELECT old_view.*, b."Ref Preferred Receiving Cash Account", b."Payment Request Cash Account", b."Payment Request Token"
FROM (
 WITH ctx AS (SELECT d, date_trunc('month',d)::date ms,
  (date_trunc('month',d)+interval '1 month - 1 day')::date me FROM (SELECT public.olap_reporting_date() d) q),

 lr AS (SELECT l."Ref Borrowers" id,
  count(*) FILTER(WHERE l."Loan Status"='ยังไม่ปิดยอด') active,
  max(l."Loan Age Days") FILTER(WHERE l."Loan Status"='ยังไม่ปิดยอด') oldest,
  greatest(0,max(l."Principal Amount"::numeric) FILTER(WHERE l."Loan Status"='ปิดยอดแล้ว' AND l."Defaulted"=false AND coalesce(l."Default Loss Amount"::numeric,0)=0)) largest,
  coalesce(avg(l."Principal Amount"::numeric) FILTER(WHERE l."Loan Status"='ปิดยอดแล้ว' AND l."Defaulted"=false AND coalesce(l."Default Loss Amount"::numeric,0)=0),0) average_success,
  count(*) FILTER(WHERE l."Defaulted"=true OR coalesce(l."Default Loss Amount"::numeric,0)>0) defaults,
  coalesce(sum(l."Default Loss Amount"::numeric),0) loss,
  coalesce(sum(l."30D Principal Days"),0) gross_days,coalesce(sum(l."Expected Interest This Month"),0) forecast,
  bool_or(l."Defaulted"=true AND l."Outstanding Principal">0) current_default
  FROM public.olap_loans_analytics l GROUP BY 1),
 rr AS (SELECT l."Ref Borrowers" id,
  coalesce(sum(r."Interest Paid"::numeric) FILTER(WHERE r."Payment Date" BETWEEN d-29 AND d AND r."Interest Paid"::numeric>0),0) profit30,
  coalesce(sum(r."Interest Paid"::numeric) FILTER(WHERE r."Payment Date">=d-10 AND r."Payment Date"<d AND r."Interest Paid"::numeric>0),0) profit10,
  coalesce(sum(r."Interest Paid"::numeric) FILTER(WHERE r."Payment Date" BETWEEN ms AND me),0) mtd,
  coalesce(sum(r."30D Principal Reduction Days"),0) reduction
  FROM public.olap_repayments_analytics r JOIN public."Loans" l ON l."Row ID"=r."Ref Loans" CROSS JOIN ctx GROUP BY 1),
 cash AS (SELECT c."Ref Collection Borrower" id,coalesce(sum(r."Amount Received"),0) collected
  FROM public.olap_repayments_analytics r JOIN public.olap_charges_analytics c ON c."Row ID"=r."Ref Charges"
  CROSS JOIN ctx WHERE r."Payment Date"=d AND c."Ref Collection Borrower" IS NOT NULL GROUP BY 1),
 cr AS (SELECT l."Ref Borrowers" id,
  coalesce(sum(c."Amount Remaining") FILTER(WHERE c."Charge Date"<d AND c."Payment Status" IS DISTINCT FROM 'ชำระแล้ว'),0) overdue,
  count(*) FILTER(WHERE c."Charge Date"<d AND c."Payment Status" IS DISTINCT FROM 'ชำระแล้ว') overdue_count,
  count(*) FILTER(WHERE c."Charge Date"<d) history,count(*) FILTER(WHERE c."Historical On Time") ontime,
  count(*) FILTER(WHERE c."Charge Date">=d-30 AND c."Charge Date"<d) recent_count,count(*) FILTER(WHERE c."Charge Date">=d-30 AND c."Charge Date"<d AND c."Historical On Time") recent_ontime,
  count(*) FILTER(WHERE c."Historical Late") late_count,count(*) FILTER(WHERE c."Charge Date">=d-30 AND c."Charge Date"<d AND c."Historical Late") recent_late,
  greatest(0,max(c."Days Late")) max_late,max(c."Charge Date") FILTER(WHERE c."Days Late">0) last_late,
  count(*) FILTER(WHERE c."Charge Date">=d-180 AND c."Charge Date"<d) history180,count(*) FILTER(WHERE c."Charge Date">=d-180 AND c."Charge Date"<d AND c."Historical On Time") ontime180,
  count(*) FILTER(WHERE c."Charge Date">=d-90 AND c."Charge Date"<d) history90,bool_or(l."Defaulted") FILTER(WHERE c."Charge Date">=d-90 AND c."Charge Date"<d) default90,
  greatest(0,max(c."Days Late") FILTER(WHERE c."Charge Date">=d-90 AND c."Charge Date"<d)) late90,
  greatest(0,max(c."Days Late") FILTER(WHERE c."Charge Date"<d AND c."Amount Remaining">0)) unpaid_late,
  bool_or(c."Total Paid">0) FILTER(WHERE c."Charge Date"=d AND c."Amount Remaining">0) partial_today,
  count(*) FILTER(WHERE c."Charge Date"=d AND c."Amount Remaining">0) unpaid_today,
  min(c."Charge Date") FILTER(WHERE c."Charge Date"<d) first_history,
  count(*) FILTER(WHERE c."Ref Collection Borrower" IS NOT NULL) collection_count,
  count(*) FILTER(WHERE c."Ref Collection Borrower" IS NOT NULL AND c."Charge Date"<d AND c."Payment Status" IS DISTINCT FROM 'ชำระแล้ว') collection_overdue,
  count(*) FILTER(WHERE c."Ref Collection Borrower" IS NOT NULL AND c."Charge Date"<d-7 AND c."Payment Status" IS DISTINCT FROM 'ชำระแล้ว') collection_long_overdue,
  count(*) FILTER(WHERE c."Ref Collection Borrower" IS NOT NULL AND c."Payment Status"='รอชำระ') collection_pending,
  count(*) FILTER(WHERE c."Ref Collection Borrower" IS NOT NULL AND c."Payment Status"='ชำระบางส่วน') collection_partial,
  count(*) FILTER(WHERE c."Ref Collection Borrower" IS NOT NULL AND c."Payment Status"='ชำระแล้ว') collection_paid,
  coalesce(sum(c."Amount Due") FILTER(WHERE c."Ref Collection Borrower" IS NOT NULL AND c."Charge Date"<=d),0) collection_due,
  coalesce(sum(c."Amount Remaining") FILTER(WHERE c."Ref Collection Borrower" IS NOT NULL AND c."Charge Date"<=d),0) collection_remaining,
  coalesce(sum(c."Interest Remaining") FILTER(WHERE c."Charge Date"<=d),0) interest_remaining
  FROM public.olap_charges_analytics c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans" CROSS JOIN ctx GROUP BY 1),
 er AS (SELECT "Ref Payee Borrower" id,sum("Amount"::numeric) rebate FROM public."Business Expenses" WHERE "Source Type"='Referral Rebate' GROUP BY 1),
 pt AS (SELECT coalesce(sum("Outstanding Principal"),0) portfolio FROM public."Loans"),
 bt AS (SELECT coalesce(sum("Total Outstanding Principal"),0) borrower_portfolio,
  count(*) FILTER(WHERE "Has Active Loan"=true) active_borrowers FROM public."Borrowers"),
 a AS (SELECT b.*,
  CASE WHEN b."Total Outstanding Principal">0 THEN b."Active Loan Interest Earned"/b."Total Outstanding Principal" ELSE 0 END "Return on Active Principal",
  coalesce(rr.profit30,0) "Profit Last 30 Days",coalesce(rr.profit10,0) "Profit Last 10 Days",
  CASE WHEN b."Total Outstanding Principal"<=0 THEN NULL WHEN b."Active Loan Interest Earned">=b."Total Outstanding Principal" THEN d
  WHEN b."Active Daily Interest">0 THEN d+ceil((b."Total Outstanding Principal"-b."Active Loan Interest Earned")/b."Active Daily Interest")::integer END "Projected Interest Coverage Date",
  coalesce(b."Total Interest Earned",0)-coalesce(b."Active Loan Interest Earned",0) "Closed Loan Interest Earned",
  coalesce(b."Total Amount Loaned",0)-coalesce(b."Total Outstanding Principal",0) "Closed Loan Principle",
  coalesce(lr.gross_days,0) "30D Gross Principal Days",coalesce(rr.reduction,0) "30D Principal Reduction Days",
  round((coalesce(lr.gross_days,0)-coalesce(rr.reduction,0))/30) "30D Average Outstanding Principal",
  CASE WHEN coalesce(cr.collection_count,0)=0 THEN NULL WHEN cr.collection_long_overdue>0 THEN 'Long Overdue' WHEN cr.collection_overdue>0 THEN 'Overdue'
  WHEN cr.collection_pending=0 AND cr.collection_partial=0 THEN 'Fully Paid'
  WHEN cr.collection_partial>0 OR (cr.collection_paid>0 AND cr.collection_pending>0) THEN 'Partially Paid' ELSE 'Not Paid' END "Daily Collection Status",
  coalesce(cr.collection_due,0) "Todays Amount Due",coalesce(cash.collected,0) "Todays Amount Collected",coalesce(cr.collection_remaining,0) "Todays Amount Remaining",
  CASE WHEN bt.borrower_portfolio=0 THEN 0 ELSE coalesce(b."Total Outstanding Principal",0)/bt.borrower_portfolio END "Portfolio Exposure %",
  coalesce(lr.active,0) "Active Loan Count",coalesce(lr.oldest,0) "Oldest Active Loan Age",
  coalesce(cr.overdue,0) "Overdue Amount",coalesce(cr.overdue_count,0) "Overdue Charge Count",
  coalesce(cr.history,0) "Historical Charge Count",coalesce(cr.ontime,0) "On Time Charge Count",
  coalesce(cr.recent_count,0) "Recent 30D Charge Count",coalesce(cr.recent_ontime,0) "Recent 30D On Time Count",
  coalesce(cr.late_count,0) "Lifetime Late Payment Count",coalesce(cr.recent_late,0) "Recent 30D Late Payment Count",
  coalesce(cr.max_late,0) "Maximum Days Late",cr.last_late "Last Late Payment Date",
  coalesce(lr.largest,0) "Largest Successful Loan",round(coalesce(lr.average_success,0)) "Average Successful Loan Size",
  coalesce(lr.defaults,0) "Default Count",coalesce(lr.loss,0) "Lifetime Default Loss",pt.portfolio "Portfolio Outstanding Principal",
  coalesce(rr.mtd,0)+coalesce(cr.interest_remaining,0)+coalesce(lr.forecast,0) "Projected Monthly Profit Contribution",
  bt.active_borrowers "Matrix Active Borrower Count",1/nullif(bt.active_borrowers,0) "Matrix Equal Share Benchmark",
  cr.recent_ontime*100/nullif(cr.recent_count,0) "Matrix Recent Reliability Score",
  cr.ontime180*100/nullif(cr.history180,0) "Matrix Historical Reliability Score",
  CASE WHEN coalesce(cr.history90,0)=0 THEN NULL WHEN cr.default90 THEN 0 WHEN cr.late90=0 THEN 100 WHEN cr.late90<=1 THEN 90 WHEN cr.late90<=3 THEN 70 WHEN cr.late90<=7 THEN 40 ELSE 10 END "Matrix Delay Severity Score",
  CASE WHEN lr.current_default THEN 0 WHEN cr.unpaid_late>3 THEN 20 WHEN cr.unpaid_late>=2 THEN 40 WHEN cr.unpaid_late>=1 THEN 60 WHEN cr.partial_today THEN 75 WHEN cr.unpaid_today>0 THEN 90 ELSE 100 END "Matrix Current Condition Score",
  coalesce(d-cr.first_history>=3,true) "Matrix History Sufficient",
  coalesce(er.rebate,0) "Total Referral Rebate Earned"
  FROM public."Borrowers" b CROSS JOIN ctx CROSS JOIN pt CROSS JOIN bt
  LEFT JOIN lr ON lr.id=b."Row ID" LEFT JOIN rr ON rr.id=b."Row ID" LEFT JOIN cr ON cr.id=b."Row ID"
  LEFT JOIN cash ON cash.id=b."Row ID" LEFT JOIN er ON er.id=b."Row ID"),
 b AS (SELECT a.*,
  CASE WHEN "Has Closed Loan" AND "Closed Loan Principle">0 THEN "Closed Loan Interest Earned"/"Closed Loan Principle" ELSE 0 END "Return on Closed Loans",
  CASE WHEN "30D Average Outstanding Principal">0 THEN "Profit Last 30 Days"/"30D Average Outstanding Principal" ELSE 0 END "30D Return on Average Principal",
  CASE WHEN "Historical Charge Count"=0 THEN 0 ELSE "On Time Charge Count"/"Historical Charge Count" END "Lifetime On Time Rate",
  CASE WHEN "Recent 30D Charge Count"=0 THEN 0 ELSE "Recent 30D On Time Count"/"Recent 30D Charge Count" END "Recent 30D On Time Rate",
  CASE WHEN sum("Profit Last 10 Days") FILTER(WHERE "Has Active Loan") OVER()>0
  THEN round("Profit Last 10 Days"/sum("Profit Last 10 Days") FILTER(WHERE "Has Active Loan") OVER(),2) END "Matrix Economic Contribution",
  trunc(round(10*(coalesce("Matrix Recent Reliability Score"*0.45,0)+coalesce("Matrix Historical Reliability Score"*0.20,0)+coalesce("Matrix Delay Severity Score"*0.20,0)+"Matrix Current Condition Score"*0.15)
  /(CASE WHEN "Matrix Recent Reliability Score" IS NOT NULL THEN 0.45 ELSE 0 END+CASE WHEN "Matrix Historical Reliability Score" IS NOT NULL THEN 0.20 ELSE 0 END+CASE WHEN "Matrix Delay Severity Score" IS NOT NULL THEN 0.20 ELSE 0 END+0.15))/10) "Matrix Stability Score"
  FROM a),
 c AS (SELECT b.*,least(1,coalesce("Matrix Economic Contribution",0)*"Matrix Active Borrower Count"/2) "Matrix Scaled Economic Contribution" FROM b),
 final AS (SELECT c.*,CASE WHEN "Has Active Loan"=false THEN NULL
  WHEN "Matrix Economic Contribution" IS NULL OR "Matrix Scaled Economic Contribution" IS NULL THEN 'Unclassified'
  WHEN "Matrix History Sufficient"=false THEN 'Provisional - insufficient history'
  WHEN "Matrix Economic Contribution">="Matrix Equal Share Benchmark" AND "Matrix Scaled Economic Contribution">=0.5 THEN 'Star'
  WHEN "Matrix Economic Contribution"<"Matrix Equal Share Benchmark" AND "Matrix Scaled Economic Contribution">=0.5 THEN 'Cash Cow'
  WHEN "Matrix Economic Contribution">="Matrix Equal Share Benchmark" AND "Matrix Scaled Economic Contribution"<0.5 THEN 'Question Mark' ELSE 'Dog' END "Matrix Quadrant" FROM c)

 SELECT x."Row ID",
  x."Borrower Name",
  x."Description",
  x."Creation Date",
  x."Hidden Flag",
  x."Communication Name",
  x."Instagram Username",
  x."AI Collection Enabled",
  x."City",
  x."Working Location",
  x."Address",
  x."Total Interest Earned",
  x."Total Amount Loaned",
  x."Total Number of Loans",
  x."Total Outstanding Principal",
  x."Active Loan Interest Earned",
  x."Active Daily Interest",
  x."Has Closed Loan",
  x."Has Active Loan",
  x."Ref Referrer",
  round(x."Return on Active Principal"::numeric,2) AS "Return on Active Principal",
  round(x."Profit Last 30 Days"::numeric,0) AS "Profit Last 30 Days",
  x."Projected Interest Coverage Date",
  round(x."Closed Loan Interest Earned"::numeric,0) AS "Closed Loan Interest Earned",
  round(x."Closed Loan Principle"::numeric,0) AS "Closed Loan Principle",
  round(x."Return on Closed Loans"::numeric,2) AS "Return on Closed Loans",
  round(x."30D Gross Principal Days"::numeric,0) AS "30D Gross Principal Days",
  round(x."30D Principal Reduction Days"::numeric,0) AS "30D Principal Reduction Days",
  round(x."30D Average Outstanding Principal"::numeric,0) AS "30D Average Outstanding Principal",
  round(x."30D Return on Average Principal"::numeric,2) AS "30D Return on Average Principal",
  x."Daily Collection Status",
  round(x."Todays Amount Due"::numeric,0) AS "Todays Amount Due",
  round(x."Todays Amount Collected"::numeric,0) AS "Todays Amount Collected",
  round(x."Todays Amount Remaining"::numeric,0) AS "Todays Amount Remaining",
  round(x."Portfolio Exposure %"::numeric,4) AS "Portfolio Exposure %",
  x."Active Loan Count",
  x."Oldest Active Loan Age",
  round(x."Overdue Amount"::numeric,0) AS "Overdue Amount",
  x."Overdue Charge Count",
  x."Historical Charge Count",
  x."On Time Charge Count",
  round(x."Lifetime On Time Rate"::numeric,4) AS "Lifetime On Time Rate",
  x."Recent 30D Charge Count",
  x."Recent 30D On Time Count",
  round(x."Recent 30D On Time Rate"::numeric,4) AS "Recent 30D On Time Rate",
  x."Lifetime Late Payment Count",
  x."Recent 30D Late Payment Count",
  x."Maximum Days Late",
  x."Last Late Payment Date",
  round(x."Largest Successful Loan"::numeric,2) AS "Largest Successful Loan",
  round(x."Average Successful Loan Size"::numeric,2) AS "Average Successful Loan Size",
  x."Default Count",
  round(x."Lifetime Default Loss"::numeric,2) AS "Lifetime Default Loss",
  round(x."Portfolio Outstanding Principal"::numeric,0) AS "Portfolio Outstanding Principal",
  round(x."Projected Monthly Profit Contribution"::numeric,0) AS "Projected Monthly Profit Contribution",
  x."Matrix Active Borrower Count",
  round(x."Matrix Equal Share Benchmark"::numeric,4) AS "Matrix Equal Share Benchmark",
  round(x."Matrix Economic Contribution"::numeric,2) AS "Matrix Economic Contribution",
  x."Matrix Recent Reliability Score",
  x."Matrix Historical Reliability Score",
  x."Matrix Delay Severity Score",
  x."Matrix Current Condition Score",
  x."Matrix History Sufficient",
  x."Matrix Stability Score",
  x."Matrix Quadrant",
  round(x."Profit Last 10 Days"::numeric,0) AS "Profit Last 10 Days",
  round(x."Matrix Scaled Economic Contribution"::numeric,4) AS "Matrix Scaled Economic Contribution",
  round(x."Total Referral Rebate Earned"::numeric,0) AS "Total Referral Rebate Earned" FROM final x
) old_view JOIN public."Borrowers" b ON b."Row ID"=old_view."Row ID";

-- olap_portfolio_summary (the V114 body): every existing column unchanged, "Total Principal Loss" appended last.
CREATE OR REPLACE VIEW public.olap_portfolio_summary AS
WITH ctx AS (SELECT d, date_trunc('month',d)::date ms,
 (date_trunc('month',d)+interval '1 month - 1 day')::date me FROM (SELECT public.olap_reporting_date() d) q),

lr AS (SELECT coalesce(sum("Outstanding Principal"),0) principal,count(*) FILTER(WHERE "Loan Status"='ยังไม่ปิดยอด') active,
 coalesce(sum("Expected Interest This Month"),0) forecast,coalesce(sum("Principal Days MTD"),0) days,
 coalesce(sum("Expected Daily Interest Amount"),0) daily,coalesce(sum("Total Interest Received") FILTER(WHERE "Loan Status"='ยังไม่ปิดยอด'),0) active_profit,
 coalesce(sum("Default Loss Amount"::numeric),0) principal_loss FROM public.olap_loans_analytics),
rr AS (SELECT coalesce(sum("Interest Paid"::numeric),0) profit,coalesce(sum("Interest Paid"::numeric) FILTER(WHERE "Payment Date"=d),0) today,
 coalesce(sum("Interest Paid"::numeric) FILTER(WHERE "Payment Date"=d-1),0) yesterday,coalesce(sum("Interest Paid"::numeric) FILTER(WHERE "Payment Date" BETWEEN ms AND me),0) mtd,
 coalesce(sum("Principal Returned Days MTD"),0) returned_days,coalesce(sum("Partner A Profit"),0) profit_a,coalesce(sum("Partner B Profit"),0) profit_b
 FROM public.olap_repayments_analytics CROSS JOIN ctx),
cr AS (SELECT coalesce(sum("Amount Remaining") FILTER(WHERE nullif("Ref Loans",'') IS NOT NULL AND "Charge Date"<=d),0) pending,
 coalesce(sum("Interest Remaining") FILTER(WHERE nullif("Ref Loans",'') IS NOT NULL AND "Charge Date"<=d),0) interest,
 coalesce(sum("Amount Due") FILTER(WHERE "Charge Date"=d),0) due,coalesce(sum("Total Paid") FILTER(WHERE "Charge Date"=d),0) paid,
 coalesce(sum("Amount Remaining") FILTER(WHERE "Charge Date"=d),0) remaining FROM public.olap_charges_analytics CROSS JOIN ctx),
br AS (SELECT count(*) FILTER(WHERE "Daily Collection Status"='Fully Paid') full_count,count(*) FILTER(WHERE "Daily Collection Status"='Partially Paid') partial_count,
 count(*) FILTER(WHERE "Daily Collection Status"='Overdue') overdue_count,count(*) FILTER(WHERE "Daily Collection Status"='Not Paid') notpaid_count,
 count(*) FILTER(WHERE "Daily Collection Status"='Long Overdue') long_overdue_count FROM public.olap_borrowers_analytics),
top3 AS (SELECT coalesce(sum(v),0) total FROM (SELECT "Total Outstanding Principal" v FROM public."Borrowers" WHERE "Total Outstanding Principal">0 ORDER BY 1 DESC LIMIT 3) q),
pool AS (SELECT coalesce(sum(CASE WHEN "Transaction Type"='Contribution' THEN "Amount"::numeric ELSE -"Amount"::numeric END),0) total FROM public."Cash Pool Contributions"),
settled AS (SELECT coalesce(sum(s."Amount"::numeric),0) total FROM public."Settlements" s JOIN public."Partners" p ON p."Row ID"=s."Ref Partner" WHERE s."Status"='Completed'),
earned AS (SELECT coalesce(sum(CASE p."Partner Role" WHEN 'A' THEN rr.profit_a WHEN 'B' THEN rr.profit_b ELSE 0 END),0) total FROM public."Partners" p CROSS JOIN rr),
er AS (SELECT coalesce(sum("Amount"::numeric),0) total,coalesce(sum("Amount"::numeric) FILTER(WHERE "Expense Date" BETWEEN ms AND d),0) mtd FROM public."Business Expenses" CROSS JOIN ctx),
recent AS (SELECT a.* FROM public."Daily Analytics" a WHERE a."Snapshot Date">=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')-interval '30 days'),
peak AS (SELECT coalesce(max("Outstanding Principal EOD"::numeric),0) amount FROM recent),
peakdate AS (SELECT max("Snapshot Date") dt FROM recent CROSS JOIN peak WHERE "Outstanding Principal EOD"::numeric=peak.amount),
a AS (SELECT s."Row ID",s."Statistics ID",rr.profit "Total Profit",lr.principal "Outstanding Principal",lr.principal "Total Outstanding Principal",
 lr.active "Active Loans",rr.today "Today's Profit",rr.yesterday "Yesterday's Profit",rr.mtd "Realized Profit MTD",
 rr.mtd+cr.interest+lr.forecast "Projected Monthly Profit",cr.pending "Pending Payment Amount",lr.forecast "Forecast Remaining Interest",cr.interest "Today's Outstanding Interest",
 lr.days-rr.returned_days "Net Principal Days MTD",lr.principal*(me-d) "Forecast Remaining Principal Days",
 round((lr.days-rr.returned_days+lr.principal*(me-d))/extract(day FROM me)) "Forecast Average Daily Outstanding Principal",
 peak.amount "Peak Cash Pool 30D",peakdate.dt "Peak Cash Pool Date 30D",lr.daily "Expected Daily Interest",lr.active_profit "Total Profit of Outstanding Loans",
 CASE WHEN lr.principal>0 THEN lr.active_profit/lr.principal ELSE 0 END "Profit Coverage of Outstanding Principal",
 pool.total "Total Cash Pool",earned.total-settled.total "Total Unsettled Profit",
 pool.total-lr.principal+earned.total-settled.total "Expected Loan Account Balance",
 CASE WHEN lr.principal=0 THEN 0 ELSE top3.total/lr.principal END "Top 3 Borrower Concentration",
 br.full_count "Borrowers Fully Paid Today",br.partial_count "Borrowers Partially Paid Today",br.overdue_count "Borrowers with Overdue Payment",br.notpaid_count "Borrowers Not Paid Today",
 cr.due "Amount Due Today",cr.paid "Amount Collected Today",cr.remaining "Amount Outstanding Today",
 CASE WHEN cr.due=0 THEN 0 ELSE cr.paid/cr.due END "Amount Collection Rate Today",
 er.total "Total Business Expenses",rr.profit-er.total "Net Profit",er.mtd "Expenses MTD",rr.mtd-er.mtd "Net Profit MTD",
 earned.total-settled.total-er.total "Net Unsettled Profit",pool.total-lr.principal+earned.total-settled.total-er.total "Net Expected Loan Account Balance",
 rr.mtd "Operating Income MTD",-er.mtd "Income Statement Expenses MTD",br.long_overdue_count "Borrowers with Long Overdue Payment",
 lr.principal_loss "Total Principal Loss"
 FROM public."Statistics" s CROSS JOIN ctx CROSS JOIN lr CROSS JOIN rr CROSS JOIN cr CROSS JOIN br CROSS JOIN top3 CROSS JOIN pool CROSS JOIN settled CROSS JOIN earned CROSS JOIN er CROSS JOIN peak CROSS JOIN peakdate),
final AS (SELECT a.*,CASE WHEN "Forecast Average Daily Outstanding Principal">0 THEN "Projected Monthly Profit"/"Forecast Average Daily Outstanding Principal" ELSE 0 END "Forecast Monthly Return on ADO" FROM a)

SELECT x."Row ID",
 x."Statistics ID",
 round(x."Total Profit"::numeric,0) AS "Total Profit",
 round(x."Outstanding Principal"::numeric,0) AS "Outstanding Principal",
 x."Active Loans",
 round(x."Today's Profit"::numeric,0) AS "Today's Profit",
 round(x."Yesterday's Profit"::numeric,0) AS "Yesterday's Profit",
 round(x."Realized Profit MTD"::numeric,0) AS "Realized Profit MTD",
 round(x."Projected Monthly Profit"::numeric,0) AS "Projected Monthly Profit",
 round(x."Pending Payment Amount"::numeric,0) AS "Pending Payment Amount",
 round(x."Forecast Remaining Interest"::numeric,0) AS "Forecast Remaining Interest",
 round(x."Today's Outstanding Interest"::numeric,0) AS "Today's Outstanding Interest",
 x."Net Principal Days MTD",
 x."Forecast Remaining Principal Days",
 round(x."Forecast Average Daily Outstanding Principal"::numeric,0) AS "Forecast Average Daily Outstanding Principal",
 round(x."Forecast Monthly Return on ADO"::numeric,2) AS "Forecast Monthly Return on ADO",
 round(x."Peak Cash Pool 30D"::numeric,0) AS "Peak Cash Pool 30D",
 x."Peak Cash Pool Date 30D",
 round(x."Expected Daily Interest"::numeric,0) AS "Expected Daily Interest",
 round(x."Total Profit of Outstanding Loans"::numeric,0) AS "Total Profit of Outstanding Loans",
 round(x."Profit Coverage of Outstanding Principal"::numeric,2) AS "Profit Coverage of Outstanding Principal",
 round(x."Total Cash Pool"::numeric,0) AS "Total Cash Pool",
 round(x."Total Unsettled Profit"::numeric,0) AS "Total Unsettled Profit",
 round(x."Expected Loan Account Balance"::numeric,0) AS "Expected Loan Account Balance",
 round(x."Total Outstanding Principal"::numeric,0) AS "Total Outstanding Principal",
 round(x."Top 3 Borrower Concentration"::numeric,4) AS "Top 3 Borrower Concentration",
 x."Borrowers Fully Paid Today",
 x."Borrowers Partially Paid Today",
 x."Borrowers with Overdue Payment",
 x."Borrowers Not Paid Today",
 round(x."Amount Due Today"::numeric,0) AS "Amount Due Today",
 round(x."Amount Collected Today"::numeric,0) AS "Amount Collected Today",
 round(x."Amount Outstanding Today"::numeric,0) AS "Amount Outstanding Today",
 x."Amount Collection Rate Today",
 round(x."Total Business Expenses"::numeric,0) AS "Total Business Expenses",
 round(x."Net Profit"::numeric,0) AS "Net Profit",
 round(x."Expenses MTD"::numeric,0) AS "Expenses MTD",
 round(x."Net Profit MTD"::numeric,0) AS "Net Profit MTD",
 round(x."Net Unsettled Profit"::numeric,0) AS "Net Unsettled Profit",
 round(x."Net Expected Loan Account Balance"::numeric,0) AS "Net Expected Loan Account Balance",
 round(x."Income Statement Expenses MTD"::numeric,0) AS "Income Statement Expenses MTD",
 round(x."Operating Income MTD"::numeric,0) AS "Operating Income MTD",
 x."Borrowers with Long Overdue Payment",
 round(x."Total Principal Loss"::numeric,0) AS "Total Principal Loss" FROM final x;

-- reporting_borrower_payment_health_v1 (the V41 body): default_count and recorded_default_loss.
CREATE OR REPLACE VIEW public.reporting_borrower_payment_health_v1 AS
WITH ctx AS (SELECT public.olap_reporting_date() d,statement_timestamp() t),
unattributed AS (
 SELECT EXISTS(SELECT 1 FROM public."Repayments" r LEFT JOIN public."Charges" c ON c."Row ID"=r."Ref Charges" WHERE c."Row ID" IS NULL)
  OR EXISTS(SELECT 1 FROM public.reporting_charge_payment_health_v1 WHERE borrower_id IS NULL) bad
), charges AS (
 SELECT borrower_id,
  sum(principal_remaining_current) FILTER(WHERE is_overdue) overdue_principal,
  sum(interest_remaining_current) FILTER(WHERE is_overdue) overdue_interest,
  sum(overdue_amount) overdue_amount,count(*) FILTER(WHERE is_overdue)::integer overdue_charge_count,
  min(due_date) FILTER(WHERE is_overdue) oldest_overdue_date,max(current_days_overdue) oldest_unpaid_days,
  count(*) FILTER(WHERE history_eligible AND due_date>=reporting_date-30)::integer recent_obligation_count,
  count(*) FILTER(WHERE history_eligible AND due_date>=reporting_date-30 AND on_time)::integer recent_on_time_count,
  count(*) FILTER(WHERE history_eligible AND due_date>=reporting_date-180 AND due_date<reporting_date-30)::integer older_obligation_count,
  count(*) FILTER(WHERE history_eligible AND due_date>=reporting_date-180 AND due_date<reporting_date-30 AND on_time)::integer older_on_time_count,
  count(*) FILTER(WHERE history_eligible AND due_date>=reporting_date-90)::integer severity_obligation_count,
  avg(delay_grade) FILTER(WHERE history_eligible AND due_date>=reporting_date-90) mean_delay_score,
  min(due_date) FILTER(WHERE history_eligible) first_matured_due_date,
  count(DISTINCT due_date) FILTER(WHERE history_eligible)::integer distinct_matured_due_dates,
  bool_or(data_quality_status<>'OK') invalid
 FROM public.reporting_charge_payment_health_v1 GROUP BY borrower_id
), defaults AS (
 SELECT l."Ref Borrowers" borrower_id,
  count(*) FILTER(WHERE l."Defaulted" OR coalesce(l."Default Loss Amount"::numeric,0)>0)::integer default_count,
  coalesce(sum(l."Default Loss Amount"::numeric),0) recorded_default_loss,
  bool_or(coalesce(l."Defaulted",false) AND l."Loan Date"<=d AND (l."Close Date" IS NULL OR l."Close Date">d)) active_default,
  bool_or(coalesce(l."Defaulted",false) AND l."Close Date" BETWEEN d-90 AND d) recent_default,
  bool_or(l."Loan Date" IS NULL OR (l."Close Date" IS NOT NULL AND l."Close Date"<l."Loan Date")) invalid
 FROM public."Loans" l CROSS JOIN ctx GROUP BY l."Ref Borrowers"
), base AS (
 SELECT b."Row ID" borrower_id,coalesce(b."Has Active Loan",false) has_active_loan,
  coalesce(b."Hidden Flag",false) hidden_flag,
  CASE WHEN coalesce(c.invalid,false) OR u.bad THEN NULL ELSE coalesce(c.overdue_principal,0) END overdue_principal,
  CASE WHEN coalesce(c.invalid,false) OR u.bad THEN NULL ELSE coalesce(c.overdue_interest,0) END overdue_interest,
  CASE WHEN coalesce(c.invalid,false) OR u.bad THEN NULL ELSE coalesce(c.overdue_amount,0) END overdue_amount,
  CASE WHEN coalesce(c.invalid,false) OR u.bad THEN NULL ELSE coalesce(c.overdue_charge_count,0) END overdue_charge_count,
  c.oldest_overdue_date,c.oldest_unpaid_days,
  coalesce(c.recent_obligation_count,0) recent_obligation_count,coalesce(c.recent_on_time_count,0) recent_on_time_count,
  coalesce(c.older_obligation_count,0) older_obligation_count,coalesce(c.older_on_time_count,0) older_on_time_count,
  coalesce(c.severity_obligation_count,0) severity_obligation_count,c.first_matured_due_date,
  coalesce(c.distinct_matured_due_dates,0) distinct_matured_due_dates,d-c.first_matured_due_date history_span_days,
  c.recent_on_time_count::numeric/nullif(c.recent_obligation_count,0) recent_on_time_rate,
  c.older_on_time_count::numeric/nullif(c.older_obligation_count,0) older_on_time_rate,
  CASE WHEN coalesce(l.recent_default,false) THEN 0 ELSE c.mean_delay_score END delay_score,
  CASE WHEN coalesce(l.active_default,false) THEN 0 WHEN c.oldest_unpaid_days IS NULL THEN 100
   WHEN c.oldest_unpaid_days=1 THEN 60 WHEN c.oldest_unpaid_days<=3 THEN 40 ELSE 20 END::numeric current_score,
  coalesce(l.default_count,0) default_count,coalesce(l.recorded_default_loss,0) recorded_default_loss,
  coalesce(l.active_default,false) active_default,coalesce(l.recent_default,false) recent_default,
  CASE WHEN u.bad OR coalesce(c.invalid,false) OR coalesce(l.invalid,false) THEN 'Invalid source'
   WHEN coalesce(l.default_count,0)>0 THEN 'Default history requires review' ELSE 'OK' END data_quality_status,
  d reporting_date,t calculated_at
 FROM public."Borrowers" b CROSS JOIN ctx CROSS JOIN unattributed u
 LEFT JOIN charges c ON c.borrower_id=b."Row ID" LEFT JOIN defaults l ON l.borrower_id=b."Row ID"
), components AS (
 SELECT *,recent_obligation_count-recent_on_time_count recent_late_count,
  100*recent_on_time_rate recent_score,100*older_on_time_rate older_score,
  (CASE WHEN recent_on_time_rate IS NULL THEN 0 ELSE 0.45 END
   +CASE WHEN older_on_time_rate IS NULL THEN 0 ELSE 0.15 END
   +CASE WHEN delay_score IS NULL THEN 0 ELSE 0.15 END+0.25) weight_total,
  coalesce(oldest_unpaid_days>7,false) OR active_default OR recent_default severe_risk_guard,
  CASE WHEN data_quality_status<>'OK' THEN 'Data review'
   WHEN recent_obligation_count=0 THEN 'Unclassified' ELSE 'Rated' END rating_status
 FROM base
), raw AS (
 SELECT *,CASE WHEN rating_status='Rated' THEN
  (coalesce(recent_score*0.45,0)+coalesce(older_score*0.15,0)+coalesce(delay_score*0.15,0)+current_score*0.25)/weight_total END raw_score
 FROM components
), scored AS (
 SELECT *,CASE WHEN severe_risk_guard THEN least(raw_score,60) ELSE raw_score END candidate_score,
  CASE WHEN rating_status='Data review' THEN 'Data review' WHEN rating_status='Unclassified' THEN 'Insufficient history'
   WHEN distinct_matured_due_dates>=3 AND history_span_days>=30 THEN 'Established' ELSE 'Provisional' END confidence,
  CASE WHEN overdue_amount IS NULL THEN 'Data review' WHEN active_default OR recent_default THEN 'Default flagged'
   WHEN overdue_charge_count>0 THEN 'Overdue' ELSE 'No current overdue' END current_health_status,
  CASE WHEN data_quality_status<>'OK' THEN 'DATA_REVIEW' WHEN active_default THEN 'ACTIVE_DEFAULT'
   WHEN recent_default THEN 'RECENT_DEFAULT' WHEN oldest_unpaid_days>7 THEN 'SEVERE_ARREARS'
   WHEN overdue_charge_count>0 THEN 'CURRENT_ARREARS' WHEN recent_obligation_count=0 THEN 'NO_RECENT_HISTORY'
   WHEN recent_late_count>0 THEN 'RECENT_LATE_PAYMENTS'
   WHEN distinct_matured_due_dates<3 OR history_span_days<30 THEN 'PROVISIONAL_HISTORY' ELSE 'NO_CURRENT_ARREARS' END primary_reason_code
 FROM raw
)
SELECT borrower_id,has_active_loan,hidden_flag,overdue_principal,overdue_interest,overdue_amount,overdue_charge_count,
 oldest_overdue_date,oldest_unpaid_days,recent_obligation_count,recent_on_time_count,recent_late_count,recent_on_time_rate,
 older_obligation_count,older_on_time_count,older_on_time_rate,severity_obligation_count,
 first_matured_due_date,distinct_matured_due_dates,history_span_days,recent_score,older_score,delay_score,current_score,
 CASE WHEN recent_score IS NULL THEN 0 ELSE 0.45/weight_total END recent_effective_weight,
 CASE WHEN older_score IS NULL THEN 0 ELSE 0.15/weight_total END older_effective_weight,
 CASE WHEN delay_score IS NULL THEN 0 ELSE 0.15/weight_total END delay_effective_weight,0.25/weight_total current_effective_weight,
 raw_score,CASE WHEN rating_status='Rated' THEN candidate_score END reliability_score,
 CASE WHEN rating_status='Rated' THEN CASE WHEN candidate_score>=80 THEN 'High' ELSE 'Lower' END END reliability_band,
 rating_status,confidence,severe_risk_guard,coalesce(severe_risk_guard AND raw_score>60,false) score_cap_applied,
 active_default,recent_default,default_count,recorded_default_loss,current_health_status,primary_reason_code,
 CASE primary_reason_code WHEN 'DATA_REVIEW' THEN data_quality_status
  WHEN 'ACTIVE_DEFAULT' THEN 'Active default recorded' WHEN 'RECENT_DEFAULT' THEN 'Default recorded within 90 days'
  WHEN 'SEVERE_ARREARS' THEN 'Oldest unpaid obligation is '||oldest_unpaid_days||' days overdue; severe-risk guard applies'
  WHEN 'CURRENT_ARREARS' THEN 'Oldest unpaid obligation is '||oldest_unpaid_days||' days overdue'
  WHEN 'NO_RECENT_HISTORY' THEN 'No eligible obligations in the last 30 completed days'
  WHEN 'RECENT_LATE_PAYMENTS' THEN recent_late_count||' of '||recent_obligation_count||' recent obligations were not paid on time'
  WHEN 'PROVISIONAL_HISTORY' THEN 'Limited payment history; rating is provisional'
  ELSE 'No current overdue; observed recent obligations paid on time' END reason_text,
 data_quality_status,reporting_date,calculated_at,'payment-health-v1'::text method_version
FROM scored;

-- The new post_loan_default takes the old one's privileges exactly (the trigger is its only caller; default privileges
-- of the migration role must not widen or narrow them).
DO $acl$
DECLARE old_acl aclitem[]; new_oid oid:='public.post_loan_default(public."Loans",date,text,numeric,boolean)'::regprocedure; g record;
BEGIN
 SELECT effective INTO STRICT old_acl FROM v120_acl WHERE name='post_loan_default';
 FOR g IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid=new_oid AND a.grantee<>p.proowner LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.post_loan_default(public."Loans",date,text,numeric,boolean) FROM %s',CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
 END LOOP;
 FOR g IN SELECT DISTINCT a.grantee FROM aclexplode(old_acl) a JOIN pg_proc p ON p.oid=new_oid WHERE a.grantee<>p.proowner AND a.privilege_type='EXECUTE' LOOP
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.post_loan_default(public."Loans",date,text,numeric,boolean) TO %s',CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
 END LOOP;
END $acl$;

-- Self-check: owners, privileges and attributes unchanged (the replaced post_loan_default against its predecessor);
-- every body carries V120; the old post_loan_default signature is gone; the app role can still call what it calls.
DO $check$
DECLARE bad text; app text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END;
BEGIN
 SELECT string_agg(o.routine,', ') INTO bad FROM v120_acl o
  JOIN pg_proc p ON p.oid=CASE WHEN o.name='post_loan_default' THEN 'public.post_loan_default(public."Loans",date,text,numeric,boolean)'::regprocedure ELSE o.routine::regprocedure END
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR p.provolatile<>o.provolatile OR p.prosecdef<>o.prosecdef OR p.proconfig IS DISTINCT FROM o.proconfig
   OR (o.name<>'post_loan_default' AND coalesce(p.proacl::text,'')<>o.acl)
   OR (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY a.grantee,a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)
    IS DISTINCT FROM (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY a.grantee,a.privilege_type) FROM aclexplode(o.effective) a WHERE a.grantee<>p.proowner);
 IF bad IS NOT NULL OR (SELECT count(*) FROM v120_acl)<>12 THEN RAISE EXCEPTION 'V120 changed the owner, privileges or attributes of %',coalesce(bad,'a replaced function'); END IF;
 IF to_regprocedure('public.post_loan_default(public."Loans",date,text)') IS NOT NULL THEN RAISE EXCEPTION 'V120: the 3-argument post_loan_default remains'; END IF;
 IF has_function_privilege('public','public.pwa_submit_operation_v2(text)','EXECUTE') OR has_function_privilege('public','public.pwa_apply_loan_source_v2(text)','EXECUTE') THEN
  RAISE EXCEPTION 'V120: PUBLIC must not execute the operation functions'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=app) AND (NOT has_function_privilege(app,'public.forecast_schedule_v1(jsonb,jsonb,date,date)','EXECUTE')
  OR NOT has_function_privilege(app,'public.pwa_next_projected_charge_v1(text,date)','EXECUTE') OR NOT has_function_privilege(app,'public.pwa_next_bookable_charge_v1(text,date)','EXECUTE')) THEN
  RAISE EXCEPTION 'V120: the application role lost a read it uses'; END IF;
 IF position($s$'keepCharges'$s$ IN pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure))=0
  OR position('business_crud.default_request' IN pg_get_functiondef('public.pwa_apply_loan_source_v2(text)'::regprocedure))=0
  OR position('business_crud.default_request' IN pg_get_functiondef('public.default_loan_transition()'::regprocedure))=0
  OR (SELECT count(*) FROM unnest(ARRAY['public.generate_loan_charge(text,date,boolean)','public.generate_due_charges(date,text[])','public.loan_close_calculation_v83(text,date,text)',
      'public.forecast_schedule_v1(jsonb,jsonb,date,date)','public.pwa_next_projected_charge_v1(text,date)','public.pwa_next_bookable_charge_v1(text,date)']) r
     WHERE position($s$'df10:'$s$ IN pg_get_functiondef(r::regprocedure))>0)<>6 THEN
  RAISE EXCEPTION 'V120: a function was not replaced'; END IF;
 IF (SELECT attname FROM pg_attribute WHERE attrelid='public.olap_portfolio_summary'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum DESC LIMIT 1)<>'Total Principal Loss' THEN
  RAISE EXCEPTION 'V120: olap_portfolio_summary does not end with Total Principal Loss'; END IF;
END $check$;
