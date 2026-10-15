-- Restore Money's Loans.Borrower Name lookup without changing app columns.
-- Intended database: loan_manager_prod. No source production app is edited.
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'loan_manager_prod' THEN RAISE EXCEPTION 'Wrong database'; END IF;
END $$;
CREATE FUNCTION public.appsheet_loan_borrower_name() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  SELECT b."Borrower Name" INTO NEW."Borrower Name"
  FROM public."Borrowers" b WHERE b."Row ID" = NEW."Ref Borrowers";
  RETURN NEW;
END $$;
CREATE TRIGGER appsheet_loan_borrower_name
BEFORE INSERT OR UPDATE ON public."Loans"
FOR EACH ROW EXECUTE FUNCTION public.appsheet_loan_borrower_name();
CREATE FUNCTION public.appsheet_borrower_name_propagate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public."Loans" SET "Borrower Name" = NEW."Borrower Name"
  WHERE "Ref Borrowers" = NEW."Row ID"
    AND "Borrower Name" IS DISTINCT FROM NEW."Borrower Name";
  RETURN NEW;
END $$;
CREATE TRIGGER appsheet_borrower_name_propagate
AFTER UPDATE OF "Borrower Name" ON public."Borrowers"
FOR EACH ROW WHEN (OLD."Borrower Name" IS DISTINCT FROM NEW."Borrower Name")
EXECUTE FUNCTION public.appsheet_borrower_name_propagate();
-- Repair only the two synthetic rows created during validation.
UPDATE public."Loans" SET "Borrower Name" = "Borrower Name"
WHERE "Ref Borrowers" = 'QeqkhidjbnTQO7RiZHchJ7';
COMMIT;
