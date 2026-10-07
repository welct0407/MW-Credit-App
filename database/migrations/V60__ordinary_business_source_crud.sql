-- R051: ordinary CRUD for user-entered business sources; derived effects follow.
-- No privilege changes, data backfill, trigger disabling, or production execution.
CREATE FUNCTION public.business_source_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE expected_source text:=CASE TG_TABLE_NAME WHEN 'Loans' THEN 'Loan' WHEN 'Business Expenses' THEN 'Business Expense' WHEN 'Settlements' THEN 'Settlement' END;
BEGIN
 IF EXISTS(SELECT 1 FROM public.r005_cash_cutover_sources WHERE source_type=expected_source AND source_row_id=OLD."Row ID") THEN
  RAISE EXCEPTION 'Source is included in historical cash opening; reconcile that opening before deletion'; END IF;
 IF TG_TABLE_NAME='Loans' THEN
  IF coalesce((to_jsonb(OLD)->>'Defaulted')::boolean,false) THEN RAISE EXCEPTION 'Undo Default before deleting this loan'; END IF;
  IF EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Loans"=OLD."Row ID") THEN
   RAISE EXCEPTION 'Loan has receipts; delete or reassign those receipts first'; END IF;
  DELETE FROM public."Charges" WHERE "Ref Loans"=OLD."Row ID";
 END IF;
 DELETE FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"=expected_source
  AND "Source Key"=CASE expected_source WHEN 'Loan' THEN 'LOAN:' WHEN 'Business Expense' THEN 'EXPENSE:' WHEN 'Settlement' THEN 'SETTLEMENT:' END||OLD."Row ID";
 RETURN OLD;
END $$;
CREATE TRIGGER a00_business_delete BEFORE DELETE ON public."Loans" FOR EACH ROW EXECUTE FUNCTION public.business_source_delete();
CREATE TRIGGER a00_business_delete BEFORE DELETE ON public."Business Expenses" FOR EACH ROW EXECUTE FUNCTION public.business_source_delete();
CREATE TRIGGER a00_business_delete BEFORE DELETE ON public."Settlements" FOR EACH ROW EXECUTE FUNCTION public.business_source_delete();

CREATE FUNCTION public.business_history_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o jsonb:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 n jsonb:=CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
 date_column text:=TG_ARGV[0]; d date; first_day date; last_day date;
BEGIN
 IF TG_OP='UPDATE' AND o=n THEN RETURN NULL; END IF;
 d:=least((o->>date_column)::date,(n->>date_column)::date);
 IF d IS NULL THEN RETURN NULL; END IF;
 SELECT min(snapshot_day),max(snapshot_day) INTO first_day,last_day FROM (SELECT "Snapshot Date" snapshot_day FROM public."Daily Analytics" WHERE "Snapshot Date">=d UNION ALL SELECT "Snapshot Date" FROM public."Cash Account Daily Analytics" WHERE "Snapshot Date">=d) snapshots;
 IF first_day IS NOT NULL THEN PERFORM public.refresh_daily_analytics(first_day,last_day); END IF;
 RETURN NULL;
END $$;
-- Deferred to see all effects of a multirow source change once they are final.
CREATE CONSTRAINT TRIGGER zzzz_business_history AFTER INSERT OR UPDATE OR DELETE ON public."Business Expenses"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.business_history_refresh('Expense Date');
CREATE CONSTRAINT TRIGGER zzzz_business_history AFTER INSERT OR UPDATE OR DELETE ON public."Cash Ledger"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.business_history_refresh('Movement Date');
CREATE CONSTRAINT TRIGGER zzzz_business_history AFTER INSERT OR UPDATE OR DELETE ON public."Cash Pool Contributions"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.business_history_refresh('Contribution Date');
CREATE CONSTRAINT TRIGGER zzzz_business_history AFTER INSERT OR UPDATE OR DELETE ON public."Charges"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.business_history_refresh('Charge Date');
CREATE CONSTRAINT TRIGGER zzzz_business_history AFTER INSERT OR UPDATE OR DELETE ON public."Loans"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.business_history_refresh('Loan Date');
CREATE CONSTRAINT TRIGGER zzzz_business_history AFTER INSERT OR UPDATE OR DELETE ON public."Settlements"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.business_history_refresh('Transfer Date');


