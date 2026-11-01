-- R110 V121 Pay Forward (disposable cluster only; synthetic rows; everything rolls back).
-- pwa_pay_forward_plan_v1 and pwa_submit_selected_charges_v1 schemaVersion 10 run as the DEV command IAM user
-- (SET SESSION AUTHORIZATION, as the submit checks session_user); setup and checks run as postgres.
-- Proves, on behaviour (allocations, booked charges, anchor, daily interest, rejections) and not on field order:
--  * parity: the forward charges the plan books equal what generate_due_charges books for an identical twin loan
--    (daily interest, daily installment, Fixed Due Date D1);
--  * due charges are paid first; amount <= due plans nothing ahead; the Fixed Due Date partial puts interest first;
--  * principal on a non-schedule day books today's charge with accrued interest (D9), on a charge-today day raises it;
--    either way the post-payment outstanding, daily interest, schedule anchor and next generated charge agree;
--  * Split: due, principal, then forward charges priced at the recomputed daily amount;
--  * ticked loans, tie order across loans, the 93-day horizon with its uncovered remainder, the settlement guard, the gates;
--  * the v10 command posts, replays, conflicts when changed, rejects drift/tampering as selection_unavailable with nothing
--    booked, invalid shapes as 22023; v9 and v7 still post; deleting the payment leaves the booked charges unpaid (D4);
--  * access: the plan function is an invoker routine executable by the application role only.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'Disposable loopback database required'; END IF;
END $$;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.pf_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END $$;
CREATE TEMP TABLE pf_day ON COMMIT DROP AS SELECT (transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AS d;
GRANT SELECT ON pf_day TO PUBLIC;
INSERT INTO public."Partners"("Row ID","Partner Role") VALUES('PF-FUND','A');
INSERT INTO public."Partners"("Row ID","Partner Name","Partner Role","Login Email") VALUES('PF-ACT','Synthetic pay forward actor','A','pf-actor@example.invalid');
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 VALUES('PF-CAP','PF-FUND',(SELECT d FROM pf_day)-400,'Contribution',1000000::money);
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES
 ('PF-B1','SYNTHETIC PF DAILY'),('PF-BT','SYNTHETIC PF DAILY TWIN'),('PF-BI','SYNTHETIC PF INSTALLMENT'),('PF-BIT','SYNTHETIC PF INSTALLMENT TWIN'),
 ('PF-BF','SYNTHETIC PF FIXED'),('PF-BFT','SYNTHETIC PF FIXED TWIN'),('PF-BP1','SYNTHETIC PF PRINCIPAL BOOK'),('PF-BP2','SYNTHETIC PF PRINCIPAL RAISE'),
 ('PF-BP3','SYNTHETIC PF SPLIT'),('PF-BH','SYNTHETIC PF HORIZON'),('PF-BS','SYNTHETIC PF SETTLE'),('PF-BG','SYNTHETIC PF GATES'),
 ('PF-BM','SYNTHETIC PF TWO LOANS'),('PF-BD','SYNTHETIC PF DRIFT'),('PF-BY','SYNTHETIC PF YESTERDAY'),('PF-BL','SYNTHETIC PF LEGACY');
-- Loans are inserted with Auto Charge Enabled off (no first-day charge), then switched on, as Test-ProjectedChargePayment.sql does.
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Fixed Interest","Daily Payment Amount","Interest Payment Interval","Due Date","Defaulted")
 SELECT 'CI-LISA',v.id,v.b,(SELECT d FROM pf_day)+v.start,v.pa::money,v.kind,v.status,false,v.cdi::money,v.fixed::money,v.dpa::money,v.n,(SELECT d FROM pf_day)+v.due,false
 FROM (VALUES
  -- daily interest, one charge a day (10 a day on 1000 = 1%)
  ('PF-D1','PF-B1',-3,1000,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10,0,0,1,NULL::integer),
  ('PF-D1T','PF-BT',-3,1000,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10,0,0,1,NULL),
  -- daily installment (as PCP-I)
  ('PF-I1','PF-BI',-2,103,'ผ่อนชำระรายวัน','ยังไม่ปิดยอด',0,0,15,2,7),
  ('PF-I1T','PF-BIT',-2,103,'ผ่อนชำระรายวัน','ยังไม่ปิดยอด',0,0,15,2,7),
  -- Fixed Due Date: principal 100, fixed interest 30, due in ten days
  ('PF-F1','PF-BF',-3,100,'กำหนดวันชำระ','ยังไม่ปิดยอด',0,30,0,1,10),
  ('PF-F1T','PF-BFT',-3,100,'กำหนดวันชำระ','ยังไม่ปิดยอด',0,30,0,1,10),
  -- principal on a non-schedule day: last charge three days ago, next scheduled in four (interval 7)
  ('PF-P1','PF-BP1',-10,1000,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10,0,0,7,NULL),
  -- principal with a charge today (interval 7)
  ('PF-P2','PF-BP2',-3,1000,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10,0,0,7,NULL),
  -- split: charge today, interval 1
  ('PF-P3','PF-BP3',-3,1000,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10,0,0,1,NULL),
  -- horizon: weekly 70
  ('PF-H1','PF-BH',-3,1000,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10,0,0,7,NULL),
  -- settlement: principal 100 at 1 a day
  ('PF-S1','PF-BS',-3,100,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',1,0,0,1,NULL),
  -- gates
  ('PF-G-PRIN','PF-BG',-3,1000,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10,0,0,1,NULL),
  ('PF-G-OFF','PF-BG',-3,1000,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10,0,0,1,NULL),
  ('PF-G-CLOSED','PF-BG',-3,1000,'ดอกเบี้ยรายวัน','ปิดยอดแล้ว',10,0,0,1,NULL),
  ('PF-G-INST','PF-BG',-2,103,'ผ่อนชำระรายวัน','ยังไม่ปิดยอด',0,0,15,2,7),
  -- two open daily loans of one borrower
  ('PF-M1','PF-BM',-3,1000,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10,0,0,1,NULL),
  ('PF-M2','PF-BM',-3,1000,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10,0,0,1,NULL),
  -- drift, legacy versions
  ('PF-X1','PF-BD',-3,1000,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10,0,0,1,NULL),
  ('PF-Y1','PF-BY',-3,1000,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10,0,0,1,NULL),
  ('PF-L1','PF-BL',-3,1000,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10,0,0,7,NULL),
  ('PF-L2','PF-BL',-3,1000,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10,0,0,7,NULL)
 ) v(id,b,start,pa,kind,status,cdi,fixed,dpa,n,due);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 SELECT v.id,v.loan,(SELECT d FROM pf_day)+v.day,v.p::money,v.i::money FROM (VALUES
  ('PF-D1-today','PF-D1',0,0,10),('PF-D1T-today','PF-D1T',0,0,10),
  ('PF-I1-old','PF-I1',-2,11,4),('PF-I1T-old','PF-I1T',-2,11,4),('PF-G-INST-old','PF-G-INST',-2,11,4),
  ('PF-P1-last','PF-P1',-3,0,70),
  ('PF-P2-today','PF-P2',0,0,70),
  ('PF-P3-today','PF-P3',0,0,10),
  ('PF-H1-today','PF-H1',0,0,70),
  ('PF-S1-today','PF-S1',0,0,1),
  ('PF-G-PRIN-today','PF-G-PRIN',0,5,10),('PF-G-OFF-today','PF-G-OFF',0,0,10),('PF-G-CLOSED-today','PF-G-CLOSED',0,0,10),
  ('PF-M1-today','PF-M1',0,0,10),('PF-M2-today','PF-M2',0,0,10),
  ('PF-X1-today','PF-X1',0,0,10),('PF-Y1-today','PF-Y1',0,0,10),
  ('PF-L1-today','PF-L1',0,0,70),('PF-L2-today','PF-L2',0,0,70)
 ) v(id,loan,day,p,i);
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" LIKE 'PF-%' AND "Row ID" NOT IN ('PF-G-OFF','PF-G-CLOSED');
-- Today's installment charge of the two installment loans comes from the scheduled generator (22 principal, 8 interest).
SELECT pg_temp.pf_assert(public.generate_due_charges((SELECT d FROM pf_day),ARRAY['PF-I1','PF-I1T','PF-G-INST'])=3,'today installment generated');
-- PF-P1 paid its last charge, so it has nothing due today and today is not a schedule day.
INSERT INTO public."Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Amount Received","Payment Date","Allocation Method","Status")
 VALUES('CI-DAD','PF-P1-PAY','PF-BP1',70::money,(SELECT d FROM pf_day),'Receive All','Processing');
SELECT pg_temp.pf_assert((SELECT "Status"='Posted' FROM public."Payments" WHERE "Row ID"='PF-P1-PAY'),'non-schedule-day fixture paid');

-- The v10 command is built from the plan itself (allocations, materialize and principal exactly as the server computes them),
-- so the command and the plan cannot drift apart by construction; the drift cases change the database or tamper afterwards.
CREATE FUNCTION pg_temp.pf_purpose(forward boolean,principal jsonb,loans jsonb) RETURNS jsonb LANGUAGE sql AS $f$
 SELECT jsonb_build_object('forward',forward,'principal',coalesce(principal,'[]'::jsonb),'loans',loans) $f$;
CREATE FUNCTION pg_temp.pf_plan(borrower text,amount int,purpose jsonb) RETURNS jsonb LANGUAGE sql AS $f$
 SELECT public.pwa_pay_forward_plan_v1(borrower,amount::numeric,(SELECT d FROM pf_day),purpose) $f$;
CREATE FUNCTION pg_temp.pf_q(v text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$ SELECT to_json(v)::text $f$;
-- The command text must equal the server's canonical JSON byte for byte (key order included), as the v9 helpers of
-- Test-ProjectedChargePayment.sql build it.
CREATE FUNCTION pg_temp.pf_cmd(request text,borrower text,amount int,purpose jsonb) RETURNS text LANGUAGE sql AS $f$
 WITH plan AS (SELECT pg_temp.pf_plan(borrower,amount,purpose) p)
 SELECT '{"contractVersion":1,"command":{"schemaVersion":10,"requestId":'||pg_temp.pf_q(request)||',"borrowerId":'||pg_temp.pf_q(borrower)||',"allocations":['
  ||coalesce((SELECT string_agg('{"chargeId":'||pg_temp.pf_q(l->>'chargeId')||',"principal":'||pg_temp.pf_q(l->>'principal')||',"interest":'||pg_temp.pf_q(l->>'interest')
     ||',"expectedPrincipalRemaining":'||pg_temp.pf_q(l->>'expectedPrincipalRemaining')||',"expectedInterestRemaining":'||pg_temp.pf_q(l->>'expectedInterestRemaining')||',"chargeDate":'||pg_temp.pf_q(l->>'chargeDate')||'}',',' ORDER BY l->>'chargeId' COLLATE "C")
     FROM plan,jsonb_array_elements(plan.p->'allocations') l),'')
  ||'],"cashAccountId":"CI-LISA","paymentDate":"'||to_char((SELECT d FROM pf_day),'YYYY-MM-DD')||'","amountReceived":"'||amount||'","paymentMethod":"Bank Transfer","notes":null,"receiptId":null,"bankReference":null,"transferTime":null,"payerLines":null,"materialize":['
  ||coalesce((SELECT string_agg('{"loanId":'||pg_temp.pf_q(m.e->>'loanId')||',"chargeId":'||pg_temp.pf_q(m.e->>'chargeId')||',"chargeDate":'||pg_temp.pf_q(m.e->>'chargeDate')
     ||',"principalDue":'||pg_temp.pf_q(m.e->>'principalDue')||',"interestDue":'||pg_temp.pf_q(m.e->>'interestDue')||'}',',' ORDER BY m.e->>'chargeId' COLLATE "C")
     FROM plan,jsonb_array_elements(plan.p->'materialize') m(e)),'')
  ||'],"principal":['
  ||coalesce((SELECT string_agg('{"loanId":'||pg_temp.pf_q(x.e->>'loanId')||',"kind":'||pg_temp.pf_q(x.e->>'kind')||',"chargeId":'||pg_temp.pf_q(x.e->>'chargeId')||',"chargeDate":'||pg_temp.pf_q(x.e->>'chargeDate')
     ||',"amount":'||pg_temp.pf_q(req->>'amount')||',"accruedInterest":'||pg_temp.pf_q(x.e->>'accruedInterest')||',"principalDue":'||pg_temp.pf_q(x.e->>'principalDue')||'}',',' ORDER BY x.e->>'loanId' COLLATE "C")
     FROM plan,jsonb_array_elements(plan.p->'principal') x(e),jsonb_array_elements(purpose->'principal') req WHERE req->>'loanId'=x.e->>'loanId'),'')
  ||']},"actor":{"issuer":"https://pf.invalid","subject":"pf-owner","partnerId":"PF-ACT","loginEmail":"pf-actor@example.invalid"},"receipt":null}' $f$;
-- v9 / v7 commands for the legacy borrower (PF-BL): the one-ahead next charge of PF-L1 (interval 7, next in four days) / a due charge.
CREATE FUNCTION pg_temp.pf_legacy(request text,v9 boolean) RETURNS text LANGUAGE sql AS $f$
 WITH d AS (SELECT to_char((SELECT d FROM pf_day),'YYYY-MM-DD') today,to_char((SELECT d FROM pf_day)+4,'YYYY-MM-DD') next)
 SELECT '{"contractVersion":1,"command":{"schemaVersion":'||CASE WHEN v9 THEN '9' ELSE '7' END||',"requestId":"'||request||'","borrowerId":"PF-BL","allocations":[{"chargeId":"'
  ||CASE WHEN v9 THEN 'cg8:5:PF-L1:'||d.next ELSE 'PF-L2-today' END||'","principal":"0","interest":"'||CASE WHEN v9 THEN '40' ELSE '70' END||'","expectedPrincipalRemaining":"0","expectedInterestRemaining":"'||CASE WHEN v9 THEN '40' ELSE '70' END||'","chargeDate":"'||CASE WHEN v9 THEN d.next ELSE d.today END
  ||'"}],"cashAccountId":"CI-LISA","paymentDate":"'||d.today||'","amountReceived":"'||CASE WHEN v9 THEN '40' ELSE '70' END||'","paymentMethod":"Bank Transfer","notes":null,"receiptId":null,"bankReference":null,"transferTime":null'
  ||CASE WHEN v9 THEN ',"payerLines":null,"materialize":[{"loanId":"PF-L1","chargeId":"cg8:5:PF-L1:'||d.next||'","chargeDate":"'||d.next||'","principalDue":"0","interestDue":"40"}]' ELSE '' END
  ||'},"actor":{"issuer":"https://pf.invalid","subject":"pf-owner","partnerId":"PF-ACT","loginEmail":"pf-actor@example.invalid"},"receipt":null}' FROM d $f$;

-- The scheduled generator books one day at a time: replay it day by day for the twins and count what it books.
CREATE FUNCTION pg_temp.pf_gen(loan text,through date) RETURNS integer LANGUAGE plpgsql AS $f$
DECLARE n integer:=0;x date;
BEGIN
 FOR x IN SELECT generate_series((SELECT d FROM pf_day)+1,through,'1 day')::date LOOP n:=n+public.generate_due_charges(x,ARRAY[loan]); END LOOP;
 RETURN n;
END $f$;
-- Commands, all built before any submit so the plans see the untouched fixture.
SELECT set_config('pf.fwd',pg_temp.pf_cmd('c1111111-1111-4111-8111-111111111111','PF-B1',60,pg_temp.pf_purpose(true,NULL,NULL)),true),
 set_config('pf.fwd_other',pg_temp.pf_cmd('c1111111-1111-4111-8111-111111111111','PF-B1',50,pg_temp.pf_purpose(true,NULL,NULL)),true),
 set_config('pf.book',pg_temp.pf_cmd('c2222222-2222-4222-8222-222222222221','PF-BP1',130,pg_temp.pf_purpose(false,'[{"loanId":"PF-P1","amount":"100"}]',NULL)),true),
 set_config('pf.raise',pg_temp.pf_cmd('c2222222-2222-4222-8222-222222222222','PF-BP2',270,pg_temp.pf_purpose(false,'[{"loanId":"PF-P2","amount":"200"}]',NULL)),true),
 set_config('pf.raise_tamper',replace(pg_temp.pf_cmd('c2222222-2222-4222-8222-222222222223','PF-BP2',270,pg_temp.pf_purpose(false,'[{"loanId":"PF-P2","amount":"200"}]',NULL)),'"principalDue":"200"}','"principalDue":"201"}'),true),
 set_config('pf.split',pg_temp.pf_cmd('c3333333-3333-4333-8333-333333333331','PF-BP3',128,pg_temp.pf_purpose(true,'[{"loanId":"PF-P3","amount":"100"}]',NULL)),true),
 set_config('pf.settle',pg_temp.pf_cmd('c4444444-4444-4444-8444-444444444441','PF-BS',101,pg_temp.pf_purpose(false,'[{"loanId":"PF-S1","amount":"100"}]',NULL)),true),
 set_config('pf.drift',pg_temp.pf_cmd('c5555555-5555-4555-8555-555555555551','PF-BD',30,pg_temp.pf_purpose(true,NULL,NULL)),true),
 -- The day rule: a v10 command with entries is dated the business day (a slip date of yesterday is not accepted).
 set_config('pf.yday_fwd',replace(pg_temp.pf_cmd('c8888888-8888-4888-8888-888888888881','PF-BY',30,pg_temp.pf_purpose(true,NULL,NULL)),'"paymentDate":"'||to_char((SELECT d FROM pf_day),'YYYY-MM-DD')||'"','"paymentDate":"'||to_char((SELECT d FROM pf_day)-1,'YYYY-MM-DD')||'"'),true),
 set_config('pf.yday_prin',replace(pg_temp.pf_cmd('c8888888-8888-4888-8888-888888888882','PF-BY',130,pg_temp.pf_purpose(false,'[{"loanId":"PF-Y1","amount":"120"}]',NULL)),'"paymentDate":"'||to_char((SELECT d FROM pf_day),'YYYY-MM-DD')||'"','"paymentDate":"'||to_char((SELECT d FROM pf_day)-1,'YYYY-MM-DD')||'"'),true),
 set_config('pf.v9',pg_temp.pf_legacy('c6666666-6666-4666-8666-666666666661',true),true),
 set_config('pf.v7',pg_temp.pf_legacy('c6666666-6666-4666-8666-666666666662',false),true);
-- Invalid v10 shapes (22023, nothing journalled; the yesterday-dated commands are the day rule), made by editing the canonical text: neither list, an extra key, a number where
-- a string belongs, an unknown kind.
SELECT set_config('pf.bad_empty',regexp_replace(pf.c,'"materialize":\[.*\],"principal":\[.*\]\},"actor"','"materialize":[],"principal":[]},"actor"'),true),
 set_config('pf.bad_extra',replace(pf.c,'"interestDue":"10"}','"interestDue":"10","x":"1"}'),true),
 set_config('pf.bad_number',replace(pf.c,'"interestDue":"10"','"interestDue":10'),true),
 set_config('pf.bad_kind',replace(pm.c,'"kind":"raise"','"kind":"x"'),true),
 set_config('pf.bad_principal_extra',replace(pm.c,'"principalDue":"100"}','"principalDue":"100","x":"1"}'),true),
 set_config('pf.bad_principal_number',replace(pm.c,'"amount":"100"','"amount":100'),true)
FROM (SELECT pg_temp.pf_cmd('c7777777-7777-4777-8777-777777777771','PF-BM',30,pg_temp.pf_purpose(true,NULL,NULL)) c) pf,
     (SELECT pg_temp.pf_cmd('c7777777-7777-4777-8777-777777777772','PF-BP3',128,pg_temp.pf_purpose(true,'[{"loanId":"PF-P3","amount":"100"}]',NULL)) c) pm;
-- The twins (identical charges, no payment) take what the scheduled generator books for the same horizon: filled in section 1.

-- Operator grants, emulated and rolled back (as Test-ProjectedChargePayment.sql).
GRANT USAGE ON SCHEMA public TO mw_app_dev; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mw_app_dev; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO mw_app_dev;
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover,pwa_row_changes FROM mw_app_dev;
REVOKE USAGE,UPDATE ON SEQUENCE pwa_row_changes_seq_seq FROM mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_submit_selected_charges_v1(text) TO mw_app_dev;

-- 0. Access: an invoker, read-only routine executable by the application role only.
DO $$ BEGIN
 PERFORM pg_temp.pf_assert(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.pwa_pay_forward_plan_v1(text,numeric,date,jsonb)'::regprocedure),'plan function is SECURITY INVOKER');
 PERFORM pg_temp.pf_assert((SELECT provolatile='s' FROM pg_proc WHERE oid='public.pwa_pay_forward_plan_v1(text,numeric,date,jsonb)'::regprocedure),'plan function is STABLE');
 PERFORM pg_temp.pf_assert(NOT has_function_privilege('public','public.pwa_pay_forward_plan_v1(text,numeric,date,jsonb)','EXECUTE'),'no PUBLIC execute');
 PERFORM pg_temp.pf_assert(has_function_privilege('mw_app_dev','public.pwa_pay_forward_plan_v1(text,numeric,date,jsonb)','EXECUTE'),'application role executes the plan');
END $$;

-- 1. Plans (read only). Helper views of a plan.
DO $$
DECLARE day date:=(SELECT d FROM pf_day);p jsonb;t record;n int;allocated numeric;
BEGIN
 -- 1a. Daily interest parity: due 10 first, then five forward charges of 10; the twin's generator books the same rows.
 p:=pg_temp.pf_plan('PF-B1',60,pg_temp.pf_purpose(true,NULL,NULL));
 PERFORM pg_temp.pf_assert((p->>'uncovered')::numeric=0 AND jsonb_array_length(p->'materialize')=5,'daily: five forward charges, nothing uncovered');
 PERFORM pg_temp.pf_assert((SELECT sum((l->>'principal')::numeric+(l->>'interest')::numeric)=60 FROM jsonb_array_elements(p->'allocations') l),'daily: allocations use the whole amount');
 PERFORM pg_temp.pf_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(p->'allocations') l WHERE l->>'chargeId'='PF-D1-today' AND (l->>'interest')::numeric=10),'daily: the due charge is paid first and in full');
 PERFORM pg_temp.pf_assert((p->'paidThrough'->>'PF-D1')::date=day+5,'daily: paid through the fifth forward date');
 n:=pg_temp.pf_gen('PF-D1T',day+5);
 PERFORM pg_temp.pf_assert(n=5,'daily twin: the generator books five charges through day+5');
 PERFORM pg_temp.pf_assert((SELECT jsonb_agg(jsonb_build_array((e->>'chargeDate')::date,(e->>'principalDue')::numeric,(e->>'interestDue')::numeric) ORDER BY (e->>'chargeDate')::date) FROM jsonb_array_elements(p->'materialize') e)
  =(SELECT jsonb_agg(jsonb_build_array("Charge Date","Principal Due"::numeric,"Interest Due"::numeric) ORDER BY "Charge Date") FROM public."Charges" WHERE "Ref Loans"='PF-D1T' AND "Charge Date">day),'daily: forward charges equal the generator rows');
 -- 1b. amount <= due: nothing ahead, nothing uncovered.
 p:=pg_temp.pf_plan('PF-B1',5,pg_temp.pf_purpose(true,NULL,NULL));
 PERFORM pg_temp.pf_assert(jsonb_array_length(p->'materialize')=0 AND (p->>'uncovered')::numeric=0 AND (SELECT sum((l->>'interest')::numeric+(l->>'principal')::numeric)=5 FROM jsonb_array_elements(p->'allocations') l),'amount below due: due charge only, no future rows');
 -- 1c. Installment parity, with the last charge partial (amount 45 due + 55).
 p:=pg_temp.pf_plan('PF-BI',100,pg_temp.pf_purpose(true,NULL,NULL));
 PERFORM pg_temp.pf_assert((p->>'uncovered')::numeric=0 AND jsonb_array_length(p->'materialize')>=2,'installment: forward charges planned');
 PERFORM pg_temp.pf_assert((SELECT sum((l->>'principal')::numeric+(l->>'interest')::numeric)=100 FROM jsonb_array_elements(p->'allocations') l),'installment: allocations use the whole amount');
 n:=pg_temp.pf_gen('PF-I1T',(SELECT max((e->>'chargeDate')::date) FROM jsonb_array_elements(p->'materialize') e));
 PERFORM pg_temp.pf_assert(n=jsonb_array_length(p->'materialize'),'installment twin: the generator books as many charges through the last planned date');
 PERFORM pg_temp.pf_assert((SELECT jsonb_agg(jsonb_build_array((e->>'chargeDate')::date,(e->>'principalDue')::numeric,(e->>'interestDue')::numeric) ORDER BY (e->>'chargeDate')::date) FROM jsonb_array_elements(p->'materialize') e)
  =(SELECT jsonb_agg(jsonb_build_array("Charge Date","Principal Due"::numeric,"Interest Due"::numeric) ORDER BY "Charge Date") FROM public."Charges" WHERE "Ref Loans"='PF-I1T' AND "Charge Date">day),'installment: forward charges re-priced exactly as the generator');
 PERFORM pg_temp.pf_assert((SELECT count(*)=1 FROM jsonb_array_elements(p->'materialize') e,jsonb_array_elements(p->'allocations') l WHERE l->>'chargeId'=e->>'chargeId'
   AND (l->>'principal')::numeric+(l->>'interest')::numeric<(e->>'principalDue')::numeric+(e->>'interestDue')::numeric),'installment: exactly one partial last charge');
 -- 1d. Fixed Due Date (D1): the single Due Date charge, whole or partial (interest before principal).
 p:=pg_temp.pf_plan('PF-BF',130,pg_temp.pf_purpose(true,NULL,NULL));
 PERFORM pg_temp.pf_assert(jsonb_array_length(p->'materialize')=1 AND (p->'materialize'->0->>'chargeDate')::date=day+10
  AND (p->'materialize'->0->>'principalDue')::numeric=100 AND (p->'materialize'->0->>'interestDue')::numeric=30 AND (p->'paidThrough'->>'PF-F1')::date=day+10,'fixed due date: one charge on the Due Date, principal 100 interest 30');
 PERFORM pg_temp.pf_gen('PF-F1T',day+10);
 PERFORM pg_temp.pf_assert((SELECT "Principal Due"::numeric=100 AND "Interest Due"::numeric=30 FROM public."Charges" WHERE "Ref Loans"='PF-F1T' AND "Charge Date"=day+10),'fixed due date twin: the generator books the same charge');
 p:=pg_temp.pf_plan('PF-BF',50,pg_temp.pf_purpose(true,NULL,NULL));
 PERFORM pg_temp.pf_assert((SELECT (l->>'interest')::numeric=30 AND (l->>'principal')::numeric=20 FROM jsonb_array_elements(p->'allocations') l),'fixed due date partial: interest 30 first, then 20 of principal');
 p:=pg_temp.pf_plan('PF-BF',20,pg_temp.pf_purpose(true,NULL,NULL));
 PERFORM pg_temp.pf_assert((SELECT (l->>'interest')::numeric=20 AND (l->>'principal')::numeric=0 FROM jsonb_array_elements(p->'allocations') l),'fixed due date: a small remainder pays interest only');
 -- 1e. Principal on a non-schedule day books today's charge (D9): accrued 10 x 3 days + 100.
 p:=pg_temp.pf_plan('PF-BP1',130,pg_temp.pf_purpose(false,'[{"loanId":"PF-P1","amount":"100"}]',NULL));
 PERFORM pg_temp.pf_assert(p->'principal'->0->>'kind'='book' AND (p->'principal'->0->>'accruedInterest')::numeric=30 AND (p->'principal'->0->>'principalDue')::numeric=100,'D9: today charge booked with accrued interest 30 and principal 100');
 PERFORM pg_temp.pf_assert((p->'principal'->0->>'outstandingBefore')::numeric=1000 AND (p->'principal'->0->>'outstandingAfter')::numeric=900 AND (p->'principal'->0->>'dailyAfter')::numeric=9,'D9: outstanding 900, daily interest 9 (round(900 x 1 / 100))');
 PERFORM pg_temp.pf_assert((p->'principal'->0->>'nextChargeDate')::date=day+7 AND (p->'principal'->0->>'nextChargeAmount')::numeric=63,'D9: next charge is today + interval at the new daily amount (9 x 7)');
 PERFORM pg_temp.pf_assert((SELECT sum((l->>'principal')::numeric+(l->>'interest')::numeric)=130 FROM jsonb_array_elements(p->'allocations') l),'D9: the allocations pay the accrued interest and the principal');
 -- 1f. Principal with a charge today raises it: 70 interest + 200 principal; daily 10 -> 8, next 56.
 p:=pg_temp.pf_plan('PF-BP2',270,pg_temp.pf_purpose(false,'[{"loanId":"PF-P2","amount":"200"}]',NULL));
 PERFORM pg_temp.pf_assert(p->'principal'->0->>'kind'='raise' AND p->'principal'->0->>'chargeId'='PF-P2-today' AND (p->'principal'->0->>'principalDue')::numeric=200,'raise: today charge principal due becomes 200');
 PERFORM pg_temp.pf_assert((p->'principal'->0->>'dailyAfter')::numeric=8 AND (p->'principal'->0->>'nextChargeAmount')::numeric=56 AND (p->'principal'->0->>'nextChargeDate')::date=day+7,'raise: daily 8, next charge in seven days for 56');
 PERFORM pg_temp.pf_assert((SELECT (l->>'principal')::numeric=200 AND (l->>'interest')::numeric=70 FROM jsonb_array_elements(p->'allocations') l WHERE l->>'chargeId'='PF-P2-today'),'raise: interest 70 and principal 200 allocated on today charge');
 -- 1g. Split: due 10, principal 100 (daily 10 -> 9), then two forward charges at 9 (not 10).
 p:=pg_temp.pf_plan('PF-BP3',128,pg_temp.pf_purpose(true,'[{"loanId":"PF-P3","amount":"100"}]',NULL));
 PERFORM pg_temp.pf_assert(jsonb_array_length(p->'materialize')=2 AND (SELECT bool_and((e->>'interestDue')::numeric=9 AND (e->>'principalDue')::numeric=0) FROM jsonb_array_elements(p->'materialize') e),'split: forward charges are priced at the recomputed daily amount');
 PERFORM pg_temp.pf_assert((p->'paidThrough'->>'PF-P3')::date=day+2 AND (p->>'uncovered')::numeric=0,'split: paid through day+2');
 PERFORM pg_temp.pf_assert((SELECT (l->>'principal')::numeric=100 AND (l->>'interest')::numeric=10 FROM jsonb_array_elements(p->'allocations') l WHERE l->>'chargeId'='PF-P3-today'),'split: today charge takes interest 10 and principal 100');
 -- 1h. Horizon: 93 days, the rest is uncovered and nothing is carried silently.
 p:=pg_temp.pf_plan('PF-BH',10070,pg_temp.pf_purpose(true,NULL,NULL));
 PERFORM pg_temp.pf_assert((p->>'uncovered')::numeric>0 AND (p->'paidThrough'->>'PF-H1')::date<=day+93 AND (SELECT max((e->>'chargeDate')::date)<=day+93 FROM jsonb_array_elements(p->'materialize') e),'horizon: nothing booked past day+93');
 SELECT sum((l->>'principal')::numeric+(l->>'interest')::numeric) INTO allocated FROM jsonb_array_elements(p->'allocations') l;
 PERFORM pg_temp.pf_assert(allocated+(p->>'uncovered')::numeric=10070,'horizon: allocated plus uncovered equals the amount');
 -- 1i. Settlement guard: the principal part reaches the outstanding principal.
 p:=pg_temp.pf_plan('PF-BS',101,pg_temp.pf_purpose(false,'[{"loanId":"PF-S1","amount":"100"}]',NULL));
 PERFORM pg_temp.pf_assert(p->'settles' ? 'PF-S1','settlement: reported so the form can send the Partner to Loan Close');
 -- 1j. Gates: no forward charge for unpaid principal on a charge, auto-charge off, a closed loan; installment has no principal option.
 p:=pg_temp.pf_plan('PF-BG',500,pg_temp.pf_purpose(true,NULL,NULL));
 PERFORM pg_temp.pf_assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'materialize') e WHERE e->>'loanId' IN ('PF-G-PRIN','PF-G-OFF','PF-G-CLOSED')),'gates: unpaid principal, auto charge off and closed loans offer no future charge');
 p:=pg_temp.pf_plan('PF-BG',1000,pg_temp.pf_purpose(false,'[{"loanId":"PF-G-INST","amount":"100"}]',NULL));
 PERFORM pg_temp.pf_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(p->'blocked') b WHERE b->>'loanId'='PF-G-INST') AND jsonb_array_length(p->'principal')=0,'gates: a daily installment loan has no principal option');
 -- 1k. Two loans: earliest date first, ties to the smaller key; unticking a loan removes its rows.
 p:=pg_temp.pf_plan('PF-BM',60,pg_temp.pf_purpose(true,NULL,NULL));
 PERFORM pg_temp.pf_assert((SELECT array_agg(e->>'loanId' ORDER BY (e->>'chargeDate')::date,e->>'loanId' COLLATE "C") FROM jsonb_array_elements(p->'materialize') e)=ARRAY['PF-M1','PF-M2','PF-M1','PF-M2'],'two loans: dates interleave, ties to the smaller loan key');
 PERFORM pg_temp.pf_assert((SELECT count(*) FROM jsonb_array_elements(p->'materialize') e WHERE (e->>'chargeDate')::date=day+1)=2,'two loans: both loans book day+1 before either books day+2');
 p:=pg_temp.pf_plan('PF-BM',50,pg_temp.pf_purpose(true,NULL,'["PF-M1"]'));
 PERFORM pg_temp.pf_assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'materialize') e WHERE e->>'loanId'='PF-M2') AND jsonb_array_length(p->'materialize')>=2,'ticked loans: only the chosen loan books future charges');
