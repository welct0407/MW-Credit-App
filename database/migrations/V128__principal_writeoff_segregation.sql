-- R116 principal write-off segregation (owner request of 2 November 2026; Archie's design, accepted).
-- A default loss pair (V10/V120, Row ID df10:...) books a zero-cash repayment with "Principal Paid" = amount and
-- "Interest Paid" = -amount, so until now the loss sat inside interest income. From V128 the income statements say it apart:
--   gross profit        = sum of "Interest Paid" of repayments whose Row ID does not start with 'df10:';
--   principal write-off = sum of "Principal Paid" of repayments whose Row ID starts with 'df10:', on their Payment Date;
--   net profit          = gross profit - expenses - write-offs (numerically the value it had before V128).
-- Every relation keeps its existing columns in place; the income columns now mean gross profit, and one write-off column
-- (a positive amount, like "Expenses MTD" of the portfolio summary and "Total Principal Loss") is appended last:
--   "Cash Dashboard"            "Operating Income MTD" gross; "Net Profit MTD" and "Unsettled Profit MTD" less write-offs
--                               (values unchanged); partner FIFO draws unchanged; + "Principal Write-offs MTD".
--   olap_portfolio_summary      "Total Profit", "Today's Profit", "Yesterday's Profit", "Realized Profit MTD" (and so
--                               "Projected Monthly Profit") and "Operating Income MTD" gross; "Net Profit" and "Net Profit MTD"
--                               less write-offs (values unchanged); partner shares and "Total Unsettled Profit" unchanged;
--                               + "Principal Write-offs MTD".
--   reporting_income_statement  passes the Cash Dashboard columns through (Net Margin = net / gross);
--                               + "Principal Write-offs MTD".
--   reporting_income_monthly    "Operating Income" gross; "Net Profit" less write-offs; Net Margin = net / gross;
--                               + "Principal Write-offs".
--   reporting_income_daily      "Operating Income" gross; "Net Profit" and "Net Profit Through Date" less write-offs (values
--                               unchanged); partner nets unchanged; + "Principal Write-offs".
--   reporting_income_events     a df10: repayment event has "Income" 0; + "Principal Write-offs" (0 on every other event).
-- Unchanged: olap_repayments_analytics (the rows and partner profit shares), olap_borrowers_analytics, the Daily Analytics
-- snapshots, "Cash Reconciliation Difference" (no cash moves) and every function. Order: Cash Dashboard, portfolio summary,
-- then the income views. The Cash Dashboard, portfolio summary, daily and events bodies are restated from their current
-- definitions (V31, V120, V34, V38); reporting_income_statement and reporting_income_monthly are CREATE OR REPLACE'd from
-- their current definition with exact, counted text replacements (V116 method). CREATE OR REPLACE VIEW keeps each owner,
-- ACL, comment and dependent view; the self-check below proves owner, ACL, options, comments and the column lists.
-- No table, column, view, constraint, role, grant or trigger change. Rollback: a later migration restores the V127 bodies
-- (the appended columns stay, unused).

DO $preflight$
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF to_regclass('public."Cash Account Daily Summary Recent"') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_attribute
   WHERE attrelid='public.olap_portfolio_summary'::regclass AND attname='Total Principal Loss' AND NOT attisdropped) THEN
  RAISE EXCEPTION 'V128 needs V127'; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attname IN ('Principal Write-offs MTD','Principal Write-offs') AND NOT attisdropped AND attrelid IN
   ('public."Cash Dashboard"'::regclass,'public.olap_portfolio_summary'::regclass,'public.reporting_income_statement'::regclass,
    'public.reporting_income_monthly'::regclass,'public.reporting_income_daily'::regclass,'public.reporting_income_events'::regclass)) THEN
  RAISE EXCEPTION 'V128: a write-off column already exists'; END IF;
END $preflight$;

