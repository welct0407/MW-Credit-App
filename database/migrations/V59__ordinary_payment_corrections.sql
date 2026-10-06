-- R051: ordinary receipt UPDATE/DELETE own their derived posting effects.
-- No new roles, grants, source columns, statuses, central intent, or backfill.
-- Loan Close prepared charges remain separately editable obligations.
CREATE FUNCTION public.payment_inputs(p public."Payments") RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_array(p."Ref Borrower",p."Amount Received",p."Payment Date",p."Allocation Method",
 p."Ref Target Charge",p."Ref Target Loan",p."Selected Charge IDs")
$$;

CREATE FUNCTION public.payment_crud_prepare() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
#variable_conflict use_column
DECLARE b text; l public."Loans"%ROWTYPE; context_before text; owned jsonb;
BEGIN
 IF TG_OP='UPDATE' AND NEW."Row ID" IS DISTINCT FROM OLD."Row ID" THEN
  RAISE EXCEPTION 'Payment key cannot be changed'; END IF;
 IF TG_OP='UPDATE' AND public.payment_inputs(NEW) IS NOT DISTINCT FROM public.payment_inputs(OLD) THEN RETURN NEW; END IF;
 IF NOT pg_try_advisory_xact_lock(9162026,2) THEN RAISE EXCEPTION 'Cash pool is busy; retry'; END IF;
 FOR b IN SELECT DISTINCT k COLLATE "C" FROM unnest(ARRAY[OLD."Ref Borrower",CASE WHEN TG_OP='UPDATE' THEN NEW."Ref Borrower" END]) k
  WHERE k IS NOT NULL ORDER BY k COLLATE "C" LOOP
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=b FOR UPDATE NOWAIT;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.r005_cash_cutover_sources WHERE source_type='Payment' AND source_row_id=OLD."Row ID") THEN
  RAISE EXCEPTION 'Payment is included in historical cash opening; reconcile that opening before correction'; END IF;
 -- Loan Close prepared charges remain separately editable booked obligations.
 PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers" IN (OLD."Ref Borrower",CASE WHEN TG_OP='UPDATE' THEN NEW."Ref Borrower" END)
  ORDER BY "Row ID" COLLATE "C" FOR UPDATE NOWAIT;
 PERFORM 1 FROM public."Charges" WHERE "Ref Loans" IN (SELECT "Row ID" FROM public."Loans"
  WHERE "Ref Borrowers" IN (OLD."Ref Borrower",CASE WHEN TG_OP='UPDATE' THEN NEW."Ref Borrower" END))
  ORDER BY "Row ID" COLLATE "C" FOR UPDATE NOWAIT;
 PERFORM 1 FROM public."Payment Allocations" WHERE "Ref Payment"=OLD."Row ID" ORDER BY "Row ID" COLLATE "C" FOR UPDATE NOWAIT;
 PERFORM 1 FROM public."Repayments" WHERE "Ref Payment"=OLD."Row ID" ORDER BY "Row ID" COLLATE "C" FOR UPDATE NOWAIT;
 PERFORM 1 FROM public."Cash Ledger" WHERE "Ref Payment"=OLD."Row ID" ORDER BY "Row ID" COLLATE "C" FOR UPDATE NOWAIT;
 IF EXISTS(SELECT 1 FROM public."Repayments" r JOIN public."Loans" l ON l."Row ID"=r."Ref Loans"
  WHERE r."Ref Payment"=OLD."Row ID" AND l."Defaulted" IS TRUE) THEN
  RAISE EXCEPTION 'Payment has a later loan default/write-off; reconcile that default first'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO owned FROM public."Loans" x WHERE x."Row ID" IN
  (SELECT "Ref Loans" FROM public."Repayments" WHERE "Ref Payment"=OLD."Row ID");
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(owned) j WHERE j->>'Loan Status'='ปิดยอดแล้ว' AND j->>'Ref Closing Payment' IS NULL) THEN
  RAISE EXCEPTION 'Manually closed loan must be reopened explicitly before its receipt changes'; END IF;
 PERFORM set_config('payment_crud.parents',
  (coalesce(nullif(current_setting('payment_crud.parents',true),'')::jsonb,'{}')||jsonb_build_object(OLD."Row ID",owned))::text,true);
 context_before:=current_setting('payment_crud.id',true);
 PERFORM set_config('payment_crud.id',OLD."Row ID",true);
 -- A payment-controlled closure is reversible. Manually closed/defaulted loans
 -- are not inferred from balances and are never silently reopened.
 FOR l IN SELECT x.* FROM public."Loans" x WHERE x."Ref Closing Payment" IS NOT NULL
  AND (x."Ref Closing Payment"=OLD."Row ID" OR x."Row ID" IN
   (SELECT "Ref Loans" FROM public."Repayments" WHERE "Ref Payment"=OLD."Row ID"))
  ORDER BY x."Row ID" COLLATE "C" LOOP
  IF l."Defaulted" IS TRUE THEN RAISE EXCEPTION 'Defaulted loan requires explicit default reconciliation'; END IF;
  IF EXISTS(SELECT 1 FROM public."Business Expenses" e JOIN public."Cash Ledger" c ON c."Ref Business Expense"=e."Row ID"
   WHERE e."Ref Related Loan"=l."Row ID" AND e."Source Type"='Referral Rebate' AND c."Entry Origin"='Manual') THEN
   RAISE EXCEPTION 'Referral has a separate reimbursement; reconcile that transaction first'; END IF;
  IF EXISTS(SELECT 1 FROM public."Business Expenses" e JOIN public.r005_cash_cutover_sources c
   ON c.source_type='Business Expense' AND c.source_row_id=e."Row ID"
   WHERE e."Ref Related Loan"=l."Row ID" AND e."Source Type"='Referral Rebate') THEN
   RAISE EXCEPTION 'Referral is included in historical cash opening'; END IF;
  DELETE FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"='Business Expense'
   AND "Ref Business Expense" IN (SELECT "Row ID" FROM public."Business Expenses"
    WHERE "Ref Related Loan"=l."Row ID" AND "Source Type"='Referral Rebate');
  DELETE FROM public."Business Expenses" WHERE "Ref Related Loan"=l."Row ID" AND "Source Type"='Referral Rebate';
  -- Only the receipt which owns the closure is reopened before reposting.
  -- A later receipt's closure is checked against final balances in finish().
  IF l."Ref Closing Payment"=OLD."Row ID" THEN
   UPDATE public."Loans" SET "Loan Status"='ยังไม่ปิดยอด',"Ref Closing Payment"=NULL,"Close Date"=NULL,"Closed By"=NULL
    WHERE "Row ID"=l."Row ID";
  END IF;
 END LOOP;
 DELETE FROM public."Repayments" WHERE "Ref Payment"=OLD."Row ID";
 DELETE FROM public."Payment Allocations" WHERE "Ref Payment"=OLD."Row ID";
 IF TG_OP='DELETE' THEN
  DELETE FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"='Payment' AND "Ref Payment"=OLD."Row ID";
 ELSE
  NEW."Status":='Processing'; NEW."Processed At":=NULL;
 END IF;
 PERFORM set_config('payment_crud.id',coalesce(context_before,''),true);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a00_payment_crud BEFORE UPDATE OR DELETE ON public."Payments"
 FOR EACH ROW EXECUTE FUNCTION public.payment_crud_prepare();


