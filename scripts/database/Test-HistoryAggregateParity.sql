\set ON_ERROR_STOP on
BEGIN;
SET LOCAL timezone='Asia/Bangkok';
\ir Test-CashAccountFixtures.sql
-- Compare complete rows against an independent retained implementation.
\ir Test-HistoryReference.sql
CREATE FUNCTION pg_temp.history_parity(label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE first_day date:=public.analytics_history_start(); actual jsonb; reference jsonb;
BEGIN
 PERFORM public.refresh_daily_analytics(first_day,current_date);
 SELECT jsonb_build_object('daily',(SELECT jsonb_agg(to_jsonb(x)-'Generated At' ORDER BY "Row ID") FROM "Daily Analytics" x),
  'accounts',(SELECT jsonb_agg(to_jsonb(x)-'Generated At' ORDER BY "Row ID") FROM "Cash Account Daily Analytics" x)) INTO actual;
 PERFORM pg_temp.refresh_daily_analytics_reference(first_day,current_date);
 SELECT jsonb_build_object('daily',(SELECT jsonb_agg(to_jsonb(x)-'Generated At' ORDER BY "Row ID") FROM "Daily Analytics" x),
  'accounts',(SELECT jsonb_agg(to_jsonb(x)-'Generated At' ORDER BY "Row ID") FROM "Cash Account Daily Analytics" x)) INTO reference;
 IF actual IS DISTINCT FROM reference THEN RAISE EXCEPTION 'Historical aggregate parity failed: %',label; END IF;
END $$;
SELECT pg_temp.history_parity('retained full history');
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('AGG64-B','Synthetic parity');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('AGG64-A','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
 VALUES('AGG64-FUND','AGG64-A',current_date-10,'Contribution',10000::money);
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Ref Disbursed From Cash Account")
 VALUES('AGG64-L','AGG64-B',current_date-5,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false,NULL,'CI-LISA'),
 ('AGG64-DEFAULT','AGG64-B',current_date-5,500::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,50::money,'CI-LISA');
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('AGG64-C1','AGG64-L',current_date-3,100::money,20::money),
 ('AGG64-C2','AGG64-L',current_date-2,0::money,30::money),
 ('AGG64-ZERO','AGG64-L',current_date,0::money,0::money),
 ('AGG64-DF','AGG64-DEFAULT',current_date-2,500::money,50::money);
INSERT INTO "Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid") VALUES
 ('AGG64-R1','AGG64-L','AGG64-C1',current_date-3,10::money,20::money),
 ('AGG64-R2','AGG64-L','AGG64-C1',current_date-1,15::money,0::money),
 ('AGG64-R3','AGG64-L','AGG64-C2',current_date,0::money,5::money);
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.history_parity('partial payments, multiple receipt dates and zero obligations');
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='AGG64-DEFAULT';
UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic-r051' WHERE "Row ID"='AGG64-DEFAULT';
SELECT pg_temp.history_parity('signed default charge and zero-cash repayment');
UPDATE "Loans" SET "Defaulted"=false WHERE "Row ID"='AGG64-DEFAULT';
SELECT pg_temp.history_parity('default inverse');
-- Explicit expression-domain coverage includes nullable components and signed
-- overpayment/loss rows without bypassing any live source validation.
DO $$ DECLARE mismatch boolean;
BEGIN
 WITH charges(id,d,p,i) AS (VALUES
  ('partial',-3,100::numeric,20::numeric),('null',-2,NULL::numeric,10::numeric),
  ('zero',0,0::numeric,0::numeric),('loss',-1,50::numeric,-50::numeric),('future',1,20::numeric,10::numeric)),
 repayments(id,d,p,i) AS (VALUES
  ('partial',-3,10::numeric,20::numeric),('partial',0,100::numeric,NULL::numeric),
  ('null',-1,NULL::numeric,5::numeric),('loss',-1,50::numeric,-50::numeric),('future',1,20::numeric,10::numeric)),
 charge_payments AS MATERIALIZED (SELECT id,d,sum(coalesce(p,0)+coalesce(i,0)) paid FROM repayments WHERE d<=0 GROUP BY id,d),
 dates AS (SELECT generate_series(-4,0) d),
 original AS (SELECT dates.d,(SELECT coalesce(sum(greatest(coalesce(c.p,0)+coalesce(c.i,0)-coalesce((SELECT sum(paid) FROM charge_payments cp WHERE cp.id=c.id AND cp.d<=dates.d),0),0)),0) FROM charges c WHERE c.d<=dates.d) value FROM dates),
 grouped AS (SELECT dates.d,(SELECT coalesce(sum(greatest(coalesce(c.p,0)+coalesce(c.i,0)-coalesce(cp.paid,0),0)),0) FROM charges c LEFT JOIN (SELECT id,sum(paid) paid FROM charge_payments WHERE d<=dates.d GROUP BY id) cp ON cp.id=c.id WHERE c.d<=dates.d) value FROM dates)
 SELECT EXISTS(SELECT 1 FROM original JOIN grouped USING(d) WHERE original.value IS DISTINCT FROM grouped.value) INTO mismatch;
 ASSERT NOT mismatch,'Null, signed, clamped and date-boundary parity';
END $$;
SELECT 'Historical aggregate full-row parity passed' AS result;
ROLLBACK;
