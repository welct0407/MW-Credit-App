-- R111 Pay Forward Release 2: referral rebate offset (owner-approved plan "Pay Forward Design" revision 6, sections 3.2,
-- 4.0, 5, 6 Release 2, decisions D2-D4; owner instruction of 2 November 2026; Archie's design). V121 is applied and stays.
-- At Loan Close the referral rebate (create_referral_rebate, 10% of interest received, at most 1,000) may now settle the
-- referrer's own open loan instead of a cash payout by Lisa: the closing command books the expense as today and, when the
-- Partner chose the offset (D3 preselected) and the referrer has an open loan, posts a payment on the referrer's loans
-- through the pay-forward plan (V121, forward only), received by Lisa in cash on the close date with the new method
-- "Referral Rebate Offset". Lisa's cash nets to zero that day (expense out, receipt in, same default account).
-- 1. New nullable column "Business Expenses"."Ref Offset Payment" (D2, owner-authorized) referencing the offset payment
--    (no ON DELETE action: only the closing payment's deletion removes the pair, expense first).
-- 2. pwa_apply_pay_forward_v1(principal, materialize, day): the v10 booking arithmetic (raise or book today's charge and
--    reset the anchor; book forward charges through generate_loan_charge; P4C05 on any drift), extracted from
--    pwa_submit_selected_charges_v1 so v10 and the offset share one writer. v10's behaviour is unchanged.
-- 3. pwa_referral_rebate_projection_v1(loan, calculation): the rebate a close with that calculation creates (the
--    create_referral_rebate rule on the posted state), its referrer and whether the referrer has an open loan. Read only.
-- 4. The operation journal constraint pwa_versioned_outcome admits result_json.rebate (a loan.close object only).
-- 5. loan.close accepts the optional input rebatePath ('offset' | 'expense'; absent = expense, so earlier clients close as
--    before). pwa_apply_loan_close_v2 stores the choice and, for an offset, the plan under the referrer's locks in
--    result_json.rebate; after the closing payment posts it fires the deferred referral trigger immediately (SET
--    CONSTRAINTS, no trigger disabled), where create_referral_rebate books the plan's charges, posts the offset payment
--    ro122:<closing payment> (explicit plan through pwa_effective_payment_plan_v2) and links it on the expense; the
--    command verifies both. A rebate beyond the referrer's 93-day schedule offsets what is covered; the rest stays payable.
-- 6. Corrections: deleting the closing payment deletes the rebate expense and then its offset payment (booked charges
--    stay, D4); correcting a closing payment that has an offset, or changing or deleting the offset payment itself, is
--    refused ("Remove through the closing payment"; dependency_conflict in the operations).
-- 7. pwa_notify_content_v2: v1's facts plus the rebate amount, payee and payable part of a closed loan, for the
--    "Loan closed" push (content only). V99 boundary: notify owner's pinned definer, EXECUTE only for the dispatcher.
-- No other table, column or constraint. CREATE OR REPLACE and counted text replacements keep owners and privileges; the self-check
-- proves them, the new functions' ACLs and the column.

DO $preflight$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; problems text[]:='{}'; notify_owner text; dispatcher text;
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 notify_owner:='mw_notify_owner_'||suffix; dispatcher:='mw_notify_dispatch_'||suffix;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_app_'||suffix) OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_app_'||suffix||'_journal_owner') THEN problems:=problems||'V122 needs the application role and its journal owner'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=notify_owner) OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=dispatcher) THEN problems:=problems||'V122 needs the notify owner and dispatcher roles'::text; END IF;
 IF to_regprocedure('public.pwa_pay_forward_plan_v1(text,numeric,date,jsonb)') IS NULL OR to_regprocedure('public.pwa_notify_content_v1(uuid,bigint)') IS NULL THEN problems:=problems||'V122 needs V121 and V99'::text; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname=notify_owner) THEN
  IF NOT pg_has_role(current_user,notify_owner,'SET') THEN problems:=problems||format('%s cannot SET ROLE %s (temporary maintenance membership required for ALTER FUNCTION OWNER)',current_user,notify_owner); END IF;
  IF NOT has_schema_privilege(notify_owner,'public','CREATE') THEN problems:=problems||format('%s lacks CREATE on schema public (required by ALTER FUNCTION OWNER; grant temporarily)',notify_owner); END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Business Expenses' AND column_name='Ref Offset Payment') THEN problems:=problems||'"Ref Offset Payment" already exists'::text; END IF;
 IF cardinality(problems)>0 THEN RAISE EXCEPTION 'V122 preflight: %',array_to_string(problems,'; '); END IF;
