-- R028: automatic schedule assessment; additive read-only providers only.
CREATE VIEW public.reporting_loan_schedule_health_v1 AS
WITH ctx AS (SELECT public.olap_reporting_date() d,statement_timestamp() t),
charge_dates AS (
 SELECT "Ref Loans" loan_id,"Charge Date" due_date,sum("Interest Due"::numeric) interest,
 sum("Principal Due"::numeric) principal,
 bool_or("Charge Date" IS NULL OR "Interest Due" IS NULL OR "Principal Due" IS NULL
  OR "Interest Due"::numeric<0 OR "Principal Due"::numeric<0) invalid
 FROM public."Charges" GROUP BY 1,2
), base AS (
 SELECT l."Row ID" loan_id,l."Ref Borrowers" borrower_id,l."Loan Type" loan_type,
 l."Loan Date" start_date,coalesce(l."Interest Schedule Anchor Date",l."Loan Date") anchor_date,
 l."Interest Payment Interval" payment_interval,l."Current Daily Interest"::numeric daily_interest,
 coalesce(l."Transfer Fee"::numeric,0) transfer_fee,coalesce(l."Auto Charge Enabled",false) auto_charge_enabled,
 l."Outstanding Principal"::numeric outstanding_principal,coalesce(l."Defaulted",false) defaulted,
 d reporting_date,t calculated_at,
 CASE WHEN l."Loan Type" IS DISTINCT FROM 'ดอกเบี้ยรายวัน' THEN 'Unsupported loan type'
  WHEN l."Loan Date" IS NULL OR l."Interest Payment Interval" IS NULL OR l."Interest Payment Interval"<1
   OR l."Current Daily Interest" IS NULL OR l."Current Daily Interest"::numeric<=0
   OR coalesce(l."Interest Schedule Anchor Date",l."Loan Date")<l."Loan Date"
   OR coalesce(l."Defaulted",false) THEN 'Source review'
  ELSE 'Supported' END setup_status
 FROM public."Loans" l CROSS JOIN ctx
 WHERE l."Loan Status"='ยังไม่ปิดยอด' AND (l."Loan Date"<=d OR l."Loan Date" IS NULL)
  AND (l."Close Date" IS NULL OR l."Close Date">d)
), dates AS (
 SELECT b.*,
 greatest(reporting_date-30,CASE WHEN anchor_date>start_date THEN anchor_date+1 ELSE start_date END) comparison_start,
 CASE WHEN anchor_date>start_date THEN coalesce((SELECT max(c.due_date) FROM charge_dates c
  WHERE c.loan_id=b.loan_id AND c.due_date<=anchor_date),start_date) ELSE start_date END accrual_baseline
 FROM base b
), expected_dates AS (
 SELECT loan_id,start_date due_date,daily_interest amount FROM dates
 WHERE setup_status='Supported' AND anchor_date=start_date AND start_date>=comparison_start AND start_date<reporting_date
 UNION ALL
 SELECT b.loan_id,b.anchor_date+n*b.payment_interval,
 b.daily_interest*CASE WHEN n=1 THEN b.anchor_date+b.payment_interval-b.accrual_baseline ELSE b.payment_interval END
 FROM dates b CROSS JOIN LATERAL generate_series(
  greatest(1,ceil((b.comparison_start-b.anchor_date)::numeric/nullif(b.payment_interval,0))::integer),
  floor((b.reporting_date-1-b.anchor_date)::numeric/nullif(b.payment_interval,0))::integer) n
 WHERE b.setup_status='Supported'
), expected AS (
 SELECT loan_id,sum(amount) expected_interest_30d,count(*)::integer expected_due_dates_30d FROM expected_dates GROUP BY 1
), actual AS (
 SELECT b.loan_id,
 coalesce(sum(c.interest-CASE WHEN c.due_date=b.start_date THEN b.transfer_fee ELSE 0 END)
  FILTER(WHERE c.due_date>=b.comparison_start AND c.due_date<b.reporting_date),0) recorded_interest_30d,
 coalesce(sum(c.principal) FILTER(WHERE c.due_date>=b.comparison_start AND c.due_date<b.reporting_date),0) recorded_principal_30d,
 count(*) FILTER(WHERE c.due_date>=b.comparison_start AND c.due_date<b.reporting_date
  AND c.interest-CASE WHEN c.due_date=b.start_date THEN b.transfer_fee ELSE 0 END>0)::integer recorded_interest_dates_30d,
 max(c.due_date) FILTER(WHERE c.due_date<b.reporting_date) last_recorded_due_date,
 min(c.due_date) FILTER(WHERE c.due_date>=b.reporting_date AND c.due_date<b.reporting_date+90) next_plan_due_date,
 bool_or(c.invalid OR (c.due_date=b.start_date AND c.interest<b.transfer_fee)) source_invalid
 FROM dates b LEFT JOIN charge_dates c USING(loan_id) GROUP BY b.loan_id
), metrics AS (
 SELECT b.*,greatest(0,reporting_date-comparison_start) observation_days,
 CASE WHEN setup_status='Supported' AND NOT coalesce(a.source_invalid,false) THEN coalesce(e.expected_interest_30d,0) END expected_interest_30d,
 CASE WHEN setup_status='Supported' AND NOT coalesce(a.source_invalid,false) THEN a.recorded_interest_30d END recorded_interest_30d,
 a.recorded_principal_30d,coalesce(e.expected_due_dates_30d,0) expected_due_dates_30d,
 a.recorded_interest_dates_30d,a.last_recorded_due_date,a.next_plan_due_date,
 f.interest next_plan_interest,f.principal next_plan_principal,
 CASE WHEN coalesce(a.source_invalid,false) THEN 'Source review' ELSE setup_status END comparison_status
 FROM dates b LEFT JOIN expected e USING(loan_id) JOIN actual a USING(loan_id)
 LEFT JOIN charge_dates f ON f.loan_id=b.loan_id AND f.due_date=a.next_plan_due_date
), ratios AS (
 SELECT *,recorded_interest_30d/nullif(expected_interest_30d,0) interest_coverage_30d,
 recorded_interest_dates_30d::numeric/nullif(expected_due_dates_30d,0) interest_date_coverage_30d,
 comparison_status='Supported' AND observation_days>=7 AND expected_due_dates_30d>=2 assessment_eligible
 FROM metrics
)
SELECT *,coalesce(assessment_eligible AND (interest_coverage_30d<0.8 OR interest_date_coverage_30d<0.8),false) schedule_departure,
 coalesce(assessment_eligible AND (interest_coverage_30d<0.8 OR interest_date_coverage_30d<0.8)
  AND NOT auto_charge_enabled,false) modified_schedule,
 CASE WHEN assessment_eligible AND (interest_coverage_30d<0.8 OR interest_date_coverage_30d<0.8) AND NOT auto_charge_enabled
   THEN 'Modified payment schedule'
  WHEN comparison_status<>'Supported' THEN comparison_status
  WHEN NOT assessment_eligible THEN 'Insufficient observation' ELSE 'No schedule restriction' END arrangement_status,
 CASE WHEN NOT auto_charge_enabled AND assessment_eligible AND interest_coverage_30d<0.8 AND interest_date_coverage_30d<0.8 THEN 'Reduced/deferred interest and fewer charge dates'
  WHEN NOT auto_charge_enabled AND assessment_eligible AND interest_coverage_30d<0.8 THEN 'Reduced/deferred interest'
  WHEN NOT auto_charge_enabled AND assessment_eligible AND interest_date_coverage_30d<0.8 THEN 'Fewer charge dates / deferred payment frequency'
  WHEN comparison_status<>'Supported' THEN comparison_status
  WHEN NOT assessment_eligible THEN 'At least seven observed days and two expected dates required'
  ELSE 'Automatic schedule rule does not restrict category' END schedule_reason,
 'schedule-health-v1'::text schedule_method_version
