ALTER TABLE public."Payments" ADD COLUMN "Planned Allocation Amount" numeric, ADD COLUMN "Posted Amount" numeric;
CREATE FUNCTION public.vc_payment_row() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 SELECT coalesce(sum("Allocated Amount"::numeric),0) INTO NEW."Planned Allocation Amount"
 FROM public."Payment Allocations" WHERE "Ref Payment"=NEW."Row ID";
 SELECT coalesce(sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)),0) INTO NEW."Posted Amount"
 FROM public."Repayments" WHERE "Ref Payment"=NEW."Row ID";
 RETURN NEW;
END $$;
CREATE TRIGGER zz_vc_payment_row BEFORE INSERT OR UPDATE ON public."Payments"
 FOR EACH ROW EXECUTE FUNCTION public.vc_payment_row();

-- Preserve processing on all original-column writes (including explicit retry),
-- but a cache-only refresh must never initiate financial processing.
DROP TRIGGER process_lump_sum ON public."Payments";
CREATE TRIGGER process_lump_sum AFTER INSERT OR UPDATE OF
 "Row ID","Status","Ref Borrower","Amount Received","Payment Method","Allocation Method","Bank Reference","Notes",
 "Created By","Payment Date","Created At","Processed At","Ref Target Charge","Ref Target Loan" ON public."Payments"
 FOR EACH ROW EXECUTE FUNCTION public.process_lump_sum();

CREATE FUNCTION public.vc_refresh_payment(p_id text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE a numeric; r numeric;
BEGIN
 SELECT coalesce(sum("Allocated Amount"::numeric),0) INTO a FROM public."Payment Allocations" WHERE "Ref Payment"=p_id;
 SELECT coalesce(sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)),0) INTO r FROM public."Repayments" WHERE "Ref Payment"=p_id;
 UPDATE public."Payments" SET "Planned Allocation Amount"=a,"Posted Amount"=r WHERE "Row ID"=p_id
 AND ROW("Planned Allocation Amount","Posted Amount") IS DISTINCT FROM ROW(a,r);
END $$;
CREATE FUNCTION public.vc_payment_changed() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o jsonb:=CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
 n jsonb:=CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END; k text;
BEGIN
 FOR k IN SELECT DISTINCT id FROM unnest(ARRAY[o->>'Ref Payment',n->>'Ref Payment']) id WHERE id IS NOT NULL ORDER BY id
 LOOP PERFORM public.vc_refresh_payment(k); END LOOP;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER vc_payment_changed AFTER INSERT OR UPDATE OR DELETE ON public."Payment Allocations"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.vc_payment_changed();
CREATE CONSTRAINT TRIGGER vc_payment_changed AFTER INSERT OR UPDATE OR DELETE ON public."Repayments"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.vc_payment_changed();
CREATE FUNCTION public.vc_lock_payment_parents() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o jsonb:=CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
 n jsonb:=CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END; k text;
BEGIN
 FOR k IN SELECT DISTINCT "Ref Borrower" FROM public."Payments" WHERE "Row ID" IN(o->>'Ref Payment',n->>'Ref Payment') ORDER BY "Ref Borrower"
 LOOP
  BEGIN PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=k FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'Borrower is busy; sync and retry'; END;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER aa_vc_payment_lock BEFORE INSERT OR UPDATE OR DELETE ON public."Payment Allocations"
 FOR EACH ROW EXECUTE FUNCTION public.vc_lock_payment_parents();
CREATE TRIGGER aa_vc_payment_lock BEFORE INSERT OR UPDATE OR DELETE ON public."Repayments"
 FOR EACH ROW EXECUTE FUNCTION public.vc_lock_payment_parents();
UPDATE public."Payments" SET "Planned Allocation Amount"=0;