CREATE OR REPLACE FUNCTION public.calculate_business_expense() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE allocation_date date;
BEGIN
 IF TG_OP='DELETE' AND OLD."Source Type"='Referral Rebate' AND pg_trigger_depth()>=2
  AND EXISTS(SELECT 1 FROM public."Loans" l WHERE l."Row ID"=OLD."Ref Related Loan"
   AND l."Ref Closing Payment" IS NOT NULL AND (l."Ref Closing Payment"=nullif(current_setting('payment_crud.id',true),'')
    OR EXISTS(SELECT 1 FROM public."Repayments" r WHERE r."Ref Loans"=l."Row ID"
     AND r."Ref Payment"=nullif(current_setting('payment_crud.id',true),'')))) THEN RETURN OLD; END IF;
 IF TG_OP='DELETE' THEN
  IF OLD."Source Type"='Manual' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Automatic referral follows its loan/receipt; edit that source'; END IF;
 IF TG_OP='UPDATE' THEN
   IF NEW."Row ID" IS DISTINCT FROM OLD."Row ID" OR NEW."Source Type" IS DISTINCT FROM OLD."Source Type"
     OR NEW."Created At" IS DISTINCT FROM OLD."Created At" OR NEW."Created By" IS DISTINCT FROM OLD."Created By" THEN
     RAISE EXCEPTION 'Expense identity, source and creation audit are immutable';
   END IF;
   IF OLD."Source Type"='Referral Rebate' AND
     (to_jsonb(NEW)-ARRAY['Partner A Share','Partner B Share','Partner A Expense','Partner B Expense','Allocation Basis'])
       IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['Partner A Share','Partner B Share','Partner A Expense','Partner B Expense','Allocation Basis']) THEN
     RAISE EXCEPTION 'Automatic referral expenses are system-managed';
   END IF;
 END IF;
 IF NEW."Source Type"='Referral Rebate' THEN
   IF TG_OP='INSERT' AND pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Referral expenses require a qualifying loan-close event'; END IF;
   SELECT "Close Date" INTO allocation_date FROM public."Loans" WHERE "Row ID"=NEW."Ref Related Loan";
   IF allocation_date IS NULL THEN RAISE EXCEPTION 'Referral allocation requires a loan closing date'; END IF;
   NEW."Allocation Basis":='Closing Date Contribution Ratio';
 ELSE
   IF nullif(btrim(NEW."Source Key"),'') IS NOT NULL OR NEW."Gross Profit Basis" IS NOT NULL OR NEW."Rule Version" IS NOT NULL THEN
     RAISE EXCEPTION 'Manual expense cannot supply automated source fields';
   END IF;
   IF NEW."Amount"::numeric<0 AND nullif(btrim(NEW."Notes"),'') IS NULL THEN
     RAISE EXCEPTION 'A negative manual adjustment requires an explanatory note';
   END IF;
   allocation_date:=NEW."Expense Date";
   NEW."Allocation Basis":='Expense Date Contribution Ratio';
 END IF;
 IF NEW."Ref Related Loan" IS NOT NULL AND NEW."Ref Related Borrower" IS NOT NULL AND
   NOT EXISTS(SELECT 1 FROM public."Loans" WHERE "Row ID"=NEW."Ref Related Loan" AND "Ref Borrowers"=NEW."Ref Related Borrower") THEN
   RAISE EXCEPTION 'Related loan does not belong to related borrower';
 END IF;
 NEW."Partner A Share":=public.partner_pool_share_at_date(allocation_date,'A');
 NEW."Partner B Share":=1-NEW."Partner A Share";
 NEW."Partner A Expense":=round(NEW."Amount"::numeric*NEW."Partner A Share")::money;
 NEW."Partner B Expense":=NEW."Amount"-NEW."Partner A Expense";
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_cash_ledger() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
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

CREATE OR REPLACE FUNCTION public.guard_ledger_cash_accounts() RETURNS trigger
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
 IF TG_OP='UPDATE' THEN changed:=(NEW."Movement Date",NEW."Amount",NEW."Ref From Cash Holder",NEW."Ref To Cash Holder",NEW."Ref From Cash Account",NEW."Ref To Cash Account") IS DISTINCT FROM
 (OLD."Movement Date",OLD."Amount",OLD."Ref From Cash Holder",OLD."Ref To Cash Holder",OLD."Ref From Cash Account",OLD."Ref To Cash Account"); END IF;
 IF NOT changed THEN RETURN NEW; END IF;

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

