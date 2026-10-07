-- R051: reuse one statement-local forecast evaluation for coverage issues and date counts.
-- Same columns, keys, live freshness, notes and capped-date semantics; no cache or UI changes.
CREATE OR REPLACE VIEW public.oltp_upcoming_charge_coverage_v1 AS
WITH raw AS MATERIALIZED (
 SELECT i.borrower_id,i.loan_id,i.reporting_date,
 least((i.reporting_date+interval '3 months')::date,i.reporting_date+93) horizon_end,s.*
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
 SELECT borrower_id,least(count(DISTINCT due_date),5)::integer displayed_dates
 FROM raw
 WHERE due_date>reporting_date AND due_date<=horizon_end AND principal+interest>0
 AND (origin='Recorded' OR (origin='Simulated' AND eligible))
 GROUP BY borrower_id
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