END $$;

-- 2. Commands as the DEV command user.
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb;k text;
BEGIN
 -- Forward: posts, replays, a changed command with the same request id conflicts.
 r:=public.pwa_submit_selected_charges_v1(current_setting('pf.fwd'));
 IF r->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'v10 forward must post: %',r; END IF;
 IF public.pwa_submit_selected_charges_v1(current_setting('pf.fwd'))->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'v10 replay'; END IF;
 IF public.pwa_submit_selected_charges_v1(current_setting('pf.fwd_other'))<>'{"kind":"conflict"}'::jsonb THEN RAISE EXCEPTION 'a changed v10 command must conflict'; END IF;
 -- Principal: book (D9), raise, split.
 FOREACH k IN ARRAY ARRAY['pf.book','pf.raise','pf.split'] LOOP
  r:=public.pwa_submit_selected_charges_v1(current_setting(k));
  IF r->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION '% must post: %',k,r; END IF;
 END LOOP;
 -- Tampered principal due: selection_unavailable (plan_changed in the API), nothing posted.
 r:=public.pwa_submit_selected_charges_v1(current_setting('pf.raise_tamper'));
 IF r->'originalOutcome'->>'status'<>'rejected' OR r->'originalOutcome'->>'code'<>'selection_unavailable' THEN RAISE EXCEPTION 'tampered raise: %',r; END IF;
 -- A plan that settles the loan has no principal entry to send (the plan reports it in settles), so the command is not valid.
 BEGIN
  r:=public.pwa_submit_selected_charges_v1(current_setting('pf.settle'));
  IF r->'originalOutcome'->>'status'<>'rejected' THEN RAISE EXCEPTION 'settling plan: %',r; END IF;
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
 -- Legacy versions still post.
 r:=public.pwa_submit_selected_charges_v1(current_setting('pf.v9'));
 IF r->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'v9 must still post: %',r; END IF;
 r:=public.pwa_submit_selected_charges_v1(current_setting('pf.v7'));
 IF r->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'v7 must still post: %',r; END IF;
