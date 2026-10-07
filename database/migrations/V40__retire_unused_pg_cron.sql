-- AppSheet owns business scheduling. Retire only the previously disabled
-- legacy cron scheduler, retaining generate_due_charges and all business SQL.
-- No CASCADE: unexpected external dependencies must stop this migration.
DO $$
DECLARE unexpected_jobs bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron absent; no scheduler objects to remove';
    RETURN;
  END IF;
  SET LOCAL lock_timeout = '5s';
  LOCK TABLE cron.job IN ACCESS EXCLUSIVE MODE;
  EXECUTE $check$
    SELECT count(*) FROM cron.job
    WHERE active
       OR jobid IS DISTINCT FROM 1
       OR username IS DISTINCT FROM 'postgres'
       OR nodename IS DISTINCT FROM 'localhost'
       OR nodeport IS DISTINCT FROM 5432
       OR jobname IS DISTINCT FROM 'loan-daily-charges'
       OR database IS DISTINCT FROM current_database()
       OR schedule IS DISTINCT FROM '5 0 * * *'
       OR command IS DISTINCT FROM
          'SELECT public.generate_due_charges((statement_timestamp() AT TIME ZONE ''Asia/Bangkok'')::date);'
  $check$ INTO unexpected_jobs;
  IF unexpected_jobs <> 0 THEN
    RAISE EXCEPTION 'Refusing pg_cron removal: active or unreviewed job definitions exist';
  END IF;
  DROP EXTENSION pg_cron RESTRICT;
END $$;
