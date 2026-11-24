\set ON_ERROR_STOP on
-- R184 V155 upgrade route, state at V154 (run by Test-CI's pre-target route; disposable cluster only; synthetic rows, committed):
-- referrer UP-R with three rebates of 300: A settled whole (U1), B settled after a close-time offset of 200 (U2, 100) and C
-- pending. Test-RebateSettlementUpgrade.sql asserts after V155 that the backfill wrote one allocation per linked expense and
-- changed no settlement, no cash row, no pending amount and no owed total (design D3), then deletes the legacy settlements.
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'Disposable loopback database required'; END IF;
 IF to_regclass('public.pwa_rebate_settlement_allocations') IS NOT NULL THEN RAISE EXCEPTION 'The upgrade fixture belongs to a database before V155'; END IF;
END $$;
\ir Test-CashAccountFixtures.sql
CREATE SCHEMA rs_before;
CREATE TABLE rs_before.day AS SELECT (transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AS d;
UPDATE public."Cash Accounts" SET "Default Account"=true WHERE "Row ID"='CI-LISA' AND NOT EXISTS(SELECT 1 FROM public."Cash Accounts" WHERE "Ref Cash Holder"='ch:lisa' AND "Default Account" AND "Row ID"<>'CI-LISA');
INSERT INTO public."Partners"("Row ID","Partner Role") VALUES('UP-FUND','A');
INSERT INTO public."Partners"("Row ID","Partner Name","Partner Role","Login Email","Language Preference") VALUES('UP-ACT','Synthetic upgrade actor','A','up-actor@example.invalid','English');
INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('UP-CAP','UP-FUND',(SELECT d FROM rs_before.day)-400,'Contribution',1000000::money);
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Description") VALUES('UP-R','SYNTHETIC UPGRADE REFERRER','Up');
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Ref Referrer") VALUES('UP-A','SYNTHETIC UPGRADE A','UP-R'),('UP-B','SYNTHETIC UPGRADE B','UP-R'),('UP-C','SYNTHETIC UPGRADE C','UP-R');
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Defaulted")
 SELECT 'CI-LISA',v.id,v.b,(SELECT d FROM rs_before.day)-3,1000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,100::money,1,false FROM (VALUES ('UP-LA','UP-A'),('UP-LB','UP-B'),('UP-LC','UP-C')) v(id,b);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") SELECT v.id||'-today',v.id,(SELECT d FROM rs_before.day),0::money,3000::money FROM (VALUES ('UP-LA'),('UP-LB'),('UP-LC')) v(id);
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" IN ('UP-LA','UP-LB','UP-LC');
CREATE FUNCTION pg_temp.up_actor() RETURNS text LANGUAGE sql AS $f$ SELECT '{"issuer":"https://up.invalid","subject":"up-owner","partnerId":"UP-ACT","loginEmail":"up-actor@example.invalid"}' $f$;
CREATE FUNCTION pg_temp.up_close(request text,loan text,path text) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"contractVersion":2,"requestId":'||to_json(request)::text||',"actor":'||pg_temp.up_actor()||',"command":{"schemaVersion":1,"operation":"loan.close","targetType":"loan","targetId":'
  ||to_json(loan)::text||',"expectedVersion":'||to_json(public.pwa_loan_version_v2(loan))::text||',"predecessorRequestId":null,"inputs":{"paymentDate":'||to_json(to_char((SELECT d FROM rs_before.day),'YYYY-MM-DD'))::text
  ||',"cashAccountId":"CI-DAD","paymentMethod":"Cash","notes":null,"expectedAmount":'||to_json(public.loan_close_calculation_v83(loan,(SELECT d FROM rs_before.day))->>'amount')::text
  ||',"expectedPlanHash":'||to_json(public.loan_close_calculation_v83(loan,(SELECT d FROM rs_before.day))->>'planHash')::text||',"rebatePath":'||to_json(path)::text||'}},"receipt":null}' $f$;
-- The V137 seven-key create.
CREATE FUNCTION pg_temp.up_create(request text,target text,ids text[]) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"contractVersion":2,"requestId":'||to_json(request)::text||',"actor":'||pg_temp.up_actor()||',"command":{"schemaVersion":1,"operation":"rebate-settlement.create","targetType":"rebate-settlement","targetId":'
  ||to_json(target)::text||',"expectedVersion":null,"predecessorRequestId":null,"inputs":{"referrerId":"UP-R","expenseIds":['||(SELECT string_agg(to_json(x)::text,',' ORDER BY o) FROM unnest(ids) WITH ORDINALITY u(x,o))
  ||'],"settlementDate":'||to_json(to_char((SELECT d FROM rs_before.day),'YYYY-MM-DD'))::text||',"cashAccountId":"CI-LISA","paymentMethod":"Cash","bankReference":null,"notes":null}},"receipt":null}' $f$;
CREATE TABLE rs_before.outcomes(name text PRIMARY KEY,outcome jsonb);
GRANT USAGE ON SCHEMA rs_before TO PUBLIC; GRANT SELECT ON rs_before.day TO PUBLIC; GRANT INSERT,SELECT ON rs_before.outcomes TO PUBLIC;
-- Operator grants (Test-RebateSettlement.sql), kept: the cluster is disposable.
GRANT USAGE ON SCHEMA public TO mw_app_dev; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mw_app_dev; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO mw_app_dev;
REVOKE INSERT,UPDATE,DELETE ON "Cash Ledger",pwa_payment_commands,r005_cash_cutover_sources,r008_cash_account_cutover,pwa_row_changes,pwa_rebate_settlements FROM mw_app_dev;
REVOKE USAGE,UPDATE ON SEQUENCE pwa_row_changes_seq_seq FROM mw_app_dev;
GRANT EXECUTE ON FUNCTION public.pwa_submit_operation_v2(text) TO mw_app_dev;
-- A and C close while UP-R has no loan (pending 300 each); then UP-R gets a loan that takes 200 and B closes with the offset.
CREATE TEMP TABLE up_cmd(name text PRIMARY KEY,canonical text); GRANT SELECT ON up_cmd TO PUBLIC;
INSERT INTO up_cmd VALUES('close_a',pg_temp.up_close('a1540000-0000-4000-8000-000000000001','UP-LA','expense')),('close_c',pg_temp.up_close('a1540000-0000-4000-8000-000000000003','UP-LC','expense'));
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
INSERT INTO rs_before.outcomes SELECT name,public.pwa_submit_operation_v2(canonical) FROM up_cmd WHERE name IN ('close_a','close_c');
RESET SESSION AUTHORIZATION;
INSERT INTO public."Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Defaulted")
 VALUES('CI-LISA','UP-RL','UP-R',(SELECT d FROM rs_before.day)-3,1000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,2::money,1,false);
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('UP-RL-today','UP-RL',(SELECT d FROM rs_before.day),0::money,14::money);
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='UP-RL';
INSERT INTO up_cmd VALUES('close_b',pg_temp.up_close('a1540000-0000-4000-8000-000000000002','UP-LB','offset'));
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
INSERT INTO rs_before.outcomes SELECT name,public.pwa_submit_operation_v2(canonical) FROM up_cmd WHERE name='close_b';
RESET SESSION AUTHORIZATION;
INSERT INTO up_cmd VALUES('u1',pg_temp.up_create('b1540000-0000-4000-8000-000000000001','c1540000-0000-4000-8000-000000000001',ARRAY['rr1:UP-LA'])),
 ('u2',pg_temp.up_create('b1540000-0000-4000-8000-000000000002','c1540000-0000-4000-8000-000000000002',ARRAY['rr1:UP-LB']));
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
INSERT INTO rs_before.outcomes SELECT name,public.pwa_submit_operation_v2(canonical) FROM up_cmd WHERE name IN ('u1','u2') ORDER BY name;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM rs_before.outcomes WHERE outcome#>>'{originalOutcome,status}' IS DISTINCT FROM 'applied') OR (SELECT count(*) FROM rs_before.outcomes)<>5
  OR (SELECT jsonb_object_agg(id,amount) FROM public.pwa_rebate_settlements) IS DISTINCT FROM '{"c1540000-0000-4000-8000-000000000001":300,"c1540000-0000-4000-8000-000000000002":100}'::jsonb
  OR public.pwa_rebates_owed_v1('UP-R')<>300 OR (SELECT "Amount Received"::numeric FROM public."Payments" p JOIN public."Business Expenses" x ON x."Ref Offset Payment"=p."Row ID" WHERE x."Row ID"='rr1:UP-LB')<>200 THEN
  RAISE EXCEPTION 'Rebate settlement upgrade fixture differs: %',(SELECT jsonb_agg(to_jsonb(o)) FROM rs_before.outcomes o);
 END IF;
END $$;
-- The state V155 must keep.
CREATE TABLE rs_before.settlements AS SELECT s.id,to_jsonb(s) AS j,public.pwa_rebate_settlement_version_v1(s.id) AS version FROM public.pwa_rebate_settlements s;
CREATE TABLE rs_before.rebates AS SELECT x."Row ID" AS id,to_jsonb(x) AS j,public.pwa_rebate_pending_v1(x."Row ID") AS pending FROM public."Business Expenses" x WHERE x."Source Type"='Referral Rebate';
CREATE TABLE rs_before.owed AS SELECT b."Row ID" AS id,public.pwa_rebates_owed_v1(b."Row ID") AS owed FROM public."Borrowers" b;
CREATE TABLE rs_before.ledger AS SELECT count(*) AS n,md5(coalesce(string_agg(to_jsonb(c)::text,'|' ORDER BY c."Row ID" COLLATE "C"),'')) AS digest FROM public."Cash Ledger" c;
