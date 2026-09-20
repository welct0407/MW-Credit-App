-- R010: read-only account statements and non-financial per-partner selections.
-- Preserve R008 opening-minus-baseline semantics, including later corrections.
CREATE TABLE public."Cash Statement Context" (
 "Ref Partner" text PRIMARY KEY REFERENCES public."Partners"("Row ID") ON DELETE CASCADE,
 "Ref Cash Account" text REFERENCES public."Cash Accounts"("Row ID") ON DELETE SET NULL,
 "Statement Date" date DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,
 "Updated At" timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')
);
CREATE FUNCTION public.guard_cash_statement_context() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW."Ref Partner" IS DISTINCT FROM OLD."Ref Partner" THEN
  RAISE EXCEPTION 'Statement context owner is immutable';
 END IF;
 NEW."Updated At":=clock_timestamp() AT TIME ZONE 'Asia/Bangkok';
 RETURN NEW;
END $$;
CREATE TRIGGER guard_cash_statement_context BEFORE INSERT OR UPDATE ON public."Cash Statement Context"
 FOR EACH ROW EXECUTE FUNCTION public.guard_cash_statement_context();
CREATE FUNCTION public.seed_cash_statement_context() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public."Cash Statement Context"("Ref Partner") VALUES(NEW."Row ID") ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER seed_cash_statement_context AFTER INSERT ON public."Partners"
 FOR EACH ROW EXECUTE FUNCTION public.seed_cash_statement_context();
INSERT INTO public."Cash Statement Context"("Ref Partner") SELECT "Row ID" FROM public."Partners";

-- Internal SQL provider; never loaded into OLTP. One immutable ledger identity/side.
CREATE VIEW public.cash_statement_account_effects AS
SELECT jsonb_build_array(l."Row ID",s.direction,s.account)::text AS "Row ID",
 l."Row ID" AS ledger_id,s.direction,s.account AS "Ref Cash Account",
 l."Movement Date" AS "Statement Date",l."Created At" AS "Sort Timestamp",
 l."Created At"::time AS "Statement Time",s.amount AS "Signed Amount",
 CASE l."Movement Type"
  WHEN 'Payment Receipt' THEN CASE WHEN p."Allocation Method"='First-day Auto' THEN 'FIRST_DAY_PAYMENT' ELSE 'LOAN_PAYMENT' END
  WHEN 'Loan Disbursement' THEN 'LOAN_DISBURSEMENT'
  WHEN 'Business Expense' THEN CASE WHEN e."Source Type"='Referral Rebate' THEN 'REFERRAL_REBATE' ELSE 'BUSINESS_EXPENSE' END
  WHEN 'Partner Settlement' THEN 'PARTNER_SETTLEMENT'
  WHEN 'Cash Handover' THEN CASE WHEN fa."Ref Cash Holder"=ta."Ref Cash Holder" THEN 'ACCOUNT_TRANSFER' ELSE 'CASH_TRANSFER' END
  WHEN 'Expense Reimbursement' THEN 'EXPENSE_REIMBURSEMENT'
  WHEN 'Opening Balance' THEN 'OPENING_BALANCE'
  WHEN 'Manual Correction' THEN 'MANUAL_CORRECTION'
  ELSE 'OTHER' END AS "Transaction Type Code",
 CASE WHEN l."Movement Type" IN ('Cash Handover','Expense Reimbursement') THEN 'ACCOUNT'
  WHEN l."Movement Type"='Manual Correction' THEN 'ADJUSTMENT'
  WHEN coalesce(p."Ref Borrower",n."Ref Borrowers",e."Ref Payee Borrower") IS NOT NULL THEN 'BORROWER'
  WHEN st."Ref Partner" IS NOT NULL THEN 'PARTNER'
  WHEN e."Row ID" IS NOT NULL THEN 'PAYEE' ELSE 'NONE' END AS "Counterparty Kind",
 coalesce(nullif(e."Payee Name",''),nullif(e."Expense Category",''),'') AS "Counterparty Text",
 coalesce(p."Ref Borrower",n."Ref Borrowers",e."Ref Payee Borrower") AS "Ref Borrower",
 s.other_account AS "Ref Other Cash Account",st."Ref Partner",
 l."Ref Payment",l."Ref Loan",l."Ref Business Expense",l."Ref Settlement" AS "Settlement Row ID",
 l."Notes",l."Source Type",l."Source Key"
