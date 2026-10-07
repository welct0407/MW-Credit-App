\set ON_ERROR_STOP on
\ir Test-AnalyticsRefresh.sql
BEGIN;
SET LOCAL timezone='Asia/Bangkok';
CREATE FUNCTION pg_temp.assert_snapshot(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Snapshot test: %',msg; END IF; END $$;
INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES
 ('SNAP-A','ch:dad','Synthetic A','Synthetic'),('SNAP-B','ch:lisa','Synthetic B','Synthetic');
-- Insert fixture openings directly only in this disposable transaction. Never bypass live opening guards.
SET LOCAL r008.initializing='on';
INSERT INTO r008_cash_account_cutover("Ref Cash Account","Cutover At","Opening Balance","Baseline Cash In","Baseline Cash Out","Created By","Notes")
 VALUES ('SNAP-A',(current_date-4)::timestamp AT TIME ZONE 'Asia/Bangkok',100,0,0,'synthetic','Test'),
 ('SNAP-B',(current_date-4)::timestamp AT TIME ZONE 'Asia/Bangkok',0,0,0,'synthetic','Test');
SET LOCAL r008.initializing='off';
SET LOCAL r005.allow_cash_adjustment='on';
INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref To Cash Holder","Ref To Cash Account","Notes")
 VALUES('SNAP-IN',current_date-3,'Manual Correction',30,'ch:dad','SNAP-A','Synthetic');
INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref From Cash Account","Notes")
 VALUES('SNAP-OUT',current_date-2,'Manual Correction',20,'ch:lisa','SNAP-B','Synthetic');
INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder","Ref From Cash Account","Ref To Cash Account")
 VALUES('SNAP-TRANSFER',current_date-1,'Cash Handover',10,'ch:dad','ch:lisa','SNAP-A','SNAP-B');
SELECT refresh_daily_analytics(current_date-5,current_date);
SELECT pg_temp.assert_snapshot((SELECT count(*)=12 FROM "Cash Account Daily Analytics"),'zero-activity date grid');
SELECT pg_temp.assert_snapshot((SELECT "Cash Balance EOD" IS NULL FROM "Daily Analytics" WHERE "Snapshot Date"=current_date-5),'unknown before opening');
SELECT pg_temp.assert_snapshot((SELECT "Cash Balance EOD"=110 AND "Cash Money In"=0 AND "Cash Money Out"=0 FROM "Daily Analytics" WHERE "Snapshot Date"=current_date-1),'transfer excluded from consolidated cashflow');
SELECT pg_temp.assert_snapshot((SELECT "Closing Balance"=-10 FROM "Cash Account Daily Analytics" WHERE "Snapshot Date"=current_date AND "Ref Cash Account"='SNAP-B'),'negative account remains signed');
CREATE TEMP TABLE snapshots_before AS SELECT to_jsonb(a)-'Generated At' value FROM "Cash Account Daily Analytics" a;
SELECT refresh_daily_analytics(current_date-1,current_date);
SELECT pg_temp.assert_snapshot(NOT EXISTS((SELECT to_jsonb(a)-'Generated At' FROM "Cash Account Daily Analytics" a EXCEPT SELECT value FROM snapshots_before) UNION ALL (SELECT value FROM snapshots_before EXCEPT SELECT to_jsonb(a)-'Generated At' FROM "Cash Account Daily Analytics" a)),'bounded and full rebuild identical, keys retained');
INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref To Cash Holder","Ref To Cash Account","Notes")
 VALUES('SNAP-CORRECTION',current_date-3,'Manual Correction',10,'ch:dad','SNAP-A','Synthetic backdated correction');
SELECT refresh_daily_analytics(current_date-3,current_date);
SELECT pg_temp.assert_snapshot((SELECT "Cash Balance EOD"=120 FROM "Daily Analytics" WHERE "Snapshot Date"=current_date),'older correction rolls forward');
SELECT pg_temp.assert_snapshot((SELECT "Cash Balance EOD"=100 FROM "Daily Analytics" WHERE "Snapshot Date"=current_date-4),'older unaffected day preserved');
CREATE TEMP TABLE atomic_before AS SELECT to_jsonb(a) value FROM "Cash Account Daily Analytics" a;
CREATE FUNCTION pg_temp.reject_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW."Snapshot Date"=current_date THEN RAISE EXCEPTION 'synthetic snapshot failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER reject_snapshot BEFORE UPDATE ON "Daily Analytics" FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_snapshot();
DO $$ BEGIN
 BEGIN PERFORM refresh_daily_analytics(current_date-1,current_date); RAISE EXCEPTION 'Expected failure';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'synthetic snapshot failure' THEN RAISE; END IF; END;
END $$;
SELECT pg_temp.assert_snapshot(NOT EXISTS((SELECT to_jsonb(a) FROM "Cash Account Daily Analytics" a EXCEPT SELECT value FROM atomic_before) UNION ALL (SELECT value FROM atomic_before EXCEPT SELECT to_jsonb(a) FROM "Cash Account Daily Analytics" a)),'account writes rolled back with portfolio failure');
DROP TRIGGER reject_snapshot ON "Daily Analytics";
INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES('SNAP-UNKNOWN','ch:tommy','Unknown','Synthetic');
INSERT INTO "Statistics"("Row ID","Analytics Refresh Request") VALUES('SNAP-CMD',current_date||'|Recent|snapshot-test');
SELECT pg_temp.assert_snapshot((SELECT count(*)=2 FROM "Cash Account Daily Analytics" WHERE "Ref Cash Account"='SNAP-UNKNOWN'),'Recent command refreshes exactly yesterday/today');
SELECT pg_temp.assert_snapshot((SELECT "Cash Balance EOD" IS NULL AND "Cash Balance Status"='Opening not initialized' FROM "Daily Analytics" WHERE "Snapshot Date"=current_date),'missing opening cannot become zero');
DO $$ BEGIN
 BEGIN PERFORM refresh_daily_analytics(current_date,current_date+1); RAISE EXCEPTION 'Expected future date rejection';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Analytics requires%' THEN RAISE; END IF; END;
END $$;
SELECT 'Unified daily cash snapshot tests passed';
ROLLBACK;
