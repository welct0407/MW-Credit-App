BEGIN;
DO $$ BEGIN IF current_database()<>'loan_manager_prod' THEN RAISE EXCEPTION 'Wrong database'; END IF; END $$;
ALTER TABLE public."Loans" ADD COLUMN "Borrower Name" text;
UPDATE public."Loans" l SET "Borrower Name"=b."Borrower Name" FROM public."Borrowers" b WHERE b."Row ID"=l."Ref Borrowers";
CREATE OR REPLACE FUNCTION public.appsheet_loan_borrower_name()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 SELECT b."Borrower Name" INTO NEW."Borrower Name"
 FROM public."Borrowers" b WHERE b."Row ID" = NEW."Ref Borrowers";
 RETURN NEW;
END $function$
;
CREATE TRIGGER appsheet_loan_borrower_name BEFORE INSERT OR UPDATE ON public."Loans" FOR EACH ROW EXECUTE FUNCTION appsheet_loan_borrower_name();
CREATE OR REPLACE FUNCTION public.appsheet_borrower_name_propagate()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
 UPDATE public."Loans" SET "Borrower Name" = NEW."Borrower Name"
 WHERE "Ref Borrowers" = NEW."Row ID"
 AND "Borrower Name" IS DISTINCT FROM NEW."Borrower Name";
 RETURN NEW;
END $function$
;
CREATE TRIGGER appsheet_borrower_name_propagate AFTER UPDATE OF "Borrower Name" ON public."Borrowers" FOR EACH ROW WHEN ((old."Borrower Name" IS DISTINCT FROM new."Borrower Name")) EXECUTE FUNCTION appsheet_borrower_name_propagate();
COMMIT;
