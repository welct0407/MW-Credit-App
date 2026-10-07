-- R051: automatic restatement of historical cash when source records change.
-- Preserve R005 membership and R008 captured baseline in/out, timestamps and audit.
-- R005 deltas are labeled accounting corrections, never new receipts/refunds.
-- R008 previously unassigned ledger rows adjust the account opening once when
-- assigned/deleted; each change appends its prior opening and delta to Notes.

CREATE FUNCTION public.r051_historical_account(account_id text,holder_id text)
RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE result text; n integer;
BEGIN
 IF account_id IS NOT NULL THEN RETURN account_id; END IF;
 -- Owner's explicit missing-attribution rule is Lisa. Preserve known holders.
 SELECT count(*),min("Row ID") INTO n,result FROM public."Cash Accounts"
 WHERE "Ref Cash Holder"=coalesce(holder_id,'ch:lisa') AND "Default Account";
 IF n<>1 THEN RAISE EXCEPTION 'Historical correction requires one recorded default account for holder %',coalesce(holder_id,'ch:lisa'); END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.r051_historical_source_flow(kind text,j jsonb)
RETURNS TABLE(day date,account_id text,holder_id text,amount numeric)
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF j IS NULL THEN RETURN; END IF;
 CASE kind
 WHEN 'Payment' THEN
  IF j->>'Status'<>'Posted' THEN RETURN; END IF;
  day:=(j->>'Payment Date')::date; amount:=(j->>'Amount Received')::money::numeric;
  holder_id:=nullif(j->>'Ref Received By Cash Holder',''); account_id:=nullif(j->>'Ref Received By Cash Account','');
 WHEN 'Loan' THEN
  day:=(j->>'Loan Date')::date; amount:=-(j->>'Principal Amount')::money::numeric;
  holder_id:='ch:lisa'; account_id:=nullif(j->>'Ref Disbursed From Cash Account','');
 WHEN 'Business Expense' THEN
  day:=(j->>'Expense Date')::date; amount:=-(j->>'Amount')::money::numeric;
  holder_id:=nullif(j->>'Ref Paid By Cash Holder',''); account_id:=nullif(j->>'Ref Paid By Cash Account','');
  -- Existing negative adjustments without custody are accounting-only.
  IF amount>0 AND holder_id IS NULL AND account_id IS NULL THEN RETURN; END IF;
 WHEN 'Settlement' THEN
  IF j->>'Status'<>'Completed' THEN RETURN; END IF;
  day:=(j->>'Transfer Date')::date; amount:=-(j->>'Amount')::money::numeric;
  holder_id:='ch:lisa'; account_id:=nullif(j->>'Ref Paid From Cash Account','');
 ELSE RAISE EXCEPTION 'Unsupported historical source';
 END CASE;
 IF coalesce(amount,0)=0 THEN RETURN; END IF;
 account_id:=public.r051_historical_account(account_id,holder_id);
 SELECT "Ref Cash Holder" INTO STRICT holder_id FROM public."Cash Accounts" WHERE "Row ID"=account_id;
 IF day IS NULL THEN RAISE EXCEPTION 'Historical correction requires the source date'; END IF;
 RETURN NEXT;
END $$;

