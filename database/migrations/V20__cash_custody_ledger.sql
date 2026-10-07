-- R005: custody is separate from capital and profit entitlement.
-- Owner refinement: cash transfer entry/reporting belongs to OLAP.
-- No historical custody inference; snapshot identities only at atomic cutover.
LOCK TABLE public."Payments", public."Loans", public."Business Expenses", public."Settlements" IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public."Cash Holders" (
 "Row ID" text PRIMARY KEY,
 "Holder Name" text NOT NULL UNIQUE,
 "Active" boolean NOT NULL DEFAULT true,
 "Sort Order" integer NOT NULL,
 "Created At" timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')
);
INSERT INTO public."Cash Holders"("Row ID","Holder Name","Sort Order") VALUES
 ('ch:dad','Dad',1),('ch:lisa','Lisa',2),('ch:tommy','Tommy',3);

-- SQL-only metadata, expressly approved by owner. Never add to AppSheet.
CREATE TABLE public.r005_cash_cutover_sources (
 source_type text NOT NULL CHECK(source_type IN ('Payment','Loan','Business Expense','Settlement')),
 source_row_id text NOT NULL,
 PRIMARY KEY(source_type,source_row_id)
);
INSERT INTO public.r005_cash_cutover_sources
 SELECT 'Payment',"Row ID" FROM public."Payments"
 UNION ALL SELECT 'Loan',"Row ID" FROM public."Loans"
 UNION ALL SELECT 'Business Expense',"Row ID" FROM public."Business Expenses"
 UNION ALL SELECT 'Settlement',"Row ID" FROM public."Settlements" WHERE "Status"='Completed';
COMMENT ON TABLE public.r005_cash_cutover_sources IS
 'R005 immutable pre-cutover identities excluded from custody synchronization. Existing pending settlements are intentionally eligible. SQL only, no amounts or personal attributes.';
CREATE FUNCTION public.protect_cash_cutover() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'R005 cutover identities are immutable'; END $$;
CREATE TRIGGER protect_cash_cutover BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE
 ON public.r005_cash_cutover_sources FOR EACH STATEMENT EXECUTE FUNCTION public.protect_cash_cutover();

ALTER TABLE public."Payments" ADD COLUMN "Ref Received By Cash Holder" text
 REFERENCES public."Cash Holders"("Row ID") ON DELETE RESTRICT;
-- SET DEFAULT after ADD preserves historical NULLs.
ALTER TABLE public."Payments" ALTER COLUMN "Ref Received By Cash Holder" SET DEFAULT 'ch:dad';
ALTER TABLE public."Business Expenses" ADD COLUMN "Ref Paid By Cash Holder" text
 REFERENCES public."Cash Holders"("Row ID") ON DELETE RESTRICT;

