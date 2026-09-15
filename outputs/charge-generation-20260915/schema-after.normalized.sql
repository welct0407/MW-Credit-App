--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: assessment_lab; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA assessment_lab;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: calculate_row(); Type: FUNCTION; Schema: assessment_lab; Owner: -
--

CREATE FUNCTION assessment_lab.calculate_row() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE j jsonb; r record; started timestamptz:=clock_timestamp();
BEGIN
 NEW."SQL As Of":=(started AT TIME ZONE 'Asia/Bangkok')::date;
 NEW."SQL Calculated At":=started AT TIME ZONE 'Asia/Bangkok';
 NEW."SQL Forecast Start":=coalesce(NEW."SQL Forecast Start",date '2026-08-01');
 NEW."SQL Forecast End":=coalesce(NEW."SQL Forecast End",date '2026-12-31');
 IF NEW."SQL Forecast End"<NEW."SQL As Of" OR NEW."SQL Forecast Start">NEW."SQL As Of" OR NEW."SQL Forecast End"-NEW."SQL Forecast Start">3660 THEN
  RAISE EXCEPTION 'Forecast window must include today and cannot exceed 3660 days';
 END IF;
 j:=assessment_lab.inputs(NEW."Ref Borrower");
 SELECT coalesce(sum((x->>'outstanding')::numeric),0),coalesce(sum((x->>'received_interest')::numeric),0)
 INTO NEW."SQL Current Principal",NEW."SQL Interest Received" FROM jsonb_array_elements(j->'loans') x;
 NEW."SQL Eligible Date":=NULL; NEW."SQL Eligible Interest":=NULL; NEW."SQL Eligible Principal":=NULL;
 NEW."SQL Eligible Profit":=NULL; NEW."SQL Eligible Coverage":=NULL; NEW."SQL Eligible Margin":=NULL; NEW."SQL Current Margin":=NULL;
 FOR r IN SELECT * FROM assessment_lab.forecast(j->'loans',j->'charges',coalesce(NEW."Proposed Loan Amount"::numeric,0),coalesce(NEW."Minimum Daily Profit Rate"::text::numeric,0),NEW."SQL As Of",NEW."SQL Forecast Start",NEW."SQL Forecast End") LOOP
  IF r.day=NEW."SQL As Of" THEN NEW."SQL Current Margin":=r.margin; END IF;
  IF NEW."SQL Eligible Date" IS NULL AND r.day>=NEW."SQL As Of" AND r.margin>=0
     AND nullif(NEW."Ref Borrower",'') IS NOT NULL AND NEW."Proposed Loan Amount"::numeric>0 AND NEW."Minimum Daily Profit Rate">0 THEN
   NEW."SQL Eligible Date":=r.day; NEW."SQL Eligible Interest":=r.interest; NEW."SQL Eligible Principal":=r.principal;
   NEW."SQL Eligible Profit":=r.minimum_profit; NEW."SQL Eligible Coverage":=r.coverage; NEW."SQL Eligible Margin":=r.margin;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;


--
-- Name: fingerprint(jsonb); Type: FUNCTION; Schema: assessment_lab; Owner: -
--

