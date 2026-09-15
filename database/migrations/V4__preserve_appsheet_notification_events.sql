-- Preserve the existing AppSheet payment-posted and loan-closed notification path.
-- SQL atomically prepares immutable allocations/ledger; the existing bot finalizes.
-- No tables, columns, historical backfill or notification queue are added.
CREATE OR REPLACE FUNCTION public.lump_sum_receipt_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE prepared boolean;
BEGIN
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=NEW."Ref Borrower" FOR UPDATE;
  IF TG_OP='INSERT' AND NEW."Allocation Method"='Lump Sum' AND NEW."Status" IS DISTINCT FROM 'Processing' THEN
    RAISE EXCEPTION 'New lump-sum receipts must start in Processing';
  END IF;
  IF TG_OP='UPDATE' THEN
    SELECT EXISTS(SELECT 1 FROM public."Payment Allocations" WHERE "Ref Payment"=OLD."Row ID" AND starts_with("Row ID",'ls2:')) INTO prepared;
    IF OLD."Allocation Method"='Lump Sum' AND (OLD."Status"='Posted' OR prepared) THEN
      IF ROW(NEW."Row ID",NEW."Ref Borrower",NEW."Amount Received",NEW."Payment Date",NEW."Allocation Method",NEW."Ref Target Charge")
        IS DISTINCT FROM ROW(OLD."Row ID",OLD."Ref Borrower",OLD."Amount Received",OLD."Payment Date",OLD."Allocation Method",OLD."Ref Target Charge") THEN
        RAISE EXCEPTION 'Prepared or posted lump-sum financial inputs cannot be changed';
      END IF;
      IF OLD."Status"='Posted' THEN NEW."Status":=OLD."Status"; NEW."Processed At":=OLD."Processed At";
      ELSIF NEW."Status"='Posted' THEN
        IF NOT prepared OR NEW."Amount Received"::numeric IS DISTINCT FROM
          (SELECT sum("Allocated Amount"::numeric) FROM public."Payment Allocations" WHERE "Ref Payment"=OLD."Row ID")
          OR NEW."Amount Received"::numeric IS DISTINCT FROM
          (SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric) FROM public."Repayments" WHERE "Ref Payment"=OLD."Row ID")
          OR EXISTS (
            SELECT 1 FROM public."Payment Allocations" a FULL JOIN public."Repayments" r ON r."Ref Payment Allocation"=a."Row ID"
            WHERE (a."Ref Payment"=OLD."Row ID" OR r."Ref Payment"=OLD."Row ID")
              AND (a."Row ID" IS NULL OR r."Row ID" IS NULL OR a."Ref Payment" IS DISTINCT FROM r."Ref Payment"
                OR a."Ref Charge" IS DISTINCT FROM r."Ref Charges" OR a."Allocated Interest" IS DISTINCT FROM r."Interest Paid"
                OR a."Allocated Principal" IS DISTINCT FROM r."Principal Paid" OR a."Allocated Amount"::numeric<=0)) THEN
          RAISE EXCEPTION 'Prepared lump-sum results do not reconcile';
        END IF;
        NEW."Processed At":=clock_timestamp() AT TIME ZONE 'Asia/Bangkok';
      ELSE NEW."Processed At":=OLD."Processed At";
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.lump_sum_child_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE payment_id text; borrower_id text;
BEGIN
  IF TG_OP<>'INSERT' AND starts_with(OLD."Row ID",'ls2:') THEN
    RAISE EXCEPTION 'Database-prepared allocation/repayment is immutable';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  payment_id:=NEW."Ref Payment";
  SELECT "Ref Borrower" INTO borrower_id FROM public."Payments" WHERE "Row ID"=payment_id;
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=borrower_id FOR UPDATE;
  IF (TG_OP='INSERT' OR NEW."Ref Payment" IS DISTINCT FROM OLD."Ref Payment") AND (
    EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"=payment_id AND "Status"='Posted' AND "Allocation Method"='Lump Sum')
    OR (pg_trigger_depth()=1 AND EXISTS(SELECT 1 FROM public."Payment Allocations" WHERE "Ref Payment"=payment_id AND starts_with("Row ID",'ls2:')))
  ) THEN RAISE EXCEPTION 'Cannot add results to a prepared or posted lump-sum receipt'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.process_lump_sum() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  amount numeric := NEW."Amount Received"::numeric;
  today_bangkok date := (statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date;
  posted numeric;
BEGIN
  IF NEW."Allocation Method" IS DISTINCT FROM 'Lump Sum' OR NEW."Status" IS DISTINCT FROM 'Processing' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD."Status" = 'Posted' THEN RETURN NULL; END IF;
  -- Prepared results survive a retry; AppSheet owns final status and closure events.
  IF EXISTS (SELECT 1 FROM public."Payment Allocations" WHERE "Ref Payment"=NEW."Row ID" AND starts_with("Row ID",'ls2:')) THEN RETURN NULL; END IF;
  IF amount IS NULL OR amount <= 0 OR amount <> trunc(amount) THEN
    RAISE EXCEPTION 'Lump sum requires a positive whole-baht amount';
  END IF;
  IF NEW."Payment Date" IS NULL OR NEW."Payment Date" > today_bangkok OR NEW."Ref Borrower" IS NULL THEN
    RAISE EXCEPTION 'Lump sum requires a borrower and payment date no later than today';
  END IF;
  IF EXISTS (SELECT 1 FROM public."Payments" p WHERE p."Ref Borrower" = NEW."Ref Borrower"
             AND p."Row ID" <> NEW."Row ID" AND p."Status" IN ('Processing','Error')) THEN
    RAISE EXCEPTION 'Another receipt for this borrower needs reconciliation before a lump sum';
  END IF;
  IF EXISTS (SELECT 1 FROM public."Payment Allocations" WHERE "Ref Payment" = NEW."Row ID")
     OR EXISTS (SELECT 1 FROM public."Repayments" WHERE "Ref Payment" = NEW."Row ID") THEN
    RAISE EXCEPTION 'Existing receipt results require reconciliation; automatic reallocation refused';
  END IF;

  -- Lock eligible source rows before reading balances. Stable key order avoids
  -- lock-order inversions between simultaneous receipts for multiple loans.
  PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers" = NEW."Ref Borrower" ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
  PERFORM 1 FROM public."Charges" c JOIN public."Loans" l ON l."Row ID" = c."Ref Loans"
    WHERE l."Ref Borrowers" = NEW."Ref Borrower" AND c."Charge Date" <= NEW."Payment Date"
    ORDER BY c."Row ID" COLLATE "C" FOR UPDATE OF c;

  IF EXISTS (
    SELECT 1 FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
    LEFT JOIN LATERAL (SELECT coalesce(sum(r."Principal Paid"::numeric),0) p,
      coalesce(sum(r."Interest Paid"::numeric),0) i FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID") paid ON true
    WHERE l."Ref Borrowers"=NEW."Ref Borrower" AND c."Charge Date"<=NEW."Payment Date"
      AND (c."Principal Due" IS NULL OR c."Interest Due" IS NULL
           OR c."Principal Due"::numeric-paid.p < 0 OR c."Interest Due"::numeric-paid.i < 0)
  ) THEN RAISE EXCEPTION 'Eligible charge has missing or negative component balance; reconcile it first'; END IF;

  WITH balances AS (
    SELECT c."Row ID" charge, c."Charge Date" AS charge_day,
      c."Principal Due"::numeric-paid.p principal,
      c."Interest Due"::numeric-paid.i interest
    FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
    LEFT JOIN LATERAL (SELECT coalesce(sum(r."Principal Paid"::numeric),0) p,
      coalesce(sum(r."Interest Paid"::numeric),0) i FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID") paid ON true
    WHERE l."Ref Borrowers"=NEW."Ref Borrower" AND c."Charge Date"<=NEW."Payment Date"
  ), ordered AS (
    SELECT *, row_number() OVER w AS ord,
      coalesce(sum(principal+interest) OVER (ORDER BY charge_day DESC,charge COLLATE "C" DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) previous
    FROM balances WHERE principal+interest>0 WINDOW w AS (ORDER BY charge_day DESC,charge COLLATE "C" DESC)
  ), plan AS (
    SELECT *, least(principal+interest,greatest(0,amount-previous)) allocated FROM ordered
  )
  INSERT INTO public."Payment Allocations" ("Row ID","Ref Payment","Ref Charge","Charge Date Snapshot",
    "Charge Row Number Snapshot","Interest Remaining Snapshot","Principal Remaining Snapshot","Amount Remaining Snapshot",
    "Allocation Order","Allocated Interest","Allocated Principal","Allocated Amount","Created At")
  SELECT 'ls2:'||NEW."Row ID"||':'||charge, NEW."Row ID",charge,charge_day,
    -ord::integer,interest::money,principal::money,(interest+principal)::money,
    ord::integer,least(interest,allocated)::money,(allocated-least(interest,allocated))::money,allocated::money,
    statement_timestamp() AT TIME ZONE 'Asia/Bangkok'
  FROM plan WHERE allocated>0;

  SELECT coalesce(sum("Allocated Amount"::numeric),0) INTO posted FROM public."Payment Allocations" WHERE "Ref Payment"=NEW."Row ID";
  IF posted <> amount THEN RAISE EXCEPTION 'Lump sum exceeds the current eligible outstanding balance'; END IF;

  INSERT INTO public."Repayments" ("Row ID","Payment Date","Principal Paid","Interest Paid","Notes",
    "Ref Loans","Ref Charges","Created By","Ref Payment","Ref Payment Allocation")
  SELECT a."Row ID",NEW."Payment Date",a."Allocated Principal",a."Allocated Interest",NEW."Notes",
    c."Ref Loans",a."Ref Charge",NEW."Created By",NEW."Row ID",a."Row ID"
  FROM public."Payment Allocations" a JOIN public."Charges" c ON c."Row ID"=a."Ref Charge"
  WHERE a."Ref Payment"=NEW."Row ID";
  SELECT coalesce(sum("Principal Paid"::numeric+"Interest Paid"::numeric),0) INTO posted
    FROM public."Repayments" WHERE "Ref Payment"=NEW."Row ID";
  IF posted <> amount THEN RAISE EXCEPTION 'Lump-sum ledger reconciliation failed'; END IF;

  -- Keep Processing until the existing AppSheet bot finalizes the receipt.
  -- That AppSheet update and its loan-closure action retain notification events.
  RETURN NULL;
END $$;
