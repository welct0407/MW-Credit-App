-- R101 V112 pay the next charge early (disposable cluster only; synthetic rows; everything rolls back).
-- pwa_next_projected_charge_v1 and pwa_submit_selected_charges_v1 schemaVersion 9 run as the DEV command IAM user
-- (SET SESSION AUTHORIZATION, as the submit checks session_user); the checks run as postgres.
-- Proves: the offer equals what the generator books (daily interest and installment); no offer for a fixed due-date,
-- manual, closed (a defaulted loan is closed and may not stay auto-enabled) or not-yet-started loan, a loan with a recorded future charge, a daily loan with unpaid
-- principal (D1) or a missing today charge (D2), an installment without its first charge; one v9 command pays a due charge
-- and two loans' next charges with reconciled Allocations, Repayments and Cash Ledger and the explicit plan; the schedule
-- generates nothing again for a booked date and continues from it; a replay is idempotent and a changed command conflicts;
-- drift, a charge booked meanwhile, a charge date not after today and an unoffered loan are selection_unavailable with no
-- charge left; invalid materialize shapes are invalid commands; a multi-byte loan id posts; a booked final installment
-- closes the loan; v7 still posts; deleting the payment leaves the booked charge unpaid.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'Disposable loopback database required'; END IF;
END $$;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.pcp_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END $$;
CREATE TEMP TABLE pcp_day ON COMMIT DROP AS SELECT (transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AS d;
GRANT SELECT ON pcp_day TO PUBLIC;
INSERT INTO public."Partners"("Row ID","Partner Role") VALUES('PCP-FUND','A');
INSERT INTO public."Partners"("Row ID","Partner Name","Partner Role","Login Email") VALUES('PCP-ACT','Synthetic projected actor','A','pcp-actor@example.invalid');
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 VALUES('PCP-CAP','PCP-FUND',(SELECT d FROM pcp_day)-400,'Contribution',1000000::money);
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES
 ('PCP-B','SYNTHETIC PROJECTED MAIN'),('PCP-B2','SYNTHETIC PROJECTED DRIFT'),('PCP-B3','SYNTHETIC PROJECTED EXCLUDED'),
 ('PCP-B4','SYNTHETIC PROJECTED THAI'),('PCP-B5','SYNTHETIC PROJECTED FINAL');
-- Loans are inserted with Auto Charge Enabled off (no first-day charge), then switched on, as Test-ChargeGeneration.sql does.
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Fixed Interest","Daily Payment Amount","Interest Payment Interval","Due Date","Defaulted")
 SELECT 'CI-LISA',v.id,v.b,(SELECT d FROM pcp_day)+v.start,v.pa::money,v.kind,v.status,false,v.cdi::money,v.fixed::money,v.dpa::money,v.n,(SELECT d FROM pcp_day)+v.due,false
 FROM (VALUES
  ('PCP-D','PCP-B',-3,1000,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10,0,0,7,NULL::integer,false),
  ('PCP-I','PCP-B',-2,103,'ผ่อนชำระรายวัน','ยังไม่ปิดยอด',0,0,15,2,7,false),
  ('PCP-X','PCP-B2',-3,1000,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10,0,0,7,NULL,false),
  ('PCP-E-FIX','PCP-B3',-3,1000,'กำหนดวันชำระ','ยังไม่ปิดยอด',0,30,0,1,5,false),
  ('PCP-E-OFF','PCP-B3',-3,1000,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10,0,0,7,NULL,false),
  ('PCP-E-CLOSED','PCP-B3',-3,1000,'ดอกเบี้ยรายวัน','ปิดยอดแล้ว',10,0,0,7,NULL,false),
  ('PCP-E-FUT','PCP-B3',-3,1000,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10,0,0,7,NULL,false),
  ('PCP-E-PRIN','PCP-B3',-7,1000,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10,0,0,7,NULL,false),
  ('PCP-E-MISS','PCP-B3',-7,1000,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10,0,0,7,NULL,false),
  ('PCP-E-INST0','PCP-B3',-3,103,'ผ่อนชำระรายวัน','ยังไม่ปิดยอด',0,0,15,2,7,false),
  ('PCP-E-LATER','PCP-B3',1,1000,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10,0,0,7,NULL,false),
  ('PCP-ไทย','PCP-B4',-3,1000,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10,0,0,7,NULL,false),
  ('PCP-F','PCP-B5',-4,100,'ผ่อนชำระรายวัน','ยังไม่ปิดยอด',0,0,20,1,1,false)
 ) v(id,b,start,pa,kind,status,cdi,fixed,dpa,n,due,def);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 SELECT v.id,v.loan,(SELECT d FROM pcp_day)+v.day,v.p::money,v.i::money FROM (VALUES
  ('PCP-I-old','PCP-I',-2,11,4),
  ('PCP-E-FUT-next','PCP-E-FUT',4,0,70),
  ('PCP-E-PRIN-today','PCP-E-PRIN',0,10,70),
  ('PCP-F-first','PCP-F',-4,68,0),
  ('PCP-F-today','PCP-F',0,16,4)
 ) v(id,loan,day,p,i);
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" LIKE 'PCP-%' AND "Row ID"<>'PCP-E-OFF';
-- Today's installment charge of PCP-I comes from the scheduled generator (22 principal, 8 interest).
SELECT pg_temp.pcp_assert(public.generate_due_charges((SELECT d FROM pcp_day),ARRAY['PCP-I'])=1,'today installment generated');
-- PCP-F has paid everything recorded so far (68 + 16 principal); only its final installment remains.
INSERT INTO public."Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Amount Received","Payment Date","Allocation Method","Status")
 VALUES('CI-DAD','PCP-F-P0','PCP-B5',88::money,(SELECT d FROM pcp_day),'Receive All','Processing');
