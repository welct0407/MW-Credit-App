\set ON_ERROR_STOP on
-- Disposable PostgreSQL only, all synthetic rows rolled back; no trigger bypass.
BEGIN;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.ph_assert(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Payment health: %',msg; END IF; END $$;
INSERT INTO "Borrowers"("Row ID","Borrower Name") SELECT 'PH-'||x,'Synthetic health '||x FROM unnest(ARRAY['A','B','C','EMPTY','DEFAULT']) x;
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('PH-P','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
VALUES('PH-CAP','PH-P',public.olap_reporting_date(),'Contribution',1000000::money);
INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled")
SELECT 'PH-L-'||x,'PH-'||x,'CI-LISA',public.olap_reporting_date()-60,10000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false FROM unnest(ARRAY['A','B','C','EMPTY','DEFAULT']) x;
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('PH-TODAY','PH-L-A',public.olap_reporting_date(),0::money,20::money),
 ('PH-PARTIAL','PH-L-A',public.olap_reporting_date()-1,100::money,20::money),
 ('PH-CROSS','PH-L-A',public.olap_reporting_date()-2,100::money,20::money),
 ('PH-ONTIME','PH-L-B',public.olap_reporting_date()-3,0::money,20::money),
 ('PH-TODAYCURE','PH-L-B',public.olap_reporting_date()-1,0::money,20::money),
 ('PH-REVERSE','PH-L-B',public.olap_reporting_date()-5,0::money,20::money),
 ('PH-OLDER','PH-L-C',public.olap_reporting_date()-40,0::money,20::money),
 ('PH-RECENT','PH-L-C',public.olap_reporting_date()-1,0::money,20::money),
 ('PH-SAMEDAY','PH-L-C',public.olap_reporting_date()-1,0::money,20::money),
 ('PH-OLDDEBT','PH-L-C',public.olap_reporting_date()-200,0::money,20::money),
 ('PH-ZERO','PH-L-C',public.olap_reporting_date()-2,0::money,0::money);
INSERT INTO "Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid") VALUES
 ('PH-R1','PH-L-A','PH-PARTIAL',public.olap_reporting_date()-1,100::money,10::money),
 ('PH-R2','PH-L-A','PH-CROSS',public.olap_reporting_date()-2,110::money,10::money),
 ('PH-R3','PH-L-B','PH-ONTIME',public.olap_reporting_date()-3,0::money,20::money),
 ('PH-R4','PH-L-B','PH-TODAYCURE',public.olap_reporting_date(),0::money,20::money),
 ('PH-R5','PH-L-B','PH-REVERSE',public.olap_reporting_date()-5,0::money,20::money),
 ('PH-R6','PH-L-B','PH-REVERSE',public.olap_reporting_date()-3,0::money,(-20)::money),
 ('PH-R7','PH-L-C','PH-OLDER',public.olap_reporting_date()-40,0::money,20::money),
 ('PH-R8','PH-L-C','PH-RECENT',public.olap_reporting_date()-1,0::money,20::money),
 ('PH-R9','PH-L-C','PH-SAMEDAY',public.olap_reporting_date()-1,0::money,20::money);
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.ph_assert((SELECT NOT is_overdue AND NOT history_eligible FROM reporting_charge_payment_health_v1 WHERE charge_id='PH-TODAY'),'due today excluded');
SELECT pg_temp.ph_assert((SELECT overdue_amount=10 AND current_days_overdue=1 AND NOT on_time FROM reporting_charge_payment_health_v1 WHERE charge_id='PH-PARTIAL'),'partial principal/interest');
SELECT pg_temp.ph_assert((SELECT overdue_amount=10 AND principal_remaining_current=0 AND interest_remaining_current=10 FROM reporting_charge_payment_health_v1 WHERE charge_id='PH-CROSS'),'cross component overpayment');
SELECT pg_temp.ph_assert((SELECT on_time AND historical_delay_days=0 AND NOT is_overdue FROM reporting_charge_payment_health_v1 WHERE charge_id='PH-ONTIME'),'on time');
SELECT pg_temp.ph_assert((SELECT NOT on_time AND NOT is_overdue AND historical_delay_days=1 FROM reporting_charge_payment_health_v1 WHERE charge_id='PH-TODAYCURE'),'today cure retains lateness');
SELECT pg_temp.ph_assert((SELECT on_time AND is_overdue AND final_settlement_date IS NULL AND historical_delay_days=5 FROM reporting_charge_payment_health_v1 WHERE charge_id='PH-REVERSE'),'reversal reopening');
SELECT pg_temp.ph_assert((SELECT NOT history_eligible AND exclusion_reason='Zero obligation' FROM reporting_charge_payment_health_v1 WHERE charge_id='PH-ZERO'),'zero obligation excluded');
SELECT pg_temp.ph_assert((SELECT overdue_amount=20 AND overdue_charge_count=2 AND oldest_unpaid_days=2 FROM reporting_borrower_payment_health_v1 WHERE borrower_id='PH-A'),'borrower aggregate');
SELECT pg_temp.ph_assert((SELECT rating_status='Unclassified' AND reliability_score IS NULL AND reliability_band IS NULL AND overdue_amount=0 FROM reporting_borrower_payment_health_v1 WHERE borrower_id='PH-EMPTY'),'empty score suppressed');
SELECT pg_temp.ph_assert((SELECT abs(recent_effective_weight-45.0/85)<0.000001 AND older_effective_weight=0 FROM reporting_borrower_payment_health_v1 WHERE borrower_id='PH-A'),'missing older reweight');
SELECT pg_temp.ph_assert((SELECT severe_risk_guard AND score_cap_applied AND reliability_score=60 AND oldest_unpaid_days=200 AND distinct_matured_due_dates=3 AND confidence='Established' FROM reporting_borrower_payment_health_v1 WHERE borrower_id='PH-C'),'old debt guard and distinct date confidence');
INSERT INTO "Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid") VALUES
 ('PH-R10','PH-L-B','PH-REVERSE',public.olap_reporting_date()-1,0::money,20::money);
