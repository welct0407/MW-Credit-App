-- R027 additive payment-health foundation. Existing operational/cache and analytics
-- contracts are unchanged. Effective-date history is restated, not knowledge-time.
CREATE VIEW public.reporting_charge_payment_health_v1 AS
WITH ctx AS (SELECT public.olap_reporting_date() d, statement_timestamp() t),
daily AS (
 SELECT r."Ref Charges" id,r."Payment Date" effective_day,
  sum(r."Principal Paid"::numeric) p,sum(r."Interest Paid"::numeric) i
 FROM public."Repayments" r CROSS JOIN ctx WHERE r."Payment Date"<d GROUP BY 1,2
), running AS (
 SELECT *,sum(p) OVER(PARTITION BY id ORDER BY effective_day) cp,
  sum(i) OVER(PARTITION BY id ORDER BY effective_day) ci FROM daily
), covered AS (
 SELECT r.*,cp>=c."Principal Due"::numeric-0.005 AND ci>=c."Interest Due"::numeric-0.005 full_paid
 FROM running r JOIN public."Charges" c ON c."Row ID"=r.id
), last_gap AS (
 SELECT id,max(effective_day) FILTER(WHERE NOT full_paid) last_uncovered FROM covered GROUP BY id
), timing AS (
 SELECT c.id,min(c.effective_day) FILTER(WHERE c.full_paid AND (g.last_uncovered IS NULL OR c.effective_day>g.last_uncovered)) settled
 FROM covered c JOIN last_gap g USING(id) GROUP BY c.id
), payments AS (
 SELECT r."Ref Charges" id,
  coalesce(sum(r."Principal Paid"::numeric) FILTER(WHERE r."Payment Date"<=d),0) p,
  coalesce(sum(r."Interest Paid"::numeric) FILTER(WHERE r."Payment Date"<=d),0) i,
  coalesce(sum(r."Principal Paid"::numeric) FILTER(WHERE r."Payment Date"<=c."Charge Date" AND r."Payment Date"<d),0) on_p,
  coalesce(sum(r."Interest Paid"::numeric) FILTER(WHERE r."Payment Date"<=c."Charge Date" AND r."Payment Date"<d),0) on_i,
  bool_or(r."Payment Date" IS NULL OR r."Principal Paid" IS NULL OR r."Interest Paid" IS NULL
   OR r."Ref Loans" IS DISTINCT FROM c."Ref Loans") invalid
 FROM public."Repayments" r JOIN public."Charges" c ON c."Row ID"=r."Ref Charges" CROSS JOIN ctx GROUP BY 1
), base AS (
 SELECT c."Row ID" charge_id,c."Ref Loans" loan_id,l."Ref Borrowers" borrower_id,
  c."Charge Date" due_date,c."Principal Due"::numeric principal_due,c."Interest Due"::numeric interest_due,
  coalesce(p.p,0) principal_paid_current,coalesce(p.i,0) interest_paid_current,
  greatest(c."Principal Due"::numeric-coalesce(p.p,0),0) principal_remaining_current,
  greatest(c."Interest Due"::numeric-coalesce(p.i,0),0) interest_remaining_current,
  c."Charge Date"<d AND c."Principal Due"::numeric>=0 AND c."Interest Due"::numeric>=0
   AND c."Principal Due"::numeric+c."Interest Due"::numeric>0 eligible,
  coalesce(p.on_p,0)>=c."Principal Due"::numeric-0.005 AND coalesce(p.on_i,0)>=c."Interest Due"::numeric-0.005 on_time_covered,
  tm.settled, greatest(coalesce(tm.settled,d)-c."Charge Date",0) late,
  CASE WHEN c."Charge Date" IS NULL OR c."Principal Due" IS NULL OR c."Interest Due" IS NULL
     OR l."Row ID" IS NULL OR b."Row ID" IS NULL OR coalesce(p.invalid,false)
     OR ((c."Principal Due"::numeric<0 OR c."Interest Due"::numeric<0) AND NOT coalesce(l."Defaulted",false))
   THEN 'Invalid source' ELSE 'OK' END data_quality_status,
  coalesce(l."Defaulted",false) defaulted,d reporting_date,t calculated_at
 FROM public."Charges" c LEFT JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
 LEFT JOIN public."Borrowers" b ON b."Row ID"=l."Ref Borrowers"
 LEFT JOIN payments p ON p.id=c."Row ID" LEFT JOIN timing tm ON tm.id=c."Row ID" CROSS JOIN ctx
), facts AS (
 SELECT *,coalesce(eligible,false) AND data_quality_status='OK' history_eligible,
  principal_remaining_current+interest_remaining_current remaining_current,
  CASE WHEN data_quality_status<>'OK' THEN 'Invalid source'
   WHEN principal_due<0 OR interest_due<0 THEN 'Default accounting'
   WHEN principal_due+interest_due=0 THEN 'Zero obligation'
   WHEN due_date>=reporting_date THEN 'Not matured' END exclusion_reason
 FROM base
), overdue AS (
 SELECT *,history_eligible AND remaining_current>0.005 is_overdue FROM facts
)
SELECT charge_id,loan_id,borrower_id,due_date,principal_due,interest_due,
 history_eligible,exclusion_reason,data_quality_status,
 principal_paid_current,interest_paid_current,
 CASE WHEN data_quality_status='OK' THEN principal_remaining_current END principal_remaining_current,
 CASE WHEN data_quality_status='OK' THEN interest_remaining_current END interest_remaining_current,
 CASE WHEN data_quality_status='OK' THEN remaining_current END remaining_current,
 is_overdue,CASE WHEN data_quality_status<>'OK' THEN NULL WHEN is_overdue THEN remaining_current ELSE 0 END overdue_amount,
 CASE WHEN is_overdue THEN reporting_date-due_date END current_days_overdue,
 CASE WHEN history_eligible THEN on_time_covered END on_time,
 CASE WHEN history_eligible THEN settled END final_settlement_date,
 CASE WHEN history_eligible THEN late END historical_delay_days,
 CASE WHEN history_eligible THEN CASE WHEN late=0 THEN 100 WHEN late=1 THEN 90
  WHEN late<=3 THEN 70 WHEN late<=7 THEN 40 ELSE 10 END END delay_grade,
 reporting_date,calculated_at,'payment-health-v1'::text method_version
