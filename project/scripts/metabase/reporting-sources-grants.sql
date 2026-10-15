-- Owner-directed object-level reporting access, 22 September 2026.
-- Existing reporting sources only; no ALL TABLES, default privileges or writes.
GRANT SELECT ON
 public.olap_borrowers_analytics,
 public.olap_loans_analytics,
 public.olap_repayments_analytics,
 public.olap_charges_analytics,
 public.olap_portfolio_summary,
 public."Daily Analytics",
 public."Partners",
 public."Loan Form Context",
 public."Cash Dashboard",
 public."Cash Account Balances",
 public."Business Expenses",
 public."Settlements"
TO metabase_borrower_reader;
