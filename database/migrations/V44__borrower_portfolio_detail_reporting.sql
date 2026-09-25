-- R035: additive read-only borrower pages. No operational tables or existing views change.
CREATE VIEW public.reporting_borrower_loan_facts_v1 AS
WITH ranked AS (
 SELECT l.*,row_number() OVER(PARTITION BY "Ref Borrowers" ORDER BY "Loan Date" NULLS LAST,"Row ID") loan_sequence,
 bool_or("Loan Date" IS NULL) OVER(PARTITION BY "Ref Borrowers") incomplete_dates
 FROM public.olap_loans_analytics l
)
SELECT "Row ID" loan_id,"Ref Borrowers" borrower_id,"Loan Date" loan_date,"Close Date" close_date,"Due Date" due_date,
 "Principal Amount"::numeric original_principal,"Outstanding Principal"::numeric outstanding_principal,
 "Total Principal Received"::numeric principal_received,"Total Interest Received"::numeric interest_received,
 "Loan Status"='ยังไม่ปิดยอด' is_active,
 CASE "Loan Status" WHEN 'ยังไม่ปิดยอด' THEN 'Active' WHEN 'ปิดยอดแล้ว' THEN 'Closed' ELSE "Loan Status" END loan_status,
 CASE "Loan Type" WHEN 'กำหนดวันชำระ' THEN 'Fixed Due Date' WHEN 'ดอกเบี้ยรายวัน' THEN 'Daily Interest'
 WHEN 'ผ่อนชำระรายวัน' THEN 'Daily Installment' ELSE 'Unknown' END loan_type,
 "Current Daily Interest"::numeric daily_interest,"Defaulted Flag" defaulted,"Default Loss Amount"::numeric default_loss,
 CASE WHEN incomplete_dates THEN 'Unavailable' WHEN loan_sequence=1 THEN 'First loan' ELSE 'Repeat loan' END borrowing_type
FROM ranked;

CREATE VIEW public.reporting_borrower_directory_v1 AS
WITH loans AS (
 SELECT borrower_id,count(*) loan_count,count(*) FILTER(WHERE is_active) active_loans,min(loan_date) first_loan_date,
 CASE WHEN bool_and(outstanding_principal IS NOT NULL) THEN sum(outstanding_principal) END principal,
 count(*) FILTER(WHERE loan_date IS NULL OR original_principal IS NULL OR outstanding_principal IS NULL OR is_active IS NULL) invalid_loans
 FROM public.reporting_borrower_loan_facts_v1 GROUP BY borrower_id
), payments AS (
 SELECT l."Ref Borrowers" borrower_id,max(r."Payment Date") FILTER(WHERE r."Payment Date"<=public.olap_reporting_date()) last_payment_date,
 CASE WHEN bool_and(r."Interest Paid" IS NOT NULL) THEN sum(r."Interest Paid"::numeric) FILTER(WHERE r."Payment Date"<=public.olap_reporting_date()) END lifetime_interest,
 count(*) FILTER(WHERE r."Payment Date" IS NULL OR r."Principal Paid" IS NULL OR r."Interest Paid" IS NULL) invalid_payments
 FROM public.olap_repayments_analytics r LEFT JOIN public.olap_loans_analytics l ON l."Row ID"=r."Ref Loans" GROUP BY l."Ref Borrowers"
), names AS (
 SELECT b."Row ID" borrower_id,coalesce(nullif(b."Description",''),'Unnamed borrower') borrower_name,
 b."Hidden Flag" hidden_flag,count(*) OVER(PARTITION BY coalesce(nullif(b."Description",''),'Unnamed borrower')) name_count
 FROM public.olap_borrowers_analytics b
)
SELECT b.borrower_id,b.borrower_name,
 b.borrower_name||CASE WHEN b.name_count>1 THEN ' · '||b.borrower_id ELSE '' END borrower_label,b.hidden_flag,
 coalesce(l.loan_count,0) loan_count,coalesce(l.active_loans,0) active_loans,coalesce(l.active_loans,0)>0 has_active_loan,
 l.first_loan_date,CASE WHEN l.borrower_id IS NULL THEN 0::numeric ELSE l.principal END outstanding_principal,
 p.last_payment_date,CASE WHEN p.borrower_id IS NULL THEN 0::numeric WHEN p.invalid_payments>0 THEN NULL ELSE coalesce(p.lifetime_interest,0) END lifetime_interest,
 coalesce(l.invalid_loans,0)+coalesce(p.invalid_payments,0) invalid_fact_count,
 public.olap_reporting_date() reporting_date,statement_timestamp() calculated_at
FROM names b LEFT JOIN loans l USING(borrower_id) LEFT JOIN payments p USING(borrower_id);