FROM overdue;

CREATE VIEW public.reporting_borrower_payment_health_v1 AS
WITH ctx AS (SELECT public.olap_reporting_date() d,statement_timestamp() t),
unattributed AS (
 SELECT EXISTS(SELECT 1 FROM public."Repayments" r LEFT JOIN public."Charges" c ON c."Row ID"=r."Ref Charges" WHERE c."Row ID" IS NULL)
  OR EXISTS(SELECT 1 FROM public.reporting_charge_payment_health_v1 WHERE borrower_id IS NULL) bad
), charges AS (
 SELECT borrower_id,
  sum(principal_remaining_current) FILTER(WHERE is_overdue) overdue_principal,
  sum(interest_remaining_current) FILTER(WHERE is_overdue) overdue_interest,
  sum(overdue_amount) overdue_amount,count(*) FILTER(WHERE is_overdue)::integer overdue_charge_count,
  min(due_date) FILTER(WHERE is_overdue) oldest_overdue_date,max(current_days_overdue) oldest_unpaid_days,
  count(*) FILTER(WHERE history_eligible AND due_date>=reporting_date-30)::integer recent_obligation_count,
  count(*) FILTER(WHERE history_eligible AND due_date>=reporting_date-30 AND on_time)::integer recent_on_time_count,
  count(*) FILTER(WHERE history_eligible AND due_date>=reporting_date-180 AND due_date<reporting_date-30)::integer older_obligation_count,
  count(*) FILTER(WHERE history_eligible AND due_date>=reporting_date-180 AND due_date<reporting_date-30 AND on_time)::integer older_on_time_count,
  count(*) FILTER(WHERE history_eligible AND due_date>=reporting_date-90)::integer severity_obligation_count,
  avg(delay_grade) FILTER(WHERE history_eligible AND due_date>=reporting_date-90) mean_delay_score,
  min(due_date) FILTER(WHERE history_eligible) first_matured_due_date,
  count(DISTINCT due_date) FILTER(WHERE history_eligible)::integer distinct_matured_due_dates,
  bool_or(data_quality_status<>'OK') invalid
 FROM public.reporting_charge_payment_health_v1 GROUP BY borrower_id
), defaults AS (
 SELECT l."Ref Borrowers" borrower_id,
  count(*) FILTER(WHERE l."Defaulted")::integer default_count,
  coalesce(sum(l."Default Loss Amount"::numeric) FILTER(WHERE l."Defaulted"),0) recorded_default_loss,
  bool_or(coalesce(l."Defaulted",false) AND l."Loan Date"<=d AND (l."Close Date" IS NULL OR l."Close Date">d)) active_default,
  bool_or(coalesce(l."Defaulted",false) AND l."Close Date" BETWEEN d-90 AND d) recent_default,
  bool_or(l."Loan Date" IS NULL OR (l."Close Date" IS NOT NULL AND l."Close Date"<l."Loan Date")) invalid
 FROM public."Loans" l CROSS JOIN ctx GROUP BY l."Ref Borrowers"
), base AS (
 SELECT b."Row ID" borrower_id,coalesce(b."Has Active Loan",false) has_active_loan,
  coalesce(b."Hidden Flag",false) hidden_flag,
  CASE WHEN coalesce(c.invalid,false) OR u.bad THEN NULL ELSE coalesce(c.overdue_principal,0) END overdue_principal,
  CASE WHEN coalesce(c.invalid,false) OR u.bad THEN NULL ELSE coalesce(c.overdue_interest,0) END overdue_interest,
  CASE WHEN coalesce(c.invalid,false) OR u.bad THEN NULL ELSE coalesce(c.overdue_amount,0) END overdue_amount,
  CASE WHEN coalesce(c.invalid,false) OR u.bad THEN NULL ELSE coalesce(c.overdue_charge_count,0) END overdue_charge_count,
  c.oldest_overdue_date,c.oldest_unpaid_days,
  coalesce(c.recent_obligation_count,0) recent_obligation_count,coalesce(c.recent_on_time_count,0) recent_on_time_count,
  coalesce(c.older_obligation_count,0) older_obligation_count,coalesce(c.older_on_time_count,0) older_on_time_count,
  coalesce(c.severity_obligation_count,0) severity_obligation_count,c.first_matured_due_date,
  coalesce(c.distinct_matured_due_dates,0) distinct_matured_due_dates,d-c.first_matured_due_date history_span_days,
  c.recent_on_time_count::numeric/nullif(c.recent_obligation_count,0) recent_on_time_rate,
  c.older_on_time_count::numeric/nullif(c.older_obligation_count,0) older_on_time_rate,
  CASE WHEN coalesce(l.recent_default,false) THEN 0 ELSE c.mean_delay_score END delay_score,
  CASE WHEN coalesce(l.active_default,false) THEN 0 WHEN c.oldest_unpaid_days IS NULL THEN 100
   WHEN c.oldest_unpaid_days=1 THEN 60 WHEN c.oldest_unpaid_days<=3 THEN 40 ELSE 20 END::numeric current_score,
  coalesce(l.default_count,0) default_count,coalesce(l.recorded_default_loss,0) recorded_default_loss,
  coalesce(l.active_default,false) active_default,coalesce(l.recent_default,false) recent_default,
  CASE WHEN u.bad OR coalesce(c.invalid,false) OR coalesce(l.invalid,false) THEN 'Invalid source'
   WHEN coalesce(l.default_count,0)>0 THEN 'Default history requires review' ELSE 'OK' END data_quality_status,
  d reporting_date,t calculated_at
 FROM public."Borrowers" b CROSS JOIN ctx CROSS JOIN unattributed u
 LEFT JOIN charges c ON c.borrower_id=b."Row ID" LEFT JOIN defaults l ON l.borrower_id=b."Row ID"
), components AS (
 SELECT *,recent_obligation_count-recent_on_time_count recent_late_count,
  100*recent_on_time_rate recent_score,100*older_on_time_rate older_score,
  (CASE WHEN recent_on_time_rate IS NULL THEN 0 ELSE 0.45 END
   +CASE WHEN older_on_time_rate IS NULL THEN 0 ELSE 0.15 END
   +CASE WHEN delay_score IS NULL THEN 0 ELSE 0.15 END+0.25) weight_total,
  coalesce(oldest_unpaid_days>7,false) OR active_default OR recent_default severe_risk_guard,
  CASE WHEN data_quality_status<>'OK' THEN 'Data review'
   WHEN recent_obligation_count=0 THEN 'Unclassified' ELSE 'Rated' END rating_status
 FROM base
), raw AS (
 SELECT *,CASE WHEN rating_status='Rated' THEN
  (coalesce(recent_score*0.45,0)+coalesce(older_score*0.15,0)+coalesce(delay_score*0.15,0)+current_score*0.25)/weight_total END raw_score
 FROM components
), scored AS (
 SELECT *,CASE WHEN severe_risk_guard THEN least(raw_score,60) ELSE raw_score END candidate_score,
  CASE WHEN rating_status='Data review' THEN 'Data review' WHEN rating_status='Unclassified' THEN 'Insufficient history'
   WHEN distinct_matured_due_dates>=3 AND history_span_days>=30 THEN 'Established' ELSE 'Provisional' END confidence,
  CASE WHEN overdue_amount IS NULL THEN 'Data review' WHEN active_default OR recent_default THEN 'Default flagged'
   WHEN overdue_charge_count>0 THEN 'Overdue' ELSE 'No current overdue' END current_health_status,
  CASE WHEN data_quality_status<>'OK' THEN 'DATA_REVIEW' WHEN active_default THEN 'ACTIVE_DEFAULT'
   WHEN recent_default THEN 'RECENT_DEFAULT' WHEN oldest_unpaid_days>7 THEN 'SEVERE_ARREARS'
   WHEN overdue_charge_count>0 THEN 'CURRENT_ARREARS' WHEN recent_obligation_count=0 THEN 'NO_RECENT_HISTORY'
   WHEN recent_late_count>0 THEN 'RECENT_LATE_PAYMENTS'
   WHEN distinct_matured_due_dates<3 OR history_span_days<30 THEN 'PROVISIONAL_HISTORY' ELSE 'NO_CURRENT_ARREARS' END primary_reason_code
 FROM raw
)
SELECT borrower_id,has_active_loan,hidden_flag,overdue_principal,overdue_interest,overdue_amount,overdue_charge_count,
 oldest_overdue_date,oldest_unpaid_days,recent_obligation_count,recent_on_time_count,recent_late_count,recent_on_time_rate,
 older_obligation_count,older_on_time_count,older_on_time_rate,severity_obligation_count,
 first_matured_due_date,distinct_matured_due_dates,history_span_days,recent_score,older_score,delay_score,current_score,
 CASE WHEN recent_score IS NULL THEN 0 ELSE 0.45/weight_total END recent_effective_weight,
 CASE WHEN older_score IS NULL THEN 0 ELSE 0.15/weight_total END older_effective_weight,
 CASE WHEN delay_score IS NULL THEN 0 ELSE 0.15/weight_total END delay_effective_weight,0.25/weight_total current_effective_weight,
 raw_score,CASE WHEN rating_status='Rated' THEN candidate_score END reliability_score,
 CASE WHEN rating_status='Rated' THEN CASE WHEN candidate_score>=80 THEN 'High' ELSE 'Lower' END END reliability_band,
 rating_status,confidence,severe_risk_guard,coalesce(severe_risk_guard AND raw_score>60,false) score_cap_applied,
 active_default,recent_default,default_count,recorded_default_loss,current_health_status,primary_reason_code,
 CASE primary_reason_code WHEN 'DATA_REVIEW' THEN data_quality_status
  WHEN 'ACTIVE_DEFAULT' THEN 'Active default recorded' WHEN 'RECENT_DEFAULT' THEN 'Default recorded within 90 days'
  WHEN 'SEVERE_ARREARS' THEN 'Oldest unpaid obligation is '||oldest_unpaid_days||' days overdue; severe-risk guard applies'
  WHEN 'CURRENT_ARREARS' THEN 'Oldest unpaid obligation is '||oldest_unpaid_days||' days overdue'
  WHEN 'NO_RECENT_HISTORY' THEN 'No eligible obligations in the last 30 completed days'
  WHEN 'RECENT_LATE_PAYMENTS' THEN recent_late_count||' of '||recent_obligation_count||' recent obligations were not paid on time'
  WHEN 'PROVISIONAL_HISTORY' THEN 'Limited payment history; rating is provisional'
  ELSE 'No current overdue; observed recent obligations paid on time' END reason_text,
 data_quality_status,reporting_date,calculated_at,'payment-health-v1'::text method_version
