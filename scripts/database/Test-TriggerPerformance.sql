\set ON_ERROR_STOP on
BEGIN;
SET LOCAL track_functions='all';
\ir Test-CashAccountFixtures.sql
INSERT INTO "Partners"("Row ID","Partner Role") VALUES ('PERF73-A','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
VALUES ('PERF73-FUND','PERF73-A',current_date-11,'Contribution',10000::money);
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES ('PERF73-B','Synthetic trigger parity');
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Ref Disbursed From Cash Account")
VALUES ('PERF73-L','PERF73-B',current_date-10,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false,'CI-LISA');
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
SELECT 'PERF73-C'||i,'PERF73-L',current_date-10,0::money,10::money FROM generate_series(1,10) i;
SELECT public.refresh_daily_analytics(current_date-10,current_date);
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
CREATE TEMP TABLE perf73_calls AS SELECT funcname,calls FROM pg_stat_xact_user_functions;
INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Received By Cash Account")
VALUES ('PERF73-P','PERF73-B','Processing',50::money,current_date,'Lump Sum','CI-DAD');
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
 ASSERT (SELECT "Posted Amount"=50 FROM "Payments" WHERE "Row ID"='PERF73-P'),'posted source';
 ASSERT (SELECT count(*)=5 FROM "Repayments" WHERE "Ref Payment"='PERF73-P'),'five children';
 ASSERT (SELECT calls-coalesce((SELECT calls FROM perf73_calls WHERE funcname='vc_refresh_payment'),0)=1 FROM pg_stat_xact_user_functions WHERE funcname='vc_refresh_payment'),'one payment refresh for five allocations/repayments';
 ASSERT (SELECT calls-coalesce((SELECT calls FROM perf73_calls WHERE funcname='vc_refresh_loan'),0)=1 FROM pg_stat_xact_user_functions WHERE funcname='vc_refresh_loan'),'one loan refresh';
 ASSERT coalesce(nullif(current_setting('r051_dirty.payment',true),'')::jsonb,'{}')='{}','drained payment set';
END $$;
-- Re-arm after a prior drain and restore transaction-local sets across savepoints.
SET CONSTRAINTS ALL DEFERRED;
SAVEPOINT discarded_correction;
UPDATE "Payments" SET "Amount Received"=70::money WHERE "Row ID"='PERF73-P';
ROLLBACK TO SAVEPOINT discarded_correction;
UPDATE "Payments" SET "Amount Received"=60::money,"Payment Date"=current_date-5 WHERE "Row ID"='PERF73-P';
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
 ASSERT (SELECT "Posted Amount"=60 FROM "Payments" WHERE "Row ID"='PERF73-P'),'second drain uses final inputs';
 ASSERT (SELECT "Total Interest Received"=60 FROM "Loans" WHERE "Row ID"='PERF73-L'),'loan source aggregate';
 ASSERT (SELECT "Total Interest Earned"=60 FROM "Borrowers" WHERE "Row ID"='PERF73-B'),'borrower source aggregate';
END $$;
-- Compare incremental scope with full refresh, including untouched accounts.
CREATE TEMP TABLE perf73_snapshots AS
SELECT 'daily' kind,to_jsonb(x)-'Generated At' value FROM "Daily Analytics" x WHERE "Snapshot Date">=current_date-10
UNION ALL SELECT 'accounts',to_jsonb(x)-'Generated At' FROM "Cash Account Daily Analytics" x WHERE "Snapshot Date">=current_date-10;
SELECT public.refresh_daily_analytics(current_date-10,current_date);
DO $$ BEGIN
 ASSERT NOT EXISTS(
 (SELECT * FROM perf73_snapshots EXCEPT
  (SELECT 'daily',to_jsonb(x)-'Generated At' FROM "Daily Analytics" x WHERE "Snapshot Date">=current_date-10
   UNION ALL SELECT 'accounts',to_jsonb(x)-'Generated At' FROM "Cash Account Daily Analytics" x WHERE "Snapshot Date">=current_date-10))
 UNION ALL
 ((SELECT 'daily',to_jsonb(x)-'Generated At' FROM "Daily Analytics" x WHERE "Snapshot Date">=current_date-10
   UNION ALL SELECT 'accounts',to_jsonb(x)-'Generated At' FROM "Cash Account Daily Analytics" x WHERE "Snapshot Date">=current_date-10)
 EXCEPT SELECT * FROM perf73_snapshots)), 'scoped/full snapshot parity';
 -- Independent old formula, including negative repayment components and floors.
 ASSERT NOT EXISTS(SELECT 1 FROM "Daily Analytics" d WHERE d."Snapshot Date">=current_date-10 AND d."Pending Charges EOD"::numeric IS DISTINCT FROM
  (SELECT coalesce(sum(greatest(coalesce(c."Principal Due"::numeric,0)+coalesce(c."Interest Due"::numeric,0)-coalesce(p.paid,0),0)),0)
   FROM "Charges" c LEFT JOIN LATERAL (SELECT sum(coalesce(r."Principal Paid"::numeric,0)+coalesce(r."Interest Paid"::numeric,0)) paid
    FROM "Repayments" r WHERE r."Ref Charges"=c."Row ID" AND r."Payment Date"<=d."Snapshot Date") p ON true
   WHERE c."Charge Date"<=d."Snapshot Date")), 'pending events equal original as-of formula';
 ASSERT NOT EXISTS(SELECT 1 FROM "Daily Analytics" d LEFT JOIN public.reporting_income_daily i ON i."Date"=d."Snapshot Date"
  WHERE d."Snapshot Date">=current_date-10 AND (d."Partner A Net Profit",d."Partner B Net Profit") IS DISTINCT FROM (coalesce(i."Partner A Net Profit",0),coalesce(i."Partner B Net Profit",0))), 'rounded income report parity';
END $$;
-- No-op incremental validation must not physically rewrite unchanged rows.
CREATE TEMP TABLE perf73_ctids AS SELECT "Row ID",ctid::text location FROM "Daily Analytics" WHERE "Snapshot Date">=current_date-10;
CREATE TEMP TABLE perf73_generated AS SELECT "Row ID","Generated At" FROM "Daily Analytics" WHERE "Snapshot Date">=current_date-10;
SELECT public.refresh_daily_analytics_scoped(current_date-10,current_date,ARRAY['CI-DAD']);
DO $$ BEGIN
 ASSERT NOT EXISTS(SELECT 1 FROM "Daily Analytics" d JOIN perf73_ctids p USING("Row ID") WHERE d.ctid::text<>p.location),'unchanged scoped rows are not rewritten';
 ASSERT NOT EXISTS(SELECT 1 FROM "Daily Analytics" d JOIN perf73_generated p USING("Row ID") WHERE d."Generated At" IS DISTINCT FROM p."Generated At"),'unchanged scoped rows keep freshness stamp';
END $$;
DELETE FROM "Payments" WHERE "Row ID"='PERF73-P';
DO $$ BEGIN
 ASSERT (SELECT "Total Interest Received"=0 FROM "Loans" WHERE "Row ID"='PERF73-L'),'delete drains same parent again';
 ASSERT (SELECT "Total Interest Earned"=0 FROM "Borrowers" WHERE "Row ID"='PERF73-B'),'delete borrower total';
 ASSERT NOT EXISTS(SELECT 1 FROM "Cash Ledger" WHERE "Ref Payment"='PERF73-P'),'delete cash';
END $$;
ROLLBACK;
