-- R048: borrower/date summary of the exact existing capped forecast events.
CREATE VIEW public.oltp_upcoming_charge_summary_v1 AS
SELECT 'ufs1:' || length("Ref Borrower") || ':' || "Ref Borrower" || ':' || to_char("Due Date",'YYYY-MM-DD') AS "Row ID",
 "Ref Borrower", "Due Date", sum("Amount Remaining") AS "Total Charge", "As Of Date"
FROM public.oltp_upcoming_charge_events_v1
WHERE "Borrower Due Date Rank" BETWEEN 1 AND 5 AND "Due Date" <= "Horizon End"
GROUP BY "Ref Borrower", "Due Date", "As Of Date";
COMMENT ON VIEW public.oltp_upcoming_charge_summary_v1 IS
 'R048: read-only one borrower/date, first five distinct dates within existing three-month horizon; sum matches upcoming details.';
REVOKE ALL ON public.oltp_upcoming_charge_summary_v1 FROM PUBLIC;
