-- Independent V54 reference query, retained to test the V74 rewrite.
CREATE FUNCTION pg_temp.check_coverage_parity() RETURNS void LANGUAGE plpgsql AS $test$
DECLARE differences integer;
BEGIN
 WITH old AS (
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
LEFT JOIN dates d ON d.borrower_id=b."Row ID"
), current AS (SELECT * FROM public.oltp_upcoming_charge_coverage_v1)
 SELECT count(*) INTO differences FROM ((SELECT * FROM old EXCEPT ALL SELECT * FROM current)
 UNION ALL (SELECT * FROM current EXCEPT ALL SELECT * FROM old)) d;
 IF differences<>0 THEN RAISE EXCEPTION 'Coverage differs from V54 reference: %', differences; END IF;
END $test$;
-- R175 (V151): the events view as it stood at V150 (raw MATERIALIZED), frozen, must equal the current view on every column
-- except "Calculated At".
CREATE FUNCTION pg_temp.check_events_parity() RETURNS void LANGUAGE plpgsql AS $test$
DECLARE differences integer;
BEGIN
 WITH old AS (
WITH raw AS MATERIALIZED (
 SELECT i.loan_id,i.borrower_id,i.loan,i.reporting_date,least((i.reporting_date+interval '3 months')::date,i.reporting_date+93) AS horizon_end,
  s.due_date,s.origin,s.bucket,s.principal,s.interest,s.eligible,s.issue
 FROM public.reporting_forecast_inputs_v1 i JOIN public."Borrowers" b ON b."Row ID"=i.borrower_id
 CROSS JOIN LATERAL public.forecast_schedule_v1(i.loan,i.charges,i.reporting_date,least((i.reporting_date+interval '3 months')::date,i.reporting_date+93)) s
), amounts AS (
 SELECT loan_id,borrower_id,reporting_date,horizon_end,due_date,sum(principal) AS principal,sum(interest) AS interest,
  CASE WHEN bool_or(origin='Recorded') THEN
   CASE WHEN bool_or(bucket='Recovery only') THEN 'Recorded - review status'
    WHEN bool_and(NOT coalesce((loan->>'auto')::boolean,false)) THEN 'Recorded settlement' ELSE 'Recorded' END
  ELSE 'Projected' END AS basis
 FROM raw WHERE due_date>reporting_date AND due_date<=horizon_end AND principal+interest>0 AND (origin='Recorded' OR origin='Simulated' AND eligible)
 GROUP BY loan_id,borrower_id,reporting_date,horizon_end,due_date
), ranked AS (
 SELECT a.*,dense_rank() OVER (PARTITION BY a.borrower_id ORDER BY a.due_date)::integer AS due_rank,
  coalesce((SELECT sum(c."Late Charge Remaining") FROM public."Charges" c
   WHERE c."Ref Loans"=a.loan_id AND c."Charge Date"=a.due_date AND a.basis<>'Projected'),0::numeric) AS late
 FROM amounts a
)
SELECT 'uf1:'||length(loan_id)||':'||loan_id||':'||to_char(due_date,'YYYY-MM-DD') AS "Row ID",borrower_id AS "Ref Borrower",loan_id AS "Ref Loan",
 due_date AS "Due Date",principal AS "Principal Remaining",interest AS "Interest Remaining",principal+interest+late AS "Amount Remaining",basis AS "Basis",
 reporting_date AS "As Of Date",horizon_end AS "Horizon End",due_date<=reporting_date+7 AS "Within 7 Days",due_rank AS "Borrower Due Date Rank",
 late AS "Late Charge Remaining"
FROM ranked WHERE due_date<=reporting_date+7 OR due_rank<=5
), current AS (
 SELECT "Row ID","Ref Borrower","Ref Loan","Due Date","Principal Remaining","Interest Remaining","Amount Remaining","Basis","As Of Date",
  "Horizon End","Within 7 Days","Borrower Due Date Rank","Late Charge Remaining" FROM public.oltp_upcoming_charge_events_v1)
 SELECT count(*) INTO differences FROM ((SELECT * FROM old EXCEPT ALL SELECT * FROM current)
 UNION ALL (SELECT * FROM current EXCEPT ALL SELECT * FROM old)) d;
 IF differences<>0 THEN RAISE EXCEPTION 'Events differ from the frozen V150 definition: %', differences; END IF;
END $test$;
-- R175 (V151): a borrower-scoped read plans the forecast without a materialized raw CTE and filters "Loans" by borrower.
CREATE FUNCTION pg_temp.check_borrower_pushdown(query text) RETURNS void LANGUAGE plpgsql AS $test$
DECLARE plan jsonb;
BEGIN
 EXECUTE 'EXPLAIN (FORMAT JSON) '||query INTO plan;
 IF jsonb_path_exists(plan,'lax $.** ? (@."CTE Name" == "raw")') THEN RAISE EXCEPTION 'Plan materializes the forecast (CTE raw): %',query; END IF;
 IF NOT jsonb_path_exists(plan,'lax $.** ? (@."Relation Name" == "Loans" && (@."Index Cond" like_regex "Ref Borrowers" || @."Recheck Cond" like_regex "Ref Borrowers" || @."Filter" like_regex "Ref Borrowers"))') THEN
  RAISE EXCEPTION 'Plan does not filter "Loans" by borrower: %',query; END IF;
END $test$;
