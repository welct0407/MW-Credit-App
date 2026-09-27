\set ON_ERROR_STOP on
-- Run ONLY via Test-Migrations.ps1 on its disposable loopback cluster.
CREATE DATABASE loan_manager_dev TEMPLATE postgres;
\connect loan_manager_dev
BEGIN;
CREATE ROLE mw_receipt_projector LOGIN;
CREATE ROLE receipt_test_client LOGIN;
GRANT USAGE ON SCHEMA public TO mw_receipt_projector,receipt_test_client;
GRANT EXECUTE ON FUNCTION public.attach_payment_receipt_evidence(text,text,text,timestamptz,jsonb,uuid,text) TO mw_receipt_projector;
GRANT SELECT,UPDATE ON public."Payments" TO receipt_test_client;
INSERT INTO "Partners"("Row ID","Partner Name","Partner Role","Login Email") VALUES('R046-partner','Synthetic R046','A','r046@example.invalid');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('R046-capital','R046-partner',current_date,'Contribution',10000::money);
INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES
 ('R046-dad','ch:dad','Synthetic R046 Dad','Synthetic'),('R046-lisa','ch:lisa','Synthetic R046 Lisa','Synthetic');
INSERT INTO "Borrowers"("Row ID","Borrower Name","Description") VALUES('R046-borrower','Synthetic R046','Synthetic R046');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Ref Disbursed From Cash Account")
 VALUES('R046-loan','R046-borrower',current_date-1,1000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money,'R046-lisa');
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('R046-charge','R046-loan',current_date,0::money,100::money);
INSERT INTO "Payments"("Row ID","Status","Ref Borrower","Amount Received","Payment Date","Created At","Allocation Method","Ref Target Charge","Ref Received By Cash Account","Bank Reference","Uploaded Receipt")
 VALUES('R046-payment','Processing','R046-borrower',25::money,current_date,current_date+time '18:23:12','Single Partial','R046-charge','R046-dad','SYNTHETIC-046','manual/dev/synthetic.png');
CREATE TEMP TABLE before_receipt AS SELECT to_jsonb(p) p,
 (SELECT jsonb_agg(to_jsonb(r) ORDER BY r."Row ID") FROM "Repayments" r) repayments,
 (SELECT jsonb_agg(to_jsonb(l) ORDER BY l."Row ID") FROM "Cash Ledger" l) ledger,
 (SELECT jsonb_agg(to_jsonb(a) ORDER BY a."Row ID") FROM "Payment Allocations" a) allocations FROM "Payments" p WHERE "Row ID"='R046-payment';
SELECT jsonb_build_object('borrower','R046-borrower','amount','25','date',current_date,'clock',current_date||' 18:23','reference','SYNTHETIC-046','account','R046-dad')::text facts,
 repeat('a',64) receipt,'receipts/dev/2026/09/27/'||repeat('a',64)||'/'||repeat('b',64)||'.png' object_key \gset
SET SESSION AUTHORIZATION mw_receipt_projector;
SELECT public.attach_payment_receipt_evidence('R046-payment',:'receipt',:'object_key','2026-09-26 18:00Z',:'facts','04600000-0000-0000-0000-000000000001','synthetic-test');
SELECT public.attach_payment_receipt_evidence('R046-payment',:'receipt',:'object_key','2026-09-26 18:00Z',:'facts','04600000-0000-0000-0000-000000000001','synthetic-test');
DO $$ BEGIN
 BEGIN UPDATE public."Payments" SET "Notes"='forbidden' WHERE "Row ID"='R046-payment'; RAISE EXCEPTION 'Test failed: direct DML allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.attach_payment_receipt_evidence('R046-payment',repeat('a',64),'https://public.invalid/image.png',now(),'{}',gen_random_uuid(),'test'); RAISE EXCEPTION 'Test failed: URL accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Invalid receipt object key%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.attach_payment_receipt_evidence('R046-payment',repeat('b',64),'receipts/dev/2026/09/27/'||repeat('b',64)||'/'||repeat('c',64)||'.png',now(),'{}',gen_random_uuid(),'test'); RAISE EXCEPTION 'Test failed: empty facts accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Receipt payment verification conflict%' THEN RAISE; END IF; END;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 ASSERT (SELECT "Receipt Received At"=timestamp '2026-09-27 01:00' FROM "Payments" WHERE "Row ID"='R046-payment'),'Bangkok midnight conversion';
 ASSERT (SELECT to_jsonb(p)-ARRAY['IG Receipt ID','Receipt Image','Receipt Received At']=b.p-ARRAY['IG Receipt ID','Receipt Image','Receipt Received At'] FROM "Payments" p CROSS JOIN before_receipt b WHERE p."Row ID"='R046-payment'),'business values unchanged';
 ASSERT (SELECT "Receipt Image" LIKE '//receipts/dev/%' FROM "Payments" WHERE "Row ID"='R046-payment'),'AppSheet bucket-root reference';
 ASSERT (SELECT repayments=(SELECT jsonb_agg(to_jsonb(r) ORDER BY r."Row ID") FROM "Repayments" r) AND ledger=(SELECT jsonb_agg(to_jsonb(l) ORDER BY l."Row ID") FROM "Cash Ledger" l) AND allocations=(SELECT jsonb_agg(to_jsonb(a) ORDER BY a."Row ID") FROM "Payment Allocations" a) FROM before_receipt),'related financial rows unchanged';
 ASSERT (SELECT count(*)=1 FROM agent_audit.commits WHERE operation_id='04600000-0000-0000-0000-000000000001'),'idempotent single audit';
END $$;
SET SESSION AUTHORIZATION receipt_test_client;
DO $$ BEGIN
 BEGIN UPDATE public."Payments" SET "Receipt Image"=NULL WHERE "Row ID"='R046-payment'; RAISE EXCEPTION 'Test failed: client cleared evidence';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Receipt evidence is service-owned%' THEN RAISE; END IF; END;
END $$;
RESET SESSION AUTHORIZATION;
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
SELECT 'R046 receipt attachment checks passed; fixtures rolled back' result;
\connect postgres
