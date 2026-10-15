SELECT row_to_json(d) FROM public."Cash Dashboard" d;
SELECT count(*) AS accounts, count(*) FILTER(WHERE "Initialized") AS initialized_accounts,
sum("Current Balance") AS net_account_cash, sum("Business Cash Held") AS positive_account_cash
FROM public."Cash Account Balances";
SELECT "Holder Name",count(*) AS accounts,sum("Current Balance") AS owner_balance
FROM public."Cash Account Balances" GROUP BY "Holder Name" ORDER BY "Holder Name";
SELECT ("Operating Income MTD"+"Expenses MTD"="Net Profit MTD") AS net_reconciles,
("Net Profit MTD"+"Tommy Withdrawn MTD"+"Lisa Withdrawn MTD"="Unsettled Profit MTD") AS unsettled_reconciles,
("Tommy Withdrawn MTD"<=0 AND "Lisa Withdrawn MTD"<=0) AS withdrawal_signs
FROM public."Cash Dashboard";
EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON) SELECT * FROM public."Cash Dashboard";
