-- AppSheet IsAPartOf deletes children before Payments. Keep that relationship and
-- immutable derived-child guards: request one atomic source delete via an UPDATE.
ALTER TABLE public."Payments" ADD COLUMN "Delete Requested" boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.payment_delete_request_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW."Delete Requested" THEN RAISE EXCEPTION 'Create a receipt before requesting deletion'; END IF;
  RETURN NEW;
 END IF;
 IF NEW."Delete Requested" THEN
  IF (to_jsonb(NEW)-'Delete Requested') IS DISTINCT FROM (to_jsonb(OLD)-'Delete Requested') THEN
   RAISE EXCEPTION 'Delete receipt must be a separate action; sync source edits first';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a000_payment_delete_request BEFORE INSERT OR UPDATE ON public."Payments"
 FOR EACH ROW EXECUTE FUNCTION public.payment_delete_request_guard();

-- SECURITY INVOKER: the caller must retain ordinary source DELETE permission.
-- Last AFTER ROW trigger permits existing receipt-update triggers to finish.
-- The nested ordinary DELETE invokes V59 locks, exact owned-child/cash cleanup,
-- closure/referral reconciliation and historical refresh in this transaction.
CREATE FUNCTION public.payment_delete_requested() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 DELETE FROM public."Payments" WHERE "Row ID"=NEW."Row ID";
 RETURN NULL;
END $$;
CREATE TRIGGER zzzz_payment_delete_requested AFTER UPDATE OF "Delete Requested" ON public."Payments"
 FOR EACH ROW WHEN (NEW."Delete Requested") EXECUTE FUNCTION public.payment_delete_requested();
