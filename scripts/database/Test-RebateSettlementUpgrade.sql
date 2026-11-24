-- R184 V155 upgrade from V154 (run by Test-CI's pre-target route after Test-RebateSettlement-Before.sql; disposable cluster only;
-- synthetic rows; everything here rolls back). Design D3: the migration only inserts one allocation per already-linked expense
-- (amount = Amount less its close-time offset); settlement rows, expenses and the Cash Ledger are untouched, every pending
-- amount and owed total is unchanged, and each settlement's delete version changes once (the hash covers the new column).
-- Then the legacy settlements are deleted with the new version and a rebate is settled in part.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'Disposable loopback database required'; END IF;
 IF to_regclass('rs_before.settlements') IS NULL THEN RAISE EXCEPTION 'Run Test-RebateSettlement-Before.sql at V154 first (the pre-target route)'; END IF;
END $$;
CREATE FUNCTION pg_temp.up_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END $$;
SELECT pg_temp.up_assert((SELECT jsonb_object_agg(settlement_id||'>'||expense_id,amount) FROM public.pwa_rebate_settlement_allocations)
  ='{"c1540000-0000-4000-8000-000000000001>rr1:UP-LA":300,"c1540000-0000-4000-8000-000000000002>rr1:UP-LB":100}'::jsonb,'D3: one allocation per linked expense: 300 (whole) and 100 (after the close-time offset of 200)');
SELECT pg_temp.up_assert(NOT EXISTS(SELECT 1 FROM rs_before.settlements b FULL JOIN public.pwa_rebate_settlements s ON s.id=b.id WHERE b.id IS NULL OR s.id IS NULL OR to_jsonb(s)-'offset_payment_id' IS DISTINCT FROM b.j OR s.offset_payment_id IS NOT NULL),
 'D3: settlement rows unchanged; the new column is null');
SELECT pg_temp.up_assert(NOT EXISTS(SELECT 1 FROM rs_before.rebates b FULL JOIN (SELECT * FROM public."Business Expenses" WHERE "Source Type"='Referral Rebate') x ON x."Row ID"=b.id
  WHERE b.id IS NULL OR x."Row ID" IS NULL OR to_jsonb(x) IS DISTINCT FROM b.j OR public.pwa_rebate_pending_v1(x."Row ID") IS DISTINCT FROM b.pending),'D3: every rebate expense and its pending amount unchanged');
SELECT pg_temp.up_assert(NOT EXISTS(SELECT 1 FROM rs_before.owed b WHERE public.pwa_rebates_owed_v1(b.id) IS DISTINCT FROM b.owed) AND public.pwa_rebates_owed_v1('UP-R')=300,'D3: every owed total unchanged (UP-R 300)');
SELECT pg_temp.up_assert((SELECT count(*)||':'||md5(coalesce(string_agg(to_jsonb(c)::text,'|' ORDER BY c."Row ID" COLLATE "C"),'')) FROM public."Cash Ledger" c)=(SELECT n||':'||digest FROM rs_before.ledger),'D3: the Cash Ledger is untouched');
SELECT pg_temp.up_assert(NOT EXISTS(SELECT 1 FROM rs_before.settlements b WHERE public.pwa_rebate_settlement_version_v1(b.id)=b.version OR public.pwa_rebate_settlement_version_v1(b.id)!~'^[a-f0-9]{64}$'),'each settlement''s delete version changed once');
-- The legacy settlement of A is deleted with its new version (the old one is stale); a new-shape partial then pays C in part.
CREATE FUNCTION pg_temp.up_actor() RETURNS text LANGUAGE sql AS $f$ SELECT '{"issuer":"https://up.invalid","subject":"up-owner","partnerId":"UP-ACT","loginEmail":"up-actor@example.invalid"}' $f$;
CREATE FUNCTION pg_temp.up_delete(request text,target text,version text) RETURNS text LANGUAGE sql AS $f$
 SELECT '{"contractVersion":2,"requestId":'||to_json(request)::text||',"actor":'||pg_temp.up_actor()||',"command":{"schemaVersion":1,"operation":"rebate-settlement.delete","targetType":"rebate-settlement","targetId":'
  ||to_json(target)::text||',"expectedVersion":'||to_json(version)::text||',"predecessorRequestId":null,"inputs":{}},"receipt":null}' $f$;