FROM scored;

CREATE VIEW public.reporting_borrower_matrix_v2 AS
WITH income AS (
 SELECT l."Ref Borrowers" borrower_id,sum(r."Interest Paid"::numeric) contribution
 FROM public."Repayments" r JOIN public."Loans" l ON l."Row ID"=r."Ref Loans"
 WHERE r."Payment Date">=public.olap_reporting_date()-30 AND r."Payment Date"<public.olap_reporting_date() GROUP BY 1
), cohort AS (
 SELECT h.*,coalesce(i.contribution,0) contribution_30d,b."Total Outstanding Principal"::numeric outstanding_principal
 FROM public.reporting_borrower_payment_health_v1 h JOIN public."Borrowers" b ON b."Row ID"=h.borrower_id
 LEFT JOIN income i USING(borrower_id) WHERE h.has_active_loan
), totals AS (
 SELECT *,count(*) OVER()::integer active_borrower_count,sum(contribution_30d) OVER() portfolio_contribution_30d FROM cohort
), axes AS (
 SELECT *,1.0/active_borrower_count equal_share,
  CASE WHEN portfolio_contribution_30d>0 THEN contribution_30d/portfolio_contribution_30d END contribution_share,
  CASE WHEN portfolio_contribution_30d>0 THEN contribution_30d/portfolio_contribution_30d*active_borrower_count END relative_contribution
 FROM totals
)
SELECT borrower_id,contribution_30d,active_borrower_count,portfolio_contribution_30d,contribution_share,equal_share,
 relative_contribution,reliability_score,confidence,
 CASE WHEN portfolio_contribution_30d<=0 OR rating_status<>'Rated' THEN 'Unclassified'
  WHEN relative_contribution>=1 AND reliability_score>=80 THEN 'Star'
  WHEN reliability_score>=80 THEN 'Cash Cow' WHEN relative_contribution>=1 THEN 'Question Mark' ELSE 'Dog' END quadrant,
 CASE WHEN portfolio_contribution_30d<=0 THEN 'Portfolio contribution is not positive'
  WHEN rating_status<>'Rated' THEN reason_text ELSE 'Contribution boundary 1x; reliability boundary 80' END classification_reason,
 outstanding_principal,reporting_date,calculated_at,method_version
