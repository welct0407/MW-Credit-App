-- Owner-approved nullable command target; no historical backfill.
ALTER TABLE public."Payments" ADD COLUMN "Ref Target Loan" text
  REFERENCES public."Loans"("Row ID");
CREATE INDEX payments_target_loan_idx ON public."Payments"("Ref Target Loan")
  WHERE "Ref Target Loan" IS NOT NULL;
COMMENT ON COLUMN public."Payments"."Ref Target Loan" IS
  'Loan Close command target. AppSheet submits the loan; SQL prepares final charges and computes the receipt before unified posting. NULL for other methods and historical receipts.';

CREATE FUNCTION public.prepare_loan_close() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE l public."Loans"%ROWTYPE; today date:=(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date;
  target text; today_count integer; latest date; interest numeric:=0; outstanding numeric;
  scheduled numeric; missing numeric; total numeric;
BEGIN
  IF TG_OP='UPDATE' AND NEW."Ref Target Loan" IS DISTINCT FROM OLD."Ref Target Loan"
    AND (OLD."Status"='Posted' OR EXISTS(SELECT 1 FROM public."Payment Allocations" WHERE "Ref Payment"=OLD."Row ID")
      OR EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Payment"=OLD."Row ID")) THEN
    RAISE EXCEPTION 'Prepared or posted payment target loan cannot be changed';
  END IF;
  IF NEW."Ref Target Loan" IS NULL THEN RETURN NEW; END IF;
  IF NEW."Allocation Method" IS DISTINCT FROM 'Loan Close' THEN
    RAISE EXCEPTION 'Target loan is only valid for Loan Close';
  END IF;
  IF TG_OP='UPDATE' AND OLD."Status"='Posted' THEN RETURN NEW; END IF;
  IF NEW."Status" IS DISTINCT FROM 'Processing' THEN
    IF TG_OP='INSERT' THEN RAISE EXCEPTION 'Loan Close command must start in Processing'; END IF;
    RETURN NEW;
  END IF;
  IF NEW."Payment Date" IS DISTINCT FROM today THEN
    RAISE EXCEPTION 'Loan Close request date is stale; sync and confirm again';
  END IF;
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=NEW."Ref Borrower" FOR UPDATE;
  SELECT * INTO l FROM public."Loans" WHERE "Row ID"=NEW."Ref Target Loan" FOR UPDATE;
  IF NOT FOUND OR l."Ref Borrowers" IS DISTINCT FROM NEW."Ref Borrower" THEN
    RAISE EXCEPTION 'Target loan must belong to the payment borrower';
  END IF;
  IF l."Loan Status" IS DISTINCT FROM 'ยังไม่ปิดยอด' OR l."Loan Type" IS DISTINCT FROM 'ดอกเบี้ยรายวัน'
    OR NOT coalesce(l."Auto Charge Enabled",false) THEN
    RAISE EXCEPTION 'Loan Close requires an open auto-enabled daily-interest loan';
  END IF;
  IF l."Loan Date" IS NULL OR l."Loan Date">today OR l."Current Daily Interest" IS NULL
    OR l."Current Daily Interest"::numeric<0 OR l."Principal Amount" IS NULL THEN
    RAISE EXCEPTION 'Loan Close requires valid loan date, principal and daily interest';
  END IF;
  PERFORM 1 FROM public."Charges" WHERE "Ref Loans"=l."Row ID" ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public."Charges" c
    WHERE c."Ref Loans"=l."Row ID" AND (c."Principal Due" IS NULL OR c."Interest Due" IS NULL
      OR c."Principal Due"::numeric < (SELECT coalesce(sum(r."Principal Paid"::numeric),0) FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID")
      OR c."Interest Due"::numeric < (SELECT coalesce(sum(r."Interest Paid"::numeric),0) FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID"))) THEN
    RAISE EXCEPTION 'Loan charge components require reconciliation before closing';
  END IF;
  SELECT l."Principal Amount"::numeric-coalesce(sum("Principal Paid"::numeric),0) INTO outstanding
    FROM public."Repayments" WHERE "Ref Loans"=l."Row ID";
  IF outstanding IS NULL OR outstanding<=0 THEN RAISE EXCEPTION 'Loan has no outstanding principal to close'; END IF;
  SELECT coalesce(sum(c."Principal Due"::numeric -
    (SELECT coalesce(sum(r."Principal Paid"::numeric),0) FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID")),0)
    INTO scheduled FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID";
  missing:=outstanding-scheduled;
  IF missing<0 THEN RAISE EXCEPTION 'Principal already due exceeds outstanding loan principal'; END IF;
  SELECT count(*),min("Row ID") INTO today_count,target FROM public."Charges"
    WHERE "Ref Loans"=l."Row ID" AND "Charge Date"=today;
  IF today_count>1 THEN RAISE EXCEPTION 'Multiple charges today require reconciliation before closing'; END IF;
  IF today_count=0 THEN
    SELECT max("Charge Date") INTO latest FROM public."Charges" WHERE "Ref Loans"=l."Row ID";
    interest:=l."Current Daily Interest"::numeric*greatest(0,today-coalesce(latest,l."Loan Date"));
    IF missing+interest>0 THEN
      target:='lc7:'||length(l."Row ID")||':'||l."Row ID"||':'||today::text;
      -- Reserved lc7: rows are final charges, never first-day net-off receipts.
      INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes")
        VALUES(target,l."Row ID",today,missing::money,interest::money,'Final charge prepared by Loan Close');
    END IF;
  ELSIF missing>0 THEN
    UPDATE public."Charges" SET "Principal Due"=("Principal Due"::numeric+missing)::money WHERE "Row ID"=target;
  END IF;
  SELECT sum(c."Principal Due"::numeric+c."Interest Due"::numeric-
    (SELECT coalesce(sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric),0) FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID"))
    INTO total FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID";
  IF total IS NULL OR total<=0 OR total<>trunc(total) THEN
    RAISE EXCEPTION 'Final receipt must be a positive whole-baht amount';
  END IF;
  IF target IS NULL THEN
    SELECT "Row ID" INTO target FROM public."Charges" WHERE "Ref Loans"=l."Row ID"
      ORDER BY "Charge Date" DESC,"Row ID" COLLATE "C" DESC LIMIT 1;
  END IF;
  NEW."Ref Target Charge":=target;
  NEW."Amount Received":=total::money;
  RETURN NEW;
END $$;

-- Runs before lump_sum_receipt_guard; the existing AFTER trigger then posts.
CREATE TRIGGER close_loan_request BEFORE INSERT OR UPDATE ON public."Payments"
  FOR EACH ROW EXECUTE FUNCTION public.prepare_loan_close();

CREATE OR REPLACE FUNCTION public.first_day_charge_trigger() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT starts_with(NEW."Row ID",'lc7:') THEN PERFORM public.first_day_receipt(NEW."Row ID"); END IF;
  RETURN NULL;
END $$;
