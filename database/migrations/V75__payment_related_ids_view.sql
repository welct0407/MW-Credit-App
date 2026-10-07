-- R051 DEV experiment: reverse-reference keys calculated at read time.
-- No stored lists, financial writes, new maintenance triggers, or write adapter.
-- The Row ID is a plain text key; do not create an AppSheet reverse Ref here.
CREATE VIEW public.oltp_payment_related_ids_v1 WITH (security_invoker=true) AS
SELECT p."Row ID",
 coalesce(r.ids,'') AS "Repayment IDs",
 coalesce(a.ids,'') AS "Allocation IDs",
 coalesce(l.ids,'') AS "Closing Loan IDs"
FROM public."Payments" p
LEFT JOIN (
 SELECT r."Ref Payment", string_agg(r."Row ID",' , ' ORDER BY r."Payment Date" DESC,a."Allocation Order",r."Row ID") AS ids
 FROM public."Repayments" r LEFT JOIN public."Payment Allocations" a ON a."Row ID"=r."Ref Payment Allocation"
 GROUP BY r."Ref Payment"
) r ON r."Ref Payment"=p."Row ID"
LEFT JOIN (
 SELECT "Ref Payment", string_agg("Row ID",' , ' ORDER BY "Allocation Order","Row ID") AS ids
 FROM public."Payment Allocations" GROUP BY "Ref Payment"
) a ON a."Ref Payment"=p."Row ID"
LEFT JOIN (
 SELECT "Ref Closing Payment", string_agg("Row ID",' , ' ORDER BY "Row ID") AS ids
 FROM public."Loans" GROUP BY "Ref Closing Payment"
) l ON l."Ref Closing Payment"=p."Row ID";

COMMENT ON VIEW public.oltp_payment_related_ids_v1 IS
 'Read-time reverse-reference transport for AppSheet performance experiment. One row per Payments key, empty text for no children. Decode using existing List-of-Ref fields; no persisted cache. Child keys must not contain the transport delimiter (space-comma-space). No application write path is rebound to this view.';
