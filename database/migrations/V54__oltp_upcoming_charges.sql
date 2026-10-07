-- R048: read-only OLTP forecast adapters. Existing schedule engine and financial data unchanged.
CREATE VIEW public.oltp_upcoming_charge_events_v1 AS
WITH raw AS MATERIALIZED (
 SELECT i.loan_id,i.borrower_id,i.loan,i.reporting_date,
 least((i.reporting_date+interval '3 months')::date,i.reporting_date+93) horizon_end,s.*
 FROM public.reporting_forecast_inputs_v1 i
 JOIN public."Borrowers" b ON b."Row ID"=i.borrower_id
 CROSS JOIN LATERAL public.forecast_schedule_v1(i.loan,i.charges,i.reporting_date,
  least((i.reporting_date+interval '3 months')::date,i.reporting_date+93)) s
), amounts AS (
 SELECT loan_id,borrower_id,reporting_date,horizon_end,due_date,
 sum(principal) principal,sum(interest) interest,
 CASE WHEN bool_or(origin='Recorded') THEN
  CASE WHEN bool_or(bucket='Recovery only') THEN 'Recorded - review status'
       WHEN bool_and(NOT coalesce((loan->>'auto')::boolean,false)) THEN 'Recorded settlement'
       ELSE 'Recorded' END
 ELSE 'Projected' END basis
 FROM raw WHERE due_date>reporting_date AND due_date<=horizon_end AND principal+interest>0
 AND (origin='Recorded' OR (origin='Simulated' AND eligible))
 GROUP BY loan_id,borrower_id,reporting_date,horizon_end,due_date
), ranked AS (
 SELECT *,dense_rank() OVER(PARTITION BY borrower_id ORDER BY due_date)::integer due_rank FROM amounts
)
SELECT 'uf1:'||length(loan_id)||':'||loan_id||':'||to_char(due_date,'YYYY-MM-DD') AS "Row ID",
 borrower_id AS "Ref Borrower",loan_id AS "Ref Loan",due_date AS "Due Date",
 principal AS "Principal Remaining",interest AS "Interest Remaining",principal+interest AS "Amount Remaining",
 basis AS "Basis",reporting_date AS "As Of Date",horizon_end AS "Horizon End",
 statement_timestamp() AS "Calculated At",due_date<=reporting_date+7 AS "Within 7 Days",
 due_rank AS "Borrower Due Date Rank"
FROM ranked WHERE due_date<=reporting_date+7 OR due_rank<=5;

CREATE VIEW public.oltp_upcoming_charge_coverage_v1 AS
WITH raw AS MATERIALIZED (
 SELECT i.borrower_id,i.loan_id,i.reporting_date,s.*
 FROM public.reporting_forecast_inputs_v1 i
 LEFT JOIN LATERAL public.forecast_schedule_v1(i.loan,i.charges,i.reporting_date,
  least((i.reporting_date+interval '3 months')::date,i.reporting_date+93)) s ON true
), issues AS (
 SELECT borrower_id,
 count(DISTINCT loan_id) FILTER(WHERE origin='Notice' AND bucket='Recorded plan only')::integer manual_loans,
 count(DISTINCT loan_id) FILTER(WHERE origin='Exception' OR
  (origin='Recorded' AND bucket='Recovery only' AND due_date>reporting_date))::integer review_loans,
 string_agg(DISTINCT issue,'; ' ORDER BY issue) FILTER(WHERE origin='Exception') issue_text
 FROM raw GROUP BY borrower_id
), dates AS (
 SELECT "Ref Borrower" borrower_id,count(DISTINCT "Due Date")::integer displayed_dates
 FROM public.oltp_upcoming_charge_events_v1 WHERE "Borrower Due Date Rank"<=5 GROUP BY 1
), ctx AS (SELECT public.olap_reporting_date() t)
SELECT b."Row ID" AS "Row ID",b."Row ID" AS "Ref Borrower",t AS "As Of Date",
 least((t+interval '3 months')::date,t+93) AS "Horizon End",statement_timestamp() AS "Calculated At",
 coalesce(d.displayed_dates,0) AS "Displayed Dates",coalesce(i.manual_loans,0) AS "Recorded Only Loans",
 coalesce(i.review_loans,0) AS "Review Loans",
 CASE WHEN coalesce(i.review_loans,0)>0 THEN 'Incomplete / review required. ' ELSE '' END ||
 CASE WHEN coalesce(d.displayed_dates,0)=0 THEN 'No upcoming charges within 3 months.'
 ELSE 'Showing '||d.displayed_dates||' due dates within 3 months.' END ||
 CASE WHEN coalesce(i.manual_loans,0)>0 THEN ' Auto-off loans: recorded settlement charges only.' ELSE '' END ||
 CASE WHEN i.issue_text IS NOT NULL THEN ' '||i.issue_text ELSE '' END AS "Coverage Note"
FROM public."Borrowers" b CROSS JOIN ctx LEFT JOIN issues i ON i.borrower_id=b."Row ID"
LEFT JOIN dates d ON d.borrower_id=b."Row ID";

CREATE VIEW public.oltp_upcoming_charge_context_v1 AS
WITH ctx AS (SELECT public.olap_reporting_date() t), counts AS (
 SELECT coalesce(sum("Recorded Only Loans"),0)::integer manual_loans,
 coalesce(sum("Review Loans"),0)::integer review_loans FROM public.oltp_upcoming_charge_coverage_v1
), orphans AS (
 SELECT count(*)::integer n FROM public."Charges" c LEFT JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
 LEFT JOIN public."Borrowers" b ON b."Row ID"=l."Ref Borrowers" WHERE b."Row ID" IS NULL
)
SELECT 'upcoming'::text AS "Row ID",t AS "As Of Date",t+1 AS "From Date",t+7 AS "Through Date",
 statement_timestamp() AS "Calculated At",
 to_char(t+1,'DD Mon YYYY')||' - '||to_char(t+7,'DD Mon YYYY') AS "Date Range",
 CASE WHEN review_loans+orphans.n>0 THEN 'Partial forecast - source review required. ' ELSE '' END ||
 CASE WHEN manual_loans>0 THEN 'Auto-off loans use recorded settlement charges only. ' ELSE '' END ||
 'Projected amounts assume scheduled principal is collected on its due date. Sync to refresh.' AS "Forecast Note"
FROM ctx CROSS JOIN counts CROSS JOIN orphans;

COMMENT ON VIEW public.oltp_upcoming_charge_events_v1 IS
 'R048: one loan/date; recorded-first remaining obligations; next seven days union borrower first five dates within three calendar months (max 93 days). Read-only.';
REVOKE ALL ON public.oltp_upcoming_charge_events_v1,public.oltp_upcoming_charge_coverage_v1,
 public.oltp_upcoming_charge_context_v1 FROM PUBLIC;
-- AppSheet uses the existing verified owner connection. No new role or reporting grant.