SELECT pg_temp.ph_assert((SELECT final_settlement_date=public.olap_reporting_date()-1 AND historical_delay_days=4 AND NOT is_overdue FROM reporting_charge_payment_health_v1 WHERE charge_id='PH-REVERSE'),'final uninterrupted settlement');
SET CONSTRAINTS ALL DEFERRED;
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='PH-L-DEFAULT';
UPDATE "Loans" SET "Defaulted"=true,"Close Date"=public.olap_reporting_date(),"Closed By"='synthetic@example.invalid',"Loan Status"='ปิดยอดแล้ว' WHERE "Row ID"='PH-L-DEFAULT';
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.ph_assert((SELECT rating_status='Data review' AND reliability_score IS NULL AND recent_default AND default_count=1 AND recorded_default_loss>0 FROM reporting_borrower_payment_health_v1 WHERE borrower_id='PH-DEFAULT'),'default history suppression');
SELECT pg_temp.ph_assert(NOT EXISTS(SELECT 1 FROM reporting_borrower_matrix_v2 WHERE borrower_id='PH-DEFAULT'),'inactive absent from matrix');
SELECT pg_temp.ph_assert((SELECT count(*)=count(DISTINCT borrower_id) FROM reporting_borrower_payment_health_v1),'unique borrower key');
SELECT pg_temp.ph_assert((SELECT count(*)=(SELECT count(*) FROM "Borrowers") FROM reporting_borrower_payment_health_v1),'complete borrower coverage');
SELECT pg_temp.ph_assert(NOT EXISTS(SELECT 1 FROM reporting_borrower_payment_health_v1 WHERE abs(recent_effective_weight+older_effective_weight+delay_effective_weight+current_effective_weight-1)>0.000001),'weight sum');
SELECT pg_temp.ph_assert(NOT EXISTS(SELECT 1 FROM reporting_borrower_matrix_v2 WHERE equal_share<=0 OR reliability_score NOT BETWEEN 0 AND 100),'axis bounds');
SELECT pg_temp.ph_assert((SELECT sum(contribution_share) BETWEEN 0.999999 AND 1.000001 FROM reporting_borrower_matrix_v2),'shares sum');
SELECT pg_temp.ph_assert((SELECT "Overdue Amount"=20 FROM oltp_borrower_payment_health_v1 WHERE "Row ID"='PH-A'),'adapter parity');
SELECT pg_temp.ph_assert((SELECT "Ref Charge"='PH-CROSS' AND "Ref Borrower"='PH-A' FROM oltp_charge_payment_health_v1 WHERE "Row ID"='PH-CROSS'),'adapter refs');
-- Advance the reporting date only within this rolled-back disposable transaction.
CREATE OR REPLACE FUNCTION public.olap_reporting_date() RETURNS date LANGUAGE sql STABLE AS $$ SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date+1 $$;
SELECT pg_temp.ph_assert((SELECT is_overdue AND current_days_overdue=1 FROM reporting_charge_payment_health_v1 WHERE charge_id='PH-TODAY'),'date rollover without payment');
ROLLBACK;
SELECT 'Payment health: 22 SQL behavior assertions passed' AS result;
