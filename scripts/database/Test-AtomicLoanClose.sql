-- Keep fixture dates consistent with the business date on CI hosts in any zone.
SET TIME ZONE 'Asia/Bangkok';
\ir Test-CorePayment.sql
BEGIN;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.close_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.close_reject(command text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%'||expected||'%' THEN RAISE; END IF; RETURN;
  END;
  RAISE EXCEPTION 'Expected rejection: %',expected;
END $$;
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('AC7-B','SYNTHETIC ATOMIC CLOSE'),('AC7-OTHER','SYNTHETIC OTHER');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('AC7-PARTNER','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
VALUES('AC7-CAPITAL','AC7-PARTNER',current_date,'Contribution',5000::money);
-- Seed with auto false so fixture setup does not create first-day receipts.
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest")
SELECT 'CI-LISA','AC7-'||n,'AC7-B',current_date-5,100::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,(CASE WHEN n='FRACTION' THEN 0.1 ELSE 10 END)::money
FROM unnest(ARRAY['NONE','OLD','PART','PAID','SAME','FUTURE','ROLLBACK','DUP','STALE','WRONG','FRACTION']) n;
UPDATE "Loans" SET "Loan Date"=current_date WHERE "Row ID"='AC7-SAME';
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
('AC7-OLD-C','AC7-OLD',current_date-1,0::money,20::money),
('AC7-PART-C','AC7-PART',current_date,100::money,20::money),
('AC7-PAID-C','AC7-PAID',current_date,0::money,20::money),
('AC7-FUTURE-C','AC7-FUTURE',current_date+2,100::money,20::money),
('AC7-DUP-C1','AC7-DUP',current_date,0::money,20::money),
('AC7-DUP-C2','AC7-DUP',current_date,0::money,20::money);
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Payment Date","Amount Received","Allocation Method","Status") VALUES ('CI-DAD','AC7-PART-FIRST','AC7-B','AC7-PART-C',current_date,50::money,'Single Partial','Processing');
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Payment Date","Amount Received","Allocation Method","Status") VALUES ('CI-DAD','AC7-PAID-FIRST','AC7-B','AC7-PAID-C',current_date,20::money,'Single Full','Processing');
-- R086 (V101): legacy repayments without a "Ref Payment" (5 August to 18 September 2026) still pay their charges.
-- Principal 100 at 10/day; LEGACY-C1 (20 + 10) and LEGACY-C2 (0 + 10) were paid by unlinked repayments; LEGACY-C3 (0 + 10)
-- is unpaid. The principal repayment re-rates the loan to 8/day (80 x 10%). Payoff today = outstanding 80 + unpaid 10
-- + one elapsed day 8 = 98. Before V101 the unlinked repayments were ignored: C1 and C2 looked unpaid again and the
-- quote was 138, which the posting then refused because it differs from the eligible balance.
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest")
VALUES('CI-LISA','AC7-LEGACY','AC7-B',current_date-5,100::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,10::money);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
('AC7-LEGACY-C1','AC7-LEGACY',current_date-3,20::money,10::money),
('AC7-LEGACY-C2','AC7-LEGACY',current_date-2,0::money,10::money),
('AC7-LEGACY-C3','AC7-LEGACY',current_date-1,0::money,10::money);
INSERT INTO "Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid") VALUES
('AC7-LEGACY-R1','AC7-LEGACY','AC7-LEGACY-C1',current_date-3,20::money,10::money),
('AC7-LEGACY-R2','AC7-LEGACY','AC7-LEGACY-C2',current_date-2,0::money,10::money);
-- A legacy principal repayment linked to no charge either: before V101 the close re-collected it (quote 118, posted,
-- outstanding principal -20) because the inflated final charge matched the inflated quote. Now 80 + 10 + 8 = 98.
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest")
VALUES('CI-LISA','AC7-UNLINKED','AC7-OTHER',current_date-5,100::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,10::money);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES ('AC7-UNLINKED-C','AC7-UNLINKED',current_date-1,0::money,10::money);
INSERT INTO "Repayments"("Row ID","Ref Loans","Payment Date","Principal Paid","Interest Paid") VALUES ('AC7-UNLINKED-R','AC7-UNLINKED',current_date-3,20::money,0::money);
-- R101 V113 (Archie's test plan): Loan Close ignores unpaid interest on future-dated charges. 10 a day, principal 1000,
-- Loan Date three days ago, F1 four days ahead with 70 interest. The days up to today are billed on F1 (capped by its
-- stored due), later future charges keep the interest paid on them, and the lc7: charge takes the principal only.
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
VALUES('AC7-FI-CAPITAL','AC7-PARTNER',current_date,'Contribution',11000::money);
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest")
SELECT 'CI-LISA','AC7-FI-'||n,'AC7-B',current_date-3,1000::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,10::money
FROM unnest(ARRAY['NONE','PART','FULL','TODAY','TWO','CAP','ADJ','MIS','PRE']) n;
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
('AC7-FI-NONE-F1','AC7-FI-NONE',current_date+4,0::money,70::money),
('AC7-FI-PART-F1','AC7-FI-PART',current_date+4,0::money,70::money),
('AC7-FI-FULL-F1','AC7-FI-FULL',current_date+4,0::money,70::money),
('AC7-FI-TODAY-C','AC7-FI-TODAY',current_date,0::money,30::money),
('AC7-FI-TODAY-F1','AC7-FI-TODAY',current_date+4,0::money,40::money),
('AC7-FI-TWO-F1','AC7-FI-TWO',current_date+4,0::money,70::money),
('AC7-FI-TWO-F2','AC7-FI-TWO',current_date+8,0::money,40::money),
('AC7-FI-CAP-F1','AC7-FI-CAP',current_date+4,0::money,20::money),
-- CH-ADJ: yesterday's charge already carries all the principal, so the close only lowers F1 (no lc7: row).
('AC7-FI-ADJ-C','AC7-FI-ADJ',current_date-1,1000::money,10::money),
('AC7-FI-ADJ-F1','AC7-FI-ADJ',current_date+4,0::money,70::money),
-- MIS: an lc7: charge dated yesterday already holds the principal; a hand-booked F1 is billed one day.
('lc7:10:AC7-FI-MIS:'||(current_date-1),'AC7-FI-MIS',current_date-1,1000::money,0::money),
('AC7-FI-MIS-F1','AC7-FI-MIS',current_date+4,0::money,70::money),
-- PRE: a pre-V113 lc7: charge with interest (its close reopened), then a hand-booked F1: billed two days, not in full.
('lc7:10:AC7-FI-PRE:'||(current_date-2),'AC7-FI-PRE',current_date-2,1000::money,30::money),
('AC7-FI-PRE-F1','AC7-FI-PRE',current_date+4,0::money,70::money);
-- Hand-edited trail lines with an impossible date are not trails: the charge stays unsettled and nothing raises.
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest")
SELECT 'CI-LISA','AC7-FB-'||n,'AC7-B',current_date-3,1000::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,10::money FROM unnest(ARRAY['MONTH','DAY']) n;
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes") VALUES
('AC7-FB-MONTH-F1','AC7-FB-MONTH',current_date+4,0::money,70::money,'Interest Due lowered from 90 by Loan Close 2026-99-99'),
('AC7-FB-DAY-F1','AC7-FB-DAY',current_date+4,0::money,70::money,'Interest Due lowered from 90 by Loan Close 2026-02-31');
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Payment Date","Amount Received","Allocation Method","Status") VALUES ('CI-DAD','AC7-FI-PART-PRE','AC7-B','AC7-FI-PART-F1',current_date,40::money,'Single Partial','Processing');
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Payment Date","Amount Received","Allocation Method","Status") VALUES ('CI-DAD','AC7-FI-FULL-PRE','AC7-B','AC7-FI-FULL-F1',current_date,70::money,'Single Full','Processing');
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Payment Date","Amount Received","Allocation Method","Status") VALUES ('CI-DAD','AC7-FI-TODAY-PRE','AC7-B','AC7-FI-TODAY-F1',current_date,20::money,'Single Partial','Processing');
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Payment Date","Amount Received","Allocation Method","Status") VALUES ('CI-DAD','AC7-FI-TWO-PRE','AC7-B','AC7-FI-TWO-F2',current_date,10::money,'Single Partial','Processing');
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" LIKE 'AC7-%';
CREATE FUNCTION pg_temp.loan_close_calculation_v112(p_loan text, p_day date, p_exclude_payment text) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE l public."Loans"%ROWTYPE; outstanding numeric;scheduled numeric;missing numeric;interest numeric:=0;
 target text;today_count integer;latest date;mutation jsonb:='null'::jsonb;lines jsonb;total numeric;context jsonb;
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
 WITH paid AS(SELECT r."Ref Charges" id,sum(r."Principal Paid"::numeric) p,sum(r."Interest Paid"::numeric) i FROM public."Repayments" r WHERE r."Ref Loans"=p_loan AND (p_exclude_payment IS NULL OR r."Ref Payment" IS DISTINCT FROM p_exclude_payment) GROUP BY r."Ref Charges"),
 projected AS(SELECT c."Row ID" id,c."Charge Date" AS charge_day,c."Principal Due"::numeric-coalesce(paid.p,0)+CASE WHEN mutation->>'kind'='increase' AND c."Row ID"=target THEN missing ELSE 0 END p,c."Interest Due"::numeric-coalesce(paid.i,0) i FROM public."Charges" c LEFT JOIN paid ON paid.id=c."Row ID" WHERE c."Ref Loans"=p_loan
 UNION ALL SELECT target,p_day,missing,interest WHERE mutation->>'kind'='insert')
 SELECT coalesce(jsonb_agg(jsonb_build_object('chargeId',id,'principal',trim_scale(p)::text,'interest',trim_scale(i)::text,'expectedPrincipalRemaining',trim_scale(p)::text,'expectedInterestRemaining',trim_scale(i)::text,'chargeDate',charge_day::text) ORDER BY id COLLATE "C") FILTER(WHERE p+i>0),'[]'::jsonb),sum(p+i) INTO lines,total FROM projected;
 IF total IS NULL OR total<=0 OR total<>trunc(total) THEN RAISE EXCEPTION 'Final receipt must be a positive whole-baht amount';END IF;
 context:=jsonb_build_object('sourceVersion',public.pwa_loan_version_v2(p_loan),'excludedPayment',p_exclude_payment,'businessDate',p_day::text,'borrowerId',l."Ref Borrowers",'amount',trim_scale(total)::text,'allocations',lines,'targetChargeId',target,'targetLoanId',p_loan,'mutation',mutation);
 IF p_exclude_payment IS NULL THEN context:=context-'excludedPayment';END IF;
 RETURN context||jsonb_build_object('planHash',encode(sha256(convert_to(context::text,'UTF8')),'hex'));
END $$;
-- V113 case 8: a loan with no charge dated after the day gets the V112 calculation byte for byte (plan hash included).
SELECT pg_temp.close_assert((SELECT bool_and(public.loan_close_calculation_v83(id,current_date,x)::text=pg_temp.loan_close_calculation_v112(id,current_date,x)::text)
  FROM unnest(ARRAY['AC7-NONE','AC7-OLD','AC7-PART','AC7-PAID','AC7-SAME','AC7-LEGACY','AC7-UNLINKED']) id CROSS JOIN unnest(ARRAY[NULL,'AC7-NO-SUCH-PAYMENT']) x),'loans without a future charge: plans and hashes byte-identical to V112');
SELECT pg_temp.close_assert((SELECT bool_and(public.loan_close_calculation_v83(id,current_date)->>'planHash'=pg_temp.loan_close_calculation_v112(id,current_date,NULL)->>'planHash'
  AND public.loan_close_calculation_v83(id,current_date)->'mutation'=pg_temp.loan_close_calculation_v112(id,current_date,NULL)->'mutation')
  FROM unnest(ARRAY['AC7-NONE','AC7-OLD','AC7-PART','AC7-PAID','AC7-SAME','AC7-LEGACY']) id),'V112 plan hash and mutation unchanged for ordinary loans');
-- The hand-booked AC7-FUTURE charge (due 20 for days 5 back to 2 ahead) is capped at its stored due: same as V112.
SELECT pg_temp.close_assert((SELECT public.loan_close_calculation_v83('AC7-FUTURE',current_date)::text=pg_temp.loan_close_calculation_v112('AC7-FUTURE',current_date,NULL)::text),'a future charge below the elapsed days is never raised');
SELECT pg_temp.close_assert((SELECT "Ref Payment" IS NULL FROM "Repayments" WHERE "Row ID"='AC7-LEGACY-R1'),'legacy repayment has no receipt link');
SELECT pg_temp.close_assert((SELECT (c->>'amount')::numeric=98 AND c->'mutation'->>'kind'='insert' AND (c->'mutation'->>'principal')::numeric=80
  AND (c->'mutation'->>'interest')::numeric=8 AND jsonb_array_length(c->'allocations')=2
  AND NOT c->'allocations' @> '[{"chargeId":"AC7-LEGACY-C1"}]' AND NOT c->'allocations' @> '[{"chargeId":"AC7-LEGACY-C2"}]'
  FROM public.loan_close_calculation_v83('AC7-LEGACY',current_date) c),'payoff counts unlinked repayments: principal plus unpaid balances');
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['NONE','OLD','PART','PAID','SAME','FUTURE'] LOOP
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Loan","Payment Date","Amount Received","Allocation Method","Status") VALUES ('CI-DAD','AC7-P-'||n,'AC7-B','AC7-'||n,current_date,1::money,'Loan Close','Processing');
END LOOP; END $$;
SELECT pg_temp.close_assert((SELECT bool_and("Status"='Posted') FROM "Payments" WHERE "Row ID" LIKE 'AC7-P-%'),'all close requests posted');
SELECT pg_temp.close_assert((SELECT "Amount Received"::numeric=150 FROM "Payments" WHERE "Row ID"='AC7-P-NONE'),'no existing charge accrual');
SELECT pg_temp.close_assert((SELECT "Amount Received"::numeric=130 FROM "Payments" WHERE "Row ID"='AC7-P-OLD'),'elapsed interest and principal');
SELECT pg_temp.close_assert((SELECT "Amount Received"::numeric=70 FROM "Payments" WHERE "Row ID"='AC7-P-PART'),'partial principal not added twice');
SELECT pg_temp.close_assert((SELECT "Amount Received"::numeric=100 FROM "Payments" WHERE "Row ID"='AC7-P-PAID'),'paid-today interest retained; principal added');
SELECT pg_temp.close_assert((SELECT "Amount Received"::numeric=100 FROM "Payments" WHERE "Row ID"='AC7-P-SAME'),'same-day principal-only closure');
SELECT pg_temp.close_assert(NOT EXISTS(SELECT 1 FROM "Payments" WHERE "Allocation Method"='First-day Auto' AND "Ref Borrower"='AC7-B'),'no first-day auto receipt from final charge');
SELECT pg_temp.close_assert((SELECT "Amount Received"::numeric=120 FROM "Payments" WHERE "Row ID"='AC7-P-FUTURE'),'future principal already scheduled; no double charge');
SELECT pg_temp.close_assert((SELECT count(*)=1 FROM "Charges" WHERE "Ref Loans"='AC7-FUTURE'),'no unnecessary today charge');
SELECT pg_temp.close_assert((SELECT bool_and("Loan Status"='ปิดยอดแล้ว' AND "Ref Closing Payment"='AC7-P-'||substring("Row ID" from 5)) FROM "Loans" WHERE "Row ID" IN ('AC7-NONE','AC7-OLD','AC7-PART','AC7-PAID','AC7-SAME','AC7-FUTURE')),'all requested loans close causally');
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Loan","Payment Date","Amount Received","Allocation Method","Status") VALUES ('CI-DAD','AC7-P-LEGACY','AC7-B','AC7-LEGACY',current_date,1::money,'Loan Close','Processing');
SELECT pg_temp.close_assert((SELECT "Status"='Posted' AND "Amount Received"::numeric=98 FROM "Payments" WHERE "Row ID"='AC7-P-LEGACY'),'legacy loan closes at principal plus unpaid balances');
SELECT pg_temp.close_assert((SELECT "Loan Status"='ปิดยอดแล้ว' AND "Outstanding Principal"=0 FROM "Loans" WHERE "Row ID"='AC7-LEGACY'),'legacy loan closed with no principal left');
SELECT pg_temp.close_assert(NOT EXISTS(SELECT 1 FROM "Repayments" WHERE "Ref Payment"='AC7-P-LEGACY' AND "Ref Charges" IN ('AC7-LEGACY-C1','AC7-LEGACY-C2')),'charges paid by unlinked repayments are not paid again');
SELECT pg_temp.close_assert((SELECT bool_and(v.remaining=0 AND v.pr=0 AND v.ir=0) FROM "Charges" c CROSS JOIN LATERAL public.vc_charge_values(c) v WHERE c."Ref Loans"='AC7-LEGACY'),'every legacy loan charge settled exactly');
SELECT pg_temp.close_assert((SELECT sum("Principal Paid"::numeric)=100 FROM "Repayments" WHERE "Ref Loans"='AC7-LEGACY'),'principal repaid once in total');
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Loan","Payment Date","Amount Received","Allocation Method","Status") VALUES ('CI-DAD','AC7-P-UNLINKED','AC7-OTHER','AC7-UNLINKED',current_date,1::money,'Loan Close','Processing');
SELECT pg_temp.close_assert((SELECT p."Status"='Posted' AND p."Amount Received"::numeric=98 AND l."Loan Status"='ปิดยอดแล้ว' AND l."Outstanding Principal"=0
  FROM "Payments" p JOIN "Loans" l ON l."Row ID"=p."Ref Target Loan" WHERE p."Row ID"='AC7-P-UNLINKED'),'unlinked principal repayment is not collected again');
-- The exclusion case still works: leaving out the closing receipt reproduces the plan it posted.
SELECT pg_temp.close_assert((SELECT (c->>'amount')::numeric=98 AND c->>'excludedPayment'='AC7-P-LEGACY' AND c->'mutation'='null'::jsonb
  FROM public.loan_close_calculation_v83('AC7-LEGACY',current_date,'AC7-P-LEGACY') c),'exclusion leaves out only the closing receipt');
SELECT pg_temp.close_assert(NOT EXISTS(SELECT 1 FROM "Payments" p WHERE p."Row ID" LIKE 'AC7-P-%' AND p."Amount Received"::numeric IS DISTINCT FROM (SELECT sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric) FROM "Repayments" r WHERE r."Ref Payment"=p."Row ID")),'ledger conservation');
UPDATE "Payments" SET "Status"='Processing',"Amount Received"="Amount Received" WHERE "Row ID"='AC7-P-NONE';
SELECT pg_temp.close_assert((SELECT "Status"='Posted' FROM "Payments" WHERE "Row ID"='AC7-P-NONE'),'stale retry no-op');
SELECT pg_temp.close_reject($q$UPDATE "Payments" SET "Ref Target Loan"='AC7-OLD' WHERE "Row ID"='AC7-P-NONE'$q$,'open auto-enabled');
SELECT pg_temp.close_reject($q$INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Loan","Payment Date","Allocation Method","Status") VALUES ('CI-DAD','AC7-DOUBLE','AC7-B','AC7-NONE',current_date,'Loan Close','Processing')$q$,'open auto-enabled');
SELECT pg_temp.close_reject($q$INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Loan","Payment Date","Allocation Method","Status") VALUES ('CI-DAD','AC7-WRONG-P','AC7-OTHER','AC7-WRONG',current_date,'Loan Close','Processing')$q$,'must belong');
SELECT pg_temp.close_reject($q$INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Loan","Payment Date","Allocation Method","Status") VALUES ('CI-DAD','AC7-DUP-P','AC7-B','AC7-DUP',current_date,'Loan Close','Processing')$q$,'Multiple charges today');
SELECT pg_temp.close_reject($q$INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Loan","Payment Date","Allocation Method","Status") VALUES ('CI-DAD','AC7-STALE-P','AC7-B','AC7-STALE',current_date-1,'Loan Close','Processing')$q$,'date is stale');
SELECT pg_temp.close_reject($q$INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Loan","Payment Date","Allocation Method","Status") VALUES ('CI-DAD','AC7-FRACTION-P','AC7-B','AC7-FRACTION',current_date,'Loan Close','Processing')$q$,'whole-baht');
SELECT pg_temp.close_assert(NOT EXISTS(SELECT 1 FROM "Charges" WHERE "Ref Loans"='AC7-FRACTION'),'fractional failure removes prepared charge');
-- Force an error after the ordinary posting trigger; every financial effect must roll back.
CREATE FUNCTION pg_temp.fail_close_post() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW."Row ID"='AC7-FAIL-P' THEN RAISE EXCEPTION 'Synthetic downstream failure'; END IF; RETURN NULL; END $$;
CREATE TRIGGER zz_test_close_failure AFTER INSERT ON "Payments" FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_close_post();
SELECT pg_temp.close_reject($q$INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Loan","Payment Date","Allocation Method","Status") VALUES ('CI-DAD','AC7-FAIL-P','AC7-B','AC7-ROLLBACK',current_date,'Loan Close','Processing')$q$,'Synthetic downstream failure');
SELECT pg_temp.close_assert(NOT EXISTS(SELECT 1 FROM "Charges" WHERE "Ref Loans"='AC7-ROLLBACK') AND NOT EXISTS(SELECT 1 FROM "Payments" WHERE "Row ID"='AC7-FAIL-P') AND NOT EXISTS(SELECT 1 FROM "Repayments" WHERE "Ref Loans"='AC7-ROLLBACK') AND NOT EXISTS(SELECT 1 FROM "Payment Allocations" WHERE "Ref Payment"='AC7-FAIL-P'),'failure removes charge receipt and ledger');
SELECT pg_temp.close_assert((SELECT "Loan Status"='ยังไม่ปิดยอด' AND "Ref Closing Payment" IS NULL FROM "Loans" WHERE "Row ID"='AC7-ROLLBACK'),'failure restores loan state');
-- V113 cases 1 to 7.
SELECT pg_temp.close_assert((SELECT bool_and("Status"='Posted') FROM "Payments" WHERE "Row ID" LIKE 'AC7-FI-%-PRE'),'early payments on future charges posted');
CREATE TEMP TABLE fi_plan AS SELECT n,public.loan_close_calculation_v83('AC7-FI-'||n,current_date) c FROM unnest(ARRAY['NONE','PART','FULL','TODAY','TWO','CAP','ADJ','MIS','PRE']) n;
SELECT pg_temp.close_assert((SELECT c->>'amount'='1030' AND c->'mutation'=jsonb_build_object('kind','insert','chargeId','lc7:11:AC7-FI-NONE:'||current_date,'principal','1000.00','interest','0','futureInterest','[{"chargeId":"AC7-FI-NONE-F1","interestDue":"30"}]'::jsonb)
  AND c->'allocations' @> '[{"chargeId":"AC7-FI-NONE-F1","principal":"0","interest":"30","expectedInterestRemaining":"30"}]' FROM fi_plan WHERE n='NONE'),'case 1: no early payment closes at principal plus the days up to today, billed on F1');
SELECT pg_temp.close_assert((SELECT c->>'amount'='1000' AND c#>'{mutation,futureInterest}'='[{"chargeId":"AC7-FI-PART-F1","interestDue":"40"}]' AND NOT c->'allocations' @> '[{"chargeId":"AC7-FI-PART-F1"}]' FROM fi_plan WHERE n='PART'),'case 2: 40 prepaid covers the days up to today; nothing refunded');
SELECT pg_temp.close_assert((SELECT c->>'amount'='1000' AND c->'mutation'?'kind' AND NOT c->'mutation'?'futureInterest' AND c#>>'{mutation,kind}'='insert' FROM fi_plan WHERE n='FULL'),'case 3: F1 paid in full needs no adjustment');
SELECT pg_temp.close_assert((SELECT c->>'amount'='1030' AND c#>>'{mutation,kind}'='increase' AND c#>>'{mutation,principal}'='1000.00' AND c#>'{mutation,futureInterest}'='[{"chargeId":"AC7-FI-TODAY-F1","interestDue":"20"}]' AND c->>'targetChargeId'='AC7-FI-TODAY-C' FROM fi_plan WHERE n='TODAY'),'case 4: a charge today already covers the days; F1 keeps its paid interest');
SELECT pg_temp.close_assert((SELECT c->>'amount'='1030' AND c#>'{mutation,futureInterest}'='[{"chargeId":"AC7-FI-TWO-F1","interestDue":"30"},{"chargeId":"AC7-FI-TWO-F2","interestDue":"10"}]' FROM fi_plan WHERE n='TWO'),'case 5: only F1 has days; F2 keeps its prepaid 10');
SELECT pg_temp.close_assert((SELECT c->>'amount'='1020' AND NOT c->'mutation'?'futureInterest' FROM fi_plan WHERE n='CAP'),'case 6: a hand-booked F1 below the elapsed days is not raised');
SELECT pg_temp.close_assert((SELECT c->>'amount'='1020' AND c->'mutation'='{"kind":"adjust","futureInterest":[{"chargeId":"AC7-FI-ADJ-F1","interestDue":"10"}]}'::jsonb FROM fi_plan WHERE n='ADJ'),'CH-ADJ: an adjust-only close bills one day on F1');
SELECT pg_temp.close_assert((SELECT c->>'amount'='1010' AND c#>'{mutation,futureInterest}'='[{"chargeId":"AC7-FI-MIS-F1","interestDue":"10"}]' AND c#>>'{mutation,kind}'='adjust' FROM fi_plan WHERE n='MIS'),'MIS: F1 billed least(70, 10 x 1)');
SELECT pg_temp.close_assert((SELECT c->>'amount'='1050' AND c#>'{mutation,futureInterest}'='[{"chargeId":"AC7-FI-PRE-F1","interestDue":"20"}]' FROM fi_plan WHERE n='PRE'),'pre-V113 lc7: then a hand-booked F1: F1 billed least(70, 10 x 2)');
SELECT pg_temp.close_assert((SELECT bool_and(c->>'amount'='1030' AND c#>'{mutation,futureInterest}'=jsonb_build_array(jsonb_build_object('chargeId','AC7-FB-'||n||'-F1','interestDue','30')))
  FROM unnest(ARRAY['MONTH','DAY']) n CROSS JOIN LATERAL public.loan_close_calculation_v83('AC7-FB-'||n,current_date) c),'trail lines dated 2026-99-99 or 2026-02-31 do not raise and leave the charge unsettled');
-- Exclusion: as if the early payment did not exist (the correction preview of that receipt).
SELECT pg_temp.close_assert((SELECT c->>'amount'='1030' AND c#>'{mutation,futureInterest}'='[{"chargeId":"AC7-FI-PART-F1","interestDue":"30"}]' FROM public.loan_close_calculation_v83('AC7-FI-PART',current_date,'AC7-FI-PART-PRE') c),'exclusion of the early payment recomputes F1 from the remaining paid interest');
SELECT pg_temp.close_reject($q$SELECT public.apply_loan_close_calculation_v83('AC7-FI-NONE',current_date,'0000')$q$,'Close plan changed');
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['NONE','PART','FULL','TODAY','TWO','CAP','ADJ','MIS','PRE'] LOOP
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Loan","Payment Date","Amount Received","Allocation Method","Status") VALUES ('CI-DAD','AC7-FI-P-'||n,'AC7-B','AC7-FI-'||n,current_date,1::money,'Loan Close','Processing');
END LOOP; END $$;
SELECT pg_temp.close_assert(NOT EXISTS(SELECT 1 FROM fi_plan JOIN "Payments" p ON p."Row ID"='AC7-FI-P-'||n WHERE p."Status"<>'Posted' OR p."Amount Received"::numeric<>(c->>'amount')::numeric),'every future-charge close posts its previewed amount');
SELECT pg_temp.close_assert((SELECT bool_and("Loan Status"='ปิดยอดแล้ว' AND "Outstanding Principal"=0) FROM "Loans" WHERE "Row ID" LIKE 'AC7-FI-%'),'future-charge loans close normally');
SELECT pg_temp.close_assert((SELECT bool_and(v.remaining=0 AND v.pr=0 AND v.ir=0) FROM "Charges" c CROSS JOIN LATERAL public.vc_charge_values(c) v WHERE c."Ref Loans" LIKE 'AC7-FI-%'),'every charge of a future-charge close settled, future charges included');
SELECT pg_temp.close_assert((SELECT jsonb_object_agg("Row ID","Interest Due"::numeric::text)='{"AC7-FI-NONE-F1":"30.00","AC7-FI-PART-F1":"40.00","AC7-FI-FULL-F1":"70.00","AC7-FI-TODAY-F1":"20.00","AC7-FI-TWO-F1":"30.00","AC7-FI-TWO-F2":"10.00","AC7-FI-CAP-F1":"20.00","AC7-FI-ADJ-F1":"10.00","AC7-FI-MIS-F1":"10.00","AC7-FI-PRE-F1":"20.00"}'::jsonb
  FROM "Charges" WHERE "Ref Loans" LIKE 'AC7-FI-%' AND "Charge Date">current_date),'future charges lowered to their new due only');
SELECT pg_temp.close_assert((SELECT "Notes"='Interest Due lowered from 70 by Loan Close '||current_date FROM "Charges" WHERE "Row ID"='AC7-FI-NONE-F1')
  AND (SELECT "Notes" IS NULL FROM "Charges" WHERE "Row ID"='AC7-FI-FULL-F1'),'lowered charges carry the trail note');
SELECT pg_temp.close_assert(NOT EXISTS(SELECT 1 FROM "Charges" WHERE "Ref Loans"='AC7-FI-TODAY' AND starts_with("Row ID",'lc7:')) AND (SELECT "Principal Due"::numeric=1000 FROM "Charges" WHERE "Row ID"='AC7-FI-TODAY-C'),'case 4: principal added to today''s charge, no lc7 row');
SELECT pg_temp.close_assert((SELECT "Interest Due"::numeric=0 AND "Principal Due"::numeric=1000 FROM "Charges" WHERE "Row ID"='lc7:11:AC7-FI-NONE:'||current_date),'case 1: lc7 carries principal only');
-- Case 7: the correction recompute reproduces the posted plan; deleting the closing receipt reopens with F1 still lowered.
SELECT pg_temp.close_assert((SELECT c->>'amount'='1030' AND c->'mutation'='null'::jsonb FROM public.loan_close_calculation_v83('AC7-FI-NONE',current_date,'AC7-FI-P-NONE') c),'case 7: exclusion recompute after the close gives 1030 and no mutation');
SELECT pg_temp.close_assert((SELECT c->>'amount'='1030' AND c->'mutation'='null'::jsonb FROM public.loan_close_calculation_v83('AC7-FI-TWO',current_date,'AC7-FI-P-TWO') c),'case 5 exclusion recompute reproduces the plan');
SAVEPOINT fi_delete;
UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID"='AC7-FI-P-NONE';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.close_assert((SELECT "Loan Status"='ยังไม่ปิดยอด' AND "Outstanding Principal"=1000 AND "Ref Closing Payment" IS NULL FROM "Loans" WHERE "Row ID"='AC7-FI-NONE'),'case 7: deleting the closing receipt reopens the loan');
SELECT pg_temp.close_assert((SELECT "Interest Due"::numeric=30 AND "Notes" LIKE 'Interest Due lowered from 70 by Loan Close %' FROM "Charges" WHERE "Row ID"='AC7-FI-NONE-F1'),'case 7: F1 stays lowered with its note');
SELECT pg_temp.close_assert((SELECT c->>'amount'='1030' AND c->'mutation'='null'::jsonb FROM public.loan_close_calculation_v83('AC7-FI-NONE',current_date) c),'case 7: a same-day re-close quotes the same 1030 with no mutation');
-- Archie (b) and Chase S1: a later re-close bills the days since the first close on a new lc7: charge; F1 stays settled.
SELECT pg_temp.close_assert((SELECT c->>'amount'='1040' FROM public.loan_close_calculation_v83('AC7-FI-NONE',current_date+1) c),'S1: re-close a day later adds one day');
SELECT pg_temp.close_assert((SELECT c->>'amount'='1050' AND c#>>'{mutation,kind}'='insert' AND (c#>>'{mutation,interest}')::numeric=20 AND (c#>>'{mutation,principal}')::numeric=0 AND NOT c->'mutation'?'futureInterest'
  AND c->'allocations' @> '[{"chargeId":"AC7-FI-NONE-F1","interest":"30"}]' FROM public.loan_close_calculation_v83('AC7-FI-NONE',current_date+2) c),'re-close two days later: F1 stays 30, new lc7: interest 20');
SELECT pg_temp.close_assert((SELECT c->>'amount'='1060' FROM public.loan_close_calculation_v83('AC7-FI-NONE',current_date+3) c),'S1: re-close three days later adds three days');
ROLLBACK TO fi_delete;
SELECT pg_temp.close_assert(NOT EXISTS(SELECT 1 FROM "Charges" WHERE "Ref Loans"='AC7-FI-ADJ' AND starts_with("Row ID",'lc7:')),'CH-ADJ: no lc7: row');
SELECT pg_temp.close_assert((SELECT "Interest Due"::numeric=10 AND "Notes"='Interest Due lowered from 70 by Loan Close '||current_date FROM "Charges" WHERE "Row ID"='AC7-FI-ADJ-F1'),'CH-ADJ: F1 lowered with its trail');
SELECT pg_temp.close_assert((SELECT c->>'amount'='1020' AND c->'mutation'='null'::jsonb FROM public.loan_close_calculation_v83('AC7-FI-ADJ',current_date,'AC7-FI-P-ADJ') c),'CH-ADJ: exclusion recompute adds no gap after the trail');
SAVEPOINT fi_adj_delete;
UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID"='AC7-FI-P-ADJ';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.close_assert((SELECT c->>'amount'='1020' AND c->'mutation'='null'::jsonb FROM public.loan_close_calculation_v83('AC7-FI-ADJ',current_date) c),'CH-ADJ: same-day re-close adds no gap');
ROLLBACK TO fi_adj_delete;
-- Owner's simple inverse: retain prepared/augmented charge, reverse receipt/cash.
SAVEPOINT close_delete;
CREATE TEMP TABLE close_charge_before AS SELECT "Row ID","Principal Due","Interest Due","Notes" FROM "Charges" WHERE "Ref Loans"='AC7-PAID';
UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID"='AC7-P-PAID';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.close_assert((SELECT "Loan Status"='ยังไม่ปิดยอด' AND "Outstanding Principal"=100 AND "Ref Closing Payment" IS NULL FROM "Loans" WHERE "Row ID"='AC7-PAID'),'delete closing receipt reopens');
SELECT pg_temp.close_assert(NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Ref Payment"='AC7-P-PAID'),'close cash removed');
SELECT pg_temp.close_assert(EXISTS(SELECT 1 FROM "Payments" WHERE "Row ID"='AC7-PAID-FIRST'),'earlier receipt retained');
SELECT pg_temp.close_assert(NOT EXISTS((SELECT "Row ID","Principal Due","Interest Due","Notes" FROM "Charges" WHERE "Ref Loans"='AC7-PAID' EXCEPT TABLE close_charge_before) UNION ALL (TABLE close_charge_before EXCEPT SELECT "Row ID","Principal Due","Interest Due","Notes" FROM "Charges" WHERE "Ref Loans"='AC7-PAID')),'prepared amounts retained for explicit edit');
UPDATE "Charges" SET "Principal Due"=0::money WHERE "Row ID"='AC7-PAID-C';
DELETE FROM "Payments" WHERE "Row ID"='AC7-P-NONE';
DELETE FROM "Charges" WHERE "Ref Loans"='AC7-NONE';
SELECT pg_temp.close_assert(NOT EXISTS(SELECT 1 FROM "Charges" WHERE "Ref Loans"='AC7-NONE'),'unreceived generated final charge separately deletable');
ROLLBACK TO close_delete;
SELECT 'Atomic Loan Close regressions passed' AS result;
ROLLBACK;
