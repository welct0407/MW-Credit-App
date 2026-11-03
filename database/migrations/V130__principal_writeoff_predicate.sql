-- R116 follow-up (Chase and Forge, read-only in DEV and PROD, 2 November 2026): the two legacy defaulted loans already carry
-- loss-shaped pairs on their close dates (2026-08-26 5,000 and 2026-08-28 1,000) under random 22-character Row IDs, not
-- df10:, so V128/V129 counted them as -6,000 of gross interest in August instead of write-offs. No posting is needed: V130
-- moves the write-off test of every V128/V129 relation onto one predicate, public.is_principal_writeoff (Archie's shape,
-- with his tightenings). A repayment is a principal write-off when its Row ID starts with 'df10:', or when it is a zero-cash
-- loss pair:
--   no "Ref Payment" (load-bearing: a payment-linked row is cash, whatever its shape), "Principal Paid" > 0,
--   "Interest Paid" = -"Principal Paid", and its "Ref Charges" charge is not a loan-close (lc7:) or lump-sum (ls2:) id, has
--   "Principal Due" = "Principal Paid" and "Interest Due" = -"Principal Paid", and has exactly one repayment (the pair check
--   of undo_loan_default, V120).
-- An ordinary principal repayment (interest 0) and a lump-sum or partial allocation (interest <> -principal) never qualify.
-- Gross = interest of the other repayments; write-offs = principal of the write-offs; net is unchanged (a pair nets to zero).
-- The predicate is a pure IMMUTABLE SQL function of the row and its charge, with no table access: the planner may inline it,
-- and every reader of the views keeps PostgreSQL's default PUBLIC EXECUTE (a function called from a view runs with the
-- caller's privileges, so a predicate that read "Charges" itself would need a grant on the base table for every reader).
-- Each view reads the charge as its owner in one shared row pattern (the repayments of olap_repayments_analytics with their
-- loss_pair flag), whose charge lookup runs only for zero-cash loss-shaped rows. A later release can move the guards onto
-- the same function; in R116 these still key on df10: and are unchanged: "Default Loss Amount", default_loan_transition,
-- undo_loan_default, default_posting_guard and the schedule exclusions.
-- Replaced: "Cash Dashboard", olap_portfolio_summary (with V129's lifetime "Principal Write-offs"), reporting_income_daily
-- and reporting_income_events (restated from their V128/V129 bodies), reporting_income_monthly (its current definition with
-- exact, counted replacements; the flag stays inside its row subquery). reporting_income_statement passes the Cash Dashboard
-- through and olap_borrowers_analytics was not segregated by V128, so neither changes. No table, column, view, constraint,
-- role, grant or trigger change; the self-check proves owner, ACL, options, comments and every column list unchanged.
-- Rollback: a later migration restores the V128/V129 bodies and drops the function.

DO $preflight$
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.olap_portfolio_summary'::regclass AND attname='Principal Write-offs' AND NOT attisdropped) THEN
  RAISE EXCEPTION 'V130 needs V129'; END IF;
 IF to_regprocedure('public.is_principal_writeoff(text,text,numeric,numeric,text,numeric,numeric,bigint)') IS NOT NULL THEN
  RAISE EXCEPTION 'V130: the write-off predicate already exists'; END IF;
END $preflight$;

CREATE TEMP TABLE v130_views ON COMMIT DROP AS
 SELECT c.oid AS relid,c.oid::regclass::text AS relation,pg_get_userbyid(c.relowner) AS owner,coalesce(c.relacl::text,'') AS acl,
  coalesce(c.reloptions::text,'') AS options,coalesce(obj_description(c.oid,'pg_class'),'') AS comment,
  (SELECT array_agg(a.attname::text||':'||format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum) FROM pg_attribute a
    WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
  (SELECT coalesce(array_agg(coalesce(d.description,'') ORDER BY d.objsubid),'{}') FROM pg_description d
    WHERE d.objoid=c.oid AND d.classoid='pg_class'::regclass AND d.objsubid>0) AS column_comments
 FROM pg_class c WHERE c.oid IN ('public."Cash Dashboard"'::regclass,'public.olap_portfolio_summary'::regclass,
  'public.reporting_income_monthly'::regclass,'public.reporting_income_daily'::regclass,'public.reporting_income_events'::regclass,
  'public.reporting_income_statement'::regclass);

-- The one write-off predicate: a repayment, with its charge's components and repayment count (NULL when not looked up).
CREATE FUNCTION public.is_principal_writeoff(p_row_id text, p_ref_payment text, p_principal numeric, p_interest numeric,
  p_charge_id text, p_charge_principal numeric, p_charge_interest numeric, p_charge_repayments bigint)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(starts_with(p_row_id,'df10:') OR (p_ref_payment IS NULL AND p_principal>0 AND p_interest=-p_principal
  AND NOT starts_with(p_charge_id,'lc7:') AND NOT starts_with(p_charge_id,'ls2:')
  AND p_charge_principal=p_principal AND p_charge_interest=-p_principal AND p_charge_repayments=1),false)
$$;
COMMENT ON FUNCTION public.is_principal_writeoff(text,text,numeric,numeric,text,numeric,numeric,bigint) IS
 'R116 (V130): true for a principal write-off repayment: a df10: posting, or a zero-cash loss pair (no Ref Payment, principal X > 0, interest -X, a non-lc7:/ls2: charge of X/-X with exactly one repayment). Pure; the caller supplies the charge.';

-- Its readers are every role that reads the views: PUBLIC keeps PostgreSQL's default EXECUTE; the default-privilege grants
-- the migration role carries in PROD are revoked (the access matrix lists every other grant).
DO $acl$
DECLARE g record;
BEGIN
 FOR g IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid='public.is_principal_writeoff(text,text,numeric,numeric,text,numeric,numeric,bigint)'::regprocedure AND a.grantee NOT IN (0,p.proowner) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.is_principal_writeoff(text,text,numeric,numeric,text,numeric,numeric,bigint) FROM %I',pg_get_userbyid(g.grantee));
 END LOOP;
END $acl$;

-- 1. Cash Dashboard (the V128 body): the write-offs of the month apart from gross income.
CREATE OR REPLACE VIEW public."Cash Dashboard" AS
WITH ctx AS (SELECT d,date_trunc('month',d)::date ms FROM (SELECT public.olap_reporting_date() d) q),
profit AS (
 SELECT coalesce(sum(r."Interest Paid"::numeric) FILTER(WHERE r."Payment Date">=ms AND NOT r.loss_pair),0) income,
 coalesce(sum(r."Partner A Profit") FILTER(WHERE r."Payment Date"<ms),0) prior_a,
 coalesce(sum(r."Partner B Profit") FILTER(WHERE r."Payment Date"<ms),0) prior_b,
 coalesce(sum(r."Partner A Profit") FILTER(WHERE r."Payment Date">=ms),0) month_a,
 coalesce(sum(r."Partner B Profit") FILTER(WHERE r."Payment Date">=ms),0) month_b,
 coalesce(sum(r."Principal Paid"::numeric) FILTER(WHERE r."Payment Date">=ms AND r.loss_pair),0) writeoff
 FROM (SELECT wx.*,public.is_principal_writeoff(wx."Row ID",wx."Ref Payment",wx."Principal Paid"::numeric,wx."Interest Paid"::numeric,wx."Ref Charges",wc.principal,wc.interest,wc.repayments) AS loss_pair FROM public.olap_repayments_analytics wx LEFT JOIN LATERAL (SELECT c."Principal Due"::numeric AS principal,c."Interest Due"::numeric AS interest,(SELECT count(*) FROM public."Repayments" n WHERE n."Ref Charges"=c."Row ID") AS repayments FROM public."Charges" c WHERE c."Row ID"=wx."Ref Charges" AND wx."Ref Payment" IS NULL AND wx."Principal Paid"::numeric>0 AND wx."Interest Paid"::numeric=-wx."Principal Paid"::numeric) wc ON true) r CROSS JOIN ctx WHERE r."Payment Date"<=d
), expense AS (
 SELECT coalesce(sum(e."Amount"::numeric) FILTER(WHERE e."Expense Date">=ms),0) amount,
 coalesce(sum(e."Partner A Expense"::numeric) FILTER(WHERE e."Expense Date"<ms),0) prior_a,
 coalesce(sum(e."Partner B Expense"::numeric) FILTER(WHERE e."Expense Date"<ms),0) prior_b,
 coalesce(sum(e."Partner A Expense"::numeric) FILTER(WHERE e."Expense Date">=ms),0) month_a,
 coalesce(sum(e."Partner B Expense"::numeric) FILTER(WHERE e."Expense Date">=ms),0) month_b
 FROM public."Business Expenses" e CROSS JOIN ctx WHERE e."Expense Date"<=d
), settled AS (
 SELECT coalesce(sum(s."Amount"::numeric) FILTER(WHERE p."Partner Role"='A'),0) a,
 coalesce(sum(s."Amount"::numeric) FILTER(WHERE p."Partner Role"='B'),0) b
 FROM public."Settlements" s JOIN public."Partners" p ON p."Row ID"=s."Ref Partner"
 CROSS JOIN ctx WHERE s."Status"='Completed' AND s."Transfer Date"<=d
), allocated AS (
 SELECT profit.income,expense.amount,profit.writeoff,
 public.fifo_current_month_settled(profit.prior_a-expense.prior_a,profit.month_a-expense.month_a,settled.a) a,
 public.fifo_current_month_settled(profit.prior_b-expense.prior_b,profit.month_b-expense.month_b,settled.b) b
 FROM profit CROSS JOIN expense CROSS JOIN settled
), cash AS (
 SELECT CASE WHEN bool_and("Initialized") THEN sum("Business Cash Held") END held
 FROM public."Cash Account Balances"
)
SELECT 'cash-dashboard'::text AS "Row ID",
 allocated.income AS "Operating Income MTD",
 -allocated.amount AS "Expenses MTD",
 allocated.income-allocated.amount-allocated.writeoff AS "Net Profit MTD",
 -allocated.a AS "Tommy Withdrawn MTD",
 -allocated.b AS "Lisa Withdrawn MTD",
 allocated.income-allocated.amount-allocated.writeoff-allocated.a-allocated.b AS "Unsettled Profit MTD",
 pool."Available Cashpool"::numeric AS "Cash Pool Remaining",
 cash.held AS "Business Cash Held",
 allocated.writeoff AS "Principal Write-offs MTD"
FROM allocated CROSS JOIN public."Loan Form Context" pool CROSS JOIN cash;

-- 2. olap_portfolio_summary (the V129 body): gross profit figures and both write-off columns on the predicate.
CREATE OR REPLACE VIEW public.olap_portfolio_summary AS
WITH ctx AS (SELECT d, date_trunc('month',d)::date ms,
 (date_trunc('month',d)+interval '1 month - 1 day')::date me FROM (SELECT public.olap_reporting_date() d) q),

lr AS (SELECT coalesce(sum("Outstanding Principal"),0) principal,count(*) FILTER(WHERE "Loan Status"='ยังไม่ปิดยอด') active,
 coalesce(sum("Expected Interest This Month"),0) forecast,coalesce(sum("Principal Days MTD"),0) days,
 coalesce(sum("Expected Daily Interest Amount"),0) daily,coalesce(sum("Total Interest Received") FILTER(WHERE "Loan Status"='ยังไม่ปิดยอด'),0) active_profit,
 coalesce(sum("Default Loss Amount"::numeric),0) principal_loss FROM public.olap_loans_analytics),
rr AS (SELECT coalesce(sum("Interest Paid"::numeric) FILTER(WHERE NOT loss_pair),0) profit,
 coalesce(sum("Interest Paid"::numeric) FILTER(WHERE "Payment Date"=d AND NOT loss_pair),0) today,
 coalesce(sum("Interest Paid"::numeric) FILTER(WHERE "Payment Date"=d-1 AND NOT loss_pair),0) yesterday,
 coalesce(sum("Interest Paid"::numeric) FILTER(WHERE "Payment Date" BETWEEN ms AND me AND NOT loss_pair),0) mtd,
 coalesce(sum("Principal Returned Days MTD"),0) returned_days,coalesce(sum("Partner A Profit"),0) profit_a,coalesce(sum("Partner B Profit"),0) profit_b,
 coalesce(sum("Principal Paid"::numeric) FILTER(WHERE loss_pair),0) writeoff,
 coalesce(sum("Principal Paid"::numeric) FILTER(WHERE "Payment Date" BETWEEN ms AND me AND loss_pair),0) writeoff_mtd
 FROM (SELECT wx.*,public.is_principal_writeoff(wx."Row ID",wx."Ref Payment",wx."Principal Paid"::numeric,wx."Interest Paid"::numeric,wx."Ref Charges",wc.principal,wc.interest,wc.repayments) AS loss_pair FROM public.olap_repayments_analytics wx LEFT JOIN LATERAL (SELECT c."Principal Due"::numeric AS principal,c."Interest Due"::numeric AS interest,(SELECT count(*) FROM public."Repayments" n WHERE n."Ref Charges"=c."Row ID") AS repayments FROM public."Charges" c WHERE c."Row ID"=wx."Ref Charges" AND wx."Ref Payment" IS NULL AND wx."Principal Paid"::numeric>0 AND wx."Interest Paid"::numeric=-wx."Principal Paid"::numeric) wc ON true) repayments CROSS JOIN ctx),
cr AS (SELECT coalesce(sum("Amount Remaining") FILTER(WHERE nullif("Ref Loans",'') IS NOT NULL AND "Charge Date"<=d),0) pending,
 coalesce(sum("Interest Remaining") FILTER(WHERE nullif("Ref Loans",'') IS NOT NULL AND "Charge Date"<=d),0) interest,
 coalesce(sum("Amount Due") FILTER(WHERE "Charge Date"=d),0) due,coalesce(sum("Total Paid") FILTER(WHERE "Charge Date"=d),0) paid,
 coalesce(sum("Amount Remaining") FILTER(WHERE "Charge Date"=d),0) remaining FROM public.olap_charges_analytics CROSS JOIN ctx),
br AS (SELECT count(*) FILTER(WHERE "Daily Collection Status"='Fully Paid') full_count,count(*) FILTER(WHERE "Daily Collection Status"='Partially Paid') partial_count,
 count(*) FILTER(WHERE "Daily Collection Status"='Overdue') overdue_count,count(*) FILTER(WHERE "Daily Collection Status"='Not Paid') notpaid_count,
 count(*) FILTER(WHERE "Daily Collection Status"='Long Overdue') long_overdue_count FROM public.olap_borrowers_analytics),
top3 AS (SELECT coalesce(sum(v),0) total FROM (SELECT "Total Outstanding Principal" v FROM public."Borrowers" WHERE "Total Outstanding Principal">0 ORDER BY 1 DESC LIMIT 3) q),
pool AS (SELECT coalesce(sum(CASE WHEN "Transaction Type"='Contribution' THEN "Amount"::numeric ELSE -"Amount"::numeric END),0) total FROM public."Cash Pool Contributions"),
settled AS (SELECT coalesce(sum(s."Amount"::numeric),0) total FROM public."Settlements" s JOIN public."Partners" p ON p."Row ID"=s."Ref Partner" WHERE s."Status"='Completed'),
earned AS (SELECT coalesce(sum(CASE p."Partner Role" WHEN 'A' THEN rr.profit_a WHEN 'B' THEN rr.profit_b ELSE 0 END),0) total FROM public."Partners" p CROSS JOIN rr),
er AS (SELECT coalesce(sum("Amount"::numeric),0) total,coalesce(sum("Amount"::numeric) FILTER(WHERE "Expense Date" BETWEEN ms AND d),0) mtd FROM public."Business Expenses" CROSS JOIN ctx),
recent AS (SELECT a.* FROM public."Daily Analytics" a WHERE a."Snapshot Date">=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')-interval '30 days'),
peak AS (SELECT coalesce(max("Outstanding Principal EOD"::numeric),0) amount FROM recent),
peakdate AS (SELECT max("Snapshot Date") dt FROM recent CROSS JOIN peak WHERE "Outstanding Principal EOD"::numeric=peak.amount),
a AS (SELECT s."Row ID",s."Statistics ID",rr.profit "Total Profit",lr.principal "Outstanding Principal",lr.principal "Total Outstanding Principal",
 lr.active "Active Loans",rr.today "Today's Profit",rr.yesterday "Yesterday's Profit",rr.mtd "Realized Profit MTD",
 rr.mtd+cr.interest+lr.forecast "Projected Monthly Profit",cr.pending "Pending Payment Amount",lr.forecast "Forecast Remaining Interest",cr.interest "Today's Outstanding Interest",
 lr.days-rr.returned_days "Net Principal Days MTD",lr.principal*(me-d) "Forecast Remaining Principal Days",
 round((lr.days-rr.returned_days+lr.principal*(me-d))/extract(day FROM me)) "Forecast Average Daily Outstanding Principal",
 peak.amount "Peak Cash Pool 30D",peakdate.dt "Peak Cash Pool Date 30D",lr.daily "Expected Daily Interest",lr.active_profit "Total Profit of Outstanding Loans",
 CASE WHEN lr.principal>0 THEN lr.active_profit/lr.principal ELSE 0 END "Profit Coverage of Outstanding Principal",
 pool.total "Total Cash Pool",earned.total-settled.total "Total Unsettled Profit",
 pool.total-lr.principal+earned.total-settled.total "Expected Loan Account Balance",
 CASE WHEN lr.principal=0 THEN 0 ELSE top3.total/lr.principal END "Top 3 Borrower Concentration",
 br.full_count "Borrowers Fully Paid Today",br.partial_count "Borrowers Partially Paid Today",br.overdue_count "Borrowers with Overdue Payment",br.notpaid_count "Borrowers Not Paid Today",
 cr.due "Amount Due Today",cr.paid "Amount Collected Today",cr.remaining "Amount Outstanding Today",
 CASE WHEN cr.due=0 THEN 0 ELSE cr.paid/cr.due END "Amount Collection Rate Today",
 er.total "Total Business Expenses",rr.profit-rr.writeoff-er.total "Net Profit",er.mtd "Expenses MTD",rr.mtd-rr.writeoff_mtd-er.mtd "Net Profit MTD",
 earned.total-settled.total-er.total "Net Unsettled Profit",pool.total-lr.principal+earned.total-settled.total-er.total "Net Expected Loan Account Balance",
 rr.mtd "Operating Income MTD",-er.mtd "Income Statement Expenses MTD",br.long_overdue_count "Borrowers with Long Overdue Payment",
 lr.principal_loss "Total Principal Loss",rr.writeoff_mtd "Principal Write-offs MTD",rr.writeoff "Principal Write-offs"
 FROM public."Statistics" s CROSS JOIN ctx CROSS JOIN lr CROSS JOIN rr CROSS JOIN cr CROSS JOIN br CROSS JOIN top3 CROSS JOIN pool CROSS JOIN settled CROSS JOIN earned CROSS JOIN er CROSS JOIN peak CROSS JOIN peakdate),
final AS (SELECT a.*,CASE WHEN "Forecast Average Daily Outstanding Principal">0 THEN "Projected Monthly Profit"/"Forecast Average Daily Outstanding Principal" ELSE 0 END "Forecast Monthly Return on ADO" FROM a)

SELECT x."Row ID",
 x."Statistics ID",
 round(x."Total Profit"::numeric,0) AS "Total Profit",
 round(x."Outstanding Principal"::numeric,0) AS "Outstanding Principal",
 x."Active Loans",
 round(x."Today's Profit"::numeric,0) AS "Today's Profit",
 round(x."Yesterday's Profit"::numeric,0) AS "Yesterday's Profit",
 round(x."Realized Profit MTD"::numeric,0) AS "Realized Profit MTD",
 round(x."Projected Monthly Profit"::numeric,0) AS "Projected Monthly Profit",
 round(x."Pending Payment Amount"::numeric,0) AS "Pending Payment Amount",
 round(x."Forecast Remaining Interest"::numeric,0) AS "Forecast Remaining Interest",
 round(x."Today's Outstanding Interest"::numeric,0) AS "Today's Outstanding Interest",
 x."Net Principal Days MTD",
 x."Forecast Remaining Principal Days",
 round(x."Forecast Average Daily Outstanding Principal"::numeric,0) AS "Forecast Average Daily Outstanding Principal",
 round(x."Forecast Monthly Return on ADO"::numeric,2) AS "Forecast Monthly Return on ADO",
 round(x."Peak Cash Pool 30D"::numeric,0) AS "Peak Cash Pool 30D",
 x."Peak Cash Pool Date 30D",
 round(x."Expected Daily Interest"::numeric,0) AS "Expected Daily Interest",
 round(x."Total Profit of Outstanding Loans"::numeric,0) AS "Total Profit of Outstanding Loans",
 round(x."Profit Coverage of Outstanding Principal"::numeric,2) AS "Profit Coverage of Outstanding Principal",
 round(x."Total Cash Pool"::numeric,0) AS "Total Cash Pool",
 round(x."Total Unsettled Profit"::numeric,0) AS "Total Unsettled Profit",
 round(x."Expected Loan Account Balance"::numeric,0) AS "Expected Loan Account Balance",
 round(x."Total Outstanding Principal"::numeric,0) AS "Total Outstanding Principal",
 round(x."Top 3 Borrower Concentration"::numeric,4) AS "Top 3 Borrower Concentration",
 x."Borrowers Fully Paid Today",
 x."Borrowers Partially Paid Today",
 x."Borrowers with Overdue Payment",
 x."Borrowers Not Paid Today",
 round(x."Amount Due Today"::numeric,0) AS "Amount Due Today",
 round(x."Amount Collected Today"::numeric,0) AS "Amount Collected Today",
 round(x."Amount Outstanding Today"::numeric,0) AS "Amount Outstanding Today",
 x."Amount Collection Rate Today",
 round(x."Total Business Expenses"::numeric,0) AS "Total Business Expenses",
 round(x."Net Profit"::numeric,0) AS "Net Profit",
 round(x."Expenses MTD"::numeric,0) AS "Expenses MTD",
 round(x."Net Profit MTD"::numeric,0) AS "Net Profit MTD",
 round(x."Net Unsettled Profit"::numeric,0) AS "Net Unsettled Profit",
 round(x."Net Expected Loan Account Balance"::numeric,0) AS "Net Expected Loan Account Balance",
 round(x."Income Statement Expenses MTD"::numeric,0) AS "Income Statement Expenses MTD",
 round(x."Operating Income MTD"::numeric,0) AS "Operating Income MTD",
 x."Borrowers with Long Overdue Payment",
 round(x."Total Principal Loss"::numeric,0) AS "Total Principal Loss",
 round(x."Principal Write-offs MTD"::numeric,0) AS "Principal Write-offs MTD",
 round(x."Principal Write-offs"::numeric,0) AS "Principal Write-offs" FROM final x;

-- 3. reporting_income_monthly: its current definition; its repayment rows come from the shared row pattern and carry the
--    flag inside the row subquery (the view's columns do not change), which the two FILTERs read.
DO $patch$
DECLARE definition text:=pg_get_viewdef('public.reporting_income_monthly'::regclass,true); k integer; edits text[][]:=ARRAY[
 ARRAY[$o$FILTER (WHERE NOT starts_with(unnamed_subquery."Repayment ID", 'df10:'::text))$o$,$n$FILTER (WHERE NOT unnamed_subquery."Loss Pair")$n$],
 ARRAY[$o$FILTER (WHERE starts_with(unnamed_subquery."Repayment ID", 'df10:'::text))$o$,$n$FILTER (WHERE unnamed_subquery."Loss Pair")$n$],
 ARRAY[$o$r."Principal Paid"::numeric AS "Principal Paid",$o$,$n$r."Principal Paid"::numeric AS "Principal Paid",
                    r.loss_pair AS "Loss Pair",$n$],
 ARRAY[$o$FROM olap_repayments_analytics r$o$,$n$FROM (SELECT wx.*,public.is_principal_writeoff(wx."Row ID",wx."Ref Payment",wx."Principal Paid"::numeric,wx."Interest Paid"::numeric,wx."Ref Charges",wc.principal,wc.interest,wc.repayments) AS loss_pair FROM public.olap_repayments_analytics wx LEFT JOIN LATERAL (SELECT c."Principal Due"::numeric AS principal,c."Interest Due"::numeric AS interest,(SELECT count(*) FROM public."Repayments" n WHERE n."Ref Charges"=c."Row ID") AS repayments FROM public."Charges" c WHERE c."Row ID"=wx."Ref Charges" AND wx."Ref Payment" IS NULL AND wx."Principal Paid"::numeric>0 AND wx."Interest Paid"::numeric=-wx."Principal Paid"::numeric) wc ON true) r$n$]];
BEGIN
 FOR k IN 1..array_length(edits,1) LOOP
  IF (length(definition)-length(replace(definition,edits[k][1],'')))/length(edits[k][1])<>1 THEN
   RAISE EXCEPTION 'V130: unexpected reporting_income_monthly boundary %',k; END IF;
  definition:=replace(definition,edits[k][1],edits[k][2]);
 END LOOP;
 EXECUTE 'CREATE OR REPLACE VIEW public.reporting_income_monthly AS '||definition;
END $patch$;

-- 4. reporting_income_daily (the V128 body): gross income and the write-offs per date on the predicate.
CREATE OR REPLACE VIEW public.reporting_income_daily AS
WITH income AS (
 SELECT "Payment Date" d,sum("Interest Paid"::numeric) FILTER(WHERE NOT loss_pair) income,
  sum("Partner A Profit") pa,sum("Partner B Profit") pb,
  sum("Principal Paid"::numeric) FILTER(WHERE loss_pair) writeoff
 FROM (SELECT wx.*,public.is_principal_writeoff(wx."Row ID",wx."Ref Payment",wx."Principal Paid"::numeric,wx."Interest Paid"::numeric,wx."Ref Charges",wc.principal,wc.interest,wc.repayments) AS loss_pair FROM public.olap_repayments_analytics wx LEFT JOIN LATERAL (SELECT c."Principal Due"::numeric AS principal,c."Interest Due"::numeric AS interest,(SELECT count(*) FROM public."Repayments" n WHERE n."Ref Charges"=c."Row ID") AS repayments FROM public."Charges" c WHERE c."Row ID"=wx."Ref Charges" AND wx."Ref Payment" IS NULL AND wx."Principal Paid"::numeric>0 AND wx."Interest Paid"::numeric=-wx."Principal Paid"::numeric) wc ON true) repayments WHERE "Payment Date"<=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date GROUP BY "Payment Date"
), expenses AS (
 SELECT "Expense Date" d,sum("Amount"::numeric) expense,sum("Partner A Expense"::numeric) pa,sum("Partner B Expense"::numeric) pb
 FROM public."Business Expenses" WHERE "Expense Date"<=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date GROUP BY "Expense Date"
), settled AS (
 SELECT "Transfer Date" d,coalesce(sum("Amount") FILTER(WHERE "Partner Role"='A'),0) pa,coalesce(sum("Amount") FILTER(WHERE "Partner Role"='B'),0) pb
 FROM (SELECT s."Row ID" AS "Settlement ID",s."Ref Partner" AS "Partner ID",p."Partner Name" AS "Partner",p."Partner Role",s."Transfer Date",
   s."Amount"::numeric AS "Amount",s."Status"
  FROM public."Settlements" s LEFT JOIN public."Partners" p ON p."Row ID"=s."Ref Partner"
  WHERE s."Transfer Date"<=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date) unnamed_subquery
 WHERE "Status"='Completed' GROUP BY "Transfer Date"
), bounds AS (
 SELECT min(d) first_date FROM (SELECT d FROM income UNION ALL SELECT d FROM expenses UNION ALL SELECT d FROM settled) dates
), calendar AS (
 SELECT generate_series(date_trunc('month',coalesce(first_date,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date))::date,
  (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,interval '1 day')::date d FROM bounds
), daily AS (
 SELECT c.d,coalesce(i.income,0) income,coalesce(e.expense,0) expense,coalesce(i.pa,0)-coalesce(e.pa,0) pa_net,coalesce(i.pb,0)-coalesce(e.pb,0) pb_net,
  coalesce(s.pa,0) pa_settled,coalesce(s.pb,0) pb_settled,coalesce(i.writeoff,0) writeoff
 FROM calendar c LEFT JOIN income i USING (d) LEFT JOIN expenses e USING (d) LEFT JOIN settled s USING (d)
)
SELECT d AS "Date",date_trunc('month',d)::date AS "Month",income AS "Operating Income",expense AS "Expenses",-expense AS "Signed Expenses",
 income-expense-writeoff AS "Net Profit",pa_net AS "Partner A Net Profit",pb_net AS "Partner B Net Profit",
 coalesce(sum(pa_net) OVER (ORDER BY d ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS "Prior Partner A Net",
 coalesce(sum(pb_net) OVER (ORDER BY d ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS "Prior Partner B Net",
 sum(pa_settled) OVER (ORDER BY d ROWS UNBOUNDED PRECEDING) AS "Partner A Settled Through Date",
 sum(pb_settled) OVER (ORDER BY d ROWS UNBOUNDED PRECEDING) AS "Partner B Settled Through Date",
 sum(income-expense-writeoff) OVER (ORDER BY d ROWS UNBOUNDED PRECEDING) AS "Net Profit Through Date",
 writeoff AS "Principal Write-offs"
FROM daily;

-- 5. reporting_income_events (the V128 body): a write-off repayment is a write-off event with no income.
CREATE OR REPLACE VIEW public.reporting_income_events AS
SELECT 'repayment:'||"Row ID" AS "Event ID","Payment Date" AS "Date",
 CASE WHEN loss_pair THEN 0::numeric ELSE "Interest Paid"::numeric END AS "Income",0::numeric AS "Expenses",
 CASE WHEN loss_pair THEN "Principal Paid"::numeric ELSE 0::numeric END AS "Principal Write-offs"
FROM (SELECT wx.*,public.is_principal_writeoff(wx."Row ID",wx."Ref Payment",wx."Principal Paid"::numeric,wx."Interest Paid"::numeric,wx."Ref Charges",wc.principal,wc.interest,wc.repayments) AS loss_pair FROM public.olap_repayments_analytics wx LEFT JOIN LATERAL (SELECT c."Principal Due"::numeric AS principal,c."Interest Due"::numeric AS interest,(SELECT count(*) FROM public."Repayments" n WHERE n."Ref Charges"=c."Row ID") AS repayments FROM public."Charges" c WHERE c."Row ID"=wx."Ref Charges" AND wx."Ref Payment" IS NULL AND wx."Principal Paid"::numeric>0 AND wx."Interest Paid"::numeric=-wx."Principal Paid"::numeric) wc ON true) repayments WHERE "Payment Date"<=public.olap_reporting_date()
UNION ALL
SELECT 'expense:'||"Row ID","Expense Date",0::numeric,"Amount"::numeric,0::numeric
FROM public."Business Expenses" WHERE "Expense Date"<=public.olap_reporting_date();

-- Self-check: owner, privileges, options, comments and every column unchanged (no column added); every replaced body reads
-- the predicate; reporting_income_statement is untouched; the predicate is pure and PUBLIC is its only grantee.
DO $check$
DECLARE bad text;
BEGIN
 SELECT string_agg(o.relation,', ') INTO bad FROM v130_views o JOIN pg_class c ON c.oid=o.relid
  WHERE pg_get_userbyid(c.relowner)<>o.owner OR coalesce(c.relacl::text,'')<>o.acl OR coalesce(c.reloptions::text,'')<>o.options
   OR coalesce(obj_description(c.oid,'pg_class'),'')<>o.comment
   OR (SELECT coalesce(array_agg(coalesce(d.description,'') ORDER BY d.objsubid),'{}') FROM pg_description d
       WHERE d.objoid=c.oid AND d.classoid='pg_class'::regclass AND d.objsubid>0) IS DISTINCT FROM o.column_comments
   OR (SELECT array_agg(a.attname::text||':'||format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum) FROM pg_attribute a
       WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM o.columns
   OR (o.relid<>'public.reporting_income_statement'::regclass AND position('is_principal_writeoff' IN pg_get_viewdef(c.oid))=0);
 IF bad IS NOT NULL OR (SELECT count(*) FROM v130_views)<>6 THEN
  RAISE EXCEPTION 'V130 changed the owner, privileges, options, comments or columns of %',coalesce(bad,'a replaced view'); END IF;
 IF (SELECT array_agg(a.grantee::text||':'||a.privilege_type ORDER BY a.grantee) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     WHERE p.oid='public.is_principal_writeoff(text,text,numeric,numeric,text,numeric,numeric,bigint)'::regprocedure AND a.grantee<>p.proowner)
    IS DISTINCT FROM ARRAY['0:EXECUTE']
  OR (SELECT provolatile FROM pg_proc WHERE oid='public.is_principal_writeoff(text,text,numeric,numeric,text,numeric,numeric,bigint)'::regprocedure)<>'i' THEN
  RAISE EXCEPTION 'V130: the write-off predicate must be IMMUTABLE with PUBLIC EXECUTE only'; END IF;
END $check$;