CREATE VIEW public.reporting_borrower_activity_daily_v1 AS
WITH events AS (
 SELECT borrower_id,loan_date activity_date,original_principal principal_issued,0::numeric principal_returned,0::numeric interest_received,
 1::bigint loans_issued,(borrowing_type='First loan')::int::bigint first_loans,(borrowing_type='Repeat loan')::int::bigint repeat_loans,
 (borrowing_type='Unavailable')::int::bigint unclassified_loans,
 (loan_date IS NULL OR original_principal IS NULL OR borrower_id IS NULL)::int::bigint invalid_events
 FROM public.reporting_borrower_loan_facts_v1
 UNION ALL
 SELECT l."Ref Borrowers",r."Payment Date",0::numeric,r."Principal Paid"::numeric,r."Interest Paid"::numeric,
 0::bigint,0::bigint,0::bigint,0::bigint,
 (r."Payment Date" IS NULL OR r."Principal Paid" IS NULL OR r."Interest Paid" IS NULL OR l."Ref Borrowers" IS NULL)::int::bigint
 FROM public.olap_repayments_analytics r LEFT JOIN public.olap_loans_analytics l ON l."Row ID"=r."Ref Loans"
)
SELECT borrower_id,activity_date,
 CASE WHEN bool_and(principal_issued IS NOT NULL) THEN sum(principal_issued) END principal_issued,
 CASE WHEN bool_and(principal_returned IS NOT NULL) THEN sum(principal_returned) END principal_returned,
 CASE WHEN bool_and(interest_received IS NOT NULL) THEN sum(interest_received) END interest_received,
 sum(loans_issued)::bigint loans_issued,sum(first_loans)::bigint first_loans,sum(repeat_loans)::bigint repeat_loans,
 sum(unclassified_loans)::bigint unclassified_loans,sum(invalid_events)::bigint invalid_events
FROM events GROUP BY borrower_id,activity_date;

CREATE FUNCTION public.reporting_borrower_period_v1(p_start date,p_end date,p_population text DEFAULT 'All with loan history')
RETURNS TABLE(borrower_id text,borrower_label text,hidden_flag boolean,has_active_loan boolean,active_loans bigint,loan_count bigint,
 first_loan_date date,last_payment_date date,outstanding_principal numeric,lifetime_interest numeric,
 principal_issued numeric,principal_returned numeric,interest_received numeric,loans_issued bigint,
 first_loans bigint,repeat_loans bigint,unclassified_loans bigint,principal_share numeric,interest_share numeric,
 principal_rank bigint,interest_rank bigint,invalid_fact_count bigint,reporting_date date,calculated_at timestamptz)
LANGUAGE sql STABLE AS $$
 WITH cohort AS (
 SELECT d.* FROM public.reporting_borrower_directory_v1 d WHERE d.loan_count>0
 AND (p_population='All with loan history' OR p_population='Currently active' AND d.has_active_loan
 OR p_population='Currently inactive' AND NOT d.has_active_loan)
 AND p_start IS NOT NULL AND p_end>=p_start AND p_end<=public.olap_reporting_date()
 ), activity AS (
 SELECT a.borrower_id,
 CASE WHEN bool_and(a.principal_issued IS NOT NULL) THEN sum(a.principal_issued) END principal_issued,
 CASE WHEN bool_and(a.principal_returned IS NOT NULL) THEN sum(a.principal_returned) END principal_returned,
 CASE WHEN bool_and(a.interest_received IS NOT NULL) THEN sum(a.interest_received) END interest_received,
 sum(a.loans_issued)::bigint loans_issued,sum(a.first_loans)::bigint first_loans,sum(a.repeat_loans)::bigint repeat_loans,
 sum(a.unclassified_loans)::bigint unclassified_loans
 FROM public.reporting_borrower_activity_daily_v1 a WHERE a.activity_date BETWEEN p_start AND p_end GROUP BY a.borrower_id
 ), combined AS (
 SELECT d.*,CASE WHEN a.borrower_id IS NULL THEN 0 ELSE a.principal_issued END principal_issued,
 CASE WHEN a.borrower_id IS NULL THEN 0 ELSE a.principal_returned END principal_returned,
 CASE WHEN a.borrower_id IS NULL THEN 0 ELSE a.interest_received END interest_received,
 coalesce(a.loans_issued,0) loans_issued,coalesce(a.first_loans,0) first_loans,coalesce(a.repeat_loans,0) repeat_loans,
 coalesce(a.unclassified_loans,0) unclassified_loans FROM cohort d LEFT JOIN activity a USING(borrower_id)
 ), totals AS (
 SELECT c.*,CASE WHEN bool_and(c.outstanding_principal IS NOT NULL) OVER() THEN sum(c.outstanding_principal) OVER() END total_principal,
 CASE WHEN bool_and(c.interest_received IS NOT NULL) OVER() THEN sum(c.interest_received) OVER() END total_interest FROM combined c
 )
 SELECT t.borrower_id,t.borrower_label,t.hidden_flag,t.has_active_loan,t.active_loans,t.loan_count,t.first_loan_date,t.last_payment_date,
 t.outstanding_principal,t.lifetime_interest,t.principal_issued,t.principal_returned,t.interest_received,t.loans_issued,t.first_loans,t.repeat_loans,
 t.unclassified_loans,CASE WHEN t.total_principal>0 THEN t.outstanding_principal/t.total_principal END,
 CASE WHEN t.total_interest>0 THEN t.interest_received/t.total_interest END,
 row_number() OVER(ORDER BY t.outstanding_principal DESC NULLS LAST,t.borrower_id),
 row_number() OVER(ORDER BY t.interest_received DESC NULLS LAST,t.borrower_id),t.invalid_fact_count,t.reporting_date,t.calculated_at FROM totals t
$$;
REVOKE ALL ON FUNCTION public.reporting_borrower_period_v1(date,date,text) FROM PUBLIC;
COMMENT ON FUNCTION public.reporting_borrower_period_v1(date,date,text) IS 'Read-only borrower period facts: explicit Bangkok dates, current cohort, signed receipts, immutable keys. Current positions do not reconstruct past balances. No AppSheet binding.';
