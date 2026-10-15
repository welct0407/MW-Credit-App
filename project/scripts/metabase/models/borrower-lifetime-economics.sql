-- R037. Borrower grain; completed Bangkok days for lifetime yield and rolling interest.
-- Exposure uses end-of-day principal. Receipt-day reductions apply that day.
WITH clock AS (SELECT public.olap_reporting_date() today),
loans AS MATERIALIZED (SELECT * FROM public.reporting_borrower_loan_facts_v1),
payments AS MATERIALIZED (
 SELECT "Ref Loans" loan_id,"Payment Date" paid_on,"Principal Paid"::numeric principal,
 "Interest Paid"::numeric interest FROM public.olap_repayments_analytics
),
receipt_totals AS (
 SELECT l.borrower_id,
 sum(p.interest) FILTER(WHERE p.paid_on<c.today) lifetime_interest,
 sum(p.interest) FILTER(WHERE p.paid_on<=c.today) lifetime_interest_current,
 sum(p.interest) FILTER(WHERE p.paid_on BETWEEN c.today-30 AND c.today-1) interest_30d,
 sum(p.interest) FILTER(WHERE l.is_active AND p.paid_on<=c.today) active_interest,
 count(*) FILTER(WHERE p.paid_on IS NULL OR p.interest IS NULL OR p.principal IS NULL
 OR p.paid_on<l.loan_date) invalid_receipts
 FROM loans l JOIN payments p USING(loan_id) CROSS JOIN clock c GROUP BY l.borrower_id
),
lent AS (
 SELECT borrower_id,sum(original_principal) FILTER(WHERE loan_date<=c.today) total_principal,
 bool_or(loan_date IS NULL OR original_principal IS NULL OR original_principal<0) invalid_lending
 FROM loans CROSS JOIN clock c GROUP BY borrower_id
),
-- A compact event sweep, not a borrower x calendar Cartesian product.
events AS (
 SELECT l.loan_id,l.loan_date event_date,0::numeric reduction FROM loans l
 UNION ALL
 SELECT p.loan_id,p.paid_on,sum(p.principal) FROM payments p JOIN loans l USING(loan_id)
 CROSS JOIN clock c WHERE p.paid_on>=l.loan_date AND p.paid_on<c.today
 GROUP BY p.loan_id,p.paid_on
),
daily_events AS (SELECT loan_id,event_date,sum(reduction) reduction FROM events GROUP BY 1,2),
segments AS (
 SELECT l.*,e.event_date,
 least(coalesce(lead(e.event_date) OVER(PARTITION BY l.loan_id ORDER BY e.event_date),c.today),
 c.today,coalesce(l.close_date+1,c.today)) segment_end,
 l.original_principal-sum(e.reduction) OVER(PARTITION BY l.loan_id ORDER BY e.event_date) balance
 FROM daily_events e JOIN loans l USING(loan_id) CROSS JOIN clock c
),
exposure AS (
 SELECT borrower_id,
 sum(greatest(balance,0)*greatest(segment_end-event_date,0)) principal_days,
 bool_or(loan_date IS NULL OR original_principal IS NULL OR original_principal<0 OR is_active IS NULL
 OR (NOT is_active AND close_date IS NULL) OR coalesce(close_date<loan_date,false)) invalid_loans
 FROM segments GROUP BY borrower_id
)
SELECT d.borrower_id AS "Borrower ID",d.borrower_label AS "Borrower",
 d.has_active_loan AS "Has active loan",d.outstanding_principal AS "Principal outstanding",
 CASE WHEN coalesce(r.invalid_receipts,0)=0 THEN coalesce(r.interest_30d,0) END AS "Interest 30D",
 CASE WHEN coalesce(r.invalid_receipts,0)=0 THEN coalesce(r.lifetime_interest,0) END AS "Lifetime interest",
 CASE WHEN NOT e.invalid_loans AND coalesce(r.invalid_receipts,0)=0 THEN e.principal_days END AS "Principal days",
 CASE WHEN NOT e.invalid_loans AND coalesce(r.invalid_receipts,0)=0 AND e.principal_days>0
 THEN coalesce(r.lifetime_interest,0)/e.principal_days END AS "Achieved daily rate",
 CASE WHEN coalesce(r.invalid_receipts,0)=0 AND d.outstanding_principal>0
 THEN coalesce(r.active_interest,0)/d.outstanding_principal END AS "Principal coverage",
 CASE WHEN coalesce(r.invalid_receipts,0)=0 THEN coalesce(r.active_interest,0) END AS "Active loan interest",
 CASE WHEN e.invalid_loans OR coalesce(r.invalid_receipts,0)>0 THEN 'Incomplete history'
 WHEN coalesce(e.principal_days,0)<=0 THEN 'No positive completed principal-days' ELSE 'Available' END AS "Rate status",
 c.today-1 AS "Lifetime through",c.today-30 AS "30D start",c.today-1 AS "30D end",c.today AS "Current as of",
 CASE WHEN NOT lent.invalid_lending THEN coalesce(lent.total_principal,0) END AS "Total principal lent",
 CASE WHEN coalesce(r.invalid_receipts,0)=0 THEN coalesce(r.lifetime_interest_current,0) END AS "Lifetime interest received",
 CASE WHEN NOT lent.invalid_lending AND coalesce(r.invalid_receipts,0)=0 AND lent.total_principal>0
 THEN coalesce(r.lifetime_interest_current,0)/lent.total_principal END AS "Lifetime interest return"
FROM public.reporting_borrower_directory_v1 d JOIN exposure e ON e.borrower_id=d.borrower_id
LEFT JOIN receipt_totals r ON r.borrower_id=d.borrower_id JOIN lent ON lent.borrower_id=d.borrower_id CROSS JOIN clock c
WHERE d.loan_count>0
