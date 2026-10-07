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
    "Auto Charge Enabled" boolean
);


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
    "Ref Target Charge" text
);


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
