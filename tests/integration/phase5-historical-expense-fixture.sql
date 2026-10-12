\set ON_ERROR_STOP on
-- C-owned disposable V19 source; V20 must capture it normally. Never a live data script.
BEGIN;
SET LOCAL timezone='Asia/Bangkok';
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('C-P5-HIST-A','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('C-P5-HIST-CAP','C-P5-HIST-A',current_date-30,'Contribution',1000::money);
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Created By","Notes") VALUES('C-P5-HIST-EXP',current_date-2,'C historical category',10::money,'c-historical-source@example.invalid','original captured expense');
COMMIT;
