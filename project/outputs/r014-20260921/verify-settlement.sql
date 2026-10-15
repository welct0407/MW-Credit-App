SELECT "Status", "Amount"::numeric=100 AS exact_amount_retained,
"Notes" LIKE '%Deleted settlement by%' AS audit_note,
NOT EXISTS(SELECT 1 FROM public."Cash Ledger" l WHERE l."Ref Settlement"=s."Row ID") AS no_cash_effect
FROM public."Settlements" s WHERE "Row ID"='MnhvLkXcurjmpTtaRxLPrd';
-- Live GUI verified availability returned to its pre-test value. Do not persist
-- the business's private balance as a literal in the published test evidence.
SELECT NOT EXISTS(SELECT 1 FROM public."Settlements" WHERE "Row ID"='MnhvLkXcurjmpTtaRxLPrd' AND "Status" IS DISTINCT FROM 'Cancelled') AS test_reservation_released;
