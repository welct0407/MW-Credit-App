-- Proposal: income statement page only. Requires explicit owner approval.
-- SELECT on 21 existing columns; no schema/data changes or write privileges.
GRANT SELECT ("Row ID", "Operating Income MTD", "Expenses MTD", "Net Profit MTD", "Tommy Withdrawn MTD", "Lisa Withdrawn MTD", "Unsettled Profit MTD", "Cash Pool Remaining", "Business Cash Held") ON public."Cash Dashboard" TO metabase_borrower_reader;
GRANT SELECT ("Ref Cash Account", "Ref Cash Holder", "Holder Name", "Account Label", "Current Balance", "Initialized", "Business Cash Held", "Reimbursement / Advance Due") ON public."Cash Account Balances" TO metabase_borrower_reader;
GRANT SELECT ("Row ID", "Expense Date", "Expense Category", "Amount") ON public."Business Expenses" TO metabase_borrower_reader;
