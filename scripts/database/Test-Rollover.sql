-- R136 V138 loan rollover (disposable cluster only; synthetic rows; everything rolls back). Archie's executable test plan
-- (cases 1 to 18) with the dates moved to the real Bangkok business date T: an instalment O of 10,000 (fee 1,000, daily payment
-- 500, 25 days, day 1 = fd6: 400/1,100) and a daily-interest O' of 10,000 at 300 a day (fee 1,000, fd6: 0/1,300). Paid days are
-- direct repayments (no payment), so an open loan can hold any balance. loan.rollover runs as the DEV command IAM user through
-- pwa_submit_operation_v2 with the canonical text of services/contracts/operation-command.mjs; the corrections run as the
-- journal owner through the apply functions; setup and checks run as postgres.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'Disposable loopback database required'; END IF;
END $$;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.rl_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END $$;
CREATE TEMP TABLE rl_day ON COMMIT DROP AS SELECT (transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AS d;
GRANT SELECT ON rl_day TO PUBLIC;
CREATE FUNCTION pg_temp.rl_t(o int) RETURNS date LANGUAGE sql AS $f$ SELECT d+o FROM rl_day $f$;
-- Push capture on for this transaction (the payment.posted events of both receipts).
ALTER FUNCTION public.pwa_capture_notification_v1() SET application_name='mw_pwa_capture_enabled_v1';
INSERT INTO public."Partners"("Row ID","Partner Role") VALUES('RL-FUND','A');
INSERT INTO public."Partners"("Row ID","Partner Name","Partner Role","Login Email","Language Preference") VALUES('RL-ACT','Synthetic rollover actor','A','rl-actor@example.invalid','English');
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('RL-CAP','RL-FUND',pg_temp.rl_t(-400),'Contribution',5000000::money);
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Description","Ref Referrer") SELECT 'RL-B'||n,'SYNTHETIC ROLLOVER '||n,'Rollover '||n,NULL FROM generate_series(1,20) n;
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES('RL-REF','SYNTHETIC ROLLOVER REFERRER');
UPDATE public."Borrowers" SET "Ref Referrer"='RL-REF' WHERE "Row ID" IN ('RL-B12','RL-B19');

-- Instalment O: loan date T+start, charges days 1..charged, days 1..paid repaid in full; day 25 principal may be hand-lowered.
CREATE FUNCTION pg_temp.rl_inst(id text,borrower text,start int,charged int,paid int,last_principal numeric DEFAULT 400) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE k int; c text; day date; p numeric; i numeric;
BEGIN
 INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Transfer Fee","Loan Type","Due Date","Daily Payment Amount","Loan Status","Auto Charge Enabled","Interest Payment Interval","Defaulted","Created By")
  VALUES('CI-LISA',id,borrower,pg_temp.rl_t(start),10000::money,1000::money,'ผ่อนชำระรายวัน',pg_temp.rl_t(start+24),500::money,'ยังไม่ปิดยอด',false,1,false,'rl-actor@example.invalid');
 FOR k IN 1..charged LOOP
  day:=pg_temp.rl_t(start+k-1); c:=CASE WHEN k=1 THEN 'fd6:'||id ELSE 'cg8:'||length(id)||':'||id||':'||day END;
  p:=CASE WHEN k=25 THEN last_principal ELSE 400 END; i:=CASE WHEN k=1 THEN 1100 ELSE 100 END;
  INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES(c,id,day,p::money,i::money);
  IF k<=paid THEN INSERT INTO public."Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid") VALUES('rp:'||c,id,c,day,p::money,i::money); END IF;
 END LOOP;
 UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=id;
END $f$;
-- Daily-interest O': loan date T+start, daily charges through T+through, repaid through T+paid.
CREATE FUNCTION pg_temp.rl_daily(id text,borrower text,start int,through int,paid int) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE day date; c text;
BEGIN
 INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Transfer Fee","Loan Type","Current Daily Interest","Loan Status","Auto Charge Enabled","Interest Payment Interval","Defaulted","Created By")
  VALUES('CI-LISA',id,borrower,pg_temp.rl_t(start),10000::money,1000::money,'ดอกเบี้ยรายวัน',300::money,'ยังไม่ปิดยอด',false,1,false,'rl-actor@example.invalid');
 FOR day IN SELECT generate_series(pg_temp.rl_t(start),pg_temp.rl_t(through),interval '1 day')::date LOOP
  c:=CASE WHEN day=pg_temp.rl_t(start) THEN 'fd6:'||id ELSE 'cg8:'||length(id)||':'||id||':'||day END;
  INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES(c,id,day,0::money,(CASE WHEN day=pg_temp.rl_t(start) THEN 1300 ELSE 300 END)::money);
  IF day<=pg_temp.rl_t(paid) THEN INSERT INTO public."Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid") VALUES('rp:'||c,id,c,day,0::money,(CASE WHEN day=pg_temp.rl_t(start) THEN 1300 ELSE 300 END)::money); END IF;
 END LOOP;
 UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=id;
END $f$;

SELECT pg_temp.rl_inst('RL-O1','RL-B1',-17,18,18);     -- 1  owner example, day 18 of 25 is T, all paid
SELECT pg_temp.rl_inst('RL-O2','RL-B2',-17,16,16);     -- 2  latest charge before D (day 16)
SELECT pg_temp.rl_inst('RL-O3','RL-B3',-18,19,19);     -- 3  D = yesterday is day 18, day 19 (T) generated and paid: a charge after D
SELECT pg_temp.rl_inst('RL-O4','RL-B4',-26,25,23);     -- 4  past due (due T-2), days 24 and 25 unpaid
SELECT pg_temp.rl_inst('RL-O5','RL-B5',-26,25,25,200); -- 5  past due, day 25 principal hand-lowered to 200, all paid (D11)
SELECT pg_temp.rl_inst('RL-O6','RL-B6',-30,25,25);     -- 6  past due, fully repaid but open: nothing to settle with penalty 0 (D13)
SELECT pg_temp.rl_inst('RL-O7','RL-B7',-17,18,18);     -- 7  cash issued below zero, then exactly zero (D6)
SELECT pg_temp.rl_daily('RL-D8','RL-B8',-12,0,0);      -- 8  O' with a charge dated D
SELECT pg_temp.rl_daily('RL-D9','RL-B9',-12,-2,-2);    -- 9  O' paid through T-2, no charge for T-1 and T (gap 2 days)
SELECT pg_temp.rl_daily('RL-D10','RL-B10',-12,0,-1);   -- 10 O' D = yesterday, today's charge after D (R101)
SELECT pg_temp.rl_inst('RL-O11','RL-B11',-18,19,18);   -- 11 O D = yesterday, day 19 (T) unpaid
SELECT pg_temp.rl_inst('RL-O12','RL-B12',-17,18,18);   -- 12 referred O, D = today
SELECT pg_temp.rl_inst('RL-O13','RL-B13',-17,18,17);   -- 13 stale quote
SELECT pg_temp.rl_inst('RL-O14','RL-B14',-17,18,18);   -- 14 a Processing payment of the borrower
SELECT pg_temp.rl_inst('RL-O15','RL-B15',-17,18,18);   -- 15 an overpaid charge
SELECT pg_temp.rl_inst('RL-O19','RL-B19',-18,19,19);   -- 12 referred O, D = yesterday
SELECT pg_temp.rl_daily('RL-D20','RL-B20',-12,0,0);    -- 8  O' cash below zero with the default terms
SELECT pg_temp.rl_inst('RL-O21','RL-B17',0,1,1);       -- 19 rollover on O's own loan date (only its first-day charge exists)
SELECT pg_temp.rl_daily('RL-D22','RL-B18',0,0,0);      -- 19 O' rolled over on its own loan date
-- The referrer's open loan (daily interest 10, a charge today), which takes the rebate offsets.
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Current Daily Interest","Loan Status","Auto Charge Enabled","Interest Payment Interval","Defaulted")
 VALUES('CI-LISA','RL-REFL','RL-REF',pg_temp.rl_t(-3),1000::money,'ดอกเบี้ยรายวัน',10::money,'ยังไม่ปิดยอด',false,1,false);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('RL-REFL-today','RL-REFL',pg_temp.rl_t(0),0::money,10::money);
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='RL-REFL';
-- 15: an overpaid charge (more interest repaid than due).
INSERT INTO public."Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid") VALUES('rp:over','RL-O15','fd6:RL-O15',pg_temp.rl_t(-17),0::money,5::money);
SET CONSTRAINTS ALL IMMEDIATE;