CREATE OR REPLACE FUNCTION public.lump_sum_receipt_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE prepared boolean;
BEGIN
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=NEW."Ref Borrower" FOR UPDATE;
  IF TG_OP='INSERT' AND NEW."Status" IS DISTINCT FROM 'Processing' THEN
    RAISE EXCEPTION 'New payments must start in Processing';
  END IF;
  IF TG_OP='UPDATE' THEN
    SELECT EXISTS(SELECT 1 FROM public."Payment Allocations" WHERE "Ref Payment"=OLD."Row ID")
      OR EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Payment"=OLD."Row ID") INTO prepared;
    IF OLD."Status"='Posted' AND prepared THEN
      NEW."Status":=OLD."Status"; NEW."Processed At":=OLD."Processed At";
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

CREATE OR REPLACE FUNCTION public.closing_payment_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='UPDATE' AND pg_trigger_depth()>=2 AND nullif(current_setting('payment_crud.id',true),'') IS NOT NULL
    AND OLD."Ref Closing Payment" IS NOT NULL AND NOT coalesce(OLD."Defaulted",false)
    AND NEW."Ref Closing Payment" IS NULL AND NEW."Loan Status"='ยังไม่ปิดยอด'
    AND (OLD."Ref Closing Payment"=current_setting('payment_crud.id',true) OR EXISTS
     (SELECT 1 FROM public."Repayments" WHERE "Ref Loans"=OLD."Row ID" AND "Ref Payment"=current_setting('payment_crud.id',true))
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(nullif(current_setting('payment_crud.parents',true),'')::jsonb
      ->current_setting('payment_crud.id',true),'[]')) j WHERE j->>'Row ID'=OLD."Row ID"))
    AND (to_jsonb(NEW)-ARRAY['Loan Status','Ref Closing Payment','Close Date','Closed By'])=
        (to_jsonb(OLD)-ARRAY['Loan Status','Ref Closing Payment','Close Date','Closed By']) THEN RETURN NEW; END IF;
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

