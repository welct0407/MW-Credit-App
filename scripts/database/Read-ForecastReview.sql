BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT jsonb_build_object(
 'database',current_database(),'server',inet_server_addr(),'asof',public.olap_reporting_date(),'captured',clock_timestamp(),
 'version',(SELECT max(version::int) FROM flyway_schema_history WHERE success),
 'definitions',(SELECT jsonb_object_agg(proname,pg_get_functiondef(oid)) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('generate_loan_charge','vc_daily_interest')),
 'views',jsonb_build_object('loans',pg_get_viewdef('olap_loans_analytics'::regclass,true),'portfolio',pg_get_viewdef('olap_portfolio_summary'::regclass,true)),
 'before',(SELECT to_jsonb(s) FROM (SELECT "Expected Daily Interest","Forecast Remaining Interest","Realized Profit MTD","Today's Outstanding Interest","Projected Monthly Profit" FROM olap_portfolio_summary LIMIT 1) s),
 'loans',(SELECT jsonb_agg(to_jsonb(s)) FROM (
 SELECT l."Row ID" id,l."Ref Borrowers" borrower,
 CASE WHEN (b."Borrower Name" ILIKE '%Puifai%' OR b."Borrower Name" LIKE '%ปุยฝ้าย%') THEN 'Puifai' WHEN (b."Borrower Name" ILIKE '%Pond%' OR b."Borrower Name" LIKE '%ปอน%') THEN 'Pond' ELSE 'Other' END label,
 l."Loan Type" kind,l."Loan Status" status,l."Auto Charge Enabled" auto,l."Defaulted" defaulted,
 l."Loan Date" start,l."Due Date" due,l."Close Date" closed,l."Interest Schedule Anchor Date" anchor,l."Interest Payment Interval" interval,
 l."Principal Amount"::numeric principal,l."Outstanding Principal" outstanding,l."Current Daily Interest"::numeric daily,
 l."Fixed Interest"::numeric fixed,l."Daily Payment Amount"::numeric payment,l."Total Interest Received" received,
 l."Expected Daily Interest Amount" old_daily,a."Expected Interest This Month" old_forecast
 FROM "Loans" l LEFT JOIN "Borrowers" b ON b."Row ID"=l."Ref Borrowers" LEFT JOIN olap_loans_analytics a ON a."Row ID"=l."Row ID"
 ) s),
 'charges',(SELECT jsonb_agg(to_jsonb(s)) FROM (
 SELECT "Row ID" id,"Ref Loans" loan,"Charge Date" date,"Principal Due"::numeric principal,"Interest Due"::numeric interest,
 "Interest Paid" paid,"Interest Remaining" remaining,"Principal Remaining" principal_remaining,"Payment Status" status
 FROM "Charges" WHERE "Ref Loans" IS NOT NULL
 ) s)
)::text;
COMMIT;
