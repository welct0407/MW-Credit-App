BEGIN;
CREATE TABLE public."Loan Assessment SQL Lab" (
 "Row ID" text PRIMARY KEY,
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
 "SQL Calculated At" timestamp,
 "SQL As Of" date,
 "SQL Forecast Start" date DEFAULT '2026-08-01',
 "SQL Forecast End" date DEFAULT '2026-12-31',
 "SQL Refresh Token" text
);
CREATE FUNCTION assessment_lab.calculate_row() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER assessment_calculate BEFORE INSERT OR UPDATE ON public."Loan Assessment SQL Lab"
FOR EACH ROW EXECUTE FUNCTION assessment_lab.calculate_row();
INSERT INTO public."Loan Assessment SQL Lab" ("Row ID","Assessment ID","Ref Borrower","Proposed Loan Amount","Minimum Daily Profit Rate")
SELECT "Row ID","Assessment ID","Ref Borrower","Proposed Loan Amount","Minimum Daily Profit Rate" FROM public."Loan Assessment";
COMMIT;
SELECT json_build_object('labRows',(SELECT count(*) FROM public."Loan Assessment SQL Lab"),'productionAssessmentUnchanged',true);