CREATE OR REPLACE FUNCTION public.guard_settlement_reversal() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW."Status" NOT IN ('Pending','Completed','Cancelled') OR NEW."Status" IS NULL THEN
  RAISE EXCEPTION 'Settlement status must be Pending, Completed or Cancelled'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.validate_net_settlement() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE available numeric;
BEGIN
 IF NEW."Status"='Cancelled' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD."Status" IS DISTINCT FROM 'Cancelled' AND NEW."Amount" IS NOT DISTINCT FROM OLD."Amount"
   AND NEW."Ref Partner" IS NOT DISTINCT FROM OLD."Ref Partner" THEN RETURN NEW; END IF;
 IF NEW."Ref Partner" IS NULL OR NEW."Amount" IS NULL OR NEW."Amount"::numeric<=0 THEN
  RAISE EXCEPTION 'Settlement requires a partner and a positive amount';
 END IF;
 PERFORM public.recalculate_business_expenses_from_date('0001-01-01');
 SELECT public.partner_net_profit(NEW."Ref Partner")-coalesce(sum("Amount"::numeric),0) INTO available
 FROM public."Settlements" WHERE "Ref Partner"=NEW."Ref Partner" AND "Row ID"<>NEW."Row ID"
 AND "Status" IS DISTINCT FROM 'Cancelled';
 IF NEW."Amount"::numeric>available THEN RAISE EXCEPTION 'Settlement exceeds net available to settle'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_source_cash_account() RETURNS trigger
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

  END IF;
  required_account:=TG_OP='INSERT' OR changed OR old_account IS NOT NULL;
 ELSIF TG_TABLE_NAME='Loans' THEN
  account_id:=nullif(btrim(NEW."Ref Disbursed From Cash Account"),''); selected_holder:='ch:lisa';
  IF TG_OP='UPDATE' THEN
   old_account:=OLD."Ref Disbursed From Cash Account";

  END IF;
  required_account:=TG_OP='INSERT' OR account_id IS DISTINCT FROM old_account;
 ELSIF TG_TABLE_NAME='Business Expenses' THEN
  account_id:=nullif(btrim(NEW."Ref Paid By Cash Account"),'');
  selected_holder:=nullif(btrim(NEW."Ref Paid By Cash Holder"),'');
  IF TG_OP='INSERT' AND NEW."Source Type"='Referral Rebate' THEN
   account_id:=coalesce(account_id,public.default_cash_account('ch:lisa')); selected_holder:='ch:lisa';
  END IF;
  IF TG_OP='UPDATE' THEN
   old_account:=OLD."Ref Paid By Cash Account";

  END IF;
  -- R005 negative accounting-only adjustments have no holder/account movement.
  required_account:=(TG_OP='INSERT' OR account_id IS DISTINCT FROM old_account) AND (NEW."Amount"::numeric>0 OR selected_holder IS NOT NULL);
 ELSE
  account_id:=nullif(btrim(NEW."Ref Paid From Cash Account"),''); selected_holder:='ch:lisa';
  IF TG_OP='UPDATE' THEN
   old_account:=OLD."Ref Paid From Cash Account";
   required_account:=NEW."Status"='Completed' AND (OLD."Status" IS DISTINCT FROM 'Completed' OR account_id IS DISTINCT FROM old_account);
  ELSE required_account:=NEW."Status"='Completed'; END IF;
 END IF;
 IF account_id IS NULL AND required_account THEN RAISE EXCEPTION 'A cash account is required for this new cash movement'; END IF;
 IF account_id IS NOT NULL THEN
  holder:=public.cash_account_holder(account_id,TG_OP='INSERT' OR required_account AND
    (TG_OP<>'UPDATE' OR account_id IS DISTINCT FROM old_account) OR
    (TG_TABLE_NAME='Settlements' AND required_account));
  IF TG_OP='UPDATE' AND account_id IS DISTINCT FROM old_account AND TG_TABLE_NAME IN ('Payments','Business Expenses') THEN selected_holder:=holder; END IF;
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