END $preflight$;

CREATE TEMP TABLE v122_before ON COMMIT DROP AS
 SELECT p.oid::regprocedure::text AS routine,pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl::text,'') AS acl,p.prosecdef AS definer
 FROM pg_proc p WHERE p.oid IN ('public.pwa_submit_selected_charges_v1(text)'::regprocedure,'public.pwa_effective_payment_plan_v2(text)'::regprocedure,
  'public.pwa_apply_loan_close_v2(text)'::regprocedure,'public.pwa_submit_operation_v2(text)'::regprocedure,'public.pwa_apply_payment_v2(text)'::regprocedure,
  'public.payment_crud_prepare_core_v83(public."Payments",public."Payments",text)'::regprocedure,'public.create_referral_rebate(text)'::regprocedure);

-- 0. The operation journal admits result_json.rebate on loan.close (one counted widening of pwa_versioned_outcome; every
-- other rule of the constraint is unchanged and existing rows are revalidated).
DO $journal$
DECLARE definition text;old text:=$o$'predecessorRequestId'::text, 'sourceCreatedBy'::text]) = '{}'::jsonb)$o$;
 new text:=$n$'predecessorRequestId'::text, 'sourceCreatedBy'::text, 'rebate'::text]) = '{}'::jsonb) AND ((NOT (result_json ? 'rebate'::text)) OR (((result_json ->> 'operation'::text) = 'loan.close'::text) AND (jsonb_typeof((result_json -> 'rebate'::text)) = 'object'::text)))$n$;
