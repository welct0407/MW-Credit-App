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
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover,pwa_row_changes,pwa_rebate_settlements FROM mw_app_dev;
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
  'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy','rs-actor@example.invalid'),'3: the journalled result has the standard shape, no amount');
 SELECT * INTO s FROM public.pwa_rebate_settlements WHERE id='c1111111-1111-4111-8111-111111111111';
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
SELECT 'Rebate settlement regression passed' AS result;
ROLLBACK;
