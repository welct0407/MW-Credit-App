-- R016 focused live statement providers; no financial writes or existing provider changes.
CREATE VIEW public.reporting_cash_scopes AS
WITH scopes AS (
 SELECT a."Row ID" id,a."Account Label" label,
  (c."Cutover At" AT TIME ZONE 'Asia/Bangkok')::date available,
  c."Opening Balance"-c."Baseline Cash In"+c."Baseline Cash Out" baseline
 FROM public."Cash Accounts" a LEFT JOIN public.r008_cash_account_cutover c ON c."Ref Cash Account"=a."Row ID"
), all_scopes AS (
 SELECT * FROM scopes UNION ALL
 SELECT '__ALL__','All accounts',CASE WHEN bool_and(available IS NOT NULL) THEN max(available) END,
  CASE WHEN bool_and(baseline IS NOT NULL) THEN sum(baseline) END FROM scopes
) SELECT * FROM all_scopes;

CREATE VIEW public.reporting_cash_entries AS
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
)
SELECT jsonb_build_array(r.scope,r.ledger_id,r.direction)::text AS "Entry ID",
 r.scope AS "Scope ID",s.label AS "Account",r.ledger_id AS "Ledger ID",r.d AS "Date",r.ts AS "Posted At",
 initcap(replace(r.code,'_',' ')) AS "Transaction Type",
 CASE WHEN r.borrower IS NOT NULL THEN coalesce(nullif(b."Description",''),b."Borrower Name",r.borrower)
  WHEN r.partner IS NOT NULL THEN coalesce(p."Partner Name",r.partner)
  WHEN r.from_account IS NOT NULL AND r.to_account IS NOT NULL THEN concat(f."Account Label",' â†’ ',t."Account Label")
  ELSE nullif(r.payee,'') END AS "Counterparty",
 f."Account Label" AS "From Account",t."Account Label" AS "To Account",
 r.from_account IS NOT NULL AND r.to_account IS NOT NULL AS "Internal Transfer",
 r.transfer_amount AS "Transaction Amount",greatest(r.amount,0) AS "Money In",greatest(-r.amount,0) AS "Money Out",
 r.amount AS "Net Movement",NULL::numeric AS "Balance After",s.available AS "Available From",r.notes AS "Notes"
FROM entries r JOIN all_scopes s ON s.id=r.scope
LEFT JOIN public."Borrowers" b ON b."Row ID"=r.borrower
LEFT JOIN public."Partners" p ON p."Row ID"=r.partner
LEFT JOIN public."Cash Accounts" f ON f."Row ID"=r.from_account
LEFT JOIN public."Cash Accounts" t ON t."Row ID"=r.to_account;

CREATE VIEW public.reporting_income_events AS
SELECT 'repayment:'||"Row ID" AS "Event ID", "Payment Date" AS "Date",
 "Interest Paid"::numeric AS "Income",0::numeric AS "Expenses"
FROM public.olap_repayments_analytics WHERE "Payment Date"<=public.olap_reporting_date()
UNION ALL
SELECT 'expense:'||"Row ID","Expense Date",0::numeric,"Amount"::numeric
FROM public."Business Expenses" WHERE "Expense Date"<=public.olap_reporting_date();

CREATE VIEW public.reporting_statement_calendar AS
SELECT generate_series(date_trunc('month',least(
 (SELECT min("Date") FROM public.reporting_income_events),
 (SELECT min("Movement Date") FROM public."Cash Ledger"),
 (SELECT min(available) FROM public.reporting_cash_scopes),public.olap_reporting_date()))::date,
 public.olap_reporting_date(),interval '1 day')::date AS "Date";

