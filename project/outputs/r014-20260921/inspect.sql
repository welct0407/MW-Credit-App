SELECT current_database(), inet_server_addr();
SELECT "Partner Name", "Partner Role", "Row ID" FROM public."Partners" ORDER BY "Partner Role";
SELECT pg_get_functiondef('public.partner_net_profit(text)'::regprocedure);
SELECT count(*) AS completed_missing_transfer_date FROM public."Settlements" WHERE "Status"='Completed' AND "Transfer Date" IS NULL;
SELECT max(version::integer) FROM public.flyway_schema_history WHERE success;
