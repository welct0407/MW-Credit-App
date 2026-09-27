-- R048: immutable original daily percentage, rounded once to whole percentage points.
-- Owner-approved DEV backfill; original amounts and posted transactions are preserved.
ALTER TABLE public."Loans" ADD COLUMN "Original Daily Interest Rate" integer;
ALTER TABLE public."Loans" ADD CONSTRAINT loans_original_daily_rate_nonnegative
 CHECK ("Original Daily Interest Rate" >= 0);
COMMENT ON COLUMN public."Loans"."Original Daily Interest Rate" IS
 'Original average daily interest / original principal * 100, rounded to integer percentage points (1 means 1%). Frozen at creation. NULL means original terms unavailable.';

CREATE FUNCTION public.original_daily_interest_rate(p public."Loans", historical boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE daily numeric; basis numeric[]; n bigint; days integer;
BEGIN
 IF p."Principal Amount" IS NULL OR p."Principal Amount"::numeric<=0 THEN RETURN NULL; END IF;
 CASE p."Loan Type"
 WHEN 'ดอกเบี้ยรายวัน' THEN
  IF historical THEN
   basis:=public.daily_interest_basis(p."Loan Arrangement");
   IF basis IS NOT NULL THEN RETURN round(100*basis[1]/basis[2])::integer; END IF;
   SELECT count(*),min(c."Interest Due"::numeric-coalesce(p."Transfer Fee"::numeric,0))
    INTO n,daily FROM public."Charges" c WHERE c."Ref Loans"=p."Row ID"
     AND c."Charge Date"=p."Loan Date" AND coalesce(c."Principal Due"::numeric,0)=0;
   IF n=1 AND daily>=0 THEN RETURN round(100*daily/p."Principal Amount"::numeric)::integer; END IF;
   -- With no original evidence, only an unrepaid loan still has its entry amount.
   IF coalesce(p."Total Principal Received",0)<>0 THEN RETURN NULL; END IF;
  END IF;
  daily:=p."Current Daily Interest"::numeric;
 WHEN 'กำหนดวันชำระ' THEN
  days:=p."Due Date"-p."Loan Date"+1;
  IF days IS NULL OR days<=0 THEN RETURN NULL; END IF;
  daily:=p."Fixed Interest"::numeric/days;
 WHEN 'ผ่อนชำระรายวัน' THEN
  days:=p."Due Date"-p."Loan Date"+1;
  IF days IS NULL OR days<=0 THEN RETURN NULL; END IF;
  daily:=(p."Daily Payment Amount"::numeric*days-p."Principal Amount"::numeric)/days;
 ELSE RETURN NULL;
 END CASE;
 IF daily IS NULL OR daily<0 THEN RETURN NULL; END IF;
 RETURN round(100*daily/p."Principal Amount"::numeric)::integer;
END $$;

CREATE OR REPLACE FUNCTION public.apply_principal_daily_interest(p public."Loans", previous public."Loans")
RETURNS public."Loans" LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE principal_changed boolean;
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
 principal_changed:=p."Total Principal Received" IS DISTINCT FROM previous."Total Principal Received";
 IF principal_changed THEN
  IF p."Original Daily Interest Rate" IS NULL THEN
   RAISE EXCEPTION 'Original daily interest rate unavailable; review original loan terms before principal repayment';
  END IF;
  p."Current Daily Interest":=round(greatest(0,p."Outstanding Principal")*p."Original Daily Interest Rate"/100.0)::money;
 ELSE
  -- Preserve entry/backlog amount until a principal change; stale app saves cannot undo adjustment.
  p."Current Daily Interest":=previous."Current Daily Interest";
 END IF;
 RETURN p;
END $$;

-- Ordinary guarded updates retain all integrity/audit triggers. No financial amounts are rewritten.
UPDATE public."Loans" SET "Original Daily Interest Rate"=public.original_daily_interest_rate("Loans",true);

-- Preserve existing OLAP column order and append the new field for schema regeneration.
DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_viewdef('public.olap_loans_analytics'::regclass,true) INTO definition;
 definition:=regexp_replace(definition,';\s*$','');
 EXECUTE 'CREATE OR REPLACE VIEW public.olap_loans_analytics AS SELECT existing.*, l."Original Daily Interest Rate" FROM ('
  ||definition||') existing JOIN public."Loans" l ON l."Row ID"=existing."Row ID"';
END $$;

-- Keep the affected DEV forecast calculation consistent with repayment calculations.
CREATE OR REPLACE FUNCTION public.forecast_schedule_v1(l jsonb, charges jsonb, t date, e date)
RETURNS TABLE(due_date date, origin text, bucket text, principal numeric, interest numeric, eligible boolean, issue text)
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE c jsonb; d date; latest date; anchor date; n integer; elapsed integer; term integer;
 p numeric; i numeric; balance numeric; daily_rate numeric; basis numeric[]; active boolean;
 blocked boolean:=false; scheduled_principal numeric:=0; found_today boolean:=false; today_principal numeric:=0; simulated_principal numeric:=0;
BEGIN
 IF t IS NULL OR e<t OR e>t+93 THEN RAISE EXCEPTION 'Forecast window invalid'; END IF;
 active:=coalesce(l->>'status'='ยังไม่ปิดยอด' AND NOT (l->>'defaulted')::boolean AND (l->>'start')::date<=t
  AND ((l->>'close') IS NULL OR (l->>'close')::date>t),false);
 balance:=(l->>'balance')::numeric;daily_rate:=(l->>'daily')::numeric;
 FOR c IN SELECT value FROM jsonb_array_elements(coalesce(charges,'[]'::jsonb)) ORDER BY (value->>'date')::date,value->>'id' LOOP
  d:=(c->>'date')::date;
  IF d=t THEN found_today:=true; END IF;
  IF coalesce((c->>'invalid')::boolean,false) OR d IS NULL THEN
   due_date:=d;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Invalid charge or allocation';RETURN NEXT;blocked:=true;CONTINUE;
  END IF;
  -- Negative default-accounting obligations are not expected cash receipts.
  IF (c->>'pdue')::numeric<0 OR (c->>'idue')::numeric<0 THEN
   IF NOT coalesce((l->>'defaulted')::boolean,false) THEN
    due_date:=d;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Negative obligation';RETURN NEXT;blocked:=true;
   END IF;CONTINUE;
  END IF;
  IF d>e THEN CONTINUE; END IF;
  p:=greatest((c->>'pdue')::numeric-coalesce((c->>'ppaid')::numeric,0),0);
  i:=greatest((c->>'idue')::numeric-coalesce((c->>'ipaid')::numeric,0),0);
  IF p+i>0 THEN
   due_date:=d;origin:='Recorded';bucket:=CASE WHEN NOT active THEN 'Recovery only' WHEN d<t THEN 'Overdue' WHEN d=t THEN 'Today' ELSE 'Future' END;
   principal:=p;interest:=i;eligible:=active;issue:=NULL;RETURN NEXT;
  END IF;
  scheduled_principal:=scheduled_principal+p;
  IF d=t THEN today_principal:=today_principal+p; END IF;
 END LOOP;
 IF l->>'status' NOT IN ('ยังไม่ปิดยอด','ปิดยอดแล้ว') OR l->>'status' IS NULL OR coalesce((l->>'invalid')::boolean,true) THEN
  due_date:=t;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Invalid loan, borrower or repayment';RETURN NEXT;RETURN;
 END IF;
 IF NOT active THEN RETURN; END IF;
 IF balance IS NULL OR balance<0 OR scheduled_principal>balance+0.005 THEN
  due_date:=t;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Principal obligations do not reconcile';RETURN NEXT;RETURN;
 END IF;
 IF NOT coalesce((l->>'auto')::boolean,false) THEN
  due_date:=t;origin:='Notice';bucket:='Recorded plan only';principal:=0;interest:=0;eligible:=false;issue:='Manual schedule: only recorded obligations forecast';RETURN NEXT;RETURN;
 END IF;
 IF blocked THEN RETURN; END IF;
 n:=(l->>'interval')::integer;anchor:=coalesce((l->>'anchor')::date,(l->>'start')::date);
 IF l->>'type' NOT IN ('ดอกเบี้ยรายวัน','กำหนดวันชำระ','ผ่อนชำระรายวัน')
 OR (l->>'type'<>'กำหนดวันชำระ' AND (n IS NULL OR n<1))
 OR (l->>'type'='ดอกเบี้ยรายวัน' AND (daily_rate IS NULL OR daily_rate<0 OR anchor<(l->>'start')::date))
 OR (l->>'type'<>'ดอกเบี้ยรายวัน' AND ((l->>'due') IS NULL OR (l->>'due')::date<(l->>'start')::date)) THEN
  due_date:=t;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Unsupported automatic schedule';RETURN NEXT;RETURN;
 END IF;
 SELECT max((value->>'date')::date) INTO latest FROM jsonb_array_elements(coalesce(charges,'[]'::jsonb))
 WHERE l->>'type'='ผ่อนชำระรายวัน' OR (value->>'date')::date<=t;
 IF l->>'type'='ผ่อนชำระรายวัน' AND latest IS NULL THEN
  due_date:=t;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Installment missing initial charge';RETURN NEXT;RETURN;
 END IF;
 IF NOT found_today AND ((l->>'type'='ดอกเบี้ยรายวัน' AND daily_rate>0 AND t>anchor AND mod(t-anchor,n)=0)
  OR (l->>'type'='กำหนดวันชำระ' AND (l->>'due')::date=t)
  OR (l->>'type'='ผ่อนชำระรายวัน' AND t>(l->>'start')::date AND t<=(l->>'due')::date AND (mod(t-(l->>'start')::date,n)=0 OR t=(l->>'due')::date))) THEN
  due_date:=t;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Expected today charge missing';RETURN NEXT;
 END IF;
 IF l->>'type'='ดอกเบี้ยรายวัน' THEN
  IF l ? 'original_rate' THEN
   IF l->>'original_rate' IS NOT NULL THEN basis:=ARRAY[(l->>'original_rate')::numeric,100::numeric]; END IF;
  ELSE
   BEGIN basis:=public.daily_interest_basis(l->>'arrangement'); EXCEPTION WHEN OTHERS THEN basis:=NULL; END;
  END IF;
 END IF;
 balance:=balance-today_principal;
 IF l->>'type'='ดอกเบี้ยรายวัน' AND today_principal>0 THEN
  IF basis IS NULL THEN due_date:=t;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Daily interest basis unavailable after scheduled principal';RETURN NEXT;RETURN;END IF;
  daily_rate:=round(basis[1]*greatest(0,balance)/basis[2],0);
 END IF;
 term:=(l->>'due')::date-(l->>'start')::date+1;
 FOR d IN SELECT generate_series(t+1,e,interval '1 day')::date LOOP
  p:=0;i:=0;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(charges,'[]'::jsonb)) WHERE (value->>'date')::date=d) THEN
   SELECT coalesce(sum(greatest((value->>'pdue')::numeric-coalesce((value->>'ppaid')::numeric,0),0)),0) INTO p
    FROM jsonb_array_elements(charges) WHERE (value->>'date')::date=d;
   IF l->>'type'='ดอกเบี้ยรายวัน' THEN latest:=d; END IF;
   balance:=balance-p;
   IF l->>'type'='ดอกเบี้ยรายวัน' AND p>0 THEN
    IF basis IS NULL THEN due_date:=d;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Daily interest basis unavailable after scheduled principal';RETURN NEXT;RETURN;END IF;
    daily_rate:=round(basis[1]*greatest(0,balance)/basis[2],0);
   END IF;
   CONTINUE;
  END IF;
  IF l->>'type'='ดอกเบี้ยรายวัน' THEN
   IF d<=anchor OR mod(d-anchor,n)<>0 OR daily_rate=0 THEN CONTINUE; END IF;
   i:=daily_rate*greatest(0,d-coalesce(latest,(l->>'start')::date));
  ELSIF l->>'type'='กำหนดวันชำระ' THEN
   IF d<>(l->>'due')::date THEN CONTINUE; END IF;
   p:=balance;i:=(l->>'fixed')::numeric;
  ELSE
   IF d<=(l->>'start')::date OR d>(l->>'due')::date OR (mod(d-(l->>'start')::date,n)<>0 AND d<>(l->>'due')::date) THEN CONTINUE; END IF;
   elapsed:=d-latest;IF elapsed<=0 THEN CONTINUE;END IF;
   p:=floor((l->>'original')::numeric/term)*elapsed+greatest(0,least(d-(l->>'start')::date+1,mod((l->>'original')::numeric,term))-(latest-(l->>'start')::date+1));
   i:=(l->>'payment')::numeric*elapsed-p;
  END IF;
  IF p IS NULL OR i IS NULL OR p<0 OR i<0 OR p>balance+0.005 OR scheduled_principal+simulated_principal+p>(l->>'balance')::numeric+0.005 THEN
   due_date:=d;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Simulated components do not reconcile';RETURN NEXT;RETURN;
  END IF;
  due_date:=d;origin:='Simulated';bucket:='Future';principal:=p;interest:=i;eligible:=true;issue:=NULL;RETURN NEXT;
  latest:=d;balance:=balance-p;simulated_principal:=simulated_principal+p;
 END LOOP;
END $$;


DO $$
DECLARE definition text; projection text;
BEGIN
 SELECT pg_get_viewdef('public.reporting_forecast_inputs_v1'::regclass,true) INTO definition;
 SELECT string_agg(CASE WHEN attname='loan' THEN
  'existing.loan || jsonb_build_object(''original_rate'', l."Original Daily Interest Rate") AS loan'
  ELSE 'existing.'||quote_ident(attname) END, ', ' ORDER BY attnum) INTO projection
 FROM pg_attribute WHERE attrelid='public.reporting_forecast_inputs_v1'::regclass AND attnum>0 AND NOT attisdropped;
 definition:=regexp_replace(definition,';\s*$','');
 EXECUTE 'CREATE OR REPLACE VIEW public.reporting_forecast_inputs_v1 AS SELECT '||projection||' FROM ('
  ||definition||') existing JOIN public."Loans" l ON l."Row ID"=existing.loan_id';
END $$;