-- Freeze inferred attribution on the source's first financial correction, so
-- later default-account changes cannot move its correction to another account.
CREATE OR REPLACE FUNCTION public.guard_opening_included_source() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE kind text; fields text[]; o jsonb:=to_jsonb(OLD); n jsonb:=to_jsonb(NEW); a text;
BEGIN
 kind:=CASE TG_TABLE_NAME WHEN 'Payments' THEN 'Payment' WHEN 'Loans' THEN 'Loan'
  WHEN 'Business Expenses' THEN 'Business Expense' WHEN 'Settlements' THEN 'Settlement' END;
 fields:=CASE kind
  WHEN 'Payment' THEN ARRAY['Amount Received','Payment Date','Ref Received By Cash Holder','Ref Received By Cash Account','Status']
  WHEN 'Loan' THEN ARRAY['Principal Amount','Loan Date','Ref Disbursed From Cash Account']
  WHEN 'Business Expense' THEN ARRAY['Amount','Expense Date','Ref Paid By Cash Holder','Ref Paid By Cash Account']
  WHEN 'Settlement' THEN ARRAY['Amount','Transfer Date','Status','Ref Paid From Cash Account'] END;
 IF NOT EXISTS(SELECT 1 FROM unnest(fields) k WHERE o->k IS DISTINCT FROM n->k) THEN RETURN NEW; END IF;
 IF kind='Payment' THEN
  IF NEW."Ref Received By Cash Account" IS NULL AND OLD."Ref Received By Cash Account" IS NULL THEN
  NEW."Ref Received By Cash Account":=public.r051_historical_account(NEW."Ref Received By Cash Account",NEW."Ref Received By Cash Holder");
  SELECT "Ref Cash Holder" INTO NEW."Ref Received By Cash Holder" FROM public."Cash Accounts" WHERE "Row ID"=NEW."Ref Received By Cash Account";
  END IF;
 ELSIF kind='Loan' THEN
  IF NEW."Ref Disbursed From Cash Account" IS NULL AND OLD."Ref Disbursed From Cash Account" IS NULL THEN
  NEW."Ref Disbursed From Cash Account":=public.r051_historical_account(NEW."Ref Disbursed From Cash Account",'ch:lisa');
  END IF;
 ELSIF kind='Business Expense' THEN
  IF NEW."Ref Paid By Cash Account" IS NULL AND OLD."Ref Paid By Cash Account" IS NULL
   AND (NEW."Amount"::numeric>0 OR NEW."Ref Paid By Cash Holder" IS NOT NULL) THEN
   NEW."Ref Paid By Cash Account":=public.r051_historical_account(NEW."Ref Paid By Cash Account",NEW."Ref Paid By Cash Holder");
   SELECT "Ref Cash Holder" INTO NEW."Ref Paid By Cash Holder" FROM public."Cash Accounts" WHERE "Row ID"=NEW."Ref Paid By Cash Account";
  END IF;
 ELSIF kind='Settlement' THEN
  IF NEW."Status"='Completed' AND NEW."Ref Paid From Cash Account" IS NULL AND OLD."Ref Paid From Cash Account" IS NULL THEN
   NEW."Ref Paid From Cash Account":=public.r051_historical_account(NEW."Ref Paid From Cash Account",'ch:lisa');
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION public.r051_restate_opening_source() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE kind text:=TG_ARGV[0]; o jsonb:=to_jsonb(OLD); n jsonb; f record; key text;
 previous_setting text:=current_setting('r005.allow_cash_adjustment',true);
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.r005_cash_cutover_sources WHERE source_type=kind AND source_row_id=OLD."Row ID") THEN RETURN NULL; END IF;
 IF TG_OP='UPDATE' THEN n:=to_jsonb(NEW); END IF;
 FOR f IN
  SELECT day,account_id,holder_id,sum(amount) amount FROM (
   SELECT day,account_id,holder_id,-amount amount FROM public.r051_historical_source_flow(kind,o)
   UNION ALL SELECT * FROM public.r051_historical_source_flow(kind,n)
  ) changes GROUP BY day,account_id,holder_id HAVING sum(amount)<>0 ORDER BY account_id,day
 LOOP
  key:='r051:opening:'||gen_random_uuid()::text;
  PERFORM set_config('r005.allow_cash_adjustment','on',true);
  INSERT INTO public."Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder","Ref From Cash Account","Ref To Cash Account","Notes","Created By")
  VALUES(key,f.day,'Manual Correction',abs(f.amount),CASE WHEN f.amount<0 THEN f.holder_id END,CASE WHEN f.amount>0 THEN f.holder_id END,
   CASE WHEN f.amount<0 THEN f.account_id END,CASE WHEN f.amount>0 THEN f.account_id END,
   'R051 historical opening source restatement; not a new cash transfer. '||jsonb_build_object('source_type',kind,'source_id',OLD."Row ID",'operation',TG_OP,'delta',f.amount)::text,'SQL:R051');
 END LOOP;
 PERFORM set_config('r005.allow_cash_adjustment',coalesce(previous_setting,''),true);
 RETURN NULL;
