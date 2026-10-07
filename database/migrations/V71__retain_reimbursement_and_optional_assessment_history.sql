-- R051 owner decisions, 6 October 2026: retain reimbursement transfers
-- when their expense is deleted; optional assessments do not own borrowers.
-- No financial backfill, grants, new columns, source deletion, or restrictive views.
ALTER TABLE public."Cash Ledger" DROP CONSTRAINT "Cash Ledger_Ref Business Expense_fkey";
ALTER TABLE public."Cash Ledger" ADD CONSTRAINT "Cash Ledger_Ref Business Expense_fkey"
 FOREIGN KEY ("Ref Business Expense") REFERENCES public."Business Expenses"("Row ID") ON DELETE SET NULL;

ALTER TABLE public."Loan Assessment" DROP CONSTRAINT appsheet_ref_07;
ALTER TABLE public."Loan Assessment" ADD CONSTRAINT appsheet_ref_07
 FOREIGN KEY ("Ref Borrower") REFERENCES public."Borrowers"("Row ID") ON DELETE SET NULL;

-- Existing SQL-lab history may already contain an unlinked/deleted borrower.
-- NOT VALID preserves those rows while enforcing future writes and FK unlinks.
ALTER TABLE public."Loan Assessment SQL Lab" ADD CONSTRAINT r051_assessment_borrower
 FOREIGN KEY ("Ref Borrower") REFERENCES public."Borrowers"("Row ID") ON DELETE SET NULL NOT VALID;

