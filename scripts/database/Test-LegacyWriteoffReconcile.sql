\set ON_ERROR_STOP on
-- V130 (R116): reconcile_legacy_default_postings on an upgraded database. Test-LegacyWriteoffReconcile-Before.sql (run at
-- V9) left LWR-LEGACY: closed and Defaulted with "Default Loss Amount" 500 and no df10: pair, 70 interest paid in its
-- close month (two months ago). Here, at the head: a correctly posted default (LWR-POSTED, write off and close today) and an
-- open partial loss (LWR-PARTIAL, 30 kept-charges posting today) as controls, 300 interest today and a completed partner
-- settlement of 150 today (so the FIFO draw of this month depends on the prior months' net profit). Asserted:
--   dry run lists only LWR-LEGACY (500, ledger 0, dated on its Close Date) and writes nothing;
--   the refusals raise: a recorded loss below the ledger, and outstanding principal below the unposted loss;
--   apply posts one zero-cash pair on the Close Date; the Loans column, Defaulted, status and dates are unchanged and the
--   outstanding principal is 0; "Total Principal Loss" = "Principal Write-offs"; Total Profit - Total Business Expenses -
--   Principal Write-offs = Net Profit; the close month shows write-offs 500 and net -500 more, gross unchanged;
--   the cash identity: "Business Cash Held" unchanged, "Cash Pool Remaining" +500 (the written-off principal is no longer
--   outstanding), "Unsettled Profit MTD" -R where R is the FIFO recovery (this month's draw grows because the prior months'
--   net fell by 500: before, prior net 70 absorbs 70 of the 150 settled, so this month's draw is 80; after, prior net -430
--   absorbs nothing and the draw is 150, R = 70), so "Cash Reconciliation Difference" changes by -500 + R = -430;
--   Daily Analytics from the Close Date through today matches the ledger (interest, principal returned, outstanding);
--   a rerun returns no row and posts nothing; the controls are untouched; only the owner may execute. Rolled back.
-- The operator's dry run is READ ONLY: it lists the legacy loan without a lock or a write.
BEGIN READ ONLY;
SELECT count(*)=1 AND bool_and(loan='LWR-LEGACY' AND action='would post') AS lwr_read_only_ok FROM public.reconcile_legacy_default_postings(NULL,false) \gset
ROLLBACK;
\if :lwr_read_only_ok
\else
SELECT 'Legacy write-off reconciliation assertion: the read-only dry run' AS failed, 1/0;
\endif
BEGIN;
\ir Test-CashAccountFixtures.sql
SET LOCAL TIME ZONE 'Asia/Bangkok';
CREATE FUNCTION pg_temp.lwr_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Legacy write-off reconciliation assertion: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.lwr_reject(command text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%'||expected||'%' THEN RAISE; END IF; RETURN; END;
 RAISE EXCEPTION 'Expected rejection: %',expected;
END $$;
-- The AppSheet-era loan has no disbursing account; its history resolves to the holder's default account (as in DEV/PROD).
UPDATE "Cash Accounts" SET "Default Account"=true WHERE "Row ID"='CI-LISA' AND NOT EXISTS(SELECT 1 FROM "Cash Accounts" WHERE "Ref Cash Holder"='ch:lisa' AND "Default Account");
INSERT INTO "Statistics"("Row ID") SELECT 'LWR-ST' WHERE NOT EXISTS (SELECT 1 FROM "Statistics");
SELECT pg_temp.lwr_assert((SELECT coalesce("Defaulted",false) AND "Default Loss Amount"=500::money AND "Loan Status"='ปิดยอดแล้ว' AND "Outstanding Principal"=500
 AND NOT EXISTS(SELECT 1 FROM "Repayments" WHERE "Ref Loans"='LWR-LEGACY' AND starts_with("Row ID",'df10:')) FROM "Loans" WHERE "Row ID"='LWR-LEGACY'),
 'pre-fixture: a Defaulted loan with a recorded loss and no ledger pair survives the upgrade');
-- Controls and this month's activity.
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest") VALUES
 ('CI-LISA','LWR-POSTED','LWR-B',current_date-5,60::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,6::money),
 ('CI-LISA','LWR-PARTIAL','LWR-B',current_date-5,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,10::money),
 ('CI-LISA','LWR-NOW','LWR-B',current_date-3,1000::money,'กำหนดวันชำระ','ยังไม่ปิดยอด',false,0::money);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
 ('LWR-PARTIAL-due','LWR-PARTIAL',current_date-1,0::money,10::money),('LWR-NOW-c','LWR-NOW',current_date,0::money,300::money);
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status")
 VALUES('CI-DAD','LWR-NOW-p','LWR-B','LWR-NOW-c',300::money,current_date,'Single Full','Processing');
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" IN ('LWR-POSTED','LWR-PARTIAL');
UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"='synthetic@example.invalid' WHERE "Row ID"='LWR-POSTED';
SELECT set_config('business_crud.default_request',jsonb_build_object('loan','LWR-PARTIAL','op','post','date',current_date::text,'amount','30','keepCharges',true,'actor','synthetic@example.invalid')::text,true);
UPDATE "Loans" SET "Default Loss Amount"=30::money WHERE "Row ID"='LWR-PARTIAL';
INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status","Settlement Date","Transfer Date","Ref Paid From Cash Account")
 VALUES('LWR-S','LWR-A',150::money,'Completed',current_date,current_date,'CI-LISA');
SELECT pg_temp.lwr_assert((SELECT "Default Loss Amount"=60::money FROM "Loans" WHERE "Row ID"='LWR-POSTED') AND (SELECT "Default Loss Amount"=30::money AND "Loan Status"='ยังไม่ปิดยอด' FROM "Loans" WHERE "Row ID"='LWR-PARTIAL'),
 'controls: a correctly posted default and an open partial loss');
-- Fire the setup's deferred cache and history triggers, then return to the default mode (every deferrable constraint of the
-- schema is initially deferred), so the apply below runs deferred exactly as the operator's transaction does.
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
-- Snapshots before: the summaries, the controls' rows, and Daily Analytics built through today.
SELECT public.refresh_daily_analytics((SELECT "Close Date" FROM "Loans" WHERE "Row ID"='LWR-LEGACY'),current_date);
CREATE TEMP TABLE lwr_state ON COMMIT DROP AS SELECT 'before'::text label,to_jsonb(p) portfolio,to_jsonb(s) statement,to_jsonb(c) cash,
 (SELECT to_jsonb(m) FROM public.reporting_income_monthly m WHERE m."Month"=date_trunc('month',(SELECT "Close Date" FROM "Loans" WHERE "Row ID"='LWR-LEGACY'))::date) close_month,
 (SELECT jsonb_agg(to_jsonb(l) ORDER BY l."Row ID") FROM "Loans" l WHERE l."Row ID" IN ('LWR-LEGACY','LWR-POSTED','LWR-PARTIAL')) loans,
 (SELECT jsonb_agg(to_jsonb(x) ORDER BY x."Row ID") FROM (SELECT * FROM "Charges" WHERE "Ref Loans" IN ('LWR-POSTED','LWR-PARTIAL') UNION ALL SELECT * FROM "Charges" WHERE "Ref Loans"='LWR-LEGACY') x) charges,
 (SELECT jsonb_agg(to_jsonb(x) ORDER BY x."Row ID") FROM "Repayments" x WHERE x."Ref Loans" IN ('LWR-POSTED','LWR-PARTIAL')) control_repayments
 FROM (SELECT * FROM public.olap_portfolio_summary LIMIT 1) p,public.reporting_income_statement s,public."Cash Dashboard" c;
-- Dry run: only the legacy loan, dated on its Close Date; nothing written.
SELECT pg_temp.lwr_assert((SELECT array_agg(jsonb_build_array(loan,close_date::text,column_amount,ledger_amount,posting_id,action)::text)
  FROM public.reconcile_legacy_default_postings(NULL,false))
 =ARRAY[jsonb_build_array('LWR-LEGACY',l."Close Date"::text,500.00,0,'df10:10:LWR-LEGACY:'||l."Close Date"::text,'would post')::text],'dry run lists only the legacy loan')
FROM "Loans" l WHERE l."Row ID"='LWR-LEGACY';
SELECT pg_temp.lwr_assert(NOT EXISTS(SELECT 1 FROM "Repayments" WHERE "Ref Loans"='LWR-LEGACY' AND starts_with("Row ID",'df10:'))
 AND NOT EXISTS(SELECT 1 FROM "Charges" WHERE "Ref Loans"='LWR-LEGACY' AND starts_with("Row ID",'df10:')),'dry run writes nothing');
SELECT pg_temp.lwr_reject($q$SELECT * FROM public.reconcile_legacy_default_postings(' ',true)$q$,'requires p_apply and, to apply, the actor');
-- Refusals raise rather than skip (each in a savepoint, rolled back).
SAVEPOINT refusal;
INSERT INTO "Repayments"("Row ID","Payment Date","Principal Paid","Interest Paid","Notes","Ref Loans","Created By")
 VALUES('df10:10:LWR-POSTED:extra',current_date,10::money,(-10)::money,'synthetic ledger above the column','LWR-POSTED','synthetic@example.invalid');
SELECT pg_temp.lwr_reject($q$SELECT * FROM public.reconcile_legacy_default_postings(NULL,false)$q$,'is below the ledger');
ROLLBACK TO refusal;
INSERT INTO "Repayments"("Row ID","Payment Date","Principal Paid","Interest Paid","Notes","Ref Loans","Created By")
 VALUES('LWR-LEGACY-principal',(SELECT "Close Date" FROM "Loans" WHERE "Row ID"='LWR-LEGACY'),450::money,0::money,'synthetic principal receipt','LWR-LEGACY','synthetic@example.invalid');
SELECT pg_temp.lwr_reject($q$SELECT * FROM public.reconcile_legacy_default_postings('synthetic@example.invalid',true)$q$,'outstanding principal 50');
ROLLBACK TO refusal;
-- Apply.
CREATE TEMP TABLE lwr_applied ON COMMIT DROP AS SELECT * FROM public.reconcile_legacy_default_postings('synthetic-owner@example.invalid',true);
SELECT pg_temp.lwr_assert((SELECT count(*)=1 AND bool_and(loan='LWR-LEGACY' AND action='posted' AND column_amount=500 AND ledger_amount=0) FROM lwr_applied),'apply returns the posted row');
-- The cached loan totals (vc_repayment_changed) and the history flush are deferred constraint triggers; fire them as the
-- operator's commit does, so every read below sees the committed state.
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.lwr_assert((SELECT count(*)=1 AND bool_and(c."Charge Date"=l."Close Date" AND c."Principal Due"=500::money AND c."Interest Due"=(-500)::money AND c."Notes" LIKE '%R116 legacy reconciliation')
  FROM "Charges" c JOIN "Loans" l ON l."Row ID"=c."Ref Loans" WHERE c."Ref Loans"='LWR-LEGACY' AND c."Row ID"='df10:10:LWR-LEGACY:'||l."Close Date"::text)
 AND (SELECT count(*)=1 AND bool_and(r."Payment Date"=l."Close Date" AND r."Principal Paid"=500::money AND r."Interest Paid"=(-500)::money AND r."Ref Payment" IS NULL
   AND r."Ref Charges"=r."Row ID" AND r."Created By"='synthetic-owner@example.invalid' AND r."Notes" LIKE '%R116 legacy reconciliation')
  FROM "Repayments" r JOIN "Loans" l ON l."Row ID"=r."Ref Loans" WHERE r."Ref Loans"='LWR-LEGACY' AND starts_with(r."Row ID",'df10:')),'one zero-cash pair on the Close Date, the V120 shape');
SELECT pg_temp.lwr_assert((SELECT l."Default Loss Amount"=500::money AND coalesce(l."Defaulted",false) AND l."Loan Status"=b->>'Loan Status' AND l."Close Date"::text=b->>'Close Date'
  AND l."Loan Date"::text=b->>'Loan Date' AND l."Closed By"=b->>'Closed By' AND l."Outstanding Principal"=0
 FROM "Loans" l,lwr_state s CROSS JOIN LATERAL jsonb_array_elements(s.loans) b WHERE s.label='before' AND b->>'Row ID'='LWR-LEGACY' AND l."Row ID"='LWR-LEGACY'),
 'the Loans column, Defaulted, status and dates are unchanged; outstanding principal 0');
SELECT pg_temp.lwr_assert((SELECT p."Total Principal Loss"=p."Principal Write-offs" AND p."Total Profit"-p."Total Business Expenses"-p."Principal Write-offs"=p."Net Profit"
  AND p."Principal Write-offs"-(s.portfolio->>'Principal Write-offs')::numeric=500 AND p."Total Profit"=(s.portfolio->>'Total Profit')::numeric
  AND p."Net Profit"-(s.portfolio->>'Net Profit')::numeric=-500 AND p."Total Principal Loss"=(s.portfolio->>'Total Principal Loss')::numeric
 FROM (SELECT * FROM public.olap_portfolio_summary LIMIT 1) p,lwr_state s WHERE s.label='before'),
 'Total Principal Loss = Principal Write-offs and the lifetime identity holds; gross unchanged, net -500');
SELECT pg_temp.lwr_assert((SELECT m."Principal Write-offs"-(s.close_month->>'Principal Write-offs')::numeric=500 AND m."Net Profit"-(s.close_month->>'Net Profit')::numeric=-500
  AND m."Operating Income"=(s.close_month->>'Operating Income')::numeric AND m."Operating Income"=70
 FROM public.reporting_income_monthly m,lwr_state s WHERE s.label='before' AND m."Month"=(s.close_month->>'Month')::date),'the close month: write-offs 500, net -500, gross 70 unchanged');
SELECT pg_temp.lwr_assert((SELECT c."Business Cash Held" IS NOT DISTINCT FROM (s.cash->>'Business Cash Held')::numeric
  AND c."Cash Pool Remaining"-(s.cash->>'Cash Pool Remaining')::numeric=500
  AND c."Net Profit MTD"=(s.cash->>'Net Profit MTD')::numeric
  AND -(c."Tommy Withdrawn MTD"+c."Lisa Withdrawn MTD")+((s.cash->>'Tommy Withdrawn MTD')::numeric+(s.cash->>'Lisa Withdrawn MTD')::numeric)=70
  AND c."Unsettled Profit MTD"-(s.cash->>'Unsettled Profit MTD')::numeric=-70
  AND (s.cash->>'Tommy Withdrawn MTD')::numeric+(s.cash->>'Lisa Withdrawn MTD')::numeric=-80
  AND st."Cash Reconciliation Difference" IS NOT DISTINCT FROM (s.statement->>'Cash Reconciliation Difference')::numeric-500+70
 FROM public."Cash Dashboard" c,public.reporting_income_statement st,lwr_state s WHERE s.label='before'),
 'cash identity: held unchanged, pool +500, FIFO recovery 70 (draw 80 -> 150), difference -500 + 70');
-- Daily Analytics from the Close Date through today: the ledger, independently (interest, principal returned, outstanding).
SELECT pg_temp.lwr_assert(NOT EXISTS(
 SELECT 1 FROM generate_series((SELECT "Close Date" FROM "Loans" WHERE "Row ID"='LWR-LEGACY'),current_date,interval '1 day') g(d)
 LEFT JOIN "Daily Analytics" a ON a."Snapshot Date"=g.d::date
 WHERE a."Snapshot Date" IS NULL
  OR a."Interest Received"::numeric IS DISTINCT FROM (SELECT coalesce(sum("Interest Paid"::numeric),0) FROM "Repayments" WHERE "Payment Date"=g.d::date)
  OR a."Principal Returned"::numeric IS DISTINCT FROM (SELECT coalesce(sum("Principal Paid"::numeric),0) FROM "Repayments" WHERE "Payment Date"=g.d::date)
  OR a."Outstanding Principal EOD"::numeric IS DISTINCT FROM (SELECT coalesce(sum(l."Principal Amount"::numeric),0) FROM "Loans" l WHERE l."Loan Date"<=g.d::date)
     -(SELECT coalesce(sum("Principal Paid"::numeric),0) FROM "Repayments" WHERE "Payment Date"<=g.d::date)),
 'Daily Analytics matches the ledger from the Close Date through today');
-- Idempotent; the controls are untouched.
SELECT pg_temp.lwr_assert((SELECT count(*)=0 FROM public.reconcile_legacy_default_postings('synthetic-owner@example.invalid',true)),'a rerun returns no row');
SELECT pg_temp.lwr_assert((SELECT count(*)=1 FROM "Repayments" WHERE "Ref Loans"='LWR-LEGACY' AND starts_with("Row ID",'df10:')),'a rerun posts nothing');
SELECT pg_temp.lwr_assert((SELECT (SELECT jsonb_agg(to_jsonb(l) ORDER BY l."Row ID") FROM "Loans" l WHERE l."Row ID" IN ('LWR-POSTED','LWR-PARTIAL'))
   =(SELECT jsonb_agg(b ORDER BY b->>'Row ID') FROM jsonb_array_elements(s.loans) b WHERE b->>'Row ID'<>'LWR-LEGACY')
  AND (SELECT jsonb_agg(to_jsonb(x) ORDER BY x."Row ID") FROM "Repayments" x WHERE x."Ref Loans" IN ('LWR-POSTED','LWR-PARTIAL'))=s.control_repayments
  AND (SELECT jsonb_agg(to_jsonb(x) ORDER BY x."Row ID") FROM "Charges" x WHERE x."Ref Loans" IN ('LWR-POSTED','LWR-PARTIAL'))
   =(SELECT jsonb_agg(b ORDER BY b->>'Row ID') FROM jsonb_array_elements(s.charges) b WHERE b->>'Ref Loans'<>'LWR-LEGACY')
 FROM lwr_state s WHERE s.label='before'),'the correctly posted and the partial-loss controls are untouched');
-- Owner only.
SELECT pg_temp.lwr_assert(NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  WHERE p.oid='public.reconcile_legacy_default_postings(text,boolean)'::regprocedure AND a.grantee<>p.proowner)
 AND NOT has_function_privilege('mw_app_dev','public.reconcile_legacy_default_postings(text,boolean)','EXECUTE'),'only the owner may execute');
SELECT 'Legacy write-off reconciliation checks passed' AS result;
ROLLBACK;
