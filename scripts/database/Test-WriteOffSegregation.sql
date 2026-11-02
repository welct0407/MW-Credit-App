\set ON_ERROR_STOP on
-- V128 (R116): principal write-offs apart from profit in the six income relations ("Cash Dashboard",
-- olap_portfolio_summary, reporting_income_statement, reporting_income_monthly, reporting_income_daily,
-- reporting_income_events). Fixtures in the style of Test-DefaultLoan.sql: 30 interest paid today and a 5 expense today,
-- then a partial default of 40 that keeps charges (V120 request path) and its undo, then a full write-off and close of 60
-- (the ordinary-source path) and its undo. Every figure is a delta from the state before the fixture (other suites may
-- leave committed rows). Asserted for every phase:
--   gross profit  (Cash Dashboard / statement "Operating Income MTD"; portfolio "Total Profit", "Today's Profit",
--                  "Realized Profit MTD", "Operating Income MTD"; monthly and daily "Operating Income"; events "Income") = 30;
--   write-offs    (every "Principal Write-offs MTD" / "Principal Write-offs") = the posted loss;
--   net profit    (Cash Dashboard / statement / portfolio "Net Profit MTD", portfolio "Net Profit", monthly / daily
--                  "Net Profit", daily "Net Profit Through Date") = gross - 5 - write-offs;
--   "Total Principal Loss" = the sum of the df10: postings of the fixture loans;
--   "Unsettled Profit MTD" = net profit MTD + the (negative) FIFO draws, as before V128, so it falls with a write-off;
--   the cash identity: "Business Cash Held" and "Cash Reconciliation Difference" keep their pre-write-off values, and
--   "Cash Pool Remaining" + "Unsettled Profit MTD" keeps its pre-write-off value (no cash moves; the pool regains the
--   written-off principal that unsettled profit loses).
-- Then the column positions: every existing column in place, the write-off column last. Rolled back.
BEGIN;
\ir Test-CashAccountFixtures.sql
SET LOCAL TIME ZONE 'Asia/Bangkok';
CREATE FUNCTION pg_temp.wo_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Write-off segregation assertion: %',label; END IF; END $$;
INSERT INTO public."Statistics"("Row ID") SELECT 'WO-ST' WHERE NOT EXISTS (SELECT 1 FROM public."Statistics");
CREATE FUNCTION pg_temp.wo_snapshot() RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object(
  'cd_income',c."Operating Income MTD",'cd_expenses',c."Expenses MTD",'cd_net',c."Net Profit MTD",'cd_writeoff',c."Principal Write-offs MTD",
  'cd_unsettled',c."Unsettled Profit MTD",'cd_draws',c."Tommy Withdrawn MTD"+c."Lisa Withdrawn MTD",'cd_pool',c."Cash Pool Remaining",'cd_held',c."Business Cash Held",
  'ps_total',p."Total Profit",'ps_today',p."Today's Profit",'ps_realized',p."Realized Profit MTD",'ps_income',p."Operating Income MTD",
  'ps_net',p."Net Profit",'ps_net_mtd',p."Net Profit MTD",'ps_expenses',p."Expenses MTD",'ps_writeoff',p."Principal Write-offs MTD",'ps_loss',p."Total Principal Loss",
  'st_income',s."Operating Income MTD",'st_net',s."Net Profit MTD",'st_writeoff',s."Principal Write-offs MTD",'st_unsettled',s."Unsettled Profit MTD",
  'st_difference',s."Cash Reconciliation Difference",
  'mo_income',m."Operating Income",'mo_expenses',m."Expenses",'mo_net',m."Net Profit",'mo_writeoff',m."Principal Write-offs",
  'da_income',y."Operating Income",'da_expenses',y."Expenses",'da_net',y."Net Profit",'da_through',y."Net Profit Through Date",'da_writeoff',y."Principal Write-offs",
  'ev_income',ev.income,'ev_expenses',ev.expenses,'ev_writeoff',ev.writeoff,
  'df10',(SELECT coalesce(sum("Principal Paid"::numeric),0) FROM public."Repayments" WHERE starts_with("Row ID",'df10:') AND "Ref Loans" LIKE 'WO-%'))
 FROM public."Cash Dashboard" c
 CROSS JOIN (SELECT * FROM public.olap_portfolio_summary LIMIT 1) p
 CROSS JOIN public.reporting_income_statement s
 CROSS JOIN (SELECT * FROM public.reporting_income_monthly WHERE "Is Current Month") m
 CROSS JOIN (SELECT * FROM public.reporting_income_daily WHERE "Date"=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date) y
 CROSS JOIN (SELECT coalesce(sum("Income"),0) income,coalesce(sum("Expenses"),0) expenses,coalesce(sum("Principal Write-offs"),0) writeoff
  FROM public.reporting_income_events WHERE "Date"=public.olap_reporting_date()) ev
