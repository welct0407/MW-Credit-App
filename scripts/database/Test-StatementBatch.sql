\ir Test-DailyCashSnapshots.sql
\ir Test-FocusedStatements.sql
\ir Test-PaymentHealth.sql
\ir Test-ScheduleHealth.sql
\ir Test-BorrowerPages.sql
\ir Test-PrincipalDailyInterest.sql
\ir Test-OriginalDailyInterest.sql
\ir Test-Forecast.sql
\ir Test-SelectedCharges.sql
\ir Test-ReceiptUpload.sql
\ir Test-UpcomingCharges.sql
\ir Test-InterestReallocation.sql
\ir Test-PaymentCrud.sql
\ir Test-AppSheetReceiptDelete.sql
\ir Test-BusinessCrud.sql
\ir Test-HistoryAggregateParity.sql
\ir Test-ExpenseReimbursement.sql
\ir Test-ReceiptDeleteFlagMetadata.sql
\ir Test-LoanCorrections.sql
\ir Test-DailyTypeConversion.sql

-- Original GUI fixture seed/cleanup remains compatible with current derived snapshots.
\ir Test-UiFixtures.sql

\ir Test-DefaultInspection.sql
\ir Test-DefaultRepayment.sql
\ir Test-R051RelaxedPolicy.sql
\ir Test-TriggerPerformance.sql
-- V77 retires the rejected AppSheet experiment; native reverse Refs remain.
DO $$ BEGIN
 IF to_regclass('public.oltp_payment_related_ids_v1') IS NOT NULL THEN
  RAISE EXCEPTION 'Retired experimental related-ID view still exists';
 END IF;
END $$;
\ir Test-ApplePushEndpoints.sql
-- R063 W3 (DB-CI-02): previously unreachable regressions, fixtures updated to the
-- current cash-account and capital rules. Test-PaymentRollups chains
-- Test-BorrowerRollups -> Test-MaterializedBalances -> Test-AnalyticsRefresh.
\ir Test-LumpSum.sql
\ir Test-InterestScheduleAnchor.sql
\ir Test-PaymentRollups.sql
\ir Test-Partners.sql
\ir Test-BusinessExpenses.sql
-- R064 W4 (V93) hygiene assertions.
DO $$ BEGIN
 -- DB-SCHEMA-04: money text output is what the views and Node casts expect (C lc_monetary, "$" format).
 IF current_setting('lc_monetary')<>'C' OR 1234.5::money::text<>'$1,234.50' OR (-7)::money::numeric<>-7 OR 10::money::numeric::text<>'10.00' THEN
  RAISE EXCEPTION 'lc_monetary/money formatting changed: % %',current_setting('lc_monetary'),1234.5::money::text; END IF;
 -- DB-SCHEMA-03: the four FK indexes lead with the FK column.
 IF (SELECT count(*) FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0]
     WHERE (i.indexrelid::regclass::text,i.indrelid::regclass::text,a.attname) IN
      (('allocations_charge_idx','"Payment Allocations"','Ref Charge'),('repayments_allocation_idx','"Repayments"','Ref Payment Allocation'),
       ('cash_ledger_payment','"Cash Ledger"','Ref Payment'),('settlements_partner_idx','"Settlements"','Ref Partner')))<>4 THEN
  RAISE EXCEPTION 'V93 FK indexes missing'; END IF;
 -- DB-LOCK-03: pwa_lock_key_v1 equals the inline form used by the SQL bodies and by Node today.
 IF pwa_lock_key_v1('borrower','B-1')<>hashtextextended('borrower:'||'B-1',0)
  OR pwa_lock_key_v1('borrower-name',lower(btrim(' Ann ไทย ')))<>hashtextextended('borrower-name:'||lower(btrim(' Ann ไทย ')),0)
  OR pwa_lock_key_v1('cash-account','CI-LISA')<>hashtextextended('cash-account:'||'CI-LISA',0)
  OR pwa_lock_key_v1('borrower',NULL) IS NOT NULL OR pwa_lock_key_v1('borrower','B1')<>4085604855717338414 THEN
  RAISE EXCEPTION 'pwa_lock_key_v1 differs from the inline advisory-key form'; END IF;
 IF NOT (SELECT provolatile='i' AND proisstrict AND NOT prosecdef FROM pg_proc WHERE oid='public.pwa_lock_key_v1(text,text)'::regprocedure) THEN
  RAISE EXCEPTION 'pwa_lock_key_v1 must stay IMMUTABLE STRICT invoker'; END IF;
 -- DB-PERF-04: pg_stat_statements lives in schema monitoring wherever the module is installed; nothing of it in public.
 IF EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='pg_stat_statements')
  AND NOT EXISTS(SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pg_stat_statements' AND n.nspname='monitoring') THEN
  RAISE EXCEPTION 'pg_stat_statements is available but not created in schema monitoring'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'pg_stat_statements%') THEN
  RAISE EXCEPTION 'pg_stat_statements objects leaked into public'; END IF;
END $$;
-- DB-SCHEMA-02: firing-order snapshot; DB-ACCESS-08: the ledger definer under the real roles.
\ir Test-TriggerOrder.sql
\ir Test-LedgerAccess.sql
-- Last: the migration-owned grant matrix (DB-CI-05 / DB-ACCESS-02).
\ir Test-AccessMatrix.sql
