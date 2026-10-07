\set ON_ERROR_STOP on
BEGIN;
\ir Test-CashAccountFixtures.sql
CREATE FUNCTION pg_temp.bp_assert(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Borrower pages: %',msg; END IF; END $$;
INSERT INTO "Borrowers"("Row ID","Borrower Name","Description","Hidden Flag") VALUES
 ('BP-A','Synthetic A','Duplicate label',false),('BP-B','Synthetic B','Duplicate label',true),('BP-E','Synthetic empty','Empty',false);
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('BP-P','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
VALUES('BP-CAP','BP-P',public.olap_reporting_date(),'Contribution',1000000::money);
INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled") VALUES
 ('BP-L1','BP-A','CI-LISA',public.olap_reporting_date()-60,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false),
 ('BP-L2','BP-A','CI-LISA',public.olap_reporting_date()-1,2000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false),
 ('BP-L3','BP-A','CI-LISA',public.olap_reporting_date()-1,3000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false),
 ('BP-L4','BP-B','CI-LISA',public.olap_reporting_date()-30,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('BP-C1','BP-L1',public.olap_reporting_date()-30,100::money,100::money),
 ('BP-C2','BP-L2',public.olap_reporting_date()-1,100::money,100::money),
 ('BP-C3','BP-L4',public.olap_reporting_date()-30,0::money,100::money);
INSERT INTO "Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid") VALUES
 ('BP-R1','BP-L1','BP-C1',public.olap_reporting_date()-30,40::money,50::money),
 ('BP-R2','BP-L1','BP-C1',public.olap_reporting_date()-30,60::money,50::money),
 ('BP-R3','BP-L2','BP-C2',public.olap_reporting_date()-1,10::money,20::money),
 ('BP-R4','BP-L2','BP-C2',public.olap_reporting_date()-1,(-10)::money,(-30)::money),
 ('BP-R5','BP-L2','BP-C2',public.olap_reporting_date(),0::money,99::money),
 ('BP-R6','BP-L4','BP-C3',public.olap_reporting_date()-30,0::money,(-5)::money);
SET CONSTRAINTS ALL IMMEDIATE;
CREATE TEMP TABLE bp_period AS SELECT * FROM reporting_borrower_period_v1(public.olap_reporting_date()-30,public.olap_reporting_date()-1);
SELECT pg_temp.bp_assert((SELECT count(*)=2 FROM bp_period WHERE borrower_id LIKE 'BP-%'),'one row per borrower, empty excluded');
SELECT pg_temp.bp_assert((SELECT count(DISTINCT borrower_label)=2 FROM bp_period WHERE borrower_id LIKE 'BP-%'),'duplicate names disambiguated');
SELECT pg_temp.bp_assert((SELECT principal_issued=5000 AND loans_issued=2 AND repeat_loans=2 AND first_loans=0 FROM bp_period WHERE borrower_id='BP-A'),'first loan before range; no fanout');
SELECT pg_temp.bp_assert((SELECT interest_received=90 AND principal_returned=100 FROM bp_period WHERE borrower_id='BP-A'),'signed allocation sums and completed boundary');
SELECT pg_temp.bp_assert((SELECT interest_received=-5 AND first_loans=1 AND hidden_flag FROM bp_period WHERE borrower_id='BP-B'),'negative and hidden retained');
SELECT pg_temp.bp_assert((SELECT interest_received=189 FROM reporting_borrower_period_v1(public.olap_reporting_date()-30,public.olap_reporting_date()) WHERE borrower_id='BP-A'),'today explicit');
SELECT pg_temp.bp_assert((SELECT loan_count=0 AND active_loans=0 AND outstanding_principal=0 FROM reporting_borrower_directory_v1 WHERE borrower_id='BP-E'),'empty detail source');
SELECT pg_temp.bp_assert((SELECT count(*)=0 FROM reporting_borrower_period_v1(public.olap_reporting_date(),public.olap_reporting_date()-1)),'inverted range empty');
SELECT pg_temp.bp_assert((SELECT count(*)=0 FROM reporting_borrower_period_v1(public.olap_reporting_date(),public.olap_reporting_date()+1)),'future end rejected');
SELECT pg_temp.bp_assert((SELECT count(*)=0 FROM reporting_borrower_period_v1(public.olap_reporting_date()-30,public.olap_reporting_date()-1,'invalid')),'invalid population empty');
SELECT pg_temp.bp_assert((SELECT sum(principal_issued)=6000 AND sum(loans_issued)=3 FROM bp_period WHERE borrower_id LIKE 'BP-%'),'period issued reconciliation');
SELECT pg_temp.bp_assert((SELECT borrowing_type='Repeat loan' FROM reporting_borrower_loan_facts_v1 WHERE loan_id='BP-L3'),'same-day stable loan sequence');
SELECT pg_temp.bp_assert((SELECT count(*)=count(DISTINCT borrower_id) FROM reporting_borrower_directory_v1),'unique directory key');
SELECT pg_temp.bp_assert((SELECT count(*)=count(DISTINCT (borrower_id,activity_date)) FROM reporting_borrower_activity_daily_v1),'unique daily grain');
SELECT pg_temp.bp_assert((SELECT bool_and(first_loans+repeat_loans+unclassified_loans=loans_issued) FROM bp_period),'first repeat partition');
SELECT pg_temp.bp_assert((SELECT p.interest_received=m.contribution_30d FROM bp_period p JOIN reporting_borrower_matrix_v3 m USING(borrower_id) WHERE p.borrower_id='BP-A'),'existing matrix contribution unchanged');
SELECT pg_temp.bp_assert(NOT has_function_privilege('public','reporting_borrower_period_v1(date,date,text)','EXECUTE'),'no public function execute');
ROLLBACK;
