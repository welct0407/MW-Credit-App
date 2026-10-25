-- R101 Loan Close ignores unpaid interest on future-dated charges (owner decision of 25 October 2026; plan "Loan Close
-- ignores unpaid interest on future-dated charges", Chase's finding D-1 on "Pay the next charge early", rule as corrected
-- by Archie). Before, a close on day D charged the full unpaid interest of a charge dated after D and measured the elapsed
-- interest from that future date (none), so the borrower paid interest for days that had not happened. Now, for day D:
-- 1. latest is the last charge dated on or before D. With no charge dated after D nothing changes: the elapsed interest
--    from latest (or Loan Date) to D goes to the new lc7: charge, and the calculation and plan hash are byte-identical to V112.
-- 2. With any charge dated after D the lc7: charge carries no elapsed interest (it still takes missing principal); those
--    days are billed on the first future charge F1 (by Charge Date, then Row ID):
--    due_new(F1) = least(stored Interest Due, greatest(interest paid on F1, daily x (D - latest))), latest defaulting to
--    Loan Date. When a charge dated latest is an lc7: charge, a close already billed those days on F1, so F1 keeps its
--    stored due: the recompute that leaves out the closing receipt (the close repaid the principal and set the daily
--    interest to 0) and a re-close after the receipt is deleted give the posted plan again. Every later future charge:
--    due_new = interest paid on it. least() never raises a hand-booked or discounted charge; paid interest is never
--    refunded. Paid interest honours p_exclude_payment. A future charge's allocation line carries due_new - paid interest.
-- 3. Only when some future charge's due_new differs from its stored Interest Due, mutation gains futureInterest
--    [{chargeId, interestDue}] (only those charges, ordered by Row ID COLLATE "C"); a mutation that was null becomes
--    {kind: 'adjust', futureInterest}. No top-level key is added, and the plan hash covers the whole context, so a preview
--    made before a future charge changed fails with P5B09.
-- 4. apply_loan_close_calculation_v83 first lowers each listed charge (Row ID, loan and Charge Date after D must match,
--    and the new due must be lower) and appends "Interest Due lowered from <old> by Loan Close <D>" to its Notes, then
--    applies the insert or increase as before. Deleting the closing receipt keeps the lowered due, as it keeps the lc7:
--    charge; the note is the trail.
-- The (text,date) wrapper, prepare_loan_close, pwa_apply_loan_close_v2 and pwa_apply_payment_v2 need no change; services and
-- the PWA read only amount, allocations, planHash and targetChargeId. CREATE OR REPLACE keeps each function's signature,
-- owner, privileges, volatility and pinned search_path; the self-check below proves them. No table, column, data or trigger
-- change.

DO $preflight$
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
END $preflight$;

CREATE TEMP TABLE v113_acl ON COMMIT DROP AS
 SELECT p.oid::regprocedure::text AS routine,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl::text,'') AS acl,p.provolatile,p.prosecdef,p.proconfig
 FROM pg_proc p WHERE p.oid IN ('public.loan_close_calculation_v83(text,date,text)'::regprocedure,'public.apply_loan_close_calculation_v83(text,date,text)'::regprocedure);

-- 1. The calculation: V112's, plus the future-charge rule above.
CREATE OR REPLACE FUNCTION public.loan_close_calculation_v83(p_loan text, p_day date, p_exclude_payment text) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE l public."Loans"%ROWTYPE; outstanding numeric;scheduled numeric;missing numeric;interest numeric:=0;
 target text;today_count integer;latest date;mutation jsonb:='null'::jsonb;lines jsonb;total numeric;context jsonb;
 opening date;reclose boolean;has_future boolean;future jsonb;future_due jsonb;
