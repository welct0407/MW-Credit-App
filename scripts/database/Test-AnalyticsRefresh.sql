\ir Test-DefaultLoan.sql
SET timezone='Asia/Bangkok';
BEGIN;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.check_ok(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',msg; END IF; END $$;
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES ('DA11-B','Synthetic Analytics');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES ('DA11-A','A'),('DA11-B','B'),('DA11-C','C');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES
 ('DA11-CA','DA11-A',current_date-2,'Contribution',600::money),
 ('DA11-CB','DA11-B',current_date-2,'Contribution',300::money),
 ('DA11-CC','DA11-C',current_date-2,'Contribution',100::money),
 ('DA11-W','DA11-A',current_date,'Withdrawal',100::money);
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Fixed Interest") VALUES ('CI-LISA','DA11-L','DA11-B',current_date-2,100::money,'กำหนดวันชำระ','ยังไม่ปิดยอด',false,20::money);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('DA11-C','DA11-L',current_date-1,100::money,20::money);
INSERT INTO "Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid") VALUES
 ('DA11-R','DA11-L','DA11-C',current_date,10::money,20::money);
INSERT INTO "Settlements"("Ref Paid From Cash Account","Row ID","Ref Partner","Status","Transfer Date","Amount") VALUES ('CI-LISA','DA11-S','DA11-A','Completed',current_date,5::money);
INSERT INTO "Daily Analytics"("Row ID","Snapshot Date") VALUES ('preserve-this-key',current_date-1);
SELECT pg_temp.check_ok(refresh_daily_analytics(current_date-2,current_date)=3,'Three daily rows expected');
SELECT pg_temp.check_ok("Principal Issued"=100::money AND "Loans Issued"=1
 AND "Outstanding Principal EOD"=100::money AND "Active Loans EOD"=1
 AND "Active Borrowers EOD"=1 AND "Total Cash Pool EOD"=1000::money
 AND "Available Cash EOD"=900::money AND "Pending Charges EOD"=0::money,
 'Issuance day reconciliation') FROM "Daily Analytics" WHERE "Snapshot Date"=current_date-2;
SELECT pg_temp.check_ok("Row ID"='preserve-this-key' AND "Pending Charges EOD"=120::money,
 'Preserve key and pre-payment pending balance') FROM "Daily Analytics" WHERE "Snapshot Date"=current_date-1;
SELECT pg_temp.check_ok("Principal Returned"=10::money AND "Interest Received"=20::money
 AND "Repayments Count"=1 AND "Outstanding Principal EOD"=90::money
 AND "Pending Charges EOD"=90::money AND "Total Cash Pool EOD"=900::money
 AND "Available Cash EOD"=810::money AND "Unsettled Profit EOD"=12.78::money,
 'Payment day, remaining partial balance, withdrawal, A/B split and settlement')
 FROM "Daily Analytics" WHERE "Snapshot Date"=current_date;
INSERT INTO "Statistics"("Row ID","Analytics Refresh Request")
 VALUES ('DA11-ST',current_date::text||'|Recent|one');
SELECT pg_temp.check_ok((SELECT count(*)=3 FROM "Daily Analytics"),'No duplicate snapshots on request');
CREATE TEMP TABLE original_snapshots AS SELECT * FROM "Daily Analytics";
UPDATE "Statistics" SET "Analytics Refresh Request"="Analytics Refresh Request" WHERE "Row ID"='DA11-ST';
SELECT pg_temp.check_ok(NOT EXISTS((SELECT * FROM "Daily Analytics" EXCEPT SELECT * FROM original_snapshots)
 UNION ALL (SELECT * FROM original_snapshots EXCEPT SELECT * FROM "Daily Analytics")),'Same command is a no-op');
DO $$ BEGIN
 BEGIN
  UPDATE "Statistics" SET "Analytics Refresh Request"='bad-command' WHERE "Row ID"='DA11-ST';
  RAISE EXCEPTION 'Expected malformed request rejection';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'Analytics refresh requires%' THEN RAISE; END IF;
 END;
END $$;
SELECT pg_temp.check_ok((SELECT "Analytics Refresh Request"=current_date::text||'|Recent|one' FROM "Statistics" WHERE "Row ID"='DA11-ST'),'Rejected token rolled back');
-- A failure on a later date must also roll back earlier upserts and the request.
CREATE FUNCTION pg_temp.reject_today() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW."Snapshot Date"=current_date THEN RAISE EXCEPTION 'synthetic later-day failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER test_late_failure BEFORE UPDATE ON "Daily Analytics" FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_today();
DO $$ BEGIN
 BEGIN
  UPDATE "Statistics" SET "Analytics Refresh Request"=current_date::text||'|Full|two' WHERE "Row ID"='DA11-ST';
  RAISE EXCEPTION 'Expected later-day rejection';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'synthetic later-day failure' THEN RAISE; END IF;
 END;
END $$;
SELECT pg_temp.check_ok(NOT EXISTS((SELECT * FROM "Daily Analytics" EXCEPT SELECT * FROM original_snapshots)
 UNION ALL (SELECT * FROM original_snapshots EXCEPT SELECT * FROM "Daily Analytics")),'Whole refresh rolled back');
DROP TRIGGER test_late_failure ON "Daily Analytics";
UPDATE "Settlements" SET "Status"='Cancelled',"Notes"=' | Synthetic reversal' WHERE "Row ID"='DA11-S';
SELECT pg_temp.check_ok("Partner Settlements"=0 AND "Partner A Settlements"=0
 AND "Cash Money Out"=0 AND "Unsettled Profit EOD"=17.78::money,
 'Completed settlement reversal automatically refreshes both cash and entitlement history')
 FROM "Daily Analytics" WHERE "Snapshot Date"=current_date;
SELECT pg_temp.check_ok("Money Out"=0,'Settlement reversal updates account snapshot through existing trigger')
 FROM "Cash Account Daily Analytics" WHERE "Snapshot Date"=current_date AND "Ref Cash Account"='CI-LISA';
SELECT 'Analytics refresh regressions passed';
ROLLBACK;
