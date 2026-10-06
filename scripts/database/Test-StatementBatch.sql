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
