-- R051: remove the remaining Visible Allocations child-table dependency.
-- Append one computed field to the ordinary view; no data or existing-column changes.
CREATE OR REPLACE VIEW public.oltp_payment_related_ids_v1 WITH (security_invoker=true) AS
SELECT p."Row ID",
 coalesce(r.ids,'') AS "Repayment IDs",
 coalesce(a.ids,'') AS "Allocation IDs",
 coalesce(l.ids,'') AS "Closing Loan IDs",
 coalesce(a.visible_ids,'') AS "Visible Allocation IDs"
FROM public."Payments" p
LEFT JOIN (
 SELECT r."Ref Payment", string_agg(r."Row ID",' , ' ORDER BY r."Payment Date" DESC,a."Allocation Order",r."Row ID") AS ids
 FROM public."Repayments" r LEFT JOIN public."Payment Allocations" a ON a."Row ID"=r."Ref Payment Allocation"
 GROUP BY r."Ref Payment"
) r ON r."Ref Payment"=p."Row ID"
LEFT JOIN (
 SELECT "Ref Payment", string_agg("Row ID",' , ' ORDER BY "Allocation Order","Row ID") AS ids,
 string_agg("Row ID",' , ' ORDER BY "Allocation Order","Row ID") FILTER (WHERE "Allocated Amount">0::money) AS visible_ids
 FROM public."Payment Allocations" GROUP BY "Ref Payment"
) a ON a."Ref Payment"=p."Row ID"
LEFT JOIN (
 SELECT "Ref Closing Payment", string_agg("Row ID",' , ' ORDER BY "Row ID") AS ids
 FROM public."Loans" GROUP BY "Ref Closing Payment"
) l ON l."Ref Closing Payment"=p."Row ID";

