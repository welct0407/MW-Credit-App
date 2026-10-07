-- Preserve legacy child metadata behavior and reject forged initial states.
-- V2 is immutable. No historical records are changed.
CREATE OR REPLACE FUNCTION public.lump_sum_receipt_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=NEW."Ref Borrower" FOR UPDATE;
  IF TG_OP='INSERT' AND NEW."Allocation Method"='Lump Sum' AND NEW."Status" IS DISTINCT FROM 'Processing' THEN
    RAISE EXCEPTION 'New lump-sum receipts must start in Processing; the database assigns Posted';
  END IF;
  IF TG_OP='UPDATE' AND OLD."Allocation Method"='Lump Sum' AND OLD."Status"='Posted' THEN
    IF ROW(NEW."Row ID",NEW."Ref Borrower",NEW."Amount Received",NEW."Payment Date",NEW."Allocation Method",NEW."Ref Target Charge")
       IS DISTINCT FROM ROW(OLD."Row ID",OLD."Ref Borrower",OLD."Amount Received",OLD."Payment Date",OLD."Allocation Method",OLD."Ref Target Charge") THEN
      RAISE EXCEPTION 'Posted lump-sum receipt cannot be changed; use an auditable adjustment';
    END IF;
    NEW."Status":=OLD."Status";
    NEW."Processed At":=OLD."Processed At";
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.lump_sum_child_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE payment_id text; borrower_id text;
BEGIN
  IF TG_OP<>'INSERT' AND starts_with(OLD."Row ID",'ls2:') THEN
    RAISE EXCEPTION 'Database-posted allocation/repayment is immutable; use an auditable adjustment';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  payment_id:=NEW."Ref Payment";
  SELECT "Ref Borrower" INTO borrower_id FROM public."Payments" WHERE "Row ID"=payment_id;
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=borrower_id FOR UPDATE;
  -- A legacy child metadata edit keeps its existing behavior. Only new results
  -- or a reassignment to a finalized receipt are disallowed here.
  IF (TG_OP='INSERT' OR NEW."Ref Payment" IS DISTINCT FROM OLD."Ref Payment") AND EXISTS (
    SELECT 1 FROM public."Payments" p WHERE p."Row ID"=payment_id AND p."Status"='Posted' AND p."Allocation Method"='Lump Sum'
  ) THEN RAISE EXCEPTION 'Cannot add results to a posted lump-sum receipt'; END IF;
  RETURN NEW;
END $$;