CREATE TABLE public."Cash Ledger" (
 "Row ID" text PRIMARY KEY,
 "Movement Date" date NOT NULL,
 "Movement Type" text NOT NULL,
 "Amount" numeric NOT NULL CHECK("Amount">0 AND "Amount"<'Infinity'::numeric AND "Amount"=trunc("Amount")),
 "Ref From Cash Holder" text REFERENCES public."Cash Holders"("Row ID") ON DELETE RESTRICT,
 "Ref To Cash Holder" text REFERENCES public."Cash Holders"("Row ID") ON DELETE RESTRICT,
 "Ref Payment" text REFERENCES public."Payments"("Row ID") ON DELETE RESTRICT,
 "Ref Loan" text REFERENCES public."Loans"("Row ID") ON DELETE RESTRICT,
 "Ref Business Expense" text REFERENCES public."Business Expenses"("Row ID") ON DELETE RESTRICT,
 "Ref Settlement" text REFERENCES public."Settlements"("Row ID") ON DELETE RESTRICT,
 "Entry Origin" text NOT NULL DEFAULT 'Manual' CHECK("Entry Origin" IN ('System','Manual')),
 "Source Type" text NOT NULL DEFAULT 'Manual',
 "Source Key" text NOT NULL,
 "Notes" text,
 "Created At" timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok'),
 "Created By" text NOT NULL DEFAULT 'SQL',
 "Updated At" timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok'),
 CONSTRAINT cash_ledger_direction CHECK(
  coalesce("Ref From Cash Holder","Ref To Cash Holder") IS NOT NULL
  AND "Ref From Cash Holder" IS DISTINCT FROM "Ref To Cash Holder"),
 CONSTRAINT cash_ledger_source CHECK(
  ("Entry Origin"='Manual' AND "Source Type"='Manual' AND "Source Key"='MANUAL:'||"Row ID"
   AND "Ref Payment" IS NULL AND "Ref Loan" IS NULL AND "Ref Settlement" IS NULL
   AND "Movement Type" IN ('Cash Handover','Expense Reimbursement','Opening Balance','Manual Correction'))
  OR ("Entry Origin"='System' AND (
   ("Source Type"='Payment' AND "Movement Type"='Payment Receipt' AND "Source Key"='PAYMENT:'||"Ref Payment"
    AND "Ref Payment" IS NOT NULL AND num_nonnulls("Ref Payment","Ref Loan","Ref Business Expense","Ref Settlement")=1)
   OR ("Source Type"='Loan' AND "Movement Type"='Loan Disbursement' AND "Source Key"='LOAN:'||"Ref Loan"
    AND "Ref Loan" IS NOT NULL AND num_nonnulls("Ref Payment","Ref Loan","Ref Business Expense","Ref Settlement")=1)
   OR ("Source Type"='Business Expense' AND "Movement Type"='Business Expense' AND "Source Key"='EXPENSE:'||"Ref Business Expense"
    AND "Ref Business Expense" IS NOT NULL AND num_nonnulls("Ref Payment","Ref Loan","Ref Business Expense","Ref Settlement")=1)
   OR ("Source Type"='Settlement' AND "Movement Type"='Partner Settlement' AND "Source Key"='SETTLEMENT:'||"Ref Settlement"
    AND "Ref Settlement" IS NOT NULL AND num_nonnulls("Ref Payment","Ref Loan","Ref Business Expense","Ref Settlement")=1)
  )))
);
CREATE UNIQUE INDEX cash_ledger_system_source ON public."Cash Ledger"("Source Type","Source Key") WHERE "Entry Origin"='System';
CREATE INDEX cash_ledger_from_date ON public."Cash Ledger"("Ref From Cash Holder","Movement Date");
CREATE INDEX cash_ledger_to_date ON public."Cash Ledger"("Ref To Cash Holder","Movement Date");
CREATE INDEX cash_ledger_expense ON public."Cash Ledger"("Ref Business Expense");

CREATE FUNCTION public.guard_cash_ledger() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD."Entry Origin"='System' AND pg_trigger_depth()>=2 THEN RETURN OLD; END IF;
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
   IF (NEW."Ref From Cash Holder"='ch:dad' AND NEW."Ref To Cash Holder"='ch:lisa') IS NOT TRUE
    AND (NEW."Ref From Cash Holder"='ch:lisa' AND NEW."Ref To Cash Holder"='ch:dad') IS NOT TRUE THEN
    RAISE EXCEPTION 'Cash handover must be Dad to Lisa or Lisa to Dad';
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
 IF TG_OP='INSERT' THEN NEW."Created At":=CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok'; END IF;
 NEW."Updated At":=clock_timestamp() AT TIME ZONE 'Asia/Bangkok';
 RETURN NEW;
END $$;
CREATE TRIGGER guard_cash_ledger BEFORE INSERT OR UPDATE OR DELETE ON public."Cash Ledger"
 FOR EACH ROW EXECUTE FUNCTION public.guard_cash_ledger();

CREATE FUNCTION public.guard_source_cash_holder() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE legacy boolean;
BEGIN
 SELECT EXISTS(SELECT 1 FROM public.r005_cash_cutover_sources WHERE source_type=
  CASE TG_TABLE_NAME WHEN 'Payments' THEN 'Payment' ELSE 'Business Expense' END AND source_row_id=NEW."Row ID") INTO legacy;
 IF TG_TABLE_NAME='Payments' THEN
  NEW."Ref Received By Cash Holder":=nullif(btrim(NEW."Ref Received By Cash Holder"),'');
  IF TG_OP='INSERT' AND NEW."Allocation Method"='First-day Auto' THEN NEW."Ref Received By Cash Holder":='ch:lisa'; END IF;
  IF NEW."Ref Received By Cash Holder" IS NOT NULL AND NEW."Ref Received By Cash Holder" NOT IN ('ch:dad','ch:lisa') THEN
   RAISE EXCEPTION 'Receipt receiver must be Dad or Lisa';
  END IF;
  IF NEW."Allocation Method"='First-day Auto' AND NEW."Ref Received By Cash Holder" IS DISTINCT FROM 'ch:lisa'
   AND NOT (legacy AND NEW."Ref Received By Cash Holder" IS NULL) THEN
   RAISE EXCEPTION 'First-day receipt cash holder is fixed to Lisa';
  END IF;
  IF NOT legacy THEN
   IF NEW."Ref Received By Cash Holder" IS NULL OR NEW."Ref Received By Cash Holder" NOT IN ('ch:dad','ch:lisa') THEN
    RAISE EXCEPTION 'New receipts require Dad or Lisa as receiver';
   END IF;
  END IF;
 ELSE
  NEW."Ref Paid By Cash Holder":=nullif(btrim(NEW."Ref Paid By Cash Holder"),'');
  IF TG_OP='INSERT' AND NEW."Source Type"='Referral Rebate' THEN NEW."Ref Paid By Cash Holder":='ch:lisa'; END IF;
  IF NOT legacy THEN
   IF NEW."Source Type"='Referral Rebate' AND NEW."Ref Paid By Cash Holder" IS DISTINCT FROM 'ch:lisa' THEN
    RAISE EXCEPTION 'Referral rebate cash payer is fixed to Lisa';
   END IF;
   IF NEW."Amount"::numeric>0 AND NEW."Ref Paid By Cash Holder" IS NULL THEN
    RAISE EXCEPTION 'New positive expenses require an explicit cash payer';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