CREATE OR REPLACE FUNCTION public.calculate_business_expense() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE allocation_date date;
BEGIN
 IF TG_OP='DELETE' AND OLD."Source Type"='Referral Rebate' AND pg_trigger_depth()>=2
  AND EXISTS(SELECT 1 FROM public."Loans" l WHERE l."Row ID"=OLD."Ref Related Loan"
   AND l."Ref Closing Payment" IS NOT NULL AND (l."Ref Closing Payment"=nullif(current_setting('payment_crud.id',true),'')
    OR EXISTS(SELECT 1 FROM public."Repayments" r WHERE r."Ref Loans"=l."Row ID"
     AND r."Ref Payment"=nullif(current_setting('payment_crud.id',true),'')))) THEN RETURN OLD; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Expenses are retained; record a documented manual adjustment instead'; END IF;
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

CREATE OR REPLACE FUNCTION public.vc_refresh_payment(p_id text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE a numeric; r numeric;
BEGIN
 IF p_id=nullif(current_setting('payment_crud.id',true),'') AND pg_trigger_depth()>=2 THEN RETURN; END IF;
 SELECT coalesce(sum("Allocated Amount"::numeric),0) INTO a FROM public."Payment Allocations" WHERE "Ref Payment"=p_id;
 SELECT coalesce(sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)),0) INTO r FROM public."Repayments" WHERE "Ref Payment"=p_id;
 UPDATE public."Payments" SET "Planned Allocation Amount"=a,"Posted Amount"=r WHERE "Row ID"=p_id
 AND ROW("Planned Allocation Amount","Posted Amount") IS DISTINCT FROM ROW(a,r);
END $$;

