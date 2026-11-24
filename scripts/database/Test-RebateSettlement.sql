-- R129 V137 referral rebate settlement (disposable cluster only; synthetic rows; everything rolls back).
-- Commands run as the DEV command IAM user through pwa_submit_operation_v2 (the journal checks session_user); setup and
-- checks run as postgres. The design's test plan, cases 1 to 13 (case 14, concurrency, is
-- tests/integration/rebate-settlement-independent.test.mjs), and the owner-authorized legacy conversion (D1):
--  1. a close with no referrer loan books a REFERRAL_REBATE_V3 expense, no cash row, pending 300, owed 300, the Partner split;
--  2. a close whose referrer loan takes 200 of 300: offset 200, expense cash row 200 (Lisa nets zero), pending 100, owed 400;
--  3. one settlement of both: amount 400, both linked, one 'Rebate Settlement' cash row out of the chosen Lisa account;
--  4. replay and conflict; 5. refusals; 6. delete with version (stale refused); 7. closing-payment delete of a paid rebate is
--  refused, allowed after the settlement goes; 8. a pending rebate goes with its closing payment; 9. immutability; 10. the
--  ledger guard and the system-row CHECK; 11. a historical close and self-referral; 12. push content v5 (v4 unchanged);
--  13. access (with Test-AccessMatrix.sql); conversion of legacy V2 rows (no offset, offset remainder) and its refusals.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'Disposable loopback database required'; END IF;
END $$;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.rs_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END $$;
CREATE TEMP TABLE rs_day ON COMMIT DROP AS SELECT (transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AS d;
GRANT SELECT ON rs_day TO PUBLIC;
-- Lisa's default account (the payer columns of every rebate) and a second Lisa account the settlement pays from.
UPDATE public."Cash Accounts" SET "Default Account"=true WHERE "Row ID"='CI-LISA' AND NOT EXISTS(SELECT 1 FROM public."Cash Accounts" WHERE "Ref Cash Holder"='ch:lisa' AND "Default Account" AND "Row ID"<>'CI-LISA');
INSERT INTO public."Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES('RS-LISA-SCB','ch:lisa','Synthetic Lisa SCB','SCB');
INSERT INTO public."Partners"("Row ID","Partner Role") VALUES('RS-FUND','A');
INSERT INTO public."Partners"("Row ID","Partner Name","Partner Role","Login Email","Language Preference") VALUES('RS-ACT','Synthetic settlement actor','A','rs-actor@example.invalid','English');
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('RS-CAP','RS-FUND',(SELECT d FROM rs_day)-400,'Contribution',1000000::money);
-- R: the referrer (default terms 10% and 1,000); A, B, C referred by R; X another referrer (BX referred by X); D and E are
-- referred by R only after their loans closed (legacy rows below); F is unrelated.
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Description") VALUES('RS-R','SYNTHETIC SETTLEMENT REFERRER','Mai'),('RS-X','SYNTHETIC OTHER REFERRER',NULL),
 ('RS-D','SYNTHETIC LEGACY PAID',NULL),('RS-E','SYNTHETIC LEGACY OFFSET',NULL);
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Ref Referrer") VALUES('RS-A','SYNTHETIC REFERRED A','RS-R'),('RS-B','SYNTHETIC REFERRED B','RS-R'),
 ('RS-C','SYNTHETIC REFERRED HISTORIC','RS-R'),('RS-BX','SYNTHETIC REFERRED BY X','RS-X');
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Defaulted")
 SELECT 'CI-LISA',v.id,v.b,(SELECT d FROM rs_day)-3,v.p::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,100::money,1,false
 FROM (VALUES ('RS-LA','RS-A',1000),('RS-LB','RS-B',1000),('RS-LC','RS-C',1000),('RS-LX','RS-BX',1000),('RS-LD','RS-D',100),('RS-LE','RS-E',100)) v(id,b,p);
-- Interest 3,000 on A, B, C and X (rebate 300 each); D and E close for 200 (100 principal, 100 interest); C is paid yesterday.
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 SELECT v.id,v.loan,(SELECT d FROM rs_day)+v.day,v.p::money,v.i::money FROM (VALUES
  ('RS-LA-today','RS-LA',0,0,3000),('RS-LB-today','RS-LB',0,0,3000),('RS-LX-today','RS-LX',0,0,3000),('RS-LC-old','RS-LC',-1,1000,3000),
  ('RS-LD-today','RS-LD',0,0,100),('RS-LE-today','RS-LE',0,0,100)) v(id,loan,day,p,i);
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" IN ('RS-LA','RS-LB','RS-LX','RS-LD','RS-LE');

CREATE FUNCTION pg_temp.rs_actor() RETURNS text LANGUAGE sql AS $f$ SELECT '{"issuer":"https://rs.invalid","subject":"rs-owner","partnerId":"RS-ACT","loginEmail":"rs-actor@example.invalid"}' $f$;
-- loan.close, canonical (Test-RebateOffset.sql form); path NULL omits rebatePath.
CREATE FUNCTION pg_temp.rs_close(request text,loan text,path text) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"contractVersion":2,"requestId":'||to_json(request)::text||',"actor":'||pg_temp.rs_actor()||',"command":{"schemaVersion":1,"operation":"loan.close","targetType":"loan","targetId":'
  ||to_json(loan)::text||',"expectedVersion":'||to_json(public.pwa_loan_version_v2(loan))::text||',"predecessorRequestId":null,"inputs":{"paymentDate":'||to_json(to_char((SELECT d FROM rs_day),'YYYY-MM-DD'))::text
  ||',"cashAccountId":"CI-DAD","paymentMethod":"Cash","notes":null,"expectedAmount":'||to_json(public.loan_close_calculation_v83(loan,(SELECT d FROM rs_day))->>'amount')::text
  ||',"expectedPlanHash":'||to_json(public.loan_close_calculation_v83(loan,(SELECT d FROM rs_day))->>'planHash')::text
  ||CASE WHEN path IS NULL THEN '' ELSE ',"rebatePath":'||to_json(path)::text END||'}},"receipt":null}' $f$;
-- rebate-settlement.create and .delete, canonical (key order of the design).
CREATE FUNCTION pg_temp.rs_create(request text,target text,referrer text,ids text[],day date,account text,method text,ref text,notes text) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"contractVersion":2,"requestId":'||to_json(request)::text||',"actor":'||pg_temp.rs_actor()||',"command":{"schemaVersion":1,"operation":"rebate-settlement.create","targetType":"rebate-settlement","targetId":'
  ||to_json(target)::text||',"expectedVersion":null,"predecessorRequestId":null,"inputs":{"referrerId":'||to_json(referrer)::text||',"expenseIds":['
  ||coalesce((SELECT string_agg(to_json(x)::text,',' ORDER BY o) FROM unnest(ids) WITH ORDINALITY u(x,o)),'')||'],"settlementDate":'||to_json(to_char(day,'YYYY-MM-DD'))::text
  ||',"cashAccountId":'||to_json(account)::text||',"paymentMethod":'||to_json(method)::text||',"bankReference":'||coalesce(to_json(ref)::text,'null')||',"notes":'||coalesce(to_json(notes)::text,'null')||'}},"receipt":null}' $f$;
CREATE FUNCTION pg_temp.rs_delete(request text,target text,version text) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"contractVersion":2,"requestId":'||to_json(request)::text||',"actor":'||pg_temp.rs_actor()||',"command":{"schemaVersion":1,"operation":"rebate-settlement.delete","targetType":"rebate-settlement","targetId":'
  ||to_json(target)::text||',"expectedVersion":'||to_json(version)::text||',"predecessorRequestId":null,"inputs":{}},"receipt":null}' $f$;
CREATE FUNCTION pg_temp.rs_payment_delete(request text,payment text) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"contractVersion":2,"requestId":'||to_json(request)::text||',"actor":'||pg_temp.rs_actor()||',"command":{"schemaVersion":1,"operation":"payment.delete","targetType":"payment","targetId":'
  ||to_json(payment)::text||',"expectedVersion":'||to_json(public.pwa_payment_version_v2(payment))::text||',"predecessorRequestId":'||coalesce(to_json(public.pwa_payment_head_v2(payment)::text)::text,'null')||',"inputs":{}},"receipt":null}' $f$;
-- The real Receive payment command v7 (Test-RebateOffset.sql ro_pay), for the historical close.
CREATE FUNCTION pg_temp.rs_pay(request text,borrower text,charge text,p int,i int,off int) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"contractVersion":1,"command":{"schemaVersion":7,"requestId":'||to_json(request)::text||',"borrowerId":'||to_json(borrower)::text||',"allocations":[{"chargeId":'||to_json(charge)::text
  ||',"principal":"'||p||'","interest":"'||i||'","expectedPrincipalRemaining":"'||p||'","expectedInterestRemaining":"'||i||'","chargeDate":"'||to_char((SELECT d FROM rs_day)+least(off,0),'YYYY-MM-DD')
  ||'"}],"cashAccountId":"CI-DAD","paymentDate":"'||to_char((SELECT d FROM rs_day)+off,'YYYY-MM-DD')||'","amountReceived":"'||(p+i)||'","paymentMethod":"Bank Transfer","notes":null,"receiptId":null,"bankReference":null,"transferTime":null},'
  ||'"actor":'||pg_temp.rs_actor()||',"receipt":null}' $f$;
-- Submit as the command user; the outcome is kept in a session setting under the given name.
CREATE FUNCTION pg_temp.rs_status(name text) RETURNS text LANGUAGE sql AS $f$ SELECT current_setting('rs.out_'||name)::jsonb#>>'{originalOutcome,status}' $f$;
CREATE FUNCTION pg_temp.rs_code(name text) RETURNS text LANGUAGE sql AS $f$ SELECT current_setting('rs.out_'||name)::jsonb#>>'{originalOutcome,code}' $f$;
CREATE FUNCTION pg_temp.rs_ledger(source_key text) RETURNS numeric LANGUAGE sql AS $f$ SELECT "Amount" FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Key"=source_key $f$;

-- Operator grants, emulated and rolled back (Test-RebateOffset.sql); the settlements stay read-only for the capability.
GRANT USAGE ON SCHEMA public TO mw_app_dev; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mw_app_dev; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO mw_app_dev;
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover,pwa_row_changes,pwa_rebate_settlements,pwa_rebate_settlement_allocations FROM mw_app_dev;
REVOKE USAGE,UPDATE ON SEQUENCE pwa_row_changes_seq_seq FROM mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_submit_operation_v2(text) TO mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_submit_selected_charges_v1(text) TO mw_app_dev;

-- 0. Legacy rows (D1): D and E close with no referrer (no rebate), then become R's referrals; their REFERRAL_REBATE_V2 rows
-- are written the way the V135 trigger wrote them (from inside a trigger, as the referral rule requires; nothing disabled):
-- D paid at close (300, the full cash row), E with an offset of 200 (its own closing payment of 200 stands in for the offset).
SELECT set_config('rs.close_d',pg_temp.rs_close('a0000000-0000-4000-8000-0000000000d1','RS-LD',NULL),true),
 set_config('rs.close_e',pg_temp.rs_close('a0000000-0000-4000-8000-0000000000e1','RS-LE',NULL),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN
 PERFORM set_config('rs.out_close_d',public.pwa_submit_operation_v2(current_setting('rs.close_d'))::text,false);
 PERFORM set_config('rs.out_close_e',public.pwa_submit_operation_v2(current_setting('rs.close_e'))::text,false);
END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.rs_assert(pg_temp.rs_status('close_d')='applied' AND pg_temp.rs_status('close_e')='applied','0: D and E close');
UPDATE public."Borrowers" SET "Ref Referrer"='RS-R' WHERE "Row ID" IN ('RS-D','RS-E');
CREATE TEMP TABLE rs_legacy(j jsonb) ON COMMIT DROP;
CREATE FUNCTION pg_temp.rs_legacy_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO public."Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Payee Name","Ref Payee Borrower","Ref Related Borrower","Ref Related Loan","Source Type","Source Key",
  "Gross Profit Basis","Rule Version","Created By","Rebate Rate","Rebate Cap","Ref Offset Payment")
 SELECT r."Row ID",r."Expense Date",r."Expense Category",r."Amount",r."Payee Name",r."Ref Payee Borrower",r."Ref Related Borrower",r."Ref Related Loan",r."Source Type",r."Source Key",
  r."Gross Profit Basis",r."Rule Version",r."Created By",r."Rebate Rate",r."Rebate Cap",r."Ref Offset Payment" FROM jsonb_populate_record(NULL::public."Business Expenses",NEW.j) r;
 RETURN NULL;
END $$;
CREATE TRIGGER rs_legacy_insert AFTER INSERT ON rs_legacy FOR EACH ROW EXECUTE FUNCTION pg_temp.rs_legacy_insert();
INSERT INTO rs_legacy SELECT jsonb_build_object('Row ID','rr1:'||v.loan,'Expense Date',(SELECT d FROM rs_day),'Expense Category','Referral Rebate / เงินคืนค่าแนะนำลูกค้า','Amount',300,
  'Payee Name','SYNTHETIC SETTLEMENT REFERRER','Ref Payee Borrower','RS-R','Ref Related Borrower',v.b,'Ref Related Loan',v.loan,'Source Type','Referral Rebate','Source Key','REFERRAL_REBATE:'||v.loan,
  'Gross Profit Basis',3000,'Rule Version','REFERRAL_REBATE_V2','Created By','SQL:loan-close','Rebate Rate',10,'Rebate Cap',1000,'Ref Offset Payment',v.off)
 FROM (VALUES ('RS-LD','RS-D',NULL::text),('RS-LE','RS-E',(SELECT "Ref Closing Payment" FROM public."Loans" WHERE "Row ID"='RS-LE'))) v(loan,b,off);
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.rs_assert(pg_temp.rs_ledger('EXPENSE:rr1:RS-LD')=300 AND pg_temp.rs_ledger('EXPENSE:rr1:RS-LE')=300 AND public.pwa_rebate_pending_v1('rr1:RS-LD')=0 AND public.pwa_rebate_pending_v1('rr1:RS-LE')=0
  AND public.pwa_rebates_owed_v1('RS-R')=0,'0: legacy V2 rows move their whole amount at close and are never pending');

-- 1. A closes; R has no open loan.
SELECT set_config('rs.close_a',pg_temp.rs_close('a1111111-1111-4111-8111-111111111111','RS-LA','expense'),true),
 set_config('rs.close_x',pg_temp.rs_close('a1111111-1111-4111-8111-1111111111f1','RS-LX',NULL),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN
 PERFORM set_config('rs.out_close_a',public.pwa_submit_operation_v2(current_setting('rs.close_a'))::text,false);
 PERFORM set_config('rs.out_close_x',public.pwa_submit_operation_v2(current_setting('rs.close_x'))::text,false);
END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE day date:=(SELECT d FROM rs_day); x public."Business Expenses"%ROWTYPE; r jsonb:=current_setting('rs.out_close_a')::jsonb#>'{originalOutcome,result,rebate}';
BEGIN
 PERFORM pg_temp.rs_assert(pg_temp.rs_status('close_a')='applied' AND pg_temp.rs_status('close_x')='applied','1: A and X close');
 SELECT * INTO x FROM public."Business Expenses" WHERE "Row ID"='rr1:RS-LA';
 PERFORM pg_temp.rs_assert(x."Amount"::numeric=300 AND x."Rule Version"='REFERRAL_REBATE_V3' AND x."Ref Paid By Cash Holder"='ch:lisa' AND x."Ref Paid By Cash Account"='CI-LISA'
  AND x."Ref Rebate Settlement" IS NULL AND x."Ref Offset Payment" IS NULL AND x."Expense Date"=day,'1: expense 300, V3, payer Lisa default account, not settled');
 PERFORM pg_temp.rs_assert(NOT EXISTS(SELECT 1 FROM public."Cash Ledger" WHERE "Ref Business Expense"='rr1:RS-LA'),'1: no Business Expense cash row');
 PERFORM pg_temp.rs_assert(public.pwa_rebate_pending_v1('rr1:RS-LA')=300 AND public.pwa_rebates_owed_v1('RS-R')=300,'1: pending 300, owed 300');
 -- The Partner split is the V2 rule's (closing-date contribution ratio of the full amount).
 PERFORM pg_temp.rs_assert(x."Allocation Basis"='Closing Date Contribution Ratio' AND x."Partner A Share"=public.partner_pool_share_at_date(day,'A')
  AND x."Partner A Expense"=round(300*public.partner_pool_share_at_date(day,'A'))::money AND x."Partner A Expense"+x."Partner B Expense"=300::money,'1: Partner allocation on the close date unchanged');
 PERFORM pg_temp.rs_assert(r->>'pending'='300' AND r->>'owedTotal'='300' AND r->>'payable'='300' AND r->>'offsetPaymentId' IS NULL,'1: result.rebate pending 300, owedTotal 300: '||r::text);
 PERFORM pg_temp.rs_assert((SELECT "Rule Version"='REFERRAL_REBATE_V3' AND public.pwa_rebate_pending_v1("Row ID")=300 FROM public."Business Expenses" WHERE "Row ID"='rr1:RS-LX'),'1: X''s rebate is pending to X');
END $$;
CREATE TEMP TABLE rs_split ON COMMIT DROP AS SELECT "Row ID",to_jsonb(x)->'Partner A Expense' a,to_jsonb(x)->'Partner B Expense' b,to_jsonb(x)->'Partner A Share' s FROM public."Business Expenses" x WHERE "Row ID" IN ('rr1:RS-LA','rr1:RS-LD','rr1:RS-LE');

-- 12 (first part). The push content right after case 1: pending 300, owed 300.
INSERT INTO public."Partners"("Row ID","Partner Role","Partner Name","Login Email","Email","Language Preference") VALUES('RS-LISA','B','Synthetic Lisa recipient','rs-lisa@example.invalid','rs-lisa@example.invalid','English');
CREATE TEMP TABLE rs_notice(name text PRIMARY KEY,delivery uuid,generation bigint) ON COMMIT DROP;
GRANT SELECT ON rs_notice TO PUBLIC;
CREATE FUNCTION pg_temp.rs_notice(name text,kind text,source_kind text,source_id text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE e uuid; s uuid; d uuid;
BEGIN
 INSERT INTO public.pwa_notification_events(dedupe_key,event_type,source_kind,source_id,source_version,actor_partner_id,actor_login_email)
 VALUES('RS-'||name,kind,source_kind,source_id,'v1',NULL,NULL) RETURNING event_id INTO e;
 INSERT INTO public.pwa_push_subscriptions(issuer,subject,partner_id,endpoint_hash,endpoint,p256dh,auth)
 VALUES('https://securetoken.google.com/clever-oasis-508610-n7','rs-'||name,'RS-LISA',encode(sha256(convert_to('rs-'||name,'UTF8')),'hex'),'https://fcm.googleapis.com/fcm/send/rs-'||name,'synthetic','synthetic') RETURNING subscription_id INTO s;
 INSERT INTO public.pwa_notification_deliveries(event_id,channel,destination_key,recipient_partner_id,subscription_id,subscription_version,state,lease_generation,lease_expires_at)
 VALUES(e,'web-push',encode(sha256(convert_to('rs-'||name,'UTF8')),'hex'),'RS-LISA',s,1,'leased',3,clock_timestamp()+interval '10 minutes') RETURNING delivery_id INTO d;
 INSERT INTO rs_notice VALUES(name,d,3);
END $$;
SELECT pg_temp.rs_notice('a','payment.posted','payment',(SELECT "Ref Closing Payment" FROM public."Loans" WHERE "Row ID"='RS-LA'));
SELECT pg_temp.rs_notice('d','loan.closed','loan','RS-LD');
CREATE ROLE rs_content_dispatch LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT mw_notify_dispatch_dev TO rs_content_dispatch WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
GRANT USAGE ON SCHEMA public TO rs_content_dispatch;
CREATE TEMP TABLE rs_push(step text,name text,v4 jsonb,v5 jsonb) ON COMMIT DROP;
GRANT INSERT,SELECT ON rs_push TO PUBLIC;
SET SESSION AUTHORIZATION rs_content_dispatch;
INSERT INTO rs_push SELECT 'after1',k.name,(SELECT x.rebates FROM public.pwa_notify_content_v4(k.delivery,k.generation) x),(SELECT x.rebates FROM public.pwa_notify_content_v5(k.delivery,k.generation) x) FROM rs_notice k;
RESET SESSION AUTHORIZATION;
DO $$
DECLARE a jsonb:=(SELECT v5->0 FROM rs_push WHERE step='after1' AND name='a'); d jsonb:=(SELECT v5->0 FROM rs_push WHERE step='after1' AND name='d');
BEGIN
 PERFORM pg_temp.rs_assert(a->>'state'='pending' AND (a->>'pending')::numeric=300 AND (a->>'owed')::numeric=300 AND (a->>'amount')::numeric=300 AND (a->>'payable')::numeric=300 AND a->>'payee'='Mai','12: case 1 push: pending 300, owed 300 to Mai: '||a::text);
 PERFORM pg_temp.rs_assert(d->>'state'='paid-at-close' AND (d->>'pending')::numeric=0,'12: a legacy rebate reads paid at close: '||d::text);
 PERFORM pg_temp.rs_assert(NOT EXISTS(SELECT 1 FROM rs_push WHERE (SELECT jsonb_agg(e-ARRAY['state','pending','owed','ruleVersion']) FROM jsonb_array_elements(v5) e) IS DISTINCT FROM v4),'12: v4 rebates equal v5 without the new keys');
 PERFORM pg_temp.rs_assert(NOT EXISTS(SELECT 1 FROM rs_push,jsonb_array_elements(v4) e WHERE e ?| ARRAY['state','pending','owed']),'12: v4 keeps its three keys');
END $$;

-- 2. R gets an open loan whose 93-day schedule takes 200 (14 due today, then 2 a day); B closes with the offset.
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Defaulted")
 VALUES('CI-LISA','RS-RL','RS-R',(SELECT d FROM rs_day)-3,1000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,2::money,1,false);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('RS-RL-today','RS-RL',(SELECT d FROM rs_day),0::money,14::money);
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='RS-RL';
SELECT pg_temp.rs_assert((public.pwa_referral_rebate_projection_v1('RS-LB',public.loan_close_calculation_v83('RS-LB',(SELECT d FROM rs_day)))->>'owedBefore')='300','2: the close preview states owedBefore 300');
SELECT set_config('rs.close_b',pg_temp.rs_close('a2222222-2222-4222-8222-222222222222','RS-LB','offset'),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN PERFORM set_config('rs.out_close_b',public.pwa_submit_operation_v2(current_setting('rs.close_b'))::text,false); END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE off text; x public."Business Expenses"%ROWTYPE; r jsonb:=current_setting('rs.out_close_b')::jsonb#>'{originalOutcome,result,rebate}';
BEGIN
 PERFORM pg_temp.rs_assert(pg_temp.rs_status('close_b')='applied','2: B closes: '||current_setting('rs.out_close_b'));
 SELECT * INTO x FROM public."Business Expenses" WHERE "Row ID"='rr1:RS-LB'; off:=x."Ref Offset Payment";
 PERFORM pg_temp.rs_assert(off IS NOT NULL AND (SELECT "Amount Received"::numeric=200 AND "Status"='Posted' AND "Payment Method"='Referral Rebate Offset' FROM public."Payments" WHERE "Row ID"=off),'2: offset payment of 200 posted');
 PERFORM pg_temp.rs_assert(x."Amount"::numeric=300 AND x."Rule Version"='REFERRAL_REBATE_V3','2: expense 300, V3');
 PERFORM pg_temp.rs_assert((SELECT count(*)=1 AND sum("Amount")=200 AND bool_and("Ref From Cash Holder"='ch:lisa') FROM public."Cash Ledger" WHERE "Ref Business Expense"='rr1:RS-LB'),'2: the expense cash row is exactly 200 out of Lisa');
 PERFORM pg_temp.rs_assert((SELECT coalesce(sum(CASE WHEN "Ref To Cash Holder"='ch:lisa' THEN "Amount" ELSE 0 END),0)-coalesce(sum(CASE WHEN "Ref From Cash Holder"='ch:lisa' THEN "Amount" ELSE 0 END),0)=0
   FROM public."Cash Ledger" WHERE "Ref Payment"=off OR "Ref Business Expense"='rr1:RS-LB'),'2: Lisa nets to zero on the offset day');
 PERFORM pg_temp.rs_assert(public.pwa_rebate_pending_v1('rr1:RS-LB')=100 AND public.pwa_rebates_owed_v1('RS-R')=400,'2: pending 100, owed 400');
 PERFORM pg_temp.rs_assert(r->>'pending'='100' AND r->>'owedTotal'='400' AND r->>'offsetAmount'='200','2: result.rebate pending 100, owedTotal 400: '||r::text);
 PERFORM set_config('rs.off_b',off,false);
END $$;
SELECT pg_temp.rs_notice('b','payment.posted','payment',(SELECT "Ref Closing Payment" FROM public."Loans" WHERE "Row ID"='RS-LB'));
SET SESSION AUTHORIZATION rs_content_dispatch;
INSERT INTO rs_push SELECT 'after2',k.name,(SELECT x.rebates FROM public.pwa_notify_content_v4(k.delivery,k.generation) x),(SELECT x.rebates FROM public.pwa_notify_content_v5(k.delivery,k.generation) x) FROM rs_notice k WHERE k.name='b';
RESET SESSION AUTHORIZATION;
SELECT pg_temp.rs_assert((SELECT v5->0->>'state'='offset' AND (v5->0->>'pending')::numeric=100 AND (v5->0->>'owed')::numeric=400 AND (v5->0->>'payable')::numeric=100 AND v4->0=(v5->0)-ARRAY['state','pending','owed','ruleVersion'] AND v5->0->>'ruleVersion'='REFERRAL_REBATE_V3'
  FROM rs_push WHERE step='after2' AND name='b'),'12: case 2 push: offset, pending 100, owed 400; v4 unchanged');

-- 3. One settlement of both, from Lisa's SCB account, by bank transfer with a reference.
CREATE TEMP TABLE rs_versions ON COMMIT DROP AS SELECT "Row ID",public.pwa_expense_version_v2("Row ID") v FROM public."Business Expenses" WHERE "Row ID" IN ('rr1:RS-LA','rr1:RS-LB');
SELECT set_config('rs.s1',pg_temp.rs_create('b1111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111','RS-R',ARRAY['rr1:RS-LA','rr1:RS-LB'],(SELECT d FROM rs_day),'RS-LISA-SCB','Bank Transfer','REF-1234','synthetic settlement'),true),
 -- the same request id with another payload
 set_config('rs.s1x',pg_temp.rs_create('b1111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111','RS-R',ARRAY['rr1:RS-LA','rr1:RS-LB'],(SELECT d FROM rs_day),'RS-LISA-SCB','Cash',NULL,NULL),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN
 PERFORM set_config('rs.out_s1',public.pwa_submit_operation_v2(current_setting('rs.s1'))::text,false);
 -- 4. Replay: the recorded outcome; another payload under the same id: conflict.
 PERFORM set_config('rs.out_s1r',public.pwa_submit_operation_v2(current_setting('rs.s1'))::text,false);
 PERFORM set_config('rs.out_s1x',public.pwa_submit_operation_v2(current_setting('rs.s1x'))::text,false);
END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE day date:=(SELECT d FROM rs_day); s public.pwa_rebate_settlements%ROWTYPE; out jsonb:=current_setting('rs.out_s1')::jsonb;
BEGIN
 PERFORM pg_temp.rs_assert(pg_temp.rs_status('s1')='applied','3: the settlement applies: '||out::text);
 PERFORM pg_temp.rs_assert(out#>'{originalOutcome,result}'=jsonb_build_object('operation','rebate-settlement.create','targetType','rebate-settlement','targetId','c1111111-1111-4111-8111-111111111111',
  'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy','rs-actor@example.invalid',
  -- R184 (D13): the seven-key shape is whole pending paid to the referrer, and its outcome carries the same detail.
  'rebateSettlement',jsonb_build_object('destination','referrer','amount','400','owedAfter','0','offsetPaymentId',NULL,'lines',jsonb_build_array(
   jsonb_build_object('expenseId','rr1:RS-LA','amount','300','pendingAfter','0'),jsonb_build_object('expenseId','rr1:RS-LB','amount','100','pendingAfter','0')))),'3: the journalled result has the standard shape and the settlement detail: '||out::text);
 SELECT * INTO s FROM public.pwa_rebate_settlements WHERE id='c1111111-1111-4111-8111-111111111111';
 PERFORM pg_temp.rs_assert((SELECT count(*)=2 AND sum(amount)=400 AND bool_and(amount=CASE expense_id WHEN 'rr1:RS-LA' THEN 300 ELSE 100 END) FROM public.pwa_rebate_settlement_allocations WHERE settlement_id=s.id) AND s.offset_payment_id IS NULL,'3: one allocation per rebate, its whole pending amount');
 PERFORM pg_temp.rs_assert(s.amount=400 AND s.payee_borrower_id='RS-R' AND s.settlement_date=day AND s.paid_by_cash_holder='ch:lisa' AND s.paid_by_cash_account='RS-LISA-SCB'
  AND s.payment_method='Bank Transfer' AND s.bank_reference='REF-1234' AND s.notes='synthetic settlement' AND s.created_by='rs-actor@example.invalid','3: settlement row 400 as commanded');
 PERFORM pg_temp.rs_assert((SELECT count(*)=2 FROM public."Business Expenses" WHERE "Ref Rebate Settlement"=s.id),'3: both expenses linked');
 PERFORM pg_temp.rs_assert((SELECT count(*)=1 AND bool_and("Row ID"='cash:REBATESETTLEMENT:'||s.id AND "Movement Type"='Rebate Settlement' AND "Source Type"='Rebate Settlement' AND "Amount"=400
   AND "Ref From Cash Holder"='ch:lisa' AND "Ref From Cash Account"='RS-LISA-SCB' AND "Ref To Cash Holder" IS NULL AND "Movement Date"=day AND "Created By"='rs-actor@example.invalid' AND "Ref Business Expense" IS NULL)
   FROM public."Cash Ledger" WHERE "Ref Rebate Settlement"=s.id),'3: one Rebate Settlement cash row of 400 out of Lisa SCB today');
 PERFORM pg_temp.rs_assert(public.pwa_rebate_pending_v1('rr1:RS-LA')=0 AND public.pwa_rebate_pending_v1('rr1:RS-LB')=0 AND public.pwa_rebates_owed_v1('RS-R')=0,'3: pending 0 and 0, owed 0');
 PERFORM pg_temp.rs_assert(NOT EXISTS(SELECT 1 FROM rs_versions v WHERE public.pwa_expense_version_v2(v."Row ID")=v.v),'3: both expense versions changed');
 PERFORM pg_temp.rs_assert(NOT EXISTS(SELECT 1 FROM rs_split p JOIN public."Business Expenses" x USING ("Row ID") WHERE (to_jsonb(x)->'Partner A Expense',to_jsonb(x)->'Partner B Expense',to_jsonb(x)->'Partner A Share') IS DISTINCT FROM (p.a,p.b,p.s)),'3: the Partner split is kept');
 PERFORM pg_temp.rs_assert(length(public.pwa_rebate_settlement_version_v1(s.id))=64 AND public.pwa_rebate_settlement_version_v1('unknown') IS NULL,'3: version');
 -- 4.
 PERFORM pg_temp.rs_assert(current_setting('rs.out_s1r')::jsonb->'originalOutcome'=out->'originalOutcome','4: replay returns the recorded outcome');
 PERFORM pg_temp.rs_assert(current_setting('rs.out_s1x')::jsonb->>'kind'='conflict','4: another payload under the same request id is a conflict');
 PERFORM pg_temp.rs_assert((SELECT count(*)=1 FROM public.pwa_rebate_settlements) AND (SELECT count(*)=1 FROM public."Cash Ledger" WHERE "Source Type"='Rebate Settlement'),'4: no second row, no second cash row');
END $$;
SET SESSION AUTHORIZATION rs_content_dispatch;
INSERT INTO rs_push SELECT 'after3',k.name,NULL,(SELECT x.rebates FROM public.pwa_notify_content_v5(k.delivery,k.generation) x) FROM rs_notice k WHERE k.name IN ('a','b');
RESET SESSION AUTHORIZATION;
SELECT pg_temp.rs_assert((SELECT v5->0->>'state'='paid' AND (v5->0->>'pending')::numeric=0 AND (v5->0->>'owed')::numeric=0 FROM rs_push WHERE step='after3' AND name='a'),'12: a settled rebate reads paid, owed 0');
-- A partly offset V3 rebate whose rest a settlement paid reads 'paid' (a delayed push must not word it as Lisa's transfer).
SELECT pg_temp.rs_assert((SELECT v5->0->>'state'='paid' AND (v5->0->>'pending')::numeric=0 AND (v5->0->>'payable')::numeric=100 AND v5->0->>'ruleVersion'='REFERRAL_REBATE_V3' FROM rs_push WHERE step='after3' AND name='b'),'12: a settled partial offset reads paid: '||(SELECT v5::text FROM rs_push WHERE step='after3' AND name='b'));

-- 5. Refusals (each its own request id).
SELECT set_config('rs.n_legacy',pg_temp.rs_create('b5555555-5555-4555-8555-555555555501','c5555555-5555-4555-8555-555555555501','RS-R',ARRAY['rr1:RS-LD'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL),true),
 set_config('rs.n_payee',pg_temp.rs_create('b5555555-5555-4555-8555-555555555502','c5555555-5555-4555-8555-555555555502','RS-R',ARRAY['rr1:RS-LX'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL),true),
 set_config('rs.n_settled',pg_temp.rs_create('b5555555-5555-4555-8555-555555555503','c5555555-5555-4555-8555-555555555503','RS-R',ARRAY['rr1:RS-LA'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL),true),
 set_config('rs.n_dad',pg_temp.rs_create('b5555555-5555-4555-8555-555555555504','c5555555-5555-4555-8555-555555555504','RS-X',ARRAY['rr1:RS-LX'],(SELECT d FROM rs_day),'CI-DAD','Cash',NULL,NULL),true),
 set_config('rs.n_future',pg_temp.rs_create('b5555555-5555-4555-8555-555555555505','c5555555-5555-4555-8555-555555555505','RS-X',ARRAY['rr1:RS-LX'],(SELECT d FROM rs_day)+1,'CI-LISA','Cash',NULL,NULL),true),
 set_config('rs.n_early',pg_temp.rs_create('b5555555-5555-4555-8555-555555555506','c5555555-5555-4555-8555-555555555506','RS-X',ARRAY['rr1:RS-LX'],(SELECT d FROM rs_day)-1,'CI-LISA','Cash',NULL,NULL),true),
 set_config('rs.n_referrer',pg_temp.rs_create('b5555555-5555-4555-8555-555555555507','c5555555-5555-4555-8555-555555555507','RS-NOBODY',ARRAY['rr1:RS-LX'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL),true),
 set_config('rs.n_unknown',pg_temp.rs_create('b5555555-5555-4555-8555-555555555508','c5555555-5555-4555-8555-555555555508','RS-X',ARRAY['rr1:RS-LX','rr1:RS-NONE'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL),true),
 -- the same target id as the applied settlement under a new request
 set_config('rs.n_target',pg_temp.rs_create('b5555555-5555-4555-8555-555555555509','c1111111-1111-4111-8111-111111111111','RS-X',ARRAY['rr1:RS-LX'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL),true),
 -- invalid commands (validation, 22023): a bank reference with Cash, unsorted, duplicate and empty id lists, a blank or two-line reference
 set_config('rs.v_cashref',pg_temp.rs_create('b5555555-5555-4555-8555-555555555511','c5555555-5555-4555-8555-555555555511','RS-X',ARRAY['rr1:RS-LX'],(SELECT d FROM rs_day),'CI-LISA','Cash','REF',NULL),true),
 set_config('rs.v_unsorted',pg_temp.rs_create('b5555555-5555-4555-8555-555555555512','c5555555-5555-4555-8555-555555555512','RS-R',ARRAY['rr1:RS-LB','rr1:RS-LA'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL),true),
 set_config('rs.v_duplicate',pg_temp.rs_create('b5555555-5555-4555-8555-555555555513','c5555555-5555-4555-8555-555555555513','RS-R',ARRAY['rr1:RS-LA','rr1:RS-LA'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL),true),
 set_config('rs.v_empty',pg_temp.rs_create('b5555555-5555-4555-8555-555555555514','c5555555-5555-4555-8555-555555555514','RS-R',ARRAY[]::text[],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL),true),
 set_config('rs.v_blankref',pg_temp.rs_create('b5555555-5555-4555-8555-555555555515','c5555555-5555-4555-8555-555555555515','RS-X',ARRAY['rr1:RS-LX'],(SELECT d FROM rs_day),'CI-LISA','Bank Transfer',' ',NULL),true),
 set_config('rs.v_lineref',pg_temp.rs_create('b5555555-5555-4555-8555-555555555516','c5555555-5555-4555-8555-555555555516','RS-X',ARRAY['rr1:RS-LX'],(SELECT d FROM rs_day),'CI-LISA','Bank Transfer',E'A\nB',NULL),true),
 set_config('rs.v_version',replace(pg_temp.rs_create('b5555555-5555-4555-8555-555555555517','c5555555-5555-4555-8555-555555555517','RS-X',ARRAY['rr1:RS-LX'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL),'"expectedVersion":null','"expectedVersion":"'||repeat('a',64)||'"'),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE k text;
BEGIN
 FOREACH k IN ARRAY ARRAY['n_legacy','n_payee','n_settled','n_dad','n_future','n_early','n_referrer','n_unknown','n_target'] LOOP
  PERFORM set_config('rs.out_'||k,public.pwa_submit_operation_v2(current_setting('rs.'||k))::text,false);
 END LOOP;
 FOREACH k IN ARRAY ARRAY['v_cashref','v_unsorted','v_duplicate','v_empty','v_blankref','v_lineref','v_version'] LOOP
  BEGIN PERFORM public.pwa_submit_operation_v2(current_setting('rs.'||k)); RAISE EXCEPTION 'FAILED: 5: % was accepted',k;
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 END LOOP;
END $$;
RESET SESSION AUTHORIZATION;
SELECT pg_temp.rs_assert(pg_temp.rs_code(v.k)=v.code,'5: '||v.k||' is '||v.code||', got '||coalesce(current_setting('rs.out_'||v.k),'null'))
 FROM (VALUES ('n_legacy','record_requires_reconciliation'),('n_payee','record_requires_reconciliation'),('n_settled','record_requires_reconciliation'),
  ('n_dad','account_unavailable'),('n_future','invalid_date'),('n_early','invalid_date'),('n_referrer','not_found'),('n_unknown','record_requires_reconciliation'),('n_target','source_conflict')) v(k,code);
SELECT pg_temp.rs_assert((SELECT count(*)=1 FROM public.pwa_rebate_settlements) AND public.pwa_rebate_pending_v1('rr1:RS-LX')=300,'5: nothing written by a refusal');

-- 6. Delete with the version (a stale one first).
SELECT set_config('rs.d_stale',pg_temp.rs_delete('b6666666-6666-4666-8666-666666666601','c1111111-1111-4111-8111-111111111111',repeat('0',64)),true),
 set_config('rs.d_ok',pg_temp.rs_delete('b6666666-6666-4666-8666-666666666602','c1111111-1111-4111-8111-111111111111',public.pwa_rebate_settlement_version_v1('c1111111-1111-4111-8111-111111111111')),true),
 set_config('rs.d_gone',pg_temp.rs_delete('b6666666-6666-4666-8666-666666666603','c1111111-1111-4111-8111-111111111111',public.pwa_rebate_settlement_version_v1('c1111111-1111-4111-8111-111111111111')),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN
 PERFORM set_config('rs.out_d_stale',public.pwa_submit_operation_v2(current_setting('rs.d_stale'))::text,false);
 PERFORM set_config('rs.out_d_ok',public.pwa_submit_operation_v2(current_setting('rs.d_ok'))::text,false);
 PERFORM set_config('rs.out_d_gone',public.pwa_submit_operation_v2(current_setting('rs.d_gone'))::text,false);
 BEGIN PERFORM public.pwa_submit_operation_v2(replace(current_setting('rs.d_gone'),'"inputs":{}','"inputs":{"x":1}')); RAISE EXCEPTION 'FAILED: 6: a delete with inputs was accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
 PERFORM pg_temp.rs_assert(pg_temp.rs_code('d_stale')='source_conflict','6: a stale version is source_conflict');
 PERFORM pg_temp.rs_assert(pg_temp.rs_status('d_ok')='applied' AND current_setting('rs.out_d_ok')::jsonb#>>'{originalOutcome,result,sourceCreatedBy}'='rs-actor@example.invalid','6: the delete applies');
 PERFORM pg_temp.rs_assert(pg_temp.rs_code('d_gone')='not_found','6: a second delete finds nothing');
 PERFORM pg_temp.rs_assert(NOT EXISTS(SELECT 1 FROM public.pwa_rebate_settlements) AND NOT EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Ref Rebate Settlement" IS NOT NULL)
  AND NOT EXISTS(SELECT 1 FROM public."Cash Ledger" WHERE "Source Type"='Rebate Settlement' OR "Ref Rebate Settlement" IS NOT NULL),'6: links cleared, settlement and cash row gone');
 PERFORM pg_temp.rs_assert(public.pwa_rebate_pending_v1('rr1:RS-LA')=300 AND public.pwa_rebate_pending_v1('rr1:RS-LB')=100 AND public.pwa_rebates_owed_v1('RS-R')=400,'6: pending 300 and 100 again');
 PERFORM pg_temp.rs_assert(NOT EXISTS(SELECT 1 FROM rs_split p JOIN public."Business Expenses" x USING ("Row ID") WHERE (to_jsonb(x)->'Partner A Expense',to_jsonb(x)->'Partner B Expense',to_jsonb(x)->'Partner A Share') IS DISTINCT FROM (p.a,p.b,p.s)),'6: the Partner split is kept');
END $$;

-- 7. A subset settlement (A only), then deleting A's closing payment is refused until the settlement goes.
SELECT set_config('rs.s2',pg_temp.rs_create('b7777777-7777-4777-8777-777777777701','c7777777-7777-4777-8777-777777777701','RS-R',ARRAY['rr1:RS-LA'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN PERFORM set_config('rs.out_s2',public.pwa_submit_operation_v2(current_setting('rs.s2'))::text,false); END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.rs_assert(pg_temp.rs_status('s2')='applied' AND (SELECT amount=300 FROM public.pwa_rebate_settlements WHERE id='c7777777-7777-4777-8777-777777777701') AND public.pwa_rebates_owed_v1('RS-R')=100,'7: subset settlement 300, 100 still owed');
SELECT set_config('rs.p_a',pg_temp.rs_payment_delete('b7777777-7777-4777-8777-777777777702',(SELECT "Ref Closing Payment" FROM public."Loans" WHERE "Row ID"='RS-LA')),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN PERFORM set_config('rs.out_p_a',public.pwa_submit_operation_v2(current_setting('rs.p_a'))::text,false); END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.rs_assert(pg_temp.rs_code('p_a')='dependency_conflict' AND EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Row ID"='rr1:RS-LA' AND "Ref Rebate Settlement" IS NOT NULL),'7: the closing payment delete is refused (P5B05): '||current_setting('rs.out_p_a'));
DO $$ BEGIN
 BEGIN DELETE FROM public."Payments" WHERE "Row ID"=(SELECT "Ref Closing Payment" FROM public."Loans" WHERE "Row ID"='RS-LA'); RAISE EXCEPTION 'FAILED: 7: a direct closing-payment delete removed a paid rebate';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Remove the settlement first%' THEN RAISE; END IF; END;
END $$;
SELECT set_config('rs.d_s2',pg_temp.rs_delete('b7777777-7777-4777-8777-777777777703','c7777777-7777-4777-8777-777777777701',public.pwa_rebate_settlement_version_v1('c7777777-7777-4777-8777-777777777701')),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN PERFORM set_config('rs.out_d_s2',public.pwa_submit_operation_v2(current_setting('rs.d_s2'))::text,false); END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT set_config('rs.p_a2',pg_temp.rs_payment_delete('b7777777-7777-4777-8777-777777777704',(SELECT "Ref Closing Payment" FROM public."Loans" WHERE "Row ID"='RS-LA')),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN PERFORM set_config('rs.out_p_a2',public.pwa_submit_operation_v2(current_setting('rs.p_a2'))::text,false); END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.rs_assert(pg_temp.rs_status('d_s2')='applied' AND pg_temp.rs_status('p_a2')='applied' AND NOT EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Row ID"='rr1:RS-LA')
  AND (SELECT "Loan Status"='ยังไม่ปิดยอด' FROM public."Loans" WHERE "Row ID"='RS-LA'),'7: after the settlement goes, the closing-payment delete removes the expense and reopens the loan: '||current_setting('rs.out_p_a2'));

-- 8. B's closing payment goes while its rebate is pending: the expense and its offset payment go (R111), owed falls by 100.
SELECT set_config('rs.owed_before_8',public.pwa_rebates_owed_v1('RS-R')::text,false);
SELECT set_config('rs.p_b',pg_temp.rs_payment_delete('b8888888-8888-4888-8888-888888888801',(SELECT "Ref Closing Payment" FROM public."Loans" WHERE "Row ID"='RS-LB')),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN PERFORM set_config('rs.out_p_b',public.pwa_submit_operation_v2(current_setting('rs.p_b'))::text,false); END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.rs_assert(pg_temp.rs_status('p_b')='applied' AND NOT EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Row ID"='rr1:RS-LB') AND NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"=current_setting('rs.off_b'))
  AND NOT EXISTS(SELECT 1 FROM public."Cash Ledger" WHERE "Ref Business Expense"='rr1:RS-LB' OR "Ref Payment"=current_setting('rs.off_b'))
  AND public.pwa_rebates_owed_v1('RS-R')=current_setting('rs.owed_before_8')::numeric-100,'8: expense, offset and cash rows gone; owed falls by 100: '||current_setting('rs.out_p_b'));

-- 9. Immutability: the link changes only under the command's setting; a settlement row never changes.
SELECT set_config('rs.s3',pg_temp.rs_create('b9999999-9999-4999-8999-999999999901','c9999999-9999-4999-8999-999999999901','RS-X',ARRAY['rr1:RS-LX'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN PERFORM set_config('rs.out_s3',public.pwa_submit_operation_v2(current_setting('rs.s3'))::text,false); END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE sid text:='c9999999-9999-4999-8999-999999999901';
BEGIN
 PERFORM pg_temp.rs_assert(pg_temp.rs_status('s3')='applied','9: X''s settlement applies');
 BEGIN UPDATE public."Business Expenses" SET "Ref Rebate Settlement"=NULL WHERE "Row ID"='rr1:RS-LX'; RAISE EXCEPTION 'FAILED: 9: a link was cleared outside the setting';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Rebate settlement links change only through a rebate settlement%' THEN RAISE; END IF; END;
 BEGIN UPDATE public."Business Expenses" SET "Ref Rebate Settlement"=sid WHERE "Row ID"='rr1:RS-LC'; RAISE EXCEPTION 'FAILED: 9: a link was set outside the setting';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Rebate settlement links change only through a rebate settlement%' AND SQLERRM NOT LIKE 'FAILED%' THEN RAISE; END IF; END;
 BEGIN PERFORM set_config('pwa.rebate_settlement','c0000000-0000-4000-8000-000000000000',true); UPDATE public."Business Expenses" SET "Ref Rebate Settlement"=NULL WHERE "Row ID"='rr1:RS-LX'; RAISE EXCEPTION 'FAILED: 9: another settlement''s setting cleared a link';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Rebate settlement links change only through a rebate settlement%' THEN RAISE; END IF; END;
 PERFORM set_config('pwa.rebate_settlement','',true);
 BEGIN UPDATE public."Business Expenses" SET "Notes"='x' WHERE "Row ID"='rr1:RS-LX'; RAISE EXCEPTION 'FAILED: 9: a referral rebate changed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Automatic referral expenses are system-managed%' THEN RAISE; END IF; END;
 BEGIN UPDATE public."Business Expenses" SET "Rule Version"='REFERRAL_REBATE_V2' WHERE "Row ID"='rr1:RS-LX'; RAISE EXCEPTION 'FAILED: 9: a rule version changed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Automatic referral expenses are system-managed%' THEN RAISE; END IF; END;
 BEGIN UPDATE public.pwa_rebate_settlements SET notes='x' WHERE id=sid; RAISE EXCEPTION 'FAILED: 9: a settlement row changed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Rebate settlements are immutable%' THEN RAISE; END IF; END;
 -- A manual expense never carries a link.
 BEGIN INSERT INTO public."Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Account","Ref Paid By Cash Holder","Ref Rebate Settlement")
   VALUES('RS-MANUAL-LINK',(SELECT d FROM rs_day),'Other / อื่น ๆ',10::money,'CI-LISA','ch:lisa',sid); RAISE EXCEPTION 'FAILED: 9: a manual expense took a link';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Rebate settlement links change only through a rebate settlement%' THEN RAISE; END IF; END;
 -- A settled rebate is never deleted directly either.
 BEGIN DELETE FROM public."Business Expenses" WHERE "Row ID"='rr1:RS-LX'; RAISE EXCEPTION 'FAILED: 9: a paid rebate was deleted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Remove the settlement first%' THEN RAISE; END IF; END;
 -- The capability reads the settlements and never writes them.
 PERFORM pg_temp.rs_assert(has_table_privilege('mw_app_dev','public.pwa_rebate_settlements','SELECT') AND NOT has_table_privilege('mw_app_dev','public.pwa_rebate_settlements','INSERT')
  AND NOT has_table_privilege('mw_app_dev','public.pwa_rebate_settlements','DELETE'),'13: the application role reads the settlements only');
END $$;

-- 10. The ledger guard and the system-row CHECK.
DO $$
DECLARE sid text:='c9999999-9999-4999-8999-999999999901';
BEGIN
 BEGIN INSERT INTO public."Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder","Ref From Cash Account","Ref To Cash Account","Ref Rebate Settlement","Created By")
   VALUES('RS-MANUAL',(SELECT d FROM rs_day),'Cash Handover',1,'ch:lisa','ch:dad','CI-LISA','CI-DAD',sid,'rs'); RAISE EXCEPTION 'FAILED: 10: a manual cash row named a settlement';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Only a rebate settlement may link a rebate settlement%' THEN RAISE; END IF; END;
 PERFORM pg_temp.rs_assert((SELECT count(*)=1 FROM public."Cash Ledger" WHERE "Ref Rebate Settlement"=sid AND "Source Key"='REBATESETTLEMENT:'||sid AND "Entry Origin"='System'),'10: the settlement''s system row satisfies the CHECK');
END $$;
-- A system row of the new type with a wrong key or a second link is refused by the CHECK (written from a trigger, as the
-- ledger guard requires for system rows).
CREATE TEMP TABLE rs_ledger_probe(j jsonb) ON COMMIT DROP;
CREATE FUNCTION pg_temp.rs_ledger_probe() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO public."Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref From Cash Account","Entry Origin","Source Type","Source Key","Ref Rebate Settlement","Ref Business Expense","Created By")
 SELECT r."Row ID",r."Movement Date",r."Movement Type",r."Amount",r."Ref From Cash Holder",r."Ref From Cash Account",r."Entry Origin",r."Source Type",r."Source Key",r."Ref Rebate Settlement",r."Ref Business Expense",r."Created By"
 FROM jsonb_populate_record(NULL::public."Cash Ledger",NEW.j) r;
 RETURN NULL;
END $$;
CREATE TRIGGER rs_ledger_probe AFTER INSERT ON rs_ledger_probe FOR EACH ROW EXECUTE FUNCTION pg_temp.rs_ledger_probe();
DO $$
DECLARE sid text:='c9999999-9999-4999-8999-999999999901'; base jsonb; v jsonb;
BEGIN
 base:=jsonb_build_object('Row ID','RS-PROBE','Movement Date',(SELECT d FROM rs_day),'Movement Type','Rebate Settlement','Amount',1,'Ref From Cash Holder','ch:lisa','Ref From Cash Account','CI-LISA',
  'Entry Origin','System','Source Type','Rebate Settlement','Source Key','REBATESETTLEMENT:x','Ref Rebate Settlement',sid,'Created By','rs');
 FOREACH v IN ARRAY ARRAY[base,base||jsonb_build_object('Source Key','REBATESETTLEMENT:'||sid,'Ref Business Expense','rr1:RS-LX'),base||jsonb_build_object('Source Key','REBATESETTLEMENT:'||sid,'Movement Type','Business Expense')] LOOP
  BEGIN INSERT INTO rs_ledger_probe VALUES(v); RAISE EXCEPTION 'FAILED: 10: the CHECK accepted %',v;
  EXCEPTION WHEN check_violation THEN NULL; END;
 END LOOP;
END $$;

-- 11. A historical close: Close Date yesterday, as a correction re-post closes (the receipt engine's payment_crud.parents
-- context names the payment, so close_payment_loans keeps its payment date): V3, no offset although R has an open loan,
-- pending as case 1. Self-referral cannot exist (borrower_not_own_referrer), so no rebate (unchanged).
SELECT set_config('rs.pay_c',pg_temp.rs_pay('ab111111-1111-4111-8111-111111111111','RS-C','RS-LC-old',1000,3000,-1),true),
 set_config('payment_crud.parents','{"pwa:ab111111-1111-4111-8111-111111111111":[]}',true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN PERFORM set_config('rs.out_pay_c',public.pwa_submit_selected_charges_v1(current_setting('rs.pay_c'))::text,false); END $$;
RESET SESSION AUTHORIZATION;
SELECT set_config('payment_crud.parents','',true);
SELECT pg_temp.rs_assert((SELECT "Close Date"=(SELECT d FROM rs_day)-1 FROM public."Loans" WHERE "Row ID"='RS-LC'),'11: C closed on its payment date (historical)');
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
 PERFORM pg_temp.rs_assert((SELECT "Rule Version"='REFERRAL_REBATE_V3' AND "Ref Offset Payment" IS NULL AND "Amount"::numeric=300 AND "Expense Date"=(SELECT d FROM rs_day)-1 FROM public."Business Expenses" WHERE "Row ID"='rr1:RS-LC')
  AND public.pwa_rebate_pending_v1('rr1:RS-LC')=300 AND NOT EXISTS(SELECT 1 FROM public."Cash Ledger" WHERE "Ref Business Expense"='rr1:RS-LC'),'11: historical close: V3, no offset, pending 300, no cash row: '||current_setting('rs.out_pay_c'));
 BEGIN UPDATE public."Borrowers" SET "Ref Referrer"='RS-R' WHERE "Row ID"='RS-R'; RAISE EXCEPTION 'FAILED: 11: a borrower referred itself';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- Legacy conversion (owner addition, D1): postgres only; V2 rows only; the cash row becomes the offset amount or goes.
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.pwa_convert_legacy_rebate_v1('rr1:RS-LD');
 PERFORM pg_temp.rs_assert(r=jsonb_build_object('expenseId','rr1:RS-LD','amount',300,'offsetAmount',0,'pendingAmount',300,'ledgerBefore',300,'ledgerAfter',NULL),'D1: V2 with no offset: cash row gone, pending 300: '||r::text);
 PERFORM pg_temp.rs_assert(pg_temp.rs_ledger('EXPENSE:rr1:RS-LD') IS NULL AND (SELECT "Rule Version"='REFERRAL_REBATE_V3' FROM public."Business Expenses" WHERE "Row ID"='rr1:RS-LD'),'D1: RS-LD is V3 without a cash row');
 r:=public.pwa_convert_legacy_rebate_v1('rr1:RS-LE');
 PERFORM pg_temp.rs_assert(r=jsonb_build_object('expenseId','rr1:RS-LE','amount',300,'offsetAmount',200,'pendingAmount',100,'ledgerBefore',300,'ledgerAfter',200),'D1: V2 with an offset: cash row 200, pending 100: '||r::text);
 PERFORM pg_temp.rs_assert(NOT EXISTS(SELECT 1 FROM rs_split p JOIN public."Business Expenses" x USING ("Row ID") WHERE p."Row ID" IN ('rr1:RS-LD','rr1:RS-LE')
  AND (to_jsonb(x)->'Partner A Expense',to_jsonb(x)->'Partner B Expense',to_jsonb(x)->'Partner A Share') IS DISTINCT FROM (p.a,p.b,p.s)),'D1: the Partner split is kept');
 BEGIN PERFORM public.pwa_convert_legacy_rebate_v1('rr1:RS-LD'); RAISE EXCEPTION 'FAILED: D1: a V3 row was converted again';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'This rebate is already pending payment%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.pwa_convert_legacy_rebate_v1('rr1:RS-LX'); RAISE EXCEPTION 'FAILED: D1: a settled row was converted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'This rebate is already pending payment%' THEN RAISE; END IF; END;
 INSERT INTO public."Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Account","Ref Paid By Cash Holder") VALUES('RS-MANUAL',(SELECT d FROM rs_day),'Other / อื่น ๆ',10::money,'CI-LISA','ch:lisa');
 BEGIN PERFORM public.pwa_convert_legacy_rebate_v1('RS-MANUAL'); RAISE EXCEPTION 'FAILED: D1: a manual expense was converted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Only a referral rebate expense can be converted%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.pwa_convert_legacy_rebate_v1('RS-NONE'); RAISE EXCEPTION 'FAILED: D1: an unknown expense was converted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Unknown expense%' THEN RAISE; END IF; END;
 -- Outside the conversion the rule version stays immutable.
 BEGIN PERFORM set_config('pwa.rebate_convert','rr1:RS-LC',true); UPDATE public."Business Expenses" SET "Rule Version"='REFERRAL_REBATE_V2' WHERE "Row ID"='rr1:RS-LC'; RAISE EXCEPTION 'FAILED: D1: V3 went back to V2';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Automatic referral expenses are system-managed%' THEN RAISE; END IF; END;
 PERFORM set_config('pwa.rebate_convert','',true);
END $$;
SAVEPOINT rs_convert_probe;
SET LOCAL ROLE mw_app_dev;
DO $$ BEGIN
 PERFORM public.pwa_convert_legacy_rebate_v1('rr1:RS-LC'); RAISE EXCEPTION 'FAILED: D1: the application role ran the conversion';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT rs_convert_probe;
-- The converted rows settle like any pending rebate (300 + 100, and C's 300).
SELECT set_config('rs.s4',pg_temp.rs_create('bd111111-1111-4111-8111-111111111111','cd111111-1111-4111-8111-111111111111','RS-R',ARRAY['rr1:RS-LC','rr1:RS-LD','rr1:RS-LE'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN PERFORM set_config('rs.out_s4',public.pwa_submit_operation_v2(current_setting('rs.s4'))::text,false); END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.rs_assert(pg_temp.rs_status('s4')='applied' AND (SELECT amount=700 FROM public.pwa_rebate_settlements WHERE id='cd111111-1111-4111-8111-111111111111') AND public.pwa_rebates_owed_v1('RS-R')=0
  AND pg_temp.rs_ledger('REBATESETTLEMENT:cd111111-1111-4111-8111-111111111111')=700,'D1: converted rows settle (700 with C): '||current_setting('rs.out_s4'));
-- Lisa's cash over the whole scenario: every rebate moved exactly once, at close for the legacy row D (before conversion) or
-- on its offset or settlement; the referral expense total equals what left Lisa for referral rebates (offsets in, net).
SELECT pg_temp.rs_assert((SELECT sum("Amount"::numeric) FROM public."Business Expenses" WHERE "Source Type"='Referral Rebate' AND "Ref Payee Borrower" IN ('RS-R','RS-X'))
  =(SELECT sum("Amount") FROM public."Cash Ledger" WHERE "Ref Business Expense" IN (SELECT "Row ID" FROM public."Business Expenses" WHERE "Ref Payee Borrower" IN ('RS-R','RS-X')))
  +(SELECT sum(s.amount) FROM public.pwa_rebate_settlements s),'reconciliation: every rebate amount is its offset cash plus its settlement');
-- ===================== R184 (V155): partial amounts, the destination and the offset to the referrer's loan =====================
-- Archie's test plan, cases 1 to 10 (case 11 is Test-AccessMatrix.sql; the upgrade from V154 is Test-RebateSettlementUpgrade.sql):
--  P1 a partial direct 400 over rebates 300 + 300; P9 replay and conflict; P2 a second partial, then deleting the older
--  settlement (the link keeps its value and the expense row is still recorded as changed); P8 a closing-payment delete of a
--  part-paid rebate is refused until its settlements go; P3 every rejection, nothing changed; P4 an offset of 250 (payment per
--  plan, plan resolved through the journal, Lisa nets zero); P5 its delete, and the refusals after the referrer's loan is
--  defaulted and of a direct delete of the offset payment; P6 an offset deleted after a later payment closed the loan, an
--  offset that closes the referrer's loan (delete reopens it) and the refusal while that close's own rebate is settled;
--  P7 the plan's due step and a defaulted loan's kept charge; P10 the end invariants and push v5 after a partial.
\set submit 'SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam"; DO $r$ DECLARE k text; BEGIN FOREACH k IN ARRAY string_to_array(current_setting(''rs.run''),'','') LOOP PERFORM set_config(''rs.out_''||k,public.pwa_submit_operation_v2(current_setting(''rs.''||k))::text,false); END LOOP; END $r$; RESET SESSION AUTHORIZATION; SET CONSTRAINTS ALL IMMEDIATE;'
-- rebate-settlement.create, the nine-key shape; lines are 'expenseId|amount|expectedPending' in the order given.
CREATE FUNCTION pg_temp.rs_create2(request text,target text,referrer text,destination text,lines text[],day date,account text,method text,ref text,notes text,hash text) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"contractVersion":2,"requestId":'||to_json(request)::text||',"actor":'||pg_temp.rs_actor()||',"command":{"schemaVersion":1,"operation":"rebate-settlement.create","targetType":"rebate-settlement","targetId":'
  ||to_json(target)::text||',"expectedVersion":null,"predecessorRequestId":null,"inputs":{"referrerId":'||to_json(referrer)::text||',"destination":'||to_json(destination)::text||',"allocations":['
  ||coalesce((SELECT string_agg('{"expenseId":'||to_json(split_part(x,'|',1))::text||',"amount":'||to_json(split_part(x,'|',2))::text||',"expectedPending":'||to_json(split_part(x,'|',3))::text||'}',',' ORDER BY o) FROM unnest(lines) WITH ORDINALITY u(x,o)),'')
  ||'],"settlementDate":'||to_json(to_char(day,'YYYY-MM-DD'))::text||',"cashAccountId":'||coalesce(to_json(account)::text,'null')||',"paymentMethod":'||coalesce(to_json(method)::text,'null')
  ||',"bankReference":'||coalesce(to_json(ref)::text,'null')||',"notes":'||coalesce(to_json(notes)::text,'null')||',"expectedPlanHash":'||coalesce(to_json(hash)::text,'null')||'}},"receipt":null}' $f$;
CREATE FUNCTION pg_temp.rs_result(name text) RETURNS jsonb LANGUAGE sql AS $f$ SELECT current_setting('rs.out_'||name)::jsonb#>'{originalOutcome,result,rebateSettlement}' $f$;
CREATE FUNCTION pg_temp.rs_hash(referrer text,amount numeric) RETURNS text LANGUAGE sql AS $f$ SELECT public.pwa_rebate_offset_plan_v1(referrer,amount,(SELECT d FROM rs_day))->>'planHash' $f$;
CREATE FUNCTION pg_temp.rs_version(id text) RETURNS text LANGUAGE sql AS $f$ SELECT public.pwa_rebate_settlement_version_v1(id) $f$;
-- What a refusal must leave unchanged.
CREATE FUNCTION pg_temp.rs_state() RETURNS text LANGUAGE sql AS $f$
 SELECT md5((SELECT coalesce(string_agg(to_jsonb(s)::text,'|' ORDER BY s.id),'') FROM public.pwa_rebate_settlements s)||(SELECT coalesce(string_agg(to_jsonb(a)::text,'|' ORDER BY a.settlement_id,a.expense_id),'') FROM public.pwa_rebate_settlement_allocations a)
  ||(SELECT count(*)||':'||coalesce(sum("Amount Received"::numeric),0) FROM public."Payments")||(SELECT count(*)::text FROM public."Charges")||(SELECT count(*)::text FROM public."Repayments")
  ||(SELECT count(*)||':'||coalesce(sum("Amount"),0) FROM public."Cash Ledger")||(SELECT coalesce(string_agg("Row ID"||coalesce("Ref Rebate Settlement",'-'),'|' ORDER BY "Row ID"),'') FROM public."Business Expenses" WHERE "Source Type"='Referral Rebate')) $f$;

-- RP-R refers A, B, C and D (rebate 300 each, all closed before RP-R has a loan, so all four are pending). RQ-R (referred by
-- RQ-G) refers RQ-A. RK-R refers RK-A.
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Description") VALUES('RP-R','SYNTHETIC PARTIAL REFERRER','Pim'),('RQ-G','SYNTHETIC TOP REFERRER',NULL),('RK-R','SYNTHETIC KEPT REFERRER',NULL);
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Ref Referrer") VALUES('RP-A','SYNTHETIC PARTIAL A','RP-R'),('RP-B','SYNTHETIC PARTIAL B','RP-R'),('RP-C','SYNTHETIC PARTIAL C','RP-R'),('RP-D','SYNTHETIC PARTIAL D','RP-R'),
 ('RQ-R','SYNTHETIC OFFSET REFERRER','RQ-G'),('RQ-A','SYNTHETIC OFFSET A','RQ-R'),('RK-A','SYNTHETIC KEPT A','RK-R');
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Defaulted")
 SELECT 'CI-LISA',v.id,v.b,(SELECT d FROM rs_day)-3,1000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,100::money,1,false
 FROM (VALUES ('RP-LA','RP-A'),('RP-LB','RP-B'),('RP-LC','RP-C'),('RP-LD','RP-D'),('RQ-LA','RQ-A'),('RK-LA','RK-A')) v(id,b);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 SELECT l."Row ID"||'-today',l."Row ID",(SELECT d FROM rs_day),0::money,3000::money FROM public."Loans" l WHERE l."Row ID" IN ('RP-LA','RP-LB','RP-LC','RP-LD','RQ-LA','RK-LA');
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" IN ('RP-LA','RP-LB','RP-LC','RP-LD','RQ-LA','RK-LA');
SELECT set_config('rs.c'||n,pg_temp.rs_close('a184'||n||'000-0000-4000-8000-000000000001',v.loan,'expense'),true) FROM (VALUES (1,'RP-LA'),(2,'RP-LB'),(3,'RP-LC'),(4,'RP-LD'),(5,'RQ-LA'),(6,'RK-LA')) v(n,loan);
SELECT set_config('rs.run','c1,c2,c3,c4,c5,c6',true);
:submit
SELECT pg_temp.rs_assert(public.pwa_rebates_owed_v1('RP-R')=1200 AND public.pwa_rebates_owed_v1('RQ-R')=300 AND public.pwa_rebates_owed_v1('RK-R')=300
  AND (SELECT count(*)=6 AND bool_and("Rule Version"='REFERRAL_REBATE_V3' AND "Ref Rebate Settlement" IS NULL AND "Ref Offset Payment" IS NULL) FROM public."Business Expenses" WHERE "Row ID" IN ('rr1:RP-LA','rr1:RP-LB','rr1:RP-LC','rr1:RP-LD','rr1:RQ-LA','rr1:RK-LA')),'R184 setup: six pending rebates of 300');
CREATE TEMP TABLE rp_split ON COMMIT DROP AS SELECT "Row ID",to_jsonb(x)-'Ref Rebate Settlement' AS j FROM public."Business Expenses" x WHERE "Row ID" LIKE 'rr1:RP-L%';

-- P1. A partial direct 400 over A (300) and B (300): A in full, B 100 of 300.
SELECT set_config('rs.p1',pg_temp.rs_create2('b1840001-0000-4000-8000-000000000001','c1840001-0000-4000-8000-000000000001','RP-R','referrer',ARRAY['rr1:RP-LA|300|300','rr1:RP-LB|100|300'],(SELECT d FROM rs_day),'RS-LISA-SCB','Bank Transfer','REF-184','partial',NULL),true),
 set_config('rs.p1x',pg_temp.rs_create2('b1840001-0000-4000-8000-000000000001','c1840001-0000-4000-8000-000000000001','RP-R','referrer',ARRAY['rr1:RP-LA|300|300','rr1:RP-LB|99|300'],(SELECT d FROM rs_day),'RS-LISA-SCB','Bank Transfer','REF-184','partial',NULL),true);
SELECT set_config('rs.run','p1',true);
:submit
DO $$
DECLARE day date:=(SELECT d FROM rs_day); sid text:='c1840001-0000-4000-8000-000000000001'; r jsonb:=pg_temp.rs_result('p1');
BEGIN
 PERFORM pg_temp.rs_assert(pg_temp.rs_status('p1')='applied','P1: the partial settlement applies: '||current_setting('rs.out_p1'));
 PERFORM pg_temp.rs_assert((SELECT amount=400 AND offset_payment_id IS NULL AND payment_method='Bank Transfer' AND paid_by_cash_account='RS-LISA-SCB' FROM public.pwa_rebate_settlements WHERE id=sid),'P1: settlement row 400, paid to the referrer');
 PERFORM pg_temp.rs_assert((SELECT count(*)=1 AND sum("Amount")=400 AND bool_and("Ref From Cash Account"='RS-LISA-SCB' AND "Movement Date"=day) FROM public."Cash Ledger" WHERE "Ref Rebate Settlement"=sid),'P1: one ledger row of 400');
 PERFORM pg_temp.rs_assert((SELECT jsonb_object_agg(expense_id,amount) FROM public.pwa_rebate_settlement_allocations WHERE settlement_id=sid)='{"rr1:RP-LA":300,"rr1:RP-LB":100}'::jsonb,'P1: allocations 300 and 100');
 PERFORM pg_temp.rs_assert(public.pwa_rebate_pending_v1('rr1:RP-LA')=0 AND public.pwa_rebate_pending_v1('rr1:RP-LB')=200 AND public.pwa_rebates_owed_v1('RP-R')=800,'P1: pending 0 and 200, owed 800 (Rebates payable falls by 400)');
 PERFORM pg_temp.rs_assert((SELECT bool_and("Ref Rebate Settlement"=sid) FROM public."Business Expenses" WHERE "Row ID" IN ('rr1:RP-LA','rr1:RP-LB')),'P1: both rebates link the settlement');
 PERFORM pg_temp.rs_assert(NOT EXISTS(SELECT 1 FROM rp_split p JOIN public."Business Expenses" x USING ("Row ID") WHERE to_jsonb(x)-'Ref Rebate Settlement' IS DISTINCT FROM p.j),'P1: amount, date and Partner split of every expense unchanged');
 PERFORM pg_temp.rs_assert(NOT EXISTS(SELECT 1 FROM public."Cash Ledger" WHERE "Ref Business Expense" IN ('rr1:RP-LA','rr1:RP-LB')),'P1: no expense cash row');
 PERFORM pg_temp.rs_assert(r=jsonb_build_object('destination','referrer','amount','400','owedAfter','800','offsetPaymentId',NULL,'lines',jsonb_build_array(
  jsonb_build_object('expenseId','rr1:RP-LA','amount','300','pendingAfter','0'),jsonb_build_object('expenseId','rr1:RP-LB','amount','100','pendingAfter','200'))),'P1 (D13): result.rebateSettlement: '||r::text);
END $$;
-- P9. Replay: the recorded outcome; another payload under the same request id: conflict.
SELECT set_config('rs.out_p1_first',current_setting('rs.out_p1'),false),set_config('rs.run','p1,p1x',true);
:submit
SELECT pg_temp.rs_assert(current_setting('rs.out_p1')::jsonb->'originalOutcome'=current_setting('rs.out_p1_first')::jsonb->'originalOutcome' AND current_setting('rs.out_p1x')::jsonb->>'kind'='conflict'
  AND (SELECT count(*)=1 FROM public.pwa_rebate_settlements WHERE payee_borrower_id='RP-R') AND public.pwa_rebates_owed_v1('RP-R')=800,'P9: replay returns the recorded outcome, another payload conflicts, nothing is written twice');

-- P2. A second partial completes B; then the older settlement is deleted: B keeps its link value (S2) and is still recorded
-- as changed in the change log, A returns to pending in full.
SELECT set_config('rs.p2',pg_temp.rs_create2('b1840002-0000-4000-8000-000000000001','c1840002-0000-4000-8000-000000000001','RP-R','referrer',ARRAY['rr1:RP-LB|200|200'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL,NULL),true),set_config('rs.run','p2',true);
:submit
SELECT pg_temp.rs_assert(pg_temp.rs_status('p2')='applied' AND public.pwa_rebate_pending_v1('rr1:RP-LB')=0 AND public.pwa_rebates_owed_v1('RP-R')=600
  AND (SELECT "Ref Rebate Settlement"='c1840002-0000-4000-8000-000000000001' FROM public."Business Expenses" WHERE "Row ID"='rr1:RP-LB')
  AND (SELECT "Ref Rebate Settlement"='c1840001-0000-4000-8000-000000000001' FROM public."Business Expenses" WHERE "Row ID"='rr1:RP-LA')
  AND pg_temp.rs_result('p2')->>'owedAfter'='600','P2: the second partial completes B; B links the newer settlement, A the older: '||current_setting('rs.out_p2'));
SELECT set_config('rs.changes_b',(SELECT count(*)::text FROM public.pwa_row_changes WHERE table_name='Business Expenses' AND row_key='rr1:RP-LB'),false),
 set_config('rs.d1',pg_temp.rs_delete('b1840002-0000-4000-8000-000000000002','c1840001-0000-4000-8000-000000000001',pg_temp.rs_version('c1840001-0000-4000-8000-000000000001')),true),set_config('rs.run','d1',true);
:submit
SELECT pg_temp.rs_assert(pg_temp.rs_status('d1')='applied' AND public.pwa_rebate_pending_v1('rr1:RP-LA')=300 AND public.pwa_rebate_pending_v1('rr1:RP-LB')=100 AND public.pwa_rebates_owed_v1('RP-R')=1000
  AND (SELECT "Ref Rebate Settlement" IS NULL FROM public."Business Expenses" WHERE "Row ID"='rr1:RP-LA')
  AND (SELECT "Ref Rebate Settlement"='c1840002-0000-4000-8000-000000000001' FROM public."Business Expenses" WHERE "Row ID"='rr1:RP-LB')
  AND NOT EXISTS(SELECT 1 FROM public."Cash Ledger" WHERE "Ref Rebate Settlement"='c1840001-0000-4000-8000-000000000001')
  AND (SELECT count(*)=1 AND sum(amount)=200 FROM public.pwa_rebate_settlement_allocations WHERE expense_id='rr1:RP-LB')
  AND current_setting('rs.out_d1')::jsonb#>'{originalOutcome,result}' ? 'rebateSettlement' IS FALSE,'P2: deleting the older settlement: A pending 300 (link null), B pending 100 (link kept): '||current_setting('rs.out_d1'));
SELECT pg_temp.rs_assert((SELECT count(*) FROM public.pwa_row_changes WHERE table_name='Business Expenses' AND row_key='rr1:RP-LB')>current_setting('rs.changes_b')::bigint,'P2: the expense whose link value stays is recorded as changed (the offline delta re-reads it)');
SELECT pg_temp.rs_assert(NOT EXISTS(SELECT 1 FROM rp_split p JOIN public."Business Expenses" x USING ("Row ID") WHERE to_jsonb(x)-'Ref Rebate Settlement' IS DISTINCT FROM p.j),'P2: the expenses and their Partner split are unchanged');

-- P8. The closing payment of a part-paid rebate (B: 200 of 300 paid) is not deleted until its settlement goes.
SELECT set_config('rs.p8',pg_temp.rs_payment_delete('b1840008-0000-4000-8000-000000000001',(SELECT "Ref Closing Payment" FROM public."Loans" WHERE "Row ID"='RP-LB')),true),set_config('rs.run','p8',true);
:submit
SELECT pg_temp.rs_assert(pg_temp.rs_code('p8')='dependency_conflict' AND public.pwa_rebate_pending_v1('rr1:RP-LB')=100,'P8: the closing-payment delete of a part-paid rebate is refused: '||current_setting('rs.out_p8'));
SELECT set_config('rs.d2',pg_temp.rs_delete('b1840008-0000-4000-8000-000000000002','c1840002-0000-4000-8000-000000000001',pg_temp.rs_version('c1840002-0000-4000-8000-000000000001')),true),set_config('rs.run','d2',true);
:submit
SELECT pg_temp.rs_assert(pg_temp.rs_status('d2')='applied' AND public.pwa_rebates_owed_v1('RP-R')=1200 AND NOT EXISTS(SELECT 1 FROM public.pwa_rebate_settlement_allocations a JOIN public.pwa_rebate_settlements s ON s.id=a.settlement_id WHERE s.payee_borrower_id='RP-R')
  AND NOT EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Row ID" LIKE 'rr1:RP-L%' AND "Ref Rebate Settlement" IS NOT NULL),'P8: with every settlement gone all four rebates are pending in full again');

-- P3. Rejections, each its own request, nothing changed. S3 (A 100 of 300) is applied first: its id is the source conflict.
SELECT set_config('rs.p3',pg_temp.rs_create2('b1840003-0000-4000-8000-000000000001','c1840003-0000-4000-8000-000000000001','RP-R','referrer',ARRAY['rr1:RP-LA|100|300'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL,NULL),true),set_config('rs.run','p3',true);
:submit
SELECT pg_temp.rs_assert(pg_temp.rs_status('p3')='applied' AND public.pwa_rebate_pending_v1('rr1:RP-LA')=200 AND public.pwa_rebates_owed_v1('RP-R')=1100,'P3: S3 applies (A 100 of 300)');
SELECT set_config('rs.state',pg_temp.rs_state(),false);
SELECT set_config('rs.n2_target',pg_temp.rs_create2('b1840003-0000-4000-8000-000000000011','c1840003-0000-4000-8000-000000000001','RP-R','referrer',ARRAY['rr1:RP-LB|100|300'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL,NULL),true),
 set_config('rs.n2_referrer',pg_temp.rs_create2('b1840003-0000-4000-8000-000000000012','c1840003-0000-4000-8000-000000000012','RP-NOBODY','referrer',ARRAY['rr1:RP-LB|100|300'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL,NULL),true),
 set_config('rs.n2_payee',pg_temp.rs_create2('b1840003-0000-4000-8000-000000000013','c1840003-0000-4000-8000-000000000013','RP-R','referrer',ARRAY['rr1:RQ-LA|300|300'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL,NULL),true),
 set_config('rs.n2_over',pg_temp.rs_create2('b1840003-0000-4000-8000-000000000014','c1840003-0000-4000-8000-000000000014','RP-R','referrer',ARRAY['rr1:RP-LB|301|300'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL,NULL),true),
 set_config('rs.n2_stale',pg_temp.rs_create2('b1840003-0000-4000-8000-000000000015','c1840003-0000-4000-8000-000000000015','RP-R','referrer',ARRAY['rr1:RP-LA|100|300'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL,NULL),true),
 set_config('rs.n2_unknown',pg_temp.rs_create2('b1840003-0000-4000-8000-000000000016','c1840003-0000-4000-8000-000000000016','RP-R','referrer',ARRAY['rr1:RP-LB|100|300','rr1:RP-NONE|1|1'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL,NULL),true),
 set_config('rs.n2_dad',pg_temp.rs_create2('b1840003-0000-4000-8000-000000000017','c1840003-0000-4000-8000-000000000017','RP-R','referrer',ARRAY['rr1:RP-LB|100|300'],(SELECT d FROM rs_day),'CI-DAD','Cash',NULL,NULL,NULL),true),
 set_config('rs.n2_future',pg_temp.rs_create2('b1840003-0000-4000-8000-000000000018','c1840003-0000-4000-8000-000000000018','RP-R','referrer',ARRAY['rr1:RP-LB|100|300'],(SELECT d FROM rs_day)+1,'CI-LISA','Cash',NULL,NULL,NULL),true),
 set_config('rs.n2_early',pg_temp.rs_create2('b1840003-0000-4000-8000-000000000019','c1840003-0000-4000-8000-000000000019','RP-R','referrer',ARRAY['rr1:RP-LB|100|300'],(SELECT d FROM rs_day)-1,'CI-LISA','Cash',NULL,NULL,NULL),true),
 -- an offset while the referrer has no open loan
 set_config('rs.n2_noloan',pg_temp.rs_create2('b1840003-0000-4000-8000-00000000001a','c1840003-0000-4000-8000-00000000001a','RP-R','offset',ARRAY['rr1:RP-LB|100|300'],(SELECT d FROM rs_day),NULL,NULL,NULL,NULL,repeat('0',64)),true),
 set_config('rs.run','n2_target,n2_referrer,n2_payee,n2_over,n2_stale,n2_unknown,n2_dad,n2_future,n2_early,n2_noloan',true);
:submit
SELECT pg_temp.rs_assert(pg_temp.rs_code(v.k)=v.code,'P3: '||v.k||' is '||v.code||', got '||coalesce(current_setting('rs.out_'||v.k),'null'))
 FROM (VALUES ('n2_target','source_conflict'),('n2_referrer','not_found'),('n2_payee','record_requires_reconciliation'),('n2_over','record_requires_reconciliation'),('n2_stale','record_requires_reconciliation'),
  ('n2_unknown','record_requires_reconciliation'),('n2_dad','account_unavailable'),('n2_future','invalid_date'),('n2_early','invalid_date'),('n2_noloan','plan_changed')) v(k,code);
SELECT pg_temp.rs_assert(public.pwa_rebate_offset_plan_v1('RP-R',NULL,(SELECT d FROM rs_day))='{"available":false,"dueAmount":"0","maxAmount":"0"}'::jsonb,'P3: no open loan, no offset offered');
-- RP-R's own loan: 14 due today, then 5 a day on the 93-day schedule.
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Defaulted")
 VALUES('CI-LISA','RP-RL','RP-R',(SELECT d FROM rs_day)-3,1000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,5::money,1,false);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('RP-RL-old','RP-RL',(SELECT d FROM rs_day),0::money,14::money);
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='RP-RL';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT set_config('rs.state',pg_temp.rs_state(),false),set_config('rs.rp_max',public.pwa_rebate_offset_plan_v1('RP-R',NULL,(SELECT d FROM rs_day))->>'maxAmount',false);
SELECT pg_temp.rs_assert((SELECT p->>'available'='true' AND p->>'dueAmount'='14' AND (p->>'maxAmount')::numeric BETWEEN 400 AND 599
   AND (p->>'maxAmount')::numeric=999999999999-(public.pwa_pay_forward_plan_v1('RP-R',999999999999,(SELECT d FROM rs_day),'{"forward":true,"principal":[],"loans":null}'::jsonb)->>'uncovered')::numeric
  FROM (SELECT public.pwa_rebate_offset_plan_v1('RP-R',NULL,(SELECT d FROM rs_day)) p) q),'P3: with an open loan the offset is offered: 14 due, the Loan Close plan''s capacity as the cap: '||public.pwa_rebate_offset_plan_v1('RP-R',NULL,(SELECT d FROM rs_day))::text);
SELECT set_config('rs.n3_date',pg_temp.rs_create2('b1840003-0000-4000-8000-000000000021','c1840003-0000-4000-8000-000000000021','RP-R','offset',ARRAY['rr1:RP-LB|100|300'],(SELECT d FROM rs_day)-1,NULL,NULL,NULL,NULL,pg_temp.rs_hash('RP-R',100)),true),
 set_config('rs.n3_hash',pg_temp.rs_create2('b1840003-0000-4000-8000-000000000022','c1840003-0000-4000-8000-000000000022','RP-R','offset',ARRAY['rr1:RP-LB|100|300'],(SELECT d FROM rs_day),NULL,NULL,NULL,NULL,repeat('0',64)),true),
 -- more than the plan can take (600 over the cap), with the hash the plan function returns for that amount
 set_config('rs.n3_cover',pg_temp.rs_create2('b1840003-0000-4000-8000-000000000023','c1840003-0000-4000-8000-000000000023','RP-R','offset',ARRAY['rr1:RP-LB|300|300','rr1:RP-LC|300|300'],(SELECT d FROM rs_day),NULL,NULL,NULL,NULL,pg_temp.rs_hash('RP-R',600)),true),
 set_config('rs.n3_stale',pg_temp.rs_create2('b1840003-0000-4000-8000-000000000024','c1840003-0000-4000-8000-000000000024','RP-R','offset',ARRAY['rr1:RP-LA|100|300'],(SELECT d FROM rs_day),NULL,NULL,NULL,NULL,pg_temp.rs_hash('RP-R',100)),true),
 set_config('rs.run','n3_date,n3_hash,n3_cover,n3_stale',true);
:submit
SELECT pg_temp.rs_assert(pg_temp.rs_code(v.k)=v.code,'P3: '||v.k||' is '||v.code||', got '||coalesce(current_setting('rs.out_'||v.k),'null'))
 FROM (VALUES ('n3_date','invalid_date'),('n3_hash','plan_changed'),('n3_cover','plan_changed'),('n3_stale','record_requires_reconciliation')) v(k,code);
-- no default account of Lisa: an offset has nowhere to net
UPDATE public."Cash Accounts" SET "Default Account"=false WHERE "Ref Cash Holder"='ch:lisa' AND "Default Account";
SELECT set_config('rs.n3_default',pg_temp.rs_create2('b1840003-0000-4000-8000-000000000025','c1840003-0000-4000-8000-000000000025','RP-R','offset',ARRAY['rr1:RP-LB|100|300'],(SELECT d FROM rs_day),NULL,NULL,NULL,NULL,pg_temp.rs_hash('RP-R',100)),true),set_config('rs.run','n3_default',true);
:submit
UPDATE public."Cash Accounts" SET "Default Account"=true WHERE "Row ID"='CI-LISA';
SELECT pg_temp.rs_assert(pg_temp.rs_code('n3_default')='account_unavailable','P3: an offset without a default account of Lisa is account_unavailable: '||current_setting('rs.out_n3_default'));
SELECT pg_temp.rs_assert(pg_temp.rs_state()=current_setting('rs.state'),'P3: nothing written by a refusal');
-- Invalid commands (22023): unsorted and duplicate lines, a zero, fractional or missing amount, an extra line key, an offset
-- naming an account or no hash, a payment to the referrer with a hash or without a method, an unknown destination, no lines.
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$
DECLARE day date:=(SELECT d FROM rs_day); good text:=pg_temp.rs_create2('b1840003-0000-4000-8000-000000000031','c1840003-0000-4000-8000-000000000031','RP-R','referrer',ARRAY['rr1:RP-LB|100|300','rr1:RP-LC|100|300'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL,NULL);
 offs text:=pg_temp.rs_create2('b1840003-0000-4000-8000-000000000032','c1840003-0000-4000-8000-000000000032','RP-R','offset',ARRAY['rr1:RP-LB|100|300'],(SELECT d FROM rs_day),NULL,NULL,NULL,NULL,repeat('a',64)); v text; n integer:=0;
BEGIN
 FOREACH v IN ARRAY ARRAY[
  pg_temp.rs_create2('b1840003-0000-4000-8000-000000000031','c1840003-0000-4000-8000-000000000031','RP-R','referrer',ARRAY['rr1:RP-LC|100|300','rr1:RP-LB|100|300'],day,'CI-LISA','Cash',NULL,NULL,NULL),
  pg_temp.rs_create2('b1840003-0000-4000-8000-000000000031','c1840003-0000-4000-8000-000000000031','RP-R','referrer',ARRAY['rr1:RP-LB|100|300','rr1:RP-LB|100|300'],day,'CI-LISA','Cash',NULL,NULL,NULL),
  pg_temp.rs_create2('b1840003-0000-4000-8000-000000000031','c1840003-0000-4000-8000-000000000031','RP-R','referrer',ARRAY[]::text[],day,'CI-LISA','Cash',NULL,NULL,NULL),
  replace(good,'"amount":"100","expectedPending":"300"},{','"amount":"0","expectedPending":"300"},{'),
  replace(good,'"amount":"100","expectedPending":"300"},{','"amount":"1.5","expectedPending":"300"},{'),
  replace(good,'"amount":"100","expectedPending":"300"},{','"amount":100,"expectedPending":"300"},{'),
  replace(good,'"amount":"100","expectedPending":"300"},{','"expectedPending":"300"},{'),
  replace(good,'"expectedPending":"300"},{','"expectedPending":"300","note":"x"},{'),
  replace(good,'"destination":"referrer"','"destination":"loan"'),
  replace(good,'"expectedPlanHash":null','"expectedPlanHash":"'||repeat('a',64)||'"'),
  replace(good,'"paymentMethod":"Cash"','"paymentMethod":null'),
  replace(good,'"cashAccountId":"CI-LISA"','"cashAccountId":null'),
  replace(good,',"expectedPlanHash":null',''),
  replace(offs,'"cashAccountId":null','"cashAccountId":"CI-LISA"'),
  replace(offs,'"paymentMethod":null','"paymentMethod":"Cash"'),
  replace(offs,'"expectedPlanHash":"'||repeat('a',64)||'"','"expectedPlanHash":null'),
  replace(offs,'"expectedPlanHash":"'||repeat('a',64)||'"','"expectedPlanHash":"abc"')] LOOP
  n:=n+1;
  BEGIN PERFORM public.pwa_submit_operation_v2(v); RAISE EXCEPTION 'FAILED: P3: invalid command % was accepted: %',n,v;
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 END LOOP;
END $$;
RESET SESSION AUTHORIZATION;
SELECT pg_temp.rs_assert(pg_temp.rs_state()=current_setting('rs.state'),'P3: nothing written by an invalid command');

-- P4. An offset of 250 to RP-R's loan: A's remaining 200 and 50 of C. The payment follows the plan (14 due, then future
-- charges booked in date order), the plan resolves through the journal, and Lisa nets zero.
SELECT set_config('rs.plan4',public.pwa_rebate_offset_plan_v1('RP-R',250,(SELECT d FROM rs_day))::text,false),set_config('rs.charges4',(SELECT count(*)::text FROM public."Charges" WHERE "Ref Loans"='RP-RL'),false);
SELECT set_config('rs.p4',pg_temp.rs_create2('b1840004-0000-4000-8000-000000000001','c1840004-0000-4000-8000-000000000001','RP-R','offset',ARRAY['rr1:RP-LA|200|200','rr1:RP-LC|50|300'],(SELECT d FROM rs_day),NULL,NULL,NULL,'offset note',current_setting('rs.plan4')::jsonb->>'planHash'),true),set_config('rs.run','p4',true);
:submit
DO $$
DECLARE day date:=(SELECT d FROM rs_day); sid text:='c1840004-0000-4000-8000-000000000001'; pay text:='rs155:c1840004-0000-4000-8000-000000000001'; plan jsonb:=current_setting('rs.plan4')::jsonb; r jsonb:=pg_temp.rs_result('p4'); s public.pwa_rebate_settlements%ROWTYPE;
BEGIN
 PERFORM pg_temp.rs_assert(pg_temp.rs_status('p4')='applied','P4: the offset settlement applies: '||current_setting('rs.out_p4'));
 PERFORM pg_temp.rs_assert(plan->>'covered'='250' AND plan->>'available'='true' AND jsonb_array_length(plan->'lines')>1 AND plan#>>'{lines,0,chargeId}'='RP-RL-old' AND plan#>>'{lines,0,amount}'='14' AND (plan#>>'{lines,0,due}')::boolean
  AND (plan#>>'{lines,1,booked}')::boolean AND plan#>>'{lines,1,loanId}'='RP-RL' AND (SELECT sum((l->>'amount')::numeric)=250 FROM jsonb_array_elements(plan->'lines') l),'P4: the preview plan: 14 due first, then booked future charges, 250 in all: '||plan::text);
 SELECT * INTO s FROM public.pwa_rebate_settlements WHERE id=sid;
 PERFORM pg_temp.rs_assert(s.amount=250 AND s.offset_payment_id=pay AND s.payment_method='Referral Rebate Offset' AND s.paid_by_cash_account='CI-LISA' AND s.bank_reference IS NULL AND s.settlement_date=day AND s.notes='offset note','P4: settlement row 250 with its offset payment');
 PERFORM pg_temp.rs_assert((SELECT "Status"='Posted' AND "Amount Received"::numeric=250 AND "Payment Method"='Referral Rebate Offset' AND "Ref Borrower"='RP-R' AND "Payment Date"=day AND "Ref Received By Cash Account"='CI-LISA' AND "Created By"='rs-actor@example.invalid'
   FROM public."Payments" WHERE "Row ID"=pay),'P4: the offset payment rs155:<settlement> is posted on the referrer');
 PERFORM pg_temp.rs_assert((SELECT jsonb_agg(jsonb_build_object('chargeId',a."Ref Charge",'principal',a."Allocated Principal"::numeric,'interest',a."Allocated Interest"::numeric) ORDER BY a."Ref Charge" COLLATE "C") FROM public."Payment Allocations" a WHERE a."Ref Payment"=pay)
  =(SELECT jsonb_agg(jsonb_build_object('chargeId',l->>'chargeId','principal',(l->>'principal')::numeric,'interest',(l->>'interest')::numeric) ORDER BY (l->>'chargeId') COLLATE "C") FROM jsonb_array_elements(plan->'allocations') l),'P4: the payment is allocated per plan');
 PERFORM pg_temp.rs_assert(public.pwa_effective_payment_plan_v2(pay)#>>'{plan,amountReceived}'='250' AND public.pwa_effective_payment_plan_v2(pay)#>'{plan,allocations}'=plan->'allocations'
  AND (SELECT count(*)=1 FROM public.pwa_payment_commands j WHERE j.result_json->>'paymentId'=pay AND j.canonical_json::jsonb#>>'{command,operation}'='system.rebate-offset' AND j.canonical_json::jsonb#>>'{command,targetId}'=sid),'P4: the plan resolves through the system.rebate-offset journal row');
 PERFORM pg_temp.rs_assert((SELECT count(*)=2 AND sum(CASE WHEN "Ref To Cash Account"='CI-LISA' THEN "Amount" ELSE 0 END)=250 AND sum(CASE WHEN "Ref From Cash Account"='CI-LISA' THEN "Amount" ELSE 0 END)=250 AND bool_and("Movement Date"=day)
   FROM public."Cash Ledger" WHERE "Ref Rebate Settlement"=sid OR "Ref Payment"=pay),'P4 (D7): the settlement out and the offset receipt in, same account, day and amount: Lisa nets zero');
 PERFORM pg_temp.rs_assert(public.pwa_rebate_pending_v1('rr1:RP-LA')=0 AND public.pwa_rebate_pending_v1('rr1:RP-LC')=250 AND public.pwa_rebates_owed_v1('RP-R')=850,'P4: pending 0 and 250, owed 850');
 PERFORM pg_temp.rs_assert((SELECT "Amount Remaining"=0 FROM public."Charges" WHERE "Row ID"='RP-RL-old') AND (SELECT count(*) FROM public."Charges" WHERE "Ref Loans"='RP-RL')=current_setting('rs.charges4')::bigint+jsonb_array_length(plan->'materialize'),'P4: the due charge is paid and the plan''s future charges are booked');
 PERFORM pg_temp.rs_assert(r=jsonb_build_object('destination','offset','amount','250','owedAfter','850','offsetPaymentId',pay,'lines',jsonb_build_array(
  jsonb_build_object('expenseId','rr1:RP-LA','amount','200','pendingAfter','0'),jsonb_build_object('expenseId','rr1:RP-LC','amount','50','pendingAfter','250'))),'P4 (D13): result.rebateSettlement: '||r::text);
 -- D11: offset settlements and direct settlements are told apart by offset_payment_id (the tiles' rule).
 PERFORM pg_temp.rs_assert((SELECT sum(amount) FILTER (WHERE offset_payment_id IS NULL)=100 AND sum(amount) FILTER (WHERE offset_payment_id IS NOT NULL)=250 FROM public.pwa_rebate_settlements WHERE payee_borrower_id='RP-R'),'P4 (D11): paid 100, offset 250');
END $$;
-- The payment is the settlement's: it is not deleted or changed directly (P5B05), and a settlement names one payment.
SELECT set_config('rs.p4_pay',pg_temp.rs_payment_delete('b1840004-0000-4000-8000-000000000002','rs155:c1840004-0000-4000-8000-000000000001'),true),set_config('rs.run','p4_pay',true);
:submit
SELECT pg_temp.rs_assert(pg_temp.rs_code('p4_pay')='dependency_conflict' AND EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"='rs155:c1840004-0000-4000-8000-000000000001'),'P5: a direct delete of the offset payment is refused: '||current_setting('rs.out_p4_pay'));
DO $$ BEGIN
 BEGIN DELETE FROM public."Payments" WHERE "Row ID"='rs155:c1840004-0000-4000-8000-000000000001'; RAISE EXCEPTION 'FAILED: P5: the offset payment was deleted outside its settlement';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAILED%' THEN RAISE; END IF; END;
 BEGIN UPDATE public.pwa_rebate_settlements SET offset_payment_id=NULL WHERE id='c1840004-0000-4000-8000-000000000001'; RAISE EXCEPTION 'FAILED: P5: a settlement row changed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Rebate settlements are immutable%' THEN RAISE; END IF; END;
END $$;
-- The application role reads the allocations and never writes them; the journal owner never updates them.
SELECT pg_temp.rs_assert(has_table_privilege('mw_app_dev_journal_owner','public.pwa_rebate_settlement_allocations','INSERT') AND has_table_privilege('mw_app_dev_journal_owner','public.pwa_rebate_settlement_allocations','DELETE')
  AND NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid='public.pwa_rebate_settlement_allocations'::regclass AND a.privilege_type IN ('UPDATE','TRUNCATE') AND a.grantee<>c.relowner),'P4: allocations are insert and delete only');

-- P5. Deleting the offset settlement removes its payment through the receipt engine: repayments and both cash rows go, the
-- charges are unpaid again, the booked future charges stay (R111 D4), the amounts return to pending.
SELECT set_config('rs.charges5',(SELECT count(*)::text FROM public."Charges" WHERE "Ref Loans"='RP-RL'),false),
 set_config('rs.d4',pg_temp.rs_delete('b1840005-0000-4000-8000-000000000001','c1840004-0000-4000-8000-000000000001',pg_temp.rs_version('c1840004-0000-4000-8000-000000000001')),true),set_config('rs.run','d4',true);
:submit
SELECT pg_temp.rs_assert(pg_temp.rs_status('d4')='applied' AND NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"='rs155:c1840004-0000-4000-8000-000000000001')
  AND NOT EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Payment"='rs155:c1840004-0000-4000-8000-000000000001')
  AND NOT EXISTS(SELECT 1 FROM public."Cash Ledger" WHERE "Ref Payment"='rs155:c1840004-0000-4000-8000-000000000001' OR "Ref Rebate Settlement"='c1840004-0000-4000-8000-000000000001')
  AND (SELECT "Amount Remaining"=14 FROM public."Charges" WHERE "Row ID"='RP-RL-old') AND (SELECT count(*) FROM public."Charges" WHERE "Ref Loans"='RP-RL')=current_setting('rs.charges5')::bigint
  AND public.pwa_rebate_pending_v1('rr1:RP-LA')=200 AND public.pwa_rebate_pending_v1('rr1:RP-LC')=300 AND public.pwa_rebates_owed_v1('RP-R')=1100
  AND (SELECT "Ref Rebate Settlement"='c1840003-0000-4000-8000-000000000001' FROM public."Business Expenses" WHERE "Row ID"='rr1:RP-LA') AND (SELECT "Ref Rebate Settlement" IS NULL FROM public."Business Expenses" WHERE "Row ID"='rr1:RP-LC')
  AND (SELECT "Loan Status"='ยังไม่ปิดยอด' FROM public."Loans" WHERE "Row ID"='RP-RL'),'P5: the offset settlement''s delete: payment, repayments and cash rows gone, charges unpaid, booked charges kept, pending restored: '||current_setting('rs.out_d4'));
-- An offset of exactly what is due (RP-R: the 14 of today), which pays the due charge only; it is deleted again.
SELECT set_config('rs.p5',pg_temp.rs_create2('b1840005-0000-4000-8000-000000000002','c1840005-0000-4000-8000-000000000002','RP-R','offset',ARRAY['rr1:RP-LC|14|300'],(SELECT d FROM rs_day),NULL,NULL,NULL,NULL,pg_temp.rs_hash('RP-R',14)),true),set_config('rs.run','p5',true);
:submit
SELECT pg_temp.rs_assert(pg_temp.rs_status('p5')='applied' AND public.pwa_rebate_pending_v1('rr1:RP-LC')=286 AND (SELECT count(*)=1 AND bool_and("Ref Charges"='RP-RL-old') FROM public."Repayments" WHERE "Ref Payment"='rs155:c1840005-0000-4000-8000-000000000002'),'P5: an offset of exactly what is due pays the due charge only: '||current_setting('rs.out_p5'));
SELECT set_config('rs.d5a',pg_temp.rs_delete('b1840005-0000-4000-8000-000000000003','c1840005-0000-4000-8000-000000000002',pg_temp.rs_version('c1840005-0000-4000-8000-000000000002')),true),set_config('rs.run','d5a',true);
:submit
SELECT pg_temp.rs_assert(pg_temp.rs_status('d5a')='applied' AND public.pwa_rebate_pending_v1('rr1:RP-LC')=300,'P5: and is deleted again');
-- RK-R's loan has 14 due since yesterday. An offset pays it; then the loan is defaulted: the receipt engine refuses to remove
-- the payment, so the settlement's delete is a dependency conflict with nothing changed; once the default is undone it applies.
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Defaulted")
 VALUES('CI-LISA','RK-RL','RK-R',(SELECT d FROM rs_day)-3,1000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,5::money,1,false);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('RK-RL-old','RK-RL',(SELECT d FROM rs_day)-1,0::money,14::money);
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='RK-RL';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT set_config('rs.k1',pg_temp.rs_create2('b1840005-0000-4000-8000-000000000011','c1840005-0000-4000-8000-000000000011','RK-R','offset',ARRAY['rr1:RK-LA|14|300'],(SELECT d FROM rs_day),NULL,NULL,NULL,NULL,pg_temp.rs_hash('RK-R',14)),true),set_config('rs.run','k1',true);
:submit
SELECT pg_temp.rs_assert(pg_temp.rs_status('k1')='applied' AND public.pwa_rebate_pending_v1('rr1:RK-LA')=286,'P5: RK-R''s offset of 14 applies: '||current_setting('rs.out_k1'));
UPDATE public."Loans" SET "Defaulted"=true,"Close Date"=(SELECT d FROM rs_day),"Closed By"='rs-actor@example.invalid' WHERE "Row ID"='RK-RL';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT set_config('rs.state',pg_temp.rs_state(),false),set_config('rs.dk1',pg_temp.rs_delete('b1840005-0000-4000-8000-000000000012','c1840005-0000-4000-8000-000000000011',pg_temp.rs_version('c1840005-0000-4000-8000-000000000011')),true),set_config('rs.run','dk1',true);
:submit
SELECT pg_temp.rs_assert((SELECT "Defaulted" FROM public."Loans" WHERE "Row ID"='RK-RL') AND pg_temp.rs_code('dk1')='dependency_conflict' AND pg_temp.rs_state()=current_setting('rs.state')
  AND public.pwa_rebate_pending_v1('rr1:RK-LA')=286,'P5: after the referrer''s loan is defaulted the offset settlement''s delete is a dependency conflict, nothing changed: '||current_setting('rs.out_dk1'));
SELECT pg_temp.rs_assert(public.pwa_rebate_offset_plan_v1('RK-R',NULL,(SELECT d FROM rs_day))->>'available'='false','P5: a referrer whose only loan is defaulted is offered no offset');
UPDATE public."Loans" SET "Defaulted"=false WHERE "Row ID"='RK-RL';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT set_config('rs.dk2',pg_temp.rs_delete('b1840005-0000-4000-8000-000000000013','c1840005-0000-4000-8000-000000000011',pg_temp.rs_version('c1840005-0000-4000-8000-000000000011')),true),set_config('rs.run','dk2',true);
:submit
SELECT pg_temp.rs_assert(pg_temp.rs_status('dk2')='applied' AND public.pwa_rebate_pending_v1('rr1:RK-LA')=300 AND NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"='rs155:c1840005-0000-4000-8000-000000000011')
  AND (SELECT "Amount Remaining"=14 FROM public."Charges" WHERE "Row ID"='RK-RL-old'),'P5: with the default undone the delete applies: '||current_setting('rs.out_dk2'));

-- P7. The plan's due step is the Loan Close offset's (pwa_pay_forward_plan_v1): it takes every unpaid charge due by the day,
-- including the kept charges of a loan written off with its charges kept (V120: that loan stays open, not Defaulted, at 0
-- principal). The settlement offset and the Loan Close offset therefore agree; this is recorded, not changed, by R184.
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Defaulted")
 VALUES('CI-LISA','RK-RW','RK-R',(SELECT d FROM rs_day)-3,1000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,5::money,1,false);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('RK-RW-old','RK-RW',(SELECT d FROM rs_day)-1,0::money,9::money);
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='RK-RW';
SELECT set_config('business_crud.default_request',jsonb_build_object('loan','RK-RW','op','post','date',(SELECT d FROM rs_day)::text,'amount','1000','keepCharges',true,'actor','rs-actor@example.invalid')::text,true);
UPDATE public."Loans" SET "Default Loss Amount"=1000::money WHERE "Row ID"='RK-RW';
SELECT set_config('business_crud.default_request','',true);
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.rs_assert((SELECT "Loan Status"='ยังไม่ปิดยอด' AND NOT coalesce("Defaulted",false) AND "Outstanding Principal"=0 FROM public."Loans" WHERE "Row ID"='RK-RW')
  AND (SELECT p->>'available'='true' AND p->>'dueAmount'='23' AND p->>'covered'='23' AND EXISTS(SELECT 1 FROM jsonb_array_elements(p->'lines') l WHERE l->>'chargeId'='RK-RW-old' AND l->>'amount'='9' AND (l->>'due')::boolean)
    AND p->>'dueAmount'=public.pwa_pay_forward_plan_v1('RK-R',23,(SELECT d FROM rs_day),'{"forward":true,"principal":[],"loans":null}'::jsonb)->>'dueTotal'
   FROM (SELECT public.pwa_rebate_offset_plan_v1('RK-R',23,(SELECT d FROM rs_day)) p) q),'P7: a kept charge of a written-off open loan is due in the plan, as in the Loan Close offset: '||public.pwa_rebate_offset_plan_v1('RK-R',23,(SELECT d FROM rs_day))::text);

-- P6. RQ-R (referred by RQ-G) has a fixed-due-date loan: 100 principal and 30 interest due today.
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Fixed Interest","Interest Payment Interval","Due Date","Defaulted")
 VALUES('CI-LISA','RQ-RF','RQ-R',(SELECT d FROM rs_day)-3,100::money,'กำหนดวันชำระ','ยังไม่ปิดยอด',false,0::money,30::money,1,(SELECT d FROM rs_day),false);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('RQ-RF-due','RQ-RF',(SELECT d FROM rs_day),100::money,30::money);
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='RQ-RF';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.rs_assert(public.pwa_rebate_offset_plan_v1('RQ-R',NULL,(SELECT d FROM rs_day))='{"available":true,"dueAmount":"130","maxAmount":"130"}'::jsonb,'P6: RQ-R can offset up to the 130 due: '||public.pwa_rebate_offset_plan_v1('RQ-R',NULL,(SELECT d FROM rs_day))::text);
-- An offset of 100 (interest 30, principal 70), then an ordinary payment of the last 30 closes the loan (its rebate of 3 is
-- pending to RQ-G). Deleting the offset settlement afterwards: the engine removes the offset payment, finds the loan underpaid
-- and reopens it (the later payment stays posted); the rebate of that close goes with the reopening.
SELECT set_config('rs.q1',pg_temp.rs_create2('b1840006-0000-4000-8000-000000000001','c1840006-0000-4000-8000-000000000001','RQ-R','offset',ARRAY['rr1:RQ-LA|100|300'],(SELECT d FROM rs_day),NULL,NULL,NULL,NULL,pg_temp.rs_hash('RQ-R',100)),true),set_config('rs.run','q1',true);
:submit
SELECT pg_temp.rs_assert(pg_temp.rs_status('q1')='applied' AND (SELECT "Amount Remaining"=30 FROM public."Charges" WHERE "Row ID"='RQ-RF-due') AND (SELECT "Loan Status"='ยังไม่ปิดยอด' FROM public."Loans" WHERE "Row ID"='RQ-RF'),'P6: the offset of 100 leaves 30 of principal: '||current_setting('rs.out_q1'));
SELECT set_config('rs.pay_q',pg_temp.rs_pay('ab184006-0000-4000-8000-000000000001','RQ-R','RQ-RF-due',30,0,0),true);
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ BEGIN PERFORM set_config('rs.out_pay_q',public.pwa_submit_selected_charges_v1(current_setting('rs.pay_q'))::text,false); END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.rs_assert((SELECT "Loan Status"='ปิดยอดแล้ว' AND "Ref Closing Payment"='pwa:ab184006-0000-4000-8000-000000000001' FROM public."Loans" WHERE "Row ID"='RQ-RF') AND public.pwa_rebate_pending_v1('rr1:RQ-RF')=3 AND public.pwa_rebates_owed_v1('RQ-G')=3,
 'P6: the later payment closes RQ-R''s loan; its rebate of 3 is pending to RQ-G: '||current_setting('rs.out_pay_q'));
SELECT set_config('rs.dq1',pg_temp.rs_delete('b1840006-0000-4000-8000-000000000002','c1840006-0000-4000-8000-000000000001',pg_temp.rs_version('c1840006-0000-4000-8000-000000000001')),true),set_config('rs.run','dq1',true);
:submit
SELECT pg_temp.rs_assert(pg_temp.rs_status('dq1')='applied' AND (SELECT "Loan Status"='ยังไม่ปิดยอด' AND "Ref Closing Payment" IS NULL AND "Close Date" IS NULL FROM public."Loans" WHERE "Row ID"='RQ-RF')
  AND (SELECT "Status"='Posted' FROM public."Payments" WHERE "Row ID"='pwa:ab184006-0000-4000-8000-000000000001') AND (SELECT "Amount Remaining"=100 FROM public."Charges" WHERE "Row ID"='RQ-RF-due')
  AND NOT EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Row ID"='rr1:RQ-RF') AND public.pwa_rebates_owed_v1('RQ-G')=0 AND public.pwa_rebate_pending_v1('rr1:RQ-LA')=300,
 'P6: deleting an offset after a later payment closed the loan reopens the loan (the later payment stays), and the rebate of that close goes: '||current_setting('rs.out_dq1'));
-- An offset of the 100 left closes RQ-R's loan itself; its rebate (3) is pending to RQ-G and is then settled. While that
-- settlement stands, deleting the offset is a dependency conflict; after it goes, the delete reopens the loan.
SELECT set_config('rs.q2',pg_temp.rs_create2('b1840006-0000-4000-8000-000000000003','c1840006-0000-4000-8000-000000000003','RQ-R','offset',ARRAY['rr1:RQ-LA|100|300'],(SELECT d FROM rs_day),NULL,NULL,NULL,NULL,pg_temp.rs_hash('RQ-R',100)),true),set_config('rs.run','q2',true);
:submit
SELECT pg_temp.rs_assert(pg_temp.rs_status('q2')='applied' AND (SELECT "Loan Status"='ปิดยอดแล้ว' AND "Ref Closing Payment"='rs155:c1840006-0000-4000-8000-000000000003' FROM public."Loans" WHERE "Row ID"='RQ-RF')
  AND public.pwa_rebate_pending_v1('rr1:RQ-RF')=3 AND public.pwa_rebate_pending_v1('rr1:RQ-LA')=200,'P6: an offset that pays the loan off closes it; the close''s own rebate is pending to RQ-G: '||current_setting('rs.out_q2'));
SELECT set_config('rs.g1',pg_temp.rs_create2('b1840006-0000-4000-8000-000000000004','c1840006-0000-4000-8000-000000000004','RQ-G','referrer',ARRAY['rr1:RQ-RF|3|3'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL,NULL),true),set_config('rs.run','g1',true);
:submit
SELECT set_config('rs.state',pg_temp.rs_state(),false),set_config('rs.dq2',pg_temp.rs_delete('b1840006-0000-4000-8000-000000000005','c1840006-0000-4000-8000-000000000003',pg_temp.rs_version('c1840006-0000-4000-8000-000000000003')),true),set_config('rs.run','dq2',true);
:submit
SELECT pg_temp.rs_assert(pg_temp.rs_status('g1')='applied' AND pg_temp.rs_code('dq2')='dependency_conflict' AND pg_temp.rs_state()=current_setting('rs.state')
  AND (SELECT "Loan Status"='ปิดยอดแล้ว' FROM public."Loans" WHERE "Row ID"='RQ-RF'),'P6: while the rebate of the close the offset caused is settled, the offset''s delete is a dependency conflict, nothing changed: '||current_setting('rs.out_dq2'));
SELECT set_config('rs.dg1',pg_temp.rs_delete('b1840006-0000-4000-8000-000000000006','c1840006-0000-4000-8000-000000000004',pg_temp.rs_version('c1840006-0000-4000-8000-000000000004')),true),set_config('rs.run','dg1',true);
:submit
SELECT set_config('rs.dq3',pg_temp.rs_delete('b1840006-0000-4000-8000-000000000007','c1840006-0000-4000-8000-000000000003',pg_temp.rs_version('c1840006-0000-4000-8000-000000000003')),true),set_config('rs.run','dq3',true);
:submit
SELECT pg_temp.rs_assert(pg_temp.rs_status('dg1')='applied' AND pg_temp.rs_status('dq3')='applied' AND (SELECT "Loan Status"='ยังไม่ปิดยอด' AND "Ref Closing Payment" IS NULL FROM public."Loans" WHERE "Row ID"='RQ-RF')
  AND NOT EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Row ID"='rr1:RQ-RF') AND NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID" LIKE 'rs155:c1840006%') AND public.pwa_rebate_pending_v1('rr1:RQ-LA')=300,
 'P6: with that settlement gone, deleting the offset reopens the referrer''s loan: '||current_setting('rs.out_dq3'));

-- P10. Push content v5 after a partial (unpatched: it reads the pending rules): A's close shows what is still pending and owed.
SELECT set_config('rs.p10',pg_temp.rs_create2('b1840010-0000-4000-8000-000000000001','c1840010-0000-4000-8000-000000000001','RP-R','referrer',ARRAY['rr1:RP-LA|50|200','rr1:RP-LD|300|300'],(SELECT d FROM rs_day),'CI-LISA','Cash',NULL,NULL,NULL),true),set_config('rs.run','p10',true);
:submit
SELECT pg_temp.rs_notice('pa','payment.posted','payment',(SELECT "Ref Closing Payment" FROM public."Loans" WHERE "Row ID"='RP-LA'));
SET SESSION AUTHORIZATION rs_content_dispatch;
INSERT INTO rs_push SELECT 'r184',k.name,NULL,(SELECT x.rebates FROM public.pwa_notify_content_v5(k.delivery,k.generation) x) FROM rs_notice k WHERE k.name='pa';
RESET SESSION AUTHORIZATION;
SELECT pg_temp.rs_assert(pg_temp.rs_status('p10')='applied' AND public.pwa_rebates_owed_v1('RP-R')=750
  AND (SELECT (v5->0->>'pending')::numeric=150 AND (v5->0->>'owed')::numeric=750 AND (v5->0->>'amount')::numeric=300 AND v5->0->>'ruleVersion'='REFERRAL_REBATE_V3' FROM rs_push WHERE step='r184' AND name='pa'),
 'P10: push v5 after a partial: pending 150, owed 750: '||(SELECT v5::text FROM rs_push WHERE step='r184' AND name='pa'));
-- End invariants over every rebate and settlement of the file.
SELECT pg_temp.rs_assert(NOT EXISTS(SELECT 1 FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment"
   WHERE x."Source Type"='Referral Rebate' AND x."Rule Version"='REFERRAL_REBATE_V3'
    AND x."Amount"::numeric IS DISTINCT FROM coalesce(o."Amount Received"::numeric,0)+coalesce((SELECT sum(a.amount) FROM public.pwa_rebate_settlement_allocations a WHERE a.expense_id=x."Row ID"),0)+public.pwa_rebate_pending_v1(x."Row ID")),
 'invariant: Amount = close-time offset + allocations + pending, for every rebate');
SELECT pg_temp.rs_assert(NOT EXISTS(SELECT 1 FROM public.pwa_rebate_settlements s WHERE s.amount IS DISTINCT FROM (SELECT sum(a.amount) FROM public.pwa_rebate_settlement_allocations a WHERE a.settlement_id=s.id))
  AND NOT EXISTS(SELECT 1 FROM public."Business Expenses" x WHERE x."Ref Rebate Settlement" IS DISTINCT FROM (SELECT a.settlement_id FROM public.pwa_rebate_settlement_allocations a JOIN public.pwa_rebate_settlements s ON s.id=a.settlement_id
    WHERE a.expense_id=x."Row ID" ORDER BY s.created_at DESC,s.id COLLATE "C" DESC LIMIT 1)),'invariant: every settlement is the sum of its allocations; every link is the rebate''s newest settlement, null without one');
SELECT pg_temp.rs_assert((SELECT coalesce(sum("Amount"),0) FROM public."Cash Ledger" WHERE "Source Type"='Rebate Settlement')
  -(SELECT coalesce(sum(p."Amount Received"::numeric),0) FROM public."Payments" p WHERE p."Row ID" IN (SELECT offset_payment_id FROM public.pwa_rebate_settlements))
  =(SELECT coalesce(sum(amount),0) FROM public.pwa_rebate_settlements WHERE offset_payment_id IS NULL)
  AND (SELECT count(*) FROM public."Payments" WHERE "Row ID" LIKE 'rs155:%')=(SELECT count(*) FROM public.pwa_rebate_settlements WHERE offset_payment_id IS NOT NULL),'invariant: Lisa''s net cash out for settlements is the direct settlements; every offset payment belongs to a settlement');
-- R184-END
SELECT 'Rebate settlement regression passed' AS result;
ROLLBACK;