CREATE FUNCTION public.reporting_cash_period(p_from date,p_to date,p_scope text)
RETURNS TABLE("Period Start" date,"Period End" date,"Account" text,"Available From" date,
 "Opening Balance" numeric,"Money In" numeric,"Money Out" numeric,"Net Movement" numeric,
 "Closing Balance" numeric,"Transaction Count" bigint,"Statement Status" text)
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 WITH amounts AS (
  SELECT s.id,s.label,s.available,s.baseline,
   coalesce(sum(e."Net Movement") FILTER(WHERE e."Date"<p_from),0) prior,
   coalesce(sum(e."Money In") FILTER(WHERE e."Date">=p_from),0) cash_in,
   coalesce(sum(e."Money Out") FILTER(WHERE e."Date">=p_from),0) cash_out,
   count(e."Entry ID") FILTER(WHERE e."Date">=p_from) n
  FROM public.reporting_cash_scopes s LEFT JOIN public.reporting_cash_entries e
   ON e."Scope ID"=s.id AND e."Date"<=p_to
  WHERE s.id=p_scope AND p_from<=p_to AND p_to<=public.olap_reporting_date()
  GROUP BY s.id,s.label,s.available,s.baseline
 ), balances AS (
  SELECT *,CASE WHEN p_from>=available THEN baseline+prior END opening,
   CASE WHEN p_to>=available THEN baseline+prior+cash_in-cash_out END closing FROM amounts
 )
 SELECT p_from,p_to,label,available,opening,cash_in,cash_out,cash_in-cash_out,closing,n,
  CASE WHEN opening IS NULL THEN 'Opening unavailable' WHEN closing IS NULL THEN 'Closing unavailable'
   WHEN abs(opening+cash_in-cash_out-closing)<0.005 THEN 'Balances match'
   ELSE 'Balance mismatch' END FROM balances
$$;

CREATE FUNCTION public.reporting_cash_period_entries(p_from date,p_to date,p_scope text)
RETURNS SETOF public.reporting_cashflow_transactions
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 WITH seed AS (
  SELECT s.*,s.baseline+coalesce((SELECT sum(e."Net Movement") FROM public.reporting_cash_entries e
   WHERE e."Scope ID"=p_scope AND e."Date"<p_from),0) opening
  FROM public.reporting_cash_scopes s WHERE s.id=p_scope
 ), selected AS (
  SELECT e.*,CASE WHEN e."Date">=s.available THEN s.opening+sum(e."Net Movement") OVER
   (ORDER BY e."Date",e."Posted At",e."Ledger ID" COLLATE "C",e."Entry ID" COLLATE "C" ROWS UNBOUNDED PRECEDING) END balance
  FROM public.reporting_cash_entries e CROSS JOIN seed s
  WHERE e."Scope ID"=p_scope AND e."Date" BETWEEN p_from AND p_to AND p_to<=public.olap_reporting_date()
 )
 SELECT "Entry ID","Scope ID","Account","Ledger ID","Date","Posted At","Transaction Type","Counterparty",
 "From Account","To Account","Internal Transfer","Transaction Amount","Money In","Money Out","Net Movement",
 balance,"Available From","Notes" FROM selected
$$;

COMMENT ON VIEW public.reporting_cash_entries IS 'Live unwindowed ledger entries. One side per account or one net entry per consolidated ledger; transfers cancel for All accounts. NULL Balance After placeholder; use period function for balances.';
COMMENT ON FUNCTION public.reporting_cash_period(date,date,text) IS 'Live bounded period totals with fresh opening seed from source ledger. No daily history grid, snapshot seed or FIFO.';
COMMENT ON FUNCTION public.reporting_cash_period_entries(date,date,text) IS 'Live opening seed then running balances only over selected transactions; unknown/pre-opening balances stay NULL.';
REVOKE ALL ON FUNCTION public.reporting_cash_period(date,date,text),public.reporting_cash_period_entries(date,date,text) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='metabase_borrower_reader') THEN
  GRANT SELECT ON public.reporting_cash_scopes,public.reporting_cash_entries,public.reporting_income_events,public.reporting_statement_calendar TO metabase_borrower_reader;
  GRANT EXECUTE ON FUNCTION public.reporting_cash_period(date,date,text),public.reporting_cash_period_entries(date,date,text) TO metabase_borrower_reader;
 END IF;
END $$;