CREATE OR REPLACE FUNCTION public.guard_selected_charge_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE ids text[];
BEGIN
 ids:=public.selected_charge_ids(NEW."Selected Charge IDs");
 NEW."Selected Charge IDs":=nullif(array_to_string(ids,' , '),'');
 IF TG_OP='UPDATE' AND NEW."Selected Charge IDs" IS DISTINCT FROM OLD."Selected Charge IDs"
  AND (EXISTS(SELECT 1 FROM public."Payment Allocations" WHERE "Ref Payment"=OLD."Row ID")
   OR EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Payment"=OLD."Row ID")) THEN
  RAISE EXCEPTION 'Prepared or posted payment selection cannot be changed';
 END IF;
 IF NEW."Allocation Method"='Selected Charges' THEN
  IF cardinality(ids)=0 THEN RAISE EXCEPTION 'Select at least one charge'; END IF;
  IF nullif(btrim(NEW."Ref Target Charge"),'') IS NOT NULL OR nullif(btrim(NEW."Ref Target Loan"),'') IS NOT NULL THEN
   RAISE EXCEPTION 'Selected Charges cannot also target a single charge or loan';
  END IF;
 ELSIF cardinality(ids)>0 THEN
  RAISE EXCEPTION 'Selected charge keys require the Selected Charges allocation method';
 END IF;
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


CREATE FUNCTION public.payment_crud_finish() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
#variable_conflict use_column
DECLARE d date; first_day date; last_day date; previous jsonb; l public."Loans"%ROWTYPE; prior_context text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF public.payment_inputs(NEW) IS NOT DISTINCT FROM public.payment_inputs(OLD)
   AND NEW."Ref Received By Cash Account" IS NOT DISTINCT FROM OLD."Ref Received By Cash Account" THEN RETURN NULL; END IF;
  IF EXISTS(SELECT 1 FROM public."Repayments" r JOIN public."Loans" l ON l."Row ID"=r."Ref Loans"
   WHERE r."Ref Payment"=NEW."Row ID" AND l."Defaulted" IS TRUE) THEN
   RAISE EXCEPTION 'Corrected payment has a default dependency; undo default first'; END IF;
  d:=least(OLD."Payment Date",NEW."Payment Date");
 ELSE d:=OLD."Payment Date";
 END IF;
 prior_context:=current_setting('payment_crud.id',true);
 PERFORM set_config('payment_crud.id',OLD."Row ID",true);
 FOR previous IN SELECT value FROM jsonb_array_elements(coalesce(nullif(current_setting('payment_crud.parents',true),'')::jsonb->OLD."Row ID",'[]')) LOOP
  SELECT * INTO l FROM public."Loans" WHERE "Row ID"=previous->>'Row ID';
  IF l."Ref Closing Payment" IS NOT NULL AND (l."Principal Amount"::numeric>
    (SELECT coalesce(sum("Principal Paid"::numeric),0) FROM public."Repayments" WHERE "Ref Loans"=l."Row ID")
    OR EXISTS(SELECT 1 FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND c."Principal Due"::numeric+c."Interest Due"::numeric>
     (SELECT coalesce(sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric),0) FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID"))) THEN
   UPDATE public."Loans" SET "Loan Status"='ยังไม่ปิดยอด',"Ref Closing Payment"=NULL,"Close Date"=NULL,"Closed By"=NULL
    WHERE "Row ID"=l."Row ID";
  ELSIF l."Ref Closing Payment" IS NOT NULL THEN
   -- If the original closing receipt still closes this loan, retain its actual
   -- closure date/actor; rebuilding derived rows is not a new closure event.
   IF l."Ref Closing Payment"=previous->>'Ref Closing Payment' AND l."Ref Closing Payment"<>OLD."Row ID" THEN
    UPDATE public."Loans" SET "Close Date"=(previous->>'Close Date')::date,"Closed By"=previous->>'Closed By'
     WHERE "Row ID"=l."Row ID";
   END IF;
   PERFORM public.create_referral_rebate(l."Row ID");
  END IF;
 END LOOP;
 PERFORM set_config('payment_crud.parents',(coalesce(nullif(current_setting('payment_crud.parents',true),'')::jsonb,'{}')-OLD."Row ID")::text,true);
 PERFORM set_config('payment_crud.id',coalesce(prior_context,''),true);
 SELECT min(snapshot_day),max(snapshot_day) INTO first_day,last_day FROM (
  SELECT "Snapshot Date" AS snapshot_day FROM public."Daily Analytics" WHERE "Snapshot Date">=d
  UNION ALL SELECT "Snapshot Date" FROM public."Cash Account Daily Analytics" WHERE "Snapshot Date">=d) s;
 IF first_day IS NOT NULL THEN PERFORM public.refresh_daily_analytics(first_day,last_day); END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER zzz_payment_crud AFTER UPDATE OR DELETE ON public."Payments"
 FOR EACH ROW EXECUTE FUNCTION public.payment_crud_finish();
COMMENT ON FUNCTION public.payment_crud_prepare() IS
 'Receipt UPDATE/DELETE atomically undo owned derived postings and payment-caused closure. Does not refund money. Historical opening/default dependencies fail without changes; prepared Loan Close charges are retained for explicit correction.';

-- Allocation amounts belong to the receipt engine. A whole interest allocation
-- can move to another eligible charge with a plain Ref Charge UPDATE in either
-- date direction; its repayment follows in the same transaction.
CREATE FUNCTION public.move_payment_interest(a public."Payment Allocations", n public."Payment Allocations")
RETURNS public."Payment Allocations" LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE p public."Payments"%ROWTYPE; c public."Charges"%ROWTYPE; source public."Charges"%ROWTYPE;
 r public."Repayments"%ROWTYPE; remaining numeric; prior text;
BEGIN
 IF pg_trigger_depth()<1 THEN RAISE EXCEPTION 'Move interest through Payment Allocations UPDATE'; END IF;
 IF (to_jsonb(a)-'Ref Charge') IS DISTINCT FROM (to_jsonb(n)-'Ref Charge')
  OR a."Allocated Principal"::numeric IS DISTINCT FROM 0 OR a."Allocated Interest"::numeric<=0
  OR a."Allocated Amount" IS DISTINCT FROM a."Allocated Interest" THEN
  RAISE EXCEPTION 'Change receipt amounts through Payments; allocation move only changes Ref Charge'; END IF;
 IF NOT pg_try_advisory_xact_lock(9162026,2) THEN RAISE EXCEPTION 'Cash pool is busy; retry'; END IF;
 SELECT * INTO STRICT p FROM public."Payments" WHERE "Row ID"=a."Ref Payment";
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=p."Ref Borrower" FOR UPDATE NOWAIT;
 SELECT * INTO STRICT p FROM public."Payments" WHERE "Row ID"=a."Ref Payment" FOR UPDATE NOWAIT;
 IF p."Status"<>'Posted' OR p."Allocation Method"<>'Lump Sum' THEN
  RAISE EXCEPTION 'Only a posted Lump Sum whole-interest allocation can move'; END IF;
 PERFORM 1 FROM public."Charges" WHERE "Row ID" IN (a."Ref Charge",n."Ref Charge") ORDER BY "Row ID" COLLATE "C" FOR UPDATE NOWAIT;
 SELECT * INTO STRICT source FROM public."Charges" WHERE "Row ID"=a."Ref Charge";
 SELECT * INTO STRICT c FROM public."Charges" WHERE "Row ID"=n."Ref Charge";
 PERFORM 1 FROM public."Loans" WHERE "Row ID"=source."Ref Loans" AND "Ref Borrowers"=p."Ref Borrower"
  AND "Loan Status"='ยังไม่ปิดยอด' AND NOT coalesce("Defaulted",false) FOR UPDATE NOWAIT;
 IF NOT FOUND OR source."Ref Loans" IS DISTINCT FROM c."Ref Loans" OR c."Charge Date" IS NULL
  OR c."Charge Date">p."Payment Date" OR starts_with(c."Row ID",'df10:') THEN
  RAISE EXCEPTION 'Interest move requires an eligible charge on the same open loan'; END IF;
 SELECT * INTO STRICT r FROM public."Repayments" WHERE "Ref Payment Allocation"=a."Row ID" FOR UPDATE NOWAIT;
 IF r."Ref Payment" IS DISTINCT FROM p."Row ID" OR r."Ref Charges" IS DISTINCT FROM a."Ref Charge"
  OR r."Ref Loans" IS DISTINCT FROM c."Ref Loans" OR r."Interest Paid" IS DISTINCT FROM a."Allocated Interest"
  OR r."Principal Paid"::numeric IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Allocation and repayment disagree'; END IF;
 SELECT c."Interest Due"::numeric-coalesce(sum("Interest Paid"::numeric),0) INTO remaining
  FROM public."Repayments" WHERE "Ref Charges"=c."Row ID";
 IF remaining<a."Allocated Interest"::numeric OR EXISTS(SELECT 1 FROM public."Payment Allocations"
  WHERE "Ref Payment"=p."Row ID" AND "Ref Charge"=c."Row ID") THEN RAISE EXCEPTION 'Target charge capacity conflict'; END IF;
 n."Charge Date Snapshot":=c."Charge Date";
 n."Interest Remaining Snapshot":=remaining::money;
 n."Principal Remaining Snapshot":=c."Principal Remaining"::money;
 n."Amount Remaining Snapshot":=(remaining+c."Principal Remaining")::money;
 prior:=current_setting('payment_crud.move',true);
 PERFORM set_config('payment_crud.move',jsonb_build_object('repayment',r."Row ID",'target',c."Row ID")::text,true);
 UPDATE public."Repayments" SET "Ref Charges"=c."Row ID" WHERE "Row ID"=r."Row ID";
 PERFORM set_config('payment_crud.move',coalesce(prior,''),true);
 RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.lump_sum_child_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE payment_id text; borrower_id text; moving jsonb;
BEGIN
 IF TG_OP='UPDATE' AND public.payment_reallocation_permitted(TG_TABLE_NAME,to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
 IF TG_OP='DELETE' AND pg_trigger_depth()>=2 AND OLD."Ref Payment"=nullif(current_setting('payment_crud.id',true),'') THEN RETURN OLD; END IF;
 IF TG_TABLE_NAME='Payment Allocations' THEN
  IF TG_OP='UPDATE' AND NEW."Ref Charge" IS DISTINCT FROM OLD."Ref Charge" THEN
   NEW:=public.move_payment_interest(OLD,NEW); RETURN NEW;
  END IF;
 END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='Repayments' AND pg_trigger_depth()>=2 THEN
  moving:=nullif(current_setting('payment_crud.move',true),'')::jsonb;
  IF OLD."Row ID"=moving->>'repayment' AND NEW."Ref Charges"=moving->>'target'
   AND (to_jsonb(OLD)-'Ref Charges')=(to_jsonb(NEW)-'Ref Charges') THEN RETURN NEW; END IF;
 END IF;
 IF TG_OP<>'INSERT' AND (starts_with(OLD."Row ID",'ls2:') OR starts_with(OLD."Row ID",'pc6:')) THEN
  RAISE EXCEPTION 'Database-posted allocation/repayment is immutable; edit its Payments source'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 payment_id:=NEW."Ref Payment";
 SELECT "Ref Borrower" INTO borrower_id FROM public."Payments" WHERE "Row ID"=payment_id;
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=borrower_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"=payment_id AND "Status"='Posted') THEN
  IF TG_OP='INSERT' OR NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Cannot change results of a posted payment'; END IF;
 END IF;
 RETURN NEW;
END $$;

-- Permit the other receipts in the same ordinary multirow correction batch.
CREATE OR REPLACE FUNCTION public.post_payment(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE p public."Payments"%ROWTYPE; amount numeric; available numeric;
BEGIN
  SELECT * INTO STRICT p FROM public."Payments" WHERE "Row ID"=p_id;
  IF p."Status"='Posted' THEN RETURN; END IF;
  IF p."Status" IS DISTINCT FROM 'Processing' THEN
    RAISE EXCEPTION 'Payment must be Processing before posting';
  END IF;
  IF p."Allocation Method" IS NULL OR p."Allocation Method" NOT IN
    ('Single Full','Single Partial','Receive All','Lump Sum','First-day Auto','Loan Close','Selected Charges') THEN
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
    AND q."Row ID"<>p_id AND q."Status" IN ('Processing','Error')
    AND NOT coalesce(nullif(current_setting('payment_crud.parents',true),'')::jsonb ? q."Row ID",false)) THEN
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
  IF p."Allocation Method"='Selected Charges' AND (
    (SELECT count(*) FROM public.payment_charge_balances(p_id)) <>
      cardinality(public.selected_charge_ids(p."Selected Charge IDs"))
    OR EXISTS(SELECT 1 FROM public.payment_charge_balances(p_id) WHERE principal+interest<=0)) THEN
    RAISE EXCEPTION 'Selected charges changed or are not eligible; refresh and review the full selection';
  END IF;
  SELECT coalesce(sum(principal+interest),0) INTO available FROM public.payment_charge_balances(p_id);
  IF amount>available OR (p."Allocation Method" IN ('Single Full','Receive All','First-day Auto','Loan Close','Selected Charges') AND amount<>available) THEN
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
END $function$;

-- Selected Charge IDs is a financial input too; changing only that column must
-- invoke the same posting engine after the BEFORE trigger resets its results.
DROP TRIGGER process_lump_sum ON public."Payments";
CREATE TRIGGER process_lump_sum AFTER INSERT OR UPDATE OF
 "Row ID","Status","Ref Borrower","Amount Received","Payment Method","Allocation Method","Bank Reference","Notes",
 "Created By","Payment Date","Created At","Processed At","Ref Target Charge","Ref Target Loan","Selected Charge IDs"
 ON public."Payments" FOR EACH ROW EXECUTE FUNCTION public.process_lump_sum();

CREATE OR REPLACE FUNCTION public.prepare_loan_close() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE l public."Loans"%ROWTYPE; today date:=(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date;
  target text; today_count integer; latest date; interest numeric:=0; outstanding numeric;
  scheduled numeric; missing numeric; total numeric;
BEGIN
  -- Materialized allocation/repayment cache writes are not new close requests.
  IF TG_OP='UPDATE' AND public.payment_inputs(NEW) IS NOT DISTINCT FROM public.payment_inputs(OLD)
    AND (NEW."Status" IS NOT DISTINCT FROM OLD."Status" OR OLD."Status"='Posted') THEN RETURN NEW; END IF;

  IF TG_OP='UPDATE' AND NEW."Ref Target Loan" IS DISTINCT FROM OLD."Ref Target Loan"
    AND (EXISTS(SELECT 1 FROM public."Payment Allocations" WHERE "Ref Payment"=OLD."Row ID")
      OR EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Payment"=OLD."Row ID")) THEN
    RAISE EXCEPTION 'Prepared or posted payment target loan cannot be changed';
  END IF;
  IF NEW."Ref Target Loan" IS NULL THEN RETURN NEW; END IF;
  IF NEW."Allocation Method" IS DISTINCT FROM 'Loan Close' THEN
    RAISE EXCEPTION 'Target loan is only valid for Loan Close';
  END IF;
  IF TG_OP='UPDATE' AND OLD."Status"='Posted' AND NEW."Ref Target Loan" IS NOT DISTINCT FROM OLD."Ref Target Loan" THEN RETURN NEW; END IF;
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


-- A corrected closing receipt carries its corrected effective date.
CREATE OR REPLACE FUNCTION public.close_payment_loans(p_id text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  UPDATE public."Loans" l SET "Loan Status"='ปิดยอดแล้ว',
    "Close Date"=CASE WHEN coalesce(nullif(current_setting('payment_crud.parents',true),'')::jsonb,'{}') ? p_id
      THEN p."Payment Date" ELSE (statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date END,
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