BEGIN
 SELECT * INTO l FROM public."Loans" WHERE "Row ID"=p_loan;
 IF NOT FOUND THEN RAISE EXCEPTION 'Target loan must belong to the payment borrower';END IF;
 IF p_exclude_payment IS NOT NULL AND l."Ref Closing Payment"=p_exclude_payment AND l."Defaulted" IS NOT TRUE THEN l."Loan Status":='ยังไม่ปิดยอด';END IF;
 IF l."Loan Status" IS DISTINCT FROM 'ยังไม่ปิดยอด' OR l."Loan Type" IS DISTINCT FROM 'ดอกเบี้ยรายวัน' OR NOT coalesce(l."Auto Charge Enabled",false) THEN RAISE EXCEPTION 'Loan Close requires an open auto-enabled daily-interest loan';END IF;
 IF l."Loan Date" IS NULL OR l."Loan Date">p_day OR l."Current Daily Interest" IS NULL OR l."Current Daily Interest"::numeric<0 OR l."Principal Amount" IS NULL THEN RAISE EXCEPTION 'Loan Close requires valid loan date, principal and daily interest';END IF;
 IF EXISTS(SELECT 1 FROM public."Charges" c LEFT JOIN LATERAL(SELECT coalesce(sum(r."Principal Paid"::numeric),0) p,coalesce(sum(r."Interest Paid"::numeric),0) i FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID" AND (p_exclude_payment IS NULL OR r."Ref Payment" IS DISTINCT FROM p_exclude_payment)) paid ON true WHERE c."Ref Loans"=p_loan AND(c."Principal Due" IS NULL OR c."Interest Due" IS NULL OR c."Principal Due"::numeric<paid.p OR c."Interest Due"::numeric<paid.i)) THEN RAISE EXCEPTION 'Loan charge components require reconciliation before closing';END IF;
 SELECT l."Principal Amount"::numeric-coalesce(sum("Principal Paid"::numeric),0) INTO outstanding FROM public."Repayments" WHERE "Ref Loans"=p_loan AND (p_exclude_payment IS NULL OR "Ref Payment" IS DISTINCT FROM p_exclude_payment);
 IF outstanding IS NULL OR outstanding<=0 THEN RAISE EXCEPTION 'Loan has no outstanding principal to close';END IF;
 SELECT coalesce(sum(c."Principal Due"::numeric-(SELECT coalesce(sum(r."Principal Paid"::numeric),0) FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID" AND (p_exclude_payment IS NULL OR r."Ref Payment" IS DISTINCT FROM p_exclude_payment))),0) INTO scheduled FROM public."Charges" c WHERE c."Ref Loans"=p_loan;
 missing:=outstanding-scheduled;
 IF missing<0 THEN RAISE EXCEPTION 'Principal already due exceeds outstanding loan principal';END IF;
 -- V113: charges dated after the day. F1 carries the days up to the day (capped by its stored due); later ones keep paid interest.
 SELECT max("Charge Date") INTO opening FROM public."Charges" WHERE "Ref Loans"=p_loan AND "Charge Date"<=p_day;
 reclose:=EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"=p_loan AND "Charge Date"=opening AND starts_with("Row ID",'lc7:'));
 WITH f AS(SELECT c."Row ID" id,c."Interest Due"::numeric due,paid.i,row_number() OVER(ORDER BY c."Charge Date",c."Row ID" COLLATE "C") n FROM public."Charges" c
   LEFT JOIN LATERAL(SELECT coalesce(sum(r."Interest Paid"::numeric),0) i FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID" AND (p_exclude_payment IS NULL OR r."Ref Payment" IS DISTINCT FROM p_exclude_payment)) paid ON true
   WHERE c."Ref Loans"=p_loan AND c."Charge Date">p_day),
  v AS(SELECT id,due,CASE WHEN n>1 THEN i WHEN reclose THEN due ELSE least(due,greatest(i,l."Current Daily Interest"::numeric*greatest(0,p_day-coalesce(opening,l."Loan Date")))) END due_new FROM f)
 SELECT count(*)>0,jsonb_agg(jsonb_build_object('chargeId',id,'interestDue',trim_scale(due_new)::text) ORDER BY id COLLATE "C") FILTER(WHERE due_new<>due),jsonb_object_agg(id,due_new)
  INTO has_future,future,future_due FROM v;
 SELECT count(*),min("Row ID") INTO today_count,target FROM public."Charges" WHERE "Ref Loans"=p_loan AND "Charge Date"=p_day;
 IF today_count>1 THEN RAISE EXCEPTION 'Multiple charges today require reconciliation before closing';END IF;
 IF today_count=0 THEN
  SELECT max("Charge Date") INTO latest FROM public."Charges" WHERE "Ref Loans"=p_loan AND "Charge Date"<=p_day;
  IF NOT has_future THEN interest:=l."Current Daily Interest"::numeric*greatest(0,p_day-coalesce(latest,l."Loan Date"));END IF;
  IF missing+interest>0 THEN
   target:='lc7:'||length(p_loan)||':'||p_loan||':'||p_day::text;
   mutation:=jsonb_build_object('kind','insert','chargeId',target,'principal',missing::text,'interest',interest::text);
  END IF;
 ELSIF missing>0 THEN mutation:=jsonb_build_object('kind','increase','chargeId',target,'principal',missing::text,'interest','0');END IF;
 IF future IS NOT NULL THEN mutation:=CASE WHEN mutation='null'::jsonb THEN jsonb_build_object('kind','adjust') ELSE mutation END||jsonb_build_object('futureInterest',future);END IF;
 IF target IS NULL THEN SELECT "Row ID" INTO target FROM public."Charges" WHERE "Ref Loans"=p_loan ORDER BY "Charge Date" DESC,"Row ID" COLLATE "C" DESC LIMIT 1;END IF;
 WITH paid AS(SELECT r."Ref Charges" id,sum(r."Principal Paid"::numeric) p,sum(r."Interest Paid"::numeric) i FROM public."Repayments" r WHERE r."Ref Loans"=p_loan AND (p_exclude_payment IS NULL OR r."Ref Payment" IS DISTINCT FROM p_exclude_payment) GROUP BY r."Ref Charges"),
 projected AS(SELECT c."Row ID" id,c."Charge Date" AS charge_day,c."Principal Due"::numeric-coalesce(paid.p,0)+CASE WHEN mutation->>'kind'='increase' AND c."Row ID"=target THEN missing ELSE 0 END p,CASE WHEN c."Charge Date">p_day THEN (future_due->>c."Row ID")::numeric ELSE c."Interest Due"::numeric END-coalesce(paid.i,0) i FROM public."Charges" c LEFT JOIN paid ON paid.id=c."Row ID" WHERE c."Ref Loans"=p_loan
 UNION ALL SELECT target,p_day,missing,interest WHERE mutation->>'kind'='insert')
 SELECT coalesce(jsonb_agg(jsonb_build_object('chargeId',id,'principal',trim_scale(p)::text,'interest',trim_scale(i)::text,'expectedPrincipalRemaining',trim_scale(p)::text,'expectedInterestRemaining',trim_scale(i)::text,'chargeDate',charge_day::text) ORDER BY id COLLATE "C") FILTER(WHERE p+i>0),'[]'::jsonb),sum(p+i) INTO lines,total FROM projected;
 IF total IS NULL OR total<=0 OR total<>trunc(total) THEN RAISE EXCEPTION 'Final receipt must be a positive whole-baht amount';END IF;
 context:=jsonb_build_object('sourceVersion',public.pwa_loan_version_v2(p_loan),'excludedPayment',p_exclude_payment,'businessDate',p_day::text,'borrowerId',l."Ref Borrowers",'amount',trim_scale(total)::text,'allocations',lines,'targetChargeId',target,'targetLoanId',p_loan,'mutation',mutation);
 IF p_exclude_payment IS NULL THEN context:=context-'excludedPayment';END IF;
 RETURN context||jsonb_build_object('planHash',encode(sha256(convert_to(context::text,'UTF8')),'hex'));
END $$;

-- 2. The apply: lower the listed future charges (with a note), then the insert or increase as before.
CREATE OR REPLACE FUNCTION public.apply_loan_close_calculation_v83(p_loan text, p_day date, p_expected text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE parent text;calculation jsonb;m jsonb;f jsonb;
BEGIN
 SELECT "Ref Borrowers" INTO parent FROM public."Loans" WHERE "Row ID"=p_loan;
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=parent FOR UPDATE;
 PERFORM 1 FROM public."Loans" WHERE "Row ID"=p_loan FOR UPDATE;
 PERFORM 1 FROM public."Charges" WHERE "Ref Loans"=p_loan ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
 calculation:=public.loan_close_calculation_v83(p_loan,p_day);
 IF p_expected IS NOT NULL AND calculation->>'planHash' IS DISTINCT FROM p_expected THEN RAISE EXCEPTION USING ERRCODE='P5B09',MESSAGE='Close plan changed';END IF;
 m:=calculation->'mutation';
 FOR f IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(m->'futureInterest')='array' THEN m->'futureInterest' ELSE '[]'::jsonb END) LOOP
  UPDATE public."Charges" SET "Interest Due"=(f->>'interestDue')::numeric::money,
   "Notes"=coalesce(nullif("Notes",'')||E'\n','')||'Interest Due lowered from '||trim_scale("Interest Due"::numeric)::text||' by Loan Close '||p_day::text
   WHERE "Row ID"=f->>'chargeId' AND "Ref Loans"=p_loan AND "Charge Date">p_day AND "Interest Due"::numeric>(f->>'interestDue')::numeric;
  IF NOT FOUND THEN RAISE EXCEPTION 'Close plan future charge differs from the loan';END IF;
 END LOOP;
 IF m->>'kind'='insert' THEN INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes") VALUES(m->>'chargeId',p_loan,p_day,(m->>'principal')::numeric::money,(m->>'interest')::numeric::money,'Final charge prepared by Loan Close');
 ELSIF m->>'kind'='increase' THEN UPDATE public."Charges" SET "Principal Due"=("Principal Due"::numeric+(m->>'principal')::numeric)::money WHERE "Row ID"=m->>'chargeId';END IF;
 RETURN calculation;
END $$;

-- Self-check: signature, owner, privileges, volatility, rights and search_path unchanged; the bodies carry V113.
DO $check$
DECLARE bad text;
BEGIN
 SELECT string_agg(o.routine,', ') INTO bad FROM v113_acl o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR coalesce(p.proacl::text,'')<>o.acl OR p.provolatile<>o.provolatile OR p.prosecdef<>o.prosecdef OR p.proconfig IS DISTINCT FROM o.proconfig;
 IF bad IS NOT NULL OR (SELECT count(*) FROM v113_acl)<>2 THEN RAISE EXCEPTION 'V113 changed the owner, privileges or attributes of %',coalesce(bad,'a close function'); END IF;
 IF position('futureInterest' IN pg_get_functiondef('public.loan_close_calculation_v83(text,date,text)'::regprocedure))=0
  OR position('futureInterest' IN pg_get_functiondef('public.apply_loan_close_calculation_v83(text,date,text)'::regprocedure))=0 THEN RAISE EXCEPTION 'V113: a function was not replaced'; END IF;
END $check$;
