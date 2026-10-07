-- R051: entering daily-interest mode uses the same frozen-rate rule as a
-- principal correction. No historical charge/source rewrite, fields or grants.
CREATE OR REPLACE FUNCTION public.apply_principal_daily_interest(p public."Loans", previous public."Loans")
RETURNS public."Loans" LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE principal_changed boolean; entering_daily boolean;
BEGIN
 IF previous."Row ID" IS NULL THEN
  -- SQL calculates the authoritative value, including for clients without the new field.
  p."Original Daily Interest Rate":=public.original_daily_interest_rate(p,false);
  RETURN p;
 END IF;
 IF previous."Original Daily Interest Rate" IS NOT NULL THEN
  IF p."Original Daily Interest Rate" IS NOT NULL AND
     p."Original Daily Interest Rate" IS DISTINCT FROM previous."Original Daily Interest Rate" THEN
   RAISE EXCEPTION 'Original daily interest rate is read-only';
  END IF;
  p."Original Daily Interest Rate":=previous."Original Daily Interest Rate";
 ELSE
  p."Original Daily Interest Rate":=public.original_daily_interest_rate(previous,true);
 END IF;
 IF p."Loan Type" IS DISTINCT FROM 'ดอกเบี้ยรายวัน' THEN RETURN p; END IF;
 principal_changed:=p."Total Principal Received" IS DISTINCT FROM previous."Total Principal Received" OR p."Principal Amount" IS DISTINCT FROM previous."Principal Amount";
 entering_daily:=previous."Loan Type" IS DISTINCT FROM 'ดอกเบี้ยรายวัน';
 IF entering_daily AND coalesce(p."Auto Charge Enabled",false) AND (p."Loan Date" IS NULL OR NOT coalesce(p."Interest Payment Interval">=1,false)) THEN
  RAISE EXCEPTION 'Automatic daily conversion requires a loan date and positive interest payment interval';
 END IF;
 IF principal_changed OR entering_daily THEN
  IF p."Original Daily Interest Rate" IS NULL THEN
   IF entering_daily THEN
    RAISE EXCEPTION 'Original daily interest rate unavailable; review original loan terms before daily conversion';
   END IF;
   RAISE EXCEPTION 'Original daily interest rate unavailable; review original loan terms before principal repayment';
  END IF;
  p."Current Daily Interest":=round(greatest(0,p."Outstanding Principal")*p."Original Daily Interest Rate"/100.0)::money;
 ELSE
  -- Preserve entry/backlog amount until a principal change; stale app saves cannot undo adjustment.
  p."Current Daily Interest":=previous."Current Daily Interest";
 END IF;
 RETURN p;
END $$;
