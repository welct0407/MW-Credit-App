-- R047: optional AppSheet-managed GCS upload, separate from agent-owned evidence.
ALTER TABLE public."Payments"
 ADD COLUMN "Uploaded Receipt" text,
 ADD COLUMN "Uploaded Receipt At" timestamp without time zone;

CREATE FUNCTION public.payment_receipt_upload_stamp() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 NEW."Uploaded Receipt":=nullif(btrim(NEW."Uploaded Receipt"),'');
 IF NEW."Uploaded Receipt" IS NULL THEN
  NEW."Uploaded Receipt At":=NULL;
 ELSIF TG_OP='INSERT' THEN
  NEW."Uploaded Receipt At":=clock_timestamp() AT TIME ZONE 'Asia/Bangkok';
 ELSIF NEW."Uploaded Receipt" IS DISTINCT FROM OLD."Uploaded Receipt" THEN
  NEW."Uploaded Receipt At":=clock_timestamp() AT TIME ZONE 'Asia/Bangkok';
 ELSE
  NEW."Uploaded Receipt At":=OLD."Uploaded Receipt At";
 END IF;
 RETURN NEW;
END $$;

CREATE TRIGGER a01_receipt_upload_stamp BEFORE INSERT OR UPDATE ON public."Payments"
 FOR EACH ROW EXECUTE FUNCTION public.payment_receipt_upload_stamp();
REVOKE ALL ON FUNCTION public.payment_receipt_upload_stamp() FROM PUBLIC;
COMMENT ON COLUMN public."Payments"."Uploaded Receipt" IS 'Optional user-uploaded GCS image via AppSheet; agent-owned Receipt Image remains protected';
COMMENT ON COLUMN public."Payments"."Uploaded Receipt At" IS 'Server-maintained Asia/Bangkok time of the latest user image addition or replacement; null after removal';