CREATE FUNCTION assessment_lab.fingerprint(j jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
 SELECT md5(jsonb_build_object('loans',(SELECT jsonb_agg(x ORDER BY x::text) FROM jsonb_array_elements(j->'loans') x),'charges',(SELECT jsonb_agg(x ORDER BY x::text) FROM jsonb_array_elements(j->'charges') x))::text)
$$;


--
-- Name: forecast(jsonb, jsonb, numeric, numeric, date, date, date); Type: FUNCTION; Schema: assessment_lab; Owner: -
--

CREATE FUNCTION assessment_lab.forecast(p_loans jsonb, p_charges jsonb, p_amount numeric, p_rate numeric, p_asof date, p_start date, p_end date) RETURNS TABLE(day date, principal numeric, interest numeric, minimum_profit numeric, coverage numeric, margin numeric, contract_outstanding numeric)
    LANGUAGE sql IMMUTABLE
    AS $$
WITH loans AS MATERIALIZED (
 SELECT * FROM jsonb_to_recordset(p_loans) AS l(id text,kind text,auto boolean,start_date date,due_date date,principal numeric,outstanding numeric,received_interest numeric,daily_interest numeric,fixed_interest numeric,daily_payment numeric,last_charge date)
), charges AS MATERIALIZED (
 SELECT * FROM jsonb_to_recordset(p_charges) AS c(loan_id text,charge_date date,principal_due numeric,principal_remaining numeric,amount_remaining numeric)
), days AS (SELECT p_start+g AS d FROM generate_series(0,p_end-p_start)g),
daily AS (
 SELECT d,
 COALESCE((SELECT sum(outstanding) FROM loans WHERE (auto AND kind='ดอกเบี้ยรายวัน' AND daily_interest<>0) OR (auto AND kind='กำหนดวันชำระ' AND due_date>d)),0) AS revolving_out,
 COALESCE((SELECT sum(principal) FROM loans WHERE (auto AND kind='ดอกเบี้ยรายวัน' AND daily_interest<>0) OR (auto AND kind='กำหนดวันชำระ' AND due_date>d)),0) AS revolving_base,
 COALESCE((SELECT sum(principal*(start_date-date '2000-01-01')) FROM loans WHERE (auto AND kind='ดอกเบี้ยรายวัน' AND daily_interest<>0) OR (auto AND kind='กำหนดวันชำระ' AND due_date>d)),0) AS revolving_weight,
 COALESCE((SELECT sum(outstanding) FROM loans WHERE start_date<=d AND (kind='ผ่อนชำระรายวัน' OR NOT auto OR (kind='ดอกเบี้ยรายวัน' AND daily_interest=0))),0) AS installment_out,
 COALESCE((SELECT sum(principal) FROM loans WHERE start_date<=d AND ((kind='ผ่อนชำระรายวัน' AND auto AND due_date>=start_date AND daily_payment>0) OR NOT auto OR (kind='ดอกเบี้ยรายวัน' AND daily_interest=0))),0) AS installment_base,
 COALESCE((SELECT sum(floor(principal/(due_date-start_date+1))+CASE WHEN d-start_date+1<=mod(principal,(due_date-start_date+1)::numeric) THEN 1 ELSE 0 END) FROM loans WHERE kind='ผ่อนชำระรายวัน' AND auto AND due_date>=start_date AND daily_payment>0 AND d BETWEEN start_date AND due_date),0)
 +COALESCE((SELECT sum(c.principal_due) FROM charges c JOIN loans l ON l.id=c.loan_id WHERE c.charge_date=d AND (NOT auto OR (kind='ดอกเบี้ยรายวัน' AND daily_interest=0))),0) AS contract_due,
 COALESCE((SELECT sum(floor(principal/(due_date-start_date+1))+CASE WHEN d-start_date+1<=mod(principal,(due_date-start_date+1)::numeric) THEN 1 ELSE 0 END) FROM loans WHERE kind='ผ่อนชำระรายวัน' AND auto AND due_date>=start_date AND daily_payment>0 AND d BETWEEN start_date AND due_date AND d>COALESCE(last_charge,start_date-1)),0)
 +COALESCE((SELECT sum(c.principal_remaining) FROM charges c JOIN loans l ON l.id=c.loan_id WHERE c.charge_date=d AND d>p_asof AND (NOT auto OR (kind='ดอกเบี้ยรายวัน' AND daily_interest=0))),0) AS future_principal,
 COALESCE((SELECT sum(daily_payment) FROM loans WHERE kind='ผ่อนชำระรายวัน' AND auto AND due_date>=start_date AND daily_payment>0 AND d BETWEEN start_date AND due_date AND d>COALESCE(last_charge,start_date-1)),0)
 +COALESCE((SELECT sum(c.amount_remaining) FROM charges c JOIN loans l ON l.id=c.loan_id WHERE c.charge_date=d AND d>p_asof AND (NOT auto OR (kind='ดอกเบี้ยรายวัน' AND daily_interest=0))),0) AS future_total,
 COALESCE((SELECT sum(received_interest) FROM loans),0)
 + COALESCE((SELECT sum(daily_interest) FROM loans WHERE auto AND kind='ดอกเบี้ยรายวัน'),0)*greatest(d-p_asof,0)
 + COALESCE((SELECT sum(fixed_interest) FROM loans WHERE auto AND kind='กำหนดวันชำระ' AND due_date>p_asof AND due_date<=d),0) AS noninstallment_interest
 FROM days
), accumulated AS (
 SELECT *,sum(future_principal) OVER(ORDER BY d) fp,sum(future_total-future_principal) OVER(ORDER BY d) fi,
 greatest(0,installment_base-sum(contract_due) OVER(ORDER BY d)) co FROM daily
), results AS (
 SELECT d,revolving_out+greatest(0,installment_out-fp) pr,
 noninstallment_interest+fi intr,
 p_rate*((d-date '2000-01-01'+1)*revolving_base-revolving_weight+sum(co) OVER(ORDER BY d)) profit,co FROM accumulated
)
SELECT d,pr,intr,profit,pr+p_amount+profit,intr-pr-p_amount-profit,co FROM results ORDER BY d
$$;


--
-- Name: inputs(text); Type: FUNCTION; Schema: assessment_lab; Owner: -
--

CREATE FUNCTION assessment_lab.inputs(p_borrower text) RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
WITH repayments_loan AS (SELECT "Ref Loans" id,sum("Principal Paid"::numeric) pp,sum("Interest Paid"::numeric) ip FROM public."Repayments" GROUP BY 1),
repayments_charge AS (SELECT "Ref Charges" id,sum("Principal Paid"::numeric) pp,sum("Interest Paid"::numeric) ip FROM public."Repayments" GROUP BY 1),
loans AS MATERIALIZED(SELECT l.*,coalesce(r.pp,0) pp,coalesce(r.ip,0) ip FROM public."Loans" l LEFT JOIN repayments_loan r ON r.id=l."Row ID" WHERE "Ref Borrowers"=p_borrower AND "Loan Status"='ยังไม่ปิดยอด')
SELECT jsonb_build_object('loans',coalesce((SELECT jsonb_agg(jsonb_build_object('id',"Row ID",'kind',"Loan Type",'auto',coalesce("Auto Charge Enabled",false),'start_date',"Loan Date",'due_date',"Due Date",'principal',"Principal Amount"::numeric,'outstanding',"Principal Amount"::numeric-pp,'received_interest',ip,'daily_interest',coalesce("Current Daily Interest"::numeric,0),'fixed_interest',coalesce("Fixed Interest"::numeric,0),'daily_payment',coalesce("Daily Payment Amount"::numeric,0),'last_charge',(SELECT max("Charge Date") FROM public."Charges" c WHERE c."Ref Loans"=loans."Row ID"))) FROM loans),'[]'::jsonb),
'charges',coalesce((SELECT jsonb_agg(jsonb_build_object('loan_id',c."Ref Loans",'charge_date',c."Charge Date",'principal_due',coalesce(c."Principal Due"::numeric,0),'principal_remaining',coalesce(c."Principal Due"::numeric,0)-coalesce(r.pp,0),'amount_remaining',coalesce(c."Principal Due"::numeric,0)+coalesce(c."Interest Due"::numeric,0)-coalesce(r.pp,0)-coalesce(r.ip,0))) FROM public."Charges" c JOIN loans l ON l."Row ID"=c."Ref Loans" LEFT JOIN repayments_charge r ON r.id=c."Row ID"),'[]'::jsonb))
$$;


--
-- Name: stamp_inputs(); Type: FUNCTION; Schema: assessment_lab; Owner: -
--

CREATE FUNCTION assessment_lab.stamp_inputs() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 NEW."SQL Source Fingerprint":=assessment_lab.fingerprint(assessment_lab.inputs(NEW."Ref Borrower"));
 NEW."SQL Input Borrower":=NEW."Ref Borrower";
 NEW."SQL Input Amount":=NEW."Proposed Loan Amount"::numeric;
 NEW."SQL Input Rate":=NEW."Minimum Daily Profit Rate"::text::numeric;
 RETURN NEW;
END $$;


--
-- Name: appsheet_normalize_blank_refs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.appsheet_normalize_blank_refs() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ DECLARE col text; patch jsonb := '{}'::jsonb; BEGIN FOREACH col IN ARRAY TG_ARGV LOOP IF to_jsonb(NEW)->>col = '' THEN patch := patch || jsonb_build_object(col,NULL); END IF; END LOOP; IF patch <> '{}'::jsonb THEN NEW := jsonb_populate_record(NEW,patch); END IF; RETURN NEW; END $$;


--
-- Name: charge_generation_request(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.charge_generation_request() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
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
END $_$;


--
-- Name: close_payment_loans(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_payment_loans(p_id text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: closing_payment_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.closing_payment_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: create_first_day_charge(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_first_day_charge(p_loan text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: first_day_charge_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.first_day_charge_trigger() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NOT starts_with(NEW."Row ID",'lc7:') THEN PERFORM public.first_day_receipt(NEW."Row ID"); END IF;
  RETURN NULL;
END $$;


--
-- Name: first_day_loan_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.first_day_loan_trigger() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN PERFORM public.create_first_day_charge(NEW."Row ID"); RETURN NULL; END $$;


--
-- Name: first_day_receipt(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.first_day_receipt(p_charge text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: generate_due_charges(date, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_due_charges(p_business_date date, p_loans text[] DEFAULT NULL::text[]) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: generate_loan_charge(text, date, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_loan_charge(p_loan text, p_business_date date, p_manual_request boolean DEFAULT false) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: lump_sum_child_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lump_sum_child_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: lump_sum_receipt_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lump_sum_receipt_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: payment_charge_balances(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.payment_charge_balances(p_id text) RETURNS TABLE(charge text, loan text, charge_day date, principal numeric, interest numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: post_payment(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.post_payment(p_id text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: prepare_loan_close(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prepare_loan_close() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: process_lump_sum(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_lump_sum() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NEW."Status"='Processing' THEN PERFORM public.post_payment(NEW."Row ID"); END IF;
  RETURN NULL;
END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Borrowers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Borrowers" (
    "Row ID" text NOT NULL,
    "Borrower Name" text,
    "Description" text,
    "Creation Date" date,
    "Hidden Flag" boolean,
    "Communication Name" text,
    "Instagram Username" text,
    "AI Collection Enabled" boolean,
    "City" text,
    "Working Location" text,
    "Address" text
);


--
-- Name: Calendar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Calendar" (
    "Date" date NOT NULL
);


--
-- Name: Cash Pool Contributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Cash Pool Contributions" (
    "Row ID" text NOT NULL,
    "Ref Partner" text,
    "Contribution Date" date,
    "Transaction Type" text,
    "Amount" money,
    "Notes" text
);


--
-- Name: Charges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Charges" (
    "Row ID" text NOT NULL,
    "Ref Loans" text,
    "Charge Date" date,
    "Interest Due" money,
    "Principal Due" money,
    "Notes" text
);


--
-- Name: Daily Analytics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Daily Analytics" (
    "Row ID" text NOT NULL,
    "Snapshot Date" date,
    "Generated At" timestamp without time zone,
    "Model Version" integer,
    "Principal Issued" money,
    "Loans Issued" integer,
    "Principal Returned" money,
    "Interest Received" money,
    "Repayments Count" integer,
    "Outstanding Principal EOD" money,
    "Active Loans EOD" integer,
    "Active Borrowers EOD" integer,
    "Pending Charges EOD" money,
    "Total Cash Pool EOD" money,
    "Available Cash EOD" money,
    "Unsettled Profit EOD" money
);


--
-- Name: Loan Assessment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Loan Assessment" (
    "Row ID" text NOT NULL,
    "Assessment ID" text,
    "Ref Borrower" text,
    "Proposed Loan Amount" money,
    "Minimum Daily Profit Rate" real
);


--
-- Name: Loan Assessment SQL Lab; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Loan Assessment SQL Lab" (
    "Row ID" text NOT NULL,
    "Assessment ID" text,
    "Ref Borrower" text,
    "Proposed Loan Amount" money,
    "Minimum Daily Profit Rate" real,
    "SQL Current Principal" numeric,
    "SQL Interest Received" numeric,
    "SQL Eligible Date" date,
    "SQL Eligible Interest" numeric,
    "SQL Eligible Principal" numeric,
    "SQL Eligible Profit" numeric,
    "SQL Eligible Coverage" numeric,
    "SQL Eligible Margin" numeric,
    "SQL Current Margin" numeric,
    "SQL Calculated At" timestamp without time zone,
    "SQL As Of" date,
    "SQL Forecast Start" date DEFAULT '2026-08-01'::date,
    "SQL Forecast End" date DEFAULT '2026-12-31'::date,
    "SQL Refresh Token" text,
    "SQL Source Fingerprint" text,
    "SQL Input Borrower" text,
    "SQL Input Amount" numeric,
    "SQL Input Rate" numeric
);


--
-- Name: Loan Assessment SQL Lab View; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public."Loan Assessment SQL Lab View" AS
 SELECT "Row ID",
    "Assessment ID",
    "Ref Borrower",
    "Proposed Loan Amount",
    "Minimum Daily Profit Rate",
    "SQL Current Principal",
    "SQL Interest Received",
    "SQL Eligible Date",
    "SQL Eligible Interest",
    "SQL Eligible Principal",
    "SQL Eligible Profit",
    "SQL Eligible Coverage",
    "SQL Eligible Margin",
    "SQL Current Margin",
    "SQL Calculated At",
    "SQL As Of",
    "SQL Forecast Start",
    "SQL Forecast End",
    "SQL Refresh Token",
    "SQL Source Fingerprint",
    "SQL Input Borrower",
    "SQL Input Amount",
    "SQL Input Rate",
    (("SQL As Of" = ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok'::text))::date) AND ("SQL Source Fingerprint" = assessment_lab.fingerprint(assessment_lab.inputs("Ref Borrower")))) AS "SQL Source Current"
   FROM public."Loan Assessment SQL Lab" a;


--
-- Name: Loans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Loans" (
    "Row ID" text NOT NULL,
    "Loan Date" date,
    "Close Date" date,
    "Principal Amount" money,
    "Due Date" date,
    "Ref Borrowers" text,
    "Loan Arrangement" text,
    "Loan Status" text,
    "Loan Type" text,
    "Current Daily Interest" money,
    "Fixed Interest" money,
    "Transfer Fee" money,
    "Interest Payment Interval" integer,
    "Created By" text,
    "Closed By" text,
    "Defaulted" boolean,
    "Default Loss Amount" money,
    "Daily Payment Amount" money,
    "Auto Charge Enabled" boolean,
    "Interest Schedule Anchor Date" date,
    "Ref Closing Payment" text,
    "Charge Generation Request" text,
    CONSTRAINT loans_interest_schedule_anchor_date_check CHECK ((("Interest Schedule Anchor Date" IS NULL) OR (("Loan Date" IS NOT NULL) AND ("Interest Schedule Anchor Date" >= "Loan Date"))))
);


--
-- Name: COLUMN "Loans"."Interest Schedule Anchor Date"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Loans"."Interest Schedule Anchor Date" IS 'Optional daily-interest schedule origin. First subsequent scheduled charge is anchor plus Interest Payment Interval. NULL uses Loan Date. Does not reset interest accrual or change existing charges.';


--
-- Name: COLUMN "Loans"."Ref Closing Payment"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Loans"."Ref Closing Payment" IS 'Payment that changed this loan from open to closed. SQL-owned; NULL for pre-migration or non-payment closure. No historical inference/backfill.';


--
-- Name: COLUMN "Loans"."Charge Generation Request"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Loans"."Charge Generation Request" IS 'Manual generation command: Bangkok YYYY-MM-DD|unique token. Hidden and user-read-only in AppSheet; SQL derives charge components. Latest command only, not a financial ledger.';


--
-- Name: OLAP Calendar SQL Lab; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public."OLAP Calendar SQL Lab" AS
 SELECT ('2026-08-01'::date + n) AS "Date"
   FROM generate_series(0, ('2026-12-31'::date - '2026-08-01'::date)) n(n);


--
-- Name: Partners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Partners" (
    "Row ID" text NOT NULL,
    "Partner Name" text,
    "Partner Role" text,
    "Email" text,
    "Instagram Username" text,
    "Language Preference" text,
    "IG Integration Enabled" boolean
);


--
-- Name: Payment Allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Payment Allocations" (
    "Row ID" text NOT NULL,
    "Charge Date Snapshot" date,
    "Ref Payment" text,
    "Ref Charge" text,
    "Charge Row Number Snapshot" integer,
    "Interest Remaining Snapshot" money,
    "Principal Remaining Snapshot" money,
    "Amount Remaining Snapshot" money,
    "Allocation Order" integer,
    "Allocated Interest" money,
    "Allocated Principal" money,
    "Allocated Amount" money,
    "Created At" timestamp without time zone
);


--
-- Name: Payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Payments" (
    "Row ID" text NOT NULL,
    "Status" text,
    "Ref Borrower" text,
    "Amount Received" money,
    "Payment Method" text,
    "Allocation Method" text,
    "Bank Reference" text,
    "Notes" text,
    "Created By" text,
    "Payment Date" date,
    "Created At" timestamp without time zone,
    "Processed At" timestamp without time zone,
    "Ref Target Charge" text,
    "Ref Target Loan" text
);


--
-- Name: COLUMN "Payments"."Ref Target Loan"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Payments"."Ref Target Loan" IS 'Loan Close command target. AppSheet submits the loan; SQL prepares final charges and computes the receipt before unified posting. NULL for other methods and historical receipts.';


--
-- Name: Repayments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Repayments" (
    "Row ID" text NOT NULL,
    "Payment Date" date,
    "Principal Paid" money,
    "Interest Paid" money,
    "Notes" text,
    "Ref Loans" text,
    "Ref Charges" text,
    "Created By" text,
    "Ref Payment" text,
    "Ref Payment Allocation" text
);


--
-- Name: Settlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Settlements" (
    "Row ID" text NOT NULL,
    "Settlement Date" date,
    "Ref Partner" text,
    "Amount" money,
    "Status" text,
    "Transfer Date" date,
    "Notes" text
);


--
-- Name: Statistics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Statistics" (
    "Row ID" text NOT NULL,
    "Statistics ID" text
);


--
-- Name: Borrowers Borrowers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Borrowers"
    ADD CONSTRAINT "Borrowers_pkey" PRIMARY KEY ("Row ID");


--
-- Name: Calendar Calendar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Calendar"
    ADD CONSTRAINT "Calendar_pkey" PRIMARY KEY ("Date");


--
-- Name: Cash Pool Contributions Cash Pool Contributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Cash Pool Contributions"
    ADD CONSTRAINT "Cash Pool Contributions_pkey" PRIMARY KEY ("Row ID");


--
-- Name: Charges Charges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Charges"
    ADD CONSTRAINT "Charges_pkey" PRIMARY KEY ("Row ID");


--
-- Name: Daily Analytics Daily Analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Daily Analytics"
    ADD CONSTRAINT "Daily Analytics_pkey" PRIMARY KEY ("Row ID");


--
-- Name: Loan Assessment SQL Lab Loan Assessment SQL Lab_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Loan Assessment SQL Lab"
    ADD CONSTRAINT "Loan Assessment SQL Lab_pkey" PRIMARY KEY ("Row ID");


--
-- Name: Loan Assessment Loan Assessment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Loan Assessment"
    ADD CONSTRAINT "Loan Assessment_pkey" PRIMARY KEY ("Row ID");


--
-- Name: Loans Loans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Loans"
    ADD CONSTRAINT "Loans_pkey" PRIMARY KEY ("Row ID");


--
-- Name: Partners Partners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Partners"
    ADD CONSTRAINT "Partners_pkey" PRIMARY KEY ("Row ID");


--
-- Name: Payment Allocations Payment Allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payment Allocations"
    ADD CONSTRAINT "Payment Allocations_pkey" PRIMARY KEY ("Row ID");


--
-- Name: Payments Payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payments"
    ADD CONSTRAINT "Payments_pkey" PRIMARY KEY ("Row ID");


--
-- Name: Repayments Repayments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Repayments"
    ADD CONSTRAINT "Repayments_pkey" PRIMARY KEY ("Row ID");


--
-- Name: Settlements Settlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Settlements"
    ADD CONSTRAINT "Settlements_pkey" PRIMARY KEY ("Row ID");


--
-- Name: Statistics Statistics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Statistics"
    ADD CONSTRAINT "Statistics_pkey" PRIMARY KEY ("Row ID");


--
-- Name: allocations_payment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX allocations_payment_idx ON public."Payment Allocations" USING btree ("Ref Payment");


--
-- Name: charges_loan_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX charges_loan_date_idx ON public."Charges" USING btree ("Ref Loans", "Charge Date" DESC);


--
-- Name: loans_borrower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loans_borrower_idx ON public."Loans" USING btree ("Ref Borrowers");


--
-- Name: loans_closing_payment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loans_closing_payment_idx ON public."Loans" USING btree ("Ref Closing Payment") WHERE ("Ref Closing Payment" IS NOT NULL);


--
-- Name: payments_borrower_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_borrower_status_idx ON public."Payments" USING btree ("Ref Borrower", "Status");


--
-- Name: payments_target_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_target_loan_idx ON public."Payments" USING btree ("Ref Target Loan") WHERE ("Ref Target Loan" IS NOT NULL);


--
-- Name: repayments_charge_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX repayments_charge_idx ON public."Repayments" USING btree ("Ref Charges");


--
-- Name: repayments_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX repayments_loan_idx ON public."Repayments" USING btree ("Ref Loans");


--
-- Name: repayments_payment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX repayments_payment_idx ON public."Repayments" USING btree ("Ref Payment");


--
-- Name: Cash Pool Contributions appsheet_blank_refs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER appsheet_blank_refs BEFORE INSERT OR UPDATE ON public."Cash Pool Contributions" FOR EACH ROW EXECUTE FUNCTION public.appsheet_normalize_blank_refs('Ref Partner');


--
-- Name: Charges appsheet_blank_refs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER appsheet_blank_refs BEFORE INSERT OR UPDATE ON public."Charges" FOR EACH ROW EXECUTE FUNCTION public.appsheet_normalize_blank_refs('Ref Loans');


--
-- Name: Loan Assessment appsheet_blank_refs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER appsheet_blank_refs BEFORE INSERT OR UPDATE ON public."Loan Assessment" FOR EACH ROW EXECUTE FUNCTION public.appsheet_normalize_blank_refs('Ref Borrower');


--
-- Name: Loans appsheet_blank_refs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER appsheet_blank_refs BEFORE INSERT OR UPDATE ON public."Loans" FOR EACH ROW EXECUTE FUNCTION public.appsheet_normalize_blank_refs('Ref Borrowers');


--
-- Name: Payment Allocations appsheet_blank_refs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER appsheet_blank_refs BEFORE INSERT OR UPDATE ON public."Payment Allocations" FOR EACH ROW EXECUTE FUNCTION public.appsheet_normalize_blank_refs('Ref Payment', 'Ref Charge');


--
-- Name: Payments appsheet_blank_refs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER appsheet_blank_refs BEFORE INSERT OR UPDATE ON public."Payments" FOR EACH ROW EXECUTE FUNCTION public.appsheet_normalize_blank_refs('Ref Borrower', 'Ref Target Charge');


--
-- Name: Repayments appsheet_blank_refs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER appsheet_blank_refs BEFORE INSERT OR UPDATE ON public."Repayments" FOR EACH ROW EXECUTE FUNCTION public.appsheet_normalize_blank_refs('Ref Loans', 'Ref Charges', 'Ref Payment', 'Ref Payment Allocation');


--
-- Name: Settlements appsheet_blank_refs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER appsheet_blank_refs BEFORE INSERT OR UPDATE ON public."Settlements" FOR EACH ROW EXECUTE FUNCTION public.appsheet_normalize_blank_refs('Ref Partner');


--
-- Name: Loan Assessment SQL Lab assessment_calculate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER assessment_calculate BEFORE INSERT OR UPDATE ON public."Loan Assessment SQL Lab" FOR EACH ROW EXECUTE FUNCTION assessment_lab.calculate_row();


--
-- Name: Loan Assessment SQL Lab assessment_stamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER assessment_stamp BEFORE INSERT OR UPDATE ON public."Loan Assessment SQL Lab" FOR EACH ROW EXECUTE FUNCTION assessment_lab.stamp_inputs();


--
-- Name: Payments close_loan_request; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER close_loan_request BEFORE INSERT OR UPDATE ON public."Payments" FOR EACH ROW EXECUTE FUNCTION public.prepare_loan_close();


--
-- Name: Loans closing_payment_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER closing_payment_guard BEFORE INSERT OR UPDATE ON public."Loans" FOR EACH ROW EXECUTE FUNCTION public.closing_payment_guard();


--
-- Name: Loans first_day_charge; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER first_day_charge AFTER INSERT ON public."Loans" FOR EACH ROW EXECUTE FUNCTION public.first_day_loan_trigger();


--
-- Name: Charges first_day_receipt; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER first_day_receipt AFTER INSERT ON public."Charges" FOR EACH ROW EXECUTE FUNCTION public.first_day_charge_trigger();


--
-- Name: Payment Allocations lump_sum_child_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lump_sum_child_guard BEFORE INSERT OR DELETE OR UPDATE ON public."Payment Allocations" FOR EACH ROW EXECUTE FUNCTION public.lump_sum_child_guard();


--
-- Name: Repayments lump_sum_child_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lump_sum_child_guard BEFORE INSERT OR DELETE OR UPDATE ON public."Repayments" FOR EACH ROW EXECUTE FUNCTION public.lump_sum_child_guard();


--
-- Name: Payments lump_sum_receipt_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lump_sum_receipt_guard BEFORE INSERT OR UPDATE ON public."Payments" FOR EACH ROW EXECUTE FUNCTION public.lump_sum_receipt_guard();


--
-- Name: Loans manual_charge_generation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER manual_charge_generation AFTER INSERT OR UPDATE OF "Charge Generation Request" ON public."Loans" FOR EACH ROW EXECUTE FUNCTION public.charge_generation_request();


--
-- Name: Payments payment_delete_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER payment_delete_guard BEFORE DELETE ON public."Payments" FOR EACH ROW EXECUTE FUNCTION public.lump_sum_receipt_guard();


--
-- Name: Payments process_lump_sum; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER process_lump_sum AFTER INSERT OR UPDATE ON public."Payments" FOR EACH ROW EXECUTE FUNCTION public.process_lump_sum();


--
-- Name: Loans Loans_Ref Closing Payment_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Loans"
    ADD CONSTRAINT "Loans_Ref Closing Payment_fkey" FOREIGN KEY ("Ref Closing Payment") REFERENCES public."Payments"("Row ID");


--
-- Name: Payments Payments_Ref Target Loan_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payments"
    ADD CONSTRAINT "Payments_Ref Target Loan_fkey" FOREIGN KEY ("Ref Target Loan") REFERENCES public."Loans"("Row ID");


--
-- Name: Loans appsheet_ref_01; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Loans"
    ADD CONSTRAINT appsheet_ref_01 FOREIGN KEY ("Ref Borrowers") REFERENCES public."Borrowers"("Row ID");


--
-- Name: Repayments appsheet_ref_02; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Repayments"
    ADD CONSTRAINT appsheet_ref_02 FOREIGN KEY ("Ref Loans") REFERENCES public."Loans"("Row ID");


--
-- Name: Repayments appsheet_ref_03; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Repayments"
    ADD CONSTRAINT appsheet_ref_03 FOREIGN KEY ("Ref Charges") REFERENCES public."Charges"("Row ID");


--
-- Name: Repayments appsheet_ref_04; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Repayments"
    ADD CONSTRAINT appsheet_ref_04 FOREIGN KEY ("Ref Payment") REFERENCES public."Payments"("Row ID");


--
-- Name: Repayments appsheet_ref_05; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Repayments"
    ADD CONSTRAINT appsheet_ref_05 FOREIGN KEY ("Ref Payment Allocation") REFERENCES public."Payment Allocations"("Row ID");


--
-- Name: Charges appsheet_ref_06; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Charges"
    ADD CONSTRAINT appsheet_ref_06 FOREIGN KEY ("Ref Loans") REFERENCES public."Loans"("Row ID");


--
-- Name: Loan Assessment appsheet_ref_07; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Loan Assessment"
    ADD CONSTRAINT appsheet_ref_07 FOREIGN KEY ("Ref Borrower") REFERENCES public."Borrowers"("Row ID");


--
-- Name: Cash Pool Contributions appsheet_ref_08; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Cash Pool Contributions"
    ADD CONSTRAINT appsheet_ref_08 FOREIGN KEY ("Ref Partner") REFERENCES public."Partners"("Row ID");


--
-- Name: Settlements appsheet_ref_09; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Settlements"
    ADD CONSTRAINT appsheet_ref_09 FOREIGN KEY ("Ref Partner") REFERENCES public."Partners"("Row ID");


--
-- Name: Payment Allocations appsheet_ref_10; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payment Allocations"
    ADD CONSTRAINT appsheet_ref_10 FOREIGN KEY ("Ref Payment") REFERENCES public."Payments"("Row ID");


--
-- Name: Payment Allocations appsheet_ref_11; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payment Allocations"
    ADD CONSTRAINT appsheet_ref_11 FOREIGN KEY ("Ref Charge") REFERENCES public."Charges"("Row ID");


--
-- Name: Payments appsheet_ref_12; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payments"
    ADD CONSTRAINT appsheet_ref_12 FOREIGN KEY ("Ref Borrower") REFERENCES public."Borrowers"("Row ID");


--
-- Name: Payments appsheet_ref_13; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payments"
    ADD CONSTRAINT appsheet_ref_13 FOREIGN KEY ("Ref Target Charge") REFERENCES public."Charges"("Row ID");


--
-- PostgreSQL database dump complete
--
