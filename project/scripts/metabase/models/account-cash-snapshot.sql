SELECT "Row ID" AS "Snapshot ID", "Snapshot Date" AS "Date", "Generated At", "Model Version",
 "Ref Cash Account" AS "Cash Account ID", "Ref Cash Holder" AS "Cash Holder ID",
 "Holder Name" AS "Cash Holder", "Account Label" AS "Account",
 "Opening Balance", "Closing Balance" AS "Balance", "Money In", "Money Out", "Net Movement",
 "Available From", "Balance Status", "Provisional", "Freshness Basis"
FROM public.reporting_cash_account_snapshot