-- Sort before existing calculation/receipt guards; do not replace financial logic.
CREATE TRIGGER aa_cash_holder BEFORE INSERT OR UPDATE ON public."Payments" FOR EACH ROW EXECUTE FUNCTION public.guard_source_cash_holder();
CREATE TRIGGER aa_cash_holder BEFORE INSERT OR UPDATE ON public."Business Expenses" FOR EACH ROW EXECUTE FUNCTION public.guard_source_cash_holder();

CREATE FUNCTION public.guard_cash_source_identity() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW."Row ID" IS DISTINCT FROM OLD."Row ID" THEN RAISE EXCEPTION 'Cash source Row ID is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aa_cash_identity BEFORE UPDATE OF "Row ID" ON public."Payments" FOR EACH ROW EXECUTE FUNCTION public.guard_cash_source_identity();
CREATE TRIGGER aa_cash_identity BEFORE UPDATE OF "Row ID" ON public."Loans" FOR EACH ROW EXECUTE FUNCTION public.guard_cash_source_identity();
CREATE TRIGGER aa_cash_identity BEFORE UPDATE OF "Row ID" ON public."Business Expenses" FOR EACH ROW EXECUTE FUNCTION public.guard_cash_source_identity();
CREATE TRIGGER aa_cash_identity BEFORE UPDATE OF "Row ID" ON public."Settlements" FOR EACH ROW EXECUTE FUNCTION public.guard_cash_source_identity();
CREATE TRIGGER aa_cash_identity BEFORE UPDATE OF "Row ID" ON public."Cash Holders" FOR EACH ROW EXECUTE FUNCTION public.guard_cash_source_identity();

CREATE FUNCTION public.sync_cash_ledger(p_type text,p_id text) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE d date; amount numeric; from_holder text; to_holder text; movement text; source_key text; actor text;
 payment_id text; loan_id text; expense_id text; settlement_id text;
