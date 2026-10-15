BEGIN;
DO $$ DECLARE v text; BEGIN
 UPDATE public."Loans" SET "Borrower Name"='incorrect' WHERE "Row ID"='hnZ17NO2QNZrbBkB2xnnKs';
 SELECT "Borrower Name" INTO v FROM public."Loans" WHERE "Row ID"='hnZ17NO2QNZrbBkB2xnnKs';
 IF v IS DISTINCT FROM 'Tommy' THEN RAISE EXCEPTION 'Name override not corrected'; END IF;
 UPDATE public."Loans" SET "Ref Borrowers"='' WHERE "Row ID"='hnZ17NO2QNZrbBkB2xnnKs';
 IF EXISTS(SELECT 1 FROM public."Loans" WHERE "Row ID"='hnZ17NO2QNZrbBkB2xnnKs' AND ("Ref Borrowers" IS NOT NULL OR "Borrower Name" IS NOT NULL)) THEN RAISE EXCEPTION 'Blank ref not normalized and cleared'; END IF;
 UPDATE public."Loans" SET "Ref Borrowers"='QeqkhidjbnTQO7RiZHchJ7' WHERE "Row ID"='hnZ17NO2QNZrbBkB2xnnKs';
 SELECT "Borrower Name" INTO v FROM public."Loans" WHERE "Row ID"='hnZ17NO2QNZrbBkB2xnnKs';
 IF v IS DISTINCT FROM 'Tommy' THEN RAISE EXCEPTION 'Ref reassignment failed'; END IF;
 UPDATE public."Borrowers" SET "Borrower Name"='Tommy rollback probe' WHERE "Row ID"='QeqkhidjbnTQO7RiZHchJ7';
 IF EXISTS(SELECT 1 FROM public."Loans" WHERE "Ref Borrowers"='QeqkhidjbnTQO7RiZHchJ7' AND "Borrower Name" IS DISTINCT FROM 'Tommy rollback probe') THEN RAISE EXCEPTION 'Propagation failed'; END IF;
END $$;
SELECT 'PASS: 4 rollback-only lookup checks' AS result;
ROLLBACK;