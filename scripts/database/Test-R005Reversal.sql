\set ON_ERROR_STOP on
SET TIME ZONE 'Asia/Bangkok';
BEGIN;
CREATE FUNCTION pg_temp.assert_reversal(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'R005 reversal failed: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.reject_reversal(command text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN
  IF position(expected in SQLERRM)=0 THEN RAISE; END IF; RETURN;
 END;
 RAISE EXCEPTION 'Expected rejection: %',expected;
END $$;
CREATE TEMP TABLE initial_cash AS SELECT * FROM "Cash Holder Balances";
SELECT public.refresh_daily_analytics(current_date-2,current_date);
CREATE TEMP TABLE initial_analytics AS SELECT "Snapshot Date","Unsettled Profit EOD","Net Unsettled Profit EOD" FROM "Daily Analytics";
INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status","Settlement Date","Transfer Date","Notes")
VALUES('R005-REV-C','R005-A',50::money,'Completed',current_date-2,current_date-2,'Synthetic original note');
SELECT public.refresh_daily_analytics(current_date-2,current_date);
SELECT pg_temp.assert_reversal((SELECT a."Current Balance"=b."Current Balance"-50 FROM "Cash Holder Balances" a JOIN initial_cash b USING("Ref Cash Holder") WHERE a."Ref Cash Holder"='ch:lisa'),'completed debit');
UPDATE "Settlements" SET "Status"='Cancelled',"Notes"="Notes"||' | Deleted by synthetic test' WHERE "Row ID"='R005-REV-C';
SELECT pg_temp.assert_reversal(NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Ref Settlement"='R005-REV-C'),'cash reversal');
SELECT pg_temp.assert_reversal(NOT EXISTS((SELECT * FROM "Cash Holder Balances" EXCEPT TABLE initial_cash) UNION ALL (TABLE initial_cash EXCEPT SELECT * FROM "Cash Holder Balances")),'all holder balances exactly restored');
SELECT pg_temp.assert_reversal(NOT EXISTS((SELECT "Snapshot Date","Unsettled Profit EOD","Net Unsettled Profit EOD" FROM "Daily Analytics" EXCEPT TABLE initial_analytics) UNION ALL (TABLE initial_analytics EXCEPT SELECT "Snapshot Date","Unsettled Profit EOD","Net Unsettled Profit EOD" FROM "Daily Analytics")),'historical snapshots restored');
SELECT pg_temp.assert_reversal((SELECT "Amount"=50::money AND "Ref Partner"='R005-A' AND "Transfer Date"=current_date-2 AND "Notes" LIKE 'Synthetic original note%' FROM "Settlements" WHERE "Row ID"='R005-REV-C'),'original facts retained');
UPDATE "Settlements" SET "Status"='Cancelled',"Notes"='duplicate retry' WHERE "Row ID"='R005-REV-C';
SELECT pg_temp.assert_reversal((SELECT "Notes"='Synthetic original note | Deleted by synthetic test' FROM "Settlements" WHERE "Row ID"='R005-REV-C'),'retry retains first note');
SELECT pg_temp.reject_reversal($q$UPDATE "Settlements" SET "Status"='Completed' WHERE "Row ID"='R005-REV-C'$q$,'cannot be changed');
SELECT pg_temp.reject_reversal($q$DELETE FROM "Settlements" WHERE "Row ID"='R005-REV-C'$q$,'history is retained');
INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status","Settlement Date","Notes")
SELECT 'R005-REV-P','R005-A',(public.partner_net_profit('R005-A')-sum("Amount"::numeric))::money,'Pending',current_date,'Pending synthetic'
FROM "Settlements" WHERE "Ref Partner"='R005-A' AND "Status" IS DISTINCT FROM 'Cancelled';
SELECT pg_temp.reject_reversal($q$INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status") VALUES('R005-OVER','R005-A',1::money,'Pending')$q$,'exceeds net');
SELECT pg_temp.reject_reversal($q$UPDATE "Settlements" SET "Status"='Cancelled' WHERE "Row ID"='R005-REV-P'$q$,'appended reversal note');
UPDATE "Settlements" SET "Status"='Cancelled',"Notes"="Notes"||' | Deleted pending' WHERE "Row ID"='R005-REV-P';
INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status","Settlement Date")
SELECT 'R005-REV-REUSE','R005-A',"Amount",'Pending',current_date FROM "Settlements" WHERE "Row ID"='R005-REV-P';
SELECT pg_temp.assert_reversal(NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Ref Settlement" IN ('R005-REV-P','R005-REV-REUSE')),'pending deletion creates no cash');
SELECT pg_temp.assert_reversal((SELECT count(*)=0 FROM "Cash Ledger"),'no historical backfill');
ROLLBACK;
\echo R005 settlement reversal checks passed
