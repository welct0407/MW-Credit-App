-- R016: column-only reporting access. No financial or schema changes.
-- The existing role's nine borrower-column grants remain in place.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'loan_manager_prod' THEN RAISE EXCEPTION 'Expected loan_manager_prod'; END IF;
END $$;
GRANT SELECT ("Description") ON public.olap_borrowers_analytics TO metabase_borrower_reader;
GRANT SELECT ("Row ID", "Total Cash Pool", "Outstanding Principal", "Active Loans",
  "Expected Daily Interest", "Realized Profit MTD", "Projected Monthly Profit",
  "Total Unsettled Profit", "Expected Loan Account Balance", "Peak Cash Pool Date 30D")
  ON public.olap_portfolio_summary TO metabase_borrower_reader;
GRANT SELECT ("Row ID", "Ref Borrowers", "Loan Date", "Loan Type", "Outstanding Principal")
  ON public.olap_loans_analytics TO metabase_borrower_reader;
GRANT SELECT ("Row ID", "Ref Loans", "Payment Date", "Interest Paid", "Principal Paid")
  ON public.olap_repayments_analytics TO metabase_borrower_reader;
-- Remove permissions used only during the initial source assessment.
REVOKE SELECT ("Total Interest Earned") ON public.olap_borrowers_analytics FROM metabase_borrower_reader;
REVOKE SELECT ("Row ID", "Ref Loans", "Charge Date", "Amount Remaining")
  ON public.olap_charges_analytics FROM metabase_borrower_reader;
GRANT SELECT ("Row ID", "Snapshot Date", "Generated At", "Model Version", "Principal Issued",
  "Principal Returned", "Interest Received", "Outstanding Principal EOD", "Pending Charges EOD")
  ON public."Daily Analytics" TO metabase_borrower_reader;
COMMIT;