BEGIN
 IF pg_trigger_depth()<1 THEN RAISE EXCEPTION 'Cash synchronization requires a source trigger'; END IF;
 IF EXISTS(SELECT 1 FROM public.r005_cash_cutover_sources WHERE source_type=p_type AND source_row_id=p_id) THEN RETURN; END IF;
 CASE p_type
 WHEN 'Payment' THEN
  SELECT "Payment Date","Amount Received"::numeric,"Ref Received By Cash Holder","Created By"
   INTO d,amount,to_holder,actor FROM public."Payments" WHERE "Row ID"=p_id AND "Status"='Posted' FOR UPDATE;
  movement:='Payment Receipt'; source_key:='PAYMENT:'||p_id; payment_id:=p_id;
 WHEN 'Loan' THEN
  SELECT "Loan Date","Principal Amount"::numeric INTO d,amount FROM public."Loans" WHERE "Row ID"=p_id FOR UPDATE;
  movement:='Loan Disbursement'; source_key:='LOAN:'||p_id; loan_id:=p_id; from_holder:='ch:lisa';
 WHEN 'Business Expense' THEN
  SELECT "Expense Date",abs("Amount"::numeric),CASE WHEN "Amount"::numeric>0 THEN "Ref Paid By Cash Holder" END,
   CASE WHEN "Amount"::numeric<0 THEN "Ref Paid By Cash Holder" END,"Created By"
   INTO d,amount,from_holder,to_holder,actor FROM public."Business Expenses" WHERE "Row ID"=p_id FOR UPDATE;
  IF coalesce(from_holder,to_holder) IS NULL THEN amount:=NULL; END IF;
  movement:='Business Expense'; source_key:='EXPENSE:'||p_id; expense_id:=p_id;
 WHEN 'Settlement' THEN
  SELECT "Transfer Date","Amount"::numeric INTO d,amount FROM public."Settlements" WHERE "Row ID"=p_id AND "Status"='Completed' FOR UPDATE;
  movement:='Partner Settlement'; source_key:='SETTLEMENT:'||p_id; settlement_id:=p_id; from_holder:='ch:lisa';
 ELSE RAISE EXCEPTION 'Unsupported cash source';
 END CASE;
 IF amount IS NULL THEN
  -- Derived projection follows source qualification, never a manual deletion path.
  DELETE FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"=p_type AND "Source Key"=source_key;
  RETURN;
 END IF;
 IF d IS NULL THEN RAISE EXCEPTION 'Qualifying cash source requires its effective movement date'; END IF;
 INSERT INTO public."Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder",
  "Ref Payment","Ref Loan","Ref Business Expense","Ref Settlement","Entry Origin","Source Type","Source Key","Created By")
 VALUES('cash:'||source_key,d,movement,amount,from_holder,to_holder,payment_id,loan_id,expense_id,settlement_id,'System',p_type,source_key,coalesce(nullif(actor,''),'SQL'))
 ON CONFLICT ("Source Type","Source Key") WHERE "Entry Origin"='System' DO UPDATE SET
  "Movement Date"=EXCLUDED."Movement Date","Amount"=EXCLUDED."Amount",
  "Ref From Cash Holder"=EXCLUDED."Ref From Cash Holder","Ref To Cash Holder"=EXCLUDED."Ref To Cash Holder"
 WHERE ("Cash Ledger"."Movement Date","Cash Ledger"."Amount","Cash Ledger"."Ref From Cash Holder","Cash Ledger"."Ref To Cash Holder")
  IS DISTINCT FROM (EXCLUDED."Movement Date",EXCLUDED."Amount",EXCLUDED."Ref From Cash Holder",EXCLUDED."Ref To Cash Holder");
END $$;
CREATE FUNCTION public.cash_source_changed() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN PERFORM public.sync_cash_ledger(TG_ARGV[0],NEW."Row ID"); RETURN NULL; END $$;
-- The authoritative row is re-read after existing synchronous receipt processing.
CREATE TRIGGER zz_cash_source AFTER INSERT OR UPDATE OF "Status","Amount Received","Payment Date","Ref Borrower","Ref Received By Cash Holder","Allocation Method"
 ON public."Payments" FOR EACH ROW EXECUTE FUNCTION public.cash_source_changed('Payment');
CREATE TRIGGER zz_cash_source AFTER INSERT OR UPDATE OF "Principal Amount","Loan Date"
 ON public."Loans" FOR EACH ROW EXECUTE FUNCTION public.cash_source_changed('Loan');
CREATE TRIGGER zz_cash_source AFTER INSERT OR UPDATE OF "Amount","Expense Date","Ref Paid By Cash Holder"
 ON public."Business Expenses" FOR EACH ROW EXECUTE FUNCTION public.cash_source_changed('Business Expense');
CREATE TRIGGER zz_cash_source AFTER INSERT OR UPDATE OF "Status","Amount","Transfer Date","Ref Partner"
 ON public."Settlements" FOR EACH ROW EXECUTE FUNCTION public.cash_source_changed('Settlement');

CREATE VIEW public."Cash Holder Balances" AS
 WITH flows AS (
  SELECT "Ref To Cash Holder" holder,"Amount" cash_in,0::numeric cash_out FROM public."Cash Ledger" WHERE "Ref To Cash Holder" IS NOT NULL
  UNION ALL SELECT "Ref From Cash Holder",0::numeric,"Amount" FROM public."Cash Ledger" WHERE "Ref From Cash Holder" IS NOT NULL
 ), totals AS (SELECT holder,sum(cash_in) cash_in,sum(cash_out) cash_out FROM flows GROUP BY holder)
 SELECT h."Row ID" AS "Ref Cash Holder",h."Holder Name",coalesce(t.cash_in,0) AS "Cash In",coalesce(t.cash_out,0) AS "Cash Out",
  coalesce(t.cash_in,0)-coalesce(t.cash_out,0) AS "Current Balance",
  greatest(coalesce(t.cash_in,0)-coalesce(t.cash_out,0),0) AS "Business Cash Held",
  greatest(coalesce(t.cash_out,0)-coalesce(t.cash_in,0),0) AS "Reimbursement / Advance Due"
 FROM public."Cash Holders" h LEFT JOIN totals t ON t.holder=h."Row ID";
