-- Cloud SQL supplies pg_cron as a background worker extension. The Windows
-- disposable engine lacks that extension; business logic is tested there and
-- actual scheduling is verified separately on the development Cloud SQL host.
DO $$
DECLARE job bigint; cloud_flag text:=current_setting('cloudsql.enable_pg_cron',true);
BEGIN
  IF cloud_flag IS NULL THEN
    RAISE NOTICE 'Cloud SQL scheduler setup skipped on non-Cloud-SQL disposable engine';
    RETURN;
  END IF;
  IF cloud_flag<>'on' OR current_setting('cron.database_name',true) IS DISTINCT FROM current_database()
    OR current_setting('cron.timezone',true) IS DISTINCT FROM 'Asia/Bangkok' THEN
    RAISE EXCEPTION 'Enable pg_cron for this database with cron.timezone Asia/Bangkok before migration';
  END IF;
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  SELECT cron.schedule('loan-daily-charges','5 0 * * *',
    $command$SELECT public.generate_due_charges((statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date);$command$) INTO job;
  -- Activation is environment-specific and must follow successful testing.
  PERFORM cron.alter_job(job,active:=false);
END $$;
