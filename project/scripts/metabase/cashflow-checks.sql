WITH checks AS (
 SELECT 'Unique transaction grain' name,count(*)=count(DISTINCT "Entry ID") passed FROM public.reporting_cashflow_transactions
 UNION ALL SELECT 'Unique daily grain',count(*)=count(DISTINCT "Position ID") FROM public.reporting_cashflow_daily
 UNION ALL SELECT 'All-account ledger count matches source',
 (SELECT count(*) FROM public.reporting_cashflow_transactions WHERE "Scope ID"='__ALL__')=
 (SELECT count(DISTINCT ledger_id) FROM public.cash_statement_account_effects WHERE "Statement Date"<=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date)
 UNION ALL SELECT 'Internal transfers are zero consolidated flow',NOT EXISTS(SELECT 1 FROM public.reporting_cashflow_transactions WHERE "Scope ID"='__ALL__' AND "Internal Transfer" AND ("Money In"<>0 OR "Money Out"<>0))
 UNION ALL SELECT 'Account sides match OLTP signed amounts',NOT EXISTS(
 SELECT 1 FROM public.reporting_cashflow_transactions t JOIN public.cash_statement_account_effects e ON t."Scope ID"=e."Ref Cash Account" AND t."Ledger ID"=e.ledger_id AND t."Entry ID"=jsonb_build_array(e."Ref Cash Account",e.ledger_id,e.direction)::text WHERE t."Net Movement" IS DISTINCT FROM e."Signed Amount")
 UNION ALL SELECT 'Initialized account running balances match OLTP',NOT EXISTS(
 SELECT 1 FROM public.reporting_cashflow_transactions t JOIN public."Cash Account Statement Recent" o ON t."Scope ID"=o."Ref Cash Account" AND t."Ledger ID"=(o."Row ID"::jsonb->>0) AND t."Entry ID"::jsonb->>2=o."Row ID"::jsonb->>1
 WHERE t."Date">=t."Available From" AND t."Balance After" IS DISTINCT FROM o."Balance After")
 UNION ALL SELECT 'Daily account opening and closing match OLTP',NOT EXISTS(
 SELECT 1 FROM public.reporting_cashflow_daily n JOIN public."Cash Account Daily Summary Recent" o ON n."Scope ID"=o."Ref Cash Account" AND n."Date"=o."Statement Date"
 WHERE n."Date">=n."Available From" AND (n."Opening Balance" IS DISTINCT FROM o."Opening Balance" OR n."Closing Balance" IS DISTINCT FROM o."Closing Balance" OR n."Money In" IS DISTINCT FROM o."Money In" OR n."Money Out" IS DISTINCT FROM o."Money Out"))
 UNION ALL SELECT 'Closing balances match governed dated account balances',NOT EXISTS(
 SELECT 1 FROM public.reporting_cashflow_daily n JOIN public.reporting_cash_account_daily o ON n."Scope ID"=o."Cash Account ID" AND n."Date"=o."Date" WHERE n."Closing Balance" IS DISTINCT FROM o."Current Balance")
 UNION ALL SELECT 'Daily opening plus flow equals closing',NOT EXISTS(SELECT 1 FROM public.reporting_cashflow_daily WHERE "Opening Balance"+"Money In"-"Money Out" IS DISTINCT FROM "Closing Balance")
 UNION ALL SELECT 'Consolidated closing is signed sum of accounts',NOT EXISTS(
 SELECT 1 FROM public.reporting_cashflow_daily a JOIN (SELECT "Date",CASE WHEN bool_and("Closing Balance" IS NOT NULL) THEN sum("Closing Balance") END balance FROM public.reporting_cashflow_daily WHERE "Scope ID"<>'__ALL__' GROUP BY 1) b USING("Date") WHERE a."Scope ID"='__ALL__' AND a."Closing Balance" IS DISTINCT FROM b.balance)
 UNION ALL SELECT 'Unknown and pre-opening balances remain unavailable',NOT EXISTS(SELECT 1 FROM public.reporting_cashflow_daily WHERE ("Available From" IS NULL OR "Date"<"Available From") AND ("Opening Balance" IS NOT NULL OR "Closing Balance" IS NOT NULL))
 UNION ALL SELECT 'Multi-day range opening plus flows equals final closing',NOT EXISTS(
 SELECT 1 FROM (SELECT "Scope ID",(array_agg("Opening Balance" ORDER BY "Date"))[1] opening,sum("Net Movement") movement,(array_agg("Closing Balance" ORDER BY "Date" DESC))[1] closing FROM public.reporting_cashflow_daily WHERE "Date">="Available From" GROUP BY 1) x WHERE opening+movement IS DISTINCT FROM closing)
 UNION ALL SELECT 'Same day entry end matches daily closing',NOT EXISTS(
 SELECT 1 FROM (SELECT DISTINCT ON ("Scope ID","Date") "Scope ID","Date","Balance After" FROM public.reporting_cashflow_transactions ORDER BY "Scope ID","Date","Posted At" DESC,"Ledger ID" COLLATE "C" DESC,"Entry ID" COLLATE "C" DESC) t
 JOIN public.reporting_cashflow_daily d USING("Scope ID","Date") WHERE t."Balance After" IS DISTINCT FROM d."Closing Balance")
) SELECT json_agg(checks) FROM checks;
