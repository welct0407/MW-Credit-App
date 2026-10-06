-- Independent test oracle: retained V64 with the V37 correlated pending formula.
-- Source SHA256: 2f84f8ea27f0c035a89d0d3e551b1ce2cc8c60e8fa35e1c87ee496ad9623140d
-- R051: aggregate dated charge payments once per snapshot date, then join.
-- Preserve the V37 formulas, null handling, signed default losses and date bounds.
-- V62 custom planning remains scoped to this function. No source/permission change.
CREATE OR REPLACE FUNCTION pg_temp.refresh_daily_analytics_reference(p_from date,p_to date)
RETURNS integer LANGUAGE plpgsql SET search_path=pg_catalog,public SET plan_cache_mode=force_custom_plan AS $$
DECLARE refreshed_days integer;
BEGIN
 IF p_from IS NULL OR p_to IS NULL OR p_from>p_to
    OR p_to>(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date THEN
   RAISE EXCEPTION 'Analytics requires a valid date range ending no later than Bangkok today';
 END IF;
 IF NOT pg_try_advisory_xact_lock(7112026,7) THEN
   RAISE EXCEPTION 'Analytics refresh is busy; sync and retry';
 END IF;
 -- One statement provides one consistent source snapshot for every requested date.
 -- Model 3 corrects partially paid pending charges. Existing gross/net profit semantics
 -- remain compatible; new per-role inputs retain the governed rounded allocation rules.
 WITH dates AS (
   SELECT p_from+i AS d FROM generate_series(0,p_to-p_from) i
 ), contributions AS MATERIALIZED (
   SELECT c."Contribution Date" AS d,p."Partner Role" AS role,
     CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric
       ELSE -c."Amount"::numeric END AS net
   FROM public."Cash Pool Contributions" c
   LEFT JOIN public."Partners" p ON p."Row ID"=c."Ref Partner"
 ), repayment_days AS MATERIALIZED (
   SELECT "Payment Date" AS d,sum("Principal Paid"::numeric) AS principal,
     sum("Interest Paid"::numeric) AS interest,count(*) AS repayments
   FROM public."Repayments" GROUP BY "Payment Date"
 ), profit_days AS MATERIALIZED (
   SELECT r.d,CASE WHEN c.pool>0 THEN r.interest*coalesce(c.ab,0)/c.pool ELSE 0 END AS profit
   FROM repayment_days r CROSS JOIN LATERAL (
     SELECT sum(net) AS pool,sum(net) FILTER(WHERE role IN ('A','B')) AS ab
     FROM contributions WHERE d<=r.d
   ) c
 ), charge_payments AS MATERIALIZED (
   SELECT "Ref Charges" charge,"Payment Date" d,
    sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)) paid
   FROM public."Repayments" WHERE "Payment Date"<=p_to GROUP BY 1,2
 ), expenses AS MATERIALIZED (
   SELECT "Expense Date" d,sum("Amount"::numeric) expense FROM public."Business Expenses" GROUP BY 1
 ), partner_income AS MATERIALIZED (
   SELECT "Date" d,"Partner A Net Profit" pa,"Partner B Net Profit" pb FROM public.reporting_income_daily
   WHERE "Date" BETWEEN p_from AND p_to
 ), settlements AS MATERIALIZED (
   SELECT s."Transfer Date" d,sum(s."Amount"::numeric) amount,
    coalesce(sum(s."Amount"::numeric) FILTER(WHERE p."Partner Role"='A'),0) pa,
    coalesce(sum(s."Amount"::numeric) FILTER(WHERE p."Partner Role"='B'),0) pb
   FROM public."Settlements" s LEFT JOIN public."Partners" p ON p."Row ID"=s."Ref Partner"
   WHERE s."Status"='Completed' AND s."Transfer Date"<=p_to GROUP BY 1
 ), ledger AS MATERIALIZED (
   SELECT "Movement Date" d,"Ref From Cash Account" from_account,"Ref To Cash Account" to_account,"Amount" amount
   FROM public."Cash Ledger" WHERE "Movement Date"<=p_to
 ), account_flows AS MATERIALIZED (
   SELECT account,d,sum(greatest(signed,0)) cash_in,sum(greatest(-signed,0)) cash_out,count(*) n
   FROM ledger CROSS JOIN LATERAL (VALUES (from_account,-amount),(to_account,amount)) v(account,signed)
   WHERE account IS NOT NULL GROUP BY 1,2
 ), consolidated_flows AS MATERIALIZED (
   SELECT d,sum(greatest(signed,0)) cash_in,sum(greatest(-signed,0)) cash_out
   FROM (SELECT d,(CASE WHEN to_account IS NOT NULL THEN amount ELSE 0 END)
    -(CASE WHEN from_account IS NOT NULL THEN amount ELSE 0 END) signed FROM ledger) v GROUP BY 1
 ), account_seed AS MATERIALIZED (
   SELECT a."Row ID" account,(c."Cutover At" AT TIME ZONE 'Asia/Bangkok')::date available,
    c."Opening Balance"-c."Baseline Cash In"+c."Baseline Cash Out"
     +coalesce(sum(f.cash_in-f.cash_out),0) opening
   FROM public."Cash Accounts" a LEFT JOIN public.r008_cash_account_cutover c ON c."Ref Cash Account"=a."Row ID"
   LEFT JOIN account_flows f ON f.account=a."Row ID" AND f.d<p_from
   GROUP BY a."Row ID",c."Cutover At",c."Opening Balance",c."Baseline Cash In",c."Baseline Cash Out"
 ), account_grid AS (
   SELECT a.*,d.d,coalesce(f.cash_in,0) cash_in,coalesce(f.cash_out,0) cash_out,coalesce(f.n,0) n
   FROM account_seed a CROSS JOIN dates d LEFT JOIN account_flows f ON f.account=a.account AND f.d=d.d
 ), account_positions AS (
   SELECT *,CASE WHEN d>=available THEN opening+sum(cash_in-cash_out) OVER
    (PARTITION BY account ORDER BY d ROWS UNBOUNDED PRECEDING) END closing FROM account_grid
 ), saved_accounts AS (
   INSERT INTO public."Cash Account Daily Analytics"("Row ID","Snapshot Date","Ref Cash Account","Generated At","Model Version",
    "Money In","Money Out","Opening Balance","Closing Balance","Transaction Count","Available From","Balance Status")
   SELECT jsonb_build_array(account,d)::text,d,account,statement_timestamp() AT TIME ZONE 'Asia/Bangkok',3,
    cash_in,cash_out,closing-cash_in+cash_out,closing,n,available,
    CASE WHEN available IS NULL THEN 'Opening not initialized' WHEN d<available THEN 'Before known opening' ELSE 'Available' END
   FROM account_positions
   ON CONFLICT ("Snapshot Date","Ref Cash Account") DO UPDATE SET
    "Generated At"=EXCLUDED."Generated At","Model Version"=EXCLUDED."Model Version",
    "Money In"=EXCLUDED."Money In","Money Out"=EXCLUDED."Money Out",
    "Opening Balance"=EXCLUDED."Opening Balance","Closing Balance"=EXCLUDED."Closing Balance",
    "Transaction Count"=EXCLUDED."Transaction Count","Available From"=EXCLUDED."Available From","Balance Status"=EXCLUDED."Balance Status"
   RETURNING *
 ), cash_positions AS (
   SELECT "Snapshot Date" d,
    CASE WHEN bool_and("Closing Balance" IS NOT NULL) THEN sum("Closing Balance") END closing,
    CASE WHEN bool_and("Opening Balance" IS NOT NULL) THEN sum("Opening Balance") END opening,
    CASE WHEN bool_and("Available From" IS NOT NULL) THEN max("Available From") END available,
    CASE WHEN bool_and("Closing Balance" IS NOT NULL) THEN 'Available'
     WHEN bool_and("Available From" IS NOT NULL) THEN 'Before known opening' ELSE 'Opening not initialized' END status
   FROM saved_accounts GROUP BY 1
 ), metrics AS (
   SELECT dates.d,l.issued,l.loans,l.issued_eod,l.active,l.borrowers,
     r.principal,r.interest,r.repayments,r.returned_eod,c.pending,p.pool,
     coalesce((SELECT sum(profit) FROM profit_days WHERE d<=dates.d),0)
       -coalesce((SELECT sum("Amount"::numeric) FROM public."Settlements"
          WHERE "Status"='Completed' AND "Transfer Date"<=dates.d),0) AS unsettled
   FROM dates
   CROSS JOIN LATERAL (
     SELECT coalesce(sum("Principal Amount"::numeric) FILTER(WHERE "Loan Date"=dates.d),0) AS issued,
       count(*) FILTER(WHERE "Loan Date"=dates.d) AS loans,
       coalesce(sum("Principal Amount"::numeric),0) AS issued_eod,
       count(*) FILTER(WHERE "Close Date" IS NULL OR "Close Date">dates.d) AS active,
       count(DISTINCT coalesce("Ref Borrowers",'')) FILTER(WHERE "Close Date" IS NULL OR "Close Date">dates.d) AS borrowers
     FROM public."Loans" WHERE "Loan Date"<=dates.d
   ) l
   CROSS JOIN LATERAL (
     SELECT coalesce(sum(principal) FILTER(WHERE d=dates.d),0) AS principal,
       coalesce(sum(interest) FILTER(WHERE d=dates.d),0) AS interest,
       coalesce(sum(repayments) FILTER(WHERE d=dates.d),0) AS repayments,
       coalesce(sum(principal),0) AS returned_eod
     FROM repayment_days WHERE d<=dates.d
   ) r
   CROSS JOIN LATERAL (
     SELECT coalesce(sum(greatest(coalesce(c."Principal Due"::numeric,0)+coalesce(c."Interest Due"::numeric,0)
      -coalesce((SELECT sum(paid) FROM charge_payments cp WHERE cp.charge=c."Row ID" AND cp.d<=dates.d),0),0)),0) AS pending
     FROM public."Charges" c WHERE c."Charge Date"<=dates.d
   ) c
   CROSS JOIN LATERAL (SELECT coalesce(sum(net),0) AS pool FROM contributions WHERE d<=dates.d) p
 )
 INSERT INTO public."Daily Analytics"("Row ID","Snapshot Date","Generated At","Model Version",
   "Principal Issued","Loans Issued","Principal Returned","Interest Received","Repayments Count",
   "Outstanding Principal EOD","Active Loans EOD","Active Borrowers EOD","Pending Charges EOD",
   "Total Cash Pool EOD","Available Cash EOD","Unsettled Profit EOD","Business Expenses","Net Profit","Net Unsettled Profit EOD",
   "Capital Contributed","Capital Withdrawn","Partner Settlements","Partner A Net Profit","Partner B Net Profit","Partner A Settlements","Partner B Settlements","Cash Money In","Cash Money Out","Cash Opening Balance","Cash Balance EOD","Cash Available From","Cash Balance Status")
 SELECT 'da11:'||metrics.d::text,metrics.d,statement_timestamp() AT TIME ZONE 'Asia/Bangkok',3,
   issued::money,loans::integer,principal::money,interest::money,repayments::integer,
   (issued_eod-returned_eod)::money,active::integer,borrowers::integer,pending::money,
   pool::money,(pool+returned_eod-issued_eod)::money,unsettled::money,
   coalesce((SELECT sum("Amount") FROM public."Business Expenses" WHERE "Expense Date"=metrics.d),0::money),
   interest::money-coalesce((SELECT sum("Amount") FROM public."Business Expenses" WHERE "Expense Date"=metrics.d),0::money),
   unsettled::money-coalesce((SELECT sum("Amount") FROM public."Business Expenses" WHERE "Expense Date"<=metrics.d),0::money)
 ,coalesce((SELECT sum("Amount"::numeric) FROM public."Cash Pool Contributions" WHERE "Contribution Date"=metrics.d AND "Transaction Type"='Contribution'),0)
 ,coalesce((SELECT sum("Amount"::numeric) FROM public."Cash Pool Contributions" WHERE "Contribution Date"=metrics.d AND "Transaction Type" IS DISTINCT FROM 'Contribution'),0)
 ,coalesce(s.amount,0),coalesce(pi.pa,0),coalesce(pi.pb,0),coalesce(s.pa,0),coalesce(s.pb,0)
 ,coalesce(cf.cash_in,0),coalesce(cf.cash_out,0),cp.opening,cp.closing,cp.available,coalesce(cp.status,'Opening not initialized')
 FROM metrics LEFT JOIN settlements s ON s.d=metrics.d LEFT JOIN partner_income pi ON pi.d=metrics.d
 LEFT JOIN consolidated_flows cf ON cf.d=metrics.d LEFT JOIN cash_positions cp ON cp.d=metrics.d
 ORDER BY metrics.d
 ON CONFLICT ("Snapshot Date") DO UPDATE SET
   "Generated At"=EXCLUDED."Generated At","Model Version"=EXCLUDED."Model Version",
   "Principal Issued"=EXCLUDED."Principal Issued","Loans Issued"=EXCLUDED."Loans Issued",
   "Principal Returned"=EXCLUDED."Principal Returned","Interest Received"=EXCLUDED."Interest Received",
   "Repayments Count"=EXCLUDED."Repayments Count","Outstanding Principal EOD"=EXCLUDED."Outstanding Principal EOD",
   "Active Loans EOD"=EXCLUDED."Active Loans EOD","Active Borrowers EOD"=EXCLUDED."Active Borrowers EOD",
   "Pending Charges EOD"=EXCLUDED."Pending Charges EOD","Total Cash Pool EOD"=EXCLUDED."Total Cash Pool EOD",
   "Available Cash EOD"=EXCLUDED."Available Cash EOD","Unsettled Profit EOD"=EXCLUDED."Unsettled Profit EOD",
   "Business Expenses"=EXCLUDED."Business Expenses","Net Profit"=EXCLUDED."Net Profit",
   "Net Unsettled Profit EOD"=EXCLUDED."Net Unsettled Profit EOD",
   "Capital Contributed"=EXCLUDED."Capital Contributed",
   "Capital Withdrawn"=EXCLUDED."Capital Withdrawn",
   "Partner Settlements"=EXCLUDED."Partner Settlements",
   "Partner A Net Profit"=EXCLUDED."Partner A Net Profit",
   "Partner B Net Profit"=EXCLUDED."Partner B Net Profit",
   "Partner A Settlements"=EXCLUDED."Partner A Settlements",
   "Partner B Settlements"=EXCLUDED."Partner B Settlements",
   "Cash Money In"=EXCLUDED."Cash Money In",
   "Cash Money Out"=EXCLUDED."Cash Money Out",
   "Cash Opening Balance"=EXCLUDED."Cash Opening Balance",
   "Cash Balance EOD"=EXCLUDED."Cash Balance EOD",
   "Cash Available From"=EXCLUDED."Cash Available From",
   "Cash Balance Status"=EXCLUDED."Cash Balance Status";
 GET DIAGNOSTICS refreshed_days=ROW_COUNT;
 RETURN refreshed_days;
END $$;