CREATE TEMP TABLE v128_views ON COMMIT DROP AS
 SELECT c.oid::regclass::text AS relation,c.oid AS relid,pg_get_userbyid(c.relowner) AS owner,coalesce(c.relacl::text,'') AS acl,
  coalesce(c.reloptions::text,'') AS options,coalesce(obj_description(c.oid,'pg_class'),'') AS comment,
  (SELECT array_agg(a.attname::text||':'||format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum) FROM pg_attribute a
    WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
  (SELECT coalesce(array_agg(coalesce(d.description,'') ORDER BY d.objsubid),'{}') FROM pg_description d
    WHERE d.objoid=c.oid AND d.classoid='pg_class'::regclass AND d.objsubid>0) AS column_comments,
  v.appended
 FROM (VALUES ('public."Cash Dashboard"','Principal Write-offs MTD'),('public.olap_portfolio_summary','Principal Write-offs MTD'),
  ('public.reporting_income_statement','Principal Write-offs MTD'),('public.reporting_income_monthly','Principal Write-offs'),
  ('public.reporting_income_daily','Principal Write-offs'),('public.reporting_income_events','Principal Write-offs')) v(name,appended)
 JOIN pg_class c ON c.oid=v.name::regclass;

-- 1. Cash Dashboard (the V31 body): gross income, write-offs apart; net and unsettled less write-offs; FIFO draws unchanged.
CREATE OR REPLACE VIEW public."Cash Dashboard" AS
WITH ctx AS (SELECT d,date_trunc('month',d)::date ms FROM (SELECT public.olap_reporting_date() d) q),
profit AS (
 SELECT coalesce(sum(r."Interest Paid"::numeric) FILTER(WHERE r."Payment Date">=ms AND NOT starts_with(r."Row ID",'df10:')),0) income,
 coalesce(sum(r."Partner A Profit") FILTER(WHERE r."Payment Date"<ms),0) prior_a,
 coalesce(sum(r."Partner B Profit") FILTER(WHERE r."Payment Date"<ms),0) prior_b,
 coalesce(sum(r."Partner A Profit") FILTER(WHERE r."Payment Date">=ms),0) month_a,
 coalesce(sum(r."Partner B Profit") FILTER(WHERE r."Payment Date">=ms),0) month_b,
 coalesce(sum(r."Principal Paid"::numeric) FILTER(WHERE r."Payment Date">=ms AND starts_with(r."Row ID",'df10:')),0) writeoff
 FROM public.olap_repayments_analytics r CROSS JOIN ctx WHERE r."Payment Date"<=d
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

-- 2. olap_portfolio_summary (the V120 body): gross profit figures, net less write-offs, "Principal Write-offs MTD" appended last.
CREATE OR REPLACE VIEW public.olap_portfolio_summary AS
WITH ctx AS (SELECT d, date_trunc('month',d)::date ms,
 (date_trunc('month',d)+interval '1 month - 1 day')::date me FROM (SELECT public.olap_reporting_date() d) q),

lr AS (SELECT coalesce(sum("Outstanding Principal"),0) principal,count(*) FILTER(WHERE "Loan Status"='ยังไม่ปิดยอด') active,
 coalesce(sum("Expected Interest This Month"),0) forecast,coalesce(sum("Principal Days MTD"),0) days,
 coalesce(sum("Expected Daily Interest Amount"),0) daily,coalesce(sum("Total Interest Received") FILTER(WHERE "Loan Status"='ยังไม่ปิดยอด'),0) active_profit,
 coalesce(sum("Default Loss Amount"::numeric),0) principal_loss FROM public.olap_loans_analytics),
rr AS (SELECT coalesce(sum("Interest Paid"::numeric) FILTER(WHERE NOT starts_with("Row ID",'df10:')),0) profit,
 coalesce(sum("Interest Paid"::numeric) FILTER(WHERE "Payment Date"=d AND NOT starts_with("Row ID",'df10:')),0) today,
 coalesce(sum("Interest Paid"::numeric) FILTER(WHERE "Payment Date"=d-1 AND NOT starts_with("Row ID",'df10:')),0) yesterday,
 coalesce(sum("Interest Paid"::numeric) FILTER(WHERE "Payment Date" BETWEEN ms AND me AND NOT starts_with("Row ID",'df10:')),0) mtd,
 coalesce(sum("Principal Returned Days MTD"),0) returned_days,coalesce(sum("Partner A Profit"),0) profit_a,coalesce(sum("Partner B Profit"),0) profit_b,
 coalesce(sum("Principal Paid"::numeric) FILTER(WHERE starts_with("Row ID",'df10:')),0) writeoff,
 coalesce(sum("Principal Paid"::numeric) FILTER(WHERE "Payment Date" BETWEEN ms AND me AND starts_with("Row ID",'df10:')),0) writeoff_mtd
 FROM public.olap_repayments_analytics CROSS JOIN ctx),
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
 lr.principal_loss "Total Principal Loss",rr.writeoff_mtd "Principal Write-offs MTD"
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
 round(x."Principal Write-offs MTD"::numeric,0) AS "Principal Write-offs MTD" FROM final x;

-- 3. reporting_income_statement: its current definition with the Cash Dashboard write-off column appended last.
-- 4. reporting_income_monthly: its current definition; gross income and the write-off aggregated per month apart, net less
--    write-offs, the write-off column appended last. Exact, counted replacements; a missing or repeated boundary fails.
DO $patch$
DECLARE target record; definition text; k integer;
BEGIN
 FOR target IN SELECT * FROM (VALUES
  ('public.reporting_income_statement',ARRAY[
   ARRAY[$o$END AS "Cash Reconciliation Status"$o$,$n$END AS "Cash Reconciliation Status",
    "Principal Write-offs MTD"$n$]]),
  ('public.reporting_income_monthly',ARRAY[
   ARRAY[$o$sum(unnamed_subquery."Interest Paid") AS amount$o$,
         $n$sum(unnamed_subquery."Interest Paid") FILTER (WHERE NOT starts_with(unnamed_subquery."Repayment ID", 'df10:'::text)) AS amount,
            sum(unnamed_subquery."Principal Paid") FILTER (WHERE starts_with(unnamed_subquery."Repayment ID", 'df10:'::text)) AS writeoff$n$],
   ARRAY[$o$COALESCE(i.amount, 0::numeric) - COALESCE(e.amount, 0::numeric) AS "Net Profit"$o$,
         $n$COALESCE(i.amount, 0::numeric) - COALESCE(e.amount, 0::numeric) - COALESCE(i.writeoff, 0::numeric) AS "Net Profit"$n$],
   ARRAY[$o$(COALESCE(i.amount, 0::numeric) - COALESCE(e.amount, 0::numeric)) / NULLIF(i.amount, 0::numeric) AS "Net Margin"$o$,
         $n$(COALESCE(i.amount, 0::numeric) - COALESCE(e.amount, 0::numeric) - COALESCE(i.writeoff, 0::numeric)) / NULLIF(i.amount, 0::numeric) AS "Net Margin"$n$],
   ARRAY[$o$::date AS "In Last 12 Months"$o$,$n$::date AS "In Last 12 Months",
    COALESCE(i.writeoff, 0::numeric) AS "Principal Write-offs"$n$]])) t(relation,edits)
 LOOP
  definition:=pg_get_viewdef(target.relation::regclass,true);
  IF position('df10:' IN definition)>0 OR position('Principal Write-offs' IN definition)>0 THEN RAISE EXCEPTION 'V128: % is already segregated',target.relation; END IF;
  FOR k IN 1..array_length(target.edits,1) LOOP
   IF (length(definition)-length(replace(definition,target.edits[k][1],'')))/length(target.edits[k][1])<>1 THEN
    RAISE EXCEPTION 'V128: unexpected % boundary %',target.relation,k; END IF;
   definition:=replace(definition,target.edits[k][1],target.edits[k][2]);
  END LOOP;
  EXECUTE 'CREATE OR REPLACE VIEW '||target.relation||' AS '||definition;
 END LOOP;
END $patch$;

-- 5. reporting_income_daily (the V34 body): gross income and the write-off per date apart; net and its running total less
--    write-offs; partner nets unchanged; "Principal Write-offs" appended last.
CREATE OR REPLACE VIEW public.reporting_income_daily AS
WITH income AS (
 SELECT "Payment Date" d,sum("Interest Paid"::numeric) FILTER(WHERE NOT starts_with("Row ID",'df10:')) income,
  sum("Partner A Profit") pa,sum("Partner B Profit") pb,
  sum("Principal Paid"::numeric) FILTER(WHERE starts_with("Row ID",'df10:')) writeoff
 FROM public.olap_repayments_analytics WHERE "Payment Date"<=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date GROUP BY "Payment Date"
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

-- 6. reporting_income_events (the V38 body): a df10: repayment is a write-off event with no income; both branches append
--    "Principal Write-offs".
CREATE OR REPLACE VIEW public.reporting_income_events AS
SELECT 'repayment:'||"Row ID" AS "Event ID","Payment Date" AS "Date",
 CASE WHEN starts_with("Row ID",'df10:') THEN 0::numeric ELSE "Interest Paid"::numeric END AS "Income",0::numeric AS "Expenses",
 CASE WHEN starts_with("Row ID",'df10:') THEN "Principal Paid"::numeric ELSE 0::numeric END AS "Principal Write-offs"
FROM public.olap_repayments_analytics WHERE "Payment Date"<=public.olap_reporting_date()
UNION ALL
SELECT 'expense:'||"Row ID","Expense Date",0::numeric,"Amount"::numeric,0::numeric
FROM public."Business Expenses" WHERE "Expense Date"<=public.olap_reporting_date();

-- Self-check: owner, privileges, options and comments unchanged; every existing column in place with its type and exactly
-- one numeric write-off column appended last; every body that aggregates repayments carries the df10: predicate (the
-- statement passes the Cash Dashboard columns through).
DO $check$
DECLARE bad text;
BEGIN
 SELECT string_agg(o.relation,', ') INTO bad FROM v128_views o JOIN pg_class c ON c.oid=o.relid
  WHERE pg_get_userbyid(c.relowner)<>o.owner OR coalesce(c.relacl::text,'')<>o.acl OR coalesce(c.reloptions::text,'')<>o.options
   OR coalesce(obj_description(c.oid,'pg_class'),'')<>o.comment
   OR (SELECT coalesce(array_agg(coalesce(d.description,'') ORDER BY d.objsubid),'{}') FROM pg_description d
       WHERE d.objoid=c.oid AND d.classoid='pg_class'::regclass AND d.objsubid>0) IS DISTINCT FROM o.column_comments
   OR (SELECT array_agg(a.attname::text||':'||format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum) FROM pg_attribute a
       WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM o.columns||(o.appended||':numeric')
   OR (o.relid<>'public.reporting_income_statement'::regclass AND position('df10:' IN pg_get_viewdef(c.oid))=0);
 IF bad IS NOT NULL OR (SELECT count(*) FROM v128_views)<>6 THEN
  RAISE EXCEPTION 'V128 changed the owner, privileges, options, comments or columns of %',coalesce(bad,'a replaced view'); END IF;
END $check$;
