\set ON_ERROR_STOP on
SET TIME ZONE 'Asia/Bangkok';
-- Used after Fixture-R008V23Receipt.sql at migration target 23, then V24.
BEGIN;
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('R008-OLD-C2','R008-OLD-LOAN',current_date,0::money,20::money);
UPDATE "Borrowers" SET "Payment Request Token"=current_date||'|current01' WHERE "Row ID"='R008-OLD-B';
DO $$ BEGIN
 ASSERT EXISTS(SELECT 1 FROM "Payments" WHERE "Row ID"='r008:Borrowers|10:R008-OLD-B|'||current_date||'|current01' AND "Status"='Posted'), 'New identity must exactly match AppSheet CONCATENATE';
 ASSERT EXISTS(SELECT 1 FROM "Payments" WHERE "Row ID"='r008:'||md5('Borrowers|10:R008-OLD-B|'||current_date||'|legacy001')), 'Original receipt key must remain unchanged';
END $$;
-- A changed token replaying a previously processed V23 request must not post.
UPDATE "Borrowers" SET "Payment Request Token"=current_date||'|legacy001' WHERE "Row ID"='R008-OLD-B';
UPDATE "Borrowers" SET "Payment Request Token"=current_date||'|current01' WHERE "Row ID"='R008-OLD-B';
DO $$ BEGIN
 ASSERT (SELECT count(*)=2 AND sum("Posted Amount"::numeric)=30 FROM "Payments" WHERE "Ref Borrower"='R008-OLD-B'), 'Both old and new command identities remain idempotent';
 ASSERT (SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric)=30 FROM "Repayments" WHERE "Ref Loans"='R008-OLD-LOAN'), 'Retries must not duplicate repayments';
END $$;
ROLLBACK;
SELECT 'R008 V23 receipt preservation and V24 notification identity passed' result;
