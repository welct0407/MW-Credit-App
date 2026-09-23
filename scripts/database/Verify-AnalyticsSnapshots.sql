-- Read-only independent portfolio reconciliation, including Model 3 partial balances.
-- Deliberately uses per-date/per-repayment correlated sums, not V11's grouped engine.
WITH expected AS (
 SELECT a.*, "Snapshot Date" AS d,
 coalesce((SELECT sum("Principal Amount"::numeric) FROM "Loans" WHERE "Loan Date"=a."Snapshot Date"),0) AS issued,
 (SELECT count(*) FROM "Loans" WHERE "Loan Date"=a."Snapshot Date") AS issued_count,
 coalesce((SELECT sum("Principal Paid"::numeric) FROM "Repayments" WHERE "Payment Date"=a."Snapshot Date"),0) AS returned,
 coalesce((SELECT sum("Interest Paid"::numeric) FROM "Repayments" WHERE "Payment Date"=a."Snapshot Date"),0) AS interest,
 (SELECT count(*) FROM "Repayments" WHERE "Payment Date"=a."Snapshot Date") AS receipt_count,
 coalesce((SELECT sum("Principal Amount"::numeric) FROM "Loans" WHERE "Loan Date"<=a."Snapshot Date"),0)
 - coalesce((SELECT sum("Principal Paid"::numeric) FROM "Repayments" WHERE "Payment Date"<=a."Snapshot Date"),0) AS outstanding,
 (SELECT count(*) FROM "Loans" WHERE "Loan Date"<=a."Snapshot Date" AND ("Close Date" IS NULL OR "Close Date">a."Snapshot Date")) AS active,
 (SELECT count(DISTINCT coalesce("Ref Borrowers",'')) FROM "Loans" WHERE "Loan Date"<=a."Snapshot Date" AND ("Close Date" IS NULL OR "Close Date">a."Snapshot Date")) AS borrowers,
 coalesce((SELECT sum(greatest(coalesce(c."Principal Due"::numeric,0)+coalesce(c."Interest Due"::numeric,0)-coalesce((SELECT sum(coalesce(r."Principal Paid"::numeric,0)+coalesce(r."Interest Paid"::numeric,0)) FROM "Repayments" r WHERE r."Ref Charges"=c."Row ID" AND r."Payment Date"<=a."Snapshot Date"),0),0)) FROM "Charges" c WHERE c."Charge Date"<=a."Snapshot Date"),0) AS pending,
 coalesce((SELECT sum(CASE WHEN "Transaction Type"='Contribution' THEN "Amount"::numeric ELSE -"Amount"::numeric END) FROM "Cash Pool Contributions" WHERE "Contribution Date"<=a."Snapshot Date"),0) AS pool,
 coalesce((SELECT sum(r."Interest Paid"::numeric * CASE WHEN c.total>0 THEN coalesce(c.pa/c.total,0)+coalesce(c.pb/c.total,0) ELSE 0 END)
 FROM "Repayments" r CROSS JOIN LATERAL (
 SELECT sum(CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END) AS total,
 sum(CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END) FILTER(WHERE p."Partner Role"='A') AS pa,
 sum(CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END) FILTER(WHERE p."Partner Role"='B') AS pb
 FROM "Cash Pool Contributions" c LEFT JOIN "Partners" p ON p."Row ID"=c."Ref Partner" WHERE c."Contribution Date"<=r."Payment Date") c
 WHERE r."Payment Date"<=a."Snapshot Date"),0)
 -coalesce((SELECT sum("Amount"::numeric) FROM "Settlements" WHERE "Status"='Completed' AND "Transfer Date"<=a."Snapshot Date"),0) AS unsettled
 FROM "Daily Analytics" a
), checks AS (
 SELECT d, "Generated At", ROW(issued,issued_count,returned,interest,receipt_count,outstanding,active,borrowers,pending,pool,pool-outstanding,round(unsettled,2))
 IS NOT DISTINCT FROM ROW("Principal Issued"::numeric,"Loans Issued"::bigint,"Principal Returned"::numeric,"Interest Received"::numeric,"Repayments Count"::bigint,
 "Outstanding Principal EOD"::numeric,"Active Loans EOD"::bigint,"Active Borrowers EOD"::bigint,"Pending Charges EOD"::numeric,"Total Cash Pool EOD"::numeric,"Available Cash EOD"::numeric,"Unsettled Profit EOD"::numeric) AS matched
 FROM expected
)
SELECT json_build_object('verification','Model 3 independent portfolio reconciliation','dates',count(*),'matched',count(*) FILTER(WHERE matched),'mismatches',count(*) FILTER(WHERE NOT matched),
 'first_date',min(d),'last_date',max(d),'oldest_generation',min("Generated At"),'newest_generation',max("Generated At")) FROM checks;