-- Quotes (cases 1 to 11): unpaid / uncharged days or gap / missing principal / interest / penalty / settlement.
CREATE FUNCTION pg_temp.rl_q(loan text,dayoff int,penalty numeric) RETURNS jsonb LANGUAGE sql AS $f$ SELECT public.loan_rollover_calculation_v1(loan,pg_temp.rl_t(dayoff),penalty) $f$;
DO $$
DECLARE q jsonb;
BEGIN
 q:=pg_temp.rl_q('RL-O1',0,2000);
 PERFORM pg_temp.rl_assert(q->>'eligible'='true' AND q->>'unpaid'='0' AND (q->>'unchargedDays')::int=7 AND q->>'missingPrincipal'='2800' AND q->>'remainingInterest'='700' AND q->>'penalty'='2000'
  AND q->>'settlement'='5500' AND q->>'interestClamped'='false' AND q#>>'{closingCharge,principal}'='2800' AND q#>>'{closingCharge,interest}'='2700' AND jsonb_array_length(q->'allocations')=1
  AND q#>>'{allocations,0,chargeId}'='rl138:5:RL-O1:'||pg_temp.rl_t(0) AND q->>'planHash'~'^[a-f0-9]{64}$','1: owner example quote 0/7/2800/700/2000 = 5500, the closing charge alone');
 q:=pg_temp.rl_q('RL-O2',0,2000);
 PERFORM pg_temp.rl_assert(q->>'unpaid'='0' AND (q->>'unchargedDays')::int=9 AND q->>'missingPrincipal'='3600' AND q->>'remainingInterest'='900' AND q->>'settlement'='6500'
  AND q#>>'{closingCharge,interest}'='2900','2: latest charge before D: 9 days, 3600 + 900 + 2000 = 6500');
 q:=pg_temp.rl_q('RL-O3',-1,2000);
 PERFORM pg_temp.rl_assert(q->>'unpaid'='0' AND (q->>'unchargedDays')::int=6 AND q->>'missingPrincipal'='2400' AND q->>'remainingInterest'='600' AND q->>'settlement'='5000'
  AND q->'futureInterest'='null'::jsonb,'3: a paid charge after D: 6 days, 5000, no lowering on an instalment loan');
 q:=pg_temp.rl_q('RL-O4',0,2000);
 PERFORM pg_temp.rl_assert(q->>'unpaid'='1000' AND (q->>'unchargedDays')::int=0 AND q->>'missingPrincipal'='0' AND q->>'remainingInterest'='0' AND q->>'settlement'='3000' AND jsonb_array_length(q->'allocations')=3
  AND q#>>'{closingCharge,principal}'='0' AND q#>>'{closingCharge,interest}'='2000','4: past due (D12): unpaid 1000, no interest for the overdue days, 3000');
 q:=pg_temp.rl_q('RL-O5',0,2000);
 PERFORM pg_temp.rl_assert(q->>'unpaid'='0' AND q->>'missingPrincipal'='200' AND q->>'remainingInterest'='0' AND q->>'interestClamped'='true' AND q->>'settlement'='2200'
  AND q#>>'{closingCharge,principal}'='200' AND q#>>'{closingCharge,interest}'='2000','5: negative remaining interest is charged as 0 (D11), 2200');
 q:=pg_temp.rl_q('RL-O6',0,0);
 PERFORM pg_temp.rl_assert(q->>'eligible'='false' AND q->>'reason'='nothing','6: nothing to settle with penalty 0 is refused (D13)');
 PERFORM pg_temp.rl_assert(pg_temp.rl_q('RL-O6',0,1)->>'settlement'='1','6: the same loan with a penalty settles the penalty');
 BEGIN PERFORM pg_temp.rl_q('RL-O1',0,0.5); RAISE EXCEPTION 'FAILED: 6: a fractional penalty was accepted'; EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 BEGIN PERFORM pg_temp.rl_q('RL-O1',0,-500); RAISE EXCEPTION 'FAILED: 6: a negative penalty was accepted'; EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 q:=pg_temp.rl_q('RL-D8',0,1200);
 PERFORM pg_temp.rl_assert(q->>'type'='ดอกเบี้ยรายวัน' AND q->>'unpaid'='0' AND (q->>'gapDays')::int=0 AND q->>'gapInterest'='0' AND q->>'missingPrincipal'='10000' AND q->>'settlement'='11200'
  AND q#>>'{closingCharge,principal}'='10000' AND q#>>'{closingCharge,interest}'='1200' AND jsonb_array_length(q->'allocations')=1,'8: O'' with a charge dated D: 10000 + 1200 = 11200, no lc7:');
 q:=pg_temp.rl_q('RL-D9',0,1200);
 PERFORM pg_temp.rl_assert(q->>'unpaid'='0' AND (q->>'gapDays')::int=2 AND q->>'gapInterest'='600' AND q->>'missingPrincipal'='10000' AND q->>'settlement'='11800'
  AND q#>>'{closingCharge,interest}'='1800','9: O'' 3% example: gap 2 x 300, 11800');
 q:=pg_temp.rl_q('RL-D10',-1,1200);
 PERFORM pg_temp.rl_assert(q->>'unpaid'='0' AND q->>'gapInterest'='0' AND q->>'settlement'='11200' AND jsonb_array_length(q->'futureInterest')=1
  AND q#>>'{futureInterest,0,interestDue}'='0','10: O'' on yesterday: today''s charge lowered to 0 (R101), 11200');
 q:=pg_temp.rl_q('RL-O11',-1,2000);
 PERFORM pg_temp.rl_assert(q->>'unpaid'='500' AND (q->>'unchargedDays')::int=6 AND q->>'missingPrincipal'='2400' AND q->>'remainingInterest'='600' AND q->>'settlement'='5500'
  AND jsonb_array_length(q->'allocations')=2,'11: O on yesterday with today''s charge unpaid: 500 + 2400 + 600 + 2000 = 5500');
 PERFORM pg_temp.rl_assert(pg_temp.rl_q('RL-O15',0,2000)->>'reason'='reconcile','15: an overpaid charge is refused');
 PERFORM pg_temp.rl_assert(pg_temp.rl_q('RL-O1',-18,2000)->>'reason'='date','the rollover day is never before the loan date');
END $$;

-- loan.rollover as the canonical operation text (inputs in the server's fixed order).
CREATE FUNCTION pg_temp.rl_cmd(request text,target text,source text,dayoff int,penalty int,principal int,fee int,daily int,hash text DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE o public."Loans"%ROWTYPE; q jsonb; d date:=pg_temp.rl_t(dayoff); inst boolean;
BEGIN
 SELECT * INTO o FROM public."Loans" WHERE "Row ID"=source; inst:=o."Loan Type"='ผ่อนชำระรายวัน';
 q:=public.loan_rollover_calculation_v1(source,d,penalty);
 RETURN '{"contractVersion":2,"requestId":'||to_json(request)::text||',"actor":{"issuer":"https://securetoken.google.com/clever-oasis-508610-n7","subject":"rl-owner","partnerId":"RL-ACT","loginEmail":"rl-actor@example.invalid"},'
  ||'"command":{"schemaVersion":1,"operation":"loan.rollover","targetType":"loan","targetId":'||to_json(target)::text||',"expectedVersion":null,"predecessorRequestId":null,"inputs":{'
  ||'"borrowerId":'||to_json(o."Ref Borrowers")::text||',"loanDate":"'||d||'","principal":"'||principal||'","transferFee":"'||fee||'","disbursingAccountId":"CI-LISA","type":'||to_json(o."Loan Type")::text
  ||',"dueDate":'||CASE WHEN inst THEN '"'||(d+24)||'"' ELSE 'null' END||',"dailyPayment":'||CASE WHEN inst THEN '"'||daily||'"' ELSE 'null' END||',"fixedInterest":null'
  ||',"currentDailyInterest":'||CASE WHEN inst THEN 'null' ELSE '"'||daily||'"' END||',"paymentInterval":1,"arrangement":'||to_json('Rollover of loan '||source)::text||',"autoChargeEnabled":true'
  ||',"sourceLoanId":'||to_json(source)::text||',"sourceExpectedVersion":"'||public.pwa_loan_version_v2(source)||'","penalty":"'||penalty||'","expectedSettlement":"'||coalesce(q->>'settlement','1')
  ||'","expectedPlanHash":"'||coalesce(hash,q->>'planHash',repeat('0',64))||'"}},"receipt":null}';
END $f$;
CREATE TEMP TABLE rl_cmds(name text PRIMARY KEY,request text,target text,source text,canonical text,expect text,result jsonb) ON COMMIT DROP;
GRANT ALL ON rl_cmds TO PUBLIC;
INSERT INTO rl_cmds(name,request,target,source,canonical,expect) VALUES
 ('1','d1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','RL-O1',pg_temp.rl_cmd('d1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','RL-O1',0,2000,10000,1000,500),'applied'),
 ('2','d1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000002','RL-O2',pg_temp.rl_cmd('d1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000002','RL-O2',0,2000,10000,1000,500),'applied'),
 ('3','d1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000003','RL-O3',pg_temp.rl_cmd('d1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000003','RL-O3',-1,2000,10000,1000,500),'applied'),
 ('4','d1000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000004','RL-O4',pg_temp.rl_cmd('d1000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000004','RL-O4',0,2000,10000,1000,500),'applied'),
 ('5','d1000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000005','RL-O5',pg_temp.rl_cmd('d1000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000005','RL-O5',0,2000,10000,1000,500),'applied'),
 ('6','d1000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000006','RL-O6',pg_temp.rl_cmd('d1000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000006','RL-O6',0,0,10000,1000,500),'rollover_ineligible'),
 ('7a','d1000000-0000-4000-8000-000000000071','e1000000-0000-4000-8000-000000000071','RL-O7',pg_temp.rl_cmd('d1000000-0000-4000-8000-000000000071','e1000000-0000-4000-8000-000000000071','RL-O7',0,2000,6000,600,300),'rollover_ineligible'),
 ('7b','d1000000-0000-4000-8000-000000000072','e1000000-0000-4000-8000-000000000072','RL-O7',pg_temp.rl_cmd('d1000000-0000-4000-8000-000000000072','e1000000-0000-4000-8000-000000000072','RL-O7',0,2450,7000,700,350),'applied'),
 ('8a','d1000000-0000-4000-8000-000000000081','e1000000-0000-4000-8000-000000000081','RL-D20',pg_temp.rl_cmd('d1000000-0000-4000-8000-000000000081','e1000000-0000-4000-8000-000000000081','RL-D20',0,1200,10000,1000,300),'rollover_ineligible'),
 ('8','d1000000-0000-4000-8000-000000000008','e1000000-0000-4000-8000-000000000008','RL-D8',pg_temp.rl_cmd('d1000000-0000-4000-8000-000000000008','e1000000-0000-4000-8000-000000000008','RL-D8',0,1200,15000,1500,450),'applied'),
 ('9','d1000000-0000-4000-8000-000000000009','e1000000-0000-4000-8000-000000000009','RL-D9',pg_temp.rl_cmd('d1000000-0000-4000-8000-000000000009','e1000000-0000-4000-8000-000000000009','RL-D9',0,1200,15000,1500,450),'applied'),
 ('10','d1000000-0000-4000-8000-000000000010','e1000000-0000-4000-8000-000000000010','RL-D10',pg_temp.rl_cmd('d1000000-0000-4000-8000-000000000010','e1000000-0000-4000-8000-000000000010','RL-D10',-1,1200,15000,1500,450),'applied'),
 ('11','d1000000-0000-4000-8000-000000000011','e1000000-0000-4000-8000-000000000011','RL-O11',pg_temp.rl_cmd('d1000000-0000-4000-8000-000000000011','e1000000-0000-4000-8000-000000000011','RL-O11',-1,2000,10000,1000,500),'applied'),
 ('12','d1000000-0000-4000-8000-000000000012','e1000000-0000-4000-8000-000000000012','RL-O12',pg_temp.rl_cmd('d1000000-0000-4000-8000-000000000012','e1000000-0000-4000-8000-000000000012','RL-O12',0,2000,10000,1000,500),'applied'),
 ('12y','d1000000-0000-4000-8000-000000000019','e1000000-0000-4000-8000-000000000019','RL-O19',pg_temp.rl_cmd('d1000000-0000-4000-8000-000000000019','e1000000-0000-4000-8000-000000000019','RL-O19',-1,2000,10000,1000,500),'applied'),
 ('13','d1000000-0000-4000-8000-000000000013','e1000000-0000-4000-8000-000000000013','RL-O13',pg_temp.rl_cmd('d1000000-0000-4000-8000-000000000013','e1000000-0000-4000-8000-000000000013','RL-O13',0,2000,10000,1000,500),'source_conflict'),
 ('14','d1000000-0000-4000-8000-000000000014','e1000000-0000-4000-8000-000000000014','RL-O14',NULL,'rollover_ineligible'),
 ('15','d1000000-0000-4000-8000-000000000015','e1000000-0000-4000-8000-000000000015','RL-O15',pg_temp.rl_cmd('d1000000-0000-4000-8000-000000000015','e1000000-0000-4000-8000-000000000015','RL-O15',0,2000,10000,1000,500),'rollover_ineligible'),
 ('21','d1000000-0000-4000-8000-000000000121','e1000000-0000-4000-8000-000000000121','RL-O21',pg_temp.rl_cmd('d1000000-0000-4000-8000-000000000121','e1000000-0000-4000-8000-000000000121','RL-O21',0,2000,30000,3000,1500),'applied'),
 ('22','d1000000-0000-4000-8000-000000000122','e1000000-0000-4000-8000-000000000122','RL-D22',pg_temp.rl_cmd('d1000000-0000-4000-8000-000000000122','e1000000-0000-4000-8000-000000000122','RL-D22',0,1200,15000,1500,450),'applied'),
 -- a day two days back is refused (D7), as is a type other than the original loan's
 ('date','d1000000-0000-4000-8000-0000000000d1','e1000000-0000-4000-8000-0000000000d1','RL-O2',pg_temp.rl_cmd('d1000000-0000-4000-8000-0000000000d1','e1000000-0000-4000-8000-0000000000d1','RL-O2',-2,2000,10000,1000,500),'invalid_date');
-- 14: a Processing payment of the borrower (left unposted, as an interrupted receipt would be).
SET LOCAL session_replication_role=replica;
INSERT INTO public."Payments"("Row ID","Ref Borrower","Amount Received","Payment Date","Allocation Method","Status","Ref Received By Cash Account") VALUES('RL-P14','RL-B14',100::money,pg_temp.rl_t(0),'Receive All','Processing','CI-DAD');
SET LOCAL session_replication_role=origin;
UPDATE rl_cmds SET canonical=pg_temp.rl_cmd(request,target,source,0,2000,10000,1000,500) WHERE name='14';
-- 13: the original loan changes after the quote (a 100 receipt on day 18).
INSERT INTO public."Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid") SELECT 'rp:stale','RL-O13',"Row ID",pg_temp.rl_t(0),0::money,100::money FROM public."Charges" WHERE "Ref Loans"='RL-O13' AND "Charge Date"=pg_temp.rl_t(0);
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
 PERFORM pg_temp.rl_assert(pg_temp.rl_q('RL-O14',0,2000)->>'reason'='processing','14: a Processing payment makes the loan ineligible');
END $$;
-- Refused texts: a negative penalty, a schedule anchor, a key out of order.
SELECT set_config('rl.negative',replace((SELECT canonical FROM rl_cmds WHERE name='2'),'"penalty":"2000"','"penalty":"-500"'),true),
 set_config('rl.order',replace((SELECT canonical FROM rl_cmds WHERE name='2'),'"autoChargeEnabled":true,"sourceLoanId"','"sourceLoanId"'),true);

-- Operator grants, emulated and rolled back (as Test-AgentLoanClose.sql).
GRANT USAGE ON SCHEMA public TO mw_app_dev; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mw_app_dev; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO mw_app_dev;
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover,pwa_row_changes,pwa_rebate_settlements FROM mw_app_dev;
REVOKE USAGE,UPDATE ON SEQUENCE pwa_row_changes_seq_seq FROM mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_submit_operation_v2(text) TO mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_operation_status_v2(uuid,text,text) TO mw_app_dev;

SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE c record; r jsonb; k text;
BEGIN
 FOR c IN SELECT * FROM rl_cmds ORDER BY name LOOP
  r:=public.pwa_submit_operation_v2(c.canonical);
  UPDATE rl_cmds SET result=r WHERE name=c.name;
  IF coalesce(r#>>'{originalOutcome,code}',r#>>'{originalOutcome,status}') IS DISTINCT FROM c.expect THEN RAISE EXCEPTION 'FAILED: command % expected %: %',c.name,c.expect,r; END IF;
 END LOOP;
 -- Idempotency: the same request replays its recorded outcome; another payload under the same id is a conflict.
 r:=public.pwa_submit_operation_v2((SELECT canonical FROM rl_cmds WHERE name='1'));
 IF r#>>'{originalOutcome,status}' IS DISTINCT FROM 'applied' OR r#>>'{originalOutcome,result,settlement,paymentId}' IS DISTINCT FROM 'pwa:d1000000-0000-4000-8000-000000000001' THEN RAISE EXCEPTION 'FAILED: replay %',r; END IF;
 IF public.pwa_submit_operation_v2(replace((SELECT canonical FROM rl_cmds WHERE name='1'),'Rollover of loan RL-O1','Other note'))<>'{"kind":"conflict"}'::jsonb THEN RAISE EXCEPTION 'FAILED: another payload under the same id must conflict'; END IF;
 FOREACH k IN ARRAY ARRAY['rl.negative','rl.order'] LOOP
  BEGIN PERFORM public.pwa_submit_operation_v2(current_setting(k)); RAISE EXCEPTION 'FAILED: % was accepted',k;
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 END LOOP;
END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;

-- Post-apply state.
CREATE FUNCTION pg_temp.rl_settlement(n text) RETURNS text LANGUAGE sql AS $f$ SELECT 'pwa:'||request FROM rl_cmds WHERE name=n $f$;
CREATE FUNCTION pg_temp.rl_cash(source text) RETURNS numeric LANGUAGE sql AS $f$
 SELECT sum(CASE WHEN c."Ref To Cash Account"='CI-LISA' THEN c."Amount"::numeric WHEN c."Ref From Cash Account"='CI-LISA' THEN -c."Amount"::numeric ELSE 0 END)
 FROM public."Cash Ledger" c WHERE c."Ref Payment" IN (SELECT pg_temp.rl_settlement(n.name) FROM rl_cmds n WHERE n.source=$1 AND n.expect='applied')
  OR c."Ref Payment" IN (SELECT 'fd6:fd6:'||n.target FROM rl_cmds n WHERE n.source=$1 AND n.expect='applied') OR c."Ref Loan" IN (SELECT n.target FROM rl_cmds n WHERE n.source=$1 AND n.expect='applied') $f$;
DO $$
DECLARE r jsonb; s jsonb; t date:=pg_temp.rl_t(0); y date:=pg_temp.rl_t(-1);
BEGIN
 -- 1. The owner example.
 r:=(SELECT result#>'{originalOutcome,result}' FROM rl_cmds WHERE name='1'); s:=r#>'{rollover,statement}';
 PERFORM pg_temp.rl_assert(s->>'cashIssued'='3000' AND s->>'profit'='3800' AND s->>'available'='8500' AND s->>'firstDayPayment'='500' AND s->>'documentationFee'='1000' AND s->>'settlement'='5500',
  '1: statement cash 3000, profit 3800, available 8500');
 PERFORM pg_temp.rl_assert(r->>'paymentId'='fd6:fd6:e1000000-0000-4000-8000-000000000001' AND r#>>'{rollover,closedLoanId}'='RL-O1' AND r#>>'{rollover,newLoanId}'='e1000000-0000-4000-8000-000000000001'
  AND r#>>'{settlement,plan,allocationMethod}'='Selected Charges' AND r#>'{settlement,plan,targetLoanId}'='null'::jsonb,'1: the journal row holds both receipts');
 PERFORM pg_temp.rl_assert((SELECT "Principal Due"::numeric=2800 AND "Interest Due"::numeric=2700 AND "Charge Date"=t AND "Notes" LIKE 'Rollover to loan SYNTHETIC ROLLOVER 1 - Rollover 1-฿10,000-%: 7 days not yet charged x ฿500 = 3500 (principal 2800, interest 700), early closure penalty ฿2000'
   FROM public."Charges" WHERE "Row ID"='rl138:5:RL-O1:'||t),'1: the closing charge 2800 + 2700 with its breakdown');
 PERFORM pg_temp.rl_assert((SELECT "Loan Status"='ปิดยอดแล้ว' AND "Ref Closing Payment"=pg_temp.rl_settlement('1') AND "Close Date"=t FROM public."Loans" WHERE "Row ID"='RL-O1'),'1: O closed by the settlement today');
 PERFORM pg_temp.rl_assert((SELECT "Status"='Posted' AND "Amount Received"::numeric=5500 AND "Payment Method"='Net-off at Disbursement' AND "Allocation Method"='Selected Charges' AND "Payment Date"=t
   AND "Ref Target Loan" IS NULL AND "Ref Received By Cash Account"='CI-LISA' AND "Notes" LIKE 'Rollover to loan SYNTHETIC ROLLOVER 1 - Rollover 1-฿10,000-'||to_char(t,'DD/MM')||'-1%' FROM public."Payments" WHERE "Row ID"=pg_temp.rl_settlement('1')),
  '1: the settlement payment 5500 Net-off, Selected Charges, dated D, notes naming N');
 PERFORM pg_temp.rl_assert((SELECT count(*)=1 FROM public."Payment Allocations" WHERE "Ref Payment"=pg_temp.rl_settlement('1')),'1: the settlement pays the closing charge only');
 PERFORM pg_temp.rl_assert((SELECT "Ref Rollover Source Loan"='RL-O1' AND "Loan Date"=t AND "Due Date"=t+24 AND "Loan Status"='ยังไม่ปิดยอด' FROM public."Loans" WHERE "Row ID"='e1000000-0000-4000-8000-000000000001')
   AND (SELECT "Principal Due"::numeric=400 AND "Interest Due"::numeric=1100 FROM public."Charges" WHERE "Row ID"='fd6:e1000000-0000-4000-8000-000000000001')
   AND (SELECT "Status"='Posted' AND "Amount Received"::numeric=1500 FROM public."Payments" WHERE "Row ID"='fd6:fd6:e1000000-0000-4000-8000-000000000001'),'1: N with its link, first-day charge 400/1100 and net-off 1500');
 PERFORM pg_temp.rl_assert(pg_temp.rl_cash('RL-O1')=-3000 AND (SELECT count(*) FROM public."Cash Ledger" WHERE "Movement Date"=t AND ("Ref Payment" IN (pg_temp.rl_settlement('1'),'fd6:fd6:e1000000-0000-4000-8000-000000000001') OR "Ref Loan"='e1000000-0000-4000-8000-000000000001'))=3,
  '1: the ledger on D: -10000 disbursement, +1500 first-day, +5500 settlement = 3000 out');
 PERFORM pg_temp.rl_assert((SELECT sum("Interest Paid"::numeric) FROM public."Repayments" WHERE "Payment Date"=t AND ("Ref Payment"=pg_temp.rl_settlement('1') OR "Ref Payment"='fd6:fd6:e1000000-0000-4000-8000-000000000001'))=3800,
  '1: profit recognized on D is the interest the apply posted, 3800');
 PERFORM pg_temp.rl_assert((SELECT "Outstanding Principal"=0 FROM public."Loans" WHERE "Row ID"='RL-O1') AND (SELECT "Outstanding Principal"=9600 FROM public."Loans" WHERE "Row ID"='e1000000-0000-4000-8000-000000000001'),
  '1: borrower totals: O fully recovered, N lent 10000 less its first-day principal 400');
 PERFORM pg_temp.rl_assert((SELECT "Row ID" FROM public."Loans" WHERE "Ref Rollover Source Loan"='RL-O1')='e1000000-0000-4000-8000-000000000001','1: O finds N through the link');
 -- 2 to 5.
 PERFORM pg_temp.rl_assert((SELECT "Principal Due"::numeric=3600 AND "Interest Due"::numeric=2900 FROM public."Charges" WHERE "Row ID"='rl138:5:RL-O2:'||t)
   AND (SELECT result#>>'{originalOutcome,result,rollover,statement,cashIssued}' FROM rl_cmds WHERE name='2')='2000','2: closing charge 3600 + 2900, cash 2000');
 PERFORM pg_temp.rl_assert((SELECT "Interest Due"::numeric=100 AND "Notes" IS NULL FROM public."Charges" WHERE "Ref Loans"='RL-O3' AND "Charge Date"=t)
   AND (SELECT "Principal Due"::numeric=2400 AND "Interest Due"::numeric=2600 FROM public."Charges" WHERE "Row ID"='rl138:5:RL-O3:'||y)
   AND (SELECT result#>>'{originalOutcome,result,rollover,statement,cashIssued}' FROM rl_cmds WHERE name='3')='3500','3: the charge after D is untouched; closing charge 2400 + 2600, cash 3500');
 PERFORM pg_temp.rl_assert((SELECT "Principal Due"::numeric=0 AND "Interest Due"::numeric=2000 FROM public."Charges" WHERE "Row ID"='rl138:5:RL-O4:'||t)
   AND (SELECT count(*)=3 FROM public."Payment Allocations" WHERE "Ref Payment"=pg_temp.rl_settlement('4'))
   AND (SELECT result#>>'{originalOutcome,result,rollover,statement}' FROM rl_cmds WHERE name='4')::jsonb @> '{"cashIssued":"5500","profit":"3300"}'
   AND NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"='RL-O4' AND "Charge Date">pg_temp.rl_t(-2) AND NOT starts_with("Row ID",'rl138:')),'4: past due: days 24, 25 and the penalty; no overdue interest; cash 5500, profit 3300');
 PERFORM pg_temp.rl_assert((SELECT "Principal Due"::numeric=200 AND "Interest Due"::numeric=2000 FROM public."Charges" WHERE "Row ID"='rl138:5:RL-O5:'||t)
   AND (SELECT result#>>'{originalOutcome,result,rollover,statement}' FROM rl_cmds WHERE name='5')::jsonb @> '{"cashIssued":"6300","profit":"3100"}','5: closing charge 200 + 2000, cash 6300, profit 3100');
 -- 6, 7, 8a, 13, 14, 15, date: nothing written.
 PERFORM pg_temp.rl_assert(NOT EXISTS(SELECT 1 FROM public."Loans" WHERE "Row ID" IN (SELECT target FROM rl_cmds WHERE expect<>'applied'))
   AND NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID" IN (SELECT 'pwa:'||request FROM rl_cmds WHERE expect<>'applied'))
   AND NOT EXISTS(SELECT 1 FROM public."Charges" WHERE starts_with("Row ID",'rl138:') AND "Ref Loans" IN ('RL-O6','RL-D20','RL-O13','RL-O14','RL-O15'))
   AND (SELECT bool_and("Loan Status"='ยังไม่ปิดยอด') FROM public."Loans" WHERE "Row ID" IN ('RL-O6','RL-D20','RL-O13','RL-O14','RL-O15')),'refused rollovers write nothing');
 PERFORM pg_temp.rl_assert((SELECT result#>>'{originalOutcome,result,rollover,statement,cashIssued}' FROM rl_cmds WHERE name='7b')='0','7: cash issued exactly zero is allowed (D6)');
 -- 8 to 10: daily interest.
 PERFORM pg_temp.rl_assert((SELECT "Principal Due"::numeric=10000 AND "Interest Due"::numeric=1200 FROM public."Charges" WHERE "Row ID"='rl138:5:RL-D8:'||t)
   AND NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"='RL-D8' AND starts_with("Row ID",'lc7:'))
   AND (SELECT result#>>'{originalOutcome,result,rollover,statement}' FROM rl_cmds WHERE name='8')::jsonb @> '{"cashIssued":"1850","profit":"3150","firstDayPayment":"450"}'
   AND (SELECT "Loan Status"='ปิดยอดแล้ว' FROM public."Loans" WHERE "Row ID"='RL-D8'),'8: O'' closed with 10000 + 1200, no lc7:, cash 1850, profit 3150');
 PERFORM pg_temp.rl_assert((SELECT "Principal Due"::numeric=10000 AND "Interest Due"::numeric=1800 FROM public."Charges" WHERE "Row ID"='rl138:5:RL-D9:'||t)
   AND (SELECT result#>>'{originalOutcome,result,rollover,statement}' FROM rl_cmds WHERE name='9')::jsonb @> '{"cashIssued":"1250","profit":"3750"}','9: gap 600 + penalty 1200, cash 1250, profit 3750');
 PERFORM pg_temp.rl_assert((SELECT "Interest Due"::numeric=0 AND "Notes"='Interest Due lowered from 300 by Loan Close '||y||E'\nRollover to loan SYNTHETIC ROLLOVER 10 - Rollover 10-฿15,000-'||to_char(y,'DD/MM')||'-3%'
    FROM public."Charges" WHERE "Ref Loans"='RL-D10' AND "Charge Date"=t),'10: today''s charge lowered to 0 with the exact V113 trail line');
 PERFORM pg_temp.rl_assert((SELECT "Close Date"=t AND "Loan Status"='ปิดยอดแล้ว' FROM public."Loans" WHERE "Row ID"='RL-D10') AND (SELECT "Payment Date"=y FROM public."Payments" WHERE "Row ID"=pg_temp.rl_settlement('10'))
   AND (SELECT "Charge Date"=y FROM public."Charges" WHERE "Row ID"='fd6:e1000000-0000-4000-8000-000000000010')
   AND (SELECT "Interest Due"::numeric=450 AND "Principal Due"::numeric=0 FROM public."Charges" WHERE "Ref Loans"='e1000000-0000-4000-8000-000000000010' AND "Charge Date"=t),
  '10: O'' Close Date today, settlement dated yesterday, N'' first day yesterday and its charge for today generated');
 -- 11.
 PERFORM pg_temp.rl_assert((SELECT "Principal Due"::numeric=2400 AND "Interest Due"::numeric=2600 FROM public."Charges" WHERE "Row ID"='rl138:6:RL-O11:'||y)
   AND (SELECT count(*)=2 AND sum("Allocated Amount"::numeric)=5500 FROM public."Payment Allocations" WHERE "Ref Payment"=pg_temp.rl_settlement('11'))
   AND (SELECT "Close Date"=t FROM public."Loans" WHERE "Row ID"='RL-O11')
   AND (SELECT "Principal Due"::numeric=400 AND "Interest Due"::numeric=100 AND "Amount Remaining"::numeric=500 FROM public."Charges" WHERE "Ref Loans"='e1000000-0000-4000-8000-000000000011' AND "Charge Date"=t)
   AND (SELECT result#>>'{originalOutcome,result,rollover,statement}' FROM rl_cmds WHERE name='11')::jsonb @> '{"cashIssued":"3000","profit":"3800"}',
  '11: day 19 and the closing charge 2400 + 2600 settled, O closed today, N''s day-2 charge generated unpaid');

 -- 19. A rollover on the original loan's own loan date: the rl138: closing charge is dated the loan date but is never a
 -- first-day charge (first_day_charge_trigger, V138 section 7); without that exception both applies fail.
 PERFORM pg_temp.rl_assert((SELECT "Principal Due"::numeric=9600 AND "Interest Due"::numeric=4400 AND "Charge Date"=t FROM public."Charges" WHERE "Row ID"='rl138:6:RL-O21:'||t)
   AND (SELECT "Loan Status"='ปิดยอดแล้ว' AND "Close Date"=t FROM public."Loans" WHERE "Row ID"='RL-O21')
   AND (SELECT result#>>'{originalOutcome,result,rollover,statement}' FROM rl_cmds WHERE name='21')::jsonb @> '{"cashIssued":"11500","profit":"7700","firstDayPayment":"1500","settlement":"14000"}','19: instalment O rolled over on its loan date: 9600 + 4400, cash 11500, profit 7700');
 PERFORM pg_temp.rl_assert((SELECT "Principal Due"::numeric=10000 AND "Interest Due"::numeric=1200 FROM public."Charges" WHERE "Row ID"='rl138:6:RL-D22:'||t)
   AND (SELECT "Loan Status"='ปิดยอดแล้ว' FROM public."Loans" WHERE "Row ID"='RL-D22')
   AND (SELECT result#>>'{originalOutcome,result,rollover,statement}' FROM rl_cmds WHERE name='22')::jsonb @> '{"cashIssued":"1850","profit":"3150"}','19: daily-interest O'' rolled over on its loan date: 10000 + 1200, cash 1850, profit 3150');
 -- 12: the referral rebate (10% of 5500 interest) is booked and offset to the referrer's open loan, today and yesterday.
 PERFORM pg_temp.rl_assert((SELECT count(*)=2 AND bool_and("Amount"::numeric=550) FROM public."Business Expenses" WHERE "Source Key" IN ('REFERRAL_REBATE:RL-O12','REFERRAL_REBATE:RL-O19')),'12: rebate 550 on each referred loan');
 PERFORM pg_temp.rl_assert((SELECT count(*)=2 AND bool_and(p."Status"='Posted' AND p."Payment Method"='Referral Rebate Offset' AND p."Ref Borrower"='RL-REF') FROM public."Business Expenses" x JOIN public."Payments" p ON p."Row ID"=x."Ref Offset Payment"
   WHERE x."Source Key" IN ('REFERRAL_REBATE:RL-O12','REFERRAL_REBATE:RL-O19')),'12: each rebate is offset on the referrer''s open loan');
 -- 16 to 18 follow below; 13 and 15 codes were checked at submit.
 PERFORM pg_temp.rl_assert((SELECT count(*) FROM public.pwa_payment_commands WHERE request_id IN (SELECT request::uuid FROM rl_cmds))=(SELECT count(*) FROM rl_cmds),'one journal row per request');
END $$;

-- Borrower totals and the Cash Position statement after cases 1 and 11 (Chase, R136): interest earned = O's interest paid
-- (5500) + N's first-day interest (1100); amount loaned 20000; outstanding principal = N's 10000 less its first-day principal 400;
-- the three movements of a rollover share the rollover day D, the settlement reads as an ordinary loan payment.
DO $$
DECLARE k text; n text; d date;
BEGIN
 FOREACH k IN ARRAY ARRAY['RL-B1','RL-B11'] LOOP
  PERFORM pg_temp.rl_assert((SELECT "Total Interest Earned"::numeric=6600 AND "Total Amount Loaned"::numeric=20000 AND "Total Number of Loans"=2 AND "Total Outstanding Principal"::numeric=9600
    AND "Active Loan Interest Earned"::numeric=1100 AND "Has Closed Loan" AND "Has Active Loan" FROM public."Borrowers" WHERE "Row ID"=k),'borrower totals after the rollover of '||k);
 END LOOP;
 FOREACH n IN ARRAY ARRAY['1','11'] LOOP
  d:=CASE n WHEN '1' THEN pg_temp.rl_t(0) ELSE pg_temp.rl_t(-1) END;
  PERFORM pg_temp.rl_assert((SELECT count(*)=3 AND sum("Signed Amount"::numeric)=-3000
    AND bool_and(CASE "Transaction Type Code" WHEN 'LOAN_DISBURSEMENT' THEN "Signed Amount"::numeric=-10000 WHEN 'FIRST_DAY_PAYMENT' THEN "Signed Amount"::numeric=1500 WHEN 'LOAN_PAYMENT' THEN "Signed Amount"::numeric=5500 ELSE false END)
    FROM public."Cash Account Statement Recent" WHERE "Ref Cash Account"='CI-LISA' AND "Statement Date"=d
     AND ("Ref Payment" IN (pg_temp.rl_settlement(n),'fd6:fd6:'||(SELECT target FROM rl_cmds WHERE name=n)) OR "Ref Loan"=(SELECT target FROM rl_cmds WHERE name=n))),
   'case '||n||': the disbursing account statement on D shows -10000, the first-day net-off 1500 and the settlement 5500 as a loan payment');
 END LOOP;
END $$;

-- 18. Provenance: every receipt the applies created resolves exactly one effective plan; the settlement's plan is its own.
DO $$
DECLARE p text; plan jsonb;
BEGIN
 FOR p IN SELECT pg_temp.rl_settlement(name) FROM rl_cmds WHERE expect='applied' UNION ALL SELECT 'fd6:fd6:'||target FROM rl_cmds WHERE expect='applied'
   UNION ALL SELECT x."Ref Offset Payment" FROM public."Business Expenses" x WHERE x."Source Key" IN ('REFERRAL_REBATE:RL-O12','REFERRAL_REBATE:RL-O19') LOOP
  plan:=public.pwa_effective_payment_plan_v2(p);
  PERFORM pg_temp.rl_assert(plan IS NOT NULL AND (plan#>>'{plan,amountReceived}')::numeric=(SELECT "Amount Received"::numeric FROM public."Payments" WHERE "Row ID"=p),'18: one effective plan for '||p);
 END LOOP;
 PERFORM pg_temp.rl_assert(public.pwa_effective_payment_plan_v2(pg_temp.rl_settlement('1'))#>>'{plan,paymentMethod}'='Net-off at Disbursement'
   AND public.pwa_effective_payment_plan_v2('fd6:fd6:e1000000-0000-4000-8000-000000000001')#>>'{plan,allocationMethod}'='First-day Auto','18: each receipt resolves its own plan');
 PERFORM pg_temp.rl_assert(public.pwa_payment_head_v2(pg_temp.rl_settlement('1'))='d1000000-0000-4000-8000-000000000001' AND public.pwa_payment_head_v2('fd6:fd6:e1000000-0000-4000-8000-000000000001')='d1000000-0000-4000-8000-000000000001',
  '18: both receipts'' correction head is the rollover row');
 PERFORM pg_temp.rl_assert((SELECT count(*) FROM public.pwa_notification_events WHERE event_type='payment.posted' AND source_id IN (pg_temp.rl_settlement('1'),'fd6:fd6:e1000000-0000-4000-8000-000000000001'))=2,
  '18: two "Payment received" events (settlement and first-day net-off)');
 BEGIN
  INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code,result_json)
  SELECT 'd1000000-0000-4000-8000-0000000000ff',2,actor_issuer,actor_subject,actor_partner_id,actor_login_email,replace(canonical_json,'d1000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-0000000000ff'),encode(sha256(convert_to(replace(canonical_json,'d1000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-0000000000ff'),'UTF8')),'hex'),outcome,NULL,NULL,
   jsonb_set(result_json,'{paymentId}','"fd6:fd6:other"') FROM public.pwa_payment_commands WHERE request_id='d1000000-0000-4000-8000-000000000002';
  RAISE EXCEPTION 'FAILED: 18: a second origin of one settlement was accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 -- Versions: the source and new loans' hashes are the current rows' (a later command reads them as expected versions).
 PERFORM pg_temp.rl_assert(public.pwa_loan_version_v2('RL-O1') IS DISTINCT FROM (SELECT (canonical::jsonb)#>>'{command,inputs,sourceExpectedVersion}' FROM rl_cmds WHERE name='1')
   AND public.pwa_loan_version_v2('e1000000-0000-4000-8000-000000000001')~'^[a-f0-9]{64}$','18: O''s version changed; N has one');
END $$;

-- 16 and 17: corrections as the journal owner (the apply functions the command dispatches to).
CREATE FUNCTION pg_temp.rl_owner_call(fn text,canonical text) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE r jsonb;
BEGIN
 EXECUTE 'SET LOCAL ROLE mw_app_dev_journal_owner';
 BEGIN EXECUTE format('SELECT public.%I(%L)',fn,canonical) INTO r;
 EXCEPTION WHEN OTHERS THEN EXECUTE 'RESET ROLE'; RAISE; END;
 EXECUTE 'RESET ROLE';
 RETURN r;
END $f$;
CREATE FUNCTION pg_temp.rl_actor() RETURNS jsonb LANGUAGE sql AS $f$
 SELECT '{"issuer":"https://securetoken.google.com/clever-oasis-508610-n7","subject":"rl-owner","partnerId":"RL-ACT","loginEmail":"rl-actor@example.invalid"}'::jsonb $f$;
-- 16. payment.correct of case 1's settlement (a new note): the explicit plan path, O stays closed, no Loan Close charge.
SELECT pg_temp.rl_owner_call('pwa_apply_payment_v2',jsonb_build_object('contractVersion',2,'requestId','d1000000-0000-4000-8000-0000000000c1','actor',pg_temp.rl_actor(),
 'command',jsonb_build_object('schemaVersion',1,'operation','payment.correct','targetType','payment','targetId',pg_temp.rl_settlement('1'),
  'expectedVersion',public.pwa_payment_version_v2(pg_temp.rl_settlement('1')),'predecessorRequestId',public.pwa_payment_head_v2(pg_temp.rl_settlement('1'))::text,
  'inputs',jsonb_build_object('kind','pwa-plan','receiptMode','preserve','fields',(public.pwa_effective_payment_plan_v2(pg_temp.rl_settlement('1'))->'plan')-'cashAccountId'
   ||jsonb_build_object('cashAccountId','CI-LISA','notes','Rollover settlement corrected'))),'receipt',NULL)::text);
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
 PERFORM pg_temp.rl_assert((SELECT "Notes"='Rollover settlement corrected' AND "Status"='Posted' AND "Amount Received"::numeric=5500 AND "Allocation Method"='Selected Charges' FROM public."Payments" WHERE "Row ID"=pg_temp.rl_settlement('1'))
   AND (SELECT "Loan Status"='ปิดยอดแล้ว' AND "Ref Closing Payment"=pg_temp.rl_settlement('1') FROM public."Loans" WHERE "Row ID"='RL-O1')
   AND NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"='RL-O1' AND starts_with("Row ID",'lc7:'))
   AND public.pwa_payment_head_v2(pg_temp.rl_settlement('1'))='d1000000-0000-4000-8000-0000000000c1'
   AND public.pwa_effective_payment_plan_v2(pg_temp.rl_settlement('1'))->>'effectivePlanRequestId'='d1000000-0000-4000-8000-0000000000c1','16: the settlement is corrected through its explicit plan; O stays closed; no lc7:');
END $$;
-- 17. Reversal of case 2: delete the settlement (O reopens), then the closing charge, then N.
SELECT pg_temp.rl_owner_call('pwa_apply_payment_v2',jsonb_build_object('contractVersion',2,'requestId','d1000000-0000-4000-8000-0000000000c2','actor',pg_temp.rl_actor(),
 'command',jsonb_build_object('schemaVersion',1,'operation','payment.delete','targetType','payment','targetId',pg_temp.rl_settlement('2'),
  'expectedVersion',public.pwa_payment_version_v2(pg_temp.rl_settlement('2')),'predecessorRequestId',public.pwa_payment_head_v2(pg_temp.rl_settlement('2'))::text,'inputs','{}'::jsonb),'receipt',NULL)::text);
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
 PERFORM pg_temp.rl_assert(NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"=pg_temp.rl_settlement('2'))
   AND (SELECT "Loan Status"='ยังไม่ปิดยอด' AND "Ref Closing Payment" IS NULL FROM public."Loans" WHERE "Row ID"='RL-O2')
   AND EXISTS(SELECT 1 FROM public."Charges" WHERE "Row ID"='rl138:5:RL-O2:'||pg_temp.rl_t(0)),'17: deleting the settlement reopens O; the closing charge stays');
 PERFORM pg_temp.rl_assert(pg_temp.rl_q('RL-O2',0,2000)->>'reason'='earlier','17: a second rollover waits until the earlier closing charge is deleted');
END $$;
SELECT pg_temp.rl_owner_call('pwa_apply_charge_v2',jsonb_build_object('contractVersion',2,'requestId','d1000000-0000-4000-8000-0000000000c3','actor',pg_temp.rl_actor(),
 'command',jsonb_build_object('schemaVersion',1,'operation','charge.delete','targetType','charge','targetId','rl138:5:RL-O2:'||pg_temp.rl_t(0),
  'expectedVersion',public.pwa_charge_version_v2('rl138:5:RL-O2:'||pg_temp.rl_t(0)),'predecessorRequestId',NULL,'inputs','{}'::jsonb),'receipt',NULL)::text);
-- The existing first-day rule: N's first-day net-off is deleted first, then N.
SELECT pg_temp.rl_owner_call('pwa_apply_payment_v2',jsonb_build_object('contractVersion',2,'requestId','d1000000-0000-4000-8000-0000000000c5','actor',pg_temp.rl_actor(),
 'command',jsonb_build_object('schemaVersion',1,'operation','payment.delete','targetType','payment','targetId','fd6:fd6:e1000000-0000-4000-8000-000000000002',
  'expectedVersion',public.pwa_payment_version_v2('fd6:fd6:e1000000-0000-4000-8000-000000000002'),'predecessorRequestId',public.pwa_payment_head_v2('fd6:fd6:e1000000-0000-4000-8000-000000000002')::text,'inputs','{}'::jsonb),'receipt',NULL)::text);
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.rl_owner_call('pwa_apply_loan_source_v2',jsonb_build_object('contractVersion',2,'requestId','d1000000-0000-4000-8000-0000000000c4','actor',pg_temp.rl_actor(),
 'command',jsonb_build_object('schemaVersion',1,'operation','loan.delete','targetType','loan','targetId','e1000000-0000-4000-8000-000000000002',
  'expectedVersion',public.pwa_loan_version_v2('e1000000-0000-4000-8000-000000000002'),'predecessorRequestId',NULL,'inputs','{}'::jsonb),'receipt',NULL)::text);
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
 PERFORM pg_temp.rl_assert(NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Row ID"='rl138:5:RL-O2:'||pg_temp.rl_t(0))
   AND NOT EXISTS(SELECT 1 FROM public."Loans" WHERE "Row ID"='e1000000-0000-4000-8000-000000000002')
   AND NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"='fd6:fd6:e1000000-0000-4000-8000-000000000002')
   AND pg_temp.rl_q('RL-O2',0,2000)->>'settlement'='6500','17: the closing charge and N (with its first-day net-off) are deleted; O quotes as before');
 -- The link restricts deleting an original loan that a new loan names.
 INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Defaulted") VALUES
  ('CI-LISA','RL-FK-O','RL-B16',pg_temp.rl_t(0),100::money,'ผ่อนชำระรายวัน','ยังไม่ปิดยอด',false,false);
 INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Defaulted","Ref Rollover Source Loan") VALUES
  ('CI-LISA','RL-FK-N','RL-B16',pg_temp.rl_t(0),100::money,'ผ่อนชำระรายวัน','ยังไม่ปิดยอด',false,false,'RL-FK-O');
 BEGIN DELETE FROM public."Loans" WHERE "Row ID"='RL-FK-O'; RAISE EXCEPTION 'FAILED: 17: an original loan named by a rollover was deleted';
 EXCEPTION WHEN restrict_violation THEN NULL; END;
END $$;
SELECT 'Loan rollover regressions passed' AS result;
ROLLBACK;