CREATE OR REPLACE FUNCTION public.guard_cash_ledger() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN

 -- A parent expense deletion only unlinks its independent reimbursement.
 -- Retain the actual transfer, accounts, amount, date and original audit fields.
 IF TG_OP='UPDATE' AND pg_trigger_depth()>1
  AND OLD."Entry Origin"='Manual' AND OLD."Movement Type"='Expense Reimbursement'
  AND OLD."Ref Business Expense" IS NOT NULL AND NEW."Ref Business Expense" IS NULL
  AND (to_jsonb(NEW)-'Ref Business Expense')=(to_jsonb(OLD)-'Ref Business Expense')
  AND NOT EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Row ID"=OLD."Ref Business Expense") THEN
  NEW."Notes":=concat_ws(E'\n',nullif(OLD."Notes",''),'R051: original expense deleted; retained reimbursement source ID: '||OLD."Ref Business Expense");
  NEW."Updated At":=clock_timestamp() AT TIME ZONE 'Asia/Bangkok';
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN
  IF OLD."Entry Origin"='System' AND pg_trigger_depth()>=2 THEN RETURN OLD; END IF;
  IF OLD."Entry Origin"='Manual' AND OLD."Movement Type" IN ('Cash Handover','Expense Reimbursement') THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Cash movements are retained; use a documented correction';
 END IF;
 NEW."Ref From Cash Holder":=nullif(btrim(NEW."Ref From Cash Holder"),'');
 NEW."Ref To Cash Holder":=nullif(btrim(NEW."Ref To Cash Holder"),'');
 NEW."Ref Payment":=nullif(btrim(NEW."Ref Payment"),'');
 NEW."Ref Loan":=nullif(btrim(NEW."Ref Loan"),'');
 NEW."Ref Business Expense":=nullif(btrim(NEW."Ref Business Expense"),'');
 NEW."Ref Settlement":=nullif(btrim(NEW."Ref Settlement"),'');
 IF TG_OP='UPDATE' THEN
  IF NEW."Row ID" IS DISTINCT FROM OLD."Row ID" OR NEW."Entry Origin" IS DISTINCT FROM OLD."Entry Origin"
   OR NEW."Source Type" IS DISTINCT FROM OLD."Source Type" OR NEW."Source Key" IS DISTINCT FROM OLD."Source Key"
   OR NEW."Created At" IS DISTINCT FROM OLD."Created At" OR NEW."Created By" IS DISTINCT FROM OLD."Created By" THEN
   RAISE EXCEPTION 'Cash identity, source and creation audit are immutable';
  END IF;
 END IF;
 IF NEW."Entry Origin"='System' THEN
  IF pg_trigger_depth()<2 THEN RAISE EXCEPTION 'System cash movements must be changed through their source'; END IF;
 ELSE
  NEW."Source Type":='Manual';
  NEW."Source Key":='MANUAL:'||NEW."Row ID";
  IF NEW."Movement Type"='Cash Handover' THEN
   IF (NEW."Ref From Cash Holder"=NEW."Ref To Cash Holder" AND NEW."Ref From Cash Account" IS DISTINCT FROM NEW."Ref To Cash Account" AND NEW."Ref From Cash Account" IS NOT NULL AND NEW."Ref To Cash Account" IS NOT NULL) IS NOT TRUE AND (NEW."Ref From Cash Holder"='ch:dad' AND NEW."Ref To Cash Holder"='ch:lisa') IS NOT TRUE
    AND (NEW."Ref From Cash Holder"='ch:lisa' AND NEW."Ref To Cash Holder"='ch:dad') IS NOT TRUE THEN
    RAISE EXCEPTION 'Cash handover requires Dad/Lisa endpoints or two distinct accounts of one holder';
   END IF;
   IF NEW."Ref Business Expense" IS NOT NULL THEN RAISE EXCEPTION 'Only reimbursement may link a business expense'; END IF;
  ELSIF NEW."Movement Type"='Expense Reimbursement' THEN
   IF (NEW."Ref From Cash Holder"='ch:lisa' AND NEW."Ref To Cash Holder"='ch:tommy') IS NOT TRUE THEN
    RAISE EXCEPTION 'Expense reimbursement must be Lisa to Tommy';
   END IF;
   IF NEW."Ref Business Expense" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."Business Expenses"
    WHERE "Row ID"=NEW."Ref Business Expense" AND "Amount"::numeric>0 AND "Ref Paid By Cash Holder"='ch:tommy') THEN
    RAISE EXCEPTION 'Linked reimbursement expense must have been paid by Tommy';
   END IF;
  ELSIF NEW."Movement Type" IN ('Opening Balance','Manual Correction') THEN
   -- Deliberate SQL administration only: no normal app form exposes these types.
   -- An explicit transaction-local setting is required even for database operators.
   IF current_setting('r005.allow_cash_adjustment',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Opening balance and manual correction require controlled SQL administration';
   END IF;
   IF nullif(btrim(NEW."Notes"),'') IS NULL THEN RAISE EXCEPTION 'Controlled cash adjustment requires notes'; END IF;
   IF NEW."Ref Business Expense" IS NOT NULL THEN RAISE EXCEPTION 'Only reimbursement may link a business expense'; END IF;
  ELSE RAISE EXCEPTION 'Manual entry cannot use a system cash movement type';
  END IF;
  IF EXISTS(SELECT 1 FROM public."Cash Holders" WHERE "Row ID" IN (NEW."Ref From Cash Holder",NEW."Ref To Cash Holder") AND NOT "Active") THEN
   RAISE EXCEPTION 'Manual transfers require active cash holders';
  END IF;
 END IF;
 IF TG_OP='INSERT' THEN
  -- Existing transaction timestamp: receipts inherit the source payment's supplied
  -- transfer time. Other flows retain their current server-time behavior.
  IF NEW."Entry Origin"='System' AND NEW."Source Type"='Payment' THEN
   SELECT coalesce(p."Created At",CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')
    INTO NEW."Created At" FROM public."Payments" p WHERE p."Row ID"=NEW."Ref Payment";
  ELSE
   NEW."Created At":=CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok';
  END IF;
 END IF;
 NEW."Updated At":=clock_timestamp() AT TIME ZONE 'Asia/Bangkok';
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION assessment_lab.calculate_row() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE j jsonb; r record; started timestamptz:=clock_timestamp();
BEGIN

 -- FK unlink after borrower deletion preserves the last assessment snapshot.
 IF TG_OP='UPDATE' AND pg_trigger_depth()>1 AND OLD."Ref Borrower" IS NOT NULL
  AND NEW."Ref Borrower" IS NULL
  AND (to_jsonb(NEW)-'Ref Borrower')=(to_jsonb(OLD)-'Ref Borrower')
  AND NOT EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID"=OLD."Ref Borrower") THEN
  RETURN NEW;
 END IF;
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

CREATE OR REPLACE FUNCTION assessment_lab.stamp_inputs() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN

 -- FK unlink after borrower deletion preserves the last assessment snapshot.
 IF TG_OP='UPDATE' AND pg_trigger_depth()>1 AND OLD."Ref Borrower" IS NOT NULL
  AND NEW."Ref Borrower" IS NULL
  AND (to_jsonb(NEW)-'Ref Borrower')=(to_jsonb(OLD)-'Ref Borrower')
  AND NOT EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID"=OLD."Ref Borrower") THEN
  RETURN NEW;
 END IF;
 NEW."SQL Source Fingerprint":=assessment_lab.fingerprint(assessment_lab.inputs(NEW."Ref Borrower"));
 NEW."SQL Input Borrower":=NEW."Ref Borrower";
 NEW."SQL Input Amount":=NEW."Proposed Loan Amount"::numeric;
 NEW."SQL Input Rate":=NEW."Minimum Daily Profit Rate"::text::numeric;
 RETURN NEW;
END $$;
