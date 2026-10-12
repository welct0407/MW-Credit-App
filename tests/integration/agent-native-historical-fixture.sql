-- Owned disposable pre-V6 source; V6 explicitly performs no historical posting.
-- Existing Error parents survive forward migration without disabling integrity.
INSERT INTO public."Borrowers"("Row ID","Borrower Name") VALUES('C-NATIVE-HIST-B','Synthetic historical allocation borrower');
INSERT INTO public."Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Payment Method","Allocation Method")
VALUES('C-NATIVE-HIST-P','C-NATIVE-HIST-B','Error',100::money,current_date,'Cash','Lump Sum');
