WITH selected AS (
 SELECT d.* FROM {{model:cashflow-daily}} d
 WHERE d."Scope ID"={{cash_account}} [[AND {{cashflow_period}}]]
), bounds AS (
 SELECT min("Date") starts,max("Date") ends,count(*) days,
 sum("Money In") cash_in,sum("Money Out") cash_out,sum("Net Movement") movement,
 sum("Transaction Count") transactions,max("Available From") available
 FROM selected
)
SELECT b.starts AS "Period Start",b.ends AS "Period End",b.available AS "Available From",
 CASE WHEN b.days=0 THEN 'No dates selected' WHEN b.days<>b.ends-b.starts+1 THEN 'Choose one continuous date range'
  WHEN o."Opening Balance" IS NULL THEN 'Opening unavailable: choose a period on or after the known opening'
  WHEN c."Closing Balance" IS NULL THEN 'Closing unavailable' ELSE 'Reconciled' END AS "Statement Status",
 CASE WHEN b.days=b.ends-b.starts+1 THEN o."Opening Balance" END AS "Opening Balance",
 CASE WHEN b.days=b.ends-b.starts+1 THEN b.cash_in END AS "Money In",
 CASE WHEN b.days=b.ends-b.starts+1 THEN b.cash_out END AS "Money Out",
 CASE WHEN b.days=b.ends-b.starts+1 THEN b.movement END AS "Net Movement",
 CASE WHEN b.days=b.ends-b.starts+1 THEN c."Closing Balance" END AS "Closing Balance",
 b.transactions AS "Transaction Count",b.days=b.ends-b.starts+1 AS "Continuous Period"
FROM bounds b LEFT JOIN selected o ON o."Date"=b.starts LEFT JOIN selected c ON c."Date"=b.ends
