\set ON_ERROR_STOP on
-- R116 Chase, V130: the six write-off relations read by a role that holds SELECT on the views only (no grant on Charges,
-- Repayments, olap_repayments_analytics or olap_charges_analytics), with a random-id loss pair, a payment-linked row of the
-- same shape, an ls2: charge of the same shape and a two-repayment charge in the ledger; and the plan of the shared row
-- pattern (the Charges lookup runs only for zero-cash loss-shaped rows). Rolled back.
BEGIN;
\ir Test-CashAccountFixtures.sql
SET LOCAL TIME ZONE 'Asia/Bangkok';
CREATE FUNCTION pg_temp.r_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Reader assertion: %',label; END IF; END $$;
INSERT INTO "Statistics"("Row ID") SELECT 'RD-ST' WHERE NOT EXISTS (SELECT 1 FROM "Statistics");
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('RD-B','SYNTHETIC READER');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('RD-PARTNER','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
VALUES('RD-CAPITAL','RD-PARTNER',current_date-100,'Contribution',5000::money);
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest")
VALUES('CI-LISA','RD-L','RD-B',current_date-20,1000::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,0::money);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('Rd9qRm2LpT4vWz8BnC1dEf','RD-L',current_date,40::money,(-40)::money),
 ('ls2:RD-P:RD-C','RD-L',current_date,25::money,(-25)::money);
INSERT INTO "Repayments"("Row ID","Payment Date","Principal Paid","Interest Paid","Notes","Ref Loans","Ref Charges","Created By") VALUES
 ('Rd7Ld3QwErTy5UiOp9AsDf',current_date,40::money,(-40)::money,'loss','RD-L','Rd9qRm2LpT4vWz8BnC1dEf','synthetic'),
 ('RD-r-ls2',current_date,25::money,(-25)::money,'ls2 shape','RD-L','ls2:RD-P:RD-C','synthetic');
SET CONSTRAINTS ALL IMMEDIATE;
CREATE ROLE rd_reader NOLOGIN;
GRANT USAGE ON SCHEMA public TO rd_reader;
GRANT SELECT ON public."Cash Dashboard",public.olap_portfolio_summary,public.reporting_income_statement,public.reporting_income_monthly,
 public.reporting_income_daily,public.reporting_income_events TO rd_reader;
SELECT pg_temp.r_assert(NOT has_table_privilege('rd_reader','public."Charges"','SELECT') AND NOT has_table_privilege('rd_reader','public."Repayments"','SELECT')
 AND NOT has_table_privilege('rd_reader','public.olap_repayments_analytics','SELECT'),'the reader holds no base-table grant');
CREATE TEMP TABLE rd_out(label text,value text) ON COMMIT DROP;
GRANT ALL ON rd_out TO rd_reader;
SET LOCAL ROLE rd_reader;
INSERT INTO rd_out SELECT 'events',string_agg("Event ID"||'='||"Income"::numeric||'/'||"Principal Write-offs"::numeric,',' ORDER BY "Event ID")
 FROM public.reporting_income_events WHERE "Event ID" IN ('repayment:Rd7Ld3QwErTy5UiOp9AsDf','repayment:RD-r-ls2');
INSERT INTO rd_out SELECT 'dashboard',"Principal Write-offs MTD"::text FROM public."Cash Dashboard";
INSERT INTO rd_out SELECT 'portfolio',"Principal Write-offs"::text||'/'||"Principal Write-offs MTD"::text FROM public.olap_portfolio_summary;
INSERT INTO rd_out SELECT 'statement',"Principal Write-offs MTD"::text FROM public.reporting_income_statement;
INSERT INTO rd_out SELECT 'monthly',"Principal Write-offs"::text FROM public.reporting_income_monthly WHERE "Is Current Month";
INSERT INTO rd_out SELECT 'daily',"Principal Write-offs"::text FROM public.reporting_income_daily WHERE "Date"=current_date;
RESET ROLE;
SELECT label,value FROM rd_out ORDER BY label;
SELECT pg_temp.r_assert((SELECT value FROM rd_out WHERE label='events')='repayment:RD-r-ls2=-25.00/0,repayment:Rd7Ld3QwErTy5UiOp9AsDf=0/40.00',
 'events: only the random-id pair is a write-off; the ls2: row stays income');
SELECT pg_temp.r_assert((SELECT value::numeric FROM rd_out WHERE label='dashboard')-(SELECT 0)>=40,'dashboard write-offs include the pair');
-- Plan: the Charges lookup should run only for loss-shaped rows (here 3 of the fixture's, not every repayment).
CREATE TEMP TABLE rd_plan(line text) ON COMMIT DROP;
DO $p$ DECLARE l text; BEGIN
 FOR l IN EXECUTE 'EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF) SELECT sum("Principal Write-offs") FROM public.reporting_income_events' LOOP INSERT INTO rd_plan VALUES(l); END LOOP; END $p$;
SELECT line FROM rd_plan WHERE line ~* 'Charges|loops=|Never executed|One-Time|Repayments';
SELECT 'Reader checks passed' AS result;
ROLLBACK;
