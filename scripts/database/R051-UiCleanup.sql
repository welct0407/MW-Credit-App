-- Exact reserved fixtures only; no broad borrower/financial deletion.
DELETE FROM "Payments" WHERE "Row ID" IN ('SYN-R051-UI-P1','SYN-R051-UI-P2');
DELETE FROM "Cash Ledger" WHERE "Row ID"='SYN-R051-UI-H' AND "Entry Origin"='Manual';
DELETE FROM "Business Expenses" WHERE "Row ID"='SYN-R051-UI-E' AND "Source Type"='Manual';
DELETE FROM "Charges" WHERE "Row ID" IN ('SYN-R051-UI-C0','SYN-R051-UI-C1','SYN-R051-UI-C2');
DELETE FROM "Loans" WHERE "Row ID" IN ('SYN-R051-UI-L1','SYN-R051-UI-L2');
DELETE FROM "Borrowers" WHERE "Row ID"='SYN-R051-UI-B';
-- Derived snapshots belong only to these exact synthetic accounts.
DELETE FROM "Cash Account Daily Analytics" WHERE "Ref Cash Account" IN ('SYN-R051-UI-DAD','SYN-R051-UI-LISA');
DELETE FROM "Cash Accounts" WHERE "Row ID" IN ('SYN-R051-UI-DAD','SYN-R051-UI-LISA');
SET CONSTRAINTS ALL IMMEDIATE;
