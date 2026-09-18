-- R008: additive cash location dimensions; never infer historical account allocation.
-- Apply only as a coordinated DEV/app rollout, or an explicitly approved frozen release.
LOCK TABLE public."Borrowers", public."Charges", public."Loans", public."Payments",
 public."Business Expenses", public."Settlements", public."Cash Ledger" IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public."Cash Accounts" (
 "Row ID" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
 "Ref Cash Holder" text NOT NULL REFERENCES public."Cash Holders"("Row ID") ON DELETE RESTRICT,
 "Account Label" text NOT NULL CHECK (btrim("Account Label")<>''),
 "Bank Name" text NOT NULL CHECK (btrim("Bank Name")<>''),
 "Account Number" text,
 "Default Account" boolean NOT NULL DEFAULT false,
 "Active" boolean NOT NULL DEFAULT true,
 "Sort Order" integer NOT NULL DEFAULT 1,
 "Created At" timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok'),
 UNIQUE ("Ref Cash Holder","Account Label"),
 CHECK (NOT "Default Account" OR "Active")
);
CREATE UNIQUE INDEX cash_account_one_default ON public."Cash Accounts"("Ref Cash Holder")
 WHERE "Active" AND "Default Account";

CREATE FUNCTION public.guard_cash_account() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Cash accounts are retained; deactivate instead'; END IF;
 IF TG_OP='UPDATE' AND (NEW."Row ID",NEW."Ref Cash Holder",NEW."Created At") IS DISTINCT FROM
 (OLD."Row ID",OLD."Ref Cash Holder",OLD."Created At") THEN
  RAISE EXCEPTION 'Cash account identity, holder and creation time are immutable';
 END IF;
 -- Try-lock serializes default changes without waiting behind a transfer holding an account.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('cash-account:'||NEW."Ref Cash Holder",0)) THEN
  RAISE EXCEPTION 'Cash accounts are busy; sync and retry';
 END IF;
 IF NOT NEW."Active" AND NEW."Default Account" THEN
  RAISE EXCEPTION 'An inactive cash account cannot be default';
 END IF;
 IF TG_OP='UPDATE' AND OLD."Default Account" AND NOT NEW."Active" AND EXISTS
  (SELECT 1 FROM public."Cash Accounts" WHERE "Ref Cash Holder"=NEW."Ref Cash Holder"
   AND "Row ID"<>NEW."Row ID" AND "Active") THEN
  RAISE EXCEPTION 'Select a replacement default before deactivating this account';
 END IF;
 IF NEW."Active" AND (TG_OP='INSERT' OR NOT OLD."Active") AND NOT EXISTS(SELECT 1 FROM public."Cash Accounts"
  WHERE "Ref Cash Holder"=NEW."Ref Cash Holder" AND "Active" AND "Row ID"<>NEW."Row ID") THEN
  NEW."Default Account":=true;
 END IF;
 IF NEW."Default Account" THEN
  UPDATE public."Cash Accounts" SET "Default Account"=false
  WHERE "Ref Cash Holder"=NEW."Ref Cash Holder" AND "Row ID"<>NEW."Row ID" AND "Default Account";
 END IF;
 RETURN NEW;
END $$;

CREATE TRIGGER guard_cash_account BEFORE INSERT OR UPDATE OR DELETE ON public."Cash Accounts"
 FOR EACH ROW EXECUTE FUNCTION public.guard_cash_account();

ALTER TABLE public."Borrowers"
 ADD COLUMN "Ref Preferred Receiving Cash Account" text REFERENCES public."Cash Accounts"("Row ID") ON DELETE RESTRICT,
 ADD COLUMN "Payment Request Cash Account" text REFERENCES public."Cash Accounts"("Row ID") ON DELETE RESTRICT,
 ADD COLUMN "Payment Request Token" text;
ALTER TABLE public."Charges"
 ADD COLUMN "Payment Request Cash Account" text REFERENCES public."Cash Accounts"("Row ID") ON DELETE RESTRICT,
 ADD COLUMN "Payment Request Token" text;
ALTER TABLE public."Loans"
 ADD COLUMN "Ref Disbursed From Cash Account" text REFERENCES public."Cash Accounts"("Row ID") ON DELETE RESTRICT,
 ADD COLUMN "Payment Request Cash Account" text REFERENCES public."Cash Accounts"("Row ID") ON DELETE RESTRICT,
 ADD COLUMN "Payment Request Token" text;
ALTER TABLE public."Payments" ADD COLUMN "Ref Received By Cash Account" text
 REFERENCES public."Cash Accounts"("Row ID") ON DELETE RESTRICT;
ALTER TABLE public."Business Expenses" ADD COLUMN "Ref Paid By Cash Account" text
 REFERENCES public."Cash Accounts"("Row ID") ON DELETE RESTRICT;
