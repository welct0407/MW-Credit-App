-- GENERATED FILE - do not edit. Current definitions of every public-schema function
-- after the complete database/migrations chain, as PostgreSQL 18 pg_dump --schema-only
-- prints them, normalized by scripts/database/Normalize-Schema.ps1 -FunctionsOnly.
-- Review reference only: not a migration and never applied. Database CI fails when
-- this file differs from the rebuild. Regenerate after a migration changes routines:
--   pwsh -NoProfile -File scripts/database/Update-PublicFunctions.ps1 -Write


--
-- Name: analytics_history_start(); Type: FUNCTION
--

CREATE FUNCTION public.analytics_history_start() RETURNS date
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT coalesce(min(d),public.olap_reporting_date()) FROM (
  SELECT "Loan Date" d FROM public."Loans"
  UNION ALL SELECT "Payment Date" FROM public."Repayments"
  UNION ALL SELECT "Charge Date" FROM public."Charges"
  UNION ALL SELECT "Expense Date" FROM public."Business Expenses"
  UNION ALL SELECT "Contribution Date" FROM public."Cash Pool Contributions"
  UNION ALL SELECT "Transfer Date" FROM public."Settlements" WHERE "Status"='Completed'
  UNION ALL SELECT "Movement Date" FROM public."Cash Ledger"
  UNION ALL SELECT ("Cutover At" AT TIME ZONE 'Asia/Bangkok')::date FROM public.r008_cash_account_cutover
  UNION ALL SELECT "Snapshot Date" FROM public."Daily Analytics"
 ) dates WHERE d<=public.olap_reporting_date()
$$;


--
-- Name: analytics_refresh_request(); Type: FUNCTION
--

CREATE FUNCTION public.analytics_refresh_request() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE parts text[]; today date:=public.olap_reporting_date(); first_date date;
BEGIN
 IF TG_OP='UPDATE' AND NEW."Analytics Refresh Request" IS NOT DISTINCT FROM OLD."Analytics Refresh Request" THEN RETURN NEW; END IF;
 IF NEW."Analytics Refresh Request" IS NULL THEN RETURN NEW; END IF;
 parts:=string_to_array(NEW."Analytics Refresh Request",'|');
 IF cardinality(parts)<>3 OR parts[1]<>today::text OR parts[2] NOT IN ('Recent','Full') OR coalesce(parts[3],'')='' THEN
  RAISE EXCEPTION 'Analytics refresh requires Bangkok today, Recent or Full, and a unique token';
 END IF;
 first_date:=CASE WHEN parts[2]='Recent' THEN today-1 ELSE public.analytics_history_start() END;
 PERFORM public.refresh_daily_analytics(first_date,today);
 RETURN NEW;
END $$;


--
-- Name: apply_loan_close_calculation_v83(text, date, text); Type: FUNCTION
--

CREATE FUNCTION public.apply_loan_close_calculation_v83(p_loan text, p_day date, p_expected text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE parent text;calculation jsonb;m jsonb;f jsonb;
BEGIN
 SELECT "Ref Borrowers" INTO parent FROM public."Loans" WHERE "Row ID"=p_loan;
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=parent FOR UPDATE;
 PERFORM 1 FROM public."Loans" WHERE "Row ID"=p_loan FOR UPDATE;
 PERFORM 1 FROM public."Charges" WHERE "Ref Loans"=p_loan ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
 calculation:=public.loan_close_calculation_v83(p_loan,p_day);
 IF p_expected IS NOT NULL AND calculation->>'planHash' IS DISTINCT FROM p_expected THEN RAISE EXCEPTION USING ERRCODE='P5B09',MESSAGE='Close plan changed';END IF;
 m:=calculation->'mutation';
 FOR f IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(m->'futureInterest')='array' THEN m->'futureInterest' ELSE '[]'::jsonb END) LOOP
  UPDATE public."Charges" SET "Interest Due"=(f->>'interestDue')::numeric::money,
   "Notes"=coalesce(nullif("Notes",'')||E'\n','')||'Interest Due lowered from '||trim_scale("Interest Due"::numeric)::text||' by Loan Close '||p_day::text
   WHERE "Row ID"=f->>'chargeId' AND "Ref Loans"=p_loan AND "Charge Date">p_day AND "Interest Due"::numeric>(f->>'interestDue')::numeric;
  IF NOT FOUND THEN RAISE EXCEPTION 'Close plan future charge differs from the loan';END IF;
 END LOOP;
 IF m->>'kind'='insert' THEN INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes") VALUES(m->>'chargeId',p_loan,p_day,(m->>'principal')::numeric::money,(m->>'interest')::numeric::money,'Final charge prepared by Loan Close');
 ELSIF m->>'kind'='increase' THEN UPDATE public."Charges" SET "Principal Due"=("Principal Due"::numeric+(m->>'principal')::numeric)::money WHERE "Row ID"=m->>'chargeId';END IF;
 RETURN calculation;
END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;


--
-- Name: apply_principal_daily_interest(public."Loans", public."Loans"); Type: FUNCTION
--

CREATE FUNCTION public.apply_principal_daily_interest(p public."Loans", previous public."Loans") RETURNS public."Loans"
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE principal_changed boolean; entering_daily boolean;
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
 entering_daily:=previous."Loan Type" IS DISTINCT FROM 'ดอกเบี้ยรายวัน';
 IF entering_daily AND coalesce(p."Auto Charge Enabled",false) AND (p."Loan Date" IS NULL OR NOT coalesce(p."Interest Payment Interval">=1,false)) THEN
  RAISE EXCEPTION 'Automatic daily conversion requires a loan date and positive interest payment interval';
 END IF;
 IF principal_changed OR entering_daily THEN
  IF p."Original Daily Interest Rate" IS NULL THEN
   IF entering_daily THEN
    RAISE EXCEPTION 'Original daily interest rate unavailable; review original loan terms before daily conversion';
   END IF;
   RAISE EXCEPTION 'Original daily interest rate unavailable; review original loan terms before principal repayment';
  END IF;
  p."Current Daily Interest":=round(greatest(0,p."Outstanding Principal")*p."Original Daily Interest Rate"/100.0)::money;
 ELSE
  -- Preserve entry/backlog amount until a principal change; stale app saves cannot undo adjustment.
  p."Current Daily Interest":=previous."Current Daily Interest";
 END IF;
 RETURN p;
END $$;


--
-- Name: appsheet_normalize_blank_refs(); Type: FUNCTION
--

CREATE FUNCTION public.appsheet_normalize_blank_refs() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ DECLARE col text; patch jsonb := '{}'::jsonb; BEGIN FOREACH col IN ARRAY TG_ARGV LOOP IF to_jsonb(NEW)->>col = '' THEN patch := patch || jsonb_build_object(col,NULL); END IF; END LOOP; IF patch <> '{}'::jsonb THEN NEW := jsonb_populate_record(NEW,patch); END IF; RETURN NEW; END $$;


--
-- Name: attach_payment_receipt_evidence(text, text, text, timestamp with time zone, jsonb, uuid, text); Type: FUNCTION
--

CREATE FUNCTION public.attach_payment_receipt_evidence(p_payment text, p_receipt text, p_key text, p_captured timestamp with time zone, p_expected jsonb, p_operation uuid, p_code_version text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE before_value public."Payments"%ROWTYPE; after_value public."Payments"%ROWTYPE;
 local_capture timestamp; environment text; fields text[]:=ARRAY['IG Receipt ID','Receipt Image','Receipt Received At'];
BEGIN
 IF NOT (CASE WHEN current_setting('role',true) IN ('none','') THEN session_user::text ELSE current_setting('role',true) END='mw_receipt_projector' AND session_user IN ('mw_receipt_projector','mw-integration-agent@clever-oasis-508610-n7.iam')) THEN RAISE EXCEPTION 'Dedicated receipt projector required'; END IF;
 environment:=CASE current_database() WHEN 'loan_manager_dev' THEN 'dev' WHEN 'loan_manager_prod' THEN 'prod' END;
 IF environment IS NULL OR p_receipt IS NULL OR p_receipt !~ '^[0-9a-f]{64}$'
  OR p_captured IS NULL OR NOT isfinite(p_captured) OR p_expected IS NULL
  OR p_operation IS NULL OR nullif(p_code_version,'') IS NULL THEN
  RAISE EXCEPTION 'Invalid receipt projection';
 END IF;
 IF p_key IS NULL OR p_key !~ ('^receipts/'||environment||'/[0-9]{4}/[0-9]{2}/[0-9]{2}/'||p_receipt||'/[0-9a-f]{64}\.(jpg|png|webp)$') THEN
  RAISE EXCEPTION 'Invalid receipt object key';
 END IF;
 SELECT * INTO before_value FROM public."Payments" WHERE "Row ID"=p_payment FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Receipt payment missing'; END IF;
 IF (before_value."Status"='Posted'
  AND before_value."Ref Borrower"=p_expected->>'borrower'
  AND before_value."Amount Received"::numeric=(p_expected->>'amount')::numeric
  AND before_value."Amount Received"::numeric=(SELECT coalesce(sum("Principal Paid"::numeric+"Interest Paid"::numeric+"Late Charge Paid"::numeric),0) FROM public."Repayments" WHERE "Ref Payment"=p_payment) /* R118 */
  AND before_value."Payment Date"=(p_expected->>'date')::date
  AND to_char(before_value."Created At",'YYYY-MM-DD HH24:MI')=p_expected->>'clock'
  AND before_value."Bank Reference"=p_expected->>'reference'
  AND before_value."Ref Received By Cash Account"=p_expected->>'account') IS NOT TRUE THEN
  RAISE EXCEPTION 'Receipt payment verification conflict';
 END IF;
 local_capture:=p_captured AT TIME ZONE 'Asia/Bangkok';
 IF (before_value."IG Receipt ID",before_value."Receipt Image",before_value."Receipt Received At")
  IS NOT DISTINCT FROM (p_receipt,'//'||p_key,local_capture) THEN RETURN 'already_applied'; END IF;
 IF before_value."IG Receipt ID" IS NOT NULL THEN RAISE EXCEPTION 'Receipt primary already assigned'; END IF;
 INSERT INTO agent_audit.commits(operation_id,reviewer_id,reviewer_login,plan_sha256,request_reason,direct_targets,code_version)
 VALUES(p_operation,'receipt-projector','service:receipt-projector',p_receipt,'atomic: attach verified receipt evidence',
  jsonb_build_array(jsonb_build_object('table','Payments','key',p_payment)),p_code_version);
 UPDATE public."Payments" SET "IG Receipt ID"=p_receipt,"Receipt Image"='//'||p_key,"Receipt Received At"=local_capture
  WHERE "Row ID"=p_payment RETURNING * INTO after_value;
 -- Existing row guards may run; absolutely no other persisted field may change.
 IF to_jsonb(before_value)-fields IS DISTINCT FROM to_jsonb(after_value)-fields THEN
  RAISE EXCEPTION 'Receipt projection changed business values';
 END IF;
 INSERT INTO agent_audit.row_changes(operation_id,schema_name,table_name,action,row_key,before_row,after_row)
 VALUES(p_operation,'public','Payments','UPDATE',jsonb_build_object('Row ID',p_payment),
  jsonb_build_object('IG Receipt ID',before_value."IG Receipt ID",'Receipt Image',before_value."Receipt Image",'Receipt Received At',before_value."Receipt Received At"),
  jsonb_build_object('IG Receipt ID',p_receipt,'Receipt Image','//'||p_key,'Receipt Received At',local_capture));
 RETURN 'applied';
END $_$;


--
-- Name: begin_business_history(); Type: FUNCTION
--

CREATE FUNCTION public.begin_business_history() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF pg_trigger_depth()=1 THEN PERFORM set_config('business_history.statement_active','on',true); END IF;
 RETURN NULL;
END $$;


--
-- Name: business_history_refresh(); Type: FUNCTION
--

CREATE FUNCTION public.business_history_refresh() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE o jsonb:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 n jsonb:=CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
 fields text[]; date_column text:=TG_ARGV[0]; d date; first_day date; last_day date;
BEGIN
 fields:=CASE TG_TABLE_NAME
  WHEN 'Loans' THEN ARRAY['Loan Date','Principal Amount','Loan Status','Close Date','Defaulted','Ref Borrowers']
  WHEN 'Charges' THEN ARRAY['Charge Date','Principal Due','Interest Due','Ref Loans','Late Charge Due'] -- R118
  WHEN 'Business Expenses' THEN ARRAY['Expense Date','Amount','Partner A Expense','Partner B Expense']
  WHEN 'Cash Ledger' THEN ARRAY['Movement Date','Amount','Movement Type','Ref From Cash Holder','Ref To Cash Holder','Ref From Cash Account','Ref To Cash Account']
  WHEN 'Cash Pool Contributions' THEN ARRAY['Contribution Date','Amount','Transaction Type','Ref Partner']
  WHEN 'Settlements' THEN ARRAY['Transfer Date','Amount','Status','Ref Partner']
  WHEN 'Repayments' THEN ARRAY['Payment Date','Principal Paid','Interest Paid','Ref Loans','Ref Charges','Late Charge Paid']
  WHEN 'Partners' THEN ARRAY['Partner Role'] END;
 IF TG_OP='UPDATE' AND NOT EXISTS(SELECT 1 FROM unnest(fields) k WHERE o->k IS DISTINCT FROM n->k) THEN RETURN NULL; END IF;
 d:=least((o->>date_column)::date,(n->>date_column)::date);
 IF TG_TABLE_NAME='Loans' AND TG_OP='UPDATE' AND
  (o->'Loan Date',o->'Principal Amount',o->'Ref Borrowers') IS NOT DISTINCT FROM (n->'Loan Date',n->'Principal Amount',n->'Ref Borrowers') THEN
  d:=least((o->>'Close Date')::date,(n->>'Close Date')::date);
 END IF;
 IF TG_TABLE_NAME='Partners' THEN
  SELECT min("Contribution Date") INTO d FROM public."Cash Pool Contributions" WHERE "Ref Partner" IN (o->>'Row ID',n->>'Row ID');
 END IF;
 IF d IS NULL THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME='Cash Ledger' THEN
  PERFORM set_config('business_history.accounts',
   (coalesce(nullif(current_setting('business_history.accounts',true),'')::jsonb,'{}'::jsonb) ||
    coalesce((SELECT jsonb_object_agg(k,true) FROM unnest(ARRAY[o->>'Ref From Cash Account',o->>'Ref To Cash Account',n->>'Ref From Cash Account',n->>'Ref To Cash Account']) k WHERE k IS NOT NULL),'{}'::jsonb))::text,true);
 END IF;
 PERFORM public.request_business_history(d);
 RETURN NULL;
END $$;


--
-- Name: business_source_delete(); Type: FUNCTION
--

CREATE FUNCTION public.business_source_delete() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE expected_source text:=CASE TG_TABLE_NAME WHEN 'Loans' THEN 'Loan' WHEN 'Business Expenses' THEN 'Business Expense' WHEN 'Settlements' THEN 'Settlement' END;
BEGIN
 IF TG_TABLE_NAME='Loans' THEN
  IF coalesce((to_jsonb(OLD)->>'Defaulted')::boolean,false)
   OR EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"=OLD."Row ID" AND starts_with("Row ID",'df10:')) THEN
   RAISE EXCEPTION 'Undo Default before deleting this loan'; END IF;
  IF EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Loans"=OLD."Row ID") THEN
   RAISE EXCEPTION 'Loan has receipts; delete or reassign those receipts first'; END IF;
  DELETE FROM public."Charges" WHERE "Ref Loans"=OLD."Row ID";
 END IF;
 DELETE FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"=expected_source
  AND "Source Key"=CASE expected_source WHEN 'Loan' THEN 'LOAN:' WHEN 'Business Expense' THEN 'EXPENSE:' WHEN 'Settlement' THEN 'SETTLEMENT:' END||OLD."Row ID";
 RETURN OLD;
END $$;


--
-- Name: calculate_business_expense(); Type: FUNCTION
--

CREATE FUNCTION public.calculate_business_expense() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE allocation_date date;
BEGIN
 -- R129: a rebate paid by a settlement goes only after the settlement (every path: a closing-payment delete or
 -- correction, a direct delete).
 IF TG_OP='DELETE' AND OLD."Source Type"='Referral Rebate' AND OLD."Ref Rebate Settlement" IS NOT NULL THEN RAISE EXCEPTION 'Remove the settlement first'; END IF;
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
   -- R129: "Ref Rebate Settlement" is set (to the new value) or cleared (the old value) only while pwa.rebate_settlement
   -- names that settlement (pwa_apply_rebate_settlement_v1), never moved from one settlement to another, never on a manual row.
   IF NEW."Ref Rebate Settlement" IS DISTINCT FROM OLD."Ref Rebate Settlement" AND (OLD."Source Type" IS DISTINCT FROM 'Referral Rebate'
     OR (NEW."Ref Rebate Settlement" IS NOT NULL AND OLD."Ref Rebate Settlement" IS NOT NULL)
     OR nullif(current_setting('pwa.rebate_settlement',true),'') IS DISTINCT FROM coalesce(NEW."Ref Rebate Settlement",OLD."Ref Rebate Settlement")) THEN
     RAISE EXCEPTION 'Rebate settlement links change only through a rebate settlement';
   END IF;
   -- R129 D1: the owner-authorized legacy conversion (V1/V2 to V3) of one row, only while pwa.rebate_convert names it.
   IF OLD."Source Type"='Referral Rebate' AND NEW."Rule Version" IS DISTINCT FROM OLD."Rule Version" AND (OLD."Rule Version" NOT IN ('REFERRAL_REBATE_V1','REFERRAL_REBATE_V2')
     OR NEW."Rule Version" IS DISTINCT FROM 'REFERRAL_REBATE_V3' OR nullif(current_setting('pwa.rebate_convert',true),'') IS DISTINCT FROM OLD."Row ID") THEN
     RAISE EXCEPTION 'Automatic referral expenses are system-managed';
   END IF;
   IF OLD."Source Type"='Referral Rebate' AND
     (to_jsonb(NEW)-ARRAY['Partner A Share','Partner B Share','Partner A Expense','Partner B Expense','Allocation Basis','Ref Rebate Settlement','Rule Version'])
       IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['Partner A Share','Partner B Share','Partner A Expense','Partner B Expense','Allocation Basis','Ref Rebate Settlement','Rule Version']) THEN
     RAISE EXCEPTION 'Automatic referral expenses are system-managed';
   END IF;
   -- R129: the expense, its date and the Partner split stay as booked at the close.
   IF OLD."Source Type"='Referral Rebate' AND (NEW."Ref Rebate Settlement" IS DISTINCT FROM OLD."Ref Rebate Settlement" OR NEW."Rule Version" IS DISTINCT FROM OLD."Rule Version") THEN
     NEW."Partner A Share":=OLD."Partner A Share"; NEW."Partner B Share":=OLD."Partner B Share";
     NEW."Partner A Expense":=OLD."Partner A Expense"; NEW."Partner B Expense":=OLD."Partner B Expense"; NEW."Allocation Basis":=OLD."Allocation Basis";
     RETURN NEW;
   END IF;
 END IF;
 -- R129: a new row never starts settled.
 IF TG_OP='INSERT' AND NEW."Ref Rebate Settlement" IS NOT NULL THEN RAISE EXCEPTION 'Rebate settlement links change only through a rebate settlement'; END IF;
 IF NEW."Source Type"='Referral Rebate' THEN
   IF TG_OP='INSERT' AND pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Referral expenses require a qualifying loan-close event'; END IF;
   -- R140 V144: a referral rebate moves its cash at close or settlement, never on a paid date.
   IF NEW."Paid Date" IS NOT NULL THEN RAISE EXCEPTION 'A paid date belongs to a paid manual expense'; END IF;
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
   -- R140 V144: a paid date needs a paying account (not pending) and no R005 cutover identity.
   IF NEW."Paid Date" IS NOT NULL AND (NEW."Ref Paid By Cash Account" IS NULL
     OR EXISTS(SELECT 1 FROM public.r005_cash_cutover_sources WHERE source_type='Business Expense' AND source_row_id=NEW."Row ID")) THEN
     RAISE EXCEPTION 'A paid date belongs to a paid manual expense'; END IF;
   -- R140 V145: a paid date is never before the expense date, checked when either date is written (existing rows stay).
   IF NEW."Paid Date"<NEW."Expense Date" AND (TG_OP='INSERT' OR NEW."Paid Date" IS DISTINCT FROM OLD."Paid Date" OR NEW."Expense Date" IS DISTINCT FROM OLD."Expense Date") THEN
     RAISE EXCEPTION 'A paid date cannot be before the expense date'; END IF;
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


--
-- Name: cash_account_holder(text, boolean); Type: FUNCTION
--

CREATE FUNCTION public.cash_account_holder(p_account text, p_active boolean DEFAULT true) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE holder text;
BEGIN
 SELECT a."Ref Cash Holder" INTO holder FROM public."Cash Accounts" a
 JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder"
 WHERE a."Row ID"=p_account AND (NOT p_active OR (a."Active" AND h."Active")) FOR SHARE OF a,h;
 IF NOT FOUND THEN RAISE EXCEPTION 'A valid active cash account is required'; END IF;
 RETURN holder;
END $$;


--
-- Name: cash_source_changed(); Type: FUNCTION
--

CREATE FUNCTION public.cash_source_changed() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN PERFORM public.sync_cash_ledger(TG_ARGV[0],NEW."Row ID"); RETURN NULL; END $$;


--
-- Name: charge_generation_request(); Type: FUNCTION
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
-- Name: close_payment_loans(text); Type: FUNCTION
--

CREATE FUNCTION public.close_payment_loans(p_id text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
        c."Principal Due"::numeric+c."Interest Due"::numeric+c."Late Charge Due"::numeric >
          (SELECT coalesce(sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric+r."Late Charge Paid"::numeric),0)
           FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID")));
END $$;


--
-- Name: closing_payment_guard(); Type: FUNCTION
--

CREATE FUNCTION public.closing_payment_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: create_first_day_charge(text); Type: FUNCTION
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
  SELECT parts.principal,parts.interest INTO STRICT principal,interest
    FROM public.first_day_components_v83(l) parts;
  INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
    VALUES('fd6:'||p_loan,p_loan,l."Loan Date",principal::money,interest::money);
END $$;


--
-- Name: create_referral_rebate(text); Type: FUNCTION
--

CREATE FUNCTION public.create_referral_rebate(p_loan text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE l public."Loans"%ROWTYPE; referrer text; payee text; principal numeric; profit numeric; rebate numeric;
 r jsonb; offset_id text; ids text; actual public."Payments"%ROWTYPE; loan_key text;
 -- R111 V124: the automatic offset outside the Loan Close command.
 plan jsonb; offset_plan jsonb; covered numeric; creator text; h text; request uuid; canonical text;
 terms jsonb; -- R120: the referrer's rate and cap
BEGIN
 IF pg_trigger_depth()<1 THEN RAISE EXCEPTION 'Referral creation is only supported by loan-close trigger'; END IF;
 SELECT * INTO l FROM public."Loans" WHERE "Row ID"=p_loan FOR UPDATE;
 IF l."Loan Status" IS DISTINCT FROM 'ปิดยอดแล้ว' OR coalesce(l."Defaulted",false)
   OR l."Close Date" IS NULL OR l."Ref Closing Payment" IS NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Source Key"='REFERRAL_REBATE:'||p_loan) THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"=l."Ref Closing Payment" AND "Status"='Posted' AND "Amount Received"::numeric>0) THEN RETURN; END IF;
 -- R118: profit is interest plus late charge received (owner decision of 3 November 2026).
 SELECT sum("Principal Paid"::numeric),sum("Interest Paid"::numeric+"Late Charge Paid"::numeric) INTO principal,profit
 FROM public."Repayments" WHERE "Ref Loans"=p_loan;
 IF coalesce(principal,0)<l."Principal Amount"::numeric OR coalesce(profit,0)<=0 THEN RETURN; END IF;
 SELECT "Ref Referrer" INTO referrer FROM public."Borrowers" WHERE "Row ID"=l."Ref Borrowers";
 IF referrer IS NULL THEN RETURN; END IF;
 SELECT "Borrower Name" INTO payee FROM public."Borrowers" WHERE "Row ID"=referrer;
 -- R120: the referrer's own rate and cap (referral_rebate_terms, defaults 10% and 1,000), as the projection reads them.
 terms:=public.referral_rebate_terms(referrer);
 rebate:=least(round(profit*(terms->>'rate')::numeric/100),(terms->>'cap')::numeric);
 IF rebate<=0 THEN RETURN; END IF;
 -- R111 V123: the notes name the closed loan by the key the app shows (paymentLoanDisplayKey: borrower - English name,
 -- principal, loan day/month, original rate), not its Row ID.
 SELECT coalesce(b."Borrower Name",'')||' - '||coalesce(b."Description",'')||'-'||coalesce('฿'||to_char(round(l."Principal Amount"::numeric),'FM999,999,999,999,990'),'')
   ||'-'||coalesce(to_char(l."Loan Date",'DD/MM'),'')||'-'||coalesce(l."Original Daily Interest Rate"::text||'%','Unavailable')
  INTO loan_key FROM public."Borrowers" b WHERE b."Row ID"=l."Ref Borrowers";
 -- R111: inside the closing command, a chosen offset books the stored plan's charges and posts the offset payment on the
 -- referrer's loans (its plan is result_json.rebate.offsetPlan); drift is P4C05 and rolls the close back.
 IF current_setting('pwa.rebate_offset',true) IS NOT DISTINCT FROM l."Ref Closing Payment" THEN
  SELECT j.result_json->'rebate' INTO r FROM public.pwa_payment_commands j WHERE j.contract_version=2 AND j.outcome='applied'
   AND j.result_json->>'paymentId'=l."Ref Closing Payment" AND j.canonical_json::jsonb#>>'{command,operation}'='loan.close';
  IF r->>'offsetPaymentId' IS NOT NULL THEN
   IF (r->>'amount')::numeric IS DISTINCT FROM rebate OR r->>'referrerId' IS DISTINCT FROM referrer OR r->>'offsetPaymentId' IS DISTINCT FROM 'ro122:'||l."Ref Closing Payment" THEN RAISE EXCEPTION USING ERRCODE='P4C05'; END IF;
   offset_id:=r->>'offsetPaymentId';
   PERFORM public.pwa_apply_pay_forward_v1('[]'::jsonb,r->'materialize',l."Close Date");
   SELECT string_agg(value->>'chargeId',' , ' ORDER BY (value->>'chargeId') COLLATE "C") INTO ids FROM jsonb_array_elements(r#>'{offsetPlan,allocations}');
   INSERT INTO public."Payments"("Row ID","Ref Borrower","Payment Date","Amount Received","Payment Method","Allocation Method","Selected Charge IDs","Ref Received By Cash Account","Notes","Created By","Status")
    VALUES(offset_id,referrer,l."Close Date",(r->>'offsetAmount')::numeric::money,'Referral Rebate Offset','Selected Charges',ids,r#>>'{offsetPlan,cashAccountId}','Rebate from loan '||coalesce(loan_key,p_loan),
     (SELECT "Created By" FROM public."Payments" WHERE "Row ID"=l."Ref Closing Payment"),'Processing');
   SELECT * INTO actual FROM public."Payments" WHERE "Row ID"=offset_id;
   IF actual."Status" IS DISTINCT FROM 'Posted' OR actual."Amount Received"::numeric IS DISTINCT FROM (r->>'offsetAmount')::numeric THEN RAISE EXCEPTION USING ERRCODE='P4C05'; END IF;
  END IF;
 -- R111 V124: a referred loan closed today by an ordinary payment (the manual command or the agent receipt command, run by
 -- the journal owner) settles the rebate on the referrer's open loans by default: the pay-forward plan (forward only) under
 -- the referrer's borrower -> loans -> charges locks (after the closing borrower's), its charges booked by the shared
 -- writer, and the offset payment ro122:<closing payment>:<closed loan> posted with an explicit plan journalled as
 -- system.rebate-offset (R117 V131: one offset per closed loan, so one payment that closes several referred loans posts
 -- one offset, one journal row and one request id for each; the Loan Close branch above keeps ro122:<closing payment>).
 -- A refused schedule (P0001, P4C05) leaves the rebate payable as before and never fails the closing payment; other
 -- errors (a deadlock, a lock timeout) propagate. A historical re-post (close date not today) stays expense only.
 ELSIF (current_user=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END
   AND l."Close Date"=(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AND referrer IS DISTINCT FROM l."Ref Borrowers"
   AND EXISTS(SELECT 1 FROM public."Loans" x WHERE x."Ref Borrowers"=referrer AND x."Loan Status"='ยังไม่ปิดยอด' AND NOT coalesce(x."Defaulted",false))) THEN
  BEGIN
   PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=referrer FOR UPDATE;
   PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers"=referrer ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
   PERFORM 1 FROM public."Charges" ch JOIN public."Loans" x ON x."Row ID"=ch."Ref Loans" WHERE x."Ref Borrowers"=referrer ORDER BY ch."Row ID" COLLATE "C" FOR UPDATE OF ch;
   -- R117 V131: an earlier offset in this transaction (another loan closed by the same payment) paid charges whose
   -- materialized balances refresh only at commit (deferred vc_repayment_changed); the plan selects on "Amount Remaining",
   -- so run that trigger's own work now (the pending charge and loan refreshes of this transaction).
   PERFORM public.r051_flush_parents('charge'); PERFORM public.r051_flush_parents('loan');
   plan:=public.pwa_pay_forward_plan_v1(referrer,rebate,l."Close Date",'{"forward":true,"principal":[],"loans":null}'::jsonb);
   covered:=rebate-(plan->>'uncovered')::numeric;
   IF covered>0 THEN
    offset_id:='ro122:'||l."Ref Closing Payment"||':'||p_loan; -- R117 V131: one offset per closed loan
    creator:=coalesce(nullif(btrim((SELECT "Created By" FROM public."Payments" WHERE "Row ID"=l."Ref Closing Payment")),''),'SQL:loan-close');
    offset_plan:=jsonb_build_object('borrowerId',referrer,'amountReceived',trunc(covered)::text,'allocations',plan->'allocations','allocationMethod','Selected Charges',
     'targetChargeId',NULL,'targetLoanId',NULL,'cashAccountId',public.default_cash_account('ch:lisa'),'paymentDate',l."Close Date"::text,'paymentMethod','Referral Rebate Offset');
    IF offset_plan->>'cashAccountId' IS NULL THEN RAISE EXCEPTION USING ERRCODE='P4C05'; END IF;
    -- One documented derivation: request id = md5('mw-credit-rebate-offset-v1:'||offset payment id) with the UUID v4 bits.
    h:=md5('mw-credit-rebate-offset-v1:'||offset_id);
    request:=(substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-'||substr('89ab',(get_byte(decode(substr(h,17,2),'hex'),0)%4)+1,1)||substr(h,18,3)||'-'||substr(h,21,12))::uuid;
    canonical:=jsonb_build_object('contractVersion',2,'requestId',request::text,
     'actor',jsonb_build_object('issuer','SQL','subject','loan-close','partnerId','SQL:loan-close','loginEmail',creator),
     'command',jsonb_build_object('operation','system.rebate-offset','targetType','loan','targetId',p_loan))::text;
    INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code,result_json)
    VALUES(request,2,'SQL','loan-close','SQL:loan-close',creator,canonical,encode(sha256(convert_to(canonical,'UTF8')),'hex'),'applied',NULL,NULL,
     jsonb_build_object('operation','system.rebate-offset','targetType','loan','targetId',p_loan,'paymentId',offset_id,'plan',offset_plan,'predecessorRequestId',NULL,'sourceCreatedBy',creator));
    PERFORM public.pwa_apply_pay_forward_v1('[]'::jsonb,plan->'materialize',l."Close Date");
    SELECT string_agg(value->>'chargeId',' , ' ORDER BY (value->>'chargeId') COLLATE "C") INTO ids FROM jsonb_array_elements(plan->'allocations');
    INSERT INTO public."Payments"("Row ID","Ref Borrower","Payment Date","Amount Received","Payment Method","Allocation Method","Selected Charge IDs","Ref Received By Cash Account","Notes","Created By","Status")
     VALUES(offset_id,referrer,l."Close Date",covered::money,'Referral Rebate Offset','Selected Charges',ids,offset_plan->>'cashAccountId','Rebate from loan '||coalesce(loan_key,p_loan),creator,'Processing');
    SELECT * INTO actual FROM public."Payments" WHERE "Row ID"=offset_id;
    IF actual."Status" IS DISTINCT FROM 'Posted' OR actual."Amount Received"::numeric IS DISTINCT FROM covered THEN RAISE EXCEPTION USING ERRCODE='P4C05'; END IF;
   END IF;
  EXCEPTION WHEN SQLSTATE 'P0001' OR SQLSTATE 'P4C05' THEN offset_id:=NULL;
  END;
 END IF;
 INSERT INTO public."Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Payee Name",
  "Ref Payee Borrower","Ref Related Borrower","Ref Related Loan","Source Type","Source Key","Gross Profit Basis","Rule Version","Created By","Ref Offset Payment","Rebate Rate","Rebate Cap")
 VALUES('rr1:'||p_loan,l."Close Date",'Referral Rebate / เงินคืนค่าแนะนำลูกค้า',rebate::money,payee,referrer,l."Ref Borrowers",p_loan,
  'Referral Rebate','REFERRAL_REBATE:'||p_loan,profit::money,'REFERRAL_REBATE_V3' /* R129: cash moves on settlement */,'SQL:loan-close',offset_id,(terms->>'rate')::numeric,(terms->>'cap')::numeric)
 ON CONFLICT ("Source Key") WHERE nullif(btrim("Source Key"),'') IS NOT NULL DO NOTHING;
END $$;


--
-- Name: FUNCTION create_referral_rebate(p_loan text); Type: COMMENT
--

COMMENT ON FUNCTION public.create_referral_rebate(p_loan text) IS 'R111/R118/R120/R129: the referral rebate of a closed referred loan, the referrer''s rate (default 10%) of the interest and late charges received, at most the referrer''s cap (default 1,000), offset to the referrer''s open loan where possible; the rest is pending payment until a rebate settlement (REFERRAL_REBATE_V3). The applied terms are stored on the expense.';


--
-- Name: daily_interest_basis(text); Type: FUNCTION
--

CREATE FUNCTION public.daily_interest_basis(p_arrangement text) RETURNS numeric[]
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE m text[]; matches integer:=0; result numeric[];
BEGIN
 FOR m IN SELECT regexp_matches(coalesce(p_arrangement,''),
  '\[Original daily interest: ([0-9]+(?:\.[0-9]+)?) baht/day on ([0-9]+(?:\.[0-9]+)?) baht principal\]','g')
 LOOP
  matches:=matches+1; result:=ARRAY[m[1]::numeric,m[2]::numeric];
 END LOOP;
 IF matches>1 OR (matches=1 AND (result[1]<=0 OR result[2]<=0)) THEN
  RAISE EXCEPTION 'Daily interest basis is invalid; review the loan arrangement';
 END IF;
 IF matches=0 AND strpos(coalesce(p_arrangement,''),'[Original daily interest:')>0 THEN
  RAISE EXCEPTION 'Daily interest basis is malformed; review the loan arrangement';
 END IF;
 RETURN result;
END $$;


--
-- Name: daily_interest_basis_note(numeric[]); Type: FUNCTION
--

CREATE FUNCTION public.daily_interest_basis_note(p_basis numeric[]) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT '[Original daily interest: '||p_basis[1]::text||' baht/day on '||p_basis[2]::text||' baht principal]'
  ||' Original rate: '||round(100*p_basis[1]/p_basis[2],8)::text
  ||'% per day. Daily interest automatically follows remaining principal; retain this note.';
$$;


--
-- Name: default_cash_account(text); Type: FUNCTION
--

CREATE FUNCTION public.default_cash_account(p_holder text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT a."Row ID" FROM public."Cash Accounts" a JOIN public."Cash Holders" h
 ON h."Row ID"=a."Ref Cash Holder" WHERE a."Ref Cash Holder"=p_holder
 AND a."Active" AND a."Default Account" AND h."Active";
$$;


--
-- Name: default_loan_transition(); Type: FUNCTION
--

CREATE FUNCTION public.default_loan_transition() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE req jsonb; keep boolean; loss_date date; actor text; amount numeric; ledger money;
BEGIN
  IF TG_OP='INSERT' THEN
    IF coalesce(NEW."Defaulted",false) THEN RAISE EXCEPTION 'Create the loan before confirming default'; END IF;
    RETURN NEW;
  END IF;
  -- R109 (V120): the request of pwa_apply_loan_source_v2, read and cleared once, so it never reaches another row or statement.
  BEGIN req:=nullif(current_setting('business_crud.default_request',true),'')::jsonb;
  EXCEPTION WHEN OTHERS THEN req:='{}'::jsonb; END;
  IF req IS NOT NULL THEN
    PERFORM set_config('business_crud.default_request','',true);
    IF jsonb_typeof(req) IS DISTINCT FROM 'object' OR req->>'loan' IS DISTINCT FROM OLD."Row ID" OR NEW."Row ID" IS DISTINCT FROM OLD."Row ID"
      OR req->>'op' IS NULL OR req->>'op' NOT IN ('post','undo') THEN
      RAISE EXCEPTION 'Default request does not match this loan';
    END IF;
  END IF;
  -- Undo Default: the request (an open loan with a loss, or a Defaulted loan), or the legacy Defaulted true -> false.
  IF req->>'op'='undo' OR (req IS NULL AND coalesce(OLD."Defaulted",false) AND NEW."Defaulted"=false) THEN
    IF NEW."Principal Amount" IS DISTINCT FROM OLD."Principal Amount" OR NEW."Ref Borrowers" IS DISTINCT FROM OLD."Ref Borrowers" THEN
      RAISE EXCEPTION 'Undo default before changing loan inputs'; END IF;
    IF NOT coalesce(OLD."Defaulted",false) AND OLD."Loan Status" IS DISTINCT FROM 'ยังไม่ปิดยอด' THEN
      RAISE EXCEPTION 'Undo Default requires an open or Defaulted loan'; END IF;
    PERFORM public.undo_loan_default(OLD);
    IF coalesce(OLD."Defaulted",false) THEN
      NEW."Defaulted":=false; NEW."Loan Status":='ยังไม่ปิดยอด'; NEW."Close Date":=NULL; NEW."Closed By":=NULL;
    ELSE
      NEW."Defaulted":=OLD."Defaulted"; NEW."Loan Status":=OLD."Loan Status"; NEW."Close Date":=OLD."Close Date"; NEW."Closed By":=OLD."Closed By";
    END IF;
    NEW."Default Loss Amount":=(SELECT nullif(coalesce(sum(c."Principal Due"::numeric),0),0)::money FROM public."Charges" c
      WHERE c."Ref Loans"=NEW."Row ID" AND starts_with(c."Row ID",'df10:'));
    RETURN NEW;
  END IF;
  -- Default Loan: the request, or the legacy ordinary-source Defaulted false -> true (whole outstanding, write off and close).
  IF req->>'op'='post' OR (req IS NULL AND NOT coalesce(OLD."Defaulted",false) AND coalesce(NEW."Defaulted",false)) THEN
    IF NEW."Principal Amount" IS DISTINCT FROM OLD."Principal Amount" OR NEW."Ref Borrowers" IS DISTINCT FROM OLD."Ref Borrowers"
      OR NEW."Auto Charge Enabled" IS DISTINCT FROM OLD."Auto Charge Enabled" THEN
      RAISE EXCEPTION 'Do not change loan inputs while confirming default';
    END IF;
    IF req IS NULL THEN
      keep:=false; loss_date:=NEW."Close Date"; actor:=NEW."Closed By";
    ELSE
      BEGIN keep:=(req->>'keepCharges')::boolean; loss_date:=(req->>'date')::date; actor:=req->>'actor'; amount:=(req->>'amount')::numeric;
      EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Default request does not match this loan'; END;
      IF keep IS NULL OR amount IS NULL OR (keep AND (coalesce(NEW."Defaulted",false) IS DISTINCT FROM coalesce(OLD."Defaulted",false)
          OR NEW."Loan Status" IS DISTINCT FROM OLD."Loan Status" OR NEW."Close Date" IS DISTINCT FROM OLD."Close Date" OR NEW."Closed By" IS DISTINCT FROM OLD."Closed By"))
        OR (NOT keep AND (NOT coalesce(NEW."Defaulted",false) OR NEW."Close Date" IS DISTINCT FROM loss_date OR NEW."Closed By" IS DISTINCT FROM actor)) THEN
        RAISE EXCEPTION 'Default request does not match this loan';
      END IF;
    END IF;
    PERFORM public.post_loan_default(OLD,loss_date,actor,amount,keep);
    IF NOT keep THEN NEW."Loan Status":='ปิดยอดแล้ว'; END IF;
    NEW."Default Loss Amount":=(SELECT nullif(coalesce(sum(c."Principal Due"::numeric),0),0)::money FROM public."Charges" c
      WHERE c."Ref Loans"=NEW."Row ID" AND starts_with(c."Row ID",'df10:'));
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
  -- Any other change of the column must equal the ledger (a reviewed fixture or repair seeds the pair first).
  IF NEW."Default Loss Amount" IS DISTINCT FROM OLD."Default Loss Amount" THEN
    ledger:=(SELECT nullif(coalesce(sum(c."Principal Due"::numeric),0),0)::money FROM public."Charges" c
      WHERE c."Ref Loans"=NEW."Row ID" AND starts_with(c."Row ID",'df10:'));
    IF NEW."Default Loss Amount" IS DISTINCT FROM ledger THEN
      RAISE EXCEPTION 'Default loss amount changes only through Default Loan or Undo Default';
    END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: default_posting_guard(); Type: FUNCTION
--

CREATE FUNCTION public.default_posting_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE derived text[]:=ARRAY['Principal Paid','Interest Paid','Total Paid','Principal Remaining','Interest Remaining','Amount Remaining','Payment Count','Payment Status','Payment Date','Late Charge Paid','Late Charge Remaining'];
 parent record; parent_ids text[];
BEGIN
 IF starts_with(OLD."Row ID",'df10:') THEN
  IF TG_OP='DELETE' AND pg_trigger_depth()>=2 AND OLD."Ref Loans"=nullif(current_setting('business_crud.default',true),'') THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND TG_TABLE_NAME='Charges' THEN
   IF (to_jsonb(NEW)-derived) IS NOT DISTINCT FROM (to_jsonb(OLD)-derived) THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'Default posting is immutable';
 END IF;
 IF TG_TABLE_NAME='Charges' THEN
  -- aa_vc_lock already takes the affected borrower locks NOWAIT (V12).
  -- Derived cache refreshes must not acquire a reverse-order parent lock.
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-derived) IS NOT DISTINCT FROM (to_jsonb(OLD)-derived) THEN RETURN NEW; END IF;
  -- Only existing Default/Undo component-and-note restoration may bypass the
  -- parent state check. Original-charge deletion is never part of that inverse.
  IF TG_OP='UPDATE' AND pg_trigger_depth()>=2
    AND OLD."Ref Loans"=nullif(current_setting('business_crud.default',true),'')
    AND NEW."Ref Loans" IS NOT DISTINCT FROM OLD."Ref Loans"
    AND (to_jsonb(NEW)-derived-ARRAY['Principal Due','Interest Due','Late Charge Due','Notes'])
      IS NOT DISTINCT FROM (to_jsonb(OLD)-derived-ARRAY['Principal Due','Interest Due','Late Charge Due','Notes']) THEN RETURN NEW; END IF;
  parent_ids:=ARRAY[OLD."Ref Loans",CASE WHEN TG_OP='UPDATE' THEN NEW."Ref Loans" END];
  BEGIN
   FOR parent IN SELECT "Row ID","Defaulted" FROM public."Loans"
     WHERE "Row ID"=ANY(parent_ids) ORDER BY "Row ID" COLLATE "C" FOR SHARE NOWAIT
   LOOP
    IF coalesce(parent."Defaulted",false) THEN
     RAISE EXCEPTION 'Undo Default before changing or deleting its original charges';
    END IF;
   END LOOP;
  EXCEPTION WHEN lock_not_available THEN
   RAISE EXCEPTION 'Loan is busy; sync and retry charge correction';
  END;
 ELSIF TG_TABLE_NAME='Repayments' THEN
  -- Resolve both explicit and charge-derived parents. Ref Loans may be supplied
  -- stale by a client when Ref Charges changes; neither route may escape a
  -- defaulted source or move a repayment into a defaulted target.
  parent_ids:=ARRAY[OLD."Ref Loans",CASE WHEN TG_OP='UPDATE' THEN NEW."Ref Loans" END];
  parent_ids:=parent_ids || ARRAY(SELECT c."Ref Loans" FROM public."Charges" c
    WHERE c."Row ID" IN (OLD."Ref Charges",CASE WHEN TG_OP='UPDATE' THEN NEW."Ref Charges" END));
  -- aa_vc_lock has already acquired borrower locks NOWAIT. The repayment row
  -- may already be locked, so never wait for a Default/Undo parent-row lock.
  BEGIN
   FOR parent IN SELECT "Row ID","Defaulted" FROM public."Loans"
     WHERE "Row ID"=ANY(parent_ids) ORDER BY "Row ID" COLLATE "C" FOR SHARE NOWAIT
   LOOP
    IF coalesce(parent."Defaulted",false) THEN
     RAISE EXCEPTION 'Undo Default before changing or deleting its repayments';
    END IF;
   END LOOP;
  EXCEPTION WHEN lock_not_available THEN
   RAISE EXCEPTION 'Loan is busy; sync and retry repayment correction';
  END;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;


--
-- Name: expense_allocation_lock(); Type: FUNCTION
--

CREATE FUNCTION public.expense_allocation_lock() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF NOT pg_try_advisory_xact_lock(9152026,15) THEN
   RAISE EXCEPTION 'Partner allocation is busy; sync and retry';
 END IF;
 RETURN NULL;
END $$;


--
-- Name: expense_contribution_changed(); Type: FUNCTION
--

CREATE FUNCTION public.expense_contribution_changed() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE first_date date;
BEGIN
 IF TG_TABLE_NAME='Partners' THEN
   IF TG_OP='UPDATE' AND NEW."Partner Role" IS NOT DISTINCT FROM OLD."Partner Role" THEN RETURN NULL; END IF;
   first_date:='0001-01-01';
 ELSE
   IF TG_OP='INSERT' THEN first_date:=NEW."Contribution Date";
   ELSIF TG_OP='DELETE' THEN first_date:=OLD."Contribution Date";
   ELSE first_date:=least(OLD."Contribution Date",NEW."Contribution Date"); END IF;
 END IF;
 PERFORM public.recalculate_business_expenses_from_date(first_date);
 RETURN NULL;
END $$;


--
-- Name: fifo_current_month_settled(numeric, numeric, numeric); Type: FUNCTION
--

CREATE FUNCTION public.fifo_current_month_settled(prior_net numeric, month_net numeric, completed numeric) RETURNS numeric
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    SET search_path TO 'pg_catalog'
    AS $$
 SELECT least(greatest(month_net,0), greatest(completed-greatest(prior_net,0),0))
$$;


--
-- Name: first_day_charge_trigger(); Type: FUNCTION
--

CREATE FUNCTION public.first_day_charge_trigger() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NOT starts_with(NEW."Row ID",'lc7:') AND NOT starts_with(NEW."Row ID",'df10:') AND NOT starts_with(NEW."Row ID",'rl138:') /* R136 */ THEN
    PERFORM public.first_day_receipt(NEW."Row ID");
  END IF;
  RETURN NULL;
END $$;


--
-- Name: first_day_components_v83(public."Loans"); Type: FUNCTION
--

CREATE FUNCTION public.first_day_components_v83(l public."Loans") RETURNS TABLE(principal numeric, interest numeric)
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE days integer;
BEGIN
 IF NOT coalesce(l."Auto Charge Enabled",false) OR NOT coalesce((
   (l."Loan Type"='ดอกเบี้ยรายวัน' AND l."Current Daily Interest"::numeric>0) OR
   (l."Loan Type"='ผ่อนชำระรายวัน' AND l."Daily Payment Amount"::numeric>0)),false) THEN RETURN;END IF;
 IF l."Loan Date" IS NULL THEN RAISE EXCEPTION 'First-day charge requires Loan Date';END IF;
 principal:=0;
 IF l."Loan Type"='ผ่อนชำระรายวัน' THEN
  days:=l."Due Date"-l."Loan Date"+1;
  IF days IS NULL OR days<=0 OR l."Principal Amount" IS NULL OR l."Principal Amount"::numeric<0 THEN
   RAISE EXCEPTION 'Invalid installment principal or inclusive loan term';
  END IF;
  principal:=floor(l."Principal Amount"::numeric/days)+CASE WHEN mod(l."Principal Amount"::numeric,days)>0 THEN 1 ELSE 0 END;
  interest:=l."Daily Payment Amount"::numeric-principal+coalesce(l."Transfer Fee"::numeric,0);
 ELSE interest:=l."Current Daily Interest"::numeric+coalesce(l."Transfer Fee"::numeric,0);
 END IF;
 IF interest IS NULL OR interest<0 THEN RAISE EXCEPTION 'Invalid first-day interest component';END IF;
 RETURN NEXT;
END $$;


--
-- Name: first_day_loan_trigger(); Type: FUNCTION
--

CREATE FUNCTION public.first_day_loan_trigger() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN PERFORM public.create_first_day_charge(NEW."Row ID"); RETURN NULL; END $$;


--
-- Name: first_day_receipt(text); Type: FUNCTION
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
-- Name: flush_business_history(); Type: FUNCTION
--

CREATE FUNCTION public.flush_business_history() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE d date; first_day date; last_day date; accounts text[];
BEGIN
 -- Nested statements contribute dates; only the outer source statement flushes.
 IF pg_trigger_depth()>1 THEN RETURN NULL; END IF;
 IF TG_LEVEL='STATEMENT' THEN
  PERFORM set_config('business_history.statement_active','off',true);
 ELSIF current_setting('business_history.statement_active',true)='on' THEN
  -- An immediate constraint callback still belongs to its unfinished statement.
  RETURN NULL;
 END IF;
 d:=nullif(current_setting('business_history.from',true),'')::date;
 IF d IS NULL THEN RETURN NULL; END IF;
 PERFORM set_config('business_history.from','',true);
 SELECT coalesce(array_agg(k),ARRAY[]::text[]) INTO accounts FROM jsonb_object_keys(coalesce(nullif(current_setting('business_history.accounts',true),'')::jsonb,'{}'::jsonb)) k;
 PERFORM set_config('business_history.accounts','',true);
 SELECT min(snapshot_day),max(snapshot_day) INTO first_day,last_day FROM (
  SELECT "Snapshot Date" snapshot_day FROM public."Daily Analytics" WHERE "Snapshot Date">=d
  UNION ALL SELECT "Snapshot Date" FROM public."Cash Account Daily Analytics" WHERE "Snapshot Date">=d) snapshots;
 IF first_day IS NOT NULL THEN PERFORM public.refresh_daily_analytics_scoped(first_day,last_day,accounts); END IF;
 RETURN NULL;
END $$;


--
-- Name: forecast_scenario_v1(numeric, numeric, numeric, numeric, numeric, numeric, numeric, text); Type: FUNCTION
--

CREATE FUNCTION public.forecast_scenario_v1(ui numeric, up numeric, oi numeric, op numeric, ci numeric, cp numeric, rr numeric, scenario text) RETURNS TABLE(remaining_interest numeric, remaining_principal numeric)
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
 IF ci IS NULL OR cp IS NULL OR rr IS NULL OR ci<0 OR ci>100 OR cp<0 OR cp>100 OR rr<0 OR rr>100
 OR ci::text='NaN' OR cp::text='NaN' OR rr::text='NaN' OR scenario NOT IN ('Planning','Schedule','Stress') OR scenario IS NULL
 THEN RAISE EXCEPTION 'Scenario inputs require percentages 0 to 100 and a valid scenario';END IF;
 RETURN QUERY SELECT CASE scenario WHEN 'Schedule' THEN ui WHEN 'Stress' THEN greatest(ci-20,0)*ui/100 ELSE (ci*ui+rr*oi)/100 END,
 CASE scenario WHEN 'Schedule' THEN up WHEN 'Stress' THEN greatest(cp-20,0)*up/100 ELSE (cp*up+rr*op)/100 END;
END $$;


--
-- Name: forecast_schedule_v1(jsonb, jsonb, date, date); Type: FUNCTION
--

CREATE FUNCTION public.forecast_schedule_v1(l jsonb, charges jsonb, t date, e date) RETURNS TABLE(due_date date, origin text, bucket text, principal numeric, interest numeric, eligible boolean, issue text)
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE c jsonb; d date; latest date; anchor date; n integer; elapsed integer; term integer;
 p numeric; i numeric; balance numeric; daily_rate numeric; basis numeric[]; active boolean;
 blocked boolean:=false; scheduled_principal numeric:=0; found_today boolean:=false; today_principal numeric:=0; simulated_principal numeric:=0;
BEGIN
 IF t IS NULL OR e<t OR e>t+93 THEN RAISE EXCEPTION 'Forecast window invalid'; END IF;
 -- R109 (V120): a default loss posting (df10:) is not an obligation; a loan with kept charges forecasts as an open loan.
 charges:=(SELECT coalesce(jsonb_agg(value),'[]'::jsonb) FROM jsonb_array_elements(coalesce(charges,'[]'::jsonb)) WHERE NOT starts_with(coalesce(value->>'id',''),'df10:'));
 active:=coalesce(l->>'status'='ยังไม่ปิดยอด' AND NOT (l->>'defaulted')::boolean AND (l->>'start')::date<=t
  AND ((l->>'close') IS NULL OR (l->>'close')::date>t),false);
 balance:=(l->>'balance')::numeric;daily_rate:=(l->>'daily')::numeric;
 FOR c IN SELECT value FROM jsonb_array_elements(coalesce(charges,'[]'::jsonb)) ORDER BY (value->>'date')::date,value->>'id' LOOP
  d:=(c->>'date')::date;
  IF d=t THEN found_today:=true; END IF;
  IF coalesce((c->>'invalid')::boolean,false) OR d IS NULL THEN
   due_date:=d;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Invalid charge or allocation';RETURN NEXT;blocked:=true;CONTINUE;
  END IF;
  -- Negative default-accounting obligations are not expected cash receipts.
  IF (c->>'pdue')::numeric<0 OR (c->>'idue')::numeric<0 THEN
   IF NOT coalesce((l->>'defaulted')::boolean,false) THEN
    due_date:=d;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Negative obligation';RETURN NEXT;blocked:=true;
   END IF;CONTINUE;
  END IF;
  IF d>e THEN CONTINUE; END IF;
  p:=greatest((c->>'pdue')::numeric-coalesce((c->>'ppaid')::numeric,0),0);
  i:=greatest((c->>'idue')::numeric-coalesce((c->>'ipaid')::numeric,0),0);
  IF p+i>0 THEN
   due_date:=d;origin:='Recorded';bucket:=CASE WHEN NOT active THEN 'Recovery only' WHEN d<t THEN 'Overdue' WHEN d=t THEN 'Today' ELSE 'Future' END;
   principal:=p;interest:=i;eligible:=active;issue:=NULL;RETURN NEXT;
  END IF;
  scheduled_principal:=scheduled_principal+p;
  IF d=t THEN today_principal:=today_principal+p; END IF;
 END LOOP;
 IF l->>'status' NOT IN ('ยังไม่ปิดยอด','ปิดยอดแล้ว') OR l->>'status' IS NULL OR coalesce((l->>'invalid')::boolean,true) THEN
  due_date:=t;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Invalid loan, borrower or repayment';RETURN NEXT;RETURN;
 END IF;
 IF NOT active THEN RETURN; END IF;
 IF balance IS NULL OR balance<0 OR scheduled_principal>balance+0.005 THEN
  due_date:=t;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Principal obligations do not reconcile';RETURN NEXT;RETURN;
 END IF;
 IF NOT coalesce((l->>'auto')::boolean,false) THEN
  due_date:=t;origin:='Notice';bucket:='Recorded plan only';principal:=0;interest:=0;eligible:=false;issue:='Manual schedule: only recorded obligations forecast';RETURN NEXT;RETURN;
 END IF;
 IF blocked THEN RETURN; END IF;
 n:=(l->>'interval')::integer;anchor:=coalesce((l->>'anchor')::date,(l->>'start')::date);
 IF l->>'type' NOT IN ('ดอกเบี้ยรายวัน','กำหนดวันชำระ','ผ่อนชำระรายวัน')
 OR (l->>'type'<>'กำหนดวันชำระ' AND (n IS NULL OR n<1))
 OR (l->>'type'='ดอกเบี้ยรายวัน' AND (daily_rate IS NULL OR daily_rate<0 OR anchor<(l->>'start')::date))
 OR (l->>'type'<>'ดอกเบี้ยรายวัน' AND ((l->>'due') IS NULL OR (l->>'due')::date<(l->>'start')::date)) THEN
  due_date:=t;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Unsupported automatic schedule';RETURN NEXT;RETURN;
 END IF;
 SELECT max((value->>'date')::date) INTO latest FROM jsonb_array_elements(coalesce(charges,'[]'::jsonb))
 WHERE l->>'type'='ผ่อนชำระรายวัน' OR (value->>'date')::date<=t;
 IF l->>'type'='ผ่อนชำระรายวัน' AND latest IS NULL THEN
  due_date:=t;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Installment missing initial charge';RETURN NEXT;RETURN;
 END IF;
 IF NOT found_today AND ((l->>'type'='ดอกเบี้ยรายวัน' AND daily_rate>0 AND t>anchor AND mod(t-anchor,n)=0)
  OR (l->>'type'='กำหนดวันชำระ' AND (l->>'due')::date=t)
  OR (l->>'type'='ผ่อนชำระรายวัน' AND t>(l->>'start')::date AND t<=(l->>'due')::date AND (mod(t-(l->>'start')::date,n)=0 OR t=(l->>'due')::date))) THEN
  due_date:=t;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Expected today charge missing';RETURN NEXT;
 END IF;
 IF l->>'type'='ดอกเบี้ยรายวัน' THEN
  IF l ? 'original_rate' THEN
   IF l->>'original_rate' IS NOT NULL THEN basis:=ARRAY[(l->>'original_rate')::numeric,100::numeric]; END IF;
  ELSE
   BEGIN basis:=public.daily_interest_basis(l->>'arrangement'); EXCEPTION WHEN OTHERS THEN basis:=NULL; END;
  END IF;
 END IF;
 balance:=balance-today_principal;
 IF l->>'type'='ดอกเบี้ยรายวัน' AND today_principal>0 THEN
  IF basis IS NULL THEN due_date:=t;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Daily interest basis unavailable after scheduled principal';RETURN NEXT;RETURN;END IF;
  daily_rate:=round(basis[1]*greatest(0,balance)/basis[2],0);
 END IF;
 term:=(l->>'due')::date-(l->>'start')::date+1;
 FOR d IN SELECT generate_series(t+1,e,interval '1 day')::date LOOP
  p:=0;i:=0;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(charges,'[]'::jsonb)) WHERE (value->>'date')::date=d) THEN
   SELECT coalesce(sum(greatest((value->>'pdue')::numeric-coalesce((value->>'ppaid')::numeric,0),0)),0) INTO p
    FROM jsonb_array_elements(charges) WHERE (value->>'date')::date=d;
   IF l->>'type'='ดอกเบี้ยรายวัน' THEN latest:=d; END IF;
   balance:=balance-p;
   IF l->>'type'='ดอกเบี้ยรายวัน' AND p>0 THEN
    IF basis IS NULL THEN due_date:=d;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Daily interest basis unavailable after scheduled principal';RETURN NEXT;RETURN;END IF;
    daily_rate:=round(basis[1]*greatest(0,balance)/basis[2],0);
   END IF;
   CONTINUE;
  END IF;
  IF l->>'type'='ดอกเบี้ยรายวัน' THEN
   IF d<=anchor OR mod(d-anchor,n)<>0 OR daily_rate=0 THEN CONTINUE; END IF;
   i:=daily_rate*greatest(0,d-coalesce(latest,(l->>'start')::date));
  ELSIF l->>'type'='กำหนดวันชำระ' THEN
   IF d<>(l->>'due')::date THEN CONTINUE; END IF;
   p:=balance;i:=(l->>'fixed')::numeric;
  ELSE
   IF d<=(l->>'start')::date OR d>(l->>'due')::date OR (mod(d-(l->>'start')::date,n)<>0 AND d<>(l->>'due')::date) THEN CONTINUE; END IF;
   elapsed:=d-latest;IF elapsed<=0 THEN CONTINUE;END IF;
   p:=floor((l->>'original')::numeric/term)*elapsed+greatest(0,least(d-(l->>'start')::date+1,mod((l->>'original')::numeric,term))-(latest-(l->>'start')::date+1));
   i:=(l->>'payment')::numeric*elapsed-p;
  END IF;
  IF p IS NULL OR i IS NULL OR p<0 OR i<0 OR p>balance+0.005 OR scheduled_principal+simulated_principal+p>(l->>'balance')::numeric+0.005 THEN
   due_date:=d;origin:='Exception';bucket:='Source review';principal:=0;interest:=0;eligible:=false;issue:='Simulated components do not reconcile';RETURN NEXT;RETURN;
  END IF;
  due_date:=d;origin:='Simulated';bucket:='Future';principal:=p;interest:=i;eligible:=true;issue:=NULL;RETURN NEXT;
  latest:=d;balance:=balance-p;simulated_principal:=simulated_principal+p;
 END LOOP;
END $$;


--
-- Name: generate_due_charges(date, text[]); Type: FUNCTION
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
    IF EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"=l."Row ID" AND "Charge Date"=p_business_date AND NOT starts_with("Row ID",'df10:')) THEN CONTINUE; END IF;
    result:=public.generate_loan_charge(l."Row ID",p_business_date);
    IF result IS NOT NULL THEN generated:=generated+1; END IF;
  END LOOP;
  RETURN generated;
END $$;


--
-- Name: generate_loan_charge(text, date, boolean); Type: FUNCTION
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
  -- R109 (V120): a default loss posting (df10:) is not a charge of the schedule.
  SELECT min("Row ID") INTO existing FROM public."Charges"
    WHERE "Ref Loans"=p_loan AND "Charge Date"=p_business_date AND NOT starts_with("Row ID",'df10:');
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
      WHERE "Ref Loans"=p_loan AND "Charge Date"<=p_business_date AND NOT starts_with("Row ID",'df10:');
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
-- Name: guard_cash_account(); Type: FUNCTION
--

CREATE FUNCTION public.guard_cash_account() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF NOT pg_try_advisory_xact_lock(public.pwa_lock_key_v1('cash-account',OLD."Ref Cash Holder")) THEN RAISE EXCEPTION 'Cash accounts are busy; sync and retry'; END IF;
  IF OLD."Default Account" AND EXISTS(SELECT 1 FROM public."Cash Accounts" WHERE "Ref Cash Holder"=OLD."Ref Cash Holder" AND "Active" AND "Row ID"<>OLD."Row ID") THEN
   RAISE EXCEPTION 'Choose a replacement default account before deletion'; END IF;
  RETURN OLD; -- References and opening balances still protect used accounts.
 END IF;
 IF TG_OP='UPDATE' AND (NEW."Row ID",NEW."Ref Cash Holder",NEW."Created At") IS DISTINCT FROM
 (OLD."Row ID",OLD."Ref Cash Holder",OLD."Created At") THEN
  RAISE EXCEPTION 'Cash account identity, holder and creation time are immutable';
 END IF;
 -- Try-lock serializes default changes without waiting behind a transfer holding an account.
 IF NOT pg_try_advisory_xact_lock(public.pwa_lock_key_v1('cash-account',NEW."Ref Cash Holder")) THEN
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


--
-- Name: guard_cash_ledger(); Type: FUNCTION
--

CREATE FUNCTION public.guard_cash_ledger() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
 NEW."Ref Rebate Settlement":=nullif(btrim(NEW."Ref Rebate Settlement"),''); -- R129
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
  -- R129: only the settlement's own projection links a rebate settlement.
  IF NEW."Ref Rebate Settlement" IS NOT NULL THEN RAISE EXCEPTION 'Only a rebate settlement may link a rebate settlement'; END IF;
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
   IF NEW."Entry Origin"='Manual' AND current_setting('r115.cash_movement_time',true)='on' THEN
    -- R115 (V127): Daily cash withdrawal records the chosen transaction time; only its command sets this
    -- transaction-local setting, around its own inserts. The time must not be in the future.
    IF NEW."Created At" IS NULL OR NEW."Created At">CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok' THEN
     RAISE EXCEPTION 'Cash movement time must not be in the future';
    END IF;
   ELSE
    NEW."Created At":=CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok';
   END IF;
  END IF;
 END IF;
 NEW."Updated At":=clock_timestamp() AT TIME ZONE 'Asia/Bangkok';
 RETURN NEW;
END $$;


--
-- Name: guard_cash_source_identity(); Type: FUNCTION
--

CREATE FUNCTION public.guard_cash_source_identity() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF NEW."Row ID" IS DISTINCT FROM OLD."Row ID" THEN RAISE EXCEPTION 'Cash source Row ID is immutable'; END IF;
 RETURN NEW;
END $$;


--
-- Name: guard_cash_statement_context(); Type: FUNCTION
--

CREATE FUNCTION public.guard_cash_statement_context() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW."Ref Partner" IS DISTINCT FROM OLD."Ref Partner" THEN
  RAISE EXCEPTION 'Statement context owner is immutable';
 END IF;
 NEW."Updated At":=clock_timestamp() AT TIME ZONE 'Asia/Bangkok';
 RETURN NEW;
END $$;


--
-- Name: guard_charge_consistency(); Type: FUNCTION
--

CREATE FUNCTION public.guard_charge_consistency() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE paid_p numeric; paid_i numeric; paid_l numeric;
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Charges"=OLD."Row ID") THEN
   RAISE EXCEPTION 'Charge has receipts; reassign or delete those receipts first'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW."Row ID" IS DISTINCT FROM OLD."Row ID" THEN RAISE EXCEPTION 'Charge key cannot change'; END IF;
  IF (NEW."Ref Loans",NEW."Principal Due",NEW."Interest Due",NEW."Late Charge Due") IS NOT DISTINCT FROM (OLD."Ref Loans",OLD."Principal Due",OLD."Interest Due",OLD."Late Charge Due") THEN RETURN NEW; END IF;
  IF NEW."Ref Loans" IS DISTINCT FROM OLD."Ref Loans" AND EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Charges"=OLD."Row ID") THEN
   RAISE EXCEPTION 'Charge has receipts on its original loan; reassign them first'; END IF;
 END IF;
 -- R118: a late charge is a whole-baht amount of 0 or more (NOT NULL by the column).
 IF NEW."Late Charge Due"::numeric<0 OR NEW."Late Charge Due"::numeric<>trunc(NEW."Late Charge Due"::numeric) THEN
  RAISE EXCEPTION 'Late charge must be a whole-baht amount of 0 or more'; END IF;
 -- Signed loss entries belong to the Default transition, not ordinary charges.
 IF starts_with(NEW."Row ID",'df10:') THEN RETURN NEW; END IF;
 SELECT coalesce(sum("Principal Paid"::numeric),0),coalesce(sum("Interest Paid"::numeric),0),coalesce(sum("Late Charge Paid"::numeric),0) INTO paid_p,paid_i,paid_l
  FROM public."Repayments" WHERE "Ref Charges"=NEW."Row ID";
 IF EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Charges"=NEW."Row ID") AND (NEW."Principal Due"::numeric<paid_p OR NEW."Interest Due"::numeric<paid_i OR NEW."Late Charge Due"::numeric<paid_l) THEN
  RAISE EXCEPTION 'Charge amount cannot be less than its posted component payments'; END IF;
 RETURN NEW;
END $$;


--
-- Name: guard_ledger_cash_accounts(); Type: FUNCTION
--

CREATE FUNCTION public.guard_ledger_cash_accounts() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: guard_linked_expense_reimbursement(); Type: FUNCTION
--

CREATE FUNCTION public.guard_linked_expense_reimbursement() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE expense_amount numeric; expense_holder text;
BEGIN
 IF TG_TABLE_NAME='Cash Ledger' THEN
  IF NEW."Entry Origin"='Manual' AND NEW."Movement Type"='Expense Reimbursement'
   AND nullif(btrim(NEW."Ref Business Expense"),'') IS NOT NULL THEN
   -- A lock alone leaves a stale REPEATABLE READ source writer able to miss
   -- this reimbursement. Version the parent without changing its values.
   -- Row ID is excluded from the source cash trigger's UPDATE column list.
   UPDATE public."Business Expenses" e SET "Row ID"=e."Row ID"
    WHERE e."Row ID"=NEW."Ref Business Expense"
    RETURNING e."Amount"::numeric,e."Ref Paid By Cash Holder"
    INTO expense_amount,expense_holder;
   IF NOT FOUND OR (expense_amount>0 AND expense_holder='ch:tommy') IS NOT TRUE THEN
    RAISE EXCEPTION 'Linked reimbursement expense must have been paid by Tommy';
   END IF;
  END IF;
 ELSE
  -- UPDATE already locks this expense. a0_cash_account has derived its holder.
  IF (NEW."Amount",NEW."Ref Paid By Cash Holder") IS DISTINCT FROM
     (OLD."Amount",OLD."Ref Paid By Cash Holder")
   AND (NEW."Amount"::numeric>0 AND NEW."Ref Paid By Cash Holder"='ch:tommy') IS NOT TRUE
   AND EXISTS(SELECT 1 FROM public."Cash Ledger" l
    WHERE l."Ref Business Expense"=OLD."Row ID" AND l."Entry Origin"='Manual'
     AND l."Movement Type"='Expense Reimbursement') THEN
   RAISE EXCEPTION 'Correct linked reimbursement before changing expense away from a positive Tommy-paid expense';
  END IF;
 END IF;
 RETURN NEW;
END $$;


--
-- Name: guard_loan_consistency(); Type: FUNCTION
--

CREATE FUNCTION public.guard_loan_consistency() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: guard_opening_included_source(); Type: FUNCTION
--

CREATE FUNCTION public.guard_opening_included_source() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
   -- R140 V142: a pending Manual expense (no payer, not a cutover source) stays pending when it is edited.
   AND (NEW."Ref Paid By Cash Holder" IS NOT NULL OR (NEW."Amount"::numeric>0 AND (NEW."Source Type" IS DISTINCT FROM 'Manual'
    OR EXISTS(SELECT 1 FROM public.r005_cash_cutover_sources WHERE source_type='Business Expense' AND source_row_id=NEW."Row ID")))) THEN
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


--
-- Name: guard_payment_receipt_evidence(); Type: FUNCTION
--

CREATE FUNCTION public.guard_payment_receipt_evidence() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE changed boolean; owner_name name;
BEGIN
 IF TG_OP='INSERT' THEN
  changed:=NEW."IG Receipt ID" IS NOT NULL OR NEW."Receipt Image" IS NOT NULL OR NEW."Receipt Received At" IS NOT NULL;
 ELSE
  changed:=(NEW."IG Receipt ID",NEW."Receipt Image",NEW."Receipt Received At")
   IS DISTINCT FROM (OLD."IG Receipt ID",OLD."Receipt Image",OLD."Receipt Received At");
 END IF;
 SELECT r.rolname INTO owner_name FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
  WHERE p.oid='public.attach_payment_receipt_evidence(text,text,text,timestamptz,jsonb,uuid,text)'::regprocedure;
 IF changed AND (TG_OP='INSERT' OR current_user IS DISTINCT FROM owner_name) THEN
  RAISE EXCEPTION 'Receipt evidence is service-owned';
 END IF;
 RETURN NEW;
END $$;


--
-- Name: guard_pwa_explicit_payment_v6(); Type: FUNCTION
--

CREATE FUNCTION public.guard_pwa_explicit_payment_v6() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE provenance jsonb;c jsonb;ids text[];
BEGIN
 provenance:=public.pwa_effective_payment_plan_v2(NEW."Row ID");IF provenance IS NULL THEN RETURN NEW;END IF;
 c:=provenance->'plan';SELECT array_agg(value->>'chargeId' ORDER BY (value->>'chargeId') COLLATE "C") INTO ids FROM jsonb_array_elements(c->'allocations');
 IF TG_OP='INSERT' AND (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Explicit command receipt must originate in governed submit';END IF;
 IF NEW."Ref Borrower" IS DISTINCT FROM c->>'borrowerId' OR NEW."Amount Received"::numeric IS DISTINCT FROM (c->>'amountReceived')::numeric OR NEW."Allocation Method" IS DISTINCT FROM c->>'allocationMethod'
  OR NEW."Ref Target Charge" IS DISTINCT FROM c->>'targetChargeId' OR NEW."Ref Target Loan" IS DISTINCT FROM c->>'targetLoanId'
  OR NEW."Created By" IS DISTINCT FROM provenance->>'sourceCreatedBy'
  OR (c->>'allocationMethod'='Selected Charges' AND public.selected_charge_ids(NEW."Selected Charge IDs") IS DISTINCT FROM ids)
  OR (c->>'allocationMethod'<>'Selected Charges' AND NEW."Selected Charge IDs" IS NOT NULL) THEN RAISE EXCEPTION 'Immutable explicit allocation scope';END IF;
 IF TG_OP='INSERT' AND (NEW."Status" IS DISTINCT FROM 'Processing' OR NEW."Payment Date" IS DISTINCT FROM (c->>'paymentDate')::date OR NEW."Payment Method" IS DISTINCT FROM c->>'paymentMethod' OR (NEW."Ref Received By Cash Account" IS DISTINCT FROM c->>'cashAccountId' AND NOT(c->>'allocationMethod'='First-day Auto' AND NEW."Ref Received By Cash Account" IS NULL))) THEN RAISE EXCEPTION 'Explicit command input mismatch';END IF;
 RETURN NEW;
END $$;


--
-- Name: guard_pwa_payment_commands_immutable(); Type: FUNCTION
--

CREATE FUNCTION public.guard_pwa_payment_commands_immutable() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Payment command outcomes are immutable';
END $$;


--
-- Name: guard_selected_charge_scope(); Type: FUNCTION
--

CREATE FUNCTION public.guard_selected_charge_scope() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: guard_settlement_reversal(); Type: FUNCTION
--

CREATE FUNCTION public.guard_settlement_reversal() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW."Status" NOT IN ('Pending','Completed','Cancelled') OR NEW."Status" IS NULL THEN
  RAISE EXCEPTION 'Settlement status must be Pending, Completed or Cancelled'; END IF;
 RETURN NEW;
END $$;


--
-- Name: guard_source_cash_account(); Type: FUNCTION
--

CREATE FUNCTION public.guard_source_cash_account() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
  -- R140 V142: a Manual expense without holder and account is pending payment.
  required_account:=(TG_OP='INSERT' OR account_id IS DISTINCT FROM old_account) AND ((NEW."Amount"::numeric>0 AND NEW."Source Type" IS DISTINCT FROM 'Manual') OR selected_holder IS NOT NULL);
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


--
-- Name: guard_source_cash_holder(); Type: FUNCTION
--

CREATE FUNCTION public.guard_source_cash_holder() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
   -- R140 V142: a Manual expense without a payer is pending payment.
   IF NEW."Source Type" IS DISTINCT FROM 'Manual' AND NEW."Amount"::numeric>0 AND NEW."Ref Paid By Cash Holder" IS NULL THEN RAISE EXCEPTION 'New positive expenses require an explicit cash payer'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;


--
-- Name: initialize_cash_accounts(text, jsonb, text, text); Type: FUNCTION
--

CREATE FUNCTION public.initialize_cash_accounts(p_holder text, p_openings jsonb, p_actor text, p_notes text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: is_principal_writeoff(text, text, numeric, numeric, text, numeric, numeric, bigint); Type: FUNCTION
--

CREATE FUNCTION public.is_principal_writeoff(p_row_id text, p_ref_payment text, p_principal numeric, p_interest numeric, p_charge_id text, p_charge_principal numeric, p_charge_interest numeric, p_charge_repayments bigint) RETURNS boolean
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$
 SELECT coalesce(starts_with(p_row_id,'df10:') OR (p_ref_payment IS NULL AND p_principal>0 AND p_interest=-p_principal
  AND NOT starts_with(p_charge_id,'lc7:') AND NOT starts_with(p_charge_id,'ls2:')
  AND p_charge_principal=p_principal AND p_charge_interest=-p_principal AND p_charge_repayments=1),false)
$$;


--
-- Name: FUNCTION is_principal_writeoff(p_row_id text, p_ref_payment text, p_principal numeric, p_interest numeric, p_charge_id text, p_charge_principal numeric, p_charge_interest numeric, p_charge_repayments bigint); Type: COMMENT
--

COMMENT ON FUNCTION public.is_principal_writeoff(p_row_id text, p_ref_payment text, p_principal numeric, p_interest numeric, p_charge_id text, p_charge_principal numeric, p_charge_interest numeric, p_charge_repayments bigint) IS 'R116 (V130): true for a principal write-off repayment: a df10: posting, or a zero-cash loss pair (no Ref Payment, principal X > 0, interest -X, a non-lc7:/ls2: charge of X/-X with exactly one repayment). Pure; the caller supplies the charge.';


--
-- Name: loan_cashpool_lock(); Type: FUNCTION
--

CREATE FUNCTION public.loan_cashpool_lock() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF NOT pg_try_advisory_xact_lock(9162026,2) THEN
  RAISE EXCEPTION 'Cashpool is busy; sync and retry' USING ERRCODE='55P03';
 END IF;
 RETURN NULL;
END $$;


--
-- Name: loan_close_calculation_v83(text, date); Type: FUNCTION
--

CREATE FUNCTION public.loan_close_calculation_v83(p_loan text, p_day date) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $_$ SELECT public.loan_close_calculation_v83($1,$2,NULL); $_$;


--
-- Name: loan_close_calculation_v83(text, date, text); Type: FUNCTION
--

CREATE FUNCTION public.loan_close_calculation_v83(p_loan text, p_day date, p_exclude_payment text) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE l public."Loans"%ROWTYPE; outstanding numeric;scheduled numeric;missing numeric;interest numeric:=0;
 target text;today_count integer;latest date;mutation jsonb:='null'::jsonb;lines jsonb;total numeric;context jsonb;
 trail_pattern text:='(^|\n)Interest Due lowered from [0-9.]+ by Loan Close ([1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01]))($|\n)';
 opening date;trail_day date;has_future boolean;future jsonb;future_due jsonb;
BEGIN
 SELECT * INTO l FROM public."Loans" WHERE "Row ID"=p_loan;
 IF NOT FOUND THEN RAISE EXCEPTION 'Target loan must belong to the payment borrower';END IF;
 IF p_exclude_payment IS NOT NULL AND l."Ref Closing Payment"=p_exclude_payment AND l."Defaulted" IS NOT TRUE THEN l."Loan Status":='ยังไม่ปิดยอด';END IF;
 IF l."Loan Status" IS DISTINCT FROM 'ยังไม่ปิดยอด' OR l."Loan Type" IS DISTINCT FROM 'ดอกเบี้ยรายวัน' OR NOT coalesce(l."Auto Charge Enabled",false) THEN RAISE EXCEPTION 'Loan Close requires an open auto-enabled daily-interest loan';END IF;
 IF l."Loan Date" IS NULL OR l."Loan Date">p_day OR l."Current Daily Interest" IS NULL OR l."Current Daily Interest"::numeric<0 OR l."Principal Amount" IS NULL THEN RAISE EXCEPTION 'Loan Close requires valid loan date, principal and daily interest';END IF;
 IF EXISTS(SELECT 1 FROM public."Charges" c LEFT JOIN LATERAL(SELECT coalesce(sum(r."Principal Paid"::numeric),0) p,coalesce(sum(r."Interest Paid"::numeric),0) i,coalesce(sum(r."Late Charge Paid"::numeric),0) lt FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID" AND (p_exclude_payment IS NULL OR r."Ref Payment" IS DISTINCT FROM p_exclude_payment)) paid ON true WHERE c."Ref Loans"=p_loan AND(c."Principal Due" IS NULL OR c."Interest Due" IS NULL OR c."Principal Due"::numeric<paid.p OR c."Interest Due"::numeric<paid.i OR c."Late Charge Due"::numeric<paid.lt /* R118 */)) THEN RAISE EXCEPTION 'Loan charge components require reconciliation before closing';END IF;
 SELECT l."Principal Amount"::numeric-coalesce(sum("Principal Paid"::numeric),0) INTO outstanding FROM public."Repayments" WHERE "Ref Loans"=p_loan AND (p_exclude_payment IS NULL OR "Ref Payment" IS DISTINCT FROM p_exclude_payment);
 IF outstanding IS NULL OR outstanding<=0 THEN RAISE EXCEPTION 'Loan has no outstanding principal to close';END IF;
 SELECT coalesce(sum(c."Principal Due"::numeric-(SELECT coalesce(sum(r."Principal Paid"::numeric),0) FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID" AND (p_exclude_payment IS NULL OR r."Ref Payment" IS DISTINCT FROM p_exclude_payment))),0) INTO scheduled FROM public."Charges" c WHERE c."Ref Loans"=p_loan;
 missing:=outstanding-scheduled;
 IF missing<0 THEN RAISE EXCEPTION 'Principal already due exceeds outstanding loan principal';END IF;
 -- V113: charges dated after the day. A charge an earlier close lowered (its trail line, written by the apply) keeps its
 -- due, and the days up to that close's date T are billed; the first other one (F1) carries the days from the later of
 -- latest and T up to the day, capped by its stored due; later ones keep their paid interest.
 -- R109 (V120): a default loss posting (df10:) is never today's, the latest or the target charge.
 SELECT max("Charge Date") INTO opening FROM public."Charges" WHERE "Ref Loans"=p_loan AND "Charge Date"<=p_day AND NOT starts_with("Row ID",'df10:');
 -- A trail line counts only with a real calendar date (a hand-edited 2026-02-31 or 2026-99-99 does not), so no cast can fail.
 WITH s AS(SELECT c."Row ID" id,c."Charge Date" charge_day,c."Interest Due"::numeric due,d.trail,d.trail IS NOT NULL settled FROM public."Charges" c
   LEFT JOIN LATERAL(SELECT (regexp_match(c."Notes",trail_pattern))[2] t) m ON true
   LEFT JOIN LATERAL(SELECT CASE WHEN m.t IS NOT NULL THEN CASE WHEN substr(m.t,9,2)::integer<=extract(day FROM make_date(substr(m.t,1,4)::integer,substr(m.t,6,2)::integer,1)+interval '1 month'-interval '1 day') THEN m.t::date END END trail) d ON true
   WHERE c."Ref Loans"=p_loan AND c."Charge Date">p_day),
  f AS(SELECT s.*,paid.i,row_number() OVER(PARTITION BY s.settled ORDER BY s.charge_day,s.id COLLATE "C") n,max(s.trail) OVER() trail_all FROM s
   LEFT JOIN LATERAL(SELECT coalesce(sum(r."Interest Paid"::numeric),0) i FROM public."Repayments" r WHERE r."Ref Charges"=s.id AND (p_exclude_payment IS NULL OR r."Ref Payment" IS DISTINCT FROM p_exclude_payment)) paid ON true),
  v AS(SELECT id,due,settled,CASE WHEN settled THEN due WHEN n>1 THEN i ELSE least(due,greatest(i,l."Current Daily Interest"::numeric*greatest(0,p_day-coalesce(greatest(opening,trail_all),l."Loan Date")))) END due_new,trail FROM f)
 SELECT coalesce(bool_or(NOT settled),false),jsonb_agg(jsonb_build_object('chargeId',id,'interestDue',trim_scale(due_new)::text) ORDER BY id COLLATE "C") FILTER(WHERE due_new<>due),jsonb_object_agg(id,due_new),max(trail)
  INTO has_future,future,future_due,trail_day FROM v;
 SELECT count(*),min("Row ID") INTO today_count,target FROM public."Charges" WHERE "Ref Loans"=p_loan AND "Charge Date"=p_day AND NOT starts_with("Row ID",'df10:');
 IF today_count>1 THEN RAISE EXCEPTION 'Multiple charges today require reconciliation before closing';END IF;
 IF today_count=0 THEN
  SELECT max("Charge Date") INTO latest FROM public."Charges" WHERE "Ref Loans"=p_loan AND "Charge Date"<=p_day AND NOT starts_with("Row ID",'df10:');
  IF NOT has_future THEN interest:=l."Current Daily Interest"::numeric*greatest(0,p_day-coalesce(greatest(latest,trail_day),l."Loan Date"));END IF;
  IF missing+interest>0 THEN
   target:='lc7:'||length(p_loan)||':'||p_loan||':'||p_day::text;
   mutation:=jsonb_build_object('kind','insert','chargeId',target,'principal',missing::text,'interest',interest::text);
  END IF;
 ELSIF missing>0 THEN mutation:=jsonb_build_object('kind','increase','chargeId',target,'principal',missing::text,'interest','0');END IF;
 IF future IS NOT NULL THEN mutation:=CASE WHEN mutation='null'::jsonb THEN jsonb_build_object('kind','adjust') ELSE mutation END||jsonb_build_object('futureInterest',future);END IF;
 IF target IS NULL THEN SELECT "Row ID" INTO target FROM public."Charges" WHERE "Ref Loans"=p_loan AND NOT starts_with("Row ID",'df10:') ORDER BY "Charge Date" DESC,"Row ID" COLLATE "C" DESC LIMIT 1;END IF;
 WITH paid AS(SELECT r."Ref Charges" id,sum(r."Principal Paid"::numeric) p,sum(r."Interest Paid"::numeric) i,sum(r."Late Charge Paid"::numeric) lt FROM public."Repayments" r WHERE r."Ref Loans"=p_loan AND (p_exclude_payment IS NULL OR r."Ref Payment" IS DISTINCT FROM p_exclude_payment) GROUP BY r."Ref Charges"),
 projected AS(SELECT c."Row ID" id,c."Charge Date" AS charge_day,c."Principal Due"::numeric-coalesce(paid.p,0)+CASE WHEN mutation->>'kind'='increase' AND c."Row ID"=target THEN missing ELSE 0 END p,CASE WHEN c."Charge Date">p_day THEN (future_due->>c."Row ID")::numeric ELSE c."Interest Due"::numeric END-coalesce(paid.i,0) i,c."Late Charge Due"::numeric-coalesce(paid.lt,0) lt FROM public."Charges" c LEFT JOIN paid ON paid.id=c."Row ID" WHERE c."Ref Loans"=p_loan
 UNION ALL SELECT target,p_day,missing,interest,0::numeric WHERE mutation->>'kind'='insert')
 SELECT coalesce(jsonb_agg(jsonb_build_object('chargeId',id,'principal',trim_scale(p)::text,'interest',trim_scale(i)::text,'lateCharge',trim_scale(lt)::text,'expectedPrincipalRemaining',trim_scale(p)::text,'expectedInterestRemaining',trim_scale(i)::text,'expectedLateChargeRemaining',trim_scale(lt)::text,'chargeDate',charge_day::text) ORDER BY id COLLATE "C") FILTER(WHERE p+i+lt>0),'[]'::jsonb),sum(p+i+lt) INTO lines,total FROM projected;
 IF total IS NULL OR total<=0 OR total<>trunc(total) THEN RAISE EXCEPTION 'Final receipt must be a positive whole-baht amount';END IF;
 context:=jsonb_build_object('sourceVersion',public.pwa_loan_version_v2(p_loan),'excludedPayment',p_exclude_payment,'businessDate',p_day::text,'borrowerId',l."Ref Borrowers",'amount',trim_scale(total)::text,'allocations',lines,'targetChargeId',target,'targetLoanId',p_loan,'mutation',mutation);
 IF p_exclude_payment IS NULL THEN context:=context-'excludedPayment';END IF;
 RETURN context||jsonb_build_object('planHash',encode(sha256(convert_to(context::text,'UTF8')),'hex'));
END $_$;


--
-- Name: loan_rollover_calculation_v1(text, date, numeric); Type: FUNCTION
--

CREATE FUNCTION public.loan_rollover_calculation_v1(p_loan text, p_day date, p_penalty numeric) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE l public."Loans"%ROWTYPE; reason text; outstanding numeric; unpaid numeric:=0; unpaid_principal numeric:=0; missing numeric:=0;
 latest date; uncharged integer; raw_interest numeric; interest numeric:=0; clamped boolean:=false; gap_days integer:=0; daily numeric;
 close jsonb; m jsonb; future jsonb; lines jsonb; target text; settlement numeric; closing jsonb; context jsonb; message text; instalment boolean;
BEGIN
 IF p_day IS NULL OR p_penalty IS NULL OR p_penalty<0 OR p_penalty<>trunc(p_penalty) OR p_penalty>92233720368547758 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Rollover penalty must be a whole baht amount of 0 or more'; END IF;
 SELECT * INTO l FROM public."Loans" WHERE "Row ID"=p_loan;
 IF NOT FOUND THEN RETURN NULL; END IF;
 instalment:=l."Loan Type"='ผ่อนชำระรายวัน';
 reason:=CASE
  WHEN l."Loan Status" IS DISTINCT FROM 'ยังไม่ปิดยอด' THEN 'closed'
  WHEN l."Loan Type" IS NULL OR l."Loan Type" NOT IN ('ผ่อนชำระรายวัน','ดอกเบี้ยรายวัน') THEN 'type'
  WHEN coalesce(l."Defaulted",false) OR coalesce(l."Default Loss Amount"::numeric,0)<>0
   OR EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"=p_loan AND starts_with("Row ID",'df10:')) THEN 'defaulted'
  WHEN NOT coalesce(l."Auto Charge Enabled",false) THEN 'auto'
  WHEN EXISTS(SELECT 1 FROM public."Payments" WHERE "Ref Borrower"=l."Ref Borrowers" AND "Status" IN ('Processing','Error')) THEN 'processing'
  WHEN l."Loan Date" IS NULL OR p_day<l."Loan Date" THEN 'date'
  WHEN EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"=p_loan AND starts_with("Row ID",'rl138:')) THEN 'earlier'
  WHEN l."Principal Amount" IS NULL OR l."Principal Amount"::numeric<=0
   OR (instalment AND (l."Due Date" IS NULL OR l."Due Date"<l."Loan Date" OR l."Daily Payment Amount" IS NULL OR l."Daily Payment Amount"::numeric<=0))
   OR (NOT instalment AND (l."Current Daily Interest" IS NULL OR l."Current Daily Interest"::numeric<0)) THEN 'terms'
  WHEN EXISTS(SELECT 1 FROM public."Charges" c LEFT JOIN LATERAL(SELECT coalesce(sum(r."Principal Paid"::numeric),0) p,coalesce(sum(r."Interest Paid"::numeric),0) i,coalesce(sum(r."Late Charge Paid"::numeric),0) lt
    FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID") paid ON true WHERE c."Ref Loans"=p_loan
    AND (c."Principal Due" IS NULL OR c."Interest Due" IS NULL OR c."Principal Due"::numeric<paid.p OR c."Interest Due"::numeric<paid.i OR c."Late Charge Due"::numeric<paid.lt)) THEN 'reconcile'
 END;
 IF reason IS NOT NULL THEN RETURN jsonb_build_object('eligible',false,'reason',reason,'loanId',p_loan,'type',l."Loan Type"); END IF;
 target:='rl138:'||length(p_loan)||':'||p_loan||':'||p_day::text;
 IF instalment THEN
  daily:=l."Daily Payment Amount"::numeric;
  SELECT l."Principal Amount"::numeric-coalesce(sum("Principal Paid"::numeric),0) INTO outstanding FROM public."Repayments" WHERE "Ref Loans"=p_loan;
  WITH paid AS(SELECT r."Ref Charges" id,sum(r."Principal Paid"::numeric) p,sum(r."Interest Paid"::numeric) i,sum(r."Late Charge Paid"::numeric) lt FROM public."Repayments" r WHERE r."Ref Loans"=p_loan GROUP BY r."Ref Charges"),
  rem AS(SELECT c."Row ID" id,c."Charge Date" charge_day,c."Principal Due"::numeric-coalesce(paid.p,0) p,c."Interest Due"::numeric-coalesce(paid.i,0) i,c."Late Charge Due"::numeric-coalesce(paid.lt,0) lt
   FROM public."Charges" c LEFT JOIN paid ON paid.id=c."Row ID" WHERE c."Ref Loans"=p_loan)
  SELECT coalesce(sum(p+i+lt),0),coalesce(sum(p),0),max(charge_day),
   coalesce(jsonb_agg(jsonb_build_object('chargeId',id,'principal',trim_scale(p)::text,'interest',trim_scale(i)::text,'lateCharge',trim_scale(lt)::text,'expectedPrincipalRemaining',trim_scale(p)::text,
    'expectedInterestRemaining',trim_scale(i)::text,'expectedLateChargeRemaining',trim_scale(lt)::text,'chargeDate',charge_day::text) ORDER BY id COLLATE "C") FILTER(WHERE p+i+lt>0),'[]'::jsonb)
  INTO unpaid,unpaid_principal,latest,lines FROM rem;
  missing:=outstanding-unpaid_principal;
  IF missing<0 OR latest IS NULL THEN RETURN jsonb_build_object('eligible',false,'reason','reconcile','loanId',p_loan,'type',l."Loan Type"); END IF;
  uncharged:=greatest(0,l."Due Date"-latest);
  raw_interest:=daily*uncharged-missing;
  interest:=greatest(0,raw_interest);clamped:=raw_interest<0;
 ELSE
  daily:=l."Current Daily Interest"::numeric;
  BEGIN close:=public.loan_close_calculation_v83(p_loan,p_day);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
   RETURN jsonb_build_object('eligible',false,'reason',CASE WHEN message='Loan has no outstanding principal to close' THEN 'nothing' ELSE 'reconcile' END,'loanId',p_loan,'type',l."Loan Type");
  END;
  m:=close->'mutation';
  IF m->>'kind' IN ('insert','increase') THEN missing:=(m->>'principal')::numeric;END IF;
  IF m->>'kind'='insert' THEN interest:=(m->>'interest')::numeric;END IF;
  IF jsonb_typeof(m->'futureInterest')='array' THEN future:=m->'futureInterest';END IF;
  -- The close quote's lines without its own closing change: the lc7: insert goes, an increase of the charge dated D is taken
  -- back (the closing charge carries that principal instead).
  SELECT coalesce(jsonb_agg(CASE WHEN m->>'kind'='increase' AND x->>'chargeId'=close->>'targetChargeId'
     THEN x||jsonb_build_object('principal',trim_scale((x->>'principal')::numeric-missing)::text,'expectedPrincipalRemaining',trim_scale((x->>'expectedPrincipalRemaining')::numeric-missing)::text) ELSE x END
    ORDER BY (x->>'chargeId') COLLATE "C"),'[]'::jsonb)
   INTO lines FROM jsonb_array_elements(close->'allocations') x WHERE NOT (m->>'kind'='insert' AND x->>'chargeId'=m->>'chargeId');
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'chargeId') COLLATE "C"),'[]'::jsonb) INTO lines FROM jsonb_array_elements(lines) x
   WHERE (x->>'principal')::numeric+(x->>'interest')::numeric+coalesce(x->>'lateCharge','0')::numeric>0;
  SELECT coalesce(sum((x->>'principal')::numeric+(x->>'interest')::numeric+coalesce(x->>'lateCharge','0')::numeric),0) INTO unpaid FROM jsonb_array_elements(lines) x;
  SELECT max("Charge Date") INTO latest FROM public."Charges" WHERE "Ref Loans"=p_loan AND "Charge Date"<=p_day AND NOT starts_with("Row ID",'df10:');
  gap_days:=CASE WHEN daily>0 THEN (interest/daily)::integer ELSE 0 END;
 END IF;
 IF missing+interest+p_penalty>0 THEN
  closing:=jsonb_build_object('chargeId',target,'principal',trim_scale(missing)::text,'interest',trim_scale(interest+p_penalty)::text);
  SELECT jsonb_agg(x ORDER BY (x->>'chargeId') COLLATE "C") INTO lines FROM (SELECT x FROM jsonb_array_elements(lines) x UNION ALL
   SELECT jsonb_build_object('chargeId',target,'principal',trim_scale(missing)::text,'interest',trim_scale(interest+p_penalty)::text,'lateCharge','0','expectedPrincipalRemaining',trim_scale(missing)::text,
    'expectedInterestRemaining',trim_scale(interest+p_penalty)::text,'expectedLateChargeRemaining','0','chargeDate',p_day::text)) s;
 END IF;
 settlement:=unpaid+missing+interest+p_penalty;
 IF settlement<=0 THEN RETURN jsonb_build_object('eligible',false,'reason','nothing','loanId',p_loan,'type',l."Loan Type"); END IF;
 IF settlement<>trunc(settlement) OR EXISTS(SELECT 1 FROM jsonb_array_elements(lines) x WHERE x->>'principal'!~'^(0|[1-9][0-9]*)$' OR x->>'interest'!~'^(0|[1-9][0-9]*)$' OR coalesce(x->>'lateCharge','0')!~'^(0|[1-9][0-9]*)$') THEN
  RETURN jsonb_build_object('eligible',false,'reason','reconcile','loanId',p_loan,'type',l."Loan Type"); END IF;
 context:=jsonb_build_object('eligible',true,'loanId',p_loan,'borrowerId',l."Ref Borrowers",'type',l."Loan Type",'businessDate',p_day::text,'sourceVersion',public.pwa_loan_version_v2(p_loan),
  'dailyAmount',trim_scale(daily)::text,'unpaid',trim_scale(unpaid)::text,'missingPrincipal',trim_scale(missing)::text,'penalty',trim_scale(p_penalty)::text,'settlement',trim_scale(settlement)::text,
  'closingCharge',closing,'futureInterest',future,'allocations',lines)
  ||CASE WHEN instalment THEN jsonb_build_object('latestChargeDate',latest::text,'dueDate',l."Due Date"::text,'unchargedDays',uncharged,'remainingInterest',trim_scale(interest)::text,'interestClamped',clamped)
   ELSE jsonb_build_object('latestChargeDate',latest::text,'gapDays',gap_days,'gapInterest',trim_scale(interest)::text) END;
 RETURN context||jsonb_build_object('planHash',encode(sha256(convert_to(context::text,'UTF8')),'hex'));
END $_$;


--
-- Name: FUNCTION loan_rollover_calculation_v1(p_loan text, p_day date, p_penalty numeric); Type: COMMENT
--

COMMENT ON FUNCTION public.loan_rollover_calculation_v1(p_loan text, p_day date, p_penalty numeric) IS 'R136: the rollover quote of an open daily-instalment or daily-interest loan on a day with an early closure penalty: unpaid charges, the principal not yet on a charge, the remaining interest of the days not yet charged (instalment) or the payoff gap interest (daily interest), the closing charge rl138:, the Selected Charges lines, the settlement, sourceVersion and planHash; {eligible:false, reason} when the loan cannot be rolled over. Read only.';


--
-- Name: lump_sum_child_guard(); Type: FUNCTION
--

CREATE FUNCTION public.lump_sum_child_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE payment_id text; borrower_id text; moving jsonb;
BEGIN
 IF TG_OP='UPDATE' AND public.payment_reallocation_permitted(TG_TABLE_NAME,to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
 IF TG_OP='DELETE' AND (pg_trigger_depth()>=2 OR public.pwa_native_inverse_permitted_v2(OLD."Ref Payment")) AND OLD."Ref Payment"=nullif(current_setting('payment_crud.id',true),'') THEN RETURN OLD; END IF;
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


--
-- Name: lump_sum_receipt_guard(); Type: FUNCTION
--

CREATE FUNCTION public.lump_sum_receipt_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
      NEW."Amount Received"::numeric IS DISTINCT FROM (SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric+"Late Charge Paid"::numeric) FROM public."Repayments" WHERE "Ref Payment"=OLD."Row ID") OR
      EXISTS(SELECT 1 FROM public."Payment Allocations" a FULL JOIN public."Repayments" r ON r."Ref Payment Allocation"=a."Row ID"
        WHERE (a."Ref Payment"=OLD."Row ID" OR r."Ref Payment"=OLD."Row ID") AND
          (a."Row ID" IS NULL OR r."Row ID" IS NULL OR a."Ref Payment" IS DISTINCT FROM r."Ref Payment"
           OR a."Ref Charge" IS DISTINCT FROM r."Ref Charges" OR a."Allocated Interest" IS DISTINCT FROM r."Interest Paid"
           OR a."Allocated Principal" IS DISTINCT FROM r."Principal Paid" OR a."Allocated Late Charge" IS DISTINCT FROM r."Late Charge Paid"
           OR a."Allocated Amount"::numeric<=0
           OR a."Allocated Interest"::numeric<0 OR a."Allocated Principal"::numeric<0 OR a."Allocated Late Charge"::numeric<0
           OR a."Allocated Amount"::numeric<>a."Allocated Interest"::numeric+a."Allocated Principal"::numeric+a."Allocated Late Charge"::numeric))) THEN
      RAISE EXCEPTION 'Cannot mark an unreconciled payment Posted';
    END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: move_payment_interest(public."Payment Allocations", public."Payment Allocations"); Type: FUNCTION
--

CREATE FUNCTION public.move_payment_interest(a public."Payment Allocations", n public."Payment Allocations") RETURNS public."Payment Allocations"
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: new_loan_cashpool_guard(); Type: FUNCTION
--

CREATE FUNCTION public.new_loan_cashpool_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE pool numeric; outstanding numeric; available numeric;
BEGIN
 -- A pre-existing repeatable snapshot cannot establish current capacity.
 IF current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'New loan cashpool check requires READ COMMITTED; sync and retry';
 END IF;
 IF NEW."Principal Amount" IS NULL OR NEW."Principal Amount"::numeric<=0 THEN
  RAISE EXCEPTION 'New loan principal must be greater than zero' USING ERRCODE='23514';
 END IF;
 SELECT coalesce(sum(CASE WHEN "Transaction Type"='Contribution'
  THEN "Amount"::numeric ELSE -"Amount"::numeric END),0) INTO pool
 FROM public."Cash Pool Contributions";
 -- Canonical ledger, equivalent to SUM(Loans[Outstanding Principal]); includes
 -- this transaction's earlier rows even before deferred caches are refreshed.
 SELECT coalesce(sum(coalesce(l."Principal Amount"::numeric,0)),0)
  - coalesce((SELECT sum(r."Principal Paid"::numeric) FROM public."Repayments" r
     JOIN public."Loans" x ON x."Row ID"=r."Ref Loans"),0)
 INTO outstanding FROM public."Loans" l;
 available:=pool-outstanding;
 IF NEW."Principal Amount"::numeric>available THEN
  RAISE EXCEPTION 'New loan exceeds available cashpool. Principal: %; available: %. Reduce the amount or add contributed capital, then sync and retry.',
   NEW."Principal Amount"::numeric,available USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;


--
-- Name: olap_reporting_date(); Type: FUNCTION
--

CREATE FUNCTION public.olap_reporting_date() RETURNS date
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog'
    AS $$
 SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
$$;


--
-- Name: original_daily_interest_rate(public."Loans", boolean); Type: FUNCTION
--

CREATE FUNCTION public.original_daily_interest_rate(p public."Loans", historical boolean DEFAULT false) RETURNS integer
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE daily numeric; basis numeric[]; n bigint; days integer;
BEGIN
 IF p."Principal Amount" IS NULL OR p."Principal Amount"::numeric<=0 THEN RETURN NULL; END IF;
 CASE p."Loan Type"
 WHEN 'ดอกเบี้ยรายวัน' THEN
  IF historical THEN
   basis:=public.daily_interest_basis(p."Loan Arrangement");
   IF basis IS NOT NULL THEN RETURN round(100*basis[1]/basis[2])::integer; END IF;
   SELECT count(*),min(c."Interest Due"::numeric-coalesce(p."Transfer Fee"::numeric,0))
    INTO n,daily FROM public."Charges" c WHERE c."Ref Loans"=p."Row ID"
     AND c."Charge Date"=p."Loan Date" AND coalesce(c."Principal Due"::numeric,0)=0;
   IF n=1 AND daily>=0 THEN RETURN round(100*daily/p."Principal Amount"::numeric)::integer; END IF;
   -- With no original evidence, only an unrepaid loan still has its entry amount.
   IF coalesce(p."Total Principal Received",0)<>0 THEN RETURN NULL; END IF;
  END IF;
  daily:=p."Current Daily Interest"::numeric;
 WHEN 'กำหนดวันชำระ' THEN
  days:=p."Due Date"-p."Loan Date"+1;
  IF days IS NULL OR days<=0 THEN RETURN NULL; END IF;
  daily:=p."Fixed Interest"::numeric/days;
 WHEN 'ผ่อนชำระรายวัน' THEN
  days:=p."Due Date"-p."Loan Date"+1;
  IF days IS NULL OR days<=0 THEN RETURN NULL; END IF;
  daily:=(p."Daily Payment Amount"::numeric*days-p."Principal Amount"::numeric)/days;
 ELSE RETURN NULL;
 END CASE;
 IF daily IS NULL OR daily<0 THEN RETURN NULL; END IF;
 RETURN round(100*daily/p."Principal Amount"::numeric)::integer;
END $$;


--
-- Name: partner_net_profit(text); Type: FUNCTION
--

CREATE FUNCTION public.partner_net_profit(p_partner text) RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 WITH partner AS (SELECT "Partner Role" role FROM public."Partners" WHERE "Row ID"=p_partner),
 gross AS (
 SELECT coalesce(sum(round((r."Interest Paid"::numeric+r."Late Charge Paid"::numeric) /* R118 */*CASE WHEN c.pool>0 THEN coalesce(c.owned,0)/c.pool ELSE 0 END)),0) n
 FROM public."Repayments" r CROSS JOIN LATERAL (
 SELECT sum(CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END) pool,
 sum(CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END)
 FILTER(WHERE p."Partner Role"=(SELECT role FROM partner)) owned
 FROM public."Cash Pool Contributions" c LEFT JOIN public."Partners" p ON p."Row ID"=c."Ref Partner"
 WHERE c."Contribution Date"<=r."Payment Date") c)
 SELECT gross.n-coalesce((SELECT sum(CASE WHEN (SELECT role FROM partner)='A' THEN "Partner A Expense"::numeric
 WHEN (SELECT role FROM partner)='B' THEN "Partner B Expense"::numeric ELSE 0 END) FROM public."Business Expenses"),0) FROM gross;
$$;


--
-- Name: partner_pool_share_at_date(date, text); Type: FUNCTION
--

CREATE FUNCTION public.partner_pool_share_at_date(p_date date, p_role text) RETURNS numeric
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE a numeric; b numeric;
BEGIN
 -- R140 V144: only Partners with role A or B count. The pool is a step function of the contribution dates: the state on
 -- p_date is the one of the latest contribution date on or before it; when that state is not valid (pool not positive or a
 -- side negative), the latest earlier valid state, else the earliest later one.
 IF p_date IS NULL OR p_role IS NULL OR p_role NOT IN ('A','B') THEN
   RAISE EXCEPTION 'Expense allocation requires a positive A/B contribution pool on its allocation date';
 END IF;
 WITH day AS (
  SELECT c."Contribution Date" AS d,
   coalesce(sum(CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END) FILTER (WHERE p."Partner Role"='A'),0) AS da,
   coalesce(sum(CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END) FILTER (WHERE p."Partner Role"='B'),0) AS db
  FROM public."Cash Pool Contributions" c JOIN public."Partners" p ON p."Row ID"=c."Ref Partner" AND p."Partner Role" IN ('A','B')
  WHERE c."Contribution Date" IS NOT NULL GROUP BY c."Contribution Date"),
 state AS (SELECT d,sum(da) OVER (ORDER BY d) AS sa,sum(db) OVER (ORDER BY d) AS sb FROM day)
 SELECT sa,sb INTO a,b FROM state WHERE sa+sb>0 AND sa>=0 AND sb>=0
 ORDER BY (d<=p_date) DESC,CASE WHEN d<=p_date THEN d END DESC,d LIMIT 1;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'Expense allocation requires a positive A/B contribution pool on its allocation date';
 END IF;
 RETURN CASE WHEN p_role='A' THEN a/(a+b) ELSE 1-a/(a+b) END;
END $$;


--
-- Name: payment_charge_balances(text); Type: FUNCTION
--

CREATE FUNCTION public.payment_charge_balances(p_id text) RETURNS TABLE(charge text, loan text, charge_day date, principal numeric, interest numeric, late numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  SELECT c."Row ID",c."Ref Loans",c."Charge Date",
    c."Principal Due"::numeric-paid.p,c."Interest Due"::numeric-paid.i,c."Late Charge Due"::numeric-paid.l
  FROM public."Payments" p
  JOIN public."Loans" l ON l."Ref Borrowers"=p."Ref Borrower"
  JOIN public."Charges" c ON c."Ref Loans"=l."Row ID"
  LEFT JOIN public."Charges" target ON target."Row ID"=p."Ref Target Charge"
  CROSS JOIN LATERAL (
    SELECT coalesce(sum(r."Principal Paid"::numeric),0) p,
           coalesce(sum(r."Interest Paid"::numeric),0) i,
           coalesce(sum(r."Late Charge Paid"::numeric),0) l
    FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID"
  ) paid
  WHERE p."Row ID"=p_id AND CASE
    WHEN p."Allocation Method" IN ('Single Full','Single Partial','First-day Auto')
      THEN c."Row ID"=p."Ref Target Charge"
    WHEN p."Allocation Method"='Loan Close' THEN c."Ref Loans"=target."Ref Loans"
    WHEN p."Allocation Method" IN ('Receive All','Lump Sum') THEN c."Charge Date"<=p."Payment Date"
    WHEN p."Allocation Method"='Selected Charges' THEN
      c."Row ID"=ANY(public.selected_charge_ids(p."Selected Charge IDs"))
      AND c."Charge Date"<=p."Payment Date"
    ELSE false END;
$$;


--
-- Name: payment_crud_finish(); Type: FUNCTION
--

CREATE FUNCTION public.payment_crud_finish() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF TG_OP='UPDATE' AND public.payment_inputs(NEW) IS NOT DISTINCT FROM public.payment_inputs(OLD) AND NEW."Ref Received By Cash Account" IS NOT DISTINCT FROM OLD."Ref Received By Cash Account" THEN RETURN NULL;END IF;
 PERFORM public.payment_crud_finish_core_v83(OLD,CASE WHEN TG_OP='UPDATE' THEN NEW ELSE OLD END,TG_OP);RETURN NULL;
END $$;


--
-- Name: payment_crud_finish_core_v83(public."Payments", public."Payments", text); Type: FUNCTION
--

CREATE FUNCTION public.payment_crud_finish_core_v83(p_old public."Payments", p_new public."Payments", operation text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
#variable_conflict use_column
DECLARE d date; first_day date; last_day date; previous jsonb; l public."Loans"%ROWTYPE; prior_context text; cleanup_before text:=current_setting('payment_crud.id',true); parents_before text:=current_setting('payment_crud.parents',true);
BEGIN
 IF pg_trigger_depth()=0 AND NOT public.pwa_native_inverse_permitted_v2(p_old."Row ID") THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Protected correction context required';END IF;
 IF operation='UPDATE' THEN
  IF EXISTS(SELECT 1 FROM public."Repayments" r JOIN public."Loans" l ON l."Row ID"=r."Ref Loans"
   WHERE r."Ref Payment"=p_new."Row ID" AND l."Defaulted" IS TRUE) THEN
   RAISE EXCEPTION 'Corrected payment has a default dependency; undo default first'; END IF;
  d:=least(p_old."Payment Date",p_new."Payment Date");
 ELSE d:=p_old."Payment Date";
 END IF;
 prior_context:=current_setting('payment_crud.id',true);
 PERFORM set_config('payment_crud.id',p_old."Row ID",true);
 FOR previous IN SELECT value FROM jsonb_array_elements(coalesce(nullif(current_setting('payment_crud.parents',true),'')::jsonb->p_old."Row ID",'[]')) LOOP
  SELECT * INTO l FROM public."Loans" WHERE "Row ID"=previous->>'Row ID';
  IF l."Ref Closing Payment" IS NOT NULL AND (l."Principal Amount"::numeric>
    (SELECT coalesce(sum("Principal Paid"::numeric),0) FROM public."Repayments" WHERE "Ref Loans"=l."Row ID")
    OR EXISTS(SELECT 1 FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND c."Principal Due"::numeric+c."Interest Due"::numeric+c."Late Charge Due"::numeric> -- R118
     (SELECT coalesce(sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric+r."Late Charge Paid"::numeric),0) FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID"))) THEN
   UPDATE public."Loans" SET "Loan Status"='ยังไม่ปิดยอด',"Ref Closing Payment"=NULL,"Close Date"=NULL,"Closed By"=NULL
    WHERE "Row ID"=l."Row ID";
  ELSIF l."Ref Closing Payment" IS NOT NULL THEN
   -- If the original closing receipt still closes this loan, retain its actual
   -- closure date/actor; rebuilding derived rows is not a new closure event.
   IF l."Ref Closing Payment"=previous->>'Ref Closing Payment' AND l."Ref Closing Payment"<>p_old."Row ID" THEN
    UPDATE public."Loans" SET "Close Date"=(previous->>'Close Date')::date,"Closed By"=previous->>'Closed By'
     WHERE "Row ID"=l."Row ID";
   END IF;
   PERFORM public.create_referral_rebate(l."Row ID");
  END IF;
 END LOOP;
 PERFORM set_config('payment_crud.parents',(coalesce(nullif(current_setting('payment_crud.parents',true),'')::jsonb,'{}')-p_old."Row ID")::text,true);
 PERFORM set_config('payment_crud.id',coalesce(prior_context,''),true);
 PERFORM public.request_business_history(d);
 RETURN;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('payment_crud.id',coalesce(cleanup_before,''),true);
 PERFORM set_config('payment_crud.parents',coalesce(parents_before,''),true);RAISE;
END $$;


--
-- Name: payment_crud_prepare(); Type: FUNCTION
--

CREATE FUNCTION public.payment_crud_prepare() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW."Row ID" IS DISTINCT FROM OLD."Row ID" THEN RAISE EXCEPTION 'Payment key cannot be changed';END IF;
 IF TG_OP='UPDATE' AND public.payment_inputs(NEW) IS NOT DISTINCT FROM public.payment_inputs(OLD) THEN RETURN NEW;END IF;
 IF NOT has_function_privilege(current_user,'public.payment_crud_prepare_core_v83(public."Payments",public."Payments",text)','EXECUTE') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Payment input corrections require the native payment command';END IF;
 RETURN public.payment_crud_prepare_core_v83(OLD,CASE WHEN TG_OP='UPDATE' THEN NEW ELSE OLD END,TG_OP);
END $$;


--
-- Name: FUNCTION payment_crud_prepare(); Type: COMMENT
--

COMMENT ON FUNCTION public.payment_crud_prepare() IS 'Receipt UPDATE/DELETE atomically undo owned derived postings and payment-caused closure. Does not refund money. Historical opening/default dependencies fail without changes; prepared Loan Close charges are retained for explicit correction.';


--
-- Name: payment_crud_prepare_core_v83(public."Payments", public."Payments", text); Type: FUNCTION
--

CREATE FUNCTION public.payment_crud_prepare_core_v83(p_old public."Payments", p_new public."Payments", operation text) RETURNS public."Payments"
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
#variable_conflict use_column
DECLARE offset_ids text[]; offset_id text; b text; l public."Loans"%ROWTYPE; context_before text; owned jsonb; parents_before text:=current_setting('payment_crud.parents',true); cleanup_before text:=current_setting('payment_crud.id',true); actual public."Payments"%ROWTYPE;
BEGIN
 IF pg_trigger_depth()=0 AND NOT public.pwa_native_inverse_permitted_v2(p_old."Row ID") THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Protected correction context required';END IF;
 -- R111: an offset payment changes or goes only with its closing payment.
 IF p_old."Payment Method"='Referral Rebate Offset' AND current_setting('payment_crud.offset',true) IS DISTINCT FROM p_old."Row ID" THEN RAISE EXCEPTION 'Remove through the closing payment'; END IF;
 SELECT * INTO actual FROM public."Payments" WHERE "Row ID"=p_old."Row ID" FOR UPDATE;
 IF NOT FOUND OR to_jsonb(actual) IS DISTINCT FROM to_jsonb(p_old) THEN RAISE EXCEPTION USING ERRCODE='P5B01',MESSAGE='Source changed';END IF;
 IF NOT pg_try_advisory_xact_lock(9162026,2) THEN RAISE EXCEPTION 'Cash pool is busy; retry'; END IF;
 FOR b IN SELECT DISTINCT k COLLATE "C" FROM unnest(ARRAY[p_old."Ref Borrower",CASE WHEN operation='UPDATE' THEN p_new."Ref Borrower" END]) k
  WHERE k IS NOT NULL ORDER BY k COLLATE "C" LOOP
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=b FOR UPDATE NOWAIT;
 END LOOP;
 -- Loan Close prepared charges remain separately editable booked obligations.
 PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers" IN (p_old."Ref Borrower",CASE WHEN operation='UPDATE' THEN p_new."Ref Borrower" END)
  ORDER BY "Row ID" COLLATE "C" FOR UPDATE NOWAIT;
 PERFORM 1 FROM public."Charges" WHERE "Ref Loans" IN (SELECT "Row ID" FROM public."Loans"
  WHERE "Ref Borrowers" IN (p_old."Ref Borrower",CASE WHEN operation='UPDATE' THEN p_new."Ref Borrower" END))
  ORDER BY "Row ID" COLLATE "C" FOR UPDATE NOWAIT;
 PERFORM 1 FROM public."Payment Allocations" WHERE "Ref Payment"=p_old."Row ID" ORDER BY "Row ID" COLLATE "C" FOR UPDATE NOWAIT;
 PERFORM 1 FROM public."Repayments" WHERE "Ref Payment"=p_old."Row ID" ORDER BY "Row ID" COLLATE "C" FOR UPDATE NOWAIT;
 PERFORM 1 FROM public."Cash Ledger" WHERE "Ref Payment"=p_old."Row ID" ORDER BY "Row ID" COLLATE "C" FOR UPDATE NOWAIT;
 IF EXISTS(SELECT 1 FROM public."Repayments" r JOIN public."Loans" l ON l."Row ID"=r."Ref Loans"
  WHERE r."Ref Payment"=p_old."Row ID" AND l."Defaulted" IS TRUE) THEN
  RAISE EXCEPTION 'Payment has a later loan default/write-off; reconcile that default first'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO owned FROM public."Loans" x WHERE x."Row ID" IN
  (SELECT "Ref Loans" FROM public."Repayments" WHERE "Ref Payment"=p_old."Row ID");
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(owned) j WHERE j->>'Loan Status'='ปิดยอดแล้ว' AND j->>'Ref Closing Payment' IS NULL) THEN
  RAISE EXCEPTION 'Manually closed loan must be reopened explicitly before its receipt changes'; END IF;
 PERFORM set_config('payment_crud.parents',
  (coalesce(nullif(current_setting('payment_crud.parents',true),'')::jsonb,'{}')||jsonb_build_object(p_old."Row ID",owned))::text,true);
 context_before:=current_setting('payment_crud.id',true);
 PERFORM set_config('payment_crud.id',p_old."Row ID",true);
 -- A payment-controlled closure is reversible. Manually closed/defaulted loans
 -- are not inferred from balances and are never silently reopened.
 FOR l IN SELECT x.* FROM public."Loans" x WHERE x."Ref Closing Payment" IS NOT NULL
  AND (x."Ref Closing Payment"=p_old."Row ID" OR x."Row ID" IN
   (SELECT "Ref Loans" FROM public."Repayments" WHERE "Ref Payment"=p_old."Row ID"))
  ORDER BY x."Row ID" COLLATE "C" LOOP
  IF l."Defaulted" IS TRUE THEN RAISE EXCEPTION 'Defaulted loan requires explicit default reconciliation'; END IF;
  DELETE FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"='Business Expense'
   AND "Ref Business Expense" IN (SELECT "Row ID" FROM public."Business Expenses"
    WHERE "Ref Related Loan"=l."Row ID" AND "Source Type"='Referral Rebate');
  -- R111: a rebate settled by offset: a correction is refused; a deletion removes the offset payment after the expense
  -- (its booked charges stay, D4).
  SELECT array_agg("Ref Offset Payment" ORDER BY "Ref Offset Payment" COLLATE "C") INTO offset_ids FROM public."Business Expenses"
   WHERE "Ref Related Loan"=l."Row ID" AND "Source Type"='Referral Rebate' AND "Ref Offset Payment" IS NOT NULL;
  IF offset_ids IS NOT NULL AND operation<>'DELETE' THEN RAISE EXCEPTION 'Remove through the closing payment: delete it and close again'; END IF;
  DELETE FROM public."Business Expenses" WHERE "Ref Related Loan"=l."Row ID" AND "Source Type"='Referral Rebate';
  FOREACH offset_id IN ARRAY coalesce(offset_ids,ARRAY[]::text[]) LOOP
   PERFORM set_config('payment_crud.offset',offset_id,true);
   DELETE FROM public."Payments" WHERE "Row ID"=offset_id;
   PERFORM set_config('payment_crud.offset','',true);
  END LOOP;
  -- Only the receipt which owns the closure is reopened before reposting.
  -- A later receipt's closure is checked against final balances in finish().
  IF l."Ref Closing Payment"=p_old."Row ID" THEN
   UPDATE public."Loans" SET "Loan Status"='ยังไม่ปิดยอด',"Ref Closing Payment"=NULL,"Close Date"=NULL,"Closed By"=NULL
    WHERE "Row ID"=l."Row ID";
  END IF;
 END LOOP;
 DELETE FROM public."Repayments" WHERE "Ref Payment"=p_old."Row ID";
 DELETE FROM public."Payment Allocations" WHERE "Ref Payment"=p_old."Row ID";
 IF operation='DELETE' THEN
  DELETE FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"='Payment' AND "Ref Payment"=p_old."Row ID";
 ELSE
  p_new."Status":='Processing'; p_new."Processed At":=NULL;
 END IF;
 PERFORM set_config('payment_crud.id',coalesce(context_before,''),true);
 IF operation='DELETE' THEN RETURN p_old; END IF;
 RETURN p_new;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('payment_crud.id',coalesce(cleanup_before,''),true);
 PERFORM set_config('payment_crud.parents',coalesce(parents_before,''),true);RAISE;
END $$;


--
-- Name: payment_delete_request_guard(); Type: FUNCTION
--

CREATE FUNCTION public.payment_delete_request_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW."Delete Requested" THEN RAISE EXCEPTION 'Create a receipt before requesting deletion'; END IF;
  RETURN NEW;
 END IF;
 IF NEW."Delete Requested" THEN
  IF (to_jsonb(NEW)-'Delete Requested') IS DISTINCT FROM (to_jsonb(OLD)-'Delete Requested') THEN
   RAISE EXCEPTION 'Delete receipt must be a separate action; sync source edits first';
  END IF;
 END IF;
 RETURN NEW;
END $$;


--
-- Name: payment_delete_requested(); Type: FUNCTION
--

CREATE FUNCTION public.payment_delete_requested() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 DELETE FROM public."Payments" WHERE "Row ID"=NEW."Row ID";
 RETURN NULL;
END $$;


--
-- Name: payment_inputs(public."Payments"); Type: FUNCTION
--

CREATE FUNCTION public.payment_inputs(p public."Payments") RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $$
 SELECT jsonb_build_array(p."Ref Borrower",p."Amount Received",p."Payment Date",p."Allocation Method",
 p."Ref Target Charge",p."Ref Target Loan",p."Selected Charge IDs")
$$;


--
-- Name: payment_reallocation_permitted(text, jsonb, jsonb); Type: FUNCTION
--

CREATE FUNCTION public.payment_reallocation_permitted(p_table text, p_old jsonb, p_new jsonb) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
 SELECT session_user='postgres' AND EXISTS (
  SELECT 1 FROM agent_audit.row_changes r JOIN agent_audit.commits c
   ON (c.operation_id,c.database_txid)=(r.operation_id,r.database_txid)
  WHERE c.operation_id::text=nullif(current_setting('mw_agent.reallocation_id',true),'')
   AND c.database_txid=pg_current_xact_id() AND c.database_session_role='postgres'
   AND c.request_reason LIKE 'interest-reallocation: %'
   AND r.schema_name='public' AND r.table_name=p_table AND r.action='UPDATE'
   AND r.before_row=p_old AND r.after_row=p_new
 );
$$;


--
-- Name: payment_receipt_upload_stamp(); Type: FUNCTION
--

CREATE FUNCTION public.payment_receipt_upload_stamp() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
 NEW."Uploaded Receipt":=nullif(btrim(NEW."Uploaded Receipt"),'');
 IF NEW."Uploaded Receipt" IS NULL THEN
  NEW."Uploaded Receipt At":=NULL;
 ELSIF TG_OP='INSERT' THEN
  NEW."Uploaded Receipt At":=clock_timestamp() AT TIME ZONE 'Asia/Bangkok';
 ELSIF NEW."Uploaded Receipt" IS DISTINCT FROM OLD."Uploaded Receipt" THEN
  NEW."Uploaded Receipt At":=clock_timestamp() AT TIME ZONE 'Asia/Bangkok';
 ELSE
  NEW."Uploaded Receipt At":=OLD."Uploaded Receipt At";
 END IF;
 RETURN NEW;
END $$;


--
-- Name: post_loan_default(public."Loans", date, text, numeric, boolean); Type: FUNCTION
--

CREATE FUNCTION public.post_loan_default(p_loan public."Loans", p_date date, p_actor text, p_amount numeric, p_keep boolean) RETURNS numeric
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE prior text:=current_setting('business_crud.default',true); outstanding numeric; amount numeric; c record; posting text;
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
  IF p_keep IS NULL THEN RAISE EXCEPTION 'Default request does not match this loan'; END IF;
  -- R109: kept charges go on generating at the reduced daily interest, which only a daily-interest loan has.
  IF p_keep AND p_loan."Loan Type" IS DISTINCT FROM 'ดอกเบี้ยรายวัน' THEN
    RAISE EXCEPTION 'Keeping unpaid charges requires a daily-interest loan';
  END IF;
  IF EXISTS(SELECT 1 FROM public."Payments" WHERE "Ref Borrower"=p_loan."Ref Borrowers" AND "Status" IN ('Processing','Error')) THEN
    RAISE EXCEPTION 'Resolve processing or error payments before default';
  END IF;
  PERFORM 1 FROM public."Charges" WHERE "Ref Loans"=p_loan."Row ID" ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
  SELECT p_loan."Principal Amount"::numeric-coalesce(sum("Principal Paid"::numeric),0)
    INTO outstanding FROM public."Repayments" WHERE "Ref Loans"=p_loan."Row ID";
  -- A fully lost loan (outstanding 0 after an earlier posting) may still be written off and closed, with no new pair.
  IF outstanding<=0 AND (p_keep OR coalesce(p_loan."Default Loss Amount"::numeric,0)<=0 OR outstanding<0) THEN
    RAISE EXCEPTION 'Default requires outstanding principal'; END IF;
  amount:=coalesce(p_amount,outstanding);
  IF p_amount IS NOT NULL AND (amount<>trunc(amount) OR amount<0 OR amount>outstanding OR (amount=0 AND (p_keep OR outstanding>0))) THEN
    RAISE EXCEPTION 'Default loss amount must be a whole baht amount between 1 and the outstanding principal'; END IF;
  IF amount<outstanding AND NOT p_keep THEN RAISE EXCEPTION 'Partial default loss must keep unpaid charges'; END IF;
  -- R109 (Chase D1): a full loss that keeps charges needs an unpaid charge to keep; otherwise the loan would stay open at 0
  -- with nothing left to close it. Write off and close instead. A partial loss keeps its principal and stays allowed.
  IF p_keep AND amount>=outstanding AND NOT EXISTS(SELECT 1 FROM public."Charges" ch WHERE ch."Ref Loans"=p_loan."Row ID" AND NOT starts_with(ch."Row ID",'df10:')
    AND coalesce(ch."Principal Due"::numeric,0)+coalesce(ch."Interest Due"::numeric,0)+ch."Late Charge Due"::numeric -- R118
     >(SELECT coalesce(sum(coalesce(r."Principal Paid"::numeric,0)+coalesce(r."Interest Paid"::numeric,0)+r."Late Charge Paid"::numeric),0) FROM public."Repayments" r WHERE r."Ref Charges"=ch."Row ID")) THEN
    RAISE EXCEPTION 'A full default loss with no unpaid charge must write off and close'; END IF;
  posting:='df10:'||length(p_loan."Row ID")||':'||p_loan."Row ID"||':'||p_date::text;
  IF amount>0 AND (EXISTS(SELECT 1 FROM public."Charges" WHERE "Row ID"=posting) OR EXISTS(SELECT 1 FROM public."Repayments" WHERE "Row ID"=posting)) THEN
    RAISE EXCEPTION 'One default loss posting per loan per day'; END IF;
  PERFORM set_config('business_crud.default',p_loan."Row ID",true);
  IF NOT p_keep THEN
    FOR c IN SELECT ch.*,coalesce(r.p,0) AS paid_p,coalesce(r.i,0) AS paid_i,coalesce(r.l,0) AS paid_l
      FROM public."Charges" ch LEFT JOIN LATERAL
        (SELECT sum("Principal Paid"::numeric) p,sum("Interest Paid"::numeric) i,sum("Late Charge Paid"::numeric) l
         FROM public."Repayments" WHERE "Ref Charges"=ch."Row ID") r ON true
      WHERE ch."Ref Loans"=p_loan."Row ID" AND NOT starts_with(ch."Row ID",'df10:') ORDER BY ch."Row ID" COLLATE "C"
    LOOP
      IF c."Principal Due" IS NULL OR c."Interest Due" IS NULL OR c.paid_p<0 OR c.paid_i<0
        OR c."Principal Due"::numeric<c.paid_p OR c."Interest Due"::numeric<c.paid_i OR c."Late Charge Due"::numeric<c.paid_l THEN
        RAISE EXCEPTION 'Charge components require reconciliation before default';
      END IF;
      IF c."Charge Date"=p_date AND c.paid_p+c.paid_i+c.paid_l<>0
        AND c."Principal Due"::numeric+c."Interest Due"::numeric+c."Late Charge Due"::numeric<=c.paid_p+c.paid_i+c.paid_l THEN
        RAISE EXCEPTION 'A paid charge today prevents Default Loan';
      END IF;
      -- Record all original components so later undo can prove completeness.
      UPDATE public."Charges" SET "Principal Due"=c.paid_p::money,"Interest Due"=c.paid_i::money,"Late Charge Due"=c.paid_l::money,
        "Notes"=concat_ws(E'\n',nullif(c."Notes",''),'Default write-off '||jsonb_build_object(
          'posting',posting,'date',p_date,'actor',p_actor,
          'original_principal',c."Principal Due"::numeric,'original_interest',c."Interest Due"::numeric,
          'written_off_principal',c."Principal Due"::numeric-c.paid_p,
          'written_off_interest',c."Interest Due"::numeric-c.paid_i,
          'original_late',c."Late Charge Due"::numeric,'written_off_late',c."Late Charge Due"::numeric-c.paid_l)::text)
        WHERE "Row ID"=c."Row ID";
    END LOOP;
  END IF;
  IF amount>0 THEN
    INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes")
      VALUES(posting,p_loan."Row ID",p_date,amount::money,(-amount)::money,
        CASE WHEN p_keep THEN 'Loan default - principal loss recorded, unpaid charges kept; zero cash'
         ELSE 'Loan default - outstanding principal recorded as loss; zero cash' END);
    INSERT INTO public."Repayments"("Row ID","Payment Date","Principal Paid","Interest Paid","Notes","Ref Loans","Ref Charges","Created By")
      VALUES(posting,p_date,amount::money,(-amount)::money,
        CASE WHEN p_keep THEN 'หนี้สูญเงินต้น - เก็บรายการเรียกเก็บค้างชำระไว้ติดตาม / Loan default - principal loss recorded, unpaid charges kept'
         ELSE 'หนี้สูญ - บันทึกเงินต้นคงเหลือเป็นขาดทุน / Loan default - outstanding principal recorded as loss' END,
        p_loan."Row ID",posting,p_actor);
  END IF;
  PERFORM set_config('business_crud.default',coalesce(prior,''),true);
  RETURN amount;
END $$;


--
-- Name: post_payment(text); Type: FUNCTION
--

CREATE FUNCTION public.post_payment(p_id text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$BEGIN
 IF public.pwa_effective_payment_plan_v2(p_id) IS NOT NULL THEN PERFORM public.post_payment_explicit_v6(p_id);
 ELSE PERFORM public.post_payment_legacy_v59(p_id);END IF;
END $$;


--
-- Name: post_payment_explicit_v6(text); Type: FUNCTION
--

CREATE FUNCTION public.post_payment_explicit_v6(p_id text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE p public."Payments"%ROWTYPE; amount numeric; available numeric; command jsonb; projected jsonb; invalid_plan boolean;
BEGIN
  SELECT public.pwa_effective_payment_plan_v2(p_id)->'plan' INTO command;
  IF command IS NULL THEN RAISE EXCEPTION 'PWA immutable plan required';END IF;
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
  IF p."Allocation Method" IS DISTINCT FROM command->>'allocationMethod' OR p."Ref Borrower" IS DISTINCT FROM command->>'borrowerId' OR p."Amount Received"::numeric IS DISTINCT FROM (command->>'amountReceived')::numeric THEN RAISE EXCEPTION 'Explicit allocation identity mismatch';END IF;
  IF p."Allocation Method"='First-day Auto' AND p."Ref Received By Cash Account" IS DISTINCT FROM command->>'cashAccountId' THEN RAISE EXCEPTION 'First-day resolved account differs from immutable plan';END IF;
-- One materialized projection provides both validation and insertion inputs.
  WITH lines AS MATERIALIZED (SELECT value line FROM jsonb_array_elements(command->'allocations')),
  paid AS MATERIALIZED (
   SELECT "Ref Charges" charge,sum("Principal Paid"::numeric) principal,sum("Interest Paid"::numeric) interest,sum("Late Charge Paid"::numeric) late,count(*) FILTER(WHERE "Principal Paid" IS NULL OR "Interest Paid" IS NULL) invalid
   FROM public."Repayments" WHERE "Ref Charges" IN (SELECT line->>'chargeId' FROM lines) GROUP BY "Ref Charges"
  ), plan AS MATERIALIZED (
   SELECT line,c."Charge Date" AS day,l."Ref Borrowers" borrower,c."Principal Due"::numeric-coalesce(paid.principal,0) principal,c."Interest Due"::numeric-coalesce(paid.interest,0) interest,c."Late Charge Due"::numeric-coalesce(paid.late,0) late,coalesce(paid.invalid,0) invalid,row_number() OVER(ORDER BY c."Charge Date" DESC,(line->>'chargeId') COLLATE "C" DESC) ord
   FROM lines LEFT JOIN public."Charges" c ON c."Row ID"=line->>'chargeId' LEFT JOIN public."Loans" l ON l."Row ID"=c."Ref Loans" LEFT JOIN paid ON paid.charge=c."Row ID"
  )
  SELECT jsonb_agg(jsonb_build_object('charge',line->>'chargeId','day',day,'principal',principal,'interest',interest,'late',late,'paidPrincipal',(line->>'principal')::numeric,'paidInterest',(line->>'interest')::numeric,'paidLate',coalesce(line->>'lateCharge','0')::numeric,'ord',ord) ORDER BY ord),
   bool_or(borrower IS DISTINCT FROM p."Ref Borrower" OR invalid>0 OR day IS NULL OR principal IS NULL OR interest IS NULL OR late IS NULL OR principal<0 OR interest<0 OR late<0 OR principal<>trunc(principal) OR interest<>trunc(interest) OR late<>trunc(late) OR (line->>'principal')::numeric>principal OR (line->>'interest')::numeric>interest OR coalesce(line->>'lateCharge','0')::numeric>late)
  INTO projected,invalid_plan FROM plan;
  IF invalid_plan IS DISTINCT FROM false OR jsonb_array_length(projected)<>jsonb_array_length(command->'allocations') THEN RAISE EXCEPTION 'Explicit allocation exceeds current components';END IF;
  INSERT INTO public."Payment Allocations"("Row ID","Ref Payment","Ref Charge","Charge Date Snapshot","Charge Row Number Snapshot","Interest Remaining Snapshot","Principal Remaining Snapshot","Amount Remaining Snapshot","Allocation Order","Allocated Interest","Allocated Late Charge","Allocated Principal","Allocated Amount","Created At")
  SELECT 'pc6:'||length(p_id)||':'||p_id||':'||charge,p_id,charge,day,-ord,interest::money,principal::money,(principal+interest+late)::money,ord,"paidInterest"::money,"paidLate"::money,"paidPrincipal"::money,("paidPrincipal"+"paidInterest"+"paidLate")::money,statement_timestamp() AT TIME ZONE 'Asia/Bangkok'
  FROM jsonb_to_recordset(projected) AS x(charge text,day date,principal numeric,interest numeric,late numeric,"paidPrincipal" numeric,"paidInterest" numeric,"paidLate" numeric,ord integer);
  INSERT INTO public."Repayments"("Row ID","Payment Date","Principal Paid","Interest Paid","Late Charge Paid","Notes",
    "Ref Loans","Ref Charges","Created By","Ref Payment","Ref Payment Allocation")
  SELECT a."Row ID",p."Payment Date",a."Allocated Principal",a."Allocated Interest",a."Allocated Late Charge",p."Notes",
    c."Ref Loans",a."Ref Charge",p."Created By",p_id,a."Row ID"
  FROM public."Payment Allocations" a JOIN public."Charges" c ON c."Row ID"=a."Ref Charge"
  WHERE a."Ref Payment"=p_id;
  IF amount IS DISTINCT FROM (SELECT sum("Allocated Amount"::numeric) FROM public."Payment Allocations" WHERE "Ref Payment"=p_id)
    OR amount IS DISTINCT FROM (SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric+"Late Charge Paid"::numeric) FROM public."Repayments" WHERE "Ref Payment"=p_id) THEN
    RAISE EXCEPTION 'Payment ledger reconciliation failed';
  END IF;
  PERFORM public.close_payment_loans(p_id);
  UPDATE public."Payments" SET "Status"='Posted',"Processed At"=clock_timestamp() AT TIME ZONE 'Asia/Bangkok'
    WHERE "Row ID"=p_id;
END $$;


--
-- Name: post_payment_legacy_v59(text); Type: FUNCTION
--

CREATE FUNCTION public.post_payment_legacy_v59(p_id text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE p public."Payments"%ROWTYPE; amount numeric; available numeric;
BEGIN
  IF public.pwa_effective_payment_plan_v2(p_id) IS NOT NULL THEN RAISE EXCEPTION 'Explicit PWA receipt cannot use legacy engine';END IF;
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
    WHERE principal IS NULL OR interest IS NULL OR late IS NULL OR principal<0 OR interest<0 OR late<0) THEN
    RAISE EXCEPTION 'Eligible charge has missing or negative components; reconcile first';
  END IF;
  IF p."Allocation Method"='Selected Charges' AND (
    (SELECT count(*) FROM public.payment_charge_balances(p_id)) <>
      cardinality(public.selected_charge_ids(p."Selected Charge IDs"))
    OR EXISTS(SELECT 1 FROM public.payment_charge_balances(p_id) WHERE principal+interest+late<=0)) THEN
    RAISE EXCEPTION 'Selected charges changed or are not eligible; refresh and review the full selection';
  END IF;
  SELECT coalesce(sum(principal+interest+late),0) INTO available FROM public.payment_charge_balances(p_id);
  IF amount>available OR (p."Allocation Method" IN ('Single Full','Receive All','First-day Auto','Loan Close','Selected Charges') AND amount<>available) THEN
    RAISE EXCEPTION 'Payment does not match the current eligible balance';
  END IF;
  -- R118: within each charge interest first, then the late charge, then principal.
  WITH ordered AS (
    SELECT *,row_number() OVER w ord,
      coalesce(sum(principal+interest+late) OVER(ORDER BY charge_day DESC,charge COLLATE "C" DESC
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) previous
    FROM public.payment_charge_balances(p_id) WHERE principal+interest+late>0
    WINDOW w AS(ORDER BY charge_day DESC,charge COLLATE "C" DESC)
  ), plan AS (
    SELECT *,least(principal+interest+late,greatest(0,amount-previous)) allocated FROM ordered
  ), parts AS (
    SELECT *,least(interest,allocated) paid_interest,least(late,allocated-least(interest,allocated)) paid_late FROM plan
  )
  INSERT INTO public."Payment Allocations"("Row ID","Ref Payment","Ref Charge","Charge Date Snapshot",
    "Charge Row Number Snapshot","Interest Remaining Snapshot","Principal Remaining Snapshot","Amount Remaining Snapshot",
    "Allocation Order","Allocated Interest","Allocated Late Charge","Allocated Principal","Allocated Amount","Created At")
  SELECT 'pc6:'||length(p_id)||':'||p_id||':'||charge,p_id,charge,charge_day,
    -ord::integer,interest::money,principal::money,(interest+late+principal)::money,
    ord::integer,paid_interest::money,paid_late::money,(allocated-paid_interest-paid_late)::money,allocated::money,
    statement_timestamp() AT TIME ZONE 'Asia/Bangkok' FROM parts WHERE allocated>0;
  INSERT INTO public."Repayments"("Row ID","Payment Date","Principal Paid","Interest Paid","Late Charge Paid","Notes",
    "Ref Loans","Ref Charges","Created By","Ref Payment","Ref Payment Allocation")
  SELECT a."Row ID",p."Payment Date",a."Allocated Principal",a."Allocated Interest",a."Allocated Late Charge",p."Notes",
    c."Ref Loans",a."Ref Charge",p."Created By",p_id,a."Row ID"
  FROM public."Payment Allocations" a JOIN public."Charges" c ON c."Row ID"=a."Ref Charge"
  WHERE a."Ref Payment"=p_id;
  IF amount IS DISTINCT FROM (SELECT sum("Allocated Amount"::numeric) FROM public."Payment Allocations" WHERE "Ref Payment"=p_id)
    OR amount IS DISTINCT FROM (SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric+"Late Charge Paid"::numeric) FROM public."Repayments" WHERE "Ref Payment"=p_id) THEN
    RAISE EXCEPTION 'Payment ledger reconciliation failed';
  END IF;
  PERFORM public.close_payment_loans(p_id);
  UPDATE public."Payments" SET "Status"='Posted',"Processed At"=clock_timestamp() AT TIME ZONE 'Asia/Bangkok'
    WHERE "Row ID"=p_id;
END $$;


--
-- Name: prepare_loan_close(); Type: FUNCTION
--

CREATE FUNCTION public.prepare_loan_close() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE l public."Loans"%ROWTYPE; today date:=(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date;
  target text; today_count integer; latest date; interest numeric:=0; outstanding numeric;
  scheduled numeric; missing numeric; total numeric; calculation jsonb;
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
  calculation:=public.apply_loan_close_calculation_v83(l."Row ID",today,NULL);
  target:=calculation->>'targetChargeId'; total:=(calculation->>'amount')::numeric;
  NEW."Ref Target Charge":=target;
  NEW."Amount Received":=total::money;
  RETURN NEW;
END $$;


--
-- Name: process_lump_sum(); Type: FUNCTION
--

CREATE FUNCTION public.process_lump_sum() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NEW."Status"='Processing' THEN PERFORM public.post_payment(NEW."Row ID"); END IF;
  RETURN NULL;
END $$;


--
-- Name: protect_account_cutover(); Type: FUNCTION
--

CREATE FUNCTION public.protect_account_cutover() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF TG_OP='UPDATE' AND pg_trigger_depth()>1 AND current_setting('r051.restate_account_opening',true)='on'
  AND (to_jsonb(NEW)-ARRAY['Opening Balance','Notes'])=(to_jsonb(OLD)-ARRAY['Opening Balance','Notes'])
  AND left(NEW."Notes",length(OLD."Notes"))=OLD."Notes" THEN RETURN NEW; END IF;
 IF TG_OP<>'INSERT' OR current_setting('r008.initializing',true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'Account openings are immutable and require the controlled initializer'; END IF;
 RETURN NEW;
END $$;


--
-- Name: protect_cash_cutover(); Type: FUNCTION
--

CREATE FUNCTION public.protect_cash_cutover() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN RAISE EXCEPTION 'R005 cutover identities are immutable'; END $$;


--
-- Name: pwa_agent_receipt_status_v1(uuid, text, text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_agent_receipt_status_v1(request_id uuid, actor_issuer text, actor_subject text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE r public.pwa_payment_commands%ROWTYPE; c jsonb; matched boolean; environment text;
BEGIN
 environment:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR session_user<>('mw-credit-app-command-'||environment||'@clever-oasis-508610-n7.iam') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Command session required'; END IF;
 SELECT * INTO r FROM public.pwa_payment_commands p WHERE p.request_id=$1 AND p.actor_issuer=$2 AND p.actor_subject=$3 AND p.canonical_json::jsonb#>>'{command,schemaVersion}' IN ('7','8','9','10') AND p.canonical_json::jsonb->'command' ? 'reviewId'; -- R118: agent v10
 IF NOT FOUND THEN RETURN jsonb_build_object('kind','unresolved'); END IF;
 c:=r.canonical_json::jsonb->'command';
 SELECT EXISTS(SELECT 1 FROM public."Payments" p WHERE p."Row ID"=r.payment_id AND p."Status"='Posted'
  AND p."Ref Borrower"=(c->>'borrowerId') AND p."Ref Received By Cash Account"=(c->>'cashAccountId')
  AND p."Amount Received"::numeric=((c->>'amountReceived'))::numeric AND p."Payment Date"=((c->>'paymentDate'))::date
  AND p."Created By"=r.actor_login_email AND p."Payment Method"='Bank Transfer' AND p."Allocation Method"=CASE WHEN c->>'schemaVersion' IN ('9','10') THEN 'Selected Charges' ELSE 'Lump Sum' END
  AND p."Bank Reference"=(c->>'bankReference') AND to_char(p."Created At",'YYYY-MM-DD HH24:MI')=(c->>'paymentDate')||' '||(c->>'transferTime')
  AND (SELECT coalesce(sum(x."Principal Paid"::numeric+x."Interest Paid"::numeric+x."Late Charge Paid"::numeric),0) FROM public."Repayments" x WHERE x."Ref Payment"=p."Row ID")=((c->>'amountReceived'))::numeric) INTO matched;
 RETURN jsonb_build_object('kind','recorded','reviewId',(c->>'reviewId'),'financialMatch',CASE WHEN r.outcome='posted' THEN matched ELSE NULL END,
  'originalOutcome',jsonb_build_object('status',r.outcome,'paymentId',r.payment_id,'code',r.rejection_code,'recordedAt',to_char(r.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
END $_$;


--
-- Name: pwa_apply_analytics_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_apply_analytics_v2(payload text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE e jsonb:=payload::jsonb;c jsonb:=e->'command';i jsonb:=c->'inputs';target text:=c->>'targetId';snapshot jsonb;
BEGIN
 IF (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END) OR c->>'operation'<>'analytics.refresh' THEN RAISE EXCEPTION USING ERRCODE='42501';END IF;
 PERFORM public.pwa_management_tools_text_v2('analytics.refresh',i);
 PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('management:analytics',target));
 SELECT to_jsonb(s) INTO snapshot FROM public."Statistics" s WHERE "Row ID"=target FOR UPDATE;
 IF snapshot IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 IF encode(sha256(convert_to(snapshot::text,'UTF8')),'hex') IS DISTINCT FROM c->>'expectedVersion' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 UPDATE public."Statistics" SET "Analytics Refresh Request"=public.olap_reporting_date()::text||'|'||(i->>'mode')||'|'||(e->>'requestId') WHERE "Row ID"=target;
 RETURN jsonb_build_object('operation','analytics.refresh','targetType','analytics','targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy',NULL);
END $$;


--
-- Name: pwa_apply_assessment_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_apply_assessment_v2(payload text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE e jsonb:=payload::jsonb;c jsonb:=e->'command';i jsonb:=c->'inputs';op text:=c->>'operation';target text:=c->>'targetId';snapshot jsonb;day date:=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date;message text;
BEGIN
 IF (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END) OR op NOT IN('assessment.create','assessment.update','assessment.refresh','assessment.delete') THEN RAISE EXCEPTION USING ERRCODE='42501';END IF;
 PERFORM public.pwa_management_tools_text_v2(op,i);
 PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('management:assessment',target));
 SELECT to_jsonb(s) INTO snapshot FROM public."Loan Assessment SQL Lab" s WHERE "Row ID"=target FOR UPDATE;
 IF op='assessment.create' THEN IF snapshot IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 ELSE IF snapshot IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;IF encode(sha256(convert_to(snapshot::text,'UTF8')),'hex') IS DISTINCT FROM c->>'expectedVersion' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;END IF;
 IF op IN('assessment.create','assessment.update') AND i->>'borrowerId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID"=i->>'borrowerId') THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 IF op='assessment.create' AND ((i->>'forecastStart')::date<>day OR (i->>'forecastEnd')::date<>day) THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
 IF op='assessment.update' AND (i->>'forecastStart' IS DISTINCT FROM snapshot->>'SQL Forecast Start' OR i->>'forecastEnd' IS DISTINCT FROM snapshot->>'SQL Forecast End') THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
 BEGIN
 IF op='assessment.create' THEN INSERT INTO public."Loan Assessment SQL Lab"("Row ID","Assessment ID","Ref Borrower","Proposed Loan Amount","Minimum Daily Profit Rate","SQL Forecast Start","SQL Forecast End") VALUES(target,i->>'assessmentId',i->>'borrowerId',(i->>'proposedLoanAmount')::numeric::money,(i->>'minimumDailyProfitRate')::real,day,day);
 ELSIF op='assessment.update' THEN UPDATE public."Loan Assessment SQL Lab" SET "Assessment ID"=i->>'assessmentId',"Ref Borrower"=i->>'borrowerId',"Proposed Loan Amount"=(i->>'proposedLoanAmount')::numeric::money,"Minimum Daily Profit Rate"=(i->>'minimumDailyProfitRate')::real WHERE "Row ID"=target;
 ELSIF op='assessment.refresh' THEN UPDATE public."Loan Assessment SQL Lab" SET "SQL Forecast Start"=(public.pwa_assessment_refresh_window_v2("SQL Forecast Start","SQL Forecast End",day))[1],"SQL Forecast End"=(public.pwa_assessment_refresh_window_v2("SQL Forecast Start","SQL Forecast End",day))[2],"SQL Refresh Token"=e->>'requestId' WHERE "Row ID"=target;
 ELSE DELETE FROM public."Loan Assessment SQL Lab" WHERE "Row ID"=target;END IF;
 EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B04';
 WHEN raise_exception THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
 IF message='Forecast window must include today and cannot exceed 3660 days' THEN RAISE EXCEPTION USING ERRCODE='P5B08';ELSE RAISE;END IF;
 END;
 RETURN jsonb_build_object('operation',op,'targetType','assessment','targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy',NULL);
END $$;


--
-- Name: pwa_apply_cash_opening_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_apply_cash_opening_v2(payload text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE e jsonb:=payload::jsonb;c jsonb:=e->'command';i jsonb:=c->'inputs';target text:=c->>'targetId';basis jsonb;allocation jsonb;message text;
BEGIN
 IF (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END) OR c->>'operation'<>'cash-openings.initialize' THEN RAISE EXCEPTION USING ERRCODE='42501';END IF;
 -- Exact native lock set and order before comparing the reviewed basis or touching openings.
 LOCK TABLE public."Payments",public."Loans",public."Business Expenses",public."Settlements",public."Cash Ledger",public."Cash Accounts" IN SHARE ROW EXCLUSIVE MODE;
 PERFORM 1 FROM public."Cash Holders" WHERE "Row ID"=target FOR UPDATE;
 basis:=public.pwa_cash_opening_basis_v2(target);
 IF basis IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 IF basis->>'sourceVersion' IS DISTINCT FROM c->>'expectedVersion' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF encode(sha256(convert_to(basis::text,'UTF8')),'hex') IS DISTINCT FROM i->>'reviewedBasisHash' THEN RAISE EXCEPTION USING ERRCODE='P5B09';END IF;
 SELECT jsonb_object_agg(x->>'accountId',x->>'amount') INTO allocation FROM jsonb_array_elements(i->'openings') x;
 BEGIN
 PERFORM public.initialize_cash_accounts(target,allocation,e#>>'{actor,loginEmail}',i->>'notes');
 EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
 IF message IN('Cash account has already been initialized','Opening allocation must include exactly all uninitialized accounts of this holder','Account openings must sum exactly to the current holder balance') THEN RAISE EXCEPTION USING ERRCODE='P5B09';
 ELSIF message='Holder has no cash accounts' THEN RAISE EXCEPTION USING ERRCODE='P5B04';ELSE RAISE;END IF;
 END;
 RETURN jsonb_build_object('operation',c->>'operation','targetType','cash-openings','targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy',NULL);
END $$;


--
-- Name: pwa_apply_charge_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_apply_charge_v2(canonical text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE e jsonb:=canonical::jsonb;i jsonb:=e#>'{command,inputs}';a jsonb:=e->'actor';target text:=e#>>'{command,targetId}';op text:=e#>>'{command,operation}';old_loan text;new_loan text;l public."Loans"%ROWTYPE;payment text;plan jsonb;result_value jsonb;p numeric;interest numeric;message text;
 -- R118: the late charge of the request (or the stored one).
 late numeric;
BEGIN
 IF (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END) OR op NOT IN('charge.create','charge.update','charge.delete') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Governed operation required';END IF;
 SELECT "Ref Loans" INTO old_loan FROM public."Charges" WHERE "Row ID"=target;new_loan:=CASE WHEN op='charge.delete' THEN old_loan ELSE i->>'loanId' END;
 IF op<>'charge.create' AND old_loan IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID" IN(SELECT "Ref Borrowers" FROM public."Loans" WHERE "Row ID" IN(old_loan,new_loan)) ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
 PERFORM 1 FROM public."Loans" WHERE "Row ID" IN(old_loan,new_loan) ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
 SELECT * INTO l FROM public."Loans" WHERE "Row ID"=new_loan;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('charge',target));
 PERFORM 1 FROM public."Charges" WHERE "Row ID"=target FOR UPDATE;
 IF op='charge.create' AND FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF op<>'charge.create' AND public.pwa_charge_version_v2(target) IS DISTINCT FROM e#>>'{command,expectedVersion}' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF op<>'charge.delete' THEN
  p:=(i->>'principalDue')::numeric;interest:=(i->>'interestDue')::numeric;
  late:=CASE WHEN i ? 'lateChargeDue' THEN (i->>'lateChargeDue')::numeric WHEN op='charge.update' THEN (SELECT "Late Charge Due"::numeric FROM public."Charges" WHERE "Row ID"=target) ELSE 0 END;
  IF late IS NULL OR late<0 OR late<>trunc(late) THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
  IF p<0 OR (p=0 AND interest=0 AND late=0 AND NOT(op='charge.update' AND EXISTS(SELECT 1 FROM public."Payment Allocations" pa JOIN public."Payments" pay ON pay."Row ID"=pa."Ref Payment" WHERE pa."Ref Charge"=target AND pay."Status"='Posted') AND NOT EXISTS(SELECT 1 FROM public."Payment Allocations" WHERE "Ref Charge"=target AND "Allocated Amount"::numeric<>0) AND NOT EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Charges"=target AND "Principal Paid"::numeric+"Interest Paid"::numeric+"Late Charge Paid"::numeric<>0))) THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 END IF;
 IF op='charge.create' AND coalesce(l."Auto Charge Enabled",false) AND l."Loan Type" IN('ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน') AND (i->>'chargeDate')::date=l."Loan Date" AND p+interest>0 AND NOT EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Charges"=target) AND NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Ref Target Charge"=target AND "Allocation Method"='First-day Auto') THEN
  -- R118 (Archie point 7): the first-day net-off receipt pays principal and interest only.
  IF p<>trunc(p) OR interest<>trunc(interest) OR interest<0 OR late>0 THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
  payment:='fd6:'||target;
  plan:=jsonb_build_object('borrowerId',l."Ref Borrowers",'amountReceived',trim_scale(p+interest)::text,'allocations',jsonb_build_array(jsonb_build_object('chargeId',target,'principal',trim_scale(p)::text,'interest',trim_scale(interest)::text,'lateCharge','0','expectedPrincipalRemaining',trim_scale(p)::text,'expectedInterestRemaining',trim_scale(interest)::text,'expectedLateChargeRemaining','0','chargeDate',i->>'chargeDate')),'allocationMethod','First-day Auto','targetChargeId',target,'targetLoanId',NULL,'cashAccountId',coalesce(l."Ref Disbursed From Cash Account",public.default_cash_account('ch:lisa')),'paymentDate',l."Loan Date"::text,'paymentMethod','Net-off at Disbursement');
 END IF;
 result_value:=jsonb_build_object('operation',op,'targetType','charge','targetId',target,'paymentId',payment,'plan',plan,'predecessorRequestId',NULL,'sourceCreatedBy',CASE WHEN payment IS NOT NULL THEN l."Created By" ELSE NULL END);
 IF payment IS NOT NULL THEN INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code,result_json) VALUES((e->>'requestId')::uuid,2,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',canonical,encode(sha256(convert_to(canonical,'UTF8')),'hex'),'applied',NULL,NULL,result_value);END IF;
 BEGIN
 CASE op WHEN 'charge.create' THEN INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Late Charge Due","Notes") VALUES(target,new_loan,(i->>'chargeDate')::date,p::money,interest::money,late::money,i->>'notes');
 WHEN 'charge.update' THEN UPDATE public."Charges" SET "Ref Loans"=new_loan,"Charge Date"=(i->>'chargeDate')::date,"Principal Due"=p::money,"Interest Due"=interest::money,"Late Charge Due"=late::money,"Notes"=i->>'notes' WHERE "Row ID"=target;
 WHEN 'charge.delete' THEN DELETE FROM public."Charges" WHERE "Row ID"=target;END CASE;
 EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B05';
 WHEN SQLSTATE 'P0001' THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
 IF message IN('Charge has receipts; reassign or delete those receipts first','Charge has receipts on its original loan; reassign them first') THEN RAISE EXCEPTION USING ERRCODE='P5B05';
 ELSIF message IN('Charge amount cannot be less than its posted component payments','Late charge must be a whole-baht amount of 0 or more') THEN RAISE EXCEPTION USING ERRCODE='P5B06';ELSE RAISE;END IF;
 END;
 IF payment IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"=payment AND "Status"='Posted' AND "Amount Received"::numeric=p+interest AND "Created By" IS NOT DISTINCT FROM l."Created By") THEN RAISE EXCEPTION 'First-day charge receipt differs from immutable plan';END IF;
 RETURN result_value;
END $$;


--
-- Name: pwa_apply_expense_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_apply_expense_v2(canonical text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE e jsonb:=canonical::jsonb;c jsonb:=e->'command';i jsonb:=c->'inputs';a jsonb:=e->'actor';op text:=c->>'operation';target text:=c->>'targetId';old public."Business Expenses"%ROWTYPE;holder text;message text;payee text;payee_name text; /* R140 V143 */ paid date; /* R140 V144 */categories text[]:=ARRAY['Collection Cost / ค่าใช้จ่ายติดตามหนี้','Transportation / ค่าเดินทาง','Bank / Transfer Fee / ค่าธรรมเนียมธนาคารและโอนเงิน','Software / Subscription / ค่าซอฟต์แวร์และสมาชิก','Other / อื่น ๆ','Referral Rebate / เงินคืนค่าแนะนำลูกค้า'];
BEGIN
 IF (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Governed operation required';END IF;
 PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('expense',target));
 SELECT * INTO old FROM public."Business Expenses" WHERE "Row ID"=target FOR UPDATE;
 IF op='expense.create' THEN IF FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 ELSE IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;IF public.pwa_expense_version_v2(target) IS DISTINCT FROM c->>'expectedVersion' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;IF old."Source Type" IS DISTINCT FROM 'Manual' THEN RAISE EXCEPTION USING ERRCODE='P5B05';END IF;END IF;
 IF op<>'expense.delete' THEN
 IF (op='expense.create' OR i->>'category' IS DISTINCT FROM old."Expense Category") AND NOT (i->>'category'=ANY(categories)) THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 IF (i->>'amount')::numeric<0 AND nullif(btrim(i->>'notes'),'') IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 IF i->>'relatedBorrowerId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID"=i->>'relatedBorrowerId') THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 IF i->>'relatedLoanId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."Loans" WHERE "Row ID"=i->>'relatedLoanId' AND (i->>'relatedBorrowerId' IS NULL OR "Ref Borrowers"=i->>'relatedBorrowerId')) THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 IF op='expense.update' AND i->>'paidByAccountId' IS NOT DISTINCT FROM old."Ref Paid By Cash Account" THEN holder:=old."Ref Paid By Cash Holder";
 ELSIF i->>'paidByAccountId' IS NOT NULL THEN
 SELECT ca."Ref Cash Holder" INTO holder FROM public."Cash Accounts" ca JOIN public."Cash Holders" h ON h."Row ID"=ca."Ref Cash Holder" WHERE ca."Row ID"=i->>'paidByAccountId' AND ca."Active" IS TRUE AND h."Active" IS TRUE AND h."Row ID" IN('ch:dad','ch:lisa','ch:tommy');IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
 END IF;
 /* R140 V142: a positive expense without an account is created pending payment (no cash movement until it is paid). */ /* R140 V143: the payee is a borrower (key present: the link and the borrower's name as a snapshot) or a typed name; an update without the key keeps the stored link while the name is unchanged. */ payee_name:=i->>'payeeName'; IF i ? 'payeeBorrowerId' THEN payee:=i->>'payeeBorrowerId'; ELSIF op='expense.update' AND (i->>'payeeName') IS NOT DISTINCT FROM old."Payee Name" THEN payee:=old."Ref Payee Borrower"; END IF; IF i ? 'payeeBorrowerId' AND payee IS NOT NULL THEN SELECT "Borrower Name" INTO payee_name FROM public."Borrowers" WHERE "Row ID"=payee; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF; END IF; /* R140 V144: the paid date: given (not after the Bangkok business date), else kept on an update that stays paid, else null (the Expense Date) */ IF i ? 'paidDate' THEN paid:=(i->>'paidDate')::date; IF paid>(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF; ELSIF op='expense.update' AND old."Ref Paid By Cash Account" IS NOT NULL AND i->>'paidByAccountId' IS NOT NULL THEN paid:=old."Paid Date"; END IF;
 END IF;
 BEGIN
 IF op='expense.create' THEN INSERT INTO public."Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Payee Name","Ref Related Borrower","Ref Related Loan","Notes","Ref Paid By Cash Account","Ref Paid By Cash Holder","Source Type","Created By","Ref Payee Borrower","Paid Date") VALUES(target,(i->>'expenseDate')::date,i->>'category',(i->>'amount')::numeric::money,payee_name,i->>'relatedBorrowerId',i->>'relatedLoanId',i->>'notes',i->>'paidByAccountId',holder,'Manual',a->>'loginEmail',payee,paid);
 ELSIF op='expense.update' THEN UPDATE public."Business Expenses" SET "Expense Date"=(i->>'expenseDate')::date,"Expense Category"=i->>'category',"Amount"=(i->>'amount')::numeric::money,"Payee Name"=payee_name,"Ref Payee Borrower"=payee,"Paid Date"=paid,"Ref Related Borrower"=i->>'relatedBorrowerId',"Ref Related Loan"=i->>'relatedLoanId',"Notes"=i->>'notes',"Ref Paid By Cash Account"=i->>'paidByAccountId',"Ref Paid By Cash Holder"=holder WHERE "Row ID"=target;
 ELSE DELETE FROM public."Business Expenses" WHERE "Row ID"=target;END IF;
 EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B05';WHEN SQLSTATE 'P0001' THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
 IF message='Correct linked reimbursement before changing expense away from a positive Tommy-paid expense' THEN RAISE EXCEPTION USING ERRCODE='P5B05';ELSIF message='Related loan does not belong to related borrower' THEN RAISE EXCEPTION USING ERRCODE='P5B04';ELSIF message IN('A paid date belongs to a paid manual expense','A paid date cannot be before the expense date' /* R140 V145 */) THEN RAISE EXCEPTION USING ERRCODE='P5B08';ELSIF message IN('Expense allocation requires a positive A/B contribution pool on its allocation date','A negative manual adjustment requires an explanatory note') THEN RAISE EXCEPTION USING ERRCODE='P5B06';ELSE RAISE;END IF;END;
 RETURN jsonb_build_object('operation',op,'targetType','expense','targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy',NULL);
END $$;


--
-- Name: pwa_apply_loan_close_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_apply_loan_close_v2(canonical text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE e jsonb:=canonical::jsonb;i jsonb:=e#>'{command,inputs}';a jsonb:=e->'actor';target text:=e#>>'{command,targetId}';
 parent text;day date:=(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date;calculation jsonb;plan jsonb;result_value jsonb;payment text:='pwa:'||(e->>'requestId');message text;actual public."Payments"%ROWTYPE;
 -- R111: the projected rebate, the chosen path and, for an offset, the referrer's plan.
 rebate jsonb;path text:=coalesce(i->>'rebatePath','expense');forward jsonb;covered numeric:=0;offset_id text;offset_plan jsonb;expense public."Business Expenses"%ROWTYPE;
 owed numeric:=0; -- R129: the referrer's pending rebates before this close
BEGIN
 IF (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END) OR e#>>'{command,operation}'<>'loan.close' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Governed operation required';END IF;
 SELECT "Ref Borrowers" INTO parent FROM public."Loans" WHERE "Row ID"=target;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=parent FOR UPDATE;
 PERFORM 1 FROM public."Loans" WHERE "Row ID"=target FOR UPDATE;
 PERFORM 1 FROM public."Charges" WHERE "Ref Loans"=target ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
 IF public.pwa_loan_version_v2(target) IS DISTINCT FROM e#>>'{command,expectedVersion}' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF (i->>'paymentDate')::date IS DISTINCT FROM day THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Cash Accounts" ca JOIN public."Cash Holders" ch ON ch."Row ID"=ca."Ref Cash Holder" WHERE ca."Row ID"=i->>'cashAccountId' AND ca."Active" IS TRUE AND ch."Active" IS TRUE) THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
 BEGIN calculation:=public.loan_close_calculation_v83(target,day);
 EXCEPTION WHEN SQLSTATE 'P0001' THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  IF message=ANY(ARRAY['Loan Close requires an open auto-enabled daily-interest loan','Loan Close requires valid loan date, principal and daily interest','Loan charge components require reconciliation before closing','Loan has no outstanding principal to close','Principal already due exceeds outstanding loan principal','Multiple charges today require reconciliation before closing','Final receipt must be a positive whole-baht amount']) THEN RAISE EXCEPTION USING ERRCODE='P5B06';ELSE RAISE;END IF;
 END;
 IF calculation->>'planHash' IS DISTINCT FROM i->>'expectedPlanHash' OR calculation->>'amount' IS DISTINCT FROM i->>'expectedAmount' THEN RAISE EXCEPTION USING ERRCODE='P5B09';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(calculation->'allocations') line WHERE line->>'principal'!~'^(0|[1-9][0-9]*)$' OR line->>'interest'!~'^(0|[1-9][0-9]*)$' OR coalesce(line->>'lateCharge','0')!~'^(0|[1-9][0-9]*)$' /* R118 */ OR line->>'chargeDate' IS NULL) THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 -- R111: the rebate this close creates, and for a chosen offset on a referrer with an open loan the pay-forward plan
 -- (forward only, amount = rebate) under the referrer's borrower -> loans -> charges locks, taken after this borrower's.
 rebate:=public.pwa_referral_rebate_projection_v1(target,calculation);
 -- R129: the referrer lock of rebate-settlement.create, so owedTotal is exact when the command commits.
 IF rebate IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('borrower',rebate->>'referrerId'));
  owed:=public.pwa_rebates_owed_v1(rebate->>'referrerId');
 END IF;
 IF rebate IS NOT NULL AND path='offset' AND (rebate->>'hasOpenLoan')::boolean AND NOT (rebate->>'selfReferral')::boolean THEN
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=rebate->>'referrerId' FOR UPDATE;
  PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers"=rebate->>'referrerId' ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
  PERFORM 1 FROM public."Charges" ch JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans" WHERE l."Ref Borrowers"=rebate->>'referrerId' ORDER BY ch."Row ID" COLLATE "C" FOR UPDATE OF ch;
  forward:=public.pwa_pay_forward_plan_v1(rebate->>'referrerId',(rebate->>'amount')::numeric,day,'{"forward":true,"principal":[],"loans":null}'::jsonb);
  covered:=(rebate->>'amount')::numeric-(forward->>'uncovered')::numeric;
  IF covered>0 THEN
   offset_id:='ro122:'||payment;
   offset_plan:=jsonb_build_object('borrowerId',rebate->>'referrerId','amountReceived',trunc(covered)::text,'allocations',forward->'allocations','allocationMethod','Selected Charges',
    'targetChargeId',NULL,'targetLoanId',NULL,'cashAccountId',public.default_cash_account('ch:lisa'),'paymentDate',day::text,'paymentMethod','Referral Rebate Offset');
   IF offset_plan->>'cashAccountId' IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
  END IF;
 END IF;
 PERFORM public.apply_loan_close_calculation_v83(target,day,i->>'expectedPlanHash');
 plan:=jsonb_build_object('borrowerId',parent,'amountReceived',calculation->>'amount','allocations',calculation->'allocations','allocationMethod','Loan Close','targetChargeId',calculation->>'targetChargeId','targetLoanId',target,'cashAccountId',i->>'cashAccountId','paymentDate',day::text,'paymentMethod',i->>'paymentMethod');
 result_value:=jsonb_build_object('operation','loan.close','targetType','loan','targetId',target,'paymentId',payment,'plan',plan,'predecessorRequestId',NULL,'sourceCreatedBy',a->>'loginEmail');
 -- R111: the stored choice and outcome (a re-close preview defaults to path); absent when the close creates no rebate.
 IF rebate IS NOT NULL THEN
  result_value:=result_value||jsonb_build_object('rebate',jsonb_build_object('path',path,'amount',rebate->>'amount','referrerId',rebate->>'referrerId',
   'offsetPaymentId',offset_id,'offsetAmount',trunc(covered)::text,'payable',trunc((rebate->>'amount')::numeric-covered)::text,'offsetPlan',offset_plan,
   'materialize',CASE WHEN offset_id IS NULL THEN '[]'::jsonb ELSE forward->'materialize' END,'paidThrough',CASE WHEN offset_id IS NULL THEN '{}'::jsonb ELSE forward->'paidThrough' END,
   -- R129: the part not offset is pending payment; owedTotal is the referrer's pending total after this close.
   'pending',trunc((rebate->>'amount')::numeric-covered)::text,'owedTotal',trunc(owed+(rebate->>'amount')::numeric-covered)::text));
 END IF;
 INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code,result_json)
 VALUES((e->>'requestId')::uuid,2,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',canonical,encode(sha256(convert_to(canonical,'UTF8')),'hex'),'applied',NULL,NULL,result_value);
 -- R111: the referral trigger must fire after the closing payment is Posted, so it is deferred here even when the caller
 -- made constraints immediate, and fired below.
 IF rebate IS NOT NULL THEN
  PERFORM set_config('pwa.rebate_offset',payment,true);
  SET CONSTRAINTS public.referral_loan_closed DEFERRED;
 END IF;
 INSERT INTO public."Payments"("Row ID","Ref Borrower","Payment Date","Amount Received","Payment Method","Allocation Method","Ref Target Charge","Ref Target Loan","Ref Received By Cash Account","Notes","Uploaded Receipt","Created By","Status","Bank Reference","Created At")
 VALUES(payment,parent,day,(calculation->>'amount')::numeric::money,i->>'paymentMethod','Loan Close',calculation->>'targetChargeId',target,i->>'cashAccountId',i->>'notes',e#>>'{receipt,storageReference}',a->>'loginEmail','Processing',
  -- R128: the slip's reference and transfer time on the business day (the receipt evidence link verifies both).
  i->>'bankReference',CASE WHEN i ? 'transferTime' THEN ((i->>'paymentDate')||' '||(i->>'transferTime')||':00')::timestamp END);
 SELECT * INTO actual FROM public."Payments" WHERE "Row ID"=payment;
 IF NOT FOUND OR actual."Status" IS DISTINCT FROM 'Posted' OR actual."Amount Received"::numeric IS DISTINCT FROM (calculation->>'amount')::numeric THEN RAISE EXCEPTION 'Close receipt differs from immutable plan';END IF;
 -- R111: run the deferred referral trigger now (its own function; nothing disabled), so the rebate and any offset are made
 -- and verified inside this command; at commit it finds the rebate and returns.
 IF rebate IS NOT NULL THEN
  BEGIN
   SET CONSTRAINTS public.referral_loan_closed IMMEDIATE;
  EXCEPTION WHEN SQLSTATE 'P4C05' THEN PERFORM set_config('pwa.rebate_offset','',true);RAISE EXCEPTION USING ERRCODE='P5B09';
  END;
  SET CONSTRAINTS public.referral_loan_closed DEFERRED;
  PERFORM set_config('pwa.rebate_offset','',true);
  SELECT * INTO expense FROM public."Business Expenses" WHERE "Source Key"='REFERRAL_REBATE:'||target;
  IF NOT FOUND OR expense."Amount"::numeric IS DISTINCT FROM (rebate->>'amount')::numeric OR expense."Ref Offset Payment" IS DISTINCT FROM offset_id
   OR (offset_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"=offset_id AND "Status"='Posted' AND "Amount Received"::numeric=covered)) THEN
   RAISE EXCEPTION 'Referral rebate differs from immutable plan';
  END IF;
 END IF;
 RETURN result_value;
END $_$;


--
-- Name: pwa_apply_loan_create_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_apply_loan_create_v2(canonical text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE e jsonb:=canonical::jsonb;i jsonb:=e#>'{command,inputs}';a jsonb:=e->'actor';target text:=e#>>'{command,targetId}';
 l public."Loans"%ROWTYPE;component record;message text; /* R136 V139 */payment text;charge text;plan jsonb;result_value jsonb;actual public."Payments"%ROWTYPE;
BEGIN
 IF (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END) OR e#>>'{command,operation}'<>'loan.create' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Governed operation required';END IF;
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=i->>'borrowerId' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('loan',target));
 IF EXISTS(SELECT 1 FROM public."Loans" WHERE "Row ID"=target) THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Cash Accounts" ca JOIN public."Cash Holders" ch ON ch."Row ID"=ca."Ref Cash Holder" WHERE ca."Row ID"=i->>'disbursingAccountId' AND ca."Active" IS TRUE AND ch."Active" IS TRUE AND ch."Row ID"='ch:lisa') THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
 l:=jsonb_populate_record(NULL::public."Loans",jsonb_build_object('Row ID',target,'Ref Borrowers',i->'borrowerId','Loan Date',i->'loanDate','Principal Amount',i->'principal','Transfer Fee',i->'transferFee','Ref Disbursed From Cash Account',i->'disbursingAccountId','Loan Type',i->'type','Due Date',i->'dueDate','Daily Payment Amount',i->'dailyPayment','Fixed Interest',i->'fixedInterest','Current Daily Interest',i->'currentDailyInterest','Interest Payment Interval',i->'paymentInterval','Loan Arrangement',i->'arrangement','Auto Charge Enabled',i->'autoChargeEnabled','Created By',a->'loginEmail','Loan Status','ยังไม่ปิดยอด','Defaulted',false));
 l."Interest Schedule Anchor Date":=(i->>'scheduleAnchor')::date;
 IF l."Interest Schedule Anchor Date"<l."Loan Date" THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
 SELECT * INTO component FROM public.first_day_components_v83(l);
 IF FOUND AND component.principal+component.interest>0 THEN
  IF component.principal<>trunc(component.principal) OR component.interest<>trunc(component.interest) THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
  charge:='fd6:'||target;payment:='fd6:'||charge;
  plan:=jsonb_build_object('borrowerId',l."Ref Borrowers",'amountReceived',(component.principal+component.interest)::bigint::text,
   'allocations',jsonb_build_array(jsonb_build_object('chargeId',charge,'principal',component.principal::bigint::text,'interest',component.interest::bigint::text,'expectedPrincipalRemaining',component.principal::bigint::text,'expectedInterestRemaining',component.interest::bigint::text,'chargeDate',l."Loan Date"::text)),
   'allocationMethod','First-day Auto','targetChargeId',charge,'targetLoanId',NULL,'cashAccountId',coalesce(l."Ref Disbursed From Cash Account",public.default_cash_account('ch:lisa')),'paymentDate',l."Loan Date"::text,'paymentMethod','Net-off at Disbursement');
 END IF;
 result_value:=jsonb_build_object('operation','loan.create','targetType','loan','targetId',target,'paymentId',payment,'plan',plan,'predecessorRequestId',NULL,'sourceCreatedBy',CASE WHEN payment IS NOT NULL THEN l."Created By" ELSE NULL END);
 -- This row and every triggered effect share the caller's savepoint and outer transaction.
 INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code,result_json)
 VALUES((e->>'requestId')::uuid,2,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',canonical,encode(sha256(convert_to(canonical,'UTF8')),'hex'),'applied',NULL,NULL,result_value);
 -- R136 V139: the V17 cash pool guard is a refusal (P5B10, recorded as insufficient_funds), not a failed request.
 BEGIN
 INSERT INTO public."Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Transfer Fee","Ref Disbursed From Cash Account","Loan Type","Due Date","Daily Payment Amount","Fixed Interest","Current Daily Interest","Interest Payment Interval","Loan Arrangement","Auto Charge Enabled","Created By","Loan Status","Defaulted","Interest Schedule Anchor Date")
 VALUES(l."Row ID",l."Ref Borrowers",l."Loan Date",l."Principal Amount",l."Transfer Fee",l."Ref Disbursed From Cash Account",l."Loan Type",l."Due Date",l."Daily Payment Amount",l."Fixed Interest",l."Current Daily Interest",l."Interest Payment Interval",l."Loan Arrangement",l."Auto Charge Enabled",l."Created By",l."Loan Status",false,l."Interest Schedule Anchor Date");
 EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  IF message LIKE 'New loan exceeds available cashpool%' THEN RAISE EXCEPTION USING ERRCODE='P5B10';ELSE RAISE;END IF;
 END;
 IF payment IS NOT NULL THEN
  SELECT * INTO actual FROM public."Payments" WHERE "Row ID"=payment;
  IF NOT FOUND OR actual."Status" IS DISTINCT FROM 'Posted' OR actual."Amount Received"::numeric IS DISTINCT FROM component.principal+component.interest
   OR (SELECT count(*) FROM public."Payment Allocations" WHERE "Ref Payment"=payment)<>1
   OR NOT EXISTS(SELECT 1 FROM public."Payment Allocations" WHERE "Ref Payment"=payment AND "Ref Charge"=charge AND "Allocated Principal"::numeric=component.principal AND "Allocated Interest"::numeric=component.interest) THEN RAISE EXCEPTION 'First-day effect does not match immutable operation plan';END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"='fd6:fd6:'||target) THEN RAISE EXCEPTION 'Unexpected first-day receipt';END IF;
 END IF;
 RETURN result_value;
END $$;


--
-- Name: pwa_apply_loan_rollover_v1(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_apply_loan_rollover_v1(canonical text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE e jsonb:=canonical::jsonb;i jsonb:=e#>'{command,inputs}';a jsonb:=e->'actor';target text:=e#>>'{command,targetId}';source text:=i->>'sourceLoanId';
 today date:=(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date;day date;parent text;o public."Loans"%ROWTYPE;quote jsonb;l public."Loans"%ROWTYPE;component record;
 first_payment text;first_charge text;first_plan jsonb;first_total numeric:=0;settle_payment text:='pwa:'||(e->>'requestId');settle_plan jsonb;result_value jsonb;statement jsonb;
 actual public."Payments"%ROWTYPE;f jsonb;ids text;cash numeric;profit numeric;settlement numeric;new_key text;old_key text;note text;message text;fee numeric;booked text;
BEGIN
 IF (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END) OR e#>>'{command,operation}'<>'loan.rollover' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Governed operation required';END IF;
 day:=(i->>'loanDate')::date;
 SELECT "Ref Borrowers" INTO parent FROM public."Loans" WHERE "Row ID"=source;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 IF parent IS DISTINCT FROM i->>'borrowerId' THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 -- Locks: the borrower, the new loan's key, the original loan and its charges (the Loan Close order).
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=parent FOR UPDATE;
 PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('loan',target));
 SELECT * INTO o FROM public."Loans" WHERE "Row ID"=source FOR UPDATE;
 IF o."Ref Borrowers" IS DISTINCT FROM parent THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 PERFORM 1 FROM public."Charges" WHERE "Ref Loans"=source ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public."Loans" WHERE "Row ID"=target) THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 -- D7: the rollover day is today or yesterday (the payment-date rule).
 IF day IS NULL OR day NOT IN (today,today-1) THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
 IF public.pwa_loan_version_v2(source) IS DISTINCT FROM i->>'sourceExpectedVersion' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 quote:=public.loan_rollover_calculation_v1(source,day,(i->>'penalty')::numeric);
 IF quote IS NULL OR (quote->>'eligible')::boolean IS NOT TRUE THEN RAISE EXCEPTION USING ERRCODE='P5B12';END IF;
 IF quote->>'planHash' IS DISTINCT FROM i->>'expectedPlanHash' OR quote->>'settlement' IS DISTINCT FROM i->>'expectedSettlement' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 settlement:=(quote->>'settlement')::numeric;
 -- N: the loan.create inputs, of O's type, with automatic charges (its first-day net-off), disbursed by Lisa.
 IF i->>'type' IS DISTINCT FROM o."Loan Type" THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 IF (i->'autoChargeEnabled') IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Cash Accounts" ca JOIN public."Cash Holders" ch ON ch."Row ID"=ca."Ref Cash Holder" WHERE ca."Row ID"=i->>'disbursingAccountId' AND ca."Active" IS TRUE AND ch."Active" IS TRUE AND ch."Row ID"='ch:lisa') THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
 l:=jsonb_populate_record(NULL::public."Loans",jsonb_build_object('Row ID',target,'Ref Borrowers',i->'borrowerId','Loan Date',i->'loanDate','Principal Amount',i->'principal','Transfer Fee',i->'transferFee','Ref Disbursed From Cash Account',i->'disbursingAccountId','Loan Type',i->'type','Due Date',i->'dueDate','Daily Payment Amount',i->'dailyPayment','Fixed Interest',i->'fixedInterest','Current Daily Interest',i->'currentDailyInterest','Interest Payment Interval',i->'paymentInterval','Loan Arrangement',i->'arrangement','Auto Charge Enabled',i->'autoChargeEnabled','Created By',a->'loginEmail','Loan Status','ยังไม่ปิดยอด','Defaulted',false,'Ref Rollover Source Loan',source));
 BEGIN SELECT * INTO component FROM public.first_day_components_v83(l);
 EXCEPTION WHEN SQLSTATE 'P0001' THEN RAISE EXCEPTION USING ERRCODE='P5B06';
 END;
 IF NOT FOUND OR component.principal+component.interest<=0 OR component.principal<>trunc(component.principal) OR component.interest<>trunc(component.interest) THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 first_charge:='fd6:'||target;first_payment:='fd6:'||first_charge;first_total:=component.principal+component.interest;fee:=coalesce(l."Transfer Fee"::numeric,0);
 first_plan:=jsonb_build_object('borrowerId',parent,'amountReceived',first_total::bigint::text,
  'allocations',jsonb_build_array(jsonb_build_object('chargeId',first_charge,'principal',component.principal::bigint::text,'interest',component.interest::bigint::text,'expectedPrincipalRemaining',component.principal::bigint::text,'expectedInterestRemaining',component.interest::bigint::text,'chargeDate',l."Loan Date"::text)),
  'allocationMethod','First-day Auto','targetChargeId',first_charge,'targetLoanId',NULL,'cashAccountId',l."Ref Disbursed From Cash Account",'paymentDate',l."Loan Date"::text,'paymentMethod','Net-off at Disbursement');
 settle_plan:=jsonb_build_object('borrowerId',parent,'amountReceived',trim_scale(settlement)::text,'allocations',quote->'allocations','allocationMethod','Selected Charges','targetChargeId',NULL,'targetLoanId',NULL,
  'cashAccountId',l."Ref Disbursed From Cash Account",'paymentDate',day::text,'paymentMethod','Net-off at Disbursement');
 -- D6: cash issued to the borrower = principal - (first-day payment + fee) - settlement, never negative (zero allowed).
 cash:=l."Principal Amount"::numeric-first_total-settlement;
 IF cash<0 THEN RAISE EXCEPTION USING ERRCODE='P5B12';END IF;
 SELECT coalesce(sum((x->>'interest')::numeric+coalesce(x->>'lateCharge','0')::numeric),0) INTO profit FROM jsonb_array_elements(quote->'allocations') x;
 profit:=profit+component.interest;
 statement:=jsonb_build_object('businessDate',day::text,'type',o."Loan Type",'principal',trim_scale(l."Principal Amount"::numeric)::text,'documentationFee',trim_scale(fee)::text,
  'firstDayPayment',trim_scale(first_total-fee)::text,'firstDayTotal',trim_scale(first_total)::text,'available',trim_scale(l."Principal Amount"::numeric-first_total)::text,
  'settlement',quote->'settlement','cashIssued',trim_scale(cash)::text,'profit',trim_scale(profit)::text,'quote',quote-'allocations'-'sourceVersion');
 -- The keys the app shows for a loan (create_referral_rebate's form): borrower - English name-฿principal-DD/MM-rate%.
 SELECT coalesce(b."Borrower Name",'')||' - '||coalesce(b."Description",'') INTO old_key FROM public."Borrowers" b WHERE b."Row ID"=parent;
 new_key:=old_key||'-'||coalesce('฿'||to_char(round(l."Principal Amount"::numeric),'FM999,999,999,999,990'),'')||'-'||coalesce(to_char(l."Loan Date",'DD/MM'),'')||'-'||coalesce(public.original_daily_interest_rate(l,false)::text||'%','Unavailable');
 old_key:=old_key||'-'||coalesce('฿'||to_char(round(o."Principal Amount"::numeric),'FM999,999,999,999,990'),'')||'-'||coalesce(to_char(o."Loan Date",'DD/MM'),'')||'-'||coalesce(o."Original Daily Interest Rate"::text||'%','Unavailable');
 result_value:=jsonb_build_object('operation','loan.rollover','targetType','loan','targetId',target,'paymentId',first_payment,'plan',first_plan,'predecessorRequestId',NULL,'sourceCreatedBy',a->>'loginEmail',
  'settlement',jsonb_build_object('paymentId',settle_payment,'plan',settle_plan),
  'rollover',jsonb_build_object('closedLoanId',source,'newLoanId',target,'settlementPaymentId',settle_payment,'firstDayPaymentId',first_payment,'statement',statement));
 -- This row and every triggered effect share the caller's savepoint and outer transaction; both receipts resolve their plans
 -- from it (pwa_effective_payment_plan_v2).
 INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code,result_json)
 VALUES((e->>'requestId')::uuid,2,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',canonical,encode(sha256(convert_to(canonical,'UTF8')),'hex'),'applied',NULL,NULL,result_value);
 -- O's closing: the R101 lowering of a daily-interest charge dated after D (the V113 trail line, so a later Loan Close of a
 -- reopened loan reads it as settled), then the closing charge.
 FOR f IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(quote->'futureInterest')='array' THEN quote->'futureInterest' ELSE '[]'::jsonb END) LOOP
  UPDATE public."Charges" SET "Interest Due"=(f->>'interestDue')::numeric::money,
   "Notes"=coalesce(nullif("Notes",'')||E'\n','')||'Interest Due lowered from '||trim_scale("Interest Due"::numeric)::text||' by Loan Close '||day::text||E'\n'||'Rollover to loan '||new_key
   WHERE "Row ID"=f->>'chargeId' AND "Ref Loans"=source AND "Charge Date">day AND "Interest Due"::numeric>(f->>'interestDue')::numeric;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rollover plan future charge differs from the loan';END IF;
 END LOOP;
 IF quote->'closingCharge' IS NOT NULL AND quote->'closingCharge'<>'null'::jsonb THEN
  note:='Rollover to loan '||new_key||': '||CASE WHEN o."Loan Type"='ผ่อนชำระรายวัน'
    THEN (quote->>'unchargedDays')||' days not yet charged x ฿'||(quote->>'dailyAmount')||' = '||trim_scale((quote->>'unchargedDays')::numeric*(quote->>'dailyAmount')::numeric)::text||' (principal '||(quote->>'missingPrincipal')||', interest '||(quote->>'remainingInterest')||')'
    ELSE 'outstanding principal '||(quote->>'missingPrincipal')||', interest '||(quote->>'gapDays')||' days x ฿'||(quote->>'dailyAmount')||' = '||(quote->>'gapInterest') END
   ||', early closure penalty ฿'||(quote->>'penalty');
  INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes")
   VALUES(quote#>>'{closingCharge,chargeId}',source,day,(quote#>>'{closingCharge,principal}')::numeric::money,(quote#>>'{closingCharge,interest}')::numeric::money,note);
 END IF;
 -- O's settlement: the explicit plan (Selected Charges, no target loan, so never the Loan Close calculation); the ordinary
 -- payment engine closes O with it. The referral trigger is fired inside this command once the payment is Posted.
 SELECT string_agg(value->>'chargeId',' , ' ORDER BY (value->>'chargeId') COLLATE "C") INTO ids FROM jsonb_array_elements(quote->'allocations');
 SET CONSTRAINTS public.referral_loan_closed DEFERRED;
 INSERT INTO public."Payments"("Row ID","Ref Borrower","Payment Date","Amount Received","Payment Method","Allocation Method","Selected Charge IDs","Ref Target Charge","Ref Target Loan","Ref Received By Cash Account","Notes","Created By","Status")
 VALUES(settle_payment,parent,day,settlement::money,'Net-off at Disbursement','Selected Charges',ids,NULL,NULL,l."Ref Disbursed From Cash Account",'Rollover to loan '||new_key,a->>'loginEmail','Processing');
 SELECT * INTO actual FROM public."Payments" WHERE "Row ID"=settle_payment;
 IF NOT FOUND OR actual."Status" IS DISTINCT FROM 'Posted' OR actual."Amount Received"::numeric IS DISTINCT FROM settlement
  OR NOT EXISTS(SELECT 1 FROM public."Loans" WHERE "Row ID"=source AND "Loan Status"='ปิดยอดแล้ว' AND "Ref Closing Payment"=settle_payment) THEN RAISE EXCEPTION 'Rollover settlement differs from immutable plan';END IF;
 SET CONSTRAINTS public.referral_loan_closed IMMEDIATE;
 SET CONSTRAINTS public.referral_loan_closed DEFERRED;
 -- N (the loan.create body plus the link): its first-day charge and net-off follow from the insert.
 BEGIN
  INSERT INTO public."Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Transfer Fee","Ref Disbursed From Cash Account","Loan Type","Due Date","Daily Payment Amount","Fixed Interest","Current Daily Interest","Interest Payment Interval","Loan Arrangement","Auto Charge Enabled","Created By","Loan Status","Defaulted","Interest Schedule Anchor Date","Ref Rollover Source Loan")
  VALUES(l."Row ID",l."Ref Borrowers",l."Loan Date",l."Principal Amount",l."Transfer Fee",l."Ref Disbursed From Cash Account",l."Loan Type",l."Due Date",l."Daily Payment Amount",l."Fixed Interest",l."Current Daily Interest",l."Interest Payment Interval",l."Loan Arrangement",l."Auto Charge Enabled",l."Created By",l."Loan Status",false,NULL,source);
 EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  IF message LIKE 'New loan exceeds available cashpool%' THEN RAISE EXCEPTION USING ERRCODE='P5B10';ELSE RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 WHEN SQLSTATE 'P0001' THEN RAISE EXCEPTION USING ERRCODE='P5B06';
 END;
 SELECT * INTO actual FROM public."Payments" WHERE "Row ID"=first_payment;
 IF NOT FOUND OR actual."Status" IS DISTINCT FROM 'Posted' OR actual."Amount Received"::numeric IS DISTINCT FROM first_total
  OR (SELECT count(*) FROM public."Payment Allocations" WHERE "Ref Payment"=first_payment)<>1
  OR NOT EXISTS(SELECT 1 FROM public."Payment Allocations" WHERE "Ref Payment"=first_payment AND "Ref Charge"=first_charge AND "Allocated Principal"::numeric=component.principal AND "Allocated Interest"::numeric=component.interest) THEN RAISE EXCEPTION 'First-day effect does not match immutable operation plan';END IF;
 -- D7: the daily charge job of today has run and never backfills; N's charge for today is generated now when its schedule
 -- calls for one.
 IF day<today THEN
  BEGIN booked:=public.generate_loan_charge(target,today);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN RAISE EXCEPTION USING ERRCODE='P5B06';
  END;
 END IF;
 RETURN result_value;
END $$;


--
-- Name: FUNCTION pwa_apply_loan_rollover_v1(canonical text); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_apply_loan_rollover_v1(canonical text) IS 'mw-access:governance R136 loan.rollover for pwa_submit_operation_v2: closes the original loan with a net-off settlement and creates the new loan in one transaction; journal owner only.';


--
-- Name: pwa_apply_loan_source_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_apply_loan_source_v2(canonical text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE e jsonb:=canonical::jsonb;i jsonb:=e#>'{command,inputs}';a jsonb:=e->'actor';target text:=e#>>'{command,targetId}';op text:=e#>>'{command,operation}';
 parent text;l public."Loans"%ROWTYPE;message text;booked text;
BEGIN
 IF (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END) OR op NOT IN('loan.update','loan.delete','loan.default','loan.undo-default','loan.generate-charge','loan.book-projected-charge') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Governed operation required';END IF;
 SELECT "Ref Borrowers" INTO parent FROM public."Loans" WHERE "Row ID"=target;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=parent OR (op='loan.update' AND "Row ID"=i->>'borrowerId') ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
 IF op='loan.update' AND NOT EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID"=i->>'borrowerId') THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 SELECT * INTO l FROM public."Loans" WHERE "Row ID"=target FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 IF l."Ref Borrowers" IS DISTINCT FROM parent THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 PERFORM 1 FROM public."Charges" WHERE "Ref Loans"=target ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
 IF public.pwa_loan_version_v2(target) IS DISTINCT FROM e#>>'{command,expectedVersion}' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF op IN('loan.default','loan.generate-charge') AND (i->>'businessDate')::date IS DISTINCT FROM (statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
 -- R104: a projected charge is booked only for a date after today (Bangkok).
 IF op='loan.book-projected-charge' AND (i->>'chargeDate')::date<=(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;

 BEGIN
 CASE op
 WHEN 'loan.delete' THEN DELETE FROM public."Loans" WHERE "Row ID"=target;
 WHEN 'loan.default' THEN
  -- R109 (V120): the request carries the loss amount and keep-charges choice to default_loan_transition (no new column).
  -- The one-key form (no amount) is the ordinary write off and close of the whole outstanding principal, as before.
  IF i ? 'amount' THEN PERFORM set_config('business_crud.default_request',jsonb_build_object('loan',target,'op','post','date',i->>'businessDate','amount',i->>'amount','keepCharges',i->'keepCharges','actor',a->>'loginEmail')::text,true);END IF;
  IF (i->'keepCharges')='true'::jsonb THEN UPDATE public."Loans" SET "Default Loss Amount"=(coalesce("Default Loss Amount"::numeric,0)+(i->>'amount')::numeric)::money WHERE "Row ID"=target;
  ELSE UPDATE public."Loans" SET "Defaulted"=true,"Close Date"=(i->>'businessDate')::date,"Closed By"=a->>'loginEmail' WHERE "Row ID"=target;END IF;
  PERFORM set_config('business_crud.default_request','',true);
 WHEN 'loan.undo-default' THEN
  PERFORM set_config('business_crud.default_request',jsonb_build_object('loan',target,'op','undo','actor',a->>'loginEmail')::text,true);
  UPDATE public."Loans" SET "Defaulted"=false WHERE "Row ID"=target;
  PERFORM set_config('business_crud.default_request','',true);
 WHEN 'loan.generate-charge' THEN UPDATE public."Loans" SET "Charge Generation Request"=(i->>'businessDate')||'|'||(e->>'requestId') WHERE "Row ID"=target;
 WHEN 'loan.book-projected-charge' THEN
  -- R104: still this loan's next projected charge (V112 read, same day) with the reviewed date and amounts.
  IF NOT EXISTS(SELECT 1 FROM public.pwa_next_bookable_charge_v1(parent,(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date) p
    WHERE p.loan_id=target AND p.charge_date=(i->>'chargeDate')::date AND p.principal_due=(i->>'principalDue')::numeric AND p.interest_due=(i->>'interestDue')::numeric) THEN RAISE EXCEPTION USING ERRCODE='P5B11';END IF;
  BEGIN
   booked:=public.generate_loan_charge(target,(i->>'chargeDate')::date);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN RAISE EXCEPTION USING ERRCODE='P5B11';
  END;
  IF booked IS DISTINCT FROM 'cg8:'||length(target)||':'||target||':'||(i->>'chargeDate') OR NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Row ID"=booked AND "Ref Loans"=target AND "Charge Date"=(i->>'chargeDate')::date
    AND "Principal Due"::numeric=(i->>'principalDue')::numeric AND "Interest Due"::numeric=(i->>'interestDue')::numeric) THEN RAISE EXCEPTION USING ERRCODE='P5B11';END IF;
 WHEN 'loan.update' THEN
 IF i ? 'scheduleAnchor' AND (i->>'scheduleAnchor')::date<(i->>'loanDate')::date THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
 UPDATE public."Loans" SET "Ref Borrowers"=i->>'borrowerId',"Loan Date"=(i->>'loanDate')::date,"Principal Amount"=(i->>'principal')::numeric::money,"Transfer Fee"=(i->>'transferFee')::numeric::money,"Ref Disbursed From Cash Account"=i->>'disbursingAccountId',"Loan Type"=i->>'type',"Due Date"=(i->>'dueDate')::date,"Daily Payment Amount"=(i->>'dailyPayment')::numeric::money,"Fixed Interest"=(i->>'fixedInterest')::numeric::money,"Current Daily Interest"=(i->>'currentDailyInterest')::numeric::money,"Interest Payment Interval"=(i->>'paymentInterval')::integer,"Interest Schedule Anchor Date"=CASE WHEN i ? 'scheduleAnchor' THEN (i->>'scheduleAnchor')::date ELSE l."Interest Schedule Anchor Date" END,"Loan Arrangement"=i->>'arrangement',"Auto Charge Enabled"=(i->>'autoChargeEnabled')::boolean WHERE "Row ID"=target;
 END CASE;
 EXCEPTION
 WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B05';
 WHEN SQLSTATE 'P0001' THEN
  GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  IF message=ANY(ARRAY['Undo Default before deleting this loan','Loan has receipts; delete or reassign those receipts first','Loan has receipts for its original borrower; reassign them first','Related expense borrower must be corrected before moving this loan']) THEN RAISE EXCEPTION USING ERRCODE='P5B05';END IF;
  IF message=ANY(ARRAY[
   'Loan principal must cover its posted principal and recorded principal charges','Undo default before changing loan inputs','Original daily interest rate unavailable; review original loan terms before principal repayment','Original daily interest rate unavailable; review original loan terms before daily conversion','Automatic daily conversion requires a loan date and positive interest payment interval',
   'Default requires an open auto-enabled nondefaulted loan','Resolve processing or error payments before default','Default requires outstanding principal','Charge components require reconciliation before default','A paid charge today prevents Default Loan',
   'Default loss posting no longer matches; reconcile its components before undo','Default charge has no original component evidence; reconcile before undo','Default charge evidence is malformed; reconcile before undo','Default charge changed since write-off; reconcile before undo',
   'Default loss amount must be a whole baht amount between 1 and the outstanding principal','Partial default loss must keep unpaid charges','One default loss posting per loan per day','Default loss amount changes only through Default Loan or Undo Default',
   'Undo Default requires a recorded default loss','Undo Default requires an open or Defaulted loan','Default request does not match this loan','Keeping unpaid charges requires a daily-interest loan','A full default loss with no unpaid charge must write off and close'
  ]) THEN RAISE EXCEPTION USING ERRCODE='P5B06';ELSE RAISE;END IF;
 END;
 RETURN jsonb_build_object('operation',op,'targetType','loan','targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy',NULL);
END $$;


--
-- Name: pwa_apply_management_financial_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_apply_management_financial_v2(payload text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE e jsonb:=payload::jsonb;c jsonb:=e->'command';i jsonb:=c->'inputs';op text:=c->>'operation';kind text:=split_part(op,'.',1);action text:=split_part(op,'.',2);target text:=c->>'targetId';snapshot jsonb;version text;available numeric;account_id text;from_holder text;to_holder text;day date:=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date;message text;wd_day date;wd_ts timestamp;wd_line jsonb;wd_n bigint;wd_id text;wd_account text;
BEGIN
 IF (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END) THEN RAISE EXCEPTION USING ERRCODE='42501';END IF;
 PERFORM public.pwa_management_financial_text_v2(op,i);
 IF kind IN('capital-contribution','settlement') AND NOT pg_try_advisory_xact_lock(9152026,15) THEN RAISE EXCEPTION 'Partner allocation is busy; sync and retry';END IF;
 PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('management:'||kind,target));
 IF kind='capital-contribution' THEN SELECT to_jsonb(s) INTO snapshot FROM public."Cash Pool Contributions" s WHERE "Row ID"=target FOR UPDATE;
 ELSIF kind='settlement' THEN SELECT to_jsonb(s) INTO snapshot FROM public."Settlements" s WHERE "Row ID"=target FOR UPDATE;
 ELSE SELECT to_jsonb(s) INTO snapshot FROM public."Cash Ledger" s WHERE "Row ID"=target FOR UPDATE;END IF;
 version:=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex');
 IF action IN('create','settle-all') THEN IF snapshot IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 ELSE IF snapshot IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;IF version IS DISTINCT FROM c->>'expectedVersion' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;END IF;
 IF kind='settlement' AND ((action='complete' AND snapshot->>'Status' IS DISTINCT FROM 'Pending') OR (action='reverse' AND snapshot->>'Status' IS DISTINCT FROM 'Completed') OR (action='cancel' AND coalesce(snapshot->>'Status','') NOT IN('Pending','Completed'))) THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF kind='settlement' AND ((action IN('create','update') AND i->>'status'='Cancelled') OR (action='update' AND snapshot->>'Status'='Cancelled')) THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF kind='cash-movement' AND snapshot IS NOT NULL AND (snapshot->>'Entry Origin'<>'Manual' OR snapshot->>'Movement Type' NOT IN('Cash Handover','Expense Reimbursement')) THEN RAISE EXCEPTION USING ERRCODE='P5B05';END IF;
 IF kind='cash-withdrawal' THEN
  -- R115 (V127): Daily cash withdrawal, one Manual Cash Handover per line from a Dad account into a Dad account, all or none.
  wd_day:=(i->>'movementDate')::date;wd_ts:=wd_day+(i->>'movementTime')::time;
  IF wd_ts>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok') OR wd_day<day-14 THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
  FOR wd_account IN SELECT a FROM (SELECT i->>'toAccountId' a UNION ALL SELECT l->>'fromAccountId' FROM jsonb_array_elements(i->'lines') l) x GROUP BY a ORDER BY a COLLATE "C" LOOP
   IF NOT EXISTS(SELECT 1 FROM public."Cash Accounts" a JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE a."Row ID"=wd_account AND a."Active" AND h."Active" AND h."Row ID"='ch:dad') THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
   PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('cash-withdrawal-account',wd_account));
  END LOOP;
  IF EXISTS(SELECT 1 FROM public."Cash Ledger" WHERE "Row ID" LIKE 'wd115:'||target||':%') THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
  FOR wd_line IN SELECT l FROM jsonb_array_elements(i->'lines') l LOOP
   SELECT d."Opening Balance"+coalesce((SELECT sum(s."Signed Amount") FROM public."Cash Account Statement Recent" s
     WHERE s."Ref Cash Account"=d."Ref Cash Account" AND s."Statement Date"=d."Statement Date" AND s."Sort Timestamp"<=wd_ts),0)
    INTO available FROM public."Cash Account Daily Summary Recent" d WHERE d."Ref Cash Account"=wd_line->>'fromAccountId' AND d."Statement Date"=wd_day;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
   IF available IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
   -- Back-dated: no later balance of the account may go negative (the lowest running balance after the time).
   available:=least(available,(SELECT min(s."Balance After") FROM public."Cash Account Statement Recent" s
     WHERE s."Ref Cash Account"=wd_line->>'fromAccountId' AND (s."Statement Date">wd_day OR (s."Statement Date"=wd_day AND s."Sort Timestamp">wd_ts))));
   IF (wd_line->>'amount')::numeric>available THEN RAISE EXCEPTION USING ERRCODE='P5B10';END IF;
  END LOOP;
  BEGIN
   PERFORM set_config('r115.cash_movement_time','on',true);
   FOR wd_line,wd_n IN SELECT l,n FROM jsonb_array_elements(i->'lines') WITH ORDINALITY x(l,n) LOOP
    wd_id:=CASE WHEN wd_n=1 THEN target ELSE 'wd115:'||target||':'||wd_n END;
    INSERT INTO public."Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder","Ref From Cash Account","Ref To Cash Account","Ref Business Expense","Entry Origin","Source Type","Source Key","Notes","Created By","Created At")
     VALUES(wd_id,wd_day,'Cash Handover',(wd_line->>'amount')::numeric,'ch:dad','ch:dad',wd_line->>'fromAccountId',i->>'toAccountId',NULL,'Manual','Manual','MANUAL:'||wd_id,'Daily cash withdrawal',e#>>'{actor,loginEmail}',wd_ts);
   END LOOP;
   PERFORM set_config('r115.cash_movement_time','',true);
  EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B05';
  WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='P5B01';
  WHEN raise_exception THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
   IF message='Cash movement time must not be in the future' THEN RAISE EXCEPTION USING ERRCODE='P5B08';
   ELSIF message IN('A valid active cash account is required','A cash account is required for this new cash movement') THEN RAISE EXCEPTION USING ERRCODE='P5B07';
   ELSIF message IN('Cash handover requires Dad/Lisa endpoints or two distinct accounts of one holder','Manual transfers require active cash holders','Cash holder and account disagree') THEN RAISE EXCEPTION USING ERRCODE='P5B04';
   ELSE RAISE;END IF;
  END;
  RETURN jsonb_build_object('operation',op,'targetType',kind,'targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy',NULL);
 END IF;
 IF i ? 'partnerId' AND NOT EXISTS(SELECT 1 FROM public."Partners" WHERE "Row ID"=i->>'partnerId') THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF; IF kind='capital-contribution' AND action<>'delete' AND NOT EXISTS(SELECT 1 FROM public."Partners" WHERE "Row ID"=i->>'partnerId' AND "Partner Role" IN ('A','B')) THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF; /* R140 V144: contributions come from Partner A or B only */
 IF kind='capital-contribution' AND action<>'delete' AND i->>'transactionType'='Withdrawal' THEN
 SELECT coalesce(sum(CASE WHEN "Transaction Type"='Contribution' THEN "Amount"::numeric ELSE -"Amount"::numeric END),0) INTO available FROM public."Cash Pool Contributions" WHERE "Ref Partner"=i->>'partnerId' AND "Contribution Date"<=(i->>'contributionDate')::date AND "Row ID"<>target;
 IF (i->>'amount')::numeric>available THEN RAISE EXCEPTION USING ERRCODE='P5B10';END IF;END IF;
 BEGIN
 IF kind='capital-contribution' THEN
 IF action='create' THEN INSERT INTO public."Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount","Notes") VALUES(target,i->>'partnerId',(i->>'contributionDate')::date,i->>'transactionType',(i->>'amount')::numeric::money,i->>'notes');
 ELSIF action='update' THEN UPDATE public."Cash Pool Contributions" SET "Ref Partner"=i->>'partnerId',"Contribution Date"=(i->>'contributionDate')::date,"Transaction Type"=i->>'transactionType',"Amount"=(i->>'amount')::numeric::money,"Notes"=i->>'notes' WHERE "Row ID"=target;
 ELSE DELETE FROM public."Cash Pool Contributions" WHERE "Row ID"=target;END IF;
 ELSIF kind='settlement' THEN
 IF action='settle-all' THEN
 PERFORM public.recalculate_business_expenses_from_date('0001-01-01');
 SELECT public.partner_net_profit(i->>'partnerId')-coalesce(sum("Amount"::numeric),0) INTO available FROM public."Settlements" WHERE "Ref Partner"=i->>'partnerId' AND "Status" IS DISTINCT FROM 'Cancelled';
 IF available IS DISTINCT FROM (i->>'reviewedAmount')::numeric THEN RAISE EXCEPTION USING ERRCODE='P5B09';END IF;
 IF available<=0 THEN RAISE EXCEPTION USING ERRCODE='P5B10';END IF;
 INSERT INTO public."Settlements"("Row ID","Settlement Date","Ref Partner","Amount","Status","Notes") VALUES(target,day,i->>'partnerId',available::money,'Pending',i->>'notes');
 ELSIF action IN('create','update') THEN
 IF i->>'status'='Completed' AND i->>'transferDate' IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
 IF i->>'status'='Completed' AND (i->>'amount')::numeric<>trunc((i->>'amount')::numeric) THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 IF action='create' THEN INSERT INTO public."Settlements"("Row ID","Settlement Date","Ref Partner","Amount","Status","Transfer Date","Notes","Ref Paid From Cash Account") VALUES(target,(i->>'settlementDate')::date,i->>'partnerId',(i->>'amount')::numeric::money,i->>'status',(i->>'transferDate')::date,i->>'notes',i->>'cashAccountId');
 ELSE UPDATE public."Settlements" SET "Settlement Date"=(i->>'settlementDate')::date,"Ref Partner"=i->>'partnerId',"Amount"=(i->>'amount')::numeric::money,"Status"=i->>'status',"Transfer Date"=(i->>'transferDate')::date,"Notes"=i->>'notes',"Ref Paid From Cash Account"=i->>'cashAccountId' WHERE "Row ID"=target;END IF;
 ELSIF action='complete' THEN
 IF (snapshot->>'Amount')::money::numeric<>trunc((snapshot->>'Amount')::money::numeric) THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 account_id:=coalesce(i->>'cashAccountId',snapshot->>'Ref Paid From Cash Account');
 IF NOT EXISTS(SELECT 1 FROM public."Cash Accounts" a JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE a."Row ID"=account_id AND a."Active" AND h."Active" AND h."Row ID"='ch:lisa') THEN
 IF i->>'cashAccountId' IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
 SELECT CASE WHEN count(*)=1 THEN min(a."Row ID") END INTO account_id FROM public."Cash Accounts" a JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE a."Active" AND a."Default Account" AND h."Active" AND h."Row ID"='ch:lisa';
 END IF;
 IF account_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
 PERFORM public.cash_account_holder(account_id,true);
 UPDATE public."Settlements" SET "Status"='Completed',"Transfer Date"=day,"Ref Paid From Cash Account"=account_id WHERE "Row ID"=target;
 ELSIF action='reverse' THEN UPDATE public."Settlements" SET "Status"='Pending',"Transfer Date"=NULL WHERE "Row ID"=target;
 ELSE UPDATE public."Settlements" SET "Status"='Cancelled',"Notes"=concat_ws(E'\n',nullif("Notes",''),'Cancelled by '||(e#>>'{actor,partnerId}')||' at '||(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::text) WHERE "Row ID"=target;END IF;
 ELSE
 IF action='delete' THEN DELETE FROM public."Cash Ledger" WHERE "Row ID"=target;
 ELSE
 from_holder:=public.cash_account_holder(i->>'fromAccountId',true);to_holder:=public.cash_account_holder(i->>'toAccountId',true);
 IF action='create' THEN INSERT INTO public."Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder","Ref From Cash Account","Ref To Cash Account","Ref Business Expense","Entry Origin","Source Type","Source Key","Notes","Created By") VALUES(target,(i->>'movementDate')::date,i->>'movementType',(i->>'amount')::numeric,from_holder,to_holder,i->>'fromAccountId',i->>'toAccountId',i->>'businessExpenseId','Manual','Manual','MANUAL:'||target,i->>'notes',e#>>'{actor,loginEmail}');
 ELSE UPDATE public."Cash Ledger" SET "Movement Date"=(i->>'movementDate')::date,"Movement Type"=i->>'movementType',"Amount"=(i->>'amount')::numeric,"Ref From Cash Holder"=from_holder,"Ref To Cash Holder"=to_holder,"Ref From Cash Account"=i->>'fromAccountId',"Ref To Cash Account"=i->>'toAccountId',"Ref Business Expense"=i->>'businessExpenseId',"Notes"=i->>'notes' WHERE "Row ID"=target;END IF;END IF;
 END IF;
 EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B05';
 WHEN raise_exception THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
 IF message='Settlement exceeds net available to settle' THEN RAISE EXCEPTION USING ERRCODE='P5B10';
 ELSIF message IN('A valid active cash account is required','A cash account is required for this new cash movement') THEN RAISE EXCEPTION USING ERRCODE='P5B07';
 ELSIF message IN('Cash handover requires Dad/Lisa endpoints or two distinct accounts of one holder','Only reimbursement may link a business expense','Expense reimbursement must be Lisa to Tommy','Linked reimbursement expense must have been paid by Tommy','Manual transfers require active cash holders','Cash holder and account disagree') THEN RAISE EXCEPTION USING ERRCODE='P5B04';
 ELSE RAISE;END IF;
 END;
 RETURN jsonb_build_object('operation',op,'targetType',kind,'targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy',NULL);
END $$;


--
-- Name: pwa_apply_management_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_apply_management_v2(payload text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE e jsonb:=payload::jsonb;c jsonb:=e->'command';i jsonb:=c->'inputs';op text:=c->>'operation';kind text:=split_part(op,'.',1);target text:=c->>'targetId';snapshot jsonb;version text;constraint_name text;
BEGIN
 IF (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END) THEN RAISE EXCEPTION USING ERRCODE='42501';END IF;
 PERFORM public.pwa_management_input_text_v2(op,i);
 PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('management:'||kind,target));
 IF kind='cash-holder' THEN SELECT to_jsonb(t) INTO snapshot FROM public."Cash Holders" t WHERE t."Row ID"=target FOR UPDATE;
 ELSIF kind='cash-account' THEN SELECT to_jsonb(t) INTO snapshot FROM public."Cash Accounts" t WHERE t."Row ID"=target FOR UPDATE;
 ELSIF kind='partner' THEN SELECT to_jsonb(t) INTO snapshot FROM public."Partners" t WHERE t."Row ID"=target FOR UPDATE;
 ELSE RAISE EXCEPTION USING ERRCODE='22023';END IF;
 version:=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex');
 IF split_part(op,'.',2)='create' THEN IF snapshot IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 ELSE IF snapshot IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;IF version IS DISTINCT FROM c->>'expectedVersion' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;END IF;
 BEGIN
 IF op='cash-holder.create' THEN INSERT INTO public."Cash Holders"("Row ID","Holder Name","Active","Sort Order") VALUES(target,i->>'holderName',(i->>'active')::boolean,(i->>'sortOrder')::integer);
 ELSIF op='cash-holder.update' THEN UPDATE public."Cash Holders" SET "Holder Name"=i->>'holderName',"Active"=(i->>'active')::boolean,"Sort Order"=(i->>'sortOrder')::integer WHERE "Row ID"=target;
 ELSIF op='cash-holder.delete' THEN DELETE FROM public."Cash Holders" WHERE "Row ID"=target;
 ELSIF op='cash-account.create' THEN INSERT INTO public."Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name","Account Number","Alternative Account Number","Default Account","Active","Sort Order") VALUES(target,i->>'cashHolderId',i->>'accountLabel',i->>'bankName',i->>'accountNumber',i->>'alternativeAccountNumber',(i->>'defaultAccount')::boolean,(i->>'active')::boolean,(i->>'sortOrder')::integer);
 ELSIF op='cash-account.update' THEN UPDATE public."Cash Accounts" SET "Account Label"=i->>'accountLabel',"Bank Name"=i->>'bankName',"Account Number"=i->>'accountNumber',"Alternative Account Number"=i->>'alternativeAccountNumber',"Default Account"=(i->>'defaultAccount')::boolean,"Active"=(i->>'active')::boolean,"Sort Order"=(i->>'sortOrder')::integer WHERE "Row ID"=target;
 ELSIF op='cash-account.delete' THEN DELETE FROM public."Cash Accounts" WHERE "Row ID"=target;
 ELSIF op='partner.create' THEN INSERT INTO public."Partners"("Row ID","Partner Name","Partner Role","Login Email","Email","Instagram Username","Language Preference","IG Integration Enabled","AI Reviewer") VALUES(target,i->>'partnerName',i->>'partnerRole',i->>'loginEmail',i->>'email',i->>'instagramUsername',i->>'languagePreference',(i->>'igIntegrationEnabled')::boolean,(i->>'aiReviewer')::boolean);
 ELSIF op='partner.update' THEN UPDATE public."Partners" SET "Partner Name"=i->>'partnerName',"Partner Role"=i->>'partnerRole',"Login Email"=i->>'loginEmail',"Email"=i->>'email',"Instagram Username"=i->>'instagramUsername',"Language Preference"=i->>'languagePreference',"IG Integration Enabled"=(i->>'igIntegrationEnabled')::boolean,"AI Reviewer"=(i->>'aiReviewer')::boolean WHERE "Row ID"=target;
 ELSIF op='partner.delete' THEN DELETE FROM public."Partners" WHERE "Row ID"=target;
 END IF;
 EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B05';
 WHEN SQLSTATE '23001' THEN GET STACKED DIAGNOSTICS constraint_name=CONSTRAINT_NAME;IF (op='cash-holder.delete' AND constraint_name='Cash Accounts_Ref Cash Holder_fkey') OR (op='cash-account.delete' AND constraint_name IN('Borrowers_Ref Preferred Receiving Cash Account_fkey','Borrowers_Payment Request Cash Account_fkey','Charges_Payment Request Cash Account_fkey','Loans_Ref Disbursed From Cash Account_fkey','Loans_Payment Request Cash Account_fkey','Payments_Ref Received By Cash Account_fkey','Business Expenses_Ref Paid By Cash Account_fkey','Settlements_Ref Paid From Cash Account_fkey','Cash Ledger_Ref From Cash Account_fkey','Cash Ledger_Ref To Cash Account_fkey','r008_cash_account_cutover_Ref Cash Account_fkey')) THEN RAISE EXCEPTION USING ERRCODE='P5B05';ELSE RAISE;END IF;
 WHEN unique_violation THEN GET STACKED DIAGNOSTICS constraint_name=CONSTRAINT_NAME;
 IF constraint_name IN('partners_login_email_unique','Cash Holders_Holder Name_key','Cash Accounts_Ref Cash Holder_Account Label_key','cash_account_one_default') THEN RAISE EXCEPTION USING ERRCODE='P5B05';ELSE RAISE;END IF;
 WHEN raise_exception THEN
 IF SQLERRM IN('Choose a replacement default account before deletion','An inactive cash account cannot be default','Select a replacement default before deactivating this account') THEN RAISE EXCEPTION USING ERRCODE='P5B05';ELSE RAISE;END IF;
 END;
 RETURN jsonb_build_object('operation',op,'targetType',kind,'targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy',NULL);
END $$;


--
-- Name: pwa_apply_pay_forward_v1(jsonb, jsonb, date); Type: FUNCTION
--

CREATE FUNCTION public.pwa_apply_pay_forward_v1(p_principal jsonb, p_materialize jsonb, p_today date) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE entry jsonb; booked text; principal_loans text[];
BEGIN
 -- R111 V123: the booking trusts its plan, so only the governed definer commands (the journal owner) may run it.
 IF (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Governed operation required';END IF;
 IF jsonb_typeof(p_principal) IS DISTINCT FROM 'array' OR jsonb_typeof(p_materialize) IS DISTINCT FROM 'array' OR p_today IS NULL THEN RAISE EXCEPTION USING ERRCODE='P4C05'; END IF;
 SELECT coalesce(array_agg(value->>'loanId'),ARRAY[]::text[]) INTO principal_loans FROM jsonb_array_elements(p_principal) WHERE value->>'kind' IS DISTINCT FROM 'settle';
 FOR entry IN SELECT value FROM jsonb_array_elements(p_principal) LOOP
  -- R113: a settle entry (the manual receiving command only: its transaction-local switch) applies the Loan Close
  -- mutation of the quote the plan priced (same planHash, else P4C05) through the Loan Close writer; anchor untouched.
  IF entry->>'kind'='settle' THEN
   IF current_setting('pwa.pay_forward_settle',true) IS DISTINCT FROM 'on' OR entry->>'planHash' IS NULL THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
   BEGIN
    PERFORM public.apply_loan_close_calculation_v83(entry->>'loanId',p_today,entry->>'planHash');
   EXCEPTION WHEN SQLSTATE 'P5B09' OR SQLSTATE 'P0001' THEN RAISE EXCEPTION USING ERRCODE='P4C05';
   END;
   CONTINUE;
  END IF;
  IF entry->>'kind'='raise' THEN
   -- guard_charge_consistency allows raising a due; the expected old due makes a concurrent change a rejection.
   UPDATE public."Charges" SET "Principal Due"=(entry->>'principalDue')::numeric::money WHERE "Row ID"=entry->>'chargeId' AND "Ref Loans"=entry->>'loanId' AND "Charge Date"=p_today
    AND "Principal Due"::numeric=(entry->>'principalDue')::numeric-(entry->>'amount')::numeric;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
  ELSE
   IF EXISTS(SELECT 1 FROM public."Charges" WHERE "Row ID"=entry->>'chargeId') THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
   INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
    VALUES(entry->>'chargeId',entry->>'loanId',p_today,(entry->>'principalDue')::numeric::money,(entry->>'accruedInterest')::numeric::money);
  END IF;
  -- D9 interval reset: the first later scheduled charge is today plus the interval (a no-op on a schedule day).
  UPDATE public."Loans" SET "Interest Schedule Anchor Date"=p_today WHERE "Row ID"=entry->>'loanId';
 END LOOP;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_materialize) LOOP
  BEGIN
   booked:=public.generate_loan_charge(entry->>'loanId',(entry->>'chargeDate')::date);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN RAISE EXCEPTION USING ERRCODE='P4C05';
  END;
  IF booked IS DISTINCT FROM entry->>'chargeId' THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
  -- Current Daily Interest is recomputed only once the principal repayment posts, so for a loan repaying principal the
  -- generator priced this charge at the old daily amount; its Interest Due becomes the plan's server-recomputed value
  -- (new daily amount x days, never from the client), and the new daily amount is verified after posting.
  IF entry->>'loanId'=ANY(principal_loans) THEN
   UPDATE public."Charges" SET "Interest Due"=(entry->>'interestDue')::numeric::money WHERE "Row ID"=booked AND "Interest Due"::numeric<>(entry->>'interestDue')::numeric;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Row ID"=booked AND "Ref Loans"=entry->>'loanId' AND "Charge Date"=(entry->>'chargeDate')::date
    AND "Principal Due"::numeric=(entry->>'principalDue')::numeric AND "Interest Due"::numeric=(entry->>'interestDue')::numeric) THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
 END LOOP;
END $$;


--
-- Name: FUNCTION pwa_apply_pay_forward_v1(p_principal jsonb, p_materialize jsonb, p_today date); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_apply_pay_forward_v1(p_principal jsonb, p_materialize jsonb, p_today date) IS 'mw-access:governance R111 pay-forward booking of a server-recomputed plan (v10 command and the Loan Close rebate offset); journal owner only, P4C05 on drift.';


--
-- Name: pwa_apply_payment_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_apply_payment_v2(canonical text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE e jsonb:=canonical::jsonb;c jsonb:=e->'command';i jsonb:=c->'inputs';f jsonb:=i->'fields';a jsonb:=e->'actor';target text:=c->>'targetId';op text:=c->>'operation';old public."Payments"%ROWTYPE;desired public."Payments"%ROWTYPE;actual public."Payments"%ROWTYPE;provenance jsonb;head uuid;plan jsonb;result_value jsonb;ids text;explicit_inverse boolean:=false;explicit_finish boolean:=false;message text;borrower text;close_calculation jsonb;enter_close boolean:=false;repost boolean:=false;destination public."Loans"%ROWTYPE;
BEGIN
 IF (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Governed operation required';END IF;
 IF NOT pg_try_advisory_xact_lock(9162026,2) THEN RAISE EXCEPTION 'Cash pool is busy; retry';END IF;
 SELECT * INTO old FROM public."Payments" WHERE "Row ID"=target;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 FOR borrower IN SELECT DISTINCT value COLLATE "C" FROM unnest(ARRAY[old."Ref Borrower",f->>'borrowerId']) value WHERE value IS NOT NULL ORDER BY value COLLATE "C" LOOP PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=borrower FOR UPDATE;END LOOP;
 PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers" IN(old."Ref Borrower",f->>'borrowerId') ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
 PERFORM 1 FROM public."Charges" WHERE "Ref Loans" IN(SELECT "Row ID" FROM public."Loans" WHERE "Ref Borrowers" IN(old."Ref Borrower",f->>'borrowerId')) ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
 SELECT * INTO old FROM public."Payments" WHERE "Row ID"=target FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 IF public.pwa_payment_version_v2(target) IS DISTINCT FROM c->>'expectedVersion' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 head:=public.pwa_payment_head_v2(target);IF head::text IS DISTINCT FROM c->>'predecessorRequestId' THEN RAISE EXCEPTION USING ERRCODE='P5B09';END IF;
 provenance:=public.pwa_effective_payment_plan_v2(target);IF old."Payment Method"='Referral Rebate Offset' THEN RAISE EXCEPTION USING ERRCODE='P5B05';END IF;
 IF op='payment.correct' THEN
 IF (provenance IS NOT NULL) IS DISTINCT FROM (i->>'kind'='pwa-plan') THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 IF (f->>'paymentDate')::date>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID"=f->>'borrowerId') THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Cash Accounts" ca JOIN public."Cash Holders" h ON h."Row ID"=ca."Ref Cash Holder" WHERE ca."Row ID"=f->>'cashAccountId' AND ca."Active" IS TRUE AND h."Active" IS TRUE) THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
 IF provenance IS NOT NULL THEN
 enter_close:=f->>'allocationMethod'='Loan Close' AND (old."Allocation Method" IS DISTINCT FROM 'Loan Close' OR old."Ref Target Loan" IS DISTINCT FROM f->>'targetLoanId');
 IF enter_close THEN
  IF (f->>'paymentDate')::date<>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date OR i->>'closePreparationHash' IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
  SELECT * INTO destination FROM public."Loans" WHERE "Row ID"=f->>'targetLoanId';
  IF NOT FOUND OR destination."Ref Borrowers" IS DISTINCT FROM f->>'borrowerId' OR destination."Defaulted" IS TRUE OR (destination."Loan Status"<>'ยังไม่ปิดยอด' AND destination."Ref Closing Payment" IS DISTINCT FROM target) THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
  BEGIN close_calculation:=public.loan_close_calculation_v83(f->>'targetLoanId',(f->>'paymentDate')::date,target);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;IF message IN('Loan Close requires an open auto-enabled daily-interest loan','Loan Close requires valid loan date, principal and daily interest','Loan charge components require reconciliation before closing','Loan has no outstanding principal to close','Principal already due exceeds outstanding loan principal','Multiple charges today require reconciliation before closing','Final receipt must be a positive whole-baht amount') THEN RAISE EXCEPTION USING ERRCODE='P5B06';ELSE RAISE;END IF;END;
  IF close_calculation->>'planHash' IS DISTINCT FROM i->>'closePreparationHash' OR close_calculation->'allocations' IS DISTINCT FROM f->'allocations' OR close_calculation->>'amount' IS DISTINCT FROM f->>'amountReceived' OR close_calculation->>'targetChargeId' IS DISTINCT FROM f->>'targetChargeId' THEN RAISE EXCEPTION USING ERRCODE='P5B09';END IF;
 ELSE
  IF i->>'closePreparationHash' IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P5B09';END IF;
 IF EXISTS(WITH lines AS(SELECT value line FROM jsonb_array_elements(f->'allocations')),paid AS(SELECT "Ref Charges" id,sum("Principal Paid"::numeric) p,sum("Interest Paid"::numeric) i,sum("Late Charge Paid"::numeric) l FROM public."Repayments" WHERE "Ref Payment" IS DISTINCT FROM target GROUP BY "Ref Charges") SELECT 1 FROM lines LEFT JOIN public."Charges" ch ON ch."Row ID"=line->>'chargeId' LEFT JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans" LEFT JOIN paid ON paid.id=ch."Row ID" WHERE ch."Row ID" IS NULL OR l."Ref Borrowers" IS DISTINCT FROM f->>'borrowerId' OR ch."Charge Date" IS DISTINCT FROM (line->>'chargeDate')::date OR ch."Principal Due"::numeric-coalesce(paid.p,0) IS DISTINCT FROM (line->>'expectedPrincipalRemaining')::numeric OR ch."Interest Due"::numeric-coalesce(paid.i,0) IS DISTINCT FROM (line->>'expectedInterestRemaining')::numeric OR (line->>'principal')::numeric>ch."Principal Due"::numeric-coalesce(paid.p,0) OR (line->>'interest')::numeric>ch."Interest Due"::numeric-coalesce(paid.i,0) /* R118 */ OR (line ? 'expectedLateChargeRemaining' AND ch."Late Charge Due"::numeric-coalesce(paid.l,0) IS DISTINCT FROM (line->>'expectedLateChargeRemaining')::numeric) OR coalesce(line->>'lateCharge','0')::numeric>ch."Late Charge Due"::numeric-coalesce(paid.l,0)) THEN RAISE EXCEPTION USING ERRCODE='P5B09';END IF;
 END IF;
 plan:=jsonb_build_object('borrowerId',f->'borrowerId','amountReceived',f->'amountReceived','allocations',f->'allocations','allocationMethod',f->'allocationMethod','targetChargeId',f->'targetChargeId','targetLoanId',f->'targetLoanId','cashAccountId',f->'cashAccountId','paymentDate',f->'paymentDate','paymentMethod',f->'paymentMethod');
 SELECT string_agg(value->>'chargeId',',' ORDER BY (value->>'chargeId') COLLATE "C") INTO ids FROM jsonb_array_elements(f->'allocations');
 IF f->>'allocationMethod'<>'Selected Charges' THEN ids:=NULL;END IF;
 ELSE SELECT string_agg(value#>>'{}',',' ORDER BY (value#>>'{}') COLLATE "C") INTO ids FROM jsonb_array_elements(CASE WHEN f->'selectedChargeIds'='null'::jsonb THEN '[]'::jsonb ELSE f->'selectedChargeIds' END);END IF;
 desired:=jsonb_populate_record(old,jsonb_build_object('Ref Borrower',f->'borrowerId','Amount Received',f->'amountReceived','Payment Date',f->'paymentDate','Payment Method',f->'paymentMethod','Ref Received By Cash Account',f->'cashAccountId','Notes',f->'notes','Allocation Method',f->'allocationMethod','Ref Target Charge',f->'targetChargeId','Ref Target Loan',f->'targetLoanId','Selected Charge IDs',ids,'Uploaded Receipt',CASE i->>'receiptMode' WHEN 'preserve' THEN old."Uploaded Receipt" WHEN 'replace' THEN e#>>'{receipt,storageReference}' ELSE NULL END));
 repost:=provenance IS NOT NULL AND (public.payment_inputs(desired) IS DISTINCT FROM public.payment_inputs(old) OR public.pwa_plan_effects_v83(provenance#>'{plan,allocations}') IS DISTINCT FROM public.pwa_plan_effects_v83(f->'allocations'));
 IF provenance IS NOT NULL THEN
  IF f->>'allocationMethod'='Selected Charges' AND (f->>'targetChargeId' IS NOT NULL OR f->>'targetLoanId' IS NOT NULL) THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
  IF repost AND f->>'allocationMethod'='First-day Auto' THEN
   SELECT l.* INTO destination FROM public."Charges" ch JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans" WHERE ch."Row ID"=f->>'targetChargeId' AND ch."Charge Date"=l."Loan Date";
   IF NOT FOUND OR destination."Ref Borrowers" IS DISTINCT FROM f->>'borrowerId' OR destination."Loan Type" NOT IN('ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน') OR destination."Auto Charge Enabled" IS NOT TRUE OR destination."Defaulted" IS TRUE OR destination."Loan Date" IS DISTINCT FROM (f->>'paymentDate')::date OR f->>'paymentMethod'<>'Net-off at Disbursement' OR f->>'targetLoanId' IS NOT NULL OR jsonb_array_length(f->'allocations')<>1 OR f#>>'{allocations,0,chargeId}' IS DISTINCT FROM f->>'targetChargeId' OR (f#>>'{allocations,0,principal}')::numeric<>(f#>>'{allocations,0,expectedPrincipalRemaining}')::numeric OR (f#>>'{allocations,0,interest}')::numeric<>(f#>>'{allocations,0,expectedInterestRemaining}')::numeric OR coalesce(f#>>'{allocations,0,lateCharge}','0')<>'0' THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
   IF public.cash_account_holder(f->>'cashAccountId',true)<>'ch:lisa' THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
  ELSIF repost AND f->>'allocationMethod'='Loan Close' AND NOT enter_close THEN
   IF NOT EXISTS(SELECT 1 FROM public."Loans" WHERE "Row ID"=f->>'targetLoanId' AND "Ref Borrowers"=f->>'borrowerId') OR NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Row ID"=f->>'targetChargeId' AND "Ref Loans"=f->>'targetLoanId') THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
   IF EXISTS(WITH paid AS(SELECT "Ref Charges" id,sum("Principal Paid"::numeric) p,sum("Interest Paid"::numeric) i,sum("Late Charge Paid"::numeric) l FROM public."Repayments" WHERE "Ref Payment" IS DISTINCT FROM target GROUP BY "Ref Charges"),lines AS(SELECT value FROM jsonb_array_elements(f->'allocations')) SELECT 1 FROM public."Charges" ch LEFT JOIN paid ON paid.id=ch."Row ID" FULL JOIN lines ON lines.value->>'chargeId'=ch."Row ID" WHERE (ch."Ref Loans"=f->>'targetLoanId' OR lines.value IS NOT NULL) AND (ch."Ref Loans" IS DISTINCT FROM f->>'targetLoanId' OR (ch."Principal Due"::numeric-coalesce(paid.p,0)>0 OR ch."Interest Due"::numeric-coalesce(paid.i,0)>0 OR ch."Late Charge Due"::numeric-coalesce(paid.l,0)>0) AND (lines.value IS NULL OR (lines.value->>'principal')::numeric IS DISTINCT FROM ch."Principal Due"::numeric-coalesce(paid.p,0) OR (lines.value->>'interest')::numeric IS DISTINCT FROM ch."Interest Due"::numeric-coalesce(paid.i,0) OR coalesce(lines.value->>'lateCharge','0')::numeric IS DISTINCT FROM ch."Late Charge Due"::numeric-coalesce(paid.l,0)))) THEN RAISE EXCEPTION USING ERRCODE='P5B09';END IF;
  END IF;
 END IF;
 explicit_inverse:=provenance IS NOT NULL AND public.payment_inputs(desired)=public.payment_inputs(old) AND public.pwa_plan_effects_v83(provenance#>'{plan,allocations}') IS DISTINCT FROM public.pwa_plan_effects_v83(f->'allocations');
 explicit_finish:=explicit_inverse AND desired."Ref Received By Cash Account" IS NOT DISTINCT FROM old."Ref Received By Cash Account";
 END IF;
 result_value:=jsonb_build_object('operation',op,'targetType','payment','targetId',target,'paymentId',CASE WHEN op='payment.correct' THEN target ELSE NULL END,'plan',plan,'predecessorRequestId',head,'sourceCreatedBy',CASE WHEN op='payment.correct' THEN old."Created By" ELSE NULL END);
 INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code,result_json) VALUES((e->>'requestId')::uuid,2,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',canonical,encode(sha256(convert_to(canonical,'UTF8')),'hex'),'applied',NULL,NULL,result_value);
 BEGIN
 IF op='payment.delete' THEN UPDATE public."Payments" SET "Delete Requested"=true WHERE "Row ID"=target;
 ELSIF op='payment.move-interest' THEN
 IF provenance IS NOT NULL OR old."Allocation Method" IS DISTINCT FROM 'Lump Sum' THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 UPDATE public."Payment Allocations" SET "Ref Charge"=i->>'targetChargeId' WHERE "Row ID"=i->>'allocationId' AND "Ref Payment"=target;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 ELSE
 IF explicit_inverse THEN
 PERFORM set_config('pwa.native_inverse_request',e->>'requestId',true);
 desired:=public.payment_crud_prepare_core_v83(old,desired,'UPDATE');END IF;
 UPDATE public."Payments" SET "Ref Borrower"=desired."Ref Borrower","Amount Received"=desired."Amount Received","Payment Date"=desired."Payment Date","Payment Method"=desired."Payment Method","Ref Received By Cash Account"=desired."Ref Received By Cash Account","Notes"=desired."Notes","Allocation Method"=desired."Allocation Method","Ref Target Charge"=desired."Ref Target Charge","Ref Target Loan"=desired."Ref Target Loan","Selected Charge IDs"=desired."Selected Charge IDs","Uploaded Receipt"=desired."Uploaded Receipt","Status"=desired."Status","Processed At"=desired."Processed At" WHERE "Row ID"=target;
 SELECT * INTO actual FROM public."Payments" WHERE "Row ID"=target;
 IF actual."Status" IS DISTINCT FROM 'Posted' OR actual."Posted Amount"::numeric IS DISTINCT FROM (f->>'amountReceived')::numeric THEN RAISE EXCEPTION 'Correction did not post exact requested amount';END IF;
 IF explicit_finish THEN PERFORM public.payment_crud_finish_core_v83(old,actual,'UPDATE');END IF;
 PERFORM set_config('pwa.native_inverse_request','',true);
 END IF;
 EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B05';WHEN SQLSTATE 'P0001' THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
 IF op='payment.move-interest' AND message='Interest move requires an eligible charge on the same open loan' THEN RAISE EXCEPTION USING ERRCODE='P5B04';
 ELSIF op='payment.move-interest' AND message='Target charge capacity conflict' THEN RAISE EXCEPTION USING ERRCODE='P5B09';
 ELSIF op='payment.move-interest' AND message IN('Only a posted Lump Sum whole-interest allocation can move','Change receipt amounts through Payments; allocation move only changes Ref Charge') THEN RAISE EXCEPTION USING ERRCODE='P5B06';
 ELSIF message IN('Payment has a later loan default/write-off; reconcile that default first','Manually closed loan must be reopened explicitly before its receipt changes','Corrected payment has a default dependency; undo default first','Remove through the closing payment','Remove through the closing payment: delete it and close again','Remove the settlement first' /* R129 */) THEN RAISE EXCEPTION USING ERRCODE='P5B05';ELSE RAISE;END IF;END;
 RETURN result_value;
EXCEPTION WHEN OTHERS THEN PERFORM set_config('pwa.native_inverse_request','',true);RAISE;
END $$;


--
-- Name: pwa_apply_preference_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_apply_preference_v2(canonical text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE e jsonb:=canonical::jsonb;c jsonb:=e->'command';i jsonb:=c->'inputs';target text:=c->>'targetId';today date:=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date;
BEGIN
 IF (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END) OR target IS DISTINCT FROM e#>>'{actor,partnerId}' OR c->>'operation'<>'preference.update' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Own preferences required';END IF;
 PERFORM 1 FROM public."Partners" WHERE "Row ID"=target FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 PERFORM 1 FROM public."Cash Statement Context" WHERE "Ref Partner"=target FOR UPDATE;
 IF public.pwa_preference_version_v2(target) IS DISTINCT FROM c->>'expectedVersion' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF i->>'statementAccountId' IS NOT NULL AND i->>'statementAccountId' IS DISTINCT FROM (SELECT "Ref Cash Account"::text FROM public."Cash Statement Context" WHERE "Ref Partner"=target) AND NOT EXISTS(SELECT 1 FROM public."Cash Accounts" WHERE "Row ID"=i->>'statementAccountId' AND "Active" IS TRUE) THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 IF i->>'statementDate' IS NOT NULL AND i->>'statementDate' IS DISTINCT FROM (SELECT "Statement Date"::text FROM public."Cash Statement Context" WHERE "Ref Partner"=target) AND (i->>'statementDate')::date NOT BETWEEN today-14 AND today THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
 UPDATE public."Partners" SET "Language Preference"=i->>'language' WHERE "Row ID"=target;
 INSERT INTO public."Cash Statement Context"("Ref Partner","Ref Cash Account","Statement Date") VALUES(target,i->>'statementAccountId',(i->>'statementDate')::date) ON CONFLICT("Ref Partner") DO UPDATE SET "Ref Cash Account"=EXCLUDED."Ref Cash Account","Statement Date"=EXCLUDED."Statement Date";
 RETURN jsonb_build_object('operation','preference.update','targetType','preference','targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy',NULL);
END $$;


--
-- Name: pwa_apply_rebate_settlement_v1(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_apply_rebate_settlement_v1(canonical text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE e jsonb:=canonical::jsonb;c jsonb:=e->'command';i jsonb:=c->'inputs';a jsonb:=e->'actor';op text:=c->>'operation';target text:=c->>'targetId';
 day date:=(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date;s public.pwa_rebate_settlements%ROWTYPE;ids text[];referrer text;total numeric;
 settle_date date;newest date;changed integer;creator text;
BEGIN
 IF (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END)
  OR op NOT IN('rebate-settlement.create','rebate-settlement.delete') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Governed operation required';END IF;
 IF op='rebate-settlement.create' THEN
  referrer:=i->>'referrerId';settle_date:=(i->>'settlementDate')::date;creator:=a->>'loginEmail';
  SELECT array_agg(x.v ORDER BY x.n) INTO ids FROM jsonb_array_elements_text(i->'expenseIds') WITH ORDINALITY x(v,n);
  -- Locks: the referrer, then the chosen expenses in key order (no loan or charge changes).
  PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('borrower',referrer));
  PERFORM 1 FROM public."Business Expenses" WHERE "Row ID"=ANY(ids) ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.pwa_rebate_settlements WHERE id=target) THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
  IF NOT EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID"=referrer) THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
  IF NOT EXISTS(SELECT 1 FROM public."Cash Accounts" ca JOIN public."Cash Holders" ch ON ch."Row ID"=ca."Ref Cash Holder"
    WHERE ca."Row ID"=i->>'cashAccountId' AND ca."Ref Cash Holder"='ch:lisa' AND ca."Active" IS TRUE AND ch."Active" IS TRUE) THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
  SELECT max(coalesce(l."Close Date",x."Expense Date")) INTO newest FROM public."Business Expenses" x LEFT JOIN public."Loans" l ON l."Row ID"=x."Ref Related Loan" WHERE x."Row ID"=ANY(ids);
  IF settle_date>day OR settle_date<newest THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
  -- Every chosen row is a pending V3 rebate of this referrer (a legacy row, another payee's, a settled or offset-only one is not).
  IF (SELECT count(*) FROM public."Business Expenses" x WHERE x."Row ID"=ANY(ids) AND x."Source Type"='Referral Rebate' AND x."Rule Version"='REFERRAL_REBATE_V3'
    AND x."Ref Payee Borrower"=referrer AND x."Ref Rebate Settlement" IS NULL AND public.pwa_rebate_pending_v1(x."Row ID")>0)<>cardinality(ids) THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
  SELECT sum(public.pwa_rebate_pending_v1(v)) INTO total FROM unnest(ids) v;
  INSERT INTO public.pwa_rebate_settlements(id,payee_borrower_id,settlement_date,amount,paid_by_cash_holder,paid_by_cash_account,payment_method,bank_reference,notes,created_by)
   VALUES(target,referrer,settle_date,total,'ch:lisa',i->>'cashAccountId',i->>'paymentMethod',i->>'bankReference',i->>'notes',creator);
  PERFORM set_config('pwa.rebate_settlement',target,true);
  UPDATE public."Business Expenses" SET "Ref Rebate Settlement"=target WHERE "Row ID"=ANY(ids);
  GET DIAGNOSTICS changed=ROW_COUNT;
  PERFORM set_config('pwa.rebate_settlement','',true);
  IF changed<>cardinality(ids) OR (SELECT count(*) FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"='Rebate Settlement' AND "Ref Rebate Settlement"=target
    AND "Movement Type"='Rebate Settlement' AND "Amount"=total AND "Movement Date"=settle_date AND "Ref From Cash Holder"='ch:lisa' AND "Ref From Cash Account"=i->>'cashAccountId')<>1 THEN
   RAISE EXCEPTION 'Rebate settlement cash entry differs from the settlement';
  END IF;
 ELSE
  SELECT payee_borrower_id INTO referrer FROM public.pwa_rebate_settlements WHERE id=target;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
  PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('borrower',referrer));
  SELECT * INTO s FROM public.pwa_rebate_settlements WHERE id=target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
  PERFORM 1 FROM public."Business Expenses" WHERE "Ref Rebate Settlement"=target ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
  IF public.pwa_rebate_settlement_version_v1(target) IS DISTINCT FROM c->>'expectedVersion' THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
  creator:=s.created_by;
  -- The rebates return to pending, then the settlement and (its delete trigger) its cash entry go.
  PERFORM set_config('pwa.rebate_settlement',target,true);
  UPDATE public."Business Expenses" SET "Ref Rebate Settlement"=NULL WHERE "Ref Rebate Settlement"=target;
  PERFORM set_config('pwa.rebate_settlement','',true);
  DELETE FROM public.pwa_rebate_settlements WHERE id=target;
  IF EXISTS(SELECT 1 FROM public."Cash Ledger" WHERE "Ref Rebate Settlement"=target OR ("Source Type"='Rebate Settlement' AND "Source Key"='REBATESETTLEMENT:'||target)) THEN
   RAISE EXCEPTION 'Rebate settlement cash entry was not removed';
  END IF;
 END IF;
 RETURN jsonb_build_object('operation',op,'targetType','rebate-settlement','targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL,'sourceCreatedBy',creator);
END $$;


--
-- Name: FUNCTION pwa_apply_rebate_settlement_v1(canonical text); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_apply_rebate_settlement_v1(canonical text) IS 'mw-access:governance R129 rebate-settlement.create and .delete for pwa_submit_operation_v2; journal owner only.';


--
-- Name: pwa_assessment_refresh_window_v2(date, date, date); Type: FUNCTION
--

CREATE FUNCTION public.pwa_assessment_refresh_window_v2(start_day date, end_day date, as_of date) RETURNS date[]
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF start_day IS NULL OR end_day IS NULL OR as_of IS NULL OR start_day>end_day OR end_day-start_day>3660 OR start_day>as_of THEN RAISE EXCEPTION USING ERRCODE='P5B08';END IF;
 IF end_day<as_of THEN RETURN ARRAY[as_of,as_of];END IF;
 RETURN ARRAY[start_day,end_day];
END $$;


--
-- Name: pwa_borrower_version_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_borrower_version_v2(id text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
 -- R120: the referral rebate terms are part of the version.
 SELECT encode(sha256(convert_to(jsonb_build_object('id',b."Row ID",'createdDate',b."Creation Date",'aiCollectionEnabled',b."AI Collection Enabled",'name',b."Borrower Name",'description',b."Description",'communicationName',b."Communication Name",'instagramUsername',b."Instagram Username",'city',b."City",'workingLocation',b."Working Location",'address',b."Address",'hidden',b."Hidden Flag",'referrerId',b."Ref Referrer",'preferredReceivingAccountId',b."Ref Preferred Receiving Cash Account",'note',b."Borrower Note",'referralRebateRate',b."Referral Rebate Rate",'referralRebateCap',b."Referral Rebate Cap" )::text,'UTF8')),'hex') FROM public."Borrowers" b WHERE b."Row ID"=$1;
$_$;


--
-- Name: pwa_capture_notification_v1(); Type: FUNCTION
--

CREATE FUNCTION public.pwa_capture_notification_v1() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    SET application_name TO 'mw_pwa_capture_disabled_v1'
    AS $$
DECLARE kind text; actor_email text; actor_id text; matches bigint; version text;
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_proc
  WHERE oid='public.pwa_capture_notification_v1()'::pg_catalog.regprocedure
  AND 'application_name=mw_pwa_capture_enabled_v1'=ANY(proconfig)
 ) THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='Payments' THEN
  IF NEW."Status" IS DISTINCT FROM 'Posted' OR (TG_OP='UPDATE' AND OLD."Status"='Posted') THEN RETURN NEW; END IF;
  kind:='payment.posted';actor_email:=nullif(lower(btrim(NEW."Created By")),'');version:='posted';
 ELSE
  IF TG_OP='INSERT' THEN kind:='loan.created';actor_email:=nullif(lower(btrim(NEW."Created By")),'');version:='created';
  ELSIF NEW."Loan Status"='ปิดยอดแล้ว' AND OLD."Loan Status" IS DISTINCT FROM 'ปิดยอดแล้ว' AND NEW."Ref Closing Payment" IS NULL THEN
   kind:='loan.closed';actor_email:=nullif(lower(btrim(NEW."Closed By")),'');
   -- The source UPDATE already holds the loan row lock, serializing close occurrences.
   SELECT 'closed:'||(count(*)+1)::text INTO version FROM public.pwa_notification_events WHERE source_kind='loan' AND source_id=NEW."Row ID" AND event_type='loan.closed';
  ELSE RETURN NEW; END IF;
 END IF;
 SELECT count(*),min("Row ID") INTO matches,actor_id FROM public."Partners" WHERE lower(btrim("Login Email"))=actor_email;
 IF matches<>1 THEN actor_id:=NULL; END IF;
 INSERT INTO public.pwa_notification_events(dedupe_key,event_type,source_kind,source_id,source_version,actor_partner_id,actor_login_email)
 VALUES(kind||':'||NEW."Row ID"||':'||version,kind,CASE WHEN TG_TABLE_NAME='Payments' THEN 'payment' ELSE 'loan' END,NEW."Row ID",version,actor_id,actor_email)
 ON CONFLICT(dedupe_key) DO NOTHING;
 RETURN NEW;
END $$;


--
-- Name: FUNCTION pwa_capture_notification_v1(); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_capture_notification_v1() IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_cash_opening_basis_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_cash_opening_basis_v2(p_holder text) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT jsonb_build_object('holderId',h."Row ID",'holderLabel',h."Holder Name",
 'sourceVersion',encode(sha256(convert_to(to_jsonb(h)::text,'UTF8')),'hex'),
 'holderBalance',b."Current Balance"::text,
 'accounts',coalesce((SELECT jsonb_agg(jsonb_build_object('accountId',a."Ref Cash Account",
 'label',a."Account Label",'initialized',a."Initialized",'balance',a."Current Balance"::text)
 ORDER BY a."Ref Cash Account" COLLATE "C") FROM public."Cash Account Balances" a
 WHERE a."Ref Cash Holder"=h."Row ID"),'[]'::jsonb))
 FROM public."Cash Holders" h JOIN public."Cash Holder Balances" b ON b."Ref Cash Holder"=h."Row ID"
 WHERE h."Row ID"=p_holder
$$;


--
-- Name: pwa_charge_version_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_charge_version_v2(id text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
 SELECT encode(sha256(convert_to(jsonb_build_object('source',to_jsonb(c),'loan',to_jsonb(l),
 'repayments',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r."Row ID" COLLATE "C"),'[]'::jsonb) FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID"),
 'allocations',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a."Row ID" COLLATE "C"),'[]'::jsonb) FROM public."Payment Allocations" a WHERE a."Ref Charge"=c."Row ID"))::text,'UTF8')),'hex') FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans" WHERE c."Row ID"=$1;
$_$;


--
-- Name: pwa_chat_actor_v1(jsonb); Type: FUNCTION
--

CREATE FUNCTION public.pwa_chat_actor_v1(actor jsonb) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE suffix text; partner text; matches bigint;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 IF current_user<>'mw_chat_owner_'||suffix OR NOT pg_has_role(session_user,'mw_chat_api_'||suffix,'USAGE') OR pg_has_role(session_user,'mw_chat_owner_'||suffix,'MEMBER') THEN
  RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 IF actor IS NULL OR jsonb_typeof(actor)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(actor) key) IS DISTINCT FROM ARRAY['issuer','loginEmail','partnerId','subject']::text[]
  OR EXISTS(SELECT 1 FROM jsonb_each(actor) e WHERE jsonb_typeof(e.value)<>'string')
  OR actor->>'issuer'<>'https://securetoken.google.com/clever-oasis-508610-n7'
  OR coalesce(length(actor->>'subject'),0) NOT BETWEEN 1 AND 128 OR coalesce(length(actor->>'partnerId'),0) NOT BETWEEN 1 AND 256
  OR coalesce(length(actor->>'loginEmail'),0) NOT BETWEEN 1 AND 320 OR actor->>'loginEmail'<>lower(btrim(actor->>'loginEmail')) THEN
  RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 SELECT count(*),min("Row ID") INTO matches,partner FROM public."Partners" WHERE lower(btrim("Login Email"))=actor->>'loginEmail';
 IF matches<>1 OR partner IS DISTINCT FROM actor->>'partnerId' THEN RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 RETURN partner;
END $$;


--
-- Name: FUNCTION pwa_chat_actor_v1(actor jsonb); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_chat_actor_v1(actor jsonb) IS 'mw-access:governance fixed chat boundary; explicit capability only';


--
-- Name: pwa_chat_immutable_v1(); Type: FUNCTION
--

CREATE FUNCTION public.pwa_chat_immutable_v1() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME='pwa_chat_threads' THEN
   IF NEW.id=OLD.id AND NEW.partner_id=OLD.partner_id AND NEW.created_at=OLD.created_at THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME='pwa_chat_messages' THEN
   IF OLD.role='user' AND (to_jsonb(NEW)-'claimed_at'-'detached_at')=(to_jsonb(OLD)-'claimed_at'-'detached_at') THEN RETURN NEW; END IF;
  END IF;
 END IF;
 RAISE EXCEPTION '% on % is not allowed (append-only chat journal)',TG_OP,TG_TABLE_NAME USING ERRCODE='55000';
END $$;


--
-- Name: FUNCTION pwa_chat_immutable_v1(); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_chat_immutable_v1() IS 'mw-access:governance fixed chat boundary; explicit capability only';


--
-- Name: pwa_chat_iso_v1(timestamp with time zone); Type: FUNCTION
--

CREATE FUNCTION public.pwa_chat_iso_v1(t timestamp with time zone) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    SET search_path TO 'pg_catalog', 'public'
    AS $$ SELECT to_char(t AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;


--
-- Name: FUNCTION pwa_chat_iso_v1(t timestamp with time zone); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_chat_iso_v1(t timestamp with time zone) IS 'mw-access:governance fixed chat boundary; explicit capability only';


--
-- Name: pwa_chat_message_json_v1(public.pwa_chat_messages); Type: FUNCTION
--

CREATE FUNCTION public.pwa_chat_message_json_v1(m public.pwa_chat_messages) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT jsonb_strip_nulls(jsonb_build_object('id',m.id,'seq',m.seq,'role',m.role,'text',m.text,
  'status',CASE WHEN m.role='user' AND m.claimed_at IS NOT NULL THEN CASE WHEN m.claimed_at>clock_timestamp()-interval '5 minutes' THEN 'pending' ELSE 'failed' END ELSE m.status END,
  'model',m.model,'createdAt',public.pwa_chat_iso_v1(m.created_at),
  'usage',CASE WHEN m.role='assistant' THEN jsonb_build_object('promptTokens',coalesce(m.prompt_tokens,0),'outputTokens',coalesce(m.output_tokens,0),
   'thoughtsTokens',coalesce(m.thoughts_tokens,0),'cachedTokens',coalesce(m.cached_tokens,0),'rounds',coalesce(m.rounds,0),'latencyMs',coalesce(m.latency_ms,0)) END,
  'tools',CASE WHEN m.role='assistant' THEN (SELECT jsonb_agg(jsonb_build_object('name',x.name,'count',x.n) ORDER BY x.first_round,x.name)
   FROM (SELECT c.name,count(*) AS n,min(c.round) AS first_round FROM public.pwa_chat_tool_calls c WHERE c.message_id=m.id GROUP BY c.name) x) END,
  'errorCode',m.error_code))||CASE WHEN m.role='assistant' THEN jsonb_build_object('proposals',coalesce((SELECT jsonb_agg(public.pwa_chat_proposal_json_v1(p) ORDER BY coalesce((p.card->'group'->>'index')::integer,0),p.id)
  FROM public.pwa_chat_proposals p JOIN public.pwa_chat_messages q ON q.id=p.message_id WHERE q.thread_id=m.thread_id AND q.seq=m.seq-1 AND q.role='user'
  AND p.created_at=(SELECT max(r.created_at) FROM public.pwa_chat_proposals r WHERE r.message_id=q.id)),'[]'::jsonb)) ELSE '{}'::jsonb END
$$;


--
-- Name: FUNCTION pwa_chat_message_json_v1(m public.pwa_chat_messages); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_chat_message_json_v1(m public.pwa_chat_messages) IS 'mw-access:governance fixed chat boundary; explicit capability only';


--
-- Name: pwa_chat_message_v1(jsonb, uuid, uuid); Type: FUNCTION
--

CREATE FUNCTION public.pwa_chat_message_v1(actor jsonb, thread uuid, message uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); u public.pwa_chat_messages; a public.pwa_chat_messages;
BEGIN
 SELECT m.* INTO u FROM public.pwa_chat_messages m JOIN public.pwa_chat_threads t ON t.id=m.thread_id
 WHERE m.id=message AND m.thread_id=thread AND m.role='user' AND t.partner_id=partner;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO a FROM public.pwa_chat_messages m WHERE m.thread_id=u.thread_id AND m.seq=u.seq+1 AND m.role='assistant';
 RETURN jsonb_build_object('user',public.pwa_chat_message_json_v1(u),'assistant',CASE WHEN a.id IS NULL THEN 'null'::jsonb ELSE public.pwa_chat_message_json_v1(a) END);
END $$;


--
-- Name: FUNCTION pwa_chat_message_v1(actor jsonb, thread uuid, message uuid); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_chat_message_v1(actor jsonb, thread uuid, message uuid) IS 'mw-access:governance fixed chat boundary; explicit capability only';


--
-- Name: pwa_chat_messages_v1(jsonb, uuid, integer, integer); Type: FUNCTION
--

CREATE FUNCTION public.pwa_chat_messages_v1(actor jsonb, thread uuid, before integer, lim integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE partner text:=public.pwa_chat_actor_v1(actor);
BEGIN
 IF lim IS NULL OR lim NOT BETWEEN 1 AND 50 OR (before IS NOT NULL AND before<1) THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pwa_chat_threads t WHERE t.id=thread AND t.partner_id=partner) THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 RETURN coalesce((SELECT jsonb_agg(public.pwa_chat_message_json_v1(x.m) ORDER BY (x.m).seq DESC)
  FROM (SELECT m FROM public.pwa_chat_messages m WHERE m.thread_id=thread AND (before IS NULL OR m.seq<before) ORDER BY m.seq DESC LIMIT lim+1) x),'[]'::jsonb);
END $$;


--
-- Name: FUNCTION pwa_chat_messages_v1(actor jsonb, thread uuid, before integer, lim integer); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_chat_messages_v1(actor jsonb, thread uuid, before integer, lim integer) IS 'mw-access:governance fixed chat boundary; explicit capability only';


--
-- Name: pwa_chat_models_default_v1(jsonb); Type: FUNCTION
--

CREATE FUNCTION public.pwa_chat_models_default_v1(actor jsonb) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE partner text:=public.pwa_chat_actor_v1(actor);
BEGIN
 RETURN (SELECT t.model FROM public.pwa_chat_threads t WHERE t.partner_id=partner ORDER BY t.updated_at DESC,t.id DESC LIMIT 1);
END $$;


--
-- Name: FUNCTION pwa_chat_models_default_v1(actor jsonb); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_chat_models_default_v1(actor jsonb) IS 'mw-access:governance fixed chat boundary; explicit capability only';


--
-- Name: pwa_chat_proposal_cancel_v1(jsonb, uuid, uuid, text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_chat_proposal_cancel_v1(actor jsonb, thread uuid, id uuid, reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); p public.pwa_chat_proposals; n integer;
BEGIN
 IF reason IS NULL OR NOT ((reason='cancelled' AND id IS NOT NULL) OR (reason='superseded' AND id IS NULL)) THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pwa_chat_threads t WHERE t.id=thread AND t.partner_id=partner) THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 IF reason='superseded' THEN
  UPDATE public.pwa_chat_proposals x SET state=CASE WHEN x.expires_at<=clock_timestamp() THEN 'expired' ELSE 'cancelled' END,
   cancel_reason=CASE WHEN x.expires_at<=clock_timestamp() THEN NULL ELSE 'superseded' END,settled_at=clock_timestamp()
  WHERE x.thread_id=thread AND x.partner_id=partner AND x.state='pending';
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN jsonb_build_object('cancelled',n);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Partners" x WHERE x."Row ID"=partner AND x."AI Reviewer" IS TRUE) THEN RAISE EXCEPTION 'reviewer_required' USING ERRCODE='42501'; END IF;
 SELECT x.* INTO p FROM public.pwa_chat_proposals x WHERE x.id=$3 AND x.thread_id=thread AND x.partner_id=partner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 IF p.state='pending' THEN
  UPDATE public.pwa_chat_proposals x SET state=CASE WHEN x.expires_at<=clock_timestamp() THEN 'expired' ELSE 'cancelled' END,
   cancel_reason=CASE WHEN x.expires_at<=clock_timestamp() THEN NULL ELSE 'cancelled' END,settled_at=clock_timestamp()
  WHERE x.id=p.id RETURNING * INTO p;
 END IF;
 RETURN public.pwa_chat_proposal_json_v1(p);
END $_$;


--
-- Name: FUNCTION pwa_chat_proposal_cancel_v1(actor jsonb, thread uuid, id uuid, reason text); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_chat_proposal_cancel_v1(actor jsonb, thread uuid, id uuid, reason text) IS 'mw-access:governance fixed chat boundary; explicit capability only';


--
-- Name: pwa_chat_proposal_claim_v1(jsonb, uuid, uuid); Type: FUNCTION
--

CREATE FUNCTION public.pwa_chat_proposal_claim_v1(actor jsonb, thread uuid, id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); p public.pwa_chat_proposals;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public."Partners" x WHERE x."Row ID"=partner AND x."AI Reviewer" IS TRUE) THEN RAISE EXCEPTION 'reviewer_required' USING ERRCODE='42501'; END IF;
 SELECT x.* INTO p FROM public.pwa_chat_proposals x JOIN public.pwa_chat_threads t ON t.id=x.thread_id
 WHERE x.id=$3 AND x.thread_id=thread AND t.partner_id=partner AND x.partner_id=partner FOR UPDATE OF x;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 IF p.state='pending' AND p.expires_at<=clock_timestamp() THEN
  UPDATE public.pwa_chat_proposals x SET state='expired',settled_at=clock_timestamp() WHERE x.id=p.id RETURNING * INTO p;
 ELSIF p.state='pending' THEN
  UPDATE public.pwa_chat_proposals x SET state='executing',claimed_at=clock_timestamp(),attempts=x.attempts+1 WHERE x.id=p.id RETURNING * INTO p;
  RETURN jsonb_build_object('claimed',true,'proposal',public.pwa_chat_proposal_json_v1(p)||jsonb_build_object('claimedAt',public.pwa_chat_iso_v1(p.claimed_at),'attempts',p.attempts),'command',p.command);
 ELSIF p.state='executing' AND p.claimed_at>clock_timestamp()-interval '3 minutes' THEN
  RAISE EXCEPTION 'proposal_executing' USING ERRCODE='55006';
 END IF;
 RETURN jsonb_build_object('claimed',false,'proposal',public.pwa_chat_proposal_json_v1(p)||jsonb_build_object('claimedAt',public.pwa_chat_iso_v1(p.claimed_at),'attempts',p.attempts));
END $_$;


--
-- Name: FUNCTION pwa_chat_proposal_claim_v1(actor jsonb, thread uuid, id uuid); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_chat_proposal_claim_v1(actor jsonb, thread uuid, id uuid) IS 'mw-access:governance fixed chat boundary; explicit capability only';


--
-- Name: pwa_chat_proposal_create_v1(jsonb, uuid, jsonb); Type: FUNCTION
--

CREATE FUNCTION public.pwa_chat_proposal_create_v1(actor jsonb, thread uuid, proposal jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); t public.pwa_chat_threads; u public.pwa_chat_messages; p public.pwa_chat_proposals;
 lines jsonb; line jsonb; n integer; i integer:=0; head text; command_value jsonb; created timestamptz; result jsonb:='[]'::jsonb; grouped boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public."Partners" x WHERE x."Row ID"=partner AND x."AI Reviewer" IS TRUE) THEN RAISE EXCEPTION 'reviewer_required' USING ERRCODE='42501'; END IF;
 IF proposal IS NULL OR jsonb_typeof(proposal)<>'object' THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 -- D12 (V141: 1..100 lines): {group:[line, ...]} or the V118 single line.
 grouped:=(SELECT array_agg(key) FROM jsonb_object_keys(proposal) key)=ARRAY['group']::text[];
 lines:=CASE WHEN grouped THEN proposal->'group' ELSE jsonb_build_array(proposal) END;
 IF jsonb_typeof(lines)<>'array' OR jsonb_array_length(lines) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 n:=jsonb_array_length(lines);head:=lines->0->>'id';
 FOR line IN SELECT value FROM jsonb_array_elements(lines) LOOP
  IF jsonb_typeof(line)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(line) key) IS DISTINCT FROM ARRAY['card','command','id','kind','messageId','operation']::text[]
   OR jsonb_typeof(line->'id') IS DISTINCT FROM 'string' OR line->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   OR jsonb_typeof(line->'messageId') IS DISTINCT FROM 'string' OR line->>'messageId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   OR line->>'messageId' IS DISTINCT FROM lines->0->>'messageId'
   OR line->>'kind' NOT IN ('operation','payment') OR jsonb_typeof(line->'operation') IS DISTINCT FROM 'string'
   OR jsonb_typeof(line->'command') IS DISTINCT FROM 'string' OR octet_length(line->>'command') NOT BETWEEN 2 AND 65536
   OR jsonb_typeof(line->'card') IS DISTINCT FROM 'object'
   OR (grouped AND (jsonb_typeof(line->'card'->'group') IS DISTINCT FROM 'object' OR line->'card'->'group'->>'id' IS DISTINCT FROM head
    OR jsonb_typeof(line->'card'->'group'->'index') IS DISTINCT FROM 'number' OR (line->'card'->'group'->>'index')::numeric IS DISTINCT FROM i
    OR jsonb_typeof(line->'card'->'group'->'count') IS DISTINCT FROM 'number' OR (line->'card'->'group'->>'count')::numeric IS DISTINCT FROM n)) THEN
   RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  BEGIN command_value:=(line->>'command')::jsonb; EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END;
  IF jsonb_typeof(command_value)<>'object' OR command_value->>'requestId' IS DISTINCT FROM line->>'id' THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  i:=i+1;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(lines))<>n THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 SELECT * INTO t FROM public.pwa_chat_threads x WHERE x.id=thread AND x.partner_id=partner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 SELECT m.* INTO u FROM public.pwa_chat_messages m WHERE m.id=(lines->0->>'messageId')::uuid AND m.thread_id=t.id AND m.role='user'
  AND m.claimed_at>clock_timestamp()-interval '5 minutes' AND NOT EXISTS(SELECT 1 FROM public.pwa_chat_messages r WHERE r.thread_id=m.thread_id AND r.seq=m.seq+1)
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.pwa_chat_proposals x WHERE x.message_id=u.id AND x.created_at>=u.claimed_at) THEN RAISE EXCEPTION 'one_proposal_per_turn' USING ERRCODE='23505'; END IF;
 -- A new proposal replaces the thread's earlier pending ones (D9); one past its expiry is recorded as expired.
 UPDATE public.pwa_chat_proposals x SET state=CASE WHEN x.expires_at<=clock_timestamp() THEN 'expired' ELSE 'cancelled' END,
  cancel_reason=CASE WHEN x.expires_at<=clock_timestamp() THEN NULL ELSE 'superseded' END,settled_at=clock_timestamp()
 WHERE x.thread_id=t.id AND x.state='pending';
 -- clock_timestamp(): created after the claim of its turn (the one-per-turn rule compares the two); one time per group.
 created:=clock_timestamp();
 FOR line IN SELECT value FROM jsonb_array_elements(lines) WITH ORDINALITY ORDER BY ordinality LOOP
  INSERT INTO public.pwa_chat_proposals(id,thread_id,message_id,partner_id,kind,operation,command,card,created_at,expires_at)
  VALUES((line->>'id')::uuid,t.id,u.id,partner,line->>'kind',line->>'operation',line->>'command',line->'card',created,created+interval '15 minutes')
  RETURNING * INTO p;
  result:=result||jsonb_build_array(public.pwa_chat_proposal_json_v1(p));
 END LOOP;
 RETURN CASE WHEN grouped THEN result ELSE result->0 END;
END $_$;


--
-- Name: FUNCTION pwa_chat_proposal_create_v1(actor jsonb, thread uuid, proposal jsonb); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_chat_proposal_create_v1(actor jsonb, thread uuid, proposal jsonb) IS 'mw-access:governance fixed chat boundary; explicit capability only';


--
-- Name: pwa_chat_proposal_guard_v1(); Type: FUNCTION
--

CREATE FUNCTION public.pwa_chat_proposal_guard_v1() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE lifecycle text[]:=ARRAY['state','claimed_at','settled_at','attempts','outcome','record','cancel_reason'];
BEGIN
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-lifecycle)=(to_jsonb(OLD)-lifecycle)
  AND ((OLD.state='pending' AND NEW.state IN ('executing','expired','cancelled'))
   OR (OLD.state IN ('executing','unknown') AND NEW.state IN ('done','failed','unknown'))) THEN RETURN NEW; END IF;
 RAISE EXCEPTION '% on % is not allowed (chat proposal lifecycle)',TG_OP,TG_TABLE_NAME USING ERRCODE='55000';
END $$;


--
-- Name: FUNCTION pwa_chat_proposal_guard_v1(); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_chat_proposal_guard_v1() IS 'mw-access:governance fixed chat boundary; explicit capability only';


--
-- Name: pwa_chat_proposal_json_v1(public.pwa_chat_proposals); Type: FUNCTION
--

CREATE FUNCTION public.pwa_chat_proposal_json_v1(p public.pwa_chat_proposals) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT jsonb_build_object('id',p.id,'threadId',p.thread_id,'messageId',p.message_id,'kind',p.kind,'operation',p.operation,
  'state',CASE WHEN p.state='pending' AND p.expires_at<=clock_timestamp() THEN 'expired' ELSE p.state END,
  'card',p.card,'expiresAt',public.pwa_chat_iso_v1(p.expires_at),'createdAt',public.pwa_chat_iso_v1(p.created_at),
  'settledAt',public.pwa_chat_iso_v1(p.settled_at),
  'outcome',CASE WHEN p.outcome IS NULL THEN NULL ELSE jsonb_build_object('code',coalesce(p.outcome->'code','null'::jsonb),'recordedAt',coalesce(p.outcome->'recordedAt','null'::jsonb)) END,
  'record',p.record)
$$;


--
-- Name: FUNCTION pwa_chat_proposal_json_v1(p public.pwa_chat_proposals); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_chat_proposal_json_v1(p public.pwa_chat_proposals) IS 'mw-access:governance fixed chat boundary; explicit capability only';


--
-- Name: pwa_chat_proposal_settle_v1(jsonb, uuid, uuid, jsonb); Type: FUNCTION
--

CREATE FUNCTION public.pwa_chat_proposal_settle_v1(actor jsonb, thread uuid, id uuid, settlement jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); p public.pwa_chat_proposals;
BEGIN
 IF settlement IS NULL OR jsonb_typeof(settlement)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(settlement) key) IS DISTINCT FROM ARRAY['outcome','record','state']::text[]
  OR settlement->>'state' NOT IN ('done','failed','unknown') OR jsonb_typeof(settlement->'outcome') NOT IN ('object','null') OR jsonb_typeof(settlement->'record') NOT IN ('object','null')
  OR (settlement->>'state' IN ('done','failed') AND jsonb_typeof(settlement->'outcome')<>'object') OR (settlement->>'state'<>'done' AND jsonb_typeof(settlement->'record')<>'null') THEN
  RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 SELECT x.* INTO p FROM public.pwa_chat_proposals x JOIN public.pwa_chat_threads t ON t.id=x.thread_id
 WHERE x.id=$3 AND x.thread_id=thread AND t.partner_id=partner AND x.partner_id=partner FOR UPDATE OF x;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 IF p.state IN ('executing','unknown') THEN
  UPDATE public.pwa_chat_proposals x SET state=settlement->>'state',outcome=CASE WHEN jsonb_typeof(settlement->'outcome')='object' THEN settlement->'outcome' END,
   record=CASE WHEN jsonb_typeof(settlement->'record')='object' THEN settlement->'record' END,
   settled_at=CASE WHEN settlement->>'state' IN ('done','failed') THEN clock_timestamp() END
  WHERE x.id=p.id RETURNING * INTO p;
 END IF;
 RETURN public.pwa_chat_proposal_json_v1(p)||jsonb_build_object('claimedAt',public.pwa_chat_iso_v1(p.claimed_at),'attempts',p.attempts);
END $_$;


--
-- Name: FUNCTION pwa_chat_proposal_settle_v1(actor jsonb, thread uuid, id uuid, settlement jsonb); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_chat_proposal_settle_v1(actor jsonb, thread uuid, id uuid, settlement jsonb) IS 'mw-access:governance fixed chat boundary; explicit capability only';


--
-- Name: pwa_chat_proposals_v1(jsonb, uuid, uuid, integer); Type: FUNCTION
--

CREATE FUNCTION public.pwa_chat_proposals_v1(actor jsonb, thread uuid, id uuid, lim integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); p public.pwa_chat_proposals;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public."Partners" x WHERE x."Row ID"=partner AND x."AI Reviewer" IS TRUE) THEN RAISE EXCEPTION 'reviewer_required' USING ERRCODE='42501'; END IF;
 IF (id IS NULL)=(lim IS NULL) OR (lim IS NOT NULL AND lim NOT BETWEEN 1 AND 20) THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pwa_chat_threads t WHERE t.id=thread AND t.partner_id=partner) THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 IF id IS NOT NULL THEN
  SELECT * INTO p FROM public.pwa_chat_proposals x WHERE x.id=$3 AND x.thread_id=thread AND x.partner_id=partner;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
  RETURN public.pwa_chat_proposal_json_v1(p)||jsonb_build_object('claimedAt',public.pwa_chat_iso_v1(p.claimed_at),'attempts',p.attempts);
 END IF;
 RETURN coalesce((SELECT jsonb_agg(public.pwa_chat_proposal_json_v1(z.y) ORDER BY (z.y).created_at DESC,(z.y).id DESC)
  FROM (SELECT y FROM public.pwa_chat_proposals y WHERE y.thread_id=thread AND y.partner_id=partner ORDER BY y.created_at DESC,y.id DESC LIMIT lim) z),'[]'::jsonb);
END $_$;


--
-- Name: FUNCTION pwa_chat_proposals_v1(actor jsonb, thread uuid, id uuid, lim integer); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_chat_proposals_v1(actor jsonb, thread uuid, id uuid, lim integer) IS 'mw-access:governance fixed chat boundary; explicit capability only';


--
-- Name: pwa_chat_thread_create_v1(jsonb, jsonb); Type: FUNCTION
--

CREATE FUNCTION public.pwa_chat_thread_create_v1(actor jsonb, thread jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); row_value public.pwa_chat_threads; thread_id uuid; title_value text;
BEGIN
 IF thread IS NULL OR jsonb_typeof(thread)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(thread) k WHERE k NOT IN ('id','model','title'))
  OR jsonb_typeof(thread->'id') IS DISTINCT FROM 'string' OR thread->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  OR jsonb_typeof(thread->'model') IS DISTINCT FROM 'string' OR thread->>'model' !~ '^(gemini-[0-9]+(\.[0-9]+)?-[a-z0-9-]+|claude-[a-z]+-[0-9]+(-[0-9]+)?)$' OR length(thread->>'model')>64
  OR (thread ? 'title' AND jsonb_typeof(thread->'title')<>'null' AND (jsonb_typeof(thread->'title')<>'string' OR length(thread->>'title') NOT BETWEEN 1 AND 120 OR thread->>'title'<>btrim(thread->>'title') OR thread->>'title' ~ '[[:cntrl:]]')) THEN
  RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 thread_id:=(thread->>'id')::uuid;title_value:=coalesce(nullif(thread->>'title',''),'New chat');
 INSERT INTO public.pwa_chat_threads(id,partner_id,title,model) VALUES(thread_id,partner,title_value,thread->>'model') ON CONFLICT (id) DO NOTHING RETURNING * INTO row_value;
 IF FOUND THEN RETURN jsonb_build_object('created',true,'item',public.pwa_chat_thread_json_v1(row_value)); END IF;
 SELECT * INTO row_value FROM public.pwa_chat_threads t WHERE t.id=thread_id;
 IF row_value.partner_id IS DISTINCT FROM partner THEN RAISE EXCEPTION 'not_found' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('created',false,'item',public.pwa_chat_thread_json_v1(row_value));
END $_$;


--
-- Name: FUNCTION pwa_chat_thread_create_v1(actor jsonb, thread jsonb); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_chat_thread_create_v1(actor jsonb, thread jsonb) IS 'mw-access:governance fixed chat boundary; explicit capability only';


--
-- Name: pwa_chat_thread_json_v1(public.pwa_chat_threads); Type: FUNCTION
--

CREATE FUNCTION public.pwa_chat_thread_json_v1(t public.pwa_chat_threads) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT jsonb_build_object('id',t.id,'title',t.title,'model',t.model,'status',t.status,'createdAt',public.pwa_chat_iso_v1(t.created_at),
  'lastMessageAt',public.pwa_chat_iso_v1(t.last_message_at),'messageCount',t.message_count)
$$;


--
-- Name: FUNCTION pwa_chat_thread_json_v1(t public.pwa_chat_threads); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_chat_thread_json_v1(t public.pwa_chat_threads) IS 'mw-access:governance fixed chat boundary; explicit capability only';


--
-- Name: pwa_chat_thread_update_v1(jsonb, uuid, jsonb); Type: FUNCTION
--

CREATE FUNCTION public.pwa_chat_thread_update_v1(actor jsonb, id uuid, patch jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); row_value public.pwa_chat_threads;
BEGIN
 IF patch IS NULL OR jsonb_typeof(patch)<>'object' OR NOT EXISTS(SELECT 1 FROM jsonb_object_keys(patch)) OR EXISTS(SELECT 1 FROM jsonb_object_keys(patch) k WHERE k NOT IN ('title','model','status'))
  OR (patch ? 'title' AND (jsonb_typeof(patch->'title')<>'string' OR length(patch->>'title') NOT BETWEEN 1 AND 120 OR patch->>'title'<>btrim(patch->>'title') OR patch->>'title' ~ '[[:cntrl:]]'))
  OR (patch ? 'model' AND (jsonb_typeof(patch->'model')<>'string' OR patch->>'model' !~ '^(gemini-[0-9]+(\.[0-9]+)?-[a-z0-9-]+|claude-[a-z]+-[0-9]+(-[0-9]+)?)$' OR length(patch->>'model')>64))
  OR (patch ? 'status' AND (jsonb_typeof(patch->'status')<>'string' OR patch->>'status' NOT IN ('active','archived'))) THEN
  RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 UPDATE public.pwa_chat_threads t SET title=coalesce(patch->>'title',t.title),model=coalesce(patch->>'model',t.model),status=coalesce(patch->>'status',t.status),updated_at=clock_timestamp()
 WHERE t.id=$2 AND t.partner_id=partner RETURNING * INTO row_value;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 RETURN public.pwa_chat_thread_json_v1(row_value);
END $_$;


--
-- Name: FUNCTION pwa_chat_thread_update_v1(actor jsonb, id uuid, patch jsonb); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_chat_thread_update_v1(actor jsonb, id uuid, patch jsonb) IS 'mw-access:governance fixed chat boundary; explicit capability only';


--
-- Name: pwa_chat_thread_v1(jsonb, uuid); Type: FUNCTION
--

CREATE FUNCTION public.pwa_chat_thread_v1(actor jsonb, id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); value jsonb;
BEGIN
 IF id IS NULL THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 SELECT public.pwa_chat_thread_json_v1(t) INTO value FROM public.pwa_chat_threads t WHERE t.id=$2 AND t.partner_id=partner;
 IF value IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 RETURN value;
END $_$;


--
-- Name: FUNCTION pwa_chat_thread_v1(actor jsonb, id uuid); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_chat_thread_v1(actor jsonb, id uuid) IS 'mw-access:governance fixed chat boundary; explicit capability only';


--
-- Name: pwa_chat_threads_v1(jsonb, text, timestamp with time zone, integer); Type: FUNCTION
--

CREATE FUNCTION public.pwa_chat_threads_v1(actor jsonb, status text, before timestamp with time zone, lim integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE partner text:=public.pwa_chat_actor_v1(actor);
BEGIN
 IF status IS NULL OR status NOT IN ('active','archived') OR lim IS NULL OR lim NOT BETWEEN 1 AND 50 OR (before IS NOT NULL AND NOT isfinite(before)) THEN
  RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 RETURN coalesce((SELECT jsonb_agg(public.pwa_chat_thread_json_v1(x.t)||jsonb_build_object('sortAt',to_char(x.sort_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY x.sort_at DESC,(x.t).id DESC)
  FROM (SELECT t,coalesce(t.last_message_at,t.created_at) AS sort_at FROM public.pwa_chat_threads t
   WHERE t.partner_id=partner AND t.status=$2 AND (before IS NULL OR coalesce(t.last_message_at,t.created_at)<before)
   ORDER BY coalesce(t.last_message_at,t.created_at) DESC,t.id DESC LIMIT lim+1) x),'[]'::jsonb);
END $_$;


--
-- Name: FUNCTION pwa_chat_threads_v1(actor jsonb, status text, before timestamp with time zone, lim integer); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_chat_threads_v1(actor jsonb, status text, before timestamp with time zone, lim integer) IS 'mw-access:governance fixed chat boundary; explicit capability only';


--
-- Name: pwa_chat_turn_begin_v1(jsonb, uuid, jsonb); Type: FUNCTION
--

CREATE FUNCTION public.pwa_chat_turn_begin_v1(actor jsonb, thread uuid, message jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); t public.pwa_chat_threads; u public.pwa_chat_messages; a public.pwa_chat_messages;
 message_id uuid; next_seq integer; top_epoch integer; history_rows jsonb; seed jsonb; partner_language text;
BEGIN
 IF message IS NULL OR jsonb_typeof(message)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(message) key) IS DISTINCT FROM ARRAY['id','text']::text[]
  OR jsonb_typeof(message->'id')<>'string' OR message->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  OR jsonb_typeof(message->'text')<>'string' OR length(message->>'text') NOT BETWEEN 1 AND 4000 OR octet_length(message->>'text')>16384 THEN
  RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 message_id:=(message->>'id')::uuid;
 SELECT * INTO t FROM public.pwa_chat_threads x WHERE x.id=thread AND x.partner_id=partner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO u FROM public.pwa_chat_messages m WHERE m.id=message_id;
 IF FOUND THEN
  IF u.thread_id<>t.id OR u.role<>'user' THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
  IF u.text<>message->>'text' THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  SELECT * INTO a FROM public.pwa_chat_messages m WHERE m.thread_id=t.id AND m.seq=u.seq+1 AND m.role='assistant';
  IF FOUND THEN RETURN jsonb_build_object('state','completed','user',public.pwa_chat_message_json_v1(u),'assistant',public.pwa_chat_message_json_v1(a)); END IF;
  IF EXISTS(SELECT 1 FROM public.pwa_chat_messages m WHERE m.thread_id=t.id AND m.role='user' AND m.claimed_at>clock_timestamp()-interval '5 minutes') THEN
   RAISE EXCEPTION 'turn_in_progress' USING ERRCODE='55006'; END IF;
  UPDATE public.pwa_chat_messages m SET claimed_at=clock_timestamp(),detached_at=NULL WHERE m.id=u.id RETURNING * INTO u;
 ELSE
  IF t.status<>'active' THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.pwa_chat_messages m WHERE m.thread_id=t.id AND m.role='user' AND m.claimed_at>clock_timestamp()-interval '5 minutes') THEN
   RAISE EXCEPTION 'turn_in_progress' USING ERRCODE='55006'; END IF;
  IF t.message_count+2>2000 THEN RAISE EXCEPTION 'thread_full' USING ERRCODE='54000'; END IF;
  SELECT coalesce(max(CASE WHEN m.role='user' THEN m.seq+1 ELSE m.seq END),0)+1 INTO next_seq FROM public.pwa_chat_messages m WHERE m.thread_id=t.id;
  INSERT INTO public.pwa_chat_messages(id,thread_id,seq,role,text,status,claimed_at) VALUES(message_id,t.id,next_seq,'user',message->>'text','ok',clock_timestamp()) RETURNING * INTO u;
  UPDATE public.pwa_chat_threads x SET message_count=x.message_count+1 WHERE x.id=t.id RETURNING * INTO t;
 END IF;
 SELECT max(h.epoch) INTO top_epoch FROM public.pwa_chat_history h WHERE h.thread_id=t.id;
 SELECT jsonb_agg(jsonb_build_object('seq',h.seq,'role',h.role,'content',h.content,'prompt_sha256',h.prompt_sha256,'input_tokens',h.input_tokens) ORDER BY h.seq)
  INTO history_rows FROM public.pwa_chat_history h WHERE h.thread_id=t.id AND h.epoch=top_epoch;
 SELECT coalesce(jsonb_agg(x.e ORDER BY x.seq),'[]'::jsonb) INTO seed FROM (
  SELECT q.seq,jsonb_build_object('userText',q.text,'userAt',public.pwa_chat_iso_v1(q.created_at),'assistantText',r.text,'assistantStatus',r.status,'assistantAt',public.pwa_chat_iso_v1(r.created_at)) AS e
  FROM public.pwa_chat_messages q JOIN public.pwa_chat_messages r ON r.thread_id=q.thread_id AND r.seq=q.seq+1 AND r.role='assistant'
  WHERE q.thread_id=t.id AND q.role='user' AND q.id<>u.id ORDER BY q.seq DESC LIMIT 200) x;
 SELECT p."Language Preference" INTO partner_language FROM public."Partners" p WHERE p."Row ID"=partner;
 RETURN jsonb_build_object('state','claimed','message',jsonb_build_object('id',u.id,'seq',u.seq,'createdAt',public.pwa_chat_iso_v1(u.created_at)),
  'thread',jsonb_build_object('id',t.id,'model',t.model,'title',t.title,'messageCount',t.message_count),'partnerLanguage',partner_language,
  'history',CASE WHEN history_rows IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('epoch',top_epoch,'rows',history_rows) END,'seed',seed);
END $_$;


--
-- Name: FUNCTION pwa_chat_turn_begin_v1(actor jsonb, thread uuid, message jsonb); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_chat_turn_begin_v1(actor jsonb, thread uuid, message jsonb) IS 'mw-access:governance fixed chat boundary; explicit capability only';


--
-- Name: pwa_chat_turn_complete_v1(jsonb, uuid, jsonb, jsonb, jsonb); Type: FUNCTION
--

CREATE FUNCTION public.pwa_chat_turn_complete_v1(actor jsonb, message_id uuid, assistant jsonb, history jsonb, tool_calls jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); t public.pwa_chat_threads; u public.pwa_chat_messages; a public.pwa_chat_messages;
 top_epoch integer; top_seq integer; item jsonb; offset_value integer:=0; total integer; first_line text; n text;
BEGIN
 SELECT m.* INTO u FROM public.pwa_chat_messages m JOIN public.pwa_chat_threads x ON x.id=m.thread_id WHERE m.id=message_id AND m.role='user' AND x.partner_id=partner;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO t FROM public.pwa_chat_threads x WHERE x.id=u.thread_id FOR UPDATE;
 SELECT m.* INTO u FROM public.pwa_chat_messages m WHERE m.id=u.id FOR UPDATE;
 IF assistant IS NULL OR jsonb_typeof(assistant)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(assistant) key) IS DISTINCT FROM
   ARRAY['attempts','cachedTokens','errorCode','latencyMs','model','outputTokens','promptTokens','rounds','status','text','thinkingLevel','thoughtsTokens']::text[]
  OR assistant->>'status' NOT IN ('ok','failed') OR jsonb_typeof(assistant->'text')<>'string' OR jsonb_typeof(assistant->'model')<>'string'
  OR ((assistant->>'status')='ok')<>(jsonb_typeof(assistant->'errorCode')='null')
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['attempts','cachedTokens','latencyMs','outputTokens','promptTokens','rounds','thoughtsTokens']) k
   WHERE jsonb_typeof(assistant->k)<>'number' OR (assistant->>k)::numeric<0 OR (assistant->>k)::numeric<>trunc((assistant->>k)::numeric) OR (assistant->>k)::numeric>2147483647)
  OR (assistant->>'status'='ok' AND history IS NULL) OR (assistant->>'status'='failed' AND history IS NOT NULL AND jsonb_typeof(history)<>'null')
  OR tool_calls IS NULL OR jsonb_typeof(tool_calls)<>'array' OR jsonb_array_length(tool_calls)>1000 THEN
  RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 INSERT INTO public.pwa_chat_messages(id,thread_id,seq,role,text,status,model,thinking_level,rounds,attempts,prompt_tokens,output_tokens,thoughts_tokens,cached_tokens,latency_ms,error_code)
 VALUES(gen_random_uuid(),u.thread_id,u.seq+1,'assistant',assistant->>'text',assistant->>'status',assistant->>'model',assistant->>'thinkingLevel',
  least((assistant->>'rounds')::integer,32767),least((assistant->>'attempts')::integer,32767),(assistant->>'promptTokens')::integer,(assistant->>'outputTokens')::integer,
  (assistant->>'thoughtsTokens')::integer,(assistant->>'cachedTokens')::integer,(assistant->>'latencyMs')::integer,assistant->>'errorCode') RETURNING * INTO a;
 IF assistant->>'status'='ok' THEN
  IF jsonb_typeof(history)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(history) key) IS DISTINCT FROM ARRAY['epoch','inputTokens','messages','promptSha256','seq']::text[]
   OR jsonb_typeof(history->'epoch')<>'number' OR jsonb_typeof(history->'seq')<>'number' OR jsonb_typeof(history->'messages')<>'array' OR jsonb_array_length(history->'messages')<1
   OR coalesce(history->>'promptSha256','') !~ '^[0-9a-f]{64}$' OR jsonb_typeof(history->'inputTokens') NOT IN ('number','null') THEN
   RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  SELECT max(h.epoch) INTO top_epoch FROM public.pwa_chat_history h WHERE h.thread_id=u.thread_id;
  SELECT max(h.seq) INTO top_seq FROM public.pwa_chat_history h WHERE h.thread_id=u.thread_id AND h.epoch=top_epoch;
  IF NOT ((top_epoch IS NULL AND (history->>'epoch')::integer=0 AND (history->>'seq')::integer=0)
   OR ((history->>'epoch')::integer=top_epoch AND (history->>'seq')::integer=top_seq+1)
   OR ((history->>'epoch')::integer=top_epoch+1 AND (history->>'seq')::integer=0)) THEN
   RAISE EXCEPTION 'history_conflict' USING ERRCODE='40001'; END IF;
  total:=jsonb_array_length(history->'messages');
  FOR item IN SELECT value FROM jsonb_array_elements(history->'messages') LOOP
   IF jsonb_typeof(item)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(item) key) IS DISTINCT FROM ARRAY['content','role']::text[]
    OR item->>'role' NOT IN ('user','model') OR jsonb_typeof(item->'content')<>'string' THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
   INSERT INTO public.pwa_chat_history(thread_id,epoch,seq,message_id,role,content,prompt_sha256,input_tokens)
   VALUES(u.thread_id,(history->>'epoch')::integer,(history->>'seq')::integer+offset_value,u.id,item->>'role',item->>'content',history->>'promptSha256',
    CASE WHEN offset_value=total-1 THEN (history->>'inputTokens')::integer END);
   offset_value:=offset_value+1;
  END LOOP;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(tool_calls) LOOP
  IF jsonb_typeof(item)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(item) key) IS DISTINCT FROM ARRAY['arguments','callId','error','ms','name','result','round']::text[]
   OR jsonb_typeof(item->'callId')<>'string' OR jsonb_typeof(item->'name')<>'string' OR jsonb_typeof(item->'arguments')<>'string' OR jsonb_typeof(item->'round')<>'number'
   OR jsonb_typeof(item->'result') NOT IN ('string','null') OR jsonb_typeof(item->'error') NOT IN ('string','null') OR jsonb_typeof(item->'ms') NOT IN ('number','null') THEN
   RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  INSERT INTO public.pwa_chat_tool_calls(message_id,call_id,round,name,arguments,result,error,ms)
  VALUES(a.id,item->>'callId',(item->>'round')::smallint,item->>'name',item->>'arguments',item->>'result',item->>'error',(item->>'ms')::integer);
 END LOOP;
 UPDATE public.pwa_chat_messages m SET claimed_at=NULL WHERE m.id=u.id AND m.claimed_at IS NOT NULL;
 first_line:=left(btrim(split_part(btrim(u.text,E' \t\r\n'),E'\n',1),E' \t\r'),120);
 n:=CASE WHEN t.title='New chat' AND first_line<>'' AND first_line !~ '[[:cntrl:]]' THEN first_line ELSE t.title END;
 UPDATE public.pwa_chat_threads x SET message_count=x.message_count+1,last_message_at=clock_timestamp(),title=n WHERE x.id=t.id;
 RETURN public.pwa_chat_message_json_v1(a)||jsonb_build_object('detached',u.detached_at IS NOT NULL);
END $_$;


--
-- Name: FUNCTION pwa_chat_turn_complete_v1(actor jsonb, message_id uuid, assistant jsonb, history jsonb, tool_calls jsonb); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_chat_turn_complete_v1(actor jsonb, message_id uuid, assistant jsonb, history jsonb, tool_calls jsonb) IS 'mw-access:governance fixed chat boundary; explicit capability only';


--
-- Name: pwa_chat_turn_presence_v1(jsonb, uuid, uuid, text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_chat_turn_presence_v1(actor jsonb, thread uuid, message uuid, state text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE partner text:=public.pwa_chat_actor_v1(actor); u public.pwa_chat_messages;
BEGIN
 IF thread IS NULL OR message IS NULL OR state IS NULL OR state NOT IN ('hidden','visible') THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 -- The user row is locked like the completion locks it: whichever runs second sees the other's result.
 SELECT m.* INTO u FROM public.pwa_chat_messages m JOIN public.pwa_chat_threads t ON t.id=m.thread_id
 WHERE m.id=message AND m.thread_id=thread AND t.partner_id=partner FOR UPDATE OF m;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='42501'; END IF;
 IF u.role<>'user' THEN RETURN jsonb_build_object('state','idle'); END IF;
 IF EXISTS(SELECT 1 FROM public.pwa_chat_messages m WHERE m.thread_id=u.thread_id AND m.seq=u.seq+1 AND m.role='assistant') THEN
  RETURN jsonb_build_object('state','completed'); END IF;
 IF u.claimed_at IS NULL THEN RETURN jsonb_build_object('state','idle'); END IF;
 IF state='hidden' AND u.detached_at IS NULL THEN
  UPDATE public.pwa_chat_messages m SET detached_at=clock_timestamp() WHERE m.id=u.id RETURNING * INTO u;
 ELSIF state='visible' AND u.detached_at IS NOT NULL THEN
  UPDATE public.pwa_chat_messages m SET detached_at=NULL WHERE m.id=u.id RETURNING * INTO u;
 END IF;
 RETURN jsonb_build_object('state','claimed','detached',u.detached_at IS NOT NULL);
END $$;


--
-- Name: FUNCTION pwa_chat_turn_presence_v1(actor jsonb, thread uuid, message uuid, state text); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_chat_turn_presence_v1(actor jsonb, thread uuid, message uuid, state text) IS 'mw-access:governance fixed chat boundary; explicit capability only';


--
-- Name: pwa_claim_notifications_v1(integer, integer); Type: FUNCTION
--

CREATE FUNCTION public.pwa_claim_notifications_v1(p_limit integer, p_seconds integer) RETURNS SETOF public.pwa_notification_deliveries
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 IF p_limit IS NULL OR p_seconds IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_seconds NOT BETWEEN 5 AND 120 THEN RAISE EXCEPTION 'Invalid claim bounds'; END IF;
 UPDATE public.pwa_notification_deliveries SET state=CASE WHEN send_started_at IS NULL AND attempts<8 THEN 'retry' ELSE 'uncertain' END,lease_expires_at=NULL,provider_result='lease_expired'
 WHERE state='leased' AND lease_expires_at<=clock_timestamp();
 RETURN QUERY WITH due AS (
 SELECT delivery_id FROM public.pwa_notification_deliveries WHERE state IN ('pending','retry') AND attempts<8 AND next_attempt_at<=clock_timestamp()
 ORDER BY next_attempt_at,delivery_id FOR UPDATE SKIP LOCKED LIMIT p_limit)
 UPDATE public.pwa_notification_deliveries d SET state='leased',lease_generation=d.lease_generation+1,
 lease_expires_at=clock_timestamp()+make_interval(secs=>p_seconds),send_started_at=NULL,attempts=d.attempts+1
 FROM due WHERE d.delivery_id=due.delivery_id RETURNING d.*;
END $$;


--
-- Name: FUNCTION pwa_claim_notifications_v1(p_limit integer, p_seconds integer); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_claim_notifications_v1(p_limit integer, p_seconds integer) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_command_status_v1(uuid, text, text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_command_status_v1(request_id uuid, actor_issuer text, actor_subject text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE r public.pwa_payment_commands%ROWTYPE; matches integer;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR NOT pg_has_role(session_user,CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END,'MEMBER') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Application session required';END IF;
 SELECT * INTO r FROM public.pwa_payment_commands p WHERE p.request_id=$1 AND p.contract_version=1 AND p.actor_issuer=$2 AND p.actor_subject=$3;
 IF NOT FOUND THEN RETURN jsonb_build_object('kind','unresolved'); END IF;
 SELECT count(*) INTO matches FROM public."Partners" WHERE lower(btrim("Login Email"))=r.actor_login_email;
 IF matches<>1 OR NOT EXISTS(SELECT 1 FROM public."Partners" WHERE "Row ID"=r.actor_partner_id AND lower(btrim("Login Email"))=r.actor_login_email) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current actor mapping required';
 END IF;
 RETURN jsonb_build_object('kind','recorded','originalOutcome',jsonb_build_object('status',r.outcome,'paymentId',r.payment_id,'code',r.rejection_code,'recordedAt',to_char(r.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
END $_$;


--
-- Name: pwa_convert_legacy_rebate_v1(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_convert_legacy_rebate_v1(p_expense_id text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE x public."Business Expenses"%ROWTYPE; payee text; offset_amount numeric; ledger_before numeric; ledger_after numeric;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF NOT has_function_privilege(current_user,'public.sync_cash_ledger(text,text)','EXECUTE') THEN
  RAISE EXCEPTION 'Run the conversion as a role that executes sync_cash_ledger (postgres inside the ledger owner window)'; END IF;
 SELECT "Ref Payee Borrower" INTO payee FROM public."Business Expenses" WHERE "Row ID"=p_expense_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown expense %',p_expense_id; END IF;
 IF payee IS NOT NULL THEN PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('borrower',payee)); END IF;
 SELECT * INTO x FROM public."Business Expenses" WHERE "Row ID"=p_expense_id FOR UPDATE;
 IF x."Source Type" IS DISTINCT FROM 'Referral Rebate' THEN RAISE EXCEPTION 'Only a referral rebate expense can be converted'; END IF;
 IF x."Rule Version"='REFERRAL_REBATE_V3' THEN RAISE EXCEPTION 'This rebate is already pending payment (REFERRAL_REBATE_V3)'; END IF;
 IF x."Ref Rebate Settlement" IS NOT NULL THEN RAISE EXCEPTION 'This rebate is paid by a settlement'; END IF;
 IF x."Rule Version" IS DISTINCT FROM 'REFERRAL_REBATE_V2' OR x."Rebate Rate" IS NULL OR x."Rebate Cap" IS NULL THEN
  RAISE EXCEPTION 'Only a REFERRAL_REBATE_V2 rebate with its terms can be converted (a V1 row carries no terms)'; END IF;
 IF EXISTS(SELECT 1 FROM public.r005_cash_cutover_sources WHERE source_type='Business Expense' AND source_row_id=p_expense_id) THEN
  RAISE EXCEPTION 'A cash cutover source cannot be converted'; END IF;
 offset_amount:=coalesce((SELECT o."Amount Received"::numeric FROM public."Payments" o WHERE o."Row ID"=x."Ref Offset Payment" AND o."Status"='Posted'),0);
 IF x."Amount"::numeric-offset_amount<=0 THEN RAISE EXCEPTION 'Nothing is unpaid on this rebate (settled by offset)'; END IF;
 SELECT "Amount" INTO ledger_before FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"='Business Expense' AND "Source Key"='EXPENSE:'||p_expense_id;
 -- The rule change re-projects the expense through its own cash trigger (UPDATE OF "Amount", same value; nothing disabled).
 PERFORM set_config('pwa.rebate_convert',p_expense_id,true);
 UPDATE public."Business Expenses" SET "Rule Version"='REFERRAL_REBATE_V3',"Amount"="Amount" WHERE "Row ID"=p_expense_id;
 PERFORM set_config('pwa.rebate_convert','',true);
 SELECT "Amount" INTO ledger_after FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"='Business Expense' AND "Source Key"='EXPENSE:'||p_expense_id;
 IF ledger_after IS DISTINCT FROM nullif(offset_amount,0) OR public.pwa_rebate_pending_v1(p_expense_id) IS DISTINCT FROM x."Amount"::numeric-offset_amount THEN
  RAISE EXCEPTION 'Converted rebate differs from the rule'; END IF;
 RETURN jsonb_build_object('expenseId',p_expense_id,'amount',x."Amount"::numeric,'offsetAmount',offset_amount,'pendingAmount',public.pwa_rebate_pending_v1(p_expense_id),
  'ledgerBefore',ledger_before,'ledgerAfter',ledger_after);
END $$;


--
-- Name: FUNCTION pwa_convert_legacy_rebate_v1(p_expense_id text); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_convert_legacy_rebate_v1(p_expense_id text) IS 'mw-access:governance R129 D1 owner-authorized one-off: a REFERRAL_REBATE_V2 rebate never paid at close becomes pending (V3); its cash entry becomes the offset amount or goes. postgres only.';


--
-- Name: pwa_effective_payment_plan_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_effective_payment_plan_v2(p_id text) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE r public.pwa_payment_commands%ROWTYPE; revision public.pwa_payment_commands%ROWTYPE;
 origin uuid; head uuid; source_creator text; origin_actor jsonb; correction_actor jsonb; plan jsonb; c jsonb; matches integer; visited uuid[];
BEGIN
 SELECT count(*) INTO matches FROM public.pwa_payment_commands j WHERE
  (j.contract_version=1 AND j.payment_id=p_id AND j.outcome='posted' AND j.canonical_json::jsonb#>>'{command,schemaVersion}' IN ('6','7','8','9','10','11') AND jsonb_typeof(j.canonical_json::jsonb#>'{command,allocations}')='array') OR
  (j.contract_version=2 AND j.outcome='applied' AND j.result_json->>'paymentId'=p_id AND j.canonical_json::jsonb#>>'{command,operation}' IN('loan.create','loan.close','charge.create','system.rebate-offset','loan.rollover')) OR
  -- R136: the settlement payment of a rollover.
  (j.contract_version=2 AND j.outcome='applied' AND j.result_json#>>'{settlement,paymentId}'=p_id AND j.canonical_json::jsonb#>>'{command,operation}'='loan.rollover') OR
  -- R111: the Referral Rebate Offset payment of a Loan Close.
  (j.contract_version=2 AND j.outcome='applied' AND j.result_json#>>'{rebate,offsetPaymentId}'=p_id AND j.canonical_json::jsonb#>>'{command,operation}'='loan.close');
 IF matches=0 THEN RETURN NULL;END IF;
 IF matches<>1 THEN RAISE EXCEPTION 'Ambiguous payment provenance';END IF;
 SELECT * INTO STRICT r FROM public.pwa_payment_commands j WHERE
  (j.contract_version=1 AND j.payment_id=p_id AND j.outcome='posted' AND j.canonical_json::jsonb#>>'{command,schemaVersion}' IN ('6','7','8','9','10','11') AND jsonb_typeof(j.canonical_json::jsonb#>'{command,allocations}')='array') OR
  (j.contract_version=2 AND j.outcome='applied' AND j.result_json->>'paymentId'=p_id AND j.canonical_json::jsonb#>>'{command,operation}' IN('loan.create','loan.close','charge.create','system.rebate-offset','loan.rollover')) OR
  -- R136: the settlement payment of a rollover.
  (j.contract_version=2 AND j.outcome='applied' AND j.result_json#>>'{settlement,paymentId}'=p_id AND j.canonical_json::jsonb#>>'{command,operation}'='loan.rollover') OR
  -- R111: the Referral Rebate Offset payment of a Loan Close.
  (j.contract_version=2 AND j.outcome='applied' AND j.result_json#>>'{rebate,offsetPaymentId}'=p_id AND j.canonical_json::jsonb#>>'{command,operation}'='loan.close');
 origin:=r.request_id;head:=origin;visited:=ARRAY[head];origin_actor:=r.canonical_json::jsonb->'actor';source_creator:=CASE WHEN r.result_json ? 'sourceCreatedBy' THEN r.result_json->>'sourceCreatedBy' ELSE origin_actor->>'loginEmail' END;
 IF r.contract_version=1 THEN
  c:=r.canonical_json::jsonb->'command';
  plan:=jsonb_build_object('borrowerId',c->'borrowerId','amountReceived',c->'amountReceived','allocations',c->'allocations','allocationMethod','Selected Charges','targetChargeId',NULL,'targetLoanId',NULL,'cashAccountId',c->'cashAccountId','paymentDate',c->'paymentDate','paymentMethod',CASE WHEN c ? 'reviewId' THEN to_jsonb('Bank Transfer'::text) ELSE c->'paymentMethod' END);
 ELSIF r.result_json#>>'{settlement,paymentId}'=p_id THEN plan:=r.result_json#>'{settlement,plan}'; -- R136
 ELSIF r.result_json#>>'{rebate,offsetPaymentId}'=p_id THEN plan:=r.result_json#>'{rebate,offsetPlan}';
 ELSE plan:=r.result_json->'plan';END IF;
 LOOP
  SELECT count(*) INTO matches FROM public.pwa_payment_commands j WHERE j.contract_version=2 AND j.outcome='applied'
   AND j.canonical_json::jsonb#>>'{command,operation}'='payment.correct'
   AND j.canonical_json::jsonb#>>'{command,targetType}'='payment' AND j.canonical_json::jsonb#>>'{command,targetId}'=p_id
   AND j.canonical_json::jsonb#>>'{command,predecessorRequestId}'=head::text;
  EXIT WHEN matches=0;
  IF matches<>1 OR cardinality(visited)>=10000 THEN RAISE EXCEPTION 'Invalid payment revision lineage';END IF;
  SELECT * INTO STRICT revision FROM public.pwa_payment_commands j WHERE j.contract_version=2 AND j.outcome='applied'
   AND j.canonical_json::jsonb#>>'{command,operation}'='payment.correct'
   AND j.canonical_json::jsonb#>>'{command,targetType}'='payment' AND j.canonical_json::jsonb#>>'{command,targetId}'=p_id
   AND j.canonical_json::jsonb#>>'{command,predecessorRequestId}'=head::text;
  IF revision.request_id=ANY(visited) OR revision.result_json->>'paymentId' IS DISTINCT FROM p_id THEN RAISE EXCEPTION 'Invalid payment revision identity';END IF;
  head:=revision.request_id;visited:=array_append(visited,head);correction_actor:=revision.canonical_json::jsonb->'actor';plan:=revision.result_json->'plan';
 END LOOP;
 IF (SELECT count(*) FROM public.pwa_payment_commands j WHERE j.contract_version=2 AND j.outcome='applied' AND j.canonical_json::jsonb#>>'{command,operation}'='payment.correct' AND j.canonical_json::jsonb#>>'{command,targetType}'='payment' AND j.canonical_json::jsonb#>>'{command,targetId}'=p_id)<>cardinality(visited)-1 THEN RAISE EXCEPTION 'Disconnected payment revision lineage';END IF;
 IF jsonb_typeof(plan) IS DISTINCT FROM 'object' OR jsonb_typeof(plan->'allocations') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Missing payment provenance plan';END IF;
 RETURN jsonb_build_object('sourceCreatedBy',source_creator,'originActor',origin_actor,'correctionActor',correction_actor,'plan',plan,'originRequestId',origin,'effectivePlanRequestId',head);
END $$;


--
-- Name: pwa_expense_version_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_expense_version_v2(id text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
 SELECT encode(sha256(convert_to(jsonb_build_object('source',to_jsonb(e),'ledger',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c."Row ID" COLLATE "C") FROM public."Cash Ledger" c WHERE c."Ref Business Expense"=e."Row ID"),'[]'))::text,'UTF8')),'hex') FROM public."Business Expenses" e WHERE e."Row ID"=$1;
$_$;


--
-- Name: pwa_job_run_v1(text, date, text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_job_run_v1(job text, business_date date, scope text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE boundary timestamp:=clock_timestamp() AT TIME ZONE 'Asia/Bangkok'; r public.pwa_job_runs; affected bigint; started timestamptz;
BEGIN
 PERFORM public.pwa_worker_guard_v1('jobs');
 IF job IS NULL OR job NOT IN ('daily-charges','recent-analytics') OR business_date IS NULL OR NOT isfinite(business_date) OR scope IS NULL
 OR (job='daily-charges' AND scope<>'daily') OR (job='recent-analytics' AND scope !~ '^hour:(0[0-9]|1[0-9]|2[0-3])$') THEN RAISE EXCEPTION 'invalid_job'; END IF;
 IF business_date<>boundary::date OR (job='recent-analytics' AND scope<>'hour:'||to_char(boundary,'HH24')) THEN RAISE EXCEPTION 'job_boundary_changed'; END IF;
 INSERT INTO public.pwa_job_runs(job_name,business_date,scope_key,state) VALUES(job,$2,scope,'pending') ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT r FROM public.pwa_job_runs j WHERE j.job_name=job AND j.business_date=$2 AND j.scope_key=scope FOR UPDATE;
 IF r.state='completed' THEN RETURN jsonb_build_object('enabled',true,'state','completed','replayed',true,'resultCount',r.result_count); END IF;
 IF r.state<>'pending' THEN RAISE EXCEPTION 'job_requires_reconciliation'; END IF;
 started:=clock_timestamp();
 IF job='daily-charges' THEN affected:=public.generate_due_charges($2); ELSE affected:=public.refresh_daily_analytics($2-1,$2); PERFORM public.pwa_row_changes_prune_v1(); END IF;
 UPDATE public.pwa_job_runs SET state='completed',started_at=started,completed_at=clock_timestamp(),checkpoint=$2::text||'|'||scope,result_count=affected WHERE run_id=r.run_id;
 RETURN jsonb_build_object('enabled',true,'state','completed','replayed',false,'resultCount',affected);
END $_$;


--
-- Name: FUNCTION pwa_job_run_v1(job text, business_date date, scope text); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_job_run_v1(job text, business_date date, scope text) IS 'mw-access:governance fixed atomic scheduled jobs; explicit capability only';


--
-- Name: pwa_job_status_v1(integer); Type: FUNCTION
--

CREATE FUNCTION public.pwa_job_status_v1(days integer) RETURNS TABLE(job_name text, business_date date, scope_key text, state text, started_at timestamp with time zone, completed_at timestamp with time zone, result_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF days IS NULL OR days NOT BETWEEN 1 AND 90 THEN RAISE EXCEPTION 'invalid_request'; END IF;
 RETURN QUERY SELECT j.job_name,j.business_date,j.scope_key,j.state,j.started_at,j.completed_at,j.result_count
 FROM public.pwa_job_runs j
 WHERE j.business_date>=(clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date-days
 ORDER BY j.business_date DESC,j.job_name,j.scope_key LIMIT 500;
END $$;


--
-- Name: FUNCTION pwa_job_status_v1(days integer); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_job_status_v1(days integer) IS 'mw-access:governance read-only job status for the chat SQL tool';


--
-- Name: pwa_loan_version_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_loan_version_v2(id text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
 SELECT encode(sha256(convert_to(jsonb_build_object('source',to_jsonb(l),
  'charges',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c."Row ID" COLLATE "C"),'[]'::jsonb) FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID"),
  'repayments',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r."Row ID" COLLATE "C"),'[]'::jsonb) FROM public."Repayments" r WHERE r."Ref Loans"=l."Row ID"))::text,'UTF8')),'hex')
 FROM public."Loans" l WHERE l."Row ID"=$1;
$_$;


--
-- Name: pwa_lock_key_v1(text, text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_lock_key_v1(kind text, target text) RETURNS bigint
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    AS $$
 SELECT pg_catalog.hashtextextended(kind OPERATOR(pg_catalog.||) ':' OPERATOR(pg_catalog.||) target, 0)
$$;


--
-- Name: FUNCTION pwa_lock_key_v1(kind text, target text); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_lock_key_v1(kind text, target text) IS 'Advisory lock key: hashtextextended(kind||'':''||target,0). Shared by SQL and services/business/borrowers.mjs.';


--
-- Name: pwa_management_financial_text_v2(text, jsonb); Type: FUNCTION
--

CREATE FUNCTION public.pwa_management_financial_text_v2(op text, i jsonb) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE keys text[];k text;result text:='{';wd_line jsonb;wd_n integer:=0;kind text:=split_part(op,'.',1);action text:=split_part(op,'.',2);
BEGIN
 IF op NOT IN('capital-contribution.create','capital-contribution.update','capital-contribution.delete','settlement.create','settlement.update','settlement.complete','settlement.reverse','settlement.cancel','settlement.settle-all','cash-movement.create','cash-movement.update','cash-movement.delete','cash-withdrawal.create') OR jsonb_typeof(i) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF op='cash-withdrawal.create' THEN
  -- R115 (V127): {movementDate, movementTime, toAccountId, lines:[{fromAccountId, amount}]}, 1 to 10 positive whole-baht lines.
  IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['lines','movementDate','movementTime','toAccountId'] THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  IF jsonb_typeof(i->'movementDate') IS DISTINCT FROM 'string' OR i->>'movementDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'movementDate')::date)::text<>i->>'movementDate'
   OR jsonb_typeof(i->'movementTime') IS DISTINCT FROM 'string' OR i->>'movementTime'!~'^([01][0-9]|2[0-3]):[0-5]0$'
   OR jsonb_typeof(i->'toAccountId') IS DISTINCT FROM 'string' OR octet_length(i->>'toAccountId') NOT BETWEEN 1 AND 256 OR i->>'toAccountId'~'[[:cntrl:]]'
   OR jsonb_typeof(i->'lines') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  IF jsonb_array_length(i->'lines') NOT BETWEEN 1 AND 10 OR (SELECT count(DISTINCT l->>'fromAccountId') FROM jsonb_array_elements(i->'lines') l)<>jsonb_array_length(i->'lines') THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  result:='{"movementDate":'||to_json(i->>'movementDate')::text||',"movementTime":'||to_json(i->>'movementTime')::text||',"toAccountId":'||to_json(i->>'toAccountId')::text||',"lines":[';
  FOR wd_line IN SELECT l FROM jsonb_array_elements(i->'lines') l LOOP
   wd_n:=wd_n+1;
   IF jsonb_typeof(wd_line) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(wd_line) key) IS DISTINCT FROM ARRAY['amount','fromAccountId']
    OR jsonb_typeof(wd_line->'fromAccountId') IS DISTINCT FROM 'string' OR octet_length(wd_line->>'fromAccountId') NOT BETWEEN 1 AND 256 OR wd_line->>'fromAccountId'~'[[:cntrl:]]' OR wd_line->>'fromAccountId'=i->>'toAccountId'
    OR jsonb_typeof(wd_line->'amount') IS DISTINCT FROM 'string' OR wd_line->>'amount'!~'^[1-9][0-9]{0,16}$' OR (wd_line->>'amount')::numeric>92233720368547758 THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
   result:=result||CASE WHEN wd_n>1 THEN ',' ELSE '' END||'{"fromAccountId":'||to_json(wd_line->>'fromAccountId')::text||',"amount":'||to_json(wd_line->>'amount')::text||'}';
  END LOOP;
  RETURN result||']}';
 END IF;
 IF action IN('delete','reverse','cancel') THEN IF i<>'{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;RETURN '{}';END IF;
 IF action='complete' THEN keys:=ARRAY['cashAccountId'];ELSIF action='settle-all' THEN keys:=ARRAY['partnerId','reviewedAmount','notes'];
 ELSIF kind='capital-contribution' THEN keys:=ARRAY['partnerId','contributionDate','transactionType','amount','notes'];
 ELSIF kind='settlement' THEN keys:=ARRAY['settlementDate','partnerId','amount','status','transferDate','notes','cashAccountId'];
 ELSE keys:=ARRAY['movementDate','movementType','amount','fromAccountId','toAccountId','businessExpenseId','notes'];END IF;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM unnest(keys) key) THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 FOREACH k IN ARRAY keys LOOP
 IF jsonb_typeof(i->k) NOT IN('string','null') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF k LIKE '%Id' AND i->k<>'null'::jsonb AND (octet_length(i->>k) NOT BETWEEN 1 AND 256 OR i->>k~'[[:cntrl:]]') THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF k='partnerId' AND i->k='null'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF k LIKE '%Date' AND NOT(k='transferDate' AND i->k='null'::jsonb) AND (jsonb_typeof(i->k) IS DISTINCT FROM 'string' OR i->>k!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>k)::date)::text<>i->>k) THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF k IN('amount','reviewedAmount') AND (jsonb_typeof(i->k) IS DISTINCT FROM 'string' OR i->>k!~'^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' OR (i->>k)::numeric<=0 OR (i->>k)::numeric>92233720368547758.07) THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF kind='cash-movement' AND k='amount' AND i->>k!~'^[1-9][0-9]*$' THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF k='transactionType' AND i->>k NOT IN('Contribution','Withdrawal') OR k='movementType' AND i->>k NOT IN('Cash Handover','Expense Reimbursement') OR k='status' AND i->>k NOT IN('Pending','Completed','Cancelled') THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF k IN('transactionType','movementType','status') AND i->k='null'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 result:=result||CASE WHEN result='{' THEN '' ELSE ',' END||to_json(k)::text||':'||coalesce(to_json(i->>k)::text,'null');END LOOP;RETURN result||'}';
END $_$;


--
-- Name: pwa_management_input_text_v2(text, jsonb); Type: FUNCTION
--

CREATE FUNCTION public.pwa_management_input_text_v2(op text, i jsonb) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE keys text[];k text;result text:='{';
BEGIN
 IF op NOT IN('cash-holder.create','cash-holder.update','cash-holder.delete','cash-account.create','cash-account.update','cash-account.delete','partner.create','partner.update','partner.delete') OR jsonb_typeof(i) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF split_part(op,'.',2)='delete' THEN IF i<>'{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;RETURN '{}';END IF;
 IF split_part(op,'.',1)='cash-holder' THEN keys:=ARRAY['holderName','active','sortOrder'];
 ELSIF split_part(op,'.',1)='cash-account' THEN keys:=ARRAY['cashHolderId','accountLabel','bankName','accountNumber','alternativeAccountNumber','defaultAccount','active','sortOrder'];
 IF op='cash-account.update' THEN keys:=array_remove(keys,'cashHolderId');END IF;
 ELSIF split_part(op,'.',1)='partner' THEN keys:=ARRAY['partnerName','partnerRole','loginEmail','email','instagramUsername','languagePreference','igIntegrationEnabled','aiReviewer'];
 END IF;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM unnest(keys) key) THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 FOREACH k IN ARRAY keys LOOP
  IF k IN('active','defaultAccount','aiReviewer') THEN IF jsonb_typeof(i->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  ELSIF k='igIntegrationEnabled' THEN IF jsonb_typeof(i->k) NOT IN('boolean','null') THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  ELSIF k='sortOrder' THEN IF jsonb_typeof(i->k) IS DISTINCT FROM 'number' OR i->>k!~'^-?(0|[1-9][0-9]*)$' OR (i->>k)::numeric NOT BETWEEN -2147483648 AND 2147483647 THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  ELSE IF jsonb_typeof(i->k) NOT IN('string','null') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;END IF;
  IF k IN('holderName','accountLabel','bankName','partnerName','partnerRole') AND (jsonb_typeof(i->k) IS DISTINCT FROM 'string' OR btrim(i->>k)='') THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  IF k='cashHolderId' AND (jsonb_typeof(i->k) IS DISTINCT FROM 'string' OR octet_length(i->>k) NOT BETWEEN 1 AND 256 OR i->>k~'[[:cntrl:]]') THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  IF k='partnerRole' AND i->>k NOT IN('A','B') THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  IF k='languagePreference' AND i->k<>'null'::jsonb AND i->>k NOT IN('English','ไทย') THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  IF k='loginEmail' AND i->k<>'null'::jsonb AND (btrim(i->>k)='' OR octet_length(i->>k)>320 OR i->>k~'[\r\n]') THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  IF k='email' AND nullif(btrim(i->>k),'') IS NOT NULL AND (octet_length(i->>k)>320 OR btrim(i->>k)!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
  result:=result||CASE WHEN result='{' THEN '' ELSE ',' END||to_json(k)::text||':'||CASE WHEN i->k='null'::jsonb THEN 'null' WHEN k IN('active','defaultAccount','aiReviewer','igIntegrationEnabled','sortOrder') THEN (i->k)::text ELSE to_json(i->>k)::text END;
 END LOOP;RETURN result||'}';
END $_$;


--
-- Name: pwa_management_tools_text_v2(text, jsonb); Type: FUNCTION
--

CREATE FUNCTION public.pwa_management_tools_text_v2(op text, i jsonb) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE keys text[];k text;result text:='{';row_value jsonb;previous_id text;items text:='';
BEGIN
 IF jsonb_typeof(i) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF op IN('assessment.refresh','assessment.delete') THEN IF i<>'{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;RETURN '{}';
 ELSIF op='analytics.refresh' THEN keys:=ARRAY['mode'];
 ELSIF op='cash-openings.initialize' THEN keys:=ARRAY['openings','reviewedBasisHash','notes'];
 ELSIF op IN('assessment.create','assessment.update') THEN keys:=ARRAY['assessmentId','borrowerId','proposedLoanAmount','minimumDailyProfitRate','forecastStart','forecastEnd'];
 ELSE RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM unnest(keys) key) THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF op='cash-openings.initialize' THEN
 IF jsonb_typeof(i->'openings') IS DISTINCT FROM 'array' OR jsonb_array_length(i->'openings') NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 FOR row_value IN SELECT value FROM jsonb_array_elements(i->'openings') LOOP
 IF jsonb_typeof(row_value) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(row_value) key) IS DISTINCT FROM ARRAY['accountId','amount']
 OR jsonb_typeof(row_value->'accountId') IS DISTINCT FROM 'string' OR octet_length(row_value->>'accountId') NOT BETWEEN 1 AND 256 OR row_value->>'accountId'~'[[:cntrl:]]'
 OR jsonb_typeof(row_value->'amount') IS DISTINCT FROM 'string' OR octet_length(row_value->>'amount')>65536 OR row_value->>'amount'!~'^(0|-?[1-9][0-9]*)$'
 OR (previous_id IS NOT NULL AND previous_id COLLATE "C">=(row_value->>'accountId') COLLATE "C") THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 items:=items||CASE WHEN items='' THEN '' ELSE ',' END||'{"accountId":'||to_json(row_value->>'accountId')::text||',"amount":'||to_json(row_value->>'amount')::text||'}';previous_id:=row_value->>'accountId';
 END LOOP;
 END IF;
 FOREACH k IN ARRAY keys LOOP
 IF k='openings' THEN result:=result||'"openings":['||items||']';CONTINUE;END IF;
 IF jsonb_typeof(i->k) NOT IN('string','null') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF k='borrowerId' AND i->k<>'null'::jsonb AND (octet_length(i->>k) NOT BETWEEN 1 AND 256 OR i->>k~'[[:cntrl:]]') THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF k IN('forecastStart','forecastEnd') AND (jsonb_typeof(i->k) IS DISTINCT FROM 'string' OR i->>k!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>k)::date)::text<>i->>k) THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF k='proposedLoanAmount' AND i->k<>'null'::jsonb AND (i->>k!~'^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' OR (i->>k)::numeric>92233720368547758.07) THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF k='minimumDailyProfitRate' AND i->k<>'null'::jsonb AND (i->>k!~'^(0|[1-9][0-9]*)(\.[0-9]+)?$' OR (i->>k)::numeric>3.4028234663852886e38) THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 IF k='mode' AND (i->>k IS NULL OR i->>k NOT IN('Recent','Full')) OR k='reviewedBasisHash' AND (i->>k IS NULL OR i->>k!~'^[a-f0-9]{64}$') OR op='cash-openings.initialize' AND k='notes' AND nullif(btrim(i->>k),'') IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
 result:=result||CASE WHEN result='{' THEN '' ELSE ',' END||to_json(k)::text||':'||coalesce(to_json(i->>k)::text,'null');END LOOP;RETURN result||'}';
END $_$;


--
-- Name: pwa_mark_group_chat_seen_v1(jsonb, text, timestamp with time zone); Type: FUNCTION
--

CREATE FUNCTION public.pwa_mark_group_chat_seen_v1(actor jsonb, p_borrower_id text, p_seen timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE matches integer; partner text; current_last timestamptz; target timestamptz; moved integer; kept timestamptz;
BEGIN
 -- The actor: exactly {issuer, loginEmail, partnerId, subject}, and the login email maps to exactly that Partner.
 IF actor IS NULL OR jsonb_typeof(actor) IS DISTINCT FROM 'object'
  OR (SELECT array_agg(key ORDER BY key COLLATE "C") FROM jsonb_object_keys(actor) key) IS DISTINCT FROM ARRAY['issuer','loginEmail','partnerId','subject']::text[]
  OR EXISTS(SELECT 1 FROM jsonb_each(actor) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'string')
  OR coalesce(length(actor->>'issuer'),0) NOT BETWEEN 1 AND 1024 OR coalesce(length(actor->>'subject'),0) NOT BETWEEN 1 AND 128
  OR coalesce(length(actor->>'partnerId'),0) NOT BETWEEN 1 AND 256 OR coalesce(length(actor->>'loginEmail'),0) NOT BETWEEN 1 AND 320
  OR actor->>'loginEmail'<>lower(btrim(actor->>'loginEmail')) THEN
  RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 SELECT count(*),min("Row ID") INTO matches,partner FROM public."Partners" WHERE lower(btrim("Login Email"))=actor->>'loginEmail';
 IF matches<>1 OR partner IS DISTINCT FROM actor->>'partnerId' THEN RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 IF p_borrower_id IS NULL OR octet_length(p_borrower_id) NOT BETWEEN 1 AND 256 OR p_seen IS NULL OR NOT isfinite(p_seen) THEN
  RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Borrowers" b WHERE b."Row ID"=p_borrower_id) THEN
  RAISE EXCEPTION 'unknown_borrower' USING ERRCODE='P0002'; END IF;
 -- Nothing to have seen without a summary; never beyond the stored summary (a clock ahead cannot hide a later one).
 SELECT s.last_message_at INTO current_last FROM public.pwa_group_chat_summaries s WHERE s.borrower_id=p_borrower_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('kind','ignored','seenAt',NULL); END IF;
 target:=LEAST(p_seen,current_last);
 -- Forward only: an equal or older value updates no row, so it writes no change-log row and no device refreshes.
 INSERT INTO public.pwa_group_chat_seen AS t(borrower_id,partner_id,seen_last_message_at,updated_at) VALUES(p_borrower_id,partner,target,clock_timestamp())
  ON CONFLICT (borrower_id,partner_id) DO UPDATE SET seen_last_message_at=EXCLUDED.seen_last_message_at,updated_at=EXCLUDED.updated_at
  WHERE t.seen_last_message_at<EXCLUDED.seen_last_message_at;
 GET DIAGNOSTICS moved=ROW_COUNT;
 SELECT t.seen_last_message_at INTO kept FROM public.pwa_group_chat_seen t WHERE t.borrower_id=p_borrower_id AND t.partner_id=partner;
 RETURN jsonb_build_object('kind',CASE WHEN moved>0 THEN 'stored' ELSE 'unchanged' END,
  'seenAt',to_char(kept AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END $$;


--
-- Name: FUNCTION pwa_mark_group_chat_seen_v1(actor jsonb, p_borrower_id text, p_seen timestamp with time zone); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_mark_group_chat_seen_v1(actor jsonb, p_borrower_id text, p_seen timestamp with time zone) IS 'R149: records that the actor (its login email must map to exactly its Partner, 42501 otherwise) has seen the borrower''s group chat summary up to p_seen. Forward only and clamped to the summary''s last_message_at; an equal or older value touches no row. Returns {kind: stored | unchanged | ignored (no summary), seenAt}. Raises unknown_borrower (P0002) or invalid_request (22023). Invoker rights.';


--
-- Name: pwa_native_inverse_permitted_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_native_inverse_permitted_v2(payment text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
 SELECT current_database() IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') AND current_user=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END
 AND nullif(current_setting('pwa.native_inverse_request',true),'') IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.pwa_payment_commands j WHERE j.request_id::text=current_setting('pwa.native_inverse_request',true)
  AND j.contract_version=2 AND j.outcome='applied' AND j.canonical_json::jsonb#>>'{command,operation}'='payment.correct'
  AND j.canonical_json::jsonb#>>'{command,targetId}'=$1
  AND j.actor_partner_id=(SELECT "Row ID" FROM public."Partners" WHERE lower(btrim("Login Email"))=j.actor_login_email)
  AND NOT EXISTS(SELECT 1 FROM public.pwa_payment_commands successor WHERE successor.contract_version=2 AND successor.outcome='applied' AND successor.canonical_json::jsonb#>>'{command,operation}'='payment.correct' AND successor.canonical_json::jsonb#>>'{command,targetId}'=$1 AND successor.canonical_json::jsonb#>>'{command,predecessorRequestId}'=j.request_id::text));
$_$;


--
-- Name: pwa_next_bookable_charge_v1(text, date); Type: FUNCTION
--

CREATE FUNCTION public.pwa_next_bookable_charge_v1(p_borrower text, p_day date) RETURNS TABLE(loan_id text, charge_id text, charge_date date, principal_due numeric, interest_due numeric)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE l public."Loans"%ROWTYPE; loan jsonb; charges jsonb; blocked boolean; d date; latest date; days integer; elapsed integer; remainder numeric; p numeric; i numeric;
BEGIN
 IF p_borrower IS NULL OR p_day IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Borrower and day required'; END IF;
 FOR l IN SELECT * FROM public."Loans" x WHERE x."Ref Borrowers"=p_borrower AND x."Loan Status"='ยังไม่ปิดยอด' AND NOT coalesce(x."Defaulted",false)
   AND coalesce(x."Auto Charge Enabled",false) AND x."Loan Type" IN ('ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน') AND x."Loan Date"<=p_day
   ORDER BY x."Row ID" COLLATE "C" LOOP
  -- R104 V117: no one-ahead gate; an undated row still means no offer.
  IF EXISTS(SELECT 1 FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND c."Charge Date" IS NULL) THEN CONTINUE; END IF;
  IF l."Loan Type"='ดอกเบี้ยรายวัน' AND EXISTS(SELECT 1 FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID"
    AND c."Principal Due"::numeric>coalesce((SELECT sum(r."Principal Paid"::numeric) FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID"),0)) THEN CONTINUE; END IF;
  -- Forecast inputs for this loan and day, as reporting_forecast_inputs_v1 builds them (V48, V53).
  SELECT jsonb_build_object('status',l."Loan Status",'defaulted',coalesce(l."Defaulted",false),'start',l."Loan Date",'close',l."Close Date",
    'balance',l."Principal Amount"::numeric-coalesce(sum(r."Principal Paid"::numeric) FILTER(WHERE r."Payment Date"<=p_day),0),'daily',l."Current Daily Interest"::numeric,'auto',l."Auto Charge Enabled",
    'interval',l."Interest Payment Interval",'anchor',l."Interest Schedule Anchor Date",'type',l."Loan Type",'due',l."Due Date",
    'arrangement',l."Loan Arrangement",'original',l."Principal Amount"::numeric,'payment',l."Daily Payment Amount"::numeric,'fixed',l."Fixed Interest"::numeric,
    'invalid',l."Loan Date" IS NULL OR l."Principal Amount" IS NULL OR NOT EXISTS(SELECT 1 FROM public."Borrowers" b WHERE b."Row ID"=l."Ref Borrowers")
     OR coalesce(bool_or(r."Payment Date" IS NULL OR r."Principal Paid" IS NULL OR r."Interest Paid" IS NULL OR r."Payment Date">p_day),false),
    'original_rate',l."Original Daily Interest Rate")
   INTO loan FROM public."Repayments" r WHERE r."Ref Loans"=l."Row ID";
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',c."Row ID",'date',c."Charge Date",'pdue',c."Principal Due"::numeric,'idue',c."Interest Due"::numeric,
    'ppaid',coalesce(paid.p,0),'ipaid',coalesce(paid.i,0),'invalid',coalesce(paid.invalid,false) OR c."Charge Date" IS NULL OR c."Principal Due" IS NULL OR c."Interest Due" IS NULL)),'[]'::jsonb)
   INTO charges FROM public."Charges" c
   LEFT JOIN LATERAL (SELECT sum(r."Principal Paid"::numeric) FILTER(WHERE r."Payment Date"<=p_day) p,sum(r."Interest Paid"::numeric) FILTER(WHERE r."Payment Date"<=p_day) i,
     bool_or(r."Payment Date" IS NULL OR r."Principal Paid" IS NULL OR r."Interest Paid" IS NULL OR r."Ref Loans" IS DISTINCT FROM c."Ref Loans") invalid
    FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID") paid ON true
   WHERE c."Ref Loans"=l."Row ID";
  -- The forecast gives the next date only; every row is read, so an Exception or Notice anywhere skips the loan.
  SELECT coalesce(bool_or(s.origin IN ('Exception','Notice')),false),min(s.due_date) FILTER(WHERE s.origin='Simulated' AND s.eligible AND s.due_date>p_day AND s.principal+s.interest>0)
   INTO blocked,d FROM public.forecast_schedule_v1(loan,charges,p_day,p_day+93) s;
  IF blocked OR d IS NULL THEN CONTINUE; END IF;
  -- Strict schedule order: the offer is after every recorded charge of the loan, booked future charges included.
  IF d<=(SELECT max(c."Charge Date") FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID") THEN CONTINUE; END IF;
  -- The amounts are generate_loan_charge's own arithmetic for that date.
  IF l."Loan Type"='ดอกเบี้ยรายวัน' THEN
   SELECT max(c."Charge Date") INTO latest FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND c."Charge Date"<=d AND NOT starts_with(c."Row ID",'df10:');
   p:=0;i:=l."Current Daily Interest"::numeric*greatest(0,d-coalesce(latest,l."Loan Date"));
  ELSE
   SELECT max(c."Charge Date") INTO latest FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID";
   IF latest IS NULL OR l."Due Date" IS NULL THEN CONTINUE; END IF;
   days:=l."Due Date"-l."Loan Date"+1;elapsed:=d-latest;
   IF days<=0 OR elapsed<=0 THEN CONTINUE; END IF;
   remainder:=mod(l."Principal Amount"::numeric,days);
   p:=floor(l."Principal Amount"::numeric/days)*elapsed+
     greatest(0,least(d-l."Loan Date"+1,remainder)-(latest-l."Loan Date"+1));
   i:=l."Daily Payment Amount"::numeric*elapsed-p;
  END IF;
  IF p IS NULL OR i IS NULL OR p<0 OR i<0 OR p+i<=0 OR p<>trunc(p) OR i<>trunc(i) THEN CONTINUE; END IF;
  loan_id:=l."Row ID";charge_date:=d;charge_id:='cg8:'||length(l."Row ID")||':'||l."Row ID"||':'||to_char(d,'YYYY-MM-DD');principal_due:=trunc(p);interest_due:=trunc(i);
  RETURN NEXT;
 END LOOP;
END $$;


--
-- Name: FUNCTION pwa_next_bookable_charge_v1(p_borrower text, p_day date); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_next_bookable_charge_v1(p_borrower text, p_day date) IS 'R104 V117: per eligible loan of the borrower, the next scheduled charge after the day and after every recorded charge (generator key and amounts), recordable from Upcoming Charges by loan.book-projected-charge in schedule order. Read only.';


--
-- Name: pwa_next_projected_charge_v1(text, date); Type: FUNCTION
--

CREATE FUNCTION public.pwa_next_projected_charge_v1(p_borrower text, p_day date) RETURNS TABLE(loan_id text, charge_id text, charge_date date, principal_due numeric, interest_due numeric)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE l public."Loans"%ROWTYPE; loan jsonb; charges jsonb; blocked boolean; d date; latest date; days integer; elapsed integer; remainder numeric; p numeric; i numeric;
BEGIN
 IF p_borrower IS NULL OR p_day IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Borrower and day required'; END IF;
 FOR l IN SELECT * FROM public."Loans" x WHERE x."Ref Borrowers"=p_borrower AND x."Loan Status"='ยังไม่ปิดยอด' AND NOT coalesce(x."Defaulted",false)
   AND coalesce(x."Auto Charge Enabled",false) AND x."Loan Type" IN ('ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน') AND x."Loan Date"<=p_day
   ORDER BY x."Row ID" COLLATE "C" LOOP
  -- One charge ahead: any recorded row after the day (paid or not), or an undated row, means no offer.
  IF EXISTS(SELECT 1 FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND (c."Charge Date" IS NULL OR c."Charge Date">p_day)) THEN CONTINUE; END IF;
  IF l."Loan Type"='ดอกเบี้ยรายวัน' AND EXISTS(SELECT 1 FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID"
    AND c."Principal Due"::numeric>coalesce((SELECT sum(r."Principal Paid"::numeric) FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID"),0)) THEN CONTINUE; END IF;
  -- Forecast inputs for this loan and day, as reporting_forecast_inputs_v1 builds them (V48, V53).
  SELECT jsonb_build_object('status',l."Loan Status",'defaulted',coalesce(l."Defaulted",false),'start',l."Loan Date",'close',l."Close Date",
    'balance',l."Principal Amount"::numeric-coalesce(sum(r."Principal Paid"::numeric) FILTER(WHERE r."Payment Date"<=p_day),0),'daily',l."Current Daily Interest"::numeric,'auto',l."Auto Charge Enabled",
    'interval',l."Interest Payment Interval",'anchor',l."Interest Schedule Anchor Date",'type',l."Loan Type",'due',l."Due Date",
    'arrangement',l."Loan Arrangement",'original',l."Principal Amount"::numeric,'payment',l."Daily Payment Amount"::numeric,'fixed',l."Fixed Interest"::numeric,
    'invalid',l."Loan Date" IS NULL OR l."Principal Amount" IS NULL OR NOT EXISTS(SELECT 1 FROM public."Borrowers" b WHERE b."Row ID"=l."Ref Borrowers")
     OR coalesce(bool_or(r."Payment Date" IS NULL OR r."Principal Paid" IS NULL OR r."Interest Paid" IS NULL OR r."Payment Date">p_day),false),
    'original_rate',l."Original Daily Interest Rate")
   INTO loan FROM public."Repayments" r WHERE r."Ref Loans"=l."Row ID";
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',c."Row ID",'date',c."Charge Date",'pdue',c."Principal Due"::numeric,'idue',c."Interest Due"::numeric,
    'ppaid',coalesce(paid.p,0),'ipaid',coalesce(paid.i,0),'invalid',coalesce(paid.invalid,false) OR c."Charge Date" IS NULL OR c."Principal Due" IS NULL OR c."Interest Due" IS NULL)),'[]'::jsonb)
   INTO charges FROM public."Charges" c
   LEFT JOIN LATERAL (SELECT sum(r."Principal Paid"::numeric) FILTER(WHERE r."Payment Date"<=p_day) p,sum(r."Interest Paid"::numeric) FILTER(WHERE r."Payment Date"<=p_day) i,
     bool_or(r."Payment Date" IS NULL OR r."Principal Paid" IS NULL OR r."Interest Paid" IS NULL OR r."Ref Loans" IS DISTINCT FROM c."Ref Loans") invalid
    FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID") paid ON true
   WHERE c."Ref Loans"=l."Row ID";
  -- The forecast gives the next date only; every row is read, so an Exception or Notice anywhere skips the loan.
  SELECT coalesce(bool_or(s.origin IN ('Exception','Notice')),false),min(s.due_date) FILTER(WHERE s.origin='Simulated' AND s.eligible AND s.due_date>p_day AND s.principal+s.interest>0)
   INTO blocked,d FROM public.forecast_schedule_v1(loan,charges,p_day,p_day+93) s;
  IF blocked OR d IS NULL THEN CONTINUE; END IF;
  -- The amounts are generate_loan_charge's own arithmetic for that date.
  IF l."Loan Type"='ดอกเบี้ยรายวัน' THEN
   SELECT max(c."Charge Date") INTO latest FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND c."Charge Date"<=d AND NOT starts_with(c."Row ID",'df10:');
   p:=0;i:=l."Current Daily Interest"::numeric*greatest(0,d-coalesce(latest,l."Loan Date"));
  ELSE
   SELECT max(c."Charge Date") INTO latest FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID";
   IF latest IS NULL OR l."Due Date" IS NULL THEN CONTINUE; END IF;
   days:=l."Due Date"-l."Loan Date"+1;elapsed:=d-latest;
   IF days<=0 OR elapsed<=0 THEN CONTINUE; END IF;
   remainder:=mod(l."Principal Amount"::numeric,days);
   p:=floor(l."Principal Amount"::numeric/days)*elapsed+
     greatest(0,least(d-l."Loan Date"+1,remainder)-(latest-l."Loan Date"+1));
   i:=l."Daily Payment Amount"::numeric*elapsed-p;
  END IF;
  IF p IS NULL OR i IS NULL OR p<0 OR i<0 OR p+i<=0 OR p<>trunc(p) OR i<>trunc(i) THEN CONTINUE; END IF;
  loan_id:=l."Row ID";charge_date:=d;charge_id:='cg8:'||length(l."Row ID")||':'||l."Row ID"||':'||to_char(d,'YYYY-MM-DD');principal_due:=trunc(p);interest_due:=trunc(i);
  RETURN NEXT;
 END LOOP;
END $$;


--
-- Name: FUNCTION pwa_next_projected_charge_v1(p_borrower text, p_day date); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_next_projected_charge_v1(p_borrower text, p_day date) IS 'R101: per eligible loan of the borrower, the next scheduled charge after the day (generator key and amounts), offered in Receive payment and booked by pwa_submit_selected_charges_v1 schemaVersion 9. Read only.';


--
-- Name: pwa_notify_actor_v1(jsonb); Type: FUNCTION
--

CREATE FUNCTION public.pwa_notify_actor_v1(actor jsonb) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE partner text; matches bigint;
BEGIN
 PERFORM public.pwa_worker_guard_v1('api');
 IF actor IS NULL OR jsonb_typeof(actor)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(actor) key) IS DISTINCT FROM ARRAY['issuer','loginEmail','partnerId','subject']::text[]
 OR actor->>'issuer'<>'https://securetoken.google.com/clever-oasis-508610-n7'
 OR coalesce(length(actor->>'subject'),0) NOT BETWEEN 1 AND 128 OR coalesce(length(actor->>'partnerId'),0) NOT BETWEEN 1 AND 256
 OR coalesce(length(actor->>'loginEmail'),0) NOT BETWEEN 1 AND 320 OR actor->>'loginEmail'<>lower(btrim(actor->>'loginEmail'))
 OR EXISTS(SELECT 1 FROM jsonb_each(actor) e WHERE jsonb_typeof(e.value)<>'string') THEN RAISE EXCEPTION 'access_denied'; END IF;
 SELECT count(*),min("Row ID") INTO matches,partner FROM public."Partners" WHERE lower(btrim("Login Email"))=actor->>'loginEmail';
 IF matches<>1 OR partner IS DISTINCT FROM actor->>'partnerId' THEN RAISE EXCEPTION 'access_denied'; END IF;
 RETURN partner;
END $$;


--
-- Name: FUNCTION pwa_notify_actor_v1(actor jsonb); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_notify_actor_v1(actor jsonb) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_notify_candidates_v1(integer); Type: FUNCTION
--

CREATE FUNCTION public.pwa_notify_candidates_v1(batch_limit integer) RETURNS TABLE(event_id uuid, subscription_id uuid, version bigint, issuer text, subject text, partner_id text, endpoint_hash text, login_email text, partner_role text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 IF batch_limit IS NULL OR batch_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_request'; END IF;
 RETURN QUERY SELECT e.event_id,s.subscription_id,s.version,s.issuer,s.subject,s.partner_id,s.endpoint_hash,lower(btrim(p."Login Email")),p."Partner Role"
 FROM public.pwa_notification_events e JOIN public.pwa_push_subscriptions s ON s.created_at<=e.occurred_at JOIN public."Partners" p ON p."Row ID"=s.partner_id
 WHERE public.pwa_notify_eligible_v1(e.event_id,s.subscription_id)
 AND NOT EXISTS(SELECT 1 FROM public.pwa_notification_deliveries d WHERE d.event_id=e.event_id AND d.channel='web-push' AND d.destination_key=s.endpoint_hash)
 ORDER BY e.occurred_at,e.event_id,s.subscription_id LIMIT batch_limit;
END $$;


--
-- Name: FUNCTION pwa_notify_candidates_v1(batch_limit integer); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_notify_candidates_v1(batch_limit integer) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_notify_chat_reply_v1(jsonb, uuid, uuid, text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_notify_chat_reply_v1(actor jsonb, thread uuid, message uuid, outcome text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE suffix text; partner text; matches bigint; inserted boolean;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 IF current_user<>'mw_notify_owner_'||suffix OR NOT pg_has_role(session_user,'mw_chat_api_'||suffix,'USAGE') OR pg_has_role(session_user,'mw_notify_owner_'||suffix,'MEMBER') THEN
  RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 IF actor IS NULL OR jsonb_typeof(actor)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(actor) key) IS DISTINCT FROM ARRAY['issuer','loginEmail','partnerId','subject']::text[]
  OR EXISTS(SELECT 1 FROM jsonb_each(actor) e WHERE jsonb_typeof(e.value)<>'string')
  OR actor->>'issuer'<>'https://securetoken.google.com/clever-oasis-508610-n7'
  OR coalesce(length(actor->>'subject'),0) NOT BETWEEN 1 AND 128 OR coalesce(length(actor->>'partnerId'),0) NOT BETWEEN 1 AND 256
  OR coalesce(length(actor->>'loginEmail'),0) NOT BETWEEN 1 AND 320 OR actor->>'loginEmail'<>lower(btrim(actor->>'loginEmail')) THEN
  RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 SELECT count(*),min("Row ID") INTO matches,partner FROM public."Partners" WHERE lower(btrim("Login Email"))=actor->>'loginEmail';
 IF matches<>1 OR partner IS DISTINCT FROM actor->>'partnerId' THEN RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 IF thread IS NULL OR message IS NULL OR outcome IS NULL OR outcome NOT IN ('ok','failed') THEN RAISE EXCEPTION 'invalid_request'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pwa_chat_threads t WHERE t.id=thread AND t.partner_id=partner) THEN RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pwa_chat_messages m WHERE m.id=message AND m.thread_id=thread) THEN RAISE EXCEPTION 'access_denied' USING ERRCODE='42501'; END IF;
 INSERT INTO public.pwa_notification_events(dedupe_key,event_type,source_kind,source_id,source_version,actor_partner_id,actor_login_email)
 VALUES('chat.reply:'||message::text,'chat.reply','chat',thread::text,outcome||':'||message::text,partner,actor->>'loginEmail')
 ON CONFLICT(dedupe_key) DO NOTHING;
 inserted:=FOUND;
 IF inserted THEN PERFORM pg_catalog.pg_notify('mw_pwa_notifications_v1',''); END IF;
 RETURN inserted;
END $$;


--
-- Name: FUNCTION pwa_notify_chat_reply_v1(actor jsonb, thread uuid, message uuid, outcome text); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_notify_chat_reply_v1(actor jsonb, thread uuid, message uuid, outcome text) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_notify_complete_v1(uuid, bigint, text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_notify_complete_v1(delivery uuid, generation bigint, result_class text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE d public.pwa_notification_deliveries; outcome text;
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 IF result_class IS NULL OR result_class NOT IN ('accepted','expired','throttled','unavailable','network','rejected','ineligible','deferred') THEN RAISE EXCEPTION 'invalid_provider_result'; END IF;
 SELECT * INTO d FROM public.pwa_notification_deliveries WHERE delivery_id=delivery AND lease_generation=generation AND state='leased' AND lease_expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN 'fenced'; END IF;
 IF (result_class IN ('ineligible','deferred') AND d.send_started_at IS NOT NULL) OR (result_class NOT IN ('ineligible','deferred') AND d.send_started_at IS NULL) THEN RAISE EXCEPTION 'invalid_provider_result'; END IF;
 outcome:=CASE WHEN result_class='accepted' THEN 'sent' WHEN result_class='ineligible' THEN 'cancelled' WHEN result_class='network' THEN 'uncertain' WHEN result_class IN ('expired','rejected') OR d.attempts>=8 THEN 'dead' ELSE 'retry' END;
 UPDATE public.pwa_notification_deliveries SET state=outcome,lease_expires_at=NULL,provider_result=CASE result_class WHEN 'deferred' THEN 'unavailable' ELSE result_class END,
 next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,d.attempts)::integer)),completed_at=CASE WHEN outcome IN ('sent','cancelled','dead') THEN clock_timestamp() ELSE NULL END WHERE delivery_id=delivery;
 IF result_class='expired' THEN UPDATE public.pwa_push_subscriptions SET enabled=false,version=version+1 WHERE subscription_id=d.subscription_id AND version=d.subscription_version; END IF;
 RETURN outcome;
END $$;


--
-- Name: FUNCTION pwa_notify_complete_v1(delivery uuid, generation bigint, result_class text); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_notify_complete_v1(delivery uuid, generation bigint, result_class text) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_notify_content_v1(uuid, bigint); Type: FUNCTION
--

CREATE FUNCTION public.pwa_notify_content_v1(delivery uuid, generation bigint) RETURNS TABLE(found boolean, event_type text, language text, borrower_name text, amount numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 RETURN QUERY SELECT src.source_found,
  -- A chat reply carries its outcome ('chat.reply:ok' / 'chat.reply:failed', from source_version 'ok:<message>').
  CASE WHEN e.event_type='chat.reply' THEN 'chat.reply:'||split_part(e.source_version,':',1) ELSE e.event_type END,
  CASE WHEN recipient."Language Preference"='ไทย' THEN 'th' ELSE 'en' END::text,
  -- Chat: the thread title. Thai: the Thai name. English: the English name only ("Description"); none when blank.
  CASE WHEN e.source_kind='chat' THEN src.source_title WHEN recipient."Language Preference"='ไทย' THEN b."Borrower Name" ELSE nullif(btrim(b."Description",E' \t\r\n\f\v'),'') END,
  src.source_amount
 FROM public.pwa_notification_deliveries d JOIN public.pwa_notification_events e ON e.event_id=d.event_id
 LEFT JOIN public."Partners" recipient ON recipient."Row ID"=d.recipient_partner_id
 LEFT JOIN LATERAL (
  SELECT true AS source_found,p."Ref Borrower" AS borrower_id,p."Amount Received"::numeric AS source_amount,NULL::text AS source_title FROM public."Payments" p WHERE e.source_kind='payment' AND p."Row ID"=e.source_id
  UNION ALL
  SELECT true,l."Ref Borrowers",l."Principal Amount"::numeric,NULL::text FROM public."Loans" l WHERE e.source_kind='loan' AND l."Row ID"=e.source_id
  UNION ALL
  SELECT true,NULL::text,NULL::numeric,t.title FROM public.pwa_chat_threads t WHERE e.source_kind='chat' AND t.id::text=e.source_id AND t.partner_id=d.recipient_partner_id
 ) source_row ON true
 CROSS JOIN LATERAL (SELECT coalesce(source_row.source_found,false) AS source_found,source_row.borrower_id,source_row.source_amount,source_row.source_title) src
 LEFT JOIN public."Borrowers" b ON b."Row ID"=src.borrower_id
 WHERE d.delivery_id=$1 AND d.lease_generation=$2 AND d.state='leased' AND d.lease_expires_at>clock_timestamp();
END $_$;


--
-- Name: FUNCTION pwa_notify_content_v1(delivery uuid, generation bigint); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_notify_content_v1(delivery uuid, generation bigint) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_notify_content_v2(uuid, bigint); Type: FUNCTION
--

CREATE FUNCTION public.pwa_notify_content_v2(delivery uuid, generation bigint) RETURNS TABLE(found boolean, event_type text, language text, borrower_name text, amount numeric, rebate_amount numeric, rebate_payee text, rebate_payable numeric, payment_method text, rebate_loan text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 RETURN QUERY SELECT src.source_found,
  -- A chat reply carries its outcome ('chat.reply:ok' / 'chat.reply:failed', from source_version 'ok:<message>').
  CASE WHEN e.event_type='chat.reply' THEN 'chat.reply:'||split_part(e.source_version,':',1) ELSE e.event_type END,
  CASE WHEN recipient."Language Preference"='ไทย' THEN 'th' ELSE 'en' END::text,
  -- Chat: the thread title. Thai: the Thai name. English: the English name only ("Description"); none when blank.
  CASE WHEN e.source_kind='chat' THEN src.source_title WHEN recipient."Language Preference"='ไทย' THEN b."Borrower Name" ELSE nullif(btrim(b."Description",E' \t\r\n\f\v'),'') END,
  src.source_amount,
  -- R111: a closed loan's referral rebate, its payee (the v1 name rule) and the part not settled by offset
  rb.rebate_amount,
  -- (an English recipient falls back to the Thai name when the referrer has no English name: the line names a payee).
  CASE WHEN rb.rebate_amount IS NULL THEN NULL WHEN recipient."Language Preference"='ไทย' THEN pb."Borrower Name" ELSE coalesce(nullif(btrim(pb."Description",E' \t\r\n\f\v'),''),pb."Borrower Name") END,
  rb.rebate_payable,
  -- R111: a posted payment's method, and for a Referral Rebate Offset the closed loan whose rebate it is (the push then
  -- reads as a rebate offset, not as cash received from the referrer).
  src.payment_method,
  (SELECT x."Ref Related Loan" FROM public."Business Expenses" x WHERE e.source_kind='payment' AND x."Ref Offset Payment"=e.source_id ORDER BY x."Row ID" COLLATE "C" LIMIT 1)
 FROM public.pwa_notification_deliveries d JOIN public.pwa_notification_events e ON e.event_id=d.event_id
 LEFT JOIN public."Partners" recipient ON recipient."Row ID"=d.recipient_partner_id
 LEFT JOIN LATERAL (
  SELECT true AS source_found,p."Ref Borrower" AS borrower_id,p."Amount Received"::numeric AS source_amount,NULL::text AS source_title,p."Payment Method" AS payment_method FROM public."Payments" p WHERE e.source_kind='payment' AND p."Row ID"=e.source_id
  UNION ALL
  SELECT true,l."Ref Borrowers",l."Principal Amount"::numeric,NULL::text,NULL::text FROM public."Loans" l WHERE e.source_kind='loan' AND l."Row ID"=e.source_id
  UNION ALL
  SELECT true,NULL::text,NULL::numeric,t.title,NULL::text FROM public.pwa_chat_threads t WHERE e.source_kind='chat' AND t.id::text=e.source_id AND t.partner_id=d.recipient_partner_id
 ) source_row ON true
 CROSS JOIN LATERAL (SELECT coalesce(source_row.source_found,false) AS source_found,source_row.borrower_id,source_row.source_amount,source_row.source_title,source_row.payment_method) src
 LEFT JOIN public."Borrowers" b ON b."Row ID"=src.borrower_id
 LEFT JOIN LATERAL (
  SELECT x."Amount"::numeric AS rebate_amount,x."Ref Payee Borrower" AS payee_id,x."Amount"::numeric-coalesce(o."Amount Received"::numeric,0) AS rebate_payable
  FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment"
  WHERE x."Source Type"='Referral Rebate' AND ((e.event_type='loan.closed' AND e.source_kind='loan' AND x."Ref Related Loan"=e.source_id)
   -- R111 V124: the payment that closed a referred loan carries that loan's rebate (its "Payment received" push).
   OR (e.event_type='payment.posted' AND e.source_kind='payment' AND x."Ref Related Loan" IN (SELECT y."Row ID" FROM public."Loans" y WHERE y."Ref Closing Payment"=e.source_id)))
  ORDER BY x."Row ID" COLLATE "C" LIMIT 1
 ) rb ON true
 LEFT JOIN public."Borrowers" pb ON pb."Row ID"=rb.payee_id
 WHERE d.delivery_id=$1 AND d.lease_generation=$2 AND d.state='leased' AND d.lease_expires_at>clock_timestamp();
END $_$;


--
-- Name: FUNCTION pwa_notify_content_v2(delivery uuid, generation bigint); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_notify_content_v2(delivery uuid, generation bigint) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_notify_content_v3(uuid, bigint); Type: FUNCTION
--

CREATE FUNCTION public.pwa_notify_content_v3(delivery uuid, generation bigint) RETURNS TABLE(found boolean, event_type text, language text, borrower_name text, amount numeric, rebate_amount numeric, rebate_payee text, rebate_payable numeric, payment_method text, rebate_loan text, late_charge_amount numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 RETURN QUERY SELECT src.source_found,
  -- A chat reply carries its outcome ('chat.reply:ok' / 'chat.reply:failed', from source_version 'ok:<message>').
  CASE WHEN e.event_type='chat.reply' THEN 'chat.reply:'||split_part(e.source_version,':',1) ELSE e.event_type END,
  CASE WHEN recipient."Language Preference"='ไทย' THEN 'th' ELSE 'en' END::text,
  -- Chat: the thread title. Thai: the Thai name. English: the English name only ("Description"); none when blank.
  CASE WHEN e.source_kind='chat' THEN src.source_title WHEN recipient."Language Preference"='ไทย' THEN b."Borrower Name" ELSE nullif(btrim(b."Description",E' \t\r\n\f\v'),'') END,
  src.source_amount,
  -- R111: a closed loan's referral rebate, its payee (the v1 name rule) and the part not settled by offset
  rb.rebate_amount,
  -- (an English recipient falls back to the Thai name when the referrer has no English name: the line names a payee).
  CASE WHEN rb.rebate_amount IS NULL THEN NULL WHEN recipient."Language Preference"='ไทย' THEN pb."Borrower Name" ELSE coalesce(nullif(btrim(pb."Description",E' \t\r\n\f\v'),''),pb."Borrower Name") END,
  rb.rebate_payable,
  -- R111: a posted payment's method, and for a Referral Rebate Offset the closed loan whose rebate it is (the push then
  -- reads as a rebate offset, not as cash received from the referrer).
  src.payment_method,
  (SELECT x."Ref Related Loan" FROM public."Business Expenses" x WHERE e.source_kind='payment' AND x."Ref Offset Payment"=e.source_id ORDER BY x."Row ID" COLLATE "C" LIMIT 1),
  -- R118: the late-charge part of the payment.
  CASE WHEN e.source_kind='payment' THEN (SELECT coalesce(sum(y."Late Charge Paid"::numeric),0) FROM public."Repayments" y WHERE y."Ref Payment"=e.source_id) END
 FROM public.pwa_notification_deliveries d JOIN public.pwa_notification_events e ON e.event_id=d.event_id
 LEFT JOIN public."Partners" recipient ON recipient."Row ID"=d.recipient_partner_id
 LEFT JOIN LATERAL (
  SELECT true AS source_found,p."Ref Borrower" AS borrower_id,p."Amount Received"::numeric AS source_amount,NULL::text AS source_title,p."Payment Method" AS payment_method FROM public."Payments" p WHERE e.source_kind='payment' AND p."Row ID"=e.source_id
  UNION ALL
  SELECT true,l."Ref Borrowers",l."Principal Amount"::numeric,NULL::text,NULL::text FROM public."Loans" l WHERE e.source_kind='loan' AND l."Row ID"=e.source_id
  UNION ALL
  SELECT true,NULL::text,NULL::numeric,t.title,NULL::text FROM public.pwa_chat_threads t WHERE e.source_kind='chat' AND t.id::text=e.source_id AND t.partner_id=d.recipient_partner_id
 ) source_row ON true
 CROSS JOIN LATERAL (SELECT coalesce(source_row.source_found,false) AS source_found,source_row.borrower_id,source_row.source_amount,source_row.source_title,source_row.payment_method) src
 LEFT JOIN public."Borrowers" b ON b."Row ID"=src.borrower_id
 LEFT JOIN LATERAL (
  SELECT x."Amount"::numeric AS rebate_amount,x."Ref Payee Borrower" AS payee_id,x."Amount"::numeric-coalesce(o."Amount Received"::numeric,0) AS rebate_payable
  FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment"
  WHERE x."Source Type"='Referral Rebate' AND ((e.event_type='loan.closed' AND e.source_kind='loan' AND x."Ref Related Loan"=e.source_id)
   -- R111 V124: the payment that closed a referred loan carries that loan's rebate (its "Payment received" push).
   OR (e.event_type='payment.posted' AND e.source_kind='payment' AND x."Ref Related Loan" IN (SELECT y."Row ID" FROM public."Loans" y WHERE y."Ref Closing Payment"=e.source_id)))
  ORDER BY x."Row ID" COLLATE "C" LIMIT 1
 ) rb ON true
 LEFT JOIN public."Borrowers" pb ON pb."Row ID"=rb.payee_id
 WHERE d.delivery_id=$1 AND d.lease_generation=$2 AND d.state='leased' AND d.lease_expires_at>clock_timestamp();
END $_$;


--
-- Name: FUNCTION pwa_notify_content_v3(delivery uuid, generation bigint); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_notify_content_v3(delivery uuid, generation bigint) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_notify_content_v4(uuid, bigint); Type: FUNCTION
--

CREATE FUNCTION public.pwa_notify_content_v4(delivery uuid, generation bigint) RETURNS TABLE(found boolean, event_type text, language text, borrower_name text, amount numeric, rebate_amount numeric, rebate_payee text, rebate_payable numeric, payment_method text, rebate_loan text, late_charge_amount numeric, rebates jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 RETURN QUERY SELECT src.source_found,
  -- A chat reply carries its outcome ('chat.reply:ok' / 'chat.reply:failed', from source_version 'ok:<message>').
  CASE WHEN e.event_type='chat.reply' THEN 'chat.reply:'||split_part(e.source_version,':',1) ELSE e.event_type END,
  CASE WHEN recipient."Language Preference"='ไทย' THEN 'th' ELSE 'en' END::text,
  -- Chat: the thread title. Thai: the Thai name. English: the English name only ("Description"); none when blank.
  CASE WHEN e.source_kind='chat' THEN src.source_title WHEN recipient."Language Preference"='ไทย' THEN b."Borrower Name" ELSE nullif(btrim(b."Description",E' \t\r\n\f\v'),'') END,
  src.source_amount,
  -- R111: a closed loan's referral rebate, its payee (the v1 name rule) and the part not settled by offset
  rb.rebate_amount,
  -- (an English recipient falls back to the Thai name when the referrer has no English name: the line names a payee).
  CASE WHEN rb.rebate_amount IS NULL THEN NULL WHEN recipient."Language Preference"='ไทย' THEN pb."Borrower Name" ELSE coalesce(nullif(btrim(pb."Description",E' \t\r\n\f\v'),''),pb."Borrower Name") END,
  rb.rebate_payable,
  -- R111: a posted payment's method, and for a Referral Rebate Offset the closed loan whose rebate it is (the push then
  -- reads as a rebate offset, not as cash received from the referrer).
  src.payment_method,
  (SELECT x."Ref Related Loan" FROM public."Business Expenses" x WHERE e.source_kind='payment' AND x."Ref Offset Payment"=e.source_id ORDER BY x."Row ID" COLLATE "C" LIMIT 1),
  -- R118: the late-charge part of the payment.
  CASE WHEN e.source_kind='payment' THEN (SELECT coalesce(sum(y."Late Charge Paid"::numeric),0) FROM public."Repayments" y WHERE y."Ref Payment"=e.source_id) END,
  -- R119: every rebate, in expense "Row ID" order; [] when none; NULL on a chat event.
  CASE WHEN e.source_kind='chat' THEN NULL ELSE (
   SELECT coalesce(jsonb_agg(jsonb_build_object('amount',x."Amount"::numeric,
     'payee',CASE WHEN recipient."Language Preference"='ไทย' THEN xb."Borrower Name" ELSE coalesce(nullif(btrim(xb."Description",E' \t\r\n\f\v'),''),xb."Borrower Name") END,
     'payable',x."Amount"::numeric-coalesce(o."Amount Received"::numeric,0)) ORDER BY x."Row ID" COLLATE "C"),'[]'::jsonb)
   FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment" LEFT JOIN public."Borrowers" xb ON xb."Row ID"=x."Ref Payee Borrower"
   WHERE x."Source Type"='Referral Rebate' AND ((e.event_type='loan.closed' AND e.source_kind='loan' AND x."Ref Related Loan"=e.source_id)
    OR (e.event_type='payment.posted' AND e.source_kind='payment' AND x."Ref Related Loan" IN (SELECT y."Row ID" FROM public."Loans" y WHERE y."Ref Closing Payment"=e.source_id)))) END
 FROM public.pwa_notification_deliveries d JOIN public.pwa_notification_events e ON e.event_id=d.event_id
 LEFT JOIN public."Partners" recipient ON recipient."Row ID"=d.recipient_partner_id
 LEFT JOIN LATERAL (
  SELECT true AS source_found,p."Ref Borrower" AS borrower_id,p."Amount Received"::numeric AS source_amount,NULL::text AS source_title,p."Payment Method" AS payment_method FROM public."Payments" p WHERE e.source_kind='payment' AND p."Row ID"=e.source_id
  UNION ALL
  SELECT true,l."Ref Borrowers",l."Principal Amount"::numeric,NULL::text,NULL::text FROM public."Loans" l WHERE e.source_kind='loan' AND l."Row ID"=e.source_id
  UNION ALL
  SELECT true,NULL::text,NULL::numeric,t.title,NULL::text FROM public.pwa_chat_threads t WHERE e.source_kind='chat' AND t.id::text=e.source_id AND t.partner_id=d.recipient_partner_id
 ) source_row ON true
 CROSS JOIN LATERAL (SELECT coalesce(source_row.source_found,false) AS source_found,source_row.borrower_id,source_row.source_amount,source_row.source_title,source_row.payment_method) src
 LEFT JOIN public."Borrowers" b ON b."Row ID"=src.borrower_id
 LEFT JOIN LATERAL (
  SELECT x."Amount"::numeric AS rebate_amount,x."Ref Payee Borrower" AS payee_id,x."Amount"::numeric-coalesce(o."Amount Received"::numeric,0) AS rebate_payable
  FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment"
  WHERE x."Source Type"='Referral Rebate' AND ((e.event_type='loan.closed' AND e.source_kind='loan' AND x."Ref Related Loan"=e.source_id)
   -- R111 V124: the payment that closed a referred loan carries that loan's rebate (its "Payment received" push).
   OR (e.event_type='payment.posted' AND e.source_kind='payment' AND x."Ref Related Loan" IN (SELECT y."Row ID" FROM public."Loans" y WHERE y."Ref Closing Payment"=e.source_id)))
  ORDER BY x."Row ID" COLLATE "C" LIMIT 1
 ) rb ON true
 LEFT JOIN public."Borrowers" pb ON pb."Row ID"=rb.payee_id
 WHERE d.delivery_id=$1 AND d.lease_generation=$2 AND d.state='leased' AND d.lease_expires_at>clock_timestamp();
END $_$;


--
-- Name: FUNCTION pwa_notify_content_v4(delivery uuid, generation bigint); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_notify_content_v4(delivery uuid, generation bigint) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_notify_content_v5(uuid, bigint); Type: FUNCTION
--

CREATE FUNCTION public.pwa_notify_content_v5(delivery uuid, generation bigint) RETURNS TABLE(found boolean, event_type text, language text, borrower_name text, amount numeric, rebate_amount numeric, rebate_payee text, rebate_payable numeric, payment_method text, rebate_loan text, late_charge_amount numeric, rebates jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 RETURN QUERY SELECT src.source_found,
  -- A chat reply carries its outcome ('chat.reply:ok' / 'chat.reply:failed', from source_version 'ok:<message>').
  CASE WHEN e.event_type='chat.reply' THEN 'chat.reply:'||split_part(e.source_version,':',1) ELSE e.event_type END,
  CASE WHEN recipient."Language Preference"='ไทย' THEN 'th' ELSE 'en' END::text,
  -- Chat: the thread title. Thai: the Thai name. English: the English name only ("Description"); none when blank.
  CASE WHEN e.source_kind='chat' THEN src.source_title WHEN recipient."Language Preference"='ไทย' THEN b."Borrower Name" ELSE nullif(btrim(b."Description",E' \t\r\n\f\v'),'') END,
  src.source_amount,
  rb.rebate_amount,
  CASE WHEN rb.rebate_amount IS NULL THEN NULL WHEN recipient."Language Preference"='ไทย' THEN pb."Borrower Name" ELSE coalesce(nullif(btrim(pb."Description",E' \t\r\n\f\v'),''),pb."Borrower Name") END,
  rb.rebate_payable,
  src.payment_method,
  (SELECT x."Ref Related Loan" FROM public."Business Expenses" x WHERE e.source_kind='payment' AND x."Ref Offset Payment"=e.source_id ORDER BY x."Row ID" COLLATE "C" LIMIT 1),
  CASE WHEN e.source_kind='payment' THEN (SELECT coalesce(sum(y."Late Charge Paid"::numeric),0) FROM public."Repayments" y WHERE y."Ref Payment"=e.source_id) END,
  -- R129: every rebate (R119 order) with its state, pending amount and the payee's owed total; [] when none; NULL on chat.
  CASE WHEN e.source_kind='chat' THEN NULL ELSE (
   SELECT coalesce(jsonb_agg(jsonb_build_object('amount',x."Amount"::numeric,
     'payee',CASE WHEN recipient."Language Preference"='ไทย' THEN xb."Borrower Name" ELSE coalesce(nullif(btrim(xb."Description",E' \t\r\n\f\v'),''),xb."Borrower Name") END,
     'payable',x."Amount"::numeric-coalesce(o."Amount Received"::numeric,0),
     'state',CASE WHEN x."Rule Version"='REFERRAL_REBATE_V3' AND x."Ref Rebate Settlement" IS NOT NULL THEN 'paid' WHEN coalesce(o."Amount Received"::numeric,0)>0 THEN 'offset'
      WHEN x."Rule Version"='REFERRAL_REBATE_V3' THEN 'pending' ELSE 'paid-at-close' END,
     'ruleVersion',x."Rule Version",
     'pending',public.pwa_rebate_pending_v1(x."Row ID"),
     'owed',public.pwa_rebates_owed_v1(x."Ref Payee Borrower")) ORDER BY x."Row ID" COLLATE "C"),'[]'::jsonb)
   FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment" LEFT JOIN public."Borrowers" xb ON xb."Row ID"=x."Ref Payee Borrower"
   WHERE x."Source Type"='Referral Rebate' AND ((e.event_type='loan.closed' AND e.source_kind='loan' AND x."Ref Related Loan"=e.source_id)
    OR (e.event_type='payment.posted' AND e.source_kind='payment' AND x."Ref Related Loan" IN (SELECT y."Row ID" FROM public."Loans" y WHERE y."Ref Closing Payment"=e.source_id)))) END
 FROM public.pwa_notification_deliveries d JOIN public.pwa_notification_events e ON e.event_id=d.event_id
 LEFT JOIN public."Partners" recipient ON recipient."Row ID"=d.recipient_partner_id
 LEFT JOIN LATERAL (
  SELECT true AS source_found,p."Ref Borrower" AS borrower_id,p."Amount Received"::numeric AS source_amount,NULL::text AS source_title,p."Payment Method" AS payment_method FROM public."Payments" p WHERE e.source_kind='payment' AND p."Row ID"=e.source_id
  UNION ALL
  SELECT true,l."Ref Borrowers",l."Principal Amount"::numeric,NULL::text,NULL::text FROM public."Loans" l WHERE e.source_kind='loan' AND l."Row ID"=e.source_id
  UNION ALL
  SELECT true,NULL::text,NULL::numeric,t.title,NULL::text FROM public.pwa_chat_threads t WHERE e.source_kind='chat' AND t.id::text=e.source_id AND t.partner_id=d.recipient_partner_id
 ) source_row ON true
 CROSS JOIN LATERAL (SELECT coalesce(source_row.source_found,false) AS source_found,source_row.borrower_id,source_row.source_amount,source_row.source_title,source_row.payment_method) src
 LEFT JOIN public."Borrowers" b ON b."Row ID"=src.borrower_id
 LEFT JOIN LATERAL (
  SELECT x."Amount"::numeric AS rebate_amount,x."Ref Payee Borrower" AS payee_id,x."Amount"::numeric-coalesce(o."Amount Received"::numeric,0) AS rebate_payable
  FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment"
  WHERE x."Source Type"='Referral Rebate' AND ((e.event_type='loan.closed' AND e.source_kind='loan' AND x."Ref Related Loan"=e.source_id)
   OR (e.event_type='payment.posted' AND e.source_kind='payment' AND x."Ref Related Loan" IN (SELECT y."Row ID" FROM public."Loans" y WHERE y."Ref Closing Payment"=e.source_id)))
  ORDER BY x."Row ID" COLLATE "C" LIMIT 1
 ) rb ON true
 LEFT JOIN public."Borrowers" pb ON pb."Row ID"=rb.payee_id
 WHERE d.delivery_id=$1 AND d.lease_generation=$2 AND d.state='leased' AND d.lease_expires_at>clock_timestamp();
END $_$;


--
-- Name: FUNCTION pwa_notify_content_v5(delivery uuid, generation bigint); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_notify_content_v5(delivery uuid, generation bigint) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_notify_eligible_v1(uuid, uuid); Type: FUNCTION
--

CREATE FUNCTION public.pwa_notify_eligible_v1(event uuid, subscription uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.pwa_notification_events e JOIN public.pwa_push_subscriptions s ON s.subscription_id=subscription
  WHERE e.event_id=event AND e.actor_partner_id IS NOT NULL AND CASE WHEN e.event_type='chat.reply' THEN s.partner_id=e.actor_partner_id ELSE s.partner_id<>e.actor_partner_id END
  AND s.enabled AND (s.expires_at IS NULL OR s.expires_at>statement_timestamp()) AND s.created_at<=e.occurred_at
  AND (SELECT count(*) FROM public."Partners" p WHERE lower(btrim(p."Login Email"))=e.actor_login_email)=1
  AND EXISTS(SELECT 1 FROM public."Partners" p WHERE p."Row ID"=e.actor_partner_id AND lower(btrim(p."Login Email"))=e.actor_login_email)
  AND EXISTS(SELECT 1 FROM public."Partners" p WHERE p."Row ID"=s.partner_id AND nullif(btrim(p."Login Email"),'') IS NOT NULL AND nullif(btrim(p."Email"),'') IS NOT NULL
   AND (SELECT count(*) FROM public."Partners" other WHERE lower(btrim(other."Login Email"))=lower(btrim(p."Login Email")))=1)
  AND NOT EXISTS(SELECT 1 FROM public.pwa_notification_preferences p WHERE p.partner_id=s.partner_id AND p.channel='web-push' AND (NOT p.enabled OR p.updated_at>e.occurred_at))
 );
$$;


--
-- Name: FUNCTION pwa_notify_eligible_v1(event uuid, subscription uuid); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_notify_eligible_v1(event uuid, subscription uuid) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_notify_enqueue_v1(uuid, uuid, bigint, boolean); Type: FUNCTION
--

CREATE FUNCTION public.pwa_notify_enqueue_v1(event uuid, subscription uuid, subscription_version bigint, eligible boolean) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE inserted bigint;
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 IF eligible IS NULL THEN RAISE EXCEPTION 'invalid_request'; END IF;
 -- Subscription lock serializes revocation/rotation with this boundary.
 PERFORM 1 FROM public.pwa_push_subscriptions s WHERE s.subscription_id=subscription FOR UPDATE;
 INSERT INTO public.pwa_notification_deliveries(event_id,channel,destination_key,recipient_partner_id,subscription_id,subscription_version,state,provider_result,completed_at)
 SELECT event,'web-push',s.endpoint_hash,s.partner_id,s.subscription_id,s.version,CASE WHEN eligible THEN 'pending' ELSE 'cancelled' END,CASE WHEN eligible THEN NULL ELSE 'ineligible' END,CASE WHEN eligible THEN NULL ELSE clock_timestamp() END
 FROM public.pwa_push_subscriptions s WHERE s.subscription_id=subscription AND s.version=subscription_version AND public.pwa_notify_eligible_v1(event,subscription)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;RETURN inserted=1;
END $$;


--
-- Name: FUNCTION pwa_notify_enqueue_v1(event uuid, subscription uuid, subscription_version bigint, eligible boolean); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_notify_enqueue_v1(event uuid, subscription uuid, subscription_version bigint, eligible boolean) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_notify_history_content_v1(jsonb, uuid[]); Type: FUNCTION
--

CREATE FUNCTION public.pwa_notify_history_content_v1(actor jsonb, events uuid[]) RETURNS TABLE("eventId" uuid, found boolean, "eventType" text, language text, "borrowerName" text, amount numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE partner text:=public.pwa_notify_actor_v1(actor);
BEGIN
 IF events IS NULL OR cardinality(events)>26 THEN RAISE EXCEPTION 'invalid_request'; END IF;
 RETURN QUERY SELECT e.event_id,src.source_found,
  CASE WHEN e.event_type='chat.reply' THEN 'chat.reply:'||split_part(e.source_version,':',1) ELSE e.event_type END,
  CASE WHEN recipient."Language Preference"='ไทย' THEN 'th' ELSE 'en' END::text,
  CASE WHEN e.source_kind='chat' THEN src.source_title WHEN recipient."Language Preference"='ไทย' THEN b."Borrower Name" ELSE nullif(btrim(b."Description",E' \t\r\n\f\v'),'') END,
  src.source_amount
 FROM public.pwa_notification_events e
 LEFT JOIN public."Partners" recipient ON recipient."Row ID"=partner
 LEFT JOIN LATERAL (
  SELECT true AS source_found,p."Ref Borrower" AS borrower_id,p."Amount Received"::numeric AS source_amount,NULL::text AS source_title FROM public."Payments" p WHERE e.source_kind='payment' AND p."Row ID"=e.source_id
  UNION ALL
  SELECT true,l."Ref Borrowers",l."Principal Amount"::numeric,NULL::text FROM public."Loans" l WHERE e.source_kind='loan' AND l."Row ID"=e.source_id
  UNION ALL
  SELECT true,NULL::text,NULL::numeric,t.title FROM public.pwa_chat_threads t WHERE e.source_kind='chat' AND t.id::text=e.source_id AND t.partner_id=partner
 ) source_row ON true
 CROSS JOIN LATERAL (SELECT coalesce(source_row.source_found,false) AS source_found,source_row.borrower_id,source_row.source_amount,source_row.source_title) src
 LEFT JOIN public."Borrowers" b ON b."Row ID"=src.borrower_id
 WHERE e.event_id=ANY(events) AND EXISTS(SELECT 1 FROM public.pwa_notification_deliveries d WHERE d.event_id=e.event_id AND d.recipient_partner_id=partner);
END $$;


--
-- Name: FUNCTION pwa_notify_history_content_v1(actor jsonb, events uuid[]); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_notify_history_content_v1(actor jsonb, events uuid[]) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_notify_history_content_v2(jsonb, uuid[]); Type: FUNCTION
--

CREATE FUNCTION public.pwa_notify_history_content_v2(actor jsonb, events uuid[]) RETURNS TABLE("eventId" uuid, found boolean, "eventType" text, language text, "borrowerName" text, amount numeric, "lateChargeAmount" numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE partner text:=public.pwa_notify_actor_v1(actor);
BEGIN
 IF events IS NULL OR cardinality(events)>26 THEN RAISE EXCEPTION 'invalid_request'; END IF;
 RETURN QUERY SELECT e.event_id,src.source_found,
  CASE WHEN e.event_type='chat.reply' THEN 'chat.reply:'||split_part(e.source_version,':',1) ELSE e.event_type END,
  CASE WHEN recipient."Language Preference"='ไทย' THEN 'th' ELSE 'en' END::text,
  CASE WHEN e.source_kind='chat' THEN src.source_title WHEN recipient."Language Preference"='ไทย' THEN b."Borrower Name" ELSE nullif(btrim(b."Description",E' \t\r\n\f\v'),'') END,
  src.source_amount,
  -- R118: the late-charge part of the payment.
  CASE WHEN e.source_kind='payment' THEN (SELECT coalesce(sum(y."Late Charge Paid"::numeric),0) FROM public."Repayments" y WHERE y."Ref Payment"=e.source_id) END
 FROM public.pwa_notification_events e
 LEFT JOIN public."Partners" recipient ON recipient."Row ID"=partner
 LEFT JOIN LATERAL (
  SELECT true AS source_found,p."Ref Borrower" AS borrower_id,p."Amount Received"::numeric AS source_amount,NULL::text AS source_title FROM public."Payments" p WHERE e.source_kind='payment' AND p."Row ID"=e.source_id
  UNION ALL
  SELECT true,l."Ref Borrowers",l."Principal Amount"::numeric,NULL::text FROM public."Loans" l WHERE e.source_kind='loan' AND l."Row ID"=e.source_id
  UNION ALL
  SELECT true,NULL::text,NULL::numeric,t.title FROM public.pwa_chat_threads t WHERE e.source_kind='chat' AND t.id::text=e.source_id AND t.partner_id=partner
 ) source_row ON true
 CROSS JOIN LATERAL (SELECT coalesce(source_row.source_found,false) AS source_found,source_row.borrower_id,source_row.source_amount,source_row.source_title) src
 LEFT JOIN public."Borrowers" b ON b."Row ID"=src.borrower_id
 WHERE e.event_id=ANY(events) AND EXISTS(SELECT 1 FROM public.pwa_notification_deliveries d WHERE d.event_id=e.event_id AND d.recipient_partner_id=partner);
END $$;


--
-- Name: FUNCTION pwa_notify_history_content_v2(actor jsonb, events uuid[]); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_notify_history_content_v2(actor jsonb, events uuid[]) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_notify_history_v1(jsonb, timestamp with time zone, uuid); Type: FUNCTION
--

CREATE FUNCTION public.pwa_notify_history_v1(actor jsonb, before_at timestamp with time zone, before_id uuid) RETURNS TABLE("eventId" uuid, type text, "occurredAt" text, state text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE partner text:=public.pwa_notify_actor_v1(actor);
BEGIN
 IF (before_at IS NULL)<>(before_id IS NULL) OR (before_at IS NOT NULL AND NOT isfinite(before_at)) THEN RAISE EXCEPTION 'invalid_request'; END IF;
 RETURN QUERY SELECT e.event_id,e.event_type,to_char(e.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 CASE WHEN bool_or(d.state='sent') THEN 'sent' WHEN bool_or(d.state='uncertain') THEN 'uncertain' ELSE min(d.state) END
 FROM public.pwa_notification_deliveries d JOIN public.pwa_notification_events e USING(event_id)
 WHERE d.recipient_partner_id=partner AND (before_at IS NULL OR (e.occurred_at,e.event_id)<(before_at,before_id))
 GROUP BY e.event_id ORDER BY e.occurred_at DESC,e.event_id DESC LIMIT 26;
END $$;


--
-- Name: FUNCTION pwa_notify_history_v1(actor jsonb, before_at timestamp with time zone, before_id uuid); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_notify_history_v1(actor jsonb, before_at timestamp with time zone, before_id uuid) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_notify_preference_v1(jsonb, boolean); Type: FUNCTION
--

CREATE FUNCTION public.pwa_notify_preference_v1(actor jsonb, preference boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE partner text:=public.pwa_notify_actor_v1(actor);
BEGIN
 IF preference IS NULL THEN RAISE EXCEPTION 'invalid_request'; END IF;
 INSERT INTO public.pwa_notification_preferences AS p(partner_id,channel,enabled) VALUES(partner,'web-push',preference)
 ON CONFLICT(partner_id,channel) DO UPDATE SET enabled=excluded.enabled,version=p.version+1,updated_at=clock_timestamp();
END $$;


--
-- Name: FUNCTION pwa_notify_preference_v1(actor jsonb, preference boolean); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_notify_preference_v1(actor jsonb, preference boolean) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_notify_prepare_send_v1(uuid, bigint); Type: FUNCTION
--

CREATE FUNCTION public.pwa_notify_prepare_send_v1(delivery uuid, generation bigint) RETURNS TABLE(subscription_id uuid, version bigint, issuer text, subject text, partner_id text, endpoint_hash text, endpoint text, p256dh text, auth text, expires_at timestamp with time zone, login_email text, partner_role text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 RETURN QUERY SELECT s.subscription_id,s.version,s.issuer,s.subject,s.partner_id,s.endpoint_hash,s.endpoint,s.p256dh,s.auth,s.expires_at,lower(btrim(p."Login Email")),p."Partner Role"
 FROM public.pwa_notification_deliveries d JOIN public.pwa_push_subscriptions s USING(subscription_id) JOIN public."Partners" p ON p."Row ID"=s.partner_id
 WHERE d.delivery_id=delivery AND d.lease_generation=generation AND d.state='leased' AND d.lease_expires_at>clock_timestamp() AND d.send_started_at IS NULL
 AND s.version=d.subscription_version AND public.pwa_notify_eligible_v1(d.event_id,s.subscription_id);
END $$;


--
-- Name: FUNCTION pwa_notify_prepare_send_v1(delivery uuid, generation bigint); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_notify_prepare_send_v1(delivery uuid, generation bigint) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_notify_revoke_v1(jsonb, uuid); Type: FUNCTION
--

CREATE FUNCTION public.pwa_notify_revoke_v1(actor jsonb, id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE partner text:=public.pwa_notify_actor_v1(actor);
BEGIN
 UPDATE public.pwa_push_subscriptions SET enabled=false,version=version+1 WHERE subscription_id=id AND issuer=actor->>'issuer' AND subject=actor->>'subject' AND partner_id=partner;
END $$;


--
-- Name: FUNCTION pwa_notify_revoke_v1(actor jsonb, id uuid); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_notify_revoke_v1(actor jsonb, id uuid) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_notify_start_send_v1(uuid, bigint, bigint); Type: FUNCTION
--

CREATE FUNCTION public.pwa_notify_start_send_v1(delivery uuid, generation bigint, subscription_version bigint) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE changed bigint;
BEGIN
 PERFORM public.pwa_worker_guard_v1('dispatch');
 PERFORM 1 FROM public.pwa_push_subscriptions s JOIN public.pwa_notification_deliveries d USING(subscription_id) WHERE d.delivery_id=delivery FOR UPDATE OF s;
 UPDATE public.pwa_notification_deliveries d SET send_started_at=clock_timestamp()
 WHERE d.delivery_id=delivery AND d.lease_generation=generation AND d.state='leased' AND d.lease_expires_at>clock_timestamp() AND d.send_started_at IS NULL
 AND d.subscription_version=$3 AND EXISTS(SELECT 1 FROM public.pwa_push_subscriptions s WHERE s.subscription_id=d.subscription_id AND s.version=$3)
 AND public.pwa_notify_eligible_v1(d.event_id,d.subscription_id);
 GET DIAGNOSTICS changed=ROW_COUNT;RETURN changed=1;
END $_$;


--
-- Name: FUNCTION pwa_notify_start_send_v1(delivery uuid, generation bigint, subscription_version bigint); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_notify_start_send_v1(delivery uuid, generation bigint, subscription_version bigint) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_notify_status_v1(jsonb, text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_notify_status_v1(actor jsonb, endpoint_digest text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE partner text:=public.pwa_notify_actor_v1(actor);
BEGIN
 IF endpoint_digest IS NOT NULL AND endpoint_digest !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid_request'; END IF;
 RETURN jsonb_build_object('enabled',coalesce((SELECT enabled FROM public.pwa_notification_preferences WHERE partner_id=partner AND channel='web-push'),true),
 'deviceRegistered',EXISTS(SELECT 1 FROM public.pwa_push_subscriptions WHERE partner_id=partner AND issuer=actor->>'issuer' AND subject=actor->>'subject' AND endpoint_hash=endpoint_digest AND enabled AND (expires_at IS NULL OR expires_at>clock_timestamp())),
 'subscriptionId',(SELECT subscription_id FROM public.pwa_push_subscriptions WHERE partner_id=partner AND issuer=actor->>'issuer' AND subject=actor->>'subject' AND endpoint_hash=endpoint_digest AND enabled AND (expires_at IS NULL OR expires_at>clock_timestamp())));
END $_$;


--
-- Name: FUNCTION pwa_notify_status_v1(actor jsonb, endpoint_digest text); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_notify_status_v1(actor jsonb, endpoint_digest text) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_notify_subscribe_v1(jsonb, jsonb); Type: FUNCTION
--

CREATE FUNCTION public.pwa_notify_subscribe_v1(actor jsonb, subscription jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE partner text; endpoint text; endpoint_digest text; expires timestamptz; subscription_id uuid; key_bytes bytea; auth_bytes bytea;
BEGIN
 partner:=public.pwa_notify_actor_v1(actor);endpoint:=subscription->>'endpoint';
 IF jsonb_typeof(subscription) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(subscription) key) IS DISTINCT FROM ARRAY['endpoint','expirationTime','keys']::text[]
 OR jsonb_typeof(subscription->'keys') IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(subscription->'keys') key) IS DISTINCT FROM ARRAY['auth','p256dh']::text[]
 OR jsonb_typeof(subscription->'endpoint') IS DISTINCT FROM 'string' OR coalesce(length(endpoint),0) NOT BETWEEN 1 AND 4096
 OR endpoint !~ '^https://(fcm\.googleapis\.com|([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+push\.apple\.com|updates\.push\.services\.mozilla\.com)/[^[:space:]#]*$'
 OR coalesce(subscription#>>'{keys,p256dh}','') !~ '^[A-Za-z0-9_-]{87}$' OR coalesce(subscription#>>'{keys,auth}','') !~ '^[A-Za-z0-9_-]{22}$' THEN RAISE EXCEPTION 'invalid_subscription'; END IF;
 BEGIN
  key_bytes:=decode(translate(subscription#>>'{keys,p256dh}','-_','+/')||'=','base64');auth_bytes:=decode(translate(subscription#>>'{keys,auth}','-_','+/')||'==','base64');
  IF octet_length(key_bytes)<>65 OR get_byte(key_bytes,0)<>4 OR octet_length(auth_bytes)<>16 THEN RAISE EXCEPTION 'invalid_subscription'; END IF;
  IF subscription->'expirationTime'<>'null'::jsonb THEN
   IF jsonb_typeof(subscription->'expirationTime')<>'number' OR subscription->>'expirationTime' !~ '^[0-9]{1,16}$' THEN RAISE EXCEPTION 'invalid_subscription'; END IF;
   expires:=to_timestamp((subscription->>'expirationTime')::numeric/1000);IF expires<=clock_timestamp() THEN RAISE EXCEPTION 'invalid_subscription'; END IF;
  END IF;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid_subscription'; END;
 endpoint_digest:=encode(sha256(convert_to(endpoint,'UTF8')),'hex');
 INSERT INTO public.pwa_push_subscriptions AS s(issuer,subject,partner_id,endpoint_hash,endpoint,p256dh,auth,expires_at)
 VALUES(actor->>'issuer',actor->>'subject',partner,endpoint_digest,endpoint,subscription#>>'{keys,p256dh}',subscription#>>'{keys,auth}',expires)
 ON CONFLICT(endpoint_hash) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,expires_at=excluded.expires_at,enabled=true,version=s.version+1,last_seen_at=clock_timestamp()
 WHERE s.issuer=excluded.issuer AND s.subject=excluded.subject AND s.partner_id=excluded.partner_id RETURNING s.subscription_id INTO subscription_id;
 IF subscription_id IS NULL THEN RAISE EXCEPTION 'access_denied'; END IF;
 RETURN jsonb_build_object('subscriptionId',subscription_id);
END $_$;


--
-- Name: FUNCTION pwa_notify_subscribe_v1(actor jsonb, subscription jsonb); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_notify_subscribe_v1(actor jsonb, subscription jsonb) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_notify_target_v1(jsonb, uuid); Type: FUNCTION
--

CREATE FUNCTION public.pwa_notify_target_v1(actor jsonb, event uuid) RETURNS TABLE(kind text, id text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE partner text:=public.pwa_notify_actor_v1(actor);
BEGIN
 RETURN QUERY SELECT e.source_kind,e.source_id FROM public.pwa_notification_events e WHERE e.event_id=$2 AND EXISTS(SELECT 1 FROM public.pwa_notification_deliveries d WHERE d.event_id=e.event_id AND d.recipient_partner_id=partner);
END $_$;


--
-- Name: FUNCTION pwa_notify_target_v1(actor jsonb, event uuid); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_notify_target_v1(actor jsonb, event uuid) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: pwa_operation_status_v2(uuid, text, text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_operation_status_v2(request_id uuid, actor_issuer text, actor_subject text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE r public.pwa_payment_commands%ROWTYPE;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR NOT pg_has_role(session_user,CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END,'MEMBER') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Application session required';END IF;
 SELECT * INTO r FROM public.pwa_payment_commands p WHERE p.request_id=$1 AND p.contract_version=2 AND p.actor_issuer=$2 AND p.actor_subject=$3;
 IF NOT FOUND THEN RETURN jsonb_build_object('kind','unresolved');END IF;
 IF (SELECT count(*) FROM public."Partners" WHERE lower(btrim("Login Email"))=r.actor_login_email)<>1 OR NOT EXISTS(SELECT 1 FROM public."Partners" WHERE "Row ID"=r.actor_partner_id AND lower(btrim("Login Email"))=r.actor_login_email) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current actor mapping required';END IF;
 RETURN jsonb_build_object('kind','recorded','originalOutcome',jsonb_build_object('status',r.outcome,'code',r.rejection_code,'result',r.result_json,'recordedAt',to_char(r.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
END $_$;


--
-- Name: pwa_pay_forward_plan_v1(text, numeric, date, jsonb); Type: FUNCTION
--

CREATE FUNCTION public.pwa_pay_forward_plan_v1(p_borrower text, p_amount numeric, p_day date, p_purpose jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE
 forward boolean; chosen text[]; req jsonb; requests jsonb:='{}'::jsonb; rest numeric; remainder numeric; due_total numeric:=0;
 ch record; l public."Loans"%ROWTYPE; lines jsonb:='{}'::jsonb; line jsonb; due_ids text[]:=ARRAY[]::text[];
 p numeric; i numeric; amount numeric;
 -- R118: the late-charge part of a line, and today's charge late remaining (raise).
 lt numeric; today_lr numeric; accrued numeric; outstanding numeric; daily_after numeric; daily numeric; latest date;
 today_id text; today_count integer; today_pr numeric; today_ir numeric; kind text; charge_id text; reason text; s jsonb;
 principal_out jsonb:='[]'::jsonb; options jsonb:='[]'::jsonb; settles jsonb:='[]'::jsonb; blocked jsonb:='[]'::jsonb; sim jsonb:='{}'::jsonb;
 loan jsonb; charges jsonb; stop boolean; dates date[]; d date; prev date; recorded_max date; days integer; elapsed integer; rem numeric;
 cand jsonb:='[]'::jsonb; r jsonb; forward_out jsonb:='[]'::jsonb; materialize jsonb:='[]'::jsonb; paid_through jsonb:='{}'::jsonb;
 -- R113 settle: the loan's Loan Close quote, its payoff remainder (the quote less its due charges), gap interest, owed principal.
 calc jsonb; payoff numeric; due_loan numeric; gap numeric; owed numeric; settling boolean; settle_option jsonb; cl jsonb; loan_due_ids text[];
 settled text[]:=ARRAY[]::text[]; business_day date:=(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date;
BEGIN
 -- Inputs: whole positive amount; purpose with exactly forward, principal (unique loans, whole positive amounts) and loans.
 IF p_borrower IS NULL OR p_day IS NULL OR p_amount IS NULL OR p_amount<=0 OR p_amount<>trunc(p_amount) OR p_amount>92233720368547758
  OR jsonb_typeof(p_purpose) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid pay forward request'; END IF;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_purpose) key) IS DISTINCT FROM ARRAY['forward','loans','principal']
  OR jsonb_typeof(p_purpose->'forward') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_purpose->'principal') IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_purpose->'principal')>20 OR jsonb_typeof(p_purpose->'loans') NOT IN ('null','array') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid pay forward request'; END IF;
 FOR req IN SELECT value FROM jsonb_array_elements(p_purpose->'principal') LOOP
  IF jsonb_typeof(req) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid pay forward request'; END IF;
  IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(req) key) IS DISTINCT FROM ARRAY['amount','loanId'] OR jsonb_typeof(req->'loanId') IS DISTINCT FROM 'string'
   OR jsonb_typeof(req->'amount') IS DISTINCT FROM 'string' OR req->>'amount' !~ '^[1-9][0-9]{0,16}$' OR requests ? (req->>'loanId') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid pay forward request'; END IF;
  requests:=requests||jsonb_build_object(req->>'loanId',req->'amount');
 END LOOP;
 forward:=(p_purpose->>'forward')::boolean;
 IF jsonb_typeof(p_purpose->'loans')='array' THEN
  IF jsonb_array_length(p_purpose->'loans')>100 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_purpose->'loans') x WHERE jsonb_typeof(x)<>'string') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid pay forward request'; END IF;
  SELECT coalesce(array_agg(x),ARRAY[]::text[]) INTO chosen FROM jsonb_array_elements_text(p_purpose->'loans') x;
 END IF;

 -- 1. Charges due by the day, in Auto-assign order: newest date first, then id (byte order) descending; interest first.
 rest:=p_amount;
 FOR ch IN SELECT c."Row ID" AS id,c."Charge Date" AS d,c."Principal Due"::numeric-coalesce(paid.p,0) AS pr,c."Interest Due"::numeric-coalesce(paid.i,0) AS ir,c."Late Charge Due"::numeric-coalesce(paid.l,0) AS lr
   FROM public."Charges" c JOIN public."Loans" x ON x."Row ID"=c."Ref Loans"
   LEFT JOIN LATERAL (SELECT sum(y."Principal Paid"::numeric) p,sum(y."Interest Paid"::numeric) i,sum(y."Late Charge Paid"::numeric) l FROM public."Repayments" y WHERE y."Ref Charges"=c."Row ID") paid ON true
   WHERE x."Ref Borrowers"=p_borrower AND c."Charge Date"<=p_day AND c."Amount Remaining">0
   ORDER BY c."Charge Date" DESC,c."Row ID" COLLATE "C" DESC LOOP
  IF ch.pr IS NULL OR ch.ir IS NULL OR ch.lr IS NULL OR ch.pr<0 OR ch.ir<0 OR ch.lr<0 OR ch.pr<>trunc(ch.pr) OR ch.ir<>trunc(ch.ir) OR ch.lr<>trunc(ch.lr) THEN RAISE EXCEPTION 'Pay forward requires reconciled charges'; END IF;
  due_total:=due_total+ch.pr+ch.ir+ch.lr;
  i:=least(rest,ch.ir);rest:=rest-i;lt:=least(rest,ch.lr);rest:=rest-lt;p:=least(rest,ch.pr);rest:=rest-p;
  IF p+i+lt>0 THEN
   lines:=lines||jsonb_build_object(ch.id,jsonb_build_object('principal',p,'interest',i,'lateCharge',lt,'expectedPrincipalRemaining',ch.pr,'expectedInterestRemaining',ch.ir,'expectedLateChargeRemaining',ch.lr,'chargeDate',to_char(ch.d,'YYYY-MM-DD')));
   due_ids:=array_append(due_ids,ch.id);
  END IF;
 END LOOP;
 remainder:=rest;

 -- 2. Principal repayment (D9). Every open daily-interest loan of the borrower is evaluated (the options a form may
 -- offer); a requested loan is applied in loan order when eligible, not settling and within what is left.
 -- R113: every open loan; a requested amount reaching a loan's outstanding principal settles it when it equals its payoff
 -- remainder: the Loan Close quote (loan_close_calculation_v83, same amount and planHash) less the loan's due charges,
 -- which step 1 paid in full. The quote's lines replace the loan's due lines; the command applies its mutation.
 FOR l IN SELECT * FROM public."Loans" x WHERE x."Ref Borrowers"=p_borrower AND x."Loan Status"='ยังไม่ปิดยอด'
   ORDER BY x."Row ID" COLLATE "C" LOOP
  IF l."Loan Type" IS DISTINCT FROM 'ดอกเบี้ยรายวัน' THEN
   IF requests ? l."Row ID" THEN blocked:=blocked||jsonb_build_array(jsonb_build_object('loanId',l."Row ID",'reason','type')); END IF;
   CONTINUE;
  END IF;
  calc:=NULL;payoff:=NULL;gap:=0;loan_due_ids:=ARRAY[]::text[];
  IF NOT coalesce(l."Defaulted",false) THEN
   BEGIN calc:=public.loan_close_calculation_v83(l."Row ID",p_day); EXCEPTION WHEN OTHERS THEN calc:=NULL; END;
  END IF;
  SELECT l."Principal Amount"::numeric-coalesce(sum(y."Principal Paid"::numeric),0) INTO owed FROM public."Repayments" y WHERE y."Ref Loans"=l."Row ID";
  IF calc IS NOT NULL THEN
   SELECT coalesce(sum(c."Principal Due"::numeric-coalesce(paid.p,0)+c."Interest Due"::numeric-coalesce(paid.i,0)+c."Late Charge Due"::numeric-coalesce(paid.l,0)),0),coalesce(array_agg(c."Row ID"),ARRAY[]::text[]) INTO due_loan,loan_due_ids
    FROM public."Charges" c LEFT JOIN LATERAL (SELECT sum(y."Principal Paid"::numeric) p,sum(y."Interest Paid"::numeric) i,sum(y."Late Charge Paid"::numeric) l FROM public."Repayments" y WHERE y."Ref Charges"=c."Row ID") paid ON true
    WHERE c."Ref Loans"=l."Row ID" AND c."Charge Date"<=p_day AND c."Amount Remaining">0;
   payoff:=(calc->>'amount')::numeric-due_loan;
   gap:=CASE WHEN calc->'mutation'->>'kind'='insert' THEN (calc->'mutation'->>'interest')::numeric ELSE 0 END;
  END IF;
  settle_option:=jsonb_build_object('payoffRemainder',CASE WHEN payoff IS NOT NULL THEN trunc(payoff)::text END,'settlesWith',CASE WHEN calc IS NOT NULL THEN
   jsonb_build_object('payoff',calc->>'amount','gapInterest',trunc(gap)::text,'charges',trunc(payoff-owed-gap)::text,'planHash',calc->>'planHash') END);
  settling:=requests ? l."Row ID" AND owed IS NOT NULL AND (requests->>l."Row ID")::numeric>=owed;
  IF settling THEN
   amount:=(requests->>l."Row ID")::numeric;settles:=settles||to_jsonb(l."Row ID");
   reason:=CASE WHEN calc IS NULL THEN 'close' WHEN p_day<>business_day THEN 'date' WHEN amount<payoff THEN 'needs_gap_interest' WHEN amount>payoff THEN 'exceeds'
    WHEN payoff>rest THEN 'exceeds_remainder' END;
   IF reason IS NOT NULL THEN
    blocked:=blocked||jsonb_build_array(jsonb_build_object('loanId',l."Row ID",'reason',reason)||CASE WHEN reason='needs_gap_interest' THEN jsonb_build_object('more',trunc(payoff-amount)::text) ELSE '{}'::jsonb END);
   ELSE
    lines:=lines-loan_due_ids;
    FOR cl IN SELECT value FROM jsonb_array_elements(calc->'allocations') LOOP
     lines:=lines||jsonb_build_object(cl->>'chargeId',jsonb_build_object('principal',(cl->>'principal')::numeric,'interest',(cl->>'interest')::numeric,'lateCharge',coalesce(cl->>'lateCharge','0')::numeric,'expectedLateChargeRemaining',coalesce(cl->>'expectedLateChargeRemaining','0')::numeric,
      'expectedPrincipalRemaining',(cl->>'expectedPrincipalRemaining')::numeric,'expectedInterestRemaining',(cl->>'expectedInterestRemaining')::numeric,'chargeDate',cl->>'chargeDate'));
    END LOOP;
    rest:=rest-payoff;settled:=array_append(settled,l."Row ID");
    principal_out:=principal_out||jsonb_build_array(jsonb_build_object('loanId',l."Row ID",'kind','settle','chargeId',calc->>'targetChargeId',
     'chargeDate',coalesce((SELECT cl2->>'chargeDate' FROM jsonb_array_elements(calc->'allocations') cl2 WHERE cl2->>'chargeId'=calc->>'targetChargeId'),to_char(p_day,'YYYY-MM-DD')),
     'amount',trunc(payoff)::text,'accruedInterest',trunc(gap)::text,'principalDue',trunc(owed)::text,'outstandingBefore',trunc(owed)::text,'outstandingAfter','0',
     'dailyBefore',trunc(l."Current Daily Interest"::numeric)::text,'dailyAfter','0','payoff',calc->>'amount','charges',trunc(payoff-owed-gap)::text,'planHash',calc->>'planHash'));
   END IF;
  END IF;
  reason:=NULL;
  IF coalesce(l."Defaulted",false) THEN reason:='defaulted';
  ELSIF l."Original Daily Interest Rate" IS NULL THEN reason:='no_rate';
  ELSIF NOT coalesce(l."Auto Charge Enabled",false) OR NOT coalesce(l."Interest Payment Interval">=1,false) OR l."Loan Date" IS NULL OR l."Loan Date">p_day
   OR NOT coalesce(l."Current Daily Interest"::numeric>=0,false) THEN reason:='schedule';
  ELSIF EXISTS(SELECT 1 FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND (c."Charge Date" IS NULL OR starts_with(c."Row ID",'df10:'))) THEN reason:='invalid';
  ELSIF EXISTS(SELECT 1 FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID"
    AND c."Principal Due"::numeric>coalesce((SELECT sum(y."Principal Paid"::numeric) FROM public."Repayments" y WHERE y."Ref Charges"=c."Row ID"),0)) THEN reason:='principal_due';
  ELSIF EXISTS(SELECT 1 FROM public."Repayments" y WHERE y."Ref Loans"=l."Row ID" AND (y."Payment Date" IS NULL OR y."Payment Date">p_day)) THEN reason:='later_payment';
  -- A charge already recorded after the day was priced on the old schedule; the new anchor would not follow it.
  ELSIF EXISTS(SELECT 1 FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND c."Charge Date">p_day) THEN reason:='future_charges';
  END IF;
  IF reason IS NULL THEN
   SELECT count(*),min(c."Row ID") INTO today_count,today_id FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND c."Charge Date"=p_day;
   IF today_count>1 THEN reason:='multiple_today';
   ELSIF today_count=0 AND p_day<=l."Loan Date" THEN reason:='loan_date';
   END IF;
  END IF;
  IF reason IS NULL THEN
   SELECT l."Principal Amount"::numeric-coalesce(sum(y."Principal Paid"::numeric),0) INTO outstanding FROM public."Repayments" y WHERE y."Ref Loans"=l."Row ID";
   IF today_count=1 THEN
    kind:='raise';charge_id:=today_id;accrued:=0;
   ELSE
    kind:='book';charge_id:='pf121:'||length(l."Row ID")||':'||l."Row ID"||':'||to_char(p_day,'YYYY-MM-DD');
    -- generate_loan_charge and loan_close_calculation_v83: daily amount x days since the latest charge on or before the day.
    SELECT max(c."Charge Date") INTO latest FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND c."Charge Date"<=p_day AND NOT starts_with(c."Row ID",'df10:');
    accrued:=l."Current Daily Interest"::numeric*greatest(0,p_day-coalesce(latest,l."Loan Date"));
   END IF;
   IF outstanding IS NULL OR outstanding<=0 OR outstanding<>trunc(outstanding) OR accrued<>trunc(accrued) THEN reason:='invalid'; END IF;
  END IF;
  IF reason IS NOT NULL THEN
   IF requests ? l."Row ID" AND NOT settling THEN blocked:=blocked||jsonb_build_array(jsonb_build_object('loanId',l."Row ID",'reason',reason)); END IF;
   -- R113: a loan that can only be settled is offered with its payoff (no partial principal: kind null).
   IF calc IS NOT NULL THEN
    options:=options||jsonb_build_array(jsonb_build_object('loanId',l."Row ID",'kind',NULL,'chargeId',NULL,'accruedInterest',NULL,'outstanding',trunc(owed)::text,
     'dailyBefore',trunc(l."Current Daily Interest"::numeric)::text,'interval',l."Interest Payment Interval")||settle_option);
   END IF;
   CONTINUE;
  END IF;
  options:=options||jsonb_build_array(jsonb_build_object('loanId',l."Row ID",'kind',kind,'chargeId',charge_id,'accruedInterest',trunc(accrued)::text,
   'outstanding',trunc(outstanding)::text,'dailyBefore',trunc(l."Current Daily Interest"::numeric)::text,'interval',l."Interest Payment Interval")||settle_option);
  IF NOT requests ? l."Row ID" THEN CONTINUE; END IF;
  amount:=(requests->>l."Row ID")::numeric;
  -- R113: settled or blocked above.
  IF settling THEN CONTINUE;END IF;
  IF amount+accrued>rest THEN blocked:=blocked||jsonb_build_array(jsonb_build_object('loanId',l."Row ID",'reason','exceeds_remainder'));CONTINUE;END IF;
  -- apply_principal_daily_interest's expression for the new daily amount.
  daily_after:=round(greatest(0,outstanding-amount)*l."Original Daily Interest Rate"/100.0);
  IF kind='raise' THEN
   SELECT c."Principal Due"::numeric,c."Interest Due"::numeric-coalesce((SELECT sum(y."Interest Paid"::numeric) FROM public."Repayments" y WHERE y."Ref Charges"=c."Row ID"),0)
    INTO today_pr,today_ir FROM public."Charges" c WHERE c."Row ID"=charge_id;
   SELECT c."Late Charge Due"::numeric-coalesce((SELECT sum(y."Late Charge Paid"::numeric) FROM public."Repayments" y WHERE y."Ref Charges"=c."Row ID"),0)
    INTO today_lr FROM public."Charges" c WHERE c."Row ID"=charge_id;
   line:=coalesce(lines->charge_id,jsonb_build_object('principal',0,'interest',0,'lateCharge',0,'expectedPrincipalRemaining',0,'expectedInterestRemaining',today_ir,'expectedLateChargeRemaining',today_lr,'chargeDate',to_char(p_day,'YYYY-MM-DD')));
   line:=line||jsonb_build_object('principal',(line->>'principal')::numeric+amount,'expectedPrincipalRemaining',(line->>'expectedPrincipalRemaining')::numeric+amount);
   lines:=lines||jsonb_build_object(charge_id,line);
  ELSE
   today_pr:=0;
   lines:=lines||jsonb_build_object(charge_id,jsonb_build_object('principal',amount,'interest',accrued,'lateCharge',0,'expectedPrincipalRemaining',amount,'expectedInterestRemaining',accrued,'expectedLateChargeRemaining',0,'chargeDate',to_char(p_day,'YYYY-MM-DD')));
  END IF;
  rest:=rest-amount-accrued;
  principal_out:=principal_out||jsonb_build_array(jsonb_build_object('loanId',l."Row ID",'kind',kind,'chargeId',charge_id,'chargeDate',to_char(p_day,'YYYY-MM-DD'),
   'amount',trunc(amount)::text,'accruedInterest',trunc(accrued)::text,'principalDue',trunc(today_pr+amount)::text,
   'outstandingBefore',trunc(outstanding)::text,'outstandingAfter',trunc(outstanding-amount)::text,'dailyBefore',trunc(l."Current Daily Interest"::numeric)::text,
   'dailyAfter',trunc(daily_after)::text,'nextChargeDate',to_char(p_day+l."Interest Payment Interval",'YYYY-MM-DD'),'nextChargeAmount',trunc(daily_after*l."Interest Payment Interval")::text));
  sim:=sim||jsonb_build_object(l."Row ID",jsonb_build_object('balance',outstanding-amount,'daily',daily_after,'kind',kind,'chargeId',charge_id,'principal',amount,'accrued',accrued));
 END LOOP;
 SELECT blocked||coalesce(jsonb_agg(jsonb_build_object('loanId',k,'reason','not_found')),'[]'::jsonb) INTO blocked FROM jsonb_object_keys(requests) k
  WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(blocked) b WHERE b->>'loanId'=k) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(options) o WHERE o->>'loanId'=k);

 -- 3. Pay forward: future charges of the eligible loans, earliest date first across loans (tie: smaller loan key).
 IF forward AND rest>0 THEN
  FOR l IN SELECT * FROM public."Loans" x WHERE x."Ref Borrowers"=p_borrower AND x."Loan Status"='ยังไม่ปิดยอด' AND (chosen IS NULL OR x."Row ID"=ANY(chosen))
    ORDER BY x."Row ID" COLLATE "C" LOOP
   s:=sim->l."Row ID";reason:=NULL;
   IF l."Row ID"=ANY(settled) THEN CONTINUE; END IF;
   IF coalesce(l."Defaulted",false) THEN reason:='defaulted';
   ELSIF NOT coalesce(l."Auto Charge Enabled",false) THEN reason:='manual';
   ELSIF l."Loan Type" IS NULL OR l."Loan Type" NOT IN ('ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน','กำหนดวันชำระ') THEN reason:='loan_type';
   ELSIF l."Loan Date" IS NULL OR l."Loan Date">p_day THEN reason:='not_started';
   ELSIF EXISTS(SELECT 1 FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND c."Charge Date" IS NULL) THEN reason:='invalid';
   ELSIF l."Loan Type"='ดอกเบี้ยรายวัน' AND s IS NULL AND EXISTS(SELECT 1 FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID"
     AND c."Principal Due"::numeric>coalesce((SELECT sum(y."Principal Paid"::numeric) FROM public."Repayments" y WHERE y."Ref Charges"=c."Row ID"),0)) THEN reason:='principal_due';
   ELSIF l."Loan Type"='กำหนดวันชำระ' AND (l."Due Date" IS NULL OR l."Due Date"<=p_day) THEN reason:='due_date';
   END IF;
   IF reason IS NULL THEN
    -- Forecast inputs as V117 builds them; a loan repaying principal is simulated after it (new balance, daily amount,
    -- anchor and today's charge paid), so the forecast dates are the generator's dates after this payment.
    SELECT jsonb_build_object('status',l."Loan Status",'defaulted',coalesce(l."Defaulted",false),'start',l."Loan Date",'close',l."Close Date",
      'balance',coalesce((s->>'balance')::numeric,l."Principal Amount"::numeric-coalesce(sum(y."Principal Paid"::numeric) FILTER(WHERE y."Payment Date"<=p_day),0)),
      'daily',coalesce((s->>'daily')::numeric,l."Current Daily Interest"::numeric),'auto',l."Auto Charge Enabled",
      'interval',l."Interest Payment Interval",'anchor',CASE WHEN s IS NULL THEN l."Interest Schedule Anchor Date" ELSE p_day END,'type',l."Loan Type",'due',l."Due Date",
      'arrangement',l."Loan Arrangement",'original',l."Principal Amount"::numeric,'payment',l."Daily Payment Amount"::numeric,'fixed',l."Fixed Interest"::numeric,
      'invalid',l."Loan Date" IS NULL OR l."Principal Amount" IS NULL OR NOT EXISTS(SELECT 1 FROM public."Borrowers" b WHERE b."Row ID"=l."Ref Borrowers")
       OR coalesce(bool_or(y."Payment Date" IS NULL OR y."Principal Paid" IS NULL OR y."Interest Paid" IS NULL OR y."Payment Date">p_day),false),
      'original_rate',l."Original Daily Interest Rate")
     INTO loan FROM public."Repayments" y WHERE y."Ref Loans"=l."Row ID";
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',c."Row ID",'date',c."Charge Date",
      'pdue',c."Principal Due"::numeric+CASE WHEN c."Row ID"=s->>'chargeId' THEN (s->>'principal')::numeric ELSE 0 END,'idue',c."Interest Due"::numeric,
      'ppaid',coalesce(paid.p,0)+CASE WHEN c."Row ID"=s->>'chargeId' THEN (s->>'principal')::numeric ELSE 0 END,'ipaid',coalesce(paid.i,0),
      'invalid',coalesce(paid.invalid,false) OR c."Charge Date" IS NULL OR c."Principal Due" IS NULL OR c."Interest Due" IS NULL)),'[]'::jsonb)
     INTO charges FROM public."Charges" c
     LEFT JOIN LATERAL (SELECT sum(y."Principal Paid"::numeric) FILTER(WHERE y."Payment Date"<=p_day) p,sum(y."Interest Paid"::numeric) FILTER(WHERE y."Payment Date"<=p_day) i,
       bool_or(y."Payment Date" IS NULL OR y."Principal Paid" IS NULL OR y."Interest Paid" IS NULL OR y."Ref Loans" IS DISTINCT FROM c."Ref Loans") invalid
      FROM public."Repayments" y WHERE y."Ref Charges"=c."Row ID") paid ON true
     WHERE c."Ref Loans"=l."Row ID";
    IF s->>'kind'='book' THEN
     charges:=charges||jsonb_build_array(jsonb_build_object('id',s->>'chargeId','date',p_day,'pdue',(s->>'principal')::numeric,'idue',(s->>'accrued')::numeric,
      'ppaid',(s->>'principal')::numeric,'ipaid',(s->>'accrued')::numeric,'invalid',false));
    END IF;
    SELECT coalesce(bool_or(f.origin IN ('Exception','Notice')),false),array_agg(f.due_date ORDER BY f.due_date) FILTER(WHERE f.origin='Simulated' AND f.eligible AND f.due_date>p_day AND f.principal+f.interest>0)
     INTO stop,dates FROM public.forecast_schedule_v1(loan,charges,p_day,p_day+93) f;
    IF stop THEN reason:='forecast'; END IF;
   END IF;
   IF reason IS NOT NULL THEN blocked:=blocked||jsonb_build_array(jsonb_build_object('loanId',l."Row ID",'reason',reason));CONTINUE; END IF;
   -- Recorded future charges first (an earlier booking), then the next dates after every recorded charge (V117 order).
   FOR ch IN SELECT c."Row ID" AS id,c."Charge Date" AS d,c."Principal Due"::numeric-coalesce(paid.p,0) AS pr,c."Interest Due"::numeric-coalesce(paid.i,0) AS ir,c."Late Charge Due"::numeric-coalesce(paid.l,0) AS lr
     FROM public."Charges" c LEFT JOIN LATERAL (SELECT sum(y."Principal Paid"::numeric) p,sum(y."Interest Paid"::numeric) i,sum(y."Late Charge Paid"::numeric) l FROM public."Repayments" y WHERE y."Ref Charges"=c."Row ID") paid ON true
     WHERE c."Ref Loans"=l."Row ID" AND c."Charge Date">p_day AND c."Charge Date"<=p_day+93 AND NOT starts_with(c."Row ID",'df10:') AND c."Amount Remaining">0
     ORDER BY c."Charge Date",c."Row ID" COLLATE "C" LOOP
    IF ch.pr IS NULL OR ch.ir IS NULL OR ch.lr IS NULL OR ch.pr<0 OR ch.ir<0 OR ch.lr<0 OR ch.pr<>trunc(ch.pr) OR ch.ir<>trunc(ch.ir) OR ch.lr<>trunc(ch.lr) THEN RAISE EXCEPTION 'Pay forward requires reconciled charges'; END IF;
    cand:=cand||jsonb_build_array(jsonb_build_object('loan',l."Row ID",'d',ch.d,'id',ch.id,'pr',ch.pr,'ir',ch.ir,'lr',ch.lr,'book',false));
   END LOOP;
   SELECT max(c."Charge Date") INTO recorded_max FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID";
   prev:=NULL;
   FOREACH d IN ARRAY coalesce(dates,ARRAY[]::date[]) LOOP
    IF d<=greatest(recorded_max,p_day) THEN CONTINUE; END IF;
    -- generate_loan_charge's arithmetic for that date, the earlier simulated charges counted as booked.
    IF l."Loan Type"='ดอกเบี้ยรายวัน' THEN
     SELECT max(c."Charge Date") INTO latest FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND c."Charge Date"<=d AND NOT starts_with(c."Row ID",'df10:');
     latest:=greatest(latest,prev,CASE WHEN s IS NOT NULL THEN p_day END);
     daily:=coalesce((s->>'daily')::numeric,l."Current Daily Interest"::numeric);
     p:=0;i:=daily*greatest(0,d-coalesce(latest,l."Loan Date"));
    ELSIF l."Loan Type"='ผ่อนชำระรายวัน' THEN
     latest:=greatest(recorded_max,prev);
     IF latest IS NULL OR l."Due Date" IS NULL THEN EXIT; END IF;
     days:=l."Due Date"-l."Loan Date"+1;elapsed:=d-latest;
     IF days<=0 OR elapsed<=0 THEN EXIT; END IF;
     rem:=mod(l."Principal Amount"::numeric,days);
     p:=floor(l."Principal Amount"::numeric/days)*elapsed+greatest(0,least(d-l."Loan Date"+1,rem)-(latest-l."Loan Date"+1));
     i:=l."Daily Payment Amount"::numeric*elapsed-p;
    ELSE
     IF d IS DISTINCT FROM l."Due Date" THEN CONTINUE; END IF;
     SELECT l."Principal Amount"::numeric-coalesce(sum(y."Principal Paid"::numeric),0) INTO p FROM public."Repayments" y WHERE y."Ref Loans"=l."Row ID";
     i:=l."Fixed Interest"::numeric;
    END IF;
    IF p IS NULL OR i IS NULL OR p<0 OR i<0 OR p+i<=0 OR p<>trunc(p) OR i<>trunc(i) THEN EXIT; END IF;
    cand:=cand||jsonb_build_array(jsonb_build_object('loan',l."Row ID",'d',d,'id','cg8:'||length(l."Row ID")||':'||l."Row ID"||':'||to_char(d,'YYYY-MM-DD'),'pr',p,'ir',i,'lr',0,'book',true));
    prev:=d;
   END LOOP;
  END LOOP;
  FOR r IN SELECT value FROM jsonb_array_elements(cand) ORDER BY (value->>'d')::date,value->>'loan' COLLATE "C" LOOP
   EXIT WHEN rest<=0;
   i:=least(rest,(r->>'ir')::numeric);rest:=rest-i;lt:=least(rest,(r->>'lr')::numeric);rest:=rest-lt;p:=least(rest,(r->>'pr')::numeric);rest:=rest-p;
   lines:=lines||jsonb_build_object(r->>'id',jsonb_build_object('principal',p,'interest',i,'lateCharge',lt,'expectedPrincipalRemaining',(r->>'pr')::numeric,'expectedInterestRemaining',(r->>'ir')::numeric,'expectedLateChargeRemaining',(r->>'lr')::numeric,'chargeDate',to_char((r->>'d')::date,'YYYY-MM-DD')));
   IF (r->>'book')::boolean THEN
    materialize:=materialize||jsonb_build_array(jsonb_build_object('loanId',r->>'loan','chargeId',r->>'id','chargeDate',to_char((r->>'d')::date,'YYYY-MM-DD'),
     'principalDue',trunc((r->>'pr')::numeric)::text,'interestDue',trunc((r->>'ir')::numeric)::text));
   END IF;
   forward_out:=forward_out||jsonb_build_array(jsonb_build_object('loanId',r->>'loan','chargeId',r->>'id','chargeDate',to_char((r->>'d')::date,'YYYY-MM-DD'),
    'principalDue',trunc((r->>'pr')::numeric)::text,'interestDue',trunc((r->>'ir')::numeric)::text,'principal',trunc(p)::text,'interest',trunc(i)::text,
    'partial',p+i+lt<(r->>'pr')::numeric+(r->>'ir')::numeric+(r->>'lr')::numeric,'booked',(r->>'book')::boolean));
   IF p+i+lt=(r->>'pr')::numeric+(r->>'ir')::numeric+(r->>'lr')::numeric THEN paid_through:=paid_through||jsonb_build_object(r->>'loan',to_char((r->>'d')::date,'YYYY-MM-DD')); END IF;
  END LOOP;
 END IF;

 RETURN jsonb_build_object('day',to_char(p_day,'YYYY-MM-DD'),'amount',trunc(p_amount)::text,'dueTotal',trunc(due_total)::text,'remainder',trunc(remainder)::text,
  'due',(SELECT coalesce(jsonb_agg(x ORDER BY o),'[]'::jsonb) FROM unnest(due_ids) WITH ORDINALITY u(x,o)),
  'allocations',(SELECT coalesce(jsonb_agg(jsonb_build_object('chargeId',e.key,'principal',trunc((e.value->>'principal')::numeric)::text,'interest',trunc((e.value->>'interest')::numeric)::text,
    'lateCharge',trunc(coalesce((e.value->>'lateCharge')::numeric,0))::text,
    'expectedPrincipalRemaining',trunc((e.value->>'expectedPrincipalRemaining')::numeric)::text,'expectedInterestRemaining',trunc((e.value->>'expectedInterestRemaining')::numeric)::text,
    'expectedLateChargeRemaining',trunc(coalesce((e.value->>'expectedLateChargeRemaining')::numeric,0))::text,
    'chargeDate',e.value->>'chargeDate') ORDER BY e.key COLLATE "C"),'[]'::jsonb) FROM jsonb_each(lines) e),
  'materialize',(SELECT coalesce(jsonb_agg(x ORDER BY x->>'chargeId' COLLATE "C"),'[]'::jsonb) FROM jsonb_array_elements(materialize) x),
  'principal',principal_out,'forward',forward_out,'uncovered',trunc(rest)::text,'paidThrough',paid_through,'settles',settles,'blocked',blocked,'options',options);
END $_$;


--
-- Name: FUNCTION pwa_pay_forward_plan_v1(p_borrower text, p_amount numeric, p_day date, p_purpose jsonb); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_pay_forward_plan_v1(p_borrower text, p_amount numeric, p_day date, p_purpose jsonb) IS 'R110: the pay-forward plan of a borrower for an amount received on a day (due charges first, then principal on today''s charge and/or future charges booked in date order); shown by Receive payment and recomputed by pwa_submit_selected_charges_v1 schemaVersion 10. Read only.';


--
-- Name: pwa_payment_correction_text_v2(jsonb); Type: FUNCTION
--

CREATE FUNCTION public.pwa_payment_correction_text_v2(i jsonb) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE fields jsonb;keys text[];k text;value text;field_text text:='{';array_text text:='[';line_text text;line jsonb;last_id text;total numeric:=0;amount numeric;counted integer:=0;
BEGIN
 IF jsonb_typeof(i) IS DISTINCT FROM 'object' OR ((SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['fields','kind','receiptMode'] AND NOT(i->>'kind'='pwa-plan' AND (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key)=ARRAY['closePreparationHash','fields','kind','receiptMode'])) OR i->>'kind' NOT IN('pwa-plan','legacy-source') OR i->>'receiptMode' NOT IN('preserve','replace','remove') THEN RAISE EXCEPTION 'Invalid correction';END IF;
 IF i ? 'closePreparationHash' AND (jsonb_typeof(i->'closePreparationHash') NOT IN('null','string') OR (i->'closePreparationHash'<>'null'::jsonb AND i->>'closePreparationHash'!~'^[a-f0-9]{64}$')) THEN RAISE EXCEPTION 'Invalid close preparation hash';END IF;
 fields:=i->'fields';keys:=ARRAY['borrowerId','amountReceived','paymentDate','paymentMethod','cashAccountId','notes','allocationMethod','targetChargeId','targetLoanId']||ARRAY[CASE WHEN i->>'kind'='pwa-plan' THEN 'allocations' ELSE 'selectedChargeIds' END];
 IF jsonb_typeof(fields) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(fields) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM unnest(keys) key) THEN RAISE EXCEPTION 'Invalid correction fields';END IF;
 FOREACH k IN ARRAY keys[1:9] LOOP
 value:=fields->>k;
 IF k IN('notes','targetChargeId','targetLoanId') THEN IF jsonb_typeof(fields->k) NOT IN('string','null') THEN RAISE EXCEPTION 'Invalid nullable field';END IF;
 ELSE IF jsonb_typeof(fields->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid field';END IF;END IF;
 IF octet_length(value)>65536 THEN RAISE EXCEPTION 'Field too long';END IF;
 IF k IN('borrowerId','cashAccountId','targetChargeId','targetLoanId') AND value IS NOT NULL AND (octet_length(value) NOT BETWEEN 1 AND 256 OR value~'[[:cntrl:]]' OR value<>btrim(value)) THEN RAISE EXCEPTION 'Invalid reference';END IF;
 field_text:=field_text||CASE WHEN field_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||coalesce(to_json(value)::text,'null');
 END LOOP;
 IF fields->>'amountReceived'!~'^[1-9][0-9]*$' OR (fields->>'amountReceived')::numeric>92233720368547758 OR fields->>'paymentDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((fields->>'paymentDate')::date)::text<>fields->>'paymentDate' OR fields->>'paymentMethod' NOT IN('Bank Transfer','Cash','Net-off at Disbursement') OR fields->>'allocationMethod' NOT IN('Single Full','Single Partial','Receive All','Lump Sum','First-day Auto','Loan Close','Selected Charges') THEN RAISE EXCEPTION 'Invalid financial input';END IF;
 amount:=(fields->>'amountReceived')::numeric;
 IF i->>'kind'='pwa-plan' THEN
 IF fields->>'allocationMethod' NOT IN('Selected Charges','First-day Auto','Loan Close') OR jsonb_typeof(fields->'allocations') IS DISTINCT FROM 'array' OR jsonb_array_length(fields->'allocations') NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Invalid plan';END IF;
 FOR line IN SELECT element.value FROM jsonb_array_elements(fields->'allocations') AS element LOOP
 IF jsonb_typeof(line) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(line) key) IS DISTINCT FROM (CASE WHEN line ? 'lateCharge'
     -- R118: the 8-key line with the late charge and its expected remaining.
     THEN ARRAY['chargeDate','chargeId','expectedInterestRemaining','expectedLateChargeRemaining','expectedPrincipalRemaining','interest','lateCharge','principal']
     ELSE ARRAY['chargeDate','chargeId','expectedInterestRemaining','expectedPrincipalRemaining','interest','principal'] END) THEN RAISE EXCEPTION 'Invalid plan line';END IF;
 value:=line->>'chargeId';IF jsonb_typeof(line->'chargeId') IS DISTINCT FROM 'string' OR octet_length(value) NOT BETWEEN 1 AND 256 OR value~'[[:space:],[:cntrl:]]' OR (last_id IS NOT NULL AND value COLLATE "C"<=last_id COLLATE "C") THEN RAISE EXCEPTION 'Invalid plan ordering';END IF;last_id:=value;
 line_text:='{';FOREACH k IN ARRAY (CASE WHEN line ? 'lateCharge' THEN ARRAY['chargeId','principal','interest','lateCharge','expectedPrincipalRemaining','expectedInterestRemaining','expectedLateChargeRemaining','chargeDate']
  ELSE ARRAY['chargeId','principal','interest','expectedPrincipalRemaining','expectedInterestRemaining','chargeDate'] END) LOOP
 IF jsonb_typeof(line->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid plan type';END IF;
 IF k IN('principal','interest','lateCharge','expectedPrincipalRemaining','expectedInterestRemaining','expectedLateChargeRemaining') AND (line->>k!~'^(0|[1-9][0-9]*)$' OR (line->>k)::numeric>92233720368547758) THEN RAISE EXCEPTION 'Invalid plan amount';END IF;
 line_text:=line_text||CASE WHEN line_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||to_json(line->>k)::text;END LOOP;
 IF line->>'chargeDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((line->>'chargeDate')::date)::text<>line->>'chargeDate' OR (line->>'principal')::numeric+(line->>'interest')::numeric+coalesce(line->>'lateCharge','0')::numeric<=0 OR (line->>'principal')::numeric>(line->>'expectedPrincipalRemaining')::numeric OR (line->>'interest')::numeric>(line->>'expectedInterestRemaining')::numeric OR coalesce(line->>'lateCharge','0')::numeric>coalesce(line->>'expectedLateChargeRemaining','0')::numeric THEN RAISE EXCEPTION 'Invalid plan line';END IF;
 total:=total+(line->>'principal')::numeric+(line->>'interest')::numeric+coalesce(line->>'lateCharge','0')::numeric;array_text:=array_text||CASE WHEN array_text='[' THEN '' ELSE ',' END||line_text||'}';END LOOP;
 IF total<>amount THEN RAISE EXCEPTION 'Plan sum mismatch';END IF;
 field_text:=field_text||',"allocations":'||array_text||']}';
 ELSE
 IF fields->'selectedChargeIds'='null'::jsonb THEN array_text:='null';ELSE
 IF jsonb_typeof(fields->'selectedChargeIds') IS DISTINCT FROM 'array' OR jsonb_array_length(fields->'selectedChargeIds') NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Invalid selection';END IF;
 FOR line IN SELECT element.value FROM jsonb_array_elements(fields->'selectedChargeIds') AS element LOOP
 value:=line#>>'{}';IF jsonb_typeof(line) IS DISTINCT FROM 'string' OR octet_length(value) NOT BETWEEN 1 AND 256 OR value~'[[:space:],[:cntrl:]]' OR (last_id IS NOT NULL AND value COLLATE "C"<=last_id COLLATE "C") THEN RAISE EXCEPTION 'Invalid selection';END IF;last_id:=value;array_text:=array_text||CASE WHEN array_text='[' THEN '' ELSE ',' END||to_json(value)::text;END LOOP;array_text:=array_text||']';END IF;
 field_text:=field_text||',"selectedChargeIds":'||array_text||'}';END IF;
 RETURN '{"kind":'||to_json(i->>'kind')::text||',"fields":'||field_text||',"receiptMode":'||to_json(i->>'receiptMode')::text||CASE WHEN i ? 'closePreparationHash' THEN ',"closePreparationHash":'||coalesce(to_json(i->>'closePreparationHash')::text,'null') ELSE '' END||'}';
END $_$;


--
-- Name: pwa_payment_head_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_payment_head_v2(id text) RETURNS uuid
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE head uuid;candidate uuid;total integer;
BEGIN
 SELECT request_id INTO head FROM public.pwa_payment_commands WHERE contract_version=1 AND outcome='posted' AND payment_id=$1;
 IF head IS NULL THEN SELECT request_id INTO head FROM public.pwa_payment_commands WHERE contract_version=2 AND outcome='applied' AND result_json->>'paymentId'=$1 AND canonical_json::jsonb#>>'{command,operation}' IN('loan.create','loan.close','charge.create','payment.create','loan.rollover');END IF;
 -- R136: the settlement payment of a rollover.
 IF head IS NULL THEN SELECT request_id INTO head FROM public.pwa_payment_commands WHERE contract_version=2 AND outcome='applied' AND result_json#>>'{settlement,paymentId}'=$1 AND canonical_json::jsonb#>>'{command,operation}'='loan.rollover';END IF;
 LOOP
 SELECT count(*) INTO total FROM public.pwa_payment_commands WHERE contract_version=2 AND outcome='applied' AND canonical_json::jsonb#>>'{command,operation}'='payment.correct' AND canonical_json::jsonb#>>'{command,targetId}'=$1 AND canonical_json::jsonb#>>'{command,predecessorRequestId}' IS NOT DISTINCT FROM head::text;
 IF total=0 THEN EXIT;END IF;IF total<>1 THEN RAISE EXCEPTION 'Invalid correction lineage';END IF;
 SELECT request_id INTO candidate FROM public.pwa_payment_commands WHERE contract_version=2 AND outcome='applied' AND canonical_json::jsonb#>>'{command,operation}'='payment.correct' AND canonical_json::jsonb#>>'{command,targetId}'=$1 AND canonical_json::jsonb#>>'{command,predecessorRequestId}' IS NOT DISTINCT FROM head::text;
 IF candidate=head THEN RAISE EXCEPTION 'Invalid correction lineage';END IF;head:=candidate;
 END LOOP;RETURN head;
END $_$;


--
-- Name: pwa_payment_version_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_payment_version_v2(id text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
 SELECT encode(sha256(convert_to(jsonb_build_object(
  'source',to_jsonb(p),
  'loans',coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l."Row ID" COLLATE "C") FROM public."Loans" l WHERE l."Ref Borrowers"=p."Ref Borrower"),'[]'),
  'charges',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c."Row ID" COLLATE "C") FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans" WHERE l."Ref Borrowers"=p."Ref Borrower"),'[]'),
  'repayments',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r."Row ID" COLLATE "C") FROM public."Repayments" r JOIN public."Loans" l ON l."Row ID"=r."Ref Loans" WHERE l."Ref Borrowers"=p."Ref Borrower"),'[]'),
  'allocations',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a."Row ID" COLLATE "C") FROM public."Payment Allocations" a WHERE a."Ref Payment"=p."Row ID"),'[]'),
  'cash',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c."Row ID" COLLATE "C") FROM public."Cash Ledger" c WHERE c."Ref Payment"=p."Row ID"),'[]'),
  'revisionHead',(SELECT j.request_id FROM public.pwa_payment_commands j WHERE j.contract_version=2 AND j.outcome='applied' AND j.canonical_json::jsonb#>>'{command,operation}'='payment.correct' AND j.canonical_json::jsonb#>>'{command,targetId}'=p."Row ID" AND NOT EXISTS(SELECT 1 FROM public.pwa_payment_commands successor WHERE successor.contract_version=2 AND successor.outcome='applied' AND successor.canonical_json::jsonb#>>'{command,operation}'='payment.correct' AND successor.canonical_json::jsonb#>>'{command,targetId}'=p."Row ID" AND successor.canonical_json::jsonb#>>'{command,predecessorRequestId}'=j.request_id::text))
 )::text,'UTF8')),'hex') FROM public."Payments" p WHERE p."Row ID"=$1;
$_$;


--
-- Name: pwa_plan_effects_v83(jsonb); Type: FUNCTION
--

CREATE FUNCTION public.pwa_plan_effects_v83(lines jsonb) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$ SELECT coalesce(jsonb_agg(value-ARRAY['expectedPrincipalRemaining','expectedInterestRemaining','expectedLateChargeRemaining']-CASE WHEN value->>'lateCharge'='0' THEN 'lateCharge' ELSE '' END ORDER BY (value->>'chargeId') COLLATE "C"),'[]'::jsonb) FROM jsonb_array_elements(lines); $$;


--
-- Name: pwa_preference_version_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_preference_version_v2(id text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
 SELECT encode(sha256(convert_to(jsonb_build_object('partnerId',p."Row ID",'language',p."Language Preference",'context',to_jsonb(c))::text,'UTF8')),'hex') FROM public."Partners" p LEFT JOIN public."Cash Statement Context" c ON c."Ref Partner"=p."Row ID" WHERE p."Row ID"=$1;
$_$;


--
-- Name: pwa_put_group_chat_summary_v1(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_put_group_chat_summary_v1(canonical_json text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE
 root jsonb; c jsonb; s jsonb; speaker jsonb; ids text[]; key text; sha text; request uuid;
 w_from timestamptz; last_at timestamptz; made_at timestamptz; n_messages integer; last_role text; last_borrower text;
 stamp text:='^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$';
 control text:='[\u0001-\u001F\u007F]';
 roles text[]:=ARRAY['borrower','partner','referrer','business','other'];
 existing public.pwa_group_chat_summaries%ROWTYPE; id text; enabled boolean;
 n_stored integer:=0; n_unchanged integer:=0; n_superseded integer:=0; n_skipped integer:=0; n_pruned integer:=0; many boolean;
BEGIN
 -- Shape. Every rule is a positive condition that must be true (a NULL fails); a failure raises invalid_request (22023).
 BEGIN
  root:=canonical_json::jsonb;
  IF (jsonb_typeof(root)='object' AND ARRAY(SELECT jsonb_object_keys(root))=ARRAY['command'] AND jsonb_typeof(root->'command')='object') IS NOT TRUE THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  c:=root->'command';
  IF (ARRAY(SELECT k FROM jsonb_object_keys(c) k ORDER BY k COLLATE "C")=ARRAY['borrowerIds','conversationKey','environment','requestId','schemaVersion','sourceSha256','summary']
    AND jsonb_typeof(c->'schemaVersion')='number' AND c->>'schemaVersion'='1'
    AND jsonb_typeof(c->'requestId')='string' AND c->>'requestId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND jsonb_typeof(c->'environment')='string' AND c->>'environment'=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END
    AND jsonb_typeof(c->'conversationKey')='string' AND c->>'conversationKey' ~ '^[0-9a-f]{32}$'
    AND jsonb_typeof(c->'sourceSha256')='string' AND c->>'sourceSha256' ~ '^[0-9a-f]{64}$'
    AND jsonb_typeof(c->'borrowerIds')='array' AND jsonb_array_length(c->'borrowerIds')<=20
    AND jsonb_typeof(c->'summary') IN ('object','null')) IS NOT TRUE THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  request:=(c->>'requestId')::uuid; key:=c->>'conversationKey'; sha:=c->>'sourceSha256';
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(c->'borrowerIds') e
    WHERE (jsonb_typeof(e)='string' AND char_length(e#>>'{}') BETWEEN 1 AND 256 AND e#>>'{}' !~ control) IS NOT TRUE) THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  ids:=ARRAY(SELECT e#>>'{}' FROM jsonb_array_elements(c->'borrowerIds') WITH ORDINALITY x(e,o) ORDER BY o);
  -- Sorted and unique, by code point.
  IF ids<>ARRAY(SELECT d.v FROM (SELECT DISTINCT v FROM unnest(ids) v) d ORDER BY d.v COLLATE "C") THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  s:=c->'summary';
  IF jsonb_typeof(s)='object' THEN
   IF (ARRAY(SELECT k FROM jsonb_object_keys(s) k ORDER BY k COLLATE "C")=ARRAY['generatedAt','headline','lastMessageAt','lastSpeaker','messageCount','model','points','windowFrom']
     AND jsonb_typeof(s->'windowFrom')='string' AND s->>'windowFrom' ~ stamp
     AND jsonb_typeof(s->'lastMessageAt')='string' AND s->>'lastMessageAt' ~ stamp
     AND jsonb_typeof(s->'generatedAt')='string' AND s->>'generatedAt' ~ stamp
     AND jsonb_typeof(s->'messageCount')='number' AND s->>'messageCount' ~ '^[1-9][0-9]{0,2}$' AND (s->>'messageCount')::integer<=100
     AND jsonb_typeof(s->'model')='string' AND s->>'model' ~ '^[a-z0-9][a-z0-9.-]{0,63}$'
     AND jsonb_typeof(s->'headline')='object' AND ARRAY(SELECT k FROM jsonb_object_keys(s->'headline') k ORDER BY k COLLATE "C")=ARRAY['en','th']
     AND jsonb_typeof(s->'lastSpeaker')='object'
     AND jsonb_typeof(s->'points')='array' AND jsonb_array_length(s->'points')<=4) IS NOT TRUE THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
   w_from:=(s->>'windowFrom')::timestamptz; last_at:=(s->>'lastMessageAt')::timestamptz; made_at:=(s->>'generatedAt')::timestamptz;
   IF (last_at>=w_from) IS NOT TRUE THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
   n_messages:=(s->>'messageCount')::integer;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'points') e
     WHERE (jsonb_typeof(e)='object' AND ARRAY(SELECT k FROM jsonb_object_keys(e) k ORDER BY k COLLATE "C")=ARRAY['en','speaker','th']) IS NOT TRUE) THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
   -- Every text is a string of 1 to 160 (headline) or 200 (point) characters, not blank, with no control character.
   IF EXISTS(SELECT 1 FROM (SELECT s#>'{headline,th}',160 UNION ALL SELECT s#>'{headline,en}',160
      UNION ALL SELECT e->'th',200 FROM jsonb_array_elements(s->'points') e UNION ALL SELECT e->'en',200 FROM jsonb_array_elements(s->'points') e) v(t,most)
     WHERE (jsonb_typeof(v.t)='string' AND char_length(v.t#>>'{}') BETWEEN 1 AND v.most AND btrim(v.t#>>'{}')<>'' AND v.t#>>'{}' !~ control) IS NOT TRUE) THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
   -- Every speaker (each point's and lastSpeaker): a known role; borrowerId with borrower and referrer, and only with them.
   FOR speaker IN SELECT e->'speaker' FROM jsonb_array_elements(s->'points') e UNION ALL SELECT s->'lastSpeaker' LOOP
    IF (jsonb_typeof(speaker)='object' AND jsonb_typeof(speaker->'role')='string' AND speaker->>'role'=ANY(roles)
      AND CASE WHEN speaker->>'role' IN ('borrower','referrer')
       THEN ARRAY(SELECT k FROM jsonb_object_keys(speaker) k ORDER BY k COLLATE "C")=ARRAY['borrowerId','role'] AND jsonb_typeof(speaker->'borrowerId')='string'
        AND char_length(speaker->>'borrowerId') BETWEEN 1 AND 256 AND speaker->>'borrowerId' !~ control
       ELSE ARRAY(SELECT jsonb_object_keys(speaker))=ARRAY['role'] END) IS NOT TRUE THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
   END LOOP;
   last_role:=s#>>'{lastSpeaker,role}'; last_borrower:=s#>>'{lastSpeaker,borrowerId}';
  END IF;
 EXCEPTION WHEN data_exception THEN
  -- Class 22 only: malformed JSON, a bad timestamp or number, and the rules above. Any other error is a real one and propagates.
  RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023';
 END;

 PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('group-chat-summary','*'));
 -- Every listed borrower must exist (the endpoint answers 422); nothing is written before this check.
 IF EXISTS(SELECT 1 FROM unnest(ids) v WHERE NOT EXISTS(SELECT 1 FROM public."Borrowers" b WHERE b."Row ID"=v)) THEN
  RAISE EXCEPTION 'unknown_borrower' USING ERRCODE='P0002';
 END IF;
 -- Prune: rows of this group whose borrower is no longer one of its subjects.
 DELETE FROM public.pwa_group_chat_summaries t WHERE t.conversation_key=key AND NOT (t.borrower_id=ANY(ids));
 GET DIAGNOSTICS n_pruned=ROW_COUNT;
 IF jsonb_typeof(s)='object' THEN
  many:=cardinality(ids)>=2;
  FOREACH id IN ARRAY ids LOOP
   SELECT b."AI Collection Enabled" IS TRUE INTO enabled FROM public."Borrowers" b WHERE b."Row ID"=id;
   IF enabled IS NOT TRUE THEN n_skipped:=n_skipped+1; CONTINUE; END IF;
   SELECT * INTO existing FROM public.pwa_group_chat_summaries t WHERE t.borrower_id=id FOR UPDATE;
   IF FOUND AND existing.conversation_key<>key AND existing.last_message_at>last_at THEN n_superseded:=n_superseded+1; CONTINUE; END IF;
   IF FOUND AND existing.conversation_key=key AND existing.source_sha256=sha THEN n_unchanged:=n_unchanged+1; CONTINUE; END IF;
   INSERT INTO public.pwa_group_chat_summaries AS t(borrower_id,conversation_key,shared_group,headline_th,headline_en,points,last_speaker_role,
     last_speaker_borrower_id,message_count,window_from,last_message_at,generated_at,source_sha256,model,request_id,updated_at)
    VALUES(id,key,many,s#>>'{headline,th}',s#>>'{headline,en}',s->'points',last_role,last_borrower,n_messages,w_from,last_at,made_at,sha,s->>'model',request,clock_timestamp())
    ON CONFLICT (borrower_id) DO UPDATE SET conversation_key=EXCLUDED.conversation_key,shared_group=EXCLUDED.shared_group,headline_th=EXCLUDED.headline_th,
     headline_en=EXCLUDED.headline_en,points=EXCLUDED.points,last_speaker_role=EXCLUDED.last_speaker_role,last_speaker_borrower_id=EXCLUDED.last_speaker_borrower_id,
     message_count=EXCLUDED.message_count,window_from=EXCLUDED.window_from,last_message_at=EXCLUDED.last_message_at,generated_at=EXCLUDED.generated_at,
     source_sha256=EXCLUDED.source_sha256,model=EXCLUDED.model,request_id=EXCLUDED.request_id,updated_at=EXCLUDED.updated_at;
   n_stored:=n_stored+1;
  END LOOP;
 END IF;
 RETURN jsonb_build_object('kind',CASE WHEN n_stored>0 THEN 'stored' WHEN n_unchanged>0 THEN 'unchanged' WHEN n_superseded>0 THEN 'superseded' ELSE 'cleared' END,
  'stored',n_stored,'unchanged',n_unchanged,'superseded',n_superseded,'skipped',n_skipped,'pruned',n_pruned);
END $_$;


--
-- Name: FUNCTION pwa_put_group_chat_summary_v1(canonical_json text); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_put_group_chat_summary_v1(canonical_json text) IS 'R146: stores the integration agent''s group chat summary command {"command":{schemaVersion,requestId,environment,conversationKey,borrowerIds,sourceSha256,summary}}. Removes this group''s rows whose borrower is not listed; with a null summary stops there. For each listed AI-collection borrower: keeps a row of another group with a newer last message (superseded), leaves a row with the same source digest untouched (unchanged), otherwise upserts (stored). Raises invalid_request (22023) or unknown_borrower (P0002). Invoker rights.';


--
-- Name: pwa_rebate_pending_v1(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_rebate_pending_v1(p_expense text) RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT CASE WHEN x."Rule Version"='REFERRAL_REBATE_V3' AND x."Ref Rebate Settlement" IS NULL
   THEN greatest(x."Amount"::numeric-coalesce(o."Amount Received"::numeric,0),0) ELSE 0 END
 FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment"
 WHERE x."Row ID"=p_expense AND x."Source Type"='Referral Rebate';
$$;


--
-- Name: FUNCTION pwa_rebate_pending_v1(p_expense text); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_rebate_pending_v1(p_expense text) IS 'R129: the pending (unpaid) amount of a referral rebate expense: REFERRAL_REBATE_V3, not linked to a settlement, Amount less its offset payment; 0 for offset-only, paid and legacy rows; null for an unknown or non-referral expense. Read only.';


--
-- Name: pwa_rebate_settlement_version_v1(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_rebate_settlement_version_v1(p_id text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT encode(sha256(convert_to(((to_jsonb(s)-'created_at')||jsonb_build_object('created_at',to_char(s.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))::text,'UTF8')),'hex')
 FROM public.pwa_rebate_settlements s WHERE s.id=p_id;
$$;


--
-- Name: FUNCTION pwa_rebate_settlement_version_v1(p_id text); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_rebate_settlement_version_v1(p_id text) IS 'R129: version of a rebate settlement for rebate-settlement.delete (sha256 of the row as JSON, created_at in UTC); null for an unknown id. services/business/referrers.mjs uses the identical SQL text.';


--
-- Name: pwa_rebates_owed_v1(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_rebates_owed_v1(p_referrer text) RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT coalesce(sum(greatest(x."Amount"::numeric-coalesce(o."Amount Received"::numeric,0),0)),0)
 FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment"
 WHERE x."Ref Payee Borrower"=p_referrer AND x."Source Type"='Referral Rebate' AND x."Rule Version"='REFERRAL_REBATE_V3' AND x."Ref Rebate Settlement" IS NULL;
$$;


--
-- Name: FUNCTION pwa_rebates_owed_v1(p_referrer text); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_rebates_owed_v1(p_referrer text) IS 'R129: what a referrer is owed: the sum of pwa_rebate_pending_v1 over the referrer''s referral rebate expenses. Read only.';


--
-- Name: pwa_referral_rebate_projection_v1(text, jsonb); Type: FUNCTION
--

CREATE FUNCTION public.pwa_referral_rebate_projection_v1(p_loan text, p_calculation jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE l public."Loans"%ROWTYPE; referrer public."Borrowers"%ROWTYPE; principal numeric; profit numeric; rebate numeric; terms jsonb; -- R120
BEGIN
 SELECT * INTO l FROM public."Loans" WHERE "Row ID"=p_loan;
 IF NOT FOUND OR coalesce(l."Defaulted",false) OR jsonb_typeof(p_calculation->'allocations') IS DISTINCT FROM 'array' THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Source Key"='REFERRAL_REBATE:'||p_loan) THEN RETURN NULL; END IF;
 SELECT b.* INTO referrer FROM public."Borrowers" own JOIN public."Borrowers" b ON b."Row ID"=own."Ref Referrer" WHERE own."Row ID"=l."Ref Borrowers";
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- create_referral_rebate's rule on the state after the close posts: principal fully repaid, the referrer's rate of the profit, at most the referrer's cap.
 -- R118: profit is interest plus late charge (posted and in the close's lines).
 SELECT coalesce(sum("Principal Paid"::numeric),0),coalesce(sum("Interest Paid"::numeric+"Late Charge Paid"::numeric),0) INTO principal,profit FROM public."Repayments" WHERE "Ref Loans"=p_loan;
 SELECT principal+coalesce(sum((x->>'principal')::numeric),0),profit+coalesce(sum((x->>'interest')::numeric+coalesce(x->>'lateCharge','0')::numeric),0) INTO principal,profit FROM jsonb_array_elements(p_calculation->'allocations') x;
 IF principal<l."Principal Amount"::numeric OR profit<=0 THEN RETURN NULL; END IF;
 -- R120: the referrer's terms, shared with create_referral_rebate.
 terms:=public.referral_rebate_terms(referrer."Row ID");
 rebate:=least(round(profit*(terms->>'rate')::numeric/100),(terms->>'cap')::numeric);
 IF rebate<=0 THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('amount',trunc(rebate)::text,'referrerId',referrer."Row ID",'referrerName',referrer."Borrower Name",'referrerDescription',referrer."Description",
  'selfReferral',referrer."Row ID"=l."Ref Borrowers",
  'profit',round(profit)::text,'rate',terms->'rate','cap',terms->'cap','custom',terms->'custom',
  -- R129: the referrer's pending rebates before this close (whole baht).
  'owedBefore',trunc(public.pwa_rebates_owed_v1(referrer."Row ID"))::text,
  'hasOpenLoan',EXISTS(SELECT 1 FROM public."Loans" x WHERE x."Ref Borrowers"=referrer."Row ID" AND x."Loan Status"='ยังไม่ปิดยอด' AND NOT coalesce(x."Defaulted",false)));
END $$;


--
-- Name: FUNCTION pwa_referral_rebate_projection_v1(p_loan text, p_calculation jsonb); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_referral_rebate_projection_v1(p_loan text, p_calculation jsonb) IS 'R111/R118/R120/R129: the referral rebate a Loan Close with this calculation creates (create_referral_rebate rule: the referrer''s rate of interest and late charges, at most the referrer''s cap), its referrer, whether the referrer has an open loan, the profit base, the terms (rate, cap, custom) and owedBefore (the referrer''s pending rebates now); null when none. Read only.';


--
-- Name: pwa_row_changes_prune_v1(); Type: FUNCTION
--

CREATE FUNCTION public.pwa_row_changes_prune_v1() RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE cutoff bigint; newest bigint; removed bigint;
BEGIN
 SELECT max(seq) INTO newest FROM public.pwa_row_changes;
 IF newest IS NULL THEN RETURN 0; END IF;
 SELECT seq INTO cutoff FROM public.pwa_row_changes WHERE changed_at>=clock_timestamp()-interval '7 days' ORDER BY seq LIMIT 1;
 cutoff:=least(coalesce(cutoff,newest),newest);
 DELETE FROM public.pwa_row_changes WHERE seq<cutoff;
 GET DIAGNOSTICS removed=ROW_COUNT;
 RETURN removed;
END $$;


--
-- Name: pwa_submit_agent_receipt_v1(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_submit_agent_receipt_v1(canonical_json text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE e jsonb;c jsonb;a jsonb;x jsonb;k text;v text;canonical text;part text;hash text;request uuid;derived bytea;environment text;
 prior public.pwa_payment_commands%ROWTYPE;day date;matches integer;outcome_value text:='posted';rejection text;result jsonb;
 command_keys text[]:=ARRAY['schemaVersion','requestId','environment','reviewId','mode','borrowerId','cashAccountId','amountReceived','paymentDate','transferTime','bankReference','proposalSha256','archiveEvidence'];
 evidence_keys text[]:=ARRAY['receiptId','objectKey','generation','rawSha256','mimeType','sizeBytes','capturedAt'];
 actor_keys text[]:=ARRAY['issuer','subject','partnerId','loginEmail'];
 text_keys text[]:=ARRAY['requestId','environment','reviewId','mode','borrowerId','cashAccountId','amountReceived','paymentDate','transferTime','bankReference','proposalSha256'];
 -- R095 v8 payerLines {before, after}: the payer-lines change, written only while the column still equals `before`.
 payer_before text;payer_after text;
 -- R112 v9: the partner's purpose and the plan's explicit lines, booked charges and principal entries (v10 shapes).
 entry jsonb;line jsonb;ids text[]:=ARRAY[]::text[];sorted_ids text[];loans text[];plan jsonb;today date;plan_total numeric:=0;
 purpose_text text:='';plan_text text:='';materialize_text text:='';principal_text text:='';
 posted_status text;posted_amount numeric;
 ws text:=chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
BEGIN
 environment:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR session_user<>('mw-credit-app-command-'||environment||'@clever-oasis-508610-n7.iam') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Command session required'; END IF;
 -- R112: 65536 bytes for schemaVersion 9 only (checked below); 7 and 8 keep 16384.
 IF $1 IS NULL OR octet_length($1)>65536 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid agent receipt command'; END IF;
 BEGIN
  e:=$1::jsonb;c:=e->'command';a:=e->'actor';x:=c->'archiveEvidence';
  -- R095: schemaVersion 8 = 7 plus payerLines after bankReference (an object or null); 7 stays accepted.
  IF c->'schemaVersion'='8'::jsonb THEN command_keys:=ARRAY['schemaVersion','requestId','environment','reviewId','mode','borrowerId','cashAccountId','amountReceived','paymentDate','transferTime','bankReference','payerLines','proposalSha256','archiveEvidence']; END IF;
  -- R112: schemaVersion 9 = 8 plus purpose, allocations, materialize and principal after payerLines.
  IF c->'schemaVersion' IN ('9'::jsonb,'10'::jsonb) THEN command_keys:=ARRAY['schemaVersion','requestId','environment','reviewId','mode','borrowerId','cashAccountId','amountReceived','paymentDate','transferTime','bankReference','payerLines','purpose','allocations','materialize','principal','proposalSha256','archiveEvidence']; END IF;
  IF octet_length($1)>16384 AND c->'schemaVersion' NOT IN ('9'::jsonb,'10'::jsonb) THEN RAISE EXCEPTION 'size'; END IF;
  IF jsonb_typeof(e)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(e) key)<>ARRAY['actor','command','contractVersion','receipt'] OR e->'contractVersion'<>'1'::jsonb OR e->'receipt'<>'null'::jsonb
   OR jsonb_typeof(c)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c) key)<>(SELECT array_agg(key ORDER BY key) FROM unnest(command_keys) key)
   OR jsonb_typeof(a)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(a) key)<>(SELECT array_agg(key ORDER BY key) FROM unnest(actor_keys) key)
   OR jsonb_typeof(x)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(x) key)<>(SELECT array_agg(key ORDER BY key) FROM unnest(evidence_keys) key)
   OR c->'schemaVersion' NOT IN ('7'::jsonb,'8'::jsonb,'9'::jsonb,'10'::jsonb) OR (c->>'environment')<>environment OR (c->>'mode') NOT IN ('automatic','reviewed') THEN RAISE EXCEPTION 'shape'; END IF;
  FOREACH k IN ARRAY text_keys LOOP
   IF jsonb_typeof(c->k)<>'string' THEN RAISE EXCEPTION 'type'; END IF;
   v:=(c->>k);IF octet_length(v) NOT BETWEEN 1 AND 256 OR btrim(v)='' OR v~E'[\\r\\n]' OR (k<>'bankReference' AND v<>btrim(v)) THEN RAISE EXCEPTION 'text'; END IF;
  END LOOP;
  IF c->'schemaVersion' IN ('8'::jsonb,'9'::jsonb,'10'::jsonb) AND c->'payerLines'<>'null'::jsonb THEN
   IF jsonb_typeof(c->'payerLines')<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c->'payerLines') key)<>ARRAY['after','before']
    OR jsonb_typeof(c->'payerLines'->'after')<>'string' OR jsonb_typeof(c->'payerLines'->'before') NOT IN ('string','null') THEN RAISE EXCEPTION 'payer lines';END IF;
   payer_before:=c->'payerLines'->>'before';payer_after:=c->'payerLines'->>'after';
   IF octet_length(payer_after) NOT BETWEEN 1 AND 1000 OR payer_after=coalesce(payer_before,'') OR octet_length(coalesce(payer_before,''))>65536 OR NOT payer_after IS NFC NORMALIZED
    OR cardinality(string_to_array(payer_after,E'\n')) NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'payer lines';END IF;
   -- Each line is in payer_name.display form: no control, zero-width or non-space whitespace, single spaces, trimmed, 1..200 bytes.
   IF EXISTS(SELECT 1 FROM unnest(string_to_array(payer_after,E'\n')) payer_line WHERE octet_length(payer_line) NOT BETWEEN 1 AND 200 OR payer_line<>btrim(payer_line,' ')
    OR position('  ' IN payer_line)>0 OR payer_line~'[\x01-\x1f\x7f-\x9f\u00a0\u1680\u2000-\u200d\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]') THEN RAISE EXCEPTION 'payer lines';END IF;
  END IF;
  IF (c->>'amountReceived')!~'^[1-9][0-9]{0,16}$' OR ((c->>'amountReceived'))::numeric>92233720368547758 OR (c->>'proposalSha256')!~'^[a-f0-9]{64}$' OR (c->>'paymentDate')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (c->>'transferTime')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'values'; END IF;
  day:=((c->>'paymentDate'))::date;IF to_char(day,'YYYY-MM-DD')<>(c->>'paymentDate') THEN RAISE EXCEPTION 'date'; END IF;
  -- R112 v9: a partner's numbered reply (reviewed mode only). purpose {forward, principal (0 to 20 {loanId, amount},
  -- ordered by loanId), loans null}, forward or at least one principal entry; allocations (1 to 10000 lines ordered by
  -- chargeId, totalling the amount), materialize (0 to 200) and principal (0 to 20) as the manual v10 command.
  IF c->'schemaVersion' IN ('9'::jsonb,'10'::jsonb) THEN
   IF (c->>'mode')<>'reviewed' OR jsonb_typeof(c->'purpose') IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c->'purpose') key) IS DISTINCT FROM ARRAY['forward','loans','principal']
    OR jsonb_typeof(c->'purpose'->'forward') IS DISTINCT FROM 'boolean' OR c->'purpose'->'loans' IS DISTINCT FROM 'null'::jsonb OR jsonb_typeof(c->'purpose'->'principal') IS DISTINCT FROM 'array'
    OR jsonb_array_length(c->'purpose'->'principal')>20 OR (c->'purpose'->'forward'='false'::jsonb AND jsonb_array_length(c->'purpose'->'principal')=0) THEN RAISE EXCEPTION 'purpose'; END IF;
   loans:=ARRAY[]::text[];
   FOR entry IN SELECT value FROM jsonb_array_elements(c->'purpose'->'principal') LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(entry) key) IS DISTINCT FROM ARRAY['amount','loanId']
     OR jsonb_typeof(entry->'loanId') IS DISTINCT FROM 'string' OR jsonb_typeof(entry->'amount') IS DISTINCT FROM 'string' OR entry->>'amount' !~ '^[1-9][0-9]{0,16}$' THEN RAISE EXCEPTION 'purpose entry'; END IF;
    v:=entry->>'loanId';IF octet_length(v) NOT BETWEEN 1 AND 256 OR v<>btrim(v,ws) OR v~E'[\\r\\n]' THEN RAISE EXCEPTION 'purpose loan'; END IF;
    loans:=array_append(loans,v);
    purpose_text:=purpose_text||CASE WHEN purpose_text='' THEN '' ELSE ',' END||'{"loanId":'||to_json(v)::text||',"amount":'||to_json(entry->>'amount')::text||'}';
   END LOOP;
   SELECT array_agg(y ORDER BY y COLLATE "C") INTO sorted_ids FROM (SELECT DISTINCT unnest(loans) y) q;
   IF loans IS DISTINCT FROM coalesce(sorted_ids,ARRAY[]::text[]) THEN RAISE EXCEPTION 'purpose order'; END IF;
   purpose_text:='{"forward":'||(c->'purpose'->>'forward')||',"principal":['||purpose_text||'],"loans":null}';
   IF jsonb_typeof(c->'allocations') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'allocations') NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'plan'; END IF;
   FOR line IN SELECT value FROM jsonb_array_elements(c->'allocations') LOOP
    IF jsonb_typeof(line) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(line) key) IS DISTINCT FROM (CASE WHEN c->'schemaVersion'='10'::jsonb
     -- R118 agent v10: the 8-key line with the late charge and its expected remaining.
     THEN ARRAY['chargeDate','chargeId','expectedInterestRemaining','expectedLateChargeRemaining','expectedPrincipalRemaining','interest','lateCharge','principal']
     ELSE ARRAY['chargeDate','chargeId','expectedInterestRemaining','expectedPrincipalRemaining','interest','principal'] END) THEN RAISE EXCEPTION 'line'; END IF;
    FOREACH k IN ARRAY ARRAY(SELECT jsonb_object_keys(line)) LOOP
     IF jsonb_typeof(line->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'line type'; END IF;
    END LOOP;
    v:=line->>'chargeId';IF octet_length(v) NOT BETWEEN 1 AND 256 OR v LIKE '%,%' OR translate(v,ws,'')<>v THEN RAISE EXCEPTION 'line id'; END IF;ids:=array_append(ids,v);
    FOREACH k IN ARRAY ARRAY['principal','interest','expectedPrincipalRemaining','expectedInterestRemaining']||(CASE WHEN line ? 'lateCharge' THEN ARRAY['lateCharge','expectedLateChargeRemaining'] ELSE ARRAY[]::text[] END) LOOP
     IF line->>k !~ '^(0|[1-9][0-9]{0,16})$' OR (line->>k)::numeric>92233720368547758 THEN RAISE EXCEPTION 'component'; END IF;
    END LOOP;
    IF (line->>'principal')::numeric+(line->>'interest')::numeric+coalesce(line->>'lateCharge','0')::numeric<=0 OR (line->>'principal')::numeric>(line->>'expectedPrincipalRemaining')::numeric OR (line->>'interest')::numeric>(line->>'expectedInterestRemaining')::numeric
     OR coalesce(line->>'lateCharge','0')::numeric>coalesce(line->>'expectedLateChargeRemaining','0')::numeric THEN RAISE EXCEPTION 'line cap'; END IF;
    v:=line->>'chargeDate';IF v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR v<'0001-01-01' OR to_char(v::date,'YYYY-MM-DD')<>v THEN RAISE EXCEPTION 'line day'; END IF;
    plan_total:=plan_total+(line->>'principal')::numeric+(line->>'interest')::numeric+coalesce(line->>'lateCharge','0')::numeric;
    plan_text:=plan_text||CASE WHEN plan_text='' THEN '' ELSE ',' END||'{"chargeId":'||to_json(line->>'chargeId')::text||',"principal":'||to_json(line->>'principal')::text||',"interest":'||to_json(line->>'interest')::text
     ||CASE WHEN line ? 'lateCharge' THEN ',"lateCharge":'||to_json(line->>'lateCharge')::text ELSE '' END
     ||',"expectedPrincipalRemaining":'||to_json(line->>'expectedPrincipalRemaining')::text||',"expectedInterestRemaining":'||to_json(line->>'expectedInterestRemaining')::text
     ||CASE WHEN line ? 'lateCharge' THEN ',"expectedLateChargeRemaining":'||to_json(line->>'expectedLateChargeRemaining')::text ELSE '' END
     ||',"chargeDate":'||to_json(line->>'chargeDate')::text||'}';
   END LOOP;
   SELECT array_agg(y ORDER BY y COLLATE "C") INTO sorted_ids FROM (SELECT DISTINCT unnest(ids) y) q;
   IF ids IS DISTINCT FROM sorted_ids OR plan_total<>(c->>'amountReceived')::numeric THEN RAISE EXCEPTION 'plan order or total'; END IF;
   IF jsonb_typeof(c->'materialize') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'materialize')>200 THEN RAISE EXCEPTION 'materialize'; END IF;
   loans:=ARRAY[]::text[];
   FOR entry IN SELECT value FROM jsonb_array_elements(c->'materialize') LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(entry) key) IS DISTINCT FROM ARRAY['chargeDate','chargeId','interestDue','loanId','principalDue'] THEN RAISE EXCEPTION 'materialize entry'; END IF;
    FOREACH k IN ARRAY ARRAY['loanId','chargeId','chargeDate','principalDue','interestDue'] LOOP
     IF jsonb_typeof(entry->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'materialize type'; END IF;
    END LOOP;
    v:=entry->>'loanId';IF octet_length(v) NOT BETWEEN 1 AND 256 OR v<>btrim(v,ws) OR v~E'[\\r\\n]' THEN RAISE EXCEPTION 'materialize loan'; END IF;
    v:=entry->>'chargeDate';IF v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR v<'0001-01-01' OR to_char(v::date,'YYYY-MM-DD')<>v THEN RAISE EXCEPTION 'materialize day'; END IF;
    IF entry->>'chargeId' IS DISTINCT FROM 'cg8:'||length(entry->>'loanId')||':'||(entry->>'loanId')||':'||(entry->>'chargeDate') THEN RAISE EXCEPTION 'materialize key'; END IF;
    FOREACH k IN ARRAY ARRAY['principalDue','interestDue'] LOOP
     IF entry->>k !~ '^(0|[1-9][0-9]{0,16})$' OR (entry->>k)::numeric>92233720368547758 THEN RAISE EXCEPTION 'materialize component'; END IF;
    END LOOP;
    IF (entry->>'principalDue')::numeric+(entry->>'interestDue')::numeric<=0 THEN RAISE EXCEPTION 'materialize amount'; END IF;
    loans:=array_append(loans,entry->>'chargeId');
    materialize_text:=materialize_text||CASE WHEN materialize_text='' THEN '' ELSE ',' END||'{"loanId":'||to_json(entry->>'loanId')::text||',"chargeId":'||to_json(entry->>'chargeId')::text
     ||',"chargeDate":'||to_json(entry->>'chargeDate')::text||',"principalDue":'||to_json(entry->>'principalDue')::text||',"interestDue":'||to_json(entry->>'interestDue')::text||'}';
   END LOOP;
   SELECT array_agg(y ORDER BY y COLLATE "C") INTO sorted_ids FROM (SELECT DISTINCT unnest(loans) y) q;
   IF loans IS DISTINCT FROM coalesce(sorted_ids,ARRAY[]::text[]) THEN RAISE EXCEPTION 'materialize order'; END IF;
   IF jsonb_typeof(c->'principal') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'principal')>20 THEN RAISE EXCEPTION 'principal'; END IF;
   loans:=ARRAY[]::text[];
   FOR entry IN SELECT value FROM jsonb_array_elements(c->'principal') LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(entry) key) IS DISTINCT FROM ARRAY['accruedInterest','amount','chargeDate','chargeId','kind','loanId','principalDue'] THEN RAISE EXCEPTION 'principal entry'; END IF;
    FOREACH k IN ARRAY ARRAY['loanId','kind','chargeId','chargeDate','amount','accruedInterest','principalDue'] LOOP
     IF jsonb_typeof(entry->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'principal type'; END IF;
    END LOOP;
    v:=entry->>'loanId';IF octet_length(v) NOT BETWEEN 1 AND 256 OR v<>btrim(v,ws) OR v~E'[\\r\\n]' THEN RAISE EXCEPTION 'principal loan'; END IF;
    v:=entry->>'chargeId';IF octet_length(v) NOT BETWEEN 1 AND 256 OR v LIKE '%,%' OR translate(v,ws,'')<>v THEN RAISE EXCEPTION 'principal charge'; END IF;
    v:=entry->>'chargeDate';IF v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR v<'0001-01-01' OR to_char(v::date,'YYYY-MM-DD')<>v THEN RAISE EXCEPTION 'principal day'; END IF;
    FOREACH k IN ARRAY ARRAY['amount','accruedInterest','principalDue'] LOOP
     IF entry->>k !~ '^(0|[1-9][0-9]{0,16})$' OR (entry->>k)::numeric>92233720368547758 THEN RAISE EXCEPTION 'principal component'; END IF;
    END LOOP;
    IF entry->>'kind' NOT IN ('raise','book') THEN RAISE EXCEPTION 'principal kind'; END IF;
    loans:=array_append(loans,entry->>'loanId');
    principal_text:=principal_text||CASE WHEN principal_text='' THEN '' ELSE ',' END||'{"loanId":'||to_json(entry->>'loanId')::text||',"kind":'||to_json(entry->>'kind')::text
     ||',"chargeId":'||to_json(entry->>'chargeId')::text||',"chargeDate":'||to_json(entry->>'chargeDate')::text||',"amount":'||to_json(entry->>'amount')::text
     ||',"accruedInterest":'||to_json(entry->>'accruedInterest')::text||',"principalDue":'||to_json(entry->>'principalDue')::text||'}';
   END LOOP;
   SELECT array_agg(y ORDER BY y COLLATE "C") INTO sorted_ids FROM (SELECT DISTINCT unnest(loans) y) q;
   IF loans IS DISTINCT FROM coalesce(sorted_ids,ARRAY[]::text[]) THEN RAISE EXCEPTION 'principal order'; END IF;
  END IF;
  derived:=substring(sha256(convert_to('["mw-credit-agent-receipt-v1",'||to_json(environment)::text||','||to_json((c->>'reviewId'))::text||']','UTF8')) FROM 1 FOR 16);
  derived:=set_byte(derived,6,(get_byte(derived,6)&15)|64);derived:=set_byte(derived,8,(get_byte(derived,8)&63)|128);
  request:=encode(derived,'hex')::uuid;IF request::text<>(c->>'requestId') THEN RAISE EXCEPTION 'request identity'; END IF;
  FOREACH k IN ARRAY evidence_keys LOOP IF k<>'sizeBytes' AND jsonb_typeof(x->k)<>'string' THEN RAISE EXCEPTION 'evidence type'; END IF;END LOOP;
  IF (x->>'receiptId')!~'^[a-f0-9]{64}$' OR (x->>'rawSha256')!~'^[a-f0-9]{64}$' OR (x->>'generation')!~'^[1-9][0-9]{0,24}$'
   OR jsonb_typeof(x->'sizeBytes')<>'number' OR (x->>'sizeBytes')!~'^[1-9][0-9]*$' OR ((x->>'sizeBytes'))::numeric>12000000
   OR (x->>'capturedAt')!~'^[1-9][0-9]{0,11}(\.[0-9]{0,8}[1-9])?$' OR (x->>'mimeType') NOT IN ('image/jpeg','image/png','image/webp') THEN RAISE EXCEPTION 'evidence';END IF;
  v:='receipts/'||environment||'/'||to_char(to_timestamp(((x->>'capturedAt'))::double precision) AT TIME ZONE 'UTC','YYYY/MM/DD')||'/'||(x->>'receiptId')||'/'||(x->>'rawSha256')||CASE (x->>'mimeType') WHEN 'image/jpeg' THEN '.jpg' WHEN 'image/png' THEN '.png' ELSE '.webp' END;
  IF (x->>'objectKey')<>v THEN RAISE EXCEPTION 'object binding'; END IF;
  FOREACH k IN ARRAY actor_keys LOOP IF jsonb_typeof(a->k)<>'string' OR octet_length((a->>k)) NOT BETWEEN 1 AND 320 OR (a->>k)<>btrim((a->>k)) OR (a->>k)~E'[\\r\\n]' THEN RAISE EXCEPTION 'actor'; END IF;END LOOP;
  IF (a->>'issuer')<>'https://accounts.google.com' OR (a->>'subject')!~'^[0-9]{1,128}$' OR octet_length((a->>'partnerId'))>256 OR (a->>'loginEmail')<>lower((a->>'loginEmail')) THEN RAISE EXCEPTION 'actor'; END IF;
  canonical:='{"contractVersion":1,"command":{';
  FOREACH k IN ARRAY command_keys LOOP
   IF k='archiveEvidence' THEN
    part:='{';FOREACH v IN ARRAY evidence_keys LOOP part:=part||CASE WHEN part='{' THEN '' ELSE ',' END||to_json(v)::text||':'||(x->v)::text;END LOOP;part:=part||'}';
   ELSIF k='payerLines' THEN part:=CASE WHEN payer_after IS NULL THEN 'null' ELSE '{"before":'||coalesce(to_json(payer_before)::text,'null')||',"after":'||to_json(payer_after)::text||'}' END;
   ELSIF k='purpose' THEN part:=purpose_text;
   ELSIF k='allocations' THEN part:='['||plan_text||']';
   ELSIF k='materialize' THEN part:='['||materialize_text||']';
   ELSIF k='principal' THEN part:='['||principal_text||']';
   ELSE part:=(c->k)::text; END IF;
   canonical:=canonical||CASE WHEN k='schemaVersion' THEN '' ELSE ',' END||to_json(k)::text||':'||part;
  END LOOP;
  canonical:=canonical||'},"actor":{';
  FOREACH k IN ARRAY actor_keys LOOP canonical:=canonical||CASE WHEN k='issuer' THEN '' ELSE ',' END||to_json(k)::text||':'||(a->k)::text;END LOOP;
  canonical:=canonical||'},"receipt":null}';IF canonical IS DISTINCT FROM $1 THEN RAISE EXCEPTION 'noncanonical';END IF;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid agent receipt command'; END;
 hash:=encode(sha256(convert_to(canonical,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(1347895619,hashtext(request::text));
 SELECT * INTO prior FROM public.pwa_payment_commands p WHERE p.request_id=request;
 IF FOUND THEN
  IF prior.canonical_json<>canonical OR prior.payload_sha256<>hash THEN RETURN jsonb_build_object('kind','conflict'); END IF;
  RETURN public.pwa_agent_receipt_status_v1(request,(a->>'issuer'),(a->>'subject'));
 END IF;
 SELECT count(*) INTO matches FROM public."Partners" WHERE lower(btrim("Login Email"))=(a->>'loginEmail');
 IF matches<>1 OR NOT EXISTS(SELECT 1 FROM public."Partners" WHERE "Row ID"=(a->>'partnerId') AND lower(btrim("Login Email"))=(a->>'loginEmail') AND ((c->>'mode')='automatic' OR ("AI Reviewer" IS TRUE AND "IG Integration Enabled" IS TRUE))) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current actor mapping required';END IF;
 BEGIN
  IF day NOT IN ((transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date,(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date-1) THEN RAISE EXCEPTION USING ERRCODE='P4C01';END IF;
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=(c->>'borrowerId') FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4C02';END IF;
  IF NOT EXISTS(SELECT 1 FROM public."Cash Accounts" ca JOIN public."Cash Holders" ch ON ch."Row ID"=ca."Ref Cash Holder" WHERE ca."Row ID"=(c->>'cashAccountId') AND ca."Active" AND ch."Active") THEN RAISE EXCEPTION USING ERRCODE='P4C03';END IF;
  PERFORM public.cash_account_holder((c->>'cashAccountId'),true);
  -- R112 v9: the plan is the business day's (a slip of yesterday is invalid_date). Under the engine's borrower -> loans ->
  -- charges locks the server recomputes the pay-forward plan for this borrower, amount and purpose and requires the
  -- command's lines, booked charges and principal entries to equal it, with nothing uncovered, no loan settled and every
  -- requested principal applied; then the shared writer books it and the explicit plan is journalled before the payment
  -- is inserted (the posting guard reads it). Drift is selection_unavailable (P4C05) and this sub-block rolls back.
  IF c->'schemaVersion' IN ('9'::jsonb,'10'::jsonb) THEN
   today:=(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date;
   IF day<>today THEN RAISE EXCEPTION USING ERRCODE='P4C01';END IF;
   PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers"=(c->>'borrowerId') ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
   PERFORM 1 FROM public."Charges" ch JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans" WHERE l."Ref Borrowers"=(c->>'borrowerId') ORDER BY ch."Row ID" COLLATE "C" FOR UPDATE OF ch;
   BEGIN
    plan:=public.pwa_pay_forward_plan_v1((c->>'borrowerId'),((c->>'amountReceived'))::numeric,today,c->'purpose');
   EXCEPTION WHEN SQLSTATE 'P0001' THEN RAISE EXCEPTION USING ERRCODE='P4C05';
   END;
   IF (CASE WHEN c->'schemaVersion'='9'::jsonb THEN (SELECT coalesce(jsonb_agg(pl.v-ARRAY['lateCharge','expectedLateChargeRemaining'] ORDER BY pl.o),'[]'::jsonb) FROM jsonb_array_elements(plan->'allocations') WITH ORDINALITY pl(v,o)) ELSE plan->'allocations' END) IS DISTINCT FROM c->'allocations'
    OR (c->'schemaVersion'='9'::jsonb AND EXISTS(SELECT 1 FROM jsonb_array_elements(plan->'allocations') pl(v) WHERE pl.v->>'lateCharge'<>'0'))
    OR plan->'materialize' IS DISTINCT FROM c->'materialize' OR plan->>'uncovered' IS DISTINCT FROM '0' OR plan->'settles' IS DISTINCT FROM '[]'::jsonb
    OR jsonb_array_length(plan->'principal') IS DISTINCT FROM jsonb_array_length(c->'purpose'->'principal')
    OR (SELECT coalesce(jsonb_agg(jsonb_build_object('loanId',y->'loanId','kind',y->'kind','chargeId',y->'chargeId','chargeDate',y->'chargeDate','amount',y->'amount','accruedInterest',y->'accruedInterest','principalDue',y->'principalDue') ORDER BY y->>'loanId' COLLATE "C"),'[]'::jsonb)
     FROM jsonb_array_elements(plan->'principal') y) IS DISTINCT FROM c->'principal' THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
   PERFORM public.pwa_apply_pay_forward_v1(c->'principal',c->'materialize',today);
   IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(c->'allocations') AS entries(item)
    LEFT JOIN public."Charges" ch ON ch."Row ID"=entries.item->>'chargeId'
    LEFT JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans"
    LEFT JOIN (SELECT "Ref Charges" charge,sum("Principal Paid"::numeric) principal,sum("Interest Paid"::numeric) interest,sum("Late Charge Paid"::numeric) late,count(*) FILTER(WHERE "Principal Paid" IS NULL OR "Interest Paid" IS NULL) invalid FROM public."Repayments" WHERE "Ref Charges"=ANY(ids) GROUP BY "Ref Charges") paid ON paid.charge=ch."Row ID"
    WHERE l."Ref Borrowers" IS DISTINCT FROM (c->>'borrowerId') OR coalesce(paid.invalid,0)>0
     OR ch."Principal Due"::numeric-coalesce(paid.principal,0) IS DISTINCT FROM (entries.item->>'expectedPrincipalRemaining')::numeric
     OR ch."Interest Due"::numeric-coalesce(paid.interest,0) IS DISTINCT FROM (entries.item->>'expectedInterestRemaining')::numeric
     OR ch."Charge Date" IS DISTINCT FROM (entries.item->>'chargeDate')::date
     OR (entries.item ? 'expectedLateChargeRemaining' AND ch."Late Charge Due"::numeric-coalesce(paid.late,0) IS DISTINCT FROM (entries.item->>'expectedLateChargeRemaining')::numeric)
   ) THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
   INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code)
   VALUES(request,1,(a->>'issuer'),(a->>'subject'),(a->>'partnerId'),(a->>'loginEmail'),canonical,hash,'posted','pwa:'||request::text,NULL);
  END IF;
  SET CONSTRAINTS public.referral_loan_closed DEFERRED; -- R111 V124: fired below, once the payment is Posted.
  INSERT INTO public."Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Created At","Payment Method","Allocation Method","Selected Charge IDs","Bank Reference","Created By","Notes")
  VALUES('pwa:'||request::text,(c->>'borrowerId'),(c->>'cashAccountId'),'Processing',((c->>'amountReceived'))::numeric::money,day,((c->>'paymentDate')||' '||(c->>'transferTime')||':00')::timestamp,'Bank Transfer',
   CASE WHEN c->'schemaVersion' IN ('9'::jsonb,'10'::jsonb) THEN 'Selected Charges' ELSE 'Lump Sum' END,CASE WHEN c->'schemaVersion' IN ('9'::jsonb,'10'::jsonb) THEN array_to_string(ids,' , ') END,(c->>'bankReference'),(a->>'loginEmail'),
   CASE (c->>'mode') WHEN 'automatic' THEN 'Automatic Instagram receipt payment ' ELSE 'Approved Instagram receipt review ' END||'igr:'||left((c->>'reviewId'),48));
  -- R111 V124: a referred loan this receipt closed gets its rebate (and default offset) now, inside this command.
  SET CONSTRAINTS public.referral_loan_closed IMMEDIATE;
  SET CONSTRAINTS public.referral_loan_closed DEFERRED;
  -- R112 v9 (as R110 v10): the loan refresh recomputes Current Daily Interest from the frozen rate now; it must equal the
  -- plan's new daily amount that priced the booked forward charges.
  IF c->'schemaVersion' IN ('9'::jsonb,'10'::jsonb) THEN
   SELECT "Status","Amount Received"::numeric INTO posted_status,posted_amount FROM public."Payments" WHERE "Row ID"='pwa:'||request::text;
   IF posted_status IS DISTINCT FROM 'Posted' OR posted_amount IS DISTINCT FROM ((c->>'amountReceived'))::numeric THEN RAISE EXCEPTION USING ERRCODE='XX000',MESSAGE='Unexpected receipt posting result';END IF;
   FOR entry IN SELECT value FROM jsonb_array_elements(plan->'principal') LOOP
    PERFORM public.vc_refresh_loan(entry->>'loanId');
    IF (SELECT "Current Daily Interest"::numeric FROM public."Loans" WHERE "Row ID"=entry->>'loanId') IS DISTINCT FROM (entry->>'dailyAfter')::numeric THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
   END LOOP;
  END IF;
  -- R095: learn the payer lines (row locked above) only while the column still equals what the agent read; drift skips it
  -- (the payment still posts). A rejected outcome rolls this sub-block back; a replay returns before reaching it.
  IF payer_after IS NOT NULL THEN
   UPDATE public."Borrowers" SET "Communication Name"=payer_after WHERE "Row ID"=(c->>'borrowerId') AND coalesce("Communication Name",'') IS NOT DISTINCT FROM coalesce(payer_before,'');
  END IF;
 EXCEPTION WHEN SQLSTATE 'P4C01' THEN outcome_value:='rejected';rejection:='invalid_date';
  WHEN SQLSTATE 'P4C02' THEN outcome_value:='rejected';rejection:='borrower_unavailable';
  WHEN SQLSTATE 'P4C03' THEN outcome_value:='rejected';rejection:='account_unavailable';
  WHEN SQLSTATE 'P4C05' THEN outcome_value:='rejected';rejection:='selection_unavailable';
  WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM<>'Payment does not match the current eligible balance' THEN RAISE;END IF;
   outcome_value:='rejected';rejection:='selection_unavailable';
 END;
 -- R112: a posted v9 command journalled its row inside the sub-block; every other outcome is journalled here.
 IF NOT EXISTS(SELECT 1 FROM public.pwa_payment_commands p WHERE p.request_id=request) THEN
  INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code)
  VALUES(request,1,(a->>'issuer'),(a->>'subject'),(a->>'partnerId'),(a->>'loginEmail'),canonical,hash,outcome_value,CASE WHEN outcome_value='posted' THEN 'pwa:'||request::text END,rejection);
 END IF;
 result:=public.pwa_agent_receipt_status_v1(request,(a->>'issuer'),(a->>'subject'));
 IF outcome_value='posted' AND result->'financialMatch' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION USING ERRCODE='XX000',MESSAGE='Unexpected receipt posting result';END IF;
 RETURN result;
END $_$;


--
-- Name: pwa_submit_operation_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_submit_operation_v2(canonical_json text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE e jsonb;a jsonb;c jsonb;i jsonb;old public.pwa_payment_commands%ROWTYPE;request uuid;target text;op text;expected text;canonical text;input_text text;receipt_text text;r jsonb;actor_text text;command_text text;k text;v text;rejection text;result_value jsonb;keys text[];source_version text;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR NOT pg_has_role(session_user,CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END,'MEMBER') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Application session required';END IF;
 PERFORM set_config('pwa.native_inverse_request','',true);
 IF $1 IS NULL OR octet_length($1)>524288 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid operation';END IF;
 BEGIN
 e:=$1::jsonb;a:=e->'actor';c:=e->'command';i:=c->'inputs';
 IF jsonb_typeof(e) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(e) key) IS DISTINCT FROM ARRAY['actor','command','contractVersion','receipt','requestId'] OR e->'contractVersion'<>'2'::jsonb THEN RAISE EXCEPTION 'shape';END IF;
 IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c) key) IS DISTINCT FROM ARRAY['expectedVersion','inputs','operation','predecessorRequestId','schemaVersion','targetId','targetType'] OR c->'schemaVersion'<>'1'::jsonb OR c->>'targetType' IS DISTINCT FROM split_part(c->>'operation','.',1) THEN RAISE EXCEPTION 'command';END IF;
 IF e->>'requestId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'id';END IF;request:=(e->>'requestId')::uuid;
 target:=c->>'targetId';op:=c->>'operation';expected:=c->>'expectedVersion';
 IF jsonb_typeof(c->'targetId') IS DISTINCT FROM 'string' OR octet_length(target) NOT BETWEEN 1 AND 256 OR target~'[[:cntrl:]]' OR op NOT IN('borrower.create','borrower.update','borrower.delete','loan.create','loan.update','loan.delete','loan.default','loan.undo-default','loan.generate-charge','loan.book-projected-charge','loan.close','loan.rollover','charge.create','charge.update','charge.delete','payment.correct','payment.delete','payment.move-interest','expense.create','expense.update','expense.delete','preference.update','cash-holder.create','cash-holder.update','cash-holder.delete','cash-account.create','cash-account.update','cash-account.delete','partner.create','partner.update','partner.delete','capital-contribution.create','capital-contribution.update','capital-contribution.delete','settlement.create','settlement.update','settlement.complete','settlement.reverse','settlement.cancel','settlement.settle-all','cash-movement.create','cash-movement.update','cash-movement.delete','cash-withdrawal.create','cash-openings.initialize','assessment.create','assessment.update','assessment.refresh','assessment.delete','analytics.refresh','rebate-settlement.create','rebate-settlement.delete') THEN RAISE EXCEPTION 'target';END IF;
 IF split_part(op,'.',1)='payment' THEN IF c->'predecessorRequestId'<>'null'::jsonb AND (jsonb_typeof(c->'predecessorRequestId') IS DISTINCT FROM 'string' OR c->>'predecessorRequestId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$') THEN RAISE EXCEPTION 'predecessor';END IF;ELSIF c->'predecessorRequestId'<>'null'::jsonb THEN RAISE EXCEPTION 'predecessor';END IF;
 IF op IN('borrower.create','loan.create','loan.rollover','charge.create','expense.create','cash-holder.create','cash-account.create','partner.create','capital-contribution.create','settlement.create','settlement.settle-all','cash-movement.create','cash-withdrawal.create','assessment.create','rebate-settlement.create') THEN IF c->'expectedVersion'<>'null'::jsonb OR target !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'create';END IF;
 ELSE IF jsonb_typeof(c->'expectedVersion') IS DISTINCT FROM 'string' OR expected !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'version';END IF;END IF;
 IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(a) key) IS DISTINCT FROM ARRAY['issuer','loginEmail','partnerId','subject'] THEN RAISE EXCEPTION 'actor';END IF;
 FOREACH k IN ARRAY ARRAY['issuer','subject','partnerId','loginEmail'] LOOP v:=a->>k;IF jsonb_typeof(a->k) IS DISTINCT FROM 'string' OR btrim(v)='' OR v~'[[:cntrl:]]' OR octet_length(v)>(CASE k WHEN 'issuer' THEN 1024 WHEN 'subject' THEN 128 WHEN 'partnerId' THEN 256 ELSE 320 END) THEN RAISE EXCEPTION 'actor';END IF;END LOOP;
 IF a->>'loginEmail'<>lower(btrim(a->>'loginEmail')) OR a->>'partnerId'<>btrim(a->>'partnerId') THEN RAISE EXCEPTION 'actor';END IF;
 actor_text:='{"issuer":'||to_json(a->>'issuer')::text||',"subject":'||to_json(a->>'subject')::text||',"partnerId":'||to_json(a->>'partnerId')::text||',"loginEmail":'||to_json(a->>'loginEmail')::text||'}';
 r:=e->'receipt';receipt_text:='null';
 IF r IS DISTINCT FROM 'null'::jsonb THEN
  IF op NOT IN('loan.close','payment.correct') OR jsonb_typeof(r) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(r) key) IS DISTINCT FROM ARRAY['mimeType','receiptId','sha256','sizeBytes','storageReference'] THEN RAISE EXCEPTION 'receipt';END IF;
  IF jsonb_typeof(r->'receiptId') IS DISTINCT FROM 'string' OR r->>'receiptId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR jsonb_typeof(r->'sha256') IS DISTINCT FROM 'string' OR r->>'sha256'!~'^[a-f0-9]{64}$' OR r->>'mimeType' NOT IN('image/png','image/jpeg') OR jsonb_typeof(r->'sizeBytes') IS DISTINCT FROM 'number' OR r->>'sizeBytes'!~'^[1-9][0-9]*$' OR (r->>'sizeBytes')::numeric>5242880 OR jsonb_typeof(r->'storageReference') IS DISTINCT FROM 'string' OR octet_length(r->>'storageReference') NOT BETWEEN 1 AND 2048 OR r->>'storageReference'~'[\r\n]' THEN RAISE EXCEPTION 'receipt';END IF;
  receipt_text:='{"receiptId":'||to_json(r->>'receiptId')::text||',"sha256":'||to_json(r->>'sha256')::text||',"mimeType":'||to_json(r->>'mimeType')::text||',"sizeBytes":'||(r->>'sizeBytes')||',"storageReference":'||to_json(r->>'storageReference')::text||'}';
 END IF;
 IF jsonb_typeof(i) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'inputs';END IF;
 IF split_part(op,'.',1) IN('cash-openings','assessment','analytics') THEN input_text:=public.pwa_management_tools_text_v2(op,i);ELSIF split_part(op,'.',1) IN('capital-contribution','settlement','cash-movement','cash-withdrawal') THEN input_text:=public.pwa_management_financial_text_v2(op,i);ELSIF split_part(op,'.',1) IN('cash-holder','cash-account','partner') THEN input_text:=public.pwa_management_input_text_v2(op,i);
 ELSIF op='preference.update' THEN
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['language','statementAccountId','statementDate'] OR jsonb_typeof(i->'language') IS DISTINCT FROM 'string' OR i->>'language' NOT IN('English','ไทย') OR jsonb_typeof(i->'statementAccountId') NOT IN('string','null') OR jsonb_typeof(i->'statementDate') NOT IN('string','null') THEN RAISE EXCEPTION 'preference fields';END IF;
 IF i->'statementAccountId'<>'null'::jsonb AND (octet_length(i->>'statementAccountId') NOT BETWEEN 1 AND 256 OR i->>'statementAccountId'~'[[:cntrl:]]') THEN RAISE EXCEPTION 'preference account';END IF;
 IF i->'statementDate'<>'null'::jsonb AND (i->>'statementDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'statementDate')::date)::text<>i->>'statementDate') THEN RAISE EXCEPTION 'preference date';END IF;
 input_text:='{"language":'||to_json(i->>'language')::text||',"statementAccountId":'||coalesce(to_json(i->>'statementAccountId')::text,'null')||',"statementDate":'||coalesce(to_json(i->>'statementDate')::text,'null')||'}';
 ELSIF op IN('expense.create','expense.update') THEN
 keys:=ARRAY['expenseDate','category','amount','payeeName','relatedBorrowerId','relatedLoanId','notes','paidByAccountId']||CASE WHEN i ? 'payeeBorrowerId' THEN ARRAY['payeeBorrowerId'] ELSE ARRAY[]::text[] END||CASE WHEN i ? 'paidDate' THEN ARRAY['paidDate'] ELSE ARRAY[]::text[] END; /* R140 V143: the optional payee borrower, last */ /* R140 V144: then the optional paid date */
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM unnest(keys) key) THEN RAISE EXCEPTION 'expense keys';END IF;
 input_text:='{';FOREACH k IN ARRAY keys LOOP
 IF jsonb_typeof(i->k) NOT IN('string','null') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION 'expense field';END IF;
 IF k IN('expenseDate','category','amount') AND jsonb_typeof(i->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'expense required';END IF;
 IF k IN('relatedBorrowerId','relatedLoanId','paidByAccountId','payeeBorrowerId') AND i->k<>'null'::jsonb AND (octet_length(i->>k) NOT BETWEEN 1 AND 256 OR i->>k~'[[:cntrl:]]') THEN RAISE EXCEPTION 'expense reference';END IF;
 input_text:=input_text||CASE WHEN input_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||coalesce(to_json(i->>k)::text,'null');END LOOP;input_text:=input_text||'}';
 IF i->>'expenseDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'expenseDate')::date)::text<>i->>'expenseDate' OR btrim(i->>'category')='' OR i->>'amount'!~'^-?[1-9][0-9]*$' OR abs((i->>'amount')::numeric)>92233720368547758 THEN RAISE EXCEPTION 'expense input';END IF; IF i->>'payeeBorrowerId' IS NOT NULL AND i->'payeeName'<>'null'::jsonb THEN RAISE EXCEPTION 'expense payee';END IF; IF i->>'paidDate' IS NOT NULL AND (i->>'paidDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'paidDate')::date)::text<>i->>'paidDate' OR i->>'paidByAccountId' IS NULL OR (i->>'paidDate')::date<(i->>'expenseDate')::date /* R140 V145 */) THEN RAISE EXCEPTION 'expense paid date';END IF; /* R140 V144: a paid date is a valid date and needs an account */ /* R140 V143: a borrower payee carries no typed name */
 ELSIF op='rebate-settlement.create' THEN
 -- R129: whole pending rebates of one referrer (1 to 200 distinct expense ids, ascending), date, Lisa's account, method,
 -- optional bank reference (Bank Transfer only) and notes.
 IF (SELECT array_agg(key ORDER BY key COLLATE "C") FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['bankReference','cashAccountId','expenseIds','notes','paymentMethod','referrerId','settlementDate'] THEN RAISE EXCEPTION 'settlement keys';END IF;
 IF jsonb_typeof(i->'referrerId') IS DISTINCT FROM 'string' OR octet_length(i->>'referrerId') NOT BETWEEN 1 AND 256 OR i->>'referrerId'~'[[:cntrl:]]'
  OR jsonb_typeof(i->'cashAccountId') IS DISTINCT FROM 'string' OR octet_length(i->>'cashAccountId') NOT BETWEEN 1 AND 256 OR i->>'cashAccountId'~'[[:cntrl:]]'
  OR jsonb_typeof(i->'settlementDate') IS DISTINCT FROM 'string' OR i->>'settlementDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'settlementDate')::date)::text<>i->>'settlementDate'
  OR jsonb_typeof(i->'paymentMethod') IS DISTINCT FROM 'string' OR i->>'paymentMethod' NOT IN('Bank Transfer','Cash')
  OR jsonb_typeof(i->'bankReference') NOT IN('string','null') OR (i->'bankReference'<>'null'::jsonb AND (octet_length(i->>'bankReference') NOT BETWEEN 1 AND 256 OR btrim(i->>'bankReference')='' OR i->>'bankReference'~'[\r\n]' OR i->>'paymentMethod'<>'Bank Transfer'))
  OR jsonb_typeof(i->'notes') NOT IN('string','null') OR coalesce(octet_length(i->>'notes'),0)>65536
  OR jsonb_typeof(i->'expenseIds') IS DISTINCT FROM 'array' OR jsonb_array_length(i->'expenseIds') NOT BETWEEN 1 AND 200
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(i->'expenseIds') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR octet_length(x#>>'{}') NOT BETWEEN 1 AND 256 OR x#>>'{}'~'[[:cntrl:]]')
  OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(i->'expenseIds') WITH ORDINALITY x(v,n) JOIN jsonb_array_elements_text(i->'expenseIds') WITH ORDINALITY y(v,n) ON y.n=x.n+1 WHERE NOT (x.v COLLATE "C"<y.v COLLATE "C"))
 THEN RAISE EXCEPTION 'settlement input';END IF;
 input_text:='{"referrerId":'||to_json(i->>'referrerId')::text||',"expenseIds":['||(SELECT string_agg(to_json(x.v)::text,',' ORDER BY x.n) FROM jsonb_array_elements_text(i->'expenseIds') WITH ORDINALITY x(v,n))
  ||'],"settlementDate":'||to_json(i->>'settlementDate')::text||',"cashAccountId":'||to_json(i->>'cashAccountId')::text||',"paymentMethod":'||to_json(i->>'paymentMethod')::text
  ||',"bankReference":'||coalesce(to_json(i->>'bankReference')::text,'null')||',"notes":'||coalesce(to_json(i->>'notes')::text,'null')||'}';
 ELSIF op='payment.correct' THEN input_text:=public.pwa_payment_correction_text_v2(i);IF (i->>'receiptMode'='replace') IS DISTINCT FROM (r<>'null'::jsonb) THEN RAISE EXCEPTION 'receipt mode';END IF;
 ELSIF op='payment.move-interest' THEN IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['allocationId','targetChargeId'] THEN RAISE EXCEPTION 'move keys';END IF;FOREACH k IN ARRAY ARRAY['allocationId','targetChargeId'] LOOP IF jsonb_typeof(i->k) IS DISTINCT FROM 'string' OR octet_length(i->>k) NOT BETWEEN 1 AND 256 OR i->>k~'[[:cntrl:]]' THEN RAISE EXCEPTION 'move reference';END IF;END LOOP;input_text:='{"allocationId":'||to_json(i->>'allocationId')::text||',"targetChargeId":'||to_json(i->>'targetChargeId')::text||'}';
 ELSIF op IN('loan.create','loan.update','loan.rollover') THEN
 keys:=ARRAY['borrowerId','loanDate','principal','transferFee','disbursingAccountId','type','dueDate','dailyPayment','fixedInterest','currentDailyInterest','paymentInterval','arrangement','autoChargeEnabled'];
 IF i ? 'scheduleAnchor' THEN keys:=array_append(keys,'scheduleAnchor');END IF;
 -- R136: a rollover is a new loan (no schedule anchor) plus its original loan, that loan's version, the penalty and the quote.
 IF op='loan.rollover' THEN
  IF i ? 'scheduleAnchor' THEN RAISE EXCEPTION 'rollover anchor';END IF;
  keys:=keys||ARRAY['sourceLoanId','sourceExpectedVersion','penalty','expectedSettlement','expectedPlanHash'];
  IF jsonb_typeof(i->'sourceLoanId') IS DISTINCT FROM 'string' OR octet_length(i->>'sourceLoanId') NOT BETWEEN 1 AND 256 OR i->>'sourceLoanId'~'[[:cntrl:]]'
   OR jsonb_typeof(i->'sourceExpectedVersion') IS DISTINCT FROM 'string' OR i->>'sourceExpectedVersion'!~'^[a-f0-9]{64}$'
   OR jsonb_typeof(i->'penalty') IS DISTINCT FROM 'string' OR i->>'penalty'!~'^(0|[1-9][0-9]{0,16})$' OR (i->>'penalty')::numeric>92233720368547758
   OR jsonb_typeof(i->'expectedSettlement') IS DISTINCT FROM 'string' OR i->>'expectedSettlement'!~'^[1-9][0-9]{0,16}$' OR (i->>'expectedSettlement')::numeric>92233720368547758
   OR jsonb_typeof(i->'expectedPlanHash') IS DISTINCT FROM 'string' OR i->>'expectedPlanHash'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'rollover input';END IF;
 END IF;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM unnest(keys) key) THEN RAISE EXCEPTION 'loan keys';END IF;
 input_text:='{';FOREACH k IN ARRAY keys LOOP
  IF k='autoChargeEnabled' THEN IF jsonb_typeof(i->k) NOT IN('boolean','null') THEN RAISE EXCEPTION 'loan boolean';END IF;
  ELSIF k='paymentInterval' THEN IF i->k<>'null'::jsonb AND (jsonb_typeof(i->k)<>'number' OR i->>k!~'^[1-9][0-9]*$' OR (i->>k)::numeric>2147483647) THEN RAISE EXCEPTION 'loan interval';END IF;
  ELSE
   IF jsonb_typeof(i->k) NOT IN('string','null') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION 'loan text';END IF;
   IF k IN('principal','transferFee','dailyPayment','fixedInterest','currentDailyInterest') AND i->k<>'null'::jsonb AND (i->>k!~'^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' OR (i->>k)::numeric>92233720368547758.07) THEN RAISE EXCEPTION 'loan amount';END IF;
   IF k='type' AND i->k<>'null'::jsonb AND i->>k NOT IN('กำหนดวันชำระ','ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน') THEN RAISE EXCEPTION 'loan type';END IF;
   IF k IN('loanDate','dueDate','scheduleAnchor') AND i->k<>'null'::jsonb AND (i->>k!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>k)::date)::text<>i->>k) THEN RAISE EXCEPTION 'loan date';END IF;
   IF k IN('borrowerId','disbursingAccountId') AND ((op IN('loan.create','loan.rollover') AND i->k='null'::jsonb) OR (i->k<>'null'::jsonb AND (octet_length(i->>k) NOT BETWEEN 1 AND 256 OR i->>k~'[[:cntrl:]]'))) THEN RAISE EXCEPTION 'loan reference';END IF;
  END IF;
  input_text:=input_text||CASE WHEN input_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||CASE WHEN i->k='null'::jsonb THEN 'null' WHEN k IN('autoChargeEnabled','paymentInterval') THEN (i->k)::text ELSE to_json(i->>k)::text END;
 END LOOP;input_text:=input_text||'}';
 IF op IN('loan.create','loan.rollover') AND ((i->>'principal')::numeric IS NULL OR (i->>'principal')::numeric<=0 OR i->>'loanDate' IS NULL OR i->>'type' IS NULL OR i->>'type' NOT IN('กำหนดวันชำระ','ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน')) THEN RAISE EXCEPTION 'loan required';END IF;
 ELSIF op IN('charge.create','charge.update') THEN
 -- R118: lateChargeDue (optional) between interestDue and notes.
 keys:=ARRAY['loanId','chargeDate','principalDue','interestDue']||CASE WHEN i ? 'lateChargeDue' THEN ARRAY['lateChargeDue'] ELSE ARRAY[]::text[] END||ARRAY['notes'];
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM unnest(keys) key) THEN RAISE EXCEPTION 'charge keys';END IF;
 input_text:='{';FOREACH k IN ARRAY keys LOOP
 IF (k='notes' AND jsonb_typeof(i->k) NOT IN('string','null')) OR (k<>'notes' AND jsonb_typeof(i->k) IS DISTINCT FROM 'string') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION 'charge input';END IF;
 input_text:=input_text||CASE WHEN input_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||coalesce(to_json(i->>k)::text,'null');
 END LOOP;input_text:=input_text||'}';
 IF octet_length(i->>'loanId') NOT BETWEEN 1 AND 256 OR i->>'loanId'~'[[:cntrl:]]' OR i->>'chargeDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'chargeDate')::date)::text<>i->>'chargeDate' OR i->>'principalDue'!~'^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' OR i->>'interestDue'!~'^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' OR abs((i->>'principalDue')::numeric)>92233720368547758.07 OR abs((i->>'interestDue')::numeric)>92233720368547758.07 OR (i ? 'lateChargeDue' AND (i->>'lateChargeDue'!~'^(0|[1-9][0-9]{0,16})$' OR (i->>'lateChargeDue')::numeric>92233720368547758)) THEN RAISE EXCEPTION 'charge input';END IF;
 ELSIF op='loan.close' THEN
 keys:=ARRAY['paymentDate','cashAccountId','paymentMethod','notes','expectedAmount','expectedPlanHash']||CASE WHEN i ? 'rebatePath' THEN ARRAY['rebatePath'] ELSE ARRAY[]::text[] END
  -- R128: the slip's bank reference and transfer time, each only when present (an older PWA's command stays canonical).
  ||CASE WHEN i ? 'bankReference' THEN ARRAY['bankReference'] ELSE ARRAY[]::text[] END||CASE WHEN i ? 'transferTime' THEN ARRAY['transferTime'] ELSE ARRAY[]::text[] END;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM unnest(keys) key) THEN RAISE EXCEPTION 'close keys';END IF;
 input_text:='{';FOREACH k IN ARRAY keys LOOP
  IF (k='notes' AND jsonb_typeof(i->k) NOT IN('string','null')) OR (k<>'notes' AND jsonb_typeof(i->k) IS DISTINCT FROM 'string') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION 'close input';END IF;
  input_text:=input_text||CASE WHEN input_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||coalesce(to_json(i->>k)::text,'null');
 END LOOP;input_text:=input_text||'}';
 IF i->>'paymentDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'paymentDate')::date)::text<>i->>'paymentDate' OR octet_length(i->>'cashAccountId') NOT BETWEEN 1 AND 256 OR i->>'cashAccountId'~'[[:cntrl:]]' OR i->>'paymentMethod' NOT IN('Bank Transfer','Cash','Net-off at Disbursement') OR i->>'expectedAmount'!~'^[1-9][0-9]*$' OR (i->>'expectedAmount')::numeric>92233720368547758 OR i->>'expectedPlanHash'!~'^[a-f0-9]{64}$' OR (i ? 'rebatePath' AND i->>'rebatePath' NOT IN('offset','expense'))
  OR (i ? 'bankReference' AND (octet_length(i->>'bankReference') NOT BETWEEN 1 AND 256 OR btrim(i->>'bankReference')='' OR i->>'bankReference'~'[\r\n]'))
  OR (i ? 'transferTime' AND i->>'transferTime'!~'^([01][0-9]|2[0-3]):[0-5][0-9]$')
  OR ((i ? 'bankReference' OR i ? 'transferTime') AND i->>'paymentMethod'<>'Bank Transfer') /* R128 */ THEN RAISE EXCEPTION 'close input';END IF;
 ELSIF op='loan.default' AND (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['businessDate'] THEN
 -- R109 (V120): the loss amount (whole baht, 0 only for a fully lost loan, which SQL decides) and the keep-charges choice.
 -- The one-key form {businessDate} stays valid (requests saved by an earlier PWA): write off and close the whole principal.
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['amount','businessDate','keepCharges'] OR jsonb_typeof(i->'businessDate') IS DISTINCT FROM 'string' OR i->>'businessDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'businessDate')::date)::text<>i->>'businessDate' OR jsonb_typeof(i->'amount') IS DISTINCT FROM 'string' OR i->>'amount'!~'^(0|[1-9][0-9]{0,16})$' OR (i->>'amount')::numeric>92233720368547758 OR jsonb_typeof(i->'keepCharges') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'default input';END IF;
 input_text:='{"businessDate":'||to_json(i->>'businessDate')::text||',"amount":'||to_json(i->>'amount')::text||',"keepCharges":'||(i->'keepCharges')::text||'}';
 ELSIF op IN('loan.default','loan.generate-charge') THEN
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['businessDate'] OR jsonb_typeof(i->'businessDate') IS DISTINCT FROM 'string' OR i->>'businessDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'businessDate')::date)::text<>i->>'businessDate' THEN RAISE EXCEPTION 'business date';END IF;
 input_text:='{"businessDate":'||to_json(i->>'businessDate')::text||'}';
 ELSIF op='loan.book-projected-charge' THEN
 -- R104: the reviewed next projected charge of the loan; the generator key is derived, never sent.
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['chargeDate','interestDue','principalDue'] OR jsonb_typeof(i->'chargeDate') IS DISTINCT FROM 'string' OR jsonb_typeof(i->'principalDue') IS DISTINCT FROM 'string' OR jsonb_typeof(i->'interestDue') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'projected charge keys';END IF;
 IF i->>'chargeDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'chargeDate')::date)::text<>i->>'chargeDate' OR i->>'principalDue'!~'^(0|[1-9][0-9]{0,16})$' OR i->>'interestDue'!~'^(0|[1-9][0-9]{0,16})$' OR (i->>'principalDue')::numeric>92233720368547758 OR (i->>'interestDue')::numeric>92233720368547758 OR (i->>'principalDue')::numeric+(i->>'interestDue')::numeric<=0 THEN RAISE EXCEPTION 'projected charge input';END IF;
 input_text:='{"chargeDate":'||to_json(i->>'chargeDate')::text||',"principalDue":'||to_json(i->>'principalDue')::text||',"interestDue":'||to_json(i->>'interestDue')::text||'}';
 ELSIF op IN('borrower.delete','loan.delete','loan.undo-default','charge.delete','payment.delete','expense.delete','rebate-settlement.delete') THEN IF i<>'{}'::jsonb THEN RAISE EXCEPTION 'delete';END IF;input_text:='{}';
 ELSE
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i-'aiCollectionEnabled'-'referralRebateRate'-'referralRebateCap') key) IS DISTINCT FROM ARRAY['address','city','communicationName','description','hidden','instagramUsername','name','note','preferredReceivingAccountId','referrerId','workingLocation'] THEN RAISE EXCEPTION 'inputs';END IF;
 input_text:='{';FOREACH k IN ARRAY ARRAY['name','description','communicationName','instagramUsername','city','workingLocation','address','hidden','referrerId','preferredReceivingAccountId','note']||CASE WHEN i?'aiCollectionEnabled' THEN ARRAY['aiCollectionEnabled'] ELSE ARRAY[]::text[] END||CASE WHEN i?'referralRebateRate' THEN ARRAY['referralRebateRate'] ELSE ARRAY[]::text[] END||CASE WHEN i?'referralRebateCap' THEN ARRAY['referralRebateCap'] ELSE ARRAY[]::text[] END LOOP
  IF k IN('hidden','aiCollectionEnabled') THEN IF jsonb_typeof(i->k) NOT IN('boolean','null') THEN RAISE EXCEPTION 'boolean';END IF;
  -- R120: referral rebate rate (0 to 100) and cap (1 or more), whole numbers as JSON numbers, or null (the default).
  ELSIF k IN('referralRebateRate','referralRebateCap') THEN IF i->k<>'null'::jsonb AND (jsonb_typeof(i->k) IS DISTINCT FROM 'number' OR i->>k!~'^(0|[1-9][0-9]{0,11})$' OR (k='referralRebateRate' AND (i->>k)::numeric>100) OR (k='referralRebateCap' AND (i->>k)::numeric<1)) THEN RAISE EXCEPTION 'number';END IF;
  ELSE IF jsonb_typeof(i->k) NOT IN('string','null') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION 'text';END IF;
  IF k IN('referrerId','preferredReceivingAccountId') AND i->k<>'null'::jsonb AND (octet_length(i->>k) NOT BETWEEN 1 AND 256 OR i->>k~'[[:cntrl:]]') THEN RAISE EXCEPTION 'ref';END IF;END IF;
  input_text:=input_text||CASE WHEN input_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||CASE WHEN i->k='null'::jsonb THEN 'null' WHEN k IN('hidden','aiCollectionEnabled','referralRebateRate','referralRebateCap') THEN (i->k)::text ELSE to_json(i->>k)::text END;
 END LOOP;input_text:=input_text||'}';END IF;
 command_text:='{"schemaVersion":1,"operation":'||to_json(op)::text||',"targetType":'||to_json(split_part(op,'.',1))::text||',"targetId":'||to_json(target)::text||',"expectedVersion":'||coalesce(to_json(expected)::text,'null')||',"predecessorRequestId":'||coalesce(to_json(c->>'predecessorRequestId')::text,'null')||',"inputs":'||input_text||'}';
 canonical:='{"contractVersion":2,"requestId":'||to_json(request::text)::text||',"actor":'||actor_text||',"command":'||command_text||',"receipt":'||receipt_text||'}';
 IF canonical IS DISTINCT FROM $1 THEN RAISE EXCEPTION 'noncanonical';END IF;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid canonical operation';END;
 IF (SELECT count(*) FROM public."Partners" WHERE lower(btrim("Login Email"))=a->>'loginEmail')<>1 OR NOT EXISTS(SELECT 1 FROM public."Partners" WHERE "Row ID"=a->>'partnerId' AND lower(btrim("Login Email"))=a->>'loginEmail') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current actor mapping required';END IF;
 IF op='preference.update' AND target IS DISTINCT FROM a->>'partnerId' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Own preferences required';END IF;
 PERFORM pg_advisory_xact_lock(1347895619,hashtext(request::text));
 SELECT * INTO old FROM public.pwa_payment_commands p WHERE p.request_id=request;
 IF FOUND THEN
  IF old.contract_version<>2 OR old.canonical_json<>$1 OR old.actor_issuer<>a->>'issuer' OR old.actor_subject<>a->>'subject' THEN RETURN jsonb_build_object('kind','conflict');END IF;
  RETURN public.pwa_operation_status_v2(request,a->>'issuer',a->>'subject');
 END IF;
 BEGIN
 IF split_part(op,'.',1)='analytics' THEN result_value:=public.pwa_apply_analytics_v2($1);ELSIF split_part(op,'.',1)='cash-openings' THEN result_value:=public.pwa_apply_cash_opening_v2($1);ELSIF split_part(op,'.',1)='assessment' THEN result_value:=public.pwa_apply_assessment_v2($1);ELSIF split_part(op,'.',1) IN('capital-contribution','settlement','cash-movement','cash-withdrawal') THEN result_value:=public.pwa_apply_management_financial_v2($1);ELSIF split_part(op,'.',1) IN('cash-holder','cash-account','partner') THEN result_value:=public.pwa_apply_management_v2($1);ELSIF op='preference.update' THEN result_value:=public.pwa_apply_preference_v2($1);ELSIF split_part(op,'.',1)='rebate-settlement' THEN result_value:=public.pwa_apply_rebate_settlement_v1($1);ELSIF split_part(op,'.',1)='expense' THEN result_value:=public.pwa_apply_expense_v2($1);ELSIF split_part(op,'.',1)='payment' THEN result_value:=public.pwa_apply_payment_v2($1);ELSIF op='loan.create' THEN result_value:=public.pwa_apply_loan_create_v2($1);ELSIF op='loan.close' THEN result_value:=public.pwa_apply_loan_close_v2($1);ELSIF op='loan.rollover' THEN result_value:=public.pwa_apply_loan_rollover_v1($1);ELSIF split_part(op,'.',1)='loan' THEN result_value:=public.pwa_apply_loan_source_v2($1);ELSIF split_part(op,'.',1)='charge' THEN result_value:=public.pwa_apply_charge_v2($1);ELSE
 PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('borrower',target));
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=target FOR UPDATE;
 source_version:=public.pwa_borrower_version_v2(target);
 IF op='borrower.create' AND source_version IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF op<>'borrower.create' AND source_version IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B02';END IF;
 IF op<>'borrower.create' AND source_version IS DISTINCT FROM expected THEN RAISE EXCEPTION USING ERRCODE='P5B01';END IF;
 IF op<>'borrower.delete' THEN
  IF nullif(btrim(i->>'name'),'') IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(public.pwa_lock_key_v1('borrower-name',lower(btrim(i->>'name'))));
   IF EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID"<>target AND lower(btrim("Borrower Name"))=lower(btrim(i->>'name'))) THEN RAISE EXCEPTION USING ERRCODE='P5B03';END IF;
  END IF;
  IF i->>'referrerId'=target OR (i->>'referrerId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID"=i->>'referrerId')) THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
  IF i->>'preferredReceivingAccountId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public."Cash Accounts" ca JOIN public."Cash Holders" ch ON ch."Row ID"=ca."Ref Cash Holder" WHERE ca."Row ID"=i->>'preferredReceivingAccountId' AND ca."Active" IS TRUE AND ch."Active" IS TRUE) THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
 END IF;
 -- Only this explicit source-write block translates known source constraints.
 BEGIN
 IF op='borrower.create' THEN
 INSERT INTO public."Borrowers"("Row ID","Borrower Name","Description","Communication Name","Instagram Username","City","Working Location","Address","Hidden Flag","Ref Referrer","Ref Preferred Receiving Cash Account","Borrower Note","Creation Date","AI Collection Enabled","Referral Rebate Rate","Referral Rebate Cap") VALUES(target,i->>'name',i->>'description',i->>'communicationName',i->>'instagramUsername',i->>'city',i->>'workingLocation',i->>'address',(i->>'hidden')::boolean,i->>'referrerId',i->>'preferredReceivingAccountId',i->>'note',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,CASE WHEN i?'aiCollectionEnabled' THEN (i->>'aiCollectionEnabled')::boolean ELSE true END,(i->>'referralRebateRate')::numeric,(i->>'referralRebateCap')::numeric);
 ELSIF op='borrower.update' THEN UPDATE public."Borrowers" SET "Borrower Name"=i->>'name',"Description"=i->>'description',"Communication Name"=i->>'communicationName',"Instagram Username"=i->>'instagramUsername',"City"=i->>'city',"Working Location"=i->>'workingLocation',"Address"=i->>'address',"Hidden Flag"=(i->>'hidden')::boolean,"Ref Referrer"=i->>'referrerId',"Ref Preferred Receiving Cash Account"=i->>'preferredReceivingAccountId',"Borrower Note"=i->>'note',"AI Collection Enabled"=CASE WHEN i?'aiCollectionEnabled' THEN (i->>'aiCollectionEnabled')::boolean ELSE "AI Collection Enabled" END,"Referral Rebate Rate"=CASE WHEN i?'referralRebateRate' THEN (i->>'referralRebateRate')::numeric ELSE "Referral Rebate Rate" END,"Referral Rebate Cap"=CASE WHEN i?'referralRebateCap' THEN (i->>'referralRebateCap')::numeric ELSE "Referral Rebate Cap" END WHERE "Row ID"=target;
 ELSE DELETE FROM public."Borrowers" WHERE "Row ID"=target;END IF;
 EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B05';WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION USING ERRCODE='P5B06';END;
 result_value:=jsonb_build_object('operation',op,'targetType','borrower','targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL);
 END IF;
 EXCEPTION WHEN SQLSTATE 'P5B01' THEN rejection:='source_conflict';WHEN SQLSTATE 'P5B02' THEN rejection:='not_found';WHEN SQLSTATE 'P5B03' THEN rejection:='borrower_name_exists';WHEN SQLSTATE 'P5B04' THEN rejection:='invalid_reference';WHEN SQLSTATE 'P5B05' THEN rejection:='dependency_conflict';WHEN SQLSTATE 'P5B06' THEN rejection:='record_requires_reconciliation';WHEN SQLSTATE 'P5B07' THEN rejection:='account_unavailable';WHEN SQLSTATE 'P5B08' THEN rejection:='invalid_date';WHEN SQLSTATE 'P5B09' THEN rejection:='plan_changed';WHEN SQLSTATE 'P5B10' THEN rejection:='insufficient_funds';WHEN SQLSTATE 'P5B11' THEN rejection:='plan_changed';WHEN SQLSTATE 'P5B12' THEN rejection:='rollover_ineligible';END;
 IF NOT EXISTS(SELECT 1 FROM public.pwa_payment_commands WHERE request_id=request) THEN
 INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code,result_json)
 VALUES(request,2,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',$1,encode(sha256(convert_to($1,'UTF8')),'hex'),CASE WHEN rejection IS NULL THEN 'applied' ELSE 'rejected' END,NULL,rejection,CASE WHEN rejection IS NULL THEN result_value ELSE NULL END);END IF;
 SELECT * INTO old FROM public.pwa_payment_commands p WHERE p.request_id=request;
 RETURN jsonb_build_object('kind','recorded','originalOutcome',jsonb_build_object('status',old.outcome,'code',old.rejection_code,'result',old.result_json,'recordedAt',to_char(old.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
END $_$;


--
-- Name: pwa_submit_selected_charges_v1(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_submit_selected_charges_v1(canonical_json text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE
 line jsonb;plan_text text;line_text text;plan_total numeric;balance record;
 e jsonb;c jsonb;a jsonb;r jsonb;v text;k text;canonical text;command_text text;actor_text text;receipt_text text;
 ids text[];sorted_ids text[];current_ids text[];current_amount numeric;selection_text text;notes_text text;receipt_id text;request uuid;hash text;day date;
 prior public.pwa_payment_commands%ROWTYPE;matches integer;outcome_value text:='posted';rejection text:=NULL;payment_key text;posted_status text;posted_amount numeric;slip_text text:='';
 payer_before text;payer_after text;
 -- R101 v9 materialize: the next projected charges this payment books before it is posted.
 entry jsonb;materialize_text text:='';loan_ids text[];materialize_ids text[];projected jsonb;booked text;
 -- R110 v10: the principal entries and the server's own pay-forward plan the command must equal.
 principal_text text:='';principal_loans text[]:=ARRAY[]::text[];forward_loans text[];plan jsonb;purpose jsonb;today date;
 -- R113: the loans the command settles (principal kind settle).
 settle_loans text[]:=ARRAY[]::text[];
 -- JavaScript whitespace, used only for canonical transport validation, not ID normalization.
 ws text:=chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR NOT pg_has_role(session_user,CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END,'MEMBER') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Application session required';END IF;
 IF $1 IS NULL OR octet_length($1)>524288 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid canonical command'; END IF;
 BEGIN
  e:=$1::jsonb;c:=e->'command';a:=e->'actor';r:=e->'receipt';
  IF jsonb_typeof(e)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(e) key)<>ARRAY['actor','command','contractVersion','receipt'] OR e->'contractVersion'<>'1'::jsonb
    OR jsonb_typeof(c)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c) key)<>(CASE WHEN c->'schemaVersion'='6'::jsonb THEN ARRAY['allocations','amountReceived','borrowerId','cashAccountId','notes','paymentDate','paymentMethod','receiptId','requestId','schemaVersion'] WHEN c->'schemaVersion'='7'::jsonb THEN ARRAY['allocations','amountReceived','bankReference','borrowerId','cashAccountId','notes','paymentDate','paymentMethod','receiptId','requestId','schemaVersion','transferTime'] WHEN c->'schemaVersion'='8'::jsonb THEN ARRAY['allocations','amountReceived','bankReference','borrowerId','cashAccountId','notes','payerLines','paymentDate','paymentMethod','receiptId','requestId','schemaVersion','transferTime'] WHEN c->'schemaVersion'='9'::jsonb THEN ARRAY['allocations','amountReceived','bankReference','borrowerId','cashAccountId','materialize','notes','payerLines','paymentDate','paymentMethod','receiptId','requestId','schemaVersion','transferTime'] WHEN c->'schemaVersion' IN ('10'::jsonb,'11'::jsonb) THEN ARRAY['allocations','amountReceived','bankReference','borrowerId','cashAccountId','materialize','notes','payerLines','paymentDate','paymentMethod','principal','receiptId','requestId','schemaVersion','transferTime'] ELSE ARRAY['allocationMethod','amountReceived','borrowerId','cashAccountId','notes','paymentDate','paymentMethod','receiptId','requestId','schemaVersion','selectedChargeIds'] END)
    OR c->'schemaVersion' NOT IN ('3'::jsonb,'4'::jsonb,'5'::jsonb,'6'::jsonb,'7'::jsonb,'8'::jsonb,'9'::jsonb,'10'::jsonb,'11'::jsonb) OR jsonb_typeof(a)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(a) key)<>ARRAY['issuer','loginEmail','partnerId','subject'] THEN RAISE EXCEPTION 'shape'; END IF;
  FOREACH k IN ARRAY ARRAY['requestId','borrowerId','cashAccountId','paymentDate','amountReceived','paymentMethod'] LOOP
   IF jsonb_typeof(c->k)<>'string' THEN RAISE EXCEPTION 'type'; END IF;
  END LOOP;
  IF c->>'requestId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'uuid'; END IF;
  request:=(c->>'requestId')::uuid;
  FOREACH k IN ARRAY ARRAY['borrowerId','cashAccountId'] LOOP
   v:=c->>k;IF octet_length(v) NOT BETWEEN 1 AND 256 OR v<>btrim(v,ws) OR v~E'[\\r\\n]' THEN RAISE EXCEPTION 'id';END IF;
  END LOOP;
  IF c->'schemaVersion' IN ('6'::jsonb,'7'::jsonb,'8'::jsonb,'9'::jsonb,'10'::jsonb,'11'::jsonb) THEN
   IF jsonb_typeof(c->'allocations') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'allocations') NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'plan';END IF;
   ids:=ARRAY[]::text[];plan_text:='';plan_total:=0;
   FOR line IN SELECT value FROM jsonb_array_elements(c->'allocations') LOOP
    IF jsonb_typeof(line) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(line) key) IS DISTINCT FROM (CASE WHEN c->'schemaVersion'='11'::jsonb
     -- R118 v11: the 8-key line with the late charge and its expected remaining.
     THEN ARRAY['chargeDate','chargeId','expectedInterestRemaining','expectedLateChargeRemaining','expectedPrincipalRemaining','interest','lateCharge','principal']
     ELSE ARRAY['chargeDate','chargeId','expectedInterestRemaining','expectedPrincipalRemaining','interest','principal'] END) THEN RAISE EXCEPTION 'line';END IF;
    FOREACH k IN ARRAY ARRAY(SELECT jsonb_object_keys(line)) LOOP
     IF jsonb_typeof(line->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'line type';END IF;
    END LOOP;
    v:=line->>'chargeId';IF octet_length(v) NOT BETWEEN 1 AND 256 OR v LIKE '%,%' OR translate(v,ws,'')<>v THEN RAISE EXCEPTION 'line id';END IF;ids:=array_append(ids,v);
    FOREACH k IN ARRAY ARRAY['principal','interest','expectedPrincipalRemaining','expectedInterestRemaining']||(CASE WHEN line ? 'lateCharge' THEN ARRAY['lateCharge','expectedLateChargeRemaining'] ELSE ARRAY[]::text[] END) LOOP
     IF line->>k !~ '^(0|[1-9][0-9]{0,16})$' OR (line->>k)::numeric>92233720368547758 THEN RAISE EXCEPTION 'component';END IF;
    END LOOP;
    IF (line->>'principal')::numeric+(line->>'interest')::numeric+coalesce(line->>'lateCharge','0')::numeric<=0 OR (line->>'principal')::numeric>(line->>'expectedPrincipalRemaining')::numeric OR (line->>'interest')::numeric>(line->>'expectedInterestRemaining')::numeric
     OR coalesce(line->>'lateCharge','0')::numeric>coalesce(line->>'expectedLateChargeRemaining','0')::numeric THEN RAISE EXCEPTION 'line cap';END IF;
    v:=line->>'chargeDate';IF v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR v<'0001-01-01' OR to_char(v::date,'YYYY-MM-DD')<>v THEN RAISE EXCEPTION 'line day';END IF;
    plan_total:=plan_total+(line->>'principal')::numeric+(line->>'interest')::numeric+coalesce(line->>'lateCharge','0')::numeric;
    line_text:='{"chargeId":'||to_json(line->>'chargeId')::text||',"principal":'||to_json(line->>'principal')::text||',"interest":'||to_json(line->>'interest')::text
     ||CASE WHEN line ? 'lateCharge' THEN ',"lateCharge":'||to_json(line->>'lateCharge')::text ELSE '' END
     ||',"expectedPrincipalRemaining":'||to_json(line->>'expectedPrincipalRemaining')::text||',"expectedInterestRemaining":'||to_json(line->>'expectedInterestRemaining')::text
     ||CASE WHEN line ? 'lateCharge' THEN ',"expectedLateChargeRemaining":'||to_json(line->>'expectedLateChargeRemaining')::text ELSE '' END
     ||',"chargeDate":'||to_json(line->>'chargeDate')::text||'}';
    plan_text:=plan_text||CASE WHEN plan_text='' THEN '' ELSE ',' END||line_text;
   END LOOP;
   SELECT array_agg(x ORDER BY x COLLATE "C") INTO sorted_ids FROM (SELECT DISTINCT unnest(ids) x) q;
   IF ids IS DISTINCT FROM sorted_ids OR cardinality(ids)<>cardinality(sorted_ids) THEN RAISE EXCEPTION 'plan order';END IF;
   IF c->>'amountReceived' !~ '^[1-9][0-9]{0,16}$' OR (c->>'amountReceived')::numeric>92233720368547758 OR (c->>'amountReceived')::numeric<>plan_total OR c->>'paymentMethod' NOT IN ('Bank Transfer','Cash','Net-off at Disbursement') THEN RAISE EXCEPTION 'total';END IF;
   -- R075 v7: optional slip bank reference (normalized) and transfer time (HH:MM), bank transfers only.
   -- R095 v8: v7 plus the optional payer-lines change {before, after}, bank transfers only.
   -- R101 v9: v8 plus materialize, the next projected charges (one per loan) that allocation lines pay.
   -- R110 v10: v8 plus materialize (0 to 200 charges to book, several per loan) and principal (0 to 20 entries).
   IF c->'schemaVersion' IN ('7'::jsonb,'8'::jsonb,'9'::jsonb,'10'::jsonb,'11'::jsonb) THEN
    IF c->'bankReference'<>'null'::jsonb AND (jsonb_typeof(c->'bankReference')<>'string' OR c->>'bankReference' !~ '^[A-Z0-9]{6,100}$') THEN RAISE EXCEPTION 'reference';END IF;
    IF c->'transferTime'<>'null'::jsonb AND (jsonb_typeof(c->'transferTime')<>'string' OR c->>'transferTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN RAISE EXCEPTION 'transfer time';END IF;
    IF c->>'paymentMethod'<>'Bank Transfer' AND (c->'bankReference'<>'null'::jsonb OR c->'transferTime'<>'null'::jsonb) THEN RAISE EXCEPTION 'slip method';END IF;
    slip_text:=',"bankReference":'||CASE WHEN c->'bankReference'='null'::jsonb THEN 'null' ELSE to_json(c->>'bankReference')::text END||',"transferTime":'||CASE WHEN c->'transferTime'='null'::jsonb THEN 'null' ELSE to_json(c->>'transferTime')::text END;
    IF c->'schemaVersion' IN ('8'::jsonb,'9'::jsonb,'10'::jsonb,'11'::jsonb) THEN
     IF c->'payerLines'<>'null'::jsonb THEN
      IF c->>'paymentMethod'<>'Bank Transfer' THEN RAISE EXCEPTION 'payer method';END IF;
      IF jsonb_typeof(c->'payerLines')<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c->'payerLines') key)<>ARRAY['after','before']
       OR jsonb_typeof(c->'payerLines'->'after')<>'string' OR jsonb_typeof(c->'payerLines'->'before') NOT IN ('string','null') THEN RAISE EXCEPTION 'payer lines';END IF;
      payer_before:=c->'payerLines'->>'before';payer_after:=c->'payerLines'->>'after';
      IF octet_length(payer_after) NOT BETWEEN 1 AND 1000 OR payer_after=coalesce(payer_before,'') OR octet_length(coalesce(payer_before,''))>65536 OR NOT payer_after IS NFC NORMALIZED
       OR cardinality(string_to_array(payer_after,E'\n')) NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'payer lines';END IF;
      -- Each line is in payer_name.display form: no control, zero-width or non-space whitespace, single spaces, trimmed, 1..200 bytes.
      IF EXISTS(SELECT 1 FROM unnest(string_to_array(payer_after,E'\n')) payer_line WHERE octet_length(payer_line) NOT BETWEEN 1 AND 200 OR payer_line<>btrim(payer_line,' ')
       OR position('  ' IN payer_line)>0 OR payer_line~'[\x01-\x1f\x7f-\x9f\u00a0\u1680\u2000-\u200d\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]') THEN RAISE EXCEPTION 'payer lines';END IF;
     END IF;
     slip_text:=slip_text||',"payerLines":'||CASE WHEN payer_after IS NULL THEN 'null' ELSE '{"before":'||coalesce(to_json(payer_before)::text,'null')||',"after":'||to_json(payer_after)::text||'}' END;
    END IF;
    -- R101 v9: each entry {loanId, chargeId, chargeDate, principalDue, interestDue} names the generator key of the loan's next
    -- charge (cg8:<len>:<loan>:<date>) and is paid by exactly one allocation line expecting the whole projected charge.
    IF c->'schemaVersion' IN ('9'::jsonb,'10'::jsonb,'11'::jsonb) THEN
     IF jsonb_typeof(c->'materialize') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'materialize') NOT BETWEEN (CASE WHEN c->'schemaVersion'='9'::jsonb THEN 1 ELSE 0 END) AND (CASE WHEN c->'schemaVersion'='9'::jsonb THEN 100 ELSE 200 END) THEN RAISE EXCEPTION 'materialize';END IF;
     loan_ids:=ARRAY[]::text[];materialize_ids:=ARRAY[]::text[];
     FOR entry IN SELECT value FROM jsonb_array_elements(c->'materialize') LOOP
      IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(entry) key) IS DISTINCT FROM ARRAY['chargeDate','chargeId','interestDue','loanId','principalDue'] THEN RAISE EXCEPTION 'materialize entry';END IF;
      FOREACH k IN ARRAY ARRAY['loanId','chargeId','chargeDate','principalDue','interestDue'] LOOP
       IF jsonb_typeof(entry->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'materialize type';END IF;
      END LOOP;
      v:=entry->>'loanId';IF octet_length(v) NOT BETWEEN 1 AND 256 OR v<>btrim(v,ws) OR v~E'[\\r\\n]' THEN RAISE EXCEPTION 'materialize loan';END IF;
      v:=entry->>'chargeDate';IF v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR v<'0001-01-01' OR to_char(v::date,'YYYY-MM-DD')<>v THEN RAISE EXCEPTION 'materialize day';END IF;
      IF entry->>'chargeId' IS DISTINCT FROM 'cg8:'||length(entry->>'loanId')||':'||(entry->>'loanId')||':'||(entry->>'chargeDate') THEN RAISE EXCEPTION 'materialize key';END IF;
      FOREACH k IN ARRAY ARRAY['principalDue','interestDue'] LOOP
       IF entry->>k !~ '^(0|[1-9][0-9]{0,16})$' OR (entry->>k)::numeric>92233720368547758 THEN RAISE EXCEPTION 'materialize component';END IF;
      END LOOP;
      IF (entry->>'principalDue')::numeric+(entry->>'interestDue')::numeric<=0 THEN RAISE EXCEPTION 'materialize amount';END IF;
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c->'allocations') lines(item) WHERE item->>'chargeId'=entry->>'chargeId' AND item->>'chargeDate'=entry->>'chargeDate'
        AND item->>'expectedPrincipalRemaining'=entry->>'principalDue' AND item->>'expectedInterestRemaining'=entry->>'interestDue') THEN RAISE EXCEPTION 'materialize line';END IF;
      loan_ids:=array_append(loan_ids,entry->>'loanId');materialize_ids:=array_append(materialize_ids,entry->>'chargeId');
      materialize_text:=materialize_text||CASE WHEN materialize_text='' THEN '' ELSE ',' END||'{"loanId":'||to_json(entry->>'loanId')::text||',"chargeId":'||to_json(entry->>'chargeId')::text
       ||',"chargeDate":'||to_json(entry->>'chargeDate')::text||',"principalDue":'||to_json(entry->>'principalDue')::text||',"interestDue":'||to_json(entry->>'interestDue')::text||'}';
     END LOOP;
     SELECT array_agg(x ORDER BY x COLLATE "C") INTO sorted_ids FROM (SELECT DISTINCT unnest(materialize_ids) x) q;
     -- v9: one entry per loan; v10: several per loan (each chargeId once, so a loan's dates stay in order).
     IF materialize_ids IS DISTINCT FROM coalesce(sorted_ids,ARRAY[]::text[]) OR cardinality(materialize_ids)<>cardinality(coalesce(sorted_ids,ARRAY[]::text[]))
      OR (c->'schemaVersion'='9'::jsonb AND (SELECT count(DISTINCT x) FROM unnest(loan_ids) x)<>cardinality(loan_ids)) THEN RAISE EXCEPTION 'materialize order';END IF;
     slip_text:=slip_text||',"materialize":['||materialize_text||']';
    END IF;
    -- R110 v10: each principal entry {loanId, kind, chargeId, chargeDate, amount, accruedInterest, principalDue} raises
    -- today's charge (raise) or books today's charge pf121:<len>:<loan>:<date> with the accrued interest (book); one per
    -- loan, ordered by loanId, each paid by an allocation line. At least one materialize or principal entry.
    IF c->'schemaVersion' IN ('10'::jsonb,'11'::jsonb) THEN
     IF jsonb_typeof(c->'principal') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'principal')>20
      OR (c->'schemaVersion'='10'::jsonb AND jsonb_array_length(c->'principal')+jsonb_array_length(c->'materialize')=0) THEN RAISE EXCEPTION 'principal';END IF;
     FOR entry IN SELECT value FROM jsonb_array_elements(c->'principal') LOOP
      IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(entry) key) IS DISTINCT FROM ARRAY['accruedInterest','amount','chargeDate','chargeId','kind','loanId','principalDue'] THEN RAISE EXCEPTION 'principal entry';END IF;
      FOREACH k IN ARRAY ARRAY['loanId','kind','chargeId','chargeDate','amount','accruedInterest','principalDue'] LOOP
       IF jsonb_typeof(entry->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'principal type';END IF;
      END LOOP;
      v:=entry->>'loanId';IF octet_length(v) NOT BETWEEN 1 AND 256 OR v<>btrim(v,ws) OR v~E'[\\r\\n]' THEN RAISE EXCEPTION 'principal loan';END IF;
      v:=entry->>'chargeId';IF octet_length(v) NOT BETWEEN 1 AND 256 OR v LIKE '%,%' OR translate(v,ws,'')<>v THEN RAISE EXCEPTION 'principal charge';END IF;
      v:=entry->>'chargeDate';IF v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR v<'0001-01-01' OR to_char(v::date,'YYYY-MM-DD')<>v THEN RAISE EXCEPTION 'principal day';END IF;
      FOREACH k IN ARRAY ARRAY['amount','accruedInterest','principalDue'] LOOP
       IF entry->>k !~ '^(0|[1-9][0-9]{0,16})$' OR (entry->>k)::numeric>92233720368547758 THEN RAISE EXCEPTION 'principal component';END IF;
      END LOOP;
      IF (entry->>'amount')::numeric<=0 OR entry->>'kind' NOT IN ('raise','book','settle')
       OR (entry->>'kind'='book' AND (entry->>'chargeId' IS DISTINCT FROM 'pf121:'||length(entry->>'loanId')||':'||(entry->>'loanId')||':'||(entry->>'chargeDate') OR entry->>'principalDue'<>entry->>'amount'))
       OR (entry->>'kind'='raise' AND (entry->>'accruedInterest'<>'0' OR (entry->>'principalDue')::numeric<(entry->>'amount')::numeric)) THEN RAISE EXCEPTION 'principal kind';END IF;
      -- R113: settle {chargeId: the quote's target charge, amount: payoff remainder, accruedInterest: gap interest, principalDue:
      -- the outstanding principal}; its lines are the quote's, so no single line carries the amount.
      IF entry->>'kind'<>'settle' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c->'allocations') lines(item) WHERE item->>'chargeId'=entry->>'chargeId' AND item->>'chargeDate'=entry->>'chargeDate'
        AND (item->>'principal')::numeric>=(entry->>'amount')::numeric) THEN RAISE EXCEPTION 'principal line';END IF;
      IF entry->>'kind'='settle' THEN settle_loans:=array_append(settle_loans,entry->>'loanId');END IF;
      principal_loans:=array_append(principal_loans,entry->>'loanId');
      principal_text:=principal_text||CASE WHEN principal_text='' THEN '' ELSE ',' END||'{"loanId":'||to_json(entry->>'loanId')::text||',"kind":'||to_json(entry->>'kind')::text
       ||',"chargeId":'||to_json(entry->>'chargeId')::text||',"chargeDate":'||to_json(entry->>'chargeDate')::text||',"amount":'||to_json(entry->>'amount')::text
       ||',"accruedInterest":'||to_json(entry->>'accruedInterest')::text||',"principalDue":'||to_json(entry->>'principalDue')::text||'}';
     END LOOP;
     SELECT array_agg(x ORDER BY x COLLATE "C") INTO sorted_ids FROM (SELECT DISTINCT unnest(principal_loans) x) q;
     IF principal_loans IS DISTINCT FROM coalesce(sorted_ids,ARRAY[]::text[]) THEN RAISE EXCEPTION 'principal order';END IF;
     -- The plan is the business day's: a command that books or raises charges is dated today (an invalid command otherwise).
     IF jsonb_array_length(c->'principal')+jsonb_array_length(c->'materialize')>0
      AND c->>'paymentDate' IS DISTINCT FROM to_char((transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date,'YYYY-MM-DD') THEN RAISE EXCEPTION 'pay forward day';END IF;
     slip_text:=slip_text||',"principal":['||principal_text||']';
    END IF;
   END IF;
  ELSE
  IF jsonb_typeof(c->'selectedChargeIds')<>'array' OR jsonb_array_length(c->'selectedChargeIds') NOT BETWEEN 1 AND (CASE WHEN c->'schemaVersion' IN ('4'::jsonb,'5'::jsonb) THEN 10000 ELSE 100 END) THEN RAISE EXCEPTION 'selection';END IF;
  ids:=ARRAY[]::text[];
  FOR r IN SELECT value FROM jsonb_array_elements(c->'selectedChargeIds') LOOP
   IF jsonb_typeof(r)<>'string' THEN RAISE EXCEPTION 'selection type';END IF;
   v:=r#>>'{}';IF octet_length(v) NOT BETWEEN 1 AND 256 OR v LIKE '%,%' OR translate(v,ws,'')<>v THEN RAISE EXCEPTION 'selection id';END IF;
   ids:=array_append(ids,v);
  END LOOP;
  r:=e->'receipt';
  SELECT array_agg(x ORDER BY x COLLATE "C") INTO sorted_ids FROM (SELECT DISTINCT unnest(ids) x) q;
  IF cardinality(sorted_ids)<>cardinality(ids) OR sorted_ids<>ids THEN RAISE EXCEPTION 'selection order';END IF;
  SELECT string_agg(to_json(x)::text,',' ORDER BY x COLLATE "C") INTO selection_text FROM unnest(ids) x;
  IF c->>'amountReceived' !~ '^[1-9][0-9]{0,16}$' OR (c->>'amountReceived')::numeric>92233720368547758 OR (c->>'paymentMethod' NOT IN ('Bank Transfer','Cash','Net-off at Disbursement') OR (c->'schemaVersion'<>'5'::jsonb AND c->>'paymentMethod'<>'Bank Transfer')) OR (c->>'allocationMethod' NOT IN ('Selected Charges','Single Full','Receive All') OR (c->'schemaVersion'='3'::jsonb AND c->>'allocationMethod'<>'Selected Charges') OR (c->>'allocationMethod'='Single Full' AND cardinality(ids)<>1)) THEN RAISE EXCEPTION 'amount or method';END IF;
  END IF;
  r:=e->'receipt';
  v:=c->>'paymentDate';IF v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR v<'0001-01-01' THEN RAISE EXCEPTION 'date';END IF;
  day:=v::date;IF to_char(day,'YYYY-MM-DD')<>v THEN RAISE EXCEPTION 'date';END IF;
  IF c->'notes'='null'::jsonb THEN notes_text:='null';
  ELSIF jsonb_typeof(c->'notes')='string' AND octet_length(c->>'notes') BETWEEN 1 AND 65536 THEN notes_text:=to_json(c->>'notes')::text;
  ELSE RAISE EXCEPTION 'notes';END IF;
  FOREACH k IN ARRAY ARRAY['issuer','subject','partnerId','loginEmail'] LOOP
   IF jsonb_typeof(a->k)<>'string' THEN RAISE EXCEPTION 'actor type';END IF;
   v:=a->>k;IF btrim(v,ws)='' OR v~E'[\\r\\n]' OR octet_length(v)>(CASE k WHEN 'issuer' THEN 1024 WHEN 'subject' THEN 128 WHEN 'partnerId' THEN 256 ELSE 320 END) THEN RAISE EXCEPTION 'actor';END IF;
  END LOOP;
  IF a->>'partnerId'<>btrim(a->>'partnerId',ws) OR a->>'loginEmail'<>lower(btrim(a->>'loginEmail',ws)) THEN RAISE EXCEPTION 'actor normalization';END IF;
  IF r='null'::jsonb THEN
   IF c->'receiptId'<>'null'::jsonb THEN RAISE EXCEPTION 'receipt binding';END IF;receipt_text:='null';receipt_id:='null';
  ELSE
   IF jsonb_typeof(r)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(r) key)<>ARRAY['mimeType','receiptId','sha256','sizeBytes','storageReference'] THEN RAISE EXCEPTION 'receipt shape';END IF;
   FOREACH k IN ARRAY ARRAY['receiptId','sha256','mimeType','storageReference'] LOOP IF jsonb_typeof(r->k)<>'string' THEN RAISE EXCEPTION 'receipt type';END IF;END LOOP;
   IF r->>'receiptId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR c->'receiptId'<>r->'receiptId' OR r->>'sha256' !~ '^[0-9a-f]{64}$' OR r->>'mimeType' NOT IN ('image/png','image/jpeg') OR jsonb_typeof(r->'sizeBytes')<>'number' OR r->>'sizeBytes' !~ '^[1-9][0-9]*$' OR (r->>'sizeBytes')::numeric>5242880 OR octet_length(r->>'storageReference') NOT BETWEEN 1 AND 2048 OR btrim(r->>'storageReference',ws)='' OR r->>'storageReference'~E'[\\r\\n]' THEN RAISE EXCEPTION 'receipt';END IF;
   receipt_id:=to_json(r->>'receiptId')::text;
   receipt_text:='{"receiptId":'||receipt_id||',"sha256":'||to_json(r->>'sha256')::text||',"mimeType":'||to_json(r->>'mimeType')::text||',"sizeBytes":'||(r->>'sizeBytes')||',"storageReference":'||to_json(r->>'storageReference')::text||'}';
  END IF;
  IF c->'schemaVersion' IN ('6'::jsonb,'7'::jsonb,'8'::jsonb,'9'::jsonb,'10'::jsonb,'11'::jsonb) THEN
   command_text:='{"schemaVersion":'||(c->>'schemaVersion')||',"requestId":'||to_json(c->>'requestId')::text||',"borrowerId":'||to_json(c->>'borrowerId')::text||',"allocations":['||plan_text||'],"cashAccountId":'||to_json(c->>'cashAccountId')::text||',"paymentDate":'||to_json(c->>'paymentDate')::text||',"amountReceived":'||to_json(c->>'amountReceived')::text||',"paymentMethod":'||to_json(c->>'paymentMethod')::text||',"notes":'||notes_text||',"receiptId":'||receipt_id||slip_text||'}';
  ELSE
  command_text:='{"schemaVersion":'||(c->>'schemaVersion')||',"requestId":'||to_json(c->>'requestId')::text||',"borrowerId":'||to_json(c->>'borrowerId')::text||',"selectedChargeIds":['||selection_text||'],"cashAccountId":'||to_json(c->>'cashAccountId')::text||',"paymentDate":'||to_json(c->>'paymentDate')::text||',"amountReceived":'||to_json(c->>'amountReceived')::text||',"paymentMethod":'||to_json(c->>'paymentMethod')::text||',"allocationMethod":'||to_json(c->>'allocationMethod')::text||',"notes":'||notes_text||',"receiptId":'||receipt_id||'}';
  END IF;
  actor_text:='{"issuer":'||to_json(a->>'issuer')::text||',"subject":'||to_json(a->>'subject')::text||',"partnerId":'||to_json(a->>'partnerId')::text||',"loginEmail":'||to_json(a->>'loginEmail')::text||'}';
  canonical:='{"contractVersion":1,"command":'||command_text||',"actor":'||actor_text||',"receipt":'||receipt_text||'}';
  IF canonical IS DISTINCT FROM $1 THEN RAISE EXCEPTION 'noncanonical';END IF;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid canonical command';
 END;
 hash:=encode(sha256(convert_to(canonical,'UTF8')),'hex');
 SELECT count(*) INTO matches FROM public."Partners" WHERE lower(btrim("Login Email"))=a->>'loginEmail';
 IF matches<>1 OR NOT EXISTS(SELECT 1 FROM public."Partners" WHERE "Row ID"=a->>'partnerId' AND lower(btrim("Login Email"))=a->>'loginEmail') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current actor mapping required';END IF;
 PERFORM pg_advisory_xact_lock(1347895619,hashtext(request::text));
 SELECT * INTO prior FROM public.pwa_payment_commands p WHERE p.request_id=request;
 IF FOUND THEN
  IF prior.canonical_json<>canonical OR prior.payload_sha256<>hash THEN RETURN jsonb_build_object('kind','conflict');END IF;
  RETURN public.pwa_command_status_v1(request,a->>'issuer',a->>'subject');
 END IF;
 payment_key:='pwa:'||request::text;
 BEGIN
  -- v7 to v10 follow the slip date: today or yesterday in Bangkok, as the agent receipt command; v3-v6 stay today-only.
  IF day<>(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AND NOT (c->'schemaVersion' IN ('7'::jsonb,'8'::jsonb,'9'::jsonb,'10'::jsonb,'11'::jsonb) AND day=(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date-1) THEN RAISE EXCEPTION USING ERRCODE='P4C01';END IF;
  PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=c->>'borrowerId' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4C02';END IF;
  IF NOT EXISTS(SELECT 1 FROM public."Cash Accounts" ca JOIN public."Cash Holders" ch ON ch."Row ID"=ca."Ref Cash Holder" WHERE ca."Row ID"=c->>'cashAccountId' AND ca."Active" AND ch."Active") THEN RAISE EXCEPTION USING ERRCODE='P4C03';END IF;
  PERFORM public.cash_account_holder(c->>'cashAccountId',true);
  IF c->>'allocationMethod'='Receive All' THEN
   -- Match the engine's borrower -> loans -> charges lock order. Revalidate the
   -- reviewed complete due set before inserting the governed Processing receipt.
   PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers"=c->>'borrowerId' ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
   PERFORM 1 FROM public."Charges" ch JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans"
    WHERE l."Ref Borrowers"=c->>'borrowerId' ORDER BY ch."Row ID" COLLATE "C" FOR UPDATE OF ch;
   SELECT array_agg(ch."Row ID" ORDER BY ch."Row ID" COLLATE "C"),sum(ch."Amount Remaining") INTO current_ids,current_amount
    FROM public."Charges" ch JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans"
    WHERE l."Ref Borrowers"=c->>'borrowerId' AND ch."Charge Date"<=day AND ch."Amount Remaining">0;
   IF current_ids IS DISTINCT FROM ids OR current_amount IS DISTINCT FROM (c->>'amountReceived')::numeric THEN
    RAISE EXCEPTION USING ERRCODE='P4C04';
   END IF;
  END IF;
  IF c->'schemaVersion' IN ('6'::jsonb,'7'::jsonb,'8'::jsonb,'9'::jsonb,'10'::jsonb,'11'::jsonb) THEN
   PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers"=c->>'borrowerId' ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
   PERFORM 1 FROM public."Charges" ch JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans" WHERE l."Ref Borrowers"=c->>'borrowerId' ORDER BY ch."Row ID" COLLATE "C" FOR UPDATE OF ch;
   -- R101 v9: under these locks, book each entry only while it is still that loan's next projected charge with the reviewed
   -- amounts, through the generator (same key, so the schedule never duplicates it). Drift or a refused generation rejects the
   -- command as selection_unavailable and this sub-block rolls every booked charge back.
   IF c->'schemaVersion'='9'::jsonb THEN
    SELECT jsonb_object_agg(p.loan_id,jsonb_build_object('chargeId',p.charge_id,'chargeDate',to_char(p.charge_date,'YYYY-MM-DD'),'principalDue',p.principal_due,'interestDue',p.interest_due)) INTO projected
     FROM public.pwa_next_projected_charge_v1(c->>'borrowerId',(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date) p;
    FOR entry IN SELECT value FROM jsonb_array_elements(c->'materialize') LOOP
     IF (entry->>'chargeDate')::date<=(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date OR projected->(entry->>'loanId') IS NULL OR projected->(entry->>'loanId')->>'chargeId' IS DISTINCT FROM entry->>'chargeId' OR projected->(entry->>'loanId')->>'chargeDate' IS DISTINCT FROM entry->>'chargeDate'
      OR (projected->(entry->>'loanId')->>'principalDue')::numeric IS DISTINCT FROM (entry->>'principalDue')::numeric OR (projected->(entry->>'loanId')->>'interestDue')::numeric IS DISTINCT FROM (entry->>'interestDue')::numeric THEN
      RAISE EXCEPTION USING ERRCODE='P4C05';
     END IF;
     BEGIN
      booked:=public.generate_loan_charge(entry->>'loanId',(entry->>'chargeDate')::date);
     EXCEPTION WHEN SQLSTATE 'P0001' THEN RAISE EXCEPTION USING ERRCODE='P4C05';
     END;
     IF booked IS DISTINCT FROM entry->>'chargeId' OR NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Row ID"=booked AND "Ref Loans"=entry->>'loanId' AND "Charge Date"=(entry->>'chargeDate')::date
       AND "Principal Due"::numeric=(entry->>'principalDue')::numeric AND "Interest Due"::numeric=(entry->>'interestDue')::numeric) THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
    END LOOP;
   END IF;
   -- R110 v10: under the same locks the server recomputes the pay-forward plan for this borrower, amount and business day
   -- with the purpose the command carries (principal entries; forward for the loans of the lines dated after today) and
   -- requires the allocations, materialize and principal entries to equal it exactly, with nothing uncovered and no loan
   -- settled; drift is selection_unavailable (P4C05) and this sub-block rolls every change back. Then, in date order per
   -- loan: today's charge is raised or booked (the accrued interest is the generator's arithmetic), the loan's Interest
   -- Schedule Anchor Date becomes today, and the forward charges are booked through generate_loan_charge.
   -- R118 v11: the plan is recomputed only when the command books or raises charges.
   IF c->'schemaVersion'='10'::jsonb OR (c->'schemaVersion'='11'::jsonb AND jsonb_array_length(c->'principal')+jsonb_array_length(c->'materialize')>0) THEN
    today:=(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date;
    SELECT array_agg(x ORDER BY x COLLATE "C") INTO forward_loans FROM (SELECT DISTINCT coalesce(m.item->>'loanId',ch."Ref Loans") x
     FROM jsonb_array_elements(c->'allocations') a(item) LEFT JOIN jsonb_array_elements(c->'materialize') m(item) ON m.item->>'chargeId'=a.item->>'chargeId'
     LEFT JOIN public."Charges" ch ON ch."Row ID"=a.item->>'chargeId' WHERE (a.item->>'chargeDate')::date>today) q
     WHERE x IS NULL OR x<>ALL(settle_loans); -- R113: a settled loan's later charges are its quote's lines, not pay forward.
    IF array_position(forward_loans,NULL) IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
    purpose:=jsonb_build_object('forward',forward_loans IS NOT NULL,'loans',coalesce(to_jsonb(forward_loans),'null'::jsonb),
     'principal',(SELECT coalesce(jsonb_agg(jsonb_build_object('loanId',x->>'loanId','amount',x->>'amount') ORDER BY x->>'loanId' COLLATE "C"),'[]'::jsonb) FROM jsonb_array_elements(c->'principal') x));
    plan:=public.pwa_pay_forward_plan_v1(c->>'borrowerId',(c->>'amountReceived')::numeric,today,purpose);
    IF (CASE WHEN c->'schemaVersion'='10'::jsonb THEN (SELECT coalesce(jsonb_agg(pl.v-ARRAY['lateCharge','expectedLateChargeRemaining'] ORDER BY pl.o),'[]'::jsonb) FROM jsonb_array_elements(plan->'allocations') WITH ORDINALITY pl(v,o)) ELSE plan->'allocations' END) IS DISTINCT FROM c->'allocations'
     OR (c->'schemaVersion'='10'::jsonb AND EXISTS(SELECT 1 FROM jsonb_array_elements(plan->'allocations') pl(v) WHERE pl.v->>'lateCharge'<>'0'))
     OR plan->'materialize' IS DISTINCT FROM c->'materialize' OR plan->>'uncovered' IS DISTINCT FROM '0'
     OR (SELECT coalesce(jsonb_agg(jsonb_build_object('loanId',x->'loanId','kind',x->'kind','chargeId',x->'chargeId','chargeDate',x->'chargeDate','amount',x->'amount','accruedInterest',x->'accruedInterest','principalDue',x->'principalDue') ORDER BY x->>'loanId' COLLATE "C"),'[]'::jsonb)
      FROM jsonb_array_elements(plan->'principal') x) IS DISTINCT FROM c->'principal' THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
    -- R111: the booking is the shared writer pwa_apply_pay_forward_v1 (same statements, same P4C05 rejections).
    -- R113: the plan's own entries (a settle entry carries its planHash); settling is switched on for this call only.
    PERFORM set_config('pwa.pay_forward_settle','on',true);
    PERFORM public.pwa_apply_pay_forward_v1(plan->'principal',c->'materialize',today);
    PERFORM set_config('pwa.pay_forward_settle','',true);
   END IF;
   IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(c->'allocations') AS entries(item)
    LEFT JOIN public."Charges" ch ON ch."Row ID"=entries.item->>'chargeId'
    LEFT JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans"
    LEFT JOIN (SELECT "Ref Charges" charge,sum("Principal Paid"::numeric) principal,sum("Interest Paid"::numeric) interest,sum("Late Charge Paid"::numeric) late,count(*) FILTER(WHERE "Principal Paid" IS NULL OR "Interest Paid" IS NULL) invalid FROM public."Repayments" WHERE "Ref Charges"=ANY(ids) GROUP BY "Ref Charges") paid ON paid.charge=ch."Row ID"
    WHERE l."Ref Borrowers" IS DISTINCT FROM c->>'borrowerId' OR coalesce(paid.invalid,0)>0
     OR ch."Principal Due"::numeric-coalesce(paid.principal,0) IS DISTINCT FROM (entries.item->>'expectedPrincipalRemaining')::numeric
     OR ch."Interest Due"::numeric-coalesce(paid.interest,0) IS DISTINCT FROM (entries.item->>'expectedInterestRemaining')::numeric
     OR ch."Charge Date" IS DISTINCT FROM (entries.item->>'chargeDate')::date
     OR (entries.item ? 'expectedLateChargeRemaining' AND ch."Late Charge Due"::numeric-coalesce(paid.late,0) IS DISTINCT FROM (entries.item->>'expectedLateChargeRemaining')::numeric)
   ) THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
   INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code)
   VALUES(request,1,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',canonical,hash,'posted',payment_key,NULL);
  END IF;
  SET CONSTRAINTS public.referral_loan_closed DEFERRED; -- R111 V124: fired below, once the payment is Posted.
  INSERT INTO public."Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Payment Method","Allocation Method","Selected Charge IDs","Ref Target Charge","Created By","Notes","Uploaded Receipt","Bank Reference","Created At")
   VALUES(payment_key,c->>'borrowerId',c->>'cashAccountId','Processing',(c->>'amountReceived')::numeric::money,day,c->>'paymentMethod',CASE WHEN c->'schemaVersion' IN ('6'::jsonb,'7'::jsonb,'8'::jsonb,'9'::jsonb,'10'::jsonb,'11'::jsonb) THEN 'Selected Charges' ELSE c->>'allocationMethod' END,CASE WHEN c->'schemaVersion' IN ('6'::jsonb,'7'::jsonb,'8'::jsonb,'9'::jsonb,'10'::jsonb,'11'::jsonb) OR c->>'allocationMethod'='Selected Charges' THEN array_to_string(ids,' , ') END,CASE WHEN c->>'allocationMethod'='Single Full' THEN ids[1] END,a->>'loginEmail',c->>'notes',r->>'storageReference',
    CASE WHEN c->'schemaVersion' IN ('7'::jsonb,'8'::jsonb,'9'::jsonb,'10'::jsonb,'11'::jsonb) THEN c->>'bankReference' END,
    -- Slip date and transfer time become Created At, as the agent receipt command writes it.
    CASE WHEN c->'schemaVersion' IN ('7'::jsonb,'8'::jsonb,'9'::jsonb,'10'::jsonb,'11'::jsonb) AND c->>'transferTime' IS NOT NULL THEN ((c->>'paymentDate')||' '||(c->>'transferTime')||':00')::timestamp END);
  SELECT "Status","Amount Received"::numeric INTO posted_status,posted_amount FROM public."Payments" WHERE "Row ID"=payment_key;
  IF posted_status IS DISTINCT FROM 'Posted' OR posted_amount IS DISTINCT FROM (c->>'amountReceived')::numeric THEN RAISE EXCEPTION USING ERRCODE='XX000',MESSAGE='Unexpected posting result';END IF;
  -- R111 V124: a referred loan this payment closed gets its rebate (and default offset) now, inside this command.
  SET CONSTRAINTS public.referral_loan_closed IMMEDIATE;
  SET CONSTRAINTS public.referral_loan_closed DEFERRED;
  -- R110 v10: run the existing loan refresh now (the deferred repayment trigger runs it again at commit as a no-op), so the
  -- calculation trigger recomputes Current Daily Interest from the frozen rate; it must equal the plan's new daily amount
  -- that priced the booked forward charges.
  IF c->'schemaVersion' IN ('10'::jsonb,'11'::jsonb) THEN
   FOR entry IN SELECT value FROM jsonb_array_elements(plan->'principal') WHERE value->>'kind'<>'settle' LOOP
    PERFORM public.vc_refresh_loan(entry->>'loanId');
    IF (SELECT "Current Daily Interest"::numeric FROM public."Loans" WHERE "Row ID"=entry->>'loanId') IS DISTINCT FROM (entry->>'dailyAfter')::numeric THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
   END LOOP;
   -- R113: the payment closed every loan it settles (close_payment_loans, unchanged), else nothing posts.
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(plan->'principal') e JOIN public."Loans" x ON x."Row ID"=e.value->>'loanId'
     WHERE e.value->>'kind'='settle' AND x."Loan Status" IS DISTINCT FROM 'ปิดยอดแล้ว') THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
  END IF;
  -- R095 v8: learn the payer lines (row locked above) only while the column still equals what the form read; drift skips it.
  IF payer_after IS NOT NULL THEN
   UPDATE public."Borrowers" SET "Communication Name"=payer_after WHERE "Row ID"=c->>'borrowerId' AND coalesce("Communication Name",'') IS NOT DISTINCT FROM coalesce(payer_before,'');
  END IF;
 EXCEPTION
  WHEN SQLSTATE 'P4C01' THEN outcome_value:='rejected';rejection:='invalid_date';
  WHEN SQLSTATE 'P4C02' THEN outcome_value:='rejected';rejection:='borrower_unavailable';
  WHEN SQLSTATE 'P4C03' THEN outcome_value:='rejected';rejection:='account_unavailable';
  WHEN SQLSTATE 'P4C05' THEN outcome_value:='rejected';rejection:='selection_unavailable';
  WHEN SQLSTATE 'P4C04' THEN outcome_value:='rejected';rejection:='selection_unavailable';
 END;
 IF c->'schemaVersion' NOT IN ('6'::jsonb,'7'::jsonb,'8'::jsonb,'9'::jsonb,'10'::jsonb,'11'::jsonb) OR outcome_value='rejected' THEN
 INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code)
 VALUES(request,1,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',canonical,hash,outcome_value,CASE WHEN outcome_value='posted' THEN payment_key ELSE NULL END,rejection);
 END IF;
 RETURN public.pwa_command_status_v1(request,a->>'issuer',a->>'subject');
END $_$;


--
-- Name: pwa_track_row_change(); Type: FUNCTION
--

CREATE FUNCTION public.pwa_track_row_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE old_key text; new_key text;
BEGIN
 IF TG_WHEN<>'AFTER' OR TG_NARGS<>1 OR TG_TABLE_SCHEMA<>'public' OR (TG_LEVEL='STATEMENT')<>(TG_OP='TRUNCATE') THEN
  RAISE EXCEPTION 'pwa_track_row_change requires a public AFTER ROW (or AFTER TRUNCATE statement) trigger with one key column'; END IF;
 IF TG_OP='TRUNCATE' THEN INSERT INTO public.pwa_row_changes(table_name,row_key) VALUES(TG_TABLE_NAME,'*'); RETURN NULL; END IF;
 IF TG_OP='UPDATE' AND to_jsonb(NEW)=to_jsonb(OLD) THEN RETURN NULL; END IF;
 IF TG_OP<>'INSERT' THEN old_key:=to_jsonb(OLD)->>TG_ARGV[0]; END IF;
 IF TG_OP<>'DELETE' THEN new_key:=to_jsonb(NEW)->>TG_ARGV[0]; END IF;
 IF old_key IS NOT NULL AND old_key IS DISTINCT FROM new_key THEN INSERT INTO public.pwa_row_changes(table_name,row_key) VALUES(TG_TABLE_NAME,old_key); END IF;
 IF new_key IS NOT NULL THEN INSERT INTO public.pwa_row_changes(table_name,row_key) VALUES(TG_TABLE_NAME,new_key); END IF;
 RETURN NULL;
END $$;


--
-- Name: pwa_worker_guard_v1(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_worker_guard_v1(capability text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE suffix text; expected_owner text; expected_capability text;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR capability NOT IN ('api','dispatch','jobs') OR capability IS NULL THEN RAISE EXCEPTION 'access_denied'; END IF;
 suffix:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 expected_owner:=CASE capability WHEN 'jobs' THEN 'mw_jobs_owner_' ELSE 'mw_notify_owner_' END||suffix;
 expected_capability:=CASE capability WHEN 'jobs' THEN 'mw_jobs_' ELSE 'mw_notify_'||capability||'_' END||suffix;
 IF current_user<>expected_owner OR NOT pg_has_role(session_user,expected_capability,'USAGE') OR pg_has_role(session_user,expected_owner,'MEMBER') THEN RAISE EXCEPTION 'access_denied'; END IF;
END $$;


--
-- Name: FUNCTION pwa_worker_guard_v1(capability text); Type: COMMENT
--

COMMENT ON FUNCTION public.pwa_worker_guard_v1(capability text) IS 'mw-access:governance fixed notification boundary; explicit capability only';


--
-- Name: quick_payment_request(); Type: FUNCTION
--

CREATE FUNCTION public.quick_payment_request() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
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
 -- Preserve idempotency for commands already posted under V23.
 IF EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"='r008:'||md5(TG_TABLE_NAME||'|'||length(NEW."Row ID")||':'||NEW."Row ID"||'|'||token) AND "Status"='Posted') THEN RETURN NULL; END IF;
 payment_id:='r008:'||TG_TABLE_NAME||'|'||length(NEW."Row ID")||':'||NEW."Row ID"||'|'||token;
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
  SELECT sum(c."Principal Due"::numeric+c."Interest Due"::numeric+c."Late Charge Due"::numeric-coalesce(r.paid,0)) INTO amount -- R118
  FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
  LEFT JOIN LATERAL (SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric+"Late Charge Paid"::numeric) paid FROM public."Repayments" WHERE "Ref Charges"=c."Row ID") r ON true
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
END $_$;


--
-- Name: r051_attribute_historical_ledger(); Type: FUNCTION
--

CREATE FUNCTION public.r051_attribute_historical_ledger() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: r051_flush_parents(text); Type: FUNCTION
--

CREATE FUNCTION public.r051_flush_parents(kind text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE dirty jsonb:=coalesce(nullif(current_setting('r051_dirty.'||kind,true),'')::jsonb,'{}'::jsonb); k text;
BEGIN
 IF dirty='{}'::jsonb THEN RETURN; END IF;
 PERFORM set_config('r051_dirty.'||kind,'',true);
 FOR k IN SELECT jsonb_object_keys(dirty) ORDER BY 1 LOOP
  CASE kind
   WHEN 'charge' THEN PERFORM public.vc_refresh_charge(k);
   WHEN 'loan' THEN PERFORM public.vc_refresh_loan(k);
   WHEN 'payment' THEN PERFORM public.vc_refresh_payment(k);
   WHEN 'borrower' THEN PERFORM public.vc_refresh_borrower(k);
   ELSE RAISE EXCEPTION 'Unknown parent refresh kind';
  END CASE;
 END LOOP;
END $$;


--
-- Name: r051_historical_account(text, text); Type: FUNCTION
--

CREATE FUNCTION public.r051_historical_account(account_id text, holder_id text) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE result text; n integer;
BEGIN
 IF account_id IS NOT NULL THEN RETURN account_id; END IF;
 -- Owner's explicit missing-attribution rule is Lisa. Preserve known holders.
 SELECT count(*),min("Row ID") INTO n,result FROM public."Cash Accounts"
 WHERE "Ref Cash Holder"=coalesce(holder_id,'ch:lisa') AND "Default Account";
 IF n<>1 THEN RAISE EXCEPTION 'Historical correction requires one recorded default account for holder %',coalesce(holder_id,'ch:lisa'); END IF;
 RETURN result;
END $$;


--
-- Name: r051_historical_source_flow(text, jsonb); Type: FUNCTION
--

CREATE FUNCTION public.r051_historical_source_flow(kind text, j jsonb) RETURNS TABLE(day date, account_id text, holder_id text, amount numeric)
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: r051_parent_dirty(); Type: FUNCTION
--

CREATE FUNCTION public.r051_parent_dirty() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE o jsonb:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 n jsonb:=CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
 borrowers text[]; fields text[];
BEGIN
 fields:=CASE TG_TABLE_NAME
 WHEN 'Loans' THEN ARRAY['Ref Borrowers','Principal Amount','Loan Status','Auto Charge Enabled','Loan Type','Loan Date','Due Date','Current Daily Interest','Daily Payment Amount']
 WHEN 'Repayments' THEN ARRAY['Ref Loans','Ref Charges','Ref Payment','Principal Paid','Interest Paid','Payment Date','Late Charge Paid'] -- R118
 ELSE ARRAY['Ref Payment','Allocated Amount'] END;
 IF TG_OP='UPDATE' AND NOT EXISTS(SELECT 1 FROM unnest(fields) k WHERE o->k IS DISTINCT FROM n->k) THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME='Repayments' THEN
  PERFORM public.r051_queue_parent('charge',ARRAY[o->>'Ref Charges',n->>'Ref Charges']);
  PERFORM public.r051_queue_parent('loan',ARRAY[o->>'Ref Loans',n->>'Ref Loans']);
 END IF;
 IF TG_TABLE_NAME IN ('Repayments','Payment Allocations') THEN
  PERFORM public.r051_queue_parent('payment',ARRAY[o->>'Ref Payment',n->>'Ref Payment']);
 END IF;
 IF TG_TABLE_NAME='Loans' THEN borrowers:=ARRAY[o->>'Ref Borrowers',n->>'Ref Borrowers'];
 ELSIF TG_TABLE_NAME='Repayments' THEN
  SELECT array_agg("Ref Borrowers") INTO borrowers FROM public."Loans" WHERE "Row ID" IN(o->>'Ref Loans',n->>'Ref Loans');
 END IF;
 IF borrowers IS NOT NULL THEN PERFORM public.r051_queue_parent('borrower',borrowers); END IF;
 RETURN NULL;
END $$;


--
-- Name: r051_queue_parent(text, text[]); Type: FUNCTION
--

CREATE FUNCTION public.r051_queue_parent(kind text, ids text[]) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 PERFORM set_config('r051_dirty.'||kind,
  (coalesce(nullif(current_setting('r051_dirty.'||kind,true),'')::jsonb,'{}'::jsonb)||
   coalesce((SELECT jsonb_object_agg(k,true) FROM unnest(ids) k WHERE k IS NOT NULL),'{}'::jsonb))::text,true);
END $$;


--
-- Name: r051_restate_opening_source(); Type: FUNCTION
--

CREATE FUNCTION public.r051_restate_opening_source() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: reallocate_payment_interest(uuid, text, jsonb, jsonb, text, text); Type: FUNCTION
--

CREATE FUNCTION public.reallocate_payment_interest(p_operation uuid, p_payment text, p_expected_receipt jsonb, p_moves jsonb, p_reason text, p_code_version text) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN RAISE EXCEPTION 'Canonical central intent required; use the audited Cloud operator executor'; END $$;


--
-- Name: FUNCTION reallocate_payment_interest(p_operation uuid, p_payment text, p_expected_receipt jsonb, p_moves jsonb, p_reason text, p_code_version text); Type: COMMENT
--

COMMENT ON FUNCTION public.reallocate_payment_interest(p_operation uuid, p_payment text, p_expected_receipt jsonb, p_moves jsonb, p_reason text, p_code_version text) IS 'Legacy unaudited entry point disabled; reconcile previous operation IDs without replay.';


--
-- Name: reallocate_payment_interest_audited(uuid, text); Type: FUNCTION
--

CREATE FUNCTION public.reallocate_payment_interest_audited(p_operation uuid, p_canonical_plan text) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE p_payment text; p_expected_receipt jsonb; p_moves jsonb; p_reason text; p_code_version text;
 p_actor_id text; p_actor_login text; p_authorization text; supplied jsonb;
 p public."Payments"%ROWTYPE; a public."Payment Allocations"%ROWTYPE;
 r public."Repayments"%ROWTYPE; source_charge public."Charges"%ROWTYPE;
 target_charge public."Charges"%ROWTYPE; loan public."Loans"%ROWTYPE;
 new_a public."Payment Allocations"%ROWTYPE; new_r public."Repayments"%ROWTYPE;
 move jsonb; request jsonb; stored_request jsonb; observed jsonb;
 borrower text; ledger_before jsonb; loans_before jsonb; amount numeric;
 remaining numeric; ids text[]; targets text[];
BEGIN
 IF p_canonical_plan IS NULL OR octet_length(p_canonical_plan)>10485760 THEN
  RAISE EXCEPTION 'Bounded canonical operator plan required'; END IF;
 supplied:=p_canonical_plan::jsonb;
 IF jsonb_typeof(supplied) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Canonical operator plan required'; END IF;
 p_payment:=supplied->>'payment'; p_expected_receipt:=supplied->'receipt'; p_moves:=supplied->'moves';
 p_reason:=supplied->>'reason'; p_code_version:=supplied->>'code_version';
 p_actor_id:=supplied->>'actor_id'; p_actor_login:=supplied->>'actor_login';
 p_authorization:=supplied->>'authorization_reference';
 IF nullif(btrim(p_actor_id),'') IS NULL OR nullif(btrim(p_actor_login),'') IS NULL
  OR nullif(btrim(p_authorization),'') IS NULL THEN RAISE EXCEPTION 'Explicit operator labels and owner authorization required'; END IF;
 IF session_user<>'postgres' OR current_user<>'postgres' THEN
  RAISE EXCEPTION 'Dedicated postgres administrator required';
 END IF;
 IF p_operation IS NULL OR p_payment IS NULL OR p_expected_receipt IS NULL
  OR jsonb_typeof(p_expected_receipt) IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_moves) IS DISTINCT FROM 'array' OR jsonb_array_length(p_moves) NOT BETWEEN 1 AND 20
  OR nullif(btrim(p_reason),'') IS NULL OR nullif(btrim(p_code_version),'') IS NULL THEN
  RAISE EXCEPTION 'Invalid reallocation request';
 END IF;
 request:=jsonb_build_object('kind','interest-reallocation-v2','operation_id',p_operation::text,
  'database','loan_manager_prod','payment',p_payment,'receipt',p_expected_receipt,'moves',p_moves,
  'reason',p_reason,'code_version',p_code_version,'actor_id',p_actor_id,'actor_login',p_actor_login,
  'authorization_reference',p_authorization);
 IF supplied IS DISTINCT FROM request THEN RAISE EXCEPTION 'Canonical plan and business request differ'; END IF;
 IF NOT pg_try_advisory_xact_lock(9162026,2) THEN RAISE EXCEPTION 'Cash pool is busy; retry'; END IF;
 SELECT "Ref Borrower" INTO borrower FROM public."Payments" WHERE "Row ID"=p_payment;
 IF borrower IS NULL THEN RAISE EXCEPTION 'Receipt missing'; END IF;
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=borrower FOR UPDATE NOWAIT;
 SELECT * INTO p FROM public."Payments" WHERE "Row ID"=p_payment FOR UPDATE NOWAIT;
 SELECT direct_targets->0 INTO stored_request FROM agent_audit.commits WHERE operation_id=p_operation;
 IF FOUND THEN
  IF stored_request IS DISTINCT FROM request THEN RAISE EXCEPTION 'Operation ID reused with different request'; END IF;
  IF to_jsonb(p) IS DISTINCT FROM p_expected_receipt OR EXISTS (
   SELECT 1 FROM agent_audit.row_changes ch WHERE ch.operation_id=p_operation AND
    CASE ch.table_name
     WHEN 'Payment Allocations' THEN ch.after_row IS DISTINCT FROM
      (SELECT to_jsonb(x) FROM public."Payment Allocations" x WHERE x."Row ID"=ch.row_key->>'Row ID')
     WHEN 'Repayments' THEN ch.after_row IS DISTINCT FROM
      (SELECT to_jsonb(x) FROM public."Repayments" x WHERE x."Row ID"=ch.row_key->>'Row ID')
     WHEN 'Charges' THEN ch.after_row IS DISTINCT FROM
      (SELECT to_jsonb(x) FROM public."Charges" x WHERE x."Row ID"=ch.row_key->>'Row ID')
     ELSE true END) THEN RAISE EXCEPTION 'Applied operation state has changed'; END IF;
  RETURN 'already_applied';
 END IF;
 IF p."Status" IS DISTINCT FROM 'Posted' OR p."Allocation Method" IS DISTINCT FROM 'Lump Sum'
  OR to_jsonb(p) IS DISTINCT FROM p_expected_receipt THEN RAISE EXCEPTION 'Receipt verification conflict'; END IF;
 IF nullif(current_setting('mw_agent.reallocation_id',true),'') IS NOT NULL THEN
  RAISE EXCEPTION 'One reallocation per transaction';
 END IF;
 SELECT array_agg(x->>'allocation_id'),array_agg(x->>'target_charge') INTO ids,targets FROM jsonb_array_elements(p_moves) x;
 IF EXISTS(SELECT 1 FROM unnest(ids) k GROUP BY k HAVING k IS NULL OR count(*)>1)
  OR EXISTS(SELECT 1 FROM unnest(targets) k GROUP BY k HAVING k IS NULL OR count(*)>1) THEN
  RAISE EXCEPTION 'Duplicate or missing allocation/target';
 END IF;
 -- Lock all affected loans/charges and every child of this receipt in stable order.
 PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers"=borrower ORDER BY "Row ID" FOR UPDATE NOWAIT;
 PERFORM 1 FROM public."Charges" WHERE "Row ID" IN
  (SELECT "Ref Charge" FROM public."Payment Allocations" WHERE "Row ID"=ANY(ids))
  OR "Row ID"=ANY(targets) ORDER BY "Row ID" FOR UPDATE NOWAIT;
 PERFORM 1 FROM public."Payment Allocations" WHERE "Ref Payment"=p_payment ORDER BY "Row ID" FOR UPDATE NOWAIT;
 PERFORM 1 FROM public."Repayments" WHERE "Ref Payment"=p_payment ORDER BY "Row ID" FOR UPDATE NOWAIT;
 amount:=p."Amount Received"::numeric;
 IF amount IS NULL OR amount<=0 OR amount<>trunc(amount) OR p."Payment Date" IS NULL
  OR amount IS DISTINCT FROM p."Posted Amount" OR amount IS DISTINCT FROM p."Planned Allocation Amount"
  OR amount IS DISTINCT FROM (SELECT sum("Allocated Amount"::numeric) FROM public."Payment Allocations" WHERE "Ref Payment"=p_payment)
  OR amount IS DISTINCT FROM (SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric+"Late Charge Paid"::numeric) FROM public."Repayments" WHERE "Ref Payment"=p_payment) /* R118 */
  OR EXISTS(SELECT 1 FROM public."Payment Allocations" aa FULL JOIN public."Repayments" rr ON rr."Ref Payment Allocation"=aa."Row ID"
   WHERE (aa."Ref Payment"=p_payment OR rr."Ref Payment"=p_payment) AND
    (aa."Row ID" IS NULL OR rr."Row ID" IS NULL OR aa."Ref Payment" IS DISTINCT FROM rr."Ref Payment"
     OR aa."Ref Charge" IS DISTINCT FROM rr."Ref Charges" OR aa."Allocated Interest" IS DISTINCT FROM rr."Interest Paid" OR aa."Allocated Principal" IS DISTINCT FROM rr."Principal Paid")) THEN
  RAISE EXCEPTION 'Receipt child totals or references conflict';
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x."Row ID"),'[]') INTO ledger_before FROM public."Cash Ledger" x WHERE "Ref Payment"=p_payment;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x."Row ID"),'[]') INTO loans_before FROM public."Loans" x WHERE "Ref Borrowers"=borrower;
 INSERT INTO agent_audit.commits(operation_id,reviewer_id,reviewer_login,plan_sha256,request_reason,direct_targets,code_version)
 VALUES(p_operation,p_actor_id,p_actor_login,encode(sha256(convert_to(p_canonical_plan,'UTF8')),'hex'),
  'interest-reallocation: '||p_reason,jsonb_build_array(request),p_code_version);
 PERFORM set_config('mw_agent.reallocation_id',p_operation::text,true);
 FOR move IN SELECT x FROM jsonb_array_elements(p_moves) x LOOP
  SELECT * INTO a FROM public."Payment Allocations" WHERE "Row ID"=move->>'allocation_id';
  IF NOT FOUND OR a."Ref Payment" IS DISTINCT FROM p_payment OR to_jsonb(a) IS DISTINCT FROM move->'expected_allocation' THEN
   RAISE EXCEPTION 'Allocation verification conflict'; END IF;
  SELECT * INTO STRICT r FROM public."Repayments" WHERE "Ref Payment Allocation"=a."Row ID";
  SELECT * INTO STRICT source_charge FROM public."Charges" WHERE "Row ID"=a."Ref Charge";
  SELECT * INTO STRICT target_charge FROM public."Charges" WHERE "Row ID"=move->>'target_charge';
  SELECT * INTO STRICT loan FROM public."Loans" WHERE "Row ID"=source_charge."Ref Loans";
  IF to_jsonb(r) IS DISTINCT FROM move->'expected_repayment'
   OR to_jsonb(source_charge) IS DISTINCT FROM move->'expected_source_charge'
   OR to_jsonb(target_charge) IS DISTINCT FROM move->'expected_target_charge'
   OR to_jsonb(loan) IS DISTINCT FROM move->'expected_loan' THEN RAISE EXCEPTION 'Move verification conflict'; END IF;
  IF loan."Ref Borrowers" IS DISTINCT FROM borrower OR loan."Loan Status" IS DISTINCT FROM 'ยังไม่ปิดยอด'
   OR loan."Defaulted" IS TRUE OR loan."Ref Closing Payment" IS NOT NULL
   OR source_charge."Ref Loans" IS DISTINCT FROM target_charge."Ref Loans"
   OR r."Ref Loans" IS DISTINCT FROM loan."Row ID" OR r."Ref Charges" IS DISTINCT FROM a."Ref Charge"
   OR r."Ref Payment" IS DISTINCT FROM p_payment OR r."Payment Date" IS DISTINCT FROM p."Payment Date"
   OR a."Charge Date Snapshot" IS DISTINCT FROM source_charge."Charge Date"
   OR source_charge."Charge Date" IS NULL OR target_charge."Charge Date" IS NULL
   OR target_charge."Charge Date">p."Payment Date" OR target_charge."Charge Date">=source_charge."Charge Date"
   OR starts_with(source_charge."Row ID",'df10:') OR starts_with(target_charge."Row ID",'df10:')
   OR a."Allocated Principal"::numeric IS DISTINCT FROM 0 OR r."Principal Paid"::numeric IS DISTINCT FROM 0
   OR a."Allocated Interest"::numeric IS DISTINCT FROM r."Interest Paid"::numeric
   OR a."Allocated Amount"::numeric IS DISTINCT FROM a."Allocated Interest"::numeric
   OR a."Allocated Interest"::numeric IS NULL OR a."Allocated Interest"::numeric<=0 THEN RAISE EXCEPTION 'Only same-loan whole interest moves are supported'; END IF;
  SELECT coalesce(target_charge."Interest Due"::numeric,0)-coalesce(sum("Interest Paid"::numeric),0) INTO remaining
   FROM public."Repayments" WHERE "Ref Charges"=target_charge."Row ID";
  IF remaining<a."Allocated Interest"::numeric OR EXISTS(SELECT 1 FROM public."Payment Allocations"
   WHERE "Ref Payment"=p_payment AND "Ref Charge"=target_charge."Row ID") THEN RAISE EXCEPTION 'Target charge capacity conflict'; END IF;
  new_a:=a; new_r:=r;
  new_a."Ref Charge":=target_charge."Row ID"; new_a."Charge Date Snapshot":=target_charge."Charge Date";
  new_a."Interest Remaining Snapshot":=remaining::money;
  new_a."Principal Remaining Snapshot":=target_charge."Principal Remaining"::money;
  new_a."Amount Remaining Snapshot":=(remaining+target_charge."Principal Remaining")::money;
  new_r."Ref Charges":=target_charge."Row ID";
  INSERT INTO agent_audit.row_changes(operation_id,schema_name,table_name,action,row_key,before_row,after_row) VALUES
   (p_operation,'public','Payment Allocations','UPDATE',jsonb_build_object('Row ID',a."Row ID"),to_jsonb(a),to_jsonb(new_a)),
   (p_operation,'public','Repayments','UPDATE',jsonb_build_object('Row ID',r."Row ID"),to_jsonb(r),to_jsonb(new_r));
  UPDATE public."Payment Allocations" SET "Ref Charge"=new_a."Ref Charge","Charge Date Snapshot"=new_a."Charge Date Snapshot",
   "Interest Remaining Snapshot"=new_a."Interest Remaining Snapshot","Principal Remaining Snapshot"=new_a."Principal Remaining Snapshot",
   "Amount Remaining Snapshot"=new_a."Amount Remaining Snapshot" WHERE "Row ID"=a."Row ID" RETURNING to_jsonb("Payment Allocations".*) INTO observed;
  IF observed IS DISTINCT FROM to_jsonb(new_a) THEN RAISE EXCEPTION 'Unexpected allocation mutation'; END IF;
  UPDATE public."Repayments" SET "Ref Charges"=new_r."Ref Charges" WHERE "Row ID"=r."Row ID" RETURNING to_jsonb("Repayments".*) INTO observed;
  IF observed IS DISTINCT FROM to_jsonb(new_r) THEN RAISE EXCEPTION 'Unexpected repayment mutation'; END IF;
  PERFORM public.vc_refresh_charge(source_charge."Row ID");
  PERFORM public.vc_refresh_charge(target_charge."Row ID");
  INSERT INTO agent_audit.row_changes(operation_id,schema_name,table_name,action,row_key,before_row,after_row)
   SELECT p_operation,'public','Charges','UPDATE',jsonb_build_object('Row ID',x."Row ID"),
    CASE WHEN x."Row ID"=source_charge."Row ID" THEN to_jsonb(source_charge) ELSE to_jsonb(target_charge) END,to_jsonb(x)
   FROM public."Charges" x WHERE x."Row ID" IN (source_charge."Row ID",target_charge."Row ID");
 END LOOP;
 SET CONSTRAINTS ALL IMMEDIATE;
 SELECT to_jsonb(x) INTO observed FROM public."Payments" x WHERE "Row ID"=p_payment;
 IF observed IS DISTINCT FROM p_expected_receipt OR ledger_before IS DISTINCT FROM
  (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x."Row ID"),'[]') FROM public."Cash Ledger" x WHERE "Ref Payment"=p_payment)
  OR loans_before IS DISTINCT FROM (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x."Row ID"),'[]') FROM public."Loans" x WHERE "Ref Borrowers"=borrower) THEN
  RAISE EXCEPTION 'Receipt, cash or loan invariant changed'; END IF;
 PERFORM set_config('mw_agent.reallocation_id','',true);
 RETURN 'applied';
END $$;


--
-- Name: FUNCTION reallocate_payment_interest_audited(p_operation uuid, p_canonical_plan text); Type: COMMENT
--

COMMENT ON FUNCTION public.reallocate_payment_interest_audited(p_operation uuid, p_canonical_plan text) IS 'Explicit owner-approved operator path: canonical plan text must come from durable central intent; V57 financial guards and exact retry readback retained. No receipt/cash write.';


--
-- Name: rebate_settlement_cash_source(); Type: FUNCTION
--

CREATE FUNCTION public.rebate_settlement_cash_source() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN PERFORM public.sync_cash_ledger('Rebate Settlement',NEW.id); RETURN NULL; END $$;


--
-- Name: FUNCTION rebate_settlement_cash_source(); Type: COMMENT
--

COMMENT ON FUNCTION public.rebate_settlement_cash_source() IS 'R129: projects a rebate settlement into "Cash Ledger" (sync_cash_ledger, the ledger owner''s definer).';


--
-- Name: rebate_settlement_row_guard(); Type: FUNCTION
--

CREATE FUNCTION public.rebate_settlement_row_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Rebate settlements are immutable; delete the settlement and record it again'; END IF;
 -- The projection goes with its source (the business_source_delete pattern; the ledger guard allows it at depth 2).
 DELETE FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"='Rebate Settlement' AND "Source Key"='REBATESETTLEMENT:'||OLD.id;
 RETURN OLD;
END $$;


--
-- Name: FUNCTION rebate_settlement_row_guard(); Type: COMMENT
--

COMMENT ON FUNCTION public.rebate_settlement_row_guard() IS 'R129: a rebate settlement never changes after insert; its delete removes its cash projection first.';


--
-- Name: recalculate_business_expenses_from_date(date); Type: FUNCTION
--

CREATE FUNCTION public.recalculate_business_expenses_from_date(p_date date) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 UPDATE public."Business Expenses" e SET "Amount"=e."Amount"
 WHERE CASE WHEN e."Source Type"='Referral Rebate' THEN
   (SELECT "Close Date" FROM public."Loans" WHERE "Row ID"=e."Ref Related Loan") ELSE e."Expense Date" END>=p_date;
END $$;


--
-- Name: receiving_cash_account(text); Type: FUNCTION
--

CREATE FUNCTION public.receiving_cash_account(p_borrower text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT coalesce((SELECT a."Row ID" FROM public."Borrowers" b JOIN public."Cash Accounts" a
  ON a."Row ID"=b."Ref Preferred Receiving Cash Account" JOIN public."Cash Holders" h
  ON h."Row ID"=a."Ref Cash Holder" WHERE b."Row ID"=p_borrower AND a."Active" AND h."Active"),
  public.default_cash_account('ch:dad'));
$$;


--
-- Name: referral_loan_closed(); Type: FUNCTION
--

CREATE FUNCTION public.referral_loan_closed() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF NEW."Loan Status"='ปิดยอดแล้ว' AND OLD."Loan Status" IS DISTINCT FROM NEW."Loan Status" THEN
   PERFORM public.create_referral_rebate(NEW."Row ID");
 ELSIF NEW."Close Date" IS DISTINCT FROM OLD."Close Date" THEN
   UPDATE public."Business Expenses" SET "Amount"="Amount" WHERE "Ref Related Loan"=NEW."Row ID" AND "Source Type"='Referral Rebate';
 END IF;
 RETURN NULL;
END $$;


--
-- Name: referral_rebate_terms(text); Type: FUNCTION
--

CREATE FUNCTION public.referral_rebate_terms(p_referrer text) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT jsonb_build_object('rate',coalesce(b."Referral Rebate Rate",10),'cap',coalesce(b."Referral Rebate Cap",1000),
  'custom',(b."Referral Rebate Rate" IS NOT NULL OR b."Referral Rebate Cap" IS NOT NULL))
 FROM (SELECT p_referrer AS id) k LEFT JOIN public."Borrowers" b ON b."Row ID"=k.id;
$$;


--
-- Name: FUNCTION referral_rebate_terms(p_referrer text); Type: COMMENT
--

COMMENT ON FUNCTION public.referral_rebate_terms(p_referrer text) IS 'R120: the referral rebate terms of a referrer: {"rate": percent, "cap": baht, "custom": either set on the Borrower}, defaults 10% and 1,000 when null. Shared by create_referral_rebate and pwa_referral_rebate_projection_v1. Read only.';


--
-- Name: refresh_daily_analytics(date, date); Type: FUNCTION
--

CREATE FUNCTION public.refresh_daily_analytics(p_from date, p_to date) RETURNS integer
    LANGUAGE sql
    SET search_path TO 'pg_catalog', 'public'
    SET plan_cache_mode TO 'force_custom_plan'
    AS $$
 SELECT public.refresh_daily_analytics_scoped(p_from,p_to,NULL);
$$;


--
-- Name: refresh_daily_analytics_scoped(date, date, text[]); Type: FUNCTION
--

CREATE FUNCTION public.refresh_daily_analytics_scoped(p_from date, p_to date, p_accounts text[]) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    SET plan_cache_mode TO 'force_custom_plan'
    AS $$
DECLARE refreshed_days integer;
BEGIN
 IF p_from IS NULL OR p_to IS NULL OR p_from>p_to
    OR p_to>(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date THEN
   RAISE EXCEPTION 'Analytics requires a valid date range ending no later than Bangkok today';
 END IF;
 IF NOT pg_try_advisory_xact_lock(7112026,7) THEN
   RAISE EXCEPTION 'Analytics refresh is busy; sync and retry';
 END IF;
 -- Missing account snapshots require a full rebuild of account coverage.
 IF p_accounts IS NOT NULL AND EXISTS (
  SELECT 1 FROM public."Cash Accounts" a CROSS JOIN generate_series(0,p_to-p_from) d
  WHERE NOT EXISTS(SELECT 1 FROM public."Cash Account Daily Analytics" s
   WHERE s."Ref Cash Account"=a."Row ID" AND s."Snapshot Date"=p_from+d)
 ) THEN p_accounts:=NULL; END IF;
 -- One statement provides one consistent source snapshot for every requested date.
 -- Model 3 corrects partially paid pending charges. Existing gross/net profit semantics
 -- remain compatible; new per-role inputs retain the governed rounded allocation rules.
 WITH dates AS (
   SELECT p_from+i AS d FROM generate_series(0,p_to-p_from) i
 ), contributions AS MATERIALIZED (
   SELECT c."Contribution Date" AS d,p."Partner Role" AS role,
     CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric
       ELSE -c."Amount"::numeric END AS net
   FROM public."Cash Pool Contributions" c
   LEFT JOIN public."Partners" p ON p."Row ID"=c."Ref Partner"
 ), repayment_days AS MATERIALIZED (
   SELECT "Payment Date" AS d,sum("Principal Paid"::numeric) AS principal,
     sum("Interest Paid"::numeric+"Late Charge Paid"::numeric) AS interest,count(*) AS repayments -- R118: profit is interest plus late charge
   FROM public."Repayments" GROUP BY "Payment Date"
 ), profit_days AS MATERIALIZED (
   SELECT r.d,CASE WHEN c.pool>0 THEN r.interest*coalesce(c.ab,0)/c.pool ELSE 0 END AS profit
   FROM repayment_days r CROSS JOIN LATERAL (
     SELECT sum(net) AS pool,sum(net) FILTER(WHERE role IN ('A','B')) AS ab
     FROM contributions WHERE d<=r.d
   ) c
 ), charge_payments AS MATERIALIZED (
   SELECT "Ref Charges" charge,"Payment Date" d,
    sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)+"Late Charge Paid"::numeric) paid
   FROM public."Repayments" WHERE "Payment Date"<=p_to GROUP BY 1,2
 ), charge_events AS MATERIALIZED (
   SELECT c."Row ID" charge,c."Charge Date" d,
    coalesce(c."Principal Due"::numeric,0)+coalesce(c."Interest Due"::numeric,0)+c."Late Charge Due"::numeric due,
    coalesce(sum(cp.paid),0) paid
   FROM public."Charges" c LEFT JOIN charge_payments cp
    ON cp.charge=c."Row ID" AND cp.d<=c."Charge Date"
   WHERE p_to-p_from>=3 AND c."Charge Date"<=p_to GROUP BY 1,2,3
   UNION ALL
   SELECT c."Row ID",cp.d,coalesce(c."Principal Due"::numeric,0)+coalesce(c."Interest Due"::numeric,0)+c."Late Charge Due"::numeric,cp.paid
   FROM public."Charges" c JOIN charge_payments cp ON cp.charge=c."Row ID" AND cp.d>c."Charge Date"
   WHERE p_to-p_from>=3 AND c."Charge Date"<=p_to
 ), charge_positions AS (
   SELECT charge,d,greatest(due-sum(paid) OVER(PARTITION BY charge ORDER BY d ROWS UNBOUNDED PRECEDING),0) pending
   FROM charge_events
 ), pending_changes AS (
   SELECT d,pending-coalesce(lag(pending) OVER(PARTITION BY charge ORDER BY d),0) delta FROM charge_positions
 ), pending_days AS MATERIALIZED (
   SELECT d,sum(delta) delta FROM pending_changes GROUP BY d
 ), expenses AS MATERIALIZED (
   SELECT "Expense Date" d,sum("Amount"::numeric) expense FROM public."Business Expenses" GROUP BY 1
 ), partner_income AS MATERIALIZED (
   -- Keep the governed per-repayment rounded allocation, but filter its inputs
   -- before aggregation instead of evaluating the all-history running report.
   SELECT dates.d,coalesce(i.pa,0)-coalesce(e.pa,0) pa,coalesce(i.pb,0)-coalesce(e.pb,0) pb
   FROM dates LEFT JOIN (
    SELECT "Payment Date" d,sum("Partner A Profit") pa,sum("Partner B Profit") pb
    FROM public.olap_repayments_analytics WHERE "Payment Date" BETWEEN p_from AND p_to GROUP BY 1
   ) i USING(d) LEFT JOIN (
    SELECT "Expense Date" d,sum("Partner A Expense"::numeric) pa,sum("Partner B Expense"::numeric) pb
    FROM public."Business Expenses" WHERE "Expense Date" BETWEEN p_from AND p_to GROUP BY 1
   ) e USING(d)
 ), settlements AS MATERIALIZED (
   SELECT s."Transfer Date" d,sum(s."Amount"::numeric) amount,
    coalesce(sum(s."Amount"::numeric) FILTER(WHERE p."Partner Role"='A'),0) pa,
    coalesce(sum(s."Amount"::numeric) FILTER(WHERE p."Partner Role"='B'),0) pb
   FROM public."Settlements" s LEFT JOIN public."Partners" p ON p."Row ID"=s."Ref Partner"
   WHERE s."Status"='Completed' AND s."Transfer Date"<=p_to GROUP BY 1
 ), ledger AS MATERIALIZED (
   SELECT "Movement Date" d,"Ref From Cash Account" from_account,"Ref To Cash Account" to_account,"Amount" amount
   FROM public."Cash Ledger" WHERE "Movement Date"<=p_to
 ), account_flows AS MATERIALIZED (
   SELECT account,d,sum(greatest(signed,0)) cash_in,sum(greatest(-signed,0)) cash_out,count(*) n
   FROM ledger CROSS JOIN LATERAL (VALUES (from_account,-amount),(to_account,amount)) v(account,signed)
   WHERE account IS NOT NULL GROUP BY 1,2
 ), consolidated_flows AS MATERIALIZED (
   SELECT d,sum(greatest(signed,0)) cash_in,sum(greatest(-signed,0)) cash_out
   FROM (SELECT d,(CASE WHEN to_account IS NOT NULL THEN amount ELSE 0 END)
    -(CASE WHEN from_account IS NOT NULL THEN amount ELSE 0 END) signed FROM ledger) v GROUP BY 1
 ), account_seed AS MATERIALIZED (
   SELECT a."Row ID" account,(c."Cutover At" AT TIME ZONE 'Asia/Bangkok')::date available,
    c."Opening Balance"-c."Baseline Cash In"+c."Baseline Cash Out"
     +coalesce(sum(f.cash_in-f.cash_out),0) opening
   FROM public."Cash Accounts" a LEFT JOIN public.r008_cash_account_cutover c ON c."Ref Cash Account"=a."Row ID"
   LEFT JOIN account_flows f ON f.account=a."Row ID" AND f.d<p_from
   WHERE p_accounts IS NULL OR a."Row ID"=ANY(p_accounts)
   GROUP BY a."Row ID",c."Cutover At",c."Opening Balance",c."Baseline Cash In",c."Baseline Cash Out"
 ), account_grid AS (
   SELECT a.*,d.d,coalesce(f.cash_in,0) cash_in,coalesce(f.cash_out,0) cash_out,coalesce(f.n,0) n
   FROM account_seed a CROSS JOIN dates d LEFT JOIN account_flows f ON f.account=a.account AND f.d=d.d
 ), account_positions AS (
   SELECT *,CASE WHEN d>=available THEN opening+sum(cash_in-cash_out) OVER
    (PARTITION BY account ORDER BY d ROWS UNBOUNDED PRECEDING) END closing FROM account_grid
 ), computed_accounts AS MATERIALIZED (
   SELECT jsonb_build_array(account,d)::text AS "Row ID",d AS "Snapshot Date",account AS "Ref Cash Account",statement_timestamp() AT TIME ZONE 'Asia/Bangkok' AS "Generated At",3 AS "Model Version",
    cash_in AS "Money In",cash_out AS "Money Out",closing-cash_in+cash_out AS "Opening Balance",closing AS "Closing Balance",n AS "Transaction Count",available AS "Available From",
    CASE WHEN available IS NULL THEN 'Opening not initialized' WHEN d<available THEN 'Before known opening' ELSE 'Available' END AS "Balance Status"
   FROM account_positions
 ), saved_accounts AS (
   INSERT INTO public."Cash Account Daily Analytics"("Row ID","Snapshot Date","Ref Cash Account","Generated At","Model Version","Money In","Money Out","Opening Balance","Closing Balance","Transaction Count","Available From","Balance Status")
   SELECT * FROM computed_accounts
   ON CONFLICT ("Snapshot Date","Ref Cash Account") DO UPDATE SET
    "Generated At"=EXCLUDED."Generated At","Model Version"=EXCLUDED."Model Version",
    "Money In"=EXCLUDED."Money In","Money Out"=EXCLUDED."Money Out",
    "Opening Balance"=EXCLUDED."Opening Balance","Closing Balance"=EXCLUDED."Closing Balance",
    "Transaction Count"=EXCLUDED."Transaction Count","Available From"=EXCLUDED."Available From","Balance Status"=EXCLUDED."Balance Status"
   WHERE p_accounts IS NULL OR
    (to_jsonb("Cash Account Daily Analytics")-'Generated At') IS DISTINCT FROM (to_jsonb(EXCLUDED)-'Generated At')
   RETURNING *
 ), all_accounts AS (
   SELECT * FROM computed_accounts
   UNION ALL
   SELECT "Row ID","Snapshot Date","Ref Cash Account","Generated At","Model Version","Money In","Money Out","Opening Balance","Closing Balance","Transaction Count","Available From","Balance Status" FROM public."Cash Account Daily Analytics"
   WHERE p_accounts IS NOT NULL AND NOT ("Ref Cash Account"=ANY(p_accounts)) AND "Snapshot Date" BETWEEN p_from AND p_to
 ), cash_positions AS (
   SELECT "Snapshot Date" d,
    CASE WHEN bool_and("Closing Balance" IS NOT NULL) THEN sum("Closing Balance") END closing,
    CASE WHEN bool_and("Opening Balance" IS NOT NULL) THEN sum("Opening Balance") END opening,
    CASE WHEN bool_and("Available From" IS NOT NULL) THEN max("Available From") END available,
    CASE WHEN bool_and("Closing Balance" IS NOT NULL) THEN 'Available'
     WHEN bool_and("Available From" IS NOT NULL) THEN 'Before known opening' ELSE 'Opening not initialized' END status
   FROM all_accounts GROUP BY 1
 ), metrics AS (
   SELECT dates.d,l.issued,l.loans,l.issued_eod,l.active,l.borrowers,
     r.principal,r.interest,r.repayments,r.returned_eod,c.pending,p.pool,
     coalesce((SELECT sum(profit) FROM profit_days WHERE d<=dates.d),0)
       -coalesce((SELECT sum("Amount"::numeric) FROM public."Settlements"
          WHERE "Status"='Completed' AND "Transfer Date"<=dates.d),0) AS unsettled
   FROM dates
   CROSS JOIN LATERAL (
     SELECT coalesce(sum("Principal Amount"::numeric) FILTER(WHERE "Loan Date"=dates.d),0) AS issued,
       count(*) FILTER(WHERE "Loan Date"=dates.d) AS loans,
       coalesce(sum("Principal Amount"::numeric),0) AS issued_eod,
       count(*) FILTER(WHERE "Close Date" IS NULL OR "Close Date">dates.d) AS active,
       count(DISTINCT coalesce("Ref Borrowers",'')) FILTER(WHERE "Close Date" IS NULL OR "Close Date">dates.d) AS borrowers
     FROM public."Loans" WHERE "Loan Date"<=dates.d
   ) l
   CROSS JOIN LATERAL (
     SELECT coalesce(sum(principal) FILTER(WHERE d=dates.d),0) AS principal,
       coalesce(sum(interest) FILTER(WHERE d=dates.d),0) AS interest,
       coalesce(sum(repayments) FILTER(WHERE d=dates.d),0) AS repayments,
       coalesce(sum(principal),0) AS returned_eod
     FROM repayment_days WHERE d<=dates.d
   ) r
   CROSS JOIN LATERAL (
    SELECT coalesce(sum(delta),0) pending FROM pending_days WHERE d<=dates.d HAVING p_to-p_from>=3
    UNION ALL
    SELECT coalesce(sum(greatest(coalesce(c."Principal Due"::numeric,0)+coalesce(c."Interest Due"::numeric,0)+c."Late Charge Due"::numeric-coalesce(cp.paid,0),0)),0)
    FROM public."Charges" c LEFT JOIN (SELECT charge,sum(paid) paid FROM charge_payments WHERE d<=dates.d GROUP BY charge) cp
     ON cp.charge=c."Row ID" WHERE c."Charge Date"<=dates.d HAVING p_to-p_from<3
   ) c
   CROSS JOIN LATERAL (SELECT coalesce(sum(net),0) AS pool FROM contributions WHERE d<=dates.d) p
 )
 INSERT INTO public."Daily Analytics"("Row ID","Snapshot Date","Generated At","Model Version",
   "Principal Issued","Loans Issued","Principal Returned","Interest Received","Repayments Count",
   "Outstanding Principal EOD","Active Loans EOD","Active Borrowers EOD","Pending Charges EOD",
   "Total Cash Pool EOD","Available Cash EOD","Unsettled Profit EOD","Business Expenses","Net Profit","Net Unsettled Profit EOD",
   "Capital Contributed","Capital Withdrawn","Partner Settlements","Partner A Net Profit","Partner B Net Profit","Partner A Settlements","Partner B Settlements","Cash Money In","Cash Money Out","Cash Opening Balance","Cash Balance EOD","Cash Available From","Cash Balance Status")
 SELECT 'da11:'||metrics.d::text,metrics.d,statement_timestamp() AT TIME ZONE 'Asia/Bangkok',3,
   issued::money,loans::integer,principal::money,interest::money,repayments::integer,
   (issued_eod-returned_eod)::money,active::integer,borrowers::integer,pending::money,
   pool::money,(pool+returned_eod-issued_eod)::money,unsettled::money,
   coalesce((SELECT sum("Amount") FROM public."Business Expenses" WHERE "Expense Date"=metrics.d),0::money),
   interest::money-coalesce((SELECT sum("Amount") FROM public."Business Expenses" WHERE "Expense Date"=metrics.d),0::money),
   unsettled::money-coalesce((SELECT sum("Amount") FROM public."Business Expenses" WHERE "Expense Date"<=metrics.d),0::money)
 ,coalesce((SELECT sum("Amount"::numeric) FROM public."Cash Pool Contributions" WHERE "Contribution Date"=metrics.d AND "Transaction Type"='Contribution'),0)
 ,coalesce((SELECT sum("Amount"::numeric) FROM public."Cash Pool Contributions" WHERE "Contribution Date"=metrics.d AND "Transaction Type" IS DISTINCT FROM 'Contribution'),0)
 ,coalesce(s.amount,0),coalesce(pi.pa,0),coalesce(pi.pb,0),coalesce(s.pa,0),coalesce(s.pb,0)
 ,coalesce(cf.cash_in,0),coalesce(cf.cash_out,0),cp.opening,cp.closing,cp.available,coalesce(cp.status,'Opening not initialized')
 FROM metrics LEFT JOIN settlements s ON s.d=metrics.d LEFT JOIN partner_income pi ON pi.d=metrics.d
 LEFT JOIN consolidated_flows cf ON cf.d=metrics.d LEFT JOIN cash_positions cp ON cp.d=metrics.d
 ORDER BY metrics.d
 ON CONFLICT ("Snapshot Date") DO UPDATE SET
   "Generated At"=EXCLUDED."Generated At","Model Version"=EXCLUDED."Model Version",
   "Principal Issued"=EXCLUDED."Principal Issued","Loans Issued"=EXCLUDED."Loans Issued",
   "Principal Returned"=EXCLUDED."Principal Returned","Interest Received"=EXCLUDED."Interest Received",
   "Repayments Count"=EXCLUDED."Repayments Count","Outstanding Principal EOD"=EXCLUDED."Outstanding Principal EOD",
   "Active Loans EOD"=EXCLUDED."Active Loans EOD","Active Borrowers EOD"=EXCLUDED."Active Borrowers EOD",
   "Pending Charges EOD"=EXCLUDED."Pending Charges EOD","Total Cash Pool EOD"=EXCLUDED."Total Cash Pool EOD",
   "Available Cash EOD"=EXCLUDED."Available Cash EOD","Unsettled Profit EOD"=EXCLUDED."Unsettled Profit EOD",
   "Business Expenses"=EXCLUDED."Business Expenses","Net Profit"=EXCLUDED."Net Profit",
   "Net Unsettled Profit EOD"=EXCLUDED."Net Unsettled Profit EOD",
   "Capital Contributed"=EXCLUDED."Capital Contributed",
   "Capital Withdrawn"=EXCLUDED."Capital Withdrawn",
   "Partner Settlements"=EXCLUDED."Partner Settlements",
   "Partner A Net Profit"=EXCLUDED."Partner A Net Profit",
   "Partner B Net Profit"=EXCLUDED."Partner B Net Profit",
   "Partner A Settlements"=EXCLUDED."Partner A Settlements",
   "Partner B Settlements"=EXCLUDED."Partner B Settlements",
   "Cash Money In"=EXCLUDED."Cash Money In",
   "Cash Money Out"=EXCLUDED."Cash Money Out",
   "Cash Opening Balance"=EXCLUDED."Cash Opening Balance",
   "Cash Balance EOD"=EXCLUDED."Cash Balance EOD",
   "Cash Available From"=EXCLUDED."Cash Available From",
   "Cash Balance Status"=EXCLUDED."Cash Balance Status"
 WHERE p_accounts IS NULL OR
  (to_jsonb("Daily Analytics")-'Generated At') IS DISTINCT FROM (to_jsonb(EXCLUDED)-'Generated At');
 GET DIAGNOSTICS refreshed_days=ROW_COUNT;
 RETURN refreshed_days;
END $$;


--
-- Name: refresh_reversed_settlement_analytics(); Type: FUNCTION
--

CREATE FUNCTION public.refresh_reversed_settlement_analytics() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE first_snapshot date; last_snapshot date;
BEGIN
 IF OLD."Status"='Completed' AND NEW."Status"='Cancelled' THEN
  SELECT min("Snapshot Date"),max("Snapshot Date") INTO first_snapshot,last_snapshot
  FROM public."Daily Analytics" WHERE "Snapshot Date">=OLD."Transfer Date";
  IF first_snapshot IS NOT NULL THEN
   PERFORM public.refresh_daily_analytics(first_snapshot,last_snapshot);
  END IF;
 END IF;
 RETURN NEW;
END $$;


--
-- Name: reporting_borrower_period_v1(date, date, text); Type: FUNCTION
--

CREATE FUNCTION public.reporting_borrower_period_v1(p_start date, p_end date, p_population text DEFAULT 'All with loan history'::text) RETURNS TABLE(borrower_id text, borrower_label text, hidden_flag boolean, has_active_loan boolean, active_loans bigint, loan_count bigint, first_loan_date date, last_payment_date date, outstanding_principal numeric, lifetime_interest numeric, principal_issued numeric, principal_returned numeric, interest_received numeric, loans_issued bigint, first_loans bigint, repeat_loans bigint, unclassified_loans bigint, principal_share numeric, interest_share numeric, principal_rank bigint, interest_rank bigint, invalid_fact_count bigint, reporting_date date, calculated_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
 WITH cohort AS (
 SELECT d.* FROM public.reporting_borrower_directory_v1 d WHERE d.loan_count>0
 AND (p_population='All with loan history' OR p_population='Currently active' AND d.has_active_loan
 OR p_population='Currently inactive' AND NOT d.has_active_loan)
 AND p_start IS NOT NULL AND p_end>=p_start AND p_end<=public.olap_reporting_date()
 ), activity AS (
 SELECT a.borrower_id,
 CASE WHEN bool_and(a.principal_issued IS NOT NULL) THEN sum(a.principal_issued) END principal_issued,
 CASE WHEN bool_and(a.principal_returned IS NOT NULL) THEN sum(a.principal_returned) END principal_returned,
 CASE WHEN bool_and(a.interest_received IS NOT NULL) THEN sum(a.interest_received) END interest_received,
 sum(a.loans_issued)::bigint loans_issued,sum(a.first_loans)::bigint first_loans,sum(a.repeat_loans)::bigint repeat_loans,
 sum(a.unclassified_loans)::bigint unclassified_loans
 FROM public.reporting_borrower_activity_daily_v1 a WHERE a.activity_date BETWEEN p_start AND p_end GROUP BY a.borrower_id
 ), combined AS (
 SELECT d.*,CASE WHEN a.borrower_id IS NULL THEN 0 ELSE a.principal_issued END principal_issued,
 CASE WHEN a.borrower_id IS NULL THEN 0 ELSE a.principal_returned END principal_returned,
 CASE WHEN a.borrower_id IS NULL THEN 0 ELSE a.interest_received END interest_received,
 coalesce(a.loans_issued,0) loans_issued,coalesce(a.first_loans,0) first_loans,coalesce(a.repeat_loans,0) repeat_loans,
 coalesce(a.unclassified_loans,0) unclassified_loans FROM cohort d LEFT JOIN activity a USING(borrower_id)
 ), totals AS (
 SELECT c.*,CASE WHEN bool_and(c.outstanding_principal IS NOT NULL) OVER() THEN sum(c.outstanding_principal) OVER() END total_principal,
 CASE WHEN bool_and(c.interest_received IS NOT NULL) OVER() THEN sum(c.interest_received) OVER() END total_interest FROM combined c
 )
 SELECT t.borrower_id,t.borrower_label,t.hidden_flag,t.has_active_loan,t.active_loans,t.loan_count,t.first_loan_date,t.last_payment_date,
 t.outstanding_principal,t.lifetime_interest,t.principal_issued,t.principal_returned,t.interest_received,t.loans_issued,t.first_loans,t.repeat_loans,
 t.unclassified_loans,CASE WHEN t.total_principal>0 THEN t.outstanding_principal/t.total_principal END,
 CASE WHEN t.total_interest>0 THEN t.interest_received/t.total_interest END,
 row_number() OVER(ORDER BY t.outstanding_principal DESC NULLS LAST,t.borrower_id),
 row_number() OVER(ORDER BY t.interest_received DESC NULLS LAST,t.borrower_id),t.invalid_fact_count,t.reporting_date,t.calculated_at FROM totals t
$$;


--
-- Name: FUNCTION reporting_borrower_period_v1(p_start date, p_end date, p_population text); Type: COMMENT
--

COMMENT ON FUNCTION public.reporting_borrower_period_v1(p_start date, p_end date, p_population text) IS 'Read-only borrower period facts: explicit Bangkok dates, current cohort, signed receipts, immutable keys. Current positions do not reconstruct past balances. No AppSheet binding.';


--
-- Name: reporting_cash_period(date, date, text); Type: FUNCTION
--

CREATE FUNCTION public.reporting_cash_period(p_from date, p_to date, p_scope text) RETURNS TABLE("Period Start" date, "Period End" date, "Account" text, "Available From" date, "Opening Balance" numeric, "Money In" numeric, "Money Out" numeric, "Net Movement" numeric, "Closing Balance" numeric, "Transaction Count" bigint, "Statement Status" text)
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 WITH amounts AS (
  SELECT s.id,s.label,s.available,s.baseline,
   coalesce(sum(e."Net Movement") FILTER(WHERE e."Date"<p_from),0) prior,
   coalesce(sum(e."Money In") FILTER(WHERE e."Date">=p_from),0) cash_in,
   coalesce(sum(e."Money Out") FILTER(WHERE e."Date">=p_from),0) cash_out,
   count(e."Entry ID") FILTER(WHERE e."Date">=p_from) n
  FROM public.reporting_cash_scopes s LEFT JOIN public.reporting_cash_entries e
   ON e."Scope ID"=s.id AND e."Date"<=p_to
  WHERE s.id=p_scope AND p_from<=p_to AND p_to<=public.olap_reporting_date()
  GROUP BY s.id,s.label,s.available,s.baseline
 ), balances AS (
  SELECT *,CASE WHEN p_from>=available THEN baseline+prior END opening,
   CASE WHEN p_to>=available THEN baseline+prior+cash_in-cash_out END closing FROM amounts
 )
 SELECT p_from,p_to,label,available,opening,cash_in,cash_out,cash_in-cash_out,closing,n,
  CASE WHEN opening IS NULL THEN 'Opening unavailable' WHEN closing IS NULL THEN 'Closing unavailable'
   WHEN abs(opening+cash_in-cash_out-closing)<0.005 THEN 'Balances match'
   ELSE 'Balance mismatch' END FROM balances
$$;


--
-- Name: FUNCTION reporting_cash_period(p_from date, p_to date, p_scope text); Type: COMMENT
--

COMMENT ON FUNCTION public.reporting_cash_period(p_from date, p_to date, p_scope text) IS 'Live bounded period totals with fresh opening seed from source ledger. No daily history grid, snapshot seed or FIFO.';


--
-- Name: reporting_cash_period_entries(date, date, text); Type: FUNCTION
--

CREATE FUNCTION public.reporting_cash_period_entries(p_from date, p_to date, p_scope text) RETURNS SETOF public.reporting_cashflow_transactions
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 WITH seed AS (
  SELECT s.*,s.baseline+coalesce((SELECT sum(e."Net Movement") FROM public.reporting_cash_entries e
   WHERE e."Scope ID"=p_scope AND e."Date"<p_from),0) opening
  FROM public.reporting_cash_scopes s WHERE s.id=p_scope
 ), selected AS (
  SELECT e.*,CASE WHEN e."Date">=s.available THEN s.opening+sum(e."Net Movement") OVER
   (ORDER BY e."Date",e."Posted At",e."Ledger ID" COLLATE "C",e."Entry ID" COLLATE "C" ROWS UNBOUNDED PRECEDING) END balance
  FROM public.reporting_cash_entries e CROSS JOIN seed s
  WHERE e."Scope ID"=p_scope AND e."Date" BETWEEN p_from AND p_to AND p_to<=public.olap_reporting_date()
 )
 SELECT "Entry ID","Scope ID","Account","Ledger ID","Date","Posted At","Transaction Type","Counterparty",
 "From Account","To Account","Internal Transfer","Transaction Amount","Money In","Money Out","Net Movement",
 balance,"Available From","Notes" FROM selected
$$;


--
-- Name: FUNCTION reporting_cash_period_entries(p_from date, p_to date, p_scope text); Type: COMMENT
--

COMMENT ON FUNCTION public.reporting_cash_period_entries(p_from date, p_to date, p_scope text) IS 'Live opening seed then running balances only over selected transactions; unknown/pre-opening balances stay NULL.';


--
-- Name: request_business_history(date); Type: FUNCTION
--

CREATE FUNCTION public.request_business_history(d date) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF d IS NOT NULL THEN
  PERFORM set_config('business_history.from',least(d,nullif(current_setting('business_history.from',true),'')::date)::text,true);
 END IF;
END $$;


--
-- Name: seed_cash_statement_context(); Type: FUNCTION
--

CREATE FUNCTION public.seed_cash_statement_context() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 INSERT INTO public."Cash Statement Context"("Ref Partner") VALUES(NEW."Row ID") ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;


--
-- Name: selected_charge_ids(text); Type: FUNCTION
--

CREATE FUNCTION public.selected_charge_ids(value text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE ids text[]; unique_ids text[];
BEGIN
 IF value IS NULL OR btrim(value)='' THEN RETURN ARRAY[]::text[]; END IF;
 -- AppSheet EnumList uses a comma with optional ASCII spaces. Keys containing
 -- commas/whitespace are deliberately unsupported, never ambiguously decoded.
 IF value !~ '^[^,[:space:]]+( *, *[^,[:space:]]+)*$' THEN
  RAISE EXCEPTION 'Invalid selected charge key encoding';
 END IF;
 ids:=string_to_array(replace(value,' ',''),',');
 SELECT array_agg(k ORDER BY k COLLATE "C") INTO unique_ids FROM (SELECT DISTINCT unnest(ids) k) s;
 IF cardinality(ids)<>cardinality(unique_ids) THEN
  RAISE EXCEPTION 'Selected charge keys must be unique';
 END IF;
 RETURN unique_ids;
END $_$;


--
-- Name: sync_cash_ledger(text, text); Type: FUNCTION
--

CREATE FUNCTION public.sync_cash_ledger(p_type text, p_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE d date; amount numeric; from_holder text; to_holder text; movement text; source_key text; actor text;
 payment_id text; loan_id text; expense_id text; settlement_id text; from_account text; to_account text;
 rebate_settlement_id text; rule text; offset_amount numeric; -- R129
BEGIN
 IF pg_trigger_depth()<1 THEN RAISE EXCEPTION 'Cash synchronization requires a source trigger'; END IF;
 IF EXISTS(SELECT 1 FROM public.r005_cash_cutover_sources WHERE source_type=p_type AND source_row_id=p_id) THEN RETURN; END IF;
 CASE p_type
 WHEN 'Payment' THEN
  SELECT "Payment Date","Amount Received"::numeric,"Ref Received By Cash Holder","Created By","Ref Received By Cash Account"
   INTO d,amount,to_holder,actor,to_account FROM public."Payments" WHERE "Row ID"=p_id AND "Status"='Posted';
  movement:='Payment Receipt'; source_key:='PAYMENT:'||p_id; payment_id:=p_id;
 WHEN 'Loan' THEN
  SELECT "Loan Date","Principal Amount"::numeric,"Ref Disbursed From Cash Account" INTO d,amount,from_account FROM public."Loans" WHERE "Row ID"=p_id;
  movement:='Loan Disbursement'; source_key:='LOAN:'||p_id; loan_id:=p_id; from_holder:='ch:lisa';
 WHEN 'Business Expense' THEN
  SELECT coalesce("Paid Date","Expense Date") /* R140 V144: the paid date, else the Expense Date */,abs("Amount"::numeric),CASE WHEN "Amount"::numeric>0 THEN "Ref Paid By Cash Holder" END,
   CASE WHEN "Amount"::numeric<0 THEN "Ref Paid By Cash Holder" END,"Created By",
   CASE WHEN "Amount"::numeric>0 THEN "Ref Paid By Cash Account" END, CASE WHEN "Amount"::numeric<0 THEN "Ref Paid By Cash Account" END,
   "Rule Version",(SELECT o."Amount Received"::numeric FROM public."Payments" o WHERE o."Row ID"=x."Ref Offset Payment" AND o."Status"='Posted')
   INTO d,amount,from_holder,to_holder,actor,from_account,to_account,rule,offset_amount FROM public."Business Expenses" x WHERE "Row ID"=p_id;
  IF coalesce(from_holder,to_holder) IS NULL THEN amount:=NULL; END IF;
  -- R129: a REFERRAL_REBATE_V3 rebate moves cash only for its offset (the offset receipt nets it on Lisa's account); the
  -- pending rest moves on its settlement. Without an offset there is no movement.
  IF rule='REFERRAL_REBATE_V3' AND amount IS NOT NULL THEN amount:=CASE WHEN offset_amount>0 THEN offset_amount END; END IF;
  movement:='Business Expense'; source_key:='EXPENSE:'||p_id; expense_id:=p_id;
 WHEN 'Settlement' THEN
  SELECT "Transfer Date","Amount"::numeric,"Ref Paid From Cash Account" INTO d,amount,from_account FROM public."Settlements" WHERE "Row ID"=p_id AND "Status"='Completed';
  movement:='Partner Settlement'; source_key:='SETTLEMENT:'||p_id; settlement_id:=p_id; from_holder:='ch:lisa';
 WHEN 'Rebate Settlement' THEN
  -- R129: the settlement of pending referral rebates, out of Lisa's chosen account on the settlement date.
  SELECT s.settlement_date,s.amount,s.created_by,s.paid_by_cash_account INTO d,amount,actor,from_account FROM public.pwa_rebate_settlements s WHERE s.id=p_id;
  movement:='Rebate Settlement'; source_key:='REBATESETTLEMENT:'||p_id; rebate_settlement_id:=p_id; from_holder:='ch:lisa';
 ELSE RAISE EXCEPTION 'Unsupported cash source';
 END CASE;
 IF amount IS NULL THEN
  -- Derived projection follows source qualification, never a manual deletion path.
  DELETE FROM public."Cash Ledger" WHERE "Entry Origin"='System' AND "Source Type"=p_type AND "Source Key"=source_key;
  RETURN;
 END IF;
 IF d IS NULL THEN RAISE EXCEPTION 'Qualifying cash source requires its effective movement date'; END IF;
 INSERT INTO public."Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder",
  "Ref Payment","Ref Loan","Ref Business Expense","Ref Settlement","Entry Origin","Source Type","Source Key","Created By","Ref From Cash Account","Ref To Cash Account","Ref Rebate Settlement")
 VALUES('cash:'||source_key,d,movement,amount,from_holder,to_holder,payment_id,loan_id,expense_id,settlement_id,'System',p_type,source_key,coalesce(nullif(actor,''),'SQL'),from_account,to_account,rebate_settlement_id)
 ON CONFLICT ("Source Type","Source Key") WHERE "Entry Origin"='System' DO UPDATE SET
  "Movement Date"=EXCLUDED."Movement Date","Amount"=EXCLUDED."Amount",
  "Ref From Cash Holder"=EXCLUDED."Ref From Cash Holder","Ref To Cash Holder"=EXCLUDED."Ref To Cash Holder","Ref From Cash Account"=EXCLUDED."Ref From Cash Account","Ref To Cash Account"=EXCLUDED."Ref To Cash Account"
 WHERE ("Cash Ledger"."Movement Date","Cash Ledger"."Amount","Cash Ledger"."Ref From Cash Holder","Cash Ledger"."Ref To Cash Holder","Cash Ledger"."Ref From Cash Account","Cash Ledger"."Ref To Cash Account")
  IS DISTINCT FROM (EXCLUDED."Movement Date",EXCLUDED."Amount",EXCLUDED."Ref From Cash Holder",EXCLUDED."Ref To Cash Holder",EXCLUDED."Ref From Cash Account",EXCLUDED."Ref To Cash Account");
END $$;


--
-- Name: undo_loan_default(public."Loans"); Type: FUNCTION
--

CREATE FUNCTION public.undo_loan_default(p public."Loans") RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
#variable_conflict use_column
DECLARE posting text; pair_count integer; c record; evidence jsonb; prefix text; prior text:=current_setting('business_crud.default',true);
BEGIN
 IF pg_trigger_depth()=0 THEN RAISE EXCEPTION 'Undo default through Loans.Defaulted'; END IF;
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=p."Ref Borrowers" FOR UPDATE NOWAIT;
 PERFORM 1 FROM public."Charges" WHERE "Ref Loans"=p."Row ID" ORDER BY "Row ID" COLLATE "C" FOR UPDATE NOWAIT;
 IF coalesce(p."Defaulted",false) THEN
  -- The write-off event: the posting key every written-down charge records (legacy write-offs carry the undated id).
  FOR c IN SELECT ch."Notes" FROM public."Charges" ch WHERE ch."Ref Loans"=p."Row ID" AND NOT starts_with(ch."Row ID",'df10:')
    AND coalesce(ch."Notes",'') LIKE '%Default write-off %' ORDER BY ch."Row ID" COLLATE "C" LOOP
   BEGIN evidence:=substring(c."Notes" from 'Default write-off (\{[^\n]*\})$')::jsonb;
   EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Default charge evidence is malformed; reconcile before undo'; END;
   IF evidence->>'posting' IS NULL OR (posting IS NOT NULL AND posting<>evidence->>'posting') THEN
    RAISE EXCEPTION 'Default charge changed since write-off; reconcile before undo'; END IF;
   posting:=evidence->>'posting';
  END LOOP;
 END IF;
 IF posting IS NULL THEN
  SELECT c."Row ID" INTO posting FROM public."Charges" c JOIN public."Repayments" r ON r."Row ID"=c."Row ID"
   WHERE c."Ref Loans"=p."Row ID" AND starts_with(c."Row ID",'df10:')
   ORDER BY c."Charge Date" DESC,c."Row ID" COLLATE "C" DESC LIMIT 1;
  IF posting IS NULL THEN
   IF coalesce(p."Defaulted",false) THEN RAISE EXCEPTION 'Default loss posting no longer matches; reconcile its components before undo'; END IF;
   RAISE EXCEPTION 'Undo Default requires a recorded default loss';
  END IF;
 END IF;
 -- Verify the event's pair on its own. Only a write-off of a fully lost loan (amount 0) has no pair of its own.
 SELECT count(*) INTO pair_count FROM public."Charges" WHERE "Row ID"=posting;
 IF pair_count>0 OR NOT coalesce(p."Defaulted",false) OR NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"=p."Row ID" AND starts_with("Row ID",'df10:')) THEN
  IF NOT EXISTS(SELECT 1 FROM public."Repayments" r JOIN public."Charges" c ON c."Row ID"=r."Ref Charges"
    WHERE r."Row ID"=posting AND c."Row ID"=posting AND r."Ref Loans"=p."Row ID" AND c."Ref Loans"=p."Row ID"
     AND r."Ref Payment" IS NULL AND c."Principal Due"::numeric>0 AND r."Principal Paid"=c."Principal Due"
     AND r."Interest Paid"::numeric=-c."Principal Due"::numeric AND c."Interest Due"::numeric=-c."Principal Due"::numeric)
   OR (SELECT count(*) FROM public."Repayments" WHERE "Ref Charges"=posting)<>1 THEN
   RAISE EXCEPTION 'Default loss posting no longer matches; reconcile its components before undo'; END IF;
 END IF;
 PERFORM set_config('business_crud.default',p."Row ID",true);
 DELETE FROM public."Repayments" WHERE "Row ID"=posting;
 DELETE FROM public."Charges" WHERE "Row ID"=posting;
 IF coalesce(p."Defaulted",false) THEN
  FOR c IN SELECT * FROM public."Charges" WHERE "Ref Loans"=p."Row ID" AND NOT starts_with("Row ID",'df10:') LOOP
   IF coalesce(c."Notes",'') NOT LIKE '%Default write-off %' THEN
    IF c."Principal Due"::numeric+c."Interest Due"::numeric+c."Late Charge Due"::numeric>0 AND -- R118
     c."Principal Due"::numeric=(SELECT coalesce(sum("Principal Paid"::numeric),0) FROM public."Repayments" WHERE "Ref Charges"=c."Row ID") AND
     c."Interest Due"::numeric=(SELECT coalesce(sum("Interest Paid"::numeric),0) FROM public."Repayments" WHERE "Ref Charges"=c."Row ID") AND
     c."Late Charge Due"::numeric=(SELECT coalesce(sum("Late Charge Paid"::numeric),0) FROM public."Repayments" WHERE "Ref Charges"=c."Row ID") THEN CONTINUE; END IF;
    RAISE EXCEPTION 'Default charge has no original component evidence; reconcile before undo';
   END IF;
   prefix:=substring(c."Notes" from '(?s)^(.*)Default write-off \{[^\n]*\}$');
   BEGIN evidence:=substring(c."Notes" from 'Default write-off (\{[^\n]*\})$')::jsonb;
   EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Default charge evidence is malformed; reconcile before undo'; END;
   IF evidence IS NULL OR evidence->>'posting' IS DISTINCT FROM posting OR
    c."Principal Due"::numeric IS DISTINCT FROM (evidence->>'original_principal')::numeric-(evidence->>'written_off_principal')::numeric OR
    c."Interest Due"::numeric IS DISTINCT FROM (evidence->>'original_interest')::numeric-(evidence->>'written_off_interest')::numeric OR
    c."Late Charge Due"::numeric IS DISTINCT FROM coalesce((evidence->>'original_late')::numeric-(evidence->>'written_off_late')::numeric,c."Late Charge Due"::numeric) THEN
    RAISE EXCEPTION 'Default charge changed since write-off; reconcile before undo'; END IF;
   UPDATE public."Charges" SET "Principal Due"=(evidence->>'original_principal')::numeric::money,
    "Interest Due"=(evidence->>'original_interest')::numeric::money,"Late Charge Due"=coalesce((evidence->>'original_late')::numeric,c."Late Charge Due"::numeric)::money,"Notes"=nullif(regexp_replace(prefix,E'\n$',''),'')
    WHERE "Row ID"=c."Row ID";
  END LOOP;
 END IF;
 PERFORM set_config('business_crud.default',coalesce(prior,''),true);
END $_$;


--
-- Name: validate_net_settlement(); Type: FUNCTION
--

CREATE FUNCTION public.validate_net_settlement() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: vc_borrower_changed(); Type: FUNCTION
--

CREATE FUNCTION public.vc_borrower_changed() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN PERFORM public.r051_flush_parents('borrower'); RETURN NULL; END $$;


--
-- Name: vc_borrower_row(); Type: FUNCTION
--

CREATE FUNCTION public.vc_borrower_row() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 SELECT interest,principal,n,outstanding,active_interest,daily,closed,active
 INTO NEW."Total Interest Earned",NEW."Total Amount Loaned",NEW."Total Number of Loans",NEW."Total Outstanding Principal",
 NEW."Active Loan Interest Earned",NEW."Active Daily Interest",NEW."Has Closed Loan",NEW."Has Active Loan"
 FROM public.vc_borrower_values(NEW."Row ID"); RETURN NEW;
END $$;


--
-- Name: vc_borrower_values(text); Type: FUNCTION
--

CREATE FUNCTION public.vc_borrower_values(p_id text) RETURNS TABLE(interest numeric, principal numeric, n integer, outstanding numeric, active_interest numeric, daily numeric, closed boolean, active boolean)
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT coalesce(sum(r.i),0),coalesce(sum(l."Principal Amount"::numeric),0),count(*)::integer,
  coalesce(sum(coalesce(l."Principal Amount"::numeric,0)-coalesce(r.p,0)),0),
  coalesce(sum(r.i) FILTER(WHERE l."Loan Status"='ยังไม่ปิดยอด'),0),
  coalesce(sum(public.vc_daily_interest(l)),0),
  coalesce(bool_or(l."Loan Status"='ปิดยอดแล้ว'),false),coalesce(bool_or(l."Loan Status"='ยังไม่ปิดยอด'),false)
 FROM public."Loans" l LEFT JOIN LATERAL (
  SELECT sum("Interest Paid"::numeric+"Late Charge Paid"::numeric) i,sum("Principal Paid"::numeric) p
  FROM public."Repayments" WHERE "Ref Loans"=l."Row ID"
 ) r ON true WHERE l."Ref Borrowers"=p_id;
$$;


--
-- Name: vc_charge_row(); Type: FUNCTION
--

CREATE FUNCTION public.vc_charge_row() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 SELECT pp,ip,total,pr,ir,remaining,n,status,paid_date,lp,lr
 INTO NEW."Principal Paid",NEW."Interest Paid",NEW."Total Paid",NEW."Principal Remaining",NEW."Interest Remaining",
  NEW."Amount Remaining",NEW."Payment Count",NEW."Payment Status",NEW."Payment Date",NEW."Late Charge Paid",NEW."Late Charge Remaining"
 FROM public.vc_charge_values(NEW);
 RETURN NEW;
END $$;


--
-- Name: vc_charge_values(public."Charges"); Type: FUNCTION
--

CREATE FUNCTION public.vc_charge_values(p public."Charges") RETURNS TABLE(pp numeric, ip numeric, total numeric, pr numeric, ir numeric, remaining numeric, n integer, status text, paid_date date, lp numeric, lr numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 WITH a AS (
  SELECT coalesce(sum(r."Principal Paid"::numeric),0) pp,
   coalesce(sum(r."Interest Paid"::numeric),0) ip,coalesce(sum(r."Late Charge Paid"::numeric),0) lp,count(*)::integer n,max(r."Payment Date") d
  FROM public."Repayments" r WHERE r."Ref Charges"=p."Row ID"
 ), b AS (
  SELECT a.*,coalesce(p."Principal Due"::numeric,0)-pp pr,
   coalesce(p."Interest Due"::numeric,0)-ip ir,coalesce(p."Late Charge Due"::numeric,0)-lp lr FROM a
 ), c AS (
  SELECT b.*,CASE WHEN (SELECT l."Loan Status" FROM public."Loans" l WHERE l."Row ID"=p."Ref Loans")='ปิดยอดแล้ว'
   THEN 'ชำระแล้ว' WHEN pp+ip+lp=0 THEN 'รอชำระ' WHEN pr+ir+lr>0 THEN 'ชำระบางส่วน' ELSE 'ชำระแล้ว' END s FROM b
 ) SELECT pp,ip,pp+ip+lp,pr,ir,pr+ir+lr,n,s,CASE WHEN s='ชำระแล้ว' THEN d END,lp,lr FROM c;
$$;


--
-- Name: vc_daily_interest(public."Loans"); Type: FUNCTION
--

CREATE FUNCTION public.vc_daily_interest(p public."Loans") RETURNS numeric
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 SELECT CASE WHEN p."Auto Charge Enabled" IS TRUE AND p."Loan Status"='ยังไม่ปิดยอด' THEN
  CASE WHEN p."Loan Type"='ดอกเบี้ยรายวัน' THEN coalesce(p."Current Daily Interest"::numeric,0)
   WHEN p."Loan Type"='ผ่อนชำระรายวัน' AND p."Loan Date" IS NOT NULL AND p."Due Date">=p."Loan Date" AND p."Daily Payment Amount"::numeric>0
   THEN (p."Daily Payment Amount"::numeric*(p."Due Date"-p."Loan Date"+1)-coalesce(p."Principal Amount"::numeric,0))/(p."Due Date"-p."Loan Date"+1)
   ELSE 0 END ELSE 0 END;
$$;


--
-- Name: vc_daily_interest_row(); Type: FUNCTION
--

CREATE FUNCTION public.vc_daily_interest_row() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN NEW."Expected Daily Interest Amount":=public.vc_daily_interest(NEW); RETURN NEW; END $$;


--
-- Name: vc_loan_row(); Type: FUNCTION
--

CREATE FUNCTION public.vc_loan_row() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 SELECT coalesce(sum("Interest Paid"::numeric+"Late Charge Paid"::numeric),0),coalesce(sum("Principal Paid"::numeric),0),
  coalesce(sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)+"Late Charge Paid"::numeric),0)
 INTO NEW."Total Interest Received",NEW."Total Principal Received",NEW."Total Amount Received"
 FROM public."Repayments" WHERE "Ref Loans"=NEW."Row ID";
 NEW."Outstanding Principal":=coalesce(NEW."Principal Amount"::numeric,0)-NEW."Total Principal Received";
 NEW:=public.apply_principal_daily_interest(NEW,CASE WHEN TG_OP='UPDATE' THEN OLD ELSE NULL::public."Loans" END);
 -- zz_vc_daily_interest precedes this trigger. Refresh its result after adjusting
 -- principal/daily amount so downstream borrower rollups read the same state.
 NEW."Expected Daily Interest Amount":=public.vc_daily_interest(NEW);
 RETURN NEW;
END $$;


--
-- Name: vc_loan_status_changed(); Type: FUNCTION
--

CREATE FUNCTION public.vc_loan_status_changed() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE k text;
BEGIN
 FOR k IN SELECT "Row ID" FROM public."Charges" WHERE "Ref Loans"=NEW."Row ID" ORDER BY "Row ID" LOOP
  PERFORM public.vc_refresh_charge(k);
 END LOOP;
 RETURN NULL;
END $$;


--
-- Name: vc_lock_daily_parent(); Type: FUNCTION
--

CREATE FUNCTION public.vc_lock_daily_parent() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF ROW(OLD."Auto Charge Enabled",OLD."Loan Type",OLD."Loan Date",OLD."Due Date",OLD."Current Daily Interest",OLD."Daily Payment Amount")
 IS DISTINCT FROM ROW(NEW."Auto Charge Enabled",NEW."Loan Type",NEW."Loan Date",NEW."Due Date",NEW."Current Daily Interest",NEW."Daily Payment Amount") THEN
  BEGIN PERFORM 1 FROM public."Borrowers" WHERE "Row ID" IN(OLD."Ref Borrowers",NEW."Ref Borrowers") ORDER BY "Row ID" FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'Borrower is busy; sync and retry'; END;
 END IF; RETURN NEW;
END $$;


--
-- Name: vc_lock_parents(); Type: FUNCTION
--

CREATE FUNCTION public.vc_lock_parents() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE oldj jsonb:=CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
 newj jsonb:=CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
 b text;
BEGIN
 IF TG_TABLE_NAME='Loans' AND TG_OP='UPDATE' AND
  ROW(oldj->'Ref Borrowers',oldj->'Principal Amount',oldj->'Loan Status') IS NOT DISTINCT FROM
  ROW(newj->'Ref Borrowers',newj->'Principal Amount',newj->'Loan Status') THEN RETURN NEW; END IF;
 FOR b IN
  SELECT DISTINCT borrower FROM (
   SELECT oldj->>'Ref Borrowers' borrower WHERE TG_TABLE_NAME='Loans'
   UNION ALL SELECT newj->>'Ref Borrowers' WHERE TG_TABLE_NAME='Loans'
   UNION ALL SELECT l."Ref Borrowers" FROM public."Loans" l WHERE l."Row ID" IN (oldj->>'Ref Loans',newj->>'Ref Loans')
   UNION ALL SELECT l."Ref Borrowers" FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
    WHERE c."Row ID" IN (oldj->>'Ref Charges',newj->>'Ref Charges')
  ) q WHERE borrower IS NOT NULL ORDER BY borrower
 LOOP
  BEGIN
   PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=b FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'Borrower is busy; sync and retry'; END;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;


--
-- Name: vc_lock_payment_parents(); Type: FUNCTION
--

CREATE FUNCTION public.vc_lock_payment_parents() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE o jsonb:=CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
 n jsonb:=CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END; k text;
BEGIN
 FOR k IN SELECT DISTINCT "Ref Borrower" FROM public."Payments" WHERE "Row ID" IN(o->>'Ref Payment',n->>'Ref Payment') ORDER BY "Ref Borrower"
 LOOP
  BEGIN PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=k FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'Borrower is busy; sync and retry'; END;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;


--
-- Name: vc_payment_changed(); Type: FUNCTION
--

CREATE FUNCTION public.vc_payment_changed() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN PERFORM public.r051_flush_parents('payment'); RETURN NULL; END $$;


--
-- Name: vc_payment_row(); Type: FUNCTION
--

CREATE FUNCTION public.vc_payment_row() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 SELECT coalesce(sum("Allocated Amount"::numeric),0) INTO NEW."Planned Allocation Amount"
 FROM public."Payment Allocations" WHERE "Ref Payment"=NEW."Row ID";
 SELECT coalesce(sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)+"Late Charge Paid"::numeric),0) INTO NEW."Posted Amount"
 FROM public."Repayments" WHERE "Ref Payment"=NEW."Row ID";
 RETURN NEW;
END $$;


--
-- Name: vc_refresh_borrower(text); Type: FUNCTION
--

CREATE FUNCTION public.vc_refresh_borrower(p_id text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 UPDATE public."Borrowers" b SET "Total Interest Earned"=v.interest,"Total Amount Loaned"=v.principal,
 "Total Number of Loans"=v.n,"Total Outstanding Principal"=v.outstanding,"Active Loan Interest Earned"=v.active_interest,
 "Active Daily Interest"=v.daily,"Has Closed Loan"=v.closed,"Has Active Loan"=v.active
 FROM public.vc_borrower_values(p_id) v WHERE b."Row ID"=p_id AND
 ROW(b."Total Interest Earned",b."Total Amount Loaned",b."Total Number of Loans",b."Total Outstanding Principal",b."Active Loan Interest Earned",b."Active Daily Interest",b."Has Closed Loan",b."Has Active Loan")
 IS DISTINCT FROM ROW(v.interest,v.principal,v.n,v.outstanding,v.active_interest,v.daily,v.closed,v.active);
END $$;


--
-- Name: vc_refresh_charge(text); Type: FUNCTION
--

CREATE FUNCTION public.vc_refresh_charge(p_id text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 UPDATE public."Charges" c SET "Principal Paid"=v.pp,"Interest Paid"=v.ip,"Total Paid"=v.total,
  "Principal Remaining"=v.pr,"Interest Remaining"=v.ir,"Amount Remaining"=v.remaining,
  "Payment Count"=v.n,"Payment Status"=v.status,"Payment Date"=v.paid_date,"Late Charge Paid"=v.lp,"Late Charge Remaining"=v.lr
 FROM (SELECT x."Row ID",v.* FROM public."Charges" x CROSS JOIN LATERAL public.vc_charge_values(x) v WHERE x."Row ID"=p_id) v
 WHERE c."Row ID"=v."Row ID" AND
 ROW(c."Principal Paid",c."Interest Paid",c."Total Paid",c."Principal Remaining",c."Interest Remaining",c."Amount Remaining",c."Payment Count",c."Payment Status",c."Payment Date",c."Late Charge Paid",c."Late Charge Remaining")
 IS DISTINCT FROM ROW(v.pp,v.ip,v.total,v.pr,v.ir,v.remaining,v.n,v.status,v.paid_date,v.lp,v.lr);
END $$;


--
-- Name: vc_refresh_loan(text); Type: FUNCTION
--

CREATE FUNCTION public.vc_refresh_loan(p_id text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
 IF pg_trigger_depth()>=2 AND p_id=nullif(current_setting('business_crud.default',true),'') THEN RETURN; END IF;
 UPDATE public."Loans" l SET "Total Interest Received"=v.i,"Total Principal Received"=v.p,
  "Total Amount Received"=v.a,"Outstanding Principal"=coalesce(l."Principal Amount"::numeric,0)-v.p
 FROM (SELECT coalesce(sum("Interest Paid"::numeric+"Late Charge Paid"::numeric),0) i,coalesce(sum("Principal Paid"::numeric),0) p,
  coalesce(sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)+"Late Charge Paid"::numeric),0) a
  FROM public."Repayments" WHERE "Ref Loans"=p_id) v
 WHERE l."Row ID"=p_id AND ROW(l."Total Interest Received",l."Total Principal Received",l."Total Amount Received",l."Outstanding Principal")
 IS DISTINCT FROM ROW(v.i,v.p,v.a,coalesce(l."Principal Amount"::numeric,0)-v.p);
END $$;


--
-- Name: vc_refresh_payment(text); Type: FUNCTION
--

CREATE FUNCTION public.vc_refresh_payment(p_id text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE a numeric; r numeric;
BEGIN
 IF p_id=nullif(current_setting('payment_crud.id',true),'') AND pg_trigger_depth()>=2 THEN RETURN; END IF;
 SELECT coalesce(sum("Allocated Amount"::numeric),0) INTO a FROM public."Payment Allocations" WHERE "Ref Payment"=p_id;
 SELECT coalesce(sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)+"Late Charge Paid"::numeric),0) INTO r FROM public."Repayments" WHERE "Ref Payment"=p_id;
 UPDATE public."Payments" SET "Planned Allocation Amount"=a,"Posted Amount"=r WHERE "Row ID"=p_id
 AND ROW("Planned Allocation Amount","Posted Amount") IS DISTINCT FROM ROW(a,r);
END $$;


--
-- Name: vc_repayment_changed(); Type: FUNCTION
--

CREATE FUNCTION public.vc_repayment_changed() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN PERFORM public.r051_flush_parents('charge'); PERFORM public.r051_flush_parents('loan'); RETURN NULL; END $$;
