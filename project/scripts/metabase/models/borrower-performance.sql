WITH loan_totals AS (
 SELECT "Borrower ID",sum("Outstanding Principal") principal FROM {{model:loans}} l GROUP BY 1
), repayment_totals AS (
 SELECT "Borrower ID",sum("Interest 30D") interest_30d,
        count(*) FILTER (WHERE "In Last 30 Days") payments_30d
 FROM {{model:repayments}} r GROUP BY 1
), grouped AS (
 SELECT b."Borrower",coalesce(sum(l.principal),0) principal,
        coalesce(sum(r.interest_30d),0) interest_30d,coalesce(sum(r.payments_30d),0) payments_30d
 FROM {{model:borrowers}} b
 LEFT JOIN loan_totals l ON l."Borrower ID"=b."Borrower ID"
 LEFT JOIN repayment_totals r ON r."Borrower ID"=b."Borrower ID"
 WHERE b."Hidden" IS NOT TRUE GROUP BY b."Borrower"
), ranked AS (
 SELECT *,row_number() OVER(ORDER BY principal DESC NULLS LAST,"Borrower") principal_rank,
          row_number() OVER(ORDER BY CASE WHEN payments_30d>0 THEN interest_30d END DESC NULLS LAST,"Borrower") profit_rank
 FROM grouped
)
SELECT "Borrower",principal AS "Outstanding Principal",interest_30d AS "Profit 30D",
       payments_30d AS "Payments 30D",principal_rank AS "Principal Rank",profit_rank AS "Profit Rank",
       CASE WHEN principal_rank<=4 THEN "Borrower" ELSE 'Others' END AS "Principal Group",
       CASE WHEN profit_rank<=4 THEN "Borrower" ELSE 'Others' END AS "Profit Group",
       least(principal_rank,5) AS "Principal Group Order",least(profit_rank,5) AS "Profit Group Order"
FROM ranked
