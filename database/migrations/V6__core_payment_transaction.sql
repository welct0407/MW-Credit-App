-- Phases 1-3. Apply only during the documented AppSheet development cutover.
-- No historical posting/backfill. Owner approved the one nullable closing Ref.
ALTER TABLE public."Loans" ADD COLUMN "Ref Closing Payment" text
  REFERENCES public."Payments"("Row ID");
CREATE INDEX loans_closing_payment_idx ON public."Loans"("Ref Closing Payment")
  WHERE "Ref Closing Payment" IS NOT NULL;
COMMENT ON COLUMN public."Loans"."Ref Closing Payment" IS
  'Payment that changed this loan from open to closed. SQL-owned; NULL for pre-migration or non-payment closure. No historical inference/backfill.';

CREATE FUNCTION public.payment_charge_balances(p_id text)
RETURNS TABLE(charge text, loan text, charge_day date, principal numeric, interest numeric)
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
  SELECT c."Row ID",c."Ref Loans",c."Charge Date",
    c."Principal Due"::numeric-paid.p,c."Interest Due"::numeric-paid.i
  FROM public."Payments" p
  JOIN public."Loans" l ON l."Ref Borrowers"=p."Ref Borrower"
  JOIN public."Charges" c ON c."Ref Loans"=l."Row ID"
  LEFT JOIN public."Charges" target ON target."Row ID"=p."Ref Target Charge"
  CROSS JOIN LATERAL (
    SELECT coalesce(sum(r."Principal Paid"::numeric),0) p,
           coalesce(sum(r."Interest Paid"::numeric),0) i
    FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID"
  ) paid
  WHERE p."Row ID"=p_id AND CASE
    WHEN p."Allocation Method" IN ('Single Full','Single Partial','First-day Auto')
      THEN c."Row ID"=p."Ref Target Charge"
    WHEN p."Allocation Method"='Loan Close' THEN c."Ref Loans"=target."Ref Loans"
    WHEN p."Allocation Method" IN ('Receive All','Lump Sum') THEN c."Charge Date"<=p."Payment Date"
    ELSE false END;
$$;