CREATE OR REPLACE FUNCTION public.guard_cash_account() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('cash-account:'||OLD."Ref Cash Holder",0)) THEN RAISE EXCEPTION 'Cash accounts are busy; sync and retry'; END IF;
  IF OLD."Default Account" AND EXISTS(SELECT 1 FROM public."Cash Accounts" WHERE "Ref Cash Holder"=OLD."Ref Cash Holder" AND "Active" AND "Row ID"<>OLD."Row ID") THEN
   RAISE EXCEPTION 'Choose a replacement default account before deletion'; END IF;
  RETURN OLD; -- References and opening balances still protect used accounts.
 END IF;
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


CREATE FUNCTION public.guard_charge_consistency() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE paid_p numeric; paid_i numeric;
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Charges"=OLD."Row ID") THEN
   RAISE EXCEPTION 'Charge has receipts; reassign or delete those receipts first'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW."Row ID" IS DISTINCT FROM OLD."Row ID" THEN RAISE EXCEPTION 'Charge key cannot change'; END IF;
  IF (NEW."Ref Loans",NEW."Principal Due",NEW."Interest Due") IS NOT DISTINCT FROM (OLD."Ref Loans",OLD."Principal Due",OLD."Interest Due") THEN RETURN NEW; END IF;
  IF NEW."Ref Loans" IS DISTINCT FROM OLD."Ref Loans" AND EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Charges"=OLD."Row ID") THEN
   RAISE EXCEPTION 'Charge has receipts on its original loan; reassign them first'; END IF;
 END IF;
 -- Signed loss entries belong to the Default transition, not ordinary charges.
 IF starts_with(NEW."Row ID",'df10:') THEN RETURN NEW; END IF;
 SELECT coalesce(sum("Principal Paid"::numeric),0),coalesce(sum("Interest Paid"::numeric),0) INTO paid_p,paid_i
  FROM public."Repayments" WHERE "Ref Charges"=NEW."Row ID";
 IF EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Charges"=NEW."Row ID") AND (NEW."Principal Due"::numeric<paid_p OR NEW."Interest Due"::numeric<paid_i) THEN
  RAISE EXCEPTION 'Charge amount cannot be less than its posted component payments'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ab_charge_consistency BEFORE INSERT OR UPDATE OR DELETE ON public."Charges"
 FOR EACH ROW EXECUTE FUNCTION public.guard_charge_consistency();

CREATE FUNCTION public.guard_loan_consistency() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW."Row ID" IS DISTINCT FROM OLD."Row ID" THEN RAISE EXCEPTION 'Loan key cannot change'; END IF;
 IF NEW."Ref Borrowers" IS DISTINCT FROM OLD."Ref Borrowers" AND EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Loans"=OLD."Row ID") THEN
  RAISE EXCEPTION 'Loan has receipts for its original borrower; reassign them first'; END IF;
 IF NEW."Ref Borrowers" IS DISTINCT FROM OLD."Ref Borrowers" AND EXISTS(SELECT 1 FROM public."Business Expenses"
  WHERE "Ref Related Loan"=OLD."Row ID" AND "Ref Related Borrower" IS NOT NULL AND "Ref Related Borrower" IS DISTINCT FROM NEW."Ref Borrowers") THEN
  RAISE EXCEPTION 'Related expense borrower must be corrected before moving this loan'; END IF;
 IF NEW."Principal Amount" IS DISTINCT FROM OLD."Principal Amount" AND
  (NEW."Principal Amount"::numeric<=0 OR NEW."Principal Amount" IS NULL OR NEW."Principal Amount"::numeric<
   (SELECT coalesce(sum("Principal Paid"::numeric),0) FROM public."Repayments" WHERE "Ref Loans"=OLD."Row ID") OR NEW."Principal Amount"::numeric<
   (SELECT coalesce(sum("Principal Due"::numeric),0) FROM public."Charges" WHERE "Ref Loans"=OLD."Row ID")) THEN
  RAISE EXCEPTION 'Loan principal must cover its posted principal and recorded principal charges'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ab_loan_consistency BEFORE UPDATE ON public."Loans" FOR EACH ROW EXECUTE FUNCTION public.guard_loan_consistency();


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
 principal_changed:=p."Total Principal Received" IS DISTINCT FROM previous."Total Principal Received" OR p."Principal Amount" IS DISTINCT FROM previous."Principal Amount";
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

