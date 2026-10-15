-- Run as the POC owner in appsheet_sync_poc. Test writes are rolled back.
BEGIN;
-- Cloud SQL's managed postgres account is not a PostgreSQL superuser.
-- This temporary role membership is rolled back with the test transaction.
GRANT appsheet_poc TO postgres WITH SET TRUE;
SET LOCAL ROLE appsheet_poc;
DO $$
BEGIN
  UPDATE public.poc_source SET input_value=10, revision=1 WHERE id='SYNC-001';
  IF NOT EXISTS (SELECT 1 FROM public.poc_projection WHERE id='SYNC-001' AND derived_value=20 AND applied_revision=1)
     OR (SELECT count(*) FROM public.poc_events)<>1 THEN
    RAISE EXCEPTION 'Restricted role trigger propagation failed';
  END IF;
  BEGIN
    UPDATE public.poc_projection SET derived_value=99 WHERE id='SYNC-001';
    RAISE EXCEPTION 'Unexpected direct projection write access';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.poc_events;
    RAISE EXCEPTION 'Unexpected direct event delete access';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.poc_source SET id='CHANGED' WHERE id='SYNC-001';
    RAISE EXCEPTION 'Unexpected source key write access';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
SELECT 'Restricted role assertions passed; rolling test writes back' AS result;
ROLLBACK;
