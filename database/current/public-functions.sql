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
DECLARE parent text;calculation jsonb;m jsonb;
BEGIN
 SELECT "Ref Borrowers" INTO parent FROM public."Loans" WHERE "Row ID"=p_loan;
 PERFORM 1 FROM public."Borrowers" WHERE "Row ID"=parent FOR UPDATE;
 PERFORM 1 FROM public."Loans" WHERE "Row ID"=p_loan FOR UPDATE;
 PERFORM 1 FROM public."Charges" WHERE "Ref Loans"=p_loan ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
 calculation:=public.loan_close_calculation_v83(p_loan,p_day);
 IF p_expected IS NOT NULL AND calculation->>'planHash' IS DISTINCT FROM p_expected THEN RAISE EXCEPTION USING ERRCODE='P5B09',MESSAGE='Close plan changed';END IF;
 m:=calculation->'mutation';
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
  AND before_value."Amount Received"::numeric=(SELECT coalesce(sum("Principal Paid"::numeric+"Interest Paid"::numeric),0) FROM public."Repayments" WHERE "Ref Payment"=p_payment)
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
  WHEN 'Charges' THEN ARRAY['Charge Date','Principal Due','Interest Due','Ref Loans']
  WHEN 'Business Expenses' THEN ARRAY['Expense Date','Amount','Partner A Expense','Partner B Expense']
  WHEN 'Cash Ledger' THEN ARRAY['Movement Date','Amount','Movement Type','Ref From Cash Holder','Ref To Cash Holder','Ref From Cash Account','Ref To Cash Account']
  WHEN 'Cash Pool Contributions' THEN ARRAY['Contribution Date','Amount','Transaction Type','Ref Partner']
  WHEN 'Settlements' THEN ARRAY['Transfer Date','Amount','Status','Ref Partner']
  WHEN 'Repayments' THEN ARRAY['Payment Date','Principal Paid','Interest Paid','Ref Loans','Ref Charges']
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
  IF coalesce((to_jsonb(OLD)->>'Defaulted')::boolean,false) THEN RAISE EXCEPTION 'Undo Default before deleting this loan'; END IF;
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
        c."Principal Due"::numeric+c."Interest Due"::numeric >
          (SELECT coalesce(sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric),0)
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
BEGIN
 IF pg_trigger_depth()<1 THEN RAISE EXCEPTION 'Referral creation is only supported by loan-close trigger'; END IF;
 SELECT * INTO l FROM public."Loans" WHERE "Row ID"=p_loan FOR UPDATE;
 IF l."Loan Status" IS DISTINCT FROM 'ปิดยอดแล้ว' OR coalesce(l."Defaulted",false)
   OR l."Close Date" IS NULL OR l."Ref Closing Payment" IS NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Source Key"='REFERRAL_REBATE:'||p_loan) THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Row ID"=l."Ref Closing Payment" AND "Status"='Posted' AND "Amount Received"::numeric>0) THEN RETURN; END IF;
 SELECT sum("Principal Paid"::numeric),sum("Interest Paid"::numeric) INTO principal,profit
 FROM public."Repayments" WHERE "Ref Loans"=p_loan;
 IF coalesce(principal,0)<l."Principal Amount"::numeric OR coalesce(profit,0)<=0 THEN RETURN; END IF;
 SELECT "Ref Referrer" INTO referrer FROM public."Borrowers" WHERE "Row ID"=l."Ref Borrowers";
 IF referrer IS NULL THEN RETURN; END IF;
 SELECT "Borrower Name" INTO payee FROM public."Borrowers" WHERE "Row ID"=referrer;
 rebate:=least(round(profit*0.10),1000);
 IF rebate<=0 THEN RETURN; END IF;
 INSERT INTO public."Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Payee Name",
  "Ref Payee Borrower","Ref Related Borrower","Ref Related Loan","Source Type","Source Key","Gross Profit Basis","Rule Version","Created By")
 VALUES('rr1:'||p_loan,l."Close Date",'Referral Rebate / เงินคืนค่าแนะนำลูกค้า',rebate::money,payee,referrer,l."Ref Borrowers",p_loan,
  'Referral Rebate','REFERRAL_REBATE:'||p_loan,profit::money,'REFERRAL_REBATE_V1','SQL:loan-close')
 ON CONFLICT ("Source Key") WHERE nullif(btrim("Source Key"),'') IS NOT NULL DO NOTHING;
END $$;


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


--
-- Name: default_posting_guard(); Type: FUNCTION
--

CREATE FUNCTION public.default_posting_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE derived text[]:=ARRAY['Principal Paid','Interest Paid','Total Paid','Principal Remaining','Interest Remaining','Amount Remaining','Payment Count','Payment Status','Payment Date'];
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
    AND (to_jsonb(NEW)-derived-ARRAY['Principal Due','Interest Due','Notes'])
      IS NOT DISTINCT FROM (to_jsonb(OLD)-derived-ARRAY['Principal Due','Interest Due','Notes']) THEN RETURN NEW; END IF;
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
  IF NOT starts_with(NEW."Row ID",'lc7:') AND NOT starts_with(NEW."Row ID",'df10:') THEN
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
    IF EXISTS(SELECT 1 FROM public."Charges" WHERE "Ref Loans"=l."Row ID" AND "Charge Date"=p_business_date) THEN CONTINUE; END IF;
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
  SELECT min("Row ID") INTO existing FROM public."Charges"
    WHERE "Ref Loans"=p_loan AND "Charge Date"=p_business_date;
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
      WHERE "Ref Loans"=p_loan AND "Charge Date"<=p_business_date;
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
   IF NEW."Amount"::numeric>0 AND NEW."Ref Paid By Cash Holder" IS NULL THEN RAISE EXCEPTION 'New positive expenses require an explicit cash payer'; END IF;
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
    AS $$
DECLARE l public."Loans"%ROWTYPE; outstanding numeric;scheduled numeric;missing numeric;interest numeric:=0;
 target text;today_count integer;latest date;mutation jsonb:='null'::jsonb;lines jsonb;total numeric;context jsonb;