ALTER TABLE public."Settlements" ADD COLUMN "Ref Paid From Cash Account" text
 REFERENCES public."Cash Accounts"("Row ID") ON DELETE RESTRICT;
ALTER TABLE public."Cash Ledger"
 ADD COLUMN "Ref From Cash Account" text REFERENCES public."Cash Accounts"("Row ID") ON DELETE RESTRICT,
 ADD COLUMN "Ref To Cash Account" text REFERENCES public."Cash Accounts"("Row ID") ON DELETE RESTRICT;
CREATE INDEX cash_ledger_from_account ON public."Cash Ledger"("Ref From Cash Account");
CREATE INDEX cash_ledger_to_account ON public."Cash Ledger"("Ref To Cash Account");

-- Ordinary payments derive holder from an explicitly selected account. No historical update.
ALTER TABLE public."Payments" ALTER COLUMN "Ref Received By Cash Holder" DROP DEFAULT;

CREATE FUNCTION public.cash_account_holder(p_account text,p_active boolean DEFAULT true) RETURNS text
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE holder text;
BEGIN
 SELECT a."Ref Cash Holder" INTO holder FROM public."Cash Accounts" a
 JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder"
 WHERE a."Row ID"=p_account AND (NOT p_active OR (a."Active" AND h."Active")) FOR SHARE OF a,h;
 IF NOT FOUND THEN RAISE EXCEPTION 'A valid active cash account is required'; END IF;
 RETURN holder;
END $$;
CREATE FUNCTION public.default_cash_account(p_holder text) RETURNS text
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT a."Row ID" FROM public."Cash Accounts" a JOIN public."Cash Holders" h
 ON h."Row ID"=a."Ref Cash Holder" WHERE a."Ref Cash Holder"=p_holder
 AND a."Active" AND a."Default Account" AND h."Active";
$$;
CREATE FUNCTION public.receiving_cash_account(p_borrower text) RETURNS text
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT coalesce((SELECT a."Row ID" FROM public."Borrowers" b JOIN public."Cash Accounts" a
  ON a."Row ID"=b."Ref Preferred Receiving Cash Account" JOIN public."Cash Holders" h
  ON h."Row ID"=a."Ref Cash Holder" WHERE b."Row ID"=p_borrower AND a."Active" AND h."Active"),
  public.default_cash_account('ch:dad'));
$$;

CREATE FUNCTION public.guard_source_cash_account() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE account_id text; holder text; selected_holder text; old_account text;
 required_account boolean:=false; changed boolean:=false;