FROM axes;

-- AppSheet adapters: stable original keys; physical source tables remain editable.
CREATE VIEW public.oltp_borrower_payment_health_v1 AS
SELECT borrower_id AS "Row ID",borrower_id AS "Ref Borrower",has_active_loan AS "Has Active Loan",hidden_flag AS "Hidden Flag",
 overdue_principal AS "Overdue Principal",overdue_interest AS "Overdue Interest",overdue_amount AS "Overdue Amount",
 overdue_charge_count AS "Overdue Charge Count",oldest_overdue_date AS "Oldest Overdue Date",oldest_unpaid_days AS "Oldest Unpaid Days",
 recent_obligation_count AS "Recent Obligation Count",recent_on_time_count AS "Recent On Time Count",recent_late_count AS "Recent Late Count",
 recent_on_time_rate AS "Recent On Time Rate",older_obligation_count AS "Older Obligation Count",older_on_time_count AS "Older On Time Count",
 older_on_time_rate AS "Older On Time Rate",severity_obligation_count AS "Severity Obligation Count",
 first_matured_due_date AS "First Matured Due Date",distinct_matured_due_dates AS "Distinct Matured Due Dates",history_span_days AS "History Span Days",
 recent_score AS "Recent Score",older_score AS "Older Score",delay_score AS "Delay Score",current_score AS "Current Score",
 recent_effective_weight AS "Recent Effective Weight",older_effective_weight AS "Older Effective Weight",
 delay_effective_weight AS "Delay Effective Weight",current_effective_weight AS "Current Effective Weight",
 raw_score AS "Raw Score",reliability_score AS "Reliability Score",reliability_band AS "Reliability Band",rating_status AS "Rating Status",
 confidence AS "Confidence",severe_risk_guard AS "Severe Risk Guard",score_cap_applied AS "Score Cap Applied",
 active_default AS "Active Default",recent_default AS "Recent Default",default_count AS "Default Count",recorded_default_loss AS "Recorded Default Loss",
 current_health_status AS "Current Health Status",primary_reason_code AS "Primary Reason Code",reason_text AS "Reason",
 data_quality_status AS "Data Quality Status",reporting_date AS "Reporting Date",calculated_at AS "Calculated At",method_version AS "Method Version"
