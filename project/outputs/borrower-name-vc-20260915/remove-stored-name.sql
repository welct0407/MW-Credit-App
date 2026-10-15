BEGIN;
DO $$ BEGIN IF current_database()<>'loan_manager_prod' THEN RAISE EXCEPTION 'Wrong database'; END IF; END $$;
DROP TRIGGER appsheet_loan_borrower_name ON public."Loans";
DROP TRIGGER appsheet_borrower_name_propagate ON public."Borrowers";
ALTER TABLE public."Loans" DROP COLUMN "Borrower Name" RESTRICT;
DROP FUNCTION public.appsheet_loan_borrower_name();
DROP FUNCTION public.appsheet_borrower_name_propagate();
COMMIT;