-- The existing default write-off notes already contain the exact old amounts.
-- Undo only when every recorded component still matches that deterministic posting.
CREATE FUNCTION public.undo_loan_default(p public."Loans") RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
#variable_conflict use_column
DECLARE posting text:='df10:'||length(p."Row ID")||':'||p."Row ID";
 c record; evidence jsonb; prefix text; prior text:=current_setting('business_crud.default',true);
BEGIN
 IF pg_trigger_depth()=0 THEN RAISE EXCEPTION 'Undo default through Loans.Defaulted'; END IF;
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=p."Ref Borrowers" FOR UPDATE NOWAIT;
 PERFORM 1 FROM public."Charges" WHERE "Ref Loans"=p."Row ID" ORDER BY "Row ID" COLLATE "C" FOR UPDATE NOWAIT;
 IF NOT EXISTS(SELECT 1 FROM public."Repayments" r JOIN public."Charges" c ON c."Row ID"=r."Ref Charges"
   WHERE r."Row ID"=posting AND c."Row ID"=posting AND r."Ref Loans"=p."Row ID" AND c."Ref Loans"=p."Row ID"
    AND r."Ref Payment" IS NULL AND r."Principal Paid"=p."Default Loss Amount" AND r."Interest Paid"=(-p."Default Loss Amount"::numeric)::money
    AND c."Principal Due"=p."Default Loss Amount" AND c."Interest Due"=(-p."Default Loss Amount"::numeric)::money) THEN
  RAISE EXCEPTION 'Default loss posting no longer matches; reconcile its components before undo'; END IF;
 PERFORM set_config('business_crud.default',p."Row ID",true);
 DELETE FROM public."Repayments" WHERE "Row ID"=posting;
 DELETE FROM public."Charges" WHERE "Row ID"=posting;
 FOR c IN SELECT * FROM public."Charges" WHERE "Ref Loans"=p."Row ID" LOOP
  IF coalesce(c."Notes",'') NOT LIKE '%Default write-off %' THEN
   IF c."Principal Due"::numeric+c."Interest Due"::numeric>0 AND
    c."Principal Due"::numeric=(SELECT coalesce(sum("Principal Paid"::numeric),0) FROM public."Repayments" WHERE "Ref Charges"=c."Row ID") AND
    c."Interest Due"::numeric=(SELECT coalesce(sum("Interest Paid"::numeric),0) FROM public."Repayments" WHERE "Ref Charges"=c."Row ID") THEN CONTINUE; END IF;
   RAISE EXCEPTION 'Default charge has no original component evidence; reconcile before undo';
  END IF;
  prefix:=substring(c."Notes" from '(?s)^(.*)Default write-off \{[^\n]*\}$');
  BEGIN evidence:=substring(c."Notes" from 'Default write-off (\{[^\n]*\})$')::jsonb;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Default charge evidence is malformed; reconcile before undo'; END;
  IF evidence IS NULL OR evidence->>'posting' IS DISTINCT FROM posting OR
   c."Principal Due"::numeric IS DISTINCT FROM (evidence->>'original_principal')::numeric-(evidence->>'written_off_principal')::numeric OR
   c."Interest Due"::numeric IS DISTINCT FROM (evidence->>'original_interest')::numeric-(evidence->>'written_off_interest')::numeric THEN
   RAISE EXCEPTION 'Default charge changed since write-off; reconcile before undo'; END IF;
  UPDATE public."Charges" SET "Principal Due"=(evidence->>'original_principal')::numeric::money,
   "Interest Due"=(evidence->>'original_interest')::numeric::money,"Notes"=nullif(regexp_replace(prefix,E'\n$',''),'')
   WHERE "Row ID"=c."Row ID";
 END LOOP;
 PERFORM set_config('business_crud.default',coalesce(prior,''),true);