BEGIN
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint WHERE conname='pwa_versioned_outcome' AND conrelid='public.pwa_payment_commands'::regclass;
 IF definition IS NULL OR (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'V122: unexpected pwa_versioned_outcome';END IF;
 ALTER TABLE public.pwa_payment_commands DROP CONSTRAINT pwa_versioned_outcome;
 EXECUTE 'ALTER TABLE public.pwa_payment_commands ADD CONSTRAINT pwa_versioned_outcome '||replace(definition,old,new);
END $journal$;

-- 1. The offset link (D2).
ALTER TABLE public."Business Expenses" ADD COLUMN "Ref Offset Payment" text REFERENCES public."Payments"("Row ID");
CREATE INDEX business_expenses_ref_offset_payment ON public."Business Expenses"("Ref Offset Payment") WHERE "Ref Offset Payment" IS NOT NULL;
COMMENT ON COLUMN public."Business Expenses"."Ref Offset Payment" IS 'R111: the Referral Rebate Offset payment that settled this referral rebate on the referrer''s loan; null when the rebate is paid out. Set by Loan Close only.';

-- 2. The pay-forward booking of a plan (single writer of the R110 arithmetic).
CREATE FUNCTION public.pwa_apply_pay_forward_v1(p_principal jsonb,p_materialize jsonb,p_today date) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE entry jsonb; booked text; principal_loans text[];
BEGIN
 IF jsonb_typeof(p_principal) IS DISTINCT FROM 'array' OR jsonb_typeof(p_materialize) IS DISTINCT FROM 'array' OR p_today IS NULL THEN RAISE EXCEPTION USING ERRCODE='P4C05'; END IF;
 SELECT coalesce(array_agg(value->>'loanId'),ARRAY[]::text[]) INTO principal_loans FROM jsonb_array_elements(p_principal);
 FOR entry IN SELECT value FROM jsonb_array_elements(p_principal) LOOP
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
COMMENT ON FUNCTION public.pwa_apply_pay_forward_v1(jsonb,jsonb,date) IS 'R111: books a pay-forward plan''s principal and materialize entries (R110 arithmetic) for pwa_submit_selected_charges_v1 v10 and the Loan Close rebate offset; P4C05 on drift. Called under the borrower -> loans -> charges locks.';

-- 3. The rebate a close would create, with its referrer (read only).
CREATE FUNCTION public.pwa_referral_rebate_projection_v1(p_loan text,p_calculation jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE l public."Loans"%ROWTYPE; referrer public."Borrowers"%ROWTYPE; principal numeric; profit numeric; rebate numeric;
BEGIN
 SELECT * INTO l FROM public."Loans" WHERE "Row ID"=p_loan;
 IF NOT FOUND OR coalesce(l."Defaulted",false) OR jsonb_typeof(p_calculation->'allocations') IS DISTINCT FROM 'array' THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Source Key"='REFERRAL_REBATE:'||p_loan) THEN RETURN NULL; END IF;
 SELECT b.* INTO referrer FROM public."Borrowers" own JOIN public."Borrowers" b ON b."Row ID"=own."Ref Referrer" WHERE own."Row ID"=l."Ref Borrowers";
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- create_referral_rebate's rule on the state after the close posts: principal fully repaid, 10% of interest, at most 1,000.
 SELECT coalesce(sum("Principal Paid"::numeric),0),coalesce(sum("Interest Paid"::numeric),0) INTO principal,profit FROM public."Repayments" WHERE "Ref Loans"=p_loan;
 SELECT principal+coalesce(sum((x->>'principal')::numeric),0),profit+coalesce(sum((x->>'interest')::numeric),0) INTO principal,profit FROM jsonb_array_elements(p_calculation->'allocations') x;
 IF principal<l."Principal Amount"::numeric OR profit<=0 THEN RETURN NULL; END IF;
 rebate:=least(round(profit*0.10),1000);
 IF rebate<=0 THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('amount',trunc(rebate)::text,'referrerId',referrer."Row ID",'referrerName',referrer."Borrower Name",'referrerDescription',referrer."Description",
  'selfReferral',referrer."Row ID"=l."Ref Borrowers",
  'hasOpenLoan',EXISTS(SELECT 1 FROM public."Loans" x WHERE x."Ref Borrowers"=referrer."Row ID" AND x."Loan Status"='ยังไม่ปิดยอด' AND NOT coalesce(x."Defaulted",false)));
END $$;
COMMENT ON FUNCTION public.pwa_referral_rebate_projection_v1(text,jsonb) IS 'R111: the referral rebate a Loan Close with this calculation creates (create_referral_rebate rule), its referrer and whether the referrer has an open loan; null when none. Read only.';

-- Execute rights: the projection for the application role (the close preview and the command); the booking for the
-- journal owner only (the definer commands). Default privileges (PROD's agent EXECUTE ON ROUTINES) are removed.
DO $acl$
DECLARE grantee text; routine text; app text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END;
BEGIN
 FOREACH routine IN ARRAY ARRAY['public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)','public.pwa_referral_rebate_projection_v1(text,jsonb)'] LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',routine);
  FOR grantee IN SELECT DISTINCT pg_get_userbyid(a.grantee) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
    WHERE p.oid=routine::regprocedure AND a.grantee<>0 AND a.grantee<>p.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',routine,grantee);
  END LOOP;
 END LOOP;
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_apply_pay_forward_v1(jsonb,jsonb,date) TO %I',app||'_journal_owner');
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_referral_rebate_projection_v1(text,jsonb) TO %I',app);
END $acl$;

-- 4. v10 books through the shared writer (one counted replacement; the command text is otherwise unchanged).
DO $v10$
DECLARE definition text;old text:=$old$
    FOR entry IN SELECT value FROM jsonb_array_elements(c->'principal') LOOP
     IF entry->>'kind'='raise' THEN
      -- guard_charge_consistency allows raising a due; the expected old due makes a concurrent change a rejection.
      UPDATE public."Charges" SET "Principal Due"=(entry->>'principalDue')::numeric::money WHERE "Row ID"=entry->>'chargeId' AND "Ref Loans"=entry->>'loanId' AND "Charge Date"=today
       AND "Principal Due"::numeric=(entry->>'principalDue')::numeric-(entry->>'amount')::numeric;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
     ELSE
      IF EXISTS(SELECT 1 FROM public."Charges" WHERE "Row ID"=entry->>'chargeId') THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
      INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
       VALUES(entry->>'chargeId',entry->>'loanId',today,(entry->>'principalDue')::numeric::money,(entry->>'accruedInterest')::numeric::money);
     END IF;
     -- D9 interval reset: the first later scheduled charge is today plus the interval (a no-op on a schedule day).
     UPDATE public."Loans" SET "Interest Schedule Anchor Date"=today WHERE "Row ID"=entry->>'loanId';
    END LOOP;
    FOR entry IN SELECT value FROM jsonb_array_elements(c->'materialize') LOOP
     BEGIN
      booked:=public.generate_loan_charge(entry->>'loanId',(entry->>'chargeDate')::date);
     EXCEPTION WHEN SQLSTATE 'P0001' THEN RAISE EXCEPTION USING ERRCODE='P4C05';
     END;
     IF booked IS DISTINCT FROM entry->>'chargeId' THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
     -- Current Daily Interest is recomputed only once the principal repayment posts, so for a loan repaying principal the
     -- generator priced this charge at the old daily amount; its Interest Due becomes the plan's server-recomputed value
     -- (new daily amount x days, never from the client), and the new daily amount is verified after posting below.
     IF entry->>'loanId'=ANY(principal_loans) THEN
      UPDATE public."Charges" SET "Interest Due"=(entry->>'interestDue')::numeric::money WHERE "Row ID"=booked AND "Interest Due"::numeric<>(entry->>'interestDue')::numeric;
     END IF;
     IF NOT EXISTS(SELECT 1 FROM public."Charges" WHERE "Row ID"=booked AND "Ref Loans"=entry->>'loanId' AND "Charge Date"=(entry->>'chargeDate')::date
       AND "Principal Due"::numeric=(entry->>'principalDue')::numeric AND "Interest Due"::numeric=(entry->>'interestDue')::numeric) THEN RAISE EXCEPTION USING ERRCODE='P4C05';END IF;
    END LOOP;
$old$;new text:=$new$
    -- R111: the booking is the shared writer pwa_apply_pay_forward_v1 (same statements, same P4C05 rejections).
    PERFORM public.pwa_apply_pay_forward_v1(c->'principal',c->'materialize',today);
$new$;
BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_selected_charges_v1(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'V122: unexpected v10 booking block';END IF;
 EXECUTE replace(definition,old,new);
END $v10$;

-- 5. The offset payment's plan is the closing command's result_json.rebate.offsetPlan (explicit posting, like loan.close).
DO $plan$
DECLARE definition text;
 old1 text:=$o$(j.contract_version=2 AND j.outcome='applied' AND j.result_json->>'paymentId'=p_id AND j.canonical_json::jsonb#>>'{command,operation}' IN('loan.create','loan.close','charge.create'));$o$;
 new1 text:=$n$(j.contract_version=2 AND j.outcome='applied' AND j.result_json->>'paymentId'=p_id AND j.canonical_json::jsonb#>>'{command,operation}' IN('loan.create','loan.close','charge.create')) OR
  -- R111: the Referral Rebate Offset payment of a Loan Close.
  (j.contract_version=2 AND j.outcome='applied' AND j.result_json#>>'{rebate,offsetPaymentId}'=p_id AND j.canonical_json::jsonb#>>'{command,operation}'='loan.close');$n$;
 old2 text:=$o$ ELSE plan:=r.result_json->'plan';END IF;$o$;
 new2 text:=$n$ ELSIF r.result_json#>>'{rebate,offsetPaymentId}'=p_id THEN plan:=r.result_json#>'{rebate,offsetPlan}';
 ELSE plan:=r.result_json->'plan';END IF;$n$;
BEGIN
 SELECT pg_get_functiondef('public.pwa_effective_payment_plan_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old1,'')))/length(old1)<>2 OR (length(definition)-length(replace(definition,old2,'')))/length(old2)<>1 THEN RAISE EXCEPTION 'V122: unexpected payment provenance';END IF;
 EXECUTE replace(replace(definition,old1,new1),old2,new2);
END $plan$;

-- 6. The rebate (body of V19 with the R111 offset; changes marked). Still trigger-only: the close command fires the
-- deferred referral trigger immediately, and only then (pwa.rebate_offset = the closing payment) is an offset posted.
CREATE OR REPLACE FUNCTION public.create_referral_rebate(p_loan text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE l public."Loans"%ROWTYPE; referrer text; payee text; principal numeric; profit numeric; rebate numeric;
 r jsonb; offset_id text; ids text; actual public."Payments"%ROWTYPE;
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
    VALUES(offset_id,referrer,l."Close Date",(r->>'offsetAmount')::numeric::money,'Referral Rebate Offset','Selected Charges',ids,r#>>'{offsetPlan,cashAccountId}','Rebate from loan '||p_loan,
     (SELECT "Created By" FROM public."Payments" WHERE "Row ID"=l."Ref Closing Payment"),'Processing');
   SELECT * INTO actual FROM public."Payments" WHERE "Row ID"=offset_id;
   IF actual."Status" IS DISTINCT FROM 'Posted' OR actual."Amount Received"::numeric IS DISTINCT FROM (r->>'offsetAmount')::numeric THEN RAISE EXCEPTION USING ERRCODE='P4C05'; END IF;
  END IF;
 END IF;
 INSERT INTO public."Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Payee Name",
  "Ref Payee Borrower","Ref Related Borrower","Ref Related Loan","Source Type","Source Key","Gross Profit Basis","Rule Version","Created By","Ref Offset Payment")
 VALUES('rr1:'||p_loan,l."Close Date",'Referral Rebate / เงินคืนค่าแนะนำลูกค้า',rebate::money,payee,referrer,l."Ref Borrowers",p_loan,
  'Referral Rebate','REFERRAL_REBATE:'||p_loan,profit::money,'REFERRAL_REBATE_V1','SQL:loan-close',offset_id)
 ON CONFLICT ("Source Key") WHERE nullif(btrim("Source Key"),'') IS NOT NULL DO NOTHING;
END $$;

-- 7. The Loan Close command (whole body; changes marked R111).
CREATE OR REPLACE FUNCTION public.pwa_apply_loan_close_v2(canonical text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
DECLARE e jsonb:=canonical::jsonb;i jsonb:=e#>'{command,inputs}';a jsonb:=e->'actor';target text:=e#>>'{command,targetId}';
 parent text;day date:=(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date;calculation jsonb;plan jsonb;result_value jsonb;payment text:='pwa:'||(e->>'requestId');message text;actual public."Payments"%ROWTYPE;
 -- R111: the projected rebate, the chosen path and, for an offset, the referrer's plan.
 rebate jsonb;path text:=coalesce(i->>'rebatePath','expense');forward jsonb;covered numeric:=0;offset_id text;offset_plan jsonb;expense public."Business Expenses"%ROWTYPE;
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
 -- R111: the rebate this close creates, and for a chosen offset on a referrer with an open loan the pay-forward plan
 -- (forward only, amount = rebate) under the referrer's borrower -> loans -> charges locks, taken after this borrower's.
 rebate:=public.pwa_referral_rebate_projection_v1(target,calculation);
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
   'materialize',CASE WHEN offset_id IS NULL THEN '[]'::jsonb ELSE forward->'materialize' END,'paidThrough',CASE WHEN offset_id IS NULL THEN '{}'::jsonb ELSE forward->'paidThrough' END));
 END IF;
 INSERT INTO public.pwa_payment_commands(request_id,contract_version,actor_issuer,actor_subject,actor_partner_id,actor_login_email,canonical_json,payload_sha256,outcome,payment_id,rejection_code,result_json)
 VALUES((e->>'requestId')::uuid,2,a->>'issuer',a->>'subject',a->>'partnerId',a->>'loginEmail',canonical,encode(sha256(convert_to(canonical,'UTF8')),'hex'),'applied',NULL,NULL,result_value);
 -- R111: the referral trigger must fire after the closing payment is Posted, so it is deferred here even when the caller
 -- made constraints immediate, and fired below.
 IF rebate IS NOT NULL THEN
  PERFORM set_config('pwa.rebate_offset',payment,true);
  SET CONSTRAINTS public.referral_loan_closed DEFERRED;
 END IF;
 INSERT INTO public."Payments"("Row ID","Ref Borrower","Payment Date","Amount Received","Payment Method","Allocation Method","Ref Target Charge","Ref Target Loan","Ref Received By Cash Account","Notes","Uploaded Receipt","Created By","Status")
 VALUES(payment,parent,day,(calculation->>'amount')::numeric::money,i->>'paymentMethod','Loan Close',calculation->>'targetChargeId',target,i->>'cashAccountId',i->>'notes',e#>>'{receipt,storageReference}',a->>'loginEmail','Processing');
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

-- 8. loan.close inputs: optional rebatePath ('offset' | 'expense') after expectedPlanHash (two counted replacements).
DO $operation$
DECLARE definition text;
 old1 text:=$o$keys:=ARRAY['paymentDate','cashAccountId','paymentMethod','notes','expectedAmount','expectedPlanHash'];$o$;
 new1 text:=$n$keys:=ARRAY['paymentDate','cashAccountId','paymentMethod','notes','expectedAmount','expectedPlanHash']||CASE WHEN i ? 'rebatePath' THEN ARRAY['rebatePath'] ELSE ARRAY[]::text[] END;$n$;
 old2 text:=$o$OR i->>'expectedPlanHash'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'close input';END IF;$o$;
 new2 text:=$n$OR i->>'expectedPlanHash'!~'^[a-f0-9]{64}$' OR (i ? 'rebatePath' AND i->>'rebatePath' NOT IN('offset','expense')) THEN RAISE EXCEPTION 'close input';END IF;$n$;
BEGIN
 SELECT pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old1,'')))/length(old1)<>1 OR (length(definition)-length(replace(definition,old2,'')))/length(old2)<>1 THEN RAISE EXCEPTION 'V122: unexpected loan.close input rules';END IF;
 EXECUTE replace(replace(definition,old1,new1),old2,new2);
END $operation$;

-- 9. Payment operations: an offset payment changes only through its closing payment; the refusal messages are
-- dependency conflicts (P5B05).
DO $payment$
DECLARE definition text;
 -- Anchors stay on one line: the stored bodies of these older functions use CRLF line ends.
 old1 text:=$o$ provenance:=public.pwa_effective_payment_plan_v2(target);$o$;
 new1 text:=$n$ provenance:=public.pwa_effective_payment_plan_v2(target);IF old."Payment Method"='Referral Rebate Offset' THEN RAISE EXCEPTION USING ERRCODE='P5B05';END IF;$n$;
 old2 text:=$o$'Corrected payment has a default dependency; undo default first') THEN RAISE EXCEPTION USING ERRCODE='P5B05';$o$;
 new2 text:=$n$'Corrected payment has a default dependency; undo default first','Remove through the closing payment','Remove through the closing payment: delete it and close again') THEN RAISE EXCEPTION USING ERRCODE='P5B05';$n$;
BEGIN
 SELECT pg_get_functiondef('public.pwa_apply_payment_v2(text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old1,'')))/length(old1)<>1 OR (length(definition)-length(replace(definition,old2,'')))/length(old2)<>1 THEN RAISE EXCEPTION 'V122: unexpected payment operation text';END IF;
 EXECUTE replace(replace(definition,old1,new1),old2,new2);
END $payment$;

-- 10. Receipt correction core: the offset payment is guarded, and deleting its closing payment removes it after the
-- rebate expense (three counted replacements).
DO $crud$
DECLARE definition text;
 old1 text:=$o$DECLARE b text; l public."Loans"%ROWTYPE; context_before text;$o$;
 new1 text:=$n$DECLARE offset_ids text[]; offset_id text; b text; l public."Loans"%ROWTYPE; context_before text;$n$;
 -- Anchors stay on one line: the stored body uses CRLF line ends.
 old2 text:=$o$ IF pg_trigger_depth()=0 AND NOT public.pwa_native_inverse_permitted_v2(p_old."Row ID") THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Protected correction context required';END IF;$o$;
 new2 text:=$n$ IF pg_trigger_depth()=0 AND NOT public.pwa_native_inverse_permitted_v2(p_old."Row ID") THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Protected correction context required';END IF;
 -- R111: an offset payment changes or goes only with its closing payment.
 IF p_old."Payment Method"='Referral Rebate Offset' AND current_setting('payment_crud.offset',true) IS DISTINCT FROM p_old."Row ID" THEN RAISE EXCEPTION 'Remove through the closing payment'; END IF;$n$;
 old3 text:=$o$  DELETE FROM public."Business Expenses" WHERE "Ref Related Loan"=l."Row ID" AND "Source Type"='Referral Rebate';$o$;
 new3 text:=$n$  -- R111: a rebate settled by offset: a correction is refused; a deletion removes the offset payment after the expense
  -- (its booked charges stay, D4).
  SELECT array_agg("Ref Offset Payment" ORDER BY "Ref Offset Payment" COLLATE "C") INTO offset_ids FROM public."Business Expenses"
   WHERE "Ref Related Loan"=l."Row ID" AND "Source Type"='Referral Rebate' AND "Ref Offset Payment" IS NOT NULL;
  IF offset_ids IS NOT NULL AND operation<>'DELETE' THEN RAISE EXCEPTION 'Remove through the closing payment: delete it and close again'; END IF;
  DELETE FROM public."Business Expenses" WHERE "Ref Related Loan"=l."Row ID" AND "Source Type"='Referral Rebate';
  FOREACH offset_id IN ARRAY coalesce(offset_ids,ARRAY[]::text[]) LOOP
   PERFORM set_config('payment_crud.offset',offset_id,true);
   DELETE FROM public."Payments" WHERE "Row ID"=offset_id;
   PERFORM set_config('payment_crud.offset','',true);
  END LOOP;$n$;
BEGIN
 SELECT pg_get_functiondef('public.payment_crud_prepare_core_v83(public."Payments",public."Payments",text)'::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,old1,'')))/length(old1)<>1 OR (length(definition)-length(replace(definition,old2,'')))/length(old2)<>1
  OR (length(definition)-length(replace(definition,old3,'')))/length(old3)<>1 THEN RAISE EXCEPTION 'V122: unexpected receipt correction core';END IF;
 EXECUTE replace(replace(replace(definition,old1,new1),old2,new2),old3,new3);
END $crud$;

-- 11. Push content facts with the rebate of a closed loan (v1 is unchanged and stays for a dispatcher before R111).
CREATE FUNCTION public.pwa_notify_content_v2(delivery uuid,generation bigint)
RETURNS TABLE(found boolean,event_type text,language text,borrower_name text,amount numeric,rebate_amount numeric,rebate_payee text,rebate_payable numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
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
  rb.rebate_payable
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
 LEFT JOIN LATERAL (
  SELECT x."Amount"::numeric AS rebate_amount,x."Ref Payee Borrower" AS payee_id,x."Amount"::numeric-coalesce(o."Amount Received"::numeric,0) AS rebate_payable
  FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment"
  WHERE e.event_type='loan.closed' AND e.source_kind='loan' AND x."Ref Related Loan"=e.source_id AND x."Source Type"='Referral Rebate'
  ORDER BY x."Row ID" COLLATE "C" LIMIT 1
 ) rb ON true
 LEFT JOIN public."Borrowers" pb ON pb."Row ID"=rb.payee_id
 WHERE d.delivery_id=$1 AND d.lease_generation=$2 AND d.state='leased' AND d.lease_expires_at>clock_timestamp();
END $$;

-- V99 ACL pattern, then the ownership change (grants and comment while the runner still owns the function).
DO $ownership$
DECLARE suffix text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'prod' ELSE 'dev' END; notify_owner text; dispatcher text; grantee text;
BEGIN
 notify_owner:='mw_notify_owner_'||suffix; dispatcher:='mw_notify_dispatch_'||suffix;
 REVOKE ALL ON FUNCTION public.pwa_notify_content_v2(uuid,bigint) FROM PUBLIC;
 FOR grantee IN SELECT DISTINCT pg_get_userbyid(a.grantee) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE p.oid='public.pwa_notify_content_v2(uuid,bigint)'::regprocedure AND a.grantee<>0 AND a.grantee<>p.proowner LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.pwa_notify_content_v2(uuid,bigint) FROM %I',grantee);
 END LOOP;
 COMMENT ON FUNCTION public.pwa_notify_content_v2(uuid,bigint) IS 'mw-access:governance fixed notification boundary; explicit capability only';
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_notify_content_v2(uuid,bigint) TO %I',dispatcher);
 -- Exactly the added source columns (V99 and V100 grant the rest; "Payments" "Row ID" and "Amount Received" included).
 EXECUTE format('GRANT SELECT ("Row ID","Amount","Ref Payee Borrower","Ref Related Loan","Source Type","Ref Offset Payment") ON public."Business Expenses" TO %I',notify_owner);
 EXECUTE format('ALTER FUNCTION public.pwa_notify_content_v2(uuid,bigint) OWNER TO %I',notify_owner);
 IF NOT (SELECT prosecdef AND pg_get_userbyid(proowner)=notify_owner AND 'search_path=pg_catalog, public'=ANY(proconfig) FROM pg_proc WHERE oid='public.pwa_notify_content_v2(uuid,bigint)'::regprocedure)
  OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.pwa_notify_content_v2(uuid,bigint)'::regprocedure AND a.privilege_type='EXECUTE' AND a.grantee NOT IN (p.proowner,dispatcher::regrole))
  OR NOT has_function_privilege(dispatcher,'public.pwa_notify_content_v2(uuid,bigint)','EXECUTE') THEN
  RAISE EXCEPTION 'V122: pwa_notify_content_v2 must be the notify owner''s pinned definer executable only by %',dispatcher; END IF;
END $ownership$;

-- Self-check: replaced functions kept owner, ACL and security and carry R111; the new functions' ACLs are exact; the column.
DO $check$
DECLARE bad text;app text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END;
BEGIN
 SELECT string_agg(o.routine,', ') INTO bad FROM v122_before o JOIN pg_proc p ON p.oid=o.routine::regprocedure
  WHERE pg_get_userbyid(p.proowner)<>o.owner OR coalesce(p.proacl::text,'')<>o.acl OR p.prosecdef<>o.definer;
 IF bad IS NOT NULL OR (SELECT count(*) FROM v122_before)<>7 THEN RAISE EXCEPTION 'V122 changed the owner, privileges or security of %',coalesce(bad,'an unexpected function set'); END IF;
 IF position('pwa_apply_pay_forward_v1(' IN pg_get_functiondef('public.pwa_submit_selected_charges_v1(text)'::regprocedure))=0
  OR position('UPDATE public."Loans" SET "Interest Schedule Anchor Date"' IN pg_get_functiondef('public.pwa_submit_selected_charges_v1(text)'::regprocedure))>0
  OR position('{rebate,offsetPaymentId}' IN pg_get_functiondef('public.pwa_effective_payment_plan_v2(text)'::regprocedure))=0
  OR position('rebatePath' IN pg_get_functiondef('public.pwa_submit_operation_v2(text)'::regprocedure))=0
  OR position('Referral Rebate Offset' IN pg_get_functiondef('public.pwa_apply_payment_v2(text)'::regprocedure))=0
  OR position('payment_crud.offset' IN pg_get_functiondef('public.payment_crud_prepare_core_v83(public."Payments",public."Payments",text)'::regprocedure))=0
  OR position('pwa.rebate_offset' IN pg_get_functiondef('public.create_referral_rebate(text)'::regprocedure))=0
  OR position('pwa.rebate_offset' IN pg_get_functiondef('public.pwa_apply_loan_close_v2(text)'::regprocedure))=0 THEN RAISE EXCEPTION 'V122: a function was not replaced'; END IF;
 IF (SELECT array_agg(DISTINCT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END||':'||a.privilege_type) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE p.oid='public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)'::regprocedure AND a.grantee<>p.proowner) IS DISTINCT FROM ARRAY[app||'_journal_owner:EXECUTE']
  OR (SELECT array_agg(DISTINCT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END||':'||a.privilege_type) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE p.oid='public.pwa_referral_rebate_projection_v1(text,jsonb)'::regprocedure AND a.grantee<>p.proowner) IS DISTINCT FROM ARRAY[app||':EXECUTE'] THEN RAISE EXCEPTION 'V122: unexpected access to the new functions'; END IF;
 IF (SELECT prosecdef FROM pg_proc WHERE oid='public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)'::regprocedure) OR (SELECT prosecdef FROM pg_proc WHERE oid='public.pwa_referral_rebate_projection_v1(text,jsonb)'::regprocedure) THEN RAISE EXCEPTION 'V122: the new helpers run with the caller''s rights'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
   WHERE c.conrelid='public."Business Expenses"'::regclass AND c.contype='f' AND c.confrelid='public."Payments"'::regclass AND a.attname='Ref Offset Payment' AND c.confdeltype='a') THEN RAISE EXCEPTION 'V122: the offset link must reference Payments without a delete action'; END IF;
END $check$;