END $$;
CREATE TRIGGER zzy_r051_opening AFTER UPDATE OR DELETE ON public."Payments" FOR EACH ROW EXECUTE FUNCTION public.r051_restate_opening_source('Payment');
CREATE TRIGGER zzy_r051_opening AFTER UPDATE OR DELETE ON public."Loans" FOR EACH ROW EXECUTE FUNCTION public.r051_restate_opening_source('Loan');
CREATE TRIGGER zzy_r051_opening AFTER UPDATE OR DELETE ON public."Business Expenses" FOR EACH ROW EXECUTE FUNCTION public.r051_restate_opening_source('Business Expense');
CREATE TRIGGER zzy_r051_opening AFTER UPDATE OR DELETE ON public."Settlements" FOR EACH ROW EXECUTE FUNCTION public.r051_restate_opening_source('Settlement');

CREATE OR REPLACE FUNCTION public.protect_account_cutover() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' AND pg_trigger_depth()>1 AND current_setting('r051.restate_account_opening',true)='on'
  AND (to_jsonb(NEW)-ARRAY['Opening Balance','Notes'])=(to_jsonb(OLD)-ARRAY['Opening Balance','Notes'])
  AND left(NEW."Notes",length(OLD."Notes"))=OLD."Notes" THEN RETURN NEW; END IF;
 IF TG_OP<>'INSERT' OR current_setting('r008.initializing',true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'Account openings are immutable and require the controlled initializer'; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION public.r051_attribute_historical_ledger() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE f record; a text; previous_setting text:=current_setting('r051.restate_account_opening',true);
BEGIN
 -- Only source-owned system entries can reach this path. Manual transfers keep
 -- their current rules. The source's own guards continue to require new accounts.
 IF coalesce(CASE WHEN TG_OP='DELETE' THEN OLD."Entry Origin" ELSE NEW."Entry Origin" END,'')<>'System'
  OR pg_trigger_depth()<2 THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 IF TG_OP<>'INSERT' THEN
  FOR f IN SELECT * FROM (VALUES
   (OLD."Ref From Cash Holder",OLD."Ref From Cash Account",-OLD."Amount"),
   (OLD."Ref To Cash Holder",OLD."Ref To Cash Account",OLD."Amount")
  ) v(holder,account,signed) WHERE holder IS NOT NULL AND account IS NULL ORDER BY holder
  LOOP
   a:=public.r051_historical_account(NULL,f.holder);
   -- A row already represented in an account's opening must not become a full
   -- additional posting when it first acquires an explicit account.
   PERFORM set_config('r051.restate_account_opening','on',true);
   UPDATE public.r008_cash_account_cutover SET
    "Notes"="Notes"||E'\n'||'R051 account attribution: '||jsonb_build_object('source_ledger',OLD."Row ID",'prior_opening',"Opening Balance",'delta',-f.signed)::text,
    "Opening Balance"="Opening Balance"-f.signed
   WHERE "Ref Cash Account"=a AND OLD."Created At"<=("Cutover At" AT TIME ZONE 'Asia/Bangkok');
  END LOOP;
 END IF;
 PERFORM set_config('r051.restate_account_opening',coalesce(previous_setting,''),true);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW."Ref From Cash Holder" IS NOT NULL AND NEW."Ref From Cash Account" IS NULL THEN
  NEW."Ref From Cash Account":=public.r051_historical_account(NULL,NEW."Ref From Cash Holder"); END IF;
 IF NEW."Ref To Cash Holder" IS NOT NULL AND NEW."Ref To Cash Account" IS NULL THEN
  NEW."Ref To Cash Account":=public.r051_historical_account(NULL,NEW."Ref To Cash Holder"); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a000_r051_history_account BEFORE INSERT OR UPDATE OR DELETE ON public."Cash Ledger"
 FOR EACH ROW EXECUTE FUNCTION public.r051_attribute_historical_ledger();

-- Forward replacements of the two existing delete/teardown functions follow.

CREATE OR REPLACE FUNCTION public.business_source_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE expected_source text:=CASE TG_TABLE_NAME WHEN 'Loans' THEN 'Loan' WHEN 'Business Expenses' THEN 'Business Expense' WHEN 'Settlements' THEN 'Settlement' END;
BEGIN
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

CREATE OR REPLACE FUNCTION public.payment_crud_prepare() RETURNS trigger
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

CREATE OR REPLACE FUNCTION public.guard_ledger_cash_accounts() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE changed boolean; holder text;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD."Entry Origin"='System' AND pg_trigger_depth()>1 THEN RETURN OLD; END IF;
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
