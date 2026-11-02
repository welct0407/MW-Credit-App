-- R113 V126: settle and close from Receive payment (disposable cluster only; synthetic rows; everything rolls back).
-- Proves (real SQL: pwa_pay_forward_plan_v1, pwa_submit_selected_charges_v1 schemaVersion 10 as the DEV command IAM user):
--  * Ying: two daily-interest loans (1000 at 20 a day, 2000 at 200 a day, today's charges 20 + 200), a 3220 slip with Repay principal
--    1000 + 2000 closes both loans in ONE payment; every amount equals loan_close_calculation_v83;
--  * the gap interest on a non-schedule day (D9 arithmetic) is part of the payoff and equals the calculation;
--  * a booked future charge is lowered by the apply (trail note) and the loan still closes (no unpaid charge, principal <= paid);
--  * the V124 default offset fires for a referred loan closed this way;
--  * a changed loan after the plan (planHash drift) and a tampered settle entry are selection_unavailable with nothing booked;
--  * principal equal to outstanding while gap interest is pending is blocked (never a zero-outstanding open loan);
--  * a settle command dated yesterday is refused; the Net-off method posts one cash ledger row of the whole amount; nothing changes when
--    nothing settles (the agent v9 refusal is in Test-AgentReceiptPayForward.sql);
--  * deleting the payment reopens the loans (the lowered future charge keeps its trail).
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'Disposable loopback database required'; END IF;
END $$;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.ps_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END $$;
CREATE TEMP TABLE ps_day ON COMMIT DROP AS SELECT (transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AS d;
GRANT SELECT ON ps_day TO PUBLIC;
INSERT INTO public."Partners"("Row ID","Partner Role") VALUES('PS-FUND','A');
INSERT INTO public."Partners"("Row ID","Partner Name","Partner Role","Login Email") VALUES('PS-ACT','Synthetic settle actor','A','ps-actor@example.invalid');
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('PS-CAP','PS-FUND',(SELECT d FROM ps_day)-400,'Contribution',1000000::money);
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Ref Referrer") VALUES
 ('PS-REF','SYNTHETIC PS REFERRER',NULL),('PS-BY','SYNTHETIC PS YING',NULL),('PS-B1','SYNTHETIC PS ONE LOAN',NULL),('PS-BG','SYNTHETIC PS GAP',NULL),
 ('PS-BF','SYNTHETIC PS FUTURE',NULL),('PS-BR','SYNTHETIC PS REFERRED','PS-REF'),('PS-BD','SYNTHETIC PS DRIFT',NULL),('PS-BA','SYNTHETIC PS GAP BLOCK',NULL),
 ('PS-BT','SYNTHETIC PS YESTERDAY',NULL),('PS-BN','SYNTHETIC PS NOTHING',NULL),('PS-BV','SYNTHETIC PS AGENT',NULL),('PS-BW','SYNTHETIC PS YESTERDAY CMD',NULL),('PS-BO','SYNTHETIC PS NET-OFF',NULL);
-- Loans inserted with Auto Charge Enabled off, then switched on (as Test-PayForward.sql). Daily interest, one charge a day unless noted.
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Defaulted")
 SELECT 'CI-LISA',v.id,v.b,(SELECT d FROM ps_day)+v.start,v.pa::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,v.cdi::money,v.n,false FROM (VALUES
  ('PS-YA','PS-BY',-5,1000,20,1),('PS-YB','PS-BY',-2,2000,200,1),              -- Ying: charges today 20 + 200
  ('PS-S1','PS-B1',-3,500,5,1),                                                  -- one loan, charge today 5
  ('PS-G1','PS-BG',-10,1000,10,7),                                               -- non-schedule day: last charge 3 days ago, paid; gap interest 3 x 10 = 30
  ('PS-F1','PS-BF',-10,1000,10,7),                                               -- a booked future charge (day+3, 70) that the close lowers
  ('PS-RL','PS-REF',-3,1000,10,1),('PS-RF','PS-BR',-3,1000,300,1),              -- referrer's open loan (due 10) and the referred loan (interest 300 today, rebate 30)
  ('PS-D1','PS-BD',-3,1000,10,1),('PS-A1','PS-BA',-10,1000,10,7),('PS-T1','PS-BT',-3,1000,10,1),('PS-N1','PS-BN',-3,1000,10,1),('PS-V1','PS-BV',-3,1000,10,1),('PS-W1','PS-BW',-3,1000,10,1),('PS-O1','PS-BO',-3,1000,10,1)
 ) v(id,b,start,pa,cdi,n);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 SELECT v.id,v.loan,(SELECT d FROM ps_day)+v.day,0::money,v.i::money FROM (VALUES
  ('PS-YA-today','PS-YA',0,20),('PS-YB-today','PS-YB',0,200),('PS-S1-today','PS-S1',0,5),
  ('PS-G1-last','PS-G1',-3,70),('PS-F1-last','PS-F1',-3,70),('PS-F1-next','PS-F1',3,70),('PS-A1-last','PS-A1',-3,70),
  ('PS-RL-today','PS-RL',0,10),('PS-RF-today','PS-RF',0,300),('PS-D1-today','PS-D1',0,10),('PS-T1-today','PS-T1',0,10),('PS-N1-today','PS-N1',0,10),('PS-V1-today','PS-V1',0,10),('PS-W1-today','PS-W1',0,10),('PS-O1-today','PS-O1',0,10)
 ) v(id,loan,day,i);
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" LIKE 'PS-%';
-- The non-schedule-day loans paid their last charge, so nothing is due today.
INSERT INTO public."Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Amount Received","Payment Date","Allocation Method","Status")
 SELECT 'CI-DAD',v.pid,v.b,70::money,(SELECT d FROM ps_day),'Receive All','Processing' FROM (VALUES ('PS-G1-PAY','PS-BG'),('PS-F1-PAY','PS-BF'),('PS-A1-PAY','PS-BA')) v(pid,b);

SET CONSTRAINTS ALL IMMEDIATE;   -- the deferred rollups settle the fixture payments before any quote is read
CREATE FUNCTION pg_temp.ps_purpose(principal jsonb,forward boolean DEFAULT false) RETURNS jsonb LANGUAGE sql AS $f$
 SELECT jsonb_build_object('forward',forward,'principal',coalesce(principal,'[]'::jsonb),'loans',NULL::jsonb) $f$;
CREATE FUNCTION pg_temp.ps_plan(borrower text,amount int,purpose jsonb,pday date DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $f$
 SELECT public.pwa_pay_forward_plan_v1(borrower,amount::numeric,coalesce(pday,(SELECT d FROM ps_day)),purpose) $f$;
CREATE FUNCTION pg_temp.ps_q(v text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$ SELECT to_json(v)::text $f$;
-- The principal entry's canonical text: the 7 keys of every kind (a settle entry carries the payoff remainder as its amount; the server
-- recomputes the quote and its planHash, so the command holds no hash).
CREATE FUNCTION pg_temp.ps_entry(e jsonb,req jsonb) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"loanId":'||pg_temp.ps_q(e->>'loanId')||',"kind":'||pg_temp.ps_q(e->>'kind')||',"chargeId":'||pg_temp.ps_q(e->>'chargeId')||',"chargeDate":'||pg_temp.ps_q(e->>'chargeDate')
  ||',"amount":'||pg_temp.ps_q(req->>'amount')||',"accruedInterest":'||pg_temp.ps_q(e->>'accruedInterest')||',"principalDue":'||pg_temp.ps_q(e->>'principalDue')||'}' $f$;
CREATE FUNCTION pg_temp.ps_cmd(request text,borrower text,amount int,purpose jsonb,pday date DEFAULT NULL,schema int DEFAULT 10) RETURNS text LANGUAGE sql AS $f$
 WITH plan AS (SELECT pg_temp.ps_plan(borrower,amount,purpose,pday) p)
 SELECT '{"contractVersion":1,"command":{"schemaVersion":'||schema||',"requestId":'||pg_temp.ps_q(request)||',"borrowerId":'||pg_temp.ps_q(borrower)||',"allocations":['
  ||coalesce((SELECT string_agg('{"chargeId":'||pg_temp.ps_q(l->>'chargeId')||',"principal":'||pg_temp.ps_q(l->>'principal')||',"interest":'||pg_temp.ps_q(l->>'interest')
     ||',"expectedPrincipalRemaining":'||pg_temp.ps_q(l->>'expectedPrincipalRemaining')||',"expectedInterestRemaining":'||pg_temp.ps_q(l->>'expectedInterestRemaining')||',"chargeDate":'||pg_temp.ps_q(l->>'chargeDate')||'}',',' ORDER BY l->>'chargeId' COLLATE "C")
     FROM plan,jsonb_array_elements(plan.p->'allocations') l),'')
  ||'],"cashAccountId":"CI-LISA","paymentDate":"'||to_char(coalesce(pday,(SELECT d FROM ps_day)),'YYYY-MM-DD')||'","amountReceived":"'||amount||'","paymentMethod":"Bank Transfer","notes":null,"receiptId":null,"bankReference":null,"transferTime":null,"payerLines":null,"materialize":['
  ||coalesce((SELECT string_agg('{"loanId":'||pg_temp.ps_q(m.e->>'loanId')||',"chargeId":'||pg_temp.ps_q(m.e->>'chargeId')||',"chargeDate":'||pg_temp.ps_q(m.e->>'chargeDate')
     ||',"principalDue":'||pg_temp.ps_q(m.e->>'principalDue')||',"interestDue":'||pg_temp.ps_q(m.e->>'interestDue')||'}',',' ORDER BY m.e->>'chargeId' COLLATE "C")
     FROM plan,jsonb_array_elements(plan.p->'materialize') m(e)),'')
  ||'],"principal":['
  ||coalesce((SELECT string_agg(pg_temp.ps_entry(x.e,req),',' ORDER BY x.e->>'loanId' COLLATE "C")
     FROM plan,jsonb_array_elements(plan.p->'principal') x(e),jsonb_array_elements(purpose->'principal') req WHERE req->>'loanId'=x.e->>'loanId'),'')
  ||']},"actor":{"issuer":"https://ps.invalid","subject":"ps-owner","partnerId":"PS-ACT","loginEmail":"ps-actor@example.invalid"},"receipt":null}' $f$;

-- The amounts the Loan Close quote gives, captured before anything is posted.
CREATE TEMP TABLE ps_calc ON COMMIT DROP AS SELECT l AS loan,public.loan_close_calculation_v83(l,(SELECT d FROM ps_day)) AS calc FROM unnest(ARRAY['PS-YA','PS-YB','PS-S1','PS-G1','PS-F1','PS-RF','PS-D1','PS-A1','PS-T1','PS-N1','PS-V1','PS-W1','PS-O1']) l;
GRANT SELECT ON ps_calc TO PUBLIC;
CREATE FUNCTION pg_temp.ps_amount(loan text) RETURNS int LANGUAGE sql AS $f$ SELECT (calc->>'amount')::numeric::int FROM ps_calc WHERE ps_calc.loan=$1 $f$;
-- The plan's remainder for a loan: the quote's amount less that loan's due charges (they are paid with the settle lines).
CREATE FUNCTION pg_temp.ps_payoff(loan text) RETURNS int LANGUAGE sql AS $f$
 SELECT pg_temp.ps_amount($1)-coalesce((SELECT sum("Amount Remaining"::numeric)::int FROM public."Charges" WHERE "Ref Loans"=$1 AND "Charge Date"<=(SELECT d FROM ps_day) AND "Amount Remaining"::numeric>0),0) $f$;

DO $$ BEGIN
 -- Fixture self-check: the owner's numbers.
 PERFORM pg_temp.ps_assert(pg_temp.ps_amount('PS-YA')=1020 AND pg_temp.ps_amount('PS-YB')=2200,'Ying: quotes 1020 and 2200 (principal + today charge)');
 PERFORM pg_temp.ps_assert(pg_temp.ps_payoff('PS-YA')=1000 AND pg_temp.ps_payoff('PS-YB')=2000,'Ying: remainders 1000 and 2000');
 PERFORM pg_temp.ps_assert(pg_temp.ps_amount('PS-G1')=1030,'gap loan: payoff 1000 + 30 gap interest');
END $$;

-- Commands, all built before any submit so the plans see the untouched fixture.
SELECT set_config('ps.ying',pg_temp.ps_cmd('d1111111-1111-4111-8111-111111111111','PS-BY',3220,pg_temp.ps_purpose('[{"loanId":"PS-YA","amount":"1000"},{"loanId":"PS-YB","amount":"2000"}]')),true),
 set_config('ps.one',pg_temp.ps_cmd('d2222222-2222-4222-8222-222222222221','PS-B1',pg_temp.ps_amount('PS-S1'),pg_temp.ps_purpose(format('[{"loanId":"PS-S1","amount":"%s"}]',pg_temp.ps_payoff('PS-S1'))::jsonb)),true),
 set_config('ps.gap',pg_temp.ps_cmd('d3333333-3333-4333-8333-333333333331','PS-BG',pg_temp.ps_amount('PS-G1'),pg_temp.ps_purpose(format('[{"loanId":"PS-G1","amount":"%s"}]',pg_temp.ps_payoff('PS-G1'))::jsonb)),true),
 set_config('ps.future',pg_temp.ps_cmd('d4444444-4444-4444-8444-444444444441','PS-BF',pg_temp.ps_amount('PS-F1'),pg_temp.ps_purpose(format('[{"loanId":"PS-F1","amount":"%s"}]',pg_temp.ps_payoff('PS-F1'))::jsonb)),true),
 set_config('ps.referred',pg_temp.ps_cmd('d5555555-5555-4555-8555-555555555551','PS-BR',pg_temp.ps_amount('PS-RF'),pg_temp.ps_purpose(format('[{"loanId":"PS-RF","amount":"%s"}]',pg_temp.ps_payoff('PS-RF'))::jsonb)),true),
 set_config('ps.drift',pg_temp.ps_cmd('d6666666-6666-4666-8666-666666666661','PS-BD',pg_temp.ps_amount('PS-D1'),pg_temp.ps_purpose(format('[{"loanId":"PS-D1","amount":"%s"}]',pg_temp.ps_payoff('PS-D1'))::jsonb)),true),
 set_config('ps.hash',replace(pg_temp.ps_cmd('d6666666-6666-4666-8666-666666666662','PS-BT',pg_temp.ps_amount('PS-T1'),pg_temp.ps_purpose(format('[{"loanId":"PS-T1","amount":"%s"}]',pg_temp.ps_payoff('PS-T1'))::jsonb)),'"kind":"settle","chargeId":"PS-T1-today","chargeDate":"'||to_char((SELECT d FROM ps_day),'YYYY-MM-DD')||'","amount":"1000","accruedInterest":"0"','"kind":"settle","chargeId":"PS-T1-today","chargeDate":"'||to_char((SELECT d FROM ps_day),'YYYY-MM-DD')||'","amount":"1000","accruedInterest":"5"'),true),
 -- A settle command dated yesterday is refused (a settle is today's quote; the day rule of every v10 command with entries).
 set_config('ps.yday',replace(pg_temp.ps_cmd('d8888888-8888-4888-8888-888888888881','PS-BW',pg_temp.ps_amount('PS-W1'),pg_temp.ps_purpose(format('[{"loanId":"PS-W1","amount":"%s"}]',pg_temp.ps_payoff('PS-W1'))::jsonb)),'"paymentDate":"'||to_char((SELECT d FROM ps_day),'YYYY-MM-DD')||'"','"paymentDate":"'||to_char((SELECT d FROM ps_day)-1,'YYYY-MM-DD')||'"'),true),
 -- The Net-off method posts like any payment: the cash ledger carries the whole amount once and the loan closes.
 set_config('ps.netoff',replace(pg_temp.ps_cmd('d8888888-8888-4888-8888-888888888882','PS-BO',pg_temp.ps_amount('PS-O1'),pg_temp.ps_purpose(format('[{"loanId":"PS-O1","amount":"%s"}]',pg_temp.ps_payoff('PS-O1'))::jsonb)),'"paymentMethod":"Bank Transfer"','"paymentMethod":"Net-off at Disbursement"'),true),
 set_config('ps.agent',pg_temp.ps_cmd('d7777777-7777-4777-8777-777777777771','PS-BV',pg_temp.ps_amount('PS-V1'),pg_temp.ps_purpose(format('[{"loanId":"PS-V1","amount":"%s"}]',pg_temp.ps_payoff('PS-V1'))::jsonb)),true);

GRANT USAGE ON SCHEMA public TO mw_app_dev; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mw_app_dev; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO mw_app_dev;
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover,pwa_row_changes FROM mw_app_dev;
REVOKE USAGE,UPDATE ON SEQUENCE pwa_row_changes_seq_seq FROM mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_submit_selected_charges_v1(text) TO mw_app_dev;

-- 1. Plans (read only).
DO $$
DECLARE day date:=(SELECT d FROM ps_day);p jsonb;
BEGIN
 -- 1a. Ying: both loans settle; each settle entry carries the quote's amount and planHash.
 p:=pg_temp.ps_plan('PS-BY',3220,pg_temp.ps_purpose('[{"loanId":"PS-YA","amount":"1000"},{"loanId":"PS-YB","amount":"2000"}]'));
 PERFORM pg_temp.ps_assert((SELECT count(*)=2 AND bool_and(x->>'kind'='settle') FROM jsonb_array_elements(p->'principal') x),'Ying: two settle entries');
 PERFORM pg_temp.ps_assert((SELECT bool_and((x->>'payoff')::numeric=pg_temp.ps_amount(x->>'loanId') AND (x->>'amount')::numeric=pg_temp.ps_payoff(x->>'loanId') AND x->>'planHash'=(SELECT calc->>'planHash' FROM ps_calc WHERE loan=x->>'loanId')) FROM jsonb_array_elements(p->'principal') x),'Ying: entry payoff, amount (payoff remainder) and planHash equal loan_close_calculation_v83');
 PERFORM pg_temp.ps_assert((p->>'uncovered')::numeric=0 AND jsonb_array_length(p->'materialize')=0,'Ying: nothing uncovered, nothing booked ahead');
 -- 1b. Gap interest on a non-schedule day: part of the payoff, equal to the calculation (D9 arithmetic: 3 days x 10).
 p:=pg_temp.ps_plan('PS-BG',1030,pg_temp.ps_purpose('[{"loanId":"PS-G1","amount":"1030"}]'));
 PERFORM pg_temp.ps_assert((p#>>'{principal,0,kind}')='settle' AND (p#>>'{principal,0,amount}')::numeric=1030 AND (p#>>'{principal,0,accruedInterest}')::numeric=30,'gap day: settle 1030 with gap interest 30');
 -- 1c. Principal equal to outstanding while gap interest is pending: blocked, never a zero-outstanding open loan.
 p:=pg_temp.ps_plan('PS-BA',1000,pg_temp.ps_purpose('[{"loanId":"PS-A1","amount":"1000"}]'));
 PERFORM pg_temp.ps_assert(jsonb_array_length(p->'principal')=0 OR (p#>>'{principal,0,kind}')<>'raise','gap pending: no plain principal raise to zero outstanding');
 PERFORM pg_temp.ps_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(p->'blocked') b WHERE b->>'loanId'='PS-A1' AND b->>'reason'='needs_gap_interest'),'gap pending: blocked with needs_gap_interest');
 -- 1d. A yesterday-dated plan never settles.
 p:=pg_temp.ps_plan('PS-BT',pg_temp.ps_amount('PS-T1'),pg_temp.ps_purpose(format('[{"loanId":"PS-T1","amount":"%s"}]',pg_temp.ps_payoff('PS-T1'))::jsonb),day-1);
 PERFORM pg_temp.ps_assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p->'principal','[]')) x WHERE x->>'kind'='settle'),'yesterday: no settle entry');
 -- 1e. A booked future charge is lowered in the plan (futureLowered) and the quote.
 p:=pg_temp.ps_plan('PS-BF',pg_temp.ps_amount('PS-F1'),pg_temp.ps_purpose(format('[{"loanId":"PS-F1","amount":"%s"}]',pg_temp.ps_payoff('PS-F1'))::jsonb));
 PERFORM pg_temp.ps_assert((p#>>'{principal,0,kind}')='settle' AND (p#>>'{principal,0,payoff}')::numeric=pg_temp.ps_amount('PS-F1') AND EXISTS(SELECT 1 FROM jsonb_array_elements(p->'allocations') l WHERE l->>'chargeId'='PS-F1-next' AND (l->>'interest')::numeric<70),'future charge: the settle plan pays the booked future charge at its lowered interest');
 -- 1f. Nothing settles: a partial principal stays a raise or book, as R110 (no settle entry).
 p:=pg_temp.ps_plan('PS-BN',110,pg_temp.ps_purpose('[{"loanId":"PS-N1","amount":"100"}]'));
 PERFORM pg_temp.ps_assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'principal') x WHERE x->>'kind'='settle'),'partial principal: no settle entry');