FROM public."Cash Ledger" l
CROSS JOIN LATERAL (VALUES
 ('OUT',l."Ref From Cash Account",-l."Amount",l."Ref To Cash Account"),
 ('IN',l."Ref To Cash Account",l."Amount",l."Ref From Cash Account")
) s(direction,account,amount,other_account)
LEFT JOIN public."Payments" p ON p."Row ID"=l."Ref Payment"
LEFT JOIN public."Loans" n ON n."Row ID"=l."Ref Loan"
LEFT JOIN public."Business Expenses" e ON e."Row ID"=l."Ref Business Expense"
LEFT JOIN public."Settlements" st ON st."Row ID"=l."Ref Settlement"
LEFT JOIN public."Cash Accounts" fa ON fa."Row ID"=l."Ref From Cash Account"
LEFT JOIN public."Cash Accounts" ta ON ta."Row ID"=l."Ref To Cash Account"
WHERE s.account IS NOT NULL;

CREATE VIEW public."Cash Account Statement Recent" AS
WITH bounds AS (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AS today),
 running AS (
 SELECT e.*,c."Ref Cash Account" IS NOT NULL AS initialized,
  c."Opening Balance"-c."Baseline Cash In"+c."Baseline Cash Out"
   +sum(e."Signed Amount") OVER (PARTITION BY e."Ref Cash Account"
    ORDER BY e."Statement Date",e."Sort Timestamp",e.ledger_id COLLATE "C",e.direction COLLATE "C"
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance
 FROM public.cash_statement_account_effects e
 LEFT JOIN public.r008_cash_account_cutover c ON c."Ref Cash Account"=e."Ref Cash Account"
)
SELECT "Row ID","Ref Cash Account","Statement Date","Statement Time","Sort Timestamp",
 "Transaction Type Code","Counterparty Kind","Counterparty Text","Ref Borrower","Ref Other Cash Account",
 "Ref Partner","Ref Payment","Ref Loan","Ref Business Expense","Settlement Row ID","Signed Amount",
 balance AS "Balance After",initialized AS "Is Initialized","Notes","Source Type","Source Key"
FROM running CROSS JOIN bounds WHERE "Statement Date" BETWEEN today-14 AND today;

CREATE VIEW public."Cash Account Daily Summary Recent" AS
WITH bounds AS (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AS today),
 days AS (SELECT today-i AS day FROM bounds CROSS JOIN generate_series(0,14) i),
 daily AS (
 SELECT "Ref Cash Account" account,"Statement Date" AS day,
  sum(greatest("Signed Amount",0)) cash_in,sum(greatest(-"Signed Amount",0)) cash_out,count(*) n
 FROM public.cash_statement_account_effects GROUP BY 1,2
), grid AS (
 SELECT a."Row ID" account,d.day,c."Ref Cash Account" IS NOT NULL initialized,
  c."Opening Balance"-c."Baseline Cash In"+c."Baseline Cash Out"
   +coalesce((SELECT sum(x.cash_in-x.cash_out) FROM daily x WHERE x.account=a."Row ID" AND x.day<d.day),0) opening,
  coalesce(t.cash_in,0) cash_in,coalesce(t.cash_out,0) cash_out,coalesce(t.n,0) n
 FROM public."Cash Accounts" a CROSS JOIN days d
 LEFT JOIN public.r008_cash_account_cutover c ON c."Ref Cash Account"=a."Row ID"
 LEFT JOIN daily t ON t.account=a."Row ID" AND t.day=d.day
)
SELECT jsonb_build_array(account,day)::text AS "Row ID",account AS "Ref Cash Account",day AS "Statement Date",
 opening AS "Opening Balance",cash_in AS "Money In",cash_out AS "Money Out",cash_in-cash_out AS "Net Movement",
 opening+cash_in-cash_out AS "Closing Balance",n AS "Transaction Count",initialized AS "Is Initialized"
FROM grid;

COMMENT ON TABLE public."Cash Statement Context" IS 'R010 UI state only. AppSheet UPDATES_ONLY; signed-in Partner security filter; only account/date editable. No financial posting.';
COMMENT ON VIEW public."Cash Account Statement Recent" IS 'R010 latest 15 Bangkok dates. Running balances use all prior ledger effects and immutable R008 opening/baseline offsets. NULL without initialization.';