$$;
CREATE TEMP TABLE wo_snapshots(label text PRIMARY KEY,value jsonb NOT NULL) ON COMMIT DROP;
INSERT INTO wo_snapshots VALUES ('base',pg_temp.wo_snapshot());
-- Every figure of a phase against the base, plus the cash identity against the phase before the write-off.
CREATE FUNCTION pg_temp.wo_phase(label text,gross numeric,writeoff numeric,loss numeric,compare_to text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE b jsonb:=(SELECT value FROM wo_snapshots WHERE wo_snapshots.label='base'); v jsonb:=pg_temp.wo_snapshot(); k text; want numeric; bad text:='';
 delta numeric;
BEGIN
 INSERT INTO wo_snapshots VALUES (label,v);
 FOR k,want IN SELECT key,value FROM jsonb_each_text(jsonb_build_object(
   'cd_income',gross,'ps_total',gross,'ps_today',gross,'ps_realized',gross,'ps_income',gross,'st_income',gross,'mo_income',gross,'da_income',gross,'ev_income',gross,
   'cd_writeoff',writeoff,'ps_writeoff',writeoff,'st_writeoff',writeoff,'mo_writeoff',writeoff,'da_writeoff',writeoff,'ev_writeoff',writeoff,
   'cd_net',gross-5-writeoff,'ps_net',gross-5-writeoff,'ps_net_mtd',gross-5-writeoff,'st_net',gross-5-writeoff,'mo_net',gross-5-writeoff,
   'da_net',gross-5-writeoff,'da_through',gross-5-writeoff,
   'cd_expenses',-5,'ps_expenses',5,'mo_expenses',5,'da_expenses',5,'ev_expenses',5,'ps_loss',loss,'df10',loss)) AS x(key,value) LOOP
  delta:=(v->>k)::numeric-(b->>k)::numeric;
  IF delta IS DISTINCT FROM want THEN bad:=bad||format(' %s=%s (want %s)',k,delta,want); END IF;
 END LOOP;
 IF bad<>'' THEN RAISE EXCEPTION 'Write-off segregation %:%',label,bad; END IF;
 PERFORM pg_temp.wo_assert((v->>'cd_unsettled')::numeric=(v->>'cd_net')::numeric+(v->>'cd_draws')::numeric
   AND (v->>'st_unsettled')::numeric=(v->>'cd_unsettled')::numeric,label||': unsettled profit = net profit MTD less the FIFO draws');
 IF compare_to IS NOT NULL THEN
  b:=(SELECT value FROM wo_snapshots WHERE wo_snapshots.label=compare_to);
  PERFORM pg_temp.wo_assert(v->'cd_held' IS NOT DISTINCT FROM b->'cd_held' AND v->'st_difference' IS NOT DISTINCT FROM b->'st_difference'
    AND (v->>'cd_pool')::numeric+(v->>'cd_unsettled')::numeric=(b->>'cd_pool')::numeric+(b->>'cd_unsettled')::numeric,
   label||': cash held, the reconciliation difference and cash pool + unsettled keep their '||compare_to||' values');
 END IF;
END $$;
-- Fixture: two daily-interest loans; 30 interest paid today on WO-1, an unpaid charge on each, a 5 expense today.
INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES('WO-B','SYNTHETIC WRITE-OFF');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('WO-PARTNER','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
VALUES('WO-CAPITAL','WO-PARTNER',current_date-10,'Contribution',5000::money);
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest")
VALUES('CI-LISA','WO-1','WO-B',current_date-5,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money),
      ('CI-LISA','WO-2','WO-B',current_date-5,60::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,6::money);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
('WO-1-paid','WO-1',current_date-2,0::money,30::money),('WO-1-due','WO-1',current_date-1,0::money,10::money),('WO-2-due','WO-2',current_date-1,0::money,6::money);
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status")
VALUES ('CI-DAD','WO-pay','WO-B','WO-1-paid',30::money,current_date,'Single Full','Processing');
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Ref Paid By Cash Account","Ref Paid By Cash Holder")
VALUES('WO-EXPENSE',current_date,'Other',5::money,'CI-DAD','ch:dad');
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" IN ('WO-1','WO-2');
SELECT pg_temp.wo_assert((SELECT sum("Interest Paid"::numeric)=30 AND sum("Principal Paid"::numeric)=0 FROM "Repayments" WHERE "Ref Loans"='WO-1'),'fixture: 30 interest paid');
-- Before any write-off: write-offs 0, gross 30, net 25.
SELECT pg_temp.wo_phase('before write-off',30,0,0);
-- A partial default of 40 that keeps the charges (the V120 request of pwa_apply_loan_source_v2).
SELECT set_config('business_crud.default_request',jsonb_build_object('loan','WO-1','op','post','date',current_date::text,'amount','40','keepCharges',true,'actor','synthetic@example.invalid')::text,true);
UPDATE "Loans" SET "Default Loss Amount"=(coalesce("Default Loss Amount"::numeric,0)+40)::money WHERE "Row ID"='WO-1';
SELECT pg_temp.wo_assert((SELECT "Default Loss Amount"=40::money AND "Loan Status"='ยังไม่ปิดยอด' AND "Outstanding Principal"=60 FROM "Loans" WHERE "Row ID"='WO-1'),'partial default keeps the loan open at 60');
SELECT pg_temp.wo_assert((SELECT count(*)=1 AND sum("Principal Paid"::numeric)=40 AND sum("Interest Paid"::numeric)=-40 AND min("Payment Date")=current_date
 FROM "Repayments" WHERE "Ref Loans"='WO-1' AND starts_with("Row ID",'df10:')),'one zero-cash loss pair of 40 dated today');
-- gross 30, write-offs 40, net -15, Realized 30; Total Principal Loss 40; the cash identity keeps its pre-write-off values.
SELECT pg_temp.wo_phase('partial default 40',30,40,40,'before write-off');
SELECT pg_temp.wo_assert((SELECT (s.value->>'cd_unsettled')::numeric-(b.value->>'cd_unsettled')::numeric=-40 FROM wo_snapshots s,wo_snapshots b
 WHERE s.label='partial default 40' AND b.label='before write-off'),'unsettled profit MTD falls by the write-off, as before V128');
-- Undo Default: write-offs 0.
SELECT set_config('business_crud.default_request',jsonb_build_object('loan','WO-1','op','undo','actor','synthetic@example.invalid')::text,true);
UPDATE "Loans" SET "Defaulted"=false WHERE "Row ID"='WO-1';
SELECT pg_temp.wo_assert((SELECT "Default Loss Amount" IS NULL AND "Outstanding Principal"=100 FROM "Loans" WHERE "Row ID"='WO-1'),'undo restores the principal');
SELECT pg_temp.wo_phase('partial undo',30,0,0,'before write-off');
-- A full write-off and close of WO-2 (the ordinary-source path): gross 30, write-offs 60, net -35.
UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic@example.invalid' WHERE "Row ID"='WO-2';
SELECT pg_temp.wo_assert((SELECT "Defaulted" AND "Loan Status"='ปิดยอดแล้ว' AND "Default Loss Amount"=60::money FROM "Loans" WHERE "Row ID"='WO-2'),'full write-off closes the loan');
SELECT pg_temp.wo_phase('write off and close 60',30,60,60,'before write-off');
UPDATE "Loans" SET "Defaulted"=false WHERE "Row ID"='WO-2';
SELECT pg_temp.wo_phase('write-off undo',30,0,0,'before write-off');
-- Column positions: the existing columns in place, the write-off column appended last.
SELECT pg_temp.wo_assert((SELECT array_agg(attname::text ORDER BY attnum DESC) FROM (SELECT attname,attnum FROM pg_attribute
  WHERE attrelid=r.rel::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum DESC LIMIT 2) a)=ARRAY[r.appended,r.previous]
  AND (SELECT count(*) FROM pg_attribute WHERE attrelid=r.rel::regclass AND attnum>0 AND NOT attisdropped)=r.width
  AND (SELECT attnum FROM pg_attribute WHERE attrelid=r.rel::regclass AND attname=r.income)=r.income_position,r.rel||' column positions')
FROM (VALUES ('public."Cash Dashboard"','Principal Write-offs MTD','Business Cash Held',10,'Operating Income MTD',2),
 ('public.olap_portfolio_summary','Principal Write-offs MTD','Total Principal Loss',45,'Operating Income MTD',42),
 ('public.reporting_income_statement','Principal Write-offs MTD','Cash Reconciliation Status',19,'Operating Income MTD',5),
 ('public.reporting_income_monthly','Principal Write-offs','In Last 12 Months',10,'Operating Income',2),
 ('public.reporting_income_daily','Principal Write-offs','Net Profit Through Date',14,'Operating Income',3),
 ('public.reporting_income_events','Principal Write-offs','Expenses',5,'Income',3)) r(rel,appended,previous,width,income,income_position);
SELECT 'Write-off segregation regressions passed' AS result;
ROLLBACK;