END $$;

-- 2. Commands as the DEV command user.
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb;k text;
BEGIN
 -- Ying: one payment, both loans; replay is the recorded outcome; a changed command conflicts.
 r:=public.pwa_submit_selected_charges_v1(current_setting('ps.ying'));
 IF r->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'Ying must post: %',r; END IF;
 IF public.pwa_submit_selected_charges_v1(current_setting('ps.ying'))->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'Ying replay'; END IF;
 -- One loan, gap day, future charge, referred loan.
 FOREACH k IN ARRAY ARRAY['ps.one','ps.gap','ps.future','ps.referred'] LOOP
  BEGIN r:=public.pwa_submit_selected_charges_v1(current_setting(k)); EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION '% failed: % (%)',k,SQLERRM,left(current_setting(k),1500); END;
  IF r->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION '% must post: %',k,r; END IF;
 END LOOP;
 -- Drift: the loan changes after the plan was made (a payment of its due charge by another path) -> selection_unavailable, nothing booked.
 RESET SESSION AUTHORIZATION;
 UPDATE public."Charges" SET "Interest Due"="Interest Due"+1::money WHERE "Row ID"='PS-D1-today';
 SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
 r:=public.pwa_submit_selected_charges_v1(current_setting('ps.drift'));
 IF r->'originalOutcome'->>'status'<>'rejected' OR r->'originalOutcome'->>'code'<>'selection_unavailable' THEN RAISE EXCEPTION 'drift: %',r; END IF;
 -- A tampered settle entry (a gap interest the quote does not have): selection_unavailable too (plan_changed in the API).
 r:=public.pwa_submit_selected_charges_v1(current_setting('ps.hash'));
 IF r->'originalOutcome'->>'status'<>'rejected' OR r->'originalOutcome'->>'code'<>'selection_unavailable' THEN RAISE EXCEPTION 'tampered settle entry: %',r; END IF;
 BEGIN
  r:=public.pwa_submit_selected_charges_v1(current_setting('ps.yday'));
  IF r->'originalOutcome'->>'status' IS DISTINCT FROM 'rejected' THEN RAISE EXCEPTION 'a settle dated yesterday must be refused: %',r; END IF;
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
 r:=public.pwa_submit_selected_charges_v1(current_setting('ps.netoff'));
 IF r->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'Net-off settle must post: %',r; END IF;
 -- The agent v9 command (the receipt command) refuses a settle entry: the agent keeps the guard in R113 (test body adapts to Byte's refusal shape).
 -- (Run against pwa_submit_agent_receipt_v1 in Test-AgentReceiptPayForward.sql's pattern: a v9 receipt whose plan settles must be rejected.)
END $$;
RESET SESSION AUTHORIZATION;

-- 3. Results (the deferred charge, loan and payment rollups fire first).
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE day date:=(SELECT d FROM ps_day);y text:='pwa:d1111111-1111-4111-8111-111111111111';
BEGIN
 PERFORM pg_temp.ps_assert((SELECT "Status"='Posted' AND "Amount Received"::numeric=3220 AND "Allocation Method"='Selected Charges' FROM public."Payments" WHERE "Row ID"=y),'Ying: one payment of 3220 posted');
 PERFORM pg_temp.ps_assert((SELECT count(*)=1 FROM public."Payments" WHERE "Ref Borrower"='PS-BY'),'Ying: exactly one payment');
 PERFORM pg_temp.ps_assert((SELECT count(*)=2 AND bool_and("Loan Status"='ปิดยอดแล้ว' AND "Close Date"=day AND "Outstanding Principal"::numeric=0) FROM public."Loans" WHERE "Row ID" IN ('PS-YA','PS-YB')),'Ying: both loans closed today with nothing outstanding');
 PERFORM pg_temp.ps_assert((SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric)=3220 FROM public."Repayments" WHERE "Ref Payment"=y),'Ying: repayments reconcile to 3220');
 PERFORM pg_temp.ps_assert((SELECT sum("Interest Paid"::numeric)=220 AND sum("Principal Paid"::numeric)=3000 FROM public."Repayments" WHERE "Ref Payment"=y),'Ying: 220 interest and 3000 principal');
 PERFORM pg_temp.ps_assert((SELECT count(*)=1 AND sum("Amount"::numeric)=3220 FROM public."Cash Ledger" WHERE "Ref Payment"=y),'Ying: one cash ledger row of the whole slip');
 PERFORM pg_temp.ps_assert((SELECT bool_and("Amount Remaining"::numeric=0) FROM public."Charges" WHERE "Ref Loans" IN ('PS-YA','PS-YB')),'Ying: no unpaid charge on either loan');
 PERFORM pg_temp.ps_assert((SELECT count(*)=1 FROM public.pwa_payment_commands WHERE payment_id=y AND outcome='posted'),'Ying: one journal row');
 -- The amounts equal the quote for every settled loan (principal + interest repaid = calculation amount).
 PERFORM pg_temp.ps_assert((SELECT bool_and(paid=pg_temp.ps_amount(loan)) FROM (SELECT l AS loan,(SELECT sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric)::int FROM public."Repayments" r JOIN public."Charges" c ON c."Row ID"=r."Ref Charges" WHERE c."Ref Loans"=l AND r."Ref Payment" LIKE 'pwa:d%') AS paid FROM unnest(ARRAY['PS-S1','PS-G1','PS-F1','PS-RF']) l) q),'settled loans paid exactly the Loan Close quote');
 -- One loan and the gap day.
 PERFORM pg_temp.ps_assert((SELECT bool_and("Loan Status"='ปิดยอดแล้ว' AND "Close Date"=day AND "Outstanding Principal"::numeric=0) FROM public."Loans" WHERE "Row ID" IN ('PS-S1','PS-G1','PS-F1','PS-RF')),'each settled loan closed today');
 PERFORM pg_temp.ps_assert((SELECT "Interest Due"::numeric=30 AND "Amount Remaining"::numeric=0 FROM public."Charges" WHERE "Ref Loans"='PS-G1' AND "Charge Date"=day AND "Row ID" LIKE 'lc7:%'),'gap day: today charge lc7: carries the 30 gap interest, paid');
 -- Booked future charge lowered, with the trail, and the loan still closes (principal <= paid, no unpaid charge).
 PERFORM pg_temp.ps_assert((SELECT "Interest Due"::numeric<70 AND "Amount Remaining"::numeric=0 AND "Notes" ~ ('Interest Due lowered from 70 by Loan Close '||day::text) FROM public."Charges" WHERE "Row ID"='PS-F1-next'),'future charge lowered with the trail note and paid');
 PERFORM pg_temp.ps_assert((SELECT NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"='PS-F1' AND "Amount Remaining"::numeric>0)),'future charge: no unpaid charge remains');
 -- V124: the referred loan closed here offsets its rebate (30) onto the referrer's loan.
 PERFORM pg_temp.ps_assert((SELECT count(*)=1 FROM public."Payments" WHERE "Ref Borrower"='PS-REF' AND "Payment Method"='Referral Rebate Offset' AND "Row ID" LIKE 'ro122:%'),'V124: one ro122 offset payment to the referrer');
 PERFORM pg_temp.ps_assert((SELECT "Amount"::numeric=30 AND "Ref Offset Payment" LIKE 'ro122:%' FROM public."Business Expenses" WHERE "Row ID"='rr1:PS-RF'),'V124: the rebate expense is 30 and links the offset payment');
 -- Rejections and untouched loans.
 PERFORM pg_temp.ps_assert(NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID" LIKE 'pwa:%' AND "Ref Borrower" IN ('PS-BD','PS-BT','PS-BV','PS-BN','PS-BA')),'rejected, blocked and unsettled paths posted nothing');
 PERFORM pg_temp.ps_assert((SELECT bool_and("Loan Status"='ยังไม่ปิดยอด' AND "Outstanding Principal"::numeric=1000) FROM public."Loans" WHERE "Row ID" IN ('PS-D1','PS-T1','PS-V1','PS-A1')),'those loans are still open and unchanged');
 PERFORM pg_temp.ps_assert((SELECT count(*)=2 FROM public.pwa_payment_commands WHERE outcome='rejected' AND rejection_code='selection_unavailable' AND request_id::text LIKE 'd6666666-%'),'drift and tampered settle entry journalled as selection_unavailable');
 PERFORM pg_temp.ps_assert(NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"='PS-N1' AND "Row ID" LIKE 'lc7:%'),'nothing settles: no close charge written');
 PERFORM pg_temp.ps_assert(NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID" LIKE 'pwa:%' AND "Ref Borrower"='PS-BW') AND (SELECT "Loan Status"='ยังไม่ปิดยอด' FROM public."Loans" WHERE "Row ID"='PS-W1'),'a settle dated yesterday posted nothing and left the loan open');
 PERFORM pg_temp.ps_assert((SELECT p."Payment Method"='Net-off at Disbursement' AND p."Status"='Posted' AND p."Amount Received"::numeric=pg_temp.ps_amount('PS-O1') AND (SELECT sum("Amount"::numeric)=p."Amount Received"::numeric AND count(*)=1 FROM public."Cash Ledger" WHERE "Ref Payment"=p."Row ID") FROM public."Payments" p WHERE p."Row ID"='pwa:d8888888-8888-4888-8888-888888888882'),'Net-off settle: one cash ledger row of the whole amount');
 PERFORM pg_temp.ps_assert((SELECT "Loan Status"='ปิดยอดแล้ว' AND "Outstanding Principal"::numeric=0 FROM public."Loans" WHERE "Row ID"='PS-O1'),'Net-off settle closes the loan');
END $$;

-- 4. Deleting the payment reopens the loans (as Loan Close): status open, outstanding back, the lowered future charge keeps its trail.
DELETE FROM public."Payments" WHERE "Row ID"='pwa:d1111111-1111-4111-8111-111111111111';
DELETE FROM public."Payments" WHERE "Row ID"='pwa:d4444444-4444-4444-8444-444444444441';
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
BEGIN
 PERFORM pg_temp.ps_assert((SELECT count(*)=2 AND bool_and("Loan Status"='ยังไม่ปิดยอด' AND "Close Date" IS NULL AND "Outstanding Principal"::numeric=(CASE "Row ID" WHEN 'PS-YA' THEN 1000 ELSE 2000 END)) FROM public."Loans" WHERE "Row ID" IN ('PS-YA','PS-YB')),'delete: Ying loans reopen with their principal');
 PERFORM pg_temp.ps_assert((SELECT "Loan Status"='ยังไม่ปิดยอด' AND "Close Date" IS NULL FROM public."Loans" WHERE "Row ID"='PS-F1'),'delete: the future-charge loan reopens');
 PERFORM pg_temp.ps_assert((SELECT "Notes" ~ 'Interest Due lowered from 70 by Loan Close' FROM public."Charges" WHERE "Row ID"='PS-F1-next'),'delete: the lowering trail stays');
END $$;
SELECT 'Settle from Receive payment checks passed' AS result;
ROLLBACK;