END $$;
DO $$
DECLARE k text;
BEGIN
 FOREACH k IN ARRAY ARRAY['pf.yday_fwd','pf.yday_prin','pf.bad_empty','pf.bad_extra','pf.bad_number','pf.bad_kind','pf.bad_principal_extra','pf.bad_principal_number'] LOOP
  BEGIN
   PERFORM public.pwa_submit_selected_charges_v1(current_setting(k));
   RAISE EXCEPTION 'accepted %',k;
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
 END LOOP;
END $$;
RESET SESSION AUTHORIZATION;
-- Forecast moved after the plan: the generator books day+1 meanwhile (as the jobs worker or another payment would).
SELECT pg_temp.pf_assert(public.generate_loan_charge('PF-X1',d+1)='cg8:5:PF-X1:'||to_char(d+1,'YYYY-MM-DD'),'booked meanwhile') FROM pf_day;
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.pwa_submit_selected_charges_v1(current_setting('pf.drift'));
 IF r->'originalOutcome'->>'status'<>'rejected' OR r->'originalOutcome'->>'code'<>'selection_unavailable' THEN RAISE EXCEPTION 'drift: %',r; END IF;
END $$;
RESET SESSION AUTHORIZATION;

-- 3. Results (the deferred charge, loan and payment rollups fire first).
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE day date:=(SELECT d FROM pf_day);f text:='pwa:c1111111-1111-4111-8111-111111111111';
BEGIN
 -- Forward: the due charge and five booked charges are paid; the payment reconciles; the explicit plan holds the real ids.
 PERFORM pg_temp.pf_assert((SELECT "Status"='Posted' AND "Amount Received"::numeric=60 AND "Allocation Method"='Selected Charges' FROM public."Payments" WHERE "Row ID"=f),'forward payment posted');
 PERFORM pg_temp.pf_assert((SELECT count(*)=5 AND bool_and("Amount Remaining"::numeric=0 AND "Interest Due"::numeric=10) FROM public."Charges" WHERE "Ref Loans"='PF-D1' AND "Charge Date">day),'five forward charges booked and paid');
 PERFORM pg_temp.pf_assert((SELECT "Amount Remaining"::numeric=0 FROM public."Charges" WHERE "Row ID"='PF-D1-today'),'the due charge is paid');
 PERFORM pg_temp.pf_assert((SELECT count(*)=6 AND sum("Allocated Amount"::numeric)=60 FROM public."Payment Allocations" WHERE "Ref Payment"=f),'allocations reconcile');
 PERFORM pg_temp.pf_assert((SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric)=60 FROM public."Repayments" WHERE "Ref Payment"=f),'repayments reconcile');
 PERFORM pg_temp.pf_assert((SELECT sum("Amount"::numeric)=60 AND count(*)=1 FROM public."Cash Ledger" WHERE "Ref Payment"=f),'one cash ledger row of the whole amount');
 PERFORM pg_temp.pf_assert((SELECT count(*)=1 FROM public.pwa_payment_commands WHERE payment_id=f AND outcome='posted'),'journal row');
 PERFORM pg_temp.pf_assert((public.pwa_effective_payment_plan_v2(f)#>'{plan,allocations}')=((current_setting('pf.fwd')::jsonb)#>'{command,allocations}'),'v10 keeps the explicit plan provenance');
 PERFORM pg_temp.pf_assert(public.generate_due_charges(day+5,ARRAY['PF-D1'])=0 AND (SELECT count(*)=5 FROM public."Charges" WHERE "Ref Loans"='PF-D1' AND "Charge Date">day),'the schedule books nothing again for the prepaid dates');
 PERFORM pg_temp.pf_assert(public.generate_due_charges(day+6,ARRAY['PF-D1'])=1,'the schedule books the day after the last prepaid date');
 PERFORM pg_temp.pf_assert((SELECT "Interest Due"::numeric=10 FROM public."Charges" WHERE "Ref Loans"='PF-D1' AND "Charge Date"=day+6),'the schedule continues from the last prepaid date');

 -- D9 book: today charge 30 + 100 booked under the pf121 key, one charge today, anchor today, outstanding 900, daily 9.
 PERFORM pg_temp.pf_assert((SELECT count(*)=1 FROM public."Charges" WHERE "Ref Loans"='PF-P1' AND "Charge Date"=day),'D9: exactly one charge today');
 PERFORM pg_temp.pf_assert((SELECT "Row ID" LIKE 'pf121:%' AND "Interest Due"::numeric=30 AND "Principal Due"::numeric=100 AND "Amount Remaining"::numeric=0 FROM public."Charges" WHERE "Ref Loans"='PF-P1' AND "Charge Date"=day),'D9: booked charge carries accrued 30 and principal 100, paid');
 PERFORM pg_temp.pf_assert((SELECT "Interest Schedule Anchor Date"=day AND "Outstanding Principal"::numeric=900 AND "Current Daily Interest"::numeric=9 FROM public."Loans" WHERE "Row ID"='PF-P1'),'D9: anchor today, outstanding 900, daily interest 9');
 PERFORM pg_temp.pf_assert(public.generate_due_charges(day+6,ARRAY['PF-P1'])=0,'D9: nothing is scheduled before today + interval');
 PERFORM pg_temp.pf_assert(public.generate_due_charges(day+7,ARRAY['PF-P1'])=1,'the generator books PF-P1 on day+7');
 PERFORM pg_temp.pf_assert((SELECT "Interest Due"::numeric=63 FROM public."Charges" WHERE "Ref Loans"='PF-P1' AND "Charge Date"=day+7),'D9: the next generated charge is dailyAfter x interval (63)');
 -- Raise.
 PERFORM pg_temp.pf_assert((SELECT "Principal Due"::numeric=200 AND "Interest Due"::numeric=70 AND "Amount Remaining"::numeric=0 FROM public."Charges" WHERE "Row ID"='PF-P2-today'),'raise: today charge carries principal 200 and is paid');
 PERFORM pg_temp.pf_assert((SELECT count(*)=1 FROM public."Charges" WHERE "Ref Loans"='PF-P2' AND "Charge Date"=day),'raise: still one charge today');
 PERFORM pg_temp.pf_assert((SELECT "Interest Schedule Anchor Date"=day AND "Outstanding Principal"::numeric=800 AND "Current Daily Interest"::numeric=8 FROM public."Loans" WHERE "Row ID"='PF-P2'),'raise: anchor today, outstanding 800, daily interest 8');
 PERFORM pg_temp.pf_assert(public.generate_due_charges(day+7,ARRAY['PF-P2'])=1,'the generator books PF-P2 on day+7');
 PERFORM pg_temp.pf_assert((SELECT "Interest Due"::numeric=56 FROM public."Charges" WHERE "Ref Loans"='PF-P2' AND "Charge Date"=day+7),'raise: next generated charge is 8 x 7');
 -- Split: forward charges carry the recomputed daily amount, not the old one.
 PERFORM pg_temp.pf_assert((SELECT count(*)=2 AND bool_and("Interest Due"::numeric=9 AND "Amount Remaining"::numeric=0) FROM public."Charges" WHERE "Ref Loans"='PF-P3' AND "Charge Date">day),'split: two forward charges at 9, paid');
 PERFORM pg_temp.pf_assert((SELECT "Principal Due"::numeric=100 AND "Amount Remaining"::numeric=0 FROM public."Charges" WHERE "Row ID"='PF-P3-today'),'split: today charge raised and paid');
 PERFORM pg_temp.pf_assert((SELECT "Interest Schedule Anchor Date"=day AND "Current Daily Interest"::numeric=9 FROM public."Loans" WHERE "Row ID"='PF-P3'),'split: anchor today and daily interest 9');
 PERFORM pg_temp.pf_assert(public.generate_due_charges(day+3,ARRAY['PF-P3'])=1,'the generator books PF-P3 on day+3');
 PERFORM pg_temp.pf_assert((SELECT "Interest Due"::numeric=9 FROM public."Charges" WHERE "Ref Loans"='PF-P3' AND "Charge Date"=day+3),'split: the schedule continues at 9');
 -- Rejections left nothing behind.
 PERFORM pg_temp.pf_assert(NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Ref Borrower" IN ('PF-BS','PF-BD','PF-BY')),'rejected commands posted nothing');
 PERFORM pg_temp.pf_assert((SELECT "Principal Due"::numeric=0 FROM public."Charges" WHERE "Row ID"='PF-S1-today') AND (SELECT "Outstanding Principal"::numeric=100 FROM public."Loans" WHERE "Row ID"='PF-S1'),'a settling plan changed nothing');
 PERFORM pg_temp.pf_assert((SELECT count(*)=1 FROM public."Charges" WHERE "Ref Loans"='PF-X1' AND "Charge Date">day),'drift: only the charge booked meanwhile exists, unpaid');
 PERFORM pg_temp.pf_assert((SELECT count(*)=2 FROM public.pwa_payment_commands WHERE outcome='rejected' AND rejection_code='selection_unavailable' AND request_id::text LIKE 'c%'),'tampering and drift rejections journalled');
 PERFORM pg_temp.pf_assert(NOT EXISTS(SELECT 1 FROM public.pwa_payment_commands WHERE request_id::text LIKE 'c7777777-%' OR request_id::text LIKE 'c8888888-%'),'invalid commands left no journal row');
 PERFORM pg_temp.pf_assert((SELECT count(*)=2 FROM public."Payments" WHERE "Ref Borrower"='PF-BL' AND "Status"='Posted'),'v9 and v7 posted');
END $$;

-- 4. D4: deleting the payments leaves the booked charges as unpaid obligations; the daily amount recomputes back, the anchor stays.
DELETE FROM public."Payments" WHERE "Row ID" IN ('pwa:c1111111-1111-4111-8111-111111111111','pwa:c2222222-2222-4222-8222-222222222222');
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE day date:=(SELECT d FROM pf_day);
BEGIN
 PERFORM pg_temp.pf_assert((SELECT count(*)=5 AND bool_and("Amount Remaining"::numeric=10) FROM public."Charges" WHERE "Ref Loans"='PF-D1' AND "Charge Date" BETWEEN day+1 AND day+5),'deleted forward payment: the five booked charges reopen unpaid');
 PERFORM pg_temp.pf_assert((SELECT "Principal Due"::numeric=200 AND "Amount Remaining"::numeric=270 FROM public."Charges" WHERE "Row ID"='PF-P2-today'),'deleted principal payment: today charge keeps its raised principal, unpaid');
 PERFORM pg_temp.pf_assert((SELECT "Outstanding Principal"::numeric=1000 AND "Current Daily Interest"::numeric=10 AND "Interest Schedule Anchor Date"=day FROM public."Loans" WHERE "Row ID"='PF-P2'),'deleted principal payment: outstanding and daily interest recompute back, the anchor stays at today');
 PERFORM pg_temp.pf_assert(NOT EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Payment" IN ('pwa:c1111111-1111-4111-8111-111111111111','pwa:c2222222-2222-4222-8222-222222222222')),'delete removes the payment effects');
END $$;
SELECT 'Pay forward regressions passed' AS result;
ROLLBACK;
