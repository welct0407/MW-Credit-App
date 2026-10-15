-- Read-only checks. Run only on appsheet-pg-dev-20260915 / loan_manager_prod.
SELECT current_database() AS database_name,
       current_setting('max_connections') AS max_connections,
       pg_postmaster_start_time() AS server_started,
       (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AS public_tables,
       (SELECT count(*) FROM information_schema.views WHERE table_schema='public') AS public_views,
       (SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND c.contype='f') AS foreign_keys,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal) AS application_triggers;

SELECT schemaname, tablename FROM pg_tables
WHERE schemaname IN ('public','assessment_lab') ORDER BY 1,2;

SELECT 'Borrowers' AS table_name,count(*) AS rows FROM public."Borrowers"
UNION ALL SELECT 'Loans',count(*) FROM public."Loans"
UNION ALL SELECT 'Partners',count(*) FROM public."Partners"
UNION ALL SELECT 'Charges',count(*) FROM public."Charges"
UNION ALL SELECT 'Payments',count(*) FROM public."Payments"
UNION ALL SELECT 'Payment Allocations',count(*) FROM public."Payment Allocations"
UNION ALL SELECT 'Repayments',count(*) FROM public."Repayments"
UNION ALL SELECT 'Statistics',count(*) FROM public."Statistics"
UNION ALL SELECT 'Loan Assessment SQL Lab View',count(*) FROM public."Loan Assessment SQL Lab View"
UNION ALL SELECT 'OLAP Calendar SQL Lab',count(*) FROM public."OLAP Calendar SQL Lab";
