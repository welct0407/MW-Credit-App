\set ON_ERROR_STOP on
-- Synthetic fixtures live only inside this rolled-back schema on the disposable runner.
BEGIN;
CREATE SCHEMA partners_test;
CREATE FUNCTION partners_test.olap_reporting_date() RETURNS date LANGUAGE sql IMMUTABLE AS $$ SELECT DATE '2026-09-26' $$;
CREATE TABLE partners_test."Partners"("Row ID" text,"Partner Name" text,"Partner Role" text);
CREATE TABLE partners_test."Cash Pool Contributions"("Row ID" text,"Ref Partner" text,"Contribution Date" date,"Transaction Type" text,"Amount" numeric);
CREATE TABLE partners_test."Business Expenses"("Row ID" text,"Expense Date" date,"Amount" numeric,"Partner A Expense" numeric,"Partner B Expense" numeric);
CREATE TABLE partners_test.olap_repayments_analytics("Row ID" text,"Payment Date" date,"Interest Paid" numeric,"Partner A Profit" numeric,"Partner B Profit" numeric);
CREATE TABLE partners_test."Settlements"("Row ID" text,"Ref Partner" text,"Transfer Date" date,"Amount" numeric,"Status" text);
-- pg_get_viewdef emits qualified references because only pg_catalog is visible here.
SET LOCAL search_path=pg_catalog;
DO $$ DECLARE n text; definition text; BEGIN
 FOREACH n IN ARRAY ARRAY['reporting_partner_capital_v1','reporting_partner_earnings_v1','reporting_partner_settlements_v1','reporting_partner_position_v1','reporting_partner_daily_v1','reporting_partner_capital_ledger_v1'] LOOP
  definition:=replace(pg_get_viewdef(('public.'||n)::regclass,true),'public.','partners_test.');
  EXECUTE format('CREATE VIEW partners_test.%I AS %s',n,definition);
 END LOOP;
END $$;
SET LOCAL search_path=partners_test,public;
CREATE FUNCTION pg_temp.partner_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Partners test failed: %',label; END IF; END $$;
INSERT INTO "Partners" VALUES('A1','Synthetic Alpha','A'),('B1','Synthetic Beta','B');
INSERT INTO "Cash Pool Contributions" VALUES
 ('C1','A1','2026-08-01','Contribution',60000),('C2','B1','2026-08-01','Contribution',40000),
 ('C3','A1','2026-09-01','Withdrawal',10000),('C4','B1','2026-09-01','Contribution',10000);