BEGIN
 IF TG_TABLE_NAME='Payments' THEN
  account_id:=nullif(btrim(NEW."Ref Received By Cash Account"),'');
  selected_holder:=nullif(btrim(NEW."Ref Received By Cash Holder"),'');
  IF TG_OP='INSERT' AND NEW."Allocation Method"='First-day Auto' THEN
   SELECT l."Ref Disbursed From Cash Account" INTO account_id FROM public."Charges" c
    JOIN public."Loans" l ON l."Row ID"=c."Ref Loans" WHERE c."Row ID"=NEW."Ref Target Charge";
   account_id:=coalesce(account_id,public.default_cash_account('ch:lisa'));
   selected_holder:='ch:lisa';
  END IF;
  IF TG_OP='UPDATE' THEN
   old_account:=OLD."Ref Received By Cash Account";
   changed:=(account_id,selected_holder) IS DISTINCT FROM (old_account,OLD."Ref Received By Cash Holder");
   -- R005 permits custody-only correction. Require an appended explanation and retain
   -- allocations/repayments; the existing receipt guard still protects financial facts.
   IF changed AND OLD."Status"='Posted' AND (NEW."Notes" IS NOT DISTINCT FROM OLD."Notes"
    OR nullif(btrim(NEW."Notes"),'') IS NULL
    OR left(NEW."Notes",length(coalesce(OLD."Notes",'')))<>coalesce(OLD."Notes",'')) THEN
    RAISE EXCEPTION 'Posted account correction requires an appended audit note';
   END IF;
  END IF;
  required_account:=TG_OP='INSERT' OR changed OR old_account IS NOT NULL;
 ELSIF TG_TABLE_NAME='Loans' THEN
  account_id:=nullif(btrim(NEW."Ref Disbursed From Cash Account"),''); selected_holder:='ch:lisa';
  IF TG_OP='UPDATE' THEN
   old_account:=OLD."Ref Disbursed From Cash Account";
   IF account_id IS DISTINCT FROM old_account THEN RAISE EXCEPTION 'Posted disbursement account is immutable'; END IF;
  END IF;
  required_account:=TG_OP='INSERT';
 ELSIF TG_TABLE_NAME='Business Expenses' THEN
  account_id:=nullif(btrim(NEW."Ref Paid By Cash Account"),'');
  selected_holder:=nullif(btrim(NEW."Ref Paid By Cash Holder"),'');
  IF TG_OP='INSERT' AND NEW."Source Type"='Referral Rebate' THEN
   account_id:=coalesce(account_id,public.default_cash_account('ch:lisa')); selected_holder:='ch:lisa';
  END IF;
  IF TG_OP='UPDATE' THEN
   old_account:=OLD."Ref Paid By Cash Account";
   IF account_id IS DISTINCT FROM old_account THEN RAISE EXCEPTION 'Posted expense account is immutable'; END IF;
  END IF;
  -- R005 negative accounting-only adjustments have no holder/account movement.
  required_account:=TG_OP='INSERT' AND (NEW."Amount"::numeric>0 OR selected_holder IS NOT NULL);
 ELSE
  account_id:=nullif(btrim(NEW."Ref Paid From Cash Account"),''); selected_holder:='ch:lisa';
  IF TG_OP='UPDATE' THEN
   old_account:=OLD."Ref Paid From Cash Account";
   IF OLD."Status" IN ('Completed','Cancelled') AND account_id IS DISTINCT FROM old_account THEN
    RAISE EXCEPTION 'Completed settlement account is immutable';
   END IF;
   required_account:=NEW."Status"='Completed' AND OLD."Status" IS DISTINCT FROM 'Completed';
  ELSE required_account:=NEW."Status"='Completed'; END IF;
 END IF;
 IF account_id IS NULL AND required_account THEN RAISE EXCEPTION 'A cash account is required for this new cash movement'; END IF;
 IF account_id IS NOT NULL THEN
  holder:=public.cash_account_holder(account_id,TG_OP='INSERT' OR required_account AND
    (TG_OP<>'UPDATE' OR account_id IS DISTINCT FROM old_account) OR
    (TG_TABLE_NAME='Settlements' AND required_account));
  IF selected_holder IS NOT NULL AND selected_holder IS DISTINCT FROM holder THEN
   RAISE EXCEPTION 'Cash holder and account disagree';
  END IF;
  IF TG_TABLE_NAME='Payments' THEN
   IF NEW."Allocation Method"='First-day Auto' AND holder<>'ch:lisa' THEN RAISE EXCEPTION 'First-day account must belong to Lisa'; END IF;
   NEW."Ref Received By Cash Account":=account_id; NEW."Ref Received By Cash Holder":=holder;
  ELSIF TG_TABLE_NAME='Loans' THEN NEW."Ref Disbursed From Cash Account":=account_id;
  ELSIF TG_TABLE_NAME='Business Expenses' THEN
   NEW."Ref Paid By Cash Account":=account_id; NEW."Ref Paid By Cash Holder":=holder;
  ELSE NEW."Ref Paid From Cash Account":=account_id; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a0_cash_account BEFORE INSERT OR UPDATE ON public."Payments" FOR EACH ROW EXECUTE FUNCTION public.guard_source_cash_account();
CREATE TRIGGER a0_cash_account BEFORE INSERT OR UPDATE ON public."Loans" FOR EACH ROW EXECUTE FUNCTION public.guard_source_cash_account();
CREATE TRIGGER a0_cash_account BEFORE INSERT OR UPDATE ON public."Business Expenses" FOR EACH ROW EXECUTE FUNCTION public.guard_source_cash_account();
CREATE TRIGGER a0_cash_account BEFORE INSERT OR UPDATE ON public."Settlements" FOR EACH ROW EXECUTE FUNCTION public.guard_source_cash_account();

-- Preserve the R005 receiver restriction for historical account-less rows; new
-- explicit accounts are governed by their holder, including a Tommy account.
CREATE OR REPLACE FUNCTION public.guard_source_cash_holder() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE legacy boolean;
BEGIN
 SELECT EXISTS(SELECT 1 FROM public.r005_cash_cutover_sources WHERE source_type=
  CASE TG_TABLE_NAME WHEN 'Payments' THEN 'Payment' ELSE 'Business Expense' END AND source_row_id=NEW."Row ID") INTO legacy;
 IF TG_TABLE_NAME='Payments' THEN
  IF NEW."Ref Received By Cash Account" IS NOT NULL THEN RETURN NEW; END IF;
  NEW."Ref Received By Cash Holder":=nullif(btrim(NEW."Ref Received By Cash Holder"),'');
  IF NEW."Ref Received By Cash Holder" IS NOT NULL AND NEW."Ref Received By Cash Holder" NOT IN ('ch:dad','ch:lisa') THEN
   RAISE EXCEPTION 'Legacy receipt receiver must be Dad or Lisa';
  END IF;
  IF NEW."Allocation Method"='First-day Auto' AND NEW."Ref Received By Cash Holder" IS DISTINCT FROM 'ch:lisa'
   AND NOT (legacy AND NEW."Ref Received By Cash Holder" IS NULL) THEN RAISE EXCEPTION 'First-day receipt cash holder is fixed to Lisa'; END IF;
  IF NOT legacy AND NEW."Ref Received By Cash Holder" IS NULL THEN RAISE EXCEPTION 'New receipts require a cash receiver'; END IF;
 ELSE
  NEW."Ref Paid By Cash Holder":=nullif(btrim(NEW."Ref Paid By Cash Holder"),'');
  IF NOT legacy THEN
   IF NEW."Source Type"='Referral Rebate' AND NEW."Ref Paid By Cash Holder" IS DISTINCT FROM 'ch:lisa' THEN
    RAISE EXCEPTION 'Referral rebate cash payer is fixed to Lisa'; END IF;
   IF NEW."Amount"::numeric>0 AND NEW."Ref Paid By Cash Holder" IS NULL THEN RAISE EXCEPTION 'New positive expenses require an explicit cash payer'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;

