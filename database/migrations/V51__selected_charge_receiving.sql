-- R047: one receipt fully settles an explicitly selected group of charges.
-- Owner approved the one nullable scope field and DEV implementation on 27 September 2026.
-- Existing rows/receiving methods remain compatible; no backfill or financial DML.
ALTER TABLE public."Payments" ADD COLUMN "Selected Charge IDs" text;
COMMENT ON COLUMN public."Payments"."Selected Charge IDs" IS
 'Selected Charges command scope: canonical comma-separated immutable Charge keys. SQL validates every key and posts FK-backed allocations atomically. NULL for other methods.';

CREATE FUNCTION public.selected_charge_ids(value text) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE ids text[]; unique_ids text[];
BEGIN
 IF value IS NULL OR btrim(value)='' THEN RETURN ARRAY[]::text[]; END IF;
 -- AppSheet EnumList uses a comma with optional ASCII spaces. Keys containing
 -- commas/whitespace are deliberately unsupported, never ambiguously decoded.
 IF value !~ '^[^,[:space:]]+( *, *[^,[:space:]]+)*$' THEN
  RAISE EXCEPTION 'Invalid selected charge key encoding';
 END IF;
 ids:=string_to_array(replace(value,' ',''),',');
 SELECT array_agg(k ORDER BY k COLLATE "C") INTO unique_ids FROM (SELECT DISTINCT unnest(ids) k) s;
 IF cardinality(ids)<>cardinality(unique_ids) THEN
  RAISE EXCEPTION 'Selected charge keys must be unique';
 END IF;
 RETURN unique_ids;
END $$;

CREATE FUNCTION public.guard_selected_charge_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE ids text[];
BEGIN
 ids:=public.selected_charge_ids(NEW."Selected Charge IDs");
 NEW."Selected Charge IDs":=nullif(array_to_string(ids,' , '),'');
 IF TG_OP='UPDATE' AND NEW."Selected Charge IDs" IS DISTINCT FROM OLD."Selected Charge IDs"
  AND (OLD."Status"='Posted'
   OR EXISTS(SELECT 1 FROM public."Payment Allocations" WHERE "Ref Payment"=OLD."Row ID")
   OR EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Payment"=OLD."Row ID")) THEN
  RAISE EXCEPTION 'Prepared or posted payment selection cannot be changed';
 END IF;
 IF NEW."Allocation Method"='Selected Charges' THEN
  IF cardinality(ids)=0 THEN RAISE EXCEPTION 'Select at least one charge'; END IF;
  IF nullif(btrim(NEW."Ref Target Charge"),'') IS NOT NULL OR nullif(btrim(NEW."Ref Target Loan"),'') IS NOT NULL THEN
   RAISE EXCEPTION 'Selected Charges cannot also target a single charge or loan';
  END IF;
 ELSIF cardinality(ids)>0 THEN
  RAISE EXCEPTION 'Selected charge keys require the Selected Charges allocation method';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a1_selected_charge_scope BEFORE INSERT OR UPDATE ON public."Payments"
 FOR EACH ROW EXECUTE FUNCTION public.guard_selected_charge_scope();

CREATE OR REPLACE FUNCTION public.payment_charge_balances(p_id text)
 RETURNS TABLE(charge text, loan text, charge_day date, principal numeric, interest numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
    WHEN p."Allocation Method"='Selected Charges' THEN
      c."Row ID"=ANY(public.selected_charge_ids(p."Selected Charge IDs"))
      AND c."Charge Date"<=p."Payment Date"
    ELSE false END;
$function$;

CREATE OR REPLACE FUNCTION public.post_payment(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE p public."Payments"%ROWTYPE; amount numeric; available numeric;
BEGIN
  SELECT * INTO STRICT p FROM public."Payments" WHERE "Row ID"=p_id;
  IF p."Status"='Posted' THEN RETURN; END IF;
  IF p."Status" IS DISTINCT FROM 'Processing' THEN
    RAISE EXCEPTION 'Payment must be Processing before posting';
  END IF;
  IF p."Allocation Method" IS NULL OR p."Allocation Method" NOT IN
    ('Single Full','Single Partial','Receive All','Lump Sum','First-day Auto','Loan Close','Selected Charges') THEN
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
  IF p."Allocation Method"='Selected Charges' AND (
    (SELECT count(*) FROM public.payment_charge_balances(p_id)) <>
      cardinality(public.selected_charge_ids(p."Selected Charge IDs"))
    OR EXISTS(SELECT 1 FROM public.payment_charge_balances(p_id) WHERE principal+interest<=0)) THEN
    RAISE EXCEPTION 'Selected charges changed or are not eligible; refresh and review the full selection';
  END IF;
  SELECT coalesce(sum(principal+interest),0) INTO available FROM public.payment_charge_balances(p_id);
  IF amount>available OR (p."Allocation Method" IN ('Single Full','Receive All','First-day Auto','Loan Close','Selected Charges') AND amount<>available) THEN
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
END $function$;