INSERT INTO olap_repayments_analytics VALUES('I1','2026-08-15',20000,12000,8000),('I2','2026-09-15',100,50,50);
INSERT INTO "Business Expenses" VALUES('E1','2026-08-20',3000,2000,1000),('E2','2026-09-20',-100,-50,-50);
INSERT INTO "Settlements" VALUES('S1','A1','2026-09-10',4000,'Completed'),('S2','A1','2026-09-25',1500,'Pending');
SELECT pg_temp.partner_assert((SELECT net_capital=50000 AND interest_earned=12050 AND expenses=1950 AND net_earned=10100 AND completed=4000 AND pending=1500 AND unpaid=6100 AND available=4600 AND ready FROM reporting_partner_position_v1 WHERE partner_id='A1'),'independent amounts and signed expenses');
SELECT pg_temp.partner_assert((SELECT capital_share=0.5 FROM reporting_partner_position_v1 WHERE partner_id='A1'),'share unaffected by partner selection');
SELECT pg_temp.partner_assert((SELECT capital_eod=60000 FROM reporting_partner_daily_v1 WHERE partner_id='A1' AND activity_date='2026-08-31'),'opening capital before selected period');
SELECT pg_temp.partner_assert((SELECT capital_eod=50000 AND allocated_interest=50 FROM reporting_partner_daily_v1 WHERE partner_id='A1' AND activity_date='2026-09-15'),'historical allocations retained');
SELECT pg_temp.partner_assert((SELECT sum(net_earned)=100 AND sum(completed_payouts)=4000 FROM reporting_partner_daily_v1 WHERE partner_id='A1' AND activity_date BETWEEN '2026-09-01' AND '2026-09-26'),'period source dates and prior profit payouts');
UPDATE "Settlements" SET "Status"='Completed' WHERE "Row ID"='S2';
SELECT pg_temp.partner_assert((SELECT completed=5500 AND pending=0 AND available=4600 FROM reporting_partner_position_v1 WHERE partner_id='A1'),'pending completion no double deduction');
UPDATE "Settlements" SET "Status"='Cancelled' WHERE "Row ID"='S2';
SELECT pg_temp.partner_assert((SELECT completed=4000 AND available=6100 FROM reporting_partner_position_v1 WHERE partner_id='A1'),'completed cancellation restores entitlement');
INSERT INTO "Settlements" VALUES('S3','A1',NULL,200,'Pending'),('S4','A1','2026-10-01',300,'Pending');
SELECT pg_temp.partner_assert((SELECT pending=500 AND available=5600 AND undated_pending=1 FROM reporting_partner_position_v1 WHERE partner_id='A1'),'undated and future pending reserve now');
INSERT INTO "Settlements" VALUES('S5','A1','2026-09-26',100,NULL);
SELECT pg_temp.partner_assert((SELECT reserved=4600 AND other_reserved=100 AND available IS NULL AND NOT ready FROM reporting_partner_position_v1 WHERE partner_id='A1'),'unknown status reserved and availability suppressed');
DELETE FROM "Settlements" WHERE "Row ID"='S5';
INSERT INTO "Partners" VALUES('A2','Duplicate role','A');
SELECT pg_temp.partner_assert((SELECT bool_and(net_earned IS NULL AND available IS NULL) FROM reporting_partner_position_v1),'duplicate role does not duplicate entitlement');
DELETE FROM "Partners" WHERE "Row ID"='A2';
INSERT INTO "Settlements" VALUES('S6','A1','2026-09-26',20000,'Completed');
SELECT pg_temp.partner_assert((SELECT available=-14400 FROM reporting_partner_position_v1 WHERE partner_id='A1'),'negative availability remains signed');
DELETE FROM "Settlements" WHERE "Row ID"='S6';
INSERT INTO "Cash Pool Contributions" VALUES('C5','A1','2026-09-26','Unrecognized',1);
SELECT pg_temp.partner_assert((SELECT capital_share IS NULL AND available IS NULL AND quality_status='Needs review' FROM reporting_partner_position_v1 WHERE partner_id='A1'),'unknown capital type flagged');
DELETE FROM "Cash Pool Contributions" WHERE "Row ID"='C5';
SELECT pg_temp.partner_assert((SELECT count(*)=count(DISTINCT (partner_id,activity_date)) FROM reporting_partner_daily_v1),'daily grain');
SELECT pg_temp.partner_assert((SELECT count(*)=count(DISTINCT (event_type,event_id,role)) FROM reporting_partner_earnings_v1),'earnings grain');
SELECT pg_temp.partner_assert((SELECT count(*)=count(DISTINCT capital_id) FROM reporting_partner_capital_ledger_v1),'capital ledger grain');
SELECT pg_temp.partner_assert((SELECT bool_and(capital_eod=50000) FROM reporting_partner_daily_v1 WHERE partner_id='A1' AND activity_date BETWEEN '2026-09-21' AND '2026-09-26'),'no movement carry-forward');
DELETE FROM "Settlements"; DELETE FROM "Business Expenses"; DELETE FROM olap_repayments_analytics; DELETE FROM "Cash Pool Contributions";
SELECT pg_temp.partner_assert((SELECT bool_and(net_capital=0 AND net_earned=0 AND available=0 AND capital_share IS NULL) FROM reporting_partner_position_v1),'known empty activity and zero denominator');
ROLLBACK;