BEGIN
 SELECT * INTO l FROM public."Loans" WHERE "Row ID"=p_loan;
 IF NOT FOUND THEN RAISE EXCEPTION 'Target loan must belong to the payment borrower';END IF;
 IF p_exclude_payment IS NOT NULL AND l."Ref Closing Payment"=p_exclude_payment AND l."Defaulted" IS NOT TRUE THEN l."Loan Status":='ยังไม่ปิดยอด';END IF;
 IF l."Loan Status" IS DISTINCT FROM 'ยังไม่ปิดยอด' OR l."Loan Type" IS DISTINCT FROM 'ดอกเบี้ยรายวัน' OR NOT coalesce(l."Auto Charge Enabled",false) THEN RAISE EXCEPTION 'Loan Close requires an open auto-enabled daily-interest loan';END IF;
 IF l."Loan Date" IS NULL OR l."Loan Date">p_day OR l."Current Daily Interest" IS NULL OR l."Current Daily Interest"::numeric<0 OR l."Principal Amount" IS NULL THEN RAISE EXCEPTION 'Loan Close requires valid loan date, principal and daily interest';END IF;
 IF EXISTS(SELECT 1 FROM public."Charges" c LEFT JOIN LATERAL(SELECT coalesce(sum(r."Principal Paid"::numeric),0) p,coalesce(sum(r."Interest Paid"::numeric),0) i FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID" AND (p_exclude_payment IS NULL OR r."Ref Payment" IS DISTINCT FROM p_exclude_payment)) paid ON true WHERE c."Ref Loans"=p_loan AND(c."Principal Due" IS NULL OR c."Interest Due" IS NULL OR c."Principal Due"::numeric<paid.p OR c."Interest Due"::numeric<paid.i)) THEN RAISE EXCEPTION 'Loan charge components require reconciliation before closing';END IF;
 SELECT l."Principal Amount"::numeric-coalesce(sum("Principal Paid"::numeric),0) INTO outstanding FROM public."Repayments" WHERE "Ref Loans"=p_loan AND (p_exclude_payment IS NULL OR "Ref Payment" IS DISTINCT FROM p_exclude_payment);
 IF outstanding IS NULL OR outstanding<=0 THEN RAISE EXCEPTION 'Loan has no outstanding principal to close';END IF;
 SELECT coalesce(sum(c."Principal Due"::numeric-(SELECT coalesce(sum(r."Principal Paid"::numeric),0) FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID" AND (p_exclude_payment IS NULL OR r."Ref Payment" IS DISTINCT FROM p_exclude_payment))),0) INTO scheduled FROM public."Charges" c WHERE c."Ref Loans"=p_loan;
 missing:=outstanding-scheduled;
 IF missing<0 THEN RAISE EXCEPTION 'Principal already due exceeds outstanding loan principal';END IF;
 SELECT count(*),min("Row ID") INTO today_count,target FROM public."Charges" WHERE "Ref Loans"=p_loan AND "Charge Date"=p_day;
 IF today_count>1 THEN RAISE EXCEPTION 'Multiple charges today require reconciliation before closing';END IF;
 IF today_count=0 THEN
  SELECT max("Charge Date") INTO latest FROM public."Charges" WHERE "Ref Loans"=p_loan;
  interest:=l."Current Daily Interest"::numeric*greatest(0,p_day-coalesce(latest,l."Loan Date"));
  IF missing+interest>0 THEN
   target:='lc7:'||length(p_loan)||':'||p_loan||':'||p_day::text;
   mutation:=jsonb_build_object('kind','insert','chargeId',target,'principal',missing::text,'interest',interest::text);
  END IF;
 ELSIF missing>0 THEN mutation:=jsonb_build_object('kind','increase','chargeId',target,'principal',missing::text,'interest','0');END IF;
 IF target IS NULL THEN SELECT "Row ID" INTO target FROM public."Charges" WHERE "Ref Loans"=p_loan ORDER BY "Charge Date" DESC,"Row ID" COLLATE "C" DESC LIMIT 1;END IF;
 WITH paid AS(SELECT r."Ref Charges" id,sum(r."Principal Paid"::numeric) p,sum(r."Interest Paid"::numeric) i FROM public."Repayments" r WHERE r."Ref Loans"=p_loan AND (p_exclude_payment IS NULL OR r."Ref Payment" IS DISTINCT FROM p_exclude_payment) GROUP BY r."Ref Charges"),
 projected AS(SELECT c."Row ID" id,c."Charge Date" AS charge_day,c."Principal Due"::numeric-coalesce(paid.p,0)+CASE WHEN mutation->>'kind'='increase' AND c."Row ID"=target THEN missing ELSE 0 END p,c."Interest Due"::numeric-coalesce(paid.i,0) i FROM public."Charges" c LEFT JOIN paid ON paid.id=c."Row ID" WHERE c."Ref Loans"=p_loan
 UNION ALL SELECT target,p_day,missing,interest WHERE mutation->>'kind'='insert')
 SELECT coalesce(jsonb_agg(jsonb_build_object('chargeId',id,'principal',trim_scale(p)::text,'interest',trim_scale(i)::text,'expectedPrincipalRemaining',trim_scale(p)::text,'expectedInterestRemaining',trim_scale(i)::text,'chargeDate',charge_day::text) ORDER BY id COLLATE "C") FILTER(WHERE p+i>0),'[]'::jsonb),sum(p+i) INTO lines,total FROM projected;
 IF total IS NULL OR total<=0 OR total<>trunc(total) THEN RAISE EXCEPTION 'Final receipt must be a positive whole-baht amount';END IF;
 context:=jsonb_build_object('sourceVersion',public.pwa_loan_version_v2(p_loan),'excludedPayment',p_exclude_payment,'businessDate',p_day::text,'borrowerId',l."Ref Borrowers",'amount',trim_scale(total)::text,'allocations',lines,'targetChargeId',target,'targetLoanId',p_loan,'mutation',mutation);
 IF p_exclude_payment IS NULL THEN context:=context-'excludedPayment';END IF;
 RETURN context||jsonb_build_object('planHash',encode(sha256(convert_to(context::text,'UTF8')),'hex'));
END $$;


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
 SELECT coalesce(sum(round(r."Interest Paid"::numeric*CASE WHEN c.pool>0 THEN coalesce(c.owned,0)/c.pool ELSE 0 END)),0) n
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
DECLARE pool numeric; a numeric; b numeric; unknown_count integer;
BEGIN
 SELECT sum(n),coalesce(sum(n) FILTER(WHERE role='A'),0),coalesce(sum(n) FILTER(WHERE role='B'),0),
   count(*) FILTER(WHERE role IS NULL OR role NOT IN ('A','B'))
 INTO pool,a,b,unknown_count FROM (
 SELECT CASE WHEN c."Transaction Type"='Contribution' THEN c."Amount"::numeric ELSE -c."Amount"::numeric END n,
 p."Partner Role" role FROM public."Cash Pool Contributions" c
 LEFT JOIN public."Partners" p ON p."Row ID"=c."Ref Partner" WHERE c."Contribution Date"<=p_date) s;
 IF p_date IS NULL OR coalesce(pool,0)<=0 OR unknown_count>0 OR a<0 OR b<0 OR p_role NOT IN ('A','B') THEN
   RAISE EXCEPTION 'Expense allocation requires a positive A/B contribution pool on its allocation date';
 END IF;
 RETURN CASE WHEN p_role='A' THEN a/pool ELSE 1-a/pool END;
END $$;


--
-- Name: payment_charge_balances(text); Type: FUNCTION
--

CREATE FUNCTION public.payment_charge_balances(p_id text) RETURNS TABLE(charge text, loan text, charge_day date, principal numeric, interest numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  SELECT c."Row ID",c."Ref Loans",c."Charge Date",
    c."Principal Due"::numeric-paid.p,c."Interest Due"::numeric-paid.i
  FROM public."Payments" p
  JOIN public."Loans" l ON l."Ref Borrowers"=p."Ref Borrower"
  JOIN public."Charges" c ON c."Ref Loans"=l."Row ID"
  LEFT JOIN public."Charges" target ON target."Row ID"=p."Ref Target Charge"
  CROSS JOIN LATERAL (
    SELECT coalesce(sum(r."Principal Paid"::numeric),0) p,
           coalesce(sum(r."Interest Paid"::numeric),0) i
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
    OR EXISTS(SELECT 1 FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND c."Principal Due"::numeric+c."Interest Due"::numeric>
     (SELECT coalesce(sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric),0) FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID"))) THEN
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
DECLARE b text; l public."Loans"%ROWTYPE; context_before text; owned jsonb; parents_before text:=current_setting('payment_crud.parents',true); cleanup_before text:=current_setting('payment_crud.id',true); actual public."Payments"%ROWTYPE;
BEGIN
 IF pg_trigger_depth()=0 AND NOT public.pwa_native_inverse_permitted_v2(p_old."Row ID") THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Protected correction context required';END IF;
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
  DELETE FROM public."Business Expenses" WHERE "Ref Related Loan"=l."Row ID" AND "Source Type"='Referral Rebate';
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
-- Name: post_loan_default(public."Loans", date, text); Type: FUNCTION
--

CREATE FUNCTION public.post_loan_default(p_loan public."Loans", p_date date, p_actor text) RETURNS numeric
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
   SELECT "Ref Charges" charge,sum("Principal Paid"::numeric) principal,sum("Interest Paid"::numeric) interest,count(*) FILTER(WHERE "Principal Paid" IS NULL OR "Interest Paid" IS NULL) invalid
   FROM public."Repayments" WHERE "Ref Charges" IN (SELECT line->>'chargeId' FROM lines) GROUP BY "Ref Charges"
  ), plan AS MATERIALIZED (
   SELECT line,c."Charge Date" AS day,l."Ref Borrowers" borrower,c."Principal Due"::numeric-coalesce(paid.principal,0) principal,c."Interest Due"::numeric-coalesce(paid.interest,0) interest,coalesce(paid.invalid,0) invalid,row_number() OVER(ORDER BY c."Charge Date" DESC,(line->>'chargeId') COLLATE "C" DESC) ord
   FROM lines LEFT JOIN public."Charges" c ON c."Row ID"=line->>'chargeId' LEFT JOIN public."Loans" l ON l."Row ID"=c."Ref Loans" LEFT JOIN paid ON paid.charge=c."Row ID"
  )
  SELECT jsonb_agg(jsonb_build_object('charge',line->>'chargeId','day',day,'principal',principal,'interest',interest,'paidPrincipal',(line->>'principal')::numeric,'paidInterest',(line->>'interest')::numeric,'ord',ord) ORDER BY ord),
   bool_or(borrower IS DISTINCT FROM p."Ref Borrower" OR invalid>0 OR day IS NULL OR principal IS NULL OR interest IS NULL OR principal<0 OR interest<0 OR principal<>trunc(principal) OR interest<>trunc(interest) OR (line->>'principal')::numeric>principal OR (line->>'interest')::numeric>interest)
  INTO projected,invalid_plan FROM plan;
  IF invalid_plan IS DISTINCT FROM false OR jsonb_array_length(projected)<>jsonb_array_length(command->'allocations') THEN RAISE EXCEPTION 'Explicit allocation exceeds current components';END IF;
  INSERT INTO public."Payment Allocations"("Row ID","Ref Payment","Ref Charge","Charge Date Snapshot","Charge Row Number Snapshot","Interest Remaining Snapshot","Principal Remaining Snapshot","Amount Remaining Snapshot","Allocation Order","Allocated Interest","Allocated Principal","Allocated Amount","Created At")
  SELECT 'pc6:'||length(p_id)||':'||p_id||':'||charge,p_id,charge,day,-ord,interest::money,principal::money,(principal+interest)::money,ord,"paidInterest"::money,"paidPrincipal"::money,("paidPrincipal"+"paidInterest")::money,statement_timestamp() AT TIME ZONE 'Asia/Bangkok'
  FROM jsonb_to_recordset(projected) AS x(charge text,day date,principal numeric,interest numeric,"paidPrincipal" numeric,"paidInterest" numeric,ord integer);
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
 SELECT * INTO r FROM public.pwa_payment_commands p WHERE p.request_id=$1 AND p.actor_issuer=$2 AND p.actor_subject=$3 AND p.canonical_json::jsonb#>>'{command,schemaVersion}' IN ('7','8');
 IF NOT FOUND THEN RETURN jsonb_build_object('kind','unresolved'); END IF;
 c:=r.canonical_json::jsonb->'command';
 SELECT EXISTS(SELECT 1 FROM public."Payments" p WHERE p."Row ID"=r.payment_id AND p."Status"='Posted'
  AND p."Ref Borrower"=(c->>'borrowerId') AND p."Ref Received By Cash Account"=(c->>'cashAccountId')
  AND p."Amount Received"::numeric=((c->>'amountReceived'))::numeric AND p."Payment Date"=((c->>'paymentDate'))::date
  AND p."Created By"=r.actor_login_email AND p."Payment Method"='Bank Transfer' AND p."Allocation Method"='Lump Sum'
  AND p."Bank Reference"=(c->>'bankReference') AND to_char(p."Created At",'YYYY-MM-DD HH24:MI')=(c->>'paymentDate')||' '||(c->>'transferTime')
  AND (SELECT coalesce(sum(x."Principal Paid"::numeric+x."Interest Paid"::numeric),0) FROM public."Repayments" x WHERE x."Ref Payment"=p."Row ID")=((c->>'amountReceived'))::numeric) INTO matched;
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
  IF p<0 OR (p=0 AND interest=0 AND NOT(op='charge.update' AND EXISTS(SELECT 1 FROM public."Payment Allocations" pa JOIN public."Payments" pay ON pay."Row ID"=pa."Ref Payment" WHERE pa."Ref Charge"=target AND pay."Status"='Posted') AND NOT EXISTS(SELECT 1 FROM public."Payment Allocations" WHERE "Ref Charge"=target AND "Allocated Amount"::numeric<>0) AND NOT EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Charges"=target AND "Principal Paid"::numeric+"Interest Paid"::numeric<>0))) THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 END IF;
 IF op='charge.create' AND coalesce(l."Auto Charge Enabled",false) AND l."Loan Type" IN('ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน') AND (i->>'chargeDate')::date=l."Loan Date" AND p+interest>0 AND NOT EXISTS(SELECT 1 FROM public."Repayments" WHERE "Ref Charges"=target) AND NOT EXISTS(SELECT 1 FROM public."Payments" WHERE "Ref Target Charge"=target AND "Allocation Method"='First-day Auto') THEN
  IF p<>trunc(p) OR interest<>trunc(interest) OR interest<0 THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
  payment:='fd6:'||target;
  plan:=jsonb_build_object('borrowerId',l."Ref Borrowers",'amountReceived',trim_scale(p+interest)::text,'allocations',jsonb_build_array(jsonb_build_object('chargeId',target,'principal',trim_scale(p)::text,'interest',trim_scale(interest)::text,'expectedPrincipalRemaining',trim_scale(p)::text,'expectedInterestRemaining',trim_scale(interest)::text,'chargeDate',i->>'chargeDate')),'allocationMethod','First-day Auto','targetChargeId',target,'targetLoanId',NULL,'cashAccountId',coalesce(l."Ref Disbursed From Cash Account",public.default_cash_account('ch:lisa')),'paymentDate',l."Loan Date"::text,'paymentMethod','Net-off at Disbursement');
 END IF;
 result_value:=jsonb_build_object('operation',op,'targetType','charge','targetId',target,'paymentId',payment,'plan',plan,'predecessorRequestId',NULL,'sourceCreatedBy',CASE WHEN payment IS NOT NULL THEN l."Created By" ELSE NULL END);
 IF payment IS NOT NULL THEN INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code,result_json) VALUES((e->>'requestId')::uuid,2,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',canonical,encode(sha256(convert_to(canonical,'UTF8')),'hex'),'applied',NULL,NULL,result_value);END IF;
 BEGIN
 CASE op WHEN 'charge.create' THEN INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes") VALUES(target,new_loan,(i->>'chargeDate')::date,p::money,interest::money,i->>'notes');
 WHEN 'charge.update' THEN UPDATE public."Charges" SET "Ref Loans"=new_loan,"Charge Date"=(i->>'chargeDate')::date,"Principal Due"=p::money,"Interest Due"=interest::money,"Notes"=i->>'notes' WHERE "Row ID"=target;
 WHEN 'charge.delete' THEN DELETE FROM public."Charges" WHERE "Row ID"=target;END CASE;
 EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B05';
 WHEN SQLSTATE 'P0001' THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
 IF message IN('Charge has receipts; reassign or delete those receipts first','Charge has receipts on its original loan; reassign them first') THEN RAISE EXCEPTION USING ERRCODE='P5B05';
 ELSIF message='Charge amount cannot be less than its posted component payments' THEN RAISE EXCEPTION USING ERRCODE='P5B06';ELSE RAISE;END IF;
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
DECLARE e jsonb:=canonical::jsonb;c jsonb:=e->'command';i jsonb:=c->'inputs';a jsonb:=e->'actor';op text:=c->>'operation';target text:=c->>'targetId';old public."Business Expenses"%ROWTYPE;holder text;message text;categories text[]:=ARRAY['Collection Cost / ค่าใช้จ่ายติดตามหนี้','Transportation / ค่าเดินทาง','Bank / Transfer Fee / ค่าธรรมเนียมธนาคารและโอนเงิน','Software / Subscription / ค่าซอฟต์แวร์และสมาชิก','Other / อื่น ๆ','Referral Rebate / เงินคืนค่าแนะนำลูกค้า'];
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
 IF op='expense.create' AND (i->>'amount')::numeric>0 AND holder IS NULL THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
 END IF;
 BEGIN
 IF op='expense.create' THEN INSERT INTO public."Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Payee Name","Ref Related Borrower","Ref Related Loan","Notes","Ref Paid By Cash Account","Ref Paid By Cash Holder","Source Type","Created By") VALUES(target,(i->>'expenseDate')::date,i->>'category',(i->>'amount')::numeric::money,i->>'payeeName',i->>'relatedBorrowerId',i->>'relatedLoanId',i->>'notes',i->>'paidByAccountId',holder,'Manual',a->>'loginEmail');
 ELSIF op='expense.update' THEN UPDATE public."Business Expenses" SET "Expense Date"=(i->>'expenseDate')::date,"Expense Category"=i->>'category',"Amount"=(i->>'amount')::numeric::money,"Payee Name"=i->>'payeeName',"Ref Related Borrower"=i->>'relatedBorrowerId',"Ref Related Loan"=i->>'relatedLoanId',"Notes"=i->>'notes',"Ref Paid By Cash Account"=i->>'paidByAccountId',"Ref Paid By Cash Holder"=holder WHERE "Row ID"=target;
 ELSE DELETE FROM public."Business Expenses" WHERE "Row ID"=target;END IF;
 EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B05';WHEN SQLSTATE 'P0001' THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
 IF message='Correct linked reimbursement before changing expense away from a positive Tommy-paid expense' THEN RAISE EXCEPTION USING ERRCODE='P5B05';ELSIF message='Related loan does not belong to related borrower' THEN RAISE EXCEPTION USING ERRCODE='P5B04';ELSIF message IN('Expense allocation requires a positive A/B contribution pool on its allocation date','A negative manual adjustment requires an explanatory note') THEN RAISE EXCEPTION USING ERRCODE='P5B06';ELSE RAISE;END IF;END;
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
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(calculation->'allocations') line WHERE line->>'principal'!~'^(0|[1-9][0-9]*)$' OR line->>'interest'!~'^(0|[1-9][0-9]*)$' OR line->>'chargeDate' IS NULL) THEN RAISE EXCEPTION USING ERRCODE='P5B06';END IF;
 PERFORM public.apply_loan_close_calculation_v83(target,day,i->>'expectedPlanHash');
 plan:=jsonb_build_object('borrowerId',parent,'amountReceived',calculation->>'amount','allocations',calculation->'allocations','allocationMethod','Loan Close','targetChargeId',calculation->>'targetChargeId','targetLoanId',target,'cashAccountId',i->>'cashAccountId','paymentDate',day::text,'paymentMethod',i->>'paymentMethod');
 result_value:=jsonb_build_object('operation','loan.close','targetType','loan','targetId',target,'paymentId',payment,'plan',plan,'predecessorRequestId',NULL,'sourceCreatedBy',a->>'loginEmail');
 INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code,result_json)
 VALUES((e->>'requestId')::uuid,2,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',canonical,encode(sha256(convert_to(canonical,'UTF8')),'hex'),'applied',NULL,NULL,result_value);
 INSERT INTO public."Payments"("Row ID","Ref Borrower","Payment Date","Amount Received","Payment Method","Allocation Method","Ref Target Charge","Ref Target Loan","Ref Received By Cash Account","Notes","Uploaded Receipt","Created By","Status")
 VALUES(payment,parent,day,(calculation->>'amount')::numeric::money,i->>'paymentMethod','Loan Close',calculation->>'targetChargeId',target,i->>'cashAccountId',i->>'notes',e#>>'{receipt,storageReference}',a->>'loginEmail','Processing');
 SELECT * INTO actual FROM public."Payments" WHERE "Row ID"=payment;
 IF NOT FOUND OR actual."Status" IS DISTINCT FROM 'Posted' OR actual."Amount Received"::numeric IS DISTINCT FROM (calculation->>'amount')::numeric THEN RAISE EXCEPTION 'Close receipt differs from immutable plan';END IF;
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
 l public."Loans"%ROWTYPE;component record;payment text;charge text;plan jsonb;result_value jsonb;actual public."Payments"%ROWTYPE;
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
 INSERT INTO public."Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Transfer Fee","Ref Disbursed From Cash Account","Loan Type","Due Date","Daily Payment Amount","Fixed Interest","Current Daily Interest","Interest Payment Interval","Loan Arrangement","Auto Charge Enabled","Created By","Loan Status","Defaulted","Interest Schedule Anchor Date")
 VALUES(l."Row ID",l."Ref Borrowers",l."Loan Date",l."Principal Amount",l."Transfer Fee",l."Ref Disbursed From Cash Account",l."Loan Type",l."Due Date",l."Daily Payment Amount",l."Fixed Interest",l."Current Daily Interest",l."Interest Payment Interval",l."Loan Arrangement",l."Auto Charge Enabled",l."Created By",l."Loan Status",false,l."Interest Schedule Anchor Date");
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
-- Name: pwa_apply_loan_source_v2(text); Type: FUNCTION
--

CREATE FUNCTION public.pwa_apply_loan_source_v2(canonical text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE e jsonb:=canonical::jsonb;i jsonb:=e#>'{command,inputs}';a jsonb:=e->'actor';target text:=e#>>'{command,targetId}';op text:=e#>>'{command,operation}';
 parent text;l public."Loans"%ROWTYPE;message text;
BEGIN
 IF (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END) OR op NOT IN('loan.update','loan.delete','loan.default','loan.undo-default','loan.generate-charge') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Governed operation required';END IF;
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

 BEGIN
 CASE op
 WHEN 'loan.delete' THEN DELETE FROM public."Loans" WHERE "Row ID"=target;
 WHEN 'loan.default' THEN UPDATE public."Loans" SET "Defaulted"=true,"Close Date"=(i->>'businessDate')::date,"Closed By"=a->>'loginEmail' WHERE "Row ID"=target;
 WHEN 'loan.undo-default' THEN UPDATE public."Loans" SET "Defaulted"=false WHERE "Row ID"=target;
 WHEN 'loan.generate-charge' THEN UPDATE public."Loans" SET "Charge Generation Request"=(i->>'businessDate')||'|'||(e->>'requestId') WHERE "Row ID"=target;
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
   'Default loss posting no longer matches; reconcile its components before undo','Default charge has no original component evidence; reconcile before undo','Default charge evidence is malformed; reconcile before undo','Default charge changed since write-off; reconcile before undo'
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
DECLARE e jsonb:=payload::jsonb;c jsonb:=e->'command';i jsonb:=c->'inputs';op text:=c->>'operation';kind text:=split_part(op,'.',1);action text:=split_part(op,'.',2);target text:=c->>'targetId';snapshot jsonb;version text;available numeric;account_id text;from_holder text;to_holder text;day date:=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date;message text;
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
 IF i ? 'partnerId' AND NOT EXISTS(SELECT 1 FROM public."Partners" WHERE "Row ID"=i->>'partnerId') THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
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
 provenance:=public.pwa_effective_payment_plan_v2(target);
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
 IF EXISTS(WITH lines AS(SELECT value line FROM jsonb_array_elements(f->'allocations')),paid AS(SELECT "Ref Charges" id,sum("Principal Paid"::numeric) p,sum("Interest Paid"::numeric) i FROM public."Repayments" WHERE "Ref Payment" IS DISTINCT FROM target GROUP BY "Ref Charges") SELECT 1 FROM lines LEFT JOIN public."Charges" ch ON ch."Row ID"=line->>'chargeId' LEFT JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans" LEFT JOIN paid ON paid.id=ch."Row ID" WHERE ch."Row ID" IS NULL OR l."Ref Borrowers" IS DISTINCT FROM f->>'borrowerId' OR ch."Charge Date" IS DISTINCT FROM (line->>'chargeDate')::date OR ch."Principal Due"::numeric-coalesce(paid.p,0) IS DISTINCT FROM (line->>'expectedPrincipalRemaining')::numeric OR ch."Interest Due"::numeric-coalesce(paid.i,0) IS DISTINCT FROM (line->>'expectedInterestRemaining')::numeric OR (line->>'principal')::numeric>ch."Principal Due"::numeric-coalesce(paid.p,0) OR (line->>'interest')::numeric>ch."Interest Due"::numeric-coalesce(paid.i,0)) THEN RAISE EXCEPTION USING ERRCODE='P5B09';END IF;
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
   IF NOT FOUND OR destination."Ref Borrowers" IS DISTINCT FROM f->>'borrowerId' OR destination."Loan Type" NOT IN('ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน') OR destination."Auto Charge Enabled" IS NOT TRUE OR destination."Defaulted" IS TRUE OR destination."Loan Date" IS DISTINCT FROM (f->>'paymentDate')::date OR f->>'paymentMethod'<>'Net-off at Disbursement' OR f->>'targetLoanId' IS NOT NULL OR jsonb_array_length(f->'allocations')<>1 OR f#>>'{allocations,0,chargeId}' IS DISTINCT FROM f->>'targetChargeId' OR (f#>>'{allocations,0,principal}')::numeric<>(f#>>'{allocations,0,expectedPrincipalRemaining}')::numeric OR (f#>>'{allocations,0,interest}')::numeric<>(f#>>'{allocations,0,expectedInterestRemaining}')::numeric THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
   IF public.cash_account_holder(f->>'cashAccountId',true)<>'ch:lisa' THEN RAISE EXCEPTION USING ERRCODE='P5B07';END IF;
  ELSIF repost AND f->>'allocationMethod'='Loan Close' AND NOT enter_close THEN
   IF NOT EXISTS(SELECT 1 FROM public."Loans" WHERE "Row ID"=f->>'targetLoanId' AND "Ref Borrowers"=f->>'borrowerId') OR NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Row ID"=f->>'targetChargeId' AND "Ref Loans"=f->>'targetLoanId') THEN RAISE EXCEPTION USING ERRCODE='P5B04';END IF;
   IF EXISTS(WITH paid AS(SELECT "Ref Charges" id,sum("Principal Paid"::numeric) p,sum("Interest Paid"::numeric) i FROM public."Repayments" WHERE "Ref Payment" IS DISTINCT FROM target GROUP BY "Ref Charges"),lines AS(SELECT value FROM jsonb_array_elements(f->'allocations')) SELECT 1 FROM public."Charges" ch LEFT JOIN paid ON paid.id=ch."Row ID" FULL JOIN lines ON lines.value->>'chargeId'=ch."Row ID" WHERE (ch."Ref Loans"=f->>'targetLoanId' OR lines.value IS NOT NULL) AND (ch."Ref Loans" IS DISTINCT FROM f->>'targetLoanId' OR (ch."Principal Due"::numeric-coalesce(paid.p,0)>0 OR ch."Interest Due"::numeric-coalesce(paid.i,0)>0) AND (lines.value IS NULL OR (lines.value->>'principal')::numeric IS DISTINCT FROM ch."Principal Due"::numeric-coalesce(paid.p,0) OR (lines.value->>'interest')::numeric IS DISTINCT FROM ch."Interest Due"::numeric-coalesce(paid.i,0)))) THEN RAISE EXCEPTION USING ERRCODE='P5B09';END IF;
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
 ELSIF message IN('Payment has a later loan default/write-off; reconcile that default first','Manually closed loan must be reopened explicitly before its receipt changes','Corrected payment has a default dependency; undo default first') THEN RAISE EXCEPTION USING ERRCODE='P5B05';ELSE RAISE;END IF;END;
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
 SELECT encode(sha256(convert_to(jsonb_build_object('id',b."Row ID",'createdDate',b."Creation Date",'aiCollectionEnabled',b."AI Collection Enabled",'name',b."Borrower Name",'description',b."Description",'communicationName',b."Communication Name",'instagramUsername',b."Instagram Username",'city',b."City",'workingLocation',b."Working Location",'address',b."Address",'hidden',b."Hidden Flag",'referrerId',b."Ref Referrer",'preferredReceivingAccountId',b."Ref Preferred Receiving Cash Account",'note',b."Borrower Note" )::text,'UTF8')),'hex') FROM public."Borrowers" b WHERE b."Row ID"=$1;
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
  'errorCode',m.error_code))
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
  OR jsonb_typeof(thread->'model') IS DISTINCT FROM 'string' OR thread->>'model' !~ '^gemini-[0-9]+(\.[0-9]+)?-[a-z0-9-]+$' OR length(thread->>'model')>64
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
  OR (patch ? 'model' AND (jsonb_typeof(patch->'model')<>'string' OR patch->>'model' !~ '^gemini-[0-9]+(\.[0-9]+)?-[a-z0-9-]+$' OR length(patch->>'model')>64))
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
  (j.contract_version=1 AND j.payment_id=p_id AND j.outcome='posted' AND j.canonical_json::jsonb#>>'{command,schemaVersion}' IN ('6','7','8') AND jsonb_typeof(j.canonical_json::jsonb#>'{command,allocations}')='array') OR
  (j.contract_version=2 AND j.outcome='applied' AND j.result_json->>'paymentId'=p_id AND j.canonical_json::jsonb#>>'{command,operation}' IN('loan.create','loan.close','charge.create'));
 IF matches=0 THEN RETURN NULL;END IF;
 IF matches<>1 THEN RAISE EXCEPTION 'Ambiguous payment provenance';END IF;
 SELECT * INTO STRICT r FROM public.pwa_payment_commands j WHERE
  (j.contract_version=1 AND j.payment_id=p_id AND j.outcome='posted' AND j.canonical_json::jsonb#>>'{command,schemaVersion}' IN ('6','7','8') AND jsonb_typeof(j.canonical_json::jsonb#>'{command,allocations}')='array') OR
  (j.contract_version=2 AND j.outcome='applied' AND j.result_json->>'paymentId'=p_id AND j.canonical_json::jsonb#>>'{command,operation}' IN('loan.create','loan.close','charge.create'));
 origin:=r.request_id;head:=origin;visited:=ARRAY[head];origin_actor:=r.canonical_json::jsonb->'actor';source_creator:=CASE WHEN r.result_json ? 'sourceCreatedBy' THEN r.result_json->>'sourceCreatedBy' ELSE origin_actor->>'loginEmail' END;
 IF r.contract_version=1 THEN
  c:=r.canonical_json::jsonb->'command';
  plan:=jsonb_build_object('borrowerId',c->'borrowerId','amountReceived',c->'amountReceived','allocations',c->'allocations','allocationMethod','Selected Charges','targetChargeId',NULL,'targetLoanId',NULL,'cashAccountId',c->'cashAccountId','paymentDate',c->'paymentDate','paymentMethod',c->'paymentMethod');
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
DECLARE keys text[];k text;result text:='{';kind text:=split_part(op,'.',1);action text:=split_part(op,'.',2);
BEGIN
 IF op NOT IN('capital-contribution.create','capital-contribution.update','capital-contribution.delete','settlement.create','settlement.update','settlement.complete','settlement.reverse','settlement.cancel','settlement.settle-all','cash-movement.create','cash-movement.update','cash-movement.delete') OR jsonb_typeof(i) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023';END IF;
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
 IF jsonb_typeof(line) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(line) key) IS DISTINCT FROM ARRAY['chargeDate','chargeId','expectedInterestRemaining','expectedPrincipalRemaining','interest','principal'] THEN RAISE EXCEPTION 'Invalid plan line';END IF;
 value:=line->>'chargeId';IF jsonb_typeof(line->'chargeId') IS DISTINCT FROM 'string' OR octet_length(value) NOT BETWEEN 1 AND 256 OR value~'[[:space:],[:cntrl:]]' OR (last_id IS NOT NULL AND value COLLATE "C"<=last_id COLLATE "C") THEN RAISE EXCEPTION 'Invalid plan ordering';END IF;last_id:=value;
 line_text:='{';FOREACH k IN ARRAY ARRAY['chargeId','principal','interest','expectedPrincipalRemaining','expectedInterestRemaining','chargeDate'] LOOP
 IF jsonb_typeof(line->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid plan type';END IF;
 IF k IN('principal','interest','expectedPrincipalRemaining','expectedInterestRemaining') AND (line->>k!~'^(0|[1-9][0-9]*)$' OR (line->>k)::numeric>92233720368547758) THEN RAISE EXCEPTION 'Invalid plan amount';END IF;
 line_text:=line_text||CASE WHEN line_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||to_json(line->>k)::text;END LOOP;
 IF line->>'chargeDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((line->>'chargeDate')::date)::text<>line->>'chargeDate' OR (line->>'principal')::numeric+(line->>'interest')::numeric<=0 OR (line->>'principal')::numeric>(line->>'expectedPrincipalRemaining')::numeric OR (line->>'interest')::numeric>(line->>'expectedInterestRemaining')::numeric THEN RAISE EXCEPTION 'Invalid plan line';END IF;
 total:=total+(line->>'principal')::numeric+(line->>'interest')::numeric;array_text:=array_text||CASE WHEN array_text='[' THEN '' ELSE ',' END||line_text||'}';END LOOP;
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
 IF head IS NULL THEN SELECT request_id INTO head FROM public.pwa_payment_commands WHERE contract_version=2 AND outcome='applied' AND result_json->>'paymentId'=$1 AND canonical_json::jsonb#>>'{command,operation}' IN('loan.create','loan.close','charge.create','payment.create');END IF;
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
    AS $$ SELECT coalesce(jsonb_agg(value-ARRAY['expectedPrincipalRemaining','expectedInterestRemaining'] ORDER BY (value->>'chargeId') COLLATE "C"),'[]'::jsonb) FROM jsonb_array_elements(lines); $$;


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
BEGIN
 environment:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END;
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR session_user<>('mw-credit-app-command-'||environment||'@clever-oasis-508610-n7.iam') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Command session required'; END IF;
 IF $1 IS NULL OR octet_length($1)>16384 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid agent receipt command'; END IF;
 BEGIN
  e:=$1::jsonb;c:=e->'command';a:=e->'actor';x:=c->'archiveEvidence';
  -- R095: schemaVersion 8 = 7 plus payerLines after bankReference (an object or null); 7 stays accepted.
  IF c->'schemaVersion'='8'::jsonb THEN command_keys:=ARRAY['schemaVersion','requestId','environment','reviewId','mode','borrowerId','cashAccountId','amountReceived','paymentDate','transferTime','bankReference','payerLines','proposalSha256','archiveEvidence']; END IF;
  IF jsonb_typeof(e)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(e) key)<>ARRAY['actor','command','contractVersion','receipt'] OR e->'contractVersion'<>'1'::jsonb OR e->'receipt'<>'null'::jsonb
   OR jsonb_typeof(c)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c) key)<>(SELECT array_agg(key ORDER BY key) FROM unnest(command_keys) key)
   OR jsonb_typeof(a)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(a) key)<>(SELECT array_agg(key ORDER BY key) FROM unnest(actor_keys) key)
   OR jsonb_typeof(x)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(x) key)<>(SELECT array_agg(key ORDER BY key) FROM unnest(evidence_keys) key)
   OR c->'schemaVersion' NOT IN ('7'::jsonb,'8'::jsonb) OR (c->>'environment')<>environment OR (c->>'mode') NOT IN ('automatic','reviewed') THEN RAISE EXCEPTION 'shape'; END IF;
  FOREACH k IN ARRAY text_keys LOOP
   IF jsonb_typeof(c->k)<>'string' THEN RAISE EXCEPTION 'type'; END IF;
   v:=(c->>k);IF octet_length(v) NOT BETWEEN 1 AND 256 OR btrim(v)='' OR v~E'[\\r\\n]' OR (k<>'bankReference' AND v<>btrim(v)) THEN RAISE EXCEPTION 'text'; END IF;
  END LOOP;
  IF c->'schemaVersion'='8'::jsonb AND c->'payerLines'<>'null'::jsonb THEN
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
  INSERT INTO public."Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Created At","Payment Method","Allocation Method","Bank Reference","Created By","Notes")
  VALUES('pwa:'||request::text,(c->>'borrowerId'),(c->>'cashAccountId'),'Processing',((c->>'amountReceived'))::numeric::money,day,((c->>'paymentDate')||' '||(c->>'transferTime')||':00')::timestamp,'Bank Transfer','Lump Sum',(c->>'bankReference'),(a->>'loginEmail'),CASE (c->>'mode') WHEN 'automatic' THEN 'Automatic Instagram receipt payment ' ELSE 'Approved Instagram receipt review ' END||'igr:'||left((c->>'reviewId'),48));
  -- R095: learn the payer lines (row locked above) only while the column still equals what the agent read; drift skips it
  -- (the payment still posts). A rejected outcome rolls this sub-block back; a replay returns before reaching it.
  IF payer_after IS NOT NULL THEN
   UPDATE public."Borrowers" SET "Communication Name"=payer_after WHERE "Row ID"=(c->>'borrowerId') AND coalesce("Communication Name",'') IS NOT DISTINCT FROM coalesce(payer_before,'');
  END IF;
 EXCEPTION WHEN SQLSTATE 'P4C01' THEN outcome_value:='rejected';rejection:='invalid_date';
  WHEN SQLSTATE 'P4C02' THEN outcome_value:='rejected';rejection:='borrower_unavailable';
  WHEN SQLSTATE 'P4C03' THEN outcome_value:='rejected';rejection:='account_unavailable';
  WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM<>'Payment does not match the current eligible balance' THEN RAISE;END IF;
   outcome_value:='rejected';rejection:='selection_unavailable';
 END;
 INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code)
 VALUES(request,1,(a->>'issuer'),(a->>'subject'),(a->>'partnerId'),(a->>'loginEmail'),canonical,hash,outcome_value,CASE WHEN outcome_value='posted' THEN 'pwa:'||request::text END,rejection);
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
 IF jsonb_typeof(c->'targetId') IS DISTINCT FROM 'string' OR octet_length(target) NOT BETWEEN 1 AND 256 OR target~'[[:cntrl:]]' OR op NOT IN('borrower.create','borrower.update','borrower.delete','loan.create','loan.update','loan.delete','loan.default','loan.undo-default','loan.generate-charge','loan.close','charge.create','charge.update','charge.delete','payment.correct','payment.delete','payment.move-interest','expense.create','expense.update','expense.delete','preference.update','cash-holder.create','cash-holder.update','cash-holder.delete','cash-account.create','cash-account.update','cash-account.delete','partner.create','partner.update','partner.delete','capital-contribution.create','capital-contribution.update','capital-contribution.delete','settlement.create','settlement.update','settlement.complete','settlement.reverse','settlement.cancel','settlement.settle-all','cash-movement.create','cash-movement.update','cash-movement.delete','cash-openings.initialize','assessment.create','assessment.update','assessment.refresh','assessment.delete','analytics.refresh') THEN RAISE EXCEPTION 'target';END IF;
 IF split_part(op,'.',1)='payment' THEN IF c->'predecessorRequestId'<>'null'::jsonb AND (jsonb_typeof(c->'predecessorRequestId') IS DISTINCT FROM 'string' OR c->>'predecessorRequestId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$') THEN RAISE EXCEPTION 'predecessor';END IF;ELSIF c->'predecessorRequestId'<>'null'::jsonb THEN RAISE EXCEPTION 'predecessor';END IF;
 IF op IN('borrower.create','loan.create','charge.create','expense.create','cash-holder.create','cash-account.create','partner.create','capital-contribution.create','settlement.create','settlement.settle-all','cash-movement.create','assessment.create') THEN IF c->'expectedVersion'<>'null'::jsonb OR target !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'create';END IF;
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
 IF split_part(op,'.',1) IN('cash-openings','assessment','analytics') THEN input_text:=public.pwa_management_tools_text_v2(op,i);ELSIF split_part(op,'.',1) IN('capital-contribution','settlement','cash-movement') THEN input_text:=public.pwa_management_financial_text_v2(op,i);ELSIF split_part(op,'.',1) IN('cash-holder','cash-account','partner') THEN input_text:=public.pwa_management_input_text_v2(op,i);
 ELSIF op='preference.update' THEN
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['language','statementAccountId','statementDate'] OR jsonb_typeof(i->'language') IS DISTINCT FROM 'string' OR i->>'language' NOT IN('English','ไทย') OR jsonb_typeof(i->'statementAccountId') NOT IN('string','null') OR jsonb_typeof(i->'statementDate') NOT IN('string','null') THEN RAISE EXCEPTION 'preference fields';END IF;
 IF i->'statementAccountId'<>'null'::jsonb AND (octet_length(i->>'statementAccountId') NOT BETWEEN 1 AND 256 OR i->>'statementAccountId'~'[[:cntrl:]]') THEN RAISE EXCEPTION 'preference account';END IF;
 IF i->'statementDate'<>'null'::jsonb AND (i->>'statementDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'statementDate')::date)::text<>i->>'statementDate') THEN RAISE EXCEPTION 'preference date';END IF;
 input_text:='{"language":'||to_json(i->>'language')::text||',"statementAccountId":'||coalesce(to_json(i->>'statementAccountId')::text,'null')||',"statementDate":'||coalesce(to_json(i->>'statementDate')::text,'null')||'}';
 ELSIF op IN('expense.create','expense.update') THEN
 keys:=ARRAY['expenseDate','category','amount','payeeName','relatedBorrowerId','relatedLoanId','notes','paidByAccountId'];
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM unnest(keys) key) THEN RAISE EXCEPTION 'expense keys';END IF;
 input_text:='{';FOREACH k IN ARRAY keys LOOP
 IF jsonb_typeof(i->k) NOT IN('string','null') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION 'expense field';END IF;
 IF k IN('expenseDate','category','amount') AND jsonb_typeof(i->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'expense required';END IF;
 IF k IN('relatedBorrowerId','relatedLoanId','paidByAccountId') AND i->k<>'null'::jsonb AND (octet_length(i->>k) NOT BETWEEN 1 AND 256 OR i->>k~'[[:cntrl:]]') THEN RAISE EXCEPTION 'expense reference';END IF;
 input_text:=input_text||CASE WHEN input_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||coalesce(to_json(i->>k)::text,'null');END LOOP;input_text:=input_text||'}';
 IF i->>'expenseDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'expenseDate')::date)::text<>i->>'expenseDate' OR btrim(i->>'category')='' OR i->>'amount'!~'^-?[1-9][0-9]*$' OR abs((i->>'amount')::numeric)>92233720368547758 THEN RAISE EXCEPTION 'expense input';END IF;
 ELSIF op='payment.correct' THEN input_text:=public.pwa_payment_correction_text_v2(i);IF (i->>'receiptMode'='replace') IS DISTINCT FROM (r<>'null'::jsonb) THEN RAISE EXCEPTION 'receipt mode';END IF;
 ELSIF op='payment.move-interest' THEN IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['allocationId','targetChargeId'] THEN RAISE EXCEPTION 'move keys';END IF;FOREACH k IN ARRAY ARRAY['allocationId','targetChargeId'] LOOP IF jsonb_typeof(i->k) IS DISTINCT FROM 'string' OR octet_length(i->>k) NOT BETWEEN 1 AND 256 OR i->>k~'[[:cntrl:]]' THEN RAISE EXCEPTION 'move reference';END IF;END LOOP;input_text:='{"allocationId":'||to_json(i->>'allocationId')::text||',"targetChargeId":'||to_json(i->>'targetChargeId')::text||'}';
 ELSIF op IN('loan.create','loan.update') THEN
 keys:=ARRAY['borrowerId','loanDate','principal','transferFee','disbursingAccountId','type','dueDate','dailyPayment','fixedInterest','currentDailyInterest','paymentInterval','arrangement','autoChargeEnabled'];
 IF i ? 'scheduleAnchor' THEN keys:=array_append(keys,'scheduleAnchor');END IF;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM unnest(keys) key) THEN RAISE EXCEPTION 'loan keys';END IF;
 input_text:='{';FOREACH k IN ARRAY keys LOOP
  IF k='autoChargeEnabled' THEN IF jsonb_typeof(i->k) NOT IN('boolean','null') THEN RAISE EXCEPTION 'loan boolean';END IF;
  ELSIF k='paymentInterval' THEN IF i->k<>'null'::jsonb AND (jsonb_typeof(i->k)<>'number' OR i->>k!~'^[1-9][0-9]*$' OR (i->>k)::numeric>2147483647) THEN RAISE EXCEPTION 'loan interval';END IF;
  ELSE
   IF jsonb_typeof(i->k) NOT IN('string','null') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION 'loan text';END IF;
   IF k IN('principal','transferFee','dailyPayment','fixedInterest','currentDailyInterest') AND i->k<>'null'::jsonb AND (i->>k!~'^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' OR (i->>k)::numeric>92233720368547758.07) THEN RAISE EXCEPTION 'loan amount';END IF;
   IF k='type' AND i->k<>'null'::jsonb AND i->>k NOT IN('กำหนดวันชำระ','ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน') THEN RAISE EXCEPTION 'loan type';END IF;
   IF k IN('loanDate','dueDate','scheduleAnchor') AND i->k<>'null'::jsonb AND (i->>k!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>k)::date)::text<>i->>k) THEN RAISE EXCEPTION 'loan date';END IF;
   IF k IN('borrowerId','disbursingAccountId') AND ((op='loan.create' AND i->k='null'::jsonb) OR (i->k<>'null'::jsonb AND (octet_length(i->>k) NOT BETWEEN 1 AND 256 OR i->>k~'[[:cntrl:]]'))) THEN RAISE EXCEPTION 'loan reference';END IF;
  END IF;
  input_text:=input_text||CASE WHEN input_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||CASE WHEN i->k='null'::jsonb THEN 'null' WHEN k IN('autoChargeEnabled','paymentInterval') THEN (i->k)::text ELSE to_json(i->>k)::text END;
 END LOOP;input_text:=input_text||'}';
 IF op='loan.create' AND ((i->>'principal')::numeric IS NULL OR (i->>'principal')::numeric<=0 OR i->>'loanDate' IS NULL OR i->>'type' IS NULL OR i->>'type' NOT IN('กำหนดวันชำระ','ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน')) THEN RAISE EXCEPTION 'loan required';END IF;
 ELSIF op IN('charge.create','charge.update') THEN
 keys:=ARRAY['loanId','chargeDate','principalDue','interestDue','notes'];
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM unnest(keys) key) THEN RAISE EXCEPTION 'charge keys';END IF;
 input_text:='{';FOREACH k IN ARRAY keys LOOP
 IF (k='notes' AND jsonb_typeof(i->k) NOT IN('string','null')) OR (k<>'notes' AND jsonb_typeof(i->k) IS DISTINCT FROM 'string') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION 'charge input';END IF;
 input_text:=input_text||CASE WHEN input_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||coalesce(to_json(i->>k)::text,'null');
 END LOOP;input_text:=input_text||'}';
 IF octet_length(i->>'loanId') NOT BETWEEN 1 AND 256 OR i->>'loanId'~'[[:cntrl:]]' OR i->>'chargeDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'chargeDate')::date)::text<>i->>'chargeDate' OR i->>'principalDue'!~'^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' OR i->>'interestDue'!~'^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' OR abs((i->>'principalDue')::numeric)>92233720368547758.07 OR abs((i->>'interestDue')::numeric)>92233720368547758.07 THEN RAISE EXCEPTION 'charge input';END IF;
 ELSIF op='loan.close' THEN
 keys:=ARRAY['paymentDate','cashAccountId','paymentMethod','notes','expectedAmount','expectedPlanHash'];
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM unnest(keys) key) THEN RAISE EXCEPTION 'close keys';END IF;
 input_text:='{';FOREACH k IN ARRAY keys LOOP
  IF (k='notes' AND jsonb_typeof(i->k) NOT IN('string','null')) OR (k<>'notes' AND jsonb_typeof(i->k) IS DISTINCT FROM 'string') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION 'close input';END IF;
  input_text:=input_text||CASE WHEN input_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||coalesce(to_json(i->>k)::text,'null');
 END LOOP;input_text:=input_text||'}';
 IF i->>'paymentDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'paymentDate')::date)::text<>i->>'paymentDate' OR octet_length(i->>'cashAccountId') NOT BETWEEN 1 AND 256 OR i->>'cashAccountId'~'[[:cntrl:]]' OR i->>'paymentMethod' NOT IN('Bank Transfer','Cash','Net-off at Disbursement') OR i->>'expectedAmount'!~'^[1-9][0-9]*$' OR (i->>'expectedAmount')::numeric>92233720368547758 OR i->>'expectedPlanHash'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'close input';END IF;
 ELSIF op IN('loan.default','loan.generate-charge') THEN
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['businessDate'] OR jsonb_typeof(i->'businessDate') IS DISTINCT FROM 'string' OR i->>'businessDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((i->>'businessDate')::date)::text<>i->>'businessDate' THEN RAISE EXCEPTION 'business date';END IF;
 input_text:='{"businessDate":'||to_json(i->>'businessDate')::text||'}';
 ELSIF op IN('borrower.delete','loan.delete','loan.undo-default','charge.delete','payment.delete','expense.delete') THEN IF i<>'{}'::jsonb THEN RAISE EXCEPTION 'delete';END IF;input_text:='{}';
 ELSE
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i-'aiCollectionEnabled') key) IS DISTINCT FROM ARRAY['address','city','communicationName','description','hidden','instagramUsername','name','note','preferredReceivingAccountId','referrerId','workingLocation'] THEN RAISE EXCEPTION 'inputs';END IF;
 input_text:='{';FOREACH k IN ARRAY ARRAY['name','description','communicationName','instagramUsername','city','workingLocation','address','hidden','referrerId','preferredReceivingAccountId','note']||CASE WHEN i?'aiCollectionEnabled' THEN ARRAY['aiCollectionEnabled'] ELSE ARRAY[]::text[] END LOOP
  IF k IN('hidden','aiCollectionEnabled') THEN IF jsonb_typeof(i->k) NOT IN('boolean','null') THEN RAISE EXCEPTION 'boolean';END IF;
  ELSE IF jsonb_typeof(i->k) NOT IN('string','null') OR octet_length(i->>k)>65536 THEN RAISE EXCEPTION 'text';END IF;
  IF k IN('referrerId','preferredReceivingAccountId') AND i->k<>'null'::jsonb AND (octet_length(i->>k) NOT BETWEEN 1 AND 256 OR i->>k~'[[:cntrl:]]') THEN RAISE EXCEPTION 'ref';END IF;END IF;
  input_text:=input_text||CASE WHEN input_text='{' THEN '' ELSE ',' END||to_json(k)::text||':'||CASE WHEN i->k='null'::jsonb THEN 'null' WHEN k IN('hidden','aiCollectionEnabled') THEN (i->k)::text ELSE to_json(i->>k)::text END;
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
 IF split_part(op,'.',1)='analytics' THEN result_value:=public.pwa_apply_analytics_v2($1);ELSIF split_part(op,'.',1)='cash-openings' THEN result_value:=public.pwa_apply_cash_opening_v2($1);ELSIF split_part(op,'.',1)='assessment' THEN result_value:=public.pwa_apply_assessment_v2($1);ELSIF split_part(op,'.',1) IN('capital-contribution','settlement','cash-movement') THEN result_value:=public.pwa_apply_management_financial_v2($1);ELSIF split_part(op,'.',1) IN('cash-holder','cash-account','partner') THEN result_value:=public.pwa_apply_management_v2($1);ELSIF op='preference.update' THEN result_value:=public.pwa_apply_preference_v2($1);ELSIF split_part(op,'.',1)='expense' THEN result_value:=public.pwa_apply_expense_v2($1);ELSIF split_part(op,'.',1)='payment' THEN result_value:=public.pwa_apply_payment_v2($1);ELSIF op='loan.create' THEN result_value:=public.pwa_apply_loan_create_v2($1);ELSIF op='loan.close' THEN result_value:=public.pwa_apply_loan_close_v2($1);ELSIF split_part(op,'.',1)='loan' THEN result_value:=public.pwa_apply_loan_source_v2($1);ELSIF split_part(op,'.',1)='charge' THEN result_value:=public.pwa_apply_charge_v2($1);ELSE
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
 INSERT INTO public."Borrowers"("Row ID","Borrower Name","Description","Communication Name","Instagram Username","City","Working Location","Address","Hidden Flag","Ref Referrer","Ref Preferred Receiving Cash Account","Borrower Note","Creation Date","AI Collection Enabled") VALUES(target,i->>'name',i->>'description',i->>'communicationName',i->>'instagramUsername',i->>'city',i->>'workingLocation',i->>'address',(i->>'hidden')::boolean,i->>'referrerId',i->>'preferredReceivingAccountId',i->>'note',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date,CASE WHEN i?'aiCollectionEnabled' THEN (i->>'aiCollectionEnabled')::boolean ELSE true END);
 ELSIF op='borrower.update' THEN UPDATE public."Borrowers" SET "Borrower Name"=i->>'name',"Description"=i->>'description',"Communication Name"=i->>'communicationName',"Instagram Username"=i->>'instagramUsername',"City"=i->>'city',"Working Location"=i->>'workingLocation',"Address"=i->>'address',"Hidden Flag"=(i->>'hidden')::boolean,"Ref Referrer"=i->>'referrerId',"Ref Preferred Receiving Cash Account"=i->>'preferredReceivingAccountId',"Borrower Note"=i->>'note',"AI Collection Enabled"=CASE WHEN i?'aiCollectionEnabled' THEN (i->>'aiCollectionEnabled')::boolean ELSE "AI Collection Enabled" END WHERE "Row ID"=target;
 ELSE DELETE FROM public."Borrowers" WHERE "Row ID"=target;END IF;
 EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='P5B05';WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION USING ERRCODE='P5B06';END;
 result_value:=jsonb_build_object('operation',op,'targetType','borrower','targetId',target,'paymentId',NULL,'plan',NULL,'predecessorRequestId',NULL);
 END IF;
 EXCEPTION WHEN SQLSTATE 'P5B01' THEN rejection:='source_conflict';WHEN SQLSTATE 'P5B02' THEN rejection:='not_found';WHEN SQLSTATE 'P5B03' THEN rejection:='borrower_name_exists';WHEN SQLSTATE 'P5B04' THEN rejection:='invalid_reference';WHEN SQLSTATE 'P5B05' THEN rejection:='dependency_conflict';WHEN SQLSTATE 'P5B06' THEN rejection:='record_requires_reconciliation';WHEN SQLSTATE 'P5B07' THEN rejection:='account_unavailable';WHEN SQLSTATE 'P5B08' THEN rejection:='invalid_date';WHEN SQLSTATE 'P5B09' THEN rejection:='plan_changed';WHEN SQLSTATE 'P5B10' THEN rejection:='insufficient_funds';END;
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
 -- JavaScript whitespace, used only for canonical transport validation, not ID normalization.
 ws text:=chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR NOT pg_has_role(session_user,CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END,'MEMBER') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Application session required';END IF;
 IF $1 IS NULL OR octet_length($1)>524288 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid canonical command'; END IF;
 BEGIN
  e:=$1::jsonb;c:=e->'command';a:=e->'actor';r:=e->'receipt';
  IF jsonb_typeof(e)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(e) key)<>ARRAY['actor','command','contractVersion','receipt'] OR e->'contractVersion'<>'1'::jsonb
    OR jsonb_typeof(c)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c) key)<>(CASE WHEN c->'schemaVersion'='6'::jsonb THEN ARRAY['allocations','amountReceived','borrowerId','cashAccountId','notes','paymentDate','paymentMethod','receiptId','requestId','schemaVersion'] WHEN c->'schemaVersion'='7'::jsonb THEN ARRAY['allocations','amountReceived','bankReference','borrowerId','cashAccountId','notes','paymentDate','paymentMethod','receiptId','requestId','schemaVersion','transferTime'] WHEN c->'schemaVersion'='8'::jsonb THEN ARRAY['allocations','amountReceived','bankReference','borrowerId','cashAccountId','notes','payerLines','paymentDate','paymentMethod','receiptId','requestId','schemaVersion','transferTime'] ELSE ARRAY['allocationMethod','amountReceived','borrowerId','cashAccountId','notes','paymentDate','paymentMethod','receiptId','requestId','schemaVersion','selectedChargeIds'] END)
    OR c->'schemaVersion' NOT IN ('3'::jsonb,'4'::jsonb,'5'::jsonb,'6'::jsonb,'7'::jsonb,'8'::jsonb) OR jsonb_typeof(a)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(a) key)<>ARRAY['issuer','loginEmail','partnerId','subject'] THEN RAISE EXCEPTION 'shape'; END IF;
  FOREACH k IN ARRAY ARRAY['requestId','borrowerId','cashAccountId','paymentDate','amountReceived','paymentMethod'] LOOP
   IF jsonb_typeof(c->k)<>'string' THEN RAISE EXCEPTION 'type'; END IF;
  END LOOP;
  IF c->>'requestId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'uuid'; END IF;
  request:=(c->>'requestId')::uuid;
  FOREACH k IN ARRAY ARRAY['borrowerId','cashAccountId'] LOOP
   v:=c->>k;IF octet_length(v) NOT BETWEEN 1 AND 256 OR v<>btrim(v,ws) OR v~E'[\\r\\n]' THEN RAISE EXCEPTION 'id';END IF;
  END LOOP;
  IF c->'schemaVersion' IN ('6'::jsonb,'7'::jsonb,'8'::jsonb) THEN
   IF jsonb_typeof(c->'allocations') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'allocations') NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'plan';END IF;
   ids:=ARRAY[]::text[];plan_text:='';plan_total:=0;
   FOR line IN SELECT value FROM jsonb_array_elements(c->'allocations') LOOP
    IF jsonb_typeof(line) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(line) key) IS DISTINCT FROM ARRAY['chargeDate','chargeId','expectedInterestRemaining','expectedPrincipalRemaining','interest','principal'] THEN RAISE EXCEPTION 'line';END IF;
    FOREACH k IN ARRAY ARRAY['chargeId','principal','interest','expectedPrincipalRemaining','expectedInterestRemaining','chargeDate'] LOOP
     IF jsonb_typeof(line->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'line type';END IF;
    END LOOP;
    v:=line->>'chargeId';IF octet_length(v) NOT BETWEEN 1 AND 256 OR v LIKE '%,%' OR translate(v,ws,'')<>v THEN RAISE EXCEPTION 'line id';END IF;ids:=array_append(ids,v);
    FOREACH k IN ARRAY ARRAY['principal','interest','expectedPrincipalRemaining','expectedInterestRemaining'] LOOP
     IF line->>k !~ '^(0|[1-9][0-9]{0,16})$' OR (line->>k)::numeric>92233720368547758 THEN RAISE EXCEPTION 'component';END IF;
    END LOOP;
    IF (line->>'principal')::numeric+(line->>'interest')::numeric<=0 OR (line->>'principal')::numeric>(line->>'expectedPrincipalRemaining')::numeric OR (line->>'interest')::numeric>(line->>'expectedInterestRemaining')::numeric THEN RAISE EXCEPTION 'line cap';END IF;
    v:=line->>'chargeDate';IF v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR v<'0001-01-01' OR to_char(v::date,'YYYY-MM-DD')<>v THEN RAISE EXCEPTION 'line day';END IF;
    plan_total:=plan_total+(line->>'principal')::numeric+(line->>'interest')::numeric;
    line_text:='{"chargeId":'||to_json(line->>'chargeId')::text||',"principal":'||to_json(line->>'principal')::text||',"interest":'||to_json(line->>'interest')::text||',"expectedPrincipalRemaining":'||to_json(line->>'expectedPrincipalRemaining')::text||',"expectedInterestRemaining":'||to_json(line->>'expectedInterestRemaining')::text||',"chargeDate":'||to_json(line->>'chargeDate')::text||'}';
    plan_text:=plan_text||CASE WHEN plan_text='' THEN '' ELSE ',' END||line_text;
   END LOOP;
   SELECT array_agg(x ORDER BY x COLLATE "C") INTO sorted_ids FROM (SELECT DISTINCT unnest(ids) x) q;
   IF ids IS DISTINCT FROM sorted_ids OR cardinality(ids)<>cardinality(sorted_ids) THEN RAISE EXCEPTION 'plan order';END IF;
   IF c->>'amountReceived' !~ '^[1-9][0-9]{0,16}$' OR (c->>'amountReceived')::numeric>92233720368547758 OR (c->>'amountReceived')::numeric<>plan_total OR c->>'paymentMethod' NOT IN ('Bank Transfer','Cash','Net-off at Disbursement') THEN RAISE EXCEPTION 'total';END IF;
   -- R075 v7: optional slip bank reference (normalized) and transfer time (HH:MM), bank transfers only.
   -- R095 v8: v7 plus the optional payer-lines change {before, after}, bank transfers only.
   IF c->'schemaVersion' IN ('7'::jsonb,'8'::jsonb) THEN
    IF c->'bankReference'<>'null'::jsonb AND (jsonb_typeof(c->'bankReference')<>'string' OR c->>'bankReference' !~ '^[A-Z0-9]{6,100}$') THEN RAISE EXCEPTION 'reference';END IF;
    IF c->'transferTime'<>'null'::jsonb AND (jsonb_typeof(c->'transferTime')<>'string' OR c->>'transferTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN RAISE EXCEPTION 'transfer time';END IF;
    IF c->>'paymentMethod'<>'Bank Transfer' AND (c->'bankReference'<>'null'::jsonb OR c->'transferTime'<>'null'::jsonb) THEN RAISE EXCEPTION 'slip method';END IF;
    slip_text:=',"bankReference":'||CASE WHEN c->'bankReference'='null'::jsonb THEN 'null' ELSE to_json(c->>'bankReference')::text END||',"transferTime":'||CASE WHEN c->'transferTime'='null'::jsonb THEN 'null' ELSE to_json(c->>'transferTime')::text END;
    IF c->'schemaVersion'='8'::jsonb THEN
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
  IF c->'schemaVersion' IN ('6'::jsonb,'7'::jsonb,'8'::jsonb) THEN
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
  -- v7 follows the slip date: today or yesterday in Bangkok, as the agent receipt command; v3-v6 stay today-only.
  IF day<>(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date AND NOT (c->'schemaVersion' IN ('7'::jsonb,'8'::jsonb) AND day=(transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date-1) THEN RAISE EXCEPTION USING ERRCODE='P4C01';END IF;
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
  IF c->'schemaVersion' IN ('6'::jsonb,'7'::jsonb,'8'::jsonb) THEN
   PERFORM 1 FROM public."Loans" WHERE "Ref Borrowers"=c->>'borrowerId' ORDER BY "Row ID" COLLATE "C" FOR UPDATE;
   PERFORM 1 FROM public."Charges" ch JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans" WHERE l."Ref Borrowers"=c->>'borrowerId' ORDER BY ch."Row ID" COLLATE "C" FOR UPDATE OF ch;
   IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(c->'allocations') AS entries(item)
    LEFT JOIN public."Charges" ch ON ch."Row ID"=entries.item->>'chargeId'
    LEFT JOIN public."Loans" l ON l."Row ID"=ch."Ref Loans"
    LEFT JOIN (SELECT "Ref Charges" charge,sum("Principal Paid"::numeric) principal,sum("Interest Paid"::numeric) interest,count(*) FILTER(WHERE "Principal Paid" IS NULL OR "Interest Paid" IS NULL) invalid FROM public."Repayments" WHERE "Ref Charges"=ANY(ids) GROUP BY "Ref Charges") paid ON paid.charge=ch."Row ID"
    WHERE l."Ref Borrowers" IS DISTINCT FROM c->>'borrowerId' OR coalesce(paid.invalid,0)>0
     OR ch."Principal Due"::numeric-coalesce(paid.principal,0) IS DISTINCT FROM (entries.item->>'expectedPrincipalRemaining')::numeric
     OR ch."Interest Due"::numeric-coalesce(paid.interest,0) IS DISTINCT FROM (entries.item->>'expectedInterestRemaining')::numeric
     OR ch."Charge Date" IS DISTINCT FROM (entries.item->>'chargeDate')::date
   ) THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
   INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code)
   VALUES(request,1,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',canonical,hash,'posted',payment_key,NULL);
  END IF;
  INSERT INTO public."Payments"("Row ID","Ref Borrower","Ref Received By Cash Account","Status","Amount Received","Payment Date","Payment Method","Allocation Method","Selected Charge IDs","Ref Target Charge","Created By","Notes","Uploaded Receipt","Bank Reference","Created At")
   VALUES(payment_key,c->>'borrowerId',c->>'cashAccountId','Processing',(c->>'amountReceived')::numeric::money,day,c->>'paymentMethod',CASE WHEN c->'schemaVersion' IN ('6'::jsonb,'7'::jsonb,'8'::jsonb) THEN 'Selected Charges' ELSE c->>'allocationMethod' END,CASE WHEN c->'schemaVersion' IN ('6'::jsonb,'7'::jsonb,'8'::jsonb) OR c->>'allocationMethod'='Selected Charges' THEN array_to_string(ids,' , ') END,CASE WHEN c->>'allocationMethod'='Single Full' THEN ids[1] END,a->>'loginEmail',c->>'notes',r->>'storageReference',
    CASE WHEN c->'schemaVersion' IN ('7'::jsonb,'8'::jsonb) THEN c->>'bankReference' END,
    -- Slip date and transfer time become Created At, as the agent receipt command writes it.
    CASE WHEN c->'schemaVersion' IN ('7'::jsonb,'8'::jsonb) AND c->>'transferTime' IS NOT NULL THEN ((c->>'paymentDate')||' '||(c->>'transferTime')||':00')::timestamp END);
  SELECT "Status","Amount Received"::numeric INTO posted_status,posted_amount FROM public."Payments" WHERE "Row ID"=payment_key;
  IF posted_status IS DISTINCT FROM 'Posted' OR posted_amount IS DISTINCT FROM (c->>'amountReceived')::numeric THEN RAISE EXCEPTION USING ERRCODE='XX000',MESSAGE='Unexpected posting result';END IF;
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
 IF c->'schemaVersion' NOT IN ('6'::jsonb,'7'::jsonb,'8'::jsonb) OR outcome_value='rejected' THEN
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
 WHEN 'Repayments' THEN ARRAY['Ref Loans','Ref Charges','Ref Payment','Principal Paid','Interest Paid','Payment Date']
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
  OR amount IS DISTINCT FROM (SELECT sum("Principal Paid"::numeric+"Interest Paid"::numeric) FROM public."Repayments" WHERE "Ref Payment"=p_payment)
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
     sum("Interest Paid"::numeric) AS interest,count(*) AS repayments
   FROM public."Repayments" GROUP BY "Payment Date"
 ), profit_days AS MATERIALIZED (
   SELECT r.d,CASE WHEN c.pool>0 THEN r.interest*coalesce(c.ab,0)/c.pool ELSE 0 END AS profit
   FROM repayment_days r CROSS JOIN LATERAL (
     SELECT sum(net) AS pool,sum(net) FILTER(WHERE role IN ('A','B')) AS ab
     FROM contributions WHERE d<=r.d
   ) c
 ), charge_payments AS MATERIALIZED (
   SELECT "Ref Charges" charge,"Payment Date" d,
    sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)) paid
   FROM public."Repayments" WHERE "Payment Date"<=p_to GROUP BY 1,2
 ), charge_events AS MATERIALIZED (
   SELECT c."Row ID" charge,c."Charge Date" d,
    coalesce(c."Principal Due"::numeric,0)+coalesce(c."Interest Due"::numeric,0) due,
    coalesce(sum(cp.paid),0) paid
   FROM public."Charges" c LEFT JOIN charge_payments cp
    ON cp.charge=c."Row ID" AND cp.d<=c."Charge Date"
   WHERE p_to-p_from>=3 AND c."Charge Date"<=p_to GROUP BY 1,2,3
   UNION ALL
   SELECT c."Row ID",cp.d,coalesce(c."Principal Due"::numeric,0)+coalesce(c."Interest Due"::numeric,0),cp.paid
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
    SELECT coalesce(sum(greatest(coalesce(c."Principal Due"::numeric,0)+coalesce(c."Interest Due"::numeric,0)-coalesce(cp.paid,0),0)),0)
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
  SELECT "Expense Date",abs("Amount"::numeric),CASE WHEN "Amount"::numeric>0 THEN "Ref Paid By Cash Holder" END,
   CASE WHEN "Amount"::numeric<0 THEN "Ref Paid By Cash Holder" END,"Created By",
   CASE WHEN "Amount"::numeric>0 THEN "Ref Paid By Cash Account" END, CASE WHEN "Amount"::numeric<0 THEN "Ref Paid By Cash Account" END INTO d,amount,from_holder,to_holder,actor,from_account,to_account FROM public."Business Expenses" WHERE "Row ID"=p_id;
  IF coalesce(from_holder,to_holder) IS NULL THEN amount:=NULL; END IF;
  movement:='Business Expense'; source_key:='EXPENSE:'||p_id; expense_id:=p_id;
 WHEN 'Settlement' THEN
  SELECT "Transfer Date","Amount"::numeric,"Ref Paid From Cash Account" INTO d,amount,from_account FROM public."Settlements" WHERE "Row ID"=p_id AND "Status"='Completed';
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


--
-- Name: undo_loan_default(public."Loans"); Type: FUNCTION
--

CREATE FUNCTION public.undo_loan_default(p public."Loans") RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
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
  SELECT sum("Interest Paid"::numeric) i,sum("Principal Paid"::numeric) p
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
 SELECT pp,ip,total,pr,ir,remaining,n,status,paid_date
 INTO NEW."Principal Paid",NEW."Interest Paid",NEW."Total Paid",NEW."Principal Remaining",NEW."Interest Remaining",
  NEW."Amount Remaining",NEW."Payment Count",NEW."Payment Status",NEW."Payment Date"
 FROM public.vc_charge_values(NEW);
 RETURN NEW;
END $$;


--
-- Name: vc_charge_values(public."Charges"); Type: FUNCTION
--

CREATE FUNCTION public.vc_charge_values(p public."Charges") RETURNS TABLE(pp numeric, ip numeric, total numeric, pr numeric, ir numeric, remaining numeric, n integer, status text, paid_date date)
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
 WITH a AS (
  SELECT coalesce(sum(r."Principal Paid"::numeric),0) pp,
   coalesce(sum(r."Interest Paid"::numeric),0) ip,count(*)::integer n,max(r."Payment Date") d
  FROM public."Repayments" r WHERE r."Ref Charges"=p."Row ID"
 ), b AS (
  SELECT a.*,coalesce(p."Principal Due"::numeric,0)-pp pr,
   coalesce(p."Interest Due"::numeric,0)-ip ir FROM a
 ), c AS (
  SELECT b.*,CASE WHEN (SELECT l."Loan Status" FROM public."Loans" l WHERE l."Row ID"=p."Ref Loans")='ปิดยอดแล้ว'
   THEN 'ชำระแล้ว' WHEN pp+ip=0 THEN 'รอชำระ' WHEN pr+ir>0 THEN 'ชำระบางส่วน' ELSE 'ชำระแล้ว' END s FROM b
 ) SELECT pp,ip,pp+ip,pr,ir,pr+ir,n,s,CASE WHEN s='ชำระแล้ว' THEN d END FROM c;
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
 SELECT coalesce(sum("Interest Paid"::numeric),0),coalesce(sum("Principal Paid"::numeric),0),
  coalesce(sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)),0)
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
 SELECT coalesce(sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)),0) INTO NEW."Posted Amount"
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
  "Payment Count"=v.n,"Payment Status"=v.status,"Payment Date"=v.paid_date
 FROM (SELECT x."Row ID",v.* FROM public."Charges" x CROSS JOIN LATERAL public.vc_charge_values(x) v WHERE x."Row ID"=p_id) v
 WHERE c."Row ID"=v."Row ID" AND
 ROW(c."Principal Paid",c."Interest Paid",c."Total Paid",c."Principal Remaining",c."Interest Remaining",c."Amount Remaining",c."Payment Count",c."Payment Status",c."Payment Date")
 IS DISTINCT FROM ROW(v.pp,v.ip,v.total,v.pr,v.ir,v.remaining,v.n,v.status,v.paid_date);
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
 FROM (SELECT coalesce(sum("Interest Paid"::numeric),0) i,coalesce(sum("Principal Paid"::numeric),0) p,
  coalesce(sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)),0) a
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
 SELECT coalesce(sum(coalesce("Principal Paid"::numeric,0)+coalesce("Interest Paid"::numeric,0)),0) INTO r FROM public."Repayments" WHERE "Ref Payment"=p_id;
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
