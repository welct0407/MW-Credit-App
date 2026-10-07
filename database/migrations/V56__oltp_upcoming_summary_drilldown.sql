-- R049: retain V1's first-five contract for the existing production app.
-- V2 has the same columns/keys, covering the event provider's seven-day OR
-- first-five-date union. AppSheet selects the appropriate presentation window.
CREATE VIEW public.oltp_upcoming_charge_summary_v2 AS
SELECT 'ufs1:' || length("Ref Borrower") || ':' || "Ref Borrower" || ':' || to_char("Due Date",'YYYY-MM-DD') AS "Row ID",
 "Ref Borrower", "Due Date", sum("Amount Remaining") AS "Total Charge", "As Of Date"
FROM public.oltp_upcoming_charge_events_v1
WHERE "Due Date" > "As Of Date" AND "Due Date" <= "Horizon End"
GROUP BY "Ref Borrower", "Due Date", "As Of Date";
COMMENT ON VIEW public.oltp_upcoming_charge_summary_v2 IS
 'R049: read-only borrower/date totals for seven-day menu and first-five-date borrower summaries; detail amounts reconcile to the bounded event provider. V1 retained for old-app compatibility.';
REVOKE ALL ON public.oltp_upcoming_charge_summary_v2 FROM PUBLIC;
