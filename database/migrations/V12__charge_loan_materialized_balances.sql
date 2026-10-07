-- DEV VC phase 1. Exact existing AppSheet semantics, including closed-loan
-- status override, negative default interest and unclamped balances.
ALTER TABLE public."Charges"
 ADD COLUMN "Principal Paid" numeric,
 ADD COLUMN "Interest Paid" numeric,
 ADD COLUMN "Total Paid" numeric,
 ADD COLUMN "Principal Remaining" numeric,
 ADD COLUMN "Interest Remaining" numeric,
 ADD COLUMN "Amount Remaining" numeric,
 ADD COLUMN "Payment Count" integer,
 ADD COLUMN "Payment Status" text,
 ADD COLUMN "Payment Date" date;
ALTER TABLE public."Loans"
 ADD COLUMN "Total Interest Received" numeric,
 ADD COLUMN "Total Principal Received" numeric,
 ADD COLUMN "Outstanding Principal" numeric,
 ADD COLUMN "Total Amount Received" numeric;

-- The existing payment engine deliberately continues reading its authoritative
-- ledger through payment_charge_balances(). Deferred caches are for app reads.
CREATE FUNCTION public.vc_charge_values(p public."Charges")
RETURNS TABLE(pp numeric,ip numeric,total numeric,pr numeric,ir numeric,remaining numeric,n integer,status text,paid_date date)
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 WITH a AS (
  SELECT coalesce(sum(r."Principal Paid"::numeric),0) pp,
   coalesce(sum(r."Interest Paid"::numeric),0) ip,count(*)::integer n,max(r."Payment Date") d
  FROM public."Repayments" r WHERE r."Ref Charges"=p."Row ID"
 ), b AS (
  SELECT a.*,coalesce(p."Principal Due"::numeric,0)-pp pr,
   coalesce(p."Interest Due"::numeric,0)-ip ir FROM a
 ), c AS (
  SELECT b.*,CASE WHEN (SELECT l."Loan Status" FROM public."Loans" l WHERE l."Row ID"=p."Ref Loans")='ปิดยอดแล้ว'
   THEN 'ชำระแล้ว' WHEN pp+ip=0 THEN 'รอชำระ' WHEN pr+ir>0 THEN 'ชำระบางส่วน' ELSE 'ชำระแล้ว' END s FROM b
 ) SELECT pp,ip,pp+ip,pr,ir,pr+ir,n,s,CASE WHEN s='ชำระแล้ว' THEN d END FROM c;
$$;

CREATE FUNCTION public.vc_charge_row() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 SELECT pp,ip,total,pr,ir,remaining,n,status,paid_date
 INTO NEW."Principal Paid",NEW."Interest Paid",NEW."Total Paid",NEW."Principal Remaining",NEW."Interest Remaining",
  NEW."Amount Remaining",NEW."Payment Count",NEW."Payment Status",NEW."Payment Date"
 FROM public.vc_charge_values(NEW);
 RETURN NEW;
END $$;
CREATE TRIGGER zz_vc_charge_row BEFORE INSERT OR UPDATE ON public."Charges"
 FOR EACH ROW EXECUTE FUNCTION public.vc_charge_row();

CREATE FUNCTION public.vc_loan_row() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 SELECT coalesce(sum("Interest Paid"::numeric),0),coalesce(sum("Principal Paid"::numeric),0),
  coalesce(sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)),0)
 INTO NEW."Total Interest Received",NEW."Total Principal Received",NEW."Total Amount Received"
 FROM public."Repayments" WHERE "Ref Loans"=NEW."Row ID";
 NEW."Outstanding Principal":=coalesce(NEW."Principal Amount"::numeric,0)-NEW."Total Principal Received";
 RETURN NEW;
END $$;
CREATE TRIGGER zz_vc_loan_row BEFORE INSERT OR UPDATE ON public."Loans"
 FOR EACH ROW EXECUTE FUNCTION public.vc_loan_row();

-- Only derived fields may differ on a recorded default charge. The row trigger
-- above always replaces caller-supplied derived values from the ledger.
CREATE OR REPLACE FUNCTION public.default_posting_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE derived text[]:=ARRAY['Principal Paid','Interest Paid','Total Paid','Principal Remaining','Interest Remaining','Amount Remaining','Payment Count','Payment Status','Payment Date'];
BEGIN
 IF starts_with(OLD."Row ID",'df10:') THEN
  IF TG_OP='UPDATE' AND TG_TABLE_NAME='Charges' THEN
   IF (to_jsonb(NEW)-derived) IS NOT DISTINCT FROM (to_jsonb(OLD)-derived) THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'Default posting is immutable';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION public.vc_refresh_charge(p_id text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public."Charges" c SET "Principal Paid"=v.pp,"Interest Paid"=v.ip,"Total Paid"=v.total,
  "Principal Remaining"=v.pr,"Interest Remaining"=v.ir,"Amount Remaining"=v.remaining,
  "Payment Count"=v.n,"Payment Status"=v.status,"Payment Date"=v.paid_date
 FROM (SELECT x."Row ID",v.* FROM public."Charges" x CROSS JOIN LATERAL public.vc_charge_values(x) v WHERE x."Row ID"=p_id) v
 WHERE c."Row ID"=v."Row ID" AND
 ROW(c."Principal Paid",c."Interest Paid",c."Total Paid",c."Principal Remaining",c."Interest Remaining",c."Amount Remaining",c."Payment Count",c."Payment Status",c."Payment Date")
 IS DISTINCT FROM ROW(v.pp,v.ip,v.total,v.pr,v.ir,v.remaining,v.n,v.status,v.paid_date);
END $$;
CREATE FUNCTION public.vc_refresh_loan(p_id text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public."Loans" l SET "Total Interest Received"=v.i,"Total Principal Received"=v.p,
  "Total Amount Received"=v.a,"Outstanding Principal"=coalesce(l."Principal Amount"::numeric,0)-v.p
 FROM (SELECT coalesce(sum("Interest Paid"::numeric),0) i,coalesce(sum("Principal Paid"::numeric),0) p,
  coalesce(sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)),0) a
  FROM public."Repayments" WHERE "Ref Loans"=p_id) v
 WHERE l."Row ID"=p_id AND ROW(l."Total Interest Received",l."Total Principal Received",l."Total Amount Received",l."Outstanding Principal")
 IS DISTINCT FROM ROW(v.i,v.p,v.a,coalesce(l."Principal Amount"::numeric,0)-v.p);
