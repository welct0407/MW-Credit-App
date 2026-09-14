BEGIN;
DROP TRIGGER appsheet_borrower_name_propagate ON public."Borrowers";
DROP TRIGGER appsheet_loan_borrower_name ON public."Loans";
DROP FUNCTION public.appsheet_borrower_name_propagate();
DROP FUNCTION public.appsheet_loan_borrower_name();
-- Values remain as the most recent correct lookup results.
COMMIT;
