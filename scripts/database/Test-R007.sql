\set ON_ERROR_STOP on
-- Isolated migration-test database only; all fixtures roll back. Integrity triggers stay enabled.
BEGIN;
SET LOCAL TIME ZONE 'Asia/Bangkok';
CREATE FUNCTION pg_temp.r007_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'R007 failed: %',label; END IF; END $$;
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('R007-A','A'),('R007-B','B');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES
 ('R007-C1','R007-A',current_date-40,'Contribution',600000::money),
 ('R007-C2','R007-B',current_date-40,'Contribution',400000::money),
 ('R007-C3','R007-A',current_date-10,'Withdrawal',100000::money);
INSERT INTO "Borrowers"("Row ID","Borrower Name","Hidden Flag") VALUES('R007-BR','SYNTHETIC R007',true),('R007-EMPTY','SYNTHETIC EMPTY',true);
INSERT INTO "Statistics"("Row ID","Statistics ID") VALUES('R007-ST','Synthetic');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Due Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Daily Payment Amount","Fixed Interest","Current Daily Interest","Defaulted") VALUES
 ('R007-LD','R007-BR',current_date-40,current_date+20,10000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,0::money,0::money,7::money,false),
 ('R007-LF','R007-BR',current_date-2,current_date+1,1000::money,'กำหนดวันชำระ','ยังไม่ปิดยอด',false,0::money,25::money,0::money,false),
 ('R007-LI','R007-BR',current_date-1,current_date+3,103::money,'ผ่อนชำระรายวัน','ยังไม่ปิดยอด',false,25::money,0::money,0::money,false),
 ('R007-LN','R007-BR',current_date-3,current_date+2,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,0::money,0::money,5::money,false);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('R007-FUTURE','R007-LD',current_date+2,10::money,5::money),
 ('R007-TODAY','R007-LD',current_date,10::money,5::money),
 ('R007-OVERDUE','R007-LD',current_date-3,10::money,5::money),
 ('R007-PARTIAL','R007-LD',current_date-2,10::money,5::money),
 ('R007-ONTIME','R007-LD',current_date-5,10::money,5::money),
 ('R007-LATE','R007-LD',current_date-4,10::money,5::money),
 ('R007-PREPAID','R007-LD',current_date+1,10::money,5::money),
 ('R007-INSTALLMENT','R007-LI',current_date-1,21::money,4::money);
