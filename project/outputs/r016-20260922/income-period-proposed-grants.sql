-- SUPERSEDED, NOT EXECUTED: owner selected SELECT on all 12 reporting sources instead.
-- Additional proposal for arbitrary income statement periods. Owner approval required.
-- Nine existing columns; SELECT only; preserve prior approved 21-column grants.
GRANT SELECT ("Row ID", "Ref Partner", "Transfer Date", "Amount", "Status") ON public."Settlements" TO metabase_borrower_reader;
GRANT SELECT ("Partner A Profit", "Partner B Profit") ON public.olap_repayments_analytics TO metabase_borrower_reader;
GRANT SELECT ("Partner A Expense", "Partner B Expense") ON public."Business Expenses" TO metabase_borrower_reader;