SELECT pg_temp.pcp_assert((SELECT "Status"='Posted' FROM public."Payments" WHERE "Row ID"='PCP-F-P0'),'final-installment fixture paid');

-- Canonical manual receiving command (services/contracts/payment-command.mjs), Bank Transfer, no receipt or slip fields.
CREATE FUNCTION pg_temp.pcp_line(charge text,principal int,interest int,ep int,ei int,day date) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"chargeId":'||to_json(charge)::text||',"principal":"'||principal||'","interest":"'||interest||'","expectedPrincipalRemaining":"'||ep
  ||'","expectedInterestRemaining":"'||ei||'","chargeDate":"'||to_char(day,'YYYY-MM-DD')||'"}' $f$;
CREATE FUNCTION pg_temp.pcp_entry(loan text,day date,pd int,id int) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"loanId":'||to_json(loan)::text||',"chargeId":'||to_json('cg8:'||length(loan)||':'||loan||':'||to_char(day,'YYYY-MM-DD'))::text
  ||',"chargeDate":"'||to_char(day,'YYYY-MM-DD')||'","principalDue":"'||pd||'","interestDue":"'||id||'"}' $f$;
CREATE FUNCTION pg_temp.pcp_cg8(loan text,day date) RETURNS text LANGUAGE sql AS $f$ SELECT 'cg8:'||length(loan)||':'||loan||':'||to_char(day,'YYYY-MM-DD') $f$;
-- materialize NULL builds a v7 command; otherwise v9 with the given raw materialize text.
CREATE FUNCTION pg_temp.pcp_cmd(request text,borrower text,lines text[],amount int,materialize text) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"contractVersion":1,"command":{"schemaVersion":'||CASE WHEN materialize IS NULL THEN '7' ELSE '9' END||',"requestId":'||to_json(request)::text
  ||',"borrowerId":'||to_json(borrower)::text||',"allocations":['||array_to_string(lines,',')||'],"cashAccountId":"CI-LISA","paymentDate":"'
  ||to_char((SELECT d FROM pcp_day),'YYYY-MM-DD')||'","amountReceived":"'||amount||'","paymentMethod":"Bank Transfer","notes":null,"receiptId":null,"bankReference":null,"transferTime":null'
  ||CASE WHEN materialize IS NULL THEN '' ELSE ',"payerLines":null,"materialize":'||materialize END
  ||'},"actor":{"issuer":"https://pcp.invalid","subject":"pcp-owner","partnerId":"PCP-ACT","loginEmail":"pcp-actor@example.invalid"},"receipt":null}' $f$;

SELECT set_config('pcp.m1',pg_temp.pcp_cmd('b1111111-1111-4111-8111-111111111111','PCP-B',ARRAY[
   pg_temp.pcp_line(pg_temp.pcp_cg8('PCP-D',d+4),0,70,0,70,d+4),
   pg_temp.pcp_line(pg_temp.pcp_cg8('PCP-I',d),22,8,22,8,d),
   pg_temp.pcp_line(pg_temp.pcp_cg8('PCP-I',d+2),20,10,20,10,d+2)],130,
   '['||pg_temp.pcp_entry('PCP-D',d+4,0,70)||','||pg_temp.pcp_entry('PCP-I',d+2,20,10)||']'),true),
 set_config('pcp.m1_other',pg_temp.pcp_cmd('b1111111-1111-4111-8111-111111111111','PCP-B',ARRAY[
   pg_temp.pcp_line(pg_temp.pcp_cg8('PCP-D',d+4),0,70,0,70,d+4)],70,'['||pg_temp.pcp_entry('PCP-D',d+4,0,70)||']'),true),
 set_config('pcp.v7',pg_temp.pcp_cmd('b1111111-1111-4111-8111-111111111112','PCP-B',ARRAY[pg_temp.pcp_line('PCP-I-old',11,4,11,4,d-2)],15,NULL),true),
 set_config('pcp.drift',pg_temp.pcp_cmd('b2222222-2222-4222-8222-222222222221','PCP-B2',ARRAY[
   pg_temp.pcp_line(pg_temp.pcp_cg8('PCP-X',d+4),0,60,0,60,d+4)],60,'['||pg_temp.pcp_entry('PCP-X',d+4,0,60)||']'),true),
 set_config('pcp.booked',pg_temp.pcp_cmd('b2222222-2222-4222-8222-222222222222','PCP-B2',ARRAY[
   pg_temp.pcp_line(pg_temp.pcp_cg8('PCP-X',d+4),0,70,0,70,d+4)],70,'['||pg_temp.pcp_entry('PCP-X',d+4,0,70)||']'),true),
 set_config('pcp.not_after',pg_temp.pcp_cmd('b2222222-2222-4222-8222-222222222223','PCP-B2',ARRAY[
   pg_temp.pcp_line(pg_temp.pcp_cg8('PCP-X',d),0,30,0,30,d)],30,'['||pg_temp.pcp_entry('PCP-X',d,0,30)||']'),true),
 set_config('pcp.inst0',pg_temp.pcp_cmd('b3333333-3333-4333-8333-333333333331','PCP-B3',ARRAY[
   pg_temp.pcp_line(pg_temp.pcp_cg8('PCP-E-INST0',d+1),20,10,20,10,d+1)],30,'['||pg_temp.pcp_entry('PCP-E-INST0',d+1,20,10)||']'),true),
 set_config('pcp.thai',pg_temp.pcp_cmd('b4444444-4444-4444-8444-444444444441','PCP-B4',ARRAY[
   pg_temp.pcp_line(pg_temp.pcp_cg8('PCP-ไทย',d+4),0,70,0,70,d+4)],70,'['||pg_temp.pcp_entry('PCP-ไทย',d+4,0,70)||']'),true),
 set_config('pcp.final',pg_temp.pcp_cmd('b5555555-5555-4555-8555-555555555551','PCP-B5',ARRAY[
   pg_temp.pcp_line(pg_temp.pcp_cg8('PCP-F',d+1),16,4,16,4,d+1)],20,'['||pg_temp.pcp_entry('PCP-F',d+1,16,4)||']'),true),
 -- Invalid shapes (22023, nothing journalled).
 set_config('pcp.bad_empty',pg_temp.pcp_cmd('b6666666-6666-4666-8666-666666666661','PCP-B4',ARRAY[
   pg_temp.pcp_line(pg_temp.pcp_cg8('PCP-ไทย',d+4),0,70,0,70,d+4)],70,'[]'),true),
 set_config('pcp.bad_key',pg_temp.pcp_cmd('b6666666-6666-4666-8666-666666666662','PCP-B4',ARRAY[
   pg_temp.pcp_line('cg8:19:PCP-ไทย:'||to_char(d+4,'YYYY-MM-DD'),0,70,0,70,d+4)],70,
   replace(pg_temp.pcp_entry('PCP-ไทย',d+4,0,70),'cg8:7:','cg8:19:')),true),
 set_config('pcp.bad_line',pg_temp.pcp_cmd('b6666666-6666-4666-8666-666666666663','PCP-B4',ARRAY[
   pg_temp.pcp_line(pg_temp.pcp_cg8('PCP-ไทย',d+4),0,69,0,69,d+4)],69,'['||pg_temp.pcp_entry('PCP-ไทย',d+4,0,70)||']'),true),
 set_config('pcp.bad_loan',pg_temp.pcp_cmd('b6666666-6666-4666-8666-666666666664','PCP-B4',ARRAY[
   pg_temp.pcp_line(pg_temp.pcp_cg8('PCP-ไทย',d+4),0,70,0,70,d+4),pg_temp.pcp_line(pg_temp.pcp_cg8('PCP-ไทย',d+11),0,70,0,70,d+11)],140,
   '['||pg_temp.pcp_entry('PCP-ไทย',d+4,0,70)||','||pg_temp.pcp_entry('PCP-ไทย',d+11,0,70)||']'),true),
 set_config('pcp.bad_order',pg_temp.pcp_cmd('b6666666-6666-4666-8666-666666666665','PCP-B',ARRAY[
   pg_temp.pcp_line(pg_temp.pcp_cg8('PCP-D',d+4),0,70,0,70,d+4),pg_temp.pcp_line(pg_temp.pcp_cg8('PCP-I',d+2),20,10,20,10,d+2)],100,
   '['||pg_temp.pcp_entry('PCP-I',d+2,20,10)||','||pg_temp.pcp_entry('PCP-D',d+4,0,70)||']'),true),
 set_config('pcp.bad_extra',pg_temp.pcp_cmd('b6666666-6666-4666-8666-666666666666','PCP-B4',ARRAY[
   pg_temp.pcp_line(pg_temp.pcp_cg8('PCP-ไทย',d+4),0,70,0,70,d+4)],70,'['||replace(pg_temp.pcp_entry('PCP-ไทย',d+4,0,70),'}',',"x":"1"}')||']'),true),
 set_config('pcp.bad_number',pg_temp.pcp_cmd('b6666666-6666-4666-8666-666666666667','PCP-B4',ARRAY[
   pg_temp.pcp_line(pg_temp.pcp_cg8('PCP-ไทย',d+4),0,70,0,70,d+4)],70,'['||replace(pg_temp.pcp_entry('PCP-ไทย',d+4,0,70),'"interestDue":"70"','"interestDue":70')||']'),true),
 set_config('pcp.bad_object',pg_temp.pcp_cmd('b6666666-6666-4666-8666-666666666668','PCP-B4',ARRAY[
   pg_temp.pcp_line(pg_temp.pcp_cg8('PCP-ไทย',d+4),0,70,0,70,d+4)],70,pg_temp.pcp_entry('PCP-ไทย',d+4,0,70)),true),
 set_config('pcp.bad_v8',replace(pg_temp.pcp_cmd('b6666666-6666-4666-8666-666666666669','PCP-B4',ARRAY[
   pg_temp.pcp_line(pg_temp.pcp_cg8('PCP-ไทย',d+4),0,70,0,70,d+4)],70,'['||pg_temp.pcp_entry('PCP-ไทย',d+4,0,70)||']'),'"schemaVersion":9','"schemaVersion":8'),true)
FROM pcp_day \gset pcp_unused_

-- Operator grants, emulated and rolled back: the DEV capability policy (app-role-policy.mjs grants mw_app_dev the tables
-- and its routines) and the submit EXECUTE; forecast_schedule_v1 EXECUTE comes from V112 itself.
GRANT USAGE ON SCHEMA public TO mw_app_dev; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mw_app_dev; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO mw_app_dev;
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover,pwa_row_changes FROM mw_app_dev;
REVOKE USAGE,UPDATE ON SEQUENCE pwa_row_changes_seq_seq FROM mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_submit_selected_charges_v1(text) TO mw_app_dev;

-- V112 access: the read function is an invoker routine executable by mw_app_dev only.
DO $$ BEGIN
 PERFORM pg_temp.pcp_assert(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.pwa_next_projected_charge_v1(text,date)'::regprocedure),'read function is SECURITY INVOKER');
 PERFORM pg_temp.pcp_assert(NOT has_function_privilege('public','public.pwa_next_projected_charge_v1(text,date)','EXECUTE'),'no PUBLIC execute');
 PERFORM pg_temp.pcp_assert(has_function_privilege('mw_app_dev','public.pwa_next_projected_charge_v1(text,date)','EXECUTE'),'application role executes');
 PERFORM pg_temp.pcp_assert(has_function_privilege('mw_app_dev','public.forecast_schedule_v1(jsonb,jsonb,date,date)','EXECUTE'),'application role executes the forecast');
END $$;

SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
-- 1. Offers: parity of amounts with the generator's arithmetic for both loan types, and the excluded states.
DO $$
DECLARE day date:=(SELECT d FROM pcp_day);offers jsonb;
BEGIN
 SELECT jsonb_agg(jsonb_build_array(loan_id,charge_id,charge_date,principal_due,interest_due) ORDER BY loan_id) INTO offers FROM public.pwa_next_projected_charge_v1('PCP-B',day);
 IF offers IS DISTINCT FROM jsonb_build_array(jsonb_build_array('PCP-D',pg_temp.pcp_cg8('PCP-D',day+4),day+4,0,70),jsonb_build_array('PCP-I',pg_temp.pcp_cg8('PCP-I',day+2),day+2,20,10)) THEN
  RAISE EXCEPTION 'main borrower offers: %',offers; END IF;
 IF EXISTS(SELECT 1 FROM public.pwa_next_projected_charge_v1('PCP-B3',day)) THEN
  RAISE EXCEPTION 'an excluded loan was offered: %',(SELECT jsonb_agg(loan_id) FROM public.pwa_next_projected_charge_v1('PCP-B3',day)); END IF;
 IF (SELECT charge_id FROM public.pwa_next_projected_charge_v1('PCP-B4',day))<>'cg8:7:PCP-ไทย:'||to_char(day+4,'YYYY-MM-DD') THEN RAISE EXCEPTION 'multi-byte loan key counts characters'; END IF;
 IF (SELECT jsonb_build_array(principal_due,interest_due) FROM public.pwa_next_projected_charge_v1('PCP-B5',day))<>'[16,4]'::jsonb THEN RAISE EXCEPTION 'final installment offer'; END IF;
END $$;

-- 2. One v9 command: one due charge and two loans' next charges.
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.pwa_submit_selected_charges_v1(current_setting('pcp.m1'));
 IF r->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'v9 must post: %',r; END IF;
 IF public.pwa_submit_selected_charges_v1(current_setting('pcp.m1'))->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'v9 replay'; END IF;
 IF public.pwa_submit_selected_charges_v1(current_setting('pcp.m1_other'))<>'{"kind":"conflict"}'::jsonb THEN RAISE EXCEPTION 'a changed v9 command must conflict'; END IF;
 -- One charge ahead: both loans now have a recorded future charge.
 IF EXISTS(SELECT 1 FROM public.pwa_next_projected_charge_v1('PCP-B',(SELECT d FROM pcp_day))) THEN RAISE EXCEPTION 'a booked loan must not offer a second charge'; END IF;
 IF public.pwa_submit_selected_charges_v1(current_setting('pcp.v7'))->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'v7 must still post'; END IF;
 -- Drift (another amount), a charge booked meanwhile, a date not after today and an unoffered loan: selection_unavailable.
 r:=public.pwa_submit_selected_charges_v1(current_setting('pcp.drift'));
 IF r->'originalOutcome'->>'status'<>'rejected' OR r->'originalOutcome'->>'code'<>'selection_unavailable' THEN RAISE EXCEPTION 'drift: %',r; END IF;
 r:=public.pwa_submit_selected_charges_v1(current_setting('pcp.not_after'));
 IF r->'originalOutcome'->>'status'<>'rejected' OR r->'originalOutcome'->>'code'<>'selection_unavailable' THEN RAISE EXCEPTION 'charge date not after today: %',r; END IF;
 r:=public.pwa_submit_selected_charges_v1(current_setting('pcp.inst0'));
 IF r->'originalOutcome'->>'status'<>'rejected' OR r->'originalOutcome'->>'code'<>'selection_unavailable' THEN RAISE EXCEPTION 'installment without first charge: %',r; END IF;
 r:=public.pwa_submit_selected_charges_v1(current_setting('pcp.thai'));
 IF r->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'multi-byte loan id: %',r; END IF;
 r:=public.pwa_submit_selected_charges_v1(current_setting('pcp.final'));
 IF r->'originalOutcome'->>'status'<>'posted' THEN RAISE EXCEPTION 'final installment: %',r; END IF;
END $$;
DO $$
DECLARE k text;
BEGIN
 FOREACH k IN ARRAY ARRAY['pcp.bad_empty','pcp.bad_key','pcp.bad_line','pcp.bad_loan','pcp.bad_order','pcp.bad_extra','pcp.bad_number','pcp.bad_object','pcp.bad_v8'] LOOP
  BEGIN
   PERFORM public.pwa_submit_selected_charges_v1(current_setting(k));
   RAISE EXCEPTION 'accepted %',k;
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
 END LOOP;
END $$;
RESET SESSION AUTHORIZATION;
-- A charge booked meanwhile (here by the generator, as the jobs worker or another payment would) is no longer projected.
SELECT pg_temp.pcp_assert(public.generate_loan_charge('PCP-X',d+4)=pg_temp.pcp_cg8('PCP-X',d+4),'booked meanwhile') FROM pcp_day;
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.pwa_submit_selected_charges_v1(current_setting('pcp.booked'));
 IF r->'originalOutcome'->>'status'<>'rejected' OR r->'originalOutcome'->>'code'<>'selection_unavailable' THEN RAISE EXCEPTION 'booked meanwhile: %',r; END IF;
END $$;
RESET SESSION AUTHORIZATION;

-- 3. Results (the deferred charge, loan and payment rollups fire first).
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE day date:=(SELECT d FROM pcp_day);m1 text:='pwa:b1111111-1111-4111-8111-111111111111';
BEGIN
 -- Booked charges equal the offers and are paid; the explicit plan holds the real ids.
 PERFORM pg_temp.pcp_assert((SELECT "Principal Due"::numeric=0 AND "Interest Due"::numeric=70 AND "Amount Remaining"::numeric=0 FROM public."Charges" WHERE "Row ID"=pg_temp.pcp_cg8('PCP-D',day+4) AND "Charge Date"=day+4),'daily next charge booked and paid');
 PERFORM pg_temp.pcp_assert((SELECT "Principal Due"::numeric=20 AND "Interest Due"::numeric=10 AND "Amount Remaining"::numeric=0 FROM public."Charges" WHERE "Row ID"=pg_temp.pcp_cg8('PCP-I',day+2) AND "Charge Date"=day+2),'installment next charge booked and paid');
 PERFORM pg_temp.pcp_assert((SELECT "Status"='Posted' AND "Amount Received"::numeric=130 AND "Allocation Method"='Selected Charges' FROM public."Payments" WHERE "Row ID"=m1),'v9 payment posted');
 PERFORM pg_temp.pcp_assert((SELECT count(*)=3 AND sum("Allocated Amount"::numeric)=130 FROM public."Payment Allocations" WHERE "Ref Payment"=m1),'allocations reconcile');
 PERFORM pg_temp.pcp_assert((SELECT count(*)=3 AND sum("Principal Paid"::numeric+"Interest Paid"::numeric)=130 FROM public."Repayments" WHERE "Ref Payment"=m1),'repayments reconcile');
 PERFORM pg_temp.pcp_assert((SELECT sum("Amount"::numeric)=130 FROM public."Cash Ledger" WHERE "Ref Payment"=m1),'cash ledger reconciles');
 PERFORM pg_temp.pcp_assert((SELECT count(*)=1 FROM public.pwa_payment_commands WHERE payment_id=m1 AND outcome='posted'),'journal row');
 PERFORM pg_temp.pcp_assert((public.pwa_effective_payment_plan_v2(m1)#>'{plan,allocations}')=((current_setting('pcp.m1')::jsonb)#>'{command,allocations}'),'v9 keeps the explicit plan provenance');
 -- The schedule generates nothing again for the booked dates and continues from the booked row.
 PERFORM pg_temp.pcp_assert(public.generate_due_charges(day+4,ARRAY['PCP-D'])=0 AND public.generate_due_charges(day+2,ARRAY['PCP-I'])=0,'no duplicate on the booked dates');
 PERFORM pg_temp.pcp_assert((SELECT count(*)=1 FROM public."Charges" WHERE "Ref Loans"='PCP-D' AND "Charge Date"=day+4),'one booked daily row');
 PERFORM pg_temp.pcp_assert(public.generate_due_charges(day+11,ARRAY['PCP-D'])=1,'following date generated');
 PERFORM pg_temp.pcp_assert((SELECT "Interest Due"::numeric=70 FROM public."Charges" WHERE "Ref Loans"='PCP-D' AND "Charge Date"=day+11),'following charge counts from the booked date');
 -- Rejections left no booked charge and no payment.
 PERFORM pg_temp.pcp_assert(NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"='PCP-X' AND "Charge Date"<>day+4) AND NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"='PCP-E-INST0'),'rejected commands booked nothing');
 PERFORM pg_temp.pcp_assert((SELECT "Amount Remaining"::numeric=70 FROM public."Charges" WHERE "Row ID"=pg_temp.pcp_cg8('PCP-X',day+4)),'the charge booked meanwhile is unpaid');
 PERFORM pg_temp.pcp_assert(NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Ref Borrower" IN ('PCP-B2','PCP-B3')),'rejected commands posted nothing');
 PERFORM pg_temp.pcp_assert((SELECT count(*)=3 FROM public.pwa_payment_commands WHERE outcome='rejected' AND request_id::text LIKE 'b2222222-%' AND rejection_code='selection_unavailable'),'drift rejections journalled');
 PERFORM pg_temp.pcp_assert(NOT EXISTS(SELECT 1 FROM public.pwa_payment_commands WHERE request_id::text LIKE 'b6666666-%'),'invalid commands left no journal row');
 -- Multi-byte loan id and the final installment.
 PERFORM pg_temp.pcp_assert((SELECT "Amount Remaining"::numeric=0 FROM public."Charges" WHERE "Row ID"='cg8:7:PCP-ไทย:'||to_char(day+4,'YYYY-MM-DD')),'multi-byte loan charge paid');
 PERFORM pg_temp.pcp_assert((SELECT "Loan Status"='ปิดยอดแล้ว' FROM public."Loans" WHERE "Row ID"='PCP-F'),'a paid booked final installment closes the loan');
END $$;

-- 4. Deleting the payment keeps the booked charge as an unpaid scheduled obligation.
DELETE FROM public."Payments" WHERE "Row ID"='pwa:b4444444-4444-4444-8444-444444444441';
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE day date:=(SELECT d FROM pcp_day);
BEGIN
 PERFORM pg_temp.pcp_assert((SELECT "Amount Remaining"::numeric=70 AND "Interest Due"::numeric=70 FROM public."Charges" WHERE "Row ID"='cg8:7:PCP-ไทย:'||to_char(day+4,'YYYY-MM-DD')),'deleted payment leaves the booked charge unpaid');
 PERFORM pg_temp.pcp_assert(NOT EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Payment"='pwa:b4444444-4444-4444-8444-444444444441'),'delete removes the payment effects');
 PERFORM pg_temp.pcp_assert(NOT EXISTS(SELECT 1 FROM public.pwa_next_projected_charge_v1('PCP-B4',day)),'the unpaid booked charge still keeps one charge ahead');
END $$;
SELECT 'Projected charge payment regressions passed' AS result;
ROLLBACK;