FROM public.reporting_borrower_payment_health_v1;

CREATE VIEW public.oltp_charge_payment_health_v1 AS
SELECT charge_id AS "Row ID",charge_id AS "Ref Charge",loan_id AS "Ref Loans",borrower_id AS "Ref Borrower",
 due_date AS "Due Date",principal_remaining_current AS "Unpaid Principal",interest_remaining_current AS "Unpaid Interest",
 overdue_amount AS "Overdue Amount",current_days_overdue AS "Days Overdue",is_overdue AS "Is Overdue",
 data_quality_status AS "Data Quality Status",reporting_date AS "Reporting Date",calculated_at AS "Calculated At",method_version AS "Method Version"
FROM public.reporting_charge_payment_health_v1;

COMMENT ON VIEW public.reporting_borrower_payment_health_v1 IS 'R027: payment-health-v1; 45/15/15/25; due-today excluded; unresolved default history suppresses rating; no financial writes.';
COMMENT ON VIEW public.reporting_charge_payment_health_v1 IS 'R027: signed component balances; restated effective-date history; no closed-status override.';
COMMENT ON VIEW public.reporting_borrower_matrix_v2 IS 'R027: corrected independent value/reliability axes; retains legacy matrix provider unchanged.';
-- No public grants. DEV AppSheet uses the existing owner connection; reporting
-- grants, if required at promotion, must target the verified existing report role.
