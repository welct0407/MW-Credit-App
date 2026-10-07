-- R016: full-history, read-only cashflow statement. Existing OLTP providers unchanged.
CREATE VIEW public.reporting_cashflow_transactions AS
WITH scopes AS (
 SELECT a."Row ID" id,a."Account Label" label,
  (c."Cutover At" AT TIME ZONE 'Asia/Bangkok')::date available,
  c."Opening Balance"-c."Baseline Cash In"+c."Baseline Cash Out" baseline
 FROM public."Cash Accounts" a LEFT JOIN public.r008_cash_account_cutover c ON c."Ref Cash Account"=a."Row ID"
), all_scopes AS (
 SELECT * FROM scopes UNION ALL
 SELECT '__ALL__','All accounts',CASE WHEN bool_and(available IS NOT NULL) THEN max(available) END,
  CASE WHEN bool_and(baseline IS NOT NULL) THEN sum(baseline) END FROM scopes
), effects AS (
 SELECT e.*,CASE WHEN direction='OUT' THEN "Ref Cash Account" ELSE "Ref Other Cash Account" END from_account,
  CASE WHEN direction='IN' THEN "Ref Cash Account" ELSE "Ref Other Cash Account" END to_account
 FROM public.cash_statement_account_effects e
 WHERE "Statement Date"<=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
), entries AS (
 SELECT "Ref Cash Account" scope,ledger_id,"Statement Date" d,"Sort Timestamp" ts,direction,
  "Signed Amount" amount,abs("Signed Amount") transfer_amount,"Transaction Type Code" code,
  "Ref Borrower" borrower,"Ref Partner" partner,"Counterparty Text" payee,
  from_account,to_account,"Notes" notes FROM effects
 UNION ALL
 SELECT '__ALL__',ledger_id,min("Statement Date"),min("Sort Timestamp"),'NET',
  sum("Signed Amount"),max(abs("Signed Amount")),min("Transaction Type Code"),
  min("Ref Borrower"),min("Ref Partner"),min("Counterparty Text"),min(from_account),min(to_account),min("Notes")
 FROM effects GROUP BY ledger_id
), running AS (
 SELECT e.*,s.label,s.available,
  CASE WHEN e.d>=s.available THEN s.baseline+sum(e.amount) OVER
   (PARTITION BY e.scope ORDER BY e.d,e.ts,e.ledger_id COLLATE "C",e.direction COLLATE "C" ROWS UNBOUNDED PRECEDING) END balance
 FROM entries e JOIN all_scopes s ON s.id=e.scope
)
SELECT jsonb_build_array(r.scope,r.ledger_id,r.direction)::text AS "Entry ID",
 r.scope AS "Scope ID",r.label AS "Account",r.ledger_id AS "Ledger ID",r.d AS "Date",r.ts AS "Posted At",
 initcap(replace(r.code,'_',' ')) AS "Transaction Type",
 CASE WHEN r.borrower IS NOT NULL THEN coalesce(nullif(b."Description",''),b."Borrower Name",r.borrower)
  WHEN r.partner IS NOT NULL THEN coalesce(p."Partner Name",r.partner)
  WHEN r.from_account IS NOT NULL AND r.to_account IS NOT NULL THEN concat(f."Account Label",' → ',t."Account Label")
  ELSE nullif(r.payee,'') END AS "Counterparty",
 f."Account Label" AS "From Account",t."Account Label" AS "To Account",
 r.from_account IS NOT NULL AND r.to_account IS NOT NULL AS "Internal Transfer",
 r.transfer_amount AS "Transaction Amount",greatest(r.amount,0) AS "Money In",greatest(-r.amount,0) AS "Money Out",
 r.amount AS "Net Movement",r.balance AS "Balance After",r.available AS "Available From",r.notes AS "Notes"
FROM running r
LEFT JOIN public."Borrowers" b ON b."Row ID"=r.borrower
LEFT JOIN public."Partners" p ON p."Row ID"=r.partner
LEFT JOIN public."Cash Accounts" f ON f."Row ID"=r.from_account
LEFT JOIN public."Cash Accounts" t ON t."Row ID"=r.to_account;

CREATE VIEW public.reporting_cashflow_daily AS
WITH accounts AS (
 SELECT a."Row ID" scope,a."Account Label" label,
  (c."Cutover At" AT TIME ZONE 'Asia/Bangkok')::date available,
  c."Opening Balance"-c."Baseline Cash In"+c."Baseline Cash Out" baseline
 FROM public."Cash Accounts" a LEFT JOIN public.r008_cash_account_cutover c ON c."Ref Cash Account"=a."Row ID"
), scopes AS (
 SELECT * FROM accounts UNION ALL
 SELECT '__ALL__','All accounts',CASE WHEN bool_and(available IS NOT NULL) THEN max(available) END,
 CASE WHEN bool_and(baseline IS NOT NULL) THEN sum(baseline) END FROM accounts
), flows AS (
 SELECT "Scope ID" scope,"Date" d,sum("Money In") cash_in,sum("Money Out") cash_out,count(*) n,
  count(*) FILTER(WHERE "Internal Transfer") transfers
 FROM public.reporting_cashflow_transactions GROUP BY 1,2
), bounds AS (
 SELECT least(min("Movement Date"),min((c."Cutover At" AT TIME ZONE 'Asia/Bangkok')::date),
  (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date) first_date
 FROM public."Cash Ledger" l FULL JOIN public.r008_cash_account_cutover c ON false
), days AS (
 SELECT generate_series(date_trunc('month',first_date)::date,
  (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,interval '1 day')::date d FROM bounds
), grid AS (
 SELECT s.*,d.d,coalesce(f.cash_in,0) cash_in,coalesce(f.cash_out,0) cash_out,coalesce(f.n,0) n,coalesce(f.transfers,0) transfers
 FROM scopes s CROSS JOIN days d LEFT JOIN flows f ON f.scope=s.scope AND f.d=d.d
), running AS (
 SELECT *,CASE WHEN d>=available THEN baseline+sum(cash_in-cash_out) OVER
 (PARTITION BY scope ORDER BY d ROWS UNBOUNDED PRECEDING) END closing FROM grid
)
SELECT jsonb_build_array(scope,d)::text AS "Position ID",scope AS "Scope ID",label AS "Account",d AS "Date",
 closing-cash_in+cash_out AS "Opening Balance",cash_in AS "Money In",cash_out AS "Money Out",
 cash_in-cash_out AS "Net Movement",closing AS "Closing Balance",n AS "Transaction Count",
 transfers AS "Internal Transfer Count",available AS "Available From",
 CASE WHEN available IS NULL THEN 'Opening not initialized' WHEN d<available THEN 'Before known opening' ELSE 'Available' END AS "Balance Status"
FROM running;
COMMENT ON VIEW public.reporting_cashflow_transactions IS 'R016 one ledger side per account or one consolidated entry per ledger. Reuses OLTP effects; internal transfers net to zero only in All accounts. Running balances computed before filtering; unknown/pre-opening balances remain NULL.';
COMMENT ON VIEW public.reporting_cashflow_daily IS 'R016 zero-movement dates included. Opening + money in - money out = closing when opening is known. Balances are net cash (negative account balances retained), not positive-only custody. Historical corrections restate history.';