END $$;
CREATE OR REPLACE FUNCTION public.default_loan_transition() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF coalesce(NEW."Defaulted",false) THEN RAISE EXCEPTION 'Create the loan before confirming default'; END IF;
    RETURN NEW;
  END IF;
  IF coalesce(OLD."Defaulted",false) AND NEW."Defaulted"=false THEN
    IF NEW."Principal Amount" IS DISTINCT FROM OLD."Principal Amount" OR NEW."Ref Borrowers" IS DISTINCT FROM OLD."Ref Borrowers" THEN
      RAISE EXCEPTION 'Undo default before changing loan inputs'; END IF;
    PERFORM public.undo_loan_default(OLD);
    NEW."Default Loss Amount":=NULL; NEW."Loan Status":='ยังไม่ปิดยอด'; NEW."Close Date":=NULL; NEW."Closed By":=NULL;
    RETURN NEW;
  END IF;
  IF coalesce(OLD."Defaulted",false) THEN
    IF NEW."Defaulted" IS DISTINCT FROM OLD."Defaulted" OR NEW."Default Loss Amount" IS DISTINCT FROM OLD."Default Loss Amount"
      OR NEW."Loan Status" IS DISTINCT FROM OLD."Loan Status" OR NEW."Close Date" IS DISTINCT FROM OLD."Close Date"
      OR NEW."Closed By" IS DISTINCT FROM OLD."Closed By" OR NEW."Principal Amount" IS DISTINCT FROM OLD."Principal Amount"
      OR NEW."Ref Borrowers" IS DISTINCT FROM OLD."Ref Borrowers" THEN
      RAISE EXCEPTION 'Recorded default is immutable; use a reviewed correction';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT coalesce(NEW."Defaulted",false) THEN RETURN NEW; END IF;
  IF NEW."Principal Amount" IS DISTINCT FROM OLD."Principal Amount" OR NEW."Ref Borrowers" IS DISTINCT FROM OLD."Ref Borrowers"
    OR NEW."Auto Charge Enabled" IS DISTINCT FROM OLD."Auto Charge Enabled" THEN
    RAISE EXCEPTION 'Do not change loan inputs while confirming default';
  END IF;
  NEW."Default Loss Amount":=public.post_loan_default(OLD,NEW."Close Date",NEW."Closed By")::money;
  NEW."Loan Status":='ปิดยอดแล้ว';
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.default_posting_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE derived text[]:=ARRAY['Principal Paid','Interest Paid','Total Paid','Principal Remaining','Interest Remaining','Amount Remaining','Payment Count','Payment Status','Payment Date'];
BEGIN
 IF starts_with(OLD."Row ID",'df10:') THEN
  IF TG_OP='DELETE' AND pg_trigger_depth()>=2 AND OLD."Ref Loans"=nullif(current_setting('business_crud.default',true),'') THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND TG_TABLE_NAME='Charges' THEN
   IF (to_jsonb(NEW)-derived) IS NOT DISTINCT FROM (to_jsonb(OLD)-derived) THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'Default posting is immutable';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.vc_refresh_loan(p_id text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF pg_trigger_depth()>=2 AND p_id=nullif(current_setting('business_crud.default',true),'') THEN RETURN; END IF;
 UPDATE public."Loans" l SET "Total Interest Received"=v.i,"Total Principal Received"=v.p,
  "Total Amount Received"=v.a,"Outstanding Principal"=coalesce(l."Principal Amount"::numeric,0)-v.p
 FROM (SELECT coalesce(sum("Interest Paid"::numeric),0) i,coalesce(sum("Principal Paid"::numeric),0) p,
  coalesce(sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)),0) a
  FROM public."Repayments" WHERE "Ref Loans"=p_id) v
 WHERE l."Row ID"=p_id AND ROW(l."Total Interest Received",l."Total Principal Received",l."Total Amount Received",l."Outstanding Principal")
 IS DISTINCT FROM ROW(v.i,v.p,v.a,coalesce(l."Principal Amount"::numeric,0)-v.p);
END $$;