CREATE TEMP TABLE up_cmd(name text PRIMARY KEY,canonical text) ON COMMIT DROP; CREATE TEMP TABLE up_out(name text PRIMARY KEY,outcome jsonb) ON COMMIT DROP; GRANT SELECT ON up_cmd TO PUBLIC; GRANT INSERT,SELECT ON up_out TO PUBLIC;
REVOKE INSERT,UPDATE,DELETE ON public.pwa_rebate_settlement_allocations FROM mw_app_dev;
INSERT INTO up_cmd VALUES('1_stale',pg_temp.up_delete('b1550000-0000-4000-8000-000000000001','c1540000-0000-4000-8000-000000000001',(SELECT version FROM rs_before.settlements WHERE id='c1540000-0000-4000-8000-000000000001'))),
 ('2_delete',pg_temp.up_delete('b1550000-0000-4000-8000-000000000002','c1540000-0000-4000-8000-000000000001',public.pwa_rebate_settlement_version_v1('c1540000-0000-4000-8000-000000000001'))),
 ('3_partial','{"contractVersion":2,"requestId":"b1550000-0000-4000-8000-000000000003","actor":'||pg_temp.up_actor()||',"command":{"schemaVersion":1,"operation":"rebate-settlement.create","targetType":"rebate-settlement","targetId":"c1550000-0000-4000-8000-000000000003","expectedVersion":null,"predecessorRequestId":null,"inputs":{"referrerId":"UP-R","destination":"referrer","allocations":[{"expenseId":"rr1:UP-LC","amount":"120","expectedPending":"300"}],"settlementDate":'
   ||to_json(to_char((SELECT d FROM rs_before.day),'YYYY-MM-DD'))::text||',"cashAccountId":"CI-LISA","paymentMethod":"Cash","bankReference":null,"notes":null,"expectedPlanHash":null}},"receipt":null}'),
 ('4_delete_b',pg_temp.up_delete('b1550000-0000-4000-8000-000000000004','c1540000-0000-4000-8000-000000000002',public.pwa_rebate_settlement_version_v1('c1540000-0000-4000-8000-000000000002')));
SET SESSION AUTHORIZATION "mw-credit-app-command-dev@clever-oasis-508610-n7.iam";
DO $$ DECLARE k record; BEGIN FOR k IN SELECT * FROM up_cmd ORDER BY name LOOP INSERT INTO up_out VALUES(k.name,public.pwa_submit_operation_v2(k.canonical)); END LOOP; END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.up_assert((SELECT outcome#>>'{originalOutcome,code}'='source_conflict' FROM up_out WHERE name='1_stale') AND (SELECT bool_and(outcome#>>'{originalOutcome,status}'='applied') FROM up_out WHERE name<>'1_stale'),
 'the version read before V155 is stale; the legacy settlements delete with the new one and a partial applies: '||(SELECT jsonb_agg(to_jsonb(o) ORDER BY o.name)::text FROM up_out o));
SELECT pg_temp.up_assert(public.pwa_rebate_pending_v1('rr1:UP-LA')=300 AND public.pwa_rebate_pending_v1('rr1:UP-LB')=100 AND public.pwa_rebate_pending_v1('rr1:UP-LC')=180 AND public.pwa_rebates_owed_v1('UP-R')=580
  AND (SELECT count(*)=1 AND bool_and(id='c1550000-0000-4000-8000-000000000003' AND amount=120) FROM public.pwa_rebate_settlements)
  AND (SELECT count(*)=1 AND sum("Amount")=120 FROM public."Cash Ledger" WHERE "Source Type"='Rebate Settlement')
  AND (SELECT count(*)=1 AND sum("Amount")=200 FROM public."Cash Ledger" WHERE "Ref Business Expense"='rr1:UP-LB')
  AND NOT EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Row ID" IN ('rr1:UP-LA','rr1:UP-LB') AND "Ref Rebate Settlement" IS NOT NULL),
 'after the deletes A is pending 300 and B 100 (its close-time offset stays), C is part paid (180 pending), owed 580');
SELECT 'Rebate settlement upgrade (V154 to V155) passed' AS result;
ROLLBACK;
