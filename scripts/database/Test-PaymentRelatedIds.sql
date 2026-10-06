\set ON_ERROR_STOP on
BEGIN;
SET LOCAL timezone='Asia/Bangkok';
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.assert_ids(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Related IDs: %',msg; END IF; END $$;
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES ('IDS75-B','Synthetic view test');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES ('IDS75-PARTNER','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
VALUES('IDS75-CAPITAL','IDS75-PARTNER',current_date-100,'Contribution',100000::money);
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest")
VALUES('CI-LISA','IDS75-L','IDS75-B',current_date-10,1000::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,10::money);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
VALUES ('IDS75-C1','IDS75-L',current_date-2,0::money,10::money),('IDS75-C2','IDS75-L',current_date-1,0::money,10::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Received By Cash Account")
VALUES('IDS75-P','IDS75-B','Processing',15::money,current_date,'Lump Sum','CI-DAD');
SET CONSTRAINTS ALL IMMEDIATE;
CREATE FUNCTION pg_temp.check_ids() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_temp.assert_ids((SELECT count(*) FROM oltp_payment_related_ids_v1)=(SELECT count(*) FROM "Payments"),'one row per payment');
 PERFORM pg_temp.assert_ids(NOT EXISTS(
  SELECT 1 FROM oltp_payment_related_ids_v1 v WHERE
  ARRAY(SELECT k FROM unnest(string_to_array(v."Repayment IDs",' , ')) k ORDER BY k) IS DISTINCT FROM ARRAY(SELECT "Row ID" FROM "Repayments" WHERE "Ref Payment"=v."Row ID" ORDER BY "Row ID") OR
  ARRAY(SELECT k FROM unnest(string_to_array(v."Allocation IDs",' , ')) k ORDER BY k) IS DISTINCT FROM ARRAY(SELECT "Row ID" FROM "Payment Allocations" WHERE "Ref Payment"=v."Row ID" ORDER BY "Row ID") OR
  string_to_array(v."Closing Loan IDs",' , ') IS DISTINCT FROM ARRAY(SELECT "Row ID" FROM "Loans" WHERE "Ref Closing Payment"=v."Row ID" ORDER BY "Row ID") OR
  ARRAY(SELECT k FROM unnest(string_to_array(v."Visible Allocation IDs",' , ')) k ORDER BY k) IS DISTINCT FROM ARRAY(SELECT "Row ID" FROM "Payment Allocations" WHERE "Ref Payment"=v."Row ID" AND "Allocated Amount">0::money ORDER BY "Row ID")
 ),'exact child-key sets, no duplicates and empty-list transport');
END $$;
SELECT pg_temp.check_ids();
SELECT pg_temp.assert_ids((SELECT cardinality(string_to_array("Repayment IDs",' , '))=2 FROM oltp_payment_related_ids_v1 WHERE "Row ID"='IDS75-P'),'multiple children');
UPDATE "Payments" SET "Amount Received"=5::money WHERE "Row ID"='IDS75-P';
SELECT pg_temp.check_ids();
SELECT pg_temp.assert_ids((SELECT cardinality(string_to_array("Repayment IDs",' , '))=1 FROM oltp_payment_related_ids_v1 WHERE "Row ID"='IDS75-P'),'correction reflected without refresh');
DELETE FROM "Payments" WHERE "Row ID"='IDS75-P';
SELECT pg_temp.check_ids();
SELECT pg_temp.assert_ids(NOT EXISTS(SELECT FROM oltp_payment_related_ids_v1 WHERE "Row ID"='IDS75-P'),'deleted parent absent');
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='IDS75-L';
UPDATE "Loans" SET "Payment Request Cash Account"='CI-DAD',"Payment Request Token"=current_date||'|ids75close' WHERE "Row ID"='IDS75-L';
SELECT pg_temp.check_ids();
SELECT pg_temp.assert_ids(EXISTS(SELECT FROM oltp_payment_related_ids_v1 WHERE "Closing Loan IDs"='IDS75-L'),'closing payment relation, not borrower loans');
DELETE FROM "Payments" WHERE "Row ID"=(SELECT "Ref Closing Payment" FROM "Loans" WHERE "Row ID"='IDS75-L');
SELECT pg_temp.check_ids();
ROLLBACK;