-- Defaulted is a state transition, carrying the confirmation date and actor.
-- No historical backfill; preserve the owner's zero-cash prototype loss posting.
CREATE OR REPLACE FUNCTION public.post_loan_default(p_loan public."Loans", p_date date, p_actor text)
RETURNS numeric LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE prior text:=current_setting('business_crud.default',true); outstanding numeric; c record; posting text:='df10:'||length(p_loan."Row ID")||':'||p_loan."Row ID";
BEGIN
  IF pg_trigger_depth()=0 THEN RAISE EXCEPTION 'Confirm default through the Loans state transition'; END IF;
  -- The originating Loans UPDATE already owns its row lock. Never wait for a
  -- borrower held by a payment/generator that could be waiting for this loan.
  BEGIN
    PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=p_loan."Ref Borrowers" FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RAISE EXCEPTION 'Default requires an existing borrower'; END IF;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'Borrower is busy; sync and retry Default Loan';
  END;
  IF p_date IS DISTINCT FROM (statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date
    OR nullif(btrim(p_actor),'') IS NULL THEN
    RAISE EXCEPTION 'Default requires today confirmation date and actor; sync and confirm again';
  END IF;
  IF p_loan."Loan Status" IS DISTINCT FROM 'ยังไม่ปิดยอด'
    OR coalesce(p_loan."Defaulted",false) OR NOT coalesce(p_loan."Auto Charge Enabled",false)
    OR p_loan."Principal Amount" IS NULL THEN
    RAISE EXCEPTION 'Default requires an open auto-enabled nondefaulted loan';
  END IF;
  IF EXISTS(SELECT 1 FROM public."Payments" WHERE "Ref Borrower"=p_loan."Ref Borrowers" AND "Status" IN ('Processing','Error')) THEN
    RAISE EXCEPTION 'Resolve processing or error payments before default';
  END IF;
  PERFORM 1 FROM public."Charges" WHERE "Ref Loans"=p_loan."Row ID" ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
  SELECT p_loan."Principal Amount"::numeric-coalesce(sum("Principal Paid"::numeric),0)
    INTO outstanding FROM public."Repayments" WHERE "Ref Loans"=p_loan."Row ID";
  IF outstanding<=0 THEN RAISE EXCEPTION 'Default requires outstanding principal'; END IF;
  PERFORM set_config('business_crud.default',p_loan."Row ID",true);
  FOR c IN SELECT ch.*,coalesce(r.p,0) AS paid_p,coalesce(r.i,0) AS paid_i
    FROM public."Charges" ch LEFT JOIN LATERAL
      (SELECT sum("Principal Paid"::numeric) p,sum("Interest Paid"::numeric) i
       FROM public."Repayments" WHERE "Ref Charges"=ch."Row ID") r ON true
    WHERE ch."Ref Loans"=p_loan."Row ID" ORDER BY ch."Row ID" COLLATE "C"
  LOOP
    IF c."Principal Due" IS NULL OR c."Interest Due" IS NULL OR c.paid_p<0 OR c.paid_i<0
      OR c."Principal Due"::numeric<c.paid_p OR c."Interest Due"::numeric<c.paid_i THEN
      RAISE EXCEPTION 'Charge components require reconciliation before default';
    END IF;
    IF c."Charge Date"=p_date AND c.paid_p+c.paid_i<>0
      AND c."Principal Due"::numeric+c."Interest Due"::numeric<=c.paid_p+c.paid_i THEN
      RAISE EXCEPTION 'A paid charge today prevents Default Loan';
    END IF;
    IF true THEN -- Record all original components so later undo can prove completeness.
      UPDATE public."Charges" SET "Principal Due"=c.paid_p::money,"Interest Due"=c.paid_i::money,
        "Notes"=concat_ws(E'\n',nullif(c."Notes",''),'Default write-off '||jsonb_build_object(
          'posting',posting,'date',p_date,'actor',p_actor,
          'original_principal',c."Principal Due"::numeric,'original_interest',c."Interest Due"::numeric,
          'written_off_principal',c."Principal Due"::numeric-c.paid_p,
          'written_off_interest',c."Interest Due"::numeric-c.paid_i)::text)
        WHERE "Row ID"=c."Row ID";
    END IF;
  END LOOP;
  INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes")
    VALUES(posting,p_loan."Row ID",p_date,outstanding::money,(-outstanding)::money,
      'Loan default - outstanding principal recorded as loss; zero cash');
  INSERT INTO public."Repayments"("Row ID","Payment Date","Principal Paid","Interest Paid","Notes","Ref Loans","Ref Charges","Created By")
    VALUES(posting,p_date,outstanding::money,(-outstanding)::money,
      'หนี้สูญ - บันทึกเงินต้นคงเหลือเป็นขาดทุน / Loan default - outstanding principal recorded as loss',
      p_loan."Row ID",posting,p_actor);
  PERFORM set_config('business_crud.default',coalesce(prior,''),true);
  RETURN outstanding;
END $$;

