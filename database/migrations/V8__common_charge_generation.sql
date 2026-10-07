-- Approved manual command field. Blank on existing loans; no backfill.
ALTER TABLE public."Loans" ADD COLUMN "Charge Generation Request" text;
COMMENT ON COLUMN public."Loans"."Charge Generation Request" IS
  'Manual generation command: Bangkok YYYY-MM-DD|unique token. Hidden and user-read-only in AppSheet; SQL derives charge components. Latest command only, not a financial ledger.';

CREATE FUNCTION public.generate_loan_charge(p_loan text,p_business_date date,p_manual_request boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE l public."Loans"%ROWTYPE; borrower text; existing text; latest date; anchor date;
  principal numeric:=0; interest numeric:=0; days integer; elapsed integer; remainder numeric;
  charge_id text;
BEGIN
  IF p_business_date IS NULL THEN RAISE EXCEPTION 'Charge generation requires a business date'; END IF;
  SELECT "Ref Borrowers" INTO borrower FROM public."Loans" WHERE "Row ID"=p_loan;
  IF NOT FOUND THEN RAISE EXCEPTION 'Charge generation loan does not exist'; END IF;
  -- Same lock order as payment posting and Close Loan.
  IF p_manual_request THEN
    -- AppSheet already holds the updated loan row. Never wait behind a payment
    -- holding its borrower lock and waiting for that loan: fail for a safe retry.
    BEGIN
      PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=borrower FOR UPDATE NOWAIT;
    EXCEPTION WHEN lock_not_available THEN
      RAISE EXCEPTION 'Loan is busy; sync and request charge generation again';
    END;
  ELSE
    PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=borrower FOR UPDATE;
  END IF;
  SELECT * INTO STRICT l FROM public."Loans" WHERE "Row ID"=p_loan FOR UPDATE;
  IF l."Ref Borrowers" IS DISTINCT FROM borrower THEN RAISE EXCEPTION 'Loan borrower changed; retry generation'; END IF;
  SELECT min("Row ID") INTO existing FROM public."Charges"
    WHERE "Ref Loans"=p_loan AND "Charge Date"=p_business_date;
  IF existing IS NOT NULL THEN RETURN NULL; END IF;
  IF NOT coalesce(l."Auto Charge Enabled",false) OR l."Loan Status" IS DISTINCT FROM 'ยังไม่ปิดยอด'
    OR l."Loan Date" IS NULL OR p_business_date<l."Loan Date" THEN RETURN NULL; END IF;
  PERFORM 1 FROM public."Charges" WHERE "Ref Loans"=p_loan ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
  IF l."Loan Type"='ดอกเบี้ยรายวัน' THEN
    anchor:=coalesce(l."Interest Schedule Anchor Date",l."Loan Date");
    IF NOT coalesce(l."Current Daily Interest"::numeric>0,false) OR p_business_date<=anchor
      OR NOT coalesce(l."Interest Payment Interval">=1,false) THEN RETURN NULL; END IF;
    IF mod(p_business_date-anchor,l."Interest Payment Interval")<>0 THEN RETURN NULL; END IF;
    -- AppSheet Last Interest Charge Date excludes future charges.
    SELECT max("Charge Date") INTO latest FROM public."Charges"
      WHERE "Ref Loans"=p_loan AND "Charge Date"<=p_business_date;
    interest:=l."Current Daily Interest"::numeric*greatest(0,p_business_date-coalesce(latest,l."Loan Date"));
    IF interest<=0 THEN RETURN NULL; END IF;
  ELSIF l."Loan Type"='กำหนดวันชำระ' THEN
    IF l."Due Date" IS DISTINCT FROM p_business_date THEN RETURN NULL; END IF;
    SELECT l."Principal Amount"::numeric-coalesce(sum("Principal Paid"::numeric),0)
      INTO principal FROM public."Repayments" WHERE "Ref Loans"=p_loan;
    interest:=l."Fixed Interest"::numeric;
  ELSIF l."Loan Type"='ผ่อนชำระรายวัน' THEN
    IF p_business_date<=l."Loan Date" OR l."Due Date" IS NULL OR p_business_date>l."Due Date"
      OR NOT coalesce(l."Interest Payment Interval">=1,false) THEN RETURN NULL; END IF;
    IF mod(p_business_date-l."Loan Date",l."Interest Payment Interval")<>0
      AND p_business_date<>l."Due Date" THEN RETURN NULL; END IF;
    -- Preserve the existing installment MAX(charge date) rule, including future rows.
    SELECT max("Charge Date") INTO latest FROM public."Charges" WHERE "Ref Loans"=p_loan;
    IF latest IS NULL THEN RETURN NULL; END IF;
    days:=l."Due Date"-l."Loan Date"+1; elapsed:=p_business_date-latest;
    IF days<=0 OR elapsed<=0 THEN RAISE EXCEPTION 'Installment schedule requires an earlier charge date'; END IF;
    remainder:=mod(l."Principal Amount"::numeric,days);
    principal:=floor(l."Principal Amount"::numeric/days)*elapsed+
      greatest(0,least(p_business_date-l."Loan Date"+1,remainder)-(latest-l."Loan Date"+1));
    interest:=l."Daily Payment Amount"::numeric*elapsed-principal;
  ELSE RETURN NULL;
  END IF;
  IF principal IS NULL OR interest IS NULL OR principal<0 OR interest<0 THEN
    RAISE EXCEPTION 'Generated charge requires valid nonnegative principal and interest';
  END IF;
  charge_id:='cg8:'||length(p_loan)||':'||p_loan||':'||p_business_date::text;
  INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
    VALUES(charge_id,p_loan,p_business_date,principal::money,interest::money);
  RETURN charge_id;
END $$;

CREATE FUNCTION public.generate_due_charges(p_business_date date,p_loans text[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE l record; generated integer:=0; result text;
BEGIN
  IF p_business_date IS NULL THEN RAISE EXCEPTION 'Charge generation requires a business date'; END IF;
  -- One transaction. Ordered borrower locks avoid cross-loan deadlocks in bulk runs.
  FOR l IN SELECT "Row ID" FROM public."Loans"
    WHERE "Auto Charge Enabled" AND "Loan Status"='ยังไม่ปิดยอด'
      AND (p_loans IS NULL OR "Row ID"=ANY(p_loans))
    ORDER BY "Ref Borrowers" COLLATE "C","Row ID" COLLATE "C"
  LOOP
    IF EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"=l."Row ID" AND "Charge Date"=p_business_date) THEN CONTINUE; END IF;
    result:=public.generate_loan_charge(l."Row ID",p_business_date);
    IF result IS NOT NULL THEN generated:=generated+1; END IF;
  END LOOP;
  RETURN generated;
END $$;

CREATE FUNCTION public.charge_generation_request() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE request_date date;
BEGIN
  IF NEW."Charge Generation Request" IS NULL OR
    (TG_OP='UPDATE' AND NEW."Charge Generation Request" IS NOT DISTINCT FROM OLD."Charge Generation Request") THEN RETURN NULL; END IF;
  IF NEW."Charge Generation Request" !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\|[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'Invalid charge generation request';
  END IF;
  request_date:=split_part(NEW."Charge Generation Request",'|',1)::date;
  IF request_date IS DISTINCT FROM (statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date THEN
    RAISE EXCEPTION 'Charge generation request is stale; sync and request again';
  END IF;
  PERFORM public.generate_loan_charge(NEW."Row ID",request_date,true);
  RETURN NULL;
END $$;
CREATE TRIGGER manual_charge_generation AFTER INSERT OR UPDATE OF "Charge Generation Request" ON public."Loans"
  FOR EACH ROW EXECUTE FUNCTION public.charge_generation_request();
