-- DEV VC phase 3. Preserve the exact existing prototype populations.
ALTER TABLE public."Loans" ADD COLUMN "Expected Daily Interest Amount" numeric;
ALTER TABLE public."Borrowers"
 ADD COLUMN "Total Interest Earned" numeric,
 ADD COLUMN "Total Amount Loaned" numeric,
 ADD COLUMN "Total Number of Loans" integer,
 ADD COLUMN "Total Outstanding Principal" numeric,
 ADD COLUMN "Active Loan Interest Earned" numeric,
 ADD COLUMN "Active Daily Interest" numeric,
 ADD COLUMN "Has Closed Loan" boolean,
 ADD COLUMN "Has Active Loan" boolean;

CREATE FUNCTION public.vc_daily_interest(p public."Loans") RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN p."Auto Charge Enabled" IS TRUE AND p."Loan Status"='ยังไม่ปิดยอด' THEN
  CASE WHEN p."Loan Type"='ดอกเบี้ยรายวัน' THEN coalesce(p."Current Daily Interest"::numeric,0)
   WHEN p."Loan Type"='ผ่อนชำระรายวัน' AND p."Loan Date" IS NOT NULL AND p."Due Date">=p."Loan Date" AND p."Daily Payment Amount"::numeric>0
   THEN (p."Daily Payment Amount"::numeric*(p."Due Date"-p."Loan Date"+1)-coalesce(p."Principal Amount"::numeric,0))/(p."Due Date"-p."Loan Date"+1)
   ELSE 0 END ELSE 0 END;
$$;
CREATE FUNCTION public.vc_daily_interest_row() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN NEW."Expected Daily Interest Amount":=public.vc_daily_interest(NEW); RETURN NEW; END $$;
CREATE TRIGGER zz_vc_daily_interest BEFORE INSERT OR UPDATE ON public."Loans"
 FOR EACH ROW EXECUTE FUNCTION public.vc_daily_interest_row();

-- Read authoritative repayment aggregates so borrower refresh does not depend
-- on the order in which transaction-deferred loan cache events are flushed.
CREATE FUNCTION public.vc_borrower_values(p_id text)
RETURNS TABLE(interest numeric,principal numeric,n integer,outstanding numeric,active_interest numeric,daily numeric,closed boolean,active boolean)
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT coalesce(sum(r.i),0),coalesce(sum(l."Principal Amount"::numeric),0),count(*)::integer,
  coalesce(sum(coalesce(l."Principal Amount"::numeric,0)-coalesce(r.p,0)),0),
  coalesce(sum(r.i) FILTER(WHERE l."Loan Status"='ยังไม่ปิดยอด'),0),
  coalesce(sum(public.vc_daily_interest(l)),0),
  coalesce(bool_or(l."Loan Status"='ปิดยอดแล้ว'),false),coalesce(bool_or(l."Loan Status"='ยังไม่ปิดยอด'),false)
 FROM public."Loans" l LEFT JOIN LATERAL (
  SELECT sum("Interest Paid"::numeric) i,sum("Principal Paid"::numeric) p
  FROM public."Repayments" WHERE "Ref Loans"=l."Row ID"
 ) r ON true WHERE l."Ref Borrowers"=p_id;
$$;
CREATE FUNCTION public.vc_borrower_row() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 SELECT interest,principal,n,outstanding,active_interest,daily,closed,active
 INTO NEW."Total Interest Earned",NEW."Total Amount Loaned",NEW."Total Number of Loans",NEW."Total Outstanding Principal",
 NEW."Active Loan Interest Earned",NEW."Active Daily Interest",NEW."Has Closed Loan",NEW."Has Active Loan"
 FROM public.vc_borrower_values(NEW."Row ID"); RETURN NEW;
END $$;
CREATE TRIGGER zz_vc_borrower_row BEFORE INSERT OR UPDATE ON public."Borrowers"
 FOR EACH ROW EXECUTE FUNCTION public.vc_borrower_row();
CREATE FUNCTION public.vc_refresh_borrower(p_id text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public."Borrowers" b SET "Total Interest Earned"=v.interest,"Total Amount Loaned"=v.principal,
 "Total Number of Loans"=v.n,"Total Outstanding Principal"=v.outstanding,"Active Loan Interest Earned"=v.active_interest,
 "Active Daily Interest"=v.daily,"Has Closed Loan"=v.closed,"Has Active Loan"=v.active
 FROM public.vc_borrower_values(p_id) v WHERE b."Row ID"=p_id AND
 ROW(b."Total Interest Earned",b."Total Amount Loaned",b."Total Number of Loans",b."Total Outstanding Principal",b."Active Loan Interest Earned",b."Active Daily Interest",b."Has Closed Loan",b."Has Active Loan")
 IS DISTINCT FROM ROW(v.interest,v.principal,v.n,v.outstanding,v.active_interest,v.daily,v.closed,v.active);
END $$;
CREATE FUNCTION public.vc_borrower_changed() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o jsonb:=CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
 n jsonb:=CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END; k text;
BEGIN
 FOR k IN SELECT DISTINCT id FROM (
  SELECT o->>'Ref Borrowers' id WHERE TG_TABLE_NAME='Loans'
  UNION ALL SELECT n->>'Ref Borrowers' WHERE TG_TABLE_NAME='Loans'
  UNION ALL SELECT "Ref Borrowers" FROM public."Loans" WHERE "Row ID" IN(o->>'Ref Loans',n->>'Ref Loans')
 ) q WHERE id IS NOT NULL ORDER BY id LOOP PERFORM public.vc_refresh_borrower(k); END LOOP;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER vc_borrower_changed AFTER INSERT OR UPDATE OR DELETE ON public."Loans"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.vc_borrower_changed();
CREATE CONSTRAINT TRIGGER vc_borrower_changed AFTER INSERT OR UPDATE OR DELETE ON public."Repayments"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.vc_borrower_changed();

-- Serialize helper-only edits too, while leaving unrelated command updates to
-- the existing payment/charge-generation lock protocol.
CREATE FUNCTION public.vc_lock_daily_parent() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF ROW(OLD."Auto Charge Enabled",OLD."Loan Type",OLD."Loan Date",OLD."Due Date",OLD."Current Daily Interest",OLD."Daily Payment Amount")
 IS DISTINCT FROM ROW(NEW."Auto Charge Enabled",NEW."Loan Type",NEW."Loan Date",NEW."Due Date",NEW."Current Daily Interest",NEW."Daily Payment Amount") THEN
  BEGIN PERFORM 1 FROM public."Borrowers" WHERE "Row ID" IN(OLD."Ref Borrowers",NEW."Ref Borrowers") ORDER BY "Row ID" FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'Borrower is busy; sync and retry'; END;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER aa_vc_daily_lock BEFORE UPDATE ON public."Loans" FOR EACH ROW EXECUTE FUNCTION public.vc_lock_daily_parent();
UPDATE public."Loans" SET "Expected Daily Interest Amount"=0;
UPDATE public."Borrowers" SET "Total Interest Earned"=0;