-- SQL-only immutable baseline. Baseline movement totals are necessary because
-- R005 projections can be reversed/corrected after initialization. Subtracting
-- their captured totals, rather than filtering by Created At, preserves those deltas.
CREATE TABLE public.r008_cash_account_cutover (
 "Ref Cash Account" text PRIMARY KEY REFERENCES public."Cash Accounts"("Row ID") ON DELETE RESTRICT,
 "Cutover At" timestamptz NOT NULL,
 "Opening Balance" numeric NOT NULL CHECK ("Opening Balance">'-Infinity'::numeric AND "Opening Balance"<'Infinity'::numeric AND "Opening Balance"=trunc("Opening Balance")),
 "Baseline Cash In" numeric NOT NULL,
 "Baseline Cash Out" numeric NOT NULL,
 "Created At" timestamptz NOT NULL DEFAULT clock_timestamp(),
 "Created By" text NOT NULL,
 "Notes" text NOT NULL CHECK (btrim("Notes")<>'')
);
CREATE FUNCTION public.protect_account_cutover() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP<>'INSERT' OR current_setting('r008.initializing',true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'Account openings are immutable and require the controlled initializer';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_account_cutover BEFORE INSERT OR UPDATE OR DELETE ON public.r008_cash_account_cutover
 FOR EACH ROW EXECUTE FUNCTION public.protect_account_cutover();
CREATE TRIGGER protect_account_cutover_truncate BEFORE TRUNCATE ON public.r008_cash_account_cutover
 FOR EACH STATEMENT EXECUTE FUNCTION public.protect_account_cutover();

CREATE VIEW public."Cash Account Balances" AS
 WITH flows AS (
 SELECT "Ref To Cash Account" account,"Amount" cash_in,0::numeric cash_out FROM public."Cash Ledger" WHERE "Ref To Cash Account" IS NOT NULL
 UNION ALL SELECT "Ref From Cash Account",0::numeric,"Amount" FROM public."Cash Ledger" WHERE "Ref From Cash Account" IS NOT NULL
 ), totals AS (SELECT account,sum(cash_in) cash_in,sum(cash_out) cash_out FROM flows GROUP BY account),
 balances AS (
 SELECT a."Row ID" AS "Ref Cash Account",a."Ref Cash Holder",h."Holder Name",a."Account Label",
  c."Opening Balance",coalesce(t.cash_in,0)-coalesce(c."Baseline Cash In",0) AS "Cash In",
  coalesce(t.cash_out,0)-coalesce(c."Baseline Cash Out",0) AS "Cash Out",
  c."Opening Balance"+coalesce(t.cash_in,0)-c."Baseline Cash In"-coalesce(t.cash_out,0)+c."Baseline Cash Out" AS "Current Balance",
  c."Ref Cash Account" IS NOT NULL AS "Initialized"
 FROM public."Cash Accounts" a JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder"
 LEFT JOIN totals t ON t.account=a."Row ID" LEFT JOIN public.r008_cash_account_cutover c ON c."Ref Cash Account"=a."Row ID"
 ) SELECT *,CASE WHEN "Initialized" THEN greatest("Current Balance",0) END AS "Business Cash Held",
 CASE WHEN "Initialized" THEN greatest(-"Current Balance",0) END AS "Reimbursement / Advance Due" FROM balances;

CREATE FUNCTION public.initialize_cash_accounts(p_holder text,p_openings jsonb,p_actor text,p_notes text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE balance numeric; total numeric; stamp timestamptz; previous_setting text;
BEGIN
 -- Table locks serialize with source writes; never disable integrity triggers.
 LOCK TABLE public."Payments",public."Loans",public."Business Expenses",public."Settlements",public."Cash Ledger",public."Cash Accounts" IN SHARE ROW EXCLUSIVE MODE;
 IF jsonb_typeof(p_openings) IS DISTINCT FROM 'object' OR nullif(btrim(p_actor),'') IS NULL OR nullif(btrim(p_notes),'') IS NULL THEN
  RAISE EXCEPTION 'Initialization requires account balances, actor and notes'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Cash Accounts" WHERE "Ref Cash Holder"=p_holder) THEN RAISE EXCEPTION 'Holder has no cash accounts'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each_text(p_openings) j JOIN public.r008_cash_account_cutover c ON c."Ref Cash Account"=j.key) THEN
  RAISE EXCEPTION 'Cash account has already been initialized'; END IF;
 IF EXISTS(SELECT 1 FROM public."Cash Accounts" a WHERE "Ref Cash Holder"=p_holder AND NOT p_openings ? "Row ID"
  AND NOT EXISTS(SELECT 1 FROM public.r008_cash_account_cutover c WHERE c."Ref Cash Account"=a."Row ID"))
 OR EXISTS(SELECT 1 FROM jsonb_each_text(p_openings) j LEFT JOIN public."Cash Accounts" a ON a."Row ID"=j.key WHERE a."Ref Cash Holder" IS DISTINCT FROM p_holder) THEN
  RAISE EXCEPTION 'Opening allocation must include exactly all uninitialized accounts of this holder'; END IF;
 SELECT "Current Balance" INTO STRICT balance FROM public."Cash Holder Balances" WHERE "Ref Cash Holder"=p_holder;
 SELECT sum(value::numeric) INTO total FROM jsonb_each_text(p_openings);
 total:=total+coalesce((SELECT sum("Current Balance") FROM public."Cash Account Balances" WHERE "Ref Cash Holder"=p_holder AND "Initialized"),0);
 IF total IS DISTINCT FROM balance THEN RAISE EXCEPTION 'Account openings must sum exactly to the current holder balance'; END IF;
 stamp:=clock_timestamp(); previous_setting:=current_setting('r008.initializing',true);
 PERFORM set_config('r008.initializing','on',true);
 INSERT INTO public.r008_cash_account_cutover("Ref Cash Account","Cutover At","Opening Balance","Baseline Cash In","Baseline Cash Out","Created By","Notes")
 SELECT j.key,stamp,j.value::numeric,
  coalesce((SELECT sum("Amount") FROM public."Cash Ledger" WHERE "Ref To Cash Account"=j.key),0),
  coalesce((SELECT sum("Amount") FROM public."Cash Ledger" WHERE "Ref From Cash Account"=j.key),0),p_actor,p_notes
 FROM jsonb_each_text(p_openings) j;
 PERFORM set_config('r008.initializing',coalesce(previous_setting,''),true);
END $$;

-- Preserve R005 ownership, source and manual adjustment guards.
CREATE OR REPLACE FUNCTION public.guard_cash_ledger() RETURNS trigger
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
 IF TG_OP='INSERT' THEN NEW."Created At":=CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok'; END IF;
 NEW."Updated At":=clock_timestamp() AT TIME ZONE 'Asia/Bangkok';
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sync_cash_ledger(p_type text,p_id text) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE d date; amount numeric; from_holder text; to_holder text; movement text; source_key text; actor text;
 payment_id text; loan_id text; expense_id text; settlement_id text; from_account text; to_account text;
BEGIN
 IF pg_trigger_depth()<1 THEN RAISE EXCEPTION 'Cash synchronization requires a source trigger'; END IF;
 IF EXISTS(SELECT 1 FROM public.r005_cash_cutover_sources WHERE source_type=p_type AND source_row_id=p_id) THEN RETURN; END IF;
 CASE p_type
 WHEN 'Payment' THEN
  SELECT "Payment Date","Amount Received"::numeric,"Ref Received By Cash Holder","Created By","Ref Received By Cash Account"
   INTO d,amount,to_holder,actor,to_account FROM public."Payments" WHERE "Row ID"=p_id AND "Status"='Posted' FOR UPDATE;
  movement:='Payment Receipt'; source_key:='PAYMENT:'||p_id; payment_id:=p_id;
 WHEN 'Loan' THEN
  SELECT "Loan Date","Principal Amount"::numeric,"Ref Disbursed From Cash Account" INTO d,amount,from_account FROM public."Loans" WHERE "Row ID"=p_id FOR UPDATE;
  movement:='Loan Disbursement'; source_key:='LOAN:'||p_id; loan_id:=p_id; from_holder:='ch:lisa';
 WHEN 'Business Expense' THEN
  SELECT "Expense Date",abs("Amount"::numeric),CASE WHEN "Amount"::numeric>0 THEN "Ref Paid By Cash Holder" END,
   CASE WHEN "Amount"::numeric<0 THEN "Ref Paid By Cash Holder" END,"Created By",
   CASE WHEN "Amount"::numeric>0 THEN "Ref Paid By Cash Account" END, CASE WHEN "Amount"::numeric<0 THEN "Ref Paid By Cash Account" END INTO d,amount,from_holder,to_holder,actor,from_account,to_account FROM public."Business Expenses" WHERE "Row ID"=p_id FOR UPDATE;
  IF coalesce(from_holder,to_holder) IS NULL THEN amount:=NULL; END IF;
  movement:='Business Expense'; source_key:='EXPENSE:'||p_id; expense_id:=p_id;
 WHEN 'Settlement' THEN
  SELECT "Transfer Date","Amount"::numeric,"Ref Paid From Cash Account" INTO d,amount,from_account FROM public."Settlements" WHERE "Row ID"=p_id AND "Status"='Completed' FOR UPDATE;
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
  "Ref Payment","Ref Loan","Ref Business Expense","Ref Settlement","Entry Origin","Source Type","Source Key","Created By","Ref From Cash Account","Ref To Cash Account")
 VALUES('cash:'||source_key,d,movement,amount,from_holder,to_holder,payment_id,loan_id,expense_id,settlement_id,'System',p_type,source_key,coalesce(nullif(actor,''),'SQL'),from_account,to_account)
 ON CONFLICT ("Source Type","Source Key") WHERE "Entry Origin"='System' DO UPDATE SET
  "Movement Date"=EXCLUDED."Movement Date","Amount"=EXCLUDED."Amount",
  "Ref From Cash Holder"=EXCLUDED."Ref From Cash Holder","Ref To Cash Holder"=EXCLUDED."Ref To Cash Holder","Ref From Cash Account"=EXCLUDED."Ref From Cash Account","Ref To Cash Account"=EXCLUDED."Ref To Cash Account"
 WHERE ("Cash Ledger"."Movement Date","Cash Ledger"."Amount","Cash Ledger"."Ref From Cash Holder","Cash Ledger"."Ref To Cash Holder","Cash Ledger"."Ref From Cash Account","Cash Ledger"."Ref To Cash Account")
  IS DISTINCT FROM (EXCLUDED."Movement Date",EXCLUDED."Amount",EXCLUDED."Ref From Cash Holder",EXCLUDED."Ref To Cash Holder",EXCLUDED."Ref From Cash Account",EXCLUDED."Ref To Cash Account");
END $$;

ALTER TABLE public."Cash Ledger" DROP CONSTRAINT cash_ledger_direction;
ALTER TABLE public."Cash Ledger" ADD CONSTRAINT cash_ledger_direction CHECK (
 coalesce("Ref From Cash Holder","Ref To Cash Holder") IS NOT NULL AND
 ("Ref From Cash Holder" IS DISTINCT FROM "Ref To Cash Holder" OR
  ("Ref From Cash Account" IS NOT NULL AND "Ref To Cash Account" IS NOT NULL AND "Ref From Cash Account"<>"Ref To Cash Account")));

CREATE FUNCTION public.guard_ledger_cash_accounts() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE changed boolean; holder text;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD."Ref From Cash Account" IS NULL AND OLD."Ref To Cash Account" IS NULL AND EXISTS
   (SELECT 1 FROM public.r008_cash_account_cutover c JOIN public."Cash Accounts" a ON a."Row ID"=c."Ref Cash Account"
    WHERE a."Ref Cash Holder" IN (OLD."Ref From Cash Holder",OLD."Ref To Cash Holder")) THEN
   RAISE EXCEPTION 'Unassigned historical cash reversal requires a reviewed account reconciliation'; END IF;
  RETURN OLD;
 END IF;
 changed:=TG_OP='INSERT';
 IF TG_OP='INSERT' AND NEW."Entry Origin"='System' AND EXISTS
  (SELECT 1 FROM public."Cash Ledger" l WHERE l."Row ID"=NEW."Row ID" AND
   (l."Amount",l."Ref From Cash Holder",l."Ref To Cash Holder",l."Ref From Cash Account",l."Ref To Cash Account") IS NOT DISTINCT FROM
   (NEW."Amount",NEW."Ref From Cash Holder",NEW."Ref To Cash Holder",NEW."Ref From Cash Account",NEW."Ref To Cash Account")) THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN changed:=(NEW."Amount",NEW."Ref From Cash Holder",NEW."Ref To Cash Holder",NEW."Ref From Cash Account",NEW."Ref To Cash Account") IS DISTINCT FROM
 (OLD."Amount",OLD."Ref From Cash Holder",OLD."Ref To Cash Holder",OLD."Ref From Cash Account",OLD."Ref To Cash Account"); END IF;
 IF NOT changed THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW."Entry Origin"='Manual' THEN
  RAISE EXCEPTION 'Posted manual cash movement is immutable; record a compensating transfer'; END IF;
 IF NEW."Ref From Cash Account" IS NOT NULL THEN
  holder:=public.cash_account_holder(NEW."Ref From Cash Account",NEW."Entry Origin"='Manual' OR NOT EXISTS
   (SELECT 1 FROM public."Cash Ledger" WHERE "Row ID"=NEW."Row ID" AND "Ref From Cash Account"=NEW."Ref From Cash Account"));
  IF holder IS DISTINCT FROM NEW."Ref From Cash Holder" THEN RAISE EXCEPTION 'From cash holder and account disagree'; END IF;
 ELSIF NEW."Entry Origin"='Manual' AND NEW."Ref From Cash Holder" IS NOT NULL THEN
  RAISE EXCEPTION 'Manual business outflow requires its cash account';
 END IF;
 IF NEW."Ref To Cash Account" IS NOT NULL THEN
  holder:=public.cash_account_holder(NEW."Ref To Cash Account",NEW."Entry Origin"='Manual' OR NOT EXISTS
   (SELECT 1 FROM public."Cash Ledger" WHERE "Row ID"=NEW."Row ID" AND "Ref To Cash Account"=NEW."Ref To Cash Account"));
  IF holder IS DISTINCT FROM NEW."Ref To Cash Holder" THEN RAISE EXCEPTION 'To cash holder and account disagree'; END IF;
 ELSIF NEW."Entry Origin"='Manual' AND NEW."Ref To Cash Holder" IS NOT NULL THEN
  RAISE EXCEPTION 'Manual business inflow requires its cash account';
 END IF;
 IF NEW."Ref From Cash Account" IS NULL AND NEW."Ref To Cash Account" IS NULL AND EXISTS
  (SELECT 1 FROM public.r008_cash_account_cutover c JOIN public."Cash Accounts" a ON a."Row ID"=c."Ref Cash Account"
   WHERE a."Ref Cash Holder" IN (NEW."Ref From Cash Holder",NEW."Ref To Cash Holder")) THEN
  RAISE EXCEPTION 'Unassigned historical cash change requires a reviewed account reconciliation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a0_ledger_cash_accounts BEFORE INSERT OR UPDATE OR DELETE ON public."Cash Ledger"
 FOR EACH ROW EXECUTE FUNCTION public.guard_ledger_cash_accounts();

DROP TRIGGER zz_cash_source ON public."Payments";
CREATE TRIGGER zz_cash_source AFTER INSERT OR UPDATE OF "Status","Amount Received","Payment Date","Ref Borrower","Ref Received By Cash Holder","Allocation Method","Ref Received By Cash Account"
 ON public."Payments" FOR EACH ROW EXECUTE FUNCTION public.cash_source_changed('Payment');
DROP TRIGGER zz_cash_source ON public."Loans";
CREATE TRIGGER zz_cash_source AFTER INSERT OR UPDATE OF "Principal Amount","Loan Date","Ref Disbursed From Cash Account"
 ON public."Loans" FOR EACH ROW EXECUTE FUNCTION public.cash_source_changed('Loan');
DROP TRIGGER zz_cash_source ON public."Business Expenses";
CREATE TRIGGER zz_cash_source AFTER INSERT OR UPDATE OF "Amount","Expense Date","Ref Paid By Cash Holder","Ref Paid By Cash Account"
 ON public."Business Expenses" FOR EACH ROW EXECUTE FUNCTION public.cash_source_changed('Business Expense');
DROP TRIGGER zz_cash_source ON public."Settlements";
CREATE TRIGGER zz_cash_source AFTER INSERT OR UPDATE OF "Status","Amount","Transfer Date","Ref Partner","Ref Paid From Cash Account"
 ON public."Settlements" FOR EACH ROW EXECUTE FUNCTION public.cash_source_changed('Settlement');

CREATE FUNCTION public.quick_payment_request() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE borrower text; target_charge text; target_loan text; method text; payment_id text;
 request_date date; amount numeric; token text:=NEW."Payment Request Token"; account_id text:=NEW."Payment Request Cash Account";
BEGIN
 IF nullif(token,'') IS NOT DISTINCT FROM nullif(OLD."Payment Request Token",'') THEN RETURN NULL; END IF;
 IF token IS NULL OR token !~ '^\d{4}-\d{2}-\d{2}\|[A-Za-z0-9_-]{8,64}(\|[^|[:space:]]{1,254})?$' THEN
  RAISE EXCEPTION 'Invalid payment request; sync and confirm again'; END IF;
 request_date:=split_part(token,'|',1)::date;
 IF request_date IS DISTINCT FROM (statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date THEN
  RAISE EXCEPTION 'Payment request is stale; sync and confirm again'; END IF;
 PERFORM public.cash_account_holder(account_id,true);
 payment_id:='r008:'||md5(TG_TABLE_NAME||'|'||length(NEW."Row ID")||':'||NEW."Row ID"||'|'||token);
 -- A previously processed nonce remains idempotent even after a later request.
 IF EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"=payment_id AND "Status"='Posted') THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME='Borrowers' THEN borrower:=NEW."Row ID"; method:='Receive All';
 ELSIF TG_TABLE_NAME='Charges' THEN
  target_charge:=NEW."Row ID"; method:='Single Full';
  SELECT "Ref Borrowers" INTO borrower FROM public."Loans" WHERE "Row ID"=NEW."Ref Loans";
 ELSE borrower:=NEW."Ref Borrowers"; target_loan:=NEW."Row ID"; method:='Loan Close'; END IF;
 -- A command already owns its source row. Match V8's NOWAIT borrower guard
 -- to avoid inversion with a receipt owning borrower and waiting on source.
 BEGIN
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=borrower FOR UPDATE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'Borrower is busy; sync and request payment again'; END;
 IF NOT FOUND THEN RAISE EXCEPTION 'Payment borrower does not exist'; END IF;
 PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers"=borrower ORDER BY "Row ID" COLLATE "C" FOR UPDATE NOWAIT;
 PERFORM 1 FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
  WHERE l."Ref Borrowers"=borrower ORDER BY c."Row ID" COLLATE "C" FOR UPDATE OF c NOWAIT;
 IF method='Loan Close' THEN amount:=1; -- prepare_loan_close replaces this inside the same INSERT.
 ELSE
  SELECT sum(c."Principal Due"::numeric+c."Interest Due"::numeric-coalesce(r.paid,0)) INTO amount
  FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
  LEFT JOIN LATERAL (SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric) paid FROM public."Repayments" WHERE "Ref Charges"=c."Row ID") r ON true
  WHERE l."Ref Borrowers"=borrower AND CASE WHEN method='Single Full' THEN c."Row ID"=target_charge ELSE c."Charge Date"<=request_date END;
  IF amount IS NULL OR amount<=0 THEN RAISE EXCEPTION 'No eligible balance remains; sync before receiving'; END IF;
 END IF;
 INSERT INTO public."Payments"("Row ID","Status","Ref Borrower","Payment Date","Payment Method","Allocation Method",
  "Amount Received","Ref Target Charge","Ref Target Loan","Ref Received By Cash Account","Ref Received By Cash Holder","Created At","Created By","Notes")
 VALUES(payment_id,'Processing',borrower,request_date,'Bank Transfer',method,amount::money,target_charge,target_loan,
  account_id,public.cash_account_holder(account_id,true),statement_timestamp() AT TIME ZONE 'Asia/Bangkok',coalesce(nullif(split_part(token,'|',3),''),'R008 AppSheet request'),
  'Account confirmed in quick payment command');
 -- Existing INSERT triggers own final-charge preparation, allocation, repayment and posting.
 RETURN NULL;
END $$;
CREATE TRIGGER quick_payment_request AFTER UPDATE OF "Payment Request Token" ON public."Borrowers" FOR EACH ROW EXECUTE FUNCTION public.quick_payment_request();
CREATE TRIGGER quick_payment_request AFTER UPDATE OF "Payment Request Token" ON public."Charges" FOR EACH ROW EXECUTE FUNCTION public.quick_payment_request();
CREATE TRIGGER quick_payment_request AFTER UPDATE OF "Payment Request Token" ON public."Loans" FOR EACH ROW EXECUTE FUNCTION public.quick_payment_request();

-- R007 binds these consumers to views with explicit output lists. Append new
-- dimensions without rebuilding, renaming or reordering any existing metric.
DO $$
DECLARE spec record; definition text;
BEGIN
 FOR spec IN SELECT * FROM (VALUES
  ('olap_borrowers_analytics','Borrowers','b."Ref Preferred Receiving Cash Account",b."Payment Request Cash Account",b."Payment Request Token"'),
  ('olap_charges_analytics','Charges','b."Payment Request Cash Account",b."Payment Request Token"'),
  ('olap_loans_analytics','Loans','b."Ref Disbursed From Cash Account",b."Payment Request Cash Account",b."Payment Request Token"')
 ) s(view_name,table_name,columns_sql) LOOP
  definition:=rtrim(pg_get_viewdef(format('public.%I',spec.view_name)::regclass,true),E';\n ');
  EXECUTE format('CREATE OR REPLACE VIEW public.%I AS SELECT old_view.*, %s FROM (%s) old_view JOIN public.%I b ON b."Row ID"=old_view."Row ID"',
   spec.view_name,spec.columns_sql,definition,spec.table_name);
 END LOOP;
END $$;