INSERT INTO "Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid") VALUES
 ('R007-RPART','R007-LD','R007-PARTIAL',current_date,0::money,3::money),
 ('R007-RON','R007-LD','R007-ONTIME',current_date-5,10::money,5::money),
 ('R007-RLATE1','R007-LD','R007-LATE',current_date-3,0::money,3::money),
 ('R007-RLATE2','R007-LD','R007-LATE',current_date,10::money,2::money),
 ('R007-RPRE','R007-LD','R007-PREPAID',current_date,10::money,5::money),
 ('R007-R40','R007-LD',NULL,current_date-40,1::money,10::money),
 ('R007-R41','R007-LD',NULL,current_date-41,1::money,10::money),
 ('R007-R29','R007-LD',NULL,current_date-29,2::money,0::money),
 ('R007-R30','R007-LD',NULL,current_date-30,2::money,0::money),
 ('R007-RFUT','R007-LD',NULL,current_date+1,2::money,0::money);
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" IN ('R007-LD','R007-LF','R007-LI','R007-LN');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.r007_assert((SELECT "Days Late"=0 AND "Ref Collection Borrower" IS NULL FROM olap_charges_analytics WHERE "Row ID"='R007-FUTURE'),'unpaid future excluded');
SELECT pg_temp.r007_assert((SELECT "Days Late"=0 AND "Ref Collection Borrower"='R007-BR' FROM olap_charges_analytics WHERE "Row ID"='R007-TODAY'),'due today included');
SELECT pg_temp.r007_assert((SELECT "Days Late"=3 AND "Historical Late" FROM olap_charges_analytics WHERE "Row ID"='R007-OVERDUE'),'overdue days');
SELECT pg_temp.r007_assert((SELECT "Days Late"=2 AND "Payment Status"='ชำระบางส่วน' FROM olap_charges_analytics WHERE "Row ID"='R007-PARTIAL'),'partial overdue');
SELECT pg_temp.r007_assert((SELECT "Days Late"=0 AND "Historical On Time" FROM olap_charges_analytics WHERE "Row ID"='R007-ONTIME'),'paid on-time');
SELECT pg_temp.r007_assert((SELECT "Days Late"=4 AND "First Payment Date"=current_date-3 AND "Last Payment Date"=current_date FROM olap_charges_analytics WHERE "Row ID"='R007-LATE'),'multiple repayments and late completion');
SELECT pg_temp.r007_assert((SELECT "Days Late"=0 AND "Ref Collection Borrower"='R007-BR' FROM olap_charges_analytics WHERE "Row ID"='R007-PREPAID'),'future charge paid today included');
SELECT pg_temp.r007_assert((SELECT "Pool Total at Payment Date"=0 AND "Partner A Profit"=0 FROM olap_repayments_analytics WHERE "Row ID"='R007-R41'),'before contributions');
SELECT pg_temp.r007_assert((SELECT "Pool Total at Payment Date"=1000000 AND "Partner A Profit"=6 AND "Partner B Profit"=4 FROM olap_repayments_analytics WHERE "Row ID"='R007-R40'),'same-date contributions aggregated');
SELECT pg_temp.r007_assert((SELECT "Pool Total at Payment Date"=900000 AND "Partner A Profit"=2 AND "Partner B Profit"=1 FROM olap_repayments_analytics WHERE "Row ID"='R007-RPART'),'withdrawal and per-row whole-baht profit');
SELECT pg_temp.r007_assert((SELECT "30D Principal Reduction Days"=60 FROM olap_repayments_analytics WHERE "Row ID"='R007-R29'),'inclusive day 29');
SELECT pg_temp.r007_assert((SELECT bool_and("30D Principal Reduction Days"=0) FROM olap_repayments_analytics WHERE "Row ID" IN ('R007-R30','R007-RFUT')),'day 30 and future excluded');
SELECT pg_temp.r007_assert((SELECT "Daily Collection Status"='Overdue' AND "Todays Amount Collected"=30 FROM olap_borrowers_analytics WHERE "Row ID"='R007-BR'),'collection priority and actual repayment-date cash');
SELECT pg_temp.r007_assert((SELECT "Daily Collection Status" IS NULL AND "Matrix History Sufficient"=true AND "Matrix Quadrant" IS NULL FROM olap_borrowers_analytics WHERE "Row ID"='R007-EMPTY'),'empty borrower preserves observed blank-date behavior');
SELECT pg_temp.r007_assert((SELECT "Accrued Interest Days"=3 AND "Accrued Interest"=15 FROM olap_loans_analytics WHERE "Row ID"='R007-LN'),'no-charge daily accrual');
SELECT pg_temp.r007_assert((SELECT "Expected Interest This Month"=CASE WHEN date_trunc('month',current_date+1)=date_trunc('month',current_date) THEN 25 ELSE 0 END FROM olap_loans_analytics WHERE "Row ID"='R007-LF'),'fixed due-date month boundary');
-- Independent day-by-day installment oracle, not the aggregate/remainder expression.
SELECT pg_temp.r007_assert((SELECT l."Expected Interest This Month"=coalesce((SELECT sum(25-20-CASE WHEN day_index<=3 THEN 1 ELSE 0 END)
 FROM generate_series(2,5) day_index WHERE current_date-2+day_index <= (date_trunc('month',current_date)+interval '1 month - 1 day')::date),0)
 FROM olap_loans_analytics l WHERE "Row ID"='R007-LI'),'installment earliest-day remainder allocation');
UPDATE "Loans" SET "Auto Charge Enabled"=false WHERE "Row ID"='R007-LD';
SELECT pg_temp.r007_assert((SELECT "Expected Interest This Month"=coalesce((SELECT sum("Interest Remaining") FROM "Charges" WHERE "Ref Loans"='R007-LD' AND "Charge Date">current_date AND "Charge Date"<date_trunc('month',current_date)+interval '1 month'),0) FROM olap_loans_analytics WHERE "Row ID"='R007-LD'),'disabled auto-charge schedule branch');
SELECT pg_temp.r007_assert((SELECT "Amount Collected Today"=0 AND "Todays Amount Collected"=30 FROM olap_portfolio_summary CROSS JOIN olap_borrowers_analytics b WHERE b."Row ID"='R007-BR'),'Statistics collection deliberately differs');
SET CONSTRAINTS ALL DEFERRED;
UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic@example.invalid' WHERE "Row ID"='R007-LN';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.r007_assert((SELECT "Expected Interest This Month"=0 AND "Defaulted Flag" FROM olap_loans_analytics WHERE "Row ID"='R007-LN'),'defaulted closed loan forecast');
SET LOCAL TIME ZONE 'UTC';
SELECT pg_temp.r007_assert(public.olap_reporting_date()=(current_timestamp AT TIME ZONE 'Asia/Bangkok')::date,'session timezone does not shift reporting day');
SELECT 'R007 synthetic calculation boundaries passed' result;
ROLLBACK;