FROM ratios;

CREATE VIEW public.reporting_borrower_schedule_health_v1 AS
WITH a AS (
 SELECT borrower_id,count(*)::integer active_loan_count,
 count(*) FILTER(WHERE modified_schedule)::integer modified_schedule_loan_count,
 count(*) FILTER(WHERE comparison_status<>'Supported')::integer unsupported_or_invalid_loan_count,
 count(*) FILTER(WHERE assessment_eligible)::integer assessed_loan_count,
 sum(expected_interest_30d) expected_interest_30d,sum(recorded_interest_30d) recorded_interest_30d,
 sum(recorded_principal_30d) recorded_principal_30d,
 sum(expected_due_dates_30d) expected_due_dates_30d,sum(recorded_interest_dates_30d) recorded_interest_dates_30d
 FROM public.reporting_loan_schedule_health_v1 GROUP BY 1
)
SELECT b."Row ID" borrower_id,coalesce(a.active_loan_count,0) active_loan_count,
 coalesce(a.modified_schedule_loan_count,0) modified_schedule_loan_count,
 coalesce(a.unsupported_or_invalid_loan_count,0) unsupported_or_invalid_loan_count,
 coalesce(a.assessed_loan_count,0) assessed_loan_count,
 a.expected_interest_30d,a.recorded_interest_30d,a.recorded_principal_30d,
 a.recorded_interest_30d/nullif(a.expected_interest_30d,0) interest_coverage_30d,
 a.recorded_interest_dates_30d::numeric/nullif(a.expected_due_dates_30d,0) interest_date_coverage_30d,
 coalesce(a.modified_schedule_loan_count>0,false) arrangement_gate,
 CASE WHEN a.modified_schedule_loan_count>0 THEN 'Modified payment schedule'
  WHEN coalesce(a.active_loan_count,0)=0 THEN 'No active loans'
  WHEN a.unsupported_or_invalid_loan_count>0 THEN 'Not assessed: source/product'
  WHEN a.assessed_loan_count=0 THEN 'Insufficient observation' ELSE 'No schedule restriction' END arrangement_status,
 public.olap_reporting_date() reporting_date,statement_timestamp() calculated_at,'schedule-health-v1'::text method_version
