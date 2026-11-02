-- R111 follow-up (Archie): V122's pay-forward booking helper pwa_apply_pay_forward_v1(jsonb,jsonb,date) is SECURITY INVOKER
-- and trusts the plan it is given, so it is journal-owner-only by design (V122). The guarded runner's application-role
-- reconcile granted it EXECUTE to mw_app_<env> on DEV because the function carried no governance comment. V122 is
-- applied and stays; this migration closes the helper:
-- 1. the governance comment, so the reconcile's protectedObject rule (app-role-policy.mjs) leaves it alone (as V88, V99);
-- 2. EXECUTE revoked from mw_app_<env> and PUBLIC (and any other grantee but the journal owner);
-- 3. the same body with a guard first: only the journal owner (the definer commands pwa_submit_selected_charges_v1 and
--    pwa_submit_operation_v2, whose referral trigger books the rebate offset) may run it (42501 otherwise);
-- 4. create_referral_rebate (same body): the offset payment's notes read "Rebate from loan <key>" with the loan key the
--    app shows (borrower name, principal, loan date, rate), not the Row ID; the ro122 payment key is unchanged;
-- 5. a self-check of the ACL, the comment, the guard and the notes. Functions and privileges only; no table, column or trigger.

DO $preflight$
BEGIN
 IF current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') THEN RAISE EXCEPTION 'Unsupported application database'; END IF;
 IF to_regprocedure('public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)') IS NULL THEN RAISE EXCEPTION 'V123 needs V122'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END) THEN RAISE EXCEPTION 'V123 needs the journal owner'; END IF;
END $preflight$;

CREATE TEMP TABLE v123_before ON COMMIT DROP AS
 SELECT pg_get_userbyid(p.proowner) AS owner,coalesce(p.proacl::text,'') AS acl,p.prosecdef AS definer FROM pg_proc p WHERE p.oid='public.create_referral_rebate(text)'::regprocedure;

CREATE OR REPLACE FUNCTION public.pwa_apply_pay_forward_v1(p_principal jsonb, p_materialize jsonb, p_today date) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE entry jsonb; booked text; principal_loans text[];
BEGIN
 -- R111 V123: the booking trusts its plan, so only the governed definer commands (the journal owner) may run it.
 IF (current_database() NOT IN ('loan_manager_dev','payment_rehearsal','loan_manager_prod') OR current_user<>CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Governed operation required';END IF;
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


COMMENT ON FUNCTION public.pwa_apply_pay_forward_v1(jsonb,jsonb,date) IS 'mw-access:governance R111 pay-forward booking of a server-recomputed plan (v10 command and the Loan Close rebate offset); journal owner only, P4C05 on drift.';

DO $acl$
DECLARE grantee text; owner text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod_journal_owner' ELSE 'mw_app_dev_journal_owner' END;
BEGIN
 REVOKE ALL ON FUNCTION public.pwa_apply_pay_forward_v1(jsonb,jsonb,date) FROM PUBLIC;
 FOR grantee IN SELECT DISTINCT pg_get_userbyid(a.grantee) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE p.oid='public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)'::regprocedure AND a.grantee<>0 AND a.grantee<>p.proowner AND pg_get_userbyid(a.grantee)<>owner LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.pwa_apply_pay_forward_v1(jsonb,jsonb,date) FROM %I',grantee);
 END LOOP;
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.pwa_apply_pay_forward_v1(jsonb,jsonb,date) TO %I',owner);
END $acl$;

CREATE OR REPLACE FUNCTION public.create_referral_rebate(p_loan text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE l public."Loans"%ROWTYPE; referrer text; payee text; principal numeric; profit numeric; rebate numeric;
 r jsonb; offset_id text; ids text; actual public."Payments"%ROWTYPE; loan_key text;
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
   -- R111 V123: the notes name the closed loan by the key the app shows (paymentLoanDisplayKey: borrower - English name,
   -- principal, loan day/month, original rate), not its Row ID.
   SELECT coalesce(b."Borrower Name",'')||' - '||coalesce(b."Description",'')||'-'||coalesce('฿'||to_char(round(l."Principal Amount"::numeric),'FM999,999,999,999,990'),'')
     ||'-'||coalesce(to_char(l."Loan Date",'DD/MM'),'')||'-'||coalesce(l."Original Daily Interest Rate"::text||'%','Unavailable')
    INTO loan_key FROM public."Borrowers" b WHERE b."Row ID"=l."Ref Borrowers";
   PERFORM public.pwa_apply_pay_forward_v1('[]'::jsonb,r->'materialize',l."Close Date");
   SELECT string_agg(value->>'chargeId',' , ' ORDER BY (value->>'chargeId') COLLATE "C") INTO ids FROM jsonb_array_elements(r#>'{offsetPlan,allocations}');
   INSERT INTO public."Payments"("Row ID","Ref Borrower","Payment Date","Amount Received","Payment Method","Allocation Method","Selected Charge IDs","Ref Received By Cash Account","Notes","Created By","Status")
    VALUES(offset_id,referrer,l."Close Date",(r->>'offsetAmount')::numeric::money,'Referral Rebate Offset','Selected Charges',ids,r#>>'{offsetPlan,cashAccountId}','Rebate from loan '||coalesce(loan_key,p_loan),
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


DO $check$
DECLARE app text:=CASE current_database() WHEN 'loan_manager_prod' THEN 'mw_app_prod' ELSE 'mw_app_dev' END;
BEGIN
 IF (SELECT array_agg(DISTINCT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END||':'||a.privilege_type) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE p.oid='public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)'::regprocedure AND a.grantee<>p.proowner) IS DISTINCT FROM ARRAY[app||'_journal_owner:EXECUTE'] THEN RAISE EXCEPTION 'V123: pwa_apply_pay_forward_v1 must be executable by the journal owner only'; END IF;
 IF has_function_privilege(app,'public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)','EXECUTE') OR has_function_privilege('public','public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)','EXECUTE') THEN RAISE EXCEPTION 'V123: the application role still executes pwa_apply_pay_forward_v1'; END IF;
 IF obj_description('public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)'::regprocedure,'pg_proc') NOT LIKE 'mw-access:governance%' THEN RAISE EXCEPTION 'V123: the governance comment is missing'; END IF;
 IF (SELECT count(*) FROM v123_before o JOIN pg_proc p ON p.oid='public.create_referral_rebate(text)'::regprocedure WHERE pg_get_userbyid(p.proowner)=o.owner AND coalesce(p.proacl::text,'')=o.acl AND p.prosecdef=o.definer)<>1
  OR position($s$'Rebate from loan '||coalesce(loan_key,p_loan)$s$ IN pg_get_functiondef('public.create_referral_rebate(text)'::regprocedure))=0
  OR position($s$'ro122:'||l."Ref Closing Payment"$s$ IN pg_get_functiondef('public.create_referral_rebate(text)'::regprocedure))=0 THEN RAISE EXCEPTION 'V123: create_referral_rebate was not replaced as expected'; END IF;
 IF position('Governed operation required' IN pg_get_functiondef('public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)'::regprocedure))=0
  OR (SELECT prosecdef FROM pg_proc WHERE oid='public.pwa_apply_pay_forward_v1(jsonb,jsonb,date)'::regprocedure) THEN RAISE EXCEPTION 'V123: the guarded invoker body was not installed'; END IF;
END $check$;
