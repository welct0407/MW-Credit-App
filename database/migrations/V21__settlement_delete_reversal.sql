-- R005 refinement: the app's Delete command marks a settlement Cancelled.
-- Retain source facts; remove the current derived cash effect through V20.
CREATE FUNCTION public.guard_settlement_reversal() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Settlement history is retained. Refresh the app and use Delete to reverse the settlement';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."Status"='Cancelled' THEN RAISE EXCEPTION 'Cannot create an already deleted settlement'; END IF;
  RETURN NEW;
 END IF;
 IF OLD."Status"='Cancelled' THEN
  IF (to_jsonb(NEW)-'Notes') IS DISTINCT FROM (to_jsonb(OLD)-'Notes') THEN
   RAISE EXCEPTION 'Deleted settlements cannot be changed or restored; create a new settlement';
  END IF;
  -- Retry of the same Delete command is harmless; retain the first audit note.
  RETURN OLD;
 END IF;
 IF NEW."Status"='Cancelled' THEN
  IF (to_jsonb(NEW)-'Status'-'Notes') IS DISTINCT FROM (to_jsonb(OLD)-'Status'-'Notes') THEN
   RAISE EXCEPTION 'Delete must preserve the original settlement facts';
  END IF;
  IF nullif(btrim(NEW."Notes"),'') IS NULL OR NEW."Notes" IS NOT DISTINCT FROM OLD."Notes" THEN
   RAISE EXCEPTION 'Delete requires an appended reversal note';
  END IF;
  IF coalesce(OLD."Notes",'')<>'' AND left(NEW."Notes",length(OLD."Notes"))<>OLD."Notes" THEN
   RAISE EXCEPTION 'Delete must retain the original settlement notes';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER settlement_reversal_guard BEFORE INSERT OR UPDATE OR DELETE
ON public."Settlements" FOR EACH ROW EXECUTE FUNCTION public.guard_settlement_reversal();

CREATE OR REPLACE FUNCTION public.validate_net_settlement() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE available numeric;
BEGIN
 IF NEW."Status"='Cancelled' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW."Amount" IS NOT DISTINCT FROM OLD."Amount"
   AND NEW."Ref Partner" IS NOT DISTINCT FROM OLD."Ref Partner" THEN RETURN NEW; END IF;
 IF NEW."Ref Partner" IS NULL OR NEW."Amount" IS NULL OR NEW."Amount"::numeric<=0 THEN
  RAISE EXCEPTION 'Settlement requires a partner and a positive amount';
 END IF;
 PERFORM public.recalculate_business_expenses_from_date('0001-01-01');
 SELECT public.partner_net_profit(NEW."Ref Partner")-coalesce(sum("Amount"::numeric),0) INTO available
 FROM public."Settlements" WHERE "Ref Partner"=NEW."Ref Partner" AND "Row ID"<>NEW."Row ID"
 AND "Status" IS DISTINCT FROM 'Cancelled';
 IF NEW."Amount"::numeric>available THEN RAISE EXCEPTION 'Settlement exceeds net available to settle'; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION public.refresh_reversed_settlement_analytics() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE first_snapshot date; last_snapshot date;
BEGIN
 IF OLD."Status"='Completed' AND NEW."Status"='Cancelled' THEN
  SELECT min("Snapshot Date"),max("Snapshot Date") INTO first_snapshot,last_snapshot
  FROM public."Daily Analytics" WHERE "Snapshot Date">=OLD."Transfer Date";
  IF first_snapshot IS NOT NULL THEN
   PERFORM public.refresh_daily_analytics(first_snapshot,last_snapshot);
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_settlement_reversal_analytics AFTER UPDATE OF "Status" ON public."Settlements"
FOR EACH ROW EXECUTE FUNCTION public.refresh_reversed_settlement_analytics();