END $$;

-- Serialize source mutations with the existing borrower-scoped payment engine.
-- NOWAIT prevents reversed lock ordering from waiting behind a payment holding
-- the borrower and waiting for this source row. The whole operation rolls back.
CREATE FUNCTION public.vc_lock_parents() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE oldj jsonb:=CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
 newj jsonb:=CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
 b text;
BEGIN
 IF TG_TABLE_NAME='Loans' AND TG_OP='UPDATE' AND
  ROW(oldj->'Ref Borrowers',oldj->'Principal Amount',oldj->'Loan Status') IS NOT DISTINCT FROM
  ROW(newj->'Ref Borrowers',newj->'Principal Amount',newj->'Loan Status') THEN RETURN NEW; END IF;
 FOR b IN
  SELECT DISTINCT borrower FROM (
   SELECT oldj->>'Ref Borrowers' borrower WHERE TG_TABLE_NAME='Loans'
   UNION ALL SELECT newj->>'Ref Borrowers' WHERE TG_TABLE_NAME='Loans'
   UNION ALL SELECT l."Ref Borrowers" FROM public."Loans" l WHERE l."Row ID" IN (oldj->>'Ref Loans',newj->>'Ref Loans')
   UNION ALL SELECT l."Ref Borrowers" FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
    WHERE c."Row ID" IN (oldj->>'Ref Charges',newj->>'Ref Charges')
  ) q WHERE borrower IS NOT NULL ORDER BY borrower
 LOOP
  BEGIN
   PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=b FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'Borrower is busy; sync and retry'; END;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aa_vc_lock BEFORE INSERT OR UPDATE OR DELETE ON public."Repayments" FOR EACH ROW EXECUTE FUNCTION public.vc_lock_parents();
CREATE TRIGGER aa_vc_lock BEFORE INSERT OR UPDATE OR DELETE ON public."Charges" FOR EACH ROW EXECUTE FUNCTION public.vc_lock_parents();
CREATE TRIGGER aa_vc_lock BEFORE INSERT OR UPDATE OR DELETE ON public."Loans" FOR EACH ROW EXECUTE FUNCTION public.vc_lock_parents();

-- Defer parent UPDATEs until the originating row command is finished. Default
-- processing creates repayments inside a BEFORE Loans UPDATE trigger, so an
-- immediate parent UPDATE would otherwise modify the tuple being updated.
CREATE FUNCTION public.vc_repayment_changed() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE k text; o jsonb:=CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
 n jsonb:=CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
BEGIN
 FOR k IN SELECT DISTINCT x FROM unnest(ARRAY[o->>'Ref Charges',n->>'Ref Charges']) x WHERE x IS NOT NULL ORDER BY x LOOP
  PERFORM public.vc_refresh_charge(k);
 END LOOP;
 FOR k IN SELECT DISTINCT x FROM unnest(ARRAY[o->>'Ref Loans',n->>'Ref Loans']) x WHERE x IS NOT NULL ORDER BY x LOOP
  PERFORM public.vc_refresh_loan(k);
 END LOOP;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER vc_repayment_changed AFTER INSERT OR UPDATE OR DELETE ON public."Repayments"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.vc_repayment_changed();

CREATE FUNCTION public.vc_loan_status_changed() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE k text;
BEGIN
 FOR k IN SELECT "Row ID" FROM public."Charges" WHERE "Ref Loans"=NEW."Row ID" ORDER BY "Row ID" LOOP
  PERFORM public.vc_refresh_charge(k);
 END LOOP;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER vc_loan_status_changed AFTER UPDATE ON public."Loans"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 WHEN (OLD."Loan Status" IS DISTINCT FROM NEW."Loan Status") EXECUTE FUNCTION public.vc_loan_status_changed();

-- Authorized derived-only development backfill. Existing business inputs,
-- relationships, keys and financial postings remain unchanged.
UPDATE public."Loans" SET "Total Interest Received"=0;
UPDATE public."Charges" SET "Principal Paid"=0;
