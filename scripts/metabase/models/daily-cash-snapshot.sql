SELECT "Row ID" AS "Snapshot ID", "Snapshot Date" AS "Date", "Generated At", "Model Version",
 "Total Cash Pool EOD"::numeric AS "Total Cash Pool",
 "Outstanding Principal EOD"::numeric AS "Outstanding Principal",
 "Available Cash EOD"::numeric AS "Remaining Lending Capital",
 "Cash Opening Balance" AS "Opening Cash", "Cash Balance EOD" AS "Net Cash Balance",
 "Cash Money In" AS "Money In", "Cash Money Out" AS "Money Out",
 "Cash Available From" AS "Available From", "Cash Balance Status" AS "Balance Status",
 "Provisional", "Freshness Basis", "Interest Received"::numeric AS "Income",
 "Business Expenses"::numeric AS "Expenses", "Net Profit"::numeric AS "Net Profit"
FROM public.reporting_daily_snapshot