CREATE FUNCTION public.close_payment_loans(p_id text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  UPDATE public."Loans" l SET "Loan Status"='ปิดยอดแล้ว',
    "Close Date"=(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date,
    "Closed By"=p."Created By", "Ref Closing Payment"=p."Row ID"
  FROM public."Payments" p
  WHERE p."Row ID"=p_id AND l."Loan Status"='ยังไม่ปิดยอด'
    AND l."Row ID" IN (SELECT r."Ref Loans" FROM public."Repayments" r WHERE r."Ref Payment"=p_id)
    AND l."Principal Amount"::numeric <=
      (SELECT coalesce(sum(r."Principal Paid"::numeric),0) FROM public."Repayments" r WHERE r."Ref Loans"=l."Row ID")
    AND NOT EXISTS (
      SELECT 1 FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID"
      AND (c."Principal Due" IS NULL OR c."Interest Due" IS NULL OR
        c."Principal Due"::numeric+c."Interest Due"::numeric >
          (SELECT coalesce(sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric),0)
           FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID")));
END $$;

CREATE FUNCTION public.post_payment(p_id text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE p public."Payments"%ROWTYPE; amount numeric; available numeric;
BEGIN
  SELECT * INTO STRICT p FROM public."Payments" WHERE "Row ID"=p_id;
  IF p."Status"='Posted' THEN RETURN; END IF;
  IF p."Status" IS DISTINCT FROM 'Processing' THEN
    RAISE EXCEPTION 'Payment must be Processing before posting';
  END IF;
  IF p."Allocation Method" IS NULL OR p."Allocation Method" NOT IN
    ('Single Full','Single Partial','Receive All','Lump Sum','First-day Auto','Loan Close') THEN
    RAISE EXCEPTION 'Unsupported payment allocation method';
  END IF;
  amount:=p."Amount Received"::numeric;
  IF amount IS NULL OR amount<=0 OR amount<>trunc(amount) THEN
    RAISE EXCEPTION 'Payment requires a positive whole-baht amount';
  END IF;
  IF p."Payment Date" IS NULL OR p."Payment Date"> (statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date THEN
    RAISE EXCEPTION 'Payment date must be present and no later than today';
  END IF;
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=p."Ref Borrower" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment borrower does not exist'; END IF;
  -- The receipt BEFORE trigger acquires this same lock before INSERT. Re-read
  -- after acquisition for callers invoking the business function directly.
  SELECT * INTO STRICT p FROM public."Payments" WHERE "Row ID"=p_id FOR UPDATE;
  IF p."Status"='Posted' THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public."Payments" q WHERE q."Ref Borrower"=p."Ref Borrower"
    AND q."Row ID"<>p_id AND q."Status" IN ('Processing','Error')) THEN
    RAISE EXCEPTION 'Another receipt for this borrower requires reconciliation';
  END IF;
  IF EXISTS (SELECT 1 FROM public."Payment Allocations" WHERE "Ref Payment"=p_id)
    OR EXISTS (SELECT 1 FROM public."Repayments" WHERE "Ref Payment"=p_id) THEN
    RAISE EXCEPTION 'Existing receipt results require reconciliation; reallocation refused';
  END IF;
  PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers"=p."Ref Borrower"
    ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
  PERFORM 1 FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
    WHERE l."Ref Borrowers"=p."Ref Borrower" ORDER BY c."Row ID" COLLATE "C" FOR UPDATE OF c;
  IF p."Allocation Method" IN ('Single Full','Single Partial','First-day Auto','Loan Close') AND NOT EXISTS (
    SELECT 1 FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
    WHERE c."Row ID"=p."Ref Target Charge" AND l."Ref Borrowers"=p."Ref Borrower") THEN
    RAISE EXCEPTION 'Target charge must belong to the payment borrower';
  END IF;
  IF p."Allocation Method"='First-day Auto' AND NOT EXISTS (
    SELECT 1 FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
    WHERE c."Row ID"=p."Ref Target Charge" AND l."Auto Charge Enabled"
      AND l."Loan Type" IN ('ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน')
      AND c."Charge Date"=l."Loan Date" AND p."Payment Date"=l."Loan Date"
      AND p."Payment Method"='Net-off at Disbursement') THEN
    RAISE EXCEPTION 'First-day receipt must match an eligible loan-date net-off';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_charge_balances(p_id)
    WHERE principal IS NULL OR interest IS NULL OR principal<0 OR interest<0) THEN
    RAISE EXCEPTION 'Eligible charge has missing or negative components; reconcile first';
  END IF;
  SELECT coalesce(sum(principal+interest),0) INTO available FROM public.payment_charge_balances(p_id);
  IF amount>available OR (p."Allocation Method" IN ('Single Full','Receive All','First-day Auto','Loan Close') AND amount<>available) THEN
    RAISE EXCEPTION 'Payment does not match the current eligible balance';
  END IF;
  WITH ordered AS (
    SELECT *,row_number() OVER w ord,
      coalesce(sum(principal+interest) OVER(ORDER BY charge_day DESC,charge COLLATE "C" DESC
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) previous
    FROM public.payment_charge_balances(p_id) WHERE principal+interest>0
    WINDOW w AS(ORDER BY charge_day DESC,charge COLLATE "C" DESC)
  ), plan AS (
    SELECT *,least(principal+interest,greatest(0,amount-previous)) allocated FROM ordered
  )
  INSERT INTO public."Payment Allocations"("Row ID","Ref Payment","Ref Charge","Charge Date Snapshot",
    "Charge Row Number Snapshot","Interest Remaining Snapshot","Principal Remaining Snapshot","Amount Remaining Snapshot",
    "Allocation Order","Allocated Interest","Allocated Principal","Allocated Amount","Created At")
  SELECT 'pc6:'||length(p_id)||':'||p_id||':'||charge,p_id,charge,charge_day,
    -ord::integer,interest::money,principal::money,(interest+principal)::money,
    ord::integer,least(interest,allocated)::money,(allocated-least(interest,allocated))::money,allocated::money,
    statement_timestamp() AT TIME ZONE 'Asia/Bangkok' FROM plan WHERE allocated>0;
  INSERT INTO public."Repayments"("Row ID","Payment Date","Principal Paid","Interest Paid","Notes",
    "Ref Loans","Ref Charges","Created By","Ref Payment","Ref Payment Allocation")
  SELECT a."Row ID",p."Payment Date",a."Allocated Principal",a."Allocated Interest",p."Notes",
    c."Ref Loans",a."Ref Charge",p."Created By",p_id,a."Row ID"
  FROM public."Payment Allocations" a JOIN public."Charges" c ON c."Row ID"=a."Ref Charge"
  WHERE a."Ref Payment"=p_id;
  IF amount IS DISTINCT FROM (SELECT sum("Allocated Amount"::numeric) FROM public."Payment Allocations" WHERE "Ref Payment"=p_id)
    OR amount IS DISTINCT FROM (SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric) FROM public."Repayments" WHERE "Ref Payment"=p_id) THEN
    RAISE EXCEPTION 'Payment ledger reconciliation failed';
  END IF;
  PERFORM public.close_payment_loans(p_id);
  UPDATE public."Payments" SET "Status"='Posted',"Processed At"=clock_timestamp() AT TIME ZONE 'Asia/Bangkok'
    WHERE "Row ID"=p_id;
END $$;

-- Replace routing, retaining the historical function name for recovery clarity.
CREATE OR REPLACE FUNCTION public.process_lump_sum() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW."Status"='Processing' THEN PERFORM public.post_payment(NEW."Row ID"); END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.lump_sum_receipt_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE prepared boolean;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD."Status"='Posted' OR EXISTS(SELECT 1 FROM public."Payment Allocations" WHERE "Ref Payment"=OLD."Row ID")
      OR EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Payment"=OLD."Row ID") THEN
      RAISE EXCEPTION 'Posted or prepared payment cannot be deleted; use an auditable adjustment';
    END IF;
    RETURN OLD;
  END IF;
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=NEW."Ref Borrower" FOR UPDATE;
  IF TG_OP='INSERT' AND NEW."Status" IS DISTINCT FROM 'Processing' THEN
    RAISE EXCEPTION 'New payments must start in Processing';
  END IF;
  IF TG_OP='UPDATE' THEN
    SELECT EXISTS(SELECT 1 FROM public."Payment Allocations" WHERE "Ref Payment"=OLD."Row ID")
      OR EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Payment"=OLD."Row ID") INTO prepared;
    IF OLD."Status"='Posted' OR prepared THEN
      IF ROW(NEW."Row ID",NEW."Ref Borrower",NEW."Amount Received",NEW."Payment Date",NEW."Allocation Method",NEW."Ref Target Charge")
        IS DISTINCT FROM ROW(OLD."Row ID",OLD."Ref Borrower",OLD."Amount Received",OLD."Payment Date",OLD."Allocation Method",OLD."Ref Target Charge") THEN
        RAISE EXCEPTION 'Prepared or posted payment financial inputs cannot be changed';
      END IF;
    END IF;
    IF OLD."Status"='Posted' THEN NEW."Status":=OLD."Status"; NEW."Processed At":=OLD."Processed At";
    ELSIF NEW."Status"='Posted' AND (NOT prepared OR
      NEW."Amount Received"::numeric IS DISTINCT FROM (SELECT sum("Allocated Amount"::numeric) FROM public."Payment Allocations" WHERE "Ref Payment"=OLD."Row ID") OR
      NEW."Amount Received"::numeric IS DISTINCT FROM (SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric) FROM public."Repayments" WHERE "Ref Payment"=OLD."Row ID") OR
      EXISTS(SELECT 1 FROM public."Payment Allocations" a FULL JOIN public."Repayments" r ON r."Ref Payment Allocation"=a."Row ID"
        WHERE (a."Ref Payment"=OLD."Row ID" OR r."Ref Payment"=OLD."Row ID") AND
          (a."Row ID" IS NULL OR r."Row ID" IS NULL OR a."Ref Payment" IS DISTINCT FROM r."Ref Payment"
           OR a."Ref Charge" IS DISTINCT FROM r."Ref Charges" OR a."Allocated Interest" IS DISTINCT FROM r."Interest Paid"
           OR a."Allocated Principal" IS DISTINCT FROM r."Principal Paid" OR a."Allocated Amount"::numeric<=0
           OR a."Allocated Interest"::numeric<0 OR a."Allocated Principal"::numeric<0
           OR a."Allocated Amount"::numeric<>a."Allocated Interest"::numeric+a."Allocated Principal"::numeric))) THEN
      RAISE EXCEPTION 'Cannot mark an unreconciled payment Posted';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_delete_guard BEFORE DELETE ON public."Payments"
  FOR EACH ROW EXECUTE FUNCTION public.lump_sum_receipt_guard();

CREATE FUNCTION public.closing_payment_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW."Ref Closing Payment" IS NOT NULL THEN
    RAISE EXCEPTION 'Closing payment is assigned by the payment engine';
  END IF;
  IF TG_OP='UPDATE' AND NEW."Ref Closing Payment" IS DISTINCT FROM OLD."Ref Closing Payment" THEN
    IF pg_trigger_depth()<2 OR OLD."Ref Closing Payment" IS NOT NULL OR OLD."Loan Status" IS DISTINCT FROM 'ยังไม่ปิดยอด'
      OR NEW."Loan Status" IS DISTINCT FROM 'ปิดยอดแล้ว' THEN
      RAISE EXCEPTION 'Closing payment is assigned by the payment engine';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER closing_payment_guard BEFORE INSERT OR UPDATE ON public."Loans"
  FOR EACH ROW EXECUTE FUNCTION public.closing_payment_guard();

CREATE OR REPLACE FUNCTION public.lump_sum_child_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE payment_id text; borrower_id text;
BEGIN
  IF TG_OP<>'INSERT' AND (starts_with(OLD."Row ID",'ls2:') OR starts_with(OLD."Row ID",'pc6:')) THEN
    RAISE EXCEPTION 'Database-posted allocation/repayment is immutable';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  payment_id:=NEW."Ref Payment";
  SELECT "Ref Borrower" INTO borrower_id FROM public."Payments" WHERE "Row ID"=payment_id;
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=borrower_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"=payment_id AND "Status"='Posted') THEN
    IF TG_OP='INSERT' OR NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'Cannot change results of a posted payment';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.first_day_receipt(p_charge text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE c public."Charges"%ROWTYPE; l public."Loans"%ROWTYPE; remaining numeric;
BEGIN
  SELECT * INTO STRICT c FROM public."Charges" WHERE "Row ID"=p_charge;
  SELECT * INTO STRICT l FROM public."Loans" WHERE "Row ID"=c."Ref Loans";
  IF NOT coalesce(l."Auto Charge Enabled",false) OR l."Loan Type" IS NULL OR l."Loan Type" NOT IN ('ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน')
    OR c."Charge Date" IS DISTINCT FROM l."Loan Date" THEN RETURN; END IF;
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=l."Ref Borrowers" FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Charges"=p_charge)
    OR EXISTS(SELECT 1 FROM public."Payments" WHERE "Ref Target Charge"=p_charge AND "Allocation Method"='First-day Auto') THEN RETURN; END IF;
  remaining:=c."Principal Due"::numeric+c."Interest Due"::numeric;
  IF remaining IS NULL OR remaining<=0 THEN RETURN; END IF;
  INSERT INTO public."Payments"("Row ID","Status","Ref Borrower","Ref Target Charge","Amount Received",
    "Payment Date","Payment Method","Allocation Method","Notes","Created By","Created At")
  VALUES('fd6:'||p_charge,'Processing',l."Ref Borrowers",p_charge,remaining::money,l."Loan Date",
    'Net-off at Disbursement','First-day Auto',c."Notes",l."Created By",statement_timestamp() AT TIME ZONE 'Asia/Bangkok');
END $$;

CREATE FUNCTION public.create_first_day_charge(p_loan text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE l public."Loans"%ROWTYPE; principal numeric:=0; interest numeric; days integer;
BEGIN
  SELECT * INTO STRICT l FROM public."Loans" WHERE "Row ID"=p_loan;
  IF NOT coalesce(l."Auto Charge Enabled",false) OR NOT coalesce((
    (l."Loan Type"='ดอกเบี้ยรายวัน' AND l."Current Daily Interest"::numeric>0) OR
    (l."Loan Type"='ผ่อนชำระรายวัน' AND l."Daily Payment Amount"::numeric>0)),false) THEN RETURN; END IF;
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=l."Ref Borrowers" FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"=p_loan AND "Charge Date"=l."Loan Date") THEN RETURN; END IF;
  IF l."Loan Date" IS NULL THEN RAISE EXCEPTION 'First-day charge requires Loan Date'; END IF;
  IF l."Loan Type"='ผ่อนชำระรายวัน' THEN
    days:=l."Due Date"-l."Loan Date"+1;
    IF days IS NULL OR days<=0 OR l."Principal Amount" IS NULL OR l."Principal Amount"::numeric<0 THEN
      RAISE EXCEPTION 'Invalid installment principal or inclusive loan term';
    END IF;
    principal:=floor(l."Principal Amount"::numeric/days)+CASE WHEN mod(l."Principal Amount"::numeric,days)>0 THEN 1 ELSE 0 END;
    interest:=l."Daily Payment Amount"::numeric-principal+coalesce(l."Transfer Fee"::numeric,0);
  ELSE interest:=l."Current Daily Interest"::numeric+coalesce(l."Transfer Fee"::numeric,0);
  END IF;
  IF interest IS NULL OR interest<0 THEN RAISE EXCEPTION 'Invalid first-day interest component'; END IF;
  INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
    VALUES('fd6:'||p_loan,p_loan,l."Loan Date",principal::money,interest::money);
END $$;

CREATE FUNCTION public.first_day_loan_trigger() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN PERFORM public.create_first_day_charge(NEW."Row ID"); RETURN NULL; END $$;
CREATE FUNCTION public.first_day_charge_trigger() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN PERFORM public.first_day_receipt(NEW."Row ID"); RETURN NULL; END $$;
CREATE TRIGGER first_day_charge AFTER INSERT ON public."Loans"
  FOR EACH ROW EXECUTE FUNCTION public.first_day_loan_trigger();
CREATE TRIGGER first_day_receipt AFTER INSERT ON public."Charges"
  FOR EACH ROW EXECUTE FUNCTION public.first_day_charge_trigger();
