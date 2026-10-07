-- R051: retain independent repayment facts until the owning default is undone.
-- Preserve V69 original-charge/generated-loss rules and existing attachments.
-- UPDATE/DELETE only: Default inserts and exact scoped Undo loss deletion remain valid.
CREATE OR REPLACE FUNCTION public.default_posting_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE derived text[]:=ARRAY['Principal Paid','Interest Paid','Total Paid','Principal Remaining','Interest Remaining','Amount Remaining','Payment Count','Payment Status','Payment Date'];
 parent record; parent_ids text[];
BEGIN
 IF starts_with(OLD."Row ID",'df10:') THEN
  IF TG_OP='DELETE' AND pg_trigger_depth()>=2 AND OLD."Ref Loans"=nullif(current_setting('business_crud.default',true),'') THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND TG_TABLE_NAME='Charges' THEN
   IF (to_jsonb(NEW)-derived) IS NOT DISTINCT FROM (to_jsonb(OLD)-derived) THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'Default posting is immutable';
 END IF;
 IF TG_TABLE_NAME='Charges' THEN
  -- aa_vc_lock already takes the affected borrower locks NOWAIT (V12).
  -- Derived cache refreshes must not acquire a reverse-order parent lock.
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-derived) IS NOT DISTINCT FROM (to_jsonb(OLD)-derived) THEN RETURN NEW; END IF;
  -- Only existing Default/Undo component-and-note restoration may bypass the
  -- parent state check. Original-charge deletion is never part of that inverse.
  IF TG_OP='UPDATE' AND pg_trigger_depth()>=2
    AND OLD."Ref Loans"=nullif(current_setting('business_crud.default',true),'')
    AND NEW."Ref Loans" IS NOT DISTINCT FROM OLD."Ref Loans"
    AND (to_jsonb(NEW)-derived-ARRAY['Principal Due','Interest Due','Notes'])
      IS NOT DISTINCT FROM (to_jsonb(OLD)-derived-ARRAY['Principal Due','Interest Due','Notes']) THEN RETURN NEW; END IF;
  parent_ids:=ARRAY[OLD."Ref Loans",CASE WHEN TG_OP='UPDATE' THEN NEW."Ref Loans" END];
  BEGIN
   FOR parent IN SELECT "Row ID","Defaulted" FROM public."Loans"
     WHERE "Row ID"=ANY(parent_ids) ORDER BY "Row ID" COLLATE "C" FOR SHARE NOWAIT
   LOOP
    IF coalesce(parent."Defaulted",false) THEN
     RAISE EXCEPTION 'Undo Default before changing or deleting its original charges';
    END IF;
   END LOOP;
  EXCEPTION WHEN lock_not_available THEN
   RAISE EXCEPTION 'Loan is busy; sync and retry charge correction';
  END;
 ELSIF TG_TABLE_NAME='Repayments' THEN
  -- Resolve both explicit and charge-derived parents. Ref Loans may be supplied
  -- stale by a client when Ref Charges changes; neither route may escape a
  -- defaulted source or move a repayment into a defaulted target.
  parent_ids:=ARRAY[OLD."Ref Loans",CASE WHEN TG_OP='UPDATE' THEN NEW."Ref Loans" END];
  parent_ids:=parent_ids || ARRAY(SELECT c."Ref Loans" FROM public."Charges" c
    WHERE c."Row ID" IN (OLD."Ref Charges",CASE WHEN TG_OP='UPDATE' THEN NEW."Ref Charges" END));
  -- aa_vc_lock has already acquired borrower locks NOWAIT. The repayment row
  -- may already be locked, so never wait for a Default/Undo parent-row lock.
  BEGIN
   FOR parent IN SELECT "Row ID","Defaulted" FROM public."Loans"
     WHERE "Row ID"=ANY(parent_ids) ORDER BY "Row ID" COLLATE "C" FOR SHARE NOWAIT
   LOOP
    IF coalesce(parent."Defaulted",false) THEN
     RAISE EXCEPTION 'Undo Default before changing or deleting its repayments';
    END IF;
   END LOOP;
  EXCEPTION WHEN lock_not_available THEN
   RAISE EXCEPTION 'Loan is busy; sync and retry repayment correction';
  END;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
