-- Owned disposable pre-V6 source; V6 explicitly performs no historical posting.
-- Existing Error parents survive forward migration without disabling integrity.
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES('C-NATIVE-HIST-B','Synthetic historical allocation borrower');
INSERT INTO public."Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Payment Method","Allocation Method")
-- Match the Bangkok business date used by the native-operation charge fixture,
-- including when the CI runner's UTC calendar date is still the previous day.
VALUES('C-NATIVE-HIST-P','C-NATIVE-HIST-B','Error',100::money,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,'Cash','Lump Sum');
