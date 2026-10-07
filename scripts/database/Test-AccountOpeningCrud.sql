\set ON_ERROR_STOP on
BEGIN;
SET LOCAL timezone='Asia/Bangkok';
INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name","Default Account") VALUES
 ('HIST72-LISA','ch:lisa','Synthetic historical Lisa','Synthetic',true),('HIST72-DAD','ch:dad','Synthetic historical Dad','Synthetic',true);
SELECT initialize_cash_accounts('ch:lisa',jsonb_build_object('HIST72-LISA',(SELECT "Current Balance" FROM "Cash Holder Balances" WHERE "Ref Cash Holder"='ch:lisa')),'Synthetic','Original synthetic account opening');
SELECT initialize_cash_accounts('ch:dad',jsonb_build_object('HIST72-DAD',(SELECT "Current Balance" FROM "Cash Holder Balances" WHERE "Ref Cash Holder"='ch:dad')),'Synthetic','Original synthetic account opening');
CREATE TEMP TABLE hist72_baselines AS TABLE r008_cash_account_cutover;
CREATE FUNCTION pg_temp.assert_cash(h text,expected numeric) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 ASSERT (SELECT "Current Balance"=expected FROM "Cash Holder Balances" WHERE "Ref Cash Holder"=h),'holder balance differs';
 ASSERT (SELECT sum("Current Balance")=expected FROM "Cash Account Balances" WHERE "Ref Cash Holder"=h),'account balance differs / duplicate opening';
END $$;
SELECT pg_temp.assert_cash('ch:lisa',-105),pg_temp.assert_cash('ch:dad',10);
UPDATE "Business Expenses" SET "Amount"=7::money WHERE "Row ID"='HIST72-E';
SELECT pg_temp.assert_cash('ch:lisa',-107);
UPDATE "Business Expenses" SET "Notes"='Metadata save' WHERE "Row ID"='HIST72-E';
SELECT pg_temp.assert_cash('ch:lisa',-107);
DELETE FROM "Business Expenses" WHERE "Row ID"='HIST72-E';
SELECT pg_temp.assert_cash('ch:lisa',-100);
UPDATE "Payments" SET "Amount Received"=9::money WHERE "Row ID"='HIST72-P';
SELECT pg_temp.assert_cash('ch:dad',9);
UPDATE "Payments" SET "Amount Received"=9::money WHERE "Row ID"='HIST72-P';
SELECT pg_temp.assert_cash('ch:dad',9);
UPDATE "Payments" SET "Ref Received By Cash Account"='HIST72-LISA',"Ref Received By Cash Holder"='ch:lisa' WHERE "Row ID"='HIST72-P';
SELECT pg_temp.assert_cash('ch:dad',0),pg_temp.assert_cash('ch:lisa',-91);
UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID"='HIST72-P';
SELECT pg_temp.assert_cash('ch:lisa',-100);
UPDATE "Loans" SET "Principal Amount"=110::money WHERE "Row ID"='HIST72-L';
SELECT pg_temp.assert_cash('ch:lisa',-110);
DELETE FROM "Loans" WHERE "Row ID"='HIST72-L';
SELECT pg_temp.assert_cash('ch:lisa',0),pg_temp.assert_cash('ch:dad',0);
SELECT refresh_daily_analytics(current_date,current_date);
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
 ASSERT NOT EXISTS(SELECT 1 FROM r008_cash_account_cutover c JOIN hist72_baselines b USING("Ref Cash Account")
  WHERE (to_jsonb(c)-ARRAY['Opening Balance','Notes'])<>(to_jsonb(b)-ARRAY['Opening Balance','Notes'])),'captured baseline flows/timestamps preserved';
 ASSERT NOT EXISTS(SELECT 1 FROM r008_cash_account_cutover WHERE "Notes" NOT LIKE 'Original synthetic account opening%prior_opening%'),'prior opening retained in append-only notes';
 ASSERT NOT EXISTS(SELECT 1 FROM "Cash Account Daily Analytics" WHERE "Snapshot Date"=current_date AND "Ref Cash Account" IN ('HIST72-LISA','HIST72-DAD') AND "Closing Balance"<>0),'account snapshots follow corrections';
END $$;
SELECT 'Pre-account opening source corrections passed' result;
ROLLBACK;
