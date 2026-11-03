-- R116 follow-up after DEV (Chase's finding, 2 November 2026): two legacy loans defaulted before the dated loss postings
-- carry a "Default Loss Amount" with no df10: ledger pair, so "Total Principal Loss" (the Loans column, V120) can exceed the
-- ledger write-offs that V128 subtracts from "Net Profit". Management Analytics then could not show
-- Total Profit - Total Business Expenses - write-offs = Net Profit.
-- V129 appends the lifetime ledger write-off to olap_portfolio_summary as its last column:
--   "Principal Write-offs" = sum of "Principal Paid" of repayments whose Row ID starts with 'df10:' (positive; every pair,
--   undated ones included; the predicate of V128), which is exactly what "Net Profit" subtracts, so
--   "Total Profit" - "Total Business Expenses" - "Principal Write-offs" = "Net Profit" (before the whole-baht rounding).
-- Every other column is unchanged, "Total Principal Loss" (the Loans column) included; the body is V128's with the one column
-- added. CREATE OR REPLACE VIEW keeps the owner, ACL, comments and dependants; the self-check proves owner, privileges,
-- options, comments and the column list (V128 style). No table, column, view, constraint, role, grant or trigger change.
-- Rollback: a later migration restores the V128 body (the appended column stays, unused).

DO $preflight$
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.olap_portfolio_summary'::regclass AND attname='Principal Write-offs MTD' AND NOT attisdropped) THEN
  RAISE EXCEPTION 'V129 needs V128'; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.olap_portfolio_summary'::regclass AND attname='Principal Write-offs' AND NOT attisdropped) THEN
  RAISE EXCEPTION 'V129: olap_portfolio_summary already has "Principal Write-offs"'; END IF;
END $preflight$;

CREATE TEMP TABLE v129_view ON COMMIT DROP AS
 SELECT c.oid AS relid,pg_get_userbyid(c.relowner) AS owner,coalesce(c.relacl::text,'') AS acl,coalesce(c.reloptions::text,'') AS options,
  coalesce(obj_description(c.oid,'pg_class'),'') AS comment,
  (SELECT array_agg(a.attname::text||':'||format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum) FROM pg_attribute a
    WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
  (SELECT coalesce(array_agg(coalesce(d.description,'') ORDER BY d.objsubid),'{}') FROM pg_description d
    WHERE d.objoid=c.oid AND d.classoid='pg_class'::regclass AND d.objsubid>0) AS column_comments
 FROM pg_class c WHERE c.oid='public.olap_portfolio_summary'::regclass;

-- olap_portfolio_summary (the V128 body): every existing column unchanged, the lifetime ledger "Principal Write-offs" last.
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

-- Self-check: owner, privileges, options and comments unchanged; every existing column in place with its type and exactly
-- one numeric "Principal Write-offs" appended last.
DO $check$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM v129_view o JOIN pg_class c ON c.oid=o.relid
   WHERE pg_get_userbyid(c.relowner)=o.owner AND coalesce(c.relacl::text,'')=o.acl AND coalesce(c.reloptions::text,'')=o.options
    AND coalesce(obj_description(c.oid,'pg_class'),'')=o.comment
    AND (SELECT coalesce(array_agg(coalesce(d.description,'') ORDER BY d.objsubid),'{}') FROM pg_description d
         WHERE d.objoid=c.oid AND d.classoid='pg_class'::regclass AND d.objsubid>0) IS NOT DISTINCT FROM o.column_comments
    AND (SELECT array_agg(a.attname::text||':'||format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum) FROM pg_attribute a
         WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) IS NOT DISTINCT FROM o.columns||'Principal Write-offs:numeric'::text) THEN
  RAISE EXCEPTION 'V129 changed the owner, privileges, options, comments or columns of olap_portfolio_summary'; END IF;
END $check$;
