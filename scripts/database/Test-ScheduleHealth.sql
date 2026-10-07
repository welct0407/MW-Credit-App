\set ON_ERROR_STOP on
BEGIN;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.sh_assert(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Schedule health: %',msg; END IF; END $$;
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES ('SH-A','Synthetic normal'),('SH-B','Synthetic arrangement'),('SH-C','Synthetic anchor'),('SH-D','Synthetic deferred lump sum');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('SH-P','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
VALUES('SH-CAP','SH-P',public.olap_reporting_date(),'Contribution',1000000::money);
INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval")
SELECT 'SH-L-'||x,'SH-'||x,'CI-LISA',public.olap_reporting_date()-20,10000::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',false,100::money,1
FROM unnest(ARRAY['A','B','C','D']) x;
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
SELECT 'SH-CH-A-'||n,'SH-L-A',public.olap_reporting_date()-n,0::money,100::money FROM generate_series(1,20) n;
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
SELECT 'SH-CH-B-'||n,'SH-L-B',public.olap_reporting_date()-n,0::money,20::money FROM generate_series(1,20) n;
INSERT INTO "Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid")
SELECT 'SH-R-'||"Row ID","Ref Loans","Row ID","Charge Date",0::money,"Interest Due" FROM "Charges" WHERE "Row ID" LIKE 'SH-CH-%';
UPDATE "Loans" SET "Interest Payment Interval"=3,"Interest Schedule Anchor Date"=public.olap_reporting_date()-10 WHERE "Row ID"='SH-L-C';
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('SH-C-ANCHOR','SH-L-C',public.olap_reporting_date()-10,0::money,1100::money),
 ('SH-C-7','SH-L-C',public.olap_reporting_date()-7,0::money,300::money),
 ('SH-C-4','SH-L-C',public.olap_reporting_date()-4,0::money,300::money),
 ('SH-C-1','SH-L-C',public.olap_reporting_date()-1,0::money,300::money),
 ('SH-B-FUTURE','SH-L-B',public.olap_reporting_date()+5,1000::money,200::money);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
VALUES('SH-D-LUMP','SH-L-D',public.olap_reporting_date()-1,0::money,2000::money);
INSERT INTO "Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid")
VALUES('SH-D-PAID','SH-L-D','SH-D-LUMP',public.olap_reporting_date()-1,0::money,2000::money);
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.sh_assert((SELECT expected_interest_30d=2000 AND recorded_interest_30d=2000 AND NOT modified_schedule FROM reporting_loan_schedule_health_v1 WHERE loan_id='SH-L-A'),'auto-off with matching plan not a flag');
SELECT pg_temp.sh_assert((SELECT interest_coverage_30d=.2 AND modified_schedule AND next_plan_due_date=reporting_date+5 AND next_plan_principal=1000 FROM reporting_loan_schedule_health_v1 WHERE loan_id='SH-L-B'),'concession signal, future separate');
SELECT pg_temp.sh_assert((SELECT expected_interest_30d=900 AND recorded_interest_30d=900 AND comparison_start=reporting_date-9 AND NOT schedule_departure FROM reporting_loan_schedule_health_v1 WHERE loan_id='SH-L-C'),'post-anchor comparison excludes old regime');
SELECT pg_temp.sh_assert((SELECT arrangement_gate AND reliability_score=100 AND quadrant='Dog' AND payment_only_quadrant='Cash Cow' AND category_adjusted FROM reporting_borrower_matrix_v3 WHERE borrower_id='SH-B'),'automatic amount restriction, unchanged score');
SELECT pg_temp.sh_assert((SELECT NOT arrangement_gate AND quadrant='Star' FROM reporting_borrower_matrix_v3 WHERE borrower_id='SH-A'),'normal manually maintained schedule remains eligible');
SELECT pg_temp.sh_assert((SELECT interest_coverage_30d=1 AND interest_date_coverage_30d=.05 AND modified_schedule FROM reporting_loan_schedule_health_v1 WHERE loan_id='SH-L-D'),'lump-sum catch-up cannot hide deferral');
SELECT pg_temp.sh_assert((SELECT arrangement_gate AND quadrant='Question Mark' AND reliability_score=100 FROM reporting_borrower_matrix_v3 WHERE borrower_id='SH-D'),'automatic frequency restriction on high contributor');
SELECT pg_temp.sh_assert(NOT EXISTS(SELECT 1 FROM reporting_borrower_matrix_v3 n JOIN reporting_borrower_matrix_v2 o USING(borrower_id) WHERE n.reliability_score IS DISTINCT FROM o.reliability_score OR n.relative_contribution IS DISTINCT FROM o.relative_contribution),'score and contribution parity');
SELECT pg_temp.sh_assert((SELECT count(*)=count(DISTINCT borrower_id) FROM reporting_borrower_schedule_health_v1),'unique borrower grain');
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='SH-L-B';
SELECT pg_temp.sh_assert((SELECT NOT arrangement_gate AND quadrant='Cash Cow' FROM reporting_borrower_matrix_v3 WHERE borrower_id='SH-B'),'automatic re-evaluation without review records');
-- Current Daily Interest is now derived once an original basis is recorded.
-- An invalid interval still exercises the same source-review guard.
UPDATE "Loans" SET "Interest Payment Interval"=0 WHERE "Row ID"='SH-L-C';
SELECT pg_temp.sh_assert((SELECT comparison_status='Source review' AND NOT modified_schedule AND interest_coverage_30d IS NULL FROM reporting_loan_schedule_health_v1 WHERE loan_id='SH-L-C'),'invalid setup withheld');
ROLLBACK;
