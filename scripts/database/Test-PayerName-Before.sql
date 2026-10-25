-- R095 V111 upgrade fixture (run at V110 by Test-CI's pre-target route): synthetic borrowers whose old
-- "Communication Name" values V111 must clear. Committed on purpose; Test-PayerName.sql checks them after V111.
\set ON_ERROR_STOP on
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Communication Name")
VALUES ('PN-BEFORE-1','SYNTHETIC PAYER BEFORE 1','old contact name'),('PN-BEFORE-2','SYNTHETIC PAYER BEFORE 2',' '),
       ('PN-BEFORE-3','SYNTHETIC PAYER BEFORE 3',NULL);
