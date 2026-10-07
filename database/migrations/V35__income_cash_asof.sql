-- R016: read-only, restated end-of-day cash reporting. No postings or source changes.
CREATE VIEW public.reporting_cash_account_daily AS
WITH days AS (SELECT "Date" FROM public.reporting_income_daily),
flows AS (
 SELECT "Ref To Cash Account" account,"Movement Date" d,"Amount" amount FROM public."Cash Ledger" WHERE "Ref To Cash Account" IS NOT NULL
 UNION ALL
 SELECT "Ref From Cash Account","Movement Date",-"Amount" FROM public."Cash Ledger" WHERE "Ref From Cash Account" IS NOT NULL
), daily AS (SELECT account,d,sum(amount) amount FROM flows GROUP BY 1,2),
positions AS (
 SELECT d."Date",a."Row ID" account,a."Ref Cash Holder" holder,h."Holder Name",a."Account Label",
  (c."Cutover At" AT TIME ZONE 'Asia/Bangkok')::date available_from,
  CASE WHEN d."Date">=(c."Cutover At" AT TIME ZONE 'Asia/Bangkok')::date THEN
   c."Opening Balance"-c."Baseline Cash In"+c."Baseline Cash Out"
   +coalesce((SELECT sum(f.amount) FROM daily f WHERE f.account=a."Row ID" AND f.d<=d."Date"),0) END balance
 FROM days d CROSS JOIN public."Cash Accounts" a
 JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder"
 LEFT JOIN public.r008_cash_account_cutover c ON c."Ref Cash Account"=a."Row ID"
)
SELECT jsonb_build_array(account,"Date")::text AS "Position ID","Date",account AS "Cash Account ID",
 holder AS "Cash Holder ID","Holder Name" AS "Cash Holder","Account Label" AS "Account",
 balance AS "Current Balance",CASE WHEN balance IS NOT NULL THEN greatest(balance,0) END AS "Business Cash Held",
 CASE WHEN balance IS NOT NULL THEN greatest(-balance,0) END AS "Advance Due",
 available_from AS "Available From",
 CASE WHEN balance IS NOT NULL THEN 'Available' ELSE 'Before opening baseline or opening missing' END AS "Balance Status",
 CASE WHEN bool_and(balance IS NOT NULL) OVER(PARTITION BY "Date",holder) THEN greatest(balance,0) END AS "Holder Cash Component"
FROM positions;

CREATE VIEW public.reporting_cash_daily AS
WITH days AS (SELECT * FROM public.reporting_income_daily),
capital AS (
 SELECT "Contribution Date" d,sum(CASE WHEN "Transaction Type"='Contribution' THEN "Amount"::numeric ELSE -"Amount"::numeric END) amount
 FROM public."Cash Pool Contributions" GROUP BY 1
), loans AS (
 SELECT "Loan Date" d,sum("Principal Amount"::numeric) amount FROM public."Loans" GROUP BY 1
), repayments AS (
 SELECT r."Payment Date" d,sum(r."Principal Paid"::numeric) amount
 FROM public."Repayments" r JOIN public."Loans" l ON l."Row ID"=r."Ref Loans" GROUP BY 1
), custody AS (
 SELECT "Date",bool_and("Current Balance" IS NOT NULL) complete,
  sum("Business Cash Held") held,sum("Advance Due") advance,max("Available From") available_from
 FROM public.reporting_cash_account_daily GROUP BY 1
), amounts AS (
 SELECT d."Date",
  CASE WHEN NOT EXISTS(SELECT 1 FROM capital WHERE d IS NULL)
    AND NOT EXISTS(SELECT 1 FROM loans WHERE d IS NULL)
    AND NOT EXISTS(SELECT 1 FROM repayments WHERE d IS NULL) THEN
   coalesce((SELECT sum(amount) FROM capital c WHERE c.d<=d."Date"),0)
   -coalesce((SELECT sum(amount) FROM loans l WHERE l.d<=d."Date"),0)
   +coalesce((SELECT sum(amount) FROM repayments r WHERE r.d<=d."Date"),0) END pool,
  d."Net Profit Through Date"-d."Partner A Settled Through Date"-d."Partner B Settled Through Date" retained,
  CASE WHEN c.complete THEN c.held END held,CASE WHEN c.complete THEN c.advance END advance,c.available_from
 FROM days d LEFT JOIN custody c ON c."Date"=d."Date"
)
SELECT "Date",pool AS "Cash Pool Remaining",held AS "Business Cash Held",advance AS "Advance Due",
 retained AS "Retained Profit Through Date",held-advance-pool-retained AS "Cash Reconciliation Difference",
 available_from AS "Cash Available From",
 CASE WHEN held IS NULL THEN 'Cash unavailable before account openings'
  WHEN pool IS NULL THEN 'Cash pool unavailable: source date missing'
  WHEN abs(held-advance-pool-retained)<0.005 THEN 'Reconciled'
  ELSE 'Includes a cash reconciliation difference' END AS "Cash Status"
FROM amounts;

COMMENT ON VIEW public.reporting_cash_account_daily IS 'R016 cash by account at Bangkok period end using immutable opening-minus-baseline and dated ledger effects. Unavailable before the account cutover. Later corrections restate history; account ownership is immutable.';
COMMENT ON VIEW public.reporting_cash_daily IS 'R016 dated capital less dated outstanding principal and initialized custody. Prior retained profit, advances and unexplained differences remain separate; never force cash pool plus selected-period earnings to equal cash held.';
