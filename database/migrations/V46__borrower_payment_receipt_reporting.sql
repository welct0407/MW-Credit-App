-- R042: receipt-grain reporting only; no operational writes or existing object changes.
CREATE VIEW public.reporting_borrower_payments_v1 AS
SELECT p."Row ID" payment_id,p."Ref Borrower" borrower_id,p."Payment Date" payment_date,
 p."Status" status,p."Amount Received"::numeric amount_received,
 p."Payment Method" payment_method,p."Allocation Method" allocation_method,
 p."Planned Allocation Amount" planned_allocation_amount,p."Posted Amount" posted_amount,
 p."Created At" created_at,p."Processed At" processed_at,
 p."Bank Reference" bank_reference,p."Notes" notes,p."Created By" created_by,
 p."Ref Target Loan" target_loan_id,p."Ref Target Charge" target_charge_id,
 p."Ref Received By Cash Holder" received_holder_id,p."Ref Received By Cash Account" received_account_id,
 h."Holder Name" received_holder,a."Account Label" received_account,
 c."Charge Date" target_charge_date,c."Ref Loans" target_charge_loan_id
FROM public."Payments" p
LEFT JOIN public."Cash Holders" h ON h."Row ID"=p."Ref Received By Cash Holder"
LEFT JOIN public."Cash Accounts" a ON a."Row ID"=p."Ref Received By Cash Account"
LEFT JOIN public."Charges" c ON c."Row ID"=p."Ref Target Charge";
COMMENT ON VIEW public.reporting_borrower_payments_v1 IS
 'One row per original payment receipt, including unposted states and all payment fields. Owner explicitly requested full details. Reference labels included; immutable IDs are for joins, not dashboard display. Amount received is not necessarily posted.';
REVOKE ALL ON public.reporting_borrower_payments_v1 FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='metabase_borrower_reader') THEN
  GRANT SELECT ON public.reporting_borrower_payments_v1 TO metabase_borrower_reader;
 END IF;
END $$;
