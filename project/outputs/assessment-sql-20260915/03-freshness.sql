BEGIN;
ALTER TABLE public."Loan Assessment SQL Lab"
 ADD COLUMN "SQL Source Fingerprint" text,
 ADD COLUMN "SQL Input Borrower" text,
 ADD COLUMN "SQL Input Amount" numeric,
 ADD COLUMN "SQL Input Rate" numeric;
CREATE FUNCTION assessment_lab.fingerprint(j jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT md5(jsonb_build_object('loans',(SELECT jsonb_agg(x ORDER BY x::text) FROM jsonb_array_elements(j->'loans') x),'charges',(SELECT jsonb_agg(x ORDER BY x::text) FROM jsonb_array_elements(j->'charges') x))::text)
$$;
CREATE FUNCTION assessment_lab.stamp_inputs() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW."SQL Source Fingerprint":=assessment_lab.fingerprint(assessment_lab.inputs(NEW."Ref Borrower"));
 NEW."SQL Input Borrower":=NEW."Ref Borrower";
 NEW."SQL Input Amount":=NEW."Proposed Loan Amount"::numeric;
 NEW."SQL Input Rate":=NEW."Minimum Daily Profit Rate"::text::numeric;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_stamp BEFORE INSERT OR UPDATE ON public."Loan Assessment SQL Lab"
FOR EACH ROW EXECUTE FUNCTION assessment_lab.stamp_inputs();
UPDATE public."Loan Assessment SQL Lab" SET "SQL Refresh Token"='freshness-installed';
CREATE VIEW public."Loan Assessment SQL Lab View" AS
SELECT a.*, (a."SQL As Of"=(current_timestamp AT TIME ZONE 'Asia/Bangkok')::date AND
 a."SQL Source Fingerprint"=assessment_lab.fingerprint(assessment_lab.inputs(a."Ref Borrower"))) AS "SQL Source Current"
FROM public."Loan Assessment SQL Lab" a;
COMMIT;
SELECT json_build_object('updatable',(SELECT is_updatable FROM information_schema.views WHERE table_schema='public' AND table_name='Loan Assessment SQL Lab View'));
