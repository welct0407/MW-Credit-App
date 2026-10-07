\ir Test-MaterializedBalances.sql
BEGIN;
CREATE FUNCTION pg_temp.br_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END $$;
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('VC13-A','SYNTHETIC A'),('VC13-B','SYNTHETIC B');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Due Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Daily Payment Amount")
VALUES('VC13-L','VC13-A',current_date,current_date+2,100::money,'ผ่อนชำระรายวัน','ยังไม่ปิดยอด',false,40::money);
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='VC13-L';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.br_assert((SELECT abs("Expected Daily Interest Amount"-20.0/3)<0.00000001 FROM "Loans" WHERE "Row ID"='VC13-L'),'fractional inclusive daily interest');
SELECT pg_temp.br_assert((SELECT "Total Number of Loans"=1 AND "Total Amount Loaned"=100 AND "Has Active Loan" AND NOT "Has Closed Loan" AND abs("Active Daily Interest"-20.0/3)<0.00000001 FROM "Borrowers" WHERE "Row ID"='VC13-A'),'new loan borrower');
SET CONSTRAINTS ALL DEFERRED;
UPDATE "Loans" SET "Ref Borrowers"='VC13-B',"Auto Charge Enabled"=false WHERE "Row ID"='VC13-L';
INSERT INTO "Repayments"("Row ID","Ref Loans","Payment Date","Principal Paid","Interest Paid") VALUES('VC13-R','VC13-L',current_date,25::money,5::money);
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.br_assert((SELECT "Total Number of Loans"=0 AND "Total Amount Loaned"=0 AND NOT "Has Active Loan" FROM "Borrowers" WHERE "Row ID"='VC13-A'),'old borrower reset');
SELECT pg_temp.br_assert((SELECT "Total Interest Earned"=5 AND "Total Outstanding Principal"=75 AND "Active Loan Interest Earned"=5 AND "Active Daily Interest"=0 FROM "Borrowers" WHERE "Row ID"='VC13-B'),'new borrower receipt and disabled helper');
SET CONSTRAINTS ALL DEFERRED;
UPDATE "Loans" SET "Loan Status"='ปิดยอดแล้ว' WHERE "Row ID"='VC13-L';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.br_assert((SELECT "Total Interest Earned"=5 AND "Active Loan Interest Earned"=0 AND "Has Closed Loan" AND NOT "Has Active Loan" FROM "Borrowers" WHERE "Row ID"='VC13-B'),'closed status population');
UPDATE "Borrowers" SET "Total Interest Earned"=999 WHERE "Row ID"='VC13-B';
SELECT pg_temp.br_assert((SELECT "Total Interest Earned"=5 FROM "Borrowers" WHERE "Row ID"='VC13-B'),'forged borrower cache ignored');
SET CONSTRAINTS ALL DEFERRED;
DELETE FROM "Repayments" WHERE "Row ID"='VC13-R';
DELETE FROM "Charges" WHERE "Ref Loans"='VC13-L';
DELETE FROM "Loans" WHERE "Row ID"='VC13-L';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.br_assert((SELECT "Total Number of Loans"=0 AND "Total Outstanding Principal"=0 AND "Total Interest Earned"=0 AND NOT "Has Closed Loan" FROM "Borrowers" WHERE "Row ID"='VC13-B'),'deleted loan resets borrower');
SELECT 'Borrower rollup regression passed' AS result;
ROLLBACK;
