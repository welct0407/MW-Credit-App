-- Preserve UTF-8 transfer labels; V38 remains immutable after DEV application.
CREATE OR REPLACE VIEW public.reporting_cash_entries AS
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
  WHEN r.from_account IS NOT NULL AND r.to_account IS NOT NULL THEN concat(f."Account Label",' → ',t."Account Label")
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

