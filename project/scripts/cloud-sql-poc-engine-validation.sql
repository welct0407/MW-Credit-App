-- Synthetic database engine preflight only; this does NOT test AppSheet sync.
-- All test writes roll back, retaining the revision-zero fixture.
BEGIN;
DO $$
DECLARE rejected boolean := false;
BEGIN
  ASSERT (SELECT revision=0 AND input_value=0 FROM public.poc_source WHERE id='SYNC-001'), 'Expected pristine fixture';
  ASSERT (SELECT count(*)=0 FROM public.poc_events), 'Expected empty event table';
  UPDATE public.poc_source SET input_value=10, revision=1 WHERE id='SYNC-001';
  ASSERT (SELECT derived_value=20 AND applied_revision=1 FROM public.poc_projection WHERE id='SYNC-001'), 'Projection update failed';
  ASSERT (SELECT count(*)=1 FROM public.poc_events), 'Event insert failed';
  UPDATE public.poc_source SET input_value=10, revision=1 WHERE id='SYNC-001';
  ASSERT (SELECT count(*)=1 FROM public.poc_events), 'Duplicate unchanged update inserted event';
  BEGIN
    UPDATE public.poc_source SET input_value=-1, revision=2 WHERE id='SYNC-001';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'POC negative input deliberately rejected' THEN RAISE; END IF;
    rejected := true;
  END;
  ASSERT rejected, 'Negative update should fail';
  ASSERT (SELECT input_value=10 AND revision=1 FROM public.poc_source WHERE id='SYNC-001'), 'Source did not roll back';
  ASSERT (SELECT derived_value=20 AND applied_revision=1 FROM public.poc_projection WHERE id='SYNC-001'), 'Projection did not roll back';
  ASSERT (SELECT count(*)=1 FROM public.poc_events), 'Event did not roll back';
  rejected := false;
  BEGIN
    UPDATE public.poc_source SET input_value=7, revision=1 WHERE id='SYNC-001';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'POC revision must advance exactly one step' THEN RAISE; END IF;
    rejected := true;
  END;
  ASSERT rejected, 'Conflicting revision should fail';
  UPDATE public.poc_source SET input_value=7, revision=2 WHERE id='SYNC-001';
  ASSERT (SELECT derived_value=14 AND applied_revision=2 FROM public.poc_projection WHERE id='SYNC-001'), 'Recovery failed';
  ASSERT (SELECT count(*)=2 FROM public.poc_events), 'Recovery event count failed';
END;
$$;
SELECT 'Engine preflight assertions passed; rolling test writes back' AS result;
ROLLBACK;
