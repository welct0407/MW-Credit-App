\set ON_ERROR_STOP on
BEGIN;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.assert(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',msg; END IF; END $$;
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES ('RU-B','SYNTHETIC UPLOAD');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES ('RU-P','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 VALUES ('RU-C','RU-P',current_date,'Contribution',10000::money);
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled")
 VALUES ('CI-LISA','RU-L','RU-B',current_date-2,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 VALUES ('RU-CH','RU-L',current_date,100::money,0::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Uploaded Receipt","Uploaded Receipt At")
 VALUES ('RU-PAY','RU-B','CI-DAD','Processing',25::money,current_date,'Single Partial','RU-CH','manual/dev/one.png','2000-01-01');
SELECT pg_temp.assert("Status"='Posted' AND "Uploaded Receipt"='manual/dev/one.png'
 AND "Uploaded Receipt At">'2026-01-01', 'upload on create and server timestamp') FROM "Payments" WHERE "Row ID"='RU-PAY';
CREATE TEMP TABLE receipt_upload_before AS SELECT to_jsonb(p)-'Uploaded Receipt'-'Uploaded Receipt At' AS value FROM "Payments" p WHERE "Row ID"='RU-PAY';
CREATE TEMP TABLE receipt_upload_children AS SELECT 'repayments' kind,to_jsonb(r) value FROM "Repayments" r WHERE "Ref Payment"='RU-PAY'
 UNION ALL SELECT 'allocations',to_jsonb(a) FROM "Payment Allocations" a WHERE "Ref Payment"='RU-PAY'
 UNION ALL SELECT 'ledger',to_jsonb(l) FROM "Cash Ledger" l WHERE "Ref Payment"='RU-PAY';
UPDATE "Payments" SET "Uploaded Receipt"='manual/dev/two.png' WHERE "Row ID"='RU-PAY';
CREATE TEMP TABLE receipt_upload_stamp AS SELECT "Uploaded Receipt At" stamp FROM "Payments" WHERE "Row ID"='RU-PAY';
UPDATE "Payments" SET "Uploaded Receipt At"='2000-01-01' WHERE "Row ID"='RU-PAY';
SELECT pg_temp.assert("Uploaded Receipt At"=(SELECT stamp FROM receipt_upload_stamp),'unchanged image cannot rewrite timestamp') FROM "Payments" WHERE "Row ID"='RU-PAY';
UPDATE "Payments" SET "Uploaded Receipt"='' WHERE "Row ID"='RU-PAY';
SELECT pg_temp.assert("Uploaded Receipt" IS NULL AND "Uploaded Receipt At" IS NULL,'clear upload clears metadata') FROM "Payments" WHERE "Row ID"='RU-PAY';
SELECT pg_temp.assert(to_jsonb(p)-'Uploaded Receipt'-'Uploaded Receipt At'=(SELECT value FROM receipt_upload_before),'posted financial fields unchanged') FROM "Payments" p WHERE "Row ID"='RU-PAY';
WITH after_rows AS (
 SELECT 'repayments' kind,to_jsonb(r) value FROM "Repayments" r WHERE "Ref Payment"='RU-PAY'
 UNION ALL SELECT 'allocations',to_jsonb(a) FROM "Payment Allocations" a WHERE "Ref Payment"='RU-PAY'
 UNION ALL SELECT 'ledger',to_jsonb(l) FROM "Cash Ledger" l WHERE "Ref Payment"='RU-PAY')
SELECT pg_temp.assert(NOT EXISTS((SELECT * FROM after_rows EXCEPT ALL SELECT * FROM receipt_upload_children)
 UNION ALL (SELECT * FROM receipt_upload_children EXCEPT ALL SELECT * FROM after_rows)),'no duplicate posting or financial child changes');
DO $$ BEGIN
 BEGIN UPDATE "Payments" SET "Receipt Image"='manual/dev/forbidden.png' WHERE "Row ID"='RU-PAY';
 RAISE EXCEPTION 'Agent evidence unexpectedly editable';
 EXCEPTION
 WHEN check_violation THEN IF position('payment_receipt_triplet' in SQLERRM)=0 THEN RAISE; END IF;
 WHEN raise_exception THEN IF SQLERRM <> 'Receipt evidence is service-owned' THEN RAISE; END IF;
 END;
END $$;
ROLLBACK;
