-- Synthetic, transaction-rolled-back compatibility and isolation checks.
BEGIN;
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Description","Hidden Flag","AI Collection Enabled")
VALUES ('R011-SQL-A','R011 Test A','R011 Test A',true,false),('R011-SQL-B','R011 Test B','R011 Test B',true,false);
CREATE TEMP TABLE r011_before AS SELECT count(*) payments FROM public."Payments";
UPDATE public."Borrowers" SET "Borrower Note"=E'Requested a later payment date\nPlease call tomorrow.' WHERE "Row ID"='R011-SQL-A';
DO $$ BEGIN
 IF (SELECT "Borrower Note" FROM public."Borrowers" WHERE "Row ID"='R011-SQL-A') IS DISTINCT FROM E'Requested a later payment date\nPlease call tomorrow.' THEN RAISE EXCEPTION 'Note failed to persist'; END IF;
 IF (SELECT "Borrower Note" FROM public."Borrowers" WHERE "Row ID"='R011-SQL-B') IS NOT NULL THEN RAISE EXCEPTION 'Other borrower note changed'; END IF;
 IF (SELECT count(*) FROM public."Payments")<>(SELECT payments FROM r011_before) THEN RAISE EXCEPTION 'Note generated payment'; END IF;
 IF (SELECT "Total Outstanding Principal" FROM public."Borrowers" WHERE "Row ID"='R011-SQL-A')<>0 THEN RAISE EXCEPTION 'Note changed principal'; END IF;
 IF NOT EXISTS(SELECT FROM public.olap_borrowers_analytics WHERE "Row ID"='R011-SQL-A') THEN RAISE EXCEPTION 'OLAP consumer incompatible'; END IF;
END $$;
UPDATE public."Borrowers" SET "Borrower Note"=NULL WHERE "Row ID"='R011-SQL-A';
ROLLBACK;