FROM public."Borrowers" b LEFT JOIN a ON a.borrower_id=b."Row ID";

CREATE VIEW public.reporting_borrower_matrix_v3 AS
SELECT m.borrower_id,m.contribution_30d,m.active_borrower_count,m.portfolio_contribution_30d,
 m.contribution_share,m.equal_share,m.relative_contribution,m.reliability_score,m.confidence,
 CASE WHEN s.arrangement_gate AND m.quadrant IN ('Star','Cash Cow')
  THEN CASE WHEN m.relative_contribution>=1 THEN 'Question Mark' ELSE 'Dog' END ELSE m.quadrant END quadrant,
 CASE WHEN s.arrangement_gate THEN 'Automatic modified-schedule rule: auto-charge off and interest amount or charge-date coverage below 80%; payment score unchanged'
  ELSE m.classification_reason END classification_reason,
 m.outstanding_principal,m.reporting_date,m.calculated_at,'borrower-matrix-v3'::text method_version,
 m.quadrant payment_only_quadrant,s.arrangement_status,s.arrangement_gate,s.modified_schedule_loan_count,
 s.interest_coverage_30d,s.interest_date_coverage_30d,
 s.arrangement_gate AND m.quadrant IN ('Star','Cash Cow') category_adjusted
FROM public.reporting_borrower_matrix_v2 m JOIN public.reporting_borrower_schedule_health_v1 s USING(borrower_id);

COMMENT ON VIEW public.reporting_loan_schedule_health_v1 IS 'R028 automatic: current-terms counterfactual, 30 completed days, anchor-aware; >=7 days and >=2 due dates; auto-off plus <80% interest amount OR charge-date coverage restricts category. No manual labels. Amounts are not extra debt.';
COMMENT ON VIEW public.reporting_borrower_schedule_health_v1 IS 'R028: any active loan meeting the automatic modified-schedule rule gates upper categories; recalculated on query with no manual intervention.';
COMMENT ON VIEW public.reporting_borrower_matrix_v3 IS 'R028: automatic schedule gate preserves V41 payment score and contribution. V2 retained for rollback/comparison; no borrower names or override records.';
